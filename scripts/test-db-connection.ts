
import { testConnection, query } from '../lib/db-postgres/db';
import * as dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  console.log('--- Starting Database Connection Test ---');
  console.log(`Host: ${process.env.DB_HOST}`);
  console.log(`Schema: ${process.env.DB_SCHEMA}`);

  const isConnected = await testConnection();

  if (isConnected) {
    try {
      console.log('Testing query on appQAQC schema...');
      // Attempt to list tables in the schema to verify access
      const tables = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1
        LIMIT 5
      `, [process.env.DB_SCHEMA || 'appQAQC']);
      
      console.log('Tables found in schema:', tables.map((t: any) => t.table_name));
      
      console.log('✅ DATABASE CONFIGURATION VALID');
    } catch (e: any) {
      console.error('❌ QUERY TEST FAILED:', e.message);
    }
  } else {
    console.error('❌ CONNECTION FAILED');
  }
  
  (process as any).exit(isConnected ? 0 : 1);
}

runTest();