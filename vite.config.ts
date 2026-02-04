
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }: { mode: string }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Ưu tiên API Key từ Vercel System Env
  const apiKey = 
    process.env.API_KEY || 
    process.env.VITE_API_KEY || 
    env.API_KEY || 
    env.VITE_API_KEY || 
    '';

  // Hardcoded Turso credentials as requested (Fallback if env vars missing)
  const tursoUrl = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || env.VITE_TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io';
  const tursoToken = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || env.VITE_TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA';

  console.log(`✅ Build Mode: ${mode} - API Key detected: ${apiKey ? 'YES' : 'NO'}`);

  return {
    plugins: [react()],
    // Override resolve to remove the alias causing the build issue
    resolve: {
      alias: {}
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      target: 'es2022', // Updated target to a more modern ES version compatible with Vite 5.x
    },
    define: {
      // Tiêm API_KEY vào mã nguồn theo chuẩn Gemini SDK
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.VITE_API_KEY': JSON.stringify(apiKey),
      'process.env.NODE_ENV': JSON.stringify(mode),
      
      // Turso Config: Support both standard and VITE_ prefixed variables for flexibility
      'process.env.TURSO_DATABASE_URL': JSON.stringify(tursoUrl),
      'process.env.TURSO_AUTH_TOKEN': JSON.stringify(tursoToken),
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
