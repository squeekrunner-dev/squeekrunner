import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // This checkout has no linked packages. Avoid Windows network-drive probing
  // (`net use`) so local builds also work in restricted desktop environments.
  resolve: { preserveSymlinks: true },
  test: { include: ['src/**/*.test.ts'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'es2020', outDir: 'dist', sourcemap: true,
    rollupOptions: { input: { home: 'index.html', play: 'play/index.html', whitepaper: 'whitepaper/index.html', whitelist: 'whitelist/index.html', collection: 'collection/index.html' } },
  },
});
