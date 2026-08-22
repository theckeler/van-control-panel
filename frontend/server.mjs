// Van Control Panel — Node server
// Serves the built React SPA, proxies /api to uvicorn.
// Auth: session cookie (30 days) — enter password once per device.

import express from "express";
import session from "express-session";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT           = process.env.VAN_PORT           || 3000;
const PASSWORD       = process.env.VAN_PASSWORD        || "";
const SESSION_SECRET = process.env.VAN_SESSION_SECRET  || "van-control-default-secret-change-me";
const SESSION_DAYS   = 30;

const app = express();

// --- Session middleware ---
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
  },
}));

app.use(express.urlencoded({ extended: false }));

// --- Auth guard (only active when VAN_PASSWORD is set) ---
function isAuthenticated(req) {
  return !PASSWORD || req.session?.authenticated === true;
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
      font-size: 0.85rem;
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
    req.session.authenticated = true;
    res.redirect("/");
  } else {
    res.send(LOGIN_PAGE("Incorrect password."));
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
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
  const authMode = PASSWORD ? "session cookie (30 days)" : "disabled";
  console.log(`Van dashboard on http://0.0.0.0:${PORT} — auth: ${authMode}`);
});
