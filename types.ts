export type Role = string;
export type UserRole = Role;

export interface RoleObject {
  id: string;
  name: string;
  permissions?: any[];
  isPosition?: boolean;
  [key: string]: any;
}

export const CheckStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  NA: 'NA',
  PENDING: 'PENDING',
  CONDITIONAL: 'CONDITIONAL'
} as const;
export type CheckStatus = typeof CheckStatus[keyof typeof CheckStatus];

export const InspectionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VERIFIED: 'VERIFIED',
  LOCKED: 'LOCKED',
  COMPLETED: 'COMPLETED',
  FLAGGED: 'FLAGGED',
  PENDING: 'PENDING'
} as const;
export type InspectionStatus = typeof InspectionStatus[keyof typeof InspectionStatus];

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const;
export type Priority = typeof Priority[keyof typeof Priority];

export type ModuleId = string;
export type ViewState = string;

export interface SupportingDoc {
  id: string;
  name: string;
  url: string;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  password?: string;
  email?: string;
  msnv?: string;
  position?: string;
  role: Role;
  avatar?: string;
  allowedModules?: string[];
  workLocation?: string;
  work_location?: string;
  phong_ban?: string;
  phongBan?: string;
  bo_phan?: string;
  to_qc?: string;
  la_to_truong?: boolean;
  status?: string;
  signature_template?: string;
  signatureTemplate?: string;
  joinDate?: string;
  education?: string;
  notes?: string;
  department_id?: string;
  division_id?: string;
  team_id?: string;
  user_permissions?: any[];
  userPermissions?: any[];
  [key: string]: any;
}

export interface Workshop {
  id: string;
  name: string;
  code?: string;
  address?: string;
  location?: string;
  stages?: string[];
  manager?: string;
  phone?: string;
  image?: string;
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
  status?: string;
  updated_at?: number;
  deleted_at?: number;
  version?: number;
  total_reports?: number;
  stats?: any;
}

export interface Project {
  id: string;
  name?: string;
  code?: string;
  ma_ct: string;
  ten_ct: string;
  customer?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  start_date?: string;
  end_date?: string;
  pm?: string;
  pc?: string;
  qa?: string;
  progress?: number;
  thumbnail?: string;
  description?: string;
  location?: string;
  version?: number;
}

export interface IPOItem {
  id: string;
  item_code?: string;
  item_name?: string;
  quantity?: number;
  unit?: string;
  ma_ct?: string;
  ten_ct?: string;
  po_number?: string;
  so_luong_ipo?: number;
  dvt?: string;
  ma_nha_may?: string;
  ten_hang_muc?: string;
  headcode?: string;
  [key: string]: any;
}

export interface CheckItem {
  id?: string;
  name?: string;
  label?: string;
  category?: string;
  stage?: string;
  status: CheckStatus;
  notes?: string;
  images?: any[];
  frequency?: string;
  standard?: string;
  defectIds?: string[];
  method?: string;
}

export interface QMSImage {
  id: string;
  url: string;
  caption?: string;
}

export interface Defect {
  id: string;
  code: string;
  description: string;
  severity?: string;
  solution?: string;
  responsiblePerson?: string;
  deadline?: string;
  status?: string;
  defectCode?: string;
  ma_ct?: string;
  images?: any[];
  date?: string;
  inspectionId?: string;
  [key: string]: any;
}

export interface DefectLibraryItem {
  id: string;
  name: string;
  category?: string;
  code?: string;
  defect_code?: string;
  defect_name?: string;
  process_stage?: string;
  stage?: string;
  severity?: string;
  status?: string;
  description?: string;
  suggested_action?: string;
  suggestedAction?: string;
  correct_image?: string;
  incorrect_image?: string;
  rootCause?: string;
  createdAt?: string | number;
  correctImage?: string;
  incorrectImage?: string;
  [key: string]: any;
}

