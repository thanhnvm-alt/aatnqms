
import { turso, isTursoConfigured } from './tursoConfig';
import { withRetry } from '../lib/retry';
import { DatabaseError, NotFoundError, ValidationError } from '../lib/errors';
import { PlanInput } from '../lib/validations';
import { PlanEntity } from '../types';

export const plansService = {
  /**
   * Get all plans with pagination and search
   */
  getPlans: async (page: number, limit: number, search?: string) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM searchPlans`;
    let countSql = `SELECT COUNT(*) as total FROM searchPlans`;
    const args: any[] = [];

    if (search) {
      const whereClause = ` WHERE ma_ct LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ?`;
      const term = `%${search}%`;
      sql += whereClause;
      countSql += whereClause;
      args.push(term, term, term);
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
        sql: `SELECT * FROM searchPlans WHERE id = ?`,
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
      // Use RETURNING * to get the created record immediately
      const sql = `
        INSERT INTO searchPlans (headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, created_at)
        VALUES (?, ?, ?, ?, ?, ?, unixepoch())
        RETURNING *
      `;
      
      try {
        const result = await turso.execute({
          sql,
          args: [data.headcode, data.ma_ct, data.ten_ct, data.ten_hang_muc, data.dvt, data.so_luong_ipo]
        });
        return result.rows[0] as unknown as PlanEntity;
      } catch (e: any) {
        // Handle specific DB constraint errors if any
        throw new DatabaseError("Lỗi khi tạo bản ghi", e);
      }
    });
  },

  /**
   * Update plan
   */
  updatePlan: async (id: number, data: Partial<PlanInput>) => {
    if (!isTursoConfigured) throw new DatabaseError("Database connection not configured");

    // Dynamic query building
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
      // Check existence first
      const check = await turso.execute({ sql: "SELECT id FROM searchPlans WHERE id = ?", args: [id] });
      if (check.rows.length === 0) throw new NotFoundError(`Kế hoạch ID ${id} không tồn tại`);

      const sql = `UPDATE searchPlans SET ${updates.join(', ')} WHERE id = ? RETURNING *`;
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
        sql: `DELETE FROM searchPlans WHERE id = ?`,
        args: [id]
      });

      if (result.rowsAffected === 0) {
        throw new NotFoundError(`Không tìm thấy kế hoạch để xóa (ID: ${id})`);
      }
      return true;
    });
  }
};
