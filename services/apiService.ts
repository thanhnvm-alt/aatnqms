import { 
  SubcontractorBooking, 
  Inspection, 
  SubcontractorInspection, 
  SubcontractorReinspectionCost, 
  DefectLibraryItem, 
  Supplier,
  User,
  Project,
  Role,
  RoleObject,
  FloorPlan,
  LayoutPin,
  ProjectDocument,
  Workshop,
  Material,
  RelatedSqcResponse,
  RelatedBookingsResponse,
  TraceabilityBundle
} from '../types.js';

const getAuthHeaders = (): Record<string, string> => {
  try {
    const token = localStorage.getItem('aatn_qms_token') || sessionStorage.getItem('aatn_qms_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

async function apiFetch(url: string, options: RequestInit = {}, retries: number = 2): Promise<any> {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };
  const fetchUrl = url.startsWith('http') ? url : url;
  const controller = !options.signal ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 25000) : null;

  try {
    const response = await fetch(fetchUrl, {
      ...options,
      headers,
      signal: options.signal || controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        console.warn(`[apiFetch] Rate limit 429 encountered for ${url}, retrying in 2s... (${retries} retries left)`);
        await new Promise((r) => setTimeout(r, 2000));
        return apiFetch(url, options, retries - 1);
      }

      let errorMsg = `Request failed with status ${response.status}`;
      if (contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        errorMsg = errorData.error || errorData.message || errorMsg;
      } else {
        const text = await response.text().catch(() => '');
        if (text.includes('<!doctype') || text.includes('<html')) {
          errorMsg = `Server error (${response.status}): Endpoint returned HTML page instead of JSON`;
        } else if (text) {
          errorMsg = `Server error (${response.status}): ${text.substring(0, 120)}`;
        }
      }

      if (response.status === 401) {
        console.warn('Session expired or unauthorized.');
        try {
          if (!url.includes('/api/auth/login') && !url.includes('/api/auth/forgot-password') && !url.includes('/api/auth/reset-password') && !url.includes('/api/public/')) {
            try { localStorage.removeItem('aatn_qms_token'); } catch {}
            try { localStorage.removeItem('aatn_auth_storage'); } catch {}
            try { sessionStorage.removeItem('aatn_qms_token'); } catch {}
            try { sessionStorage.removeItem('aatn_auth_storage'); } catch {}
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('qms-auth-expired'));
            }
          }
        } catch {
          // Ignore storage error
        }
      }
      const err: any = new Error(errorMsg);
      err.status = response.status;
      throw err;
    }

    if (!contentType.includes('application/json')) {
      const text = await response.text();
      if (text.includes('<!doctype') || text.includes('<html')) {
        const msg = `API returned HTML document instead of JSON (URL: ${url}). Check server route or login state.`;
        if (!url.includes('/api/system/audit-errors')) {
          void fetch('/api/system/audit-errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ method: options.method || 'GET', path: url, statusCode: 502, errorMessage: msg }),
          }).catch(() => {});
        }
        const err: any = new Error(msg);
        err.status = 502;
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response from ${url}: ${text.substring(0, 100)}`);
      }
    }

    return await response.json();
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      const timeoutErr: any = new Error(`Kết nối quá thời gian chờ cho ${url}`);
      timeoutErr.status = 408;
      throw timeoutErr;
    }
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const isRateLimit = err?.status === 429 || err.message?.includes('429') || err.message?.includes('Rate exceeded');
    if ((isGet || isRateLimit) && retries > 0 && (err.name === 'TypeError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || isRateLimit)) {
      console.warn(`[apiFetch] Issue for ${url} (${err.message}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      return apiFetch(url, options, retries - 1);
    }
    if (!err?.status && !url.includes('/api/system/audit-errors')) {
      void fetch('/api/system/audit-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          method: options.method || 'GET',
          path: url,
          statusCode: 503,
          errorMessage: err?.message || 'Network/Fetch failure',
        }),
      }).catch(() => {});
    }
    throw err;
  }
}

// --- AUTHENTICATION API ---
export const verifyUserCredentials = async (username: string, password: string): Promise<any> => {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<any> => {
  return apiFetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};

export const forgotPassword = async (email: string): Promise<any> => {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async (email: string, code: string, newPassword: string): Promise<any> => {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword }),
  });
};

