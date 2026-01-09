import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import ExcelJS from 'exceljs';

const API_BASE = '/api';
const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const getAuthHeaders = () => {
  // Check both storages (localStorage for Remember Me, sessionStorage for temporary)
  const stored = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) return {};
  try {
      const { access_token } = JSON.parse(stored);
      return { 
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
      };
  } catch(e) {
      return { 'Content-Type': 'application/json' };
  }
};

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const headers = { ...getAuthHeaders(), ...options.headers };
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: headers as any });
    if (!res.ok) {
        if (res.status === 401) {
            console.error("Unauthorized API call - Token invalid or expired");
            // Optional: Redirect to login or dispatch event
        }
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return json.data || json;
};

// LOGIN
export const login = async (username: string, password: string) => {
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        // Handle non-200 responses safely
        if (!res.ok) {
            let errorMsg = `Server Error (${res.status})`;
            try {
                const errorData = await res.json();
                errorMsg = errorData.message || errorData.error || errorMsg;
            } catch (e) {
                // Response was not JSON (e.g. 404 HTML page or 500 server crash)
                console.warn("Login failed with non-JSON response", res.status);
            }
            throw new Error(errorMsg);
        }

        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        
        // Return data to component/app to handle storage (Remember Me logic)
        return {
            access_token: json.data.access_token,
            user: json.data.user
        };
    } catch (error: any) {
        throw error;
    }
};

export const checkApiConnection = async () => {
    try {
        await apiFetch('/health');
        return { ok: true };
    } catch(e) {
        return { ok: false };
    }
};

// PLANS
export const fetchPlans = async (search: string = '', page: number = 1, limit: number = 50) => {
    const query = new URLSearchParams({ search, page: page.toString(), limit: limit.toString() });
    return await apiFetch(`/plans?${query}`);
};

export const importPlans = async (plans: PlanItem[]) => {
    // Placeholder: In real app, create POST /api/plans/import
    // console.log("Import plans API called", plans.length);
};

// INSPECTIONS
export const fetchInspections = async (filters: any = {}) => {
    const query = new URLSearchParams(filters);
    return await apiFetch(`/inspections?${query}`);
};

export const fetchInspectionById = async (id: string) => {
    return await apiFetch(`/inspections/${id}`);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
    return await apiFetch('/inspections', {
        method: 'POST',
        body: JSON.stringify({ id: inspection.id, data: inspection })
    });
};

export const deleteInspectionFromSheet = async (id: string) => {
    return await apiFetch(`/inspections/${id}`, { method: 'DELETE' });
};

export const importInspections = async (inspections: Inspection[]) => {
    for (const insp of inspections) {
        await saveInspectionToSheet(insp);
    }
};

// PROJECTS
export const fetchProjects = async () => await apiFetch('/projects');
export const fetchProjectByCode = async (code: string) => {
    try { return await apiFetch(`/projects/${code}`); } catch(e) { return null; }
};
export const updateProject = async (project: Project) => {
    return await apiFetch(`/projects/${project.ma_ct}`, {
        method: 'PUT',
        body: JSON.stringify(project)
    });
};
export const fetchProjectsSummary = async () => fetchProjects();

// USERS
export const fetchUsers = async () => await apiFetch('/users');
export const saveUser = async (user: User) => await apiFetch('/users', { method: 'POST', body: JSON.stringify(user) });
export const deleteUser = async (id: string) => await apiFetch(`/users/${id}`, { method: 'DELETE' });
export const importUsers = async (users: User[]) => await apiFetch('/users?action=import', { method: 'POST', body: JSON.stringify(users) });

// WORKSHOPS
export const fetchWorkshops = async () => await apiFetch('/workshops');
export const saveWorkshop = async (ws: Workshop) => await apiFetch('/workshops', { method: 'POST', body: JSON.stringify(ws) });
export const deleteWorkshop = async (id: string) => await apiFetch(`/workshops/${id}`, { method: 'DELETE' });

