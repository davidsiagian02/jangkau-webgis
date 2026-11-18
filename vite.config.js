import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (f) => fileURLToPath(new URL(f, import.meta.url));
const proxy = { '/api': 'http://localhost:3001' };

export default defineConfig({
  build: {
    rollupOptions: {
      input: { index: page('index.html'), peta: page('peta.html'), data: page('data.html'), admin: page('admin.html') },
    },
    chunkSizeWarningLimit: 1500,
  },
  server: { proxy },
  preview: { proxy },
});
