import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'node:os';
import path from 'node:path';

/**
 * Customer Portal. scripts/vite-run.mjs passes the app folder in TM_APP_DIR (through a
 * "#"-free junction when the project path contains "#"); see that script.
 */
const appDir = process.env.TM_APP_DIR || process.cwd();
const sharedDir = path.resolve(appDir, '../../packages/shared');

export default defineConfig({
  root: appDir,
  base: '/',
  // Dev pre-bundle cache outside the project: esbuild resolves real paths, and a "#" in them breaks the optimizer
  cacheDir: path.join(os.tmpdir(), 'tres-marias-vite-client'),
  publicDir: path.join(sharedDir, 'public'),
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: { '@tm/shared': path.join(sharedDir, 'src') },
    dedupe: ['react', 'react-dom', 'react-router-dom', '@mui/material', '@emotion/react', '@emotion/styled']
  },
  server: { port: 5173, strictPort: true, fs: { allow: [path.resolve(appDir, '../..')] } },
  preview: { port: 4173, strictPort: true },
  build: { outDir: path.join(appDir, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 1200, minify: false }
});