// --- SUBCONTRACTOR BOOKINGS & INSPECTIONS ---
export const fetchSubcontractorBookings = async (filters: any = {}): Promise<{ bookings: SubcontractorBooking[] }> => {
  const params = new URLSearchParams(filters);
  return apiFetch(`/api/subcontractor-bookings?${params.toString()}`);
};

export const fetchSubcontractorBookingById = async (id: string): Promise<SubcontractorBooking | null> => {
  return apiFetch(`/api/subcontractor-bookings/${id}`).catch(() => null);
};

export const createSubcontractorBooking = async (data: any): Promise<SubcontractorBooking> => {
  return apiFetch('/api/subcontractor-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
};

export const deleteSubcontractorBooking = async (id: string): Promise<{ success: boolean }> => {
  return apiFetch(`/api/subcontractor-bookings/${id}`, {
    method: 'DELETE',
  });
};

export const updateSubcontractorBooking = async (id: string, updates: Partial<SubcontractorBooking>): Promise<SubcontractorBooking> => {
  return apiFetch(`/api/subcontractor-bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
};

export const reconcileSubcontractorBookingsApi = async () => {
  return apiFetch('/api/subcontractor-bookings/reconcile', {
    method: 'POST',
  });
};

export const manualOverrideBookingStatusApi = async (
  id: string,
  payload: {
    result: 'PASS' | 'FAIL';
    reason: string;
    sqcCode?: string;
    version?: number;
  }
): Promise<SubcontractorBooking> => {
  return apiFetch(`/api/subcontractor-bookings/${encodeURIComponent(id)}/manual-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const fetchSubcontractorInspections = async (): Promise<{ inspections: SubcontractorInspection[] }> => {
  return apiFetch('/api/subcontractor-inspections');
};

export const fetchSubcontractorReinspectionCosts = async (): Promise<{ costs: SubcontractorReinspectionCost[] }> => {
  return apiFetch('/api/subcontractor-reinspection-costs');
};

export const fetchRelatedSqcForBooking = async (
  bookingIdOrCode: string,
  signal?: AbortSignal
): Promise<RelatedSqcResponse> => {
  return apiFetch(`/api/subcontractor-bookings/${encodeURIComponent(bookingIdOrCode)}/related-sqc`, {
    signal,
  });
};

export const fetchRelatedBookingsForInspection = async (
  inspectionId: string,
  signal?: AbortSignal
): Promise<RelatedBookingsResponse> => {
  return apiFetch(`/api/inspections/${encodeURIComponent(inspectionId)}/related-bookings`, {
    signal,
  });
};

export const fetchInspectionTraceability = async (
  inspectionId: string,
  signal?: AbortSignal
): Promise<TraceabilityBundle> => {
  return apiFetch(`/api/inspections/${encodeURIComponent(inspectionId)}/traceability`, {
    signal,
  });
};

export const fetchPublicInspectionTraceability = async (
  inspectionId: string,
  signal?: AbortSignal
): Promise<TraceabilityBundle> => {
  return apiFetch(`/api/public/inspections/${encodeURIComponent(inspectionId)}/traceability`, {
    signal,
  });
};

export const fetchTraceabilityByCodes = async (
  params: { ipo?: string; po?: string; pr?: string; q?: string; inspectionId?: string },
  signal?: AbortSignal
): Promise<TraceabilityBundle> => {
  const qs = buildCleanQuery(params);
  return apiFetch(`/api/traceability${qs ? `?${qs}` : ''}`, { signal });
};

// --- SUPPLIERS API ---
export const findSupplierByName = async (name: string): Promise<{ supplier: Supplier | null }> => {
  return apiFetch(`/api/suppliers/find-by-name?name=${encodeURIComponent(name)}`);
};

export const fetchSuppliers = async (search: string = '', page: number = 1, limit: number = 20, sortBy: string = 'reports'): Promise<{ items: Supplier[], total: number }> => {
  const params = new URLSearchParams({ search, page: page.toString(), limit: limit.toString(), sortBy });
  return apiFetch(`/api/suppliers?${params.toString()}`);
};

export const saveSupplier = async (data: Partial<Supplier>): Promise<{ success: boolean, supplier: Supplier }> => {
  return apiFetch('/api/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
};

export const syncSuppliersFromBookingsApi = async (): Promise<{ success: boolean; updatedCount: number }> => {
  return apiFetch('/api/suppliers/sync-from-bookings', {
    method: 'POST',
  });
};


export const deleteSupplier = async (id: string): Promise<{ success: boolean }> => {
  return apiFetch(`/api/suppliers/${id}`, {
    method: 'DELETE',
  });
};

export const fetchSupplierStats = async (name: string): Promise<any> => {
  return apiFetch(`/api/suppliers/stats?name=${encodeURIComponent(name)}`);
};

export const fetchSupplierInspections = async (name: string): Promise<any> => {
  return apiFetch(`/api/suppliers/inspections?name=${encodeURIComponent(name)}`);
};

export const fetchSupplierMaterials = async (name: string): Promise<any> => {
  return apiFetch(`/api/suppliers/materials?name=${encodeURIComponent(name)}`);
};

// --- PO / PR & MATERIAL AUTO-LOOKUP ---
export const lookupPoMaterials = async (
  q: string,
  options?: { exact?: boolean }
): Promise<{ items: any[] }> => {
  const params = new URLSearchParams({ q });
  if (options?.exact) {
    params.set('exact', '1');
  }
  return apiFetch(`/api/po-materials/lookup?${params.toString()}`);
};

// --- INSPECTIONS API ---
// [Update - Danh Sách Phiếu] - [v3.1.0] - Chuẩn hóa truyền query params và để lỗi API hiển thị đúng Error Boundary
const buildCleanQuery = (filters: any = {}, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams();
  Object.entries({ ...(filters || {}), ...extra }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      params.set(k, String(v));
    }
  });
  return params.toString();
};

export const fetchInspections = async (filters: any = {}, page: number = 1, limit: number = 200): Promise<{ data: Inspection[], items?: Inspection[], total: number }> => {
  const qs = buildCleanQuery(filters, { page: page.toString(), limit: limit.toString() });
  return apiFetch(`/api/inspections?${qs}`);
};

export const fetchInspectionsDates = async (filters: any = {}): Promise<{ date: string, count?: number }[]> => {
  const qs = buildCleanQuery(filters);
  return apiFetch(`/api/inspections/dates${qs ? `?${qs}` : ''}`);
};

export const fetchInspectionsProjects = async (filters: any = {}): Promise<{ ma_ct: string, ten_ct: string, count: number }[]> => {
  const qs = buildCleanQuery(filters);
  return apiFetch(`/api/inspections/projects${qs ? `?${qs}` : ''}`);
};

export const fetchInspectionById = async (id: string): Promise<Inspection | null> => {
  const res = await apiFetch(`/api/inspections/${id}`).catch(async () => {
    const listRes = await apiFetch(`/api/inspections?search=${encodeURIComponent(id)}`);
    const items = Array.isArray(listRes) ? listRes : (listRes?.data || listRes?.items || []);
    return items[0] || null;
  });
  return res?.inspection || res?.data || res || null;
};

export const fetchPublicInspectionById = async (id: string): Promise<Inspection | null> => {
  const res = await apiFetch(`/api/public/inspections/${encodeURIComponent(id)}`).catch(() => null);
  return res?.inspection || res?.data || res || null;
};

export const saveInspectionToSheet = async (inspection: Inspection): Promise<{ success: boolean, inspection: Inspection }> => {
  return apiFetch('/api/inspections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inspection),
  });
};

export const deleteInspectionFromSheet = async (id: string): Promise<{ success: boolean }> => {
  return apiFetch(`/api/inspections/${id}`, {
    method: 'DELETE',
  });
};

export const deleteInspection = async (id: string): Promise<{ success: boolean }> => {
  return apiFetch(`/api/inspections/${id}`, {
    method: 'DELETE',
  });
};

export const fetchDeletedInspections = async (): Promise<Inspection[]> => {
  return apiFetch('/api/inspections/deleted').catch(() => []);
};

export const restoreInspection = async (id: string): Promise<{ success: boolean }> => {
  return apiFetch(`/api/inspections/${id}/restore`, {
    method: 'POST',
  });
};

export const permanentDeleteInspection = async (id: string): Promise<{ success: boolean }> => {
  return apiFetch(`/api/inspections/${id}/permanent`, {
    method: 'DELETE',
  });
};

export const fetchDashboardStats = async (filters: any = {}): Promise<any> => {
  const params = new URLSearchParams(filters);
  return apiFetch(`/api/dashboard/stats?${params.toString()}`);
};

// --- IPO API ---
export const fetchIpoData = async (page: number = 1, limit: number = 50, factoryOrder?: string, maTender?: string) => {
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  if (factoryOrder) params.append('factoryOrder', factoryOrder);
  if (maTender) params.append('maTender', maTender);
  return apiFetch(`/api/ipo?${params.toString()}`);
};

export const fetchIpoByFactoryOrder = async (factoryOrder: string) => {
  return apiFetch(`/api/ipo?factoryOrder=${encodeURIComponent(factoryOrder)}`);
};

export const fetchIpoDetailExtended = async (idFactoryOrder: string) => apiFetch(`/api/ipo/detail/${idFactoryOrder}`);

export const saveIpoDetailExtended = async (detail: any) => apiFetch('/api/ipo/detail', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(detail),
});

