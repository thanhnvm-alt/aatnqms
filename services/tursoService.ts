
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus, ModuleId } from "../types";

const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object') return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    return defaultValue;
  }
};

const sanitizeArgs = (args: any[]): any[] => {
    return args.map(arg => {
        if (arg === undefined) return null;
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        if (typeof arg === 'number' && isNaN(arg)) return null;
        return arg;
    });
};

const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_vt', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site'];

const getTableName = (type: string = 'PQC'): string => {
    const t = type.toLowerCase();
    if (t === 'sqc_mat' || t === 'sqc_vt') return 'forms_sqc_vt';
    return MODULE_TABLES.includes(t) ? `forms_${t}` : `forms_pqc`;
};

/**
 * ISO-NOTIFICATION-ENGINE: Tạo thông báo hệ thống
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
 * ISO-IMAGE-DECOUPLING: Tách hình ảnh/chữ ký ra khỏi JSON và lưu vào bảng qms_images
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
 * ISO-REHYDRATION: Lấy dữ liệu ảnh từ bảng qms_images
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

        if (role.includes('SIGNATURE')) {
            signatureMap[role] = url;
        } else if (itemId) {
            if (!itemImagesMap[itemId]) itemImagesMap[itemId] = [];
            itemImagesMap[itemId].push(url);
        } else {
            if (!imagesMap[role]) imagesMap[role] = [];
            imagesMap[role].push(url);
        }
    });

    return { imagesMap, itemImagesMap, signatureMap };
}

/**
 * ISO-NCR-SAVE: Lưu dữ liệu NCR riêng biệt
 */
