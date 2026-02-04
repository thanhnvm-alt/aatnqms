
import { withRetry } from '../lib/retry';
import { DatabaseError, NotFoundError, ValidationError } from '../lib/errors';
import { PlanInput } from '../lib/validations';
import { PlanEntity } from '../types';
import { db } from '../lib/db'; // Import the db client

export const plansService = {
  /**
   * Get all plans with pagination, search, and specific filtering
   */
  getPlans: async (page: number, limit: number, search?: string, filter?: { type: string, value: string }) => {
    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM "IPO"`; 
    let countSql = `SELECT COUNT(*) as total FROM "IPO"`;
    
    const whereClauses: string[] = [];
    const args: any[] = [];
    let paramIndex = 1;

    // Generic Search
    if (search) {
      whereClauses.push(`(ma_ct LIKE $${paramIndex} OR headcode LIKE $${paramIndex} OR ten_hang_muc LIKE $${paramIndex} OR ma_nha_may LIKE $${paramIndex})`); // Added ma_nha_may to search
      const term = `%${search}%`;
      args.push(term);
      paramIndex++;
    }

    // Specific Filter (e.g. ma_ct = 'XYZ')
    if (filter && filter.type && filter.value) {
      const allowedFilters = ['ma_ct', 'ma_nha_may', 'ma_nm', 'headcode'];
      if (allowedFilters.includes(filter.type)) {
        // Map 'ma_nm' alias to actual column 'ma_nha_may'
        const dbColumn = filter.type === 'ma_nm' ? 'ma_nha_may' : filter.type;
        whereClauses.push(`${dbColumn} = $${paramIndex}`);
        args.push(filter.value);
        paramIndex++;
      }
    }

    if (whereClauses.length > 0) {
      const whereSql = ` WHERE ${whereClauses.join(' AND ')}`;
      sql += whereSql;
      countSql += whereSql;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    // Execute with Retry
    return await withRetry(async () => {
      const [dataResult, countResult] = await Promise.all([
        db.query(sql, [...args, limit, offset]),
        db.query(countSql, args)
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
    return await withRetry(async () => {
      const result = await db.query(
        `SELECT * FROM "IPO" WHERE id = $1`, 
        [id]
      );

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
    return await withRetry(async () => {
      const sql = `
        INSERT INTO "IPO" (headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, ma_nha_may, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, extract(epoch from now()))
        RETURNING *
      `;
      
      try {
        const result = await db.query(
          sql,
          [
            data.headcode, 
            data.ma_ct, 
            data.ten_ct, 
            data.ten_hang_muc, 
            data.dvt, 
            data.so_luong_ipo,
            data.ma_nha_may || null // Ensure ma_nha_may is passed, or null if undefined
          ]
        );
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
    const updates: string[] = [];
    const args: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`"${key}" = $${paramIndex}`);
        args.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) throw new ValidationError("Không có dữ liệu để cập nhật");

    args.push(id); // ID will be the last parameter

    return await withRetry(async () => {
      const check = await db.query(`SELECT id FROM "IPO" WHERE id = $1`, [id]);
      if (check.rows.length === 0) throw new NotFoundError(`Kế hoạch ID ${id} không tồn tại`);

      const sql = `UPDATE "IPO" SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      const result = await db.query(sql, args);
      
      return result.rows[0] as unknown as PlanEntity;
    });
  },

  /**
   * Delete plan
   */
  deletePlan: async (id: number) => {
    return await withRetry(async () => {
      const result = await db.query(
        `DELETE FROM "IPO" WHERE id = $1`,
        [id]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError(`Không tìm thấy kế hoạch để xóa (ID: ${id})`);
      }
      return true;
    });
  }
};