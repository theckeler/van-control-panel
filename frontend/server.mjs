// Van Control Panel — Node server
// Serves the built frontend, proxies /api to uvicorn, basic auth gate
import express from "express";
import basicAuth from "express-basic-auth";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.VAN_PORT || 3000;
const PASSWORD = process.env.VAN_PASSWORD || "";
const USER = process.env.VAN_USER || "van";

const app = express();

// Auth — only active when VAN_PASSWORD is set in env
if (PASSWORD) {
  app.use(
    basicAuth({
      users: { [USER]: PASSWORD },
      challenge: true,
      realm: "Van Control",
    })
  );
}

// Proxy /api/* → uvicorn :8000 (strips /api prefix)
app.use(
  "/api",
  createProxyMiddleware({
    target: "http://localhost:8000",
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
  })
);

// Serve built frontend
app.use(express.static(join(__dirname, "dist")));

// SPA fallback — let React Router handle all other routes
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Van dashboard running on http://0.0.0.0:${PORT}`);
  console.log(`Auth: ${PASSWORD ? `enabled (user: ${USER})` : "disabled"}`);
});
