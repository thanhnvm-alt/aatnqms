
// DEPRECATED - REPLACED BY API SERVICE
// This file is deprecated. All logic has been moved to lib/db/queries.ts (Server-side).
// Client must use services/apiService.ts to call /api/* endpoints.

export const initDatabase = async () => {};
export const testConnection = async () => false;
export const getPlans = async () => ({ items: [], total: 0 });
export const saveInspection = async () => {};
// ... other exports stubbed to prevent build errors during migration if any imports remain ...
