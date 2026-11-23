import {
  BookingAttachmentItem,
  BookingDocumentCategory,
  CheckItem,
  CheckStatus,
  Inspection,
  MaterialIQC,
  ModuleId,
  SubcontractorBooking,
  SubcontractorBookingDocuments,
} from '../../types.js';
import { collectBookingAllPoTokens, splitPoTokens } from './poTokens.js';

export interface BookingDocumentGroupConfig {
  key: BookingDocumentCategory;
  field: 'prPoFiles' | 'qualityAgreementFiles' | 'sampleImages' | 'specDrawings';
  order: number;
  title: string;
  shortTitle: string;
  description: string;
  accept: string;
  allowCamera?: boolean;
  emptyText: string;
}

export const BOOKING_DOCUMENT_GROUPS: BookingDocumentGroupConfig[] = [
  {
    key: 'PR_PO',
    field: 'prPoFiles',
    order: 1,
    title: '1. Thông tin PR / PO',
    shortTitle: 'PR / PO',
    description: 'Đơn đặt hàng, bảng kê vật tư ERP (PDF, Excel, Word, Ảnh hoặc Link)',
    accept: '.pdf,.xlsx,.xls,.csv,.doc,.docx,image/*',
    allowCamera: false,
    emptyText: 'Chưa đính kèm chứng từ PR / PO',
  },
  {
    key: 'QUALITY_AGREEMENT',
    field: 'qualityAgreementFiles',
    order: 2,
    title: '2. Biên bản thống nhất CL / Biểu mẫu Book QC',
    shortTitle: 'Biên bản CL / Book QC',
    description: 'Biên bản thỏa thuận chất lượng, biểu mẫu xác nhận Book QC',
    accept: '.pdf,.doc,.docx,.xlsx,.xls,image/*',
    allowCamera: false,
    emptyText: 'Chưa đính kèm biên bản thống nhất chất lượng',
  },
  {
    key: 'SAMPLE_IMAGE',
    field: 'sampleImages',
    order: 3,
    title: '3. Hình ảnh mẫu / Sản phẩm tại NCC',
    shortTitle: 'Ảnh mẫu / SP tại NCC',
    description: 'Ảnh mẫu duyệt đối chứng, ảnh thực tế hàng hóa tại xưởng vệ tinh',
    accept: 'image/*,.pdf',
    allowCamera: true,
    emptyText: 'Chưa có hình ảnh mẫu / sản phẩm tại NCC',
  },
  {
    key: 'SPEC_DRAWING',
    field: 'specDrawings',
    order: 4,
    title: '4. Spec / Bản vẽ kỹ thuật',
    shortTitle: 'Spec / Bản vẽ',
    description: 'Thông số kỹ thuật, Shopdrawing, bản vẽ chi tiết (PDF, Ảnh, DWG, ZIP)',
    accept: '.pdf,image/*,.dwg,.dxf,.zip,.xlsx,.docx',
    allowCamera: false,
    emptyText: 'Chưa đính kèm Spec / Bản vẽ kỹ thuật',
  },
];

export type NormalizedBookingDocuments = {
  prPoFiles: BookingAttachmentItem[];
  qualityAgreementFiles: BookingAttachmentItem[];
  sampleImages: BookingAttachmentItem[];
  specDrawings: BookingAttachmentItem[];
};

const STORAGE_FILES_PREFIX = '/api/storage/files/';

export function stripStorageSignedQuery(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(STORAGE_FILES_PREFIX)) {
    return trimmed.split('?')[0];
  }
  return trimmed;
}

export function getAttachmentActionUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(STORAGE_FILES_PREFIX) || trimmed.includes(STORAGE_FILES_PREFIX)) {
    if (trimmed.includes('sig=') || trimmed.includes('token=')) {
      return trimmed;
    }
    try {
      const token = localStorage.getItem('aatn_qms_token') || sessionStorage.getItem('aatn_qms_token') || '';
      if (token) {
        return trimmed.includes('?')
          ? `${trimmed}&token=${encodeURIComponent(token)}`
          : `${trimmed}?token=${encodeURIComponent(token)}`;
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function isValidAttachmentUrl(rawUrl: string): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/storage/files/') || trimmed.startsWith('/uploads/')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isGoogleDriveUrl(url: string): boolean {
  const lower = String(url || '').toLowerCase();
  return lower.includes('drive.google.com') || lower.includes('docs.google.com') || lower.includes('lh3.googleusercontent.com');
}

export function isImageAttachment(item: { url?: string; name?: string; mimeType?: string }): boolean {
  const mime = String(item?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (mime && mime !== 'application/octet-stream') return false;
  const cleanUrl = String(item?.url || '').split('?')[0].toLowerCase();
  const cleanName = String(item?.name || '').toLowerCase();
  const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.heic', '.heif'];
  return imgExts.some((ext) => cleanUrl.endsWith(ext) || cleanName.endsWith(ext));
}

export function getFileExtBadge(item: { url?: string; name?: string; mimeType?: string; sourceType?: string }): string {
  if (isGoogleDriveUrl(item?.url || '')) return 'DRIVE';
  if (isImageAttachment(item)) return 'ẢNH';
  const target = (String(item?.name || '') || String(item?.url || '').split('?')[0]).toLowerCase();
  const match = target.match(/\.([a-z0-9]{2,5})$/i);
  if (match) return match[1].toUpperCase();
  if (item?.sourceType === 'LINK') return 'LINK';
  return 'FILE';
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractFileNameFromUrl(rawUrl: string, fallback: string = 'Tài liệu đính kèm'): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return fallback;
  if (isGoogleDriveUrl(trimmed)) return 'Liên kết Google Drive';
  try {
    const cleanPath = trimmed.split('?')[0];
    const lastSeg = decodeURIComponent(cleanPath.split('/').filter(Boolean).pop() || '');
    // Strip generated timestamp/uuid prefix `1732000000_abcd1234_role_` if present
    const stripped = lastSeg.replace(/^\d{10,14}_[a-f0-9]{6,10}_(?:[a-z0-9_-]+_)?/i, '');
    return stripped || lastSeg || fallback;
  } catch {
    return fallback;
  }
}

function normalizeItem(
  raw: any,
  category: BookingDocumentCategory,
  fallbackLabel: string,
  index: number
): BookingAttachmentItem | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const url = raw.trim();
    if (!url) return null;
    return {
      id: `doc_${category}_${index}`,
      name: extractFileNameFromUrl(url, fallbackLabel),
      url,
      category,
      sourceType: url.startsWith('/api/storage/files/') || url.startsWith('/uploads/') ? 'UPLOAD' : 'LINK',
    };
  }
  const url = String(raw.url || '').trim();
  if (!url) return null;
  return {
    id: String(raw.id || `doc_${category}_${index}_${Math.random().toString(36).slice(2, 6)}`),
    name: String(raw.name || raw.title || extractFileNameFromUrl(url, fallbackLabel)).trim(),
    url,
    category: (raw.category as BookingDocumentCategory) || category,
    sourceType:
      raw.sourceType === 'UPLOAD' || raw.sourceType === 'LINK'
        ? raw.sourceType
        : url.startsWith('/api/storage/files/') || url.startsWith('/uploads/')
          ? 'UPLOAD'
          : 'LINK',
    mimeType: raw.mimeType ? String(raw.mimeType) : undefined,
    size: typeof raw.size === 'number' ? raw.size : undefined,
    uploadedAt: typeof raw.uploadedAt === 'number' ? raw.uploadedAt : undefined,
    uploadedBy: raw.uploadedBy ? String(raw.uploadedBy) : undefined,
  };
}

function dedupeItems(items: BookingAttachmentItem[]): BookingAttachmentItem[] {
  const seen = new Set<string>();
  const out: BookingAttachmentItem[] = [];
  for (const item of items) {
    const key = stripStorageSignedQuery(item.url).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function normalizeBookingDocuments(
  docs?: SubcontractorBookingDocuments | null
): NormalizedBookingDocuments {
  const raw = docs || {};

  const prPoList = Array.isArray(raw.prPoFiles)
    ? raw.prPoFiles
        .map((it, idx) => normalizeItem(it, 'PR_PO', 'Thông tin PR/PO', idx))
        .filter((x): x is BookingAttachmentItem => Boolean(x))
    : [];

  const qaListRaw: BookingAttachmentItem[] = Array.isArray(raw.qualityAgreementFiles)
    ? raw.qualityAgreementFiles
        .map((it, idx) => normalizeItem(it, 'QUALITY_AGREEMENT', 'Biên bản thống nhất CL', idx))
        .filter((x): x is BookingAttachmentItem => Boolean(x))
    : [];
  if (raw.qualityAgreementUrl && raw.qualityAgreementUrl.trim()) {
    const legacy = normalizeItem(
      { url: raw.qualityAgreementUrl, name: extractFileNameFromUrl(raw.qualityAgreementUrl, 'Biên bản thống nhất chất lượng') },
      'QUALITY_AGREEMENT',
      'Biên bản thống nhất chất lượng',
      999
    );
    if (legacy) qaListRaw.push(legacy);
  }

  const sampleListRaw: BookingAttachmentItem[] = Array.isArray(raw.sampleImages)
    ? raw.sampleImages
        .map((it, idx) => normalizeItem(it, 'SAMPLE_IMAGE', 'Hình ảnh mẫu / Sản phẩm NCC', idx))
        .filter((x): x is BookingAttachmentItem => Boolean(x))
    : [];
  if (raw.approvedSampleUrl && raw.approvedSampleUrl.trim()) {
    const legacy = normalizeItem(
      { url: raw.approvedSampleUrl, name: extractFileNameFromUrl(raw.approvedSampleUrl, 'Mẫu duyệt / Sản phẩm tại NCC') },
      'SAMPLE_IMAGE',
      'Mẫu duyệt / Sản phẩm tại NCC',
      999
    );
    if (legacy) sampleListRaw.push(legacy);
  }

  const specListRaw: BookingAttachmentItem[] = Array.isArray(raw.specDrawings)
    ? raw.specDrawings
        .map((it, idx) => normalizeItem(it, 'SPEC_DRAWING', 'Spec / Bản vẽ kỹ thuật', idx))
        .filter((x): x is BookingAttachmentItem => Boolean(x))
    : [];
  if (raw.materialSpecUrl && raw.materialSpecUrl.trim()) {
    const legacySpec = normalizeItem(
      { url: raw.materialSpecUrl, name: extractFileNameFromUrl(raw.materialSpecUrl, 'Spec vật tư') },
      'SPEC_DRAWING',
      'Spec vật tư',
      998
    );
    if (legacySpec) specListRaw.push(legacySpec);
  }
  if (raw.shopdrawingUrl && raw.shopdrawingUrl.trim()) {
    const legacyDrawing = normalizeItem(
      { url: raw.shopdrawingUrl, name: extractFileNameFromUrl(raw.shopdrawingUrl, 'Bản vẽ kỹ thuật') },
      'SPEC_DRAWING',
      'Bản vẽ kỹ thuật',
      999
    );
    if (legacyDrawing) specListRaw.push(legacyDrawing);
  }

  return {
    prPoFiles: dedupeItems(prPoList),
    qualityAgreementFiles: dedupeItems(qaListRaw),
    sampleImages: dedupeItems(sampleListRaw),
    specDrawings: dedupeItems(specListRaw),
  };
}

export function serializeBookingDocumentsForSave(
  docs?: SubcontractorBookingDocuments | null
): SubcontractorBookingDocuments {
  const norm = normalizeBookingDocuments(docs);
  const sanitizeList = (list: BookingAttachmentItem[]): BookingAttachmentItem[] =>
    list.map((it) => ({
      ...it,
      url: stripStorageSignedQuery(it.url),
    }));

  const prPoFiles = sanitizeList(norm.prPoFiles);
  const qualityAgreementFiles = sanitizeList(norm.qualityAgreementFiles);
  const sampleImages = sanitizeList(norm.sampleImages);
  const specDrawings = sanitizeList(norm.specDrawings);

  return {
    prPoFiles,
    qualityAgreementFiles,
    sampleImages,
    specDrawings,
    qualityAgreementUrl: qualityAgreementFiles[0]?.url || '',
    approvedSampleUrl: sampleImages[0]?.url || '',
    materialSpecUrl: specDrawings[0]?.url || '',
    shopdrawingUrl: specDrawings[1]?.url || specDrawings[0]?.url || '',
  };
}

export function countBookingDocuments(docs?: SubcontractorBookingDocuments | null): {
  total: number;
  byCategory: Record<BookingDocumentCategory, number>;
} {
  const norm = normalizeBookingDocuments(docs);
  const byCategory: Record<BookingDocumentCategory, number> = {
    PR_PO: norm.prPoFiles.length,
    QUALITY_AGREEMENT: norm.qualityAgreementFiles.length,
    SAMPLE_IMAGE: norm.sampleImages.length,
    SPEC_DRAWING: norm.specDrawings.length,
  };
  return {
    total:
      byCategory.PR_PO +
      byCategory.QUALITY_AGREEMENT +
      byCategory.SAMPLE_IMAGE +
      byCategory.SPEC_DRAWING,
    byCategory,
  };
}

export function buildSqcDocsFromBooking(booking: SubcontractorBooking): {
  supportingDocs: Array<{
    id: string;
    name: string;
    verified: boolean;
    url: string;
    category: BookingDocumentCategory;
    sourceType: 'UPLOAD' | 'LINK';
    mimeType?: string;
  }>;
  referenceDocs: Array<{
    id: string;
    title: string;
    url: string;
    category: BookingDocumentCategory;
    sourceType: 'UPLOAD' | 'LINK';
    mimeType?: string;
  }>;
  drawingImageUrls: string[];
} {
  const norm = normalizeBookingDocuments(booking.documents);
  const allEntries: Array<{ groupLabel: string; item: BookingAttachmentItem }> = [
    ...norm.prPoFiles.map((item) => ({ groupLabel: 'Thông tin PR/PO', item })),
    ...norm.qualityAgreementFiles.map((item) => ({ groupLabel: 'Biên bản CL / Book QC', item })),
    ...norm.sampleImages.map((item) => ({ groupLabel: 'Ảnh mẫu / SP NCC', item })),
    ...norm.specDrawings.map((item) => ({ groupLabel: 'Spec / Bản vẽ', item })),
  ];

  const supportingDocs = allEntries.map(({ groupLabel, item }, idx) => ({
    id: item.id || `bk_doc_${idx}`,
    name: `${groupLabel}: ${item.name}`,
    verified: true,
    url: item.url,
    category: item.category,
    sourceType: item.sourceType,
    mimeType: item.mimeType,
  }));

  const referenceDocs = allEntries.map(({ groupLabel, item }, idx) => ({
    id: item.id || `bk_ref_${idx}`,
    title: `${groupLabel} — ${item.name}`,
    url: item.url,
    category: item.category,
    sourceType: item.sourceType,
    mimeType: item.mimeType,
  }));

  const drawingImageUrls = [...norm.sampleImages, ...norm.specDrawings]
    .filter((item) => isImageAttachment(item))
    .map((item) => item.url);

  return {
    supportingDocs,
    referenceDocs,
    drawingImageUrls: Array.from(new Set(drawingImageUrls)),
  };
}

export function formatUnixToGmt7Ymd(unixSeconds?: number | null): string {
  const raw = Number(unixSeconds);
  const tsMs = Number.isFinite(raw) && raw > 0 ? (raw > 1e12 ? raw : raw * 1000) : Date.now();
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(tsMs));
  } catch {
    return new Date(tsMs).toISOString().split('T')[0];
  }
}

export function buildSqcPrefillFromBooking(
  booking: SubcontractorBooking,
  sqcType?: ModuleId,
  template: CheckItem[] = []
): Partial<Inspection> {
  const targetType = (sqcType || (booking.sqcType as ModuleId) || 'SQC_BTP') as ModuleId;
  const hasItems = Array.isArray(booking.items) && booking.items.length > 0;
  const allPoList = collectBookingAllPoTokens(booking);
  const joinedPo = allPoList.join(', ') || String(booking.poNumber || '').trim();
  const primaryPo = allPoList[0] || String(booking.poNumber || '').trim();

  const mappedItems: CheckItem[] = hasItems
    ? booking.items!.map((it: any, idx: number) => {
        const itemPoTokens = splitPoTokens([it?.poNumber, it?.po_number, it?.prNumber, it?.pr_number]);
        const itemPo = itemPoTokens.join(', ') || primaryPo;
        return {
          id: it.id || String(idx + 1),
          name: it.itemName || 'Hạng mục gia công',
          label: it.itemName || 'Hạng mục gia công',
          itemName: it.itemName || '',
          category: 'Hạng mục kiểm tra',
          specifications: it.specifications || '',
          poNumber: itemPo,
          prNumber: it.prNumber || undefined,
          orderQty: Number(it.quantity) || 1,
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'Bộ',
          status: CheckStatus.PASS,
          result: 'PASS',
          isInspected: true,
        } as any;
      })
    : JSON.parse(JSON.stringify(template || []));

  const mappedMaterials: MaterialIQC[] = hasItems
    ? booking.items!.map((it: any, idx: number) => {
        const qty = Number(it.quantity) || 1;
        const itemPoTokens = splitPoTokens([it?.poNumber, it?.po_number, it?.prNumber, it?.pr_number]);
        const itemPo = itemPoTokens.join(', ') || primaryPo;
        return {
          id: it.id || String(idx + 1),
          name: it.itemName || 'Hạng mục gia công',
          category:
            targetType === 'SQC_VT'
              ? 'Vật tư'
              : targetType === 'SQC_TP'
                ? 'Thành phẩm'
                : 'Gia công ngoài',
          inspectType: '100%',
          scope: 'COMMON',
          projectCode: itemPo,
          projectName: itemPo ? `PO ${itemPo}` : '',
          poNumber: itemPo,
          po_number: itemPo,
          prNumber: it.prNumber || undefined,
          orderQty: qty,
          deliveryQty: qty,
          unit: it.unit || 'Bộ',
          criteria: [],
          items: [],
          inspectQty: qty,
          passQty: qty,
          failQty: 0,
          images: [],
          type: targetType === 'SQC_VT' ? 'Material' : '100%',
          specifications: it.specifications || '',
        } as any as MaterialIQC;
      })
    : [];

  const {
    supportingDocs: bookingSupportingDocs,
    referenceDocs: bookingReferenceDocs,
    drawingImageUrls,
  } = buildSqcDocsFromBooking(booking);

  return {
    type: targetType,
    po_number: joinedPo,
    poNumber: joinedPo,
    ma_ct: joinedPo,
    ten_ct: joinedPo,
    supplier: booking.supplierName || '',
    supplierName: booking.supplierName || '',
    ma_nha_may: booking.supplierName || '',
    workshop: booking.supplierName || '',
    supplierAddress: booking.locationAddress || '',
    location: booking.locationAddress || '',
    dia_chi_xuong: booking.locationAddress || '',
    nguoi_lien_he: booking.contactPerson || '',
    so_dien_thoai: booking.contactPhone || '',
    date: formatUnixToGmt7Ymd(booking.requestedDate),
    booking_id: booking.id,
    booking_code: booking.bookingCode,
    items: mappedItems,
    materials: mappedMaterials,
    supportingDocs: bookingSupportingDocs.length > 0 ? (bookingSupportingDocs as any) : undefined,
    referenceDocs: bookingReferenceDocs as any,
    drawingImages: drawingImageUrls.length > 0 ? drawingImageUrls : undefined,
  };
}