async function saveNCRData(inspectionId: string, ncr: NCR, inspectorName: string) {
    const ncrId = ncr.id && !ncr.id.startsWith('NCR-temp') ? ncr.id : `NCR-${inspectionId}-${ncr.itemId || Date.now()}`;
    await turso.execute({ sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [ncrId] });
    const beforeRefs = await processAndStoreImages(ncrId, 'NCR', ncr.imagesBefore, 'BEFORE', undefined, true);
    const afterRefs = await processAndStoreImages(ncrId, 'NCR', ncr.imagesAfter, 'AFTER', undefined, true);

    await turso.execute({
        sql: `INSERT INTO ncrs (
                id, inspection_id, item_id, defect_code, severity, status, 
                description, root_cause, corrective_action, preventive_action, 
                responsible_person, deadline, images_before_json, images_after_json, 
                created_by, created_at, updated_at, comments_json
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), ?)
              ON CONFLICT(id) DO UPDATE SET 
                severity=excluded.severity, status=excluded.status, description=excluded.description,
                root_cause=excluded.root_cause, corrective_action=excluded.corrective_action,
                preventive_action=excluded.preventive_action,
                responsible_person=excluded.responsible_person, deadline=excluded.deadline,
                updated_at=unixepoch(), images_before_json=excluded.images_before_json,
                images_after_json=excluded.images_after_json, comments_json=excluded.comments_json`,
        args: sanitizeArgs([
            ncrId, inspectionId, ncr.itemId || 'unknown', ncr.defect_code || null, 
            ncr.severity || 'MINOR', ncr.status || 'OPEN', ncr.issueDescription,
            ncr.rootCause || null, ncr.solution || null, ncr.preventiveAction || null,
            ncr.responsiblePerson || null, ncr.deadline || null,
            JSON.stringify(beforeRefs), JSON.stringify(afterRefs), inspectorName,
            JSON.stringify(ncr.comments || [])
        ])
    });
    return ncrId;
}

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
      "CREATE TABLE IF NOT EXISTS inspections_master (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TEXT, updated_at TEXT)",
      "CREATE TABLE IF NOT EXISTS qms_images (id TEXT PRIMARY KEY, parent_entity_id TEXT NOT NULL, related_item_id TEXT, entity_type TEXT NOT NULL, image_role TEXT NOT NULL, url_hd TEXT, url_thumbnail TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_id TEXT NOT NULL, defect_code TEXT, severity TEXT DEFAULT 'MINOR', status TEXT DEFAULT 'OPEN', description TEXT NOT NULL, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, created_by TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), comments_json TEXT DEFAULT ( '[]' ))",
      `CREATE TABLE IF NOT EXISTS forms_pqc (id TEXT PRIMARY KEY, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, ma_nha_may TEXT, workshop TEXT, stage TEXT, dvt TEXT, sl_ipo REAL DEFAULT 0, qty_total REAL DEFAULT 0, qty_pass REAL DEFAULT 0, qty_fail REAL DEFAULT 0, created_by TEXT, created_at TEXT, inspector TEXT, status TEXT, data TEXT, updated_at TEXT, items_json TEXT, images_json TEXT, headcode TEXT, date TEXT, qty_ipo REAL, score REAL, summary TEXT, signature_qc TEXT, signature_prod TEXT, signature_mgr TEXT, name_prod TEXT, name_mgr TEXT, item_images_json TEXT, comments_json TEXT DEFAULT '[]', type TEXT DEFAULT 'PQC', production_comment TEXT)`,
      `CREATE TABLE IF NOT EXISTS forms_iqc (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_sqc_vt (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_sqc_btp (${baseColumns})`,
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, avatar TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS projects (ma_ct TEXT PRIMARY KEY, name TEXT, status TEXT, pm TEXT, pc TEXT, qa TEXT, progress REAL DEFAULT 0, start_date TEXT, end_date TEXT, location TEXT, description TEXT, thumbnail TEXT, data TEXT, updated_at INTEGER, created_at INTEGER DEFAULT (unixepoch()))",
      "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, is_read INTEGER DEFAULT 0, created_at INTEGER, data TEXT)",
      "CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)",
      "CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo REAL, ma_nha_may TEXT, created_at INTEGER, assignee TEXT, status TEXT)",
      "CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, code TEXT, name TEXT, data TEXT, updated_at INTEGER)"
    ]);
    
    // ISO-FIX: Migrations an toàn cho bảng notifications để khắc phục lỗi thiếu cột
    try { await turso.execute("ALTER TABLE notifications ADD COLUMN user_id TEXT"); } catch (e) {}
    try { await turso.execute("ALTER TABLE notifications ADD COLUMN is_read INTEGER DEFAULT 0"); } catch (e) {}
    try { await turso.execute("ALTER TABLE notifications ADD COLUMN created_at INTEGER"); } catch (e) {}

    console.log("✅ ISO-Digital QMS Database Ready.");
  } catch (e: any) {
    console.error("❌ ISO-DB Initialization Error:", e.message);
  }
};

