
import { query } from './db';

export interface ColumnDefinition {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: any;
  character_maximum_length: number | null;
  ordinal_position: number;
}

export const getTableSchema = async (tableName: string, schema: string = 'appQAQC'): Promise<ColumnDefinition[]> => {
  // ISO SQL Standard query to get column definitions
  const sql = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length,
      ordinal_position
    FROM information_schema.columns
    WHERE table_schema = $1 
      AND table_name = $2
    ORDER BY ordinal_position ASC;
  `;
  
  try {
    return await query<ColumnDefinition>(sql, [schema, tableName]);
  } catch (error) {
    console.error(`Error fetching schema for table ${schema}.${tableName}:`, error);
    return [];
  }
};