export const saveIpoDrawingRecord = async (drawing: any) => apiFetch('/api/ipo/drawings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(drawing),
});

export const saveIpoMaterialRecord = async (material: any) => apiFetch('/api/ipo/materials', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(material),
});

export const saveIpoSampleRecord = async (sample: any) => apiFetch('/api/ipo/samples', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(sample),
});

export const updateIpoSampleRecord = async (id: string, sample: any) => apiFetch(`/api/ipo/samples/${id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(sample),
});

export const deleteIpoSampleRecord = async (id: string) => apiFetch(`/api/ipo/samples/${id}`, { method: 'DELETE' });

// --- UPLOAD & STORAGE (SIGNED URL ADAPTER) ---
interface UploadStorageMeta {
  entityType?: string;
  type?: string;
  entityId?: string;
  role?: string;
}

function normalizeUploadMeta(metadata?: any): UploadStorageMeta {
  if (!metadata) return {};
  if (typeof metadata === 'string') return { role: metadata };
  if (typeof metadata === 'object') {
    return {
      entityType: metadata.entityType || metadata.type || 'GENERAL',
      entityId: metadata.entityId,
      role: metadata.role,
    };
  }
  return {};
}

export const getSignedDownloadUrl = async (keyOrUrl: string, ttlSeconds: number = 3600): Promise<string> => {
  const params = new URLSearchParams({ key: keyOrUrl, ttlSeconds: String(ttlSeconds) });
  const res = await apiFetch(`/api/storage/signed-download-url?${params.toString()}`);
  return String(res?.url || keyOrUrl);
};

async function postUploadFile(
  file: File | Blob,
  filename?: string,
  metadata?: any,
  onProgress?: (pct: number) => void
): Promise<string> {
  const meta = normalizeUploadMeta(metadata);
  const safeFilename = filename || (file instanceof File ? file.name : '') || `upload_${Date.now()}.png`;
  const contentType = file.type || 'application/octet-stream';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    onProgress?.(10);
    // Step 1: Request short-lived HMAC Signed Upload URL from server
    const grant = await apiFetch('/api/storage/signed-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: safeFilename,
        contentType,
        entityType: meta.entityType || meta.type || 'GENERAL',
        entityId: meta.entityId,
        role: meta.role,
      }),
      signal: controller.signal,
    });

    if (!grant?.uploadUrl) {
      throw new Error('Máy chủ không cấp được Signed Upload URL.');
    }

    onProgress?.(35);
    // Step 2: PUT binary content directly to the Signed URL endpoint (no auth header needed; verified by HMAC signature)
    const putResp = await fetch(grant.uploadUrl, {
      method: grant.method || 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const respContentType = putResp.headers.get('content-type') || '';
    if (!putResp.ok) {
      let errMsg = `Signed upload failed (${putResp.status})`;
      if (respContentType.includes('application/json')) {
        const errData = await putResp.json().catch(() => ({}));
        errMsg = errData.error || errData.message || errMsg;
      } else {
        const text = await putResp.text().catch(() => '');
        if (text) errMsg = `Signed upload failed (${putResp.status}): ${text.slice(0, 120)}`;
      }
      void fetch('/api/system/audit-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ method: 'PUT', path: '/api/storage/upload', statusCode: putResp.status, errorMessage: errMsg }),
      }).catch(() => {});
      throw new Error(errMsg);
    }

    onProgress?.(100);
    const data = await putResp.json().catch(() => ({}));
    const url = String(data.url || grant.accessUrl || '');
    if (!url) throw new Error('Server không trả về URL hình ảnh sau khi tải lên');
    return url;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      const msg = 'Tải ảnh lên quá thời gian chờ (30s)';
      void fetch('/api/system/audit-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ method: 'PUT', path: '/api/storage/upload', statusCode: 408, errorMessage: msg }),
      }).catch(() => {});
      throw new Error(msg);
    }
    throw err;
  }
}

export const uploadQMSImage = async (
  fileOrDataUrl: File | Blob | string,
  metadata?: any,
  _arg3?: any,
  _arg4?: any,
  onProgress?: (pct: number) => void
): Promise<string> => {
  if (typeof fileOrDataUrl === 'string') {
    const trimmed = fileOrDataUrl.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/uploads/') ||
      trimmed.startsWith('/api/storage/files/')
    ) {
      return trimmed;
    }
    if (trimmed.startsWith('data:')) {
      const res = await fetch(trimmed);
      const blob = await res.blob();
      const rawExt = (blob.type.split('/')[1] || 'png').split(';')[0].split('+')[0];
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      return postUploadFile(blob, `upload_${Date.now()}.${ext}`, metadata, onProgress);
    }
    return trimmed;
  }

  return postUploadFile(fileOrDataUrl, fileOrDataUrl instanceof File ? fileOrDataUrl.name : undefined, metadata, onProgress);
};

export const uploadFileToStorage = async (file: File | Blob | string, customName?: string, metadata?: any): Promise<string> => {
  if (typeof file === 'string') {
    if (file.trim().startsWith('data:')) {
      const res = await fetch(file);
      const blob = await res.blob();
      return postUploadFile(blob, customName || `upload_${Date.now()}.png`, metadata);
    }
    return uploadQMSImage(file, metadata);
  }
  return postUploadFile(file, customName || (file instanceof File ? file.name : undefined), metadata);
};

// --- PLANS & MATERIALS & PROJECTS ---
export const fetchPlans = async (search: string = '', page: number = 1, limit: number = 50): Promise<{ items: any[]; total: number }> => {
  const params = new URLSearchParams({ search, page: String(page), limit: String(limit) });
  const res = await apiFetch(`/api/plans?${params.toString()}`).catch(() => ({ items: [], total: 0 }));
  if (Array.isArray(res)) return { items: res, total: res.length };
  return { items: res?.items || [], total: Number(res?.total || (res?.items?.length ?? 0)) };
};

export const fetchPlansByProject = async (projectId: string): Promise<any[]> => {
  const res = await apiFetch(`/api/plans?projectId=${encodeURIComponent(projectId)}`).catch(() => []);
  return Array.isArray(res) ? res : (res?.items || []);
};

export const fetchMaterials = async (search: string = '', page: number = 1, limit: number = 50): Promise<any> => {
  const params = new URLSearchParams({ search, page: page.toString(), limit: limit.toString() });
  return apiFetch(`/api/materials?${params.toString()}`);
};

export const saveMaterial = async (material: any) => {
  return apiFetch(material.id ? `/api/materials/${material.id}` : '/api/materials', {
    method: material.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(material),
  });
};

export const deleteMaterial = async (id: string) => {
  return apiFetch(`/api/materials/${id}`, { method: 'DELETE' });
};

export const fetchProjects = async (search: string = '', page: number = 1, limit: number = 1000): Promise<{ items: Project[]; total: number }> => {
  const params = new URLSearchParams({ search, page: String(page), limit: String(limit) });
  const res = await apiFetch(`/api/projects?${params.toString()}`);
  if (Array.isArray(res)) return { items: res, total: res.length };
  return { items: res?.items || [], total: Number(res?.total || (res?.items?.length ?? 0)) };
};

export const fetchProjectByCode = async (code: string): Promise<Project | null> => apiFetch(`/api/projects/${encodeURIComponent(code)}`).catch(() => null);

export const updateProject = async (project: Partial<Project>): Promise<Project> => apiFetch(`/api/projects/${encodeURIComponent(String(project.id || project.ma_ct || ''))}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(project),
});

