/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base for GitHub Pages compatibility (works on root and subpath)
  base: './',
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
