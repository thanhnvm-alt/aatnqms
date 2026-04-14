import { query } from './lib/db';

async function check() {
  try {
    const search = 'test';
    const l = 50;
    const offset = 0;
    const schema = 'appQAQC';
    let sql = `SELECT id, material, "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt" FROM "${schema}"."material" WHERE 1=1`;
    const params: any[] = [];
    let where = '';
    if (search) {
      where = ` AND (material LIKE $1 OR "shortText" LIKE $1 OR "projectName" LIKE $1 OR "Ma_Tender" LIKE $1)`;
      params.push(`%${search}%`);
    }

    const countSql = `SELECT COUNT(*) as total FROM "${schema}"."material" WHERE 1=1 ${where}`;
    
    console.log("Query:", sql + where + ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`);
    console.log("Params:", [...params, l, offset]);
    
    const [result, countResult] = await Promise.all([
      query(sql + where + ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
      query(countSql, params)
    ]);
    console.log("Success:", result.rows.length);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
check();
