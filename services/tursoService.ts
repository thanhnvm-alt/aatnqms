
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus, ModuleId } from "../types";

/**
 * Helper to safely parse JSON strings from the database
 */
const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object') return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    return defaultValue;
  }
};

/**
 * Helper to sanitize database arguments
 */
const sanitizeArgs = (args: any[]): any[] => {
    return args.map(arg => {
        if (arg === undefined) return null;
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        if (typeof arg === 'number' && isNaN(arg)) return null;
        return arg;
    });
};

const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_vt', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site'];

/**
 * Get the table name based on inspection type
 */
const getTableName = (type: string = 'PQC'): string => {
    const t = type.toLowerCase();
    if (t === 'sqc_mat' || t === 'sqc_vt') return 'forms_sqc_vt';
    return MODULE_TABLES.includes(t) ? `forms_${t}` : `forms_pqc`;
};

/**
 * ISO-NOTIFICATION-ENGINE: Create a notification for a user
 */
export async function addNotification(userId: string, type: Notification['type'], title: string, message: string, link?: any) {
    const id = `NTF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const data = JSON.stringify({ title, message, type, link });
    try {
        await turso.execute({
            sql: "INSERT INTO notifications (id, user_id, is_read, created_at, data) VALUES (?, ?, 0, unixepoch(), ?)",
            args: [id, userId, data]
        });
    } catch (e) {
        console.error("Failed to create notification", e);
    }
}

/**
 * ISO-IMAGE-DECOUPLING: Process base64 images and store them in qms_images table
 */
async function processAndStoreImages(
  entityId: string, 
  entityType: QMSImage['entity_type'], 
  images: string[] | string | undefined, 
  role: QMSImage['image_role'], 
  relatedItemId?: string,
  forceArray: boolean = false
) {
    if (!images) return forceArray ? [] : (role.includes('SIGNATURE') ? null : []);
    const isSingleImage = typeof images === 'string';
    const imageList = isSingleImage ? [images] : (images as string[]);
    if (imageList.length === 0) return forceArray ? [] : (isSingleImage ? null : []);
    const imageRefs: string[] = [];
    for (let i = 0; i < imageList.length; i++) {
        const data = imageList[i];
        if (!data || !data.startsWith('data:')) {
            if (data) imageRefs.push(data); 
            continue;
        }
        const imageId = `IMG-${entityType}-${entityId}-${role}-${relatedItemId || 'main'}-${i}-${Date.now()}`;
        await turso.execute({
            sql: `INSERT INTO qms_images (id, parent_entity_id, related_item_id, entity_type, image_role, url_hd, created_at) 
                  VALUES (?, ?, ?, ?, ?, ?, unixepoch())`,
            args: [imageId, entityId, relatedItemId || null, entityType, role, data]
        });
        imageRefs.push(imageId);
    }
    return (isSingleImage && !forceArray) ? imageRefs[0] : imageRefs;
}

/**
 * ISO-IMAGE-RETRIEVAL: Get all images associated with an entity
 */
async function getEntityImages(entityId: string) {
    const res = await turso.execute({
        sql: "SELECT id, url_hd, image_role, related_item_id FROM qms_images WHERE parent_entity_id = ?",
        args: [entityId]
    });
    const imagesMap: Record<string, string[]> = {};
    const itemImagesMap: Record<string, string[]> = {};
    const signatureMap: Record<string, string> = {};
    res.rows.forEach(r => {
        const url = String(r.url_hd);
        const role = String(r.image_role);
        const itemId = r.related_item_id ? String(r.related_item_id) : null;
        if (role.includes('SIGNATURE')) { signatureMap[role] = url; } 
        else if (itemId) { if (!itemImagesMap[itemId]) itemImagesMap[itemId] = []; itemImagesMap[itemId].push(url); } 
        else { if (!imagesMap[role]) imagesMap[role] = []; imagesMap[role].push(url); }
    });
    return { imagesMap, itemImagesMap, signatureMap };
}

/**
 * Initialize database tables if they don't exist
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    const baseColumns = `
        id TEXT PRIMARY KEY, type TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, 
        po_number TEXT, supplier TEXT, inspector TEXT, status TEXT, date TEXT, 
        score REAL, summary TEXT, items_json TEXT, materials_json TEXT, 
        signature_qc TEXT, pm_signature TEXT, pm_name TEXT, pm_comment TEXT, 
        production_signature TEXT, production_name TEXT, production_comment TEXT,
        images_json TEXT, delivery_images_json TEXT, report_images_json TEXT,
        comments_json TEXT DEFAULT '[]', so_luong_ipo REAL, inspected_qty REAL, 
        passed_qty REAL, failed_qty REAL, dvt TEXT, updated_at TEXT, created_at TEXT
    `;

    await turso.batch([
      "CREATE TABLE IF NOT EXISTS qms_images (id TEXT PRIMARY KEY, parent_entity_id TEXT NOT NULL, related_item_id TEXT, entity_type TEXT NOT NULL, image_role TEXT NOT NULL, url_hd TEXT, url_thumbnail TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_id TEXT NOT NULL, defect_code TEXT, severity TEXT DEFAULT 'MINOR', status TEXT DEFAULT 'OPEN', description TEXT NOT NULL, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, created_by TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), comments_json TEXT DEFAULT ( '[]' ))",
      `CREATE TABLE IF NOT EXISTS forms_pqc (id TEXT PRIMARY KEY, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, ma_nha_may TEXT, workshop TEXT, stage TEXT, dvt TEXT, sl_ipo REAL DEFAULT 0, qty_total REAL DEFAULT 0, qty_pass REAL DEFAULT 0, qty_fail REAL DEFAULT 0, created_by TEXT, created_at TEXT, inspector TEXT, status TEXT, data TEXT, updated_at TEXT, items_json TEXT, images_json TEXT, headcode TEXT, date TEXT, qty_ipo REAL, score REAL, summary TEXT, signature_qc TEXT, signature_prod TEXT, signature_mgr TEXT, name_prod TEXT, name_mgr TEXT, item_images_json TEXT, comments_json TEXT DEFAULT '[]', type TEXT DEFAULT 'PQC', production_comment TEXT)`,
      `CREATE TABLE IF NOT EXISTS forms_iqc (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_sqc_vt (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_sqc_btp (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_fsr (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_step (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_fqc (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_spr (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_site (${baseColumns})`,
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT, name TEXT, role TEXT, avatar TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS projects (ma_ct TEXT PRIMARY KEY, name TEXT, status TEXT, pm TEXT, pc TEXT, qa TEXT, progress REAL DEFAULT 0, start_date TEXT, end_date TEXT, location TEXT, description TEXT, thumbnail TEXT, data TEXT, updated_at INTEGER, created_at INTEGER DEFAULT (unixepoch()))",
      "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER, data TEXT)",
      "CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)",
      "CREATE TABLE IF NOT EXISTS templates (module_id TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo REAL, ma_nha_may TEXT, created_at INTEGER, assignee TEXT, status TEXT, pthsp TEXT)",
      "CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, code TEXT, name TEXT, data TEXT, updated_at INTEGER)"
    ]);

    // ISO MIGRATION: Đảm bảo bảng templates có cột module_id thay vì id hoặc moduleId
    try {
        const info = await turso.execute("PRAGMA table_info(templates)");
        const cols = info.rows.map(r => String(r.name));
        
        if (cols.includes('id') && !cols.includes('module_id')) {
            console.log("🛠️ ISO-MIGRATION: Renaming templates.id to templates.module_id...");
            await turso.execute("ALTER TABLE templates RENAME COLUMN id TO module_id");
        } else if (cols.includes('moduleId') && !cols.includes('module_id')) {
            console.log("🛠️ ISO-MIGRATION: Renaming templates.moduleId to templates.module_id...");
            await turso.execute("ALTER TABLE templates RENAME COLUMN moduleId TO module_id");
        }
    } catch(e) {
        console.error("Migration check failed", e);
    }

    // ISO MIGRATION: Đảm bảo bảng ncrs có cột closed_by và closed_date
    try { await turso.execute("ALTER TABLE ncrs ADD COLUMN closed_by TEXT"); } catch(e) {}
    try { await turso.execute("ALTER TABLE ncrs ADD COLUMN closed_date TEXT"); } catch(e) {}

  } catch (error) {
    console.error("Database initialization failed", error);
  }
};

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await turso.execute("SELECT 1");
    return true;
  } catch (e) {
    return false;
  }
}

// --- PLANS ---

/**
 * Get paginated plans with search
 */
export async function getPlansPaginated(searchTerm: string = '', page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  let sql = "SELECT * FROM plans";
  let countSql = "SELECT COUNT(*) as total FROM plans";
  const args: any[] = [];
  
  if (searchTerm) {
    const likeTerm = `%${searchTerm}%`;
    sql += " WHERE ma_ct LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ? OR ma_nha_may LIKE ?";
    countSql += " WHERE ma_ct LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ? OR ma_nha_may LIKE ?";
    args.push(likeTerm, likeTerm, likeTerm, likeTerm);
  }
  
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const res = await turso.execute({ sql, args: [...args, limit, offset] });
  const countRes = await turso.execute({ sql: countSql, args });
  
  return {
    items: res.rows as unknown as PlanItem[],
    total: Number(countRes.rows[0]?.total || 0)
  };
}

// --- INSPECTIONS ---

/**
 * Save an inspection record
 */
export async function saveInspection(inspection: Inspection) {
  const table = getTableName(inspection.type);
  const data = JSON.stringify(inspection);
  
  // Specific columns for PQC vs others based on the initDatabase schema
  if (inspection.type === 'PQC') {
    await turso.execute({
      sql: `INSERT INTO forms_pqc (id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, dvt, sl_ipo, qty_total, qty_pass, qty_fail, inspector, status, data, updated_at, items_json, headcode, date, score, summary, type, production_comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at, score = excluded.score`,
      args: sanitizeArgs([
        inspection.id, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, 
        inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.inspectorName, inspection.status, data, new Date().toISOString(),
        JSON.stringify(inspection.items), inspection.headcode, inspection.date, inspection.score, 
        inspection.summary, inspection.type, inspection.productionComment
      ])
    });
  } else {
    await turso.execute({
      sql: `INSERT INTO ${table} (id, type, ma_ct, ten_ct, ten_hang_muc, po_number, supplier, inspector, status, date, score, summary, items_json, materials_json, so_luong_ipo, inspected_qty, passed_qty, failed_qty, dvt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status = excluded.status, score = excluded.score, updated_at = excluded.updated_at`,
      args: sanitizeArgs([
        inspection.id, inspection.type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
        inspection.po_number, inspection.supplier, inspection.inspectorName, inspection.status, inspection.date,
        inspection.score, inspection.summary, JSON.stringify(inspection.items), JSON.stringify(inspection.materials),
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.dvt, new Date().toISOString()
      ])
    });
  }
}

/**
 * Get a list of inspections
 */
export async function getInspectionsList(filters: any = {}) {
  let allRows: any[] = [];
  for (const t of MODULE_TABLES) {
    const table = `forms_${t}`;
    try {
        const res = await turso.execute(`SELECT id, ma_ct, ten_ct, ten_hang_muc, status, date, inspector as inspectorName, type, score FROM ${table}`);
        allRows = [...allRows, ...res.rows];
    } catch(e) {}
  }
  return { items: allRows.sort((a,b) => b.date.localeCompare(a.date)) };
}

/**
 * Get a single inspection by ID
 */
export async function getInspectionById(id: string): Promise<Inspection | null> {
  for (const t of MODULE_TABLES) {
    const table = `forms_${t}`;
    try {
        const res = await turso.execute({ sql: `SELECT data FROM ${table} WHERE id = ?`, args: [id] });
        if (res.rows.length > 0) {
          return safeJsonParse<Inspection>(res.rows[0].data, null as any);
        }
    } catch(e) {}
  }
  return null;
}

/**
 * Delete an inspection record
 */
export async function deleteInspection(id: string) {
  for (const t of MODULE_TABLES) {
    const table = `forms_${t}`;
    try {
        await turso.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
    } catch(e) {}
  }
}

// --- NCRs ---

/**
 * Save an NCR record
 */
export async function saveNcrMapped(inspection_id: string, ncr: NCR, createdBy: string) {
  const ncrId = ncr.id || `NCR-${Date.now()}`;
  await turso.execute({
    sql: `INSERT INTO ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, created_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, severity = excluded.severity`,
    args: sanitizeArgs([
      ncrId, inspection_id, ncr.itemId, ncr.defect_code, ncr.severity, ncr.status, 
      ncr.issueDescription, ncr.rootCause, ncr.solution, ncr.preventiveAction, 
      ncr.responsiblePerson, ncr.deadline, JSON.stringify(ncr.imagesBefore), 
      JSON.stringify(ncr.imagesAfter), createdBy, new Date().toISOString()
    ])
  });
  return ncrId;
}

/**
 * Get NCR list
 */
export async function getNcrs(filters: any = {}) {
  let sql = "SELECT * FROM ncrs";
  const args: any[] = [];
  if (filters.status && filters.status !== 'ALL') {
    sql += " WHERE status = ?";
    args.push(filters.status);
  }
  sql += " ORDER BY created_at DESC";
  const res = await turso.execute({ sql, args });
  return { items: res.rows as unknown as NCR[], total: res.rows.length };
}

/**
 * Get NCR by ID
 */
export async function getNcrById(id: string): Promise<NCR | null> {
  const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    ...row,
    issueDescription: row.description,
    solution: row.corrective_action,
    imagesBefore: safeJsonParse(row.images_before_json, []),
    imagesAfter: safeJsonParse(row.images_after_json, []),
    comments: safeJsonParse(row.comments_json, [])
  } as unknown as NCR;
}

// --- USERS ---

/**
 * Get all users
 */
export async function getUsers(): Promise<User[]> {
  const res = await turso.execute("SELECT * FROM users");
  return res.rows.map(r => ({
    ...r,
    ...safeJsonParse(r.data, {})
  })) as unknown as User[];
}

/**
 * Save a user record
 */
export async function saveUser(user: User) {
  const data = JSON.stringify({
    msnv: user.msnv,
    position: user.position,
    workLocation: user.workLocation,
    status: user.status,
    joinDate: user.joinDate,
    education: user.education,
    notes: user.notes,
    allowedModules: user.allowedModules
  });
  await turso.execute({
    sql: `INSERT INTO users (id, username, password, name, role, avatar, data, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, avatar = excluded.avatar, data = excluded.data, updated_at = excluded.updated_at`,
    args: [user.id, user.username, user.password, user.name, user.role, user.avatar, data]
  });
}

/**
 * Delete a user
 */
export async function deleteUser(id: string) {
  await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
}

/**
 * Get a user by username
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  const res = await turso.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return { ...row, ...safeJsonParse(row.data, {}) } as unknown as User;
}

/**
 * Import multiple users
 */
export async function importUsers(users: User[]) {
  for (const u of users) {
    await saveUser(u);
  }
}

// --- WORKSHOPS ---

/**
 * Get all workshops
 */
export async function getWorkshops(): Promise<Workshop[]> {
  const res = await turso.execute("SELECT * FROM workshops");
  return res.rows.map(r => ({
    ...r,
    ...safeJsonParse(r.data, {})
  })) as unknown as Workshop[];
}

/**
 * Save a workshop record
 */
export async function saveWorkshop(ws: Workshop) {
  const data = JSON.stringify({
    location: ws.location,
    manager: ws.manager,
    phone: ws.phone,
    image: ws.image,
    stages: ws.stages
  });
  await turso.execute({
    sql: "INSERT INTO workshops (id, code, name, data, updated_at) VALUES (?, ?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, data = excluded.data, updated_at = excluded.updated_at",
    args: [ws.id, ws.code, ws.name, data]
  });
}

/**
 * Delete a workshop
 */
export async function deleteWorkshop(id: string) {
  await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] });
}

// --- TEMPLATES ---

/**
 * Get all templates
 */
export async function getTemplates(): Promise<Record<string, CheckItem[]>> {
  try {
      const res = await turso.execute("SELECT module_id, data FROM templates");
      const result: Record<string, CheckItem[]> = {};
      res.rows.forEach(r => {
        result[String(r.module_id)] = safeJsonParse(r.data, []);
      });
      return result;
  } catch (err: any) {
      // Transition phase fallback
      if (err.message?.includes('no such column: module_id')) {
          try {
              const res = await turso.execute("SELECT moduleId as module_id, data FROM templates");
              const result: Record<string, CheckItem[]> = {};
              res.rows.forEach(r => {
                result[String(r.module_id)] = safeJsonParse(r.data, []);
              });
              return result;
          } catch(e) { 
              try {
                  const res = await turso.execute("SELECT id as module_id, data FROM templates");
                  const result: Record<string, CheckItem[]> = {};
                  res.rows.forEach(r => {
                    result[String(r.module_id)] = safeJsonParse(r.data, []);
                  });
                  return result;
              } catch(e2) { return {}; }
          }
      }
      return {};
  }
}

/**
 * Save a template for a module
 */
export async function saveTemplate(moduleId: string, items: CheckItem[]) {
  await turso.execute({
    sql: "INSERT INTO templates (module_id, data, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(module_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    args: [moduleId, JSON.stringify(items)]
  });
}

// --- PROJECTS ---

/**
 * Get paginated projects
 */
export async function getProjectsPaginated(search: string = '', limit: number = 10) {
  let sql = "SELECT * FROM projects";
  const args: any[] = [];
  if (search) {
    sql += " WHERE ma_ct LIKE ? OR name LIKE ?";
    args.push(`%${search}%`, `%${search}%`);
  }
  sql += " LIMIT ?";
  args.push(limit);
  const res = await turso.execute({ sql, args });
  return res.rows.map(r => ({
    ...r,
    ...safeJsonParse(r.data, {})
  })) as unknown as Project[];
}

/**
 * Get project by code
 */
export async function getProjectByCode(code: string): Promise<Project | null> {
  const res = await turso.execute({ sql: "SELECT * FROM projects WHERE ma_ct = ?", args: [code] });
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return { ...row, ...safeJsonParse(row.data, {}) } as unknown as Project;
}

/**
 * Update project record
 */
export async function updateProject(proj: Project) {
  const data = JSON.stringify({
    description: proj.description,
    location: proj.location,
    thumbnail: proj.thumbnail,
    images: proj.images,
    smartGoals: proj.smartGoals
  });
  await turso.execute({
    sql: `INSERT INTO projects (ma_ct, name, status, pm, pc, qa, progress, start_date, end_date, data, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(ma_ct) DO UPDATE SET name = excluded.name, status = excluded.status, progress = excluded.progress, data = excluded.data, updated_at = excluded.updated_at`,
    args: [proj.ma_ct, proj.name, proj.status, proj.pm, proj.pc, proj.qa, proj.progress, proj.startDate, proj.endDate, data]
  });
}

/**
 * Sync projects based on production plans
 */
export async function syncProjectsWithPlans() {
  const plans = await turso.execute("SELECT DISTINCT ma_ct, ten_ct FROM plans");
  for (const p of plans.rows) {
    const existing = await getProjectByCode(p.ma_ct as string);
    if (!existing) {
      await updateProject({
        id: `proj_${Date.now()}`,
        ma_ct: p.ma_ct as string,
        name: p.ten_ct as string,
        status: 'Planning',
        progress: 0,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        description: `Dự án được tạo tự động từ kế hoạch sản xuất: ${p.ten_ct}`,
        ten_ct: p.ten_ct as string,
        code: p.ma_ct as string
      } as Project);
    }
  }
}

// --- NOTIFICATIONS ---

/**
 * Get notifications for a user
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const res = await turso.execute({ sql: "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", args: [userId] });
  return res.rows.map(r => {
    const data = safeJsonParse(r.data, {});
    return {
      id: r.id,
      userId: r.user_id,
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
      ...data
    };
  }) as unknown as Notification[];
}

/**
 * Mark a single notification as read
 */
export async function markNotificationRead(id: string) {
  await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [id] });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userId: string) {
  await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: [userId] });
}

// --- ROLES ---

/**
 * Get all roles
 */
export async function getRoles(): Promise<Role[]> {
  const res = await turso.execute("SELECT * FROM roles");
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    ...safeJsonParse(r.data, {})
  })) as unknown as Role[];
}

/**
 * Save or update a role
 */
export async function saveRole(role: Role) {
  const data = JSON.stringify({
    description: role.description,
    permissions: role.permissions,
    allowedModules: role.allowedModules,
    isSystem: role.isSystem
  });
  await turso.execute({
    sql: "INSERT INTO roles (id, name, data, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at",
    args: [role.id, role.name, data]
  });
}

/**
 * Delete a role
 */
export async function deleteRole(id: string) {
  await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] });
}

// --- DEFECT LIBRARY ---

/**
 * Get all items from the defect library
 */
export async function getDefectLibrary(): Promise<DefectLibraryItem[]> {
  const res = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
  return res.rows.map(r => ({
    ...r,
    ...safeJsonParse(r.data, {})
  })) as unknown as DefectLibraryItem[];
}

/**
 * Save an item to the defect library
 */
export async function saveDefectLibraryItem(item: DefectLibraryItem) {
  const data = JSON.stringify(item);
  await turso.execute({
    sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, created_by, created_at, updated_at, data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, severity = excluded.severity, suggested_action = excluded.suggested_action, data = excluded.data, updated_at = excluded.updated_at`,
    args: [
      item.id, item.code, item.name, item.stage, item.category, 
      item.description, item.severity, item.suggestedAction, 
      item.createdBy, item.createdAt, Math.floor(Date.now()/1000), data
    ]
  });
}

/**
 * Delete an item from the defect library
 */
export async function deleteDefectLibraryItem(id: string) {
  await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] });
}
