import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus } from "../types";
import { withRetry } from "../lib/retry";

const cleanArgs = (args: any[]): any[] => {
  return args.map(arg => (arg === undefined ? null : arg));
};

const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object') return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error("ISO-INTERNAL: JSON Parse failed", e);
    return defaultValue;
  }
};

// Danh sách các module chính thức
const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site', 'sqc_vt'];

const getTableName = (type: string = 'PQC'): string => {
    const t = type.toLowerCase();
    // Ánh xạ linh hoạt: SQC_MAT và SQC_VT dùng chung bảng logic forms_sqc_vt
    if (t === 'sqc_mat' || t === 'sqc_vt') return 'forms_sqc_vt';
    return MODULE_TABLES.includes(t) ? `forms_${t}` : `forms_pqc`;
};

/**
 * ISO-MIGRATION: Cơ chế tự động bổ sung cột vào bảng hiện có nếu chưa tồn tại
 */
async function ensureColumnExists(tableName: string, columnName: string, columnDef: string) {
    try {
        const res = await turso.execute(`PRAGMA table_info(${tableName})`);
        const columns = res.rows.map(r => String(r.name).toLowerCase());
        if (!columns.includes(columnName.toLowerCase())) {
            console.log(`[ISO-DB-AUTO-MIGRATION] Adding column '${columnName}' to '${tableName}'`);
            await turso.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        }
    } catch (e: any) {
        // Nếu lỗi do bảng chưa tồn tại thì bỏ qua, initDatabase sẽ tạo bảng mới sau
        if (!e.message.includes("no such table")) {
            console.warn(`[ISO-DB-WARNING] Column sync for ${tableName}.${columnName} failed:`, e.message);
        }
    }
}

