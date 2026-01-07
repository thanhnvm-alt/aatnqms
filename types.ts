export enum CheckStatus {
  PENDING = 'PENDING',
  PASS = 'Đạt',
  FAIL = 'Hỏng', 
  CONDITIONAL = 'Có điều kiện'
}

export enum InspectionStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  FLAGGED = 'FLAGGED',
  APPROVED = 'APPROVED'
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export type ViewState = 'DASHBOARD' | 'LIST' | 'FORM' | 'DETAIL' | 'PLAN' | 'SETTINGS' | 'PROJECTS' | 'PROJECT_DETAIL' | 'CONVERT_3D' | 'NCR_LIST' | 'DEFECT_LIBRARY' | 'DEFECT_DETAIL' | 'DEFECT_LIST';

export type ModuleId = 'IQC' | 'SQC_MAT' | 'SQC_BTP' | 'PQC' | 'FSR' | 'STEP' | 'FQC' | 'SPR' | 'SITE' | 'PROJECTS' | 'OEM' | 'SETTINGS' | 'CONVERT_3D' | 'DEFECTS';

export type UserRole = 'ADMIN' | 'MANAGER' | 'QA' | 'QC';

export type UserRoleName = UserRole | string;

export type PermissionAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'EXPORT';

export interface ModulePermission {
  moduleId: ModuleId;
  actions: PermissionAction[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: ModulePermission[];
  allowedModules?: ModuleId[];
  isSystem?: boolean;
}

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRoleName;
  avatar: string;
  allowedModules?: ModuleId[];
  permissions?: ModulePermission[];
  msnv?: string;
  position?: string;
  workLocation?: string;
  status?: string;
  joinDate?: string;
  education?: string;
  endDate?: string;
  notes?: string;
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
  createdDate: string;
  issueDescription: string;
  rootCause: string;
  solution: string;
  responsiblePerson: string;
  deadline?: string;
  status: string;
  severity?: 'MINOR' | 'MAJOR' | 'CRITICAL';
  imagesBefore: string[];
  imagesAfter: string[];
  comments?: NCRComment[];
}

export interface DefectLibraryItem {
  id: string;
  code: string;
  name: string; 
  stage: string;
  category: string;
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  suggestedAction?: string;
  correctImage?: string; 
  incorrectImage?: string; 
  createdBy?: string;
  createdAt?: number;
}

export interface Defect {
  id: string;
  inspectionId: string;
  itemId: string;
  defectCode: string;
  category: string;
  description: string;
  status: string;
  severity: string;
  inspectorName: string;
  date: string;
  ma_ct: string;
  ten_ct: string;
  images: string[];
  rootCause?: string;
  solution?: string;
  responsiblePerson?: string;
  deadline?: string;
}

export interface CheckItem {
  id: string;
  stage?: string; // Group 1: Công đoạn (Dành cho PQC/SQC)
  category: string; // Group 2: Danh mục (VD: Lắp ráp, Ngoại quan...)
  label: string; // Group 3: Hạng mục kiểm tra
  standard?: string; // Tiêu chuẩn kỹ thuật (đính kèm Group 3)
  status: CheckStatus;
  notes?: string;
  images?: string[];
  ncr?: NCR;
}

export interface Inspection {
  id: string;
  type?: ModuleId;
  ma_ct: string;
  ten_ct: string;
  ma_nha_may?: string;
  ten_hang_muc?: string;
  headcode?: string;
  inspectorName: string;
  date: string;
  status: InspectionStatus;
  priority?: Priority;
  score: number;
  items: CheckItem[];
  images?: string[];
  summary?: string;
  aiSuggestions?: string;
  workshop?: string;
  inspectionStage?: string;
  dvt?: string;
  so_luong_ipo: number;
  inspectedQuantity?: number;
  passedQuantity?: number;
  failedQuantity?: number;
  signature?: string;
  productionSignature?: string;
  managerSignature?: string;
  managerName?: string;
  productionName?: string;
  productionConfirmedDate?: string;
  confirmedDate?: string;
  comments?: NCRComment[];
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
  pm: string; 
  pc?: string; 
  qa?: string; 
  thumbnail: string;
  progress: number;
  description?: string;
  location?: string;
  images?: string[]; 
}

export interface PlanItem {
  id?: number | string;
  stt?: number;
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
  pthsp?: string;
  created_at?: number;
}

export interface PlanEntity {
  id: number;
  headcode: string;
  ma_ct: string;
  ten_ct: string;
  ma_nha_may: string;
  ten_hang_muc: string;
  dvt: string;
  so_luong_ipo: number;
  ngay_kh: string;
  assignee: string;
  status: string;
  pthsp: string;
  created_at: number;
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

export interface Workshop {
  id: string;
  code: string;
  name: string;
  location: string;
  manager: string;
  phone: string;
  image?: string;
  stages?: string[];
}