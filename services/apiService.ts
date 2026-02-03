import { Inspection, PlanItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin } from '../types';

const API_BASE = 'http://localhost:3001/api';

/**
 * Gọi API lấy danh sách kế hoạch từ bảng IPO (PostgreSQL)
 */
export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20) => {
  const res = await fetch(`${API_BASE}/plans?search=${encodeURIComponent(searchTerm)}&page=${page}&limit=${limit}`);
  return await res.json();
};

export const fetchInspections = async () => {
  const res = await fetch(`${API_BASE}/inspections`);
  return await res.json();
};

export const fetchInspectionById = async (id: string) => {
  const res = await fetch(`${API_BASE}/inspections/${id}`);
  const json = await res.json();
  return json.data;
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  const res = await fetch(`${API_BASE}/inspections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inspection)
  });
  return await res.json();
};

export const deleteInspectionFromSheet = async (id: string) => {
  const res = await fetch(`${API_BASE}/inspections/${id}`, { method: 'DELETE' });
  return await res.json();
};

// Các phương thức Mock/Dùng tạm cho đến khi Backend hoàn thiện các bảng phụ
export const fetchUsers = async () => [];
export const saveUser = async (u: User) => {};
export const deleteUser = async (id: string) => {};
export const fetchWorkshops = async () => [];
export const saveWorkshop = async (w: Workshop) => {};
export const deleteWorkshop = async (id: string) => {};
export const fetchTemplates = async () => ({});
export const saveTemplate = async (m: string, i: CheckItem[]) => {};
export const fetchProjects = async (s: string = '') => [];
export const checkApiConnection = async () => {
    try {
        const res = await fetch('http://localhost:3001/health');
        return { ok: res.ok };
    } catch { return { ok: false }; }
};
export const fetchRoles = async () => [];
export const fetchDefectLibrary = async () => [];
export const fetchSuppliers = async () => [];
export const fetchFloorPlans = async (p: string) => [];
export const fetchLayoutPins = async (f: string) => [];
export const saveLayoutPin = async (p: LayoutPin) => {};
export const saveFloorPlan = async (f: FloorPlan) => {};
export const deleteFloorPlan = async (id: string) => {};
export const updatePlan = async (id: any, p: any) => {};
export const saveSupplier = async (s: Supplier) => {};
export const deleteSupplier = async (id: string) => {};
export const fetchSupplierStats = async (n: string) => ({ total_pos: 0, pass_rate: 0, defect_rate: 0 });
export const fetchSupplierInspections = async (n: string) => [];
export const saveNcrMapped = async (id: string, n: NCR, c: string) => {};
export const fetchNcrs = async (f: any = {}) => ({ items: [], total: 0 });
export const fetchNcrById = async (id: string) => null;
export const fetchDefects = async (f: any = {}) => ({ items: [], total: 0 });
export const saveDefectLibraryItem = async (i: DefectLibraryItem) => {};
export const deleteDefectLibraryItem = async (id: string) => {};
export const fetchNotifications = async (u: string) => [];
export const markNotificationAsRead = async (id: string) => {};
export const markAllNotificationsAsRead = async (u: string) => {};
export const verifyUserCredentials = async (u: string, p: string) => null;
export const uploadFileToStorage = async (f: any, n: string) => 'https://via.placeholder.com/800';
