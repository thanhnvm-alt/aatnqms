
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification } from "../types";
import { withRetry } from "../lib/retry";

const cleanArgs = (args: any[]): any[] => {
  return args.map(arg => (arg === undefined ? null : arg));
};

/**
 * Robust JSON Parser to handle edge cases where data might be malformed or "undefined" string
 */
const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") {
    return defaultValue;
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error("ISO-INTERNAL: Failed to parse JSON data from DB", { error: e, input: jsonString });
    return defaultValue;
  }
};

/**
 * ISO DIGITAL QMS - DATABASE SCHEMA (REFACTORED)
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;

  try {
    await withRetry(() => turso.execute("SELECT 1"), { maxRetries: 5, initialDelay: 500 });
    
    // IMAGE METADATA TABLE (ISO MANDATORY)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS qms_images (
        id TEXT PRIMARY KEY,
        parent_entity_id TEXT NOT NULL,
        related_item_id TEXT,
        entity_type TEXT NOT NULL,
        image_role TEXT NOT NULL,
        url_hd TEXT,
        url_thumbnail TEXT,
        created_at INTEGER
      )
    `);

    // PQC SPECIALIZED TABLE (NORMALIZED COLUMNS)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS forms_pqc (
        id TEXT PRIMARY KEY, 
        ma_ct TEXT, 
        ten_ct TEXT, 
        ma_nha_may TEXT, 
        workshop TEXT, 
        stage TEXT, 
        inspector TEXT, 
        status TEXT, 
        date TEXT,
        qty_ipo REAL,
        qty_total REAL, 
        qty_pass REAL, 
        qty_fail REAL, 
        score INTEGER,
        summary TEXT,
        checklist_json TEXT, -- STRICT: Refs only
        created_at INTEGER, 
        updated_at INTEGER
      )
    `);

    // NCR TABLE (NORMALIZED)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS ncrs (
        id TEXT PRIMARY KEY, 
        inspection_id TEXT NOT NULL, 
        item_id TEXT NOT NULL, 
        status TEXT, 
        severity TEXT,
        description TEXT,
        root_cause TEXT,
        corrective_action TEXT,
        responsible_person TEXT,
        deadline TEXT,
        created_at INTEGER, 
        updated_at INTEGER
      )
    `);

    // Tables initialization - Updated users table with 'data' column instead of 'data_json'
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, data_json TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, ma_ct TEXT, ma_nha_may TEXT, headcode TEXT, data_json TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, ma_ct TEXT UNIQUE, name TEXT, data_json TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (module_id TEXT PRIMARY KEY, data_json TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT, data_json TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT UNIQUE, name TEXT, data_json TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, is_read INTEGER, data_json TEXT, created_at INTEGER)`);

    // AUTO-MIGRATION: Ensure correct columns exist for 'users'
    try { await turso.execute(`ALTER TABLE users ADD COLUMN data TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE users ADD COLUMN name TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE users ADD COLUMN role TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE users ADD COLUMN updated_at INTEGER`); } catch (e) {}

    // AUTO-MIGRATION: Ensure 'workshops' columns
    try { await turso.execute(`ALTER TABLE workshops ADD COLUMN data_json TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE workshops ADD COLUMN code TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE workshops ADD COLUMN name TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE workshops ADD COLUMN updated_at INTEGER`); } catch (e) {}

    console.log("✔ ISO Server-authoritative DB Initialized & Migrated.");
  } catch (e: any) {
    console.error("❌ ISO DB Schema failure:", e);
  }
};

/**
 * IMAGE STORAGE SERVICE (SIMULATED FOR ISO REFACTOR)
 */
const processAndStoreImages = async (
  entityId: string, 
  entityType: 'INSPECTION' | 'NCR' | 'DEFECT' | 'USER', 
  images: string[], 
  role: 'EVIDENCE' | 'BEFORE' | 'AFTER',
  itemId?: string
): Promise<string[]> => {
  const refs: string[] = [];
  
  for (const base64 of images) {
    if (!base64.startsWith('data:image')) {
      if (base64.length < 50) refs.push(base64); // Already a ref
      continue;
    }

    const imgId = `img_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    
    await turso.execute({
      sql: `INSERT INTO qms_images (id, parent_entity_id, related_item_id, entity_type, image_role, url_hd, url_thumbnail, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [imgId, entityId, itemId || null, entityType, role, base64, base64, now]
    });
    
    refs.push(imgId);
  }
  return refs;
};

/**
 * FETCH IMAGE DATA
 */
export const getImagesByEntity = async (entityId: string, role?: string): Promise<QMSImage[]> => {
  let sql = `SELECT * FROM qms_images WHERE parent_entity_id = ?`;
  const args: any[] = [entityId];
  if (role) {
    sql += ` AND image_role = ?`;
    args.push(role);
  }
  const res = await turso.execute({ sql, args });
  return res.rows as unknown as QMSImage[];
};

