
import { Inspection, PlanItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin } from '../types';
import * as db from './tursoService';

export const fetchFloorPlans = async (projectId: string) => await db.getFloorPlans(projectId);
export const saveFloorPlan = async (fp: FloorPlan) => await db.saveFloorPlan(fp);
export const deleteFloorPlan = async (id: string) => await db.deleteFloorPlan(id);
export const fetchLayoutPins = async (fpId: string) => await db.getLayoutPins(fpId);
export const saveLayoutPin = async (pin: LayoutPin) => await db.saveLayoutPin(pin);

export const fetchSuppliers = async () => await db.getSuppliers();
export const saveSupplier = async (s: Supplier) => await db.saveSupplier(s);
export const deleteSupplier = async (id: string) => await db.deleteSupplier(id);
export const fetchSupplierStats = async (name: string) => await db.getSupplierStats(name);
export const fetchSupplierInspections = async (name: string) => await db.getSupplierInspections(name);

export const uploadQMSImage = async (file: File | string, context: { entityId: string, type: any, role: any }): Promise<string> => {
    return `img_ref_${Date.now()}`;
};

export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20) => {
  return await db.getPlansPaginated(searchTerm, page, limit);
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

export const checkApiConnection = async () => ({ ok: await db.testConnection() });

export const createNotification = async (params: { userId: string, type: Notification['type'], title: string, message: string, link?: { view: ViewState, id: string } }) => {
    await db.addNotification(params.userId, params.type, params.title, params.message, params.link);
    return { success: true };
};
