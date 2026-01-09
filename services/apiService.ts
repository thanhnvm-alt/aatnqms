
import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import ExcelJS from 'exceljs';

// AUTHENTICATION
const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const getAuthHeaders = () => {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) return { 'Content-Type': 'application/json' };
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

export const login = async (username: string, password: string) => {
    const cleanUsername = (username || '').trim();
    const cleanPassword = (password || '').trim();

    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: cleanUsername, password: cleanPassword }),
    });

    if (!response.ok) {
        let errorMessage = 'Đăng nhập thất bại';
        try {
            const errData = await response.json();
            errorMessage = errData.message || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
    }

    const result = await response.json();

    if (!result.success || !result.data || !result.data.token) {
        throw new Error('Phản hồi từ máy chủ không hợp lệ');
    }

    return {
        access_token: result.data.token,
        user: result.data.user
    };
};

export const checkApiConnection = async () => {
    try {
        const res = await fetch('/api/health');
        return { ok: res.ok };
    } catch(e) {
        return { ok: false };
    }
};

// --- DATA METHODS (Converted to Fetch to avoid Server Imports) ---

// PLANS
export const fetchPlans = async (search: string = '', page: number = 1, limit: number = 50) => {
    const params = new URLSearchParams({ search, page: page.toString(), limit: limit.toString() });
    const res = await fetch(`/api/plans?${params}`, { headers: getAuthHeaders() });
    return res.ok ? await res.json() : { items: [], total: 0 };
};

export const importPlans = async (plans: PlanItem[]) => {
    await fetch('/api/plans/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(plans)
    });
};

// INSPECTIONS
export const fetchInspections = async (filters: any = {}) => {
    const res = await fetch('/api/inspections', { headers: getAuthHeaders() });
    return res.ok ? await res.json() : { items: [] };
};

export const fetchInspectionById = async (id: string) => {
    const res = await fetch(`/api/inspections/${id}`, { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : null;
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
    await fetch('/api/inspections', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: inspection.id, data: inspection })
    });
};

export const deleteInspectionFromSheet = async (id: string) => {
    await fetch(`/api/inspections/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
};

export const importInspections = async (inspections: Inspection[]) => {
    for (const insp of inspections) {
        await saveInspectionToSheet(insp);
    }
};

// PROJECTS
export const fetchProjects = async () => {
    const res = await fetch('/api/projects', { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : [];
};

export const fetchProjectByCode = async (code: string) => {
    const res = await fetch(`/api/projects/${code}`, { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : null;
};

export const updateProject = async (project: Project) => {
    await fetch(`/api/projects/${project.ma_ct}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(project)
    });
};

export const fetchProjectsSummary = async () => fetchProjects();

// USERS
export const fetchUsers = async () => {
    const res = await fetch('/api/users', { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : [];
};

export const saveUser = async (user: User) => {
    await fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(user)
    });
};

export const deleteUser = async (id: string) => {
    await fetch(`/api/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
};

export const importUsers = async (users: User[]) => {
    await fetch('/api/users/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(users)
    });
};

// WORKSHOPS
export const fetchWorkshops = async () => {
    const res = await fetch('/api/workshops', { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : [];
};

export const saveWorkshop = async (ws: Workshop) => {
    await fetch('/api/workshops', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ws)
    });
};

export const deleteWorkshop = async (id: string) => {
    await fetch(`/api/workshops/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
};

// TEMPLATES
export const fetchTemplates = async () => {
    const res = await fetch('/api/templates', { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : {};
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    await fetch('/api/templates', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ moduleId, items })
    });
};

// NCRS & DEFECTS
export const fetchNcrs = async (params: any = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/ncrs?${query}`, { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data?.items || [] : [];
};

export const fetchNcrById = async (id: string) => {
    const res = await fetch(`/api/ncrs/${id}`, { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : null;
};

export const fetchDefects = async (params: any = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/defects?${query}`, { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data?.items || [] : [];
};

export const saveNcr = async (ncr: NCR) => {
    await fetch('/api/ncrs', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(ncr)
    });
};

export const fetchDefectLibrary = async () => {
    const res = await fetch('/api/defects/library', { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : [];
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await fetch('/api/defects/library', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item)
    });
};

export const deleteDefectLibraryItem = async (id: string) => {
    await fetch(`/api/defects/library/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
};

export const exportDefectLibrary = async () => {
    // Basic CSV export as fallback or use endpoint if implemented
    const data = await fetchDefectLibrary();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Defect Library');
    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'code', width: 15 },
      { header: 'Tên Lỗi', key: 'name', width: 30 },
      { header: 'Nhóm Lỗi', key: 'category', width: 20 },
      { header: 'Công Đoạn', key: 'stage', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả Lỗi', key: 'description', width: 50 },
      { header: 'Biện Pháp Khắc Phục', key: 'suggestedAction', width: 40 }
    ];
    data.forEach((item: any) => worksheet.addRow(item));
    await saveExcelLocally(workbook, `DefectLibrary_Export_${Date.now()}.xlsx`);
};

export const importDefectLibraryFile = async (file: File) => {
    // Currently client-side processing for simplicity in migration
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error("Sheet empty");
    
    let count = 0;
    const items: DefectLibraryItem[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const defect = {
        id: row.getCell(1).value?.toString() || `DEF_${Date.now()}_${rowNumber}`,
        code: row.getCell(1).value?.toString() || '',
        name: row.getCell(2).value?.toString() || '',
        category: row.getCell(3).value?.toString() || 'Ngoại quan',
        stage: row.getCell(4).value?.toString() || 'Chung',
        severity: (row.getCell(5).value?.toString() || 'MINOR') as any,
        description: row.getCell(6).value?.toString() || '',
        suggestedAction: row.getCell(7).value?.toString() || ''
      } as DefectLibraryItem;

      if (defect.code) items.push(defect);
    });

    for(const item of items) {
        await saveDefectLibraryItem(item);
        count++;
    }
    return { count };
};

// ROLES
export const fetchRoles = async () => {
    const res = await fetch('/api/roles', { headers: getAuthHeaders() });
    return res.ok ? (await res.json()).data : [];
};

export const saveRole = async (role: Role) => {
    await fetch('/api/roles', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(role)
    });
};

export const deleteRole = async (id: string) => {
    await fetch(`/api/roles/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
};

// EXCEL HELPERS
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