/**
 * INSPECTION SAVE (ISO COMPLIANT)
 */
export const saveInspection = async (inspection: Inspection) => {
  const now = Math.floor(Date.now() / 1000);
  const inspectionId = inspection.id;

  const mainImageRefs = await processAndStoreImages(inspectionId, 'INSPECTION', inspection.images || [], 'EVIDENCE');

  const sanitizedItems = await Promise.all((inspection.items || []).map(async (item) => {
    const itemImageRefs = await processAndStoreImages(inspectionId, 'INSPECTION', item.images || [], 'EVIDENCE', item.id);
    return { ...item, image_refs: itemImageRefs, images: [] }; // Strip base64
  }));

  const sql = `
    INSERT INTO forms_pqc (
      id, ma_ct, ten_ct, ma_nha_may, workshop, stage, inspector, status, date,
      qty_ipo, qty_total, qty_pass, qty_fail, score, summary, checklist_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      status=excluded.status, qty_total=excluded.qty_total, qty_pass=excluded.qty_pass, 
      qty_fail=excluded.qty_fail, score=excluded.score, summary=excluded.summary, 
      checklist_json=excluded.checklist_json, updated_at=excluded.updated_at
  `;

  await turso.execute({
    sql,
    args: cleanArgs([
      inspectionId, inspection.ma_ct, inspection.ten_ct, inspection.ma_nha_may, 
      inspection.workshop, inspection.inspectionStage, inspection.inspectorName, 
      inspection.status, inspection.date, inspection.so_luong_ipo, 
      inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity, 
      inspection.score, inspection.summary, JSON.stringify(sanitizedItems), now, now
    ])
  });
};

export const deleteInspection = async (id: string) => {
    await turso.execute({ sql: `DELETE FROM forms_pqc WHERE id = ?`, args: [id] });
    await turso.execute({ sql: `DELETE FROM qms_images WHERE parent_entity_id = ?`, args: [id] });
};

export const getInspectionsPaginated = async (filters: any) => {
    const res = await turso.execute("SELECT * FROM forms_pqc ORDER BY updated_at DESC");
    return { items: res.rows as any, total: res.rows.length };
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
  const res = await turso.execute({ sql: `SELECT * FROM forms_pqc WHERE id = ?`, args: [id] });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];

  const items: CheckItem[] = safeJsonParse(r.checklist_json, []);
  const images = await getImagesByEntity(id);

  const hydratedItems = items.map(item => ({
    ...item,
    images: images.filter(img => img.related_item_id === item.id).map(img => img.url_hd)
  }));

  return {
    ...r,
    items: hydratedItems,
    images: images.filter(img => !img.related_item_id).map(img => img.url_hd),
    inspectorName: String(r.inspector),
    inspectionStage: String(r.stage),
    inspectedQuantity: Number(r.qty_total),
    passedQuantity: Number(r.qty_pass),
    failedQuantity: Number(r.qty_fail)
  } as unknown as Inspection;
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    const now = Math.floor(Date.now() / 1000);
    const ncrId = ncr.id;

    await processAndStoreImages(ncrId, 'NCR', ncr.imagesBefore || [], 'BEFORE');
    await processAndStoreImages(ncrId, 'NCR', ncr.imagesAfter || [], 'AFTER');

    await turso.execute({
      sql: `INSERT INTO ncrs (id, inspection_id, item_id, status, severity, description, root_cause, corrective_action, responsible_person, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`,
      args: cleanArgs([ncrId, inspection_id, ncr.itemId, ncr.status, ncr.severity, ncr.issueDescription, ncr.rootCause, ncr.solution, ncr.responsiblePerson, now, now])
    });
    return ncrId;
};

export const getNcrs = async (filters: any) => {
    const res = await turso.execute("SELECT * FROM ncrs ORDER BY updated_at DESC");
    return { items: res.rows as any, total: res.rows.length };
};

export const getNcrById = async (id: string) => {
    const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const images = await getImagesByEntity(id);
    return {
        ...r,
        imagesBefore: images.filter(i => i.image_role === 'BEFORE').map(i => i.url_hd),
        imagesAfter: images.filter(i => i.image_role === 'AFTER').map(i => i.url_hd),
        issueDescription: r.description,
        solution: r.corrective_action
    } as unknown as NCR;
};

export const getDefects = async (filters: any) => {
    // Simulated unified view
    const ncrs = await getNcrs(filters);
    return { items: ncrs.items as any[], total: ncrs.total };
};

export const getUsers = async (): Promise<User[]> => { 
  const res = await turso.execute("SELECT * FROM users"); 
  return res.rows.map(r => ({ ...safeJsonParse(r.data, {} as any), id: r.id, username: r.username, name: r.name, role: r.role })); 
};