export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    await withRetry(() => turso.execute("SELECT 1"), { maxRetries: 5, initialDelay: 1000 });
    
    // 1. Khởi tạo Master Lookup
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections_master (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    // 2. Khởi tạo và đồng bộ hóa các bảng Module (IQC, PQC, SQC_VT...)
    for (const moduleCode of MODULE_TABLES) {
        const tableName = (moduleCode === 'sqc_vt' || moduleCode === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${moduleCode}`;
        
        // Tạo bảng cơ bản nếu chưa có
        await turso.execute(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            id TEXT PRIMARY KEY,
            created_at TEXT,
            updated_at TEXT
          )
        `);

        // Danh sách các cột "chuẩn ISO" cần có cho mọi loại phiếu
        const commonCols = [
            { name: 'type', def: 'TEXT' },
            { name: 'ma_ct', def: 'TEXT' },
            { name: 'ten_ct', def: 'TEXT' },
            { name: 'ten_hang_muc', def: 'TEXT' },
            { name: 'inspector', def: 'TEXT' },
            { name: 'status', def: 'TEXT' },
            { name: 'date', def: 'TEXT' },
            { name: 'score', def: 'INTEGER DEFAULT 0' },
            { name: 'summary', def: 'TEXT' },
            { name: 'items_json', def: 'TEXT' },
            { name: 'signature_qc', def: 'TEXT' }
        ];

        // Danh sách cột đặc thù cho IQC & SQC-VT (Giao nhận vật tư ngoài)
        const materialCols = [
            { name: 'po_number', def: 'TEXT' },
            { name: 'supplier', def: 'TEXT' },
            { name: 'supplier_address', def: 'TEXT' },
            { name: 'location', def: 'TEXT' },
            { name: 'materials_json', def: 'TEXT' }, // Cột gây lỗi trong hình ảnh
            { name: 'reference_docs_json', def: 'TEXT' },
            { name: 'pm_signature', def: 'TEXT' },
            { name: 'pm_name', def: 'TEXT' },
            { name: 'pm_comment', def: 'TEXT' }
        ];

        // Thực hiện Migration cho các cột chung
        for (const col of commonCols) {
            await ensureColumnExists(tableName, col.name, col.def);
        }

        // Thực hiện Migration cho các cột vật tư (Chỉ IQC và SQC-VT)
        if (tableName === 'forms_iqc' || tableName === 'forms_sqc_vt') {
            for (const col of materialCols) {
                await ensureColumnExists(tableName, col.name, col.def);
            }
        }
        
        // Cột đặc thù cho PQC (Sản xuất)
        if (tableName === 'forms_pqc') {
            const pqcCols = [
                { name: 'workshop', def: 'TEXT' },
                { name: 'stage', def: 'TEXT' },
                { name: 'sl_ipo', def: 'REAL' },
                { name: 'qty_total', def: 'REAL' },
                { name: 'qty_pass', def: 'REAL' },
                { name: 'qty_fail', def: 'REAL' },
                { name: 'signature_prod', def: 'TEXT' },
                { name: 'name_prod', def: 'TEXT' },
                { name: 'production_comment', def: 'TEXT' },
                { name: 'signature_mgr', def: 'TEXT' },
                { name: 'name_mgr', def: 'TEXT' }
            ];
            for (const col of pqcCols) {
                await ensureColumnExists(tableName, col.name, col.def);
            }
        }
    }

    // 3. Khởi tạo bảng ảnh (Bằng chứng ISO)
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

    // 4. Khởi tạo bảng NCR (Sự không phù hợp)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS ncrs (
        id TEXT PRIMARY KEY, 
        inspection_id TEXT NOT NULL, 
        defect_code TEXT,
        severity TEXT DEFAULT 'MINOR',
        status TEXT DEFAULT 'OPEN',
        description TEXT NOT NULL,
        root_cause TEXT,
        corrective_action TEXT,
        preventive_action TEXT,
        responsible_person TEXT,
        deadline TEXT,
        images_before_json TEXT,
        images_after_json TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        item_id TEXT NOT NULL DEFAULT 'unknown',
        comments_json TEXT DEFAULT '[]'
      )
    `);

    console.log("✔ ISO-DB: Database structure verified and materials_json column confirmed.");
  } catch (e: any) {
    console.error("❌ ISO-DB: Critical synchronization failure:", e.message);
  }
};

export const getInspectionsList = async (filters: any = {}) => {
    const unionParts = MODULE_TABLES.map(t => {
        const tableName = (t === 'sqc_vt' || t === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${t}`;
        const titleExpr = t === 'iqc' || t === 'sqc_vt' || t === 'sqc_mat'
            ? "COALESCE(ten_hang_muc, 'PO: ' || COALESCE(po_number, 'N/A'))" 
            : "ten_hang_muc";
            
        return `
            SELECT id, type, ma_ct, ten_ct, ${titleExpr} AS ten_hang_muc, inspector, status, date, updated_at 
            FROM ${tableName}
        `;
    });
    
    const sql = `SELECT DISTINCT * FROM (${unionParts.join(' UNION ALL ')}) ORDER BY updated_at DESC`;
    const res = await turso.execute(sql);
    
    return { 
      items: res.rows.map(r => ({
        id: String(r.id),
        type: String(r.type || 'PQC'),
        ma_ct: String(r.ma_ct || ''),
        ten_ct: String(r.ten_ct || ''),
        ten_hang_muc: String(r.ten_hang_muc || ''),
        inspectorName: String(r.inspector || ''),
        status: r.status as any,
        date: String(r.date || ''),
        updatedAt: String(r.updated_at || '')
      })), 
      total: res.rows.length 
    };
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
  try {
    const masterRes = await turso.execute({
      sql: "SELECT type FROM inspections_master WHERE id = ?",
      args: [id]
    });

    if (masterRes.rows.length === 0) return null;
    const type = String(masterRes.rows[0].type);
    const tableName = getTableName(type);

    const res = await turso.execute({
      sql: `SELECT * FROM ${tableName} WHERE id = ?`,
      args: [id]
    });

    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    const imagesRes = await turso.execute({
      sql: "SELECT id, related_item_id, image_role, url_hd FROM qms_images WHERE parent_entity_id = ?",
      args: [id]
    });
    const allImages = imagesRes.rows;

    const mainImages = allImages
        .filter(img => img.image_role === 'EVIDENCE' && !img.related_item_id)
        .map(img => String(img.url_hd));

    const deliveryNoteImages = allImages
        .filter(img => img.image_role === 'PREVIEW' && img.related_item_id === 'DELIVERY_NOTE')
        .map(img => String(img.url_hd));

    const reportImages = allImages
        .filter(img => img.image_role === 'PREVIEW' && img.related_item_id === 'SUPPLIER_REPORT')
        .map(img => String(img.url_hd));

    const items = safeJsonParse(r.items_json, []);
    const itemsWithImages = items.map((item: any) => ({
        ...item,
        images: allImages
            .filter(img => img.related_item_id === item.id)
            .map(img => String(img.url_hd))
    }));

    const base: any = {
      id: String(r.id),
      type: String(r.type || type),
      ma_ct: String(r.ma_ct || ''),
      ten_ct: String(r.ten_ct || ''),
      ten_hang_muc: String(r.ten_hang_muc || ''),
      inspectorName: String(r.inspector || ''),
      status: r.status as any,
      date: String(r.date || ''),
      score: Number((r as any).score || 0),
      summary: String(r.summary || ''),
      items: itemsWithImages,
      images: mainImages,
      deliveryNoteImages,
      reportImages,
      signature: String(r.signature_qc || ''),
      createdAt: String(r.created_at || ''),
      updatedAt: String(r.updated_at || '')
    };

    if (type === 'PQC') {
        base.workshop = String(r.workshop || '');
        base.inspectionStage = String(r.stage || '');
        base.so_luong_ipo = Number(r.sl_ipo || 0);
        base.inspectedQuantity = Number(r.qty_total || 0);
        base.passedQuantity = Number(r.qty_pass || 0);
        base.failedQuantity = Number(r.qty_fail || 0);
        base.productionSignature = String(r.signature_prod || '');
        base.productionName = String(r.name_prod || '');
        base.productionComment = String(r.production_comment || '');
        base.managerSignature = String(r.signature_mgr || '');
        base.managerName = String(r.name_mgr || '');
    } else if (type === 'IQC' || type === 'SQC_MAT' || type === 'SQC_VT') {
        base.po_number = String(r.po_number || '');
        base.supplier = String(r.supplier || '');
        base.supplierAddress = String(r.supplier_address || '');
        base.location = String(r.location || '');
        base.materials = safeJsonParse(r.materials_json, []);
        base.referenceDocs = safeJsonParse(r.reference_docs_json, []);
        base.pmSignature = String(r.pm_signature || '');
        base.pmName = String(r.pm_name || '');
        base.pmComment = String(r.pm_comment || '');
    }

    return base as Inspection;
  } catch (e) {
    console.error("ISO-DB: Get Detail failed", e);
    return null;
  }
};

