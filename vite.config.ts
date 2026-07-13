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
      // byeoli-walk/brain.js 진입점의 named export(HABIT_BIAS_MAX 등) 이름을 보존.
      // 없으면 Rollup이 코드를 공유 청크로 빼내고 brain.js를 빈 import 껍데기로 만들어
      // index.html의 named import가 전부 깨진다. (BUILD 405 회귀 방지)
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'byeoliBrain'
            ? 'byeoli-walk/brain.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
});
