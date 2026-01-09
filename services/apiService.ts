import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import * as db from './tursoService';
import ExcelJS from 'exceljs';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

/**
 * ISO Helper: Lưu file Excel trực tiếp từ trình duyệt
 */
const saveExcelLocally = async (workbook: ExcelJS.Workbook, fileName: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
};

export const checkApiConnection = async () => ({ ok: await db.testConnection() });
export const fetchRoles = async () => await db.getRoles();
export const saveRole = async (role: Role) => { await db.saveRole(role); return role; };
export const deleteRole = async (id: string) => { await db.deleteRole(id); };

export const fetchPlans = async (search: string = '', page?: number, limit?: number): Promise<PagedResult<PlanItem>> => {
  const result = await db.getPlans({ search, page, limit });
  return { items: result.items, total: result.total, page, limit };
};

export const importPlans = async (plans: PlanItem[]) => {
    await db.importPlansBatch(plans);
};

/**
 * Xuất kế hoạch sản xuất ra Excel (Client-side)
 */
export const exportPlans = async () => {
    try {
        const result = await db.getPlans({ limit: 1000 });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Kế hoạch sản xuất');

        worksheet.columns = [
            { header: 'Mã Nhà Máy', key: 'ma_nha_may', width: 20 },
            { header: 'Headcode', key: 'headcode', width: 15 },
            { header: 'Mã Công Trình', key: 'ma_ct', width: 15 },
            { header: 'Tên Công Trình', key: 'ten_ct', width: 30 },
            { header: 'Tên Sản Phẩm', key: 'ten_hang_muc', width: 30 },
            { header: 'Số Lượng IPO', key: 'so_luong_ipo', width: 15 },
            { header: 'ĐVT', key: 'dvt', width: 10 },
            { header: 'Ngày Kế Hoạch', key: 'plannedDate', width: 15 }
        ];

        result.items.forEach(item => {
            worksheet.addRow(item);
        });

        worksheet.getRow(1).font = { bold: true };
        await saveExcelLocally(workbook, `AATN_Plans_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e: any) {
        alert("Lỗi khi xuất kế hoạch: " + e.message);
    }
};

/**
 * Nhập kế hoạch từ file Excel (Client-side)
 */
export const importPlansFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error("File Excel không có dữ liệu");

    const plans: PlanItem[] = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const plan: PlanItem = {
            ma_nha_may: row.getCell(1).value?.toString() || '',
            headcode: row.getCell(2).value?.toString() || '',
            ma_ct: row.getCell(3).value?.toString() || '',
            ten_ct: row.getCell(4).value?.toString() || '',
            ten_hang_muc: row.getCell(5).value?.toString() || '',
            so_luong_ipo: Number(row.getCell(6).value) || 0,
            dvt: row.getCell(7).value?.toString() || 'PCS',
            plannedDate: row.getCell(8).value?.toString() || new Date().toISOString().split('T')[0],
            status: 'PENDING'
        };
        if (plan.ma_nha_may) plans.push(plan);
    });

    await db.importPlansBatch(plans);
    return { success: true, count: plans.length };
};

export const fetchInspections = async (filters: any = {}): Promise<PagedResult<Inspection>> => {
  const result = await db.getInspectionsPaginated(filters);
  return { items: result.items, total: result.total, page: filters.page, limit: filters.limit };
};

export const importInspections = async (inspections: Inspection[]) => {
    for (const insp of inspections) {
        await db.saveInspection(insp);
    }
};

export const fetchInspectionById = async (id: string) => await db.getInspectionById(id);
export const fetchNcrs = async (params: any = {}) => ({ items: await db.getNcrs(params), total: 0 });
export const fetchNcrById = async (id: string) => await db.getNcrById(id);
export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => await db.saveNcrMapped(inspection_id, ncr, createdBy);
export const fetchDefects = async (params: any = {}) => ({ items: await db.getDefects(params), total: 0 });

export const fetchDefectLibrary = async () => await db.getDefectLibrary();
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await db.saveDefectLibraryItem(item);
export const deleteDefectLibraryItem = async (id: string) => { await db.deleteDefectLibraryItem(id); };

/**
 * Xuất thư viện lỗi ra file Excel (Client-side)
 */
export const exportDefectLibrary = async () => {
    try {
        const library = await db.getDefectLibrary();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Defect Library');

        worksheet.columns = [
            { header: 'Mã Lỗi', key: 'code', width: 15 },
            { header: 'Tên Lỗi', key: 'name', width: 30 },
            { header: 'Nhóm Lỗi', key: 'category', width: 20 },
            { header: 'Công Đoạn', key: 'stage', width: 20 },
            { header: 'Mức Độ', key: 'severity', width: 15 },
            { header: 'Mô Tả Lỗi', key: 'description', width: 50 },
            { header: 'Hành Động Gợi Ý', key: 'suggestedAction', width: 40 }
        ];

        library.forEach(item => {
            worksheet.addRow(item);
        });

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

        await saveExcelLocally(workbook, `AATN_Defect_Library_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e: any) {
        alert("Lỗi khi xuất thư viện lỗi: " + e.message);
    }
};

/**
 * Nhập thư viện lỗi từ file Excel (Client-side)
 */
export const importDefectLibraryFile = async (file: File) => {
    try {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) throw new Error("File Excel trống");

        const defects: DefectLibraryItem[] = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const code = row.getCell(1).value?.toString() || '';
            if (code) {
                defects.push({
                    id: code,
                    code: code,
                    name: row.getCell(2).value?.toString() || '',
                    category: row.getCell(3).value?.toString() || 'Ngoại quan',
                    stage: row.getCell(4).value?.toString() || 'Chung',
                    severity: (row.getCell(5).value?.toString() as any) || 'MINOR',
                    description: row.getCell(6).value?.toString() || '',
                    suggestedAction: row.getCell(7).value?.toString() || ''
                });
            }
        });

        for (const def of defects) {
            await db.saveDefectLibraryItem(def);
        }

        return { success: true, count: defects.length };
    } catch (e: any) {
        throw new Error("Lỗi đọc file Excel: " + e.message);
    }
};

export const saveInspectionToSheet = async (inspection: Inspection) => { await db.saveInspection(inspection); return { success: true }; };
export const deleteInspectionFromSheet = async (id: string) => { await db.deleteInspection(id); };
export const fetchProjects = async () => await db.getProjects();
export const fetchProjectByCode = async (code: string) => await db.getProjectByCode(code);
export const fetchProjectsSummary = async () => {
    const projects = await db.getProjects();
    return projects;
};

export const updateProject = async (project: Project) => { await db.saveProjectMetadata(project); return project; };
export const fetchUsers = async () => await db.getUsers();
export const saveUser = async (user: User) => { await db.saveUser(user); return user; };
export const deleteUser = async (id: string) => { await db.deleteUser(id); };
export const fetchWorkshops = async () => await db.getWorkshops();
export const saveWorkshop = async (ws: Workshop) => { await db.saveWorkshop(ws); return ws; };
export const deleteWorkshop = async (id: string) => { await db.deleteWorkshop(id); };
export const fetchTemplates = async () => await db.getTemplates();
export const saveTemplate = async (m: string, i: CheckItem[]) => { await db.saveTemplate(m, i); };