
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load variables from .env
  const env = loadEnv(mode, path.resolve(), '');
  
  // Critical: Inject env into process.env for the Backend middleware context
  Object.keys(env).forEach(key => {
    if (!(key in process.env)) {
      process.env[key] = env[key];
    }
  });

  return {
    plugins: [
      react(),
      {
        name: 'express-api-plugin',
        configureServer(server) {
          // Mount Express at /api
          // Note: Vite (Connect) strips /api from req.url before calling this handler
          server.middlewares.use('/api', async (req, res, next) => {
            try {
              const apiPath = path.resolve(__dirname, 'api/index.ts');
              // Use SSR load to support TS/ESM for the Backend
              const module = await server.ssrLoadModule(apiPath);
              const apiApp = module.default;
              
              if (typeof apiApp === 'function') {
                apiApp(req, res, next);
              } else {
                next();
              }
            } catch (error) {
              console.error('[Vite API Gateway Error]:', error);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  success: false, 
                  error: 'Internal Server Error in API Gateway', 
                  details: String(error) 
                }));
              }
            }
          });
          console.log('📡 [Vite] Express API Gateway mounted at /api');
        }
      }
    ],
    build: {
      outDir: 'dist',
      target: 'es2020',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    },
    server: {
      host: true,
      port: 5173
    }
  };
});
