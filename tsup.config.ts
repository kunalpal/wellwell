import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  outExtension() {
    return { js: '.mjs' };
  },
});
