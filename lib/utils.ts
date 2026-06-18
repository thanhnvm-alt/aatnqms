
import { IPOItem, IPOResponse } from '../types';

/**
 * Chuyển đổi mixed date (chuỗi dd/mm/yyyy, YYYY-MM-DD, hoặc Unix timestamp seconds) thành YYYY-MM-DD hoặc DD/MM/YYYY
 */
export const formatDisplayDate = (dateVal: string | number | undefined | null): string => {
    if (!dateVal) return '---';
    const strVal = String(dateVal);
    // Nếu là chuỗi số có 10 hoặc 13 chữ số -> Unix timestamp
    if (/^\d{10}$/.test(strVal)) {
        const date = new Date(parseInt(strVal, 10) * 1000);
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }
    if (/^\d{13}$/.test(strVal)) {
        const date = new Date(parseInt(strVal, 10));
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
 * Remove Vietnamese accents/tones for accent-insensitive search and normalize NFC/NFD
 */
export function removeVietnameseTones(str: string): string {
    if (!str) return '';
    let res = str;
    res = res.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    res = res.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    res = res.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    res = res.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    res = res.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    res = res.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    res = res.replace(/đ/g, "d");
    res = res.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    res = res.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    res = res.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    res = res.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    res = res.replace(/Ù|Ú|Ụ|Ủ|Ữ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    res = res.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    res = res.replace(/Đ/g, "D");
    // Some system encode accents separately (combining diacritical marks)
    res = res.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return res;
}

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
