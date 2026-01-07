import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import * as db from './tursoService';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

// Key đồng bộ với App.tsx
const AUTH_STORAGE_KEY = 'aatn_auth_storage';

/**
 * Audit Helper: Tải file nhị phân từ API
 * Đảm bảo file nhận được là .xlsx hợp lệ trước khi cho phép lưu
 */
const downloadBlob = async (apiUrl: string, fileName: string) => {
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
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server rejected request: ${response.status} - ${errorText}`);
        }

        const blob = await response.blob();
        if (blob.size < 100) throw new Error("Dữ liệu nhận được quá nhỏ, có thể file bị hỏng (ISO Integrity Error).");

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
        }, 1000);
    } catch (err: any) {
        console.error("[AUDIT-LOG] Download Error:", err);
        alert(`Lỗi hệ thống khi trích xuất hồ sơ: ${err.message}`);
    }
};

const uploadExcel = async (apiUrl: string, file: File) => {
    const authData = localStorage.getItem(AUTH_STORAGE_KEY);
    let token = 'system';
    if (authData) {
        try { token = JSON.parse(authData).id; } catch (e) {}
    }

    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
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
    // Chuyển sang đường dẫn phẳng để đảm bảo Vercel routing hoạt động ổn định
    await downloadBlob('/api/plans-export', `AATN_Kế_hoạch_Sản_xuất_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const importPlansExcel = async (file: File) => {
    return await uploadExcel('/api/plans-import', file);
};

export const fetchInspections = async (filters: any = {}): Promise<PagedResult<Inspection>> => {
  const result = await db.getInspectionsPaginated(filters);
  return { items: result.items, total: result.total, page: filters.page, limit: filters.limit };
};

export const fetchInspectionById = async (id: string) => await db.getInspectionById(id);
export const fetchNcrs = async (params: any = {}) => ({ items: await db.getNcrs(params), total: 0 });
export const fetchNcrById = async (id: string) => await db.getNcrById(id);
export const fetchDefects = async (params: any = {}) => ({ items: await db.getDefects(params), total: 0 });

export const fetchDefectLibrary = async () => await db.getDefectLibrary();
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await db.saveDefectLibraryItem(item);
export const deleteDefectLibraryItem = async (id: string) => { await db.deleteDefectLibraryItem(id); };

export const exportDefectLibrary = async () => {
    await downloadBlob('/api/defects-export', `AATN_Thư_viện_Lỗi_Kỹ_thuật_${new Date().toISOString().split('T')[0]}.xlsx`);
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