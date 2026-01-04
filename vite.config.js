import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'worker.js',
      formats: ['es'],
      fileName: 'worker'
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});
