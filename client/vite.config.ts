import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In local dev, the frontend (Vite, :5173) and backend (Express, :3000)
// run as separate processes. Proxying /products, /categories, etc.
// through Vite's dev server means the frontend code can call relative
// paths like fetch('/products') exactly as it will in production (where
// it's served from the same origin behind a single host, or configured
// via VITE_API_BASE_URL) — no CORS configuration needed for local dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/products': 'http://localhost:3000',
      '/categories': 'http://localhost:3000',
      '/stats': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
