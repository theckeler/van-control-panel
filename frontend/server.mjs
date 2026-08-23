// Van Control Panel — Node server
// Serves the built React SPA, proxies /api to uvicorn.
// Auth: signed cookie (1 year) — enter password once per device.

import express from "express";
import crypto from "crypto";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT           = process.env.VAN_PORT           || 3000;
const PASSWORD       = process.env.VAN_PASSWORD        || "";
const SESSION_SECRET = process.env.VAN_SESSION_SECRET  || "van-control-default-secret-change-me";
const SESSION_DAYS   = 365;
const COOKIE_NAME    = "van_auth";
const MAX_AGE_MS     = SESSION_DAYS * 24 * 60 * 60 * 1000;

const app = express();

/**
 * Stateless auth.
 *
 * Previously express-session with the default MemoryStore, so every
 * van-frontend restart wiped all sessions. CI/CD restarts the service on
 * every frontend push, which made the cookie's stated lifetime irrelevant —
 * a deploy logged you out, whatever maxAge said.
 *
 * A signed cookie carries its own expiry and needs no server state, so it
 * survives restarts and redeploys. HMAC-SHA256 over the expiry, compared in
 * constant time.
 */
function sign(expiry) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(String(expiry)).digest("hex");
}

function issueCookie(res) {
  const expiry = Date.now() + MAX_AGE_MS;
  res.cookie(COOKIE_NAME, `${expiry}.${sign(expiry)}`, {
    maxAge: MAX_AGE_MS,
    httpOnly: true,
    sameSite: "lax",
  });
}

function verifyCookie(raw) {
  if (typeof raw !== "string") return false;
  const [expiry, mac] = raw.split(".");
  if (!expiry || !mac || Number(expiry) < Date.now()) return false;
  const expected = sign(expiry);
  if (mac.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

// Minimal cookie read — not worth a dependency for one value.
app.use((req, _res, next) => {
  const found = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  req.vanAuth = found ? decodeURIComponent(found.slice(COOKIE_NAME.length + 1)) : null;
  next();
});

app.use(express.urlencoded({ extended: false }));

// --- Auth guard (only active when VAN_PASSWORD is set) ---
function isAuthenticated(req) {
  return !PASSWORD || verifyCookie(req.vanAuth);
}

const LOGIN_PAGE = (error = "") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Van Control</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f1117;
      color: #e4e4e7;
      font-family: ui-monospace, "Cascadia Code", "Source Code Pro", monospace;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .card {
      width: 100%;
      max-width: 320px;
      background: #16181c;
      border: 1px solid #222428;
      border-radius: 1rem;
      padding: 2rem;
    }
    h1 { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
    p  { font-size: 0.75rem; color: #71717a; margin-bottom: 1.5rem; }
    label { font-size: 0.7rem; color: #71717a; display: block; margin-bottom: 0.4rem; }
    input[type="password"] {
      width: 100%;
      background: #0f1117;
      border: 1px solid #222428;
      border-radius: 0.5rem;
      color: #e4e4e7;
      font-family: inherit;
      /* 16px minimum — iOS Safari zooms the page on focus below this */
      font-size: 16px;
      padding: 0.6rem 0.75rem;
      margin-bottom: 1rem;
      outline: none;
    }
    input[type="password"]:focus { border-color: #3f3f46; }
    button {
      width: 100%;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 0.5rem;
      color: #e4e4e7;
      font-family: inherit;
      font-size: 0.8rem;
      padding: 0.6rem;
      cursor: pointer;
    }
    button:hover { background: #3f3f46; }
    .error { font-size: 0.7rem; color: #f87171; margin-bottom: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Van Control</h1>
    <p>Enter your dashboard password to continue.</p>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/login">
      <label for="pwd">Password</label>
      <input id="pwd" type="password" name="password" autofocus autocomplete="current-password" />
      <button type="submit">Unlock</button>
    </form>
  </div>
</body>
</html>`;

// Login routes
app.get("/login", (_req, res) => res.send(LOGIN_PAGE()));

app.post("/login", (req, res) => {
  if (req.body.password === PASSWORD) {
    issueCookie(res);
    res.redirect("/");
  } else {
    res.send(LOGIN_PAGE("Incorrect password."));
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect("/login");
});

// Auth wall — applied before proxy and static files
app.use((req, res, next) => {
  if (isAuthenticated(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "unauthorized" });
  res.redirect("/login");
});

// --- API proxy → uvicorn :8000 ---
app.use("/api", createProxyMiddleware({
  target: "http://localhost:8000",
  changeOrigin: true,
  pathRewrite: { "^/api": "" },
}));

// --- Serve built frontend ---
app.use(express.static(join(__dirname, "dist")));

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  const authMode = PASSWORD ? `signed cookie (${SESSION_DAYS} days)` : "disabled";
  console.log(`Van dashboard on http://0.0.0.0:${PORT} — auth: ${authMode}`);
});
