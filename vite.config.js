import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy'


export default defineConfig({
    plugins: [
    viteStaticCopy({
      targets: [
        {
            src: 'share.html',
            dest: '.'
        },
        {
          src: 'share-sw.js',
          dest: '.',
          rename: 'share-sw.js.txt',
        },
        {
          src: 'zstd/zstd.js',
          dest: '.',
          rename: 'zstd.js.txt',
        },
        {
          src: 'zstd/zstd.wasm',
          dest: '.',
          rename: 'zstd.wasm.bin'
        }
      ],
    }),
  ],
  build: {
    lib: {
      entry: 'worker.js',
      formats: ['es'],
      fileName: 'worker'
    },
    rollupOptions: {
      external: ['./share.html', './share-sw.js.txt', './zstd.js.txt', './zstd.wasm.bin']
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});