// TEMPLATES
export const fetchTemplates = async () => await apiFetch('/templates');
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => await apiFetch('/templates', { method: 'POST', body: JSON.stringify({ moduleId, items }) });

// NCRS & DEFECTS
export const fetchNcrs = async (params: any = {}) => await apiFetch(`/ncrs?${new URLSearchParams(params)}`);
export const fetchNcrById = async (id: string) => await apiFetch(`/ncrs/${id}`);
export const fetchDefects = async (params: any = {}) => await apiFetch(`/defects?${new URLSearchParams(params)}`);
export const saveNcr = async (ncr: NCR) => await apiFetch('/ncrs', { method: 'POST', body: JSON.stringify(ncr) });

export const fetchDefectLibrary = async () => await apiFetch('/defects/library');
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await apiFetch('/defects/library', { method: 'POST', body: JSON.stringify(item) });
export const deleteDefectLibraryItem = async (id: string) => await apiFetch(`/defects/library/${id}`, { method: 'DELETE' });

export const exportDefectLibrary = async () => {
    const res = await fetch(`${API_BASE}/defects/export`, { headers: getAuthHeaders() as any });
    if(!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'DefectLibrary.xlsx';
    document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url);
};

export const importDefectLibraryFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    // Note: FormData requires omitting Content-Type header to let browser set boundary
    const headers = getAuthHeaders();
    delete (headers as any)['Content-Type'];
    
    const res = await fetch(`${API_BASE}/defects/import`, {
        method: 'POST',
        headers: headers as any,
        body: formData
    });
    if (!res.ok) throw new Error("Import failed");
    return await res.json();
};

// ROLES
export const fetchRoles = async () => await apiFetch('/roles');
export const saveRole = async (role: Role) => await apiFetch('/roles', { method: 'POST', body: JSON.stringify(role) });
export const deleteRole = async (id: string) => await apiFetch(`/roles/${id}`, { method: 'DELETE' });

// EXCEL HELPERS (Client-side generation for Export Plans)
const saveExcelLocally = async (workbook: ExcelJS.Workbook, fileName: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
};

export const exportPlans = async () => {
    const result = await fetchPlans('', 1, 1000);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Kế hoạch sản xuất');
    worksheet.columns = [
        { header: 'Mã Nhà Máy', key: 'ma_nha_may', width: 20 },
        { header: 'Headcode', key: 'headcode', width: 15 },
        { header: 'Mã Công Trình', key: 'ma_ct', width: 15 },
        { header: 'Tên Công Trình', key: 'ten_ct', width: 30 },
        { header: 'Tên Sản Phẩm', key: 'ten_hang_muc', width: 30 },
        { header: 'Số Lượng IPO', key: 'so_luong_ipo', width: 15 },
        { header: 'ĐVT', key: 'dvt', width: 10 },
        { header: 'Ngày Kế Hoạch', key: 'plannedDate', width: 15 }
    ];
    // @ts-ignore
    result.items.forEach((item: any) => worksheet.addRow(item));
    await saveExcelLocally(workbook, `AATN_Plans_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const importPlansFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error("File Excel không có dữ liệu");
    const plans: PlanItem[] = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const plan: PlanItem = {
            ma_nha_may: row.getCell(1).value?.toString() || '',
            headcode: row.getCell(2).value?.toString() || '',
            ma_ct: row.getCell(3).value?.toString() || '',
            ten_ct: row.getCell(4).value?.toString() || '',
            ten_hang_muc: row.getCell(5).value?.toString() || '',
            so_luong_ipo: Number(row.getCell(6).value) || 0,
            dvt: row.getCell(7).value?.toString() || 'PCS',
            plannedDate: row.getCell(8).value?.toString(),
            status: 'PENDING'
        };
        if(plan.ma_nha_may || plan.headcode) plans.push(plan);
    });
    return plans;
};