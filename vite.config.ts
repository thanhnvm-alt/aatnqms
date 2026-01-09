
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve((process as any).cwd(), './'),
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      target: 'es2020',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.TURSO_DATABASE_URL': JSON.stringify(env.TURSO_DATABASE_URL || env.VITE_TURSO_DATABASE_URL || ''),
      'process.env.TURSO_AUTH_TOKEN': JSON.stringify(env.TURSO_AUTH_TOKEN || env.VITE_TURSO_AUTH_TOKEN || ''),
    },
  };
});
