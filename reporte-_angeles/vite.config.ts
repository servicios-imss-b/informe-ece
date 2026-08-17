import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  // Relative base avoids blank pages when the site path changes in GitHub Pages.
  base: mode === 'production' ? './' : '/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));
