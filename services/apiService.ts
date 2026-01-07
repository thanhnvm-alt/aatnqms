import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
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

export const fetchRoles = async () => await db.getRoles();
export const saveRole = async (role: Role) => { await db.saveRole(role); return role; };
export const deleteRole = async (id: string) => { await db.deleteRole(id); };

export const fetchPlans = async (search: string = '', page?: number, limit?: number): Promise<PagedResult<PlanItem>> => {
  const result = await db.getPlans({ search, page, limit });
  return { items: result.items, total: result.total, page, limit };
};

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

export const fetchInspectionById = async (id: string): Promise<Inspection | null> => {
    return await db.getInspectionById(id);
};

export const fetchNcrs = async (params: { inspection_id?: string, status?: string, page?: number, limit?: number } = {}): Promise<PagedResult<any>> => {
    const result = await db.getNcrs(params);
    return {
        items: result,
        total: result.length,
        page: params.page,
        limit: params.limit
    };
};

export const fetchNcrById = async (id: string): Promise<NCR | null> => {
    return await db.getNcrById(id);
};

export const fetchDefects = async (params: { search?: string, status?: string } = {}): Promise<PagedResult<Defect>> => {
    const result = await db.getDefects(params);
    return {
        items: result,
        total: result.length
    };
};

// Defect Library APIs
export const fetchDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    return await db.getDefectLibrary();
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await db.saveDefectLibraryItem(item);
};

export const deleteDefectLibraryItem = async (id: string) => {
    await db.deleteDefectLibraryItem(id);
};

/**
 * Import Defect Library from Excel file.
 * Logic processing is server-side via Next.js API.
 */
export const importDefectLibrary = async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/defects/import', {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
    }
    
    return await response.json();
};

/**
 * Export Defect Library to Excel.
 * Backend creates the file and frontend triggers download.
 */
export const exportDefectLibrary = async (filters: any = {}): Promise<void> => {
    const query = new URLSearchParams(filters).toString();
    const response = await fetch(`/api/defects/export?${query}`);
    
    if (!response.ok) throw new Error('Export failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Defect_Library_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  await db.saveInspection(inspection);
  return { success: true };
};

export const deleteInspectionFromSheet = async (id: string) => {
  await db.deleteInspection(id);
};

export const fetchProjectByCode = async (maCt: string): Promise<Project | null> => {
    return await db.getProjectByCode(maCt);
};

export const fetchProjectsSummary = async (search: string = ""): Promise<Project[]> => {
    const all = await db.getProjects();
    if (!search) return all;
    const term = search.toLowerCase();
    return all.filter(p => p.ma_ct.toLowerCase().includes(term) || p.name.toLowerCase().includes(term));
};

export const fetchProjects = async (): Promise<Project[]> => {
  return await db.getProjects();
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