const processAndStoreImages = async (entityId: string, entityType: 'INSPECTION' | 'NCR' | 'DEFECT' | 'USER' | 'COMMENT', images: string[], role: 'EVIDENCE' | 'BEFORE' | 'AFTER' | 'PREVIEW', itemId?: string): Promise<string[]> => {
  const refs: string[] = [];
  for (const base64 of (images || [])) {
    if (!base64.startsWith('data:image')) { if (base64.length < 100) refs.push(base64); continue; }
    const imgId = `img_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    try {
      await turso.execute({
        sql: `INSERT INTO qms_images (id, parent_entity_id, related_item_id, entity_type, image_role, url_hd, url_thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [imgId, entityId, itemId || null, entityType, role, base64, base64, now]
      });
      refs.push(imgId);
    } catch (e) { console.error("ISO-IMAGE: Save failed", e); }
  }
  return refs;
};

export const saveInspection = async (inspection: Inspection) => {
  const now = new Date().toISOString();
  const inspectionId = inspection.id;
  const type = inspection.type || 'PQC';
  const tableName = getTableName(type);

  await turso.execute({
      sql: `INSERT INTO inspections_master (id, type, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`,
      args: [inspectionId, type, inspection.createdAt || now, now]
  });

  await turso.execute({ sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [inspectionId] });

  await processAndStoreImages(inspectionId, 'INSPECTION', inspection.images || [], 'EVIDENCE');
  
  if (type === 'IQC' || type === 'SQC_MAT' || type === 'SQC_VT') {
      await processAndStoreImages(inspectionId, 'INSPECTION', inspection.deliveryNoteImages || [], 'PREVIEW', 'DELIVERY_NOTE');
      await processAndStoreImages(inspectionId, 'INSPECTION', inspection.reportImages || [], 'PREVIEW', 'SUPPLIER_REPORT');
  }

  const sanitizedItems = await Promise.all((inspection.items || []).map(async (item) => {
    const itemImageRefs = await processAndStoreImages(inspectionId, 'INSPECTION', item.images || [], 'EVIDENCE', item.id);
    if (item.ncr && item.status === CheckStatus.FAIL) {
        await saveNcrMapped(inspectionId, item.ncr, inspection.inspectorName);
    }
    return { ...item, image_refs: itemImageRefs, images: [], ncr: undefined }; 
  }));

  const sanitizedMaterials = await Promise.all((inspection.materials || []).map(async (mat) => {
      const sanitizedMatItems = await Promise.all((mat.items || []).map(async (mItem) => {
          const mItemImageRefs = await processAndStoreImages(inspectionId, 'INSPECTION', mItem.images || [], 'EVIDENCE', mItem.id);
          return { ...mItem, image_refs: mItemImageRefs, images: [] };
      }));
      return { ...mat, items: sanitizedMatItems, images: [] };
  }));

  if (type === 'PQC') {
      const sql = `
        INSERT INTO forms_pqc (
          id, type, ma_ct, ten_ct, ten_hang_muc, workshop, stage, 
          sl_ipo, qty_total, qty_pass, qty_fail, inspector, status, 
          date, score, summary, items_json, signature_qc, signature_prod, 
          signature_mgr, name_prod, name_mgr, production_comment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          status=excluded.status, qty_total=excluded.qty_total, qty_pass=excluded.qty_pass, 
          qty_fail=excluded.qty_fail, score=excluded.score, summary=excluded.summary, 
          items_json=excluded.items_json, signature_prod=COALESCE(excluded.signature_prod, signature_prod),
          name_prod=COALESCE(excluded.name_prod, name_prod), production_comment=COALESCE(excluded.production_comment, production_comment),
          signature_mgr=COALESCE(excluded.signature_mgr, signature_mgr), name_mgr=COALESCE(excluded.name_mgr, name_mgr),
          updated_at=excluded.updated_at, inspector=excluded.inspector
      `;

      await turso.execute({
        sql,
        args: cleanArgs([
          inspectionId, 'PQC', inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
          inspection.workshop, inspection.inspectionStage, inspection.so_luong_ipo, 
          inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity, 
          inspection.inspectorName, inspection.status, inspection.date, 
          inspection.score, inspection.summary, JSON.stringify(sanitizedItems), 
          inspection.signature, inspection.productionSignature, inspection.managerSignature,
          inspection.productionName, inspection.managerName, inspection.productionComment,
          inspection.createdAt || now, now
        ])
      });
  } else if (type === 'IQC' || type === 'SQC_MAT' || type === 'SQC_VT') {
      const sql = `
        INSERT INTO ${tableName} (
          id, type, po_number, supplier, supplier_address, location, ma_ct, date,
          inspector, status, materials_json, reference_docs_json, summary,
          signature_qc, pm_signature, pm_name, pm_comment, created_at, updated_at, ten_ct, ten_hang_muc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status, materials_json=excluded.materials_json, summary=excluded.summary,
          pm_signature=COALESCE(excluded.pm_signature, pm_signature), pm_name=COALESCE(excluded.pm_name, pm_name),
          pm_comment=COALESCE(excluded.pm_comment, pm_comment), updated_at=excluded.updated_at,
          location=excluded.location, supplier_address=excluded.supplier_address, po_number=excluded.po_number,
          supplier=excluded.supplier, ma_ct=excluded.ma_ct, inspector=excluded.inspector,
          ten_ct=excluded.ten_ct, ten_hang_muc=excluded.ten_hang_muc, date=excluded.date
      `;
      await turso.execute({
          sql,
          args: cleanArgs([
              inspectionId, type, inspection.po_number, inspection.supplier, inspection.supplierAddress,
              inspection.location, inspection.ma_ct, inspection.date, inspection.inspectorName,
              inspection.status, JSON.stringify(sanitizedMaterials), JSON.stringify(inspection.referenceDocs || []),
              inspection.summary, inspection.signature, inspection.pmSignature, inspection.pmName, 
              inspection.pmComment, inspection.createdAt || now, now, inspection.ten_ct, inspection.ten_hang_muc
          ])
      });
  } else {
      await turso.execute({
          sql: `INSERT INTO ${tableName} (id, type, ma_ct, ten_ct, ten_hang_muc, inspector, status, date, items_json, created_at, updated_at, signature_qc) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, items_json=excluded.items_json, inspector=excluded.inspector`,
          args: cleanArgs([
              inspectionId, type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
              inspection.inspectorName, inspection.status, inspection.date, JSON.stringify(sanitizedItems),
              inspection.createdAt || now, now, inspection.signature
          ])
      });
  }
};

