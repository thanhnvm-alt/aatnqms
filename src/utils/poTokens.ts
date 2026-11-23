import { BookingSupplierMismatchWarning } from '../../types.js';

const PLACEHOLDER_TOKENS = new Set(['---', '--', 'n/a', 'na', 'null', 'undefined', 'none']);

export const MAX_BOOKING_PO_TOKENS = 50;
export const MAX_BOOKING_PO_TOKEN_LEN = 64;

/**
 * Splits a raw PO/PR string (or array of strings) into deduplicated, trimmed tokens.
 * Splits on comma, semicolon, newline, slash or pipe. Preserves first-seen casing.
 */
export function splitPoTokens(
  raw?: string | string[] | null,
  options?: { minLength?: number; maxTokens?: number }
): string[] {
  const minLen = options?.minLength ?? 2;
  const maxTokens = options?.maxTokens ?? MAX_BOOKING_PO_TOKENS;
  const inputs = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of inputs) {
    if (entry === null || entry === undefined) continue;
    const parts = String(entry)
      .split(/[,;\n|]+/)
      .map((s) => s.trim().slice(0, MAX_BOOKING_PO_TOKEN_LEN))
      .filter(Boolean);

    for (const part of parts) {
      if (part.length < minLen) continue;
      const lower = part.toLowerCase();
      if (PLACEHOLDER_TOKENS.has(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(part);
      if (out.length >= maxTokens) return out;
    }
  }

  return out;
}

export function normalizePoCompareKey(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Collects all unique PO / PR tokens across a booking's header poNumber, poNumbers, prNumber,
 * and every item row's poNumber / prNumber.
 */
export function collectBookingAllPoTokens(booking?: {
  poNumber?: string | null;
  poNumbers?: string[] | null;
  prNumber?: string | null;
  items?: Array<{
    poNumber?: string | null;
    po_number?: string | null;
    prNumber?: string | null;
    pr_number?: string | null;
  }> | null;
}): string[] {
  if (!booking) return [];
  const rawInputs: Array<string | string[] | null | undefined> = [
    booking.poNumbers,
    booking.poNumber,
    booking.prNumber,
  ];
  if (Array.isArray(booking.items)) {
    for (const it of booking.items) {
      if (!it) continue;
      rawInputs.push(it.poNumber, it.po_number, it.prNumber, it.pr_number);
    }
  }
  return splitPoTokens(rawInputs as any);
}

/**
 * Formats a compact display summary for multi-PO/PR bookings across tables, cards & badges.
 */
export function formatBookingPoSummary(booking?: {
  poNumber?: string | null;
  poNumbers?: string[] | null;
  prNumber?: string | null;
  items?: any[] | null;
}): {
  primaryPo: string;
  additionalPos: string[];
  additionalCount: number;
  allPos: string[];
  joinedPo: string;
} {
  const allPos = collectBookingAllPoTokens(booking);
  const primaryPo = allPos[0] || String(booking?.poNumber || '').trim();
  const additionalPos = allPos.slice(1);
  return {
    primaryPo,
    additionalPos,
    additionalCount: additionalPos.length,
    allPos,
    joinedPo: allPos.join(', ') || primaryPo,
  };
}

export function normalizeSupplierCompareKey(name?: string | null): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function areSuppliersDifferent(a?: string | null, b?: string | null): boolean {
  const na = normalizeSupplierCompareKey(a);
  const nb = normalizeSupplierCompareKey(b);
  if (!na || !nb) return false;
  return na !== nb;
}

export function computeSupplierMismatchWarnings(
  currentSupplier: string | undefined | null,
  sources: Array<{ poNumber?: string | null; supplierName?: string | null }>
): BookingSupplierMismatchWarning[] {
  const cur = String(currentSupplier || '').trim();
  if (!cur) return [];

  const warnings: BookingSupplierMismatchWarning[] = [];
  const seen = new Set<string>();

  for (const src of sources) {
    const exp = String(src.supplierName || '').trim();
    const poTokens = splitPoTokens(src.poNumber);
    if (!exp || poTokens.length === 0) continue;
    if (!areSuppliersDifferent(cur, exp)) continue;

    for (const tok of poTokens) {
      const key = `${tok.toLowerCase()}::${normalizeSupplierCompareKey(exp)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        poNumber: tok,
        expectedSupplier: exp,
        currentSupplier: cur,
      });
    }
  }

  return warnings;
}
