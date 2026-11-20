import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2500 },
  test: { include: ['test/**/*.test.ts'] },
} as any);
