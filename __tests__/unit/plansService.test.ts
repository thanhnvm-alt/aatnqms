
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { plansService } from '../../services/plansService';
import { turso } from '../../services/tursoConfig';
import { DatabaseError, NotFoundError } from '../../lib/errors';

// Mock the turso client
vi.mock('../../services/tursoConfig', () => ({
  turso: {
    execute: vi.fn(),
  },
  isTursoConfigured: true
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
    created_at: 1234567890
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlans', () => {
    it('should return paginated plans successfully', async () => {
      // Mock DB Response: First call data, Second call count
      (turso.execute as any)
        .mockResolvedValueOnce({ rows: [mockPlan] }) // Data
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // Count

      const result = await plansService.getPlans(1, 10);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(turso.execute).toHaveBeenCalledTimes(2);
    });

    it('should handle search filters correctly', async () => {
      (turso.execute as any)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      await plansService.getPlans(1, 10, 'search-term');

      // Check if SQL contains WHERE clause
      const callArgs = (turso.execute as any).mock.calls[0][0];
      expect(callArgs.sql).toContain('WHERE');
      expect(callArgs.args).toContain('%search-term%');
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
        dvt: "SET"
      };

      (turso.execute as any).mockResolvedValueOnce({ rows: [{ ...input, id: 2 }] });

      const result = await plansService.createPlan(input);

      expect(result).toMatchObject(input);
      expect(turso.execute).toHaveBeenCalledWith(expect.objectContaining({
        sql: expect.stringContaining('INSERT INTO searchPlans'),
        args: expect.arrayContaining(['HC002'])
      }));
    });
  });

  describe('getPlanById', () => {
    it('should throw NotFoundError if plan does not exist', async () => {
      (turso.execute as any).mockResolvedValueOnce({ rows: [] });

      await expect(plansService.getPlanById(999))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient network errors', async () => {
      const transientError = new Error('Connection Refused');
      
      // Fail twice, succeed third time
      (turso.execute as any)
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ rows: [mockPlan] });

      await plansService.getPlanById(1);

      expect(turso.execute).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on permanent errors (e.g. SQL Syntax)', async () => {
      const permanentError = new Error('SQL Syntax Error');
      
      (turso.execute as any).mockRejectedValueOnce(permanentError);

      await expect(plansService.getPlanById(1))
        .rejects
        .toThrow(permanentError);

      expect(turso.execute).toHaveBeenCalledTimes(1);
    });
  });
});
