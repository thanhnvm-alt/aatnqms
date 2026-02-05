
import { getTableSchema } from '../../lib/db-postgres/schema-detector';
import { getAuthUser } from '../../lib/auth';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }
    });
  }

  try {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }
      });
    }

    // Default to 'ipo' table, but allow override if needed securely
    const tableName = 'ipo';
    
    const columns = await getTableSchema(tableName);
    
    return res.status(200).json({
      success: true,
      data: columns,
      meta: {
        table: tableName,
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    console.error("Schema fetch error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SCHEMA_ERROR',
        message: error.message
      }
    });
  }
}