export const saveInspection = async (inspection: Inspection) => {
  const now = new Date().toISOString();
  const type = inspection.type || 'PQC';
  const tableName = getTableName(type);
  
  // Lấy trạng thái cũ để so sánh gửi thông báo
  const oldRes = await turso.execute({ sql: `SELECT status FROM ${tableName} WHERE id = ?`, args: [inspection.id] });
  const oldStatus = oldRes.rows.length > 0 ? String(oldRes.rows[0].status) : null;

  // 1. Dọn dẹp & Tách ảnh (Sử dụng forceArray=true cho Evidence)
  await turso.execute({ sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [inspection.id] });
  const sigQcRef = await processAndStoreImages(inspection.id, 'INSPECTION', inspection.signature, 'QC_SIGNATURE' as any);
  const sigProdRef = await processAndStoreImages(inspection.id, 'INSPECTION', inspection.productionSignature, 'PROD_SIGNATURE' as any);
  const sigMgrRef = await processAndStoreImages(inspection.id, 'INSPECTION', inspection.managerSignature || inspection.pmSignature, 'MGR_SIGNATURE' as any);
  
  const deliveryImgRefs = await processAndStoreImages(inspection.id, 'INSPECTION', inspection.deliveryNoteImages, 'EVIDENCE', 'delivery', true);
  const reportImgRefs = await processAndStoreImages(inspection.id, 'INSPECTION', inspection.reportImages, 'EVIDENCE', 'report', true);
  const fieldImgRefs = await processAndStoreImages(inspection.id, 'INSPECTION', inspection.images, 'EVIDENCE', 'field', true);

  // 2. Xử lý Items & NCRs
  const cleanedItems = await Promise.all((inspection.items || []).map(async (item) => {
      const itemImgRefs = await processAndStoreImages(inspection.id, 'INSPECTION', item.images, 'EVIDENCE', item.id, true);
      if (item.status === CheckStatus.FAIL && item.ncr) {
          await saveNCRData(inspection.id, { ...item.ncr, itemId: item.id }, inspection.inspectorName);
      }
      const { ncr, images, ...rest } = item;
      return { ...rest, images: itemImgRefs }; 
  }));

  // 3. Mapping dữ liệu vào bảng tương ứng
  if (type === 'PQC') {
      const pqcArgs = sanitizeArgs([
          inspection.id, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
          inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,
          inspection.so_luong_ipo || 0, inspection.inspectedQuantity || 0,
          inspection.passedQuantity || 0, inspection.failedQuantity || 0,
          inspection.inspectorName, inspection.createdAt || now, inspection.inspectorName, inspection.status,
          '{}', now, JSON.stringify(cleanedItems), JSON.stringify(fieldImgRefs),
          inspection.headcode, inspection.date, inspection.so_luong_ipo || 0, inspection.score || 0, inspection.summary,
          sigQcRef, sigProdRef, sigMgrRef,
          inspection.productionName, inspection.managerName, '[]',
          JSON.stringify(inspection.comments || []), 'PQC',
          inspection.productionComment
      ]);
      await turso.execute({
          sql: `INSERT INTO forms_pqc (id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, dvt, sl_ipo, qty_total, qty_pass, qty_fail, created_by, created_at, inspector, status, data, updated_at, items_json, images_json, headcode, date, qty_ipo, score, summary, signature_qc, signature_prod, signature_mgr, name_prod, name_mgr, item_images_json, comments_json, type, production_comment) 
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) 
                ON CONFLICT(id) DO UPDATE SET 
                  status=excluded.status, 
                  score=excluded.score, 
                  items_json=excluded.items_json, 
                  images_json=excluded.images_json,
                  qty_total=excluded.qty_total,
                  qty_pass=excluded.qty_pass,
                  qty_fail=excluded.qty_fail,
                  summary=excluded.summary,
                  signature_qc=COALESCE(excluded.signature_qc, signature_qc),
                  signature_prod=COALESCE(excluded.signature_prod, signature_prod),
                  signature_mgr=COALESCE(excluded.signature_mgr, signature_mgr),
                  name_prod=COALESCE(excluded.name_prod, name_prod),
                  name_mgr=COALESCE(excluded.name_mgr, name_mgr),
                  production_comment=excluded.production_comment,
                  comments_json=excluded.comments_json,
                  updated_at=excluded.updated_at`,
          args: pqcArgs
      });
  } else {
      const matArgs = sanitizeArgs([
          inspection.id, type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
          inspection.po_number, inspection.supplier, inspection.inspectorName, inspection.status, inspection.date,
          inspection.score || 0, inspection.summary, JSON.stringify(cleanedItems), JSON.stringify(inspection.materials || []),
          sigQcRef, sigMgrRef, inspection.managerName || inspection.pmName, inspection.pmComment,
          sigProdRef, inspection.productionName, inspection.productionComment,
          JSON.stringify(fieldImgRefs), JSON.stringify(deliveryImgRefs), JSON.stringify(reportImgRefs),
          JSON.stringify(inspection.comments || []), inspection.so_luong_ipo || 0, inspection.inspectedQuantity || 0,
          inspection.passedQuantity || 0, inspection.failedQuantity || 0, inspection.dvt || 'PCS', now, inspection.createdAt || now
      ]);

      const sql = `
          INSERT INTO ${tableName} (
              id, type, ma_ct, ten_ct, ten_hang_muc, po_number, supplier, inspector, status, date, 
              score, summary, items_json, materials_json, signature_qc, pm_signature, pm_name, pm_comment, 
              production_signature, production_name, production_comment, images_json, delivery_images_json, report_images_json,
              comments_json, so_luong_ipo, inspected_qty, passed_qty, failed_qty, dvt, updated_at, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET 
            status=excluded.status, 
            score=excluded.score, 
            items_json=excluded.items_json, 
            materials_json=excluded.materials_json, 
            images_json=excluded.images_json,
            delivery_images_json=excluded.delivery_images_json,
            report_images_json=excluded.report_images_json,
            inspected_qty=excluded.inspected_qty,
            passed_qty=excluded.passed_qty,
            failed_qty=excluded.failed_qty,
            signature_qc=COALESCE(excluded.signature_qc, signature_qc),
            pm_signature=COALESCE(excluded.pm_signature, pm_signature),
            production_signature=COALESCE(excluded.production_signature, production_signature),
            pm_name=COALESCE(excluded.pm_name, pm_name),
            production_name=COALESCE(excluded.production_name, production_name),
            pm_comment=excluded.pm_comment,
            production_comment=excluded.production_comment,
            comments_json=excluded.comments_json,
            updated_at=excluded.updated_at
      `;
      await turso.execute({ sql, args: matArgs });
  }

  // 4. ISO-NOTIFY: Xử lý tạo thông báo
  if (inspection.status === InspectionStatus.PENDING && oldStatus !== InspectionStatus.PENDING) {
      const managersRes = await turso.execute("SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER')");
      for (const m of managersRes.rows) {
          await addNotification(String(m.id), 'INSPECTION', `Phiếu ${type} mới cần duyệt`, `Phiếu #${inspection.id.split('-').pop()} cho ${inspection.ten_hang_muc} đã sẵn sàng.`, { view: 'DETAIL', id: inspection.id });
      }
  } else if (inspection.status === InspectionStatus.APPROVED && oldStatus !== InspectionStatus.APPROVED) {
      // Thông báo cho Inspector
      const inspectorRes = await turso.execute({ sql: "SELECT id FROM users WHERE name = ?", args: [inspection.inspectorName] });
      if (inspectorRes.rows.length > 0) {
          await addNotification(String(inspectorRes.rows[0].id), 'INSPECTION', `Phiếu ${type} đã được duyệt`, `Hồ sơ #${inspection.id.split('-').pop()} đã được phê duyệt.`, { view: 'DETAIL', id: inspection.id });
      }
      // Thông báo cho Xưởng/Sản xuất (nếu có user khớp tên)
      if (inspection.productionName) {
          const prodRes = await turso.execute({ sql: "SELECT id FROM users WHERE name = ?", args: [inspection.productionName] });
          if (prodRes.rows.length > 0) {
              await addNotification(String(prodRes.rows[0].id), 'INSPECTION', 'Hồ sơ đã được phê duyệt', `Phiếu #${inspection.id.split('-').pop()} đã hoàn tất phê duyệt bởi quản lý.`, { view: 'DETAIL', id: inspection.id });
          }
      }
  }

  await turso.execute({
      sql: "INSERT INTO inspections_master (id, type, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at",
      args: [inspection.id, type, inspection.createdAt || now, now]
  });
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
  try {
    const masterRes = await turso.execute({ sql: "SELECT type FROM inspections_master WHERE id = ?", args: [id] });
    if (masterRes.rows.length === 0) return null;
    const type = String(masterRes.rows[0].type);
    const tableName = getTableName(type);
    const res = await turso.execute({ sql: `SELECT * FROM ${tableName} WHERE id = ?`, args: [id] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    
    const { imagesMap, itemImagesMap, signatureMap } = await getEntityImages(id);

    const ncrRes = await turso.execute({ sql: "SELECT * FROM ncrs WHERE inspection_id = ?", args: [id] });
    const ncrByItemId: Record<string, NCR> = {};
    for (const row of ncrRes.rows) {
        const ncrId = String(row.id);
        const { imagesMap: ncrImages } = await getEntityImages(ncrId);
        ncrByItemId[String(row.item_id)] = {
            id: ncrId, inspection_id: id, itemId: String(row.item_id),
            defect_code: String(row.defect_code || ''), severity: row.severity as any,
            status: String(row.status), issueDescription: String(row.description),
            rootCause: String(row.root_cause || ''), solution: String(row.corrective_action || ''),
            responsiblePerson: String(row.responsible_person || ''), deadline: String(row.deadline || ''),
            imagesBefore: ncrImages['BEFORE'] || [], imagesAfter: ncrImages['AFTER'] || [],
            comments: safeJsonParse(row.comments_json, []),
            createdBy: String(row.created_by), createdDate: String(row.created_at)
        } as NCR;
    }

    const items = safeJsonParse<CheckItem[]>(r.items_json, []);
    const rehydratedItems = items.map(item => ({
        ...item,
        images: itemImagesMap[item.id] || [],
        ncr: ncrByItemId[item.id] || undefined
    }));

    if (type === 'PQC') {
        return { 
            id: String(r.id), type: 'PQC', ma_ct: String(r.ma_ct || ''), ten_ct: String(r.ten_ct || ''), ten_hang_muc: String(r.ten_hang_muc || ''), 
            ma_nha_may: String(r.ma_nha_may || ''), workshop: String(r.workshop || ''), inspectionStage: String(r.stage || ''),
            inspectorName: String(r.inspector || ''), status: r.status as any, date: String(r.date || ''), score: Number(r.score || 0), summary: String(r.summary || ''), 
            items: rehydratedItems, images: itemImagesMap['field'] || [], comments: safeJsonParse(r.comments_json, []),
            signature: signatureMap['QC_SIGNATURE'] || '', productionSignature: signatureMap['PROD_SIGNATURE'] || '',
            productionName: String(r.name_prod || ''), productionComment: String(r.production_comment || ''),
            managerSignature: signatureMap['MGR_SIGNATURE'] || '', managerName: String(r.name_mgr || ''),
            so_luong_ipo: Number(r.qty_ipo || r.sl_ipo || 0), inspectedQuantity: Number(r.qty_total || 0),
            passedQuantity: Number(r.qty_pass || 0), failedQuantity: Number(r.qty_fail || 0),
            dvt: String(r.dvt || ''), headcode: String(r.headcode || ''), createdAt: String(r.created_at || ''), updatedAt: String(r.updated_at || '') 
        } as any;
    } else {
        return {
            id: String(r.id), type: type as ModuleId, ma_ct: String(r.ma_ct || ''), ten_ct: String(r.ten_ct || ''), ten_hang_muc: String(r.ten_hang_muc || ''),
            po_number: String(r.po_number || ''), supplier: String(r.supplier || ''), inspectorName: String(r.inspector || ''),
            status: r.status as any, date: String(r.date || ''), score: Number(r.score || 0), summary: String(r.summary || ''),
            items: rehydratedItems, materials: safeJsonParse(r.materials_json, []),
            signature: signatureMap['QC_SIGNATURE'] || '', pmSignature: signatureMap['MGR_SIGNATURE'] || '',
            pmName: String(r.pm_name || ''), pmComment: String(r.pm_comment || ''),
            productionSignature: signatureMap['PROD_SIGNATURE'] || '', productionName: String(r.production_name || ''), productionComment: String(r.production_comment || ''),
            images: itemImagesMap['field'] || [], deliveryNoteImages: itemImagesMap['delivery'] || [], reportImages: itemImagesMap['report'] || [],
            comments: safeJsonParse(r.comments_json, []), so_luong_ipo: Number(r.so_luong_ipo || 0),
            inspectedQuantity: Number(r.inspected_qty || 0), passedQuantity: Number(r.passed_qty || 0), failedQuantity: Number(r.failed_qty || 0),
            dvt: String(r.dvt || ''), createdAt: String(r.created_at || ''), updatedAt: String(r.updated_at || '')
        } as any;
    }
  } catch (e) { return null; }
};

export const getInspectionsList = async (filters: any = {}) => {
  const unionParts = MODULE_TABLES.map(t => {
      const tableName = (t === 'sqc_vt' || t === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${t}`;
      
      let extraCols = '';
      if (t === 'pqc') {
          extraCols = 'ma_nha_may, headcode, workshop, stage as inspectionStage, items_json';
      } else {
          extraCols = 'NULL as ma_nha_may, NULL as headcode, NULL as workshop, NULL as inspectionStage, items_json';
      }
      
      return `SELECT id, type, ma_ct, ten_ct, ten_hang_muc, inspector, status, date, updated_at, ${extraCols} FROM ${tableName}`;
  });

  const sql = `SELECT * FROM (${unionParts.join(' UNION ALL ')}) ORDER BY updated_at DESC LIMIT 200`;
  try {
    const res = await turso.execute(sql);
    return { 
        items: res.rows.map(r => {
            // ISO-LOGIC: Quét các nhãn trạng thái ngay tại đây thay vì gửi JSON lớn về Client
            const items = safeJsonParse<CheckItem[]>(r.items_json, []);
            
            // ISO-FLAGS UPDATED: Không xét trạng thái FLAGGED của phiếu, chỉ xét từng item Hỏng
            const hasFail = items.some(it => it.status === CheckStatus.FAIL);
            const hasCond = items.some(it => it.status === CheckStatus.CONDITIONAL);
            const isOk = items.length > 0 && items.every(it => it.status === CheckStatus.PASS);

            return {
                id: String(r.id), 
                ma_ct: String(r.ma_ct || ''), 
                ten_ct: String(r.ten_ct || ''), 
                ten_hang_muc: String(r.ten_hang_muc || ''),
                inspectorName: String(r.inspector || ''), 
                status: r.status as any, 
                date: String(r.date || ''),
                type: (r.type || 'PQC') as ModuleId, 
                updatedAt: String(r.updated_at || ''),
                ma_nha_may: r.ma_nha_may ? String(r.ma_nha_may) : null,
                headcode: r.headcode ? String(r.headcode) : null,
                workshop: r.workshop ? String(r.workshop) : null,
                inspectionStage: r.inspectionStage ? String(r.inspectionStage) : null,
                // Trả về cờ hiệu trạng thái thay vì JSON thô
                isAllPass: isOk,
                hasNcr: hasFail,
                isCond: hasCond
            };
        }), 
        total: res.rows.length 
    };
  } catch (e) { 
    console.error("ISO-LIST: Fetch failed", e);
    return { items: [], total: 0 }; 
  }
};

export const getUsers = async (): Promise<User[]> => {
    const res = await turso.execute("SELECT id, username, name, role, avatar, data FROM users");
    return res.rows.map(r => ({ id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), avatar: String(r.avatar), ...safeJsonParse(r.data, {}) }));
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username.toLowerCase()] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return { id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), avatar: String(r.avatar), ...safeJsonParse(r.data, {}) } as any;
};

export const saveUser = async (user: User) => {
    const { id, username, name, role, avatar, ...rest } = user;
    await turso.execute({ sql: "INSERT INTO users (id, username, name, role, avatar, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, data=excluded.data", args: sanitizeArgs([id, username, name, role, avatar, JSON.stringify(rest), Math.floor(Date.now()/1000)]) });
};

export const deleteUser = async (id: string) => { await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] }); };

export const importUsers = async (users: User[]) => {
    for (const user of users) { await saveUser(user); }
};

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT * FROM workshops");
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.id), code: String(r.code), name: String(r.name), ...jsonData };
    });
};

export const saveWorkshop = async (ws: Workshop) => {
    await turso.execute({ sql: "INSERT INTO workshops (id, code, name, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, name=excluded.name, code=excluded.code", args: sanitizeArgs([ws.id, ws.code, ws.name, JSON.stringify(ws), Math.floor(Date.now()/1000)]) });
};

export const deleteWorkshop = async (id: string) => { await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] }); };

export const getTemplates = async () => {
    const res = await turso.execute("SELECT * FROM templates");
    const dict: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => { dict[String(r.moduleId)] = safeJsonParse(r.data, []); });
    return dict;
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    await turso.execute({ sql: "INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at", args: sanitizeArgs([moduleId, JSON.stringify(items), Math.floor(Date.now()/1000)]) });
};

export const getNotifications = async (userId: string) => {
    const res = await turso.execute({ sql: "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", args: [userId] });
    return res.rows.map(r => ({ id: String(r.id), userId: String(r.user_id), isRead: Boolean(r.is_read), createdAt: Number(r.created_at), ...safeJsonParse(r.data, {}) })) as Notification[];
};

export const markNotificationRead = async (id: string) => { await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [id] }); };
export const markAllNotificationsRead = async (userId: string) => { await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: [userId] }); };

export const getRoles = async (): Promise<Role[]> => {
    const res = await turso.execute("SELECT * FROM roles");
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.id), name: String(r.name), ...jsonData };
    });
};

export const saveRole = async (role: Role) => {
    await turso.execute({ sql: "INSERT INTO roles (id, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, name=excluded.name", args: sanitizeArgs([role.id, role.name, JSON.stringify(role), Math.floor(Date.now()/1000)]) });
};

export const deleteRole = async (id: string) => { await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] }); };

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    return await saveNCRData(inspection_id, ncr, createdBy);
};

export const getNcrs = async (filters: any = {}) => {
    let sql = "SELECT id, inspection_id, item_id, defect_code, severity, status, description, responsible_person, deadline, created_by, created_at, updated_at FROM ncrs";
    const args: any[] = [];
    const where: string[] = [];
    if (filters.inspection_id) { where.push("inspection_id = ?"); args.push(filters.inspection_id); }
    if (filters.status && filters.status !== 'ALL') { where.push("status = ?"); args.push(filters.status); }
    if (where.length > 0) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY updated_at DESC";
    const res = await turso.execute({ sql, args: sanitizeArgs(args) });
    return { 
        items: res.rows.map(r => ({ 
            id: String(r.id), inspection_id: String(r.inspection_id), itemId: String(r.item_id),
            defect_code: String(r.defect_code || ''), severity: r.severity as any, status: String(r.status), 
            issueDescription: String(r.description), responsiblePerson: String(r.responsible_person || ''), 
            deadline: String(r.deadline || ''), createdBy: String(r.created_by), 
            createdDate: new Date(Number(r.created_at) * 1000).toISOString() 
        })), 
        total: res.rows.length 
    };
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const { imagesMap } = await getEntityImages(id);
    return { 
        id: String(r.id), inspection_id: String(r.inspection_id), itemId: String(r.item_id),
        defect_code: String(r.defect_code || ''), severity: r.severity as any, status: String(r.status), 
        issueDescription: String(r.description), rootCause: String(r.root_cause || ''), 
        solution: String(r.corrective_action || ''), preventiveAction: String(r.preventive_action || ''), 
        responsiblePerson: String(r.responsible_person || ''), deadline: String(r.deadline || ''), 
        imagesBefore: imagesMap['BEFORE'] || [], imagesAfter: imagesMap['AFTER'] || [], 
        comments: safeJsonParse(r.comments_json, []), createdBy: String(r.created_by), 
        createdDate: new Date(Number(r.created_at) * 1000).toISOString() 
    } as NCR;
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    const res = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.id), code: String(r.defect_code || r.id), name: String(r.name || ''), stage: String(r.stage || 'Chung'), category: String(r.category || 'Ngoại quan'), description: String(r.description || ''), severity: String(r.severity || 'MINOR'), suggested_action: String(r.suggested_action || ''), ...jsonData };
    });
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, data, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET defect_code=excluded.defect_code, name=excluded.name, data=excluded.data, updated_at=excluded.updated_at`,
        args: sanitizeArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, JSON.stringify(item), Math.floor(Date.now()/1000)])
    });
};

export const deleteDefectLibraryItem = async (id: string) => { await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] }); };

