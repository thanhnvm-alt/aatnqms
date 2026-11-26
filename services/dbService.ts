import crypto from 'crypto';
import { query } from '../lib/db.js';
import { writeAuditLog } from './dbModuleService.js';
import { assertNoNewBase64DataUri, stripTransientMediaUrlParams } from './storageService.js';
import {
  normalizeTraceCode,
  splitAndNormalizeTraceCodes,
  extractStrictTraceKeys,
  syncInspectionTraceabilityIndex,
} from './traceabilityIndexService.js';
import {
  splitPoTokens,
  collectBookingAllPoTokens,
  MAX_BOOKING_PO_TOKENS,
  MAX_BOOKING_PO_TOKEN_LEN,
} from '../src/utils/poTokens.js';
import {
  SubcontractorBooking,
  SubcontractorBookingItem,
  BookingSupplierMismatchWarning,
  Inspection,
  SubcontractorInspection,
  SubcontractorReinspectionCost,
  Supplier,
  NCR,
  RelatedSqcMatchReason,
  RelatedSqcReport,
  RelatedSqcResponse,
  RelatedSqcSummary,
  RelatedBookingSummary,
  RelatedBookingsResponse,
  TraceabilityMatchReason,
  TraceabilityInspectionItem,
  TraceabilityNcrItem,
  TraceabilityBookingItem,
  TraceabilityBundle
} from '../types.js';


const SCHEMA = '"appQAQC"';

export const MODULE_TABLES = ['iqc', 'sqc_vt', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site'];

const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object' && jsonString !== null) return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    return defaultValue;
  }
};

function splitBookingPoTokens(poNumber?: string | string[] | null): string[] {
  return splitPoTokens(poNumber, { minLength: 3 });
}

function collectBookingPrTokens(booking: { prNumber?: string; items?: any[] }): string[] {
  const out: string[] = [];
  if (booking.prNumber && String(booking.prNumber).trim().length >= 3) {
    out.push(...splitPoTokens(booking.prNumber, { minLength: 3 }));
  }
  for (const it of Array.isArray(booking.items) ? booking.items : []) {
    const prVal = String(it?.prNumber || it?.pr_number || '').trim();
    if (prVal.length >= 3) {
      out.push(...splitPoTokens(prVal, { minLength: 3 }));
    }
  }
  return Array.from(new Set(out));
}

function sanitizeBookingItemsAndPo(
  rawItems: any,
  rawPoNumber?: string | null,
  rawPoNumbers?: string[] | null
): {
  sanitizedItems: SubcontractorBookingItem[];
  poTokens: string[];
  normalizedPoNumber: string;
} {
  const parsedItems = Array.isArray(rawItems)
    ? rawItems
    : safeJsonParse<any[]>(rawItems, []);

  const sanitizedItems: SubcontractorBookingItem[] = (Array.isArray(parsedItems) ? parsedItems : [])
    .slice(0, 200)
    .map((it: any, idx: number) => {
      const itemPo = splitPoTokens([it?.poNumber, it?.po_number], { minLength: 2, maxTokens: 10 }).join(', ');
      const itemPr = splitPoTokens([it?.prNumber, it?.pr_number], { minLength: 2, maxTokens: 10 }).join(', ');
      const itemSupplier = String(it?.supplierName || '').trim().slice(0, 200);
      return {
        id: String(it?.id || idx + 1).slice(0, 64),
        itemName: String(it?.itemName || '').trim().slice(0, 500),
        quantity: Number.isFinite(Number(it?.quantity)) && Number(it?.quantity) > 0 ? Number(it.quantity) : 1,
        unit: String(it?.unit || 'Bộ').trim().slice(0, 40) || 'Bộ',
        specifications: String(it?.specifications || '').trim().slice(0, 1000),
        isInspected: it?.isInspected !== false,
        ...(itemPo ? { poNumber: itemPo.slice(0, MAX_BOOKING_PO_TOKEN_LEN * 2) } : {}),
        ...(itemPr ? { prNumber: itemPr.slice(0, MAX_BOOKING_PO_TOKEN_LEN * 2) } : {}),
        ...(itemSupplier ? { supplierName: itemSupplier } : {}),
      };
    });

  const poTokens = collectBookingAllPoTokens({
    poNumber: rawPoNumber,
    poNumbers: Array.isArray(rawPoNumbers) ? rawPoNumbers : undefined,
    items: sanitizedItems,
  }).slice(0, MAX_BOOKING_PO_TOKENS);

  const normalizedPoNumber = poTokens.join(', ') || String(rawPoNumber || '').trim();
  return { sanitizedItems, poTokens, normalizedPoNumber };
}

function sanitizeSupplierMismatchWarnings(rawWarnings: any): BookingSupplierMismatchWarning[] | undefined {
  if (!Array.isArray(rawWarnings) || rawWarnings.length === 0) return undefined;
  const cleaned = rawWarnings
    .slice(0, 50)
    .map((w: any) => ({
      poNumber: String(w?.poNumber || '').trim().slice(0, MAX_BOOKING_PO_TOKEN_LEN),
      expectedSupplier: String(w?.expectedSupplier || '').trim().slice(0, 200),
      currentSupplier: String(w?.currentSupplier || '').trim().slice(0, 200),
    }))
    .filter((w) => w.poNumber && w.expectedSupplier && w.currentSupplier);
  return cleaned.length > 0 ? cleaned : undefined;
}

interface BookingSyncCandidate {
  id: string;
  bookingCode: string;
  poNumber: string;
  prNumber?: string;
  requestedDate?: number;
  status: string;
  requesterId?: string;
  sqcResult?: 'PASS' | 'FAIL';
  lastSqcId?: string;
  lastSqcStatus?: string;
  rejectedAt?: number;
  rejectionReason?: string;
  manualStatusOverride?: boolean;
  manualOverrideAt?: number;
  items?: any[];
}

interface EvaluatedBookingSync {
  id: string;
  bookingCode: string;
  poNumber: string;
  oldStatus: string;
  newStatus: SubcontractorBooking['status'];
  newSqcResult?: 'PASS' | 'FAIL';
  lastSqcId?: string;
  lastSqcStatus?: string;
  rejectionReason?: string;
  requesterId?: string;
  clearManualOverride?: boolean;
  needsUpdate: boolean;
  transitionType: 'COMPLETE' | 'FAIL' | 'IN_PROGRESS' | 'NONE';
}

function evaluateBookingSyncFromSqc(
  booking: BookingSyncCandidate,
  sqcRows: SqcLightRow[],
  bridge: ErpPoPrBridge,
  subInspRows: any[]
): { evaluated: EvaluatedBookingSync; summary: RelatedSqcSummary } {
  const summary = buildRelatedSqcSummaryForBooking(booking, sqcRows, bridge);
  const bStatus = String(booking.status || '').toUpperCase() as SubcontractorBooking['status'];

  const noChange: EvaluatedBookingSync = {
    id: booking.id,
    bookingCode: booking.bookingCode,
    poNumber: booking.poNumber,
    oldStatus: bStatus,
    newStatus: bStatus,
    newSqcResult: booking.sqcResult,
    lastSqcId: booking.lastSqcId,
    lastSqcStatus: booking.lastSqcStatus,
    rejectionReason: booking.rejectionReason,
    requesterId: booking.requesterId,
    needsUpdate: false,
    transitionType: 'NONE',
  };

  if (bStatus === 'CANCELLED') {
    return { evaluated: noChange, summary };
  }

  const { reports } = matchBookingAgainstSqcRows(booking, sqcRows, bridge);
  const ownReports = filterStrictReportsForBooking(booking, reports);

  const bCodeLower = String(booking.bookingCode || '').trim().toLowerCase();
  const isManualOverrideActive = Boolean(booking.manualStatusOverride);
  const manualAt = Number(booking.manualOverrideAt || 0);

  // If this booking was manually assigned PASS/FAIL, preserve manual status across reloads & auto-reconcile
  // until a NEW SQC report is explicitly linked to this booking after the manual override timestamp.
  const effectiveOwnReports = isManualOverrideActive
    ? ownReports.filter((s) => {
        const explicitlyLinked = Boolean(
          (s.bookingId && s.bookingId === booking.id) ||
          (s.bookingCode && bCodeLower && String(s.bookingCode).trim().toLowerCase() === bCodeLower)
        );
        if (!explicitlyLinked) return false;
        const ts = Number(s.updatedAt || s.createdAt || 0);
        return ts > manualAt;
      })
    : ownReports;

  const matchingSub = subInspRows.filter((si: any) => {
    const linked =
      (si.booking_id && si.booking_id === booking.id) ||
      (si.booking_code && bCodeLower && String(si.booking_code).toLowerCase() === bCodeLower);
    if (!linked) return false;
    if (!isManualOverrideActive) return true;
    const subTs = parseUnixSeconds(si?.created_at) || 0;
    return subTs > manualAt;
  });

  if (isManualOverrideActive && effectiveOwnReports.length === 0 && matchingSub.length === 0) {
    return { evaluated: noChange, summary };
  }

  const reportedPassEligibleStatuses = new Set(['PENDING', 'SUBMITTED', 'COMPLETED', 'APPROVED', 'VERIFIED', 'PASSED', 'PASS', 'CLOSED', 'LOCKED']);
  const failStatuses = new Set(['REJECTED', 'FAILED', 'FLAGGED', 'REJECT']);

  const latestReportedSqc = effectiveOwnReports.find((s) => {
    const st = String(s.status || '').toUpperCase();
    return reportedPassEligibleStatuses.has(st) || failStatuses.has(st);
  });

  const latestDraftSqc = !latestReportedSqc
    ? effectiveOwnReports.find((s) => String(s.status || '').toUpperCase() === 'DRAFT')
    : undefined;

  let targetOutcome: 'PASS' | 'FAIL' | 'DRAFT' | null = null;
  let latestSqcId: string | undefined;
  let latestSqcStatus: string | undefined;
  let latestSqcTs = 0;

  if (latestReportedSqc) {
    const st = String(latestReportedSqc.status || '').toUpperCase();
    latestSqcId = latestReportedSqc.id;
    latestSqcStatus = st;
    latestSqcTs = latestReportedSqc.updatedAt || latestReportedSqc.createdAt || parseUnixSeconds(latestReportedSqc.date) || 0;
    if (
      failStatuses.has(st) ||
      Number(latestReportedSqc.failedQuantity || 0) > 0 ||
      Boolean(latestReportedSqc.hasJsonFail)
    ) {
      targetOutcome = 'FAIL';
    } else {
      targetOutcome = 'PASS';
    }
  } else if (latestDraftSqc) {
    targetOutcome = 'DRAFT';
    latestSqcId = latestDraftSqc.id;
    latestSqcStatus = String(latestDraftSqc.status || 'DRAFT').toUpperCase();
    latestSqcTs = latestDraftSqc.updatedAt || latestDraftSqc.createdAt || parseUnixSeconds(latestDraftSqc.date) || 0;
  } else if (matchingSub.length > 0) {
    const latestSubRes = String(matchingSub[0]?.inspection_result || '').toUpperCase();
    latestSqcTs = parseUnixSeconds(matchingSub[0]?.created_at) || 0;
    if (latestSubRes === 'REJECT') targetOutcome = 'FAIL';
    else if (['PASS', 'CONDITIONAL_PASS'].includes(latestSubRes)) targetOutcome = 'PASS';
  }

  if (!targetOutcome) {
    return { evaluated: noChange, summary };
  }

  // Guard: If QC Lead manually returned booking for supplement *after* the SQC report timestamp, do not overwrite manual decision
  const isManualSupplementReturn = bStatus === 'RETURNED_FOR_SUPPLEMENT' && booking.sqcResult !== 'FAIL';
  if (isManualSupplementReturn && booking.rejectedAt && latestSqcTs && booking.rejectedAt > latestSqcTs) {
    return { evaluated: noChange, summary };
  }

  if (targetOutcome === 'PASS') {
    const needsUpdate =
      isManualOverrideActive ||
      bStatus !== 'COMPLETED' ||
      booking.sqcResult !== 'PASS' ||
      Boolean(latestSqcId && booking.lastSqcId !== latestSqcId);
    return {
      evaluated: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        poNumber: booking.poNumber,
        oldStatus: bStatus,
        newStatus: 'COMPLETED',
        newSqcResult: 'PASS',
        lastSqcId: latestSqcId || booking.lastSqcId,
        lastSqcStatus: latestSqcStatus || booking.lastSqcStatus,
        rejectionReason: '',
        requesterId: booking.requesterId,
        clearManualOverride: isManualOverrideActive,
        needsUpdate,
        transitionType: needsUpdate ? 'COMPLETE' : 'NONE',
      },
      summary,
    };
  }

  if (targetOutcome === 'FAIL') {
    const needsUpdate =
      isManualOverrideActive ||
      bStatus !== 'RETURNED_FOR_SUPPLEMENT' ||
      booking.sqcResult !== 'FAIL' ||
      Boolean(latestSqcId && booking.lastSqcId !== latestSqcId);
    const defaultFailReason = 'Kết quả nghiệm thu SQC: KHÔNG ĐẠT / FAIL (Yêu cầu kiểm lại)';
    return {
      evaluated: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        poNumber: booking.poNumber,
        oldStatus: bStatus,
        newStatus: 'RETURNED_FOR_SUPPLEMENT',
        newSqcResult: 'FAIL',
        lastSqcId: latestSqcId || booking.lastSqcId,
        lastSqcStatus: latestSqcStatus || booking.lastSqcStatus,
        rejectionReason: booking.rejectionReason || defaultFailReason,
        requesterId: booking.requesterId,
        clearManualOverride: isManualOverrideActive,
        needsUpdate,
        transitionType: needsUpdate ? 'FAIL' : 'NONE',
      },
      summary,
    };
  }

  // DRAFT SQC exists and booking is still PENDING, ASSIGNED, or superseded manual override -> IN_PROGRESS
  if (
    targetOutcome === 'DRAFT' &&
    (isManualOverrideActive || bStatus === 'PENDING' || bStatus === 'ASSIGNED')
  ) {
    return {
      evaluated: {
        id: booking.id,
        bookingCode: booking.bookingCode,
        poNumber: booking.poNumber,
        oldStatus: bStatus,
        newStatus: 'IN_PROGRESS',
        newSqcResult: booking.sqcResult,
        lastSqcId: latestSqcId || booking.lastSqcId,
        lastSqcStatus: latestSqcStatus || booking.lastSqcStatus,
        rejectionReason: booking.rejectionReason,
        requesterId: booking.requesterId,
        clearManualOverride: isManualOverrideActive,
        needsUpdate: true,
        transitionType: 'IN_PROGRESS',
      },
      summary,
    };
  }

  return { evaluated: noChange, summary };
}

async function persistEvaluatedBookingUpdates(
  updates: EvaluatedBookingSync[],
  mode: 'AUTO_LOAD' | 'MANUAL_RECONCILE'
) {
  const nowTs = Math.floor(Date.now() / 1000);
  const toPersist = updates.filter(u => u.needsUpdate);

  for (const item of toPersist) {
    const patchPayload: Record<string, any> = {
      ...(item.newSqcResult ? { sqcResult: item.newSqcResult } : {}),
      ...(item.lastSqcId ? { lastSqcId: item.lastSqcId } : {}),
      ...(item.lastSqcStatus ? { lastSqcStatus: item.lastSqcStatus } : {}),
      lastSqcUpdatedAt: nowTs,
      ...(item.clearManualOverride ? { manualStatusOverride: false, manualClearedAt: nowTs } : {}),
    };

    if (item.newStatus === 'COMPLETED') {
      patchPayload.rejectionReason = '';
    } else if (item.newStatus === 'RETURNED_FOR_SUPPLEMENT' && item.newSqcResult === 'FAIL') {
      patchPayload.rejectionReason =
        item.rejectionReason || 'Kết quả nghiệm thu SQC: KHÔNG ĐẠT / FAIL (Yêu cầu kiểm lại)';
    }

    await query(
      `UPDATE ${SCHEMA}.subcontractor_bookings
       SET status = $1,
           version = COALESCE(version, 1) + 1,
           updated_at = $2,
           data = COALESCE(data, '{}'::jsonb) || $3::jsonb
       WHERE id = $4 AND deleted_at IS NULL`,
      [item.newStatus, nowTs, JSON.stringify(patchPayload), item.id]
    );

    const auditAction =
      mode === 'AUTO_LOAD'
        ? 'AUTO_SYNC_BOOKING_FROM_SQC'
        : item.transitionType === 'COMPLETE'
          ? 'RECONCILE_COMPLETE_BOOKING'
          : item.transitionType === 'FAIL'
            ? 'RECONCILE_RETURN_BOOKING'
            : 'RECONCILE_PROGRESS_BOOKING';

    await writeAuditLog({
      userId: mode === 'AUTO_LOAD' ? 'system-auto-audit' : 'system-reconcile',
      action: auditAction,
      entityType: 'subcontractor_booking',
      entityId: item.id,
      oldValue: { status: item.oldStatus },
      newValue: {
        status: item.newStatus,
        sqc_result: item.newSqcResult || null,
        last_sqc_id: item.lastSqcId || null,
        booking_code: item.bookingCode,
        po_number: item.poNumber,
      },
    });

    if (
      mode === 'MANUAL_RECONCILE' &&
      item.transitionType === 'FAIL' &&
      item.oldStatus !== 'RETURNED_FOR_SUPPLEMENT' &&
      item.requesterId
    ) {
      createNotificationRecord({
        userId: item.requesterId,
        type: 'ALERT',
        title: `⚠️ Đã nghiệm thu (FAIL) - Cần kiểm lại: ${item.bookingCode}`,
        message: `PO: ${item.poNumber || '---'} | Kết quả nghiệm thu SQC: KHÔNG ĐẠT (Yêu cầu kiểm lại)`,
        link: { view: 'SUBCONTRACTOR_BOOKING', id: item.id },
        data: { link: { view: 'SUBCONTRACTOR_BOOKING', id: item.id } },
      }).catch(() => {});
    }
  }
}

export async function reconcileSubcontractorBookings() {
  try {
    const [bookingsRes, sqcRows, subInspRes] = await Promise.all([
      query(`
        SELECT id, booking_code, po_number, requested_date, status, requester_id, items_json, data
        FROM ${SCHEMA}.subcontractor_bookings
        WHERE deleted_at IS NULL AND UPPER(COALESCE(status, '')) <> 'CANCELLED'
      `),
      fetchAllSqcLightSummaries(),
      query(`
        SELECT booking_id, booking_code, inspection_result, created_at
        FROM ${SCHEMA}.subcontractor_inspections
        ORDER BY created_at DESC
      `).catch(() => ({ rows: [] as any[] })),
    ]);

    const candidates: BookingSyncCandidate[] = bookingsRes.rows.map((row: any) => {
      const bExtra = safeJsonParse(row.data, {}) as any;
      return {
        id: row.id,
        bookingCode: row.booking_code,
        poNumber: row.po_number || '',
        prNumber: bExtra?.prNumber || bExtra?.pr_number || undefined,
        requestedDate: parseInt(row.requested_date || '0', 10) || 0,
        status: String(row.status || ''),
        requesterId: row.requester_id || undefined,
        sqcResult: bExtra?.sqcResult === 'PASS' || bExtra?.sqcResult === 'FAIL' ? bExtra.sqcResult : undefined,
        lastSqcId: bExtra?.lastSqcId || undefined,
        lastSqcStatus: bExtra?.lastSqcStatus || undefined,
        rejectedAt: bExtra?.rejectedAt ? parseInt(bExtra.rejectedAt, 10) : undefined,
        rejectionReason: bExtra?.rejectionReason || undefined,
        manualStatusOverride: Boolean(bExtra?.manualStatusOverride),
        manualOverrideAt: bExtra?.manualOverrideAt ? parseInt(bExtra.manualOverrideAt, 10) : undefined,
        items: safeJsonParse(row.items_json, []),
      };
    });

    const allPoTokens = Array.from(new Set(candidates.flatMap(c => splitBookingPoTokens(c.poNumber))));
    const allPrTokens = Array.from(new Set(candidates.flatMap(c => collectBookingPrTokens(c))));
    const bridge = await lookupErpPoPrBridge(allPoTokens, allPrTokens);

    const evaluations = candidates.map((c) => evaluateBookingSyncFromSqc(c, sqcRows, bridge, subInspRes.rows).evaluated);
    const updates = evaluations.filter(e => e.needsUpdate);

    await persistEvaluatedBookingUpdates(updates, 'MANUAL_RECONCILE');

    const completedBookings = updates.filter(u => u.transitionType === 'COMPLETE').map(u => ({
      id: u.id,
      booking_code: u.bookingCode,
      po_number: u.poNumber,
      old_status: u.oldStatus,
      last_sqc_id: u.lastSqcId,
      last_sqc_status: u.lastSqcStatus,
    }));
    const rejectedBookings = updates.filter(u => u.transitionType === 'FAIL').map(u => ({
      id: u.id,
      booking_code: u.bookingCode,
      po_number: u.poNumber,
      old_status: u.oldStatus,
      requester_id: u.requesterId,
      last_sqc_id: u.lastSqcId,
      last_sqc_status: u.lastSqcStatus,
    }));

    return {
      success: true,
      updatedCount: updates.length,
      completedCount: completedBookings.length,
      rejectedCount: rejectedBookings.length,
      completedBookings,
      rejectedBookings,
    };
  } catch (e: any) {
    console.error("Error reconciling subcontractor bookings:", e);
    return { success: false, updatedCount: 0, error: e.message };
  }
}

export async function getSubcontractorBookings(filters: any = {}) {
  let sql = `
    WITH batch_ranks AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(po_number))
          ORDER BY created_at ASC, id ASC
        )::INT AS batch_number,
        COUNT(*) OVER (
          PARTITION BY LOWER(TRIM(po_number))
        )::INT AS total_batches_for_po
      FROM ${SCHEMA}.subcontractor_bookings
      WHERE deleted_at IS NULL
        AND UPPER(COALESCE(status, '')) <> 'CANCELLED'
        AND TRIM(COALESCE(po_number, '')) <> ''
    )
    SELECT
      sb.id,
      sb.booking_code,
      sb.po_id,
      sb.po_number,
      sb.supplier_id,
      sb.supplier_name,
      sb.requester_id,
      sb.requester_name,
      sb.location_address,
      sb.contact_person,
      sb.contact_phone,
      sb.requested_date,
      sb.assigned_qc_id,
      sb.assigned_qc_name,
      sb.status,
      sb.notes,
      sb.sqc_type,
      sb.items_json,
      sb.documents_json,
      sb.data,
      sb.created_at,
      sb.updated_at,
      sb.version,
      br.batch_number,
      br.total_batches_for_po
    FROM ${SCHEMA}.subcontractor_bookings sb
    LEFT JOIN batch_ranks br ON br.id = sb.id
    WHERE sb.deleted_at IS NULL`;
  const params: any[] = [];
  let idx = 1;

  if (filters.status && filters.status !== 'ALL') {
    sql += ` AND sb.status = $${idx++}`;
    params.push(filters.status);
  }
  // [Update - Lịch Nghiệm Thu GCN] - [2026-11-14 / v3.1.0] - Lọc chính xác đơn phân công theo QC phụ trách
  if (filters.assignedQcId || filters.assigned_qc_id) {
    const qcId = String(filters.assignedQcId || filters.assigned_qc_id).trim();
    if (qcId) {
      if (filters.assignedQcName || filters.assigned_qc_name) {
        const qcName = String(filters.assignedQcName || filters.assigned_qc_name).trim();
        sql += ` AND (sb.assigned_qc_id = $${idx} OR sb.assigned_qc_name ILIKE $${idx + 1})`;
        params.push(qcId, `%${qcName}%`);
        idx += 2;
      } else {
        sql += ` AND sb.assigned_qc_id = $${idx++}`;
        params.push(qcId);
      }
    }
  } else if (filters.assignedQcName || filters.assigned_qc_name) {
    const qcName = String(filters.assignedQcName || filters.assigned_qc_name).trim();
    if (qcName) {
      sql += ` AND sb.assigned_qc_name ILIKE $${idx++}`;
      params.push(`%${qcName}%`);
    }
  }
  if (filters.search) {
    sql += ` AND (sb.booking_code ILIKE $${idx} OR sb.po_number ILIKE $${idx} OR sb.supplier_name ILIKE $${idx} OR sb.contact_person ILIKE $${idx} OR sb.items_json::text ILIKE $${idx})`;
    params.push(`%${filters.search}%`);
    idx++;
  }

  sql += ` ORDER BY sb.created_at DESC`;

  const [res, lightSqcRows, subInspRes] = await Promise.all([
    query(sql, params),
    fetchAllSqcLightSummaries().catch((err) => {
      console.warn("fetchAllSqcLightSummaries warning:", err);
      return [] as SqcLightRow[];
    }),
    query(`
      SELECT booking_id, booking_code, inspection_result, created_at
      FROM ${SCHEMA}.subcontractor_inspections
      ORDER BY created_at DESC
    `).catch(() => ({ rows: [] as any[] })),
  ]);

  const bookingPrExtras = new Map<string, string | undefined>();
  let bookings: SubcontractorBooking[] = res.rows.map((row: any): SubcontractorBooking => {
    const extraData = safeJsonParse(row.data, {}) as any;
    const prExtra = extraData.prNumber || extraData.pr_number || undefined;
    bookingPrExtras.set(row.id, prExtra);
    const parsedItems = safeJsonParse<SubcontractorBookingItem[]>(row.items_json, []);
    const poNumbers = collectBookingAllPoTokens({
      poNumber: row.po_number,
      poNumbers: Array.isArray(extraData.poNumbers) ? extraData.poNumbers : undefined,
      prNumber: prExtra,
      items: parsedItems,
    });
    const supplierMismatchWarnings = sanitizeSupplierMismatchWarnings(extraData.supplierMismatchWarnings);
    return {
      id: row.id,
      bookingCode: row.booking_code,
      poId: row.po_id,
      poNumber: row.po_number || poNumbers.join(', '),
      poNumbers,
      ...(supplierMismatchWarnings ? { supplierMismatchWarnings } : {}),
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      requesterId: row.requester_id,
      requesterName: row.requester_name || extraData.requesterName || 'Chuyên viên Mua hàng',
      locationAddress: row.location_address,
      contactPerson: row.contact_person,
      contactPhone: row.contact_phone,
      requestedDate: parseInt(row.requested_date || '0'),
      assignedQcId: row.assigned_qc_id,
      assignedQcName: row.assigned_qc_name,
      status: row.status,
      notes: row.notes,
      sqcType: row.sqc_type || extraData.sqcType || 'SQC_BTP',
      commodityLine: extraData.commodityLine || '',
      rejectionReason: extraData.rejectionReason || '',
      suggestedDate: extraData.suggestedDate ? parseInt(extraData.suggestedDate) : undefined,
      rejectedAt: extraData.rejectedAt ? parseInt(extraData.rejectedAt) : undefined,
      rejectedByName: extraData.rejectedByName || '',
      sqcResult: extraData.sqcResult === 'PASS' || extraData.sqcResult === 'FAIL' ? extraData.sqcResult : undefined,
      lastSqcId: extraData.lastSqcId || undefined,
      lastSqcStatus: extraData.lastSqcStatus || undefined,
      manualStatusOverride: Boolean(extraData.manualStatusOverride),
      manualOverrideResult: extraData.manualOverrideResult === 'PASS' || extraData.manualOverrideResult === 'FAIL' ? extraData.manualOverrideResult : undefined,
      manualOverrideReason: extraData.manualOverrideReason || undefined,
      manualOverrideById: extraData.manualOverrideById || undefined,
      manualOverrideByName: extraData.manualOverrideByName || undefined,
      manualOverrideAt: extraData.manualOverrideAt ? parseInt(extraData.manualOverrideAt, 10) : undefined,
      manualOverrideSqcRef: extraData.manualOverrideSqcRef || undefined,
      items: parsedItems,
      documents: safeJsonParse(row.documents_json, {
        materialSpecUrl: '',
        approvedSampleUrl: '',
        shopdrawingUrl: '',
        qualityAgreementUrl: ''
      }),
      createdAt: parseInt(row.created_at || '0'),
      updatedAt: parseInt(row.updated_at || '0'),
      version: row.version || 1,
      batchNumber: row.batch_number ? Number(row.batch_number) : undefined,
      totalBatchesForPo: row.total_batches_for_po ? Number(row.total_batches_for_po) : undefined,
    };
  });

  if (bookings.length > 0 && (lightSqcRows.length > 0 || subInspRes.rows.length > 0)) {
    const allBookingPoTokens = Array.from(new Set(
      bookings.flatMap(b => collectBookingAllPoTokens({ poNumber: b.poNumber, poNumbers: b.poNumbers, items: b.items }))
    ));
    const allBookingPrTokens = Array.from(new Set(
      bookings.flatMap(b => collectBookingPrTokens({ prNumber: bookingPrExtras.get(b.id), items: b.items }))
    ));
    const bridge = await lookupErpPoPrBridge(allBookingPoTokens, allBookingPrTokens);

    const pendingDbUpdates: EvaluatedBookingSync[] = [];
    const nowTs = Math.floor(Date.now() / 1000);

    for (const bk of bookings) {
      const { evaluated, summary } = evaluateBookingSyncFromSqc(
        {
          id: bk.id,
          bookingCode: bk.bookingCode,
          poNumber: bk.poNumber,
          prNumber: bookingPrExtras.get(bk.id),
          requestedDate: bk.requestedDate,
          status: bk.status,
          requesterId: bk.requesterId,
          sqcResult: bk.sqcResult,
          lastSqcId: bk.lastSqcId,
          lastSqcStatus: bk.lastSqcStatus,
          rejectedAt: bk.rejectedAt,
          rejectionReason: bk.rejectionReason,
          manualStatusOverride: bk.manualStatusOverride,
          manualOverrideAt: bk.manualOverrideAt,
          items: bk.items,
        },
        lightSqcRows,
        bridge,
        subInspRes.rows
      );
      bk.relatedSqcSummary = summary;

      if (evaluated.needsUpdate) {
        pendingDbUpdates.push(evaluated);
        bk.status = evaluated.newStatus;
        if (evaluated.newSqcResult) bk.sqcResult = evaluated.newSqcResult;
        if (evaluated.lastSqcId) bk.lastSqcId = evaluated.lastSqcId;
        if (evaluated.lastSqcStatus) bk.lastSqcStatus = evaluated.lastSqcStatus;
        if (evaluated.clearManualOverride) {
          bk.manualStatusOverride = false;
        }
        if (evaluated.newStatus === 'COMPLETED') {
          bk.rejectionReason = '';
        } else if (evaluated.rejectionReason) {
          bk.rejectionReason = evaluated.rejectionReason;
        }
        bk.version = (bk.version || 1) + 1;
        bk.updatedAt = nowTs;
      }
    }

    if (pendingDbUpdates.length > 0) {
      await persistEvaluatedBookingUpdates(pendingDbUpdates, 'AUTO_LOAD').catch((err) => {
        console.warn('Auto-audit sync bookings warning:', err);
      });
    }

    if (filters.status && filters.status !== 'ALL') {
      bookings = bookings.filter(b => b.status === filters.status);
    }
  } else {
    for (const bk of bookings) {
      bk.relatedSqcSummary = {
        totalCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        reportsPreview: []
      };
    }
  }

  return bookings;
}

