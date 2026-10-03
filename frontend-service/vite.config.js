import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const frontendInfo = {
  service: 'frontend-service',
  version: '2.0.0-dev',
  runtime: 'React + Ant Design / Vite dev server',
  container_port: 5173,
  persistence: 'Static UI (stateless)',
  networks: ['host-dev'],
  depends_on: ['localhost:8001', 'localhost:8002', 'localhost:8003'],
  responsibility: 'Serve presentation UI and proxy browser API requests'
};

function demoMetaPlugin() {
  return {
    name: 'mini-shop-demo-meta',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/health') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', service: 'frontend-service' }));
          return;
        }
        if (req.url === '/info') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(frontendInfo));
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), demoMetaPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/customer': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/customer/, '')
      },
      '/api/catalog': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/catalog/, '')
      },
      '/api/order': {
        target: 'http://localhost:8003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/order/, '')
      }
    }
  }
});
