export const MAX_QTY_DECIMALS = 4;
export const QTY_SCALE = 10 ** MAX_QTY_DECIMALS;

/**
 * Làm tròn số theo tối đa 4 chữ số thập phân, khử sai số dấu phẩy động IEEE-754.
 */
export function roundQty(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const stabilized = Number(val.toFixed(8));
  return Math.round(stabilized * QTY_SCALE) / QTY_SCALE;
}

/**
 * Chuyển đổi giá trị bất kỳ (số hoặc chuỗi có `,`/`.`) sang số chuẩn tối đa 4 chữ số thập phân.
 */
export function parseQty(val: unknown): number {
  if (typeof val === 'number') {
    return roundQty(val);
  }
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/,/g, '.');
    if (!cleaned || cleaned === '.' || cleaned === '-') return 0;
    const num = Number(cleaned);
    return Number.isFinite(num) ? roundQty(num) : 0;
  }
  return 0;
}

/**
 * Quy đổi về số nguyên theo hệ số 10.000 để cộng/trừ/so sánh chính xác tuyệt đối.
 */
export function toScaledQty(val: unknown): number {
  return Math.round(parseQty(val) * QTY_SCALE);
}

/**
 * Chuẩn hóa chuỗi người dùng đang nhập: chấp nhận cả `,` và `.` -> `.`,
 * chỉ giữ 1 dấu `.` và tối đa 4 chữ số thập phân, bảo toàn trạng thái gõ dở ("20.", "20.80").
 */
export function sanitizeDecimalInput(raw: unknown, maxDecimals: number = MAX_QTY_DECIMALS): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return '';
    return String(roundQty(Math.max(0, raw)));
  }
  let s = String(raw).replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (!s) return '';
  if (s.startsWith('.')) {
    s = `0${s}`;
  }
  const firstDot = s.indexOf('.');
  if (firstDot === -1) return s;
  const intPart = s.slice(0, firstDot);
  const fracPart = s.slice(firstDot + 1).replace(/\./g, '').slice(0, Math.max(0, maxDecimals));
  return `${intPart}.${fracPart}`;
}

export function addQty(...vals: unknown[]): number {
  const totalScaled = vals.reduce<number>((sum, v) => sum + toScaledQty(v), 0);
  return totalScaled / QTY_SCALE;
}

export function subQty(a: unknown, b: unknown): number {
  return (toScaledQty(a) - toScaledQty(b)) / QTY_SCALE;
}

export function sumQty(vals: unknown[]): number {
  const totalScaled = vals.reduce<number>((sum, v) => sum + toScaledQty(v), 0);
  return totalScaled / QTY_SCALE;
}

export function compareQty(a: unknown, b: unknown): -1 | 0 | 1 {
  const sa = toScaledQty(a);
  const sb = toScaledQty(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

export function isQtyEqual(a: unknown, b: unknown): boolean {
  return toScaledQty(a) === toScaledQty(b);
}

export function isQtyGreater(a: unknown, b: unknown): boolean {
  return toScaledQty(a) > toScaledQty(b);
}

export function isQtySumEqual(passed: unknown, failed: unknown, inspected: unknown): boolean {
  return toScaledQty(passed) + toScaledQty(failed) === toScaledQty(inspected);
}

export function isQtySumOver(passed: unknown, failed: unknown, inspected: unknown): boolean {
  return toScaledQty(passed) + toScaledQty(failed) > toScaledQty(inspected);
}

export function calcQtyRatePercent(part: unknown, total: unknown, fractionDigits: number = 1): string {
  const totalScaled = toScaledQty(total);
  if (totalScaled <= 0) return (0).toFixed(fractionDigits);
  const partScaled = toScaledQty(part);
  return ((partScaled / totalScaled) * 100).toFixed(fractionDigits);
}

export function normalizePayloadQuantities<T extends Record<string, any>>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  const next: any = { ...payload };
  const topKeys = ['so_luong_ipo', 'inspectedQuantity', 'passedQuantity', 'failedQuantity'] as const;
  for (const key of topKeys) {
    if (next[key] !== undefined && next[key] !== null && next[key] !== '') {
      next[key] = Math.max(0, parseQty(next[key]));
    } else if (next[key] === '') {
      next[key] = 0;
    }
  }
  if (Array.isArray(next.materials)) {
    next.materials = next.materials.map((m: any) => {
      if (!m || typeof m !== 'object') return m;
      const matCopy: any = { ...m };
      for (const mk of ['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'] as const) {
        if (matCopy[mk] !== undefined && matCopy[mk] !== null && matCopy[mk] !== '') {
          matCopy[mk] = Math.max(0, parseQty(matCopy[mk]));
        } else if (matCopy[mk] === '') {
          matCopy[mk] = 0;
        }
      }
      return matCopy;
    });
  }
  return next as T;
}