export async function getSubcontractorBookingById(id: string): Promise<SubcontractorBooking | null> {
  const res = await query(
    `WITH batch_ranks AS (
       SELECT
         id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(po_number))
           ORDER BY created_at ASC, id ASC
         )::INT AS batch_number,
         COUNT(*) OVER (
           PARTITION BY LOWER(TRIM(po_number))
         )::INT AS total_batches_for_po
       FROM ${SCHEMA}.subcontractor_bookings
       WHERE deleted_at IS NULL
         AND UPPER(COALESCE(status, '')) <> 'CANCELLED'
         AND TRIM(COALESCE(po_number, '')) <> ''
     )
     SELECT
       sb.id,
       sb.booking_code,
       sb.po_id,
       sb.po_number,
       sb.supplier_id,
       sb.supplier_name,
       sb.requester_id,
       sb.requester_name,
       sb.location_address,
       sb.contact_person,
       sb.contact_phone,
       sb.requested_date,
       sb.assigned_qc_id,
       sb.assigned_qc_name,
       sb.status,
       sb.notes,
       sb.sqc_type,
       sb.items_json,
       sb.documents_json,
       sb.data,
       sb.created_at,
       sb.updated_at,
       sb.version,
       br.batch_number,
       br.total_batches_for_po
     FROM ${SCHEMA}.subcontractor_bookings sb
     LEFT JOIN batch_ranks br ON br.id = sb.id
     WHERE sb.deleted_at IS NULL AND (sb.id = $1 OR sb.booking_code = $1)`,
    [id]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const extraData = safeJsonParse(row.data, {}) as any;
  const parsedItems = safeJsonParse<SubcontractorBookingItem[]>(row.items_json, []);
  const poNumbers = collectBookingAllPoTokens({
    poNumber: row.po_number,
    poNumbers: Array.isArray(extraData.poNumbers) ? extraData.poNumbers : undefined,
    prNumber: extraData.prNumber || extraData.pr_number,
    items: parsedItems,
  });
  const supplierMismatchWarnings = sanitizeSupplierMismatchWarnings(extraData.supplierMismatchWarnings);
  return {
    id: row.id,
    bookingCode: row.booking_code,
    poId: row.po_id,
    poNumber: row.po_number || poNumbers.join(', '),
    poNumbers,
    ...(supplierMismatchWarnings ? { supplierMismatchWarnings } : {}),
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    requesterId: row.requester_id,
    requesterName: row.requester_name || extraData.requesterName || 'Chuyên viên Mua hàng',
    locationAddress: row.location_address,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    requestedDate: parseInt(row.requested_date || '0'),
    assignedQcId: row.assigned_qc_id,
    assignedQcName: row.assigned_qc_name,
    status: row.status,
    notes: row.notes,
    sqcType: row.sqc_type || extraData.sqcType || 'SQC_BTP',
    commodityLine: extraData.commodityLine || '',
    rejectionReason: extraData.rejectionReason || '',
    suggestedDate: extraData.suggestedDate ? parseInt(extraData.suggestedDate) : undefined,
    rejectedAt: extraData.rejectedAt ? parseInt(extraData.rejectedAt) : undefined,
    rejectedByName: extraData.rejectedByName || '',
    sqcResult: extraData.sqcResult === 'PASS' || extraData.sqcResult === 'FAIL' ? extraData.sqcResult : undefined,
    lastSqcId: extraData.lastSqcId || undefined,
    lastSqcStatus: extraData.lastSqcStatus || undefined,
    manualStatusOverride: Boolean(extraData.manualStatusOverride),
    manualOverrideResult: extraData.manualOverrideResult === 'PASS' || extraData.manualOverrideResult === 'FAIL' ? extraData.manualOverrideResult : undefined,
    manualOverrideReason: extraData.manualOverrideReason || undefined,
    manualOverrideById: extraData.manualOverrideById || undefined,
    manualOverrideByName: extraData.manualOverrideByName || undefined,
    manualOverrideAt: extraData.manualOverrideAt ? parseInt(extraData.manualOverrideAt, 10) : undefined,
    manualOverrideSqcRef: extraData.manualOverrideSqcRef || undefined,
    items: parsedItems,
    documents: safeJsonParse(row.documents_json, {
      materialSpecUrl: '',
      approvedSampleUrl: '',
      shopdrawingUrl: '',
      qualityAgreementUrl: ''
    }),
    createdAt: parseInt(row.created_at || '0'),
    updatedAt: parseInt(row.updated_at || '0'),
    version: row.version || 1,
    batchNumber: row.batch_number ? Number(row.batch_number) : undefined,
    totalBatchesForPo: row.total_batches_for_po ? Number(row.total_batches_for_po) : undefined,
  };
}

export async function updateSubcontractorBooking(
  id: string,
  updates: Partial<SubcontractorBooking>,
  actorId?: string | null
): Promise<SubcontractorBooking | null> {
  const existing = await getSubcontractorBookingById(id);
  if (!existing) {
    const err: any = new Error('Không tìm thấy phiếu Book QC để cập nhật');
    err.statusCode = 404;
    throw err;
  }

  if (
    updates.version !== undefined &&
    existing.version !== undefined &&
    Number(updates.version) !== Number(existing.version)
  ) {
    const err: any = new Error('Phiếu Book QC đã được người khác cập nhật trước đó. Vui lòng tải lại trang.');
    err.statusCode = 409;
    throw err;
  }

  updates = stripTransientMediaUrlParams(updates);
  assertNoNewBase64DataUri(updates, existing, 'Lịch nghiệm thu GCN');

  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    params.push(updates.status);
  }
  if (updates.assignedQcId !== undefined) {
    fields.push(`assigned_qc_id = $${idx++}`);
    params.push(updates.assignedQcId || null);
  }
  if (updates.assignedQcName !== undefined) {
    fields.push(`assigned_qc_name = $${idx++}`);
    params.push(updates.assignedQcName || null);
  }
  if (updates.sqcType !== undefined) {
    fields.push(`sqc_type = $${idx++}`);
    params.push(updates.sqcType);
  }
  if (updates.poId !== undefined) {
    fields.push(`po_id = $${idx++}`);
    params.push(updates.poId || null);
  }
  let sanitizedUpdatePoTokens: string[] | undefined;
  let sanitizedUpdateItems: SubcontractorBookingItem[] | undefined;
  const shouldResyncPoAndItems =
    updates.items !== undefined || updates.poNumber !== undefined || updates.poNumbers !== undefined;

  if (shouldResyncPoAndItems) {
    const mergedItemsRaw = updates.items !== undefined ? updates.items : existing.items;
    const mergedPoRaw = updates.poNumber !== undefined ? updates.poNumber : existing.poNumber;
    const mergedPoNumbersRaw =
      updates.poNumbers !== undefined
        ? updates.poNumbers
        : updates.poNumber !== undefined
          ? undefined
          : existing.poNumbers;
    const { sanitizedItems, poTokens, normalizedPoNumber } = sanitizeBookingItemsAndPo(
      mergedItemsRaw,
      mergedPoRaw,
      mergedPoNumbersRaw
    );
    sanitizedUpdateItems = sanitizedItems;
    sanitizedUpdatePoTokens = poTokens;

    fields.push(`po_number = $${idx++}`);
    params.push(normalizedPoNumber);
    fields.push(`items_json = $${idx++}`);
    params.push(JSON.stringify(sanitizedItems));
  }

  if (updates.supplierId !== undefined) {
    fields.push(`supplier_id = $${idx++}`);
    params.push(updates.supplierId || null);
  }
  if (updates.supplierName !== undefined) {
    fields.push(`supplier_name = $${idx++}`);
    params.push(String(updates.supplierName || '').trim());
  }
  if (updates.locationAddress !== undefined) {
    fields.push(`location_address = $${idx++}`);
    params.push(String(updates.locationAddress || '').trim());
  }
  if (updates.contactPerson !== undefined) {
    fields.push(`contact_person = $${idx++}`);
    params.push(String(updates.contactPerson || '').trim());
  }
  if (updates.contactPhone !== undefined) {
    fields.push(`contact_phone = $${idx++}`);
    params.push(String(updates.contactPhone || '').trim());
  }
  if (updates.requestedDate !== undefined) {
    const parsedTs = parseUnixSeconds(updates.requestedDate);
    if (parsedTs) {
      fields.push(`requested_date = $${idx++}`);
      params.push(parsedTs);
    }
  }
  if (updates.notes !== undefined) {
    fields.push(`notes = $${idx++}`);
    params.push(updates.notes ?? '');
  }
  if (updates.documents !== undefined) {
    const docsJson = typeof updates.documents === 'string' ? updates.documents : JSON.stringify(updates.documents || {});
    fields.push(`documents_json = $${idx++}`);
    params.push(docsJson);
  }

  const dataPatch: Record<string, any> = {};
  if (sanitizedUpdatePoTokens !== undefined) {
    dataPatch.poNumbers = sanitizedUpdatePoTokens;
  }
  if (updates.supplierMismatchWarnings !== undefined) {
    dataPatch.supplierMismatchWarnings = sanitizeSupplierMismatchWarnings(updates.supplierMismatchWarnings) || [];
  }
  if (updates.sqcType !== undefined) dataPatch.sqcType = updates.sqcType;
  if (updates.commodityLine !== undefined) dataPatch.commodityLine = updates.commodityLine;
  if (updates.rejectionReason !== undefined) {
    dataPatch.rejectionReason = String(updates.rejectionReason ?? '').trim();
  }
  if (updates.suggestedDate !== undefined) {
    if (updates.suggestedDate === null || Number(updates.suggestedDate) === 0) {
      dataPatch.suggestedDate = null;
    } else {
      const parsedSuggested = parseUnixSeconds(updates.suggestedDate);
      dataPatch.suggestedDate = parsedSuggested ?? null;
    }
  }
  if (updates.rejectedAt !== undefined) {
    dataPatch.rejectedAt = updates.rejectedAt ? (parseUnixSeconds(updates.rejectedAt) ?? null) : null;
  }
  if (updates.rejectedByName !== undefined) {
    dataPatch.rejectedByName = updates.rejectedByName ? String(updates.rejectedByName).trim() : '';
  }
  if (Object.keys(dataPatch).length > 0) {
    fields.push(`data = COALESCE(data, '{}'::jsonb) || $${idx++}::jsonb`);
    params.push(JSON.stringify(dataPatch));
  }

  fields.push(`version = COALESCE(version, 1) + 1`);
  fields.push(`updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`);

  params.push(existing.id);
  await query(
    `UPDATE ${SCHEMA}.subcontractor_bookings SET ${fields.join(', ')} WHERE id = $${idx}`,
    params
  );

  const updatedBooking = await getSubcontractorBookingById(existing.id);

  await writeAuditLog({
    userId: actorId || null,
    action: 'UPDATE_SUBCONTRACTOR_BOOKING',
    entityType: 'subcontractor_booking',
    entityId: existing.id,
    oldValue: existing,
    newValue: updatedBooking,
  });

  // [Update - Lịch Nghiệm Thu GCN] - [2026-11-14 / v3.1.0] - Tạo thông báo chuông cho đúng QC được phân công
  if (updates.assignedQcId && updatedBooking && updates.assignedQcId !== existing.assignedQcId) {
    const bCode = updatedBooking.bookingCode || existing.id;
    const title = `📌 Phân công nghiệm thu mới: ${bCode}`;
    const dateFormatted = updatedBooking.requestedDate ? new Date(updatedBooking.requestedDate * 1000).toLocaleDateString('vi-VN') : '---';
    const msg = `Xưởng: ${updatedBooking.supplierName || '---'} | PO: ${updatedBooking.poNumber || '---'} | Ngày nghiệm thu: ${dateFormatted}`;
    createNotificationRecord({
      userId: updates.assignedQcId,
      type: 'ASSIGNMENT',
      title,
      message: msg,
      link: { view: 'SUBCONTRACTOR_BOOKING', id: updatedBooking.id },
      data: { link: { view: 'SUBCONTRACTOR_BOOKING', id: updatedBooking.id } }
    }).catch(err => console.warn('Failed to dispatch assignment notification:', err));
  }

  // Thông báo cho người đặt lịch khi QC phản hồi yêu cầu bổ sung hoặc đề xuất dời ngày
  if (
    updates.status === 'RETURNED_FOR_SUPPLEMENT' &&
    existing.status !== 'RETURNED_FOR_SUPPLEMENT' &&
    updatedBooking?.requesterId
  ) {
    const bCode = updatedBooking.bookingCode || existing.id;
    const suggestedFormatted = updatedBooking.suggestedDate
      ? ` | Đề xuất ngày mới: ${new Date(updatedBooking.suggestedDate * 1000).toLocaleDateString('vi-VN')}`
      : '';
    createNotificationRecord({
      userId: updatedBooking.requesterId,
      type: 'ALERT',
      title: `⚠️ Yêu cầu bổ sung thông tin Book QC: ${bCode}`,
      message: `PO: ${updatedBooking.poNumber || '---'} | Ghi chú: ${updatedBooking.rejectionReason || 'Cần bổ sung hồ sơ'}${suggestedFormatted}`,
      link: { view: 'SUBCONTRACTOR_BOOKING', id: updatedBooking.id },
      data: { link: { view: 'SUBCONTRACTOR_BOOKING', id: updatedBooking.id } }
    }).catch(err => console.warn('Failed to dispatch supplement notification:', err));
  }

  return updatedBooking;
}

export async function manualOverrideSubcontractorBookingStatus(
  id: string,
  payload: {
    result: 'PASS' | 'FAIL';
    reason: string;
    sqcCode?: string;
    version?: number;
  },
  actorUser?: { id?: string | null; name?: string | null; username?: string | null } | null
): Promise<SubcontractorBooking> {
  const existing = await getSubcontractorBookingById(id);
  if (!existing) {
    const err: any = new Error('Không tìm thấy phiếu Book QC để gán trạng thái thủ công');
    err.statusCode = 404;
    throw err;
  }

  const existingStatus = String(existing.status || '').toUpperCase().trim();
  if (existingStatus === 'COMPLETED' || existingStatus === 'CANCELLED') {
    const err: any = new Error(
      existingStatus === 'COMPLETED'
        ? 'Phiếu Book QC đã hoàn thành nghiệm thu (COMPLETED), không thể gán trạng thái thủ công.'
        : 'Phiếu Book QC đã hủy (CANCELLED), không thể gán trạng thái thủ công.'
    );
    err.statusCode = 403;
    throw err;
  }

  if (
    payload.version !== undefined &&
    existing.version !== undefined &&
    Number(payload.version) !== Number(existing.version)
  ) {
    const err: any = new Error('Phiếu Book QC đã được người khác cập nhật trước đó. Vui lòng tải lại dữ liệu.');
    err.statusCode = 409;
    throw err;
  }

  const resultUpper = String(payload.result || '').toUpperCase().trim();
  if (resultUpper !== 'PASS' && resultUpper !== 'FAIL') {
    const err: any = new Error('Kết quả gán thủ công không hợp lệ (chỉ chấp nhận PASS hoặc FAIL).');
    err.statusCode = 400;
    throw err;
  }

  const cleanReason = String(payload.reason || '').trim();
  if (!cleanReason) {
    const err: any = new Error('Vui lòng nhập lý do gán trạng thái thủ công.');
    err.statusCode = 400;
    throw err;
  }

  const cleanSqcCode = String(payload.sqcCode || '').trim().slice(0, 120);
  let matchedSqcStatus: string | undefined;
  if (cleanSqcCode) {
    const inspRes = await query(
      `SELECT id, status FROM ${SCHEMA}.inspections WHERE deleted_at IS NULL AND LOWER(id) = LOWER($1) LIMIT 1`,
      [cleanSqcCode]
    ).catch(() => ({ rows: [] as any[] }));
    if (inspRes.rows[0]) {
      matchedSqcStatus = String(inspRes.rows[0].status || '').toUpperCase().trim() || undefined;
    }
  }

  const nowTs = Math.floor(Date.now() / 1000);
  const actorId = actorUser?.id || null;
  const actorName = String(actorUser?.name || actorUser?.username || actorId || 'Quản lý QC').trim();
  const nextStatus: SubcontractorBooking['status'] =
    resultUpper === 'PASS' ? 'COMPLETED' : 'RETURNED_FOR_SUPPLEMENT';

  const dataPatch: Record<string, any> = {
    sqcResult: resultUpper,
    manualStatusOverride: true,
    manualOverrideResult: resultUpper,
    manualOverrideReason: cleanReason,
    manualOverrideById: actorId || '',
    manualOverrideByName: actorName,
    manualOverrideAt: nowTs,
    manualOverrideSqcRef: cleanSqcCode,
    ...(cleanSqcCode ? { lastSqcId: cleanSqcCode } : {}),
    ...(matchedSqcStatus ? { lastSqcStatus: matchedSqcStatus } : {}),
  };

  if (resultUpper === 'PASS') {
    dataPatch.rejectionReason = '';
  } else {
    dataPatch.rejectionReason = cleanReason;
    dataPatch.rejectedAt = nowTs;
    dataPatch.rejectedByName = actorName;
  }

  await query(
    `UPDATE ${SCHEMA}.subcontractor_bookings
     SET status = $1,
         version = COALESCE(version, 1) + 1,
         updated_at = $2,
         data = COALESCE(data, '{}'::jsonb) || $3::jsonb
     WHERE id = $4 AND deleted_at IS NULL`,
    [nextStatus, nowTs, JSON.stringify(dataPatch), existing.id]
  );

  const updatedBooking = await getSubcontractorBookingById(existing.id);
  if (!updatedBooking) {
    const err: any = new Error('Không thể tải lại phiếu Book QC sau khi cập nhật.');
    err.statusCode = 500;
    throw err;
  }

  await writeAuditLog({
    userId: actorId || actorName,
    action: 'MANUAL_OVERRIDE_BOOKING_STATUS',
    entityType: 'subcontractor_booking',
    entityId: existing.id,
    oldValue: {
      status: existing.status,
      sqcResult: existing.sqcResult || null,
      lastSqcId: existing.lastSqcId || null,
      manualStatusOverride: Boolean(existing.manualStatusOverride),
    },
    newValue: {
      status: updatedBooking.status,
      sqcResult: resultUpper,
      manualStatusOverride: true,
      manualOverrideReason: cleanReason,
      manualOverrideSqcRef: cleanSqcCode || null,
      manualOverrideByName: actorName,
      manualOverrideAt: nowTs,
    },
  });

  if (existing.requesterId && existing.requesterId !== actorId) {
    const bCode = updatedBooking.bookingCode || existing.id;
    const sqcRefSuffix = cleanSqcCode ? ` | SQC tham chiếu: ${cleanSqcCode}` : '';
    createNotificationRecord({
      userId: existing.requesterId,
      type: resultUpper === 'PASS' ? 'INFO' : 'ALERT',
      title:
        resultUpper === 'PASS'
          ? `✅ Gán thủ công ĐẠT (PASS): ${bCode}`
          : `⚠️ Gán thủ công KHÔNG ĐẠT (FAIL): ${bCode}`,
      message: `PO: ${updatedBooking.poNumber || '---'} | Người thực hiện: ${actorName} | Lý do: ${cleanReason}${sqcRefSuffix}`,
      link: { view: 'SUBCONTRACTOR_BOOKING', id: updatedBooking.id },
      data: { link: { view: 'SUBCONTRACTOR_BOOKING', id: updatedBooking.id } },
    }).catch((err) => console.warn('Failed to dispatch manual override notification:', err));
  }

  return updatedBooking;
}

// [Update - Danh Sách Phiếu] - [v3.1.0] - Khôi phục đầy đủ bộ lọc server, API cây ngày tháng & danh sách dự án theo múi giờ GMT+7
const EFFECTIVE_INSPECTION_TS_EXPR = `COALESCE(NULLIF(date, 0), created_at)`;

function parseBoundTimestamp(val: any, isEnd: boolean): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number' && !isNaN(val)) {
    return val > 1e12 ? Math.floor(val / 1000) : Math.floor(val);
  }
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num > 1e12 ? Math.floor(num / 1000) : num;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const iso = isEnd ? `${str}T23:59:59+07:00` : `${str}T00:00:00+07:00`;
    const ms = Date.parse(iso);
    return isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  const ms = Date.parse(str);
  return isNaN(ms) ? null : Math.floor(ms / 1000);
}

function splitCsvParam(val: any): string[] {
  if (!val) return [];
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== 'ALL');
}

function buildInspectionsWhereClause(
  filters: any = {},
  options: { includeProject?: boolean; includeDateBounds?: boolean } = {}
): { whereSql: string; params: any[] } {
  const { includeProject = true, includeDateBounds = true } = options;
  const clauses: string[] = ['1=1'];
  const params: any[] = [];
  let idx = 1;

  if (filters.search && String(filters.search).trim()) {
    const term = `%${String(filters.search).trim()}%`;
    clauses.push(`(
      id ILIKE $${idx} OR
      po_number ILIKE $${idx} OR
      ma_ct ILIKE $${idx} OR
      ten_ct ILIKE $${idx} OR
      ten_hang_muc ILIKE $${idx} OR
      workshop ILIKE $${idx} OR
      created_by ILIKE $${idx} OR
      headcode ILIKE $${idx}
    )`);
    params.push(term);
    idx++;
  }

  const types = splitCsvParam(filters.type);
  if (types.length > 0) {
    const expandedTypes = new Set<string>(types);
    if (expandedTypes.has('SQC_MAT')) expandedTypes.add('SQC_VT');
    clauses.push(`type = ANY($${idx++})`);
    params.push(Array.from(expandedTypes));
  }

  const statuses = splitCsvParam(filters.status);
  if (statuses.length > 0) {
    clauses.push(`LOWER(status) = ANY($${idx++})`);
    params.push(statuses.map((s) => s.toLowerCase()));
  } else {
    clauses.push(`COALESCE(UPPER(status), '') <> 'DELETED'`);
  }

  const qcs = splitCsvParam(filters.qc);
  if (qcs.length > 0) {
    clauses.push(`created_by = ANY($${idx++})`);
    params.push(qcs);
  }

  const workshops = splitCsvParam(filters.workshop);
  if (workshops.length > 0) {
    clauses.push(`workshop = ANY($${idx++})`);
    params.push(workshops);
  }

  const stages = splitCsvParam(filters.stage);
  if (stages.length > 0) {
    clauses.push(`stage = ANY($${idx++})`);
    params.push(stages);
  }

  if (includeProject && filters.project !== undefined && filters.project !== null && String(filters.project).trim() !== '') {
    const projRaw = String(filters.project).trim();
    if (projRaw === '__NONE__') {
      clauses.push('1 = 0');
    } else if (projRaw === '__UNASSIGNED__') {
      clauses.push(`(ma_ct IS NULL OR TRIM(ma_ct) = '')`);
    } else if (projRaw !== 'ALL') {
      const projList = splitCsvParam(projRaw);
      if (projList.length > 0) {
        const hasUnassigned = projList.includes('__UNASSIGNED__');
        const named = projList.filter((p) => p !== '__UNASSIGNED__').map((p) => p.toUpperCase());
        if (hasUnassigned && named.length > 0) {
          clauses.push(`((ma_ct IS NULL OR TRIM(ma_ct) = '') OR UPPER(TRIM(ma_ct)) = ANY($${idx++}))`);
          params.push(named);
        } else if (hasUnassigned) {
          clauses.push(`(ma_ct IS NULL OR TRIM(ma_ct) = '')`);
        } else {
          clauses.push(`UPPER(TRIM(ma_ct)) = ANY($${idx++})`);
          params.push(named);
        }
      }
    }
  }

  if (includeDateBounds) {
    const startTs = parseBoundTimestamp(filters.unixStart ?? filters.startDate, false);
    const endTs = parseBoundTimestamp(filters.unixEnd ?? filters.endDate, true);
    if (startTs !== null) {
      clauses.push(`${EFFECTIVE_INSPECTION_TS_EXPR} >= $${idx++}`);
      params.push(startTs);
    }
    if (endTs !== null) {
      clauses.push(`${EFFECTIVE_INSPECTION_TS_EXPR} <= $${idx++}`);
      params.push(endTs);
    }
  }

  return { whereSql: `WHERE ${clauses.join(' AND ')}`, params };
}

