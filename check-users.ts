import { query } from './lib/db.js';

async function checkUsers() {
  try {
    const res = await query('SELECT username, password FROM "appQAQC".users');
    console.log('Users in DB:', res.rows);
  } catch (e) {
    console.error('Error:', e);
  }
}

checkUsers();
