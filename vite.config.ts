import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: app code changes don't invalidate the cached libraries.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@fortawesome')) return 'icons';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
});