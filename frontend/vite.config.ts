import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
      },
    },
  },
})
