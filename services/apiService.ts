
import { Inspection, PlanItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin, IPOItem } from '../types';
import { MOCK_USERS, MOCK_PROJECTS, MOCK_WORKSHOPS, MOCK_INSPECTIONS, MOCK_PLAN_DATA } from '../constants';

// Dynamically set API_BASE and API_PREFIX based on the environment
const isProduction = process.env.NODE_ENV === 'production';
// ISO-FIX: Use relative paths to allow Vite proxy to handle CORS and routing in development
const API_BASE = ''; 
const API_PREFIX = '/api'; 

// Helper for generic API calls
async function callApi(endpoint: string, method: string = 'GET', data?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(endpoint, options);
    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.message || `HTTP Error ${response.status}`);
        }
        return result;
    } else {
        const text = await response.text();
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`API Endpoint Not Found: ${endpoint}`);
            }
            throw new Error(text || `HTTP Error ${response.status}`);
        }
        return text;
    }
  } catch (error: any) {
    throw error;
  }
}

/**
 * ISO QMS API: IPOs (Specialized View)
 * Updated to new endpoint to prevent routing issues
 */
export const fetchIPOs = async (searchTerm: string = '', page: number = 1, limit: number = 50) => {
  let url = `${API_PREFIX}/production/ipos?page=${page}&limit=${limit}`;
  if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
  
  try {
    return await callApi(url);
  } catch (error) {
    console.warn(`Error fetching IPOs, returning empty:`, error);
    return { success: false, data: [], total: 0 };
  }
};

/**
 * ISO QMS API: Plans (Bảng IPO - Legacy mapped)
 */
