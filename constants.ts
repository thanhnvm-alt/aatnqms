
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, User, ModuleId, Workshop, Project } from "./types";

export const INITIAL_CHECKLIST_TEMPLATE = [
  { id: 'site_1', category: 'Lắp đặt', label: 'Vệ sinh khu vực thi công', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_2', category: 'Lắp đặt', label: 'Kiểm tra mặt bằng/cao độ', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_3', category: 'Hoàn thiện', label: 'Độ kín khít silicon/keo', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_4', category: 'Hoàn thiện', label: 'Vệ sinh sản phẩm sau lắp', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_5', category: 'An toàn', label: 'An toàn lao động/PCCC', status: CheckStatus.PENDING, notes: '' },
];

export const PQC_CHECKLIST_TEMPLATE = [
  { id: 'pqc_1', category: 'Lắp ráp', label: 'Đúng bản vẽ lắp ráp', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_2', category: 'Lắp ráp', label: 'Độ kín khít mối ghép', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_3', category: 'Bề mặt', label: 'Chà nhám/Làm nguội', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_4', category: 'Bề mặt', label: 'Màu sắc đồng bộ', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_5', category: 'Kết cấu', label: 'Độ chắc chắn/Cân bằng', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_6', category: 'Phụ kiện', label: 'Lắp đúng/đủ phụ kiện', status: CheckStatus.PENDING, notes: '' },
];

export const IQC_CHECKLIST_TEMPLATE = [
  { id: 'iqc_1', category: 'Hồ sơ', label: 'CO/CQ, Chứng chỉ chất lượng', status: CheckStatus.PENDING, notes: '' },
  { id: 'iqc_2', category: 'Hồ sơ', label: 'Phiếu giao hàng (Packing List)', status: CheckStatus.PENDING, notes: '' },
  { id: 'iqc_3', category: 'Ngoại quan', label: 'Bao bì, đóng gói, nhãn mác', status: CheckStatus.PENDING, notes: '' },
  { id: 'iqc_4', category: 'Ngoại quan', label: 'Tình trạng vật tư (Móp méo, trầy xước)', status: CheckStatus.PENDING, notes: '' },
  { id: 'iqc_5', category: 'Quy cách', label: 'Kiểm tra kích thước/Độ dày', status: CheckStatus.PENDING, notes: '' },
  { id: 'iqc_6', category: 'Quy cách', label: 'Kiểm tra màu sắc/Vân', status: CheckStatus.PENDING, notes: '' },
  { id: 'iqc_7', category: 'Quy cách', label: 'Độ ẩm (đối với Gỗ)', status: CheckStatus.PENDING, notes: '' },
];

export const SQC_MAT_CHECKLIST_TEMPLATE = [
    { id: 'sqc_m_1', category: 'Hồ sơ', label: 'Biên bản giao nhận vật tư gia công', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_m_2', category: 'Chất lượng', label: 'Đúng chủng loại vật tư yêu cầu', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_m_3', category: 'Chất lượng', label: 'Kích thước phôi/vật liệu thô', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_m_4', category: 'Ngoại quan', label: 'Không nứt, cong vênh, mọt', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_m_5', category: 'Quy cách', label: 'Độ ẩm vật liệu', status: CheckStatus.PENDING, notes: '' },
];

export const SQC_BTP_CHECKLIST_TEMPLATE = [
    { id: 'sqc_b_1', category: 'Hồ sơ', label: 'Bản vẽ gia công chi tiết', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_b_2', category: 'Kích thước', label: 'Kích thước gia công (Dài x Rộng x Dày)', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_b_3', category: 'Kích thước', label: 'Vị trí lỗ khoan / Mộng liên kết', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_b_4', category: 'Bề mặt', label: 'Độ nhẵn bề mặt (Chà nhám)', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_b_5', category: 'Ngoại quan', label: 'Không trầy xước, nứt vỡ trong quá trình gia công', status: CheckStatus.PENDING, notes: '' },
    { id: 'sqc_b_6', category: 'Kết cấu', label: 'Độ chắc chắn của mối ghép (nếu có)', status: CheckStatus.PENDING, notes: '' },
];

export const FSR_CHECKLIST_TEMPLATE = [
    { id: 'fsr_1', category: 'Hồ sơ', label: 'Bản vẽ kỹ thuật & Bảng mẫu màu (Color Swatch)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_2', category: 'Kích thước', label: 'Kích thước tổng thể (Dài x Rộng x Cao)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_3', category: 'Kích thước', label: 'Kích thước chi tiết & Dung sai cho phép', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_4', category: 'Kết cấu', label: 'Độ chắc chắn (Stability Test) - Không rung lắc', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_5', category: 'Kết cấu', label: 'Mối ghép, mộng, liên kết vít (kín khít, chắc chắn)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_6', category: 'Hoàn thiện', label: 'Màu sắc tổng thể (So sánh với mẫu duyệt)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_7', category: 'Hoàn thiện', label: 'Độ bóng & Độ mịn bề mặt (Sơn/Vecni)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_8', category: 'Hoàn thiện', label: 'Xử lý cạnh, góc (Bo tròn, vát cạnh theo thiết kế)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_9', category: 'Ngũ kim', label: 'Chức năng đóng/mở (bản lề, ray trượt, khóa)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_10', category: 'Ngũ kim', label: 'Độ hở đều cánh cửa/ngăn kéo (Gap alignment)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_11', category: 'Đóng gói', label: 'Quy cách thùng carton & Nhãn dán (Label)', status: CheckStatus.PENDING, notes: '' },
    { id: 'fsr_12', category: 'Đóng gói', label: 'Bảo vệ góc, xốp chèn (Protection)', status: CheckStatus.PENDING, notes: '' },
];

export const ALL_MODULES: { id: ModuleId; label: string; group: string }[] = [
  { id: 'CONVERT_3D', label: 'AI - 2D sang 3D', group: 'TOOLS' },
  { id: 'IQC', label: 'IQC - Vật Liệu Đầu Vào', group: 'QC' },
  { id: 'SQC_MAT', label: 'SQC - Gia Công Ngoài - Vật Tư', group: 'QC' },
  { id: 'SQC_BTP', label: 'SQC - Gia Công Ngoài - BTP', group: 'QC' },
  { id: 'PQC', label: 'PQC - Kiểm tra Sản xuất', group: 'QC' },
  { id: 'FSR', label: 'FSR - Mẫu Đầu Tiên', group: 'QC' },
  { id: 'STEP', label: 'Step Vecni - Bước màu', group: 'QC' },
  { id: 'FQC', label: 'FQC - Final', group: 'QA' },
  { id: 'SPR', label: 'SPR - Kiểm Mẫu', group: 'QA' },
  { id: 'SITE', label: 'Site - Công trình', group: 'QA' },
  { id: 'PROJECTS', label: 'Danh Sách Dự Án', group: 'PM' },
  { id: 'OEM', label: 'Khách OEM', group: 'OEM' },
];

export const MOCK_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    password: '123',
    name: 'Administrator',
    role: 'ADMIN',
    avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
    allowedModules: ['IQC', 'SQC_MAT', 'SQC_BTP', 'PQC', 'FSR', 'STEP', 'FQC', 'SPR', 'SITE', 'PROJECTS', 'OEM', 'SETTINGS', 'CONVERT_3D'],
    msnv: 'MS-001',
    position: 'Giám đốc hệ thống',
    workLocation: 'Trụ sở chính',
    status: 'Đang làm việc',
    joinDate: '2020-01-01',
    education: 'Thạc sĩ'
  },
  {
    id: '2',
    username: 'manager',
    password: '123',
    name: 'Trần Văn Quản Lý',
    role: 'MANAGER',
    avatar: 'https://ui-avatars.com/api/?name=Manager&background=6366f1&color=fff',
    allowedModules: ['IQC', 'PQC', 'FQC', 'SITE', 'PROJECTS', 'CONVERT_3D'],
    msnv: 'MS-002',
    position: 'Quản lý QC',
    workLocation: 'Nhà máy 1',
    status: 'Đang làm việc',
    joinDate: '2021-05-15',
    education: 'Đại học'
  },
  {
    id: '3',
    username: 'qc',
    password: '123',
    name: 'Nguyễn Văn QC',
    role: 'QC',
    avatar: 'https://ui-avatars.com/api/?name=QC&background=10b981&color=fff',
    allowedModules: ['PQC', 'SITE', 'IQC', 'SQC_MAT', 'SQC_BTP', 'FSR'],
    msnv: 'MS-003',
    position: 'Nhân viên QC',
    workLocation: 'Nhà máy 1',
    status: 'Đang làm việc',
    joinDate: '2022-10-01',
    education: 'Cao đẳng'
  }
];

