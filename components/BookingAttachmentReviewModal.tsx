import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { BookingDocumentCategory } from '../types.js';
import {
  AttachmentPreviewKind,
  BookingAttachmentReviewItem,
  canUseExternalGoogleViewer,
  formatFileSize,
  getAttachmentActionUrl,
  getAttachmentDownloadUrl,
  getFileExtBadge,
  getGoogleDriveEmbedUrl,
  isGoogleDriveUrl,
  resolveAttachmentPreviewKind,
  stripStorageSignedQuery,
} from '../src/utils/bookingDocuments.js';
import { getSignedDownloadUrl } from '../services/apiService.js';
import { getProxyImageUrl } from '../src/utils.js';
import {
  extractGoogleDriveFileId,
  fetchGoogleDriveImageBlob,
  isGoogleDriveSignedIn,
  signInWithGoogleDrive,
} from '../src/services/googleDriveAuth.js';
import { ProxyImage } from '../src/components/ProxyImage.js';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface BookingAttachmentReviewModalProps {
  open: boolean;
  items: BookingAttachmentReviewItem[];
  initialIndex?: number;
  initialItemId?: string;
  initialItemUrl?: string;
  titleContext?: string;
  onClose: () => void;
}

const CATEGORY_BADGE_MAP: Record<
  BookingDocumentCategory,
  { label: string; badgeClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  PR_PO: {
    label: 'PR / PO',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
    Icon: FileSpreadsheet,
  },
  QUALITY_AGREEMENT: {
    label: 'Biên bản CL',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    Icon: FileCheck2,
  },
  SAMPLE_IMAGE: {
    label: 'Ảnh mẫu',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Icon: ImageIcon,
  },
  SPEC_DRAWING: {
    label: 'Spec / Bản vẽ',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
    Icon: FileText,
  },
};

function isLikelyBinaryOrCadExt(item: BookingAttachmentReviewItem): boolean {
  const target = `${item.name || ''} ${String(item.url || '').split('?')[0]}`.toLowerCase();
  return ['.dwg', '.dxf', '.zip', '.rar', '.7z', '.stp', '.step', '.iges', '.igs'].some((ext) =>
    target.endsWith(ext)
  );
}

interface ParsedSheetData {
  name: string;
  rows: string[][];
  totalRows: number;
}

const MAX_PREVIEW_SHEET_ROWS = 400;

export const BookingAttachmentReviewModal: React.FC<BookingAttachmentReviewModalProps> = ({
  open,
  items,
  initialIndex = 0,
  initialItemId,
  initialItemUrl,
  titleContext,
  onClose,
}) => {
  const resolveStartIndex = useCallback((): number => {
    if (!items || items.length === 0) return 0;
    if (initialItemId) {
      const byId = items.findIndex((it) => it.id === initialItemId);
      if (byId >= 0) return byId;
    }
    if (initialItemUrl) {
      const targetKey = stripStorageSignedQuery(initialItemUrl).toLowerCase();
      const byUrl = items.findIndex(
        (it) => stripStorageSignedQuery(it.url).toLowerCase() === targetKey
      );
      if (byUrl >= 0) return byUrl;
    }
    return Math.max(0, Math.min(initialIndex, items.length - 1));
  }, [items, initialIndex, initialItemId, initialItemUrl]);

  const [activeIndex, setActiveIndex] = useState<number>(resolveStartIndex);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | BookingDocumentCategory>('ALL');
  const [mobilePlaylistOpen, setMobilePlaylistOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Image & Drive view override state
  const [zoomPct, setZoomPct] = useState(100);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [driveBlobUrl, setDriveBlobUrl] = useState<string | null>(null);
  const [isDriveAuthenticating, setIsDriveAuthenticating] = useState(false);
  const [driveEmbedOverride, setDriveEmbedOverride] = useState(false);

  // Local Spreadsheet / Text state
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheetData[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  // Document iframe / Google Viewer state
  const [viewerStatus, setViewerStatus] = useState<'loading' | 'ready' | 'timedout'>('ready');
  const [signedPublicUrl, setSignedPublicUrl] = useState<string | null>(null);
  const [viewerReloadNonce, setViewerReloadNonce] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(resolveStartIndex());
    setSearchQuery('');
    setCategoryFilter('ALL');
    setMobilePlaylistOpen(false);
    setCopiedLink(false);
  }, [open, resolveStartIndex]);

  const safeIndex = items.length > 0 ? Math.max(0, Math.min(activeIndex, items.length - 1)) : 0;
  const activeItem: BookingAttachmentReviewItem | null = items[safeIndex] || null;

  const basePreviewKind: AttachmentPreviewKind = useMemo(
    () => (activeItem ? resolveAttachmentPreviewKind(activeItem) : 'GOOGLE_VIEWER'),
    [activeItem]
  );

  const driveEmbedUrl = useMemo(
    () => (activeItem ? getGoogleDriveEmbedUrl(activeItem.url) : null),
    [activeItem]
  );

  const activeDriveFileId = useMemo(
    () => (activeItem ? extractGoogleDriveFileId(activeItem.url) : ''),
    [activeItem]
  );

  const effectivePreviewKind: AttachmentPreviewKind = useMemo(() => {
    if (driveEmbedOverride && driveEmbedUrl) return 'DRIVE_EMBED';
    return basePreviewKind;
  }, [basePreviewKind, driveEmbedOverride, driveEmbedUrl]);

  const activeActionUrl = useMemo(
    () => (activeItem ? getAttachmentActionUrl(activeItem.url) : ''),
    [activeItem]
  );

  const activeDownloadUrl = useMemo(
    () => (activeItem ? getAttachmentDownloadUrl(activeItem.url, activeItem.name) : ''),
    [activeItem]
  );

  // Reset per-item override when navigating between documents
  useEffect(() => {
    setDriveEmbedOverride(false);
  }, [activeItem?.id, activeItem?.url]);

  // Hydrate preview for current item
  useEffect(() => {
    if (!open || !activeItem) return;
    setZoomPct(100);
    setRotationDeg(0);
    setImgError(false);
    setDriveBlobUrl(null);
    setCopiedLink(false);
    setSignedPublicUrl(null);
    setSheets([]);
    setActiveSheetIdx(0);
    setSheetError(null);
    setSheetLoading(false);
    setTextContent(null);
    setTextError(null);
    setTextLoading(false);

    let cancelled = false;
    const controller = new AbortController();

    if (effectivePreviewKind === 'IMAGE') {
      setImgLoading(true);
      setViewerStatus('ready');
      return () => controller.abort();
    }

    setImgLoading(false);

    if (effectivePreviewKind === 'SPREADSHEET') {
      setSheetLoading(true);
      setViewerStatus('ready');
      (async () => {
        try {
          const token =
            typeof window !== 'undefined'
              ? localStorage.getItem('aatn_qms_token') || sessionStorage.getItem('aatn_qms_token') || ''
              : '';
          const res = await fetch(activeActionUrl, {
            signal: controller.signal,
            headers: token && activeActionUrl.startsWith('/') ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (!res.ok) {
            throw new Error(`Không thể nạp tệp bảng tính (HTTP ${res.status}).`);
          }
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('text/html')) {
            throw new Error('Nguồn tệp trả về trang HTML thay vì dữ liệu bảng tính.');
          }
          const buf = await res.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          const parsedSheets: ParsedSheetData[] = wb.SheetNames.map((sheetName) => {
            const ws = wb.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
            const totalRows = matrix.length;
            const rows = matrix.slice(0, MAX_PREVIEW_SHEET_ROWS).map((row) =>
              Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))) : []
            );
            return { name: sheetName, rows, totalRows };
          });
          if (!cancelled) {
            setSheets(parsedSheets);
            setActiveSheetIdx(0);
          }
        } catch (err: any) {
          if (!cancelled && err?.name !== 'AbortError') {
            setSheetError(err?.message || 'Không thể đọc trực tiếp bảng tính. Vui lòng tải xuống để xem.');
          }
        } finally {
          if (!cancelled) setSheetLoading(false);
        }
      })();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (effectivePreviewKind === 'TEXT') {
      setTextLoading(true);
      setViewerStatus('ready');
      (async () => {
        try {
          const token =
            typeof window !== 'undefined'
              ? localStorage.getItem('aatn_qms_token') || sessionStorage.getItem('aatn_qms_token') || ''
              : '';
          const res = await fetch(activeActionUrl, {
            signal: controller.signal,
            headers: token && activeActionUrl.startsWith('/') ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (!res.ok) {
            throw new Error(`Không thể nạp nội dung tệp (HTTP ${res.status}).`);
          }
          const txt = await res.text();
          if (!cancelled) {
            setTextContent(txt.slice(0, 200000));
          }
        } catch (err: any) {
          if (!cancelled && err?.name !== 'AbortError') {
            setTextError(err?.message || 'Không thể đọc tệp văn bản.');
          }
        } finally {
          if (!cancelled) setTextLoading(false);
        }
      })();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    // PDF, DRIVE_EMBED, or GOOGLE_VIEWER
    const canGoogleView =
      effectivePreviewKind !== 'GOOGLE_VIEWER' || canUseExternalGoogleViewer(activeItem.url);

    if (!canGoogleView) {
      setViewerStatus('ready');
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setViewerStatus('loading');

    if (effectivePreviewKind === 'GOOGLE_VIEWER') {
      const cleanUrl = stripStorageSignedQuery(activeItem.url);
      if (cleanUrl.startsWith('/api/storage/files/')) {
        getSignedDownloadUrl(cleanUrl, 3600)
          .then((signedPath) => {
            if (!cancelled) setSignedPublicUrl(signedPath);
          })
          .catch(() => {
            if (!cancelled) setSignedPublicUrl(activeActionUrl);
          });
      } else {
        setSignedPublicUrl(activeItem.url);
      }
    }

    const timeoutMs = effectivePreviewKind === 'GOOGLE_VIEWER' ? 9000 : 12000;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setViewerStatus((prev) => (prev === 'loading' ? 'timedout' : prev));
      }
    }, timeoutMs);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, activeItem, effectivePreviewKind, activeActionUrl, viewerReloadNonce]);

  const allowExternalGoogleViewer = useMemo(() => {
    if (!activeItem || effectivePreviewKind !== 'GOOGLE_VIEWER') return false;
    const candidate = signedPublicUrl || activeItem.url;
    return canUseExternalGoogleViewer(candidate);
  }, [activeItem, effectivePreviewKind, signedPublicUrl]);

  const googleViewerIframeSrc = useMemo(() => {
    if (effectivePreviewKind !== 'GOOGLE_VIEWER' || !activeItem || !allowExternalGoogleViewer) {
      return '';
    }
    const candidate = signedPublicUrl || activeItem.url;
    if (!candidate) return '';
    try {
      const absUrl = candidate.startsWith('http')
        ? candidate
        : new URL(candidate, window.location.origin).toString();
      return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(absUrl)}`;
    } catch {
      return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(candidate)}`;
    }
  }, [effectivePreviewKind, activeItem, signedPublicUrl, allowExternalGoogleViewer]);

  const goPrev = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
  }, [items.length]);

  const goNext = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
  }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (mobilePlaylistOpen) {
          setMobilePlaylistOpen(false);
        } else {
          onClose();
        }
        return;
      }
      if (isTyping) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (effectivePreviewKind === 'IMAGE' && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setZoomPct((z) => Math.min(300, z + 25));
      } else if (effectivePreviewKind === 'IMAGE' && e.key === '-') {
        e.preventDefault();
        setZoomPct((z) => Math.max(50, z - 25));
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, mobilePlaylistOpen, onClose, goPrev, goNext, effectivePreviewKind]);

  const filteredPlaylist = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.groupLabel.toLowerCase().includes(q) ||
          getFileExtBadge(item).toLowerCase().includes(q)
        );
      });
  }, [items, searchQuery, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<BookingDocumentCategory, number> = {
      PR_PO: 0,
      QUALITY_AGREEMENT: 0,
      SAMPLE_IMAGE: 0,
      SPEC_DRAWING: 0,
    };
    for (const it of items) {
      if (it.category && counts[it.category] !== undefined) {
        counts[it.category]++;
      }
    }
    return counts;
  }, [items]);

  const handleImageError = async () => {
    if (activeDriveFileId && isGoogleDriveSignedIn() && !driveBlobUrl) {
      const blob = await fetchGoogleDriveImageBlob(activeDriveFileId);
      if (blob) {
        setDriveBlobUrl(blob);
        setImgError(false);
        setImgLoading(false);
        return;
      }
    }
    setImgLoading(false);
    setImgError(true);
  };

  const handleGoogleDriveSignIn = async () => {
    if (!activeDriveFileId) return;
    setIsDriveAuthenticating(true);
    try {
      const res = await signInWithGoogleDrive();
      if (res) {
        const blob = await fetchGoogleDriveImageBlob(activeDriveFileId);
        if (blob) {
          setDriveBlobUrl(blob);
          setImgError(false);
        }
      }
    } catch {
      // keep fallback card
    } finally {
      setIsDriveAuthenticating(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!activeItem?.url) return;
    try {
      const copyTarget = activeItem.url.startsWith('http')
        ? activeItem.url
        : new URL(activeActionUrl, window.location.origin).toString();
      await navigator.clipboard.writeText(copyTarget);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  if (!open || !activeItem) return null;

  const activeCatMeta = CATEGORY_BADGE_MAP[activeItem.category] || CATEGORY_BADGE_MAP.PR_PO;
  const activeExt = getFileExtBadge(activeItem);
  const activeSizeStr = formatFileSize(activeItem.size);
  const isBinaryOrCad = isLikelyBinaryOrCadExt(activeItem);
  const imageRenderSrc = driveBlobUrl || getProxyImageUrl(activeActionUrl);
  const currentSheet = sheets[activeSheetIdx] || sheets[0] || null;

  const renderPlaylistBody = () => (
    <>
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên tài liệu..."
            className="w-full min-h-[40px] lg:min-h-[34px] pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-900 dark:text-slate-100"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Xóa từ khóa tìm tài liệu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2 py-1 min-h-[30px] rounded-md text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
              categoryFilter === 'ALL'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Tất cả ({items.length})
          </button>
          {(Object.keys(CATEGORY_BADGE_MAP) as BookingDocumentCategory[]).map((cat) => {
            const count = categoryCounts[cat];
            if (count === 0) return null;
            const meta = CATEGORY_BADGE_MAP[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-1 min-h-[30px] rounded-md text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {filteredPlaylist.length === 0 ? (
          <div className="py-8 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
            Không tìm thấy tài liệu phù hợp bộ lọc.
          </div>
        ) : (
          filteredPlaylist.map(({ item, idx }) => {
            const isSelected = idx === safeIndex;
            const catMeta = CATEGORY_BADGE_MAP[item.category] || CATEGORY_BADGE_MAP.PR_PO;
            const ext = getFileExtBadge(item);
            const sizeTxt = formatFileSize(item.size);
            const isImg = resolveAttachmentPreviewKind(item) === 'IMAGE';
            const thumbHref = getAttachmentActionUrl(item.url);

            return (
              <button
                key={`${item.id}_${idx}`}
                type="button"
                onClick={() => {
                  setActiveIndex(idx);
                  setMobilePlaylistOpen(false);
                }}
                className={`w-full text-left flex items-center gap-2.5 p-2 min-h-[52px] rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 dark:border-blue-500'
                    : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                }`}
              >
                {isImg ? (
                  <div className="w-10 h-10 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                    <ProxyImage
                      src={thumbHref}
                      alt={item.name}
                      className="w-10 h-10 object-cover rounded-md"
                      allowDirectOpen={false}
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0">
                    <catMeta.Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300 leading-none mt-0.5">
                      {ext}
                    </span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${catMeta.badgeClass}`}>
                      {catMeta.label}
                    </span>
                  </div>
                  <div
                    className={`text-xs font-semibold truncate ${
                      isSelected
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-slate-800 dark:text-slate-100'
                    }`}
                    title={item.name}
                  >
                    {item.name}
                  </div>
                  {sizeTxt && (
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                      {sizeTxt}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const stageLabel =
    effectivePreviewKind === 'IMAGE'
      ? 'Xem ảnh kỹ thuật'
      : effectivePreviewKind === 'PDF'
        ? 'Trình xem PDF nội tuyến'
        : effectivePreviewKind === 'SPREADSHEET'
          ? 'Bảng tính Excel / CSV'
          : effectivePreviewKind === 'TEXT'
            ? 'Văn bản nội tuyến'
            : effectivePreviewKind === 'DRIVE_EMBED'
              ? 'Google Drive Preview'
              : allowExternalGoogleViewer
                ? 'Google Docs Viewer'
                : 'Tệp lưu trữ nội bộ';

  const modalNode = (
    <div
      className="no-print fixed inset-0 z-[260] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-950/75 backdrop-blur-sm overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`Review tài liệu đính kèm${titleContext ? ` - ${titleContext}` : ''}`}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-[96vw] xl:max-w-[1400px] h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Navigation Header */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobilePlaylistOpen((v) => !v)}
              className="lg:hidden min-h-[44px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              aria-label="Mở danh sách tài liệu"
            >
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-mono tabular-nums">
                {safeIndex + 1}/{items.length}
              </span>
            </button>

            <span
              className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${activeCatMeta.badgeClass}`}
            >
              {activeCatMeta.label}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2
                  className="text-sm font-bold text-slate-900 dark:text-white truncate"
                  title={activeItem.name}
                >
                  {activeItem.name}
                </h2>
                <span className="hidden md:inline-flex px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                  {activeExt}
                </span>
                {activeSizeStr && (
                  <span className="hidden md:inline text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {activeSizeStr}
                  </span>
                )}
              </div>
              {titleContext && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {titleContext}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1 mr-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={items.length <= 1}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer transition-colors"
                title="Tài liệu trước (Phím mũi tên trái)"
                aria-label="Tài liệu trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums select-none">
                {String(safeIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={items.length <= 1}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer transition-colors"
                title="Tài liệu tiếp theo (Phím mũi tên phải)"
                aria-label="Tài liệu tiếp theo"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyUrl}
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              title="Sao chép liên kết tài liệu"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span>Đã chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Chép link</span>
                </>
              )}
            </button>

            <a
              href={activeDownloadUrl}
              download={activeItem.name}
              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title={`Tải xuống ${activeItem.name}`}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải xuống</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -my-1.5 sm:-my-0.5 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Đóng trình xem tài liệu"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Workspace: Left Playlist + Right Adaptive Stage */}
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Desktop Playlist Rail */}
          <aside className="hidden lg:flex w-[290px] xl:w-[320px] shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 min-h-0">
            {renderPlaylistBody()}
          </aside>

          {/* Mobile Slide-Over Playlist Drawer */}
          {mobilePlaylistOpen && (
            <div
              className="lg:hidden absolute inset-0 z-30 bg-slate-950/60 flex"
              onClick={() => setMobilePlaylistOpen(false)}
            >
              <aside
                className="w-[min(86vw,320px)] h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                  <span className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">
                    Danh sách tài liệu ({items.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobilePlaylistOpen(false)}
                    className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="Đóng danh sách tài liệu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {renderPlaylistBody()}
              </aside>
            </div>
          )}

          {/* Center Preview Stage */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-950 relative overflow-hidden">
            {/* Stage Sub-toolbar */}
            <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/95 text-slate-200 flex items-center justify-between gap-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>{stageLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-300">
                  {isGoogleDriveUrl(activeItem.url)
                    ? 'Google Drive'
                    : activeItem.sourceType === 'LINK'
                      ? 'Liên kết ngoài'
                      : 'Tệp hệ thống'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {driveEmbedUrl && basePreviewKind === 'IMAGE' && (
                  <button
                    type="button"
                    onClick={() => setDriveEmbedOverride((v) => !v)}
                    className={`min-h-[32px] px-2.5 rounded text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer border transition-colors ${
                      driveEmbedOverride
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title="Chuyển giữa ảnh chụp nhanh và trình xem đa trang Google Drive"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{driveEmbedOverride ? 'Về xem Ảnh' : 'Xem bản Drive'}</span>
                  </button>
                )}

                {effectivePreviewKind === 'IMAGE' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setZoomPct((z) => Math.max(50, z - 25))}
                      disabled={zoomPct <= 50}
                      className="min-w-[36px] min-h-[32px] inline-flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
                      title="Thu nhỏ (-)"
                      aria-label="Thu nhỏ ảnh"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 font-mono text-xs font-semibold tabular-nums min-w-[48px] text-center">
                      {zoomPct}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomPct((z) => Math.min(300, z + 25))}
                      disabled={zoomPct >= 300}
                      className="min-w-[36px] min-h-[32px] inline-flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
                      title="Phóng to (+)"
                      aria-label="Phóng to ảnh"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                      className="min-w-[36px] min-h-[32px] px-2 inline-flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer"
                      title="Xoay 90 độ"
                      aria-label="Xoay ảnh 90 độ"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline font-mono tabular-nums">{rotationDeg}°</span>
                    </button>
                    {(zoomPct !== 100 || rotationDeg !== 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setZoomPct(100);
                          setRotationDeg(0);
                        }}
                        className="min-h-[32px] px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-blue-300 cursor-pointer"
                      >
                        Mặc định
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setViewerReloadNonce((n) => n + 1)}
                    className="min-h-[32px] px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    title="Tải lại khung xem"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tải lại</span>
                  </button>
                )}
              </div>
            </div>

            {/* Stage Viewport */}
            <div className="flex-1 min-h-0 relative overflow-auto flex items-center justify-center">
              {effectivePreviewKind === 'IMAGE' && (
                <>
                  {imgLoading && !imgError && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                    </div>
                  )}

                  {imgError ? (
                    <div className="max-w-md mx-4 p-5 rounded-xl bg-slate-900 border border-slate-700 text-center space-y-3 text-slate-200">
                      <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                      <div className="text-sm font-bold">Không thể nạp trực tiếp hình ảnh</div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {activeDriveFileId
                          ? 'Tệp trên Google Drive có thể là tài liệu đa trang hoặc yêu cầu đăng nhập Google Workspace. Hãy thử chuyển sang bản Drive Preview hoặc tải về.'
                          : 'Tệp ảnh không phản hồi hoặc định dạng không được trình duyệt hỗ trợ.'}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {driveEmbedUrl && (
                          <button
                            type="button"
                            onClick={() => setDriveEmbedOverride(true)}
                            className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                            <span>Thử Google Drive Preview</span>
                          </button>
                        )}
                        {activeDriveFileId && !isGoogleDriveSignedIn() && (
                          <button
                            type="button"
                            onClick={handleGoogleDriveSignIn}
                            disabled={isDriveAuthenticating}
                            className="min-h-[44px] sm:min-h-[36px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {isDriveAuthenticating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            <span>Đăng nhập Google Drive</span>
                          </button>
                        )}
                        <a
                          href={activeDownloadUrl}
                          download={activeItem.name}
                          className="min-h-[44px] sm:min-h-[36px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải ảnh về máy</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full overflow-auto flex items-center justify-center p-3 sm:p-6">
                      <img
                        key={`${activeItem.id}_${imageRenderSrc}`}
                        src={imageRenderSrc}
                        alt={activeItem.name}
                        referrerPolicy="no-referrer"
                        onLoad={() => setImgLoading(false)}
                        onError={handleImageError}
                        style={{
                          transform: `scale(${zoomPct / 100}) rotate(${rotationDeg}deg)`,
                        }}
                        className="max-w-full max-h-full object-contain rounded shadow-2xl transition-transform duration-150 select-none"
                      />
                    </div>
                  )}
                </>
              )}

              {effectivePreviewKind === 'PDF' && (
                <div className="w-full h-full relative bg-white">
                  {viewerStatus === 'loading' && (
                    <div className="absolute inset-0 z-10 bg-slate-950/70 flex flex-col items-center justify-center gap-2 text-slate-200 pointer-events-none">
                      <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                      <span className="text-xs font-medium">Đang tải tài liệu PDF...</span>
                    </div>
                  )}
                  <iframe
                    key={`pdf_${activeItem.id}_${viewerReloadNonce}`}
                    src={activeActionUrl}
                    title={activeItem.name}
                    className="w-full h-full border-0 bg-white"
                    onLoad={() => setViewerStatus('ready')}
                  />
                </div>
              )}

              {effectivePreviewKind === 'SPREADSHEET' && (
                <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
                  {sheetLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-300">
                      <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
                      <span className="text-xs font-medium">Đang đọc dữ liệu bảng tính...</span>
                    </div>
                  ) : sheetError ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <div className="max-w-md p-5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center space-y-3">
                        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          Không thể hiển thị trực tiếp bảng tính
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{sheetError}</p>
                        <a
                          href={activeDownloadUrl}
                          download={activeItem.name}
                          className="min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải xuống tệp Excel</span>
                        </a>
                      </div>
                    </div>
                  ) : currentSheet ? (
                    <>
                      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-2 flex-wrap shrink-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sheets.map((sh, sIdx) => (
                            <button
                              key={`${sh.name}_${sIdx}`}
                              type="button"
                              onClick={() => setActiveSheetIdx(sIdx)}
                              className={`px-2.5 py-1 min-h-[32px] rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                                sIdx === activeSheetIdx
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {sh.name}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {currentSheet.totalRows > MAX_PREVIEW_SHEET_ROWS
                            ? `Hiển thị ${MAX_PREVIEW_SHEET_ROWS} / ${currentSheet.totalRows} dòng`
                            : `${currentSheet.totalRows} dòng`}
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        {currentSheet.rows.length === 0 ? (
                          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                            Sheet này không có dữ liệu.
                          </div>
                        ) : (
                          <table className="w-full border-collapse text-xs text-left">
                            <tbody>
                              {currentSheet.rows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className={
                                    rIdx === 0
                                      ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100 sticky top-0 z-10'
                                      : 'border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                                  }
                                >
                                  <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-400 tabular-nums select-none bg-slate-50 dark:bg-slate-900">
                                    {rIdx + 1}
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="px-3 py-1.5 border-r border-slate-200/70 dark:border-slate-800 whitespace-nowrap max-w-[320px] truncate"
                                      title={cell}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {effectivePreviewKind === 'TEXT' && (
                <div className="w-full h-full bg-slate-950 text-slate-100 overflow-auto p-4">
                  {textLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
                      <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                      <span className="text-xs font-medium">Đang tải nội dung văn bản...</span>
                    </div>
                  ) : textError ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="max-w-md p-5 rounded-xl bg-slate-900 border border-slate-700 text-center space-y-3">
                        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                        <div className="text-sm font-bold">{textError}</div>
                        <a
                          href={activeDownloadUrl}
                          download={activeItem.name}
                          className="min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải xuống</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words bg-slate-900 border border-slate-800 rounded-xl p-4">
                      {textContent ?? ''}
                    </pre>
                  )}
                </div>
              )}

              {effectivePreviewKind === 'DRIVE_EMBED' && (
                <div className="w-full h-full relative bg-white">
                  {viewerStatus === 'loading' && (
                    <div className="absolute inset-0 z-10 bg-slate-950/70 flex flex-col items-center justify-center gap-2 text-slate-200 pointer-events-none">
                      <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                      <span className="text-xs font-medium">Đang nạp Google Drive Preview...</span>
                    </div>
                  )}
                  {driveEmbedUrl ? (
                    <iframe
                      key={`drv_${activeItem.id}_${viewerReloadNonce}`}
                      src={driveEmbedUrl}
                      title={activeItem.name}
                      allow="autoplay"
                      className="w-full h-full border-0 bg-white"
                      onLoad={() => setViewerStatus('ready')}
                    />
                  ) : null}
                </div>
              )}

              {effectivePreviewKind === 'GOOGLE_VIEWER' && (
                allowExternalGoogleViewer && googleViewerIframeSrc ? (
                  <div className="w-full h-full flex flex-col relative bg-white">
                    {viewerStatus === 'loading' && (
                      <div className="absolute inset-0 z-10 bg-slate-950/75 flex flex-col items-center justify-center gap-2 text-slate-200 pointer-events-none">
                        <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                        <span className="text-xs font-medium">
                          Đang thử xem trước qua Google Docs Viewer...
                        </span>
                      </div>
                    )}
                    <iframe
                      key={`gview_${activeItem.id}_${viewerReloadNonce}_${signedPublicUrl || ''}`}
                      src={googleViewerIframeSrc}
                      title={activeItem.name}
                      className="w-full flex-1 min-h-0 border-0 bg-white"
                      onLoad={() => setViewerStatus('ready')}
                    />
                    {(viewerStatus === 'timedout' || isBinaryOrCad) && (
                      <div className="shrink-0 px-3 py-2 bg-slate-900 border-t border-slate-800 text-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="truncate sm:whitespace-normal text-slate-300">
                            {isBinaryOrCad
                              ? `Định dạng ${activeExt} (CAD / Nén) thường cần phần mềm chuyên dụng; bạn có thể tải trực tiếp về máy.`
                              : 'Google Viewer phản hồi chậm hoặc nguồn liên kết chặn nhúng. Hãy bấm Tải xuống để mở trực tiếp.'}
                          </span>
                        </div>
                        <a
                          href={activeDownloadUrl}
                          download={activeItem.name}
                          className="min-h-[36px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải xuống</span>
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-md mx-4 p-6 rounded-xl bg-slate-900 border border-slate-700 text-center space-y-3.5 text-slate-200">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center mx-auto">
                      <activeCatMeta.Icon className="w-5 h-5 text-blue-400" />
                      <span className="text-[9px] font-mono font-bold text-slate-300 leading-none mt-0.5">
                        {activeExt}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-white break-words">
                        {activeItem.name}
                      </div>
                      {activeSizeStr && (
                        <div className="text-xs font-mono text-slate-400 tabular-nums">
                          {activeExt} · {activeSizeStr}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {isBinaryOrCad
                        ? `Định dạng ${activeExt} (CAD / tệp nén) cần phần mềm chuyên dụng để mở.`
                        : `Tệp định dạng ${activeExt} được lưu trên hệ thống nội bộ bảo mật nên trình xem ngoài không thể truy cập trực tiếp.`}
                      {' '}Vui lòng tải xuống để xem đầy đủ nội dung.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <a
                        href={activeDownloadUrl}
                        download={activeItem.name}
                        className="min-h-[44px] sm:min-h-[38px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Tải xuống trực tiếp</span>
                      </a>
                    </div>
                  </div>
                )
              )}
            </div>
          </main>
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <div className="lg:hidden flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={goPrev}
            disabled={items.length <= 1}
            className="min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Trước</span>
          </button>

          <button
            type="button"
            onClick={() => setMobilePlaylistOpen(true)}
            className="min-h-[44px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-mono font-bold tabular-nums inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              {safeIndex + 1} / {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={items.length <= 1}
            className="min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
          >
            <span>Tiếp</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
