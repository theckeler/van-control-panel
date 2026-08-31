import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix reads unprefixed vars too, so the API key
  // stays server-side in this config and never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // Defaults to the Pi over Tailscale, which resolves reliably in Node.
  // (Node's resolver does NOT do mDNS the way browsers do, so a `.local`
  // target here fails with ENOTFOUND even when the browser loads it fine —
  // that was the long-standing "dev server can't reach the Pi" bug.)
  //
  // Note: van-api (uvicorn) binds to 127.0.0.1 only, so port 8000 is not
  // reachable from this machine at all. The dev proxy goes through nginx on
  // port 80, which fronts the Express auth gate. Set VAN_API_KEY in a
  // frontend/.env.local so the proxy can authenticate to van-api.
  //
  // Override with VAN_API_TARGET when you need a different target:
  //   VAN_API_TARGET=http://localhost:8000   local backend on this machine
  //
  // The VS Code "Dev: full stack (local)" task sets VAN_API_TARGET=localhost.
  const target = env.VAN_API_TARGET || 'http://van-pi.tailba93b9.ts.net'
  const isLocal = target.includes('localhost') || target.includes('127.0.0.1')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // van-api trusts loopback (the Express proxy, already password
          // gated) and requires this header from anywhere else. A local
          // backend is reached over loopback, so no key needed there.
          headers:
            !isLocal && env.VAN_API_KEY
              ? { 'X-API-Key': env.VAN_API_KEY }
              : undefined,
        },
        // Camera captures are served by uvicorn directly at /static/photos,
        // not under /api — same target, no path rewrite needed.
        '/static': {
          target,
          changeOrigin: true,
          headers:
            !isLocal && env.VAN_API_KEY
              ? { 'X-API-Key': env.VAN_API_KEY }
              : undefined,
        },
      },
    },
  }
})
