import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
        byeoliBrain: resolve(__dirname, 'src/brain/browser.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'byeoliBrain'
            ? 'byeoli-walk/brain.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
});