export const getPlansPaginated = async (search: string, page: number, limit: number = 10) => {
    const offset = (page - 1) * limit;
    let sql = `SELECT id, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, ma_nha_may, created_at, assignee, status FROM plans`;
    const args: any[] = [];
    if (search) { 
        sql += ` WHERE (ma_ct LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ? OR ma_nha_may LIKE ? OR headcode LIKE ?)`; 
        const term = `%${search}%`;
        args.push(term, term, term, term, term); 
    }
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    const res = await turso.execute({ sql, args: sanitizeArgs([...args, limit, offset]) });
    return { items: res.rows as any[], total: res.rows.length };
};

export const getProjectsPaginated = async (search: string = '', limit: number = 10) => {
    let sql = "SELECT ma_ct, name, status, progress, pm, pc, qa, location, description, thumbnail, start_date, end_date, data FROM projects";
    const args: any[] = [];
    if (search) {
        sql += " WHERE ma_ct LIKE ? OR name LIKE ?";
        const term = `%${search}%`;
        args.push(term, term);
    }
    sql += " ORDER BY updated_at DESC LIMIT ?";
    args.push(limit);
    const res = await turso.execute({ sql, args: sanitizeArgs(args) });
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.ma_ct), code: String(r.ma_ct), name: String(r.name), ma_ct: String(r.ma_ct), status: String(r.status || 'In Progress'), progress: Number(r.progress || 0), pm: String(r.pm || ''), pc: String(r.pc || ''), qa: String(r.qa || ''), location: String(r.location || ''), description: String(r.description || ''), thumbnail: String(r.thumbnail || ''), startDate: String(r.start_date || ''), endDate: String(r.end_date || ''), ...jsonData };
    }) as Project[];
};

