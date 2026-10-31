import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';

/**
 * Site público da Jota Car (React + Tailwind), separado do app.
 * Gera um bundle próprio e leve em dist/sites/jotacar, servido em /sites/jotacar
 * (e em jotacar.mecanicoapp.com.br pelo rewrite do vercel.json).
 * As fotos ficam em public/sites/jotacar/fotos e são copiadas pelo build do app.
 */
export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'sites/jotacar'),
  base: '/sites/jotacar/',
  // No dev, serve as fotos; no build, o build do app já copia a pasta public inteira
  publicDir: command === 'serve' ? path.resolve(__dirname, 'public/sites/jotacar') : false,
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.resolve(__dirname, 'tailwind.sites.config.js') }), autoprefixer()],
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/sites/jotacar'),
    emptyOutDir: false, // não apagar as fotos copiadas pelo build do app
  },
}));