export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20, plannedDate?: string, assignee?: string, status?: string) => {
  let url = `${API_PREFIX}/plans?page=${page}&limit=${limit}`;
  try {
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
    if (plannedDate) url += `&plannedDate=${encodeURIComponent(plannedDate)}`;
    if (assignee) url += `&assignee=${encodeURIComponent(assignee)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    const res = await callApi(url);
    // Ensure the structure matches what frontend expects for plans (camelCase for new fields)
    return {
      ...res,
      items: res.items.map((item: any) => ({
        ...item,
        plannedDate: item.planned_date,
        ma_nha_may: item.ma_nha_may || item.ma_nm,
        drawing_url: item.drawing_url,
        description: item.description,
        materials_text: item.materials_text,
        samples_json: item.samples_json,
        simulations_json: item.simulations_json
      }))
    };
  } catch (error) {
    console.warn(`Error fetching plans (${url}), falling back to mock:`, error);
    return {
      success: true,
      items: MOCK_PLAN_DATA,
      total: MOCK_PLAN_DATA.length,
      page: 1,
      totalPages: 1
    };
  }
};

export const fetchPlansByProject = async (projectCode: string, limit?: number) => {
  try {
      const allPlans = await fetchPlans('', 1, limit || 200); 
      return allPlans.items.filter((p: PlanItem) => p.ma_ct === projectCode);
  } catch (error) {
      console.warn("Error fetching project plans:", error);
      return [];
  }
};

export const updatePlan = async (id: number | string, plan: Partial<PlanItem>) => {
  const payload: any = { ...plan };
  if (payload.plannedDate) {
    payload.planned_date = payload.plannedDate;
    delete payload.plannedDate;
  }
  return await callApi(`${API_PREFIX}/plans/${id}`, 'PUT', payload);
};

// ... (Rest of the file remains unchanged: fetchInspections, fetchInspectionById, saveInspection, updateInspection, deleteInspection, fetchUsers, saveUser, updateUser, deleteUser, verifyUserCredentials, fetchWorkshops, saveWorkshop, deleteWorkshop, fetchProjects, updateProject, fetchFloorPlans, saveFloorPlan, deleteFloorPlan, fetchLayoutPins, saveLayoutPin, and other mocks)

/**
 * ISO QMS API: Inspections
 */
export const fetchInspections = async (page: number = 1, limit: number = 20) => {
  try {
    const res = await callApi(`${API_PREFIX}/inspections?page=${page}&limit=${limit}`);
    return res.items.map((item: any) => ({
      ...item,
      inspectorName: item.inspector_name
    }));
  } catch (error) {
    console.warn("Error fetching inspections, falling back to mock:", error);
    return MOCK_INSPECTIONS;
  }
};

export const fetchInspectionById = async (id: string) => {
  try {
    const res = await callApi(`${API_PREFIX}/inspections/${id}`);
    if (res.data) {
      return {
        ...res.data,
        inspectorName: res.data.inspector_name,
        managerSignature: res.data.manager_signature,
        managerName: res.data.manager_name,
        productionSignature: res.data.production_signature,
        productionName: res.data.production_name,
        productionComment: res.data.production_comment,
        productionConfirmedDate: res.data.production_confirmed_date,
        confirmedDate: res.data.confirmed_date,
        updatedAt: res.data.updated_at,
        createdAt: res.data.created_at,
        comments: res.data.comments ? (typeof res.data.comments === 'string' ? JSON.parse(res.data.comments) : res.data.comments) : []
      };
    }
    return res.data;
  } catch (error) {
    console.warn(`Error fetching inspection detail for ${id}, using mock if available.`);
    const mock = MOCK_INSPECTIONS.find(i => i.id === id);
    return mock || null;
  }
};

export const saveInspection = async (inspection: Inspection) => {
  const payload: any = { ...inspection };
  payload.inspector_name = payload.inspectorName;
  delete payload.inspectorName;
  if (payload.comments) {
    payload.comments = JSON.stringify(payload.comments);
  }
  return await callApi(`${API_PREFIX}/inspections`, 'POST', payload);
};

export const updateInspection = async (inspection: Inspection) => {
  const payload: any = { ...inspection };
  payload.inspector_name = payload.inspectorName;
  delete payload.inspectorName;
  if (payload.managerSignature) {
    payload.manager_signature = payload.managerSignature;
    delete payload.managerSignature;
  }
  if (payload.managerName) {
    payload.manager_name = payload.managerName;
    delete payload.managerName;
  }
  if (payload.productionSignature) {
    payload.production_signature = payload.productionSignature;
    delete payload.productionSignature;
  }
  if (payload.productionName) {
    payload.production_name = payload.productionName;
    delete payload.productionName;
  }
  if (payload.productionComment) {
    payload.production_comment = payload.productionComment;
    delete payload.productionComment;
  }
  if (payload.productionConfirmedDate) {
    payload.production_confirmed_date = payload.productionConfirmedDate;
    delete payload.productionConfirmedDate;
  }
  if (payload.confirmedDate) {
    payload.confirmed_date = payload.confirmedDate;
    delete payload.confirmedDate;
  }
  if (payload.updatedAt) {
    payload.updated_at = payload.updatedAt;
    delete payload.updatedAt;
  }
  if (payload.comments) {
    payload.comments = JSON.stringify(payload.comments);
  }

  return await callApi(`${API_PREFIX}/inspections/${inspection.id}`, 'PUT', payload);
};

export const deleteInspection = async (id: string) => {
  return await callApi(`${API_PREFIX}/inspections/${id}`, 'DELETE');
};

export const fetchUsers = async () => {
  try {
    const res = await callApi(`${API_PREFIX}/users?pageSize=100`); 
    return res.data.map((user: any) => ({
      ...user,
      allowedModules: user.allowed_modules,
      msnv: user.msnv,
      workLocation: user.work_location,
      joinDate: user.join_date,
      endDate: user.end_date
    }));
  } catch (error) {
    console.warn("Backend unavailable (users), using mock:", error);
    return MOCK_USERS;
  }
};

export const saveUser = async (user: User) => {
  const payload: any = { ...user };
  payload.allowed_modules = payload.allowedModules;
  delete payload.allowedModules;
  payload.msnv = payload.msnv;
  payload.work_location = payload.workLocation;
  delete payload.workLocation;
  payload.join_date = payload.joinDate;
  delete payload.joinDate;
  payload.end_date = payload.endDate;
  delete payload.endDate;
  return await callApi(`${API_PREFIX}/users`, 'POST', payload);
};

export const updateUser = async (user: User) => {
  const payload: any = { ...user };
  payload.allowed_modules = payload.allowedModules;
  delete payload.allowedModules;
  payload.msnv = payload.msnv;
  payload.work_location = payload.workLocation;
  delete payload.workLocation;
  payload.join_date = payload.joinDate;
  delete payload.joinDate;
  payload.end_date = payload.endDate;
  delete payload.endDate;
  return await callApi(`${API_PREFIX}/users/${user.id}`, 'PUT', payload);
};

export const deleteUser = async (id: string) => {
  return await callApi(`${API_PREFIX}/users/${id}`, 'DELETE');
};

export const verifyUserCredentials = async (username: string, password: string): Promise<User | null> => {
  try {
    const res = await callApi(`${API_PREFIX}/users/verify`, 'POST', { username, password });
    if (res.success && res.data) {
      return {
        ...res.data,
        allowedModules: res.data.allowed_modules,
        msnv: res.data.msnv,
        workLocation: res.data.work_location,
        joinDate: res.data.join_date,
        endDate: res.data.end_date
      };
    }
  } catch (error) {
    console.warn("Backend verification failed, trying mock:", error);
  }
  const mockUser = MOCK_USERS.find(u => u.username === username && u.password === password);
  return mockUser || null;
};

export const fetchWorkshops = async () => {
  try {
    const res = await callApi(`${API_PREFIX}/workshops`);
    return res.data;
  } catch (error) {
    console.warn("Error fetching workshops, falling back to mock:", error);
    return MOCK_WORKSHOPS;
  }
};

export const saveWorkshop = async (workshop: Workshop) => {
  const payload: any = { ...workshop };
  if (workshop.id && (await callApi(`${API_PREFIX}/workshops/${workshop.id}`).catch(() => null))?.data) {
    return await callApi(`${API_PREFIX}/workshops/${workshop.id}`, 'PUT', payload);
  } else {
    return await callApi(`${API_PREFIX}/workshops`, 'POST', payload);
  }
};

export const deleteWorkshop = async (id: string) => {
  return await callApi(`${API_PREFIX}/workshops/${id}`, 'DELETE');
};

export const fetchProjects = async (searchTerm: string = '') => {
  try {
    const res = await callApi(`${API_PREFIX}/projects?search=${encodeURIComponent(searchTerm)}`);
    return res.data.map((project: any) => ({
      ...project,
      startDate: project.start_date,
      endDate: project.end_date,
      smartGoals: project.smart_goals 
    }));
  } catch (error) {
    console.warn("Error fetching projects, falling back to mock:", error);
    return MOCK_PROJECTS;
  }
};

export const updateProject = async (project: Project) => {
  const payload: any = { ...project };
  payload.start_date = payload.startDate;
  delete payload.startDate;
  payload.end_date = payload.endDate;
  delete payload.endDate;
  payload.smart_goals = payload.smartGoals;
  delete payload.smartGoals;
  return await callApi(`${API_PREFIX}/projects/${project.id}`, 'PUT', payload);
};

export const fetchFloorPlans = async (projectId: string) => {
  try {
    const res = await callApi(`${API_PREFIX}/floor_plans?project_id=${projectId}`);
    return res.data.map((plan: any) => ({
      ...plan,
      image_url: plan.image_url, 
      updated_at: plan.updated_at,
      file_name: plan.file_name
    }));
  } catch (error) {
    console.warn("Error fetching floor plans, returning empty:", error);
    return [];
  }
};

export const saveFloorPlan = async (floorPlan: FloorPlan) => {
  const payload: any = { ...floorPlan };
  payload.image_url = payload.image_url; 
  payload.updated_at = Math.floor(Date.now() / 1000); 
  payload.file_name = payload.file_name;
  if (floorPlan.id && (await callApi(`${API_PREFIX}/floor_plans/${floorPlan.id}`).catch(() => null))?.data) {
    return await callApi(`${API_PREFIX}/floor_plans/${floorPlan.id}`, 'PUT', payload);
  } else {
    return await callApi(`${API_PREFIX}/floor_plans`, 'POST', payload);
  }
};

export const deleteFloorPlan = async (id: string) => {
  return await callApi(`${API_PREFIX}/floor_plans/${id}`, 'DELETE');
};

export const fetchLayoutPins = async (floorPlanId: string) => {
  try {
    const res = await callApi(`${API_PREFIX}/layout_pins?floor_plan_id=${floorPlanId}`);
    return res.data;
  } catch (error) {
    console.warn("Error fetching layout pins, returning empty:", error);
    return [];
  }
};

export const saveLayoutPin = async (pin: LayoutPin) => {
  const payload: any = { ...pin };
  payload.floor_plan_id = payload.floor_plan_id;
  payload.inspection_id = payload.inspection_id;
  if (pin.id && (await callApi(`${API_PREFIX}/layout_pins/${pin.id}`).catch(() => null))?.data) {
    return await callApi(`${API_PREFIX}/layout_pins/${pin.id}`, 'PUT', payload);
  } else {
    return await callApi(`${API_PREFIX}/layout_pins`, 'POST', payload);
  }
};

// Other services (keeping mocks for now to focus on core)
export const fetchTemplates = async () => ({});
export const saveTemplate = async (m: string, i: CheckItem[]) => {};
export const fetchRoles = async () => []; // MOCK
export const saveRole = async (r: Role) => {}; // MOCK
export const deleteRole = async (id: string) => {}; // MOCK

export const fetchDefectLibrary = async () => [];
export const saveDefectLibraryItem = async (i: DefectLibraryItem) => {};
export const deleteDefectLibraryItem = async (id: string) => {};
export const exportDefectLibrary = async () => {};
export const importDefectLibraryFile = async (f: File) => ({ count: 0 });

export const fetchSuppliers = async () => [];
export const saveSupplier = async (s: Supplier) => {};
export const deleteSupplier = async (id: string) => {};
export const fetchSupplierStats = async (n: string) => ({ total_pos: 0, pass_rate: 0, defect_rate: 0 });
export const fetchSupplierInspections = async (n: string) => [];

export const saveNcrMapped = async (id: string, n: NCR, c: string) => {};
export const fetchNcrs = async (f: any = {}) => ({ items: [], total: 0 });
export const fetchNcrById = async (id: string) => null;
export const fetchDefects = async (f: any = {}) => ({ items: [], total: 0 });
export const fetchNotifications = async (u: string) => [];
export const markNotificationAsRead = async (id: string) => {};
export const markAllNotificationsAsRead = async (u: string) => {};

export const checkApiConnection = async () => {
    try {
        const res = await fetch(`${API_PREFIX}/health`);
        return res.ok;
    } catch { return false; }
};

export const uploadFileToStorage = async (base64Data: string, fileName: string) => {
  console.log(`Simulating upload for ${fileName}. Data length: ${base64Data.length}`);
  return base64Data; 
};

export const createNotification = async (userId: string, type: Notification['type'], title: string, message: string, link?: { view: ViewState, id: string }) => {
    console.log(`Notification for ${userId}: ${title} - ${message}`);
    return { id: `notif_${Date.now()}`, userId, type, title, message, isRead: false, createdAt: Math.floor(Date.now() / 1000), link };
};