export interface NCR {
  id: string;
  ncr_number?: string;
  title?: string;
  status: string;
  severity?: string;
  created_at?: number;
  description?: string;
  issueDescription?: string;
  root_cause?: string;
  rootCause?: string;
  corrective_action?: string;
  preventive_action?: string;
  solution?: string;
  responsible_person?: string;
  responsiblePerson?: string;
  deadline?: string;
  images_before_json?: string;
  images_after_json?: string;
  imagesBefore?: any[];
  imagesAfter?: any[];
  defect_code?: string;
  inspection_id?: string;
  item_id?: string;
  comments?: any[];
  created_by?: string;
  createdBy?: string;
  closed_by?: string;
  closedBy?: string;
  closed_at?: number;
  closed_date?: string;
  closedDate?: string;
  updated_at?: number;
  updatedAt?: string | number;
  createdDate?: string;
  ma_ct?: string;
  ten_ct?: string;
  ten_hang_muc?: string;
  workshop?: string;
  po_number?: string;
  inspectorName?: string;
  version?: number;
}

export interface NCRComment {
  id: string;
  comment?: string;
  content?: string;
  created_at?: number;
  createdAt?: string | number;
  userId?: string;
  user_id?: string;
  userName?: string;
  user_name?: string;
  userAvatar?: string;
  attachments?: string[];
  [key: string]: any;
}

export interface Notification {
  id: string;
  userId?: string;
  user_id?: string;
  type?: string;
  title: string;
  message: string;
  isRead?: boolean;
  read?: boolean;
  createdAt?: number;
  created_at?: number;
  link?: any;
  data?: any;
}

export interface ToolCatalog {
  id: string;
  code: string;
  name: string;
  spec?: string;
  unit?: string;
  interval_months?: number;
  [key: string]: any;
}

export interface ToolAsset {
  id: string;
  catalog_id?: string;
  serial_number?: string;
  status?: string;
  location?: string;
  last_calibration_date?: number;
  next_calibration_date?: number;
  [key: string]: any;
}

export interface ToolTransfer {
  id: string;
  asset_id?: string;
  from_location?: string;
  to_location?: string;
  date?: number;
  [key: string]: any;
}

export interface ToolCalibration {
  id: string;
  asset_id?: string;
  calibration_date?: number;
  result?: string;
  [key: string]: any;
}


export interface MaterialIQC {
  id: string;
  material_name?: string;
  po_number?: string;
  status?: string;
  scope?: string;
  projectCode?: string;
  projectName?: string;
  category?: string;
  inspectType?: string;
  name?: string;
  deliveryQty?: number;
  unit?: string;
  inspectQty?: number;
  passQty?: number;
  failQty?: number;
  items?: any[];
  date?: any;
  orderQty?: number;
  criteria?: any;
  [key: string]: any;
}

export interface FloorPlan {
  id: string;
  name: string;
  image_url: string;
  version?: string | number;
  status?: string;
  [key: string]: any;
}

export interface LayoutPin {
  id: string;
  x: number;
  y: number;
  floor_plan_id?: string;
  [key: string]: any;
}

export interface Material {
  id: string;
  name?: string;
  code?: string;
  Ma_Tender?: string;
  projectName?: string;
  shortText?: string;
  material?: string;
  orderQuantity?: number;
  orderUnit?: string;
  supplierName?: string;
  purchaseDocument?: string;
  deliveryDate?: string;
  Factory_Order?: string;
  [key: string]: any;
}

export interface ProjectDocument {
  id: string;
  title?: string;
  url?: string;
  name?: string;
  description?: string;
  version?: string;
  issueDate?: string;
  updateDate?: string;
  createdBy?: string;
  fileUrl?: string;
  [key: string]: any;
}

export type SQCType = 'SQC_BTP' | 'SQC_TP' | 'SQC_VT';

export interface SubcontractorBookingItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  specifications?: string;
  isInspected?: boolean;
  poNumber?: string;
  prNumber?: string;
  supplierName?: string;
}

export interface BookingSupplierMismatchWarning {
  poNumber: string;
  expectedSupplier: string;
  currentSupplier: string;
}

export type BookingDocumentCategory =
  | 'PR_PO'
  | 'QUALITY_AGREEMENT'
  | 'SAMPLE_IMAGE'
  | 'SPEC_DRAWING';