// --- NCRs API ---
export const fetchNcrs = async (filters: any = {}, page: number = 1, limit: number = 50): Promise<{ items: any[], total: number }> => {
  const params = new URLSearchParams({ ...filters, page: page.toString(), limit: limit.toString() });
  return apiFetch(`/api/ncrs?${params.toString()}`);
};

export const fetchNcrById = async (id: string): Promise<any> => apiFetch(`/api/ncrs/${id}`).catch(() => null);

export const deleteNcr = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/ncrs/${id}`, { method: 'DELETE' });

export const saveNcrMapped = async (ncr: any): Promise<any> => apiFetch('/api/ncrs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(ncr),
});

// --- DEFECT LIBRARY ---
export const fetchDefects = async (filters: { status?: string } = {}): Promise<{ items: any[]; total: number }> => {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'ALL') {
    params.set('status', filters.status);
  }
  const qs = params.toString();
  const res = await apiFetch(`/api/defects${qs ? `?${qs}` : ''}`).catch(() => ({ items: [], total: 0 }));
  if (Array.isArray(res)) return { items: res, total: res.length };
  return { items: res?.items || [], total: Number(res?.total || (res?.items?.length ?? 0)) };
};

export const fetchDefectLibrary = async (): Promise<DefectLibraryItem[]> => apiFetch('/api/defect-library').catch(() => []);

export const saveDefectLibraryItem = async (item: any): Promise<DefectLibraryItem> => apiFetch('/api/defect-library', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(item),
});

export const deleteDefectLibraryItem = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/defect-library/${id}`, { method: 'DELETE' });

