
import { Inspection, PlanItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin, IPO } from '../types';
import * as db from './tursoService';

// Helper to get Auth Headers
const getAuthHeaders = () => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const stored = localStorage.getItem('aatn_auth_storage');
    if (stored) {
        try {
            const u = JSON.parse(stored);
            if (u.id) headers['Authorization'] = `Bearer ${u.id}`;
            if (u.role) headers['x-user-role'] = u.role;
            if (u.name) headers['x-user-name'] = encodeURIComponent(u.name); // Encode to handle special chars
        } catch (e) {}
    }
    return headers;
};

// ... (existing imports and exports remain the same until checkApiConnection)

export const fetchFloorPlans = async (projectId: string) => await db.getFloorPlans(projectId);
export const saveFloorPlan = async (fp: FloorPlan) => await db.saveFloorPlan(fp);
export const deleteFloorPlan = async (id: string) => await db.deleteFloorPlan(id);
export const fetchLayoutPins = async (fpId: string) => await db.getLayoutPins(fpId);
export const saveLayoutPin = async (pin: LayoutPin) => await db.saveLayoutPin(pin);

export const uploadFileToStorage = async (file: File | string, fileName: string): Promise<string> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(typeof file === 'string' ? file : URL.createObjectURL(file));
        }, 1000);
    });
};

export const fetchSuppliers = async () => await db.getSuppliers();
export const saveSupplier = async (s: Supplier) => await db.saveSupplier(s);
export const deleteSupplier = async (id: string) => await db.deleteSupplier(id);
export const fetchSupplierStats = async (name: string) => await db.getSupplierStats(name);
export const fetchSupplierInspections = async (name: string) => await db.getSupplierInspections(name);

export const uploadQMSImage = async (file: File | string, context: { entityId: string, type: any, role: any }): Promise<string> => {
    return `img_ref_${Date.now()}`;
};

export const fetchIpos = async (searchTerm: string = ''): Promise<IPO[]> => {
    try {
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        
        const response = await fetch(`/api/ipos?${params.toString()}`, {
            headers: getAuthHeaders()
        });

        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            console.warn("Fetch IPOs failed or returned non-JSON:", response.statusText);
            return [];
        }

        const json = await response.json();
        return json.data?.items || [];
    } catch (error) {
        console.error("API Error fetchIpos:", error);
        return [];
    }
};

export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20) => {
  return await db.getPlansPaginated(searchTerm, page, limit);
};

export const updatePlan = async (id: number | string, plan: Partial<PlanItem>) => {
    return await db.updatePlan(id, plan);
};

export const fetchPlansByProject = async (maCt: string, limit?: number) => {
  return await db.getPlansByProject(maCt, limit);
};

export const fetchInspections = async (filters: any = {}) => {
  return await db.getInspectionsList(filters);
};

export const fetchInspectionById = async (id: string) => {
  return await db.getInspectionById(id);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  await db.saveInspection(inspection);
  return { success: true };
};

export const deleteInspectionFromSheet = async (id: string) => {
    return await db.deleteInspection(id);
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    return await db.saveNcrMapped(inspection_id, ncr, createdBy);
};

export const fetchNcrs = async (filters: any = {}) => {
    return await db.getNcrs(filters);
};

export const fetchNcrById = async (id: string) => {
    return await db.getNcrById(id);
};

export const fetchDefects = async (filters: any = {}) => {
    const ncrs = await db.getNcrs(filters);
    return { items: ncrs.items as any[], total: ncrs.total };
};

export const fetchUsers = async () => await db.getUsers();
export const saveUser = async (user: User) => await db.saveUser(user);
export const deleteUser = async (id: string) => await db.deleteUser(id);

export const verifyUserCredentials = async (username: string, password: string): Promise<User | null> => {
    try {
        const user = await db.getUserByUsername(username);
        if (user && user.password === password) {
            return user;
        }
        return null;
    } catch (e) {
        console.error("ISO-AUTH: Verification failed", e);
        throw e;
    }
};

export const fetchWorkshops = async () => await db.getWorkshops();
export const saveWorkshop = async (ws: Workshop) => await db.saveWorkshop(ws);
export const deleteWorkshop = async (id: string) => await db.deleteWorkshop(id);

export const fetchTemplates = async () => await db.getTemplates();
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => await db.saveTemplate(moduleId, items);

export const fetchProjects = async (search: string = '') => await db.getProjectsPaginated(search, 10);
export const fetchProjectByCode = async (code: string) => await db.getProjectByCode(code);
export const updateProject = async (proj: Project) => await db.updateProject(proj);

export const fetchNotifications = async (userId: string) => await db.getNotifications(userId);
export const markNotificationAsRead = async (id: string) => await db.markNotificationRead(id);
export const markAllNotificationsAsRead = async (userId: string) => await db.markAllNotificationsRead(userId);

export const fetchRoles = async () => await db.getRoles();
export const saveRole = async (role: Role) => await db.saveRole(role);
export const deleteRole = async (id: string) => await db.deleteRole(id);

export const fetchDefectLibrary = async () => await db.getDefectLibrary();
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await db.saveDefectLibraryItem(item);
export const deleteDefectLibraryItem = async (id: string) => await db.deleteDefectLibraryItem(id);

export const exportDefectLibrary = async () => {
    const response = await fetch('/api/defects/export');
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AATN_Defect_Library_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const importDefectLibraryFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/defects/import', {
        method: 'POST',
        body: formData
    });
    if (!response.ok) throw new Error('Import failed');
    return await response.json();
};

// CHECK API CONNECTION - STRICT MODE
export const checkApiConnection = async () => {
    try {
        const res = await fetch('/api/health');
        
        if (!res.ok) {
            console.error("API Health Check Failed:", res.status, res.statusText);
            return { ok: false, error: `Server Error: ${res.status} ${res.statusText}` };
        }

        const data = await res.json().catch(() => null);
        
        if (!data || data.status !== 'direct-connection') {
             // If data is missing or status is not direct, consider it a failure for ISO compliance
             return { ok: false, error: "Database not connected directly", data };
        }
        
        return { ok: true, data };
    } catch (e: any) {
        console.error("Connection Error:", e);
        return { ok: false, error: "Network Error or API Unreachable" };
    }
};

export const createNotification = async (params: { userId: string, type: Notification['type'], title: string, message: string, link?: { view: ViewState, id: string } }) => {
    await db.addNotification(params.userId, params.type, params.title, params.message, params.link);
    return { success: true };
};
