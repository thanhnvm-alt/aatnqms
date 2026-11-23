import { IPOItem } from '../types';
import { MOCK_PLAN_DATA } from '../constants';
import { fetchPlans } from './apiService';

export const fetchPlansFromSheet = async (): Promise<IPOItem[]> => {
  try {
    const result = await fetchPlans();
    const list = Array.isArray(result) ? result : (result?.items || []);
    return list.length > 0 ? list : MOCK_PLAN_DATA;
  } catch (error) {
    console.warn("Error fetching plans:", error);
    return MOCK_PLAN_DATA;
  }
};