export const deleteInspection = async (id: string) => {
    const masterRes = await turso.execute({
      sql: "SELECT type FROM inspections_master WHERE id = ?",
      args: [id]
    });

    if (masterRes.rows.length === 0) return { success: false, message: "Not found" };
    const type = String(masterRes.rows[0].type);
    const tableName = getTableName(type);

    await turso.execute({ sql: `DELETE FROM ${tableName} WHERE id = ?`, args: [id] });
    await turso.execute({ sql: "DELETE FROM inspections_master WHERE id = ?", args: [id] });
    await turso.execute({ sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [id] });
    await turso.execute({ sql: "DELETE FROM ncrs WHERE inspection_id = ?", args: [id] });

    return { success: true };
};

export const getPlansPaginated = async (search: string, page: number, limit: number) => {
    try {
        const offset = (page - 1) * limit;
        let sql = `SELECT id, headcode, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, so_luong_ipo, dvt, status FROM plans`;
        let countSql = `SELECT COUNT(*) as total FROM plans`;
        const args: any[] = [];
        if (search) {
            const term = `%${search}%`;
            sql += ` WHERE headcode LIKE ? OR ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ?`;
            countSql += ` WHERE headcode LIKE ? OR ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ?`;
            args.push(term, term, term, term, term);
        }
        sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
        const [res, countRes] = await Promise.all([
            turso.execute({ sql, args: [...args, limit, offset] }),
            turso.execute({ sql: countSql, args })
        ]);
        const items = res.rows.map(r => ({
            id: r.id,
            headcode: String(r.headcode),
            ma_ct: String(r.ma_ct || ''),
            ten_ct: String(r.ten_ct || ''),
            ma_nha_may: String(r.ma_nha_may),
            ten_hang_muc: String(r.ten_hang_muc || ''),
            so_luong_ipo: Number(r.so_luong_ipo || 0),
            dvt: String(r.dvt || 'PCS'),
            status: String(r.status || 'PENDING')
        })) as unknown as PlanItem[];
        return { items, total: Number(countRes.rows[0]?.total || 0) };
    } catch (e) { return { items: [], total: 0 }; }
};