export async function getInspectionsDates(filters: any = {}): Promise<{ date: string; count: number }[]> {
  const { whereSql, params } = buildInspectionsWhereClause(filters, {
    includeProject: true,
    includeDateBounds: true,
  });

  const sql = `
    SELECT
      TO_CHAR((TO_TIMESTAMP(${EFFECTIVE_INSPECTION_TS_EXPR}) AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS count
    FROM ${SCHEMA}.inspections
    ${whereSql}
      AND ${EFFECTIVE_INSPECTION_TS_EXPR} IS NOT NULL
      AND ${EFFECTIVE_INSPECTION_TS_EXPR} > 0
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  const res = await query(sql, params);
  return res.rows.map((r: any) => ({
    date: r.date,
    count: Number(r.count || 0),
  }));
}

export async function getInspectionsProjects(filters: any = {}): Promise<{ ma_ct: string; ten_ct: string; count: number }[]> {
  const { whereSql, params } = buildInspectionsWhereClause(filters, {
    includeProject: false,
    includeDateBounds: true,
  });

  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(ma_ct), ''), '') AS ma_ct,
      COALESCE(MAX(NULLIF(TRIM(ten_ct), '')), '') AS ten_ct,
      COUNT(*)::int AS count
    FROM ${SCHEMA}.inspections
    ${whereSql}
    GROUP BY COALESCE(NULLIF(TRIM(ma_ct), ''), '')
    ORDER BY ten_ct ASC NULLS LAST, ma_ct ASC
  `;

  const res = await query(sql, params);
  return res.rows.map((r: any) => ({
    ma_ct: r.ma_ct || '',
    ten_ct: r.ten_ct || '',
    count: Number(r.count || 0),
  }));
}

export async function getInspectionsList(filters: any = {}, page: number = 1, limit: number = 200): Promise<{ items: Inspection[], total: number }> {
  const { whereSql, params } = buildInspectionsWhereClause(filters, {
    includeProject: true,
    includeDateBounds: true,
  });

  const countSql = `SELECT COUNT(*)::int AS total FROM ${SCHEMA}.inspections ${whereSql}`;
  const countRes = await query(countSql, params);
  const total = Number(countRes.rows[0]?.total || 0);

  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 50000));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const listParams = [...params, safeLimit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const sql = `
    SELECT
      id, type, po_number, ma_ct, ten_ct, ma_nha_may, ten_hang_muc,
      workshop, created_by, status, date, score, headcode, stage, sub_stage,
      inspected_qty, passed_qty, failed_qty, so_luong_ipo, priority,
      date_qc, date_manager, created_at, updated_at
    FROM ${SCHEMA}.inspections
    ${whereSql}
    ORDER BY ${EFFECTIVE_INSPECTION_TS_EXPR} DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await query(sql, listParams);
  const items = res.rows.map((row: any): Inspection => {
    const createdTs = row.created_at ? Number(row.created_at) : (row.date ? Number(row.date) : undefined);
    const updatedTs = row.updated_at ? Number(row.updated_at) : undefined;
    return {
      id: row.id,
      type: row.type || 'SQC_BTP',
      po_number: row.po_number || undefined,
      poNumber: row.po_number || undefined,
      ma_ct: row.ma_ct || '',
      ten_ct: row.ten_ct || '',
      ma_nha_may: row.ma_nha_may || '',
      ten_hang_muc: row.ten_hang_muc || '',
      supplier: row.ma_nha_may || row.workshop || row.ten_ct || '',
      workshop: row.workshop || '',
      location: row.workshop || '',
      inspectorName: row.created_by || '',
      created_by: row.created_by || '',
      status: row.status || 'pending',
      date: formatDisplayDateValue(row.date, createdTs),
      score: row.score !== null && row.score !== undefined ? Number(row.score) : undefined,
      headcode: row.headcode || '',
      stage: row.stage || '',
      subStage: row.sub_stage || '',
      inspectedQuantity: row.inspected_qty !== null && row.inspected_qty !== undefined ? Number(row.inspected_qty) : undefined,
      passedQuantity: row.passed_qty !== null && row.passed_qty !== undefined ? Number(row.passed_qty) : undefined,
      failedQuantity: row.failed_qty !== null && row.failed_qty !== undefined ? Number(row.failed_qty) : undefined,
      so_luong_ipo: row.so_luong_ipo !== null && row.so_luong_ipo !== undefined ? Number(row.so_luong_ipo) : undefined,
      priority: row.priority || undefined,
      date_qc: row.date_qc ? Number(row.date_qc) : undefined,
      date_manager: row.date_manager ? Number(row.date_manager) : undefined,
      created_at: createdTs,
      createdAt: createdTs,
      updatedAt: updatedTs,
    };
  });

  return { items, total };
}

function resolveExportFormTable(type?: string): string {
  const t = String(type || 'PQC').trim().toUpperCase();
  if (t === 'IQC') return 'forms_iqc';
  if (t === 'SQC_VT') return 'forms_sqc_vt';
  if (t === 'SQC_MAT' || t === 'SQC') return 'forms_sqc_mat';
  if (t === 'SQC_BTP') return 'forms_sqc_btp';
  if (t === 'SQC_TP') return 'forms_sqc_tp';
  if (t === 'FSR') return 'forms_fsr';
  if (t === 'STEP') return 'forms_step';
  if (t === 'FQC') return 'forms_fqc';
  if (t === 'SPR') return 'forms_spr';
  if (t === 'SITE') return 'forms_site';
  return 'forms_pqc';
}

const firstNonEmptyStr = (...vals: any[]): string => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
};

export async function getInspectionsExportRows(filters: any = {}, limit: number = 10000): Promise<any[]> {
  const { items } = await getInspectionsList(filters, 1, limit);
  if (!items || items.length === 0) return [];

  const groupedIds = new Map<string, string[]>();
  for (const it of items) {
    const tbl = resolveExportFormTable(it.type);
    const list = groupedIds.get(tbl) || [];
    list.push(it.id);
    groupedIds.set(tbl, list);
  }

  const formRowById = new Map<string, any>();
  await Promise.all(
    Array.from(groupedIds.entries()).map(async ([tableName, ids]) => {
      try {
        const res = await query(
          `SELECT id, stage, sub_stage, dvt, summary, comment_production, materials_json, items_json, data
           FROM ${SCHEMA}."${tableName}"
           WHERE id = ANY($1::text[]) AND deleted_at IS NULL`,
          [ids]
        );
        for (const r of res.rows) {
          formRowById.set(String(r.id), r);
        }
      } catch (err) {
        console.warn(`getInspectionsExportRows warning (${tableName}):`, err);
      }
    })
  );

  return items.map((item: any) => {
    const formRow = formRowById.get(String(item.id));
    const extraData = safeJsonParse<Record<string, any>>(formRow?.data, {});
    const materials = Array.isArray(extraData.materials)
      ? extraData.materials
      : safeJsonParse<any[]>(formRow?.materials_json, []);
    const checkItems = Array.isArray(extraData.items)
      ? extraData.items
      : safeJsonParse<any[]>(formRow?.items_json, []);

    const stageMain = firstNonEmptyStr(
      item.stage,
      formRow?.stage,
      extraData.stage,
      extraData.inspectionStage
    );
    const subStage = firstNonEmptyStr(
      item.subStage,
      formRow?.sub_stage,
      extraData.subStage,
      extraData.sub_stage
    );
    const exportStage = stageMain && subStage && !stageMain.toLowerCase().includes(subStage.toLowerCase())
      ? `${stageMain} (${subStage})`
      : (stageMain || subStage || '');

    let exportSummary = firstNonEmptyStr(
      formRow?.summary,
      extraData.summary,
      extraData.conclusion,
      extraData.notes,
      extraData.remarks,
      formRow?.comment_production,
      extraData.productionComment,
      extraData.pmComment,
      item.summary,
      item.conclusion,
      item.notes,
      item.remarks
    );

    if (!exportSummary) {
      const detailNotes: string[] = [];
      const seenNotes = new Set<string>();
      for (const m of materials) {
        const note = firstNonEmptyStr(m?.notes, m?.note, m?.ncr?.issueDescription, m?.ncr?.description);
        if (note && !seenNotes.has(note)) {
          seenNotes.add(note);
          detailNotes.push(note);
          if (detailNotes.length >= 3) break;
        }
      }
      if (detailNotes.length < 3) {
        for (const ci of checkItems) {
          const note = firstNonEmptyStr(ci?.notes, ci?.ncr?.issueDescription, ci?.ncr?.description);
          if (note && !seenNotes.has(note)) {
            seenNotes.add(note);
            detailNotes.push(note);
            if (detailNotes.length >= 3) break;
          }
        }
      }
      exportSummary = detailNotes.join('; ');
    }

    let exportUnit = firstNonEmptyStr(
      formRow?.dvt,
      extraData.dvt,
      extraData.unit,
      extraData.uom,
      item.dvt,
      item.unit,
      item.uom
    );
    if (!exportUnit && materials.length > 0) {
      const units = Array.from(
        new Set(
          materials
            .map((m: any) => firstNonEmptyStr(m?.unit, m?.dvt, m?.uom))
            .filter(Boolean)
        )
      );
      exportUnit = units.join(', ');
    }

    const resolvedIpo = item.so_luong_ipo ?? extraData.so_luong_ipo ?? item.orderedQty;

    return {
      ...item,
      so_luong_ipo: resolvedIpo,
      stage: stageMain || item.stage || '',
      subStage: subStage || item.subStage || '',
      dvt: exportUnit,
      unit: exportUnit,
      summary: exportSummary,
      exportStage,
      exportSummary,
      exportUnit,
    };
  });
}

export async function syncMissingInspectionsFromForms(): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const table of ALL_FORM_TABLES) {
    try {
      const missingRes = await query(`
        SELECT f.*
        FROM ${SCHEMA}."${table}" f
        LEFT JOIN ${SCHEMA}.inspections i ON f.id = i.id
        WHERE f.deleted_at IS NULL AND i.id IS NULL
      `);

      for (const row of missingRes.rows) {
        const extraData = safeJsonParse<Record<string, any>>(row.data, {});
        const defaultType = table.replace('forms_', '').toUpperCase();
        const type = row.type || extraData.type || defaultType;
        const rawDateTs = parseUnixSeconds(row.date) ?? parseUnixSeconds(extraData.date) ?? parseUnixSeconds(row.created_at);
        const createdTs = parseUnixSeconds(row.created_at) ?? parseUnixSeconds(extraData.created_at) ?? rawDateTs ?? Math.floor(Date.now() / 1000);
        const updatedTs = parseUnixSeconds(row.updated_at) ?? parseUnixSeconds(extraData.updated_at) ?? createdTs;
        const poNum = row.po_number || extraData.po_number || extraData.poNumber || null;

        await query(
          `INSERT INTO ${SCHEMA}.inspections (
            id, created_at, updated_at, created_by, ma_ct, ten_ct, ma_nha_may, ten_hang_muc,
            workshop, status, type, score, headcode, stage, sub_stage,
            inspected_qty, passed_qty, failed_qty, so_luong_ipo, priority, date, po_number
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22
          ) ON CONFLICT (id) DO NOTHING`,
          [
            row.id,
            createdTs,
            updatedTs,
            row.inspector_name || row.inspector || row.created_by || extraData.inspectorName || '',
            row.ma_ct || extraData.ma_ct || '',
            row.ten_ct || extraData.ten_ct || '',
            row.ma_nha_may || row.supplier || extraData.ma_nha_may || '',
            row.ten_hang_muc || extraData.ten_hang_muc || '',
            row.workshop || extraData.workshop || '',
            row.status || extraData.status || 'pending',
            type,
            row.score !== null && row.score !== undefined ? Number(row.score) : (extraData.score ?? null),
            row.headcode || extraData.headcode || '',
            row.stage || extraData.stage || '',
            row.sub_stage || extraData.subStage || '',
            row.inspected_qty ?? row.qty_total ?? extraData.inspectedQuantity ?? null,
            row.passed_qty ?? row.qty_pass ?? extraData.passedQuantity ?? null,
            row.failed_qty ?? row.qty_fail ?? extraData.failedQuantity ?? null,
            row.so_luong_ipo ?? row.sl_ipo ?? extraData.so_luong_ipo ?? null,
            row.priority || extraData.priority || null,
            rawDateTs ?? createdTs,
            poNum,
          ]
        );
        inserted++;
      }

      // Sync missing po_number for SQC tables if inspections.po_number is null
      if ((SQC_FORM_TABLES as readonly string[]).includes(table)) {
        const updRes = await query(`
          UPDATE ${SCHEMA}.inspections i
          SET po_number = f.po_number
          FROM ${SCHEMA}."${table}" f
          WHERE i.id = f.id
            AND f.deleted_at IS NULL
            AND (i.po_number IS NULL OR TRIM(i.po_number) = '')
            AND f.po_number IS NOT NULL
            AND TRIM(f.po_number) <> ''
        `);
        updated += updRes.rowCount || 0;
      }
    } catch (err) {
      console.warn(`syncMissingInspectionsFromForms warning (${table}):`, err);
    }
  }

  return { inserted, updated };
}

const ALL_FORM_TABLES = [
  'forms_sqc_vt',
  'forms_sqc_btp',
  'forms_sqc_tp',
  'forms_sqc_mat',
  'forms_iqc',
  'forms_pqc',
  'forms_fsr',
  'forms_step',
  'forms_fqc',
  'forms_spr',
  'forms_site'
] as const;

const SQC_FORM_TABLES = ['forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_tp', 'forms_sqc_mat'] as const;

function parseUnixSeconds(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (val instanceof Date) {
    const ms = val.getTime();
    return isNaN(ms) ? undefined : Math.floor(ms / 1000);
  }
  if (typeof val === 'number') {
    if (isNaN(val)) return undefined;
    return val > 1e12 ? Math.floor(val / 1000) : Math.floor(val);
  }
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num > 1e12 ? Math.floor(num / 1000) : num;
  }
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    const parsedDmy = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00+07:00`);
    return isNaN(parsedDmy) ? undefined : Math.floor(parsedDmy / 1000);
  }
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const yyyy = ymdMatch[1];
    const mm = ymdMatch[2].padStart(2, '0');
    const dd = ymdMatch[3].padStart(2, '0');
    const parsedYmd = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00+07:00`);
    return isNaN(parsedYmd) ? undefined : Math.floor(parsedYmd / 1000);
  }
  const parsed = Date.parse(str);
  return isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
}

function toGmt7Ymd(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return '';
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dmyDash) {
      return `${dmyDash[3]}-${dmyDash[2].padStart(2, '0')}-${dmyDash[1].padStart(2, '0')}`;
    }
    const ymdOnly = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdOnly) {
      return `${ymdOnly[1]}-${ymdOnly[2].padStart(2, '0')}-${ymdOnly[3].padStart(2, '0')}`;
    }
  }
  const ts = parseUnixSeconds(val);
  if (ts && ts > 0) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(ts * 1000));
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      return '';
    }
  }
  return '';
}

function formatDisplayDateValue(rawDate: any, fallbackTs?: any): string {
  const candidates = [rawDate, fallbackTs];
  for (const cand of candidates) {
    const ymd = toGmt7Ymd(cand);
    if (ymd) {
      const [y, m, d] = ymd.split('-');
      return `${d}/${m}/${y}`;
    }
  }
  return '';
}

function normalizeCodeToken(val: any): string {
  if (!val) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/^(po|pr|fo|ipo)[\s:#_-]*/i, '')
    .trim();
}

function inferFormTablesForId(id: string): string[] {
  const upper = id.toUpperCase();
  if (upper.startsWith('SQC-VT')) return ['forms_sqc_vt', 'forms_sqc_mat', 'forms_sqc_btp', 'forms_sqc_tp'];
  if (upper.startsWith('SQC-BTP')) return ['forms_sqc_btp', 'forms_sqc_vt', 'forms_sqc_tp', 'forms_sqc_mat'];
  if (upper.startsWith('SQC-TP')) return ['forms_sqc_tp', 'forms_sqc_btp', 'forms_sqc_vt', 'forms_sqc_mat'];
  if (upper.startsWith('SQC-MAT')) return ['forms_sqc_mat', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_tp'];
  if (upper.startsWith('IQC')) return ['forms_iqc', ...ALL_FORM_TABLES.filter(t => t !== 'forms_iqc')];
  if (upper.startsWith('PQC')) return ['forms_pqc', ...ALL_FORM_TABLES.filter(t => t !== 'forms_pqc')];
  if (upper.startsWith('FSR')) return ['forms_fsr', ...ALL_FORM_TABLES.filter(t => t !== 'forms_fsr')];
  if (upper.startsWith('STEP')) return ['forms_step', ...ALL_FORM_TABLES.filter(t => t !== 'forms_step')];
  if (upper.startsWith('FQC')) return ['forms_fqc', ...ALL_FORM_TABLES.filter(t => t !== 'forms_fqc')];
  if (upper.startsWith('SPR')) return ['forms_spr', ...ALL_FORM_TABLES.filter(t => t !== 'forms_spr')];
  if (upper.startsWith('SITE')) return ['forms_site', ...ALL_FORM_TABLES.filter(t => t !== 'forms_site')];
  return [...ALL_FORM_TABLES];
}

function hydrateFormRowToInspection(row: any, defaultType: string = 'SQC_BTP'): Inspection {
  const extraData = safeJsonParse<Record<string, any>>(row.data, {});
  const items = safeJsonParse<any[]>(row.items_json, extraData.items || []);
  const materials = safeJsonParse<any[]>(row.materials_json, extraData.materials || []);
  const images = safeJsonParse<any[]>(row.images_json, extraData.images || []);
  const deliveryImages = safeJsonParse<any[]>(row.delivery_images_json, extraData.deliveryNoteImages || []);
  const reportImages = safeJsonParse<any[]>(row.report_images_json, extraData.reportImages || []);
  const comments = safeJsonParse<any[]>(row.comments_json, extraData.comments || []);
  const supportingDocs = safeJsonParse<any[]>(row.supporting_docs_json, extraData.supportingDocs || []);
  const referenceDocs = safeJsonParse<any[]>(row.reference_docs_json, extraData.referenceDocs || []);

  const createdTs = parseUnixSeconds(row.created_at) ?? parseUnixSeconds(extraData.created_at) ?? parseUnixSeconds(row.date);
  const updatedTs = parseUnixSeconds(row.updated_at) ?? parseUnixSeconds(extraData.updated_at);
  const formattedDate = formatDisplayDateValue(extraData.date || row.inspection_date || row.date, createdTs);

  const inspectedQty = row.inspected_qty !== null && row.inspected_qty !== undefined
    ? Number(row.inspected_qty)
    : (row.qty_total !== null && row.qty_total !== undefined ? Number(row.qty_total) : Number(extraData.inspectedQuantity || 0));
  const passedQty = row.passed_qty !== null && row.passed_qty !== undefined
    ? Number(row.passed_qty)
    : (row.qty_pass !== null && row.qty_pass !== undefined ? Number(row.qty_pass) : Number(extraData.passedQuantity || 0));
  const failedQty = row.failed_qty !== null && row.failed_qty !== undefined
    ? Number(row.failed_qty)
    : (row.qty_fail !== null && row.qty_fail !== undefined ? Number(row.qty_fail) : Number(extraData.failedQuantity || 0));
  const ipoQty = row.so_luong_ipo !== null && row.so_luong_ipo !== undefined
    ? Number(row.so_luong_ipo)
    : (row.sl_ipo !== null && row.sl_ipo !== undefined ? Number(row.sl_ipo) : Number(extraData.so_luong_ipo || 0));

  const prNum = row.pr_number || extraData.pr_number || extraData.prNumber || undefined;
  const poNum = row.po_number || extraData.po_number || extraData.poNumber || undefined;

  return {
    ...extraData,
    id: row.id,
    type: row.type || extraData.type || defaultType,
    ma_ct: row.ma_ct || extraData.ma_ct || poNum || '',
    ten_ct: row.ten_ct || extraData.ten_ct || '',
    ten_hang_muc: row.ten_hang_muc || extraData.ten_hang_muc || '',
    po_number: poNum,
    poNumber: poNum,
    pr_number: prNum,
    prNumber: prNum,
    ma_nha_may: row.ma_nha_may || extraData.ma_nha_may || row.supplier || '',
    supplier: row.supplier || extraData.supplier || row.ma_nha_may || '',
    supplierAddress: row.supplier_address || extraData.supplierAddress || row.location || '',
    workshop: row.workshop || extraData.workshop || '',
    location: row.location || extraData.location || row.supplier_address || '',
    inspectorName: row.inspector_name || row.inspector || extraData.inspectorName || extraData.inspector || '',
    status: row.status || extraData.status || 'pending',
    date: formattedDate || String(row.date || ''),
    score: row.score !== null && row.score !== undefined ? Number(row.score) : Number(extraData.score || 0),
    summary: row.summary || extraData.summary || '',
    items,
    materials,
    images,
    deliveryNoteImages: deliveryImages,
    reportImages,
    comments,
    supportingDocs,
    referenceDocs,
    so_luong_ipo: ipoQty,
    inspectedQuantity: inspectedQty,
    passedQuantity: passedQty,
    failedQuantity: failedQty,
    dvt: row.dvt || extraData.dvt || '',
    headcode: row.headcode || extraData.headcode || '',
    stage: row.stage || extraData.stage || '',
    subStage: row.sub_stage || extraData.subStage || '',
    floor_plan_id: row.floor_plan_id || extraData.floor_plan_id,
    coord_x: row.coord_x !== null && row.coord_x !== undefined ? Number(row.coord_x) : extraData.coord_x,
    coord_y: row.coord_y !== null && row.coord_y !== undefined ? Number(row.coord_y) : extraData.coord_y,
    responsiblePerson: row.responsible_person || extraData.responsiblePerson || '',
    signature: row.signature_qc || row.signature_ref || extraData.signature || '',
    managerSignature: row.signature_manager || row.signature_mgr || row.manager_signature_ref || extraData.managerSignature || '',
    managerName: row.name_manager || row.name_mgr || extraData.managerName || '',
    managerDate: parseUnixSeconds(row.date_manager) ?? extraData.managerDate,
    teamLeadSignature: row.signature_teamlead || extraData.teamLeadSignature || '',
    teamLeadName: row.name_teamlead || extraData.teamLeadName || '',
    teamLeadDate: row.date_teamlead || extraData.teamLeadDate,
    productionSignature: row.signature_production || row.signature_prod || row.production_signature || extraData.productionSignature || '',
    productionName: row.name_production || row.name_prod || row.production_name || extraData.productionName || '',
    productionComment: row.comment_production || row.production_comment || extraData.productionComment || '',
    pmSignature: row.pm_signature || extraData.pmSignature || '',
    pmName: row.pm_name || extraData.pmName || '',
    pmComment: row.pm_comment || extraData.pmComment || '',
    booking_id: extraData.booking_id || extraData.bookingId,
    booking_code: extraData.booking_code || extraData.bookingCode,
    created_at: createdTs,
    createdAt: createdTs,
    updatedAt: updatedTs,
    date_qc: parseUnixSeconds(row.date_qc),
    date_manager: parseUnixSeconds(row.date_manager),
  };
}

export async function getInspectionById(id: string): Promise<Inspection | null> {
  if (!id || !id.trim()) return null;
  const cleanId = id.trim();
  const orderedTables = inferFormTablesForId(cleanId);

  for (const table of orderedTables) {
    try {
      const res = await query(
        `SELECT * FROM ${SCHEMA}."${table}" WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [cleanId]
      );
      if (res.rows.length > 0) {
        const defaultType = table.replace('forms_', '').toUpperCase();
        return hydrateFormRowToInspection(res.rows[0], defaultType);
      }
    } catch (e) {
      // Table may not exist or differ; continue fallback search
    }
  }

  try {
    const res = await query(
      `SELECT * FROM ${SCHEMA}.inspections WHERE id = $1 AND UPPER(COALESCE(status, '')) <> 'DELETED' LIMIT 1`,
      [cleanId]
    );
    if (res.rows.length > 0) {
      return hydrateFormRowToInspection(res.rows[0], res.rows[0].type || 'SQC_BTP');
    }
  } catch (e) {
    console.warn('getInspectionById fallback error:', e);
  }

  return null;
}

export async function getPublicInspectionShareById(id: string): Promise<Inspection | null> {
  const insp = await getInspectionById(id);
  if (!insp) return null;
  if (String(insp.status || '').toUpperCase() === 'DELETED') return null;
  // Return sanitized read-only inspection view for QR public verification (strip internal discussion comments)
  return {
    ...insp,
    comments: [],
  };
}

interface SqcLightRow {
  id: string;
  type: string;
  poNumber?: string;
  prNumber?: string;
  maCt?: string;
  tenCt?: string;
  tenHangMuc?: string;
  supplier?: string;
  workshop?: string;
  inspectorName?: string;
  date?: string;
  dateYmd?: string;
  createdAt?: number;
  updatedAt?: number;
  status: string;
  score?: number;
  inspectedQuantity?: number;
  passedQuantity?: number;
  failedQuantity?: number;
  hasJsonFail?: boolean;
  summary?: string;
  bookingId?: string;
  bookingCode?: string;
  sourceTable: string;
}

interface ErpPoPrBridge {
  poToPrs: Map<string, Set<string>>;
  prToPos: Map<string, Set<string>>;
  poToMaterials: Map<string, Set<string>>;
  allPoTerms: string[];
  allPrTerms: string[];
  allMaterialTerms: string[];
}

function expandCodeTokenVariants(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const raw of tokens) {
    const trimmed = String(raw || '').trim();
    if (!trimmed || trimmed.length < 3) continue;
    out.add(trimmed);
    const norm = normalizeCodeToken(trimmed);
    if (norm && norm.length >= 3) {
      out.add(norm);
      out.add(`PO ${norm}`);
      out.add(`po ${norm}`);
    }
  }
  return Array.from(out);
}

// Strictly READ-ONLY lookup on material & ipo using indexed/exact equality tokens (avoids 145k-row full wildcard scans)
async function lookupErpPoPrBridge(poTokens: string[], prTokens: string[]): Promise<ErpPoPrBridge> {
  const poToPrs = new Map<string, Set<string>>();
  const prToPos = new Map<string, Set<string>>();
  const poToMaterials = new Map<string, Set<string>>();
  const allPoSet = new Set<string>();
  const allPrSet = new Set<string>();
  const allMatSet = new Set<string>();

  for (const t of poTokens) {
    const trimmed = String(t || '').trim();
    if (trimmed.length >= 3) allPoSet.add(trimmed);
  }
  for (const t of prTokens) {
    const trimmed = String(t || '').trim();
    if (trimmed.length >= 3) allPrSet.add(trimmed);
  }

  const poVariants = expandCodeTokenVariants(poTokens);
  const prVariants = expandCodeTokenVariants(prTokens);
  const combinedLookup = Array.from(new Set([...poVariants, ...prVariants])).slice(0, 60);

  if (combinedLookup.length === 0) {
    return {
      poToPrs,
      prToPos,
      poToMaterials,
      allPoTerms: Array.from(allPoSet),
      allPrTerms: Array.from(allPrSet),
      allMaterialTerms: Array.from(allMatSet),
    };
  }

  const addLink = (poVal: any, prVal: any, matVals: any[]) => {
    const poStr = String(poVal || '').trim();
    const prStr = String(prVal || '').trim();
    const poNorm = normalizeCodeToken(poStr);
    const prNorm = normalizeCodeToken(prStr);

    if (poStr.length >= 3) allPoSet.add(poStr);
    if (prStr.length >= 3) allPrSet.add(prStr);

    if (poNorm && prNorm) {
      if (!poToPrs.has(poNorm)) poToPrs.set(poNorm, new Set());
      poToPrs.get(poNorm)!.add(prStr);
      if (!prToPos.has(prNorm)) prToPos.set(prNorm, new Set());
      prToPos.get(prNorm)!.add(poStr);
    }

    for (const m of matVals) {
      const mStr = String(m || '').trim();
      if (mStr.length >= 4) {
        allMatSet.add(mStr);
        if (poNorm) {
          if (!poToMaterials.has(poNorm)) poToMaterials.set(poNorm, new Set());
          poToMaterials.get(poNorm)!.add(mStr);
        }
      }
    }
  };

  const [matRes, ipoRes] = await Promise.all([
    query(
      `SELECT "purchaseDocument", "Factory_Order", "order", "material", "shortText"
       FROM ${SCHEMA}.material
       WHERE "purchaseDocument" = ANY($1)
          OR "Factory_Order" = ANY($1)
          OR "order" = ANY($1)
       LIMIT 200`,
      [combinedLookup]
    ).catch((err) => {
      console.warn('Read-only material bridge warning:', err);
      return { rows: [] as any[] };
    }),
    query(
      `SELECT "ID_Factory_Order", "IPO_Number", "salesOrder", "ID_Material", "Material_description"
       FROM ${SCHEMA}.ipo
       WHERE "salesOrder" = ANY($1)
          OR "ID_Factory_Order" = ANY($1)
          OR "IPO_Number" = ANY($1)
       LIMIT 150`,
      [combinedLookup]
    ).catch((err) => {
      console.warn('Read-only ipo bridge warning:', err);
      return { rows: [] as any[] };
    }),
  ]);

  const discoveredPrs = new Set<string>(prVariants);
  for (const r of matRes.rows) {
    if (r.Factory_Order) discoveredPrs.add(String(r.Factory_Order).trim());
    if (r.order) discoveredPrs.add(String(r.order).trim());
    addLink(r.purchaseDocument, r.Factory_Order || r.order, [r.material, r.shortText]);
    if (r.Factory_Order && r.order) {
      addLink(r.purchaseDocument, r.order, []);
    }
  }

  for (const r of ipoRes.rows) {
    if (r.ID_Factory_Order) discoveredPrs.add(String(r.ID_Factory_Order).trim());
    if (r.IPO_Number) discoveredPrs.add(String(r.IPO_Number).trim());
    addLink(r.salesOrder, r.ID_Factory_Order || r.IPO_Number, [r.ID_Material, r.Material_description]);
    if (r.ID_Factory_Order && r.IPO_Number) {
      addLink(r.salesOrder, r.IPO_Number, []);
    }
  }

  // Second-hop light IPO lookup only if material yielded new Factory Orders not yet scanned in IPO
  const extraPrTokens = Array.from(discoveredPrs).filter(t => t.length >= 4 && !combinedLookup.includes(t)).slice(0, 40);
  if (extraPrTokens.length > 0) {
    try {
      const ipo2 = await query(
        `SELECT "ID_Factory_Order", "IPO_Number", "salesOrder", "ID_Material", "Material_description"
         FROM ${SCHEMA}.ipo
         WHERE "ID_Factory_Order" = ANY($1) OR "IPO_Number" = ANY($1)
         LIMIT 100`,
        [extraPrTokens]
      );
      for (const r of ipo2.rows) {
        addLink(r.salesOrder, r.ID_Factory_Order || r.IPO_Number, [r.ID_Material, r.Material_description]);
      }
    } catch (err) {
      console.warn('Secondary ipo bridge warning:', err);
    }
  }

  return {
    poToPrs,
    prToPos,
    poToMaterials,
    allPoTerms: Array.from(allPoSet),
    allPrTerms: Array.from(allPrSet),
    allMaterialTerms: Array.from(allMatSet).slice(0, 40),
  };
}

