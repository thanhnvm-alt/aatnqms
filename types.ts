
export enum CheckStatus {
  PENDING = 'PENDING',
  PASS = 'Đạt',
  FAIL = 'Hỏng', 
  CONDITIONAL = 'Có điều kiện'
}

export enum InspectionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  VERIFIED = 'verified',
  LOCKED = 'locked',
  PENDING = 'pending',
  COMPLETED = 'completed',
  FLAGGED = 'flagged'
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export type ViewState = 'DASHBOARD' | 'LIST' | 'FORM' | 'DETAIL' | 'PLAN' | 'PLAN_DETAIL' | 'SETTINGS' | 'PROJECTS' | 'PROJECT_DETAIL' | 'CONVERT_3D' | 'NCR_LIST' | 'DEFECT_LIBRARY' | 'DEFECT_DETAIL' | 'DEFECT_LIST' | 'SUPPLIERS' | 'SUPPLIER_DETAIL' | 'IPO' | 'MATERIALS' | 'TRASH' | 'TOOLS';

export type ModuleId = 
  | 'IQC' | 'SQC_MAT' | 'SQC_VT' | 'SQC_BTP' | 'PQC' | 'FSR' | 'STEP' | 'FQC' | 'SPR' | 'SITE' | 'PROJECTS' | 'OEM' | 'SETTINGS' | 'CONVERT_3D' | 'DEFECTS' | 'SUPPLIERS' | 'TOOLS'
  | 'DASHBOARD' | 'LIST' | 'NCR_LIST' | 'DEFECT_LIBRARY' | 'MATERIALS' | 'IPO' | 'TRASH'
  | 'SETTINGS_TEMPLATE' | 'SETTINGS_USERS' | 'SETTINGS_ROLES' | 'SETTINGS_WORKSHOPS' | 'SETTINGS_PROFILE' | 'SETTINGS_DEPARTMENTS' | 'SYSTEM_ADMIN';

export interface IPOItem {
  id: string;
  ma_nha_may: string;
  ma_ct: string;
  ten_ct: string;
  ten_hang_muc: string;
  so_luong_ipo: number;
  dvt: string;
  drawing_url?: string;
  description?: string;
  materials_text?: string;
  samples_json?: string;
  simulations_json?: string;
  created_at?: number;
  headcode?: string;
}

export interface IPOResponse {
  id: string;
  headcode?: string;
  maCongTrinh: string;
  tenCongTrinh: string;
  maNhaMay: string;
  tenHangMuc: string;
  dvt: string;
  soLuongIpo: number;
  ngayTao: string;
}

export interface FloorPlan {
  id: string;
  project_id: string;
  name: string;
  image_url: string;
  version: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  updated_at: number;
  file_name?: string;
  active_inspections?: number;
}

export interface LayoutPin {
  id: string;
  floor_plan_id: string;
  inspection_id?: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label?: string;
  status: InspectionStatus | 'NEW';
  headcode?: string;
  type?: string;
}

// Added Workshop interface to fix module export error
export interface Workshop {
  id: string;
  code: string;
  name: string;
  location: string;
  manager: string;
  phone: string;
  image?: string;
  stages: string[];
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  category?: string;
  status: 'ACTIVE' | 'INACTIVE';
  data?: string;
  updated_at?: number;
  stats?: {
    total_pos: number;
    pass_rate: number;
    defect_rate: number;
    total_inspected?: number;
    total_passed?: number;
    total_failed?: number;
  };
}

export interface QMSImage {
  id: string;
  parent_entity_id: string;
  related_item_id?: string;
  entity_type: 'INSPECTION' | 'NCR' | 'DEFECT' | 'USER' | 'COMMENT';
  image_role: 'EVIDENCE' | 'BEFORE' | 'AFTER' | 'PREVIEW';
  url_hd: string;
  url_thumbnail: string;
  created_at: number;
}

export type UserRole = 'ADMIN' | 'MANAGER' | 'QC' | 'QA';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: string | UserRole;
  avatar: string;
  allowedModules?: ModuleId[];
  msnv?: string;
  email?: string;
  status?: string;
  position?: string;
  workLocation?: string;
  joinDate?: string;
  education?: string;
  endDate?: string;
  notes?: string;
  phong_ban?: string;
  bo_phan?: string;
  phongBan?: string;
  boPhan?: string;
  to_qc?: string;
  toQC?: string;
  la_to_truong?: boolean;
  laToTruong?: boolean;
  team_id?: string;
  department_id?: string;
  division_id?: string;
  user_permissions?: any;
  userPermissions?: any;
}

export interface NCRComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  image_refs?: string[];
  attachments?: string[];
  userAvatar?: string;
}

