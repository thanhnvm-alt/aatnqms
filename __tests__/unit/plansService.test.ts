
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { plansService } from '../../services/plansService';
import { db } from '../../lib/db'; 
import { DatabaseError, NotFoundError } from '../../lib/errors';

// Mock the db client
vi.mock('../../lib/db', () => ({
  db: {
    query: vi.fn(),
  },
}));

// Mock Logger to prevent console noise
vi.mock('../../lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }
}));

describe('PlansService (Unit)', () => {
  const mockPlan = {
    id: 1,
    headcode: "HC001",
    ma_ct: "CT001",
    ten_ct: "Test Project",
    ten_hang_muc: "Test Item",
    so_luong_ipo: 100,
    dvt: "PCS",
    ma_nha_may: "NM001", // Added for consistency
    created_at: 1234567890
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlans', () => {
    it('should return paginated plans successfully', async () => {
      // Mock DB Response: First call data, Second call count
      (db.query as any)
        .mockResolvedValueOnce({ rows: [mockPlan] }) // Data
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // Count

      const result = await plansService.getPlans(1, 10);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('should handle search filters correctly', async () => {
      (db.query as any)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      await plansService.getPlans(1, 10, 'search-term');

      // Check if SQL contains WHERE clause
      const callArgs = (db.query as any).mock.calls[0][0];
      expect(callArgs).toContain('WHERE');
      expect((db.query as any).mock.calls[0][1]).toContain('%search-term%');
    });
  });

  describe('createPlan', () => {
    it('should create a plan and return the result', async () => {
      const input = {
        headcode: "HC002",
        ma_ct: "CT002",
        ten_ct: "New Project",
        ten_hang_muc: "New Item",
        so_luong_ipo: 50,
        dvt: "SET",
        ma_nha_may: "NM002"
      };

      (db.query as any).mockResolvedValueOnce({ rows: [{ ...input, id: 2 }] });

      const result = await plansService.createPlan(input);

      expect(result).toMatchObject(input);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "IPO"'), 
        expect.arrayContaining([input.headcode, input.ma_ct, input.ten_ct, input.ten_hang_muc, input.dvt, input.so_luong_ipo, input.ma_nha_may]));
    });
  });

  describe('getPlanById', () => {
    it('should throw NotFoundError if plan does not exist', async () => {
      (db.query as any).mockResolvedValueOnce({ rows: [] });

      await expect(plansService.getPlanById(999))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient network errors', async () => {
      const transientError = new Error('Connection Refused');
      
      // Fail twice, succeed third time
      (db.query as any)
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ rows: [mockPlan] });

      await plansService.getPlanById(1);

      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on permanent errors (e.g. SQL Syntax)', async () => {
      const permanentError = new Error('SQL Syntax Error');
      
      (db.query as any).mockRejectedValueOnce(permanentError);

      await expect(plansService.getPlanById(1))
        .rejects
        .toThrow(permanentError);

      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});