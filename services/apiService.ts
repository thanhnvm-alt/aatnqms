
import { Inspection, IPOItem, User, Workshop, CheckItem, Project, NCR, Notification, ViewState, Role, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin } from '../types';
import imageCompression from 'browser-image-compression';

// Helper to get auth headers from localStorage
const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('aatn_qms_token');
    if (!token) return {};
    return {
        'Authorization': `Bearer ${token}`
    };
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };
    
    // Ensure URL is relative or absolute correctly
    const fetchUrl = url.startsWith('http') ? url : url;
    
    const response = await fetch(fetchUrl, { ...options, headers: headers as HeadersInit });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Handle token expiration or unauthorized access
        if (response.status === 401) {
            console.warn('Session expired or unauthorized. Logging out.');
            localStorage.removeItem('aatn_qms_token');
            localStorage.removeItem('aatn_auth_storage');
            sessionStorage.removeItem('aatn_auth_storage');
            // Avoid infinite loops if we are already on the login page
            if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
                window.location.reload();
            }
        }
        
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

export const fetchIpoDetailExtended = async (idFactoryOrder: string) => apiFetch(`/api/ipo/detail/${idFactoryOrder}`);

export const saveIpoDetailExtended = async (detail: any) => apiFetch('/api/ipo/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(detail)
});

export const saveIpoDrawingRecord = async (drawing: any) => apiFetch('/api/ipo/drawings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(drawing)
});

export const saveIpoMaterialRecord = async (material: any) => apiFetch('/api/ipo/materials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(material)
});

export const saveIpoSampleRecord = async (sample: any) => apiFetch('/api/ipo/samples', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample)
});

