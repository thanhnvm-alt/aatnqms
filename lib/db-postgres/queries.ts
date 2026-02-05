
import { PoolClient, QueryResult } from 'pg';
import { pool } from './pool';
import { DatabaseError, SelectOptions, WhereCondition } from './types';

const SCHEMA = process.env.DB_SCHEMA || 'appQAQC';

/**
 * Helper to format table name with schema
 */
const tbl = (table: string) => `"${SCHEMA}"."${table}"`;

/**
 * Build WHERE clause from object
 */
const buildWhere = (condition: WhereCondition, idxStart = 1) => {
  const keys = Object.keys(condition);
  if (keys.length === 0) return { clause: '', values: [] };
  
  const clause = 'WHERE ' + keys.map((k, i) => `"${k}" = $${idxStart + i}`).join(' AND ');
  const values = Object.values(condition);
  return { clause, values };
};

/**
 * Execute a raw SQL query
 */
export const query = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  const start = Date.now();
  try {
    const res = await pool.query(sql, params);
    // Optional: Log slow queries
    // const duration = Date.now() - start;
    // if (duration > 1000) console.warn(`[DB] Slow query (${duration}ms): ${sql}`);
    return res.rows;
  } catch (error: any) {
    throw new DatabaseError(`Query failed: ${error.message}`, { sql, params }, error.code);
  }
};

/**
 * SELECT operation
 */
export const select = async <T = any>(table: string, options: SelectOptions = {}): Promise<T[]> => {
  const columns = options.columns?.map(c => c === '*' ? '*' : `"${c}"`).join(', ') || '*';
  const { clause, values } = options.where ? buildWhere(options.where) : { clause: '', values: [] };
  
  let sql = `SELECT ${columns} FROM ${tbl(table)} ${clause}`;
  
  if (options.orderBy) sql += ` ORDER BY ${options.orderBy}`;
  if (options.limit) sql += ` LIMIT ${options.limit}`;
  if (options.offset) sql += ` OFFSET ${options.offset}`;

  return query<T>(sql, values);
};

/**
 * INSERT operation
 */
export const insert = async <T = any>(table: string, data: Partial<T>): Promise<T> => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  
  if (keys.length === 0) throw new DatabaseError('Insert data cannot be empty');

  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const sql = `INSERT INTO ${tbl(table)} (${cols}) VALUES (${placeholders}) RETURNING *`;
  
  const rows = await query<T>(sql, values);
  return rows[0];
};

/**
 * UPDATE operation
 */
export const update = async <T = any>(table: string, data: Partial<T>, where: WhereCondition): Promise<T> => {
  const dataKeys = Object.keys(data);
  if (dataKeys.length === 0) throw new DatabaseError('Update data cannot be empty');
  
  const setClause = dataKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const dataValues = Object.values(data);
  
  const { clause, values: whereValues } = buildWhere(where, dataValues.length + 1);
  if (!clause) throw new DatabaseError('Update requires a where condition');

  const sql = `UPDATE ${tbl(table)} SET ${setClause} ${clause} RETURNING *`;
  const allValues = [...dataValues, ...whereValues];

  const rows = await query<T>(sql, allValues);
  return rows[0];
};

/**
 * DELETE operation
 */
export const del = async (table: string, where: WhereCondition): Promise<number> => {
  const { clause, values } = buildWhere(where);
  if (!clause) throw new DatabaseError('Delete requires a where condition');

  const sql = `DELETE FROM ${tbl(table)} ${clause}`;
  
  try {
    const res = await pool.query(sql, values);
    return res.rowCount || 0;
  } catch (error: any) {
    throw new DatabaseError(`Delete failed: ${error.message}`, { sql, values }, error.code);
  }
};

/**
 * Transaction Helper
 */
export const transaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Ensure search path is set for this transaction client
    await client.query(`SET search_path TO "${SCHEMA}", public`);
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Verification
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    const res = await pool.query('SELECT current_schema() as schema, 1 as connected');
    console.log(`[DB] Connected successfully. Current Schema: ${res.rows[0].schema}`);
    return true;
  } catch (e: any) {
    console.error(`[DB] Connection failed: ${e.message}`);
    return false;
  }
};
