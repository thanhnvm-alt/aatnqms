
import { turso, isTursoConfigured } from './tursoConfig';
import { withRetry } from '../lib/retry';
import { DatabaseError, NotFoundError, ValidationError } from '../lib/errors';
import { PlanInput } from '../lib/validations';
import { PlanEntity } from '../types';

export const plansService = {
  /**
   * Get all plans with pagination, search, and specific filtering
   */
  getPlans: async (page: number, limit: number, search?: string, filter?: { type: string, value: string }) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM plans`;
    let countSql = `SELECT COUNT(*) as total FROM plans`;
    
    const whereClauses: string[] = [];
    const args: any[] = [];

    // Generic Search
    if (search) {
      whereClauses.push(`(ma_ct LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ?)`);
      const term = `%${search}%`;
      args.push(term, term, term);
    }

    // Specific Filter (e.g. ma_ct = 'XYZ')
    if (filter && filter.type && filter.value) {
      const allowedFilters = ['ma_ct', 'ma_nha_may', 'ma_nm', 'headcode'];
      if (allowedFilters.includes(filter.type)) {
        // Map 'ma_nm' alias to actual column 'ma_nha_may'
        const dbColumn = filter.type === 'ma_nm' ? 'ma_nha_may' : filter.type;
        whereClauses.push(`${dbColumn} = ?`);
        args.push(filter.value);
      }
    }

    if (whereClauses.length > 0) {
      const whereSql = ` WHERE ${whereClauses.join(' AND ')}`;
      sql += whereSql;
      countSql += whereSql;
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    
    // Execute with Retry
    return await withRetry(async () => {
      const [dataResult, countResult] = await Promise.all([
        turso.execute({ sql, args: [...args, limit, offset] }),
        turso.execute({ sql: countSql, args })
      ]);

      return {
        items: dataResult.rows as unknown as PlanEntity[],
        total: Number(countResult.rows[0]?.total || 0)
      };
    });
  },

  /**
   * Get single plan by ID
   */
  getPlanById: async (id: number) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    return await withRetry(async () => {
      const result = await turso.execute({
        sql: `SELECT * FROM plans WHERE id = ?`,
        args: [id]
      });

      if (result.rows.length === 0) {
        throw new NotFoundError(`Không tìm thấy kế hoạch với ID: ${id}`);
      }

      return result.rows[0] as unknown as PlanEntity;
    });
  },

  /**
   * Create new plan
   */
  createPlan: async (data: PlanInput) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    return await withRetry(async () => {
      const sql = `
        INSERT INTO plans (headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, ma_nha_may, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
        RETURNING *
      `;
      
      try {
        const result = await turso.execute({
          sql,
          args: [
            data.headcode, 
            data.ma_ct, 
            data.ten_ct, 
            data.ten_hang_muc, 
            data.dvt, 
            data.so_luong_ipo,
            (data as any).ma_nha_may || null 
          ]
        });
        return result.rows[0] as unknown as PlanEntity;
      } catch (e: any) {
        throw new DatabaseError("Lỗi khi tạo bản ghi", e);
      }
    });
  },

  /**
   * Update plan
   */
  updatePlan: async (id: number, data: Partial<PlanInput>) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    const updates: string[] = [];
    const args: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        args.push(value);
      }
    });

    if (updates.length === 0) throw new ValidationError("Không có dữ liệu để cập nhật");

    args.push(id);

    return await withRetry(async () => {
      const check = await turso.execute({ sql: "SELECT id FROM plans WHERE id = ?", args: [id] });
      if (check.rows.length === 0) throw new NotFoundError(`Kế hoạch ID ${id} không tồn tại`);

      const sql = `UPDATE plans SET ${updates.join(', ')} WHERE id = ? RETURNING *`;
      const result = await turso.execute({ sql, args });
      
      return result.rows[0] as unknown as PlanEntity;
    });
  },

  /**
   * Delete plan
   */
  deletePlan: async (id: number) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    return await withRetry(async () => {
      const result = await turso.execute({
        sql: `DELETE FROM plans WHERE id = ?`,
        args: [id]
      });

      if (result.rowsAffected === 0) {
        throw new NotFoundError(`Không tìm thấy kế hoạch để xóa (ID: ${id})`);
      }
      return true;
    });
  }
};
