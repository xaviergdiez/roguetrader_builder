// The app on :5201 with /api sent to the simulator (tests/sim-api.mjs), for the browser tests.
// Run from the repo root: npx vite --config tests/vite.e2e.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5201, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5290' } },
});
