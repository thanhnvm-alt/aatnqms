
import { Inspection, PlanItem, User, Workshop, CheckItem, Project } from '../types';
import { MOCK_INSPECTIONS, MOCK_USERS, MOCK_WORKSHOPS, MOCK_PLAN_DATA, INITIAL_CHECKLIST_TEMPLATE, MOCK_PROJECTS } from '../constants';
import * as Turso from './tursoService';
import { isTursoConfigured } from './tursoConfig';

// Define local interfaces
export interface ConnectionStatus {
  ok: boolean;
  error?: 'permission-denied' | 'network-error' | 'unavailable' | 'unknown';
  message?: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  lastVisible?: any; 
  hasMore?: boolean;
}

// Local Storage Keys
const STORAGE_KEYS = {
  INSPECTIONS: 'aatn_inspections',
  USERS: 'aatn_users',
  WORKSHOPS: 'aatn_workshops',
  TEMPLATES: 'aatn_templates'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const checkApiConnection = async (): Promise<ConnectionStatus> => {
    if (!isTursoConfigured) {
        return { ok: false, error: 'unavailable', message: 'Turso URL not set' };
    }
    const isConnected = await Turso.testConnection();
    if (isConnected) {
        return { ok: true };
    }
    return { ok: false, error: 'network-error', message: 'Could not connect to Turso database' };
};

// --- PLANS ---

export const fetchPlans = async (
  searchTerm: string = '', 
  page: number = 1, 
  limit: number = 50
): Promise<PagedResult<PlanItem>> => {
    if (isTursoConfigured) {
        try {
            const { items, total } = await Turso.getPlans({ search: searchTerm, page, limit });
            return { items, total };
        } catch (e: any) {
            console.warn("API Warning: Failed to fetch plans from Turso, falling back to mock data.", e.message);
        }
    }
    // Fallback to Mock Data
    const start = (page - 1) * limit;
    const filtered = searchTerm 
        ? MOCK_PLAN_DATA.filter(p => JSON.stringify(p).toLowerCase().includes(searchTerm.toLowerCase()))
        : MOCK_PLAN_DATA;
    
    return { 
        items: filtered.slice(start, start + limit), 
        total: filtered.length 
    };
};

export const fetchAllPlans = async (): Promise<PlanItem[]> => {
    // Deprecated in favor of paginated fetchPlans, keeping for compatibility if needed
    const res = await fetchPlans('', 1, 1000);
    return res.items;
};

/**
 * Tìm kiếm kế hoạch thông qua API Server-side
 * @param queryTerm Mã công trình hoặc Mã nhà máy
 */
export const searchPlans = async (queryTerm: string, pageSize: number = 50, lastDoc: any = null): Promise<PagedResult<PlanItem>> => {
    try {
        // Only try server-side fetch if NOT in a pure client environment that lacks the API route
        // For Vite SPA, this fetch likely fails unless proxied or running a backend
        // We will try fetch first, if it fails (404/Network Error), we fallback to Turso direct call.
        
        let response = await fetch(`/api/plans?filterType=ma_nm&filterValue=${encodeURIComponent(queryTerm)}&limit=${pageSize}`);
        
        // Handle case where fetch returns HTML (Vite 404 fallback) or fails
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
             throw new Error("API Route not available (likely Client-Side Only)");
        }

        let json = await response.json();

        // Nếu không có kết quả hoặc lỗi, thử tìm theo Mã công trình (ma_ct)
        if (!response.ok || !json.data || json.data.length === 0) {
             response = await fetch(`/api/plans?filterType=ma_ct&filterValue=${encodeURIComponent(queryTerm)}&limit=${pageSize}`);
             if (response.ok) json = await response.json();
        }

        if (response.ok && json.data) {
            // FIX MAPPING: Prioritize Aliased fields returned from SQL, but check DB columns too
            const items = json.data.map((row: any) => ({
                ma_nha_may: String(row.ma_nha_may || row.ma_nm_id || ''),
                headcode: String(row.headcode || ''),
                ma_ct: String(row.ma_ct || ''),
                ten_ct: String(row.ten_ct || ''),
                ten_hang_muc: String(row.ten_hang_muc || row.ten_sp || ''),
                dvt: String(row.dvt || row.don_vi || 'PCS'),
                so_luong_ipo: Number(row.so_luong_ipo ?? row.sl_dh ?? 0),
                stt: Number(row.stt || 0),
                status: (row.status as any) || 'PENDING',
                assignee: String(row.assignee || 'QC'),
                plannedDate: row.plannedDate ? String(row.plannedDate) : (row.ngay_kh ? String(row.ngay_kh) : new Date().toISOString().split('T')[0]),
                pthsp: String(row.pthsp || '')
            }));
            return { items, total: items.length, lastVisible: null, hasMore: false };
        }
    } catch (e) {
        console.warn("Server-side search failed, trying direct Turso/Mock:", e);
        // Fallback to direct Turso call via existing fetchPlans
        return await fetchPlans(queryTerm, 1, pageSize);
    }
    return { items: [], total: 0, lastVisible: null, hasMore: false };
};

export const importPlans = async (plans: PlanItem[]) => {
    if (isTursoConfigured) {
        try {
            await Turso.importPlans(plans);
            return;
        } catch (e: any) {
            console.error("Failed to import plans to Turso", e);
            throw new Error("Lỗi khi nhập dữ liệu vào Database: " + e.message);
        }
    } else {
        console.warn("Import Plans not supported in mock mode.");
        return Promise.resolve();
    }
};