export const saveUser = async (user: User) => {
    await turso.execute({
        sql: "INSERT INTO users (id, username, name, role, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, data=excluded.data, updated_at=excluded.updated_at",
        args: [user.id, user.username, user.name, user.role, JSON.stringify(user), Math.floor(Date.now()/1000)]
    });
};

export const deleteUser = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
};

export const importUsers = async (users: User[]) => {
    for (const u of users) await saveUser(u);
};

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT * FROM workshops");
    return res.rows.map(r => safeJsonParse(r.data_json, {} as any));
};

export const saveWorkshop = async (ws: Workshop) => {
    await turso.execute({
        sql: "INSERT INTO workshops (id, code, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, data_json=excluded.data_json, updated_at=excluded.updated_at",
        args: [ws.id, ws.code, ws.name, JSON.stringify(ws), Math.floor(Date.now()/1000)]
    });
};

export const deleteWorkshop = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] });
};

export const getTemplates = async () => {
    const res = await turso.execute("SELECT * FROM templates");
    const dict: any = {};
    res.rows.forEach(r => {
      if (r.module_id) {
        dict[r.module_id as string] = safeJsonParse(r.data_json, []);
      }
    });
    return dict;
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    await turso.execute({
        sql: "INSERT INTO templates (module_id, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(module_id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at",
        args: [moduleId, JSON.stringify(items), Math.floor(Date.now()/1000)]
    });
};

export const getPlansPaginated = async (search: string, page: number, limit: number) => {
    const res = await turso.execute("SELECT * FROM plans ORDER BY created_at DESC");
    return { 
      items: res.rows.map(r => safeJsonParse(r.data_json, {} as any)), 
      total: res.rows.length 
    };
};

export const importPlans = async (plans: PlanItem[]) => {
    for (const p of plans) {
        await turso.execute({
            sql: "INSERT INTO plans (ma_ct, ma_nha_may, headcode, data_json, created_at) VALUES (?, ?, ?, ?, ?)",
            args: [p.ma_ct, p.ma_nha_may, p.headcode, JSON.stringify(p), Math.floor(Date.now()/1000)]
        });
    }
};

export const importInspections = async (insps: Inspection[]) => {
    for (const i of insps) await saveInspection(i);
};

export const getProjects = async (): Promise<Project[]> => {
    const res = await turso.execute("SELECT * FROM projects");
    return res.rows.map(r => safeJsonParse(r.data_json, {} as any));
};

export const getProjectByCode = async (code: string) => {
    const res = await turso.execute({ sql: "SELECT * FROM projects WHERE ma_ct = ?", args: [code] });
    return res.rows.length > 0 ? safeJsonParse(res.rows[0].data_json, null) : null;
};

export const updateProject = async (proj: Project) => {
    await turso.execute({
        sql: "INSERT INTO projects (id, ma_ct, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ma_ct=excluded.ma_ct, name=excluded.name, data_json=excluded.data_json, updated_at=excluded.updated_at",
        args: [proj.id, proj.ma_ct, proj.name, JSON.stringify(proj), Math.floor(Date.now()/1000)]
    });
};

export const getNotifications = async (userId: string) => {
    const res = await turso.execute({ sql: "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", args: [userId] });
    return res.rows.map(r => ({ ...safeJsonParse(r.data_json, {} as any), id: r.id, isRead: r.is_read === 1 }));
};

export const markNotificationRead = async (id: string) => {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [id] });
};

export const markAllNotificationsRead = async (userId: string) => {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: [userId] });
};

export const getRoles = async (): Promise<Role[]> => {
    const res = await turso.execute("SELECT * FROM roles");
    return res.rows.map(r => safeJsonParse(r.data_json, {} as any))
              .filter(r => r && r.id); // Ensure we only return valid objects
};

export const saveRole = async (role: Role) => {
    await turso.execute({
        sql: "INSERT INTO roles (id, name, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data_json=excluded.data_json, updated_at=excluded.updated_at",
        args: [role.id, role.name, JSON.stringify(role), Math.floor(Date.now()/1000)]
    });
};

export const deleteRole = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] });
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    const res = await turso.execute("SELECT * FROM defect_library");
    return res.rows.map(r => safeJsonParse(r.data_json, {} as any));
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await turso.execute({
        sql: "INSERT INTO defect_library (id, defect_code, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET defect_code=excluded.defect_code, name=excluded.name, data_json=excluded.data_json, updated_at=excluded.updated_at",
        args: [item.id, item.code, item.name, JSON.stringify(item), Math.floor(Date.now()/1000)]
    });
};

export const deleteDefectLibraryItem = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] });
};

export const testConnection = async () => { try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; } };
