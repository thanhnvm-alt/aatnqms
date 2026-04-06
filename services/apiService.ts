
import { Inspection, IPOItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin } from '../types';
import imageCompression from 'browser-image-compression';

// Helper to get auth headers from localStorage
const getAuthHeaders = (): Record<string, string> => {
    const userStr = localStorage.getItem('aatn_qms_user');
    if (!userStr) return {};
    try {
        const user = JSON.parse(userStr);
        return {
            'x-user-id': String(user.id || user.username || ''),
            'x-user-role': String(user.role || 'GUEST')
        };
    } catch (e) {
        return {};
    }
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers: headers as HeadersInit });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }
    return await response.json();
};

export const fetchIpoData = async (page: number = 1, limit: number = 50, factoryOrder?: string, maTender?: string) => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (factoryOrder) params.append('factoryOrder', factoryOrder);
    if (maTender) params.append('maTender', maTender);
    
    const response = await fetch(`/api/ipo?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch IPO data');
    return await response.json();
};

export const fetchIpoByFactoryOrder = async (factoryOrder: string) => {
    const response = await fetch(`/api/ipo?factoryOrder=${encodeURIComponent(factoryOrder)}`);
    if (!response.ok) throw new Error('Failed to fetch IPO by factory order');
    const data = await response.json();
    return data;
};

export const fetchFloorPlans = async (projectId: string) => apiFetch(`/api/floor-plans?projectId=${projectId}`);
export const saveFloorPlan = async (fp: FloorPlan) => apiFetch('/api/floor-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fp)
});
export const deleteFloorPlan = async (id: string) => apiFetch(`/api/floor-plans/${id}`, { method: 'DELETE' });
export const fetchLayoutPins = async (fpId: string) => apiFetch(`/api/layout-pins?fpId=${fpId}`);
export const saveLayoutPin = async (pin: LayoutPin) => apiFetch('/api/layout-pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin)
});

/**
 * ISO-Compliant File Upload
 * Uploads file to storage service and returns a permanent URL
 */
export const uploadFileToStorage = async (file: File | string, fileName: string): Promise<string> => {
    let fileToUpload: File | Blob;
    
    if (typeof file === 'string') {
        // If it's already a remote URL, return it
        if (file.startsWith('http') || file.startsWith('/uploads/')) return file;
        
        // If it's a data URL or blob URL, convert to Blob for upload
        const res = await fetch(file);
        fileToUpload = await res.blob();
    } else {
        fileToUpload = file;
    }

    // ISO-Compliant: Upload original file
    const formData = new FormData();
    formData.append('image', fileToUpload, fileName);
    
    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }
    const data = await response.json();
    return data.url;
};

export const fetchSuppliers = async (search: string = '', page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams({ search, page: page.toString(), limit: limit.toString() });
    return apiFetch(`/api/suppliers?${params.toString()}`);
};
export const saveSupplier = async (s: Supplier) => apiFetch('/api/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s)
});
export const deleteSupplier = async (id: string) => apiFetch(`/api/suppliers/${id}`, { method: 'DELETE' });
export const fetchSupplierStats = async (name: string) => apiFetch(`/api/suppliers/stats?name=${encodeURIComponent(name)}`);
export const fetchSupplierInspections = async (name: string) => apiFetch(`/api/suppliers/inspections?name=${encodeURIComponent(name)}`);
export const fetchSupplierMaterials = async (name: string) => apiFetch(`/api/suppliers/materials?name=${encodeURIComponent(name)}`);

export const uploadQMSImage = async (file: File | string, entityIdOrContext: string | { entityId: string, type: any, role: any }, type?: any, role?: any): Promise<string> => {
    let entityId: string;
    let finalType: any;
    
    if (typeof entityIdOrContext === 'object') {
        entityId = entityIdOrContext.entityId;
        finalType = entityIdOrContext.type;
    } else {
        entityId = entityIdOrContext;
        finalType = type;
    }
    
    return await uploadFileToStorage(file, `qms_${finalType}_${entityId}_${Date.now()}.jpg`);
};

export const fetchPlans = async (searchTerm: string = '', page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams({ search: searchTerm, page: page.toString(), limit: limit.toString() });
    return apiFetch(`/api/plans?${params.toString()}`);
};

export const updatePlan = async (id: number | string, plan: Partial<IPOItem>) => {
    return apiFetch(`/api/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
    });
};

export const fetchPlansByProject = async (maCt: string, limit?: number) => {
    const params = new URLSearchParams({ maCt });
    if (limit) params.append('limit', limit.toString());
    return apiFetch(`/api/plans/by-project?${params.toString()}`);
};

export const fetchInspections = async (filters: any = {}, page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams({ ...filters, page: page.toString(), limit: limit.toString() });
    return apiFetch(`/api/inspections?${params.toString()}`);
};

