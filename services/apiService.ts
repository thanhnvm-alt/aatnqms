
import { Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, NCR, Defect, DefectLibraryItem } from '../types';
import ExcelJS from 'exceljs';
import { signToken } from '../lib/jwt';
import { 
    authenticateUser, 
    getPlans, 
    getInspectionsPaginated, 
    getInspectionById, 
    saveInspection, 
    deleteInspection, 
    getProjects, 
    getProjectByCode, 
    updateProject as dbUpdateProject,
    getUsers, 
    saveUser as dbSaveUser, 
    deleteUser as dbDeleteUser, 
    importUsers as dbImportUsers,
    getWorkshops, 
    saveWorkshop as dbSaveWorkshop, 
    deleteWorkshop as dbDeleteWorkshop,
    getTemplates, 
    saveTemplate as dbSaveTemplate,
    getNcrs, 
    getNcrById, 
    saveNcrMapped, 
    getDefects,
    getDefectLibrary, 
    saveDefectLibraryItem as dbSaveDefectLibrary, 
    deleteDefectLibraryItem as dbDeleteDefectLibrary,
    getRoles, 
    saveRole as dbSaveRole, 
    deleteRole as dbDeleteRole,
    importPlansBatch
} from '../lib/db/queries';

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const getAuthHeaders = () => {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) return {};
  try {
      const { access_token } = JSON.parse(stored);
      return { 
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
      };
  } catch(e) {
      return { 'Content-Type': 'application/json' };
  }
};

// HYBRID MODE: Direct DB calls wrapper
// This avoids network calls to /api/* which fail in Vite dev environment (405 Method Not Allowed)
// while maintaining separation of concerns.

// LOGIN
export const login = async (username: string, password: string) => {
    try {
        const user = await authenticateUser(username);
        
        if (!user) {
            throw new Error('Invalid credentials');
        }

        // NOTE: Plaintext password check for demo/audit remediation only.
        // Production must use bcrypt/argon2.
        if (user.password !== password) {
            throw new Error('Invalid credentials');
        }

        const token = await signToken({
            sub: user.id,
            username: user.username,
            role: user.role,
            name: user.name
        });

        const { password: _, ...safeUser } = user;

        return {
            access_token: token,
            user: safeUser
        };
    } catch (error: any) {
        throw error;
    }
};

export const checkApiConnection = async () => {
    // Check DB connection directly
    try {
        const users = await getUsers(); // Simple query to test connectivity
        return { ok: true };
    } catch(e) {
        return { ok: false };
    }
};

// PLANS
export const fetchPlans = async (search: string = '', page: number = 1, limit: number = 50) => {
    return await getPlans({ search, page, limit });
};

export const importPlans = async (plans: PlanItem[]) => {
    await importPlansBatch(plans);
};

// INSPECTIONS
export const fetchInspections = async (filters: any = {}) => {
    return await getInspectionsPaginated(filters);
};

export const fetchInspectionById = async (id: string) => {
    return await getInspectionById(id);
};

export const saveInspectionToSheet = async (inspection: Inspection) => {
    await saveInspection(inspection);
};

export const deleteInspectionFromSheet = async (id: string) => {
    await deleteInspection(id);
};

export const importInspections = async (inspections: Inspection[]) => {
    for (const insp of inspections) {
        await saveInspectionToSheet(insp);
    }
};

// PROJECTS
export const fetchProjects = async () => await getProjects();
export const fetchProjectByCode = async (code: string) => await getProjectByCode(code);
export const updateProject = async (project: Project) => await dbUpdateProject(project);
export const fetchProjectsSummary = async () => fetchProjects();

// USERS
export const fetchUsers = async () => await getUsers();
export const saveUser = async (user: User) => await dbSaveUser(user);
export const deleteUser = async (id: string) => await dbDeleteUser(id);
export const importUsers = async (users: User[]) => await dbImportUsers(users);

// WORKSHOPS
export const fetchWorkshops = async () => await getWorkshops();
export const saveWorkshop = async (ws: Workshop) => await dbSaveWorkshop(ws);
export const deleteWorkshop = async (id: string) => await dbDeleteWorkshop(id);

// TEMPLATES
export const fetchTemplates = async () => await getTemplates();
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => await dbSaveTemplate(moduleId, items);

// NCRS & DEFECTS
export const fetchNcrs = async (params: any = {}) => await getNcrs(params);
export const fetchNcrById = async (id: string) => await getNcrById(id);
export const fetchDefects = async (params: any = {}) => await getDefects(params);
export const saveNcr = async (ncr: NCR) => {
    if (!ncr.inspection_id) throw new Error("Missing inspection_id for NCR");
    await saveNcrMapped(ncr.inspection_id, ncr, "System"); 
};

export const fetchDefectLibrary = async () => await getDefectLibrary();
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => await dbSaveDefectLibrary(item);
export const deleteDefectLibraryItem = async (id: string) => await dbDeleteDefectLibrary(id);

export const exportDefectLibrary = async () => {
    // Client-side export to avoid 405 on route handler
    const data = await getDefectLibrary();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Defect Library');
    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'code', width: 15 },
      { header: 'Tên Lỗi', key: 'name', width: 30 },
      { header: 'Nhóm Lỗi', key: 'category', width: 20 },
      { header: 'Công Đoạn', key: 'stage', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả Lỗi', key: 'description', width: 50 },
      { header: 'Biện Pháp Khắc Phục', key: 'suggestedAction', width: 40 }
    ];
    // @ts-ignore
    data.forEach((item: any) => worksheet.addRow(item));
    await saveExcelLocally(workbook, `DefectLibrary_Export_${Date.now()}.xlsx`);
};

export const importDefectLibraryFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) throw new Error("Sheet empty");
    
    let count = 0;
    worksheet.eachRow(async (row, rowNumber) => {
      if (rowNumber === 1) return;
      const defect = {
        id: row.getCell(1).value?.toString() || `DEF_${Date.now()}_${rowNumber}`,
        code: row.getCell(1).value?.toString() || '',
        name: row.getCell(2).value?.toString() || '',
        category: row.getCell(3).value?.toString() || 'Ngoại quan',
        stage: row.getCell(4).value?.toString() || 'Chung',
        severity: (row.getCell(5).value?.toString() || 'MINOR') as any,
        description: row.getCell(6).value?.toString() || '',
        suggestedAction: row.getCell(7).value?.toString() || ''
      } as DefectLibraryItem;

      if (defect.code) {
          await dbSaveDefectLibrary(defect);
          count++;
      }
    });
    return { count };
};

// ROLES
export const fetchRoles = async () => await getRoles();
export const saveRole = async (role: Role) => await dbSaveRole(role);
export const deleteRole = async (id: string) => await dbDeleteRole(id);

// EXCEL HELPERS
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

export const exportPlans = async () => {
    const result = await fetchPlans('', 1, 1000);
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
    // @ts-ignore
    result.items.forEach((item: any) => worksheet.addRow(item));
    await saveExcelLocally(workbook, `AATN_Plans_${new Date().toISOString().split('T')[0]}.xlsx`);
};

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
            plannedDate: row.getCell(8).value?.toString(),
            status: 'PENDING'
        };
        if(plan.ma_nha_may || plan.headcode) plans.push(plan);
    });
    return plans;
};