export const testConnection = async () => { try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; } };

export const getUsers = async (): Promise<User[]> => { 
  const res = await turso.execute("SELECT id, username, name, role, data FROM users"); 
  return res.rows.map(r => ({ ...safeJsonParse(r.data, {} as any), id: r.id, username: r.username, name: r.name, role: r.role })); 
};

export const saveUser = async (user: User) => {
    await turso.execute({
        sql: "INSERT INTO users (id, username, name, role, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, data=excluded.data, updated_at=excluded.updated_at",
        args: [user.id, user.username, user.name, user.role, JSON.stringify(user), Math.floor(Date.now()/1000)]
    });
};

export const deleteUser = async (id: string) => { await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] }); };

export const importUsers = async (users: User[]) => {
    for (const user of users) {
        await saveUser(user);
    }
};

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT id, code, name, data FROM workshops");
    return res.rows.map(r => ({ ...safeJsonParse(r.data, {} as any), id: r.id as string, code: r.code as string, name: r.name as string }));
};

export const saveWorkshop = async (ws: Workshop) => {
    await turso.execute({
        sql: "INSERT INTO workshops (id, code, name, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, data=excluded.data, updated_at=excluded.updated_at",
        args: [ws.id, ws.code, ws.name, JSON.stringify(ws), Math.floor(Date.now()/1000)]
    });
};

