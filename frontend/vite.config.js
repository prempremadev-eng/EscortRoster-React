import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two homes for the same app (Slate, Prem 30 Oct):
//   npm run build        → ../client for the old Catalyst Web Client Hosting (served under /app/, so base './').
//   npm run build:slate  → dist/ for Slate (served from the root, so base '/'), with Slate's routing files.
export default defineConfig(({ mode }) => {
  const slate = mode === 'slate';
  return {
    plugins: [react(), slate && slateFiles()].filter(Boolean),
    base: slate ? '/' : './',
    build: {
      outDir: slate ? 'dist' : '../client',
      emptyOutDir: true
    },
    server: {
      // `npm run dev` talks to the function running under `catalyst serve` (port 3000).
      proxy: {
        '/server': 'http://localhost:3000'
      }
    }
  };
});

// Slate: every path opens the app (hash routes), the SDK's old /app/ address comes back to the root, and the
// login returns to "/" (client-package.json paths must start with "/" on Slate).
function slateFiles() {
  return {
    name: 'slate-files',
    closeBundle() {
      const out = path.resolve('dist');
      fs.writeFileSync(path.join(out, '_redirects'), '/app/* / 200\n/* /index.html 200\n');
      fs.writeFileSync(path.join(out, 'client-package.json'), JSON.stringify({ name: 'nightowl', version: '3.0.0', homepage: '/', login_redirect: '/' }, null, 2) + '\n');
    }
  };
}
