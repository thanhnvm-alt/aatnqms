
import { PlanEntity, PlanResponse } from '../types';

/**
 * Chuyển đổi Unix timestamp sang định dạng ngày Việt Nam (dd/MM/yyyy)
 */
export const formatUnixDate = (timestamp: number): string => {
  if (!timestamp) return '';
  // Unix epoch trong DB thường là seconds, JS dùng milliseconds
  const date = new Date(timestamp * 1000); 
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

/**
 * Transform Data Object: Chuyển đổi từ DB Row (Snake_case) sang App Entity (CamelCase/Formatted)
 * Giúp Frontend dễ làm việc hơn và ẩn cấu trúc DB thực tế.
 */
export const transformPlan = (row: PlanEntity): PlanResponse => {
  return {
    id: row.id,
    headcode: row.headcode,
    maCongTrinh: row.ma_ct,
    tenCongTrinh: row.ten_ct,
    maNhaMay: row.ma_nha_may || '',
    tenHangMuc: row.ten_hang_muc,
    dvt: row.dvt || 'PCS',
    soLuongIpo: row.so_luong_ipo,
    ngayTao: formatUnixDate(row.created_at)
  };
};

/**
 * Hàm sleep giả lập delay (nếu cần test loading)
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