export interface NCR {
  id: string;
  inspection_id?: string;
  itemId?: string;
  defect_code?: string;
  createdDate: string;
  issueDescription: string;
  rootCause: string;
  solution: string; 
  preventiveAction: string;
  responsiblePerson: string;
  deadline?: string;
  status: string;
  severity?: 'MINOR' | 'MAJOR' | 'CRITICAL';
  ma_ct?: string;
  ten_ct?: string;
  ten_hang_muc?: string;
  workshop?: string;
  inspectorName?: string;
  image_refs_before: string[]; 
  image_refs_after: string[];  
  imagesBefore?: string[];
  imagesAfter?: string[];
  comments?: NCRComment[];
  createdBy?: string;
  closedBy?: string;
  closedDate?: string;
}

export interface CheckItem {
  id: string;
  stage?: string;
  category: string;
  label: string;
  method?: string;
  standard?: string;
  status: CheckStatus;
  notes?: string;
  image_refs?: string[]; 
  images?: string[];
  ncrId?: string;
  ncr?: NCR;
  frequency?: string;
  defectIds?: string[];
}

export interface MaterialIQC {
  id: string;
  name: string;
  category: string;
  inspectType: '100%' | 'AQL';
  scope: 'COMMON' | 'PROJECT';
  projectCode?: string;
  projectName?: string;
  orderQty: number;
  deliveryQty: number;
  unit: string;
  criteria: any[];
  items: CheckItem[];
  inspectQty: number;
  passQty: number;
  failQty: number;
  images: string[];
  type: string;
  date: string;
}

