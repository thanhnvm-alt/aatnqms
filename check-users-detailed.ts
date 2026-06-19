import { query } from './lib/db.js';

async function checkUsers() {
  try {
    const res = await query('SELECT username, name, role, position FROM "appQAQC".users');
    console.log('Users in DB:');
    res.rows.forEach((u: any) => console.log(`- ${u.username} (${u.name}): Role=${u.role}, Position=${u.position}`));
  } catch (e) {
    console.error('Error:', e);
  }
}

checkUsers();