// --- INSPECTIONS ---

export const fetchInspections = async (): Promise<Inspection[]> => {
    if (isTursoConfigured) {
        try {
            const data = await Turso.getAllInspections();
            if (data.length > 0) return data.filter(i => i !== null && i !== undefined);
        } catch (e) {
            console.warn("API: Fallback to local storage for inspections");
        }
    }
    await delay(300);
    const stored = localStorage.getItem(STORAGE_KEYS.INSPECTIONS);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed.filter(i => i !== null) : [];
        } catch(e) {
            return MOCK_INSPECTIONS;
        }
    }
    return MOCK_INSPECTIONS;
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
    try {
        const current = await fetchInspections();
        const index = current.findIndex(i => i.id === inspection.id);
        let updated = [];
        if (index >= 0) updated = current.map(i => i.id === inspection.id ? inspection : i);
        else updated = [inspection, ...current];
        localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));

        if (isTursoConfigured) {
            await Turso.saveInspection(inspection);
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const deleteInspectionFromSheet = async (id: string) => {
    try {
        const current = await fetchInspections();
        const updated = current.filter(i => i.id !== id);
        localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));

        if (isTursoConfigured) {
            await Turso.deleteInspection(id);
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

export const importInspections = async (inspections: Inspection[]) => {
    try {
        const current = await fetchInspections();
        const combined = [...current];
        const promises = inspections.map(async (imp) => {
            const idx = combined.findIndex(c => c.id === imp.id);
            if (idx >= 0) combined[idx] = imp;
            else combined.push(imp);
            if(isTursoConfigured) await Turso.saveInspection(imp);
        });
        await Promise.all(promises);
        localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(combined));
        return { success: true };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
};

// --- PROJECTS ---

export const fetchProjects = async (): Promise<Project[]> => {
    if (isTursoConfigured) {
        try {
            return await Turso.getProjects();
        } catch(e) {
            console.error("Failed to fetch projects from DB", e);
        }
    }
    // Return empty if offline, removed Mock Data to force real data usage
    return []; 
};

export const updateProject = async (project: Project): Promise<void> => {
    if (isTursoConfigured) {
        try {
            await Turso.saveProjectMetadata(project);
        } catch(e) {
            console.error("Failed to update project metadata", e);
            throw new Error("Không thể lưu thông tin dự án.");
        }
    } else {
        console.warn("Update project not supported in offline/mock mode.");
    }
};

// --- USERS ---

export const fetchUsers = async (): Promise<User[]> => {
    if (isTursoConfigured) {
        try {
            const users = await Turso.getUsers();
            if (users.length > 0) return users.filter(u => u !== null);
        } catch(e) {}
    }
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed.filter(u => u !== null) : MOCK_USERS;
        } catch (e) {
            return MOCK_USERS;
        }
    }
    return MOCK_USERS;
};

export const saveUser = async (user: User) => {
    const users = await fetchUsers();
    const idx = users.findIndex(u => u.id === user.id);
    let updated = [];
    if (idx >= 0) updated = users.map(u => u.id === user.id ? user : u);
    else updated = [...users, user];
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
    if(isTursoConfigured) await Turso.saveUser(user);
};

export const importUsers = async (newUsers: User[]) => {
    const users = await fetchUsers();
    const updated = [...users, ...newUsers];
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
    if(isTursoConfigured) {
        for(const u of newUsers) await Turso.saveUser(u);
    }
};

export const deleteUser = async (id: string) => {
    const users = await fetchUsers();
    const updated = users.filter(u => u.id !== id);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
    if(isTursoConfigured) await Turso.deleteUser(id);
};

// --- WORKSHOPS ---

export const fetchWorkshops = async (): Promise<Workshop[]> => {
    if (isTursoConfigured) {
        try {
            const ws = await Turso.getWorkshops();
            if (ws.length > 0) return ws.filter(w => w !== null);
        } catch(e) {}
    }
    const stored = localStorage.getItem(STORAGE_KEYS.WORKSHOPS);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed.filter(w => w !== null) : MOCK_WORKSHOPS;
        } catch (e) {
            return MOCK_WORKSHOPS;
        }
    }
    return MOCK_WORKSHOPS;
};

export const saveWorkshop = async (workshop: Workshop) => {
    const workshops = await fetchWorkshops();
    const idx = workshops.findIndex(w => w.id === workshop.id);
    let updated = [];
    if (idx >= 0) updated = workshops.map(w => w.id === workshop.id ? workshop : w);
    else updated = [...workshops, workshop];
    localStorage.setItem(STORAGE_KEYS.WORKSHOPS, JSON.stringify(updated));
    if(isTursoConfigured) await Turso.saveWorkshop(workshop);
};

export const deleteWorkshop = async (id: string) => {
    const workshops = await fetchWorkshops();
    const updated = workshops.filter(w => w.id !== id);
    localStorage.setItem(STORAGE_KEYS.WORKSHOPS, JSON.stringify(updated));
    if(isTursoConfigured) await Turso.deleteWorkshop(id);
};

// --- TEMPLATES ---

export const fetchTemplates = async (): Promise<Record<string, CheckItem[]>> => {
    const stored = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    if (stored) return JSON.parse(stored);
    return { 'SITE': INITIAL_CHECKLIST_TEMPLATE };
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    const templates = await fetchTemplates();
    templates[moduleId] = items;
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
};
