
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { plansService } from '../../services/plansService';
import { turso } from '../../services/tursoConfig';

/**
 * INTEGRATION TESTS
 * Only run these if a real TURSO_DATABASE_URL is provided.
 * Use: `export TURSO_DATABASE_URL=... && npm test`
 */
const runIntegration = process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABASE_URL.includes('placeholder');

describe.skipIf(!runIntegration)('Turso Integration Tests', () => {
  let createdId: number;

  beforeAll(async () => {
    // Optional: Setup test table or clean state
    // await turso.execute("DELETE FROM searchPlans WHERE headcode LIKE 'TEST_%'");
  });

  it('should verify database connection', async () => {
    const result = await turso.execute('SELECT 1 as val');
    expect(result.rows[0].val).toBe(1);
  });

  it('should perform full CRUD lifecycle', async () => {
    // 1. CREATE
    const newPlan = await plansService.createPlan({
      headcode: `TEST_${Date.now()}`,
      ma_ct: 'INT_TEST',
      ten_ct: 'Integration Test',
      ten_hang_muc: 'Lifecycle Item',
      so_luong_ipo: 10,
      dvt: 'PCS'
    });
    
    expect(newPlan.id).toBeDefined();
    createdId = newPlan.id;

    // 2. READ
    const fetched = await plansService.getPlanById(createdId);
    expect(fetched.headcode).toBe(newPlan.headcode);

    // 3. UPDATE
    const updated = await plansService.updatePlan(createdId, { so_luong_ipo: 20 });
    expect(updated.so_luong_ipo).toBe(20);

    // 4. DELETE
    await plansService.deletePlan(createdId);
    
    // Verify Deletion
    await expect(plansService.getPlanById(createdId))
      .rejects
      .toThrow();
  });

  afterAll(async () => {
    // Cleanup if needed
    if (createdId) {
        try { await plansService.deletePlan(createdId); } catch(e) {}
    }
  });
});
