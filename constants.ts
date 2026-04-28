

import { CheckStatus, Inspection, InspectionStatus, Priority, IPOItem, User, ModuleId, Workshop, Project } from "./types";

export const INITIAL_CHECKLIST_TEMPLATE = [
  { id: 'site_1', category: 'Lắp đặt', label: 'Vệ sinh khu vực thi công', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_2', category: 'Lắp đặt', label: 'Kiểm tra mặt bằng/cao độ', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_3', category: 'Hoàn thiện', label: 'Độ kín khít silicon/keo', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_4', category: 'Hoàn thiện', label: 'Vệ sinh sản phẩm sau lắp', status: CheckStatus.PENDING, notes: '' },
  { id: 'site_5', category: 'An toàn', label: 'An toàn lao động/PCCC', status: CheckStatus.PENDING, notes: '' },
];

export const PQC_CHECKLIST_TEMPLATE = [
  { id: 'pqc_1', stage: 'Chuẩn bị', category: 'Thi công', label: 'Vệ sinh khu vực', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_2', stage: 'Gia công', category: 'Thi công', label: 'Cắt phôi', status: CheckStatus.PENDING, notes: '' },
  { id: 'pqc_3', stage: 'Lắp ráp', category: 'Thi công', label: 'Lắp ráp chi tiết', status: CheckStatus.PENDING, notes: '' },
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

export const STEP_CHECKLIST_TEMPLATE = [
  { id: 'step_1', category: 'Bước màu', label: 'Kiểm tra màu lót', status: CheckStatus.PENDING, notes: '' },
  { id: 'step_2', category: 'Bước màu', label: 'Kiểm tra màu tỉa', status: CheckStatus.PENDING, notes: '' },
  { id: 'step_3', category: 'Bước màu', label: 'Kiểm tra màu phủ', status: CheckStatus.PENDING, notes: '' },
];

export const FQC_CHECKLIST_TEMPLATE = [
  { id: 'fqc_1', category: 'Hoàn thiện', label: 'Vệ sinh sạch sẽ', status: CheckStatus.PENDING, notes: '' },
  { id: 'fqc_2', category: 'Hoàn thiện', label: 'Màu sắc đồng nhất', status: CheckStatus.PENDING, notes: '' },
  { id: 'fqc_3', category: 'Hoàn thiện', label: 'Đóng gói đúng quy cách', status: CheckStatus.PENDING, notes: '' },
];

export const SPR_CHECKLIST_TEMPLATE = [
  { id: 'spr_1', category: 'Mẫu', label: 'Mẫu mã đúng yêu cầu', status: CheckStatus.PENDING, notes: '' },
  { id: 'spr_2', category: 'Mẫu', label: 'Vật liệu đúng mẫu duyệt', status: CheckStatus.PENDING, notes: '' },
];

export const SITE_TEMPLATES = {
  BAN: [
    { id: 'ban_1', category: 'Ngoại quan', label: 'Màu sắc & Độ bóng', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_2', category: 'Ngoại quan', label: 'Lỗi bề mặt mặt bàn', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_3', category: 'Ngoại quan', label: 'Cạnh bàn & Chỉ dán', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_4', category: 'Ngoại quan', label: 'Vệ sinh sản phẩm', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_5', category: 'Kích thước', label: 'Dài x Rộng x Cao', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_6', category: 'Kích thước', label: 'Độ dày mặt bàn/chân', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_7', category: 'Kích thước', label: 'Độ vuông góc (Ke góc)', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_8', category: 'Kích thước', label: 'Độ phẳng mặt bàn', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_9', category: 'Kết cấu & Chức năng', label: 'Độ ổn định (Cân bằng)', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_10', category: 'Kết cấu & Chức năng', label: 'Liên kết phụ kiện', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_11', category: 'Kết cấu & Chức năng', label: 'Ngăn kéo/Cánh tủ', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_12', category: 'Kết cấu & Chức năng', label: 'Chân đế/Nút nhựa', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_13', category: 'Đóng gói', label: 'Tem nhãn & Mã hàng', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_14', category: 'Đóng gói', label: 'Quy cách đóng gói', status: CheckStatus.PENDING, notes: '' },
    { id: 'ban_15', category: 'Đóng gói', label: 'Bộ linh kiện đi kèm', status: CheckStatus.PENDING, notes: '' },
  ],
  GHE: [
    { id: 'ghe_1', category: 'Ngoại quan', label: 'Màu sắc & Độ bóng', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_2', category: 'Ngoại quan', label: 'Bề mặt sơn/xi mạ', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_3', category: 'Ngoại quan', label: 'Đường may/Bọc nệm', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_4', category: 'Ngoại quan', label: 'Vệ sinh', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_5', category: 'Kích thước', label: 'Cao x Rộng x Sâu', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_6', category: 'Kích thước', label: 'Độ cao mặt ngồi', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_7', category: 'Kích thước', label: 'Độ dày vật liệu', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_8', category: 'Kết cấu & An toàn', label: 'Độ cân bằng (Tứ trụ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_9', category: 'Kết cấu & An toàn', label: 'Độ rung lắc (Stability)', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_10', category: 'Kết cấu & An toàn', label: 'Mối hàn/Khớp nối', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_11', category: 'Kết cấu & An toàn', label: 'Thử tải tĩnh (Load test)', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_12', category: 'Kết cấu & An toàn', label: 'Nút chân/Bánh xe', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_13', category: 'Đóng gói', label: 'Tem nhãn & Mã hàng', status: CheckStatus.PENDING, notes: '' },
    { id: 'ghe_14', category: 'Đóng gói', label: 'Bảo vệ sản phẩm', status: CheckStatus.PENDING, notes: '' },
  ],
  TU: [
    { id: 'tu_1', category: 'Ngoại quan & Bề mặt', label: 'Màu sắc & Vân gỗ', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_2', category: 'Ngoại quan & Bề mặt', label: 'Lỗi bề mặt (Trầy/Mẻ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_3', category: 'Ngoại quan & Bề mặt', label: 'Vệ sinh bên trong', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_4', category: 'Ngoại quan & Bề mặt', label: 'Độ hở cánh cửa/ngăn kéo', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_5', category: 'Kích thước', label: 'Dài x Rộng x Sâu', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_6', category: 'Kích thước', label: 'Độ vuông góc (Thùng tủ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_7', category: 'Kích thước', label: 'Khoảng cách đợt (kệ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_8', category: 'Kết cấu & Phụ kiện', label: 'Bản lề cánh tủ', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_9', category: 'Kết cấu & Phụ kiện', label: 'Ray trượt ngăn kéo', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_10', category: 'Kết cấu & Phụ kiện', label: 'Độ ổn định (Chân tủ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_11', category: 'Kết cấu & Phụ kiện', label: 'Liên kết hậu tủ', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_12', category: 'Kết cấu & Phụ kiện', label: 'Tay nắm & Khóa', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_13', category: 'Đóng gói', label: 'Tem nhãn nội dung', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_14', category: 'Đóng gói', label: 'Chốt khóa an toàn', status: CheckStatus.PENDING, notes: '' },
    { id: 'tu_15', category: 'Đóng gói', label: 'Bộ phụ kiện lắp ráp', status: CheckStatus.PENDING, notes: '' },
  ],
  GIUONG: [
    { id: 'giuong_1', category: 'Ngoại quan & Thẩm mỹ', label: 'Màu sắc & Bề mặt sơn', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_2', category: 'Ngoại quan & Thẩm mỹ', label: 'Lỗi trầy xước/Mẻ', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_3', category: 'Ngoại quan & Thẩm mỹ', label: 'Vải/Da bọc (nếu có)', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_4', category: 'Ngoại quan & Thẩm mỹ', label: 'Độ nhẵn mịn', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_5', category: 'Kích thước', label: 'Kích thước lọt lòng', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_6', category: 'Kích thước', label: 'Chiều cao đầu giường', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_7', category: 'Kích thước', label: 'Độ dày thành giường/Vạt', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_8', category: 'Kết cấu & Độ bền', label: 'Độ khít khớp nối', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_9', category: 'Kết cấu & Độ bền', label: 'Thử tiếng động (Noise test)', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_10', category: 'Kết cấu & Độ bền', label: 'Vạt giường (Slats)', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_11', category: 'Kết cấu & Độ bền', label: 'Chân trung tâm (Center leg)', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_12', category: 'Kết cấu & Độ bền', label: 'Ngăn kéo/Ben nâng', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_13', category: 'Đóng gói & Phụ kiện', label: 'Bộ ốc vít & Linh kiện', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_14', category: 'Đóng gói & Phụ kiện', label: 'Bảo vệ vận chuyển', status: CheckStatus.PENDING, notes: '' },
    { id: 'giuong_15', category: 'Đóng gói & Phụ kiện', label: 'Tem nhãn/Hướng dẫn', status: CheckStatus.PENDING, notes: '' },
  ],
  GUONG: [
    { id: 'guong_1', category: 'Bề mặt gương', label: 'Chất lượng hình ảnh', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_2', category: 'Bề mặt gương', label: 'Lỗi bề mặt kính', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_3', category: 'Bề mặt gương', label: 'Cạnh gương', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_4', category: 'Bề mặt gương', label: 'Vệ sinh bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_5', category: 'Ngoại quan khung', label: 'Màu sắc & Độ bóng', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_6', category: 'Ngoại quan khung', label: 'Mối nối góc khung', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_7', category: 'Ngoại quan khung', label: 'Lỗi khung (Gỗ/Kim loại)', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_8', category: 'Kết cấu & An toàn', label: 'Liên kết Kính - Khung', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_9', category: 'Kết cấu & An toàn', label: 'Phụ kiện treo (Móc)', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_10', category: 'Kết cấu & An toàn', label: 'Chân đứng (nếu có)', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_11', category: 'Kết cấu & An toàn', label: 'Tấm hậu (Backing)', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_12', category: 'Đóng gói', label: 'Tem cảnh báo "Hàng dễ vỡ"', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_13', category: 'Đóng gói', label: 'Chống va đập', status: CheckStatus.PENDING, notes: '' },
    { id: 'guong_14', category: 'Đóng gói', label: 'Thử nghiệm rơi (Drop test)', status: CheckStatus.PENDING, notes: '' },
  ],
  TU_AO: [
    { id: 'tuao_1', category: 'Ngoại quan & Bề mặt', label: 'Độ phẳng cánh tủ lớn', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_2', category: 'Ngoại quan & Bề mặt', label: 'Màu sắc & Vân gỗ', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_3', category: 'Ngoại quan & Bề mặt', label: 'Khe hở cánh & Ngăn kéo', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_4', category: 'Ngoại quan & Bề mặt', label: 'Vệ sinh & Chỉ cạnh', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_5', category: 'Kích thước & Lắp đặt', label: 'Dài x Rộng x Sâu', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_6', category: 'Kích thước & Lắp đặt', label: 'Độ vuông góc thùng tủ', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_7', category: 'Kích thước & Lắp đặt', label: 'Độ khít với tường (Liền tường)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_8', category: 'Kết cấu & Phụ kiện', label: 'Bản lề & Giảm chấn', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_9', category: 'Kết cấu & Phụ kiện', label: 'Ray trượt (Cánh lùa)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_10', category: 'Kết cấu & Phụ kiện', label: 'Thanh treo quần áo', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_11', category: 'Kết cấu & Phụ kiện', label: 'Đợt di động (Kệ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_12', category: 'Kết cấu & Phụ kiện', label: 'Phụ kiện thông minh', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_13', category: 'An toàn & Đóng gói', label: 'Liên kết chống lật', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_14', category: 'An toàn & Đóng gói', label: 'Tem nhãn & Hướng dẫn', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuao_15', category: 'An toàn & Đóng gói', label: 'Đóng gói linh kiện', status: CheckStatus.PENDING, notes: '' },
  ],
  TRAN: [
    { id: 'tran_1', category: 'Bề mặt hoàn thiện', label: 'Độ phẳng bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_2', category: 'Bề mặt hoàn thiện', label: 'Màu sắc & Độ mịn sơn', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_3', category: 'Bề mặt hoàn thiện', label: 'Lỗi nứt nẻ/Ố vàng', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_4', category: 'Bề mặt hoàn thiện', label: 'Đường chỉ/Phào (Molding)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_5', category: 'Kết cấu & Kỹ thuật', label: 'Cao độ trần (Height)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_6', category: 'Kết cấu & Kỹ thuật', label: 'Độ chắc chắn của khung', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_7', category: 'Kết cấu & Kỹ thuật', label: 'Ty treo & Khoảng cách', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_8', category: 'Kết cấu & Kỹ thuật', label: 'Khe co giãn (nếu có)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_9', category: 'Chi tiết lắp đặt', label: 'Lỗ đèn & Thiết bị', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_10', category: 'Chi tiết lắp đặt', label: 'Độ khít thiết bị', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_11', category: 'Chi tiết lắp đặt', label: 'Nắp thăm trần (Manhole)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_12', category: 'Chi tiết lắp đặt', label: 'Liên kết góc (Conner)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_13', category: 'Vệ sinh & Bàn giao', label: 'Vệ sinh sau thi công', status: CheckStatus.PENDING, notes: '' },
    { id: 'tran_14', category: 'Vệ sinh & Bàn giao', label: 'Dọn dẹp phế liệu', status: CheckStatus.PENDING, notes: '' },
  ],
  TUONG: [
    { id: 'tuong_1', category: 'Ngoại quan & Bề mặt', label: 'Độ phẳng bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_2', category: 'Ngoại quan & Bề mặt', label: 'Màu sắc & Độ bóng', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_3', category: 'Ngoại quan & Bề mặt', label: 'Mối nối (Joints)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_4', category: 'Ngoại quan & Bề mặt', label: 'Vệ sinh bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_5', category: 'Thông số kỹ thuật', label: 'Độ đứng (Plumb)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_6', category: 'Thông số kỹ thuật', label: 'Độ vuông góc (Square)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_7', category: 'Thông số kỹ thuật', label: 'Cao độ & Kích thước', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_8', category: 'Lắp đặt & Chi tiết', label: 'Điểm tiếp giáp (Silicon)', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_9', category: 'Lắp đặt & Chi tiết', label: 'Nẹp góc & Phào chỉ', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_10', category: 'Lắp đặt & Chi tiết', label: 'Lỗ khoét thiết bị', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_11', category: 'Lắp đặt & Chi tiết', label: 'Độ chắc chắn', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_12', category: 'Lắp đặt & Chi tiết', label: 'Len chân tường', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_13', category: 'An toàn & Bàn giao', label: 'Liên kết khung xương', status: CheckStatus.PENDING, notes: '' },
    { id: 'tuong_14', category: 'An toàn & Bàn giao', label: 'Bảo vệ bề mặt', status: CheckStatus.PENDING, notes: '' },
  ],
  SAN: [
    { id: 'san_1', category: 'Bề mặt & Ngoại quan', label: 'Độ phẳng bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_2', category: 'Bề mặt & Ngoại quan', label: 'Màu sắc & Vân', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_3', category: 'Bề mặt & Ngoại quan', label: 'Lỗi bề mặt (Trầy/Mẻ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_4', category: 'Bề mặt & Ngoại quan', label: 'Vệ sinh bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_5', category: 'Kỹ thuật lắp đặt', label: 'Độ cao (Level)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_6', category: 'Kỹ thuật lắp đặt', label: 'Độ rộng đường ron (Mạch)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_7', category: 'Kỹ thuật lắp đặt', label: 'Độ bám dính (Tiếng kêu)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_8', category: 'Kỹ thuật lắp đặt', label: 'Khe co giãn (Sàn gỗ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_9', category: 'Kỹ thuật lắp đặt', label: 'Độ dốc (Sàn nhà vệ sinh)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_10', category: 'Hoàn thiện chi tiết', label: 'Chà ron/Trét mạch', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_11', category: 'Hoàn thiện chi tiết', label: 'Len chân tường', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_12', category: 'Hoàn thiện chi tiết', label: 'Nẹp kết thúc/Nẹp nối', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_13', category: 'Hoàn thiện chi tiết', label: 'Cạnh đá/Gạch (Góc cột)', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_14', category: 'Bảo vệ & Bàn giao', label: 'Bảo vệ bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'san_15', category: 'Bảo vệ & Bàn giao', label: 'Ron silicone (nếu có)', status: CheckStatus.PENDING, notes: '' },
  ],
  CUA: [
    { id: 'cua_1', category: 'Ngoại quan & Bề mặt', label: 'Màu sắc & Độ bóng', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_2', category: 'Ngoại quan & Bề mặt', label: 'Lỗi bề mặt (Trầy/Mẻ)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_3', category: 'Ngoại quan & Bề mặt', label: 'Vệ sinh bề mặt', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_4', category: 'Ngoại quan & Bề mặt', label: 'Chất lượng kính (nếu có)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_5', category: 'Kỹ thuật lắp đặt', label: 'Độ đứng khung bao', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_6', category: 'Kỹ thuật lắp đặt', label: 'Khe hở cánh (Clearance)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_7', category: 'Kỹ thuật lắp đặt', label: 'Độ phẳng cánh cửa', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_8', category: 'Kỹ thuật lắp đặt', label: 'Ron cao su (Gasket)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_9', category: 'Phụ kiện & Vận hành', label: 'Đóng mở (Smoothness)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_10', category: 'Phụ kiện & Vận hành', label: 'Khóa & Tay nắm', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_11', category: 'Phụ kiện & Vận hành', label: 'Bản lề/Ray trượt', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_12', category: 'Phụ kiện & Vận hành', label: 'Độ kín khít (Chống nước)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_13', category: 'Phụ kiện & Vận hành', label: 'Tay co thủy lực (nếu có)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_14', category: 'Hoàn thiện chi tiết', label: 'Đường keo Silicon', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_15', category: 'Hoàn thiện chi tiết', label: 'Nắp che vít (Caps)', status: CheckStatus.PENDING, notes: '' },
    { id: 'cua_16', category: 'Hoàn thiện chi tiết', label: 'Tem nhãn & Bảo vệ', status: CheckStatus.PENDING, notes: '' },
  ]
};

export const SITE_CHECKLIST_TEMPLATE = SITE_TEMPLATES.BAN; // Default to BAN

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
  { id: 'SUPPLIERS', label: 'Nhà Cung Cấp', group: 'QC' },
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
    // Added missing position property
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
    // Added missing position property
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
    // Added missing position property
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
    // Added missing phone property
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
    // Added missing phone property
    phone: '0909888777',
    image: 'https://images.unsplash.com/photo-1535953046522-7d1bb3543e49?auto=format&fit=crop&q=80&w=400',
    stages: ['Bả trét', 'Sơn lót', 'Chà nhám nước', 'Sơn phủ', 'Đóng gói']
  }
];

export const MOCK_PLAN_DATA: IPOItem[] = [
  {
    id: '1',
    ma_nha_may: 'NM001',
    ma_ct: 'AATN-Alpha',
    ten_ct: 'Tầng 5 - Trục A-B',
    ten_hang_muc: 'Nghiệm thu cốt thép cột',
    dvt: 'SET',
    so_luong_ipo: 10
  },
  {
    id: '2',
    ma_nha_may: 'NM002',
    ma_ct: 'AATN-Beta',
    ten_ct: 'Khu B - Móng M1',
    ten_hang_muc: 'Kiểm tra độ sụt bê tông',
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
    // Fixed: Added priority property
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
    pm: 'Nguyen Van A',
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
    pm: 'Tran Thi B',
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
    pm: 'Le Van C',
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
    pm: 'Pham Van D',
    pc: 'Le Thi H',
    qa: 'Tran Van I',
    progress: 30,
    thumbnail: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600',
    description: 'Lắp đặt dây chuyền tự động hóa mới cho xưởng B. Yêu cầu độ chính xác cao.',
    location: 'Bình Dương'
  }
];
