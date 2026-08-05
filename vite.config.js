import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        history:  resolve(__dirname, 'history.html'),
        settings: resolve(__dirname, 'settings.html'),
      },
    },
  },
})