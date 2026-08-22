import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // Use Tailscale IP — works on local network and remotely
        // Falls back: try 192.168.1.99:8000 if Tailscale is not running
        target: 'http://100.87.126.98:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
