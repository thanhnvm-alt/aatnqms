
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

export type ViewState = 'DASHBOARD' | 'LIST' | 'FORM' | 'DETAIL' | 'PLAN' | 'PLAN_DETAIL' | 'SETTINGS' | 'PROJECTS' | 'PROJECT_DETAIL' | 'CONVERT_3D' | 'NCR_LIST' | 'DEFECT_LIBRARY' | 'DEFECT_DETAIL' | 'DEFECT_LIST' | 'SUPPLIERS' | 'SUPPLIER_DETAIL' | 'IPO_LIST';

export type ModuleId = 'IQC' | 'SQC_MAT' | 'SQC_VT' | 'SQC_BTP' | 'PQC' | 'FSR' | 'STEP' | 'FQC' | 'SPR' | 'SITE' | 'PROJECTS' | 'OEM' | 'SETTINGS' | 'CONVERT_3D' | 'DEFECTS' | 'SUPPLIERS';

export type UserRole = 'ADMIN' | 'MANAGER' | 'QA' | 'QC';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  avatar?: string;
  allowedModules?: ModuleId[];
  msnv?: string;
  position?: string;
  workLocation?: string;
  status?: string;
  joinDate?: string;
  endDate?: string;
  education?: string;
  notes?: string;
}

export interface Workshop {
  id: string;
  code: string;
  name: string;
  location?: string;
  manager?: string;
  phone?: string;
  image?: string;
  stages?: string[];
  created_at?: number;
  updated_at?: number;
}

export interface NCRComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  attachments?: string[];
}

export interface NCR {
  id: string;
  inspection_id?: string;
  itemId?: string;
  defect_code?: string;
  issueDescription: string;
  severity?: 'MINOR' | 'MAJOR' | 'CRITICAL';
  rootCause?: string;
  solution?: string;
  responsiblePerson?: string;
  deadline?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  imagesBefore?: string[];
  imagesAfter?: string[];
  createdDate: string;
  createdBy?: string;
  closedDate?: string;
  closedBy?: string;
  comments?: NCRComment[];
}

export interface CheckItem {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  notes?: string;
  images?: string[];
  stage?: string;
  method?: string;
  standard?: string;
  frequency?: string;
  defectIds?: string[];
  ncr?: NCR;
}

export interface MaterialIQC {
  id: string;
  name: string;
  category?: string;
  inspectType?: '100%' | 'AQL';
  scope?: 'COMMON' | 'PROJECT';
  projectCode?: string;
  projectName?: string;
  orderQty: number;
  deliveryQty: number;
  unit: string;
  inspectQty: number;
  passQty: number;
  failQty: number;
  images?: string[];
  type?: string;
  date?: string;
  criteria?: any[];
  items: CheckItem[];
}

export interface SupportingDoc {
  id: string;
  name: string;
  verified: boolean;
}

export interface Inspection {
  id: string;
  type: ModuleId;
  ma_ct: string;
  ten_ct?: string;
  ten_hang_muc: string;
  ma_nha_may?: string;
  headcode?: string;
  workshop?: string;
  inspectionStage?: string;
  inspectorName: string;
  date: string;
  status: InspectionStatus;
  priority?: Priority;
  score: number;
  images?: string[];
  items: CheckItem[];
  so_luong_ipo: number;
  inspectedQuantity: number;
  passedQuantity: number;
  failedQuantity: number;
  dvt?: string;
  summary?: string;
  signature?: string;
  managerSignature?: string;
  managerName?: string;
  productionSignature?: string;
  productionName?: string;
  productionComment?: string;
  productionConfirmedDate?: string;
  confirmedDate?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  comments?: NCRComment[];
  po_number?: string;
  supplier?: string;
  supplierAddress?: string;
  location?: string;
  materials?: MaterialIQC[];
  supportingDocs?: SupportingDoc[];
  referenceDocs?: any[];
  reportImage?: string;
  reportImages?: string[];
  deliveryNoteImage?: string;
  deliveryNoteImages?: string[];
  floor_plan_id?: string;
  coord_x?: number;
  coord_y?: number;
  responsiblePerson?: string;
}

export interface PlanItem {
  id?: string | number;
  ma_nha_may?: string;
  headcode?: string;
  ma_ct: string;
  ten_ct?: string;
  ten_hang_muc: string;
  dvt: string;
  so_luong_ipo: number;
  plannedDate?: string;
  assignee?: string;
  status?: string;
  drawing_url?: string;
  description?: string;
  materials_text?: string;
  samples_json?: string;
  simulations_json?: string;
  location?: string;
}

export interface Project {
  id: string;
  code?: string;
  name: string;
  ma_ct: string;
  ten_ct?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  pm?: string;
  pc?: string;
  qa?: string;
  progress: number;
  thumbnail?: string;
  description?: string;
  location?: string;
  smartGoals?: string;
}

export interface SmartGoal {
  id: string;
  title: string;
  deadline: string;
  status: 'PENDING' | 'DONE';
}

export interface Notification {
  id: string;
  userId: string;
  type: 'INSPECTION' | 'NCR' | 'COMMENT' | 'DEADLINE' | 'SYSTEM';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number;
  link?: { view: ViewState, id: string };
}

export interface Defect {
  id: string;
  defectCode?: string;
  description: string;
  severity: string;
  status: string;
  date: string;
  inspectorName?: string;
  ma_ct?: string;
  images?: string[];
  responsiblePerson?: string;
  deadline?: string;
  rootCause?: string;
  solution?: string;
  inspectionId: string;
}

export interface DefectLibraryItem {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: string;
  category: string;
  stage?: string;
  suggestedAction?: string;
  correctImage?: string;
  incorrectImage?: string;
  createdAt?: number;
  createdBy?: string;
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
  stats?: {
    total_pos: number;
    pass_rate: number;
    defect_rate: number;
  };
}

export interface FloorPlan {
  id: string;
  project_id: string;
  name: string;
  image_url: string;
  version: string;
  status: string;
  active_inspections?: number;
  updated_at: number;
  file_name?: string;
}

export interface LayoutPin {
  id: string;
  floor_plan_id: string;
  inspection_id: string;
  x: number;
  y: number;
  label?: string;
  status: string;
  created_at?: number;
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
  permissions?: ModulePermission[];
  allowedModules?: ModuleId[];
  isSystem?: boolean;
}

export interface QMSImage {
  id: string;
  url: string;
  type: 'BEFORE' | 'AFTER' | 'EVIDENCE';
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

export interface IPOItem {
  id: number;
  ID_Project: string;
  Project_name: string;
  Material_description: string;
  Base_Unit: string;
  Quantity_IPO: number;
  ID_Factory_Order: string;
  Created_on: string;
  Quantity?: number;
  BOQ_type?: string;
  IPO_Number?: string;
  IPO_Line?: string;
  Ma_Tender?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

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