export const deleteWorkshop = async (id: string) => { await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] }); };

export const getTemplates = async () => {
    try {
        const res = await turso.execute("SELECT module_id, data FROM templates");
        const dict: Record<string, CheckItem[]> = {};
        res.rows.forEach(r => { if (r.module_id) dict[String(r.module_id)] = safeJsonParse(r.data, []); });
        return dict;
    } catch (e) { return {}; }
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({ sql: `INSERT INTO templates (module_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(module_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, args: [moduleId, JSON.stringify(items), now] });
};

export const getRoles = async (): Promise<Role[]> => {
    try {
        const res = await turso.execute("SELECT id, name, data FROM roles");
        return res.rows.map(r => ({ ...safeJsonParse(r.data, {} as any), id: r.id as string, name: r.name as string }));
    } catch (e) { return []; }
};

export const saveRole = async (role: Role) => {
    await turso.execute({
        sql: "INSERT INTO roles (id, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data, updated_at=excluded.updated_at",
        args: [role.id, role.name, JSON.stringify(role), Math.floor(Date.now()/1000)]
    });
};

export const deleteRole = async (id: string) => { await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] }); };

export const getProjects = async (): Promise<Project[]> => {
    const res = await turso.execute("SELECT id, ma_ct, name, data FROM projects");
    return res.rows.map(r => safeJsonParse(r.data, {} as any));
};

export const getProjectByCode = async (code: string): Promise<Project | null> => {
  const res = await turso.execute({ sql: "SELECT data FROM projects WHERE ma_ct = ?", args: [code] });
  if (res.rows.length === 0) return null;
  return safeJsonParse(res.rows[0].data, {} as any);
};

export const updateProject = async (proj: Project) => {
    await turso.execute({
        sql: "INSERT INTO projects (id, ma_ct, name, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ma_ct=excluded.ma_ct, name=excluded.name, data=excluded.data, updated_at=excluded.updated_at",
        args: [proj.id, proj.ma_ct, proj.name, JSON.stringify(proj), Math.floor(Date.now()/1000)]
    });
};

export const getNotifications = async (userId: string) => {
    const res = await turso.execute({ sql: "SELECT id, user_id, is_read, data FROM notifications WHERE user_id = ? ORDER BY created_at DESC", args: [userId] });
    return res.rows.map(r => ({ ...safeJsonParse(r.data, {} as any), id: r.id, isRead: r.is_read === 1 }));
};

export const markNotificationRead = async (id: string) => { await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [id] }); };

export const markAllNotificationsRead = async (userId: string) => {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: [userId] });
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
  try {
    const res = await turso.execute("SELECT id, defect_code, name, stage, category, description, severity, suggested_action, data FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => {
      const jsonData = safeJsonParse(r.data, {} as any);
      return { ...jsonData, id: r.id as string, code: r.defect_code as string, name: r.name as string, description: r.description as string, stage: r.stage as string, category: r.category as string, severity: r.severity as string, suggestedAction: r.suggested_action as string } as DefectLibraryItem;
    });
  } catch (e) { return []; }
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, correct_image, incorrect_image, created_by, updated_at, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET defect_code=excluded.defect_code, name=excluded.name, stage=excluded.stage, category=excluded.category, description=excluded.description, severity=excluded.severity, suggested_action=excluded.suggested_action, updated_at=excluded.updated_at, data=excluded.data`,
        args: cleanArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.correctImage, item.incorrectImage, item.createdBy, now, JSON.stringify(item), item.createdAt || now])
    });
};