const SQC_LIGHT_COLUMN_CACHE = new Map<string, Set<string>>();

async function getSqcLightTableColumns(tableName: string): Promise<Set<string>> {
  const cached = SQC_LIGHT_COLUMN_CACHE.get(tableName);
  if (cached && cached.size > 0) return cached;
  try {
    const res = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'appQAQC' AND table_name = $1`,
      [tableName]
    );
    const cols = new Set<string>(res.rows.map((r: any) => String(r.column_name)));
    if (cols.size > 0) SQC_LIGHT_COLUMN_CACHE.set(tableName, cols);
    return cols;
  } catch {
    return new Set<string>();
  }
}

// Fast parallel lightweight scan across SQC tables avoiding large image/data blobs
async function fetchAllSqcLightSummaries(): Promise<SqcLightRow[]> {
  const mapRow = (row: any, defaultType: string, sourceTable: string): SqcLightRow => {
    const createdTs = parseUnixSeconds(row.created_at) ?? parseUnixSeconds(row.date);
    const updatedTs = parseUnixSeconds(row.updated_at) ?? createdTs;
    const rawInspectionDate = row.insp_date_json || row.date_json || row.inspection_date || row.date;
    const dateYmd = toGmt7Ymd(rawInspectionDate || createdTs);
    const displayDate = formatDisplayDateValue(rawInspectionDate, createdTs);

    const inspectedQty = row.inspected_qty !== null && row.inspected_qty !== undefined
      ? Number(row.inspected_qty)
      : (row.qty_total !== null && row.qty_total !== undefined ? Number(row.qty_total) : undefined);
    const passedQty = row.passed_qty !== null && row.passed_qty !== undefined
      ? Number(row.passed_qty)
      : (row.qty_pass !== null && row.qty_pass !== undefined ? Number(row.qty_pass) : undefined);
    const failedQty = row.failed_qty !== null && row.failed_qty !== undefined
      ? Number(row.failed_qty)
      : (row.qty_fail !== null && row.qty_fail !== undefined ? Number(row.qty_fail) : undefined);

    return {
      id: row.id,
      type: row.type || defaultType,
      poNumber: row.po_number || row.po_num_json || undefined,
      prNumber: row.pr_number || row.pr_num || undefined,
      maCt: row.ma_ct || undefined,
      tenCt: row.ten_ct || undefined,
      tenHangMuc: row.ten_hang_muc || undefined,
      supplier: row.supplier || row.ma_nha_may || undefined,
      workshop: row.workshop || undefined,
      inspectorName: row.inspector_name || row.inspector || row.insp_name_json || undefined,
      date: displayDate,
      dateYmd: dateYmd || undefined,
      createdAt: createdTs,
      updatedAt: updatedTs,
      status: row.status || 'pending',
      score: row.score !== null && row.score !== undefined ? Number(row.score) : undefined,
      inspectedQuantity: inspectedQty,
      passedQuantity: passedQty,
      failedQuantity: failedQty,
      hasJsonFail: Boolean(row.has_json_fail),
      summary: row.summary || undefined,
      bookingId: row.b_id || undefined,
      bookingCode: row.b_code || undefined,
      sourceTable,
    };
  };

  const buildSafeFormQuery = async (table: string): Promise<string | null> => {
    const cols = await getSqcLightTableColumns(table);
    if (cols.size === 0) return null;
    const colOrNull = (name: string, cast = 'text') => (cols.has(name) ? name : `NULL::${cast} AS ${name}`);
    const hasData = cols.has('data');
    const whereClauses = [
      ...(cols.has('deleted_at') ? ['deleted_at IS NULL'] : []),
      `UPPER(COALESCE(status, '')) <> 'DELETED'`,
    ];
    const orderClauses: string[] = [];
    if (cols.has('updated_at')) orderClauses.push('updated_at DESC NULLS LAST');
    if (cols.has('created_at')) orderClauses.push('created_at DESC NULLS LAST');
    if (orderClauses.length === 0) orderClauses.push('id DESC');

    return `
      SELECT id,
             ${colOrNull('type')},
             ${colOrNull('po_number')},
             ${colOrNull('pr_number')},
             ${colOrNull('ma_ct')},
             ${colOrNull('ten_ct')},
             ${colOrNull('ten_hang_muc')},
             ${colOrNull('supplier')},
             ${colOrNull('workshop')},
             ${colOrNull('ma_nha_may')},
             ${colOrNull('status')},
             ${colOrNull('date')},
             ${colOrNull('inspection_date')},
             ${colOrNull('score')},
             ${colOrNull('summary')},
             ${colOrNull('created_at')},
             ${colOrNull('updated_at')},
             ${colOrNull('inspected_qty', 'numeric')},
             ${colOrNull('passed_qty', 'numeric')},
             ${colOrNull('failed_qty', 'numeric')},
             ${colOrNull('qty_total', 'numeric')},
             ${colOrNull('qty_pass', 'numeric')},
             ${colOrNull('qty_fail', 'numeric')},
             ${colOrNull('inspector')},
             ${colOrNull('inspector_name')},
             ${hasData ? `substring(data from '"booking_?[cC]ode"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS b_code,
             ${hasData ? `substring(data from '"booking_?[iI]d"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS b_id,
             ${hasData ? `substring(data from '"pr_?[nN]umber"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS pr_num,
             ${hasData ? `substring(data from '"po_?[nN]umber"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS po_num_json,
             ${hasData ? `substring(data from '"inspector[nN]ame"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS insp_name_json,
             ${hasData ? `substring(data from '"date"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS date_json,
             ${hasData ? `substring(data from '"inspection_?[dD]ate"[[:space:]]*:[[:space:]]*"([^"]+)"')` : 'NULL::text'} AS insp_date_json,
             ${hasData ? `(data ~* '"failQty"[[:space:]]*:[[:space:]]*[1-9]' OR data ~* '"status"[[:space:]]*:[[:space:]]*"FAIL"')` : 'FALSE'} AS has_json_fail
      FROM ${SCHEMA}."${table}"
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${orderClauses.join(', ')}
    `;
  };

  const buildSafeInspectionsQuery = async (): Promise<string | null> => {
    const cols = await getSqcLightTableColumns('inspections');
    if (cols.size === 0) return null;
    const colOrNull = (name: string, cast = 'text') => (cols.has(name) ? name : `NULL::${cast} AS ${name}`);
    const whereClauses = [
      `UPPER(COALESCE(type, '')) LIKE 'SQC%'`,
      `UPPER(COALESCE(status, '')) <> 'DELETED'`,
      ...(cols.has('deleted_at') ? ['deleted_at IS NULL'] : []),
    ];
    return `
      SELECT id,
             ${colOrNull('type')},
             ${colOrNull('po_number')},
             ${colOrNull('pr_number')},
             ${colOrNull('ma_ct')},
             ${colOrNull('ten_ct')},
             ${colOrNull('ten_hang_muc')},
             ${colOrNull('workshop')},
             ${colOrNull('ma_nha_may')},
             ${colOrNull('status')},
             ${colOrNull('date')},
             ${colOrNull('score')},
             ${colOrNull('created_at')},
             ${colOrNull('updated_at')},
             ${colOrNull('inspected_qty', 'numeric')},
             ${colOrNull('passed_qty', 'numeric')},
             ${colOrNull('failed_qty', 'numeric')},
             ${colOrNull('created_by')}
      FROM ${SCHEMA}.inspections
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC NULLS LAST
      LIMIT 5000
    `;
  };

  const [vtSql, btpSql, tpSql, matSql, inspSql] = await Promise.all([
    buildSafeFormQuery('forms_sqc_vt'),
    buildSafeFormQuery('forms_sqc_btp'),
    buildSafeFormQuery('forms_sqc_tp'),
    buildSafeFormQuery('forms_sqc_mat'),
    buildSafeInspectionsQuery(),
  ]);

  const runSafe = (sqlText: string | null, label: string) =>
    sqlText
      ? query(sqlText).catch((err) => {
          console.warn(`fetchAllSqcLightSummaries(${label}) warning:`, err?.message || err);
          return { rows: [] as any[] };
        })
      : Promise.resolve({ rows: [] as any[] });

  const [vtRes, btpRes, tpRes, matRes, inspRes] = await Promise.all([
    runSafe(vtSql, 'forms_sqc_vt'),
    runSafe(btpSql, 'forms_sqc_btp'),
    runSafe(tpSql, 'forms_sqc_tp'),
    runSafe(matSql, 'forms_sqc_mat'),
    runSafe(inspSql, 'inspections'),
  ]);

  const byId = new Map<string, SqcLightRow>();
  const ingest = (rows: any[], defType: string, src: string) => {
    for (const r of rows) {
      if (r?.id && !byId.has(r.id)) {
        byId.set(r.id, mapRow(r, defType, src));
      }
    }
  };

  ingest(vtRes.rows, 'SQC_VT', 'forms_sqc_vt');
  ingest(btpRes.rows, 'SQC_BTP', 'forms_sqc_btp');
  ingest(tpRes.rows, 'SQC_TP', 'forms_sqc_tp');
  ingest(matRes.rows, 'SQC_MAT', 'forms_sqc_mat');
  ingest(
    inspRes.rows.map(r => ({ ...r, inspector: r.created_by })),
    'SQC_BTP',
    'inspections'
  );

  return Array.from(byId.values());
}

type SqcReportWithDateYmd = RelatedSqcReport & { dateYmd?: string; updatedAt?: number; hasJsonFail?: boolean };

function matchBookingAgainstSqcRows(
  booking: { id: string; bookingCode: string; poNumber: string; poNumbers?: string[]; prNumber?: string; items?: any[] },
  sqcRows: SqcLightRow[],
  bridge: ErpPoPrBridge
): {
  poTerms: string[];
  prTerms: string[];
  materialTerms: string[];
  reports: SqcReportWithDateYmd[];
} {
  const poTermsSet = new Set<string>();
  const prTermsSet = new Set<string>();
  const matTermsSet = new Set<string>();

  for (const poTok of collectBookingAllPoTokens(booking)) {
    poTermsSet.add(poTok);
    const poNorm = normalizeCodeToken(poTok);
    if (poNorm && poNorm.length >= 3) {
      poTermsSet.add(poNorm);
      if (bridge.poToPrs.has(poNorm)) {
        for (const pr of bridge.poToPrs.get(poNorm)!) {
          prTermsSet.add(pr);
        }
      }
      if (bridge.poToMaterials.has(poNorm)) {
        for (const m of bridge.poToMaterials.get(poNorm)!) {
          matTermsSet.add(m);
        }
      }
      // If user entered a PR/FO number inside poNumber, resolve back to linked POs
      if (bridge.prToPos.has(poNorm)) {
        prTermsSet.add(poTok);
        for (const linkedPo of bridge.prToPos.get(poNorm)!) {
          poTermsSet.add(linkedPo);
          const lpNorm = normalizeCodeToken(linkedPo);
          if (lpNorm && bridge.poToMaterials.has(lpNorm)) {
            for (const m of bridge.poToMaterials.get(lpNorm)!) {
              matTermsSet.add(m);
            }
          }
        }
      }
    }
  }

  for (const prTok of collectBookingPrTokens(booking)) {
    prTermsSet.add(prTok);
    const prNorm = normalizeCodeToken(prTok);
    if (prNorm && bridge.prToPos.has(prNorm)) {
      for (const linkedPo of bridge.prToPos.get(prNorm)!) {
        poTermsSet.add(linkedPo);
      }
    }
  }

  for (const it of Array.isArray(booking.items) ? booking.items : []) {
    const nm = String(it?.itemName || '').trim();
    if (nm.length >= 5) matTermsSet.add(nm);
  }

  const poLowerSet = new Set(Array.from(poTermsSet).map(t => t.toLowerCase()));
  const poNormSet = new Set(Array.from(poTermsSet).map(t => normalizeCodeToken(t)).filter(t => t.length >= 3));
  const prLowerSet = new Set(Array.from(prTermsSet).map(t => t.toLowerCase()));
  const prNormSet = new Set(Array.from(prTermsSet).map(t => normalizeCodeToken(t)).filter(t => t.length >= 3));
  const matLowerList = Array.from(matTermsSet).map(t => t.toLowerCase()).filter(t => t.length >= 5);

  const matchesTokenSet = (val: any, exactSet: Set<string>, normSet: Set<string>): boolean => {
    if (!val) return false;
    const rawStr = String(val).trim();
    if (!rawStr) return false;
    const candidates = [rawStr, ...splitPoTokens(rawStr, { minLength: 3 })];
    for (const cand of candidates) {
      const candLower = cand.toLowerCase();
      if (exactSet.has(candLower)) return true;
      const norm = normalizeCodeToken(candLower);
      if (norm && normSet.has(norm)) return true;
      for (const term of normSet) {
        if (term.length >= 5 && (candLower.includes(term) || norm.includes(term))) return true;
      }
    }
    return false;
  };

  const reports: SqcReportWithDateYmd[] = [];

  for (const row of sqcRows) {
    const reasons = new Set<RelatedSqcMatchReason>();

    if (
      (row.bookingId && row.bookingId === booking.id) ||
      (row.bookingCode && row.bookingCode.toLowerCase() === booking.bookingCode.toLowerCase())
    ) {
      reasons.add('BOOKING');
    }

    if (
      matchesTokenSet(row.poNumber, poLowerSet, poNormSet) ||
      matchesTokenSet(row.maCt, poLowerSet, poNormSet)
    ) {
      reasons.add('PO');
    }

    if (
      matchesTokenSet(row.prNumber, prLowerSet, prNormSet) ||
      matchesTokenSet(row.prNumber, poLowerSet, poNormSet) ||
      matchesTokenSet(row.poNumber, prLowerSet, prNormSet) ||
      matchesTokenSet(row.maCt, prLowerSet, prNormSet)
    ) {
      reasons.add('PR');
    }

    if (row.tenHangMuc && matLowerList.length > 0) {
      const hm = row.tenHangMuc.toLowerCase();
      if (matLowerList.some(m => hm.includes(m) || (hm.length >= 6 && m.includes(hm)))) {
        reasons.add('MATERIAL');
      }
    }

    if (reasons.size === 0) continue;

    reports.push({
      id: row.id,
      type: row.type,
      poNumber: row.poNumber,
      prNumber: row.prNumber,
      maCt: row.maCt,
      tenCt: row.tenCt,
      supplier: row.supplier,
      workshop: row.workshop,
      inspectorName: row.inspectorName,
      date: row.date,
      dateYmd: row.dateYmd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      status: row.status,
      score: row.score,
      inspectedQuantity: row.inspectedQuantity,
      passedQuantity: row.passedQuantity,
      failedQuantity: row.failedQuantity,
      hasJsonFail: row.hasJsonFail,
      summary: row.summary,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      matchReasons: Array.from(reasons),
      sourceTable: row.sourceTable,
    });
  }

  reports.sort((a, b) => {
    const aBk = a.matchReasons.includes('BOOKING') ? 1 : 0;
    const bBk = b.matchReasons.includes('BOOKING') ? 1 : 0;
    if (aBk !== bBk) return bBk - aBk;
    const ta = a.updatedAt || a.createdAt || parseUnixSeconds(a.date) || 0;
    const tb = b.updatedAt || b.createdAt || parseUnixSeconds(b.date) || 0;
    return tb - ta;
  });

  return {
    poTerms: Array.from(poTermsSet),
    prTerms: Array.from(prTermsSet),
    materialTerms: Array.from(matTermsSet).slice(0, 30),
    reports,
  };
}

function filterStrictReportsForBooking(
  booking: { id: string; bookingCode: string; requestedDate?: number },
  reports: SqcReportWithDateYmd[]
): SqcReportWithDateYmd[] {
  const bookingCodeLower = String(booking.bookingCode || '').trim().toLowerCase();
  const bookingDateYmd = toGmt7Ymd(booking.requestedDate);

  return reports.filter((r) => {
    const rBookingId = String(r.bookingId || '').trim();
    const rBookingCode = String(r.bookingCode || '').trim().toLowerCase();
    const hasExplicitBooking = Boolean(rBookingId || rBookingCode);

    if (hasExplicitBooking) {
      return (
        (rBookingId && rBookingId === booking.id) ||
        (rBookingCode && bookingCodeLower && rBookingCode === bookingCodeLower)
      );
    }

    // Strict reconciliation for unlinked / pre-23/11/2026 SQC reports (single or multi-batch):
    // 1) Must match PO or PR (direct or via ERP bridge)
    // 2) Book QC inspection date (requestedDate, GMT+7) === SQC inspection date (GMT+7)
    const hasPoOrPr = r.matchReasons.includes('PO') || r.matchReasons.includes('PR');
    if (!hasPoOrPr) return false;

    const sqcDateYmd = r.dateYmd || toGmt7Ymd(r.date || r.createdAt);
    return Boolean(bookingDateYmd && sqcDateYmd && bookingDateYmd === sqcDateYmd);
  });
}

function buildRelatedSqcSummaryForBooking(
  booking: { id: string; bookingCode: string; poNumber: string; prNumber?: string; requestedDate?: number; items?: any[] },
  sqcRows: SqcLightRow[],
  bridge: ErpPoPrBridge
): RelatedSqcSummary {
  const { reports } = matchBookingAgainstSqcRows(booking, sqcRows, bridge);
  const ownReports = filterStrictReportsForBooking(booking, reports);

  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const r of ownReports) {
    const st = String(r.status || '').toUpperCase();
    const failQty = Number(r.failedQuantity || 0);
    if (['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(st) || failQty > 0 || Boolean(r.hasJsonFail)) {
      rejectedCount++;
    } else if (['PENDING', 'SUBMITTED', 'APPROVED', 'COMPLETED', 'VERIFIED', 'PASSED', 'PASS', 'CLOSED', 'LOCKED'].includes(st)) {
      approvedCount++;
    } else {
      pendingCount++;
    }
  }

  let latestResult: 'PASS' | 'FAIL' | 'PENDING' | undefined;
  if (ownReports.length > 0) {
    const latest = ownReports[0];
    const lst = String(latest.status || '').toUpperCase();
    const lfail = Number(latest.failedQuantity || 0);
    if (['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(lst) || lfail > 0 || Boolean(latest.hasJsonFail)) {
      latestResult = 'FAIL';
    } else if (['PENDING', 'SUBMITTED', 'APPROVED', 'COMPLETED', 'VERIFIED', 'PASSED', 'PASS', 'CLOSED', 'LOCKED'].includes(lst)) {
      latestResult = 'PASS';
    } else {
      latestResult = 'PENDING';
    }
  }

  return {
    totalCount: ownReports.length,
    approvedCount,
    pendingCount,
    rejectedCount,
    latestReportId: ownReports[0]?.id,
    latestStatus: ownReports[0]?.status,
    latestResult,
    reportsPreview: ownReports.slice(0, 5).map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      date: r.date,
      matchReasons: r.matchReasons,
    })),
  };
}

export async function getRelatedSqcInspectionsForBooking(bookingIdOrCode: string): Promise<RelatedSqcResponse> {
  const booking = await getSubcontractorBookingById(bookingIdOrCode);
  if (!booking) {
    return {
      bookingId: bookingIdOrCode,
      bookingCode: bookingIdOrCode,
      poNumber: '',
      searchContext: { poTerms: [], prTerms: [], materialTerms: [] },
      reports: []
    };
  }

  const poRaw = (booking.poNumber || '').trim();
  const [bridge, lightSqcRows] = await Promise.all([
    lookupErpPoPrBridge(collectBookingAllPoTokens(booking), collectBookingPrTokens(booking)),
    fetchAllSqcLightSummaries(),
  ]);

  const { poTerms, prTerms, materialTerms, reports } = matchBookingAgainstSqcRows(
    booking,
    lightSqcRows,
    bridge
  );

  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    poNumber: poRaw,
    searchContext: {
      poTerms,
      prTerms,
      materialTerms
    },
    reports
  };
}

export async function getRelatedBookingsForInspection(inspectionId: string): Promise<RelatedBookingsResponse> {
  const insp = await getInspectionById(inspectionId);
  if (!insp) {
    return { inspectionId, bookings: [] };
  }

  const rawPoTokens = splitPoTokens([
    insp.po_number,
    insp.poNumber,
    insp.ma_ct,
    ...(Array.isArray(insp.materials) ? insp.materials.flatMap((m: any) => [m?.projectCode, m?.po_number, m?.poNumber]) : [])
  ], { minLength: 3 });

  const rawPrTokens = splitPoTokens([
    insp.pr_number,
    insp.prNumber,
    ...(Array.isArray(insp.materials) ? insp.materials.flatMap((m: any) => [m?.pr_number, m?.prNumber]) : [])
  ], { minLength: 3 });

  const [bridge, bookingsRes] = await Promise.all([
    lookupErpPoPrBridge(rawPoTokens, rawPrTokens),
    query(`
      WITH batch_ranks AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(po_number))
            ORDER BY created_at ASC, id ASC
          )::INT AS batch_number,
          COUNT(*) OVER (
            PARTITION BY LOWER(TRIM(po_number))
          )::INT AS total_batches_for_po
        FROM ${SCHEMA}.subcontractor_bookings
        WHERE deleted_at IS NULL
          AND UPPER(COALESCE(status, '')) <> 'CANCELLED'
          AND TRIM(COALESCE(po_number, '')) <> ''
      )
      SELECT sb.id, sb.booking_code, sb.po_number, sb.supplier_name, sb.requested_date,
             sb.assigned_qc_name, sb.status, sb.sqc_type, sb.items_json, sb.data,
             br.batch_number, br.total_batches_for_po
      FROM ${SCHEMA}.subcontractor_bookings sb
      LEFT JOIN batch_ranks br ON br.id = sb.id
      WHERE sb.deleted_at IS NULL
      ORDER BY sb.created_at DESC
    `),
  ]);

  const poLowerSet = new Set([...rawPoTokens, ...bridge.allPoTerms].map(t => t.toLowerCase()));
  const poNormSet = new Set([...rawPoTokens, ...bridge.allPoTerms].map(t => normalizeCodeToken(t)).filter(t => t.length >= 3));
  const prNormSet = new Set([...rawPrTokens, ...bridge.allPrTerms].map(t => normalizeCodeToken(t)).filter(t => t.length >= 3));

  // Any PR bridged back to a PO adds that PO to the candidate PO set
  for (const prNorm of prNormSet) {
    const linkedPos = bridge.prToPos.get(prNorm);
    if (linkedPos) {
      for (const po of linkedPos) {
        poLowerSet.add(po.toLowerCase());
        const pn = normalizeCodeToken(po);
        if (pn.length >= 3) poNormSet.add(pn);
      }
    }
  }

  const inspMatStrings = [
    insp.ten_hang_muc,
    ...(Array.isArray(insp.materials) ? insp.materials.flatMap((m: any) => [m?.name, m?.material_name, m?.code]) : []),
    ...(Array.isArray(insp.items) ? insp.items.flatMap((it: any) => [it?.name, it?.itemName]) : [])
  ].map(x => String(x || '').trim().toLowerCase()).filter(x => x.length >= 5);

  const matchedBookings: RelatedBookingSummary[] = [];

  for (const row of bookingsRes.rows) {
    const reasons = new Set<RelatedSqcMatchReason>();
    const items = safeJsonParse<any[]>(row.items_json, []);
    const rowExtra = safeJsonParse<Record<string, any>>(row.data, {});
    const bkAllTokens = collectBookingAllPoTokens({
      poNumber: row.po_number,
      poNumbers: Array.isArray(rowExtra?.poNumbers) ? rowExtra.poNumbers : undefined,
      items,
    });

    if (
      (insp.booking_id && insp.booking_id === row.id) ||
      (insp.booking_code && insp.booking_code.toLowerCase() === String(row.booking_code || '').toLowerCase())
    ) {
      reasons.add('BOOKING');
    }

    for (const bkTok of bkAllTokens) {
      const bkTokLower = bkTok.toLowerCase();
      const bkTokNorm = normalizeCodeToken(bkTokLower);
      if (poLowerSet.has(bkTokLower) || (bkTokNorm.length >= 3 && poNormSet.has(bkTokNorm))) {
        reasons.add('PO');
      }
      if (bkTokNorm.length >= 3 && prNormSet.has(bkTokNorm)) {
        reasons.add('PR');
      }
      if (bkTokNorm && bridge.poToPrs.has(bkTokNorm)) {
        for (const pr of bridge.poToPrs.get(bkTokNorm)!) {
          const prNorm = normalizeCodeToken(pr);
          if (prNormSet.has(prNorm) || poNormSet.has(prNorm)) {
            reasons.add('PR');
            break;
          }
        }
      }
    }

    if (reasons.size === 0 && inspMatStrings.length > 0 && items.length > 0) {
      const bkItemNames = items.map(it => String(it?.itemName || '').trim().toLowerCase()).filter(n => n.length >= 6);
      if (bkItemNames.some(bn => inspMatStrings.some(im => im.includes(bn) || bn.includes(im)))) {
        reasons.add('MATERIAL');
      }
    }

    if (reasons.size === 0) continue;

    matchedBookings.push({
      id: row.id,
      bookingCode: row.booking_code,
      poNumber: row.po_number || '',
      supplierName: row.supplier_name || '',
      requestedDate: parseInt(row.requested_date || '0', 10),
      assignedQcName: row.assigned_qc_name || undefined,
      status: row.status,
      sqcType: row.sqc_type || 'SQC_BTP',
      batchNumber: row.batch_number ? Number(row.batch_number) : undefined,
      totalBatchesForPo: row.total_batches_for_po ? Number(row.total_batches_for_po) : undefined,
      matchReasons: Array.from(reasons),
    });
  }

  matchedBookings.sort((a, b) => {
    const aBk = a.matchReasons.includes('BOOKING') ? 1 : 0;
    const bBk = b.matchReasons.includes('BOOKING') ? 1 : 0;
    if (aBk !== bBk) return bBk - aBk;
    return (b.requestedDate || 0) - (a.requestedDate || 0);
  });

  return {
    inspectionId: insp.id,
    poNumber: insp.po_number || insp.poNumber,
    prNumber: insp.pr_number || insp.prNumber,
    bookings: matchedBookings,
  };
}

export async function resolveTraceability(options: {
  inspectionId?: string;
  ipo?: string;
  po?: string;
  pr?: string;
  q?: string;
  isPublic?: boolean;
}): Promise<TraceabilityBundle | null> {
  const isPublic = Boolean(options.isPublic);
  let baseInsp: Inspection | null = null;

  if (options.inspectionId) {
    baseInsp = await getInspectionById(options.inspectionId);
    if (!baseInsp || String(baseInsp.status || '').toUpperCase() === 'DELETED') {
      return null;
    }
  } else if (options.q && !options.ipo && !options.po && !options.pr) {
    const cleanQ = String(options.q).trim();
    if (cleanQ.length >= 5) {
      const maybeInsp = await getInspectionById(cleanQ).catch(() => null);
      if (maybeInsp && String(maybeInsp.status || '').toUpperCase() !== 'DELETED') {
        baseInsp = maybeInsp;
      }
    }
  }

  // Extract ONLY strict Mã NM (IPO) and Số PO / PR keys from base inspection & query params
  const baseKeys = baseInsp ? extractStrictTraceKeys(baseInsp) : [];
  const seedIpoRaw: any[] = [
    ...baseKeys.filter((k) => k.codeType === 'IPO').map((k) => k.codeValue),
    options.ipo,
    options.q,
  ];
  const seedPoRaw: any[] = [
    ...baseKeys.filter((k) => k.codeType === 'PO').map((k) => k.codeValue),
    options.po,
    options.q,
  ];
  const seedPrRaw: any[] = [
    ...baseKeys.filter((k) => k.codeType === 'PR').map((k) => k.codeValue),
    options.pr,
    options.q,
  ];

  // Include linked booking's PO/PR numbers if base inspection originated from a Subcontractor Booking
  if (baseInsp?.booking_id || baseInsp?.booking_code) {
    try {
      const bkRes = await query(
        `SELECT po_number, items_json, data FROM ${SCHEMA}.subcontractor_bookings
         WHERE deleted_at IS NULL AND (id = $1 OR LOWER(booking_code) = LOWER($2))
         LIMIT 1`,
        [baseInsp.booking_id || '', baseInsp.booking_code || '']
      );
      if (bkRes.rows[0]) {
        const bkRow = bkRes.rows[0];
        const bkExtra = safeJsonParse<Record<string, any>>(bkRow.data, {});
        const bkItems = safeJsonParse<any[]>(bkRow.items_json, []);
        const allBkTokens = collectBookingAllPoTokens({
          poNumber: bkRow.po_number,
          poNumbers: Array.isArray(bkExtra?.poNumbers) ? bkExtra.poNumbers : undefined,
          items: bkItems,
        });
        if (allBkTokens.length > 0) {
          seedPoRaw.push(...allBkTokens);
        } else if (bkRow.po_number) {
          seedPoRaw.push(bkRow.po_number);
        }
      }
    } catch {
      // Ignore lookup warning
    }
  }

  const directIpo = splitAndNormalizeTraceCodes(seedIpoRaw);
  const directPo = splitAndNormalizeTraceCodes(seedPoRaw);
  const directPr = splitAndNormalizeTraceCodes(seedPrRaw);

  // Deduplicate display context terms (excluding raw free-text `q` if it came solely from `options.q`)
  const contextIpoTerms = baseInsp
    ? baseKeys.filter((k) => k.codeType === 'IPO').map((k) => k.codeValue)
    : splitAndNormalizeTraceCodes([options.ipo, options.q]).rawTokens;
  const contextPoTerms = baseInsp
    ? Array.from(
        new Set([
          ...baseKeys.filter((k) => k.codeType === 'PO').map((k) => k.codeValue),
          ...(seedPoRaw.length > baseKeys.filter((k) => k.codeType === 'PO').length + 2
            ? splitAndNormalizeTraceCodes([seedPoRaw[seedPoRaw.length - 1]]).rawTokens
            : []),
        ])
      )
    : splitAndNormalizeTraceCodes([options.po, options.q]).rawTokens;
  const contextPrTerms = baseInsp
    ? baseKeys.filter((k) => k.codeType === 'PR').map((k) => k.codeValue)
    : splitAndNormalizeTraceCodes([options.pr, options.q]).rawTokens;

  // Merge strict search norms (all normalized alphanumeric keys >= 3 chars)
  const allSearchNorms = Array.from(
    new Set([
      ...Array.from(directIpo.normSet),
      ...Array.from(directPo.normSet),
      ...Array.from(directPr.normSet),
    ])
  ).filter((t) => t.length >= 3);

  // Ensure base inspection is present in index table if it has keys (zero-overhead fast path)
  if (baseInsp && baseKeys.length > 0) {
    try {
      const checkRes = await query(
        `SELECT 1 FROM ${SCHEMA}.inspection_traceability_index WHERE inspection_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [baseInsp.id]
      );
      if (checkRes.rows.length === 0) {
        await syncInspectionTraceabilityIndex(baseInsp);
      }
    } catch {
      // Ignore pre-sync failure
    }
  }

  type GroupedInsp = {
    item: TraceabilityInspectionItem;
    reasons: Set<TraceabilityMatchReason>;
    bookingId?: string;
    bookingCode?: string;
  };
  const groupedById = new Map<string, GroupedInsp>();

  if (baseInsp) {
    const baseReasons = new Set<TraceabilityMatchReason>(['CURRENT']);
    for (const k of baseKeys) {
      baseReasons.add(k.codeType);
    }
    const firstIpoKey = baseKeys.find((k) => k.codeType === 'IPO')?.codeValue;
    const cleanHeadcode = String(baseInsp.headcode || '').trim() || firstIpoKey || undefined;
    const cleanMaNhaMay = firstIpoKey || undefined;
    groupedById.set(baseInsp.id, {
      item: {
        id: baseInsp.id,
        type: baseInsp.type,
        status: baseInsp.status,
        maCt: baseInsp.ma_ct || undefined,
        tenCt: baseInsp.ten_ct || undefined,
        maNhaMay: cleanMaNhaMay,
        headcode: cleanHeadcode,
        poNumber: baseInsp.po_number || baseInsp.poNumber || undefined,
        prNumber: baseInsp.pr_number || baseInsp.prNumber || undefined,
        tenHangMuc: baseInsp.ten_hang_muc || undefined,
        workshop: baseInsp.workshop || undefined,
        supplier: baseInsp.supplier || undefined,
        inspectorName: baseInsp.inspectorName || baseInsp.created_by || undefined,
        date: baseInsp.date || undefined,
        createdAt: parseUnixSeconds(baseInsp.created_at ?? baseInsp.createdAt ?? baseInsp.date),
        score: baseInsp.score,
        inspectedQuantity: baseInsp.inspectedQuantity,
        passedQuantity: baseInsp.passedQuantity,
        failedQuantity: baseInsp.failedQuantity,
        summary: baseInsp.summary || undefined,
        matchReasons: Array.from(baseReasons),
        isCurrent: true,
      },
      reasons: baseReasons,
      bookingId: baseInsp.booking_id || undefined,
      bookingCode: baseInsp.booking_code || undefined,
    });
  }

  // O(log N) B-Tree indexed lookup in inspection_traceability_index
  if (allSearchNorms.length > 0) {
    try {
      const idxRes = await query(
        `SELECT *
         FROM ${SCHEMA}.inspection_traceability_index
         WHERE deleted_at IS NULL
           AND UPPER(COALESCE(status, '')) <> 'DELETED'
           AND code_norm = ANY($1)
         ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
         LIMIT 600`,
        [allSearchNorms]
      );

      for (const r of idxRes.rows) {
        const inspId = String(r.inspection_id || '').trim();
        if (!inspId) continue;

        let entry = groupedById.get(inspId);
        if (!entry) {
          entry = {
            item: {
              id: inspId,
              type: r.inspection_type || 'PQC',
              status: r.status || 'DRAFT',
              maCt: r.ma_ct || undefined,
              tenCt: r.ten_ct || undefined,
              maNhaMay: r.ma_nha_may || undefined,
              headcode: r.headcode || undefined,
              poNumber: r.po_number || undefined,
              prNumber: r.pr_number || undefined,
              tenHangMuc: r.ten_hang_muc || undefined,
              workshop: r.workshop || undefined,
              supplier: r.supplier || undefined,
              inspectorName: r.inspector_name || undefined,
              date: formatDisplayDateValue(r.inspection_date, r.created_at) || undefined,
              createdAt: parseUnixSeconds(r.created_at),
              score: r.score !== null && r.score !== undefined ? Number(r.score) : undefined,
              inspectedQuantity: r.inspected_qty !== null && r.inspected_qty !== undefined ? Number(r.inspected_qty) : undefined,
              passedQuantity: r.passed_qty !== null && r.passed_qty !== undefined ? Number(r.passed_qty) : undefined,
              failedQuantity: r.failed_qty !== null && r.failed_qty !== undefined ? Number(r.failed_qty) : undefined,
              summary: r.summary || undefined,
              matchReasons: [],
              isCurrent: Boolean(baseInsp && inspId === baseInsp.id),
            },
            reasons: new Set<TraceabilityMatchReason>(),
            bookingId: r.booking_id || undefined,
            bookingCode: r.booking_code || undefined,
          };
          if (baseInsp && inspId === baseInsp.id) {
            entry.reasons.add('CURRENT');
          }
          groupedById.set(inspId, entry);
        }

        const cType = String(r.code_type || '').toUpperCase();
        const cNorm = String(r.code_norm || '');
        if (cType === 'IPO' && (directIpo.normSet.has(cNorm) || !baseInsp)) {
          entry.reasons.add('IPO');
        } else if (cType === 'PO' && (directPo.normSet.has(cNorm) || !baseInsp)) {
          entry.reasons.add('PO');
        } else if (cType === 'PR' && (directPr.normSet.has(cNorm) || !baseInsp)) {
          entry.reasons.add('PR');
        } else if (cType === 'IPO' || cType === 'PO' || cType === 'PR') {
          entry.reasons.add(cType as TraceabilityMatchReason);
        }

        if (
          baseInsp &&
          ((baseInsp.booking_id && r.booking_id && baseInsp.booking_id === r.booking_id) ||
            (baseInsp.booking_code &&
              r.booking_code &&
              baseInsp.booking_code.toLowerCase() === String(r.booking_code).toLowerCase()))
        ) {
          entry.reasons.add('BOOKING');
        }
      }
    } catch (err: any) {
      console.warn('[Traceability] Index lookup warning:', err?.message);
    }
  }

  const matchedInspections: TraceabilityInspectionItem[] = [];
  const inspectionReasonMap = new Map<string, TraceabilityMatchReason[]>();

  for (const entry of groupedById.values()) {
    const reasonList = Array.from(entry.reasons);
    if (reasonList.length === 0) continue;
    entry.item.matchReasons = reasonList;
    inspectionReasonMap.set(entry.item.id, reasonList);
    matchedInspections.push(entry.item);
  }

  matchedInspections.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    const ta = a.createdAt || parseUnixSeconds(a.date) || 0;
    const tb = b.createdAt || parseUnixSeconds(b.date) || 0;
    return tb - ta;
  });

  const matchedInspectionIds = matchedInspections.map((i) => i.id);
  const baseBookingIds = Array.from(
    new Set(
      Array.from(groupedById.values())
        .map((e) => (e.bookingId || '').trim())
        .filter(Boolean)
    )
  );
  const baseBookingCodesLower = Array.from(
    new Set(
      Array.from(groupedById.values())
        .map((e) => (e.bookingCode || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const bookingSearchPoNorms = Array.from(
    new Set([...Array.from(directPo.normSet), ...Array.from(directPr.normSet), ...Array.from(directIpo.normSet)])
  ).filter((t) => t.length >= 3);

  // Parallel indexed lookups for NCRs and Subcontractor Bookings linked to the matched inspections / codes
  const [ncrsRes, bookingsRes] = await Promise.all([
    matchedInspectionIds.length > 0
      ? query(
          `SELECT n.*,
                  i.ma_ct AS ins_ma_ct,
                  i.ten_ct AS ins_ten_ct,
                  i.ten_hang_muc AS ins_ten_hang_muc,
                  i.workshop AS ins_workshop,
                  i.created_by AS ins_created_by,
                  i.po_number AS ins_po_number,
                  i.ma_nha_may AS ins_ma_nha_may
           FROM ${SCHEMA}.ncrs n
           LEFT JOIN ${SCHEMA}.inspections i ON n.inspection_id = i.id
           WHERE n.deleted_at IS NULL
             AND n.inspection_id = ANY($1)
           ORDER BY n.created_at DESC NULLS LAST
           LIMIT 150`,
          [matchedInspectionIds]
        ).catch(() => ({ rows: [] as any[] }))
      : Promise.resolve({ rows: [] as any[] }),
    baseBookingIds.length > 0 || baseBookingCodesLower.length > 0 || bookingSearchPoNorms.length > 0
      ? query(
          `SELECT id, booking_code, po_number, supplier_name, requested_date, assigned_qc_name, status, sqc_type, items_json, data
           FROM ${SCHEMA}.subcontractor_bookings
           WHERE deleted_at IS NULL
             AND (
               id = ANY($1)
               OR LOWER(booking_code) = ANY($2)
               OR EXISTS (
                 SELECT 1
                 FROM unnest(regexp_split_to_array(COALESCE(po_number, ''), E'[,;\\n/|]+')) AS tok
                 WHERE UPPER(REGEXP_REPLACE(TRIM(tok), '[^a-zA-Z0-9]', '', 'g')) = ANY($3)
               )
             )
           ORDER BY created_at DESC NULLS LAST
           LIMIT 150`,
          [
            baseBookingIds.length > 0 ? baseBookingIds : ['__NONE__'],
            baseBookingCodesLower.length > 0 ? baseBookingCodesLower : ['__none__'],
            bookingSearchPoNorms.length > 0 ? bookingSearchPoNorms : ['__NONE__'],
          ]
        ).catch(() => ({ rows: [] as any[] }))
      : Promise.resolve({ rows: [] as any[] }),
  ]);

  const matchedNcrs: TraceabilityNcrItem[] = [];
  const seenNcrIds = new Set<string>();
  for (const row of ncrsRes.rows) {
    if (!row?.id || seenNcrIds.has(row.id)) continue;
    seenNcrIds.add(row.id);
    const mapped = mapNcrRow(row);
    const inspReasons = mapped.inspection_id ? inspectionReasonMap.get(mapped.inspection_id) : undefined;
    const reasons = new Set<TraceabilityMatchReason>(inspReasons || ['IPO']);

    matchedNcrs.push({
      id: mapped.id,
      ncrNumber: mapped.ncr_number || mapped.id,
      inspectionId: mapped.inspection_id || undefined,
      defectCode: mapped.defect_code || undefined,
      severity: mapped.severity || 'MINOR',
      status: mapped.status || 'OPEN',
      title: mapped.title || undefined,
      description: mapped.description || mapped.issueDescription || undefined,
      rootCause: mapped.root_cause || mapped.rootCause || undefined,
      correctiveAction: mapped.corrective_action || mapped.solution || undefined,
      preventiveAction: mapped.preventive_action || undefined,
      responsiblePerson: isPublic ? undefined : (mapped.responsible_person || mapped.responsiblePerson || undefined),
      deadline: mapped.deadline || undefined,
      createdDate: mapped.createdDate || undefined,
      createdAt: mapped.created_at,
      maCt: mapped.ma_ct || undefined,
      tenCt: mapped.ten_ct || undefined,
      maNhaMay: row.ins_ma_nha_may || (mapped as any).ma_nha_may || undefined,
      poNumber: mapped.po_number || undefined,
      imagesBefore: Array.isArray(mapped.imagesBefore) ? mapped.imagesBefore : [],
      imagesAfter: Array.isArray(mapped.imagesAfter) ? mapped.imagesAfter : [],
      matchReasons: Array.from(reasons),
    });
  }

  const bookingIdSet = new Set(baseBookingIds);
  const bookingCodeSet = new Set(baseBookingCodesLower);
  const matchedBookings: TraceabilityBookingItem[] = [];

  for (const row of bookingsRes.rows) {
    const reasons = new Set<TraceabilityMatchReason>();
    if (
      bookingIdSet.has(row.id) ||
      (row.booking_code && bookingCodeSet.has(String(row.booking_code).trim().toLowerCase()))
    ) {
      reasons.add('BOOKING');
    }
    const rowExtra = safeJsonParse<Record<string, any>>(row.data, {});
    const rowItems = safeJsonParse<any[]>(row.items_json, []);
    const bkTokens = collectBookingAllPoTokens({
      poNumber: row.po_number,
      poNumbers: Array.isArray(rowExtra?.poNumbers) ? rowExtra.poNumbers : undefined,
      items: rowItems,
    });
    for (const tok of bkTokens) {
      const bkPoNorm = normalizeTraceCode(tok);
      if (bkPoNorm.length >= 3) {
        if (directPo.normSet.has(bkPoNorm)) reasons.add('PO');
        else if (directPr.normSet.has(bkPoNorm)) reasons.add('PR');
        else if (directIpo.normSet.has(bkPoNorm)) reasons.add('IPO');
      }
    }
    if (reasons.size === 0) continue;

    matchedBookings.push({
      id: row.id,
      bookingCode: row.booking_code,
      poNumber: row.po_number || '',
      supplierName: row.supplier_name || '',
      requestedDate: parseInt(row.requested_date || '0', 10),
      assignedQcName: isPublic ? undefined : (row.assigned_qc_name || undefined),
      status: row.status,
      sqcType: row.sqc_type || 'SQC_BTP',
      matchReasons: Array.from(reasons),
    });
  }

  // Compute summary metrics
  let passedInspections = 0;
  let failedInspections = 0;
  let pendingInspections = 0;
  for (const insp of matchedInspections) {
    const st = String(insp.status || '').toUpperCase();
    if (['APPROVED', 'COMPLETED', 'VERIFIED', 'PASSED', 'PASS', 'LOCKED'].includes(st)) {
      passedInspections++;
    } else if (['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(st)) {
      failedInspections++;
    } else {
      pendingInspections++;
    }
  }

  let openNcrs = 0;
  let closedNcrs = 0;
  for (const n of matchedNcrs) {
    const st = String(n.status || '').toUpperCase();
    if (st === 'CLOSED' || st === 'VERIFIED') closedNcrs++;
    else openNcrs++;
  }

  return {
    queryContext: {
      inspectionId: baseInsp?.id,
      ipoTerms: contextIpoTerms,
      poTerms: contextPoTerms,
      prTerms: contextPrTerms,
      erpLinkedIpoTerms: [],
      erpLinkedPoTerms: [],
      erpLinkedPrTerms: [],
    },
    summary: {
      totalInspections: matchedInspections.length,
      passedInspections,
      failedInspections,
      pendingInspections,
      totalNcrs: matchedNcrs.length,
      openNcrs,
      closedNcrs,
      totalBookings: matchedBookings.length,
    },
    inspections: matchedInspections,
    ncrs: matchedNcrs,
    bookings: matchedBookings,
    isPublic,
  };
}

export async function getSubcontractorInspections(): Promise<{ inspections: SubcontractorInspection[] }> {
  const res = await query(`
    SELECT id, booking_id, booking_code, inspection_result, defect_summary, created_at
    FROM ${SCHEMA}.subcontractor_inspections
    ORDER BY created_at DESC
  `);
  const inspections = res.rows.map((r: any): SubcontractorInspection => ({
    id: r.id,
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    inspectionResult: r.inspection_result,
    notes: r.defect_summary || '',
    createdAt: parseInt(r.created_at || '0')
  }));
  return { inspections };
}

export async function getSubcontractorReinspectionCosts(): Promise<{ costs: SubcontractorReinspectionCost[] }> {
  const res = await query(`
    SELECT id, booking_id, subcontractor_name, total_penalty_cost, reason_code, status, created_at
    FROM ${SCHEMA}.subcontractor_reinspection_costs
    ORDER BY created_at DESC
  `).catch(async () =>
    query(`
      SELECT id, booking_id, subcontractor_name, total_penalty_cost, status, created_at
      FROM ${SCHEMA}.subcontractor_reinspection_costs
      ORDER BY created_at DESC
    `)
  );
  const costs = res.rows.map((r: any): SubcontractorReinspectionCost => ({
    id: r.id,
    bookingId: r.booking_id,
    supplierName: r.subcontractor_name,
    amount: parseFloat(r.total_penalty_cost || '0'),
    reason: r.reason_code || '',
    status: r.status,
    createdAt: parseInt(r.created_at || '0')
  }));
  return { costs };
}

// --- SUPPLIER MANAGEMENT (bảng suppliers) ---

export async function findSupplierByNameOrCode(nameOrCode: string): Promise<Supplier | null> {
  if (!nameOrCode || !nameOrCode.trim()) return null;
  const clean = nameOrCode.trim();
  const searchPattern = `%${clean}%`;
  
  const res = await query(`
    SELECT id, code, name, address, contact_person, phone, email, category, status, version, updated_at
    FROM ${SCHEMA}.suppliers 
    WHERE deleted_at IS NULL 
      AND (
        LOWER(TRIM(name)) = LOWER(TRIM($1))
        OR LOWER(TRIM(code)) = LOWER(TRIM($1))
        OR name ILIKE $2
      )
    ORDER BY 
      CASE WHEN LOWER(TRIM(name)) = LOWER(TRIM($1)) THEN 1 ELSE 2 END,
      updated_at DESC NULLS LAST
    LIMIT 1
  `, [clean, searchPattern]);

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    code: row.code || '',
    name: row.name || '',
    address: row.address || '',
    contact_person: row.contact_person || '',
    phone: row.phone || '',
    email: row.email || '',
    category: row.category || 'Gia công ngoài',
    status: row.status || 'ACTIVE',
    version: row.version !== undefined && row.version !== null ? Number(row.version) : 1,
    updated_at: row.updated_at ? parseInt(row.updated_at) : undefined
  };
}

export async function getSuppliers(search: string = '', limit: number = 200): Promise<{ items: Supplier[], total: number }> {
  let sql = `SELECT id, code, name, address, contact_person, phone, email, category, status, version, updated_at FROM ${SCHEMA}.suppliers WHERE deleted_at IS NULL`;
  const params: any[] = [];
  let idx = 1;

  if (search && search.trim()) {
    sql += ` AND (name ILIKE $${idx} OR code ILIKE $${idx} OR contact_person ILIKE $${idx} OR phone ILIKE $${idx})`;
    params.push(`%${search.trim()}%`);
    idx++;
  }

  sql += ` ORDER BY name ASC LIMIT $${idx++}`;
  params.push(limit);

  const res = await query(sql, params);
  const items = res.rows.map((row: any): Supplier => ({
    id: row.id,
    code: row.code || '',
    name: row.name || '',
    address: row.address || '',
    contact_person: row.contact_person || '',
    phone: row.phone || '',
    email: row.email || '',
    category: row.category || 'Gia công ngoài',
    status: row.status || 'ACTIVE',
    version: row.version !== undefined && row.version !== null ? Number(row.version) : 1,
    updated_at: row.updated_at ? parseInt(row.updated_at) : undefined
  }));

  return { items, total: items.length };
}

export async function upsertSupplier(data: {
  id?: string;
  code?: string;
  name: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  category?: string;
  version?: number;
}, actorId?: string | null): Promise<Supplier> {
  const cleanName = (data.name || '').trim();
  if (!cleanName) {
    throw new Error('Tên nhà cung cấp không được để trống');
  }

  // Check if supplier already exists by name or id
  const existingRes = await query(`
    SELECT id, code, name, address, contact_person, phone, email, category, status, version, updated_at
    FROM ${SCHEMA}.suppliers 
    WHERE deleted_at IS NULL 
      AND (
        LOWER(TRIM(name)) = LOWER(TRIM($1))
        OR (id = $2 AND $2 IS NOT NULL AND $2 != '')
      )
    LIMIT 1
  `, [cleanName, data.id || '']);

  const nowTs = Math.floor(Date.now() / 1000);
  const existing = existingRes.rows[0] || null;
  data = stripTransientMediaUrlParams(data);
  assertNoNewBase64DataUri(data, existing, 'Nhà cung cấp');

  if (existing) {
    if (
      data.version !== undefined &&
      existing.version !== undefined &&
      Number(data.version) !== Number(existing.version)
    ) {
      throw Object.assign(
        new Error('Thông tin nhà cung cấp đã được người khác cập nhật trước đó. Vui lòng tải lại.'),
        { statusCode: 409 }
      );
    }

    const updateRes = await query(`
      UPDATE ${SCHEMA}.suppliers 
      SET 
        address = COALESCE($1, address),
        contact_person = COALESCE($2, contact_person),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        category = COALESCE($5, category),
        version = COALESCE(version, 1) + 1,
        updated_at = $6
      WHERE id = $7
      RETURNING *
    `, [
      data.address !== undefined ? data.address : existing.address,
      data.contact_person !== undefined ? data.contact_person : existing.contact_person,
      data.phone !== undefined ? data.phone : existing.phone,
      data.email !== undefined ? data.email : existing.email,
      data.category !== undefined ? data.category : existing.category,
      nowTs,
      existing.id
    ]);
    const r = updateRes.rows[0];
    await writeAuditLog({
      userId: actorId || null,
      action: 'UPDATE_SUPPLIER',
      entityType: 'supplier',
      entityId: existing.id,
      oldValue: existing,
      newValue: r,
    });
    return {
      id: r.id,
      code: r.code || '',
      name: r.name,
      address: r.address || '',
      contact_person: r.contact_person || '',
      phone: r.phone || '',
      email: r.email || '',
      category: r.category || 'Gia công ngoài',
      status: r.status || 'ACTIVE',
      version: Number(r.version || 1),
      updated_at: parseInt(r.updated_at || '0')
    };
  } else {
    const newId = data.id || crypto.randomUUID();
    const newCode = data.code || `NCC-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 100)}`;
    const insertRes = await query(`
      INSERT INTO ${SCHEMA}.suppliers (
        id, code, name, address, contact_person, phone, email, category, status, updated_at, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, 1)
      RETURNING *
    `, [
      newId,
      newCode,
      cleanName,
      data.address || '',
      data.contact_person || '',
      data.phone || '',
      data.email || '',
      data.category || 'Gia công ngoài',
      nowTs
    ]);
    const r = insertRes.rows[0];
    await writeAuditLog({
      userId: actorId || null,
      action: 'CREATE_SUPPLIER',
      entityType: 'supplier',
      entityId: newId,
      newValue: r,
    });
    return {
      id: r.id,
      code: r.code || '',
      name: r.name,
      address: r.address || '',
      contact_person: r.contact_person || '',
      phone: r.phone || '',
      email: r.email || '',
      category: r.category || 'Gia công ngoài',
      status: r.status || 'ACTIVE',
      version: Number(r.version || 1),
      updated_at: parseInt(r.updated_at || '0')
    };
  }
}

// --- PO / PR & MATERIAL AUTO-LOOKUP (Read-only tables: material & ipo) ---

export async function lookupPoMaterials(
  queryStr: string,
  options?: { exact?: boolean }
) {
  if (!queryStr || queryStr.trim().length === 0) {
    return { items: [] };
  }
  const rawSegments = queryStr
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const clean = rawSegments.length > 1 ? rawSegments[rawSegments.length - 1] : queryStr.trim();
  if (!clean) return { items: [] };

  const cleanLower = clean.toLowerCase();
  const searchPattern = `%${clean}%`;
  const prefixPattern = `${clean}%`;
  const isExactOnly = Boolean(options?.exact);

  const resolveMatchedCode = (
    candidates: Array<[string, any]>
  ): { poNumber: string; matchedBy: string } => {
    const normalized = candidates
      .map(([k, v]) => [k, String(v ?? '').trim()] as [string, string])
      .filter(([, v]) => v.length > 0);
    const exactMatch = normalized.find(([, v]) => v.toLowerCase() === cleanLower);
    if (exactMatch) return { poNumber: exactMatch[1], matchedBy: exactMatch[0] };
    const partialMatch = normalized.find(([, v]) => v.toLowerCase().includes(cleanLower));
    if (partialMatch) return { poNumber: partialMatch[1], matchedBy: partialMatch[0] };
    if (normalized.length > 0) return { poNumber: normalized[0][1], matchedBy: normalized[0][0] };
    return { poNumber: '', matchedBy: '' };
  };

  let matItems: any[] = [];
  try {
    const matSql = isExactOnly
      ? `
        SELECT
          m."purchaseDocument",
          m."order",
          m."supplierName",
          m."material",
          m."shortText",
          m."orderQuantity",
          m."orderUnit",
          m."projectName",
          m."projectDefine",
          m."Factory_Order",
          m."Ma_Tender",
          m."item",
          m."materialGroupDesc",
          COALESCE(NULLIF(TRIM(s."address"), ''), NULLIF(TRIM(m."street"), ''), '') as "supplierAddress",
          COALESCE(s."contact_person", '') as "supplierContactPerson",
          COALESCE(s."phone", '') as "supplierPhone"
        FROM ${SCHEMA}.material m
        LEFT JOIN ${SCHEMA}.suppliers s
          ON LOWER(TRIM(m."supplierName")) = LOWER(TRIM(s."name"))
          AND s.deleted_at IS NULL
        WHERE LOWER(TRIM(COALESCE(m."purchaseDocument"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE(m."order"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE(m."Factory_Order"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE(m."Ma_Tender"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE(m."projectDefine"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE(m."material"::text, ''))) = $1
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE(m."purchaseDocument"::text, ''))) = $1 THEN 0
            WHEN LOWER(TRIM(COALESCE(m."order"::text, ''))) = $1 THEN 1
            WHEN LOWER(TRIM(COALESCE(m."Factory_Order"::text, ''))) = $1 THEN 2
            WHEN LOWER(TRIM(COALESCE(m."Ma_Tender"::text, ''))) = $1 THEN 3
            WHEN LOWER(TRIM(COALESCE(m."projectDefine"::text, ''))) = $1 THEN 4
            ELSE 5
          END ASC,
          m."item" ASC NULLS LAST,
          m."createdAt" DESC NULLS LAST
        LIMIT 100
      `
      : `
        SELECT
          m."purchaseDocument",
          m."order",
          m."supplierName",
          m."material",
          m."shortText",
          m."orderQuantity",
          m."orderUnit",
          m."projectName",
          m."projectDefine",
          m."Factory_Order",
          m."Ma_Tender",
          m."item",
          m."materialGroupDesc",
          COALESCE(NULLIF(TRIM(s."address"), ''), NULLIF(TRIM(m."street"), ''), '') as "supplierAddress",
          COALESCE(s."contact_person", '') as "supplierContactPerson",
          COALESCE(s."phone", '') as "supplierPhone"
        FROM ${SCHEMA}.material m
        LEFT JOIN ${SCHEMA}.suppliers s
          ON LOWER(TRIM(m."supplierName")) = LOWER(TRIM(s."name"))
          AND s.deleted_at IS NULL
        WHERE COALESCE(m."purchaseDocument"::text, '') ILIKE $1
           OR COALESCE(m."order"::text, '') ILIKE $1
           OR COALESCE(m."material"::text, '') ILIKE $1
           OR COALESCE(m."shortText"::text, '') ILIKE $1
           OR COALESCE(m."supplierName"::text, '') ILIKE $1
           OR COALESCE(m."projectName"::text, '') ILIKE $1
           OR COALESCE(m."projectDefine"::text, '') ILIKE $1
           OR COALESCE(m."Factory_Order"::text, '') ILIKE $1
           OR COALESCE(m."Ma_Tender"::text, '') ILIKE $1
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE(m."purchaseDocument"::text, ''))) = $2 THEN 0
            WHEN LOWER(TRIM(COALESCE(m."order"::text, ''))) = $2 THEN 1
            WHEN LOWER(TRIM(COALESCE(m."Factory_Order"::text, ''))) = $2 THEN 2
            WHEN LOWER(TRIM(COALESCE(m."Ma_Tender"::text, ''))) = $2 THEN 3
            WHEN LOWER(TRIM(COALESCE(m."projectDefine"::text, ''))) = $2 THEN 4
            WHEN COALESCE(m."purchaseDocument"::text, '') ILIKE $3 THEN 5
            WHEN COALESCE(m."order"::text, '') ILIKE $3 THEN 6
            WHEN COALESCE(m."Factory_Order"::text, '') ILIKE $3 THEN 7
            ELSE 8
          END ASC,
          m."item" ASC NULLS LAST,
          m."createdAt" DESC NULLS LAST
        LIMIT 50
      `;

    const matParams = isExactOnly ? [cleanLower] : [searchPattern, cleanLower, prefixPattern];
    const matRes = await query(matSql, matParams);

    matItems = matRes.rows.map((r: any) => {
      const resolved = resolveMatchedCode([
        ['purchaseDocument', r.purchaseDocument],
        ['order', r.order],
        ['Factory_Order', r.Factory_Order],
        ['Ma_Tender', r.Ma_Tender],
        ['projectDefine', r.projectDefine],
        ['material', r.material],
      ]);
      const parsedQty = parseFloat(r.orderQuantity);
      const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      const itemCode = String(r.material || '').trim();
      const shortText = String(r.shortText || '').trim();
      return {
        poNumber: resolved.poNumber,
        matchedBy: resolved.matchedBy,
        purchaseDocument: String(r.purchaseDocument || '').trim(),
        orderNumber: String(r.order || '').trim(),
        lineItemNo: String(r.item || '').trim(),
        supplierName: String(r.supplierName || '').trim(),
        projectName: String(r.projectName || r.projectDefine || '').trim(),
        itemCode,
        itemName: shortText || itemCode,
        quantity,
        unit: String(r.orderUnit || '').trim() || 'Bộ',
        specifications: shortText || String(r.materialGroupDesc || '').trim(),
        supplierAddress: String(r.supplierAddress || '').trim(),
        supplierContactPerson: String(r.supplierContactPerson || '').trim(),
        supplierPhone: String(r.supplierPhone || '').trim(),
        source: 'material'
      };
    });
  } catch (e) {
    console.warn("lookupPoMaterials material query warning:", e);
  }

  let ipoItems: any[] = [];
  try {
    const ipoSql = isExactOnly
      ? `
        SELECT
          "ID_Factory_Order",
          "IPO_Number",
          "salesOrder",
          "Ma_Tender",
          "ID_Material",
          "ID_Project",
          "pmOrderID",
          "Project_name",
          "Material_description",
          "Quantity_IPO",
          "Quantity",
          "Base_Unit",
          "IPO_Line",
          "lineNumber"
        FROM ${SCHEMA}.ipo
        WHERE LOWER(TRIM(COALESCE("IPO_Number"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE("ID_Factory_Order"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE("salesOrder"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE("Ma_Tender"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE("ID_Project"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE("pmOrderID"::text, ''))) = $1
           OR LOWER(TRIM(COALESCE("ID_Material"::text, ''))) = $1
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE("IPO_Number"::text, ''))) = $1 THEN 0
            WHEN LOWER(TRIM(COALESCE("ID_Factory_Order"::text, ''))) = $1 THEN 1
            WHEN LOWER(TRIM(COALESCE("salesOrder"::text, ''))) = $1 THEN 2
            WHEN LOWER(TRIM(COALESCE("Ma_Tender"::text, ''))) = $1 THEN 3
            WHEN LOWER(TRIM(COALESCE("ID_Project"::text, ''))) = $1 THEN 4
            ELSE 5
          END ASC,
          "IPO_Line" ASC NULLS LAST,
          "lineNumber" ASC NULLS LAST
        LIMIT 100
      `
      : `
        SELECT
          "ID_Factory_Order",
          "IPO_Number",
          "salesOrder",
          "Ma_Tender",
          "ID_Material",
          "ID_Project",
          "pmOrderID",
          "Project_name",
          "Material_description",
          "Quantity_IPO",
          "Quantity",
          "Base_Unit",
          "IPO_Line",
          "lineNumber"
        FROM ${SCHEMA}.ipo
        WHERE COALESCE("IPO_Number"::text, '') ILIKE $1
           OR COALESCE("ID_Factory_Order"::text, '') ILIKE $1
           OR COALESCE("salesOrder"::text, '') ILIKE $1
           OR COALESCE("Ma_Tender"::text, '') ILIKE $1
           OR COALESCE("ID_Material"::text, '') ILIKE $1
           OR COALESCE("ID_Project"::text, '') ILIKE $1
           OR COALESCE("pmOrderID"::text, '') ILIKE $1
           OR COALESCE("Project_name"::text, '') ILIKE $1
           OR COALESCE("Material_description"::text, '') ILIKE $1
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE("IPO_Number"::text, ''))) = $2 THEN 0
            WHEN LOWER(TRIM(COALESCE("ID_Factory_Order"::text, ''))) = $2 THEN 1
            WHEN LOWER(TRIM(COALESCE("salesOrder"::text, ''))) = $2 THEN 2
            WHEN LOWER(TRIM(COALESCE("Ma_Tender"::text, ''))) = $2 THEN 3
            WHEN COALESCE("IPO_Number"::text, '') ILIKE $3 THEN 4
            WHEN COALESCE("ID_Factory_Order"::text, '') ILIKE $3 THEN 5
            ELSE 6
          END ASC,
          "IPO_Line" ASC NULLS LAST,
          "lineNumber" ASC NULLS LAST
        LIMIT 30
      `;

    const ipoParams = isExactOnly ? [cleanLower] : [searchPattern, cleanLower, prefixPattern];
    const ipoRes = await query(ipoSql, ipoParams);

    const seenIpo = new Set<string>();
    for (const r of ipoRes.rows) {
      const resolved = resolveMatchedCode([
        ['IPO_Number', r.IPO_Number],
        ['ID_Factory_Order', r.ID_Factory_Order],
        ['salesOrder', r.salesOrder],
        ['Ma_Tender', r.Ma_Tender],
        ['ID_Project', r.ID_Project],
        ['pmOrderID', r.pmOrderID],
        ['ID_Material', r.ID_Material],
      ]);
      const qIpo = parseFloat(r.Quantity_IPO);
      const qAlt = parseFloat(r.Quantity);
      const quantity = Number.isFinite(qIpo) && qIpo > 0
        ? qIpo
        : (Number.isFinite(qAlt) && qAlt > 0 ? qAlt : 1);
      const itemCode = String(r.ID_Material || r.Ma_Tender || '').trim();
      const itemName = String(r.Material_description || itemCode || r.Project_name || '').trim();
      const unit = String(r.Base_Unit || '').trim() || 'Bộ';
      const dedupKey = `${resolved.poNumber.toLowerCase()}|${itemCode.toLowerCase()}|${itemName.toLowerCase()}|${unit.toLowerCase()}|${quantity}`;
      if (seenIpo.has(dedupKey)) continue;
      seenIpo.add(dedupKey);

      ipoItems.push({
        poNumber: resolved.poNumber,
        matchedBy: resolved.matchedBy,
        ipoNumber: String(r.IPO_Number || '').trim(),
        factoryOrder: String(r.ID_Factory_Order || '').trim(),
        lineItemNo: String(r.IPO_Line || r.lineNumber || '').trim(),
        supplierName: '',
        projectName: String(r.Project_name || r.ID_Project || '').trim(),
        itemCode,
        itemName,
        quantity,
        unit,
        specifications: String(r.Material_description || '').trim(),
        supplierAddress: '',
        supplierContactPerson: '',
        supplierPhone: '',
        source: 'ipo'
      });
    }
  } catch (e) {
    console.warn("lookupPoMaterials ipo query warning:", e);
  }

  return { items: [...matItems, ...ipoItems] };
}

// --- CREATE & DELETE SUBCONTRACTOR BOOKING ---

export async function createSubcontractorBooking(data: any, actorId?: string | null): Promise<SubcontractorBooking> {
  data = stripTransientMediaUrlParams(data);
  assertNoNewBase64DataUri(data, null, 'Lịch nghiệm thu GCN');
  const nowTs = Math.floor(Date.now() / 1000);
  const id = data.id || crypto.randomUUID();

  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
  const randCode = Math.floor(1000 + Math.random() * 9000);
  const bookingCode = data.bookingCode || `BK-${dateStr}-${randCode}`;

  const { sanitizedItems, poTokens, normalizedPoNumber } = sanitizeBookingItemsAndPo(
    data.items,
    data.poNumber,
    data.poNumbers
  );
  const sanitizedWarnings = sanitizeSupplierMismatchWarnings(data.supplierMismatchWarnings);
  const itemsJson = JSON.stringify(sanitizedItems);
  const documentsJson = typeof data.documents === 'string' ? data.documents : JSON.stringify(data.documents || {});
  const extraData = JSON.stringify({
    requesterName: data.requesterName || 'Chuyên viên Mua hàng',
    sqcType: data.sqcType || 'SQC_BTP',
    commodityLine: data.commodityLine || '',
    isUrgent: !!data.isUrgent,
    poNumbers: poTokens,
    ...(sanitizedWarnings ? { supplierMismatchWarnings: sanitizedWarnings } : {}),
  });

  const reqDate = typeof data.requestedDate === 'number' 
    ? data.requestedDate 
    : data.requestedDate 
      ? Math.floor(new Date(data.requestedDate).getTime() / 1000) 
      : nowTs;

  const insertSql = `
    INSERT INTO ${SCHEMA}.subcontractor_bookings (
      id, booking_code, po_id, po_number, supplier_id, supplier_name,
      requester_id, requester_name, location_address, contact_person, contact_phone,
      requested_date, assigned_qc_id, assigned_qc_name, status, notes,
      items_json, documents_json, sqc_type, data, created_at, updated_at, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18, $19, $20::jsonb, $21, $22, 1
    ) RETURNING *
  `;

  const params = [
    id,
    bookingCode,
    data.poId || null,
    normalizedPoNumber,
    data.supplierId || null,
    data.supplierName || '',
    data.requesterId || null,
    data.requesterName || 'Chuyên viên Mua hàng',
    data.locationAddress || '',
    data.contactPerson || '',
    data.contactPhone || '',
    reqDate,
    data.assignedQcId || null,
    data.assignedQcName || null,
    data.status || 'PENDING',
    data.notes || '',
    itemsJson,
    documentsJson,
    data.sqcType || 'SQC_BTP',
    extraData,
    nowTs,
    nowTs
  ];

  const res = await query(insertSql, params);
  const row = res.rows[0];
  const createdItems = safeJsonParse<SubcontractorBookingItem[]>(row.items_json, []);
  const createdBooking: SubcontractorBooking = {
    id: row.id,
    bookingCode: row.booking_code,
    poId: row.po_id,
    poNumber: row.po_number || poTokens.join(', '),
    poNumbers: poTokens,
    ...(sanitizedWarnings ? { supplierMismatchWarnings: sanitizedWarnings } : {}),
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    locationAddress: row.location_address,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    requestedDate: parseInt(row.requested_date || '0'),
    assignedQcId: row.assigned_qc_id,
    assignedQcName: row.assigned_qc_name,
    status: row.status,
    notes: row.notes,
    sqcType: row.sqc_type || 'SQC_BTP',
    items: createdItems,
    documents: safeJsonParse(row.documents_json, {}),
    createdAt: parseInt(row.created_at || '0'),
    updatedAt: parseInt(row.updated_at || '0'),
    version: row.version || 1
  };

  await writeAuditLog({
    userId: actorId || data.requesterId || null,
    action: 'CREATE_SUBCONTRACTOR_BOOKING',
    entityType: 'subcontractor_booking',
    entityId: id,
    newValue: createdBooking,
  });

  return createdBooking;
}

export async function deleteSubcontractorBooking(id: string, actorId?: string | null): Promise<boolean> {
  const existing = await getSubcontractorBookingById(id);
  if (!existing) return false;
  const nowTs = Math.floor(Date.now() / 1000);
  const res = await query(
    `UPDATE ${SCHEMA}.subcontractor_bookings
     SET deleted_at = $1, updated_at = $1, version = COALESCE(version, 1) + 1
     WHERE id = $2 AND deleted_at IS NULL`,
    [nowTs, existing.id]
  );
  await writeAuditLog({
    userId: actorId || null,
    action: 'SOFT_DELETE_SUBCONTRACTOR_BOOKING',
    entityType: 'subcontractor_booking',
    entityId: existing.id,
    oldValue: existing,
    newValue: { deleted_at: nowTs },
  });
  return (res.rowCount || 0) > 0;
}

export async function getDashboardStats(filters: any = {}) {
  try {
    const { whereSql, params } = buildInspectionsWhereClause(filters, {
      includeProject: true,
      includeDateBounds: true,
    });
    const tsNormalizedExpr = `CASE WHEN ${EFFECTIVE_INSPECTION_TS_EXPR} > 1000000000000 THEN (${EFFECTIVE_INSPECTION_TS_EXPR} / 1000) ELSE ${EFFECTIVE_INSPECTION_TS_EXPR} END`;

    const statsRes = await query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN UPPER(COALESCE(status, '')) = 'DRAFT' THEN 1 END)::int as drafts,
        COUNT(CASE WHEN UPPER(COALESCE(status, '')) IN ('FLAGGED', 'HIGH', 'CRITICAL', 'REJECTED') THEN 1 END)::int as high_priority,
        COUNT(CASE WHEN UPPER(COALESCE(status, '')) NOT IN ('DRAFT') THEN 1 END)::int as non_draft_count,
        COALESCE(AVG(CASE WHEN score IS NOT NULL AND score > 0 THEN score END), 95.5) as avg_score
      FROM ${SCHEMA}.inspections
      ${whereSql}
    `, params);

    const row = statsRes.rows[0] || {};
    const total = parseInt(row.total || '0', 10) || 0;
    const drafts = parseInt(row.drafts || '0', 10) || 0;
    const highPriority = parseInt(row.high_priority || '0', 10) || 0;
    const nonDraftCount = parseInt(row.non_draft_count || '0', 10) || 0;
    const rawAvgScore = parseFloat(row.avg_score || '95.5');
    const avgSuccessRate = Number.isFinite(rawAvgScore) ? rawAvgScore : 95.5;
    const avgErrorRate = Number.isFinite(100 - avgSuccessRate)
      ? parseFloat(Math.max(0, 100 - avgSuccessRate).toFixed(1))
      : 0;

    const monthlyRes = await query(`
      SELECT 
        TO_CHAR(TO_TIMESTAMP(${tsNormalizedExpr}) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'TMMonth') as month_name,
        TO_CHAR(TO_TIMESTAMP(${tsNormalizedExpr}) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') as month_key,
        COUNT(*)::int as count,
        COALESCE(SUM(inspected_qty), 0)::int as inspected,
        COALESCE(SUM(passed_qty), 0)::int as passed,
        COALESCE(SUM(failed_qty), 0)::int as failed,
        COALESCE(SUM(CASE WHEN score IS NOT NULL AND score > 0 THEN score ELSE 100 END), 0)::float as fallback_score
      FROM ${SCHEMA}.inspections
      ${whereSql}
        AND ${EFFECTIVE_INSPECTION_TS_EXPR} IS NOT NULL
        AND ${EFFECTIVE_INSPECTION_TS_EXPR} > 0
      GROUP BY month_key, month_name
      ORDER BY month_key DESC
      LIMIT 12
    `, params).catch(() => ({ rows: [] }));

    const monthlyData = monthlyRes.rows.map((r: any) => {
      const cnt = parseInt(r.count || '0', 10) || 0;
      const fb = Number(r.fallback_score);
      return {
        month: r.month_name || r.month_key || '—',
        inspected: parseInt(r.inspected || '0', 10) || 0,
        passed: parseInt(r.passed || '0', 10) || 0,
        failed: parseInt(r.failed || '0', 10) || 0,
        count: cnt,
        fallbackScore: Number.isFinite(fb) ? fb : cnt * 100,
      };
    }).reverse();

    const workshopRes = await query(`
      SELECT 
        COALESCE(NULLIF(TRIM(workshop), ''), 'XƯỞNG MẶC ĐỊNH') as code,
        COUNT(*)::int as count,
        COALESCE(SUM(inspected_qty), 0)::int as inspected,
        COALESCE(SUM(passed_qty), 0)::int as passed,
        COALESCE(SUM(CASE WHEN score IS NOT NULL AND score > 0 THEN score ELSE 100 END), 0)::float as fallback_score
      FROM ${SCHEMA}.inspections
      ${whereSql}
      GROUP BY COALESCE(NULLIF(TRIM(workshop), ''), 'XƯỞNG MẶC ĐỊNH')
      ORDER BY count DESC
      LIMIT 15
    `, params).catch(() => ({ rows: [] }));

    const workshopData = workshopRes.rows.map((r: any) => {
      const cnt = parseInt(r.count || '0', 10) || 0;
      const fb = Number(r.fallback_score);
      return {
        code: r.code || 'XƯỞNG MẶC ĐỊNH',
        count: cnt,
        inspected: parseInt(r.inspected || '0', 10) || 0,
        passed: parseInt(r.passed || '0', 10) || 0,
        fallbackScore: Number.isFinite(fb) ? fb : cnt * 100,
      };
    });

    const stageRes = await query(`
      SELECT 
        COALESCE(NULLIF(TRIM(stage), ''), 'P01') as stage_name,
        COUNT(*)::int as count,
        COALESCE(SUM(inspected_qty), 0)::int as inspected,
        COALESCE(SUM(passed_qty), 0)::int as passed
      FROM ${SCHEMA}.inspections
      ${whereSql}
      GROUP BY COALESCE(NULLIF(TRIM(stage), ''), 'P01')
      ORDER BY count DESC
      LIMIT 20
    `, params).catch(() => ({ rows: [] }));

    const stageData = stageRes.rows.map((r: any) => ({
      stageName: r.stage_name || 'P01',
      count: parseInt(r.count || '0', 10) || 0,
      inspected: parseInt(r.inspected || '0', 10) || 0,
      passed: parseInt(r.passed || '0', 10) || 0
    }));

    return {
      stats: {
        total,
        drafts,
        highPriority,
        nonDraftCount,
        avgSuccessRate: parseFloat(avgSuccessRate.toFixed(1)),
        avgErrorRate
      },
      monthlyData,
      workshopData,
      stageData
    };
  } catch (err: any) {
    console.error('Error getting dashboard stats:', err);
    return {
      stats: { total: 0, drafts: 0, highPriority: 0, nonDraftCount: 0, avgSuccessRate: 98.5, avgErrorRate: 1.5 },
      monthlyData: [],
      workshopData: [],
      stageData: []
    };
  }
}

export async function syncSuppliersFromBookings(): Promise<{ success: boolean; updatedCount: number }> {
  try {
    const bookingsRes = await query(`
      SELECT supplier_name, location_address, contact_person, contact_phone
      FROM ${SCHEMA}.subcontractor_bookings
      WHERE deleted_at IS NULL AND supplier_name IS NOT NULL AND TRIM(supplier_name) != ''
    `);
    
    let updatedCount = 0;
    for (const row of bookingsRes.rows) {
      const name = (row.supplier_name || row.supplierName || '').trim();
      const address = (row.location_address || row.locationAddress || '').trim();
      const contact_person = (row.contact_person || row.contactPerson || '').trim();
      const phone = (row.contact_phone || row.contactPhone || row.phone || '').trim();

      if (name && (address || contact_person || phone)) {
        await upsertSupplier({
          name,
          address: address || undefined,
          contact_person: contact_person || undefined,
          phone: phone || undefined
        });
        updatedCount++;
      }
    }
    return { success: true, updatedCount };
  } catch (err: any) {
    console.error("Error in syncSuppliersFromBookings:", err);
    return { success: false, updatedCount: 0 };
  }
}

// --- NCR MANAGEMENT ---

// [Update - Danh Sách NCR] - [v3.1.0] - Bổ sung LEFT JOIN inspections để khôi phục ma_ct, ten_ct, ten_hang_muc, workshop, inspectorName và chuẩn hóa createdDate theo GMT+7
function formatGmt7IsoDate(unixSeconds?: number): string {
  if (!unixSeconds || isNaN(unixSeconds) || unixSeconds <= 0) return '';
  try {
    const dt = new Date(unixSeconds * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(dt);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
    return dt.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function mapNcrRow(row: any): NCR {
  const extraData = safeJsonParse<Record<string, any>>(row.data, {});
  const comments = safeJsonParse<any[]>(row.comments_json, extraData.comments || []);
  const imagesBefore = safeJsonParse<any[]>(row.images_before_json, extraData.imagesBefore || []);
  const imagesAfter = safeJsonParse<any[]>(row.images_after_json, extraData.imagesAfter || []);

  const createdTs = parseUnixSeconds(row.created_at) ?? parseUnixSeconds(extraData.created_at);
  const updatedTs = parseUnixSeconds(row.updated_at) ?? parseUnixSeconds(extraData.updated_at);
  const closedTs = parseUnixSeconds(row.closed_at) ?? parseUnixSeconds(extraData.closed_at);
  const createdDate = extraData.createdDate || formatGmt7IsoDate(createdTs);

  const maCt = extraData.ma_ct || row.ins_ma_ct || '';
  const tenCt = extraData.ten_ct || row.ins_ten_ct || '';
  const tenHangMuc = extraData.ten_hang_muc || row.ins_ten_hang_muc || '';
  const workshop = extraData.workshop || row.ins_workshop || '';
  const inspectorName =
    extraData.inspectorName ||
    extraData.inspector_name ||
    row.created_by ||
    row.ins_created_by ||
    '';

  return {
    ...extraData,
    id: row.id,
    ncr_number: row.id,
    title: extraData.title || tenHangMuc || `NCR ${row.id}`,
    status: row.status || 'OPEN',
    severity: row.severity || 'MINOR',
    created_at: createdTs,
    createdDate,
    ma_ct: maCt,
    ten_ct: tenCt,
    ten_hang_muc: tenHangMuc,
    workshop,
    po_number: extraData.po_number || row.ins_po_number || '',
    inspectorName,
    description: row.description || extraData.description || '',
    issueDescription: row.description || extraData.issueDescription || '',
    root_cause: row.root_cause || extraData.root_cause || '',
    rootCause: row.root_cause || extraData.rootCause || '',
    corrective_action: row.corrective_action || extraData.corrective_action || '',
    preventive_action: row.preventive_action || extraData.preventive_action || '',
    solution: row.corrective_action || extraData.solution || '',
    responsible_person: row.responsible_person || extraData.responsible_person || '',
    responsiblePerson: row.responsible_person || extraData.responsiblePerson || '',
    deadline: row.deadline || extraData.deadline || '',
    images_before_json: row.images_before_json || '[]',
    images_after_json: row.images_after_json || '[]',
    imagesBefore,
    imagesAfter,
    defect_code: row.defect_code || extraData.defect_code || '',
    inspection_id: row.inspection_id || extraData.inspection_id || '',
    item_id: row.item_id || extraData.item_id || '',
    comments,
    created_by: row.created_by || extraData.created_by || '',
    closed_by: row.closed_by || extraData.closed_by || '',
    closed_at: closedTs,
    closed_date: row.closed_date || extraData.closed_date || '',
    updated_at: updatedTs,
    version: row.version !== undefined && row.version !== null ? Number(row.version) : 1,
  };
}

export async function getNcrs(filters: any = {}, page: number = 1, limit: number = 50): Promise<{ items: NCR[]; total: number }> {
  let where = `WHERE n.deleted_at IS NULL`;
  const args: any[] = [];

  if (filters.status && filters.status !== 'ALL') {
    args.push(filters.status);
    where += ` AND n.status = $${args.length}`;
  }

  if (filters.severity && filters.severity !== 'ALL') {
    args.push(filters.severity);
    where += ` AND n.severity = $${args.length}`;
  }

  if (filters.project && filters.project !== 'ALL') {
    args.push(`%${filters.project}%`);
    where += ` AND (i.ma_ct ILIKE $${args.length} OR i.ten_ct ILIKE $${args.length} OR n.data ILIKE $${args.length} OR n.description ILIKE $${args.length})`;
  }

  if (filters.workshop && filters.workshop !== 'ALL') {
    args.push(filters.workshop);
    where += ` AND (i.workshop = $${args.length} OR n.data ILIKE '%' || $${args.length} || '%')`;
  }

  if (filters.qc && filters.qc !== 'ALL') {
    args.push(filters.qc);
    where += ` AND (n.created_by = $${args.length} OR i.created_by = $${args.length})`;
  }

  if (filters.search) {
    args.push(`%${filters.search}%`);
    where += ` AND (
      n.id ILIKE $${args.length} OR
      n.defect_code ILIKE $${args.length} OR
      n.description ILIKE $${args.length} OR
      n.responsible_person ILIKE $${args.length} OR
      n.inspection_id ILIKE $${args.length} OR
      i.ma_ct ILIKE $${args.length} OR
      i.ten_ct ILIKE $${args.length} OR
      i.ten_hang_muc ILIKE $${args.length}
    )`;
  }

  if (filters.unixStart) {
    const ts = parseInt(filters.unixStart, 10);
    if (!isNaN(ts)) {
      args.push(ts);
      where += ` AND n.created_at >= $${args.length}`;
    }
  }

  if (filters.unixEnd) {
    const ts = parseInt(filters.unixEnd, 10);
    if (!isNaN(ts)) {
      args.push(ts);
      where += ` AND n.created_at <= $${args.length}`;
    }
  }

  const fromJoin = `FROM ${SCHEMA}.ncrs n LEFT JOIN ${SCHEMA}.inspections i ON n.inspection_id = i.id`;
  const countRes = await query(`SELECT COUNT(*)::int AS total ${fromJoin} ${where}`, args);
  const total = Number(countRes.rows[0]?.total || 0);

  const safeLimit = Math.max(1, limit);
  const offset = Math.max(0, (page - 1) * safeLimit);
  args.push(safeLimit);
  const limitIdx = args.length;
  args.push(offset);
  const offsetIdx = args.length;

  const res = await query(
    `SELECT
      n.*,
      i.ma_ct AS ins_ma_ct,
      i.ten_ct AS ins_ten_ct,
      i.ten_hang_muc AS ins_ten_hang_muc,
      i.workshop AS ins_workshop,
      i.created_by AS ins_created_by,
      i.po_number AS ins_po_number
     ${fromJoin}
     ${where}
     ORDER BY n.created_at DESC NULLS LAST
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    args
  );

  const items = res.rows.map(mapNcrRow);
  return { items, total };
}

export async function getNcrById(id: string): Promise<NCR | null> {
  const res = await query(
    `SELECT
      n.*,
      i.ma_ct AS ins_ma_ct,
      i.ten_ct AS ins_ten_ct,
      i.ten_hang_muc AS ins_ten_hang_muc,
      i.workshop AS ins_workshop,
      i.created_by AS ins_created_by,
      i.po_number AS ins_po_number
     FROM ${SCHEMA}.ncrs n
     LEFT JOIN ${SCHEMA}.inspections i ON n.inspection_id = i.id
     WHERE n.id = $1 AND n.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  return mapNcrRow(res.rows[0]);
}

type CanonicalNcrState = 'OPEN' | 'ASSIGNED' | 'CORRECTED' | 'VERIFIED' | 'CLOSED';

function normalizeNcrStatus(raw: any): CanonicalNcrState {
  const s = String(raw || 'OPEN').trim().toUpperCase();
  if (s === 'OPEN' || s === 'PENDING') return 'OPEN';
  if (s === 'ASSIGNED') return 'ASSIGNED';
  if (s === 'CORRECTED' || s === 'IN_PROGRESS') return 'CORRECTED';
  if (s === 'VERIFIED') return 'VERIFIED';
  if (s === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}

const ALLOWED_NCR_TRANSITIONS: Record<CanonicalNcrState, CanonicalNcrState[]> = {
  OPEN: ['OPEN', 'ASSIGNED', 'CORRECTED'],
  ASSIGNED: ['ASSIGNED', 'CORRECTED', 'OPEN'],
  CORRECTED: ['CORRECTED', 'VERIFIED', 'ASSIGNED'],
  VERIFIED: ['VERIFIED', 'CLOSED', 'CORRECTED'],
  CLOSED: [],
};

export async function upsertNcr(ncrData: any, actorId?: string | null, actorUser?: any): Promise<NCR> {
  const id = ncrData.id || crypto.randomUUID();
  const nowTs = Math.floor(Date.now() / 1000);

  const existingRes = await query(
    `SELECT * FROM ${SCHEMA}.ncrs WHERE id = $1 LIMIT 1`,
    [id]
  );
  const existing = existingRes.rows[0] || null;
  if (existing && existing.deleted_at !== null && existing.deleted_at !== undefined) {
    throw Object.assign(new Error('Bản ghi NCR đã bị xóa mềm, không thể chỉnh sửa.'), { statusCode: 404 });
  }

  ncrData = stripTransientMediaUrlParams(ncrData);
  const existingMapped = existing ? mapNcrRow(existing) : null;
  assertNoNewBase64DataUri(ncrData, existingMapped, 'Hồ sơ NCR');

  if (
    existing &&
    ncrData.version !== undefined &&
    existing.version !== undefined &&
    Number(ncrData.version) !== Number(existing.version)
  ) {
    throw Object.assign(
      new Error('Hồ sơ NCR đã được người khác cập nhật trước đó (Optimistic Lock Conflict). Vui lòng tải lại dữ liệu.'),
      { statusCode: 409 }
    );
  }

  const nextStatus = normalizeNcrStatus(ncrData.status || (existing ? existing.status : 'OPEN'));

  if (existing) {
    const curStatus = normalizeNcrStatus(existing.status);
    if (curStatus === 'CLOSED') {
      throw Object.assign(
        new Error('Hồ sơ NCR đã ĐÓNG (CLOSED - Immutable), tuyệt đối không thể chỉnh sửa theo quy trình ISO.'),
        { statusCode: 403 }
      );
    }
    const allowedNext = ALLOWED_NCR_TRANSITIONS[curStatus] || [];
    if (!allowedNext.includes(nextStatus)) {
      throw Object.assign(
        new Error(`Vi phạm quy trình ISO NCR State Machine: Không thể chuyển trạng thái từ ${curStatus} sang ${nextStatus}.`),
        { statusCode: 400 }
      );
    }
    if ((nextStatus === 'VERIFIED' || nextStatus === 'CLOSED') && curStatus !== nextStatus && actorUser) {
      const roleUpper = String(actorUser.role || '').toUpperCase();
      const isAuthorizedCloser =
        roleUpper === 'ADMIN' ||
        roleUpper === 'MANAGER' ||
        roleUpper === 'QC_LEAD' ||
        roleUpper === 'QA' ||
        Boolean(actorUser.la_to_truong);
      if (!isAuthorizedCloser) {
        throw Object.assign(
          new Error(`Không đủ thẩm quyền RBAC để chuyển NCR sang trạng thái ${nextStatus}.`),
          { statusCode: 403 }
        );
      }
    }
  } else {
    if (nextStatus !== 'OPEN' && nextStatus !== 'ASSIGNED') {
      throw Object.assign(
        new Error(`Vi phạm quy trình ISO NCR State Machine: NCR mới chỉ được khởi tạo ở trạng thái OPEN hoặc ASSIGNED (nhận ${nextStatus}).`),
        { statusCode: 400 }
      );
    }
  }

  const imagesBeforeJson = Array.isArray(ncrData.imagesBefore)
    ? JSON.stringify(ncrData.imagesBefore)
    : (ncrData.images_before_json || '[]');

  const imagesAfterJson = Array.isArray(ncrData.imagesAfter)
    ? JSON.stringify(ncrData.imagesAfter)
    : (ncrData.images_after_json || '[]');

  const commentsJson = Array.isArray(ncrData.comments)
    ? JSON.stringify(ncrData.comments)
    : (ncrData.comments_json || '[]');

  const extraDataJson = JSON.stringify({ ...ncrData, id, status: nextStatus });

  const sql = `
    INSERT INTO ${SCHEMA}.ncrs (
      id, inspection_id, item_id, defect_code, severity, status, description, root_cause,
      corrective_action, preventive_action, responsible_person, deadline,
      images_before_json, images_after_json, created_by, comments_json, data, created_at, updated_at, version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 1)
    ON CONFLICT (id) DO UPDATE SET
      inspection_id = EXCLUDED.inspection_id,
      item_id = EXCLUDED.item_id,
      defect_code = EXCLUDED.defect_code,
      severity = EXCLUDED.severity,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      root_cause = EXCLUDED.root_cause,
      corrective_action = EXCLUDED.corrective_action,
      preventive_action = EXCLUDED.preventive_action,
      responsible_person = EXCLUDED.responsible_person,
      deadline = EXCLUDED.deadline,
      images_before_json = EXCLUDED.images_before_json,
      images_after_json = EXCLUDED.images_after_json,
      comments_json = EXCLUDED.comments_json,
      data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at,
      version = COALESCE(${SCHEMA}.ncrs.version, 1) + 1
    RETURNING *
  `;

  await query(sql, [
    id,
    ncrData.inspection_id || ncrData.inspectionId || '',
    ncrData.item_id || ncrData.itemId || '',
    ncrData.defect_code || ncrData.defectCode || '',
    ncrData.severity || 'MINOR',
    nextStatus,
    ncrData.description || ncrData.issueDescription || '',
    ncrData.root_cause || ncrData.rootCause || '',
    ncrData.corrective_action || ncrData.solution || '',
    ncrData.preventive_action || '',
    ncrData.responsible_person || ncrData.responsiblePerson || '',
    ncrData.deadline || '',
    imagesBeforeJson,
    imagesAfterJson,
    ncrData.created_by || ncrData.createdBy || '',
    commentsJson,
    extraDataJson,
    existing?.created_at || ncrData.created_at || nowTs,
    nowTs
  ]);

  const savedNcr = (await getNcrById(id))!;

  const auditAction = !existing
    ? 'CREATE_NCR'
    : nextStatus === 'CLOSED'
    ? 'CLOSE_NCR'
    : nextStatus === 'VERIFIED'
    ? 'VERIFY_NCR'
    : nextStatus === 'CORRECTED'
    ? 'CORRECT_NCR'
    : nextStatus === 'ASSIGNED'
    ? 'ASSIGN_NCR'
    : 'UPDATE_NCR';

  await writeAuditLog({
    userId: actorId || ncrData.created_by || ncrData.createdBy || 'system',
    action: auditAction,
    entityType: 'ncr',
    entityId: id,
    oldValue: existingMapped,
    newValue: savedNcr,
  });

  return savedNcr;
}

export async function deleteNcr(id: string, actorId?: string | null): Promise<boolean> {
  const existing = await query(`SELECT status FROM ${SCHEMA}.ncrs WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [id]);
  if (existing.rows[0] && normalizeNcrStatus(existing.rows[0].status) === 'CLOSED') {
    throw Object.assign(new Error('Hồ sơ NCR đã ĐÓNG (CLOSED), không thể xóa theo quy tắc ISO.'), { statusCode: 403 });
  }
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.ncrs SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({
    userId: actorId || 'system',
    action: 'SOFT_DELETE_NCR',
    entityType: 'ncr',
    entityId: id,
    oldValue: existing.rows[0] || null,
    newValue: { deleted_at: nowTs },
  });
  return true;
}

// [Update - Danh Sách Phiếu] - [2026-11-14 / v3.1.0] - Truy vấn nhật ký truy vết ISO Audit Trail theo entity_type='inspection'
export async function getInspectionAuditLogs(inspectionId: string) {
  const res = await query(
    `SELECT id, user_id, action, entity_type, entity_id, old_value, new_value, timestamp, ip_address, user_agent
     FROM ${SCHEMA}.audit_logs
     WHERE entity_type = 'inspection' AND entity_id = $1
     ORDER BY timestamp DESC
     LIMIT 200`,
    [inspectionId]
  );

  return res.rows.map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    old_value: safeJsonParse(row.old_value, row.old_value ?? null),
    new_value: safeJsonParse(row.new_value, row.new_value ?? null),
    timestamp: row.timestamp != null && !isNaN(Number(row.timestamp)) ? Number(row.timestamp) : row.timestamp,
    ip_address: row.ip_address ?? null,
    user_agent: row.user_agent ?? null,
  }));
}