export interface Material {
  id: string;
  material: string;
  shortText: string;
  orderUnit: string;
  orderQuantity: number;
  supplierName?: string;
  projectName?: string;
  purchaseDocument?: string;
  deliveryDate?: string;
  Ma_Tender?: string;
  Factory_Order?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupportingDoc {
    id: string;
    name: string;
    verified: boolean;
    notes?: string;
}

export interface Inspection {
  id: string;
  type?: ModuleId;
  ma_ct: string;
  po_number?: string;
  ten_ct: string;
  ma_nha_may?: string;
  ten_hang_muc?: string;
  inspectorName: string;
  date: string;
  status: InspectionStatus;
  score: number;
  items: CheckItem[]; 
  image_refs?: string[]; 
  images?: string[];
  summary?: string;
  created_by?: string;
  workshop?: string;
  ma_xuong?: string;
  inspectionStage?: string;
  stage?: string;
  dvt?: string;
  so_luong_ipo: number;
  inspectedQuantity?: number;
  passedQuantity?: number;
  failedQuantity?: number;
  signature_ref?: string; 
  signature?: string;
  manager_signature_ref?: string;
  managerSignature?: string;
  managerName?: string;
  teamLeadSignature?: string;
  teamLeadName?: string;
  teamLeadDate?: string;
  productionSignature?: string;
  productionName?: string;
  productionConfirmedDate?: string;
  pmSignature?: string;
  pmComment?: string;
  pmName?: string;
  confirmedDate?: string;
  supplier?: string;
  location?: string;
  updatedAt?: string;
  createdAt?: string;
  headcode?: string;
  materials?: MaterialIQC[];
  supportingDocs?: SupportingDoc[];
  referenceDocs?: string[];
  supplierAddress?: string;
  reportImage?: string;
  reportImages?: string[];
  deliveryNoteImage?: string;
  deliveryNoteImages?: string[];
  drawingImages?: string[];
  comments?: NCRComment[];
  priority?: Priority;
  floor_plan_id?: string;
  coord_x?: number;
  coord_y?: number;
  responsiblePerson?: string;
  productionComment?: string;
  materials_json?: string;
  items_json?: string;
}

export interface SmartGoal {
  id: string;
  title: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  ma_ct: string;
  ten_ct: string;
  status: 'In Progress' | 'Completed' | 'On Hold' | 'Planning';
  startDate: string;
  endDate: string;
  pm?: string;
  pc?: string;
  qa?: string;
  progress: number;
  thumbnail?: string;
  description?: string;
  location?: string;
  images?: string[];
  smartGoals?: SmartGoal[];
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  ma_ct: string;
  name: string;
  version: string;
  issueDate: string;
  updateDate: string;
  fileUrl?: string;
  description?: string;
  createdBy: string;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
}

export interface Defect {
  id: string;
  inspectionId: string;
  defectCode: string;
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  date: string;
  inspectorName: string;
  ma_ct: string;
  images?: string[];
  rootCause?: string;
  solution?: string;
  responsiblePerson?: string;
  deadline?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'INSPECTION' | 'NCR' | 'COMMENT' | 'DEADLINE' | 'INFO' | 'SUCCESS' | 'MESSAGE';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number;
  link?: { view: ViewState, id: string };
}

export type PermissionAction = 'VIEW' | 'VIEW_ALL' | 'CREATE' | 'EDIT' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'SIGN1' | 'SIGN2' | 'EDIT_OWN' | 'EDIT_ALL' | 'DELETE_OWN' | 'DELETE_ALL';

export interface ModulePermission {
  moduleId: ModuleId;
  actions: PermissionAction[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: ModulePermission[];
  allowedModules: ModuleId[];
  isSystem?: boolean;
  isPosition?: boolean;
}

export interface DefectLibraryItem {
  id: string;
  code: string;
  name: string;
  description: string;
  stage: string;
  category: string;
  severity: string;
  rootCause?: string; // Add root cause
  suggestedAction?: string;
  correctImage?: string;
  incorrectImage?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface ToolCatalog {
  id: string;
  code: string;
  name: string;
  type?: string;
  specifications?: string;
  manual_markdown?: string;
  manual_pdf_url?: string;
  created_at: number;
  updated_at: number;
  created_by: string;
}

export interface ToolAsset {
  id: string;
  catalog_id: string;
  asset_code: string;
  serial_number?: string;
  current_user_id?: string;
  next_calibration_date?: number | null;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'BROKEN' | 'LOST';
  created_at: number;
  updated_at: number;
  created_by: string;
}

export interface ToolTransfer {
  id: string;
  tool_asset_id: string;
  from_user_id?: string;
  to_user_id: string;
  status: 'PENDING' | 'CONFIRMED' | 'APPROVED' | 'REJECTED';
  request_date: number;
  receiver_confirm_date?: number | null;
  receiver_signature?: string;
  receiver_image?: string;
  manager_approve_date?: number | null;
  manager_signature?: string;
  notes?: string;
}

export interface ToolCalibration {
  id: string;
  tool_asset_id: string;
  request_date: number;
  requested_by: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  calibration_date?: number | null;
  next_calibration_date?: number | null;
  certificate_url?: string;
  approved_by?: string;
  notes?: string;
}

export const canUserModifyInspection = (inspection: any, user: any, usersList?: any[]): boolean => {
  if (!user) return false;
  
  // 1. ADMIN has absolute supreme exemption from all locks, rules, and creator restrictions.
  if (user.role === 'ADMIN') return true;
  
  // 2. Immutable Locked State:
  // If the coupon has been closed (APPROVED) or verified (team lead signed L1), it is locked immutable.
  const isLockedStatus = 
    inspection.status === 'approved' || 
    inspection.status === 'verified' || 
    inspection.status === 'completed' || 
    !!inspection.teamLeadSignature || 
    !!inspection.managerSignature;
    
  if (isLockedStatus) return false;
  
  // Department-Lock: Rule 1.2
  // "chỉ hạn chế quyền Sửa/Ký đối với người phòng ban khác"
  const cache = usersList || (typeof window !== 'undefined' ? (window as any).__usersCache : null);
  if (cache && Array.isArray(cache)) {
    const creatorUser = cache.find(u => u.name === inspection.inspectorName || u.name === inspection.created_by);
    if (creatorUser) {
      const creatorDept = (creatorUser.phong_ban || creatorUser.phongBan || '').trim().toLowerCase();
      const userDept = (user.phong_ban || user.phongBan || '').trim().toLowerCase();
      if (creatorDept && userDept && creatorDept !== userDept) {
        return false; // restricted for other department
      }
    }
  }
  
  // 3. Creator-Only or authorized teammate in same department with EDIT permission
  const isCreator = inspection.inspectorName === user.name || inspection.created_by === user.username || inspection.createdBy === user.name;
  const moduleId = (inspection.type || 'PQC') as ModuleId;
  const globalRoles = typeof window !== 'undefined' ? (window as any).__rolesCache : [];

  // If user has direct module access without custom matrix permissions setup, fallback to old behavior
  const userPerms = user.userPermissions || user.user_permissions;
  const hasCustomMatrix = userPerms && Array.isArray(userPerms) && userPerms.length > 0;

  if (!hasCustomMatrix && user.allowedModules?.includes(moduleId)) {
    return true;
  }

  if (isCreator) {
    if (hasPermission(user, globalRoles, moduleId, 'EDIT_OWN') || 
        hasPermission(user, globalRoles, moduleId, 'EDIT_ALL') || 
        hasPermission(user, globalRoles, moduleId, 'EDIT')) {
      return true;
    }
  } else {
    if (hasPermission(user, globalRoles, moduleId, 'EDIT_ALL') || 
        hasPermission(user, globalRoles, moduleId, 'EDIT')) {
      return true;
    }
  }
  
  return false;
};

export const canUserDeleteInspection = (inspection: any, user: any, usersList?: any[]): boolean => {
  if (!user) return false;
  
  // 1. ADMIN has absolute supreme exemption
  if (user.role === 'ADMIN') return true;
  
  // 2. Immutable Locked State:
  const isLockedStatus = 
    inspection.status === 'approved' || 
    inspection.status === 'verified' || 
    inspection.status === 'completed' || 
    !!inspection.teamLeadSignature || 
    !!inspection.managerSignature;
    
  if (isLockedStatus) return false;
  
  // Department check - only members of the same department (or ADMIN) can delete
  const cache = usersList || (typeof window !== 'undefined' ? (window as any).__usersCache : null);
  if (cache && Array.isArray(cache)) {
    const creatorUser = cache.find(u => u.name === inspection.inspectorName || u.name === inspection.created_by);
    if (creatorUser) {
      const creatorDept = (creatorUser.phong_ban || creatorUser.phongBan || '').trim().toLowerCase();
      const userDept = (user.phong_ban || user.phongBan || '').trim().toLowerCase();
      if (creatorDept && userDept && creatorDept !== userDept) {
        return false;
      }
    }
  }
  
  const isCreator = inspection.inspectorName === user.name || inspection.created_by === user.username || inspection.createdBy === user.name;
  const moduleId = (inspection.type || 'PQC') as ModuleId;
  const globalRoles = typeof window !== 'undefined' ? (window as any).__rolesCache : [];

  const userPerms = user.userPermissions || user.user_permissions;
  const hasCustomMatrix = userPerms && Array.isArray(userPerms) && userPerms.length > 0;

  if (!hasCustomMatrix && user.allowedModules?.includes(moduleId)) {
    return true;
  }

  if (isCreator) {
    if (hasPermission(user, globalRoles, moduleId, 'DELETE_OWN') || 
        hasPermission(user, globalRoles, moduleId, 'DELETE_ALL') || 
        hasPermission(user, globalRoles, moduleId, 'DELETE')) {
      return true;
    }
  } else {
    if (hasPermission(user, globalRoles, moduleId, 'DELETE_ALL') || 
        hasPermission(user, globalRoles, moduleId, 'DELETE')) {
      return true;
    }
  }
  
  return false;
};

export const hasPermission = (
  user: any,
  rolesList: Role[],
  moduleId: ModuleId,
  action: PermissionAction = 'VIEW'
): boolean => {
  if (!user) return false;
  
  // 1. SYSTEM_ADMIN checked first - if user has specific permission on SYSTEM_ADMIN, they might be a "Partial Admin"
  // However, traditionally ADMIN role was supreme. We keep that but allow SYSTEM_ADMIN to grant similar powers.
  if (user.role === 'ADMIN' || user.username?.toLowerCase() === 'admin') return true;

  // Let's gather all merged/inherited permissions for this user
  const matchedPermissions: ModulePermission[] = [];

  // A. Add user-specific custom matrix permissions if available
  let rawPerms = user.userPermissions || user.user_permissions || user.permissions;
  let userPerms: any[] = [];
  if (typeof rawPerms === 'string') {
      try {
          userPerms = JSON.parse(rawPerms);
      } catch (e) {
          userPerms = [];
      }
  } else if (Array.isArray(rawPerms)) {
      userPerms = rawPerms;
  }

  if (userPerms && Array.isArray(userPerms)) {
    matchedPermissions.push(...userPerms);
  }

  // B. SUPREME CHECK: If user has this action on 'SYSTEM_ADMIN' module, they have it on EVERYTHING.
  // This fulfills "Option B": SYSTEM_ADMIN acts as a master permission matrix.
  const systemAdminMatrix = matchedPermissions.find(p => p.moduleId === 'SYSTEM_ADMIN');
  if (systemAdminMatrix && systemAdminMatrix.actions && systemAdminMatrix.actions.includes(action)) {
      return true;
  }

  // Evaluate matrix specifically for this module
  const moduleMatrix = matchedPermissions.filter(
    p => String(p.moduleId).toLowerCase() === String(moduleId).toLowerCase()
  );

  if (moduleMatrix.length > 0) {
    // If matrix entry exists for this module, it is the SOURCE OF TRUTH for actions
    const hasAction = moduleMatrix.some(p => p.actions && p.actions.includes(action));
    return hasAction;
  }

  // If no matrix entry exists for THIS module, fall back to simple allowedModules list
  const list = user.allowedModules || [];
  if (list.includes(moduleId)) {
    if (action === 'VIEW' || action === 'CREATE' || action === 'EDIT') {
      return true;
    }
    if (user.role === 'MANAGER' && (action === 'SIGN1' || action === 'SIGN2')) {
      return true;
    }
  }
  
  return false;
};

