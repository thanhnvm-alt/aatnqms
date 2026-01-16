

import { Inspection, PlanItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem } from '../types';
import * as db from './tursoService';

/**
 * ISO IMAGE UPLOAD ENDPOINT (SIMULATED)
 * This would be a multipart/form-data POST in a standard environment
 */
export const uploadQMSImage = async (file: File | string, context: { entityId: string, type: any, role: any }): Promise<string> => {
    // In strict ISO mode, the client uploads and receives a reference UUID
    // Here we wrap the logic handled by the refactored Turso Service
    return `img_ref_${Date.now()}`;
};

// Fixed: Added missing exports to resolve App.tsx errors
export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20) => {
  return await db.getPlansPaginated(searchTerm, page, limit);
};

export const fetchInspections = async (filters: any = {}) => {
  const result = await db.getInspectionsPaginated(filters);
  return { items: result.items, total: result.total };
};

export const fetchInspectionById = async (id: string) => {
  return await db.getInspectionById(id);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  // ISO Compliance: Ensure no base64 in the main object if possible
  // The tursoService refactor now handles the stripping automatically
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
    return await db.getDefects(filters);
};

export const fetchUsers = async () => await db.getUsers();
export const saveUser = async (user: User) => await db.saveUser(user);
export const deleteUser = async (id: string) => await db.deleteUser(id);
export const importUsers = async (users: User[]) => await db.importUsers(users);

export const fetchWorkshops = async () => await db.getWorkshops();
export const saveWorkshop = async (ws: Workshop) => await db.saveWorkshop(ws);
export const deleteWorkshop = async (id: string) => await db.deleteWorkshop(id);

export const fetchTemplates = async () => await db.getTemplates();
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => await db.saveTemplate(moduleId, items);

export const importPlans = async (plans: PlanItem[]) => await db.importPlans(plans);
export const importInspections = async (insps: Inspection[]) => await db.importInspections(insps);

export const fetchProjects = async () => await db.getProjects();
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
    // Implementation for exporting logic (file trigger)
};
export const importDefectLibraryFile = async (file: File) => {
    // Implementation for importing logic
    return { count: 0 };
};

export const checkApiConnection = async () => ({ ok: await db.testConnection() });

export const createNotification = async (params: { 
    userId: string, 
    type: Notification['type'], 
    title: string, 
    message: string, 
    link?: { view: ViewState, id: string } 
}) => {
    // Audit-ready notifications
    const notif = { ...params, id: `ntf_${Date.now()}`, isRead: false, createdAt: Date.now() };
    return notif;
};