export const getProjectByCode = async (code: string): Promise<Project | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM projects WHERE ma_ct = ?", args: [code] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const jsonData = safeJsonParse(r.data, {} as any);
    return { id: String(r.ma_ct), code: String(r.ma_ct), name: String(r.name), ma_ct: String(r.ma_ct), status: String(r.status || 'In Progress'), progress: Number(r.progress || 0), pm: String(r.pm || ''), pc: String(r.pc || ''), qa: String(r.qa || ''), location: String(r.location || ''), description: String(r.description || ''), thumbnail: String(r.thumbnail || ''), startDate: String(r.start_date || ''), endDate: String(r.end_date || ''), ...jsonData } as Project;
};

export const updateProject = async (proj: Project) => {
    const { ma_ct, name, status, pm, pc, qa, progress, startDate, endDate, location, description, thumbnail, ...rest } = proj;
    await turso.execute({ sql: `INSERT INTO projects (ma_ct, name, status, pm, pc, qa, progress, start_date, end_date, location, description, thumbnail, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(ma_ct) DO UPDATE SET name=excluded.name, status=excluded.status, pm=excluded.pm, pc=excluded.pc, qa=excluded.qa, progress=excluded.progress, start_date=excluded.start_date, end_date=excluded.end_date, location=excluded.location, description=excluded.description, thumbnail=excluded.thumbnail, data=excluded.data, updated_at=excluded.updated_at`, args: sanitizeArgs([ma_ct, name, status, pm, pc, qa, progress, startDate, endDate, location, description, thumbnail, JSON.stringify(rest)]) });
};

