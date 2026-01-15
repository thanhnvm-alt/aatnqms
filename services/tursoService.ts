
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, Defect, DefectLibraryItem, NCRComment, Notification } from "../types";
import { withRetry } from "../lib/retry";

const cleanArgs = (args: any[]): any[] => {
  return args.map(arg => {
    if (arg === undefined) return null;
    return arg;
  });
};

const ensureTableColumns = async (table: string, columns: string[]) => {
    for (const col of columns) {
        try {
            await turso.execute(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
        } catch (e: any) {
            // Ignore error if column exists
        }
    }
};

export const initDatabase = async () => {
  if (!isTursoConfigured) {
    console.warn("⚠️ Turso is not configured. Database will not be initialized.");
    return;
  }

  try {
    await withRetry(() => turso.execute("SELECT 1"), { maxRetries: 5, initialDelay: 500 });
    
    await turso.execute(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, stt INTEGER, ma_nha_may TEXT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo INTEGER, plannedDate TEXT, assignee TEXT, status TEXT, pthsp TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS inspections (id TEXT PRIMARY KEY, data TEXT, created_at INTEGER, updated_at INTEGER, created_by TEXT, ma_ct TEXT, ten_ct TEXT, ma_nha_may TEXT, ten_hang_muc TEXT, workshop TEXT, status TEXT, type TEXT, score INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS projects (ma_ct TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT UNIQUE, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, correct_image TEXT, incorrect_image TEXT, created_by TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_id TEXT NOT NULL, defect_code TEXT, severity TEXT, status TEXT, description TEXT, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, comments_json TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, closed_at INTEGER, deleted_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT, username TEXT UNIQUE, role TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT, code TEXT UNIQUE, name TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, data TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, userId TEXT, type TEXT, title TEXT, message TEXT, link_json TEXT, isRead INTEGER, createdAt INTEGER)`);

    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_iqc (id TEXT PRIMARY KEY, po_number TEXT, supplier TEXT, supplier_address TEXT, inspection_date TEXT, inspector_name TEXT, status TEXT, reference_docs TEXT, data TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_sqc_vt (id TEXT PRIMARY KEY, po_number TEXT, supplier TEXT, supplier_address TEXT, location TEXT, inspection_date TEXT, inspector_name TEXT, status TEXT, data TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_sqc_btp (id TEXT PRIMARY KEY, po_number TEXT, supplier TEXT, supplier_address TEXT, location TEXT, inspection_date TEXT, inspector_name TEXT, status TEXT, data TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_pqc (id TEXT PRIMARY KEY, ma_ct TEXT, ten_ct TEXT, ma_nha_may TEXT, workshop TEXT, stage TEXT, inspector TEXT, status TEXT, qty_total REAL, qty_pass REAL, qty_fail REAL, data TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_site (id TEXT PRIMARY KEY, ma_ct TEXT, ten_ct TEXT, location TEXT, inspector TEXT, status TEXT, data TEXT, created_at INTEGER, updated_at INTEGER)`);

    try { await turso.execute("ALTER TABLE workshops ADD COLUMN code TEXT"); await turso.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_code ON workshops(code)"); } catch (e) {}
    try { await turso.execute("ALTER TABLE workshops ADD COLUMN name TEXT"); } catch (e) {}
    try { await turso.execute("ALTER TABLE workshops ADD COLUMN created_at INTEGER"); } catch (e) {}
    try { await turso.execute("ALTER TABLE workshops ADD COLUMN updated_at INTEGER"); } catch (e) {}
    
    await ensureTableColumns('forms_iqc', ['po_number', 'supplier', 'supplier_address', 'inspection_date', 'inspector_name', 'status', 'reference_docs', 'data']);
    await ensureTableColumns('forms_sqc_vt', ['po_number', 'supplier', 'supplier_address', 'location', 'inspection_date', 'inspector_name', 'status', 'data', 'created_at', 'updated_at']);
    await ensureTableColumns('forms_sqc_btp', ['po_number', 'supplier', 'supplier_address', 'location', 'inspection_date', 'inspector_name', 'status', 'data', 'created_at', 'updated_at']);
    await ensureTableColumns('forms_pqc', ['ma_ct', 'ten_ct', 'ma_nha_may', 'workshop', 'stage', 'inspector', 'status', 'qty_total', 'qty_pass', 'qty_fail', 'data', 'created_at', 'updated_at', 'created_by']);
    await ensureTableColumns('forms_site', ['ma_ct', 'ten_ct', 'location', 'inspector', 'status', 'data', 'created_at', 'updated_at']);

    console.log("✅ QMS Database initialized and verified.");
  } catch (e: any) {
    console.error("❌ Turso initialization error:", e);
  }
};

export const getNotifications = async (userId: string): Promise<Notification[]> => {
    const res = await turso.execute({
        sql: `SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50`,
        args: [userId]
    });
    return res.rows.map(r => ({
        id: String(r.id),
        userId: String(r.userId),
        type: r.type as any,
        title: String(r.title),
        message: String(r.message),
        link: r.link_json ? JSON.parse(r.link_json as string) : undefined,
        isRead: Boolean(r.isRead),
        createdAt: Number(r.createdAt)
    }));
};

export const saveNotification = async (notif: Notification) => {
    await turso.execute({
        sql: `INSERT INTO notifications (id, userId, type, title, message, link_json, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [notif.id, notif.userId, notif.type, notif.title, notif.message, notif.link ? JSON.stringify(notif.link) : null, notif.isRead ? 1 : 0, notif.createdAt]
    });
};

export const markNotificationAsRead = async (id: string) => {
    await turso.execute({
        sql: `UPDATE notifications SET isRead = 1 WHERE id = ?`,
        args: [id]
    });
};

export const markAllNotificationsAsRead = async (userId: string) => {
    await turso.execute({
        sql: `UPDATE notifications SET isRead = 1 WHERE userId = ?`,
        args: [userId]
    });
};

export const testConnection = async () => { try { await withRetry(() => turso.execute("SELECT 1")); return true; } catch (e) { return false; } };

export const getProjects = async (): Promise<Project[]> => {
    if (!isTursoConfigured) return [];
    try {
        return await withRetry(async () => {
            const derivedRes = await turso.execute(`
                SELECT ma_ct, MAX(ten_ct) as ten_ct FROM (
                    SELECT ma_ct, ten_ct FROM plans WHERE ma_ct IS NOT NULL AND ma_ct != '' 
                    UNION ALL 
                    SELECT ma_ct, ten_ct FROM inspections WHERE ma_ct IS NOT NULL AND ma_ct != ''
                    UNION ALL
                    SELECT ma_ct, ten_ct FROM forms_pqc WHERE ma_ct IS NOT NULL AND ma_ct != ''
                    UNION ALL
                    SELECT ma_ct, ten_ct FROM forms_site WHERE ma_ct IS NOT NULL AND ma_ct != ''
                ) GROUP BY ma_ct`);
            const metaRes = await turso.execute("SELECT ma_ct, data FROM projects");
            const metaMap: Record<string, Project> = {};
            metaRes.rows.forEach(row => {
                try { if (row.data) metaMap[row.ma_ct as string] = JSON.parse(row.data as string); } catch(e) {}
            });
            return derivedRes.rows.map(row => {
                const ma_ct = String(row.ma_ct);
                const ten_ct = String(row.ten_ct || ma_ct);
                if (metaMap[ma_ct]) return { ...metaMap[ma_ct], ma_ct }; 
                return { id: `proj_${ma_ct}`, code: ma_ct, ma_ct, name: ten_ct, ten_ct, status: 'Planning', pm: 'Chưa phân công', progress: 0, thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=400', startDate: new Date().toISOString().split('T')[0], images: [] } as Project;
            });
        });
    } catch (err) { return []; }
};

export const getProjectByCode = async (maCt: string): Promise<Project | null> => {
    if (!isTursoConfigured) return null;
    return await withRetry(async () => {
        const res = await turso.execute({ sql: "SELECT data FROM projects WHERE ma_ct = ?", args: cleanArgs([maCt]) });
        if (res.rows.length > 0) return JSON.parse(res.rows[0].data as string);
        return null;
    });
};

export const saveProjectMetadata = async (project: Project) => {
  if (!isTursoConfigured) return;
  const now = Math.floor(Date.now() / 1000);
  await withRetry(() => turso.execute({
    sql: `INSERT INTO projects (ma_ct, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(ma_ct) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: cleanArgs([project.ma_ct, JSON.stringify(project), now])
  }));
};

export const getPlans = async (options: { search?: string, page?: number, limit?: number }) => {
    const { search = '', page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    const term = `%${search}%`;
    const res = await turso.execute({
        sql: `SELECT * FROM plans WHERE ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? LIMIT ? OFFSET ?`,
        args: cleanArgs([term, term, term, term, limit, offset])
    });
    const totalRes = await turso.execute({
        sql: `SELECT COUNT(*) as total FROM plans WHERE ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ?`,
        args: cleanArgs([term, term, term, term])
    });
    return { items: res.rows as unknown as PlanItem[], total: Number(totalRes.rows[0].total) };
};

export const importPlansBatch = async (plans: PlanItem[]) => {
    for (const plan of plans) {
        await turso.execute({
            sql: `INSERT INTO plans (stt, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, plannedDate, assignee, status, pthsp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: cleanArgs([plan.stt, plan.ma_nha_may, plan.headcode, plan.ma_ct, plan.ten_ct, plan.ten_hang_muc, plan.dvt, plan.so_luong_ipo, plan.plannedDate, plan.assignee, plan.status, plan.pthsp, Math.floor(Date.now()/1000)])
        });
    }
};

export const getInspectionsPaginated = async (filters: any) => {
    const { page = 1, limit = 20, status, type, ma_ct } = filters;
    const offset = (page - 1) * limit;
    
    // Updated queries to include explicit columns for all tables
    // Common columns alias:
    // col1: stage/location
    // col2: qty_total / total
    // col3: qty_pass
    // col4: qty_fail
    // col5: inspector / created_by
    // col_ma_ct: ma_ct
    // col_ten_ct: ten_ct
    // col_ten_hang_muc: ten_hang_muc
    // col_ma_nha_may: ma_nha_may/po_number
    // col_created_by: created_by (explicit for PQC)
    
    let sqlIns = `SELECT id, data, created_at, 'GENERIC' as src, NULL as col1, NULL as col2, NULL as col3, NULL as col4, created_by as col5, ma_ct as col_ma_ct, ten_ct as col_ten_ct, ten_hang_muc as col_ten_hang_muc, ma_nha_may as col_ma_nha_may FROM inspections WHERE 1=1`;
    
    let sqlIqc = `SELECT id, data, created_at, 'IQC' as src, NULL as col1, NULL as col2, NULL as col3, NULL as col4, inspector_name as col5, NULL as col_ma_ct, NULL as col_ten_ct, NULL as col_ten_hang_muc, po_number as col_ma_nha_may FROM forms_iqc WHERE 1=1`;
    
    // Updated PQC query: Use 'created_by' as the primary inspector field (col5) and select 'ten_hang_muc' explicitly
    let sqlPqc = `SELECT id, data, created_at, 'PQC' as src, stage as col1, qty_total as col2, qty_pass as col3, qty_fail as col4, created_by as col5, ma_ct as col_ma_ct, ten_ct as col_ten_ct, ten_hang_muc as col_ten_hang_muc, ma_nha_may as col_ma_nha_may FROM forms_pqc WHERE 1=1`;
    
    let sqlSqcVt = `SELECT id, data, created_at, 'SQC_MAT' as src, NULL as col1, NULL as col2, NULL as col3, NULL as col4, inspector_name as col5, NULL as col_ma_ct, NULL as col_ten_ct, NULL as col_ten_hang_muc, po_number as col_ma_nha_may FROM forms_sqc_vt WHERE 1=1`;
    
    let sqlSqcBtp = `SELECT id, data, created_at, 'SQC_BTP' as src, NULL as col1, NULL as col2, NULL as col3, NULL as col4, inspector_name as col5, NULL as col_ma_ct, NULL as col_ten_ct, NULL as col_ten_hang_muc, po_number as col_ma_nha_may FROM forms_sqc_btp WHERE 1=1`;
    
    let sqlSite = `SELECT id, data, created_at, 'SITE' as src, location as col1, NULL as col2, NULL as col3, NULL as col4, inspector as col5, ma_ct as col_ma_ct, ten_ct as col_ten_ct, NULL as col_ten_hang_muc, NULL as col_ma_nha_may FROM forms_site WHERE 1=1`;
    
    if (status && status !== 'ALL') { 
        sqlIns += ` AND status = '${status}'`; 
        sqlIqc += ` AND status = '${status}'`;
        sqlPqc += ` AND status = '${status}'`;
        sqlSqcVt += ` AND status = '${status}'`;
        sqlSqcBtp += ` AND status = '${status}'`;
        sqlSite += ` AND status = '${status}'`;
    }
    
    if (type && type !== 'ALL') { 
        sqlIns += ` AND type = '${type}'`; 
        if (type !== 'IQC') sqlIqc += ` AND 1=0`;
        if (type !== 'PQC') sqlPqc += ` AND 1=0`;
        if (type !== 'SQC_MAT') sqlSqcVt += ` AND 1=0`;
        if (type !== 'SQC_BTP') sqlSqcBtp += ` AND 1=0`;
        if (type !== 'SITE') sqlSite += ` AND 1=0`;
    }
    
    const combinedSql = `
        SELECT * FROM (
            ${sqlIns}
            UNION ALL
            ${sqlIqc}
            UNION ALL
            ${sqlPqc}
            UNION ALL
            ${sqlSqcVt}
            UNION ALL
            ${sqlSqcBtp}
            UNION ALL
            ${sqlSite}
        ) 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
    `;
    
    const res = await turso.execute({ 
        sql: combinedSql, 
        args: [limit, offset] 
    });

    const items = res.rows.map(r => {
        const jsonData = JSON.parse(r.data as string || '{}');
        const base = { ...jsonData, id: r.id, created_at: r.created_at };
        
        // Merge explicit columns if JSON is missing data (Common issue with PQC)
        if (r.col_ma_ct) base.ma_ct = r.col_ma_ct;
        if (r.col_ten_ct) base.ten_ct = r.col_ten_ct;
        if (r.col_ma_nha_may) base.ma_nha_may = r.col_ma_nha_may;
        if (r.col_ten_hang_muc) base.ten_hang_muc = r.col_ten_hang_muc;

        if (r.src === 'IQC') {
            base.type = 'IQC';
            if (r.col5) base.inspectorName = r.col5;
        } else if (r.src === 'PQC') {
            base.type = 'PQC';
            if (r.col1) { base.stage = r.col1; base.inspectionStage = r.col1; }
            if (r.col2 !== null) { base.qty_total = r.col2; base.inspectedQuantity = r.col2; }
            if (r.col3 !== null) { base.qty_pass = r.col3; base.passedQuantity = r.col3; }
            if (r.col4 !== null) { base.qty_fail = r.col4; base.failedQuantity = r.col4; }
            if (r.col5) { base.inspector = r.col5; base.inspectorName = r.col5; base.created_by = r.col5; }
            
            // Map created_at to date for List View
            if (r.created_at && !base.date) {
                 if (typeof r.created_at === 'number') {
                     base.date = new Date(r.created_at * 1000).toISOString().split('T')[0];
                 } else {
                     base.date = String(r.created_at).split(' ')[0];
                 }
            }
        } else if (r.src === 'SQC_MAT') {
            base.type = 'SQC_MAT';
            if (r.col5) base.inspectorName = r.col5;
        } else if (r.src === 'SQC_BTP') {
            base.type = 'SQC_BTP';
            if (r.col5) base.inspectorName = r.col5;
        } else if (r.src === 'SITE') {
            base.type = 'SITE';
            if (r.col1) base.location = r.col1;
            if (r.col5) base.inspectorName = r.col5;
        }
        
        return base;
    });
    
    return { items, total: 100 }; // Pagination count to be improved
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
    // Check Generic
    let res = await turso.execute({ sql: `SELECT data FROM inspections WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length > 0) return processInspectionResult(res.rows[0].data as string, id);

    // Check IQC
    res = await turso.execute({ sql: `SELECT data FROM forms_iqc WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length > 0) return processInspectionResult(res.rows[0].data as string, id, 'IQC');

    // Check PQC
    res = await turso.execute({ sql: `SELECT * FROM forms_pqc WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length > 0) {
        // Merge columns into JSON data for PQC to ensure data integrity
        const row = res.rows[0];
        const json = JSON.parse(row.data as string || '{}');
        
        // Map created_at to date
        let mappedDate = json.date;
        if (row.created_at) {
             // Try to format it nicely or just use it
             if (typeof row.created_at === 'number') {
                 mappedDate = new Date(row.created_at * 1000).toISOString().split('T')[0];
             } else {
                 mappedDate = String(row.created_at).split(' ')[0];
             }
        }

        const merged = {
            ...json,
            id: row.id,
            ma_ct: row.ma_ct || json.ma_ct,
            ten_ct: row.ten_ct || json.ten_ct,
            ten_hang_muc: row.ten_hang_muc || json.ten_hang_muc,
            ma_nha_may: row.ma_nha_may || json.ma_nha_may,
            workshop: row.workshop || json.workshop,
            inspectionStage: row.stage || json.inspectionStage,
            inspectorName: row.created_by || row.inspector || json.inspectorName,
            inspectedQuantity: row.qty_total ?? json.inspectedQuantity,
            passedQuantity: row.qty_pass ?? json.passedQuantity,
            failedQuantity: row.qty_fail ?? json.failedQuantity,
            created_at: row.created_at,
            date: mappedDate
        };
        return processInspectionResult(JSON.stringify(merged), id, 'PQC');
    }

    // Check SQC_VT
    res = await turso.execute({ sql: `SELECT data FROM forms_sqc_vt WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length > 0) return processInspectionResult(res.rows[0].data as string, id, 'SQC_MAT');

    // Check SQC_BTP
    res = await turso.execute({ sql: `SELECT data FROM forms_sqc_btp WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length > 0) return processInspectionResult(res.rows[0].data as string, id, 'SQC_BTP');

    // Check SITE
    res = await turso.execute({ sql: `SELECT data FROM forms_site WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length > 0) return processInspectionResult(res.rows[0].data as string, id, 'SITE');

    return null;
};

const processInspectionResult = async (dataStr: string, id: string, forceType?: string): Promise<Inspection> => {
    const inspection: Inspection = JSON.parse(dataStr);
    if (forceType) inspection.type = forceType as any;
    
    // Safety check for arrays
    if (!inspection.items) inspection.items = [];
    
    const ncrs = await getNcrs({ inspection_id: id });
    if (ncrs.length > 0) {
        if (inspection.items) {
            inspection.items = inspection.items.map(item => {
                const relatedNcr = ncrs.find(n => n.itemId === item.id || n.id === item.ncr?.id);
                if (relatedNcr) { return { ...item, ncr: relatedNcr, ncrId: relatedNcr.id }; }
                return item;
            });
        }
        if (inspection.materials) {
             inspection.materials = inspection.materials.map((mat: any) => ({
                ...mat,
                items: mat.items.map((item: any) => {
                    const relatedNcr = ncrs.find(n => n.itemId === item.id);
                    if (relatedNcr) return { ...item, ncr: relatedNcr, ncrId: relatedNcr.id };
                    return item;
                })
            }));
        }
    }
    return inspection;
};

// ... IQC Save Logic (Existing) ...
export const saveIQCForm = async (inspection: Inspection) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        // Save mapped NCRs first
        if (inspection.materials) {
            for (const mat of inspection.materials) {
                if (mat.items) {
                    for (const item of mat.items) {
                        if (item.ncr) {
                            await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName);
                        }
                    }
                }
            }
        }
        const jsonPayload = {
            materials: inspection.materials?.map((m: any) => ({
                ...m,
                items: (m.items || []).map((i: any) => { const { ncr, ...itemData } = i; return itemData; })
            })) || [],
            images: inspection.images || [],
            deliveryNoteImages: inspection.deliveryNoteImages || [],
            reportImages: inspection.reportImages || [],
            deliveryNoteImage: inspection.deliveryNoteImage,
            reportImage: inspection.reportImage,
            summary: inspection.summary,
            signature: inspection.signature,
            supplierAddress: inspection.supplierAddress,
            // Store common fields in JSON too for easier retrieval if columns missing
            ...inspection
        };

        const supplierAddress = inspection.supplierAddress || null;

        await turso.execute({
            sql: `INSERT INTO forms_iqc (
                id, po_number, supplier, supplier_address, inspection_date, inspector_name, 
                status, reference_docs, data, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                po_number = excluded.po_number,
                supplier = excluded.supplier,
                supplier_address = excluded.supplier_address,
                inspection_date = excluded.inspection_date,
                inspector_name = excluded.inspector_name,
                status = excluded.status,
                reference_docs = excluded.reference_docs,
                data = excluded.data,
                updated_at = excluded.updated_at`,
            args: cleanArgs([
                inspection.id,
                inspection.po_number,
                inspection.supplier,
                supplierAddress,
                inspection.date,
                inspection.inspectorName,
                inspection.status,
                JSON.stringify(inspection.referenceDocs || []),
                JSON.stringify(jsonPayload),
                now,
                now
            ])
        });
    } catch (e: any) {
        console.error("SQL Error in saveIQCForm:", e);
        throw new Error(`DB Error: ${e.message}`);
    }
};

/**
 * Saves PQC Form specifically to forms_pqc table
 */
export const savePQCForm = async (inspection: Inspection) => {
    try {
        const now = Math.floor(Date.now() / 1000);

        // Save mapped NCRs first
        if (inspection.items) {
            for (const item of inspection.items) {
                if (item.ncr) {
                    await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName);
                }
            }
        }

        // Prepare JSON Payload (Full data)
        const jsonPayload = {
            ...inspection,
            items: (inspection.items || []).map((i: any) => { const { ncr, ...itemData } = i; return itemData; })
        };

        await turso.execute({
            sql: `INSERT INTO forms_pqc (
                id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, inspector, created_by, status, 
                qty_total, qty_pass, qty_fail, data, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                ma_ct = excluded.ma_ct,
                ten_ct = excluded.ten_ct,
                ten_hang_muc = excluded.ten_hang_muc,
                ma_nha_may = excluded.ma_nha_may,
                workshop = excluded.workshop,
                stage = excluded.stage,
                inspector = excluded.inspector,
                created_by = excluded.created_by,
                status = excluded.status,
                qty_total = excluded.qty_total,
                qty_pass = excluded.qty_pass,
                qty_fail = excluded.qty_fail,
                data = excluded.data,
                updated_at = excluded.updated_at`,
            args: cleanArgs([
                inspection.id,
                inspection.ma_ct,
                inspection.ten_ct,
                inspection.ten_hang_muc,
                inspection.ma_nha_may,
                inspection.workshop,
                inspection.inspectionStage,
                inspection.inspectorName,
                inspection.inspectorName, // created_by
                inspection.status,
                inspection.inspectedQuantity,
                inspection.passedQuantity,
                inspection.failedQuantity,
                JSON.stringify(jsonPayload),
                now,
                now
            ])
        });
    } catch (e: any) {
        console.error("SQL Error in savePQCForm:", e);
        throw new Error(`DB Error: ${e.message}`);
    }
};

/**
 * Saves SQC-VT Form specifically to forms_sqc_vt table
 */
export const saveSQCVTForm = async (inspection: Inspection) => {
    try {
        const now = Math.floor(Date.now() / 1000);

        // Save mapped NCRs first from materials
        if (inspection.materials) {
            for (const mat of inspection.materials) {
                if (mat.items) {
                    for (const item of mat.items) {
                        if (item.ncr) {
                            await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName);
                        }
                    }
                }
            }
        }

        const jsonPayload = {
            materials: inspection.materials?.map((m: any) => ({
                ...m,
                items: (m.items || []).map((i: any) => { const { ncr, ...itemData } = i; return itemData; })
            })) || [],
            images: inspection.images || [],
            deliveryNoteImages: inspection.deliveryNoteImages || [],
            reportImages: inspection.reportImages || [],
            deliveryNoteImage: inspection.deliveryNoteImage,
            reportImage: inspection.reportImage,
            summary: inspection.summary,
            signature: inspection.signature,
            supplierAddress: inspection.supplierAddress,
            location: inspection.location,
            ...inspection
        };

        await turso.execute({
            sql: `INSERT INTO forms_sqc_vt (
                id, po_number, supplier, supplier_address, location, inspection_date, 
                inspector_name, status, data, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                po_number = excluded.po_number,
                supplier = excluded.supplier,
                supplier_address = excluded.supplier_address,
                location = excluded.location,
                inspection_date = excluded.inspection_date,
                inspector_name = excluded.inspector_name,
                status = excluded.status,
                data = excluded.data,
                updated_at = excluded.updated_at`,
            args: cleanArgs([
                inspection.id,
                inspection.po_number,
                inspection.supplier,
                inspection.supplierAddress,
                inspection.location,
                inspection.date,
                inspection.inspectorName,
                inspection.status,
                JSON.stringify(jsonPayload),
                now,
                now
            ])
        });
    } catch (e: any) {
        console.error("SQL Error in saveSQCVTForm:", e);
        throw new Error(`DB Error: ${e.message}`);
    }
};

/**
 * Saves SQC-BTP Form specifically to forms_sqc_btp table
 */
export const saveSQCBTPForm = async (inspection: Inspection) => {
    try {
        const now = Math.floor(Date.now() / 1000);

        // Save mapped NCRs first from materials
        if (inspection.materials) {
            for (const mat of inspection.materials) {
                if (mat.items) {
                    for (const item of mat.items) {
                        if (item.ncr) {
                            await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName);
                        }
                    }
                }
            }
        }

        const jsonPayload = {
            materials: inspection.materials?.map((m: any) => ({
                ...m,
                items: (m.items || []).map((i: any) => { const { ncr, ...itemData } = i; return itemData; })
            })) || [],
            images: inspection.images || [],
            deliveryNoteImages: inspection.deliveryNoteImages || [],
            reportImages: inspection.reportImages || [],
            deliveryNoteImage: inspection.deliveryNoteImage,
            reportImage: inspection.reportImage,
            summary: inspection.summary,
            signature: inspection.signature,
            supplierAddress: inspection.supplierAddress,
            location: inspection.location,
            ...inspection
        };

        await turso.execute({
            sql: `INSERT INTO forms_sqc_btp (
                id, po_number, supplier, supplier_address, location, inspection_date, 
                inspector_name, status, data, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                po_number = excluded.po_number,
                supplier = excluded.supplier,
                supplier_address = excluded.supplier_address,
                location = excluded.location,
                inspection_date = excluded.inspection_date,
                inspector_name = excluded.inspector_name,
                status = excluded.status,
                data = excluded.data,
                updated_at = excluded.updated_at`,
            args: cleanArgs([
                inspection.id,
                inspection.po_number,
                inspection.supplier,
                inspection.supplierAddress,
                inspection.location,
                inspection.date,
                inspection.inspectorName,
                inspection.status,
                JSON.stringify(jsonPayload),
                now,
                now
            ])
        });
    } catch (e: any) {
        console.error("SQL Error in saveSQCBTPForm:", e);
        throw new Error(`DB Error: ${e.message}`);
    }
};

/**
 * Saves SITE Form specifically to forms_site table
 */
export const saveSiteForm = async (inspection: Inspection) => {
    try {
        const now = Math.floor(Date.now() / 1000);

        // Save mapped NCRs first
        for (const item of inspection.items) {
            if (item.ncr) {
                await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName);
            }
        }

        const jsonPayload = {
            ...inspection,
            items: inspection.items.map((i: any) => { const { ncr, ...itemData } = i; return itemData; })
        };

        await turso.execute({
            sql: `INSERT INTO forms_site (
                id, ma_ct, ten_ct, location, inspector, status, 
                data, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                ma_ct = excluded.ma_ct,
                ten_ct = excluded.ten_ct,
                location = excluded.location,
                inspector = excluded.inspector,
                status = excluded.status,
                data = excluded.data,
                updated_at = excluded.updated_at`,
            args: cleanArgs([
                inspection.id,
                inspection.ma_ct,
                inspection.ten_ct,
                inspection.location,
                inspection.inspectorName,
                inspection.status,
                JSON.stringify(jsonPayload),
                now,
                now
            ])
        });
    } catch (e: any) {
        console.error("SQL Error in saveSiteForm:", e);
        throw new Error(`DB Error: ${e.message}`);
    }
};

export const saveInspection = async (inspection: Inspection) => {
    if (inspection.type === 'IQC') {
        return saveIQCForm(inspection);
    }
    if (inspection.type === 'PQC') {
        return savePQCForm(inspection);
    }
    if (inspection.type === 'SQC_MAT') {
        return saveSQCVTForm(inspection);
    }
    if (inspection.type === 'SQC_BTP') {
        return saveSQCBTPForm(inspection);
    }
    if (inspection.type === 'SITE') {
        return saveSiteForm(inspection);
    }

    const now = Math.floor(Date.now() / 1000);
    for (const item of inspection.items) { if (item.ncr) { await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName); } }
    
    const slimInspection = JSON.parse(JSON.stringify(inspection));
    slimInspection.items = slimInspection.items.map((item: any) => { if (item.ncr) { return { ...item, ncrId: item.ncr.id, ncr: { id: item.ncr.id, status: item.ncr.status } }; } return item; });
    
    await turso.execute({
        sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, workshop, status, type, score) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
              ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, status = excluded.status, score = excluded.score`,
        args: cleanArgs([inspection.id, JSON.stringify(slimInspection), now, now, inspection.inspectorName, inspection.ma_ct, inspection.ten_ct, inspection.ma_nha_may, inspection.ten_hang_muc, inspection.workshop, inspection.status, inspection.type, inspection.score])
    });
};

export const deleteInspection = async (id: string) => {
    await turso.execute({ sql: `DELETE FROM inspections WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_iqc WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_pqc WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_sqc_vt WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_sqc_btp WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_site WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM ncrs WHERE inspection_id = ?`, args: cleanArgs([id]) });
};

// ... Rest of the file (getNcrs, getNcrById, etc.) remains same ...
export const getNcrs = async (options: { inspection_id?: string, status?: string, page?: number, limit?: number }) => {
    const { inspection_id, status, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM ncrs WHERE deleted_at IS NULL`;
    const args: any[] = [];
    if (inspection_id) { sql += ` AND inspection_id = ?`; args.push(inspection_id); }
    if (status && status !== 'ALL') { sql += ` AND status = ?`; args.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const res = await turso.execute({ sql, args: cleanArgs([...args, limit, offset]) });
    return res.rows.map(r => ({
        id: r.id,
        inspection_id: r.inspection_id,
        itemId: r.item_id,
        defect_code: r.defect_code,
        severity: r.severity,
        status: r.status,
        issueDescription: r.description,
        rootCause: r.root_cause,
        solution: r.corrective_action,
        responsiblePerson: r.responsible_person,
        deadline: r.deadline,
        imagesBefore: JSON.parse(r.images_before_json as string || '[]'),
        imagesAfter: JSON.parse(r.images_after_json as string || '[]'),
        comments: JSON.parse(r.comments_json as string || '[]'),
        createdDate: new Date(Number(r.created_at) * 1000).toISOString(),
        createdBy: r.created_by 
    } as NCR));
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    const res = await turso.execute({ sql: `SELECT * FROM ncrs WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
        id: r.id,
        inspection_id: r.inspection_id,
        itemId: r.item_id,
        defect_code: r.defect_code,
        severity: r.severity,
        status: r.status,
        issueDescription: r.description,
        rootCause: r.root_cause,
        solution: r.corrective_action,
        responsiblePerson: r.responsible_person,
        deadline: r.deadline,
        imagesBefore: JSON.parse(r.images_before_json as string || '[]'),
        imagesAfter: JSON.parse(r.images_after_json as string || '[]'),
        comments: JSON.parse(r.comments_json as string || '[]'),
        createdDate: new Date(Number(r.created_at) * 1000).toISOString(),
        createdBy: r.created_by 
    } as NCR;
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, responsible_person, deadline, images_before_json, images_after_json, comments_json, created_by, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
              ON CONFLICT(id) DO UPDATE SET severity = excluded.severity, status = excluded.status, description = excluded.description, root_cause = excluded.root_cause, corrective_action = excluded.corrective_action, responsible_person = excluded.responsible_person, deadline = excluded.deadline, images_before_json = excluded.images_before_json, images_after_json = excluded.images_after_json, comments_json = excluded.comments_json, updated_at = excluded.updated_at`,
        args: cleanArgs([ncr.id, inspection_id, ncr.itemId || '', ncr.defect_code || '', ncr.severity || 'MINOR', ncr.status || 'OPEN', ncr.issueDescription, ncr.rootCause || '', ncr.solution || '', ncr.responsiblePerson || '', ncr.deadline || '', JSON.stringify(ncr.imagesBefore || []), JSON.stringify(ncr.imagesAfter || []), JSON.stringify(ncr.comments || []), createdBy, now, now])
    });
    return ncr.id;
};

export const getDefects = async (params: { status?: string }) => {
    const ncrs = await getNcrs({ status: params.status });
    return ncrs.map(n => ({
        id: n.id,
        inspectionId: n.inspection_id || '',
        itemId: n.itemId || '',
        defectCode: n.defect_code || 'N/A',
        category: 'Quality',
        description: n.issueDescription,
        status: n.status,
        severity: n.severity || 'MINOR',
        inspectorName: n.responsiblePerson || 'QA/QC',
        date: n.createdDate.split('T')[0],
        ma_ct: 'Dự án', 
        ten_ct: 'Dự án',
        images: n.imagesBefore || []
    } as unknown as Defect));
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    const res = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => ({
        id: r.id,
        code: r.defect_code,
        name: r.name,
        stage: r.stage,
        category: r.category,
        description: r.description,
        severity: r.severity,
        suggestedAction: r.suggested_action,
        correctImage: r.correct_image,
        incorrectImage: r.incorrect_image,
        createdBy: r.created_by,
        createdAt: r.created_at
    } as unknown as DefectLibraryItem));
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, correct_image, incorrect_image, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(defect_code) DO UPDATE SET name = excluded.name, stage = excluded.stage, category = excluded.category, description = excluded.description, severity = excluded.severity, suggested_action = excluded.suggested_action, correct_image = excluded.correct_image, incorrect_image = excluded.incorrect_image`,
        args: cleanArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.correctImage, item.incorrectImage, item.createdBy, item.createdAt])
    });
};

export const deleteDefectLibraryItem = async (id: string) => { await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: cleanArgs([id]) }); };

export const getUsers = async (): Promise<User[]> => {
    const res = await turso.execute("SELECT data FROM users");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveUser = async (user: User) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO users (id, data, username, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, role = excluded.role, updated_at = excluded.updated_at`,
        args: cleanArgs([user.id, JSON.stringify(user), user.username, user.role, now, now])
    });
};

export const importUsers = async (users: User[]) => { for (const user of users) { await saveUser(user); } };

export const deleteUser = async (id: string) => { await turso.execute({ sql: `DELETE FROM users WHERE id = ?`, args: cleanArgs([id]) }); };

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT data FROM workshops");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveWorkshop = async (ws: Workshop) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO workshops (id, data, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, code = excluded.code, name = excluded.name, updated_at = excluded.updated_at`,
        args: cleanArgs([ws.id, JSON.stringify(ws), ws.code, ws.name, now, now])
    });
};

export const deleteWorkshop = async (id: string) => { await turso.execute({ sql: `DELETE FROM workshops WHERE id = ?`, args: cleanArgs([id]) }); };

export const getTemplates = async (): Promise<Record<string, CheckItem[]>> => {
    const res = await turso.execute("SELECT moduleId, data FROM templates");
    const result: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => { result[r.moduleId as string] = JSON.parse(r.data as string); });
    return result;
};

export const saveTemplate = async (moduleId: string, data: CheckItem[]) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        args: cleanArgs([moduleId, JSON.stringify(data), now])
    });
};

export const getRoles = async (): Promise<Role[]> => {
    const res = await turso.execute("SELECT data FROM roles");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveRole = async (role: Role) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO roles (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        args: cleanArgs([role.id, JSON.stringify(role), now, now])
    });
};

export const deleteRole = async (id: string) => { await turso.execute({ sql: `DELETE FROM roles WHERE id = ?`, args: cleanArgs([id]) }); };
