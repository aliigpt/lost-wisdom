import { defineConfig } from 'vite';

// The game lives in game/. Build output goes to dist/ (relative paths, so it works on GitHub Pages).
export default defineConfig({
  root: 'game',
  base: './',
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three'] },
  build: { outDir: '../dist', emptyOutDir: true }
});