export const MOCK_WORKSHOPS: Workshop[] = [
  {
    id: 'ws_1',
    code: 'XSX-01',
    name: 'Xưởng Mộc 1',
    location: 'Khu A - Nhà Máy 1',
    manager: 'Nguyễn Văn Quản',
    phone: '0901234567',
    image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=400',
    stages: ['Lựa phôi', 'Gia công chi tiết', 'Lắp ráp thô', 'Kiểm tra trắng']
  },
  {
    id: 'ws_2',
    code: 'XSX-02',
    name: 'Xưởng Sơn',
    location: 'Khu B - Nhà Máy 1',
    manager: 'Trần Thị Lý',
    phone: '0909888777',
    image: 'https://images.unsplash.com/photo-1535953046522-7d1bb3543e49?auto=format&fit=crop&q=80&w=400',
    stages: ['Bả trét', 'Sơn lót', 'Chà nhám nước', 'Sơn phủ', 'Đóng gói']
  }
];

export const MOCK_PLAN_DATA: PlanItem[] = [
  {
    ma_nha_may: 'NM001',
    ma_ct: 'AATN-Alpha',
    ten_ct: 'Tầng 5 - Trục A-B',
    ten_hang_muc: 'Nghiệm thu cốt thép cột',
    plannedDate: '2023-11-01',
    assignee: 'Nguyễn Văn A',
    status: 'PENDING',
    dvt: 'SET',
    so_luong_ipo: 10
  },
  {
    ma_nha_may: 'NM002',
    ma_ct: 'AATN-Beta',
    ten_ct: 'Khu B - Móng M1',
    ten_hang_muc: 'Kiểm tra độ sụt bê tông',
    plannedDate: '2023-11-02',
    assignee: 'Trần Thị B',
    status: 'PENDING',
    dvt: 'M3',
    so_luong_ipo: 45
  }
];