// [Update - Cài Đặt / Thông Báo] - [2026-11-14 / v3.1.0] - Quản lý thông báo người dùng theo đúng user_id
export async function getNotifications(userId: string, page: number = 1, limit: number = 50) {
  if (!userId) return [];
  const offset = Math.max(0, (page - 1) * limit);
  const safeLimit = Math.min(Math.max(1, limit), 200);

  const sql = `
    SELECT id, user_id, type, title, message, data, link_json, is_read, created_at
    FROM ${SCHEMA}.notifications
    WHERE user_id = $1 AND (deleted_at IS NULL)
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const res = await query(sql, [userId, safeLimit, offset]);

  return res.rows.map((row: any) => {
    const dataObj = safeJsonParse(row.data, {}) as any;
    const link = dataObj.link || safeJsonParse(row.link_json, null);
    const isRead = Number(row.is_read || row.isRead || 0) === 1;
    const createdAt = Number(row.created_at || row.createdAt || Math.floor(Date.now() / 1000));

    return {
      id: String(row.id),
      userId: row.user_id || row.userId || '',
      user_id: row.user_id || row.userId || '',
      type: row.type || 'INFO',
      title: row.title || '',
      message: row.message || '',
      isRead,
      read: isRead,
      createdAt,
      created_at: createdAt,
      link,
      data: dataObj,
    };
  });
}

export async function markNotificationAsRead(id: string, userId?: string) {
  if (userId) {
    await query(`UPDATE ${SCHEMA}.notifications SET is_read = 1 WHERE id = $1 AND user_id = $2`, [id, userId]);
  } else {
    await query(`UPDATE ${SCHEMA}.notifications SET is_read = 1 WHERE id = $1`, [id]);
  }
  return { success: true };
}

export async function markAllNotificationsAsRead(userId: string) {
  if (!userId) return { success: true };
  await query(`UPDATE ${SCHEMA}.notifications SET is_read = 1 WHERE user_id = $1 AND (is_read = 0 OR is_read IS NULL)`, [userId]);
  return { success: true };
}

export async function createNotificationRecord(payload: any) {
  const id = payload.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const userId = payload.userId || payload.user_id;
  if (!userId) {
    throw new Error("Missing required user_id for notification");
  }
  const type = payload.type || 'INFO';
  const title = payload.title || 'Thông báo mới';
  const message = payload.message || '';
  const nowTs = Math.floor(Date.now() / 1000);
  const dataJson = typeof payload.data === 'object' && payload.data !== null 
    ? JSON.stringify(payload.data) 
    : (payload.link ? JSON.stringify({ link: payload.link }) : (payload.data || '{}'));
  const linkJson = payload.link ? JSON.stringify(payload.link) : null;

  await query(
    `INSERT INTO ${SCHEMA}.notifications (id, user_id, type, title, message, data, link_json, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
    [id, userId, type, title, message, dataJson, linkJson, nowTs]
  );

  return { id, userId, type, title, message, createdAt: nowTs };
}

