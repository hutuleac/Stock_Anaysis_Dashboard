import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  plugins: [svelte(), tailwindcss()],
  base: command === 'build' ? '/Stock_Anaysis_Dashboard/' : '/',
  // Only the real suite — without this, vitest also picks up copies inside
  // .claude/worktrees/ and inflates the run (88 files / 1961 tests).
  test: { include: ['tests/**/*.test.js'] },
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
