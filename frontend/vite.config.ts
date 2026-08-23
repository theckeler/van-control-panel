import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix reads unprefixed vars too, so the API key
  // stays server-side in this config and never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // Defaults to the Pi over Tailscale — works regardless of which network it
  // is on, since it prefers Starlink (192.168.4.x) and falls back to OHeck
  // (192.168.1.x) so its LAN address is not stable.
  //
  // Set VAN_API_TARGET=http://localhost:8000 to develop against a backend
  // running on this machine instead. The VS Code "Dev: full stack (local)"
  // task does that for you.
  const target = env.VAN_API_TARGET || 'http://100.87.126.98:8000'
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
      },
    },
  }
})