export const deleteDefectLibraryItem = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] });
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    const now = Math.floor(Date.now() / 1000);
    const sql = `INSERT INTO ncrs (id, inspection_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, created_by, created_at, updated_at, item_id, comments_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, severity=excluded.severity, description=excluded.description, root_cause=excluded.root_cause, corrective_action=excluded.corrective_action, preventive_action=excluded.preventive_action, responsible_person=excluded.responsible_person, deadline=excluded.deadline, images_before_json=excluded.images_before_json, images_after_json=excluded.images_after_json, updated_at=excluded.updated_at, comments_json=excluded.comments_json`;
    await turso.execute({ sql, args: cleanArgs([ncr.id, inspection_id, ncr.defect_code || null, ncr.severity || 'MINOR', ncr.status || 'OPEN', ncr.issueDescription, ncr.rootCause || null, ncr.solution || null, ncr.preventiveAction || null, ncr.responsiblePerson || null, ncr.deadline || null, JSON.stringify(ncr.imagesBefore || []), JSON.stringify(ncr.imagesAfter || []), ncr.createdBy || createdBy, now, now, ncr.itemId || 'unknown', JSON.stringify(ncr.comments || [])]) });
    return ncr.id;
};

export const getNcrs = async (filters: any) => {
    try {
        const res = await turso.execute("SELECT id, inspection_id, defect_code, severity, status, description, responsible_person, deadline, updated_at FROM ncrs ORDER BY updated_at DESC");
        const items = res.rows.map(r => ({
                id: String(r.id),
                inspection_id: String(r.inspection_id),
                defect_code: String(r.defect_code || ''),
                severity: r.severity as any,
                status: String(r.status),
                issueDescription: String(r.description), 
                responsiblePerson: String(r.responsible_person || ''),
                deadline: String(r.deadline || ''),
                updatedAt: Number(r.updated_at)
        }));
        return { items, total: items.length };
    } catch (e) { return { items: [], total: 0 }; }
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    try {
        const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
        if (res.rows.length === 0) return null;
        const r = res.rows[0];
        return {
            id: String(r.id),
            inspection_id: String(r.inspection_id),
            defect_code: String(r.defect_code || ''),
            severity: r.severity as any,
            status: String(r.status),
            issueDescription: String(r.description),
            rootCause: String(r.root_cause || ''),
            solution: String(r.corrective_action || ''),
            preventiveAction: String(r.preventive_action || ''),
            responsiblePerson: String(r.responsible_person || ''),
            deadline: String(r.deadline || ''),
            imagesBefore: safeJsonParse(r.images_before_json, []),
            imagesAfter: safeJsonParse(r.images_after_json, []),
            comments: safeJsonParse(r.comments_json, []),
            createdBy: String(r.created_by),
            itemId: String(r.item_id),
            createdDate: new Date(Number(r.created_at) * 1000).toISOString()
        } as NCR;
    } catch (e) { return null; }
};