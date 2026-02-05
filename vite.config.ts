
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import pg from 'pg';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  const apiKey = env.API_KEY || env.VITE_API_KEY || '';

  // Robust Postgres Pool Import for Vite/Node environment
  const Pool = pg.Pool || (pg as any).default?.Pool || pg;

  // DB Configuration with Hardcoded Fallbacks from User Request
  const dbConfig = {
    host: env.DB_HOST || 'dbtracking.apps.zuehjcybfdiyc7j.aacorporation.vn',
    port: parseInt(env.DB_PORT || '5432'),
    database: env.DB_NAME || 'aaTrackingApps',
    user: env.DB_USER || 'edbqaqc',
    password: env.DB_PASSWORD || 'Oe71zNGcnaS6hzra',
    ssl: { rejectUnauthorized: false }
  };

  // Initialize Postgres Pool for Local Dev Server
  let pool: any = null;
  try {
    pool = new Pool(dbConfig);
    console.log(`🔌 Database Pool Initialized for: ${dbConfig.host}`);
    
    // Test connection immediately on startup
    pool.query('SELECT 1')
        .then(() => console.log('✅ DB Connection Verified'))
        .catch((e: any) => console.error('❌ DB Startup Connection Failed:', e.message));

  } catch (err) {
    console.error("❌ Failed to initialize database pool:", err);
  }

  return {
    plugins: [
      react(),
      {
        name: 'local-api-server',
        configureServer(server) {
          server.middlewares.use('/api', async (req, res, next) => {
            const url = req.url || '/';
            // Extract pure pathname
            const [pathname] = url.split('?'); 

            // Basic logging
            // console.log(`[API] ${req.method} ${url} -> ${pathname}`);

            if (!pool) {
                console.warn("⚠️ API request received but DB Pool is not ready.");
                res.statusCode = 503;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                    success: false, 
                    message: "Database connection not configured on server.", 
                    code: 'DB_NOT_CONFIGURED' 
                }));
                return;
            }
            
            const schema = env.DB_SCHEMA || 'appQAQC';

            try {
                // 1. Health Check
                if (pathname === '/health') {
                    const result = await pool.query('SELECT current_database() as db, inet_server_addr() as ip');
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ 
                        status: 'direct-connection', 
                        database: result.rows[0].db,
                        host: dbConfig.host,
                        server_ip: result.rows[0].ip,
                        timestamp: new Date().toISOString()
                    }));
                    return;
                }

                // 2. IPO Schema
                if (pathname === '/ipos/schema') {
                    const sql = `
                        SELECT column_name, data_type, is_nullable, ordinal_position
                        FROM information_schema.columns
                        WHERE table_schema = $1 AND table_name = 'ipo'
                        ORDER BY ordinal_position ASC
                    `;
                    const result = await pool.query(sql, [schema]);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: true, data: result.rows }));
                    return;
                }

                // 3. IPO List
                if (pathname === '/ipos') {
                    // Extract search param manually from original url
                    const searchMatch = url.match(/[?&]search=([^&]+)/);
                    const search = searchMatch ? decodeURIComponent(searchMatch[1]) : '';
                    
                    let sql = `SELECT * FROM "${schema}"."ipo" ORDER BY created_at DESC LIMIT 200`;
                    let params: any[] = [];
                    
                    if (search) {
                        const term = `%${search.toUpperCase()}%`;
                        sql = `
                          SELECT * FROM "${schema}"."ipo" 
                          WHERE UPPER(ma_ct) LIKE $1 
                          OR UPPER(ten_ct) LIKE $1 
                          OR UPPER(ten_hang_muc) LIKE $1 
                          OR UPPER(id) LIKE $1
                          ORDER BY created_at DESC LIMIT 200`;
                        params = [term];
                    }
                    
                    const result = await pool.query(sql, params);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                        success: true,
                        data: { items: result.rows, count: result.rows.length }
                    }));
                    return;
                }

                // 4. Default fallthrough to 404 for unknown API routes
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: 'API Endpoint Not Found', path: pathname }));

            } catch (e: any) {
                console.error(`API Middleware Error [${url}]:`, e);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: e.message, code: 'DB_ERROR' }));
            }
          });
        }
      }
    ],
    resolve: {
      alias: {}
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      target: 'es2020',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.VITE_API_KEY': JSON.stringify(apiKey),
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.DB_HOST': JSON.stringify(dbConfig.host),
    },
  };
});
