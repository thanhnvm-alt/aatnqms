
import { Inspection, PlanItem, User, Workshop, CheckItem, Project } from '../types';
import * as db from './tursoService';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

export const checkApiConnection = async () => {
  const ok = await db.testConnection();
  return { ok };
};

export const fetchPlans = async (search: string = '', page?: number, limit?: number): Promise<PagedResult<PlanItem>> => {
  const result = await db.getPlans({ search, page, limit });
  return { items: result.items, total: result.total, page, limit };
};

/**
 * OPTIMIZED: Fetch inspections with server-side pagination and filters
 */
export const fetchInspections = async (filters: { 
    status?: string; 
    search?: string; 
    type?: string; 
    page?: number; 
    limit?: number 
} = {}): Promise<PagedResult<Inspection>> => {
  const result = await db.getInspectionsPaginated({
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      status: filters.status,
      type: filters.type
  });

  return { 
      items: result.items, 
      total: result.total, 
      page: filters.page, 
      limit: filters.limit 
  };
};

/**
 * NEW: Fetch full inspection data including large checklist array
 */
export const fetchInspectionById = async (id: string): Promise<Inspection | null> => {
    return await db.getInspectionById(id);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  await db.saveInspection(inspection);
  return { success: true };
};

export const deleteInspectionFromSheet = async (id: string) => {
  await db.deleteInspection(id);
};

export const fetchProjects = async (): Promise<Project[]> => {
  const plansData = await db.getPlans({ search: '' }); // Fetch all plans for project grouping
  const dbProjects = await db.getProjects();
  
  const distinctPlanProjects = new Map<string, PlanItem>();
  plansData.items.forEach(p => {
    if (!distinctPlanProjects.has(p.ma_ct)) {
      distinctPlanProjects.set(p.ma_ct, p);
    }
  });

  const combined: Project[] = Array.from(distinctPlanProjects.values()).map(p => {
    const existing = dbProjects.find(dp => dp.ma_ct === p.ma_ct);
    if (existing) return existing;
    return {
      id: `proj_${p.ma_ct}`,
      code: p.ma_ct,
      name: p.ten_ct,
      ma_ct: p.ma_ct,
      ten_ct: p.ten_ct,
      status: 'In Progress',
      startDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      endDate: 'TBD',
      pm: 'Unassigned',
      pc: '',
      qa: '',
      thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600',
      progress: 0,
      description: '',
      location: '',
      images: []
    };
  });

  return combined;
};

export const updateProject = async (project: Project) => {
  await db.saveProjectMetadata(project);
  return project;
};

export const fetchUsers = async () => await db.getUsers();
export const saveUser = async (user: User) => { await db.saveUser(user); return user; };
export const deleteUser = async (id: string) => { await db.deleteUser(id); };
export const importUsers = async (users: User[]) => { await db.importUsers(users); };

export const importInspections = async (inspections: Inspection[]) => {
  for (const inspection of inspections) {
    await db.saveInspection(inspection);
  }
};

export const fetchWorkshops = async () => await db.getWorkshops();
export const saveWorkshop = async (workshop: Workshop) => { await db.saveWorkshop(workshop); return workshop; };
export const deleteWorkshop = async (id: string) => { await db.deleteWorkshop(id); };

export const fetchTemplates = async () => await db.getTemplates();
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => { await db.saveTemplate(moduleId, items); };

export const importPlans = async (plans: PlanItem[]) => { await db.importPlansBatch(plans); };
