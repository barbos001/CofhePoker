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
    // Force single instance of every package that uses React context or hooks
    dedupe: ['react', 'react-dom', 'wagmi', 'viem', '@wagmi/core', '@tanstack/react-query'],
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
    target: 'esnext',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Wallet / web3 — rarely changes, good for long-term caching
          'vendor-wagmi':    ['wagmi', 'viem', '@wagmi/core'],
          'vendor-metamask': ['@metamask/sdk'],
          // UI libs
          'vendor-framer':   ['framer-motion'],
          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
          // NOTE: React intentionally NOT split — must stay in main chunk with Zustand
        },
      },
    },
  },

  worker: {
    format: 'es',
  },
});