// [Update - Cài Đặt / Tổ Chức] - [2026-11-14 / v3.1.0] - Quản lý phòng ban, bộ phận và tổ nhóm
export async function getDepartments() {
  const res = await query(`SELECT id, name, divisions FROM ${SCHEMA}.departments WHERE deleted_at IS NULL ORDER BY name`).catch(() => ({ rows: [] }));
  return res.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    divisions: safeJsonParse(r.divisions, [])
  }));
}

export async function upsertDepartment(dept: any, actorId?: string | null) {
  const id = dept.id || crypto.randomUUID();
  const divisionsJson = JSON.stringify(dept.divisions || []);
  await query(
    `INSERT INTO ${SCHEMA}.departments (id, name, divisions, deleted_at, updated_at)
     VALUES ($1, $2, $3, NULL, EXTRACT(EPOCH FROM NOW())::BIGINT)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, divisions = EXCLUDED.divisions, deleted_at = NULL, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`,
    [id, dept.name, divisionsJson]
  );
  await writeAuditLog({ userId: actorId || null, action: 'SAVE_DEPARTMENT', entityType: 'department', entityId: id, newValue: { id, name: dept.name } });
  return { ...dept, id };
}

export async function deleteDepartment(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.departments SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`, [nowTs, id]);
  await writeAuditLog({ userId: actorId || null, action: 'SOFT_DELETE_DEPARTMENT', entityType: 'department', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

export async function getDivisions() {
  const res = await query(`SELECT id, name, department_id FROM ${SCHEMA}.divisions WHERE deleted_at IS NULL ORDER BY name`).catch(() => ({ rows: [] }));
  return res.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    departmentId: r.department_id
  }));
}

export async function upsertDivision(div: any, actorId?: string | null) {
  const id = div.id || crypto.randomUUID();
  await query(
    `INSERT INTO ${SCHEMA}.divisions (id, name, department_id, deleted_at, updated_at)
     VALUES ($1, $2, $3, NULL, EXTRACT(EPOCH FROM NOW())::BIGINT)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, department_id = EXCLUDED.department_id, deleted_at = NULL, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`,
    [id, div.name, div.departmentId || div.department_id]
  );
  await writeAuditLog({ userId: actorId || null, action: 'SAVE_DIVISION', entityType: 'division', entityId: id, newValue: { id, name: div.name } });
  return { ...div, id };
}

export async function deleteDivision(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.divisions SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`, [nowTs, id]);
  await writeAuditLog({ userId: actorId || null, action: 'SOFT_DELETE_DIVISION', entityType: 'division', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

export async function getTeams() {
  const res = await query(`SELECT id, name, division_id, leader_id FROM ${SCHEMA}.teams WHERE deleted_at IS NULL ORDER BY name`).catch(() => ({ rows: [] }));
  return res.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    divisionId: r.division_id,
    leaderId: r.leader_id
  }));
}

export async function upsertTeam(team: any, actorId?: string | null) {
  const id = team.id || crypto.randomUUID();
  await query(
    `INSERT INTO ${SCHEMA}.teams (id, name, division_id, leader_id, deleted_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, EXTRACT(EPOCH FROM NOW())::BIGINT)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, division_id = EXCLUDED.division_id, leader_id = EXCLUDED.leader_id, deleted_at = NULL, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`,
    [id, team.name, team.divisionId || team.division_id, team.leaderId || team.leader_id || null]
  );
  await writeAuditLog({ userId: actorId || null, action: 'SAVE_TEAM', entityType: 'team', entityId: id, newValue: { id, name: team.name } });
  return { ...team, id };
}

export async function deleteTeam(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.teams SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`, [nowTs, id]);
  await writeAuditLog({ userId: actorId || null, action: 'SOFT_DELETE_TEAM', entityType: 'team', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

// --- TOOL MANAGEMENT (M09) ---
let toolTablesEnsured = false;

async function ensureToolTables() {
  if (toolTablesEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tool_catalogs (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        specifications TEXT,
        manual_markdown TEXT,
        manual_pdf_url TEXT,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        created_by TEXT,
        deleted_at BIGINT,
        version INT DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tool_assets (
        id TEXT PRIMARY KEY,
        catalog_id TEXT NOT NULL,
        asset_code TEXT UNIQUE NOT NULL,
        serial_number TEXT,
        current_user_id TEXT,
        next_calibration_date BIGINT,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        created_by TEXT,
        deleted_at BIGINT,
        version INT DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tool_transfers (
        id TEXT PRIMARY KEY,
        tool_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        from_user_id TEXT,
        to_user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        request_date BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        receiver_confirm_date BIGINT,
        receiver_signature TEXT,
        receiver_image TEXT,
        manager_approve_date BIGINT,
        manager_signature TEXT,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.tool_calibrations (
        id TEXT PRIMARY KEY,
        tool_asset_id TEXT NOT NULL,
        request_date BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        calibration_date BIGINT,
        next_calibration_date BIGINT,
        certificate_url TEXT,
        approved_by TEXT,
        notes TEXT
      );
      ALTER TABLE ${SCHEMA}.tool_catalogs ADD COLUMN IF NOT EXISTS specifications TEXT;
      ALTER TABLE ${SCHEMA}.tool_catalogs ADD COLUMN IF NOT EXISTS manual_markdown TEXT;
      ALTER TABLE ${SCHEMA}.tool_catalogs ADD COLUMN IF NOT EXISTS manual_pdf_url TEXT;
      ALTER TABLE ${SCHEMA}.tool_catalogs ADD COLUMN IF NOT EXISTS created_by TEXT;
      ALTER TABLE ${SCHEMA}.tool_catalogs ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
      ALTER TABLE ${SCHEMA}.tool_catalogs ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
      ALTER TABLE ${SCHEMA}.tool_assets ADD COLUMN IF NOT EXISTS next_calibration_date BIGINT;
      ALTER TABLE ${SCHEMA}.tool_assets ADD COLUMN IF NOT EXISTS created_by TEXT;
      ALTER TABLE ${SCHEMA}.tool_assets ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
      ALTER TABLE ${SCHEMA}.tool_assets ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
    `);
    toolTablesEnsured = true;
  } catch (err: any) {
    console.warn('[M09] ensureToolTables warning:', err?.message || err);
  }
}

function toNumOrNull(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseJsonStringArray(raw: any): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((x) => String(x || '').trim()).filter(Boolean)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map((x) => String(x || '').trim()).filter(Boolean)));
      }
    } catch {
      return [raw.trim()];
    }
  }
  return [];
}

function mapToolCatalogRow(r: any) {
  return {
    id: r.id,
    code: r.code || '',
    name: r.name || '',
    type: r.type || '',
    specifications: r.specifications || '',
    manual_markdown: r.manual_markdown || '',
    manualMarkdown: r.manual_markdown || '',
    manual_pdf_url: r.manual_pdf_url || '',
    manualPdfUrl: r.manual_pdf_url || '',
    created_by: r.created_by || null,
    createdBy: r.created_by || null,
    created_at: toNumOrNull(r.created_at),
    createdAt: toNumOrNull(r.created_at),
    updated_at: toNumOrNull(r.updated_at),
    updatedAt: toNumOrNull(r.updated_at),
    asset_count: r.asset_count !== undefined ? Number(r.asset_count) : undefined,
    assetCount: r.asset_count !== undefined ? Number(r.asset_count) : undefined,
    version: r.version !== undefined && r.version !== null ? Number(r.version) : 1,
  };
}

function mapToolAssetRow(r: any) {
  return {
    id: r.id,
    catalog_id: r.catalog_id,
    catalogId: r.catalog_id,
    asset_code: r.asset_code || '',
    assetCode: r.asset_code || '',
    serial_number: r.serial_number || '',
    serialNumber: r.serial_number || '',
    status: r.status || 'AVAILABLE',
    current_user_id: r.current_user_id || null,
    currentUserId: r.current_user_id || null,
    next_calibration_date: toNumOrNull(r.next_calibration_date),
    nextCalibrationDate: toNumOrNull(r.next_calibration_date),
    created_by: r.created_by || null,
    createdBy: r.created_by || null,
    created_at: toNumOrNull(r.created_at),
    createdAt: toNumOrNull(r.created_at),
    updated_at: toNumOrNull(r.updated_at),
    updatedAt: toNumOrNull(r.updated_at),
    catalog_name: r.catalog_name || '',
    catalogName: r.catalog_name || '',
    catalog_code: r.catalog_code || '',
    catalogCode: r.catalog_code || '',
    catalog_type: r.catalog_type || '',
    catalogType: r.catalog_type || '',
    version: r.version !== undefined && r.version !== null ? Number(r.version) : 1,
  };
}

function mapToolTransferRow(r: any) {
  const assetIds = parseJsonStringArray(r.tool_asset_ids);
  return {
    id: r.id,
    tool_asset_ids: assetIds,
    toolAssetIds: assetIds,
    tool_asset_id: assetIds[0] || null,
    from_user_id: r.from_user_id || null,
    fromUserId: r.from_user_id || null,
    to_user_id: r.to_user_id || '',
    toUserId: r.to_user_id || '',
    status: r.status || 'PENDING',
    request_date: toNumOrNull(r.request_date),
    requestDate: toNumOrNull(r.request_date),
    receiver_confirm_date: toNumOrNull(r.receiver_confirm_date),
    receiverConfirmDate: toNumOrNull(r.receiver_confirm_date),
    receiver_signature: r.receiver_signature || null,
    receiverSignature: r.receiver_signature || null,
    receiver_image: r.receiver_image || null,
    receiverImage: r.receiver_image || null,
    manager_approve_date: toNumOrNull(r.manager_approve_date),
    managerApproveDate: toNumOrNull(r.manager_approve_date),
    manager_signature: r.manager_signature || null,
    managerSignature: r.manager_signature || null,
    notes: r.notes || '',
  };
}

function mapToolCalibrationRow(r: any) {
  return {
    id: r.id,
    tool_asset_id: r.tool_asset_id,
    toolAssetId: r.tool_asset_id,
    assetId: r.tool_asset_id,
    request_date: toNumOrNull(r.request_date),
    requestDate: toNumOrNull(r.request_date),
    requested_by: r.requested_by || '',
    requestedBy: r.requested_by || '',
    status: r.status || 'PENDING',
    calibration_date: toNumOrNull(r.calibration_date),
    calibrationDate: toNumOrNull(r.calibration_date),
    next_calibration_date: toNumOrNull(r.next_calibration_date),
    nextCalibrationDate: toNumOrNull(r.next_calibration_date),
    certificate_url: r.certificate_url || '',
    certificateUrl: r.certificate_url || '',
    approved_by: r.approved_by || null,
    approvedBy: r.approved_by || null,
    notes: r.notes || '',
  };
}

export async function getToolCatalogs() {
  await ensureToolTables();
  const res = await query(`
    SELECT c.id, c.code, c.name, c.type, c.specifications, c.manual_markdown, c.manual_pdf_url,
           c.created_by, c.created_at, c.updated_at, c.version,
           COUNT(a.id) FILTER (WHERE a.deleted_at IS NULL)::int AS asset_count
    FROM ${SCHEMA}.tool_catalogs c
    LEFT JOIN ${SCHEMA}.tool_assets a ON a.catalog_id = c.id AND a.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY c.name ASC, c.code ASC
  `);
  return res.rows.map(mapToolCatalogRow);
}