// --- USERS & ROLES ---
export const fetchUsers = async (): Promise<User[]> => apiFetch('/api/users').then(res => res.users || res || []);

export const fetchUserById = async (id: string): Promise<User> => apiFetch(`/api/users/${encodeURIComponent(id)}`);

export const saveUser = async (user: Partial<User>): Promise<{ success: boolean, user: User }> => apiFetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(user),
});

export const importUsersBatch = async (users: any[]): Promise<{ count: number }> => apiFetch('/api/users/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ users }),
});

export const deleteUser = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/users/${id}`, { method: 'DELETE' });

export const fetchRoles = async (): Promise<any[]> => apiFetch('/api/roles').catch(() => []);

export const saveRole = async (role: Partial<RoleObject> | Role): Promise<RoleObject> => apiFetch('/api/roles', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(role),
});

export const deleteRole = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/roles/${id}`, { method: 'DELETE' });

// --- FLOOR PLANS & PINS ---
export const fetchFloorPlans = async (projectId: string): Promise<FloorPlan[]> => apiFetch(`/api/floor-plans?projectId=${encodeURIComponent(projectId)}`).catch(() => []);

export const saveFloorPlan = async (plan: Partial<FloorPlan>): Promise<FloorPlan> => apiFetch('/api/floor-plans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(plan),
});

