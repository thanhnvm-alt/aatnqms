import { query } from './lib/db.js';
import bcrypt from 'bcrypt';

async function seedAdmin() {
  try {
    const hashedPassword = await bcrypt.hash('123', 10);
    const res = await query(`
      INSERT INTO "appQAQC".users (id, username, password, name, role, avatar, msnv, email, position, work_location, status, join_date, education, notes, data, updated_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, EXTRACT(EPOCH FROM NOW())::BIGINT) 
      ON CONFLICT(id) DO UPDATE SET 
          password = EXCLUDED.password,
          role = EXCLUDED.role
    `, [
      'admin-id-001', 
      'admin', 
      hashedPassword, 
      'Administrator', 
      'ADMIN', 
      'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff', 
      'MS-001', 
      'admin@example.com', 
      'System Admin', 
      'HQ', 
      'ACTIVE', 
      '2024-01-01', 
      'University', 
      '', 
      JSON.stringify({ allowedModules: ['IQC', 'SQC_MAT', 'SQC_BTP', 'PQC', 'FSR', 'STEP', 'FQC', 'SPR', 'SITE', 'PROJECTS', 'OEM', 'SETTINGS', 'CONVERT_3D'] })
    ]);
    console.log('Admin user seeded successfully with password 123');
  } catch (e) {
    console.error('Error seeding admin:', e);
  }
}

seedAdmin();
