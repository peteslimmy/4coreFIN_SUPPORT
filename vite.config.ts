import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      watch: {},
    },
    build: {
      rollupOptions: {
        output: {
          // Vendor chunk split (Phase 3 perf): react/react-dom are the stable
          // runtime core and framer-motion is the largest eager animation lib,
          // so they are carved into long-cacheable chunks. The OBJECT form of
          // manualChunks lets Rollup resolve the shared dependency graph
          // (scheduler, jsx-runtime) into the right chunk and avoids the
          // vendor -> react-vendor cycle the function form created.
          manualChunks: {
            react: ['react', 'react-dom', 'react-dom/client'],
            anim: ['framer-motion'],
          },
        },
      },
    },
  };
});