export const deleteFloorPlan = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/floor-plans/${id}`, { method: 'DELETE' });

export const fetchLayoutPins = async (floorPlanId: string): Promise<LayoutPin[]> => apiFetch(`/api/layout-pins?floorPlanId=${encodeURIComponent(floorPlanId)}`).catch(() => []);

export const saveLayoutPin = async (pin: Partial<LayoutPin>): Promise<LayoutPin> => apiFetch('/api/layout-pins', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(pin),
});

// --- PROJECT DOCUMENTS ---
export const fetchProjectDocuments = async (projectId: string): Promise<ProjectDocument[]> => apiFetch(`/api/projects/${projectId}/documents`).catch(() => []);

export const saveProjectDocument = async (doc: Partial<ProjectDocument>): Promise<ProjectDocument> => apiFetch('/api/projects/documents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(doc),
});

export const deleteProjectDocument = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/projects/documents/${id}`, { method: 'DELETE' });

// --- WORKSHOPS & TEMPLATES ---
export const fetchWorkshops = async (): Promise<Workshop[]> => apiFetch('/api/workshops').catch(() => []);

export const saveWorkshop = async (ws: Partial<Workshop>): Promise<Workshop> => apiFetch('/api/workshops', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(ws),
});

export const deleteWorkshop = async (id: string): Promise<{ success: boolean }> => apiFetch(`/api/workshops/${id}`, { method: 'DELETE' });

