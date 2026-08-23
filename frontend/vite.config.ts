import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix reads unprefixed vars too, so the API key
  // stays server-side in this config and never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          // Tailscale IP — works regardless of which network the Pi is on.
          // The Pi prefers Starlink (192.168.4.x) and falls back to OHeck
          // (192.168.1.x), so its LAN address is not stable. Use Tailscale.
          target: 'http://100.87.126.98:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // van-api trusts loopback (the Express proxy, already password
          // gated) and requires this header from anywhere else. Set
          // VAN_API_KEY in frontend/.env.local to match backend/.env.
          headers: env.VAN_API_KEY ? { 'X-API-Key': env.VAN_API_KEY } : undefined,
        },
      },
    },
  }
})
