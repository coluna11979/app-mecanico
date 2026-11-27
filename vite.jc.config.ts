import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';

/**
 * Site das duas lojas do Jairo (Jota Car + JC Pneus), React + Tailwind, separado do app.
 * Build próprio em dist/sites/jc, servido em /sites/jc (rewrite no vercel.json).
 * Fotos em public/sites/jc/fotos (copiadas pelo build do app).
 */
export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'sites/jc'),
  base: '/sites/jc/',
  publicDir: command === 'serve' ? path.resolve(__dirname, 'public/sites/jc') : false,
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.resolve(__dirname, 'tailwind.jc.config.js') }), autoprefixer()],
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/sites/jc'),
    emptyOutDir: false,
  },
}));
