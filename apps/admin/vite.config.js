import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'node:os';
import path from 'node:path';

const appDir = process.env.TM_APP_DIR || process.cwd();
const sharedDir = path.resolve(appDir, '../../packages/shared');

const apiProxy = { '/api': { target: 'http://localhost:4000', xfwd: true, ws: true } };

export default defineConfig({
  root: appDir,
  base: '/',
  cacheDir: path.join(os.tmpdir(), 'tres-marias-vite-admin'),
  publicDir: path.join(sharedDir, 'public'),
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: { '@tm/shared': path.join(sharedDir, 'src') },
    dedupe: ['react', 'react-dom', 'react-router-dom', '@mui/material', '@emotion/react', '@emotion/styled']
  },
  server: { port: 5174, strictPort: true, fs: { allow: [path.resolve(appDir, '../..')] }, proxy: apiProxy },
  preview: { port: 4174, strictPort: true, proxy: apiProxy },
  build: { outDir: path.join(appDir, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 1200, minify: false }
});
