import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix reads unprefixed vars too, so the API key
  // stays server-side in this config and never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // Defaults to the Pi over mDNS — works from any device on the same LAN as
  // the Pi (both Starlink and OHeck networks).
  //
  // Override with VAN_API_TARGET when you need a different target:
  //   VAN_API_TARGET=http://localhost:8000       local backend on this machine
  //   VAN_API_TARGET=http://100.x.x.x:8000       Pi over Tailscale (if active)
  //
  // The VS Code "Dev: full stack (local)" task sets VAN_API_TARGET=localhost.
  const target = env.VAN_API_TARGET || 'http://van-pi.local:8000'
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
