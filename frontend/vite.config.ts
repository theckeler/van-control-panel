import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // Tailscale IP — works regardless of which network the Pi is on.
        // The Pi prefers Starlink ("Sir Salettelot") and falls back to OHeck,
        // so its LAN address is not stable. Both networks also hand out
        // 192.168.1.x, which makes LAN addresses ambiguous. Use Tailscale.
        target: 'http://100.87.126.98:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
