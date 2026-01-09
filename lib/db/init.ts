
import { turso } from './turso';
import { User } from '../../types';

export async function initializeDatabase() {
  try {
    // 1. Create Users Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        data TEXT,
        role TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);

    // 2. Check and Seed Admin
    const adminCheck = await turso.execute({
      sql: "SELECT 1 FROM users WHERE username = 'admin'",
      args: []
    });

    if (adminCheck.rows.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      const adminUser: User = {
        id: '1',
        username: 'admin',
        password: '123456', 
        name: 'Administrator',
        role: 'ADMIN',
        avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
        allowedModules: [], // Empty implies full access in logic or handled elsewhere
        status: 'Đang làm việc'
      };
      
      await turso.execute({
        sql: "INSERT INTO users (id, username, data, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: ['1', 'admin', JSON.stringify(adminUser), 'ADMIN', now, now]
      });
      console.log("[ISO-INIT] Admin user seeded successfully.");
    }

    // 3. Create Other Tables (Essential for ISO)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        ma_ct TEXT,
        ten_ct TEXT,
        ma_nha_may TEXT,
        ten_hang_muc TEXT,
        workshop TEXT,
        status TEXT,
        type TEXT,
        score INTEGER,
        created_by TEXT,
        data TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);

    await turso.execute(`
      CREATE TABLE IF NOT EXISTS ncrs (
        id TEXT PRIMARY KEY,
        inspection_id TEXT,
        item_id TEXT,
        defect_code TEXT,
        severity TEXT,
        status TEXT,
        description TEXT,
        root_cause TEXT,
        corrective_action TEXT,
        responsible_person TEXT,
        deadline TEXT,
        images_before_json TEXT,
        images_after_json TEXT,
        comments_json TEXT,
        created_by TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        deleted_at INTEGER
      )
    `);

    return true;
  } catch (error) {
    console.error("[ISO-INIT] Database initialization failed:", error);
    return false;
  }
}
