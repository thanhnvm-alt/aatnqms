
import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import * as db from './tursoService';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

// Helper: Tải file binary từ API
const downloadBlob = async (apiUrl: string, fileName: string) => {
    const response = await fetch(apiUrl);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lỗi server (${response.status}): ${errorText}`);
    }
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('spreadsheetml.sheet')) {
        throw new Error(`Dữ liệu không đúng định dạng Excel (.xlsx). Nhận được: ${contentType}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 150);
};

// Helper: Upload file Excel lên API
const uploadExcel = async (apiUrl: string, file: File) => {
    const response = await fetch(apiUrl, {
        method: 'POST',
        body: file // Gửi trực tiếp binary body cho API Route
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Lỗi xử lý file Excel tại server.');
    return data;
};

export const checkApiConnection = async () => ({ ok: await db.testConnection() });
export const fetchRoles = async () => await db.getRoles();
export const saveRole = async (role: Role) => { await db.saveRole(role); return role; };
export const deleteRole = async (id: string) => { await db.deleteRole(id); };

export const fetchPlans = async (search: string = '', page?: number, limit?: number): Promise<PagedResult<PlanItem>> => {
  const result = await db.getPlans({ search, page, limit });
  return { items: result.items, total: result.total, page, limit };
};

export const exportPlans = async () => {
    await downloadBlob('/api/plans-export', `AATN_Plans_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const importPlansExcel = async (file: File) => {
    return await uploadExcel('/api/plans-import', file);
};

export const fetchInspections = async (filters: any = {}): Promise<PagedResult<Inspection>> => {
  const result = await db.getInspectionsPaginated(filters);
  return { items: result.items, total: result.total, page: filters.page, limit: filters.limit };
};

export const fetchInspectionById = async (id: string) => await db.getInspectionById(id);

export const fetchNcrs = async (params: any = {}): Promise<PagedResult<any>> => {
    const result = await db.getNcrs(params);
    return { items: result, total: result.length };
};

export const fetchNcrById = async (id: string) => await db.getNcrById(id);
export const fetchDefects = async (params: any = {}) => ({ items: await db.getDefects(params), total: 0 });

// Defect Library
export const fetchDefectLibrary = async () => await db.getDefectLibrary();
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await db.saveDefectLibraryItem(item);
export const deleteDefectLibraryItem = async (id: string) => await db.deleteDefectLibraryItem(id);

export const exportDefectLibrary = async () => {
    await downloadBlob('/api/defects-export', `AATN_Defect_Library_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const importDefectLibrary = async (file: File) => {
    return await uploadExcel('/api/defects-import', file);
};

export const saveInspectionToSheet = async (inspection: Inspection) => { await db.saveInspection(inspection); return { success: true }; };
export const deleteInspectionFromSheet = async (id: string) => { await db.deleteInspection(id); };
export const fetchProjectByCode = async (maCt: string) => await db.getProjectByCode(maCt);
export const fetchProjects = async () => await db.getProjects();
export const updateProject = async (project: Project) => { await db.saveProjectMetadata(project); return project; };
export const fetchUsers = async () => await db.getUsers();
export const saveUser = async (user: User) => { await db.saveUser(user); return user; };
export const deleteUser = async (id: string) => { await db.deleteUser(id); };
export const importUsers = async (users: User[]) => { await db.importUsers(users); };
export const importInspections = async (inspections: Inspection[]) => { for (const i of inspections) await db.saveInspection(i); };
export const fetchWorkshops = async () => await db.getWorkshops();
export const saveWorkshop = async (ws: Workshop) => { await db.saveWorkshop(ws); return ws; };
export const deleteWorkshop = async (id: string) => { await db.deleteWorkshop(id); };
export const fetchTemplates = async () => await db.getTemplates();
export const saveTemplate = async (m: string, i: CheckItem[]) => { await db.saveTemplate(m, i); };
export const importPlans = async (plans: PlanItem[]) => { await db.importPlansBatch(plans); };
