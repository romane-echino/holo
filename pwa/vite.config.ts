import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname),
  base: '/pwa/',
  build: {
    outDir: resolve(__dirname, '../holo-link-gateway/pwa'),
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss()],
})
