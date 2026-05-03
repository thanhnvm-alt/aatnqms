
import { IPOItem, IPOResponse } from '../types';

/**
 * Chuyển đổi mixed date (chuỗi dd/mm/yyyy, YYYY-MM-DD, hoặc Unix timestamp seconds) thành YYYY-MM-DD hoặc DD/MM/YYYY
 */
export const formatDisplayDate = (dateVal: string | number | undefined | null): string => {
    if (!dateVal) return '---';
    const strVal = String(dateVal);
    // Nếu là chuỗi số có 10 chữ số -> Unix timestamp (seconds)
    if (/^\d{10}$/.test(strVal)) {
        const date = new Date(parseInt(strVal, 10) * 1000);
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }
    // Nhận dạng DD/MM/YYYY hh:mm:ss
    if (/^\d{2}\/\d{2}\/\d{4}/.test(strVal)) {
        return strVal.substring(0, 10);
    }
    
    // Nếu đã có format YYYY-MM-DD, thử chuyển sang DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}/.test(strVal)) {
        const strDatePart = strVal.substring(0, 10);
        const [y, m, d] = strDatePart.split('-');
        return `${d}/${m}/${y}`;
    }
    
    // Nếu là chuỗi ISO chứa chữ T
    if (strVal.includes('T')) {
        const datePart = strVal.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            const [y, m, d] = datePart.split('-');
            return `${d}/${m}/${y}`;
        }
    }
    
    // Những TH khác thì return y xì
    return strVal;
};

/**
 * Chuyển đổi Unix timestamp sang định dạng ngày Việt Nam (dd/MM/yyyy)
 */
export const formatUnixDate = (timestamp: number): string => {
  if (!timestamp) return '';
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
export const transformIPO = (row: IPOItem): IPOResponse => {
  return {
    id: row.id,
    headcode: row.headcode,
    maCongTrinh: row.ma_ct,
    tenCongTrinh: row.ten_ct,
    maNhaMay: row.ma_nha_may || '',
    tenHangMuc: row.ten_hang_muc,
    dvt: row.dvt || 'PCS',
    soLuongIpo: row.so_luong_ipo,
    ngayTao: formatUnixDate(row.created_at || 0)
  };
};

/**
 * Hàm sleep giả lập delay (nếu cần test loading)
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Upload image to server
 */
export const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
};

export const getProxyImageUrl = (url: string | undefined | null): string => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return url;
    return `/${url}`;
};
