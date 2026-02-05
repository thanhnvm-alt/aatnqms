
import pg from 'pg';
import * as dotenv from 'dotenv';

// Handle various import scenarios for pg
const Pool = pg.Pool || (pg as any).default?.Pool || pg;

dotenv.config();

async function runTest() {
  console.log('--- START: REMOTE DB CONNECTION TEST ---');
  
  // Credentials from Environment or Hardcoded Fallback
  const dbConfig = {
    host: process.env.DB_HOST || 'dbtracking.apps.zuehjcybfdiyc7j.aacorporation.vn',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'aaTrackingApps',
    user: process.env.DB_USER || 'edbqaqc',
    password: process.env.DB_PASSWORD || 'Oe71zNGcnaS6hzra',
    ssl: { rejectUnauthorized: false }
  };

  console.log(`Host: ${dbConfig.host}`);
  console.log(`Database: ${dbConfig.database}`);
  console.log(`User: ${dbConfig.user}`);
  
  const pool = new Pool(dbConfig);

  try {
    // 1. Basic Connection & Version
    console.log('\n[1] Checking connection...');
    const client = await pool.connect();
    const versionRes = await client.query('SELECT version()');
    console.log('✅ Connected! Server:', versionRes.rows[0].version);
    client.release();

    // 2. Schema Check
    console.log('\n[2] Verifying Schema access...');
    const schema = process.env.DB_SCHEMA || 'appQAQC';
    const tableRes = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
        LIMIT 5
    `, [schema]);
    
    if (tableRes.rows.length > 0) {
        console.log(`✅ Schema "${schema}" accessible. Found tables:`, tableRes.rows.map((t: any) => t.table_name).join(', '));
    } else {
        console.warn(`⚠️ Connected, but no tables found in schema "${schema}". Check permissions or schema name.`);
    }

    // 3. Specific Table Check (ipo)
    console.log('\n[3] Checking target table "ipo"...');
    try {
        const countRes = await pool.query(`SELECT COUNT(*) as count FROM "${schema}"."ipo"`);
        console.log(`✅ Table "ipo" found. Total records: ${countRes.rows[0].count}`);
    } catch (e: any) {
        console.error(`❌ Failed to access table "ipo": ${e.message}`);
    }

    console.log('\n--- TEST SUCCESSFUL ---');
    (process as any).exit(0);

  } catch (e: any) {
    console.error('\n❌ CONNECTION FAILED');
    console.error('Error:', e.message);
    if (e.code) console.error('Code:', e.code);
    (process as any).exit(1);
  } finally {
      await pool.end();
  }
}

runTest();
