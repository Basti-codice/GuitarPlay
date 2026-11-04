import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