export const updateIpoSampleRecord = async (id: string, sample: any) => apiFetch(`/api/ipo/samples/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample)
});

export const deleteIpoSampleRecord = async (id: string) => apiFetch(`/api/ipo/samples/${id}`, { 
    method: 'DELETE' 
});

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
        if (file.startsWith('http') || file.startsWith('/uploads/')) return file;
        const res = await fetch(file);
        fileToUpload = await res.blob();
    } else {
        try {
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
                fileType: 'image/jpeg'
            };
            fileToUpload = await imageCompression(file, options);
        } catch (error) {
            console.warn("Image compression failed, using original file", error);
            fileToUpload = file;
        }
    }

    const formData = new FormData();
    formData.append('image', fileToUpload, fileName);
    
    const response = await fetch('/api/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    
    if (!response.ok) {
        let errorMsg = `Upload failed with status ${response.status}`;
        if (response.status === 413) {
            errorMsg = "File is too large, even after compression.";
        } else {
            const errorData = await response.json().catch(() => null);
            if (errorData && errorData.error) errorMsg = errorData.error;
        }
        throw new Error(errorMsg);
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

export const fetchInspectionsLight = async () => {
    return apiFetch(`/api/inspections/light`);
};

export const fetchInspectionTimeline = async () => {
    return apiFetch('/api/inspections/timeline');
};

export const fetchProjectsByDate = async (date: string) => {
    return apiFetch(`/api/inspections/projects-by-date?date=${date}`);
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

export const deleteInspection = async (id: string) => {
    return apiFetch(`/api/inspections/${id}`, { method: 'DELETE' });
};

export const fetchDeletedInspections = async () => apiFetch('/api/admin/deleted-inspections');
export const restoreInspection = async (id: string) => apiFetch(`/api/admin/restore-inspection/${id}`, { method: 'POST' });
export const permanentDeleteInspection = async (id: string) => apiFetch(`/api/admin/permanent-delete/${id}`, { method: 'DELETE' });

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

export const deleteNcr = async (id: string) => {
    return apiFetch(`/api/ncrs/${id}`, { method: 'DELETE' });
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

export const verifyUserCredentials = async (username: string, password: string): Promise<{ user: User, token: string } | null> => {
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
    const response = await fetch('/api/export/defects', {
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

const importFile = async (url: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    
    const responseClone = response.clone();

    if (!response.ok) {
        let errorMsg = 'Import failed';
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
        } catch (e) {
            const text = await responseClone.text().catch(() => 'No response body');
            errorMsg = `Import failed (${response.status}): ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`;
        }
        throw new Error(errorMsg);
    }
    
    try {
        return await response.json();
    } catch (e: any) {
        const text = await responseClone.text().catch(() => 'No response body');
        throw new Error(`Failed to parse response as JSON: ${e.message}. Response: ${text.substring(0, 200)}`);
    }
};

export const importDefectLibraryFile = async (file: File) => importFile('/api/import/defects', file);

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
    const response = await fetch('/api/export/ncrs', {
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

export const importNcrsFile = async (file: File) => importFile('/api/import/ncrs', file);

export const exportMaterials = async () => {
    const response = await fetch('/api/export/materials', {
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

export const importMaterialsFile = async (file: File) => importFile('/api/import/materials', file);

export const exportSuppliers = async () => {
    const response = await fetch('/api/export/suppliers', {
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

export const importSuppliersFile = async (file: File) => importFile('/api/import/suppliers', file);

export const exportInspections = async (filters: any = {}) => {
    const cleanFilters: any = {};
    for (const key in filters) {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
            cleanFilters[key] = filters[key];
        }
    }
    const params = new URLSearchParams(cleanFilters);
    const response = await fetch(`/api/export/inspections?${params.toString()}`, {
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

export const importInspectionsFile = async (file: File) => importFile('/api/import/inspections', file);

export const exportIpoData = async (filters: any = {}) => {
    const cleanFilters: any = {};
    for (const key in filters) {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
            cleanFilters[key] = filters[key];
        }
    }
    const params = new URLSearchParams(cleanFilters);
    const response = await fetch(`/api/export/ipo?${params.toString()}`, {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AATN_IPO_Data_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
};

export const importIpoFile = async (file: File) => importFile('/api/import/ipo', file);

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

// Grouping all exports into a single object for easier access and namespace management
export const apiService = {
    fetchIpoData,
    fetchIpoByFactoryOrder,
    fetchIpoDetailExtended,
    saveIpoDetailExtended,
    saveIpoDrawingRecord,
    saveIpoMaterialRecord,
    saveIpoSampleRecord,
    updateIpoSampleRecord,
    deleteIpoSampleRecord,
    fetchFloorPlans,
    saveFloorPlan,
    deleteFloorPlan,
    fetchLayoutPins,
    saveLayoutPin,
    uploadFileToStorage,
    fetchSuppliers,
    saveSupplier,
    deleteSupplier,
    fetchSupplierStats,
    fetchSupplierInspections,
    fetchSupplierMaterials,
    uploadQMSImage,
    fetchPlans,
    updatePlan,
    fetchPlansByProject,
    fetchInspections,
    fetchInspectionsLight,
    fetchInspectionTimeline,
    fetchProjectsByDate,
    fetchInspectionById,
    fetchInspectionDetail: fetchInspectionById, // Alias for convenience
    saveInspectionToSheet,
    deleteInspectionFromSheet,
    deleteInspection,
    fetchDeletedInspections,
    restoreInspection,
    permanentDeleteInspection,
    saveNcrMapped,
    fetchNcrs,
    fetchNcrById,
    deleteNcr,
    fetchDefects,
    fetchUsers,
    saveUser,
    deleteUser,
    verifyUserCredentials,
    fetchWorkshops,
    saveWorkshop,
    deleteWorkshop,
    fetchTemplates,
    saveTemplate,
    fetchProjects,
    fetchProjectByCode,
    updateProject,
    fetchNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    fetchRoles,
    saveRole,
    deleteRole,
    fetchDefectLibrary,
    saveDefectLibraryItem,
    deleteDefectLibraryItem,
    exportDefectLibrary,
    importDefectLibraryFile,
    fetchMaterials,
    saveMaterial,
    deleteMaterial,
    exportNcrs,
    importNcrsFile,
    exportMaterials,
    importMaterialsFile,
    exportSuppliers,
    importSuppliersFile,
    exportInspections,
    importInspectionsFile,
    exportIpoData,
    importIpoFile,
    checkApiConnection,
    createNotification
};
