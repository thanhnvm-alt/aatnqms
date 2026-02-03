import { Inspection, PlanItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin } from '../types';
import { MOCK_USERS, MOCK_PROJECTS, MOCK_WORKSHOPS, MOCK_INSPECTIONS } from '../constants'; // For mock data fallback

const API_BASE = 'http://localhost:3001'; // Root for generic CRUD
const API_PREFIX = 'http://localhost:3001/api'; // Prefix for specific API routes

// Helper for generic API calls
async function callApi(endpoint: string, method: string = 'GET', data?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) {
    options.body = JSON.stringify(data);
  }
  const response = await fetch(endpoint, options);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || response.statusText);
  }
  return response.json();
}

/**
 * ISO QMS API: Plans (Bảng IPO)
 */
export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20) => {
  const res = await callApi(`${API_PREFIX}/plans?search=${encodeURIComponent(searchTerm)}&page=${page}&limit=${limit}`);
  return res;
};

export const fetchPlansByProject = async (projectCode: string, limit?: number) => {
  // Assuming a backend endpoint for project-specific plans or filter client-side for now
  const allPlans = await fetchPlans('', 1, limit || 200); // Fetch a reasonable amount
  return allPlans.items.filter((p: PlanItem) => p.ma_ct === projectCode);
};

export const updatePlan = async (id: number | string, plan: Partial<PlanItem>) => {
  return await callApi(`${API_BASE}/IPO/${id}`, 'PUT', plan);
};


/**
 * ISO QMS API: Inspections
 */
export const fetchInspections = async (page: number = 1, limit: number = 20) => {
  const res = await callApi(`${API_BASE}/inspections?page=${page}&limit=${limit}`);
  return res.items; // Backend returns { items: [], total: ... }
};

export const fetchInspectionById = async (id: string) => {
  const res = await callApi(`${API_BASE}/inspections/${id}`);
  return res.data;
};

export const saveInspection = async (inspection: Inspection) => {
  return await callApi(`${API_BASE}/inspections`, 'POST', inspection);
};

export const updateInspection = async (inspection: Inspection) => {
  return await callApi(`${API_BASE}/inspections/${inspection.id}`, 'PUT', inspection);
};

export const deleteInspection = async (id: string) => {
  return await callApi(`${API_BASE}/inspections/${id}`, 'DELETE');
};

/**
 * ISO QMS API: Users
 */
export const fetchUsers = async () => {
  try {
    const res = await callApi(`${API_PREFIX}/users?pageSize=100`); // Fetch all or paginate
    return res.data;
  } catch (error) {
    console.error("Error fetching users from backend, falling back to mock:", error);
    return MOCK_USERS; // Fallback to mock data
  }
};

export const saveUser = async (user: User) => {
  return await callApi(`${API_PREFIX}/users`, 'POST', user);
};

export const updateUser = async (user: User) => {
  return await callApi(`${API_PREFIX}/users/${user.id}`, 'PUT', user);
};

export const deleteUser = async (id: string) => {
  return await callApi(`${API_PREFIX}/users/${id}`, 'DELETE');
};

export const verifyUserCredentials = async (username: string, password: string): Promise<User | null> => {
  try {
    const users = await fetchUsers();
    const foundUser = users.find((u: User) => u.username === username);
    if (foundUser && foundUser.password === password) { // Assuming plain password check for mock/dev
      return foundUser;
    }
  } catch (error) {
    console.error("Verification failed against backend, trying mock:", error);
  }
  // Fallback to mock if backend fails or user not found there
  const mockUser = MOCK_USERS.find(u => u.username === username && u.password === password);
  return mockUser || null;
};


/**
 * ISO QMS API: Workshops
 */
export const fetchWorkshops = async () => {
  try {
    const res = await callApi(`${API_BASE}/workshops`);
    return res.data;
  } catch (error) {
    console.warn("Error fetching workshops, falling back to mock:", error);
    return MOCK_WORKSHOPS;
  }
};

export const saveWorkshop = async (workshop: Workshop) => {
  if (workshop.id && (await callApi(`${API_BASE}/workshops/${workshop.id}`).catch(() => null))?.data) {
    return await callApi(`${API_BASE}/workshops/${workshop.id}`, 'PUT', workshop);
  } else {
    return await callApi(`${API_BASE}/workshops`, 'POST', workshop);
  }
};

export const deleteWorkshop = async (id: string) => {
  return await callApi(`${API_BASE}/workshops/${id}`, 'DELETE');
};

/**
 * ISO QMS API: Projects
 */
export const fetchProjects = async (searchTerm: string = '') => {
  try {
    const res = await callApi(`${API_BASE}/projects?search=${encodeURIComponent(searchTerm)}`);
    return res.data;
  } catch (error) {
    console.warn("Error fetching projects, falling back to mock:", error);
    return MOCK_PROJECTS;
  }
};

export const updateProject = async (project: Project) => {
  return await callApi(`${API_BASE}/projects/${project.id}`, 'PUT', project);
};

/**
 * ISO QMS API: Floor Plans & Layout Pins
 */
export const fetchFloorPlans = async (projectId: string) => {
  try {
    const res = await callApi(`${API_BASE}/floor_plans?project_id=${projectId}`);
    return res.data;
  } catch (error) {
    console.warn("Error fetching floor plans, returning empty:", error);
    return [];
  }
};

export const saveFloorPlan = async (floorPlan: FloorPlan) => {
  if (floorPlan.id && (await callApi(`${API_BASE}/floor_plans/${floorPlan.id}`).catch(() => null))?.data) {
    return await callApi(`${API_BASE}/floor_plans/${floorPlan.id}`, 'PUT', floorPlan);
  } else {
    return await callApi(`${API_BASE}/floor_plans`, 'POST', floorPlan);
  }
};

export const deleteFloorPlan = async (id: string) => {
  return await callApi(`${API_BASE}/floor_plans/${id}`, 'DELETE');
};

export const fetchLayoutPins = async (floorPlanId: string) => {
  try {
    const res = await callApi(`${API_BASE}/layout_pins?floor_plan_id=${floorPlanId}`);
    return res.data;
  } catch (error) {
    console.warn("Error fetching layout pins, returning empty:", error);
    return [];
  }
};

export const saveLayoutPin = async (pin: LayoutPin) => {
  if (pin.id && (await callApi(`${API_BASE}/layout_pins/${pin.id}`).catch(() => null))?.data) {
    return await callApi(`${API_BASE}/layout_pins/${pin.id}`, 'PUT', pin);
  } else {
    return await callApi(`${API_BASE}/layout_pins`, 'POST', pin);
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
        const res = await fetch(`${API_BASE}/health`);
        return res.ok;
    } catch { return false; }
};

export const uploadFileToStorage = async (base64Data: string, fileName: string) => {
  // In a real app, this would upload to Cloud Storage (Firebase, S3, GCS)
  // For now, just return the base64 string or a placeholder
  console.log(`Simulating upload for ${fileName}. Data length: ${base64Data.length}`);
  return base64Data; // Or a static placeholder
};

export const createNotification = async (userId: string, type: Notification['type'], title: string, message: string, link?: { view: ViewState, id: string }) => {
    // MOCK: In a real app, this would hit a backend endpoint
    console.log(`Notification for ${userId}: ${title} - ${message}`);
    return { id: `notif_${Date.now()}`, userId, type, title, message, isRead: false, createdAt: Math.floor(Date.now() / 1000), link };
};
