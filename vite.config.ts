import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // TFHE (CoFHE WASM) requires SharedArrayBuffer → COOP/COEP headers
  server: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },

  // Prevent Vite from pre-bundling the WASM libs; they load themselves
  optimizeDeps: {
    exclude: ['tfhe', 'node-tfhe'],
  },

  build: {
    // Keep tfhe out of the chunk graph too
    rollupOptions: {
      external: [],
    },
  },

  worker: {
    format: 'es',
  },
});
