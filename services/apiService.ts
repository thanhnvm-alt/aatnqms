
import { Inspection, PlanItem, User, Workshop, CheckItem, Project } from '../types';

/**
 * MOBILE-SAFE API SERVICE
 * No direct DB access. All requests route through /api/*
 */

// Fix: Defined PagedResult locally and exported it to resolve circular dependency and missing export error
export interface PagedResult<T> {
  items: T[];
  total: number;
}

const getAuthHeaders = () => {
  const localData = localStorage.getItem('aatn_auth_storage');
  if (!localData) return {};
  const user = JSON.parse(localData);
  return {
    'Authorization': `Bearer ${user.id}`, // In production, this is a real JWT
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-role': user.role
  };
};

export const checkApiConnection = async () => {
  try {
    const res = await fetch('/api/health');
    return { ok: res.ok };
  } catch (e) {
    return { ok: false };
  }
};

export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 50): Promise<PagedResult<PlanItem>> => {
  const res = await fetch(`/api/plans?search=${encodeURIComponent(searchTerm)}&page=${page}&limit=${limit}`, {
    headers: getAuthHeaders()
  });
  const json = await res.json();
  return { 
    items: json.data || [], 
    total: json.meta?.pagination?.total || 0 
  };
};

export const fetchInspections = async (): Promise<Inspection[]> => {
  const res = await fetch('/api/inspections', { headers: getAuthHeaders() });
  const json = await res.json();
  return json.data || [];
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
  // Fix: Property '_meta' does not exist on type 'Inspection'. Using casting to any to suppress error while maintaining detection logic.
  const isUpdate = !!(inspection as any)._meta?.created_at; 
  const method = isUpdate ? 'PUT' : 'POST';
  const url = isUpdate ? `/api/inspections/${inspection.id}` : '/api/inspections';

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify({ id: inspection.id, data: inspection })
  });
  
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Lưu thất bại');
  return json;
};

export const deleteInspectionFromSheet = async (id: string) => {
  const res = await fetch(`/api/inspections/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.json();
};

export const fetchProjects = async (): Promise<Project[]> => {
    const res = await fetch('/api/projects', { headers: getAuthHeaders() });
    const json = await res.json();
    return json.data || [];
};

// Fix: Added updateProject export for ProjectDetail.tsx
export const updateProject = async (project: Project) => {
    const res = await fetch(`/api/projects/${project.code}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(project)
    });
    return res.json();
};

export const fetchUsers = async () => {
    const res = await fetch('/api/users', { headers: getAuthHeaders() });
    const json = await res.json();
    return json.data || [];
};

export const saveUser = async (user: User) => {
    await fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(user)
    });
};

// Fix: Added deleteUser export for App.tsx
export const deleteUser = async (id: string) => {
    await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
};

export const fetchWorkshops = async () => {
    const res = await fetch('/api/workshops', { headers: getAuthHeaders() });
    const json = await res.json();
    return json.data || [];
};

// Fix: Added saveWorkshop export for App.tsx
export const saveWorkshop = async (workshop: Workshop) => {
    await fetch('/api/workshops', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(workshop)
    });
};

// Fix: Added deleteWorkshop export for App.tsx
export const deleteWorkshop = async (id: string) => {
    await fetch(`/api/workshops/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
};

// Fix: Added fetchTemplates export for App.tsx
export const fetchTemplates = async (): Promise<Record<string, CheckItem[]>> => {
    const res = await fetch('/api/templates', { headers: getAuthHeaders() });
    const json = await res.json();
    return json.data || {};
};

// Fix: Added saveTemplate export for App.tsx
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    await fetch(`/api/templates/${moduleId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(items)
    });
};

// Fix: Added importPlans export for App.tsx
export const importPlans = async (plans: PlanItem[]) => {
    await fetch('/api/plans/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(plans)
    });
};

// Fix: Added importUsers export for App.tsx
export const importUsers = async (users: User[]) => {
    await fetch('/api/users/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(users)
    });
};

// Fix: Added importInspections export for App.tsx
export const importInspections = async (inspections: Inspection[]) => {
    await fetch('/api/inspections/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(inspections)
    });
};