export interface BookingAttachmentItem {
  id: string;
  name: string;
  url: string;
  category: BookingDocumentCategory;
  sourceType: 'UPLOAD' | 'LINK';
  mimeType?: string;
  size?: number;
  uploadedAt?: number;
  uploadedBy?: string;
}

export interface SubcontractorBookingDocuments {
  materialSpecUrl?: string;
  approvedSampleUrl?: string;
  shopdrawingUrl?: string;
  qualityAgreementUrl?: string;
  prPoFiles?: BookingAttachmentItem[];
  qualityAgreementFiles?: BookingAttachmentItem[];
  sampleImages?: BookingAttachmentItem[];
  specDrawings?: BookingAttachmentItem[];
}

export interface RelatedSqcSummary {
  totalCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  latestReportId?: string;
  latestStatus?: string;
  latestResult?: 'PASS' | 'FAIL' | 'PENDING';
  reportsPreview: Array<{
    id: string;
    type: string;
    status: string;
    date?: string;
    matchReasons: RelatedSqcMatchReason[];
  }>;
}

export interface SubcontractorBooking {
  id: string;
  bookingCode: string;
  poId?: string;
  poNumber: string;
  poNumbers?: string[];
  supplierMismatchWarnings?: BookingSupplierMismatchWarning[];
  supplierId?: string;
  supplierName: string;
  requesterId?: string;
  requesterName?: string;
  locationAddress: string;
  contactPerson: string;
  contactPhone: string;
  requestedDate: number;
  assignedQcId?: string;
  assignedQcName?: string;
  status: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RETURNED_FOR_SUPPLEMENT';
  notes?: string;
  sqcType: SQCType;
  commodityLine?: string;
  rejectionReason?: string;
  suggestedDate?: number;
  rejectedAt?: number;
  rejectedByName?: string;
  sqcResult?: 'PASS' | 'FAIL';
  lastSqcId?: string;
  lastSqcStatus?: string;
  manualStatusOverride?: boolean;
  manualOverrideResult?: 'PASS' | 'FAIL';
  manualOverrideReason?: string;
  manualOverrideById?: string;
  manualOverrideByName?: string;
  manualOverrideAt?: number;
  manualOverrideSqcRef?: string;
  items?: SubcontractorBookingItem[];
  documents?: SubcontractorBookingDocuments;
  createdAt: number;
  updatedAt: number;
  version?: number;
  batchNumber?: number;
  totalBatchesForPo?: number;
  relatedSqcSummary?: RelatedSqcSummary;
}

export interface Inspection {
  id: string;
  type: string;
  po_number?: string;
  poNumber?: string;
  pr_number?: string;
  prNumber?: string;
  ma_ct?: string;
  ten_ct?: string;
  supplier?: string;
  supplierName?: string;
  supplierAddress?: string;
  dia_chi_xuong?: string;
  nguoi_lien_he?: string;
  so_dien_thoai?: string;
  workshop?: string;
  location?: string;
  status: string;
  date?: string;
  qcDate?: string | number;
  score?: number;
  booking_id?: string;
  booking_code?: string;
  created_at?: number;
  createdAt?: string | number;
  updatedAt?: string | number;
  ma_nha_may?: string;
  ten_hang_muc?: string;
  so_luong_ipo?: number;
  dvt?: string;
  inspectorName?: string;
  inspectionStage?: string;
  subStage?: string;
  inspectedQuantity?: number;
  passedQuantity?: number;
  failedQuantity?: number;
  summary?: string;
  signature?: string;
  managerSignature?: string;
  managerName?: string;
  managerDate?: string | number;
  teamLeadSignature?: string;
  teamLeadName?: string;
  teamLeadDate?: string | number;
  productionName?: string;
  productionComment?: string;
  productionConfirmedDate?: string | number;
  pmSignature?: string;
  pmName?: string;
  pmComment?: string;
  headcode?: string;
  stage?: string;
  floor_plan_id?: string;
  coord_x?: number;
  coord_y?: number;
  responsiblePerson?: string;
  date_manager?: number;
  date_qc?: number;
  images?: any[];
  items?: any[];
  deliveryNoteImages?: any[];
  reportImages?: any[];
  supportingDocs?: any[];
  materials?: any[];
  reportImage?: string;
  deliveryNoteImage?: string;
  drawingImages?: any[];
  referenceDocs?: any[];
  comments?: any[];
  productionSignature?: string;
  production_signature?: string;
  created_by?: string;
  priority?: string;
  version?: number;
}

