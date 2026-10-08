import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build straight into the Catalyst client/ folder so `catalyst deploy` publishes it.
// base './' keeps asset URLs relative, because Catalyst serves the client under /app/.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../client',
    emptyOutDir: true
  },
  server: {
    // `npm run dev` talks to the function running under `catalyst serve` (port 3000).
    proxy: {
      '/server': 'http://localhost:3000'
    }
  }
});