export const syncProjectsWithPlans = async () => {
    const plansRes = await turso.execute("SELECT DISTINCT ma_ct, ten_ct FROM plans");
    for (const row of plansRes.rows) {
        const ma_ct = String(row.ma_ct);
        const name = String(row.ten_ct);
        if (!ma_ct || ma_ct === 'null' || ma_ct === 'DÙNG CHUNG') continue;
        await turso.execute({ sql: "INSERT INTO projects (ma_ct, name, status, progress, updated_at) VALUES (?, ?, 'In Progress', 0, unixepoch()) ON CONFLICT(ma_ct) DO NOTHING", args: [ma_ct, name] });
    }
};

export const deleteInspection = async (id: string) => {
    const res = await turso.execute({ sql: "SELECT type FROM inspections_master WHERE id = ?", args: [id] });
    if (res.rows.length > 0) {
        const type = String(res.rows[0].type);
        const tableName = getTableName(type);
        await turso.batch([
            { sql: `DELETE FROM ${tableName} WHERE id = ?`, args: [id] },
            { sql: "DELETE FROM inspections_master WHERE id = ?", args: [id] },
            { sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [id] },
            { sql: "DELETE FROM ncrs WHERE inspection_id = ?", args: [id] }
        ]);
    }
    return true;
};

export const testConnection = async () => { try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; } };