export const MOCK_INSPECTIONS: Inspection[] = [
  {
    id: 'INS-2023-001',
    type: 'SITE',
    ma_ct: 'AATN-Alpha',
    ten_ct: 'Công trình A1',
    inspectorName: 'Nguyễn Văn A',
    date: '2023-10-25',
    status: InspectionStatus.COMPLETED,
    priority: Priority.LOW,
    images: ['https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&q=80&w=300&h=200'],
    score: 95,
    ten_hang_muc: 'Hệ tủ bếp chung cư',
    ma_nha_may: 'SITE-001',
    workshop: 'Hiện trường',
    inspectionStage: 'Lắp đặt',
    dvt: 'SET',
    so_luong_ipo: 1,
    inspectedQuantity: 1,
    passedQuantity: 1,
    failedQuantity: 0,
    items: [
      { id: 'site_1', category: 'Lắp đặt', label: 'Vệ sinh khu vực thi công', status: CheckStatus.PASS, notes: '' },
      { id: 'site_2', category: 'Lắp đặt', label: 'Kiểm tra mặt bằng/cao độ', status: CheckStatus.PASS, notes: '' },
    ],
    summary: 'Kiểm tra hiện trường hoàn tất.',
  }
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    code: 'PROJ-2023-884',
    name: 'HQ Fit-out: Apex Towers',
    ma_ct: 'PROJ-2023-884',
    ten_ct: 'HQ Fit-out: Apex Towers',
    status: 'In Progress',
    startDate: 'Oct 12, 2023',
    endDate: 'Mar 01, 2024',
    manager: 'Nguyen Van A',
    pc: 'Pham Thi B',
    qa: 'Le Van C',
    progress: 65,
    thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600',
    description: 'Thi công nội thất văn phòng trụ sở chính tập đoàn Apex. Bao gồm 5 tầng văn phòng và khu vực sảnh đón.',
    location: 'Quận 1, TP.HCM'
  },
  {
    id: '2',
    code: 'PROJ-2023-712',
    name: 'Lobby Renovation: West Wing',
    ma_ct: 'PROJ-2023-712',
    ten_ct: 'Lobby Renovation: West Wing',
    status: 'Completed',
    startDate: 'Jan 10, 2023',
    endDate: 'Aug 15, 2023',
    manager: 'Tran Thi B',
    pc: 'Nguyen Van D',
    qa: 'Hoang Thi E',
    progress: 100,
    thumbnail: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&q=80&w=600',
    description: 'Cải tạo khu vực sảnh tây khách sạn 5 sao. Yêu cầu vật liệu cao cấp và thi công đêm.',
    location: 'Quận 3, TP.HCM'
  },
  {
    id: '3',
    code: 'PROJ-2024-002',
    name: 'Executive Suite Expansion',
    ma_ct: 'PROJ-2024-002',
    ten_ct: 'Executive Suite Expansion',
    status: 'On Hold',
    startDate: 'Nov 05, 2023',
    endDate: 'Dec 20, 2023',
    manager: 'Le Van C',
    pc: 'Tran Van F',
    qa: 'Nguyen Thi G',
    progress: 15,
    thumbnail: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&q=80&w=600',
    description: 'Mở rộng khu vực phòng họp cấp cao. Tạm dừng do thay đổi thiết kế từ chủ đầu tư.',
    location: 'Hà Nội'
  },
  {
    id: '4',
    code: 'PROJ-2024-110',
    name: 'Factory Floor B: Automation',
    ma_ct: 'PROJ-2024-110',
    ten_ct: 'Factory Floor B: Automation',
    status: 'In Progress',
    startDate: 'Feb 01, 2024',
    endDate: 'Aug 30, 2024',
    manager: 'Pham Van D',
    pc: 'Le Thi H',
    qa: 'Tran Van I',
    progress: 30,
    thumbnail: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600',
    description: 'Lắp đặt dây chuyền tự động hóa mới cho xưởng B. Yêu cầu độ chính xác cao.',
    location: 'Bình Dương'
  }
];
