import pg from 'pg';

const { Pool } = pg;
const urls = [
  'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/postgres',
  'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/edbqaqc',
  'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/aatrackingapps',
  'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/aaTrackingApps'
];

async function test() {
  for (const url of urls) {
    const pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false }
    });
    try {
      const res = await pool.query('SELECT current_database(), current_user');
      console.log(`Success connecting to ${url.split('/').pop()}:`, res.rows[0]);
    } catch (err) {
      console.error(`Failed connecting to ${url.split('/').pop()}:`, err.message);
    } finally {
      await pool.end();
    }
  }
}

test();