export type RelatedSqcMatchReason = 'PO' | 'PR' | 'BOOKING' | 'MATERIAL';

export interface RelatedSqcReport {
  id: string;
  type: string;
  poNumber?: string;
  prNumber?: string;
  maCt?: string;
  tenCt?: string;
  supplier?: string;
  workshop?: string;
  inspectorName?: string;
  date?: string;
  createdAt?: number;
  status: string;
  score?: number;
  inspectedQuantity?: number;
  passedQuantity?: number;
  failedQuantity?: number;
  summary?: string;
  bookingId?: string;
  bookingCode?: string;
  matchReasons: RelatedSqcMatchReason[];
  sourceTable?: string;
}

export interface RelatedSqcResponse {
  bookingId: string;
  bookingCode: string;
  poNumber: string;
  searchContext: {
    poTerms: string[];
    prTerms: string[];
    materialTerms: string[];
  };
  reports: RelatedSqcReport[];
}

export interface RelatedBookingSummary {
  id: string;
  bookingCode: string;
  poNumber: string;
  supplierName: string;
  requestedDate: number;
  assignedQcName?: string;
  status: SubcontractorBooking['status'];
  sqcType: SQCType;
  batchNumber?: number;
  totalBatchesForPo?: number;
  matchReasons: RelatedSqcMatchReason[];
}

export interface RelatedBookingsResponse {
  inspectionId: string;
  poNumber?: string;
  prNumber?: string;
  bookings: RelatedBookingSummary[];
}

export type TraceabilityMatchReason = 'CURRENT' | 'IPO' | 'PO' | 'PR' | 'ERP_BRIDGE' | 'BOOKING';

export interface TraceabilityInspectionItem {
  id: string;
  type: string;
  status: string;
  maCt?: string;
  tenCt?: string;
  maNhaMay?: string;
  headcode?: string;
  poNumber?: string;
  prNumber?: string;
  tenHangMuc?: string;
  workshop?: string;
  supplier?: string;
  inspectorName?: string;
  date?: string;
  createdAt?: number;
  score?: number;
  inspectedQuantity?: number;
  passedQuantity?: number;
  failedQuantity?: number;
  summary?: string;
  matchReasons: TraceabilityMatchReason[];
  isCurrent?: boolean;
}

export interface TraceabilityNcrItem {
  id: string;
  ncrNumber?: string;
  inspectionId?: string;
  defectCode?: string;
  severity?: string;
  status: string;
  title?: string;
  description?: string;
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  responsiblePerson?: string;
  deadline?: string;
  createdDate?: string;
  createdAt?: number;
  maCt?: string;
  tenCt?: string;
  maNhaMay?: string;
  poNumber?: string;
  imagesBefore?: any[];
  imagesAfter?: any[];
  matchReasons: TraceabilityMatchReason[];
}

export interface TraceabilityBookingItem {
  id: string;
  bookingCode: string;
  poNumber: string;
  supplierName: string;
  requestedDate: number;
  assignedQcName?: string;
  status: SubcontractorBooking['status'];
  sqcType: SQCType;
  matchReasons: TraceabilityMatchReason[];
}

export interface TraceabilityBundle {
  queryContext: {
    inspectionId?: string;
    ipoTerms: string[];
    poTerms: string[];
    prTerms: string[];
    erpLinkedIpoTerms: string[];
    erpLinkedPoTerms: string[];
    erpLinkedPrTerms: string[];
  };
  summary: {
    totalInspections: number;
    passedInspections: number;
    failedInspections: number;
    pendingInspections: number;
    totalNcrs: number;
    openNcrs: number;
    closedNcrs: number;
    totalBookings: number;
  };
  inspections: TraceabilityInspectionItem[];
  ncrs: TraceabilityNcrItem[];
  bookings: TraceabilityBookingItem[];
  isPublic?: boolean;
}

export interface SubcontractorInspection {
  id: string;
  bookingId?: string;
  bookingCode?: string;
  poNumber?: string;
  inspectionResult: 'PASS' | 'REJECT' | 'CONDITIONAL_PASS';
  notes?: string;
  createdAt: number;
}

export interface SubcontractorReinspectionCost {
  id: string;
  bookingId: string;
  supplierName: string;
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'PAID';
  createdAt: number;
}

const matchRoleAction = (actions: any[], action: string): boolean => {
  const req = String(action || 'VIEW').toUpperCase().trim();
  const upperActions = actions.map((a: any) => String(a || '').toUpperCase().trim());
  if (upperActions.includes(req)) return true;
  if (req === 'VIEW' && upperActions.includes('VIEW_ALL')) return true;
  if (req === 'EDIT' && (upperActions.includes('EDIT_OWN') || upperActions.includes('EDIT_ALL'))) return true;
  if (req === 'EDIT_OWN' && (upperActions.includes('EDIT_ALL') || upperActions.includes('EDIT'))) return true;
  if (req === 'DELETE' && (upperActions.includes('DELETE_OWN') || upperActions.includes('DELETE_ALL'))) return true;
  if (req === 'DELETE_OWN' && (upperActions.includes('DELETE_ALL') || upperActions.includes('DELETE'))) return true;
  return false;
};

export const hasPermission = (user: User | null | undefined, rolesList: any[] = [], moduleId: string, action: string = 'VIEW'): boolean => {
  if (!user) return false;
  const roleUpper = String(user.role || '').toUpperCase().trim();
  if (roleUpper === 'ADMIN') return true;
  if (roleUpper === 'GUEST') return false;

  const act = String(action || 'VIEW').toUpperCase().trim();
  const mod = String(moduleId || '').toUpperCase().trim();

  const matchedPermissions: any[] = [];
  const rawPerms = (user as any).userPermissions || (user as any).user_permissions || (user as any).permissions;
  let userPerms: any[] = [];

  if (typeof rawPerms === 'string') {
    try {
      userPerms = JSON.parse(rawPerms);
    } catch {
      userPerms = [];
    }
  } else if (Array.isArray(rawPerms)) {
    userPerms = rawPerms;
  }

  if (Array.isArray(userPerms) && userPerms.length > 0) {
    matchedPermissions.push(...userPerms);
  }
  if (Array.isArray(rolesList) && rolesList.length > 0) {
    const posUpper = String((user as any).position || '').toUpperCase().trim();
    const matchedRole = rolesList.find(
      (r: any) =>
        r &&
        typeof r === 'object' &&
        !r.isPosition &&
        (String(r.id || '').toUpperCase().trim() === roleUpper || String(r.name || '').toUpperCase().trim() === roleUpper)
    );
    if (matchedRole && Array.isArray(matchedRole.permissions)) {
      if (userPerms.length === 0) {
        matchedPermissions.push(...matchedRole.permissions);
      } else {
        matchedRole.permissions.forEach((rp: any) => {
          const rpMod = String(rp?.moduleId || '').toUpperCase().trim();
          const hasExplicitModule = userPerms.some((up: any) => String(up?.moduleId || '').toUpperCase().trim() === rpMod);
          if (!hasExplicitModule) matchedPermissions.push(rp);
        });
      }
    }
    if (posUpper) {
      const matchedPosition = rolesList.find(
        (r: any) =>
          r &&
          typeof r === 'object' &&
          r.isPosition &&
          (String(r.id || '').toUpperCase().trim() === posUpper || String(r.name || '').toUpperCase().trim() === posUpper)
      );
      if (matchedPosition && Array.isArray(matchedPosition.permissions)) {
        matchedPosition.permissions.forEach((pp: any) => {
          const ppMod = String(pp?.moduleId || '').toUpperCase().trim();
          const hasExplicitModule = userPerms.some((up: any) => String(up?.moduleId || '').toUpperCase().trim() === ppMod);
          if (!hasExplicitModule) matchedPermissions.push(pp);
        });
      }
    }
  }

  const systemAdminMatrix = matchedPermissions.find((p) => String(p?.moduleId || '').toUpperCase() === 'SYSTEM_ADMIN');
  if (systemAdminMatrix && Array.isArray(systemAdminMatrix.actions) && matchRoleAction(systemAdminMatrix.actions, act)) {
    return true;
  }

  const moduleMatrix = matchedPermissions.filter(
    (p) => String(p?.moduleId || '').toUpperCase() === mod
  );
  if (moduleMatrix.length > 0) {
    return moduleMatrix.some((p) => Array.isArray(p?.actions) && matchRoleAction(p.actions, act));
  }

  const list = (user.allowedModules || (user as any).allowed_modules || []).map((m: any) => String(m || '').toUpperCase().trim());
  if (list.includes(mod)) {
    if (act === 'VIEW' || act === 'CREATE' || act === 'EDIT' || act === 'EDIT_OWN') {
      return true;
    }
    if ((Boolean((user as any).la_to_truong) || roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QC_LEAD') && act === 'SIGN1') {
      return true;
    }
    if ((roleUpper === 'MANAGER' || roleUpper === 'QA') && act === 'SIGN2') {
      return true;
    }
  }

  return false;
};

export const getInspectionModuleCandidates = (inspectionType?: string | null): string[] => {
  const t = String(inspectionType || 'PQC').toUpperCase().trim();
  const candidates = new Set<string>([t]);
  if (t === 'SQC_VT') candidates.add('SQC_MAT');
  if (t === 'SQC_MAT') candidates.add('SQC_VT');
  candidates.add('INSPECTIONS');
  candidates.add('LIST');
  return Array.from(candidates);
};

export const hasInspectionApprovalPermission = (
  user: User | null | undefined,
  rolesList: any[] = [],
  inspectionType: string | null | undefined,
  action: 'SIGN1' | 'SIGN2'
): boolean => {
  if (!user) return false;
  const roleUpper = String(user.role || '').toUpperCase().trim();
  if (roleUpper === 'ADMIN') return true;
  if (roleUpper === 'GUEST') return false;

  const act = String(action || 'SIGN1').toUpperCase().trim() as 'SIGN1' | 'SIGN2';

  // Role-level managerial defaults (L2: MANAGER / QA; L1: MANAGER / QA / QC_LEAD / la_to_truong)
  if (act === 'SIGN2' && (roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QUẢN LÝ')) {
    return true;
  }
  if (
    act === 'SIGN1' &&
    (roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QC_LEAD' || roleUpper === 'QUẢN LÝ' || Boolean((user as any).la_to_truong))
  ) {
    return true;
  }

  const candidates = getInspectionModuleCandidates(inspectionType);
  for (const mod of candidates) {
    if (hasPermission(user, rolesList, mod, act)) return true;
    if (act === 'SIGN1' && hasPermission(user, rolesList, mod, 'APPROVE')) return true;
  }

  return false;
};

export const canUserModifyInspection = (inspection: any, user: User | null | undefined): boolean => {
  if (!user) return false;
  const st = String(inspection?.status || '').trim().toUpperCase();
  if (st === 'LOCKED' || st === 'COMPLETED' || st === 'VERIFIED' || st === 'APPROVED') return false;
  if (String(user.role || '').toUpperCase() === 'ADMIN') return true;
  if (inspection?.inspectorName === user.name) return true;
  return hasPermission(user, [], 'INSPECTIONS', 'EDIT');
};

export const canUserDeleteInspection = (inspection: any, user: User | null | undefined): boolean => {
  if (!user) return false;
  const st = String(inspection?.status || '').trim().toUpperCase();
  if (st === 'LOCKED' || st === 'COMPLETED' || st === 'VERIFIED') return false;
  if (String(user.role || '').toUpperCase() === 'ADMIN') return true;
  return hasPermission(user, [], 'INSPECTIONS', 'DELETE');
};