export const fetchTemplates = async (): Promise<Record<string, any[]>> => apiFetch('/api/templates').catch(() => ({}));

export const saveTemplate = async (id: string, items: any[]): Promise<{ success: boolean }> => apiFetch(`/api/templates/${id}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items }),
});

// --- NOTIFICATIONS ---
export const fetchNotifications = async (userId?: string, page: number = 1, limit: number = 50): Promise<any[]> => {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  params.append('page', String(page));
  params.append('limit', String(limit));
  return apiFetch(`/api/notifications?${params.toString()}`).catch(() => []);
};

export const markNotificationAsRead = async (id: string, userId?: string): Promise<{ success: boolean }> => apiFetch(`/api/notifications/${id}/read`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId }),
});

export const markAllNotificationsAsRead = async (userId?: string): Promise<{ success: boolean }> => apiFetch('/api/notifications/read-all', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId }),
});

export const createNotification = async (params: any): Promise<any> => apiFetch('/api/notifications', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(params),
});

// --- IMPORT / EXPORT HELPERS ---
const importFileHelper = async (url: string, file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Import failed' }));
    throw new Error(errorData.error || 'Import failed');
  }
  return response.json();
};

const exportFileHelper = async (url: string, filenamePrefix: string, format: string = 'xlsx'): Promise<void> => {
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${filenamePrefix}_${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
};

export const exportDefectLibrary = async (format: string = 'xlsx') => exportFileHelper(`/api/export/defects?format=${format}`, 'AATN_Defect_Library', format);
export const importDefectLibraryFile = async (file: File) => importFileHelper('/api/import/defects', file);

export const exportNcrs = async (format: string = 'xlsx') => exportFileHelper(`/api/export/ncrs?format=${format}`, 'AATN_NCR_List', format);
export const importNcrsFile = async (file: File) => importFileHelper('/api/import/ncrs', file);

export const exportMaterials = async (format: string = 'xlsx') => exportFileHelper(`/api/export/materials?format=${format}`, 'AATN_Materials', format);
export const importMaterialsFile = async (file: File) => importFileHelper('/api/import/materials', file);

export const exportSuppliers = async (format: string = 'xlsx') => exportFileHelper(`/api/export/suppliers?format=${format}`, 'AATN_Suppliers', format);
export const importSuppliersFile = async (file: File) => importFileHelper('/api/import/suppliers', file);

export const exportInspections = async (filters: any = {}, format: string = 'csv') => {
  const params = new URLSearchParams({ ...filters, format });
  return exportFileHelper(`/api/export/inspections?${params.toString()}`, 'AATN_Inspections', format);
};
export const importInspectionsFile = async (file: File) => importFileHelper('/api/import/inspections', file);

export const exportIpoData = async (filters: any = {}, format: string = 'csv') => {
  const params = new URLSearchParams({ ...filters, format });
  return exportFileHelper(`/api/export/ipo?${params.toString()}`, 'AATN_IPO_Data', format);
};
export const importIpoFile = async (file: File) => importFileHelper('/api/import/ipo', file);

export const checkApiConnection = async (): Promise<{ ok: boolean }> => {
  try {
    const response = await fetch('/api/health');
    return { ok: response.ok };
  } catch (e) {
    return { ok: false };
  }
};

// --- TOOL MANAGEMENT ---
export const fetchToolCatalogs = async () => apiFetch('/api/tool-catalogs');
export const saveToolCatalog = async (catalog: any) => apiFetch('/api/tool-catalogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catalog) });
export const deleteToolCatalog = async (id: string) => apiFetch(`/api/tool-catalogs/${id}`, { method: 'DELETE' });

export const fetchToolAssets = async () => apiFetch('/api/tool-assets');
export const fetchToolAssetsByCatalog = async (catalogId: string) => apiFetch(`/api/tool-catalogs/${catalogId}/assets`);
export const saveToolAsset = async (asset: any) => apiFetch('/api/tool-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asset) });
export const deleteToolAsset = async (id: string) => apiFetch(`/api/tool-assets/${id}`, { method: 'DELETE' });

export const fetchToolTransfers = async (assetId: string) => apiFetch(`/api/tool-assets/${assetId}/transfers`);
export const saveToolTransfer = async (transfer: any) => apiFetch('/api/tool-transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transfer) });

export const fetchToolCalibrations = async (assetId: string) => apiFetch(`/api/tool-assets/${assetId}/calibrations`);
export const saveToolCalibration = async (calib: any) => apiFetch('/api/tool-calibrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calib) });

// --- AUDIT LOGS & USER ACTIVITY & ORGANIZATION ---
export const fetchInspectionAuditLogs = async (id: string) => apiFetch(`/api/inspections/${id}/audit-logs`);
export const fetchDepartments = async () => apiFetch('/api/departments');
export const saveDepartment = async (dept: any) => apiFetch('/api/departments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(dept),
});
export const deleteDepartment = async (id: string) => apiFetch(`/api/departments/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const fetchDivisions = async () => apiFetch('/api/divisions');
export const saveDivision = async (div: any) => apiFetch('/api/divisions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(div),
});
export const deleteDivision = async (id: string) => apiFetch(`/api/divisions/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const fetchTeams = async () => apiFetch('/api/teams');
export const saveTeam = async (team: any) => apiFetch('/api/teams', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(team),
});
export const deleteTeam = async (id: string) => apiFetch(`/api/teams/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const syncDepartmentsAdmin = async () => apiFetch('/api/admin/sync-departments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});
export const fetchUserActivity = async (userId: string) => apiFetch(`/api/users/${userId}/activity`);

// --- SYSTEM AUDIT & 12-MODULE DIAGNOSTICS ---
export interface ApiErrorLogEntry {
  id: string;
  moduleId: string;
  moduleName: string;
  method: string;
  path: string;
  statusCode: number;
  errorMessage: string;
  userId?: string | null;
  durationMs: number;
  timestamp: number;
  details?: any;
}

export interface ModuleProbeResult {
  moduleId: string;
  moduleName: string;
  endpoint: string;
  table: string;
  status: 'OK' | 'ERROR';
  httpStatus: number;
  rowCount: number;
  latencyMs: number;
  message: string;
}

export interface SystemAuditErrorsResponse {
  items: ApiErrorLogEntry[];
  total: number;
  summary: Array<{ module_id: string; status_code: number; cnt: number }>;
  modules: Array<{ moduleId: string; moduleName: string }>;
}

export const fetchSystemAuditErrors = async (filters: {
  limit?: number;
  moduleId?: string;
  statusGroup?: string;
  search?: string;
} = {}): Promise<SystemAuditErrorsResponse> => {
  const params = new URLSearchParams();
  params.set('limit', String(filters.limit || 50));
  if (filters.moduleId && filters.moduleId !== 'ALL') params.set('moduleId', filters.moduleId);
  if (filters.statusGroup && filters.statusGroup !== 'ALL') params.set('statusGroup', filters.statusGroup);
  if (filters.search && filters.search.trim()) params.set('search', filters.search.trim());
  return apiFetch(`/api/system/audit-errors?${params.toString()}`);
};

export const probeAllModules = async (): Promise<{ checkedAt: number; results: ModuleProbeResult[] }> => {
  return apiFetch('/api/system/probe-modules', { method: 'POST' });
};

export const clearSystemAuditErrors = async (): Promise<{ success: boolean }> => {
  return apiFetch('/api/system/audit-errors', { method: 'DELETE' });
};
