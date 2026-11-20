import { defineConfig } from 'vite';
import { createLeaderboard, leaderboardApi } from './src/server/leaderboard.js';

const localApi = server => { server.middlewares.use(leaderboardApi(createLeaderboard())); };

export default defineConfig({
  base: './',
  plugins: [{ name: 'local-leaderboard', configureServer: localApi, configurePreviewServer: localApi }],
  server: {
    watch: { ignored: ['**/.npm-cache/**'] },
  },
  build: {
    rollupOptions: {
      input: { game: 'index.html', bench: 'bench.html' },
      output: {
        manualChunks(id) {
          if (id.endsWith('/three/build/three.core.js')) return 'three-core';
        },
      },
    },
  },
});
