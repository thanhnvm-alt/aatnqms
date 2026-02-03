import { db } from './db';
import { QueryResultRow } from 'pg';

export async function query<T extends QueryResultRow>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const result = await db.query(sql, params);
    return result.rows as T[];
  } catch (error) {
    console.error(`Database Query Error: ${sql}`, error);
    throw error;
  }
}

export async function queryOne<T extends QueryResultRow>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function selectAll<T extends QueryResultRow>(table: string, conditions?: Record<string, any>): Promise<T[]> {
  let sql = `SELECT * FROM "${table}"`;
  const params: any[] = [];
  
  if (conditions && Object.keys(conditions).length > 0) {
    const whereClauses = Object.keys(conditions).map((key, index) => {
      params.push(conditions[key]);
      return `"${key}" = $${index + 1}`;
    });
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  
  return query<T>(sql, params);
}

export async function selectById<T extends QueryResultRow>(table: string, id: any): Promise<T | null> {
  const sql = `SELECT * FROM "${table}" WHERE id = $1`;
  return queryOne<T>(sql, [id]);
}

export async function insert<T extends QueryResultRow>(table: string, data: Record<string, any>): Promise<T> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.map(k => `"${k}"`).join(', ');

  const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;
  const result = await queryOne<T>(sql, values);
  if (!result) throw new Error("Insert operation failed to return data");
  return result;
}

export async function update<T extends QueryResultRow>(table: string, id: any, data: Record<string, any>): Promise<T> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  
  const setClause = keys.map((key, i) => `"${key}" = $${i + 1}`).join(', ');
  values.push(id);
  
  const sql = `UPDATE "${table}" SET ${setClause} WHERE id = $${values.length} RETURNING *`;
  const result = await queryOne<T>(sql, values);
  if (!result) throw new Error(`Record with id ${id} not found in ${table}`);
  return result;
}

export async function deleteById(table: string, id: any): Promise<boolean> {
  const sql = `DELETE FROM "${table}" WHERE id = $1`;
  const result = await db.query(sql, [id]);
  return (result.rowCount || 0) > 0;
}

export async function count(table: string, conditions?: Record<string, any>): Promise<number> {
  let sql = `SELECT COUNT(*) as total FROM "${table}"`;
  const params: any[] = [];
  
  if (conditions && Object.keys(conditions).length > 0) {
    const whereClauses = Object.keys(conditions).map((key, index) => {
      params.push(conditions[key]);
      return `"${key}" = $${index + 1}`;
    });
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  
  const result = await queryOne<{ total: string }>(sql, params);
  return parseInt(result?.total || '0', 10);
}

export async function paginate<T extends QueryResultRow>(
  table: string, 
  page: number = 1, 
  pageSize: number = 10, 
  conditions?: Record<string, any>
): Promise<{ data: T[], total: number, page: number, pageSize: number, totalPages: number }> {
  const offset = (page - 1) * pageSize;
  const total = await count(table, conditions);
  
  let sql = `SELECT * FROM "${table}"`;
  const params: any[] = [];
  
  if (conditions && Object.keys(conditions).length > 0) {
    const whereClauses = Object.keys(conditions).map((key, index) => {
      params.push(conditions[key]);
      return `"${key}" = $${index + 1}`;
    });
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  
  sql += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const data = await query<T>(sql, [...params, pageSize, offset]);
  
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function batch(operations: { sql: string, params: any[] }[]): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const op of operations) {
      await client.query(op.sql, op.params);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
