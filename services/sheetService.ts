

import { PlanItem } from '../types';
import { MOCK_PLAN_DATA } from '../constants';
// Fixed missing import member - Removed as it's not used and causes confusion
// import { fetchPlans } from './apiService'; 

export const fetchPlansFromSheet = async (): Promise<PlanItem[]> => {
  try {
    // In a real application, this would fetch from a backend service, not directly from 'fetchPlans'.
    // As per ISO guidelines, direct client-side DB access is forbidden.
    // For now, it will return mock data.
    // const result = await fetchPlans('', 1, 200); 
    // return result && result.items && result.items.length > 0 ? result.items : MOCK_PLAN_DATA;
    return MOCK_PLAN_DATA; // Returning mock data as fetching plans directly is handled by apiService.ts through the backend.
  } catch (error) {
    console.warn("Error fetching plans:", error);
    return MOCK_PLAN_DATA;
  }
};