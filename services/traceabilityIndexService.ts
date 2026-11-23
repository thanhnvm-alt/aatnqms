import { query } from '../lib/db.js';
import { Inspection } from '../types.js';

const SCHEMA = '"appQAQC"';

export const TRACE_FORM_TABLES = [
  'forms_iqc',
  'forms_sqc_vt',
  'forms_sqc_btp',
  'forms_sqc_tp',
  'forms_sqc_mat',
  'forms_pqc',
  'forms_fsr',
  'forms_step',
  'forms_fqc',
  'forms_spr',
  'forms_site',
] as const;

export type TraceCodeType = 'IPO' | 'PO' | 'PR';

export interface ExtractedTraceKey {
  codeType: TraceCodeType;
  codeValue: string;
  codeNorm: string;
}

export function normalizeTraceCode(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function splitAndNormalizeTraceCodes(rawValues: any[]): {
  rawTokens: string[];
  normSet: Set<string>;
} {
  const rawSet = new Set<string>();
  const normSet = new Set<string>();

  for (const val of rawValues) {
    if (val === null || val === undefined) continue;
    const str = String(val).trim();
    if (!str) continue;

    const parts = str
      .split(/[,;\n|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (
        lower === '---' ||
        lower === 'n/a' ||
        lower === 'na' ||
        lower === 'null' ||
        lower === 'undefined'
      ) {
        continue;
      }
      if (part.length < 3) continue;
      rawSet.add(part);
      const norm = normalizeTraceCode(part);
      if (norm && norm.length >= 3) {
        normSet.add(norm);
      }
    }
  }

  return { rawTokens: Array.from(rawSet), normSet };
}

function safeJsonParse<T>(raw: any, fallback: T): T {
  if (raw === undefined || raw === null || raw === '' || raw === 'undefined' || raw === 'null') {
    return fallback;
  }
  try {
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function parseUnixSec(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val > 1e11 ? Math.floor(val / 1000) : Math.floor(val);
  }
  const s = String(val).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    const ms = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00+07:00`);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function formatDisplayDateServer(rawDate: any, fallbackTs?: number | null): string | null {
  const candidates = [rawDate, fallbackTs];
  for (const cand of candidates) {
    if (cand === null || cand === undefined || cand === '') continue;
    if (typeof cand === 'string') {
      const s = cand.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [y, m, d] = s.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
    }
    const ts = parseUnixSec(cand);
    if (ts && ts > 0) {
      const dt = new Date((ts + 7 * 3600) * 1000);
      if (!Number.isNaN(dt.getTime())) {
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = dt.getUTCFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
    }
  }
  return null;
}

/**
 * Extract ONLY direct Mã NM (IPO) and Số PO / Số PR tokens (no ma_ct/projectCode).
 * Guards against legacy `ma_nha_may` values that were defaulted from `supplier` name.
 */
export function extractStrictTraceKeys(insp: Partial<Inspection> | any): ExtractedTraceKey[] {
  const extra = safeJsonParse<Record<string, any>>(insp?.data, {});
  const mats = Array.isArray(insp?.materials)
    ? insp.materials
    : safeJsonParse<any[]>(insp?.materials_json ?? extra?.materials, []);

  const rawMaNm = String(insp?.ma_nha_may ?? '').trim();
  const rawSupplier = String(insp?.supplier ?? '').trim();
  const extraHasMaNm = Boolean(String(extra?.ma_nha_may ?? '').trim());
  const isSupplierFallback =
    Boolean(rawMaNm && rawSupplier && rawMaNm === rawSupplier && !extraHasMaNm) &&
    !/^\d{5,}$/.test(rawMaNm) &&
    !/^(FO|IPO)/i.test(rawMaNm);

  const ipoRaw: any[] = [
    isSupplierFallback ? extra?.ma_nha_may : insp?.ma_nha_may,
    insp?.headcode ?? extra?.headcode,
    ...mats.flatMap((m: any) => [
      m?.Factory_Order,
      m?.factoryOrder,
      m?.ma_nha_may,
      m?.id_factory_order,
    ]),
  ];

  const poRaw: any[] = [
    insp?.po_number ?? extra?.po_number,
    insp?.poNumber ?? extra?.poNumber,
    ...mats.flatMap((m: any) => [m?.po_number, m?.poNumber, m?.purchaseDocument]),
  ];

  const prRaw: any[] = [
    insp?.pr_number ?? extra?.pr_number,
    insp?.prNumber ?? extra?.prNumber,
    ...mats.flatMap((m: any) => [m?.pr_number, m?.prNumber, m?.requisition]),
  ];

  const keys: ExtractedTraceKey[] = [];
  const seen = new Set<string>();

  const pushTokens = (codeType: TraceCodeType, rawList: any[]) => {
    const { rawTokens } = splitAndNormalizeTraceCodes(rawList);
    for (const raw of rawTokens) {
      const norm = normalizeTraceCode(raw);
      if (norm.length < 3) continue;
      const dedupKey = `${codeType}::${norm}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      keys.push({ codeType, codeValue: raw, codeNorm: norm });
    }
  };

  pushTokens('IPO', ipoRaw);
  pushTokens('PO', poRaw);
  pushTokens('PR', prRaw);

  return keys;
}

export async function syncInspectionTraceabilityIndex(insp: any): Promise<void> {
  if (!insp?.id) return;
  const inspectionId = String(insp.id).trim();
  if (!inspectionId) return;

  try {
    const extra = safeJsonParse<Record<string, any>>(insp.data, {});
    const merged = { ...extra, ...insp };
    const statusUpper = String(merged.status || '').toUpperCase();
    const isDeleted = Boolean(merged.deleted_at) || statusUpper === 'DELETED';

    if (isDeleted) {
      const delTs = parseUnixSec(merged.deleted_at) ?? Math.floor(Date.now() / 1000);
      await markTraceabilityIndexDeleted(inspectionId, delTs);
      return;
    }

    const keys = extractStrictTraceKeys(merged);
    await query(
      `DELETE FROM ${SCHEMA}.inspection_traceability_index WHERE inspection_id = $1`,
      [inspectionId]
    );

    if (keys.length === 0) return;

    const nowTs = Math.floor(Date.now() / 1000);
    const createdAt =
      parseUnixSec(merged.created_at ?? merged.createdAt ?? merged.date) ?? nowTs;
    const updatedAt = parseUnixSec(merged.updated_at ?? merged.updatedAt) ?? nowTs;

    const firstIpo = keys.find((k) => k.codeType === 'IPO')?.codeValue || null;
    const firstPo = keys.find((k) => k.codeType === 'PO')?.codeValue || null;
    const firstPr = keys.find((k) => k.codeType === 'PR')?.codeValue || null;

    const maNhaMay = firstIpo;
    const headcode = String(merged.headcode || extra.headcode || '').trim() || firstIpo;
    const poNumber = String(merged.po_number || merged.poNumber || '').trim() || firstPo;
    const prNumber = String(merged.pr_number || merged.prNumber || '').trim() || firstPr;
    const inspType = String(merged.type || 'PQC').trim().toUpperCase();
    const status = String(merged.status || 'DRAFT').trim();
    const maCt = String(merged.ma_ct || '').trim() || null;
    const tenCt = String(merged.ten_ct || '').trim() || null;
    const tenHangMuc = String(merged.ten_hang_muc || '').trim() || null;
    const workshop = String(merged.workshop || '').trim() || null;
    const supplier = String(merged.supplier || merged.supplierName || '').trim() || null;
    const inspectorName =
      String(
        merged.inspectorName ||
          merged.inspector_name ||
          merged.inspector ||
          merged.created_by ||
          ''
      ).trim() || null;
    const inspectionDate = formatDisplayDateServer(merged.date ?? extra.date, createdAt);
    const score =
      merged.score !== null && merged.score !== undefined && merged.score !== '' && Number.isFinite(Number(merged.score))
        ? Number(merged.score)
        : null;
    const rawInspected = merged.inspectedQuantity ?? merged.inspected_qty ?? merged.qty_total;
    const rawPassed = merged.passedQuantity ?? merged.passed_qty ?? merged.qty_pass;
    const rawFailed = merged.failedQuantity ?? merged.failed_qty ?? merged.qty_fail;
    const inspectedQty = rawInspected !== null && rawInspected !== undefined && rawInspected !== '' ? Number(rawInspected) : null;
    const passedQty = rawPassed !== null && rawPassed !== undefined && rawPassed !== '' ? Number(rawPassed) : null;
    const failedQty = rawFailed !== null && rawFailed !== undefined && rawFailed !== '' ? Number(rawFailed) : null;
    const summaryText = merged.summary ? String(merged.summary) : null;
    const bookingId = merged.booking_id ? String(merged.booking_id) : null;
    const bookingCode = merged.booking_code ? String(merged.booking_code) : null;

    // Single multi-row INSERT per inspection
    const valuesClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    for (const k of keys) {
      const rowId = `${inspectionId}::${k.codeType}::${k.codeNorm}`;
      const ph: string[] = [];
      for (let i = 0; i < 27; i++) {
        ph.push(`$${pIdx++}`);
      }
      valuesClauses.push(`(${ph.join(', ')}, NULL)`);
      params.push(
        rowId,
        inspectionId,
        k.codeType,
        k.codeValue,
        k.codeNorm,
        inspType,
        status,
        maCt,
        tenCt,
        maNhaMay,
        headcode,
        poNumber,
        prNumber,
        tenHangMuc,
        workshop,
        supplier,
        inspectorName,
        inspectionDate,
        score,
        Number.isFinite(inspectedQty as number) ? inspectedQty : null,
        Number.isFinite(passedQty as number) ? passedQty : null,
        Number.isFinite(failedQty as number) ? failedQty : null,
        summaryText,
        bookingId,
        bookingCode,
        createdAt,
        updatedAt
      );
    }

    await query(
      `INSERT INTO ${SCHEMA}.inspection_traceability_index (
        id, inspection_id, code_type, code_value, code_norm,
        inspection_type, status, ma_ct, ten_ct, ma_nha_may, headcode,
        po_number, pr_number, ten_hang_muc, workshop, supplier,
        inspector_name, inspection_date, score, inspected_qty, passed_qty, failed_qty,
        summary, booking_id, booking_code, created_at, updated_at, deleted_at
      ) VALUES ${valuesClauses.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        code_value = EXCLUDED.code_value,
        inspection_type = EXCLUDED.inspection_type,
        status = EXCLUDED.status,
        ma_ct = EXCLUDED.ma_ct,
        ten_ct = EXCLUDED.ten_ct,
        ma_nha_may = EXCLUDED.ma_nha_may,
        headcode = EXCLUDED.headcode,
        po_number = EXCLUDED.po_number,
        pr_number = EXCLUDED.pr_number,
        ten_hang_muc = EXCLUDED.ten_hang_muc,
        workshop = EXCLUDED.workshop,
        supplier = EXCLUDED.supplier,
        inspector_name = EXCLUDED.inspector_name,
        inspection_date = EXCLUDED.inspection_date,
        score = EXCLUDED.score,
        inspected_qty = EXCLUDED.inspected_qty,
        passed_qty = EXCLUDED.passed_qty,
        failed_qty = EXCLUDED.failed_qty,
        summary = EXCLUDED.summary,
        booking_id = EXCLUDED.booking_id,
        booking_code = EXCLUDED.booking_code,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL`,
      params
    );
  } catch (err: any) {
    console.warn('[TraceabilityIndex] sync failed:', err?.message);
  }
}

export async function markTraceabilityIndexDeleted(
  inspectionId: string,
  deletedAtTs?: number
): Promise<void> {
  const ts = deletedAtTs ?? Math.floor(Date.now() / 1000);
  try {
    await query(
      `UPDATE ${SCHEMA}.inspection_traceability_index SET deleted_at = $1 WHERE inspection_id = $2`,
      [ts, inspectionId]
    );
  } catch (err: any) {
    console.warn('[TraceabilityIndex] mark deleted failed:', err?.message);
  }
}

export async function restoreTraceabilityIndex(
  inspectionId: string,
  restoredStatus?: string
): Promise<void> {
  try {
    const nowTs = Math.floor(Date.now() / 1000);
    if (restoredStatus) {
      await query(
        `UPDATE ${SCHEMA}.inspection_traceability_index SET deleted_at = NULL, status = $1, updated_at = $2 WHERE inspection_id = $3`,
        [restoredStatus, nowTs, inspectionId]
      );
    } else {
      await query(
        `UPDATE ${SCHEMA}.inspection_traceability_index SET deleted_at = NULL, updated_at = $1 WHERE inspection_id = $2`,
        [nowTs, inspectionId]
      );
    }
  } catch (err: any) {
    console.warn('[TraceabilityIndex] restore failed:', err?.message);
  }
}

export async function purgeTraceabilityIndex(inspectionId: string): Promise<void> {
  try {
    await query(
      `DELETE FROM ${SCHEMA}.inspection_traceability_index WHERE inspection_id = $1`,
      [inspectionId]
    );
  } catch (err: any) {
    console.warn('[TraceabilityIndex] purge failed:', err?.message);
  }
}

let backfillPromise: Promise<number> | null = null;

async function getTableColumnsSet(tableName: string): Promise<Set<string>> {
  const schema = process.env.DB_SCHEMA || 'appQAQC';
  const res = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tableName]
  );
  return new Set(res.rows.map((r: any) => String(r.column_name)));
}

async function flushIndexRowsBulk(rows: any[][]): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const valuesClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;
    for (const r of chunk) {
      const ph: string[] = [];
      for (let j = 0; j < 27; j++) ph.push(`$${pIdx++}`);
      valuesClauses.push(`(${ph.join(', ')}, NULL)`);
      params.push(...r);
    }
    await query(
      `INSERT INTO ${SCHEMA}.inspection_traceability_index (
        id, inspection_id, code_type, code_value, code_norm,
        inspection_type, status, ma_ct, ten_ct, ma_nha_may, headcode,
        po_number, pr_number, ten_hang_muc, workshop, supplier,
        inspector_name, inspection_date, score, inspected_qty, passed_qty, failed_qty,
        summary, booking_id, booking_code, created_at, updated_at, deleted_at
      ) VALUES ${valuesClauses.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        code_value = EXCLUDED.code_value,
        inspection_type = EXCLUDED.inspection_type,
        status = EXCLUDED.status,
        ma_ct = EXCLUDED.ma_ct,
        ten_ct = EXCLUDED.ten_ct,
        ma_nha_may = EXCLUDED.ma_nha_may,
        headcode = EXCLUDED.headcode,
        po_number = EXCLUDED.po_number,
        pr_number = EXCLUDED.pr_number,
        ten_hang_muc = EXCLUDED.ten_hang_muc,
        workshop = EXCLUDED.workshop,
        supplier = EXCLUDED.supplier,
        inspector_name = EXCLUDED.inspector_name,
        inspection_date = EXCLUDED.inspection_date,
        score = EXCLUDED.score,
        inspected_qty = EXCLUDED.inspected_qty,
        passed_qty = EXCLUDED.passed_qty,
        failed_qty = EXCLUDED.failed_qty,
        summary = EXCLUDED.summary,
        booking_id = EXCLUDED.booking_id,
        booking_code = EXCLUDED.booking_code,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL`,
      params
    );
  }
}

export async function backfillTraceabilityIndex(): Promise<number> {
  if (backfillPromise) return backfillPromise;

  backfillPromise = (async () => {
    let totalInserted = 0;

    // Step 1: Ultra-fast native SQL bulk INSERT INTO ... SELECT for top-level IPO (headcode / non-supplier ma_nha_may) and PO (po_number)
    for (const table of TRACE_FORM_TABLES) {
      try {
        const cols = await getTableColumnsSet(table);
        if (!cols.has('id')) continue;
        const defType = table.replace('forms_', '').toUpperCase();

        const inspCol = cols.has('inspector_name')
          ? `COALESCE(NULLIF(TRIM(f.inspector_name), ''), NULLIF(TRIM(f.inspector), '')${cols.has('created_by') ? ", NULLIF(TRIM(f.created_by), '')" : ''})`
          : cols.has('inspector')
            ? `COALESCE(NULLIF(TRIM(f.inspector), '')${cols.has('created_by') ? ", NULLIF(TRIM(f.created_by), '')" : ''})`
            : cols.has('created_by')
              ? `NULLIF(TRIM(f.created_by), '')`
              : `NULL::text`;

        const inspectedExpr = cols.has('inspected_qty') && cols.has('qty_total')
          ? `COALESCE(f.inspected_qty::numeric, f.qty_total::numeric)`
          : cols.has('inspected_qty') ? `f.inspected_qty::numeric` : `NULL::numeric`;
        const passedExpr = cols.has('passed_qty') && cols.has('qty_pass')
          ? `COALESCE(f.passed_qty::numeric, f.qty_pass::numeric)`
          : cols.has('passed_qty') ? `f.passed_qty::numeric` : `NULL::numeric`;
        const failedExpr = cols.has('failed_qty') && cols.has('qty_fail')
          ? `COALESCE(f.failed_qty::numeric, f.qty_fail::numeric)`
          : cols.has('failed_qty') ? `f.failed_qty::numeric` : `NULL::numeric`;

        const createdExpr = cols.has('created_at')
          ? `CASE WHEN f.created_at::text ~ '^[0-9]+$' THEN (CASE WHEN f.created_at::text::bigint > 100000000000 THEN f.created_at::text::bigint / 1000 ELSE f.created_at::text::bigint END) ELSE EXTRACT(EPOCH FROM NOW())::bigint END`
          : `EXTRACT(EPOCH FROM NOW())::bigint`;
        const updatedExpr = cols.has('updated_at')
          ? `CASE WHEN f.updated_at::text ~ '^[0-9]+$' THEN (CASE WHEN f.updated_at::text::bigint > 100000000000 THEN f.updated_at::text::bigint / 1000 ELSE f.updated_at::text::bigint END) ELSE EXTRACT(EPOCH FROM NOW())::bigint END`
          : `EXTRACT(EPOCH FROM NOW())::bigint`;
        const dateDisplayExpr = cols.has('date')
          ? `CASE WHEN f.date::text ~ '^[0-9]+$' THEN TO_CHAR(TO_TIMESTAMP(CASE WHEN f.date::text::bigint > 100000000000 THEN f.date::text::bigint / 1000 ELSE f.date::text::bigint END) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') ELSE NULLIF(TRIM(f.date::text), '') END`
          : `NULL::text`;

        const sqlBulk = `
          WITH base AS (
            SELECT
              f.id AS inspection_id,
              UPPER(COALESCE(NULLIF(TRIM(f.type), ''), '${defType}')) AS inspection_type,
              COALESCE(NULLIF(TRIM(f.status), ''), 'DRAFT') AS status,
              NULLIF(TRIM(f.ma_ct), '') AS ma_ct,
              NULLIF(TRIM(f.ten_ct), '') AS ten_ct,
              ${cols.has('headcode') ? `NULLIF(TRIM(f.headcode), '')` : `NULL::text`} AS headcode,
              ${
                cols.has('ma_nha_may')
                  ? `CASE
                      WHEN COALESCE(TRIM(f.ma_nha_may), '') = '' THEN NULL
                      WHEN ${cols.has('supplier') ? `COALESCE(TRIM(f.supplier), '') <> '' AND TRIM(f.ma_nha_may) = TRIM(f.supplier)` : 'FALSE'}
                        AND TRIM(f.ma_nha_may) !~ '^[0-9]{5,}$'
                        AND TRIM(f.ma_nha_may) !~* '^(FO|IPO)'
                      THEN NULL
                      ELSE TRIM(f.ma_nha_may)
                    END`
                  : `NULL::text`
              } AS valid_ma_nm,
              ${cols.has('po_number') ? `NULLIF(TRIM(f.po_number), '')` : `NULL::text`} AS po_number,
              NULLIF(TRIM(f.ten_hang_muc), '') AS ten_hang_muc,
              ${cols.has('workshop') ? `NULLIF(TRIM(f.workshop), '')` : `NULL::text`} AS workshop,
              ${cols.has('supplier') ? `NULLIF(TRIM(f.supplier), '')` : `NULL::text`} AS supplier,
              ${inspCol} AS inspector_name,
              ${dateDisplayExpr} AS inspection_date,
              ${cols.has('score') ? `f.score::numeric` : `NULL::numeric`} AS score,
              ${inspectedExpr} AS inspected_qty,
              ${passedExpr} AS passed_qty,
              ${failedExpr} AS failed_qty,
              ${cols.has('summary') ? `NULLIF(TRIM(f.summary), '')` : `NULL::text`} AS summary,
              ${createdExpr} AS created_at,
              ${updatedExpr} AS updated_at
            FROM ${SCHEMA}."${table}" f
            WHERE ${cols.has('deleted_at') ? 'f.deleted_at IS NULL AND' : ''} UPPER(COALESCE(f.status, '')) <> 'DELETED'
          ),
          expanded AS (
            SELECT b.*, 'IPO'::text AS code_type, TRIM(tok) AS code_value
            FROM base b
            CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(
              COALESCE(b.valid_ma_nm, '') || ',' || COALESCE(b.headcode, ''),
              E'[,;\\n|]+'
            ) AS tok
            UNION ALL
            SELECT b.*, 'PO'::text AS code_type, TRIM(tok) AS code_value
            FROM base b
            CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(COALESCE(b.po_number, ''), E'[,;\\n|]+') AS tok
          ),
          normalized AS (
            SELECT *,
              REGEXP_REPLACE(UPPER(code_value), '[^A-Z0-9]', '', 'g') AS code_norm
            FROM expanded
            WHERE LENGTH(TRIM(code_value)) >= 3
              AND LOWER(TRIM(code_value)) NOT IN ('---', 'n/a', 'na', 'null', 'undefined')
          )
          INSERT INTO ${SCHEMA}.inspection_traceability_index (
            id, inspection_id, code_type, code_value, code_norm,
            inspection_type, status, ma_ct, ten_ct, ma_nha_may, headcode,
            po_number, pr_number, ten_hang_muc, workshop, supplier,
            inspector_name, inspection_date, score, inspected_qty, passed_qty, failed_qty,
            summary, booking_id, booking_code, created_at, updated_at, deleted_at
          )
          SELECT DISTINCT ON (n.inspection_id, n.code_type, n.code_norm)
            n.inspection_id || '::' || n.code_type || '::' || n.code_norm AS id,
            n.inspection_id,
            n.code_type,
            n.code_value,
            n.code_norm,
            n.inspection_type,
            n.status,
            n.ma_ct,
            n.ten_ct,
            COALESCE(n.valid_ma_nm, n.headcode) AS ma_nha_may,
            COALESCE(n.headcode, n.valid_ma_nm) AS headcode,
            n.po_number,
            NULL::text AS pr_number,
            n.ten_hang_muc,
            n.workshop,
            n.supplier,
            n.inspector_name,
            n.inspection_date,
            n.score,
            n.inspected_qty,
            n.passed_qty,
            n.failed_qty,
            n.summary,
            NULL::text AS booking_id,
            NULL::text AS booking_code,
            n.created_at,
            n.updated_at,
            NULL::bigint AS deleted_at
          FROM normalized n
          WHERE LENGTH(n.code_norm) >= 3
          ON CONFLICT (id) DO NOTHING
        `;

        const insRes = await query(sqlBulk);
        totalInserted += insRes.rowCount || 0;

        // Step 2: Lightweight JS pass ONLY for rows containing materials_json or pr_number in data (usually < 4,000 rows total)
        if (cols.has('materials_json') || cols.has('data')) {
          const matRows = await query(
            `SELECT id, type, status, ma_ct, ten_ct,
                    ${cols.has('ma_nha_may') ? 'ma_nha_may' : 'NULL::text AS ma_nha_may'},
                    ${cols.has('headcode') ? 'headcode' : 'NULL::text AS headcode'},
                    ${cols.has('po_number') ? 'po_number' : 'NULL::text AS po_number'},
                    ten_hang_muc,
                    ${cols.has('workshop') ? 'workshop' : 'NULL::text AS workshop'},
                    ${cols.has('supplier') ? 'supplier' : 'NULL::text AS supplier'},
                    ${cols.has('inspector') ? 'inspector' : 'NULL::text AS inspector'},
                    date, score,
                    ${cols.has('inspected_qty') ? 'inspected_qty' : 'NULL::numeric AS inspected_qty'},
                    ${cols.has('passed_qty') ? 'passed_qty' : 'NULL::numeric AS passed_qty'},
                    ${cols.has('failed_qty') ? 'failed_qty' : 'NULL::numeric AS failed_qty'},
                    ${cols.has('summary') ? 'summary' : 'NULL::text AS summary'},
                    created_at, updated_at,
                    ${cols.has('materials_json') ? 'materials_json' : 'NULL::text AS materials_json'},
                    ${cols.has('data') ? `substring(data from '"pr_?[nN]umber"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS pr_json,
                    ${cols.has('data') ? `substring(data from '"booking_?[cC]ode"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS b_code,
                    ${cols.has('data') ? `substring(data from '"booking_?[iI]d"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS b_id
             FROM ${SCHEMA}."${table}"
             WHERE ${cols.has('deleted_at') ? 'deleted_at IS NULL AND' : ''} UPPER(COALESCE(status, '')) <> 'DELETED'
               AND (
                 ${cols.has('materials_json') ? `LENGTH(COALESCE(materials_json, '')) > 5` : 'FALSE'}
                 OR ${cols.has('data') ? `COALESCE(data, '') ~* '"(pr_?number|booking_?id|booking_?code)"'` : 'FALSE'}
               )`
          );

          const bulkRows: any[][] = [];
          const nowTs = Math.floor(Date.now() / 1000);
          for (const r of matRows.rows) {
            const enriched = {
              ...r,
              type: r.type || defType,
              pr_number: r.pr_json || undefined,
              booking_id: r.b_id || undefined,
              booking_code: r.b_code || undefined,
            };
            const keys = extractStrictTraceKeys(enriched);
            if (keys.length === 0) continue;

            const createdAt = parseUnixSec(r.created_at ?? r.date) ?? nowTs;
            const updatedAt = parseUnixSec(r.updated_at) ?? nowTs;
            const firstIpo = keys.find((k) => k.codeType === 'IPO')?.codeValue || null;
            const firstPo = keys.find((k) => k.codeType === 'PO')?.codeValue || null;
            const firstPr = keys.find((k) => k.codeType === 'PR')?.codeValue || null;

            for (const k of keys) {
              bulkRows.push([
                `${r.id}::${k.codeType}::${k.codeNorm}`,
                r.id,
                k.codeType,
                k.codeValue,
                k.codeNorm,
                String(enriched.type).toUpperCase(),
                String(r.status || 'DRAFT'),
                r.ma_ct || null,
                r.ten_ct || null,
                firstIpo,
                String(r.headcode || '').trim() || firstIpo,
                String(r.po_number || '').trim() || firstPo,
                String(enriched.pr_number || '').trim() || firstPr,
                r.ten_hang_muc || null,
                r.workshop || null,
                r.supplier || null,
                String(r.inspector || '').trim() || null,
                formatDisplayDateServer(r.date, createdAt),
                r.score !== null && r.score !== undefined ? Number(r.score) : null,
                r.inspected_qty !== null && r.inspected_qty !== undefined ? Number(r.inspected_qty) : null,
                r.passed_qty !== null && r.passed_qty !== undefined ? Number(r.passed_qty) : null,
                r.failed_qty !== null && r.failed_qty !== undefined ? Number(r.failed_qty) : null,
                r.summary || null,
                enriched.booking_id || null,
                enriched.booking_code || null,
                createdAt,
                updatedAt,
              ]);
            }
          }
          await flushIndexRowsBulk(bulkRows);
          totalInserted += bulkRows.length;
        }
      } catch (tblErr: any) {
        console.warn(`[TraceabilityIndex] SQL backfill warning (${table}):`, tblErr?.message);
      }
    }

    // Step 3: Fast native SQL bulk INSERT for any remaining summary-only rows in `inspections`
    try {
      const sumRes = await query(`
        WITH base AS (
          SELECT
            i.id AS inspection_id,
            UPPER(COALESCE(NULLIF(TRIM(i.type), ''), 'PQC')) AS inspection_type,
            COALESCE(NULLIF(TRIM(i.status), ''), 'DRAFT') AS status,
            NULLIF(TRIM(i.ma_ct), '') AS ma_ct,
            NULLIF(TRIM(i.ten_ct), '') AS ten_ct,
            NULLIF(TRIM(i.headcode), '') AS headcode,
            CASE
              WHEN COALESCE(TRIM(i.ma_nha_may), '') = '' THEN NULL
              WHEN TRIM(i.ma_nha_may) !~ '^[0-9]{5,}$'
                AND TRIM(i.ma_nha_may) !~* '^(FO|IPO)'
                AND TRIM(i.ma_nha_may) ~ '[[:space:]]'
              THEN NULL
              ELSE TRIM(i.ma_nha_may)
            END AS valid_ma_nm,
            NULLIF(TRIM(i.po_number), '') AS po_number,
            NULLIF(TRIM(i.ten_hang_muc), '') AS ten_hang_muc,
            NULLIF(TRIM(i.workshop), '') AS workshop,
            NULLIF(TRIM(i.created_by), '') AS inspector_name,
            CASE
              WHEN i.date IS NOT NULL AND i.date > 0
              THEN TO_CHAR(TO_TIMESTAMP(CASE WHEN i.date > 100000000000 THEN i.date / 1000 ELSE i.date END) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
              ELSE NULL
            END AS inspection_date,
            i.score::numeric AS score,
            i.inspected_qty::numeric AS inspected_qty,
            i.passed_qty::numeric AS passed_qty,
            i.failed_qty::numeric AS failed_qty,
            COALESCE(i.created_at, EXTRACT(EPOCH FROM NOW())::bigint) AS created_at,
            COALESCE(i.updated_at, EXTRACT(EPOCH FROM NOW())::bigint) AS updated_at
          FROM ${SCHEMA}.inspections i
          WHERE UPPER(COALESCE(i.status, '')) <> 'DELETED'
            AND NOT EXISTS (
              SELECT 1 FROM ${SCHEMA}.inspection_traceability_index t
              WHERE t.inspection_id = i.id
            )
        ),
        expanded AS (
          SELECT b.*, 'IPO'::text AS code_type, TRIM(tok) AS code_value
          FROM base b
          CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(
            COALESCE(b.valid_ma_nm, '') || ',' || COALESCE(b.headcode, ''),
            E'[,;\\n|]+'
          ) AS tok
          UNION ALL
          SELECT b.*, 'PO'::text AS code_type, TRIM(tok) AS code_value
          FROM base b
          CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(COALESCE(b.po_number, ''), E'[,;\\n|]+') AS tok
        ),
        normalized AS (
          SELECT *,
            REGEXP_REPLACE(UPPER(code_value), '[^A-Z0-9]', '', 'g') AS code_norm
          FROM expanded
          WHERE LENGTH(TRIM(code_value)) >= 3
            AND LOWER(TRIM(code_value)) NOT IN ('---', 'n/a', 'na', 'null', 'undefined')
        )
        INSERT INTO ${SCHEMA}.inspection_traceability_index (
          id, inspection_id, code_type, code_value, code_norm,
          inspection_type, status, ma_ct, ten_ct, ma_nha_may, headcode,
          po_number, pr_number, ten_hang_muc, workshop, supplier,
          inspector_name, inspection_date, score, inspected_qty, passed_qty, failed_qty,
          summary, booking_id, booking_code, created_at, updated_at, deleted_at
        )
        SELECT DISTINCT ON (n.inspection_id, n.code_type, n.code_norm)
          n.inspection_id || '::' || n.code_type || '::' || n.code_norm AS id,
          n.inspection_id,
          n.code_type,
          n.code_value,
          n.code_norm,
          n.inspection_type,
          n.status,
          n.ma_ct,
          n.ten_ct,
          COALESCE(n.valid_ma_nm, n.headcode) AS ma_nha_may,
          COALESCE(n.headcode, n.valid_ma_nm) AS headcode,
          n.po_number,
          NULL::text AS pr_number,
          n.ten_hang_muc,
          n.workshop,
          NULL::text AS supplier,
          n.inspector_name,
          n.inspection_date,
          n.score,
          n.inspected_qty,
          n.passed_qty,
          n.failed_qty,
          NULL::text AS summary,
          NULL::text AS booking_id,
          NULL::text AS booking_code,
          n.created_at,
          n.updated_at,
          NULL::bigint AS deleted_at
        FROM normalized n
        WHERE LENGTH(n.code_norm) >= 3
        ON CONFLICT (id) DO NOTHING
      `);
      totalInserted += sumRes.rowCount || 0;
    } catch (sumErr: any) {
      console.warn('[TraceabilityIndex] Summary backfill warning:', sumErr?.message);
    }

    return totalInserted;
  })().finally(() => {
    backfillPromise = null;
  });

  return backfillPromise;
}
