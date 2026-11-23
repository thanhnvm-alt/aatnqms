import dotenv from 'dotenv';
dotenv.config();

let pool: any = null;

const DEFAULT_DB_URL = 'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/aaTrackingApps';

export async function getPool() {
  if (pool) return pool;
  try {
    const pgModule = await import('pg');
    const Pool = pgModule.Pool || (pgModule.default && pgModule.default.Pool);
    const rawConnectionString = process.env.DATABASE_URL || DEFAULT_DB_URL;
    
    let connectionString = rawConnectionString;
    try {
      const url = new URL(rawConnectionString);
      url.searchParams.delete('sslmode');
      url.searchParams.delete('ssl');
      connectionString = url.toString();
    } catch (e) {
      // Use raw string
    }

    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    return pool;
  } catch (err) {
    console.error("Failed to initialize DB pool:", err);
    throw err;
  }
}

export async function query(text: string, params: any[] = []) {
  const p = await getPool();
  return p.query(text, params);
}
