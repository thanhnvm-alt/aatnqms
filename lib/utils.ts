import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function removeVietnameseTones(str: string): string {
    if (!str) return str;
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
    str = str.replace(/\u02C6|\u0306|\u031B/g, "");
    return str;
}

function parseDateInput(input: any): Date | null {
    if (!input) return null;
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    if (typeof input === 'number') {
        const d = new Date(input < 1e12 ? input * 1000 : input);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;
        if (/^\d+$/.test(trimmed)) {
            const num = Number(trimmed);
            const d = new Date(num < 1e12 ? num * 1000 : num);
            return isNaN(d.getTime()) ? null : d;
        }
        // Match DD/MM/YYYY or DD-MM-YYYY
        const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (ddmmyyyy) {
            const [, d, m, y] = ddmmyyyy;
            const dObj = new Date(Number(y), Number(m) - 1, Number(d));
            return isNaN(dObj.getTime()) ? null : dObj;
        }
        const dObj = new Date(trimmed);
        return isNaN(dObj.getTime()) ? null : dObj;
    }
    return null;
}

export function formatDateTime(timestamp: number | string | Date): string {
    if (!timestamp) return '';
    try {
        const date = parseDateInput(timestamp);
        if (!date) return '';
        return date.toLocaleString('vi-VN', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh'
        });
    } catch (e) {
        return '';
    }
}

export function formatDisplayDate(timestamp: number | string | Date): string {
    if (!timestamp) return '';
    try {
        const date = parseDateInput(timestamp);
        if (!date) return '';
        return date.toLocaleDateString('vi-VN', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
        });
    } catch (e) {
        return '';
    }
}

/**
 * Implementation Date Priority Logic:
 * 1. date (from form "Ngày kiểm")
 * 2. created_at
 * 3. updated_at
 */
export function getImplementationDate(item: any): any {
    if (!item) return null;
    if (item.date && item.date !== '') return item.date;
    if (item.created_at) return item.created_at;
    if (item.updated_at) return item.updated_at;
    return null;
}

export function getGmt7DayBounds(dateStr: string): { unixStart: number, unixEnd: number } {
    const [d, m, y] = dateStr.split('/');
    const isoStart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+07:00`;
    const isoEnd = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T23:59:59+07:00`;
    return {
        unixStart: Math.floor(new Date(isoStart).getTime() / 1000),
        unixEnd: Math.floor(new Date(isoEnd).getTime() / 1000)
    };
}

export function getGmt7MonthBounds(year: number, month: number): { unixStart: number, unixEnd: number } {
    const mStr = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const lStr = String(lastDay).padStart(2, '0');
    const isoStart = `${year}-${mStr}-01T00:00:00+07:00`;
    const isoEnd = `${year}-${mStr}-${lStr}T23:59:59+07:00`;
    return {
        unixStart: Math.floor(new Date(isoStart).getTime() / 1000),
        unixEnd: Math.floor(new Date(isoEnd).getTime() / 1000)
    };
}
