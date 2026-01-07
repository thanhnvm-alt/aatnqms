import { createClient } from '@libsql/client';
import * as XLSX from 'xlsx';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'ISO: Method Not Allowed' });

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

    if (rawData.length === 0) throw new Error("File rỗng.");

    // ISO Rule: Kiểm tra Header thực tế so với mẫu chuẩn
    const firstRow = rawData[0];
    const requiredKeys = ['Mã Nhà Máy', 'Mã Công Trình', 'Tên Sản Phẩm'];
    for (const key of requiredKeys) {
        if (!(key in firstRow)) throw new Error(`Sai cấu trúc ISO: Thiếu cột '${key}'`);
    }

    let success = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const row of rawData) {
      const ma_nm = row['Mã Nhà Máy'];
      if (!ma_nm) continue;

      await turso.execute({
        sql: `INSERT INTO plans (ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, so_luong_ipo, dvt, plannedDate, assignee, status, created_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          String(ma_nm),
          row['Headcode'] || '',
          row['Mã Công Trình'] || '',
          row['Tên Công Trình'] || '',
          row['Tên Sản Phẩm'] || '',
          Number(row['Số lượng (IPO)'] || 0),
          row['ĐVT'] || 'PCS',
          row['Ngày Kế Hoạch'] || '',
          row['Người Phụ Trách'] || '',
          'PENDING',
          now
        ]
      });
      success++;
    }

    return res.status(200).json({ success, total: rawData.length });
  } catch (error: any) {
    console.error("[ISO-IMPORT-FAIL]:", error.message);
    return res.status(500).json({ message: `Lỗi ISO: ${error.message}` });
  }
}