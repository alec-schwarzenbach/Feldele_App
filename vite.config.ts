import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // host: true makes the dev server reachable from your phone on the same Wi-Fi
  server: { host: true, port: 5173 },
})
