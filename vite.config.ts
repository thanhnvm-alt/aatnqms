
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': '/src',
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
      // SECURE: DB Credentials removed. Client must use API.
    },
  };
});
