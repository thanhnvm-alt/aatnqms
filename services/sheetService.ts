import { PlanItem } from '../types';
import { MOCK_PLAN_DATA } from '../constants';
import { fetchPlans } from './apiService';

export const fetchPlansFromSheet = async (): Promise<PlanItem[]> => {
  try {
    const result = await fetchPlans('', 1, 200); 
    return result && result.items && result.items.length > 0 ? result.items : MOCK_PLAN_DATA;
  } catch (error) {
    console.warn("Error fetching plans:", error);
    return MOCK_PLAN_DATA;
  }
};