export async function saveToolCatalog(catalog: any, actorId?: string | null) {
  await ensureToolTables();
  const id = String(catalog.id || crypto.randomUUID()).trim();
  const code = String(catalog.code || '').trim().toUpperCase();
  const name = String(catalog.name || '').trim();
  if (!code || !name) {
    throw Object.assign(new Error('Vui lòng nhập đầy đủ Mã loại và Tên danh mục CCDC.'), { statusCode: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const existingRes = await query(`SELECT * FROM ${SCHEMA}.tool_catalogs WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingRes.rows[0] || null;
  if (existing && existing.deleted_at != null) {
    throw Object.assign(new Error('Danh mục CCDC đã bị xóa mềm.'), { statusCode: 404 });
  }

  catalog = stripTransientMediaUrlParams(catalog);
  assertNoNewBase64DataUri(catalog, existing, 'Danh mục CCDC');

  if (existing && catalog.version !== undefined && existing.version !== undefined && Number(catalog.version) !== Number(existing.version)) {
    throw Object.assign(new Error('Danh mục CCDC đã được người khác cập nhật trước đó. Vui lòng tải lại.'), { statusCode: 409 });
  }

  const dupRes = await query(
    `SELECT id, deleted_at FROM ${SCHEMA}.tool_catalogs WHERE UPPER(TRIM(code)) = UPPER($1) AND id <> $2 LIMIT 1`,
    [code, id]
  );
  if (dupRes.rows.length > 0) {
    const dupRow = dupRes.rows[0];
    throw Object.assign(
      new Error(
        dupRow.deleted_at != null
          ? `Mã loại "${code}" đã từng tồn tại trong dữ liệu đã xóa. Vui lòng dùng mã khác.`
          : `Mã loại "${code}" đã tồn tại trong Kho Tổng.`
      ),
      { statusCode: 409 }
    );
  }

  const specifications = catalog.specifications ?? catalog.specification ?? existing?.specifications ?? '';
  const manualMarkdown = catalog.manual_markdown ?? catalog.manualMarkdown ?? existing?.manual_markdown ?? null;
  const manualPdfUrl = catalog.manual_pdf_url ?? catalog.manualPdfUrl ?? existing?.manual_pdf_url ?? null;
  const createdBy = existing?.created_by || catalog.created_by || catalog.createdBy || actorId || null;

  try {
    const savedRes = await query(
      `INSERT INTO ${SCHEMA}.tool_catalogs
         (id, code, name, type, specifications, manual_markdown, manual_pdf_url, created_by, created_at, updated_at, deleted_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, 1)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         specifications = EXCLUDED.specifications,
         manual_markdown = EXCLUDED.manual_markdown,
         manual_pdf_url = EXCLUDED.manual_pdf_url,
         updated_at = EXCLUDED.updated_at,
         deleted_at = NULL,
         version = COALESCE(${SCHEMA}.tool_catalogs.version, 1) + 1
       RETURNING *`,
      [
        id,
        code,
        name,
        String(catalog.type || '').trim() || 'Chung',
        specifications,
        manualMarkdown,
        manualPdfUrl,
        createdBy,
        existing?.created_at || toNumOrNull(catalog.created_at ?? catalog.createdAt) || now,
        now,
      ]
    );
    const saved = savedRes.rows[0];
    await writeAuditLog({
      userId: actorId || null,
      action: existing ? 'UPDATE_TOOL_CATALOG' : 'CREATE_TOOL_CATALOG',
      entityType: 'tool_catalog',
      entityId: id,
      oldValue: existing,
      newValue: saved || catalog,
    });
    return mapToolCatalogRow(saved);
  } catch (err: any) {
    if (err?.code === '23505') {
      throw Object.assign(new Error(`Mã loại "${code}" đã tồn tại.`), { statusCode: 409 });
    }
    throw err;
  }
}

export async function deleteToolCatalog(id: string, actorId?: string | null) {
  await ensureToolTables();
  const existingRes = await query(
    `SELECT * FROM ${SCHEMA}.tool_catalogs WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  if (existingRes.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy danh mục CCDC cần xóa.'), { statusCode: 404 });
  }
  const existing = existingRes.rows[0];

  const assetsCheck = await query(
    `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.tool_assets WHERE catalog_id = $1 AND deleted_at IS NULL`,
    [id]
  );
  const activeCount = Number(assetsCheck.rows[0]?.cnt || 0);
  if (activeCount > 0) {
    throw Object.assign(
      new Error(`Không thể xóa danh mục đang có ${activeCount} tài sản vật lý hoạt động.`),
      { statusCode: 409 }
    );
  }

  const nowTs = Math.floor(Date.now() / 1000);
  await query(
    `UPDATE ${SCHEMA}.tool_catalogs SET deleted_at = $1, updated_at = $1, version = COALESCE(version, 1) + 1 WHERE id = $2 AND deleted_at IS NULL`,
    [nowTs, id]
  );
  await writeAuditLog({
    userId: actorId || null,
    action: 'SOFT_DELETE_TOOL_CATALOG',
    entityType: 'tool_catalog',
    entityId: id,
    oldValue: existing,
    newValue: { deleted_at: nowTs },
  });
  return { success: true };
}

export async function getToolAssets() {
  await ensureToolTables();
  const res = await query(`
    SELECT a.id, a.catalog_id, a.asset_code, a.serial_number, a.current_user_id, a.next_calibration_date,
           a.status, a.created_at, a.updated_at, a.created_by, a.version,
           c.name AS catalog_name, c.code AS catalog_code, c.type AS catalog_type
    FROM ${SCHEMA}.tool_assets a
    LEFT JOIN ${SCHEMA}.tool_catalogs c ON a.catalog_id = c.id AND c.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
    ORDER BY a.created_at DESC NULLS LAST, a.asset_code ASC
  `);
  return res.rows.map(mapToolAssetRow);
}

export async function getToolAssetsByCatalog(catalogId: string) {
  await ensureToolTables();
  const res = await query(
    `SELECT a.id, a.catalog_id, a.asset_code, a.serial_number, a.current_user_id, a.next_calibration_date,
            a.status, a.created_at, a.updated_at, a.created_by, a.version,
            c.name AS catalog_name, c.code AS catalog_code, c.type AS catalog_type
     FROM ${SCHEMA}.tool_assets a
     LEFT JOIN ${SCHEMA}.tool_catalogs c ON a.catalog_id = c.id AND c.deleted_at IS NULL
     WHERE a.catalog_id = $1 AND a.deleted_at IS NULL
     ORDER BY a.created_at DESC NULLS LAST, a.asset_code ASC`,
    [catalogId]
  );
  return res.rows.map(mapToolAssetRow);
}

export async function saveToolAsset(asset: any, actorId?: string | null) {
  await ensureToolTables();
  const id = String(asset.id || crypto.randomUUID()).trim();
  const catalogId = String(asset.catalog_id || asset.catalogId || '').trim();
  const assetCode = String(asset.asset_code || asset.assetCode || '').trim().toUpperCase();
  if (!catalogId || !assetCode) {
    throw Object.assign(new Error('Vui lòng cung cấp Danh mục và Mã tài sản (Asset Tag).'), { statusCode: 400 });
  }

  const catalogRes = await query(
    `SELECT id, code, name, type FROM ${SCHEMA}.tool_catalogs WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [catalogId]
  );
  if (catalogRes.rows.length === 0) {
    throw Object.assign(new Error('Danh mục CCDC gốc không tồn tại hoặc đã bị xóa.'), { statusCode: 404 });
  }
  const catRow = catalogRes.rows[0];

  const now = Math.floor(Date.now() / 1000);
  const existingRes = await query(`SELECT * FROM ${SCHEMA}.tool_assets WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingRes.rows[0] || null;
  if (existing && existing.deleted_at != null) {
    throw Object.assign(new Error('Thiết bị CCDC đã bị xóa mềm.'), { statusCode: 404 });
  }

  asset = stripTransientMediaUrlParams(asset);
  assertNoNewBase64DataUri(asset, existing, 'Thiết bị CCDC');

  if (existing && asset.version !== undefined && existing.version !== undefined && Number(asset.version) !== Number(existing.version)) {
    throw Object.assign(new Error('Thiết bị CCDC đã được người khác cập nhật trước đó. Vui lòng tải lại.'), { statusCode: 409 });
  }

  const dupRes = await query(
    `SELECT id, deleted_at FROM ${SCHEMA}.tool_assets WHERE UPPER(TRIM(asset_code)) = UPPER($1) AND id <> $2 LIMIT 1`,
    [assetCode, id]
  );
  if (dupRes.rows.length > 0) {
    const dupRow = dupRes.rows[0];
    throw Object.assign(
      new Error(
        dupRow.deleted_at != null
          ? `Mã tài sản "${assetCode}" đã từng tồn tại trong dữ liệu đã xóa. Vui lòng dùng mã khác.`
          : `Mã tài sản "${assetCode}" đã tồn tại.`
      ),
      { statusCode: 409 }
    );
  }

  const rawOwner = asset.current_user_id !== undefined ? asset.current_user_id : asset.currentUserId;
  const normalizedOwner =
    rawOwner === undefined
      ? existing?.current_user_id || null
      : !rawOwner || String(rawOwner).toUpperCase().trim() === 'KHO_TONG'
        ? null
        : String(rawOwner).trim();
  const nextCalibDate =
    asset.next_calibration_date !== undefined || asset.nextCalibrationDate !== undefined
      ? toNumOrNull(asset.next_calibration_date ?? asset.nextCalibrationDate)
      : toNumOrNull(existing?.next_calibration_date);
  const status = String(asset.status || existing?.status || (normalizedOwner ? 'IN_USE' : 'AVAILABLE')).trim().toUpperCase();
  const serialNumber = asset.serial_number ?? asset.serialNumber ?? existing?.serial_number ?? null;
  const createdBy = existing?.created_by || asset.created_by || asset.createdBy || actorId || null;

  try {
    const savedRes = await query(
      `INSERT INTO ${SCHEMA}.tool_assets
         (id, catalog_id, asset_code, serial_number, current_user_id, next_calibration_date, status, created_at, updated_at, created_by, deleted_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, 1)
       ON CONFLICT (id) DO UPDATE SET
         catalog_id = EXCLUDED.catalog_id,
         asset_code = EXCLUDED.asset_code,
         serial_number = EXCLUDED.serial_number,
         current_user_id = EXCLUDED.current_user_id,
         next_calibration_date = EXCLUDED.next_calibration_date,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         deleted_at = NULL,
         version = COALESCE(${SCHEMA}.tool_assets.version, 1) + 1
       RETURNING *`,
      [
        id,
        catalogId,
        assetCode,
        serialNumber ? String(serialNumber).trim() : null,
        normalizedOwner,
        nextCalibDate,
        status,
        existing?.created_at || toNumOrNull(asset.created_at ?? asset.createdAt) || now,
        now,
        createdBy,
      ]
    );
    const saved = savedRes.rows[0];
    await writeAuditLog({
      userId: actorId || null,
      action: existing ? 'UPDATE_TOOL_ASSET' : 'CREATE_TOOL_ASSET',
      entityType: 'tool_asset',
      entityId: id,
      oldValue: existing,
      newValue: saved || asset,
    });
    return mapToolAssetRow({
      ...saved,
      catalog_code: catRow.code,
      catalog_name: catRow.name,
      catalog_type: catRow.type,
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      throw Object.assign(new Error(`Mã tài sản "${assetCode}" đã tồn tại.`), { statusCode: 409 });
    }
    throw err;
  }
}

export async function deleteToolAsset(id: string, actorId?: string | null) {
  await ensureToolTables();
  const existingRes = await query(
    `SELECT * FROM ${SCHEMA}.tool_assets WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  if (existingRes.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy tài sản CCDC cần xóa.'), { statusCode: 404 });
  }
  const existing = existingRes.rows[0];
  const nowTs = Math.floor(Date.now() / 1000);
  await query(
    `UPDATE ${SCHEMA}.tool_assets SET deleted_at = $1, updated_at = $1, version = COALESCE(version, 1) + 1 WHERE id = $2 AND deleted_at IS NULL`,
    [nowTs, id]
  );
  await writeAuditLog({
    userId: actorId || null,
    action: 'SOFT_DELETE_TOOL_ASSET',
    entityType: 'tool_asset',
    entityId: id,
    oldValue: existing,
    newValue: { deleted_at: nowTs },
  });
  return { success: true };
}

export async function getToolTransfers(assetId: string) {
  await ensureToolTables();
  const res = await query(
    `SELECT id, tool_asset_ids, from_user_id, to_user_id, status, request_date,
            receiver_confirm_date, receiver_signature, receiver_image,
            manager_approve_date, manager_signature, notes
     FROM ${SCHEMA}.tool_transfers
     WHERE tool_asset_ids ? $1
     ORDER BY request_date DESC NULLS LAST, id DESC`,
    [assetId]
  );
  return res.rows.map(mapToolTransferRow);
}

function actorMatchesTargetUser(actorUser: any, actorId: string | null | undefined, targetUserId: string | null | undefined): boolean {
  const cleanTarget = String(targetUserId || '').trim().toLowerCase();
  if (!cleanTarget || cleanTarget === 'kho_tong') return false;
  const candidates = [
    actorId,
    actorUser?.id,
    actorUser?.username,
    actorUser?.msnv,
    actorUser?.email,
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  return candidates.includes(cleanTarget);
}

export async function saveToolTransfer(
  transfer: any,
  actorId?: string | null,
  options?: { actorCanManage?: boolean; actorUser?: any }
) {
  await ensureToolTables();
  const actorCanManage = Boolean(options?.actorCanManage);
  const actorUser = options?.actorUser || null;
  const id = String(transfer.id || `TRF_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`).trim();
  const now = Math.floor(Date.now() / 1000);

  const existingRes = await query(`SELECT * FROM ${SCHEMA}.tool_transfers WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingRes.rows[0] || null;

  transfer = stripTransientMediaUrlParams(transfer);
  // Tolerate pre-existing legacy signatures while strictly blocking any newly submitted Base64 payloads
  assertNoNewBase64DataUri(transfer, existing, 'Luân chuyển CCDC');

  if (!existing) {
    // STEP 1: Create PENDING transfer request WITHOUT transferring ownership yet
    const assetIds = parseJsonStringArray(
      transfer.tool_asset_ids ?? transfer.toolAssetIds ?? (transfer.tool_asset_id || transfer.assetId ? [transfer.tool_asset_id || transfer.assetId] : [])
    );
    if (assetIds.length === 0) {
      throw Object.assign(new Error('Vui lòng chọn ít nhất một thiết bị CCDC để tạo phiếu luân chuyển.'), { statusCode: 400 });
    }

    const rawToUser = String(transfer.to_user_id ?? transfer.toUserId ?? '').trim();
    if (!rawToUser) {
      throw Object.assign(new Error('Vui lòng chọn Người nhận hoặc Thu hồi về Kho Tổng.'), { statusCode: 400 });
    }
    const toUserId = rawToUser.toUpperCase() === 'KHO' || rawToUser.toUpperCase() === 'KHO_TONG' ? 'KHO_TONG' : rawToUser;
    const fromUserId = String(transfer.from_user_id ?? transfer.fromUserId ?? actorId ?? '').trim() || null;

    const validAssetsRes = await query(
      `SELECT id FROM ${SCHEMA}.tool_assets WHERE id = ANY($1::text[]) AND deleted_at IS NULL`,
      [assetIds]
    );
    if (validAssetsRes.rows.length !== assetIds.length) {
      throw Object.assign(new Error('Một hoặc nhiều thiết bị được chọn không tồn tại hoặc đã bị xóa.'), { statusCode: 404 });
    }

    const reqDate = toNumOrNull(transfer.request_date ?? transfer.requestDate) || now;
    const savedRes = await query(
      `INSERT INTO ${SCHEMA}.tool_transfers
         (id, tool_asset_ids, from_user_id, to_user_id, status, request_date,
          receiver_confirm_date, receiver_signature, receiver_image,
          manager_approve_date, manager_signature, notes)
       VALUES ($1, $2::jsonb, $3, $4, 'PENDING', $5, NULL, NULL, NULL, NULL, NULL, $6)
       RETURNING *`,
      [id, JSON.stringify(assetIds), fromUserId, toUserId, reqDate, transfer.notes || null]
    );
    const saved = savedRes.rows[0];
    await writeAuditLog({
      userId: actorId || null,
      action: 'CREATE_TOOL_TRANSFER',
      entityType: 'tool_transfer',
      entityId: id,
      newValue: saved,
    });
    return mapToolTransferRow(saved);
  }

  // Existing transfer state transitions
  const currentStatus = String(existing.status || 'PENDING').toUpperCase().trim();
  if (currentStatus === 'APPROVED') {
    throw Object.assign(new Error('Phiếu luân chuyển đã hoàn tất phê duyệt (APPROVED), không thể chỉnh sửa.'), { statusCode: 403 });
  }

  const existingAssetIds = parseJsonStringArray(existing.tool_asset_ids);
  const incomingStatus = String(transfer.status || currentStatus).toUpperCase().trim();
  const isManagerApprovalAttempt =
    incomingStatus === 'APPROVED' ||
    Boolean(transfer.manager_approve_date ?? transfer.managerApproveDate) ||
    Boolean(transfer.manager_signature ?? transfer.managerSignature);

  if (isManagerApprovalAttempt) {
    // STEP 2B: Manager approves -> commit ownership change on all assets
    if (!actorCanManage) {
      throw Object.assign(new Error('Từ chối truy cập: Chỉ Quản lý CCDC mới có quyền phê duyệt quyết định luân chuyển.'), { statusCode: 403 });
    }
    const receiverConfirmedAt =
      toNumOrNull(existing.receiver_confirm_date) ||
      toNumOrNull(transfer.receiver_confirm_date ?? transfer.receiverConfirmDate);
    const receiverSignature =
      existing.receiver_signature || transfer.receiver_signature || transfer.receiverSignature || null;
    if (!receiverConfirmedAt || !receiverSignature) {
      throw Object.assign(new Error('Phiếu luân chuyển phải có xác nhận ký nhận của người nhận trước khi Quản lý phê duyệt.'), { statusCode: 400 });
    }
    const managerSignature = String(transfer.manager_signature ?? transfer.managerSignature ?? '').trim();
    if (!managerSignature) {
      throw Object.assign(new Error('Vui lòng ký tên quản lý để phê duyệt luân chuyển.'), { statusCode: 400 });
    }
    const managerApproveDate = toNumOrNull(transfer.manager_approve_date ?? transfer.managerApproveDate) || now;

    const savedRes = await query(
      `UPDATE ${SCHEMA}.tool_transfers
       SET status = 'APPROVED',
           manager_approve_date = $1,
           manager_signature = $2,
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [managerApproveDate, managerSignature, transfer.notes ?? null, id]
    );
    const saved = savedRes.rows[0];

    const isReturnToWarehouse = String(existing.to_user_id || '').toUpperCase().trim() === 'KHO_TONG';
    const nextOwner = isReturnToWarehouse ? null : existing.to_user_id;
    const nextAssetStatus = isReturnToWarehouse ? 'AVAILABLE' : 'IN_USE';

    if (existingAssetIds.length > 0) {
      await query(
        `UPDATE ${SCHEMA}.tool_assets
         SET current_user_id = $1,
             status = $2,
             updated_at = $3,
             version = COALESCE(version, 1) + 1
         WHERE id = ANY($4::text[]) AND deleted_at IS NULL`,
        [nextOwner, nextAssetStatus, now, existingAssetIds]
      );
    }

    await writeAuditLog({
      userId: actorId || null,
      action: 'APPROVE_TOOL_TRANSFER',
      entityType: 'tool_transfer',
      entityId: id,
      oldValue: existing,
      newValue: { ...saved, updatedAssetIds: existingAssetIds, nextOwner, nextAssetStatus },
    });
    return mapToolTransferRow(saved);
  }

  // STEP 2A: Receiver signs confirmation -> remains PENDING until Manager approves
  const isWarehouseReturn = String(existing.to_user_id || '').toUpperCase().trim() === 'KHO_TONG';
  const isRecipient = actorMatchesTargetUser(actorUser, actorId, existing.to_user_id);
  if (!isRecipient && !(isWarehouseReturn && actorCanManage)) {
    throw Object.assign(
      new Error('Từ chối truy cập: Chỉ người nhận được chỉ định (hoặc Quản lý khi thu hồi về Kho Tổng) mới có thể ký xác nhận.'),
      { statusCode: 403 }
    );
  }

  const receiverSignature = String(transfer.receiver_signature ?? transfer.receiverSignature ?? '').trim();
  if (!receiverSignature) {
    throw Object.assign(new Error('Bắt buộc phải ký tên xác nhận đã nhận đủ thiết bị!'), { statusCode: 400 });
  }
  const receiverImage = transfer.receiver_image ?? transfer.receiverImage ?? existing.receiver_image ?? null;
  const receiverConfirmDate = toNumOrNull(transfer.receiver_confirm_date ?? transfer.receiverConfirmDate) || now;

  const savedRes = await query(
    `UPDATE ${SCHEMA}.tool_transfers
     SET receiver_confirm_date = $1,
         receiver_signature = $2,
         receiver_image = $3,
         notes = COALESCE($4, notes),
         status = 'PENDING'
     WHERE id = $5
     RETURNING *`,
    [receiverConfirmDate, receiverSignature, receiverImage, transfer.notes ?? null, id]
  );
  const saved = savedRes.rows[0];

  await writeAuditLog({
    userId: actorId || null,
    action: 'CONFIRM_TOOL_TRANSFER_RECEIPT',
    entityType: 'tool_transfer',
    entityId: id,
    oldValue: existing,
    newValue: saved,
  });
  return mapToolTransferRow(saved);
}

export async function getToolCalibrations(assetId: string) {
  await ensureToolTables();
  const res = await query(
    `SELECT id, tool_asset_id, request_date, requested_by, status,
            calibration_date, next_calibration_date, certificate_url, approved_by, notes
     FROM ${SCHEMA}.tool_calibrations
     WHERE tool_asset_id = $1
     ORDER BY request_date DESC NULLS LAST, id DESC`,
    [assetId]
  );
  return res.rows.map(mapToolCalibrationRow);
}

export async function saveToolCalibration(
  calib: any,
  actorId?: string | null,
  options?: { actorCanManage?: boolean }
) {
  await ensureToolTables();
  const actorCanManage = Boolean(options?.actorCanManage);
  const id = String(calib.id || `CAL_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`).trim();
  const now = Math.floor(Date.now() / 1000);
  const existingRes = await query(`SELECT * FROM ${SCHEMA}.tool_calibrations WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingRes.rows[0] || null;

  const toolAssetId = String(calib.tool_asset_id || calib.toolAssetId || calib.assetId || existing?.tool_asset_id || '').trim();
  if (!toolAssetId) {
    throw Object.assign(new Error('Thiếu mã định danh tài sản cần hiệu chuẩn.'), { statusCode: 400 });
  }

  const assetCheck = await query(
    `SELECT id FROM ${SCHEMA}.tool_assets WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [toolAssetId]
  );
  if (assetCheck.rows.length === 0) {
    throw Object.assign(new Error('Thiết bị CCDC cần hiệu chuẩn không tồn tại hoặc đã bị xóa.'), { statusCode: 404 });
  }

  calib = stripTransientMediaUrlParams(calib);
  assertNoNewBase64DataUri(calib, existing, 'Hiệu chuẩn CCDC');

  if (!existing) {
    const requestedBy = String(calib.requested_by || calib.requestedBy || actorId || '').trim();
    if (!requestedBy) {
      throw Object.assign(new Error('Thiếu thông tin người yêu cầu hiệu chuẩn.'), { statusCode: 400 });
    }
    const requestDate = toNumOrNull(calib.request_date ?? calib.requestDate) || now;
    const savedRes = await query(
      `INSERT INTO ${SCHEMA}.tool_calibrations
         (id, tool_asset_id, request_date, requested_by, status, calibration_date, next_calibration_date, certificate_url, approved_by, notes)
       VALUES ($1, $2, $3, $4, 'PENDING', NULL, NULL, $5, NULL, $6)
       RETURNING *`,
      [id, toolAssetId, requestDate, requestedBy, calib.certificate_url ?? calib.certificateUrl ?? null, calib.notes || '']
    );
    const saved = savedRes.rows[0];
    await writeAuditLog({
      userId: actorId || null,
      action: 'REQUEST_TOOL_CALIBRATION',
      entityType: 'tool_calibration',
      entityId: id,
      newValue: saved,
    });
    return mapToolCalibrationRow(saved);
  }

  if (String(existing.status || '').toUpperCase().trim() === 'COMPLETED') {
    throw Object.assign(new Error('Phiếu hiệu chuẩn đã hoàn tất (COMPLETED), không thể chỉnh sửa.'), { statusCode: 403 });
  }

  const nextStatus = String(calib.status || existing.status || 'PENDING').toUpperCase().trim();
  if (nextStatus === 'COMPLETED') {
    if (!actorCanManage) {
      throw Object.assign(new Error('Từ chối truy cập: Chỉ Quản lý CCDC mới có quyền duyệt hoàn tất hiệu chuẩn.'), { statusCode: 403 });
    }
    const nextCalibDate = toNumOrNull(calib.next_calibration_date ?? calib.nextCalibrationDate ?? calib.nextDueDate);
    if (!nextCalibDate) {
      throw Object.assign(new Error('Vui lòng thiết lập ngày hiệu chuẩn tiếp theo.'), { statusCode: 400 });
    }
    const calibDate = toNumOrNull(calib.calibration_date ?? calib.calibrationDate) || now;
    const approvedBy = actorId || calib.approved_by || calib.approvedBy || null;
    const certUrl = calib.certificate_url ?? calib.certificateUrl ?? existing.certificate_url ?? null;

    const savedRes = await query(
      `UPDATE ${SCHEMA}.tool_calibrations
       SET status = 'COMPLETED',
           calibration_date = $1,
           next_calibration_date = $2,
           certificate_url = $3,
           approved_by = $4,
           notes = $5
       WHERE id = $6
       RETURNING *`,
      [calibDate, nextCalibDate, certUrl, approvedBy, calib.notes ?? existing.notes ?? '', id]
    );
    const saved = savedRes.rows[0];

    await query(
      `UPDATE ${SCHEMA}.tool_assets
       SET next_calibration_date = $1,
           updated_at = $2,
           version = COALESCE(version, 1) + 1
       WHERE id = $3 AND deleted_at IS NULL`,
      [nextCalibDate, now, toolAssetId]
    );

    await writeAuditLog({
      userId: actorId || null,
      action: 'COMPLETE_TOOL_CALIBRATION',
      entityType: 'tool_calibration',
      entityId: id,
      oldValue: existing,
      newValue: saved,
    });
    return mapToolCalibrationRow(saved);
  }

  const savedRes = await query(
    `UPDATE ${SCHEMA}.tool_calibrations
     SET certificate_url = COALESCE($1, certificate_url),
         notes = COALESCE($2, notes)
     WHERE id = $3
     RETURNING *`,
    [calib.certificate_url ?? calib.certificateUrl ?? null, calib.notes ?? null, id]
  );
  const saved = savedRes.rows[0];
  await writeAuditLog({
    userId: actorId || null,
    action: 'UPDATE_TOOL_CALIBRATION',
    entityType: 'tool_calibration',
    entityId: id,
    oldValue: existing,
    newValue: saved,
  });
  return mapToolCalibrationRow(saved);
}


// --- SUPPLIER STATS & DETAILS API ---
export async function getSupplierStats(name: string) {
  if (!name) return { totalReports: 0, passedReports: 0, failedReports: 0, passRate: 100 };
  const res = await query(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('APPROVED','COMPLETED','VERIFIED','PASSED','PASS','LOCKED'))::int as passed,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('REJECTED','FLAGGED','FAILED','REJECT'))::int as failed
    FROM ${SCHEMA}.inspections
    WHERE (UPPER(COALESCE(ma_nha_may,'')) = UPPER($1) OR UPPER(COALESCE(workshop,'')) = UPPER($1))
      AND COALESCE(UPPER(status), '') <> 'DELETED'
  `, [name]);
  
  const row = res.rows[0] || { total: 0, passed: 0, failed: 0 };
  const total = row.total || 0;
  const passed = row.passed || 0;
  const failed = row.failed || 0;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
  return { totalReports: total, passedReports: passed, failedReports: failed, passRate };
}

export async function getSupplierInspections(name: string) {
  if (!name) return [];
  const res = await query(`
    SELECT id, type, po_number, ma_ct, ten_ct, ten_hang_muc, ma_nha_may as supplier, workshop, status, date, score, created_at
    FROM ${SCHEMA}.inspections
    WHERE (UPPER(COALESCE(ma_nha_may,'')) = UPPER($1) OR UPPER(COALESCE(workshop,'')) = UPPER($1))
      AND COALESCE(UPPER(status), '') <> 'DELETED'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 100
  `, [name]);
  return res.rows;
}

export async function getSupplierMaterials(name: string) {
  if (!name) return [];
  const res = await query(`
    SELECT DISTINCT ten_hang_muc, po_number, ma_ct, ten_ct
    FROM ${SCHEMA}.inspections
    WHERE (UPPER(COALESCE(ma_nha_may,'')) = UPPER($1) OR UPPER(COALESCE(workshop,'')) = UPPER($1))
      AND ten_hang_muc IS NOT NULL
      AND COALESCE(UPPER(status), '') <> 'DELETED'
    LIMIT 100
  `, [name]);
  return res.rows;
}








