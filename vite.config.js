import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  plugins: [svelte(), tailwindcss()],
  base: command === 'build' ? '/Stock_Anaysis_Dashboard/' : '/',
}))
