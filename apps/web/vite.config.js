import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Classic JSX runtime: JSX compiles to React.createElement, and app.jsx
// imports React explicitly. Matches the original CDN/Babel-classic setup.
export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsDir: 'static' },
});
