import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import * as db from './tursoService';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

/**
 * ISO Helper: Download file từ API backend
 */
const downloadExcelFile = async (apiUrl: string, fileName: string) => {
    try {
        const authData = localStorage.getItem(AUTH_STORAGE_KEY);
        let token = 'anonymous';
        if (authData) {
            try {
                const user = JSON.parse(authData);
                token = user.id || user.username || 'system';
            } catch (e) {}
        }

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err: any) {
        console.error("[ISO-EXPORT-ERROR]", err);
        alert(`Lỗi khi xuất file: ${err.message}`);
    }
};

/**
 * ISO Helper: Upload file Excel lên API backend để xử lý
 */
const uploadExcelFile = async (apiUrl: string, file: File) => {
    const authData = localStorage.getItem(AUTH_STORAGE_KEY);
    let token = 'anonymous';
    if (authData) {
        try {
            const user = JSON.parse(authData);
            token = user.id || user.username || 'system';
        } catch (e) {}
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Lỗi nhập dữ liệu từ file');
    }

    return await response.json();
};

export const checkApiConnection = async () => ({ ok: await db.testConnection() });
export const fetchRoles = async () => await db.getRoles();
export const saveRole = async (role: Role) => { await db.saveRole(role); return role; };
export const deleteRole = async (id: string) => { await db.deleteRole(id); };

export const fetchPlans = async (search: string = '', page?: number, limit?: number): Promise<PagedResult<PlanItem>> => {
  const result = await db.getPlans({ search, page, limit });
  return { items: result.items, total: result.total, page, limit };
};

// Added importPlans to fix App.tsx error
export const importPlans = async (plans: PlanItem[]) => {
    await db.importPlansBatch(plans);
};

export const exportPlans = async () => {
    await downloadExcelFile('/api/plans/export', `AATN_Plans_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const importPlansFile = async (file: File) => {
    return await uploadExcelFile('/api/plans/import', file);
};

export const fetchInspections = async (filters: any = {}): Promise<PagedResult<Inspection>> => {
  const result = await db.getInspectionsPaginated(filters);
  return { items: result.items, total: result.total, page: filters.page, limit: filters.limit };
};

// Added importInspections to fix App.tsx error
export const importInspections = async (inspections: Inspection[]) => {
    for (const insp of inspections) {
        await db.saveInspection(insp);
    }
};

export const fetchInspectionById = async (id: string) => await db.getInspectionById(id);
export const fetchNcrs = async (params: any = {}) => ({ items: await db.getNcrs(params), total: 0 });
export const fetchNcrById = async (id: string) => await db.getNcrById(id);
export const fetchDefects = async (params: any = {}) => ({ items: await db.getDefects(params), total: 0 });

export const fetchDefectLibrary = async () => await db.getDefectLibrary();
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await db.saveDefectLibraryItem(item);
export const deleteDefectLibraryItem = async (id: string) => { await db.deleteDefectLibraryItem(id); };

export const exportDefectLibrary = async () => {
    await downloadExcelFile('/api/defects/export', `AATN_Defect_Library_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const importDefectLibraryFile = async (file: File) => {
    return await uploadExcelFile('/api/defects/import', file);
};

export const saveInspectionToSheet = async (inspection: Inspection) => { await db.saveInspection(inspection); return { success: true }; };
export const deleteInspectionFromSheet = async (id: string) => { await db.deleteInspection(id); };
export const fetchProjects = async () => await db.getProjects();

// Added fetchProjectByCode to fix App.tsx error
export const fetchProjectByCode = async (code: string) => await db.getProjectByCode(code);

// Added fetchProjectsSummary to fix App.tsx error
export const fetchProjectsSummary = async () => {
    const projects = await db.getProjects();
    return {
        total: projects.length,
        inProgress: projects.filter(p => p.status === 'In Progress').length,
        completed: projects.filter(p => p.status === 'Completed').length
    };
};

export const updateProject = async (project: Project) => { await db.saveProjectMetadata(project); return project; };
export const fetchUsers = async () => await db.getUsers();
export const saveUser = async (user: User) => { await db.saveUser(user); return user; };
export const deleteUser = async (id: string) => { await db.deleteUser(id); };
export const fetchWorkshops = async () => await db.getWorkshops();
export const saveWorkshop = async (ws: Workshop) => { await db.saveWorkshop(ws); return ws; };
export const deleteWorkshop = async (id: string) => { await db.deleteWorkshop(id); };
export const fetchTemplates = async () => await db.getTemplates();
export const saveTemplate = async (m: string, i: CheckItem[]) => { await db.saveTemplate(m, i); };