
import { PlanItem, ApiResponse } from '../types';

/**
 * Robust Plan Service that uses Next.js API Routes.
 * This solves iOS/Safari BigInt and WebSocket issues by proxying through the server.
 */

const API_BASE = '/api/plans';

// Helper to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP Error ${response.status}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'API reported failure');
  }
  return json.data;
}

export const plansService = {
  // GET Plans with Pagination and Search
  getPlans: async (page: number, limit: number, search?: string) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) params.append('search', search);

    const response = await fetch(`${API_BASE}?${params.toString()}`);
    const json = await response.json();
    
    if (!json.success) throw new Error(json.error);
    
    return {
      items: json.data as PlanItem[],
      total: json.pagination.total as number
    };
  },

  // CREATE Plan
  createPlan: async (data: Partial<PlanItem>) => {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PlanItem>(response);
  },

  // GET Single Plan (Mocked for now, or implement [id]/route.ts if needed)
  getPlanById: async (id: number | string) => {
    // Implementing client-side filter for now to save a request, 
    // assuming list is usually fetched. In full prod, fetch /api/plans/[id]
    const { items } = await plansService.getPlans(1, 1, id.toString());
    if (items.length === 0) {
      throw new Error("Plan not found"); // Simple error for now, ideally NotFoundError
    }
    return items[0];
  },

  // UPDATE Plan
  updatePlan: async (id: number | string, data: Partial<PlanItem>) => {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PlanItem>(response);
  },

  // DELETE Plan
  deletePlan: async (id: number | string) => {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  }
};
