import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  plugins: [svelte(), tailwindcss()],
  base: command === 'build' ? '/Stock_Anaysis_Dashboard/' : '/',
  server: {
    proxy: {
      // FRED API sends no CORS headers — proxy it in dev (prod uses corsproxy.io)
      '/fred-api': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fred-api/, ''),
      },
    },
  },
}))