export const fetchInspectionById = async (id: string) => {
    return apiFetch(`/api/inspections/${id}`);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
    return apiFetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inspection)
    });
};

export const deleteInspectionFromSheet = async (id: string) => {
    return apiFetch(`/api/inspections/${id}`, { method: 'DELETE' });
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    return apiFetch('/api/ncrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspection_id, ncr, createdBy })
    });
};

export const fetchNcrs = async (filters: any = {}, page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams({ ...filters, page: page.toString(), limit: limit.toString() });
    return apiFetch(`/api/ncrs?${params.toString()}`);
};

export const fetchNcrById = async (id: string) => {
    return apiFetch(`/api/ncrs/${id}`);
};

export const fetchDefects = async (filters: any = {}) => {
    const params = new URLSearchParams(filters);
    return apiFetch(`/api/defects?${params.toString()}`);
};

export const fetchUsers = async () => apiFetch('/api/users');
export const saveUser = async (user: User) => apiFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
});
export const deleteUser = async (id: string) => apiFetch(`/api/users/${id}`, { method: 'DELETE' });

export const verifyUserCredentials = async (username: string, password: string): Promise<User | null> => {
    return apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
};

export const fetchWorkshops = async () => apiFetch('/api/workshops');
export const saveWorkshop = async (ws: Workshop) => apiFetch('/api/workshops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ws)
});
export const deleteWorkshop = async (id: string) => apiFetch(`/api/workshops/${id}`, { method: 'DELETE' });

export const fetchTemplates = async () => apiFetch('/api/templates');
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => apiFetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, items })
});

export const fetchProjects = async (search: string = '', page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams({ search, page: page.toString(), limit: limit.toString() });
    return apiFetch(`/api/projects?${params.toString()}`);
};
export const fetchProjectByCode = async (code: string) => apiFetch(`/api/projects/${code}`);
export const updateProject = async (proj: Project) => apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proj)
});

export const fetchNotifications = async (userId: string) => apiFetch(`/api/notifications/${userId}`);
export const markNotificationAsRead = async (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
export const markAllNotificationsAsRead = async (userId: string) => apiFetch(`/api/notifications/read-all/${userId}`, { method: 'PUT' });

export const fetchRoles = async () => apiFetch('/api/roles');
export const saveRole = async (role: Role) => apiFetch('/api/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(role)
});
export const deleteRole = async (id: string) => apiFetch(`/api/roles/${id}`, { method: 'DELETE' });

export const fetchDefectLibrary = async () => apiFetch('/api/defect-library');
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => apiFetch('/api/defect-library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
});
export const deleteDefectLibraryItem = async (id: string) => apiFetch(`/api/defect-library/${id}`, { method: 'DELETE' });

export const exportDefectLibrary = async () => {
    const response = await fetch('/api/defects/export', {
        headers: getAuthHeaders()
    });
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
        headers: getAuthHeaders(),
        body: formData
    });
    if (!response.ok) throw new Error('Import failed');
    return await response.json();
};

export const fetchMaterials = async (search: string = '', page: number = 1, limit: number = 50) => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    
    const response = await fetch(`/api/materials?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch materials');
    return await response.json();
};

export const saveMaterial = async (material: any) => {
    const response = await fetch(material.id ? `/api/materials/${material.id}` : '/api/materials', {
        method: material.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(material)
    });
    if (!response.ok) throw new Error('Failed to save material');
    return await response.json();
};

export const deleteMaterial = async (id: string) => {
    const response = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete material');
    return await response.json();
};

export const exportNcrs = async () => {
    const response = await fetch('/api/ncrs/export', {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AATN_NCR_List_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const importNcrsFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/ncrs/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    if (!response.ok) throw new Error('Import failed');
    return await response.json();
};

export const exportMaterials = async () => {
    const response = await fetch('/api/materials/export', {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AATN_Materials_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const importMaterialsFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/materials/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    if (!response.ok) throw new Error('Import failed');
    return await response.json();
};

export const exportSuppliers = async () => {
    const response = await fetch('/api/suppliers/export', {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AATN_Suppliers_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const importSuppliersFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/suppliers/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    if (!response.ok) throw new Error('Import failed');
    return await response.json();
};

export const exportInspections = async () => {
    const response = await fetch('/api/inspections/export', {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AATN_Inspections_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const checkApiConnection = async () => {
    try {
        const response = await fetch('/api/health');
        return { ok: response.ok };
    } catch (e) {
        return { ok: false };
    }
};

export const createNotification = async (params: { userId: string, type: Notification['type'], title: string, message: string, link?: { view: ViewState, id: string } }) => {
    return apiFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
};
