import { Inspection, PlanItem, User, Workshop, CheckItem, Project } from '../types';
import * as db from './tursoService';

/**
 * SHARED API TYPES
 */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 1. HEALTH & SYSTEM
 */
export const checkApiConnection = async () => {
  const ok = await db.testConnection();
  return { ok };
};

/**
 * 2. PRODUCTION PLANS
 */
export const fetchPlans = async (
  search: string = '',
  page: number = 1,
  limit: number = 50
): Promise<PagedResult<PlanItem>> => {
  const result = await db.getPlans({ search, page, limit });
  return {
    items: result.items,
    total: result.total,
    page,
    limit
  };
};

/**
 * 3. INSPECTION WORKFLOW
 */
export const fetchInspections = async (
  filters: { status?: string; search?: string; page?: number; limit?: number } = {}
): Promise<PagedResult<Inspection>> => {
  const all = await db.getAllInspections(filters);
  // Simple client-side pagination for robustness
  const page = filters.page || 1;
  const limit = filters.limit || 1000;
  const startIndex = (page - 1) * limit;
  const items = all.slice(startIndex, startIndex + limit);
  
  return {
    items,
    total: all.length,
    page,
    limit
  };
};

export const createInspection = async (inspection: Partial<Inspection>) => {
  await db.saveInspection(inspection as Inspection);
  return { success: true, data: inspection };
};

export const updateInspection = async (id: string, inspection: Partial<Inspection>) => {
  await db.saveInspection(inspection as Inspection);
  return { success: true, data: inspection };
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  await db.saveInspection(inspection);
  return { success: true };
};

export const deleteInspectionFromSheet = async (id: string) => {
  await db.deleteInspection(id);
};

// Workflow status changes (Updates directly to DB)
export const submitInspection = async (id: string) => {
    // In a real app, this would trigger notifications. Here we just update status.
    const all = await db.getAllInspections();
    const found = all.find(i => i.id === id);
    if (found) {
        found.status = 'SUBMITTED' as any;
        await db.saveInspection(found);
    }
};

export const approveInspection = async (id: string) => {
    const all = await db.getAllInspections();
    const found = all.find(i => i.id === id);
    if (found) {
        found.status = 'APPROVED' as any;
        await db.saveInspection(found);
    }
};

export const rejectInspection = async (id: string, reason: string) => {
    const all = await db.getAllInspections();
    const found = all.find(i => i.id === id);
    if (found) {
        found.status = 'FLAGGED' as any; // Rejected maps to FLAGGED in this UI
        found.summary = (found.summary || '') + `\n[REJECT REASON]: ${reason}`;
        await db.saveInspection(found);
    }
};

/**
 * 4. PROJECT MANAGEMENT
 */
export const fetchProjects = async () => {
  return await db.getProjects();
};

export const updateProject = async (project: Project) => {
  await db.saveProjectMetadata(project);
  return project;
};

/**
 * 5. USER & ACCESS CONTROL
 */
export const fetchUsers = async () => {
  return await db.getUsers();
};

export const saveUser = async (user: User) => {
  await db.saveUser(user);
  return user;
};

export const deleteUser = async (id: string) => {
  await db.deleteUser(id);
};

export const importUsers = async (users: User[]) => {
  await db.importUsers(users);
};

/**
 * 6. WORKSHOP MANAGEMENT
 */
export const fetchWorkshops = async () => {
  return await db.getWorkshops();
};

export const saveWorkshop = async (workshop: Workshop) => {
  await db.saveWorkshop(workshop);
  return workshop;
};

export const deleteWorkshop = async (id: string) => {
  await db.deleteWorkshop(id);
};

/**
 * 7. TEMPLATE MANAGEMENT
 */
export const fetchTemplates = async () => {
  return await db.getTemplates();
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
  await db.saveTemplate(moduleId, items);
};

/**
 * 8. BULK IMPORT
 */
export const importPlans = async (plans: PlanItem[]) => {
  await db.importPlansBatch(plans);
};

export const importInspections = async (inspections: Inspection[]) => {
  for (const i of inspections) {
      await db.saveInspection(i);
  }
};
