import { createClient } from '@libsql/client';
import * as XLSX from 'xlsx';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const chunks: any[] = [];
    for await (const chunk of req) chunks.push(chunk);
    
    // Fixed: Replaced Buffer.concat with Uint8Array concatenation to resolve "Cannot find name 'Buffer'" error
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), pos);
      pos += chunk.length;
    }
    
    // Fixed: Using 'array' type for XLSX.read with Uint8Array
    const workbook = XLSX.read(combined, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

    let success = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const row of rawData) {
      const code = row['Mã Lỗi'];
      if (!code) continue;

      await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, defect_name, defect_group, defect_type, severity, description, applicable_process, status, suggested_action, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET defect_name=excluded.defect_name, description=excluded.description, updated_at=excluded.updated_at`,
        args: [
          code, code,
          row['Tên Lỗi'] || '',
          row['Nhóm Lỗi'] || 'Ngoại quan',
          row['Loại Lỗi'] || 'Chung',
          String(row['Mức Độ'] || 'MINOR').toUpperCase(),
          row['Mô Tả Lỗi'] || '',
          row['Quy Trình Áp Dụng'] || '',
          'ACTIVE',
          row['Biện Pháp Khắc Phục'] || '',
          now
        ]
      });
      success++;
    }

    return res.status(200).json({ success, total: rawData.length });
  } catch (error: any) {
    return res.status(500).json({ message: `ISO Error: ${error.message}` });
  }
}