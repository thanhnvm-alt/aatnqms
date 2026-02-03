

export enum CheckStatus {
  PENDING = 'PENDING',
  PASS = 'Đạt',
  FAIL = 'Hỏng', 
  CONDITIONAL = 'Có điều kiện'
}

export enum InspectionStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FLAGGED = 'FLAGGED',
  APPROVED = 'APPROVED'
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export type ViewState = 'DASHBOARD' | 'LIST' | 'FORM' | 'DETAIL' | 'PLAN' | 'PLAN_DETAIL' | 'SETTINGS' | 'PROJECTS' | 'PROJECT_DETAIL' | 'CONVERT_3D' | 'NCR_LIST' | 'DEFECT_LIBRARY' | 'DEFECT_DETAIL' | 'DEFECT_LIST' | 'SUPPLIERS' | 'SUPPLIER_DETAIL';

export type ModuleId = 'IQC' | 'SQC_MAT' | 'SQC_VT' | 'SQC_BTP' | 'PQC' | 'FSR' | 'STEP' | 'FQC' | 'SPR' | 'SITE' | 'PROJECTS' | 'OEM' | 'SETTINGS' | 'CONVERT_3D' | 'DEFECTS' | 'SUPPLIERS';

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
  status?: string;
  position?: string;
  workLocation?: string;
  joinDate?: string;
  education?: string;
  endDate?: string;
  notes?: string;
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
  ncr?: NCR; // NCR can be nested within a CheckItem
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
  workshop?: string;
  inspectionStage?: string;
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
  comments?: NCRComment[];
  priority?: Priority;
  floor_plan_id?: string;
  coord_x?: number;
  coord_y?: number;
  responsiblePerson?: string;
  productionComment?: string;
}

export interface PlanItem {
  id?: number | string;
  ma_nha_may: string;
  headcode?: string;
  ma_ct: string;
  ten_ct: string;
  ten_hang_muc: string;
  dvt?: string;
  so_luong_ipo: number;
  plannedDate?: string;
  assignee?: string;
  status?: string;
  // New Fields
  drawing_url?: string;
  description?: string;
  materials_text?: string;
  samples_json?: string; // JSON string for { color: string, fabric: string, other: string[] }
  simulations_json?: string; // JSON string for image URLs
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
  type: 'INSPECTION' | 'NCR' | 'COMMENT' | 'DEADLINE';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number;
  link?: { view: ViewState, id: string };
}

export type PermissionAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'EXPORT';

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
}

export interface DefectLibraryItem {
  id: string;
  code: string;
  name: string;
  description: string;
  stage: string;
  category: string;
  severity: string;
  suggestedAction?: string;
  correctImage?: string;
  incorrectImage?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface PlanEntity {
  id: number;
  headcode: string;
  ma_ct: string;
  ten_ct: string;
  ten_hang_muc: string;
  dvt: string;
  so_luong_ipo: number;
  ma_nha_may: string;
  created_at: number;
  // New Fields
  drawing_url?: string;
  description?: string;
  materials_text?: string;
  samples_json?: string;
  simulations_json?: string;
}

export interface PlanResponse {
  id: number;
  headcode: string;
  maCongTrinh: string;
  tenCongTrinh: string;
  maNhaMay: string;
  tenHangMuc: string;
  dvt: string;
  soLuongIpo: number;
  ngayTao: string;
}

// Common interface for InspectionForm components
export interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  plans: PlanItem[];
  workshops: Workshop[];
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}