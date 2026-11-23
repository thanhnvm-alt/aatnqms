import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  SubcontractorBooking,
  RelatedSqcReport,
  RelatedSqcMatchReason,
  User,
} from '../types.js';
import {
  canAssignM03Booking,
  canReconcileM03,
  canManualOverrideM03Booking,
  canInspectM03Booking,
  canViewM03RelatedSqc,
} from '../src/utils/m03Rbac.js';
import {
  fetchRelatedSqcForBooking,
  fetchSubcontractorBookingById,
  reconcileSubcontractorBookingsApi,
  manualOverrideBookingStatusApi,
} from '../services/apiService.js';
import { Combobox, ComboboxOption } from '../src/components/qms/Combobox.js';
import {
  FileText,
  X,
  Phone,
  Copy,
  Check,
  MapPin,
  ExternalLink,
  Download,
  FileCheck,
  Package,
  ClipboardCheck,
  RefreshCw,
  AlertCircle,
  Plus,
  ChevronRight,
  Printer,
  GitCompare,
  Clock,
  UserCheck,
  CheckCircle2,
  Ban,
  RotateCcw,
  SlidersHorizontal,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { ProxyImage } from '../src/components/ProxyImage.js';
import {
  BOOKING_DOCUMENT_GROUPS,
  countBookingDocuments,
  formatFileSize,
  getAttachmentActionUrl,
  getFileExtBadge,
  isGoogleDriveUrl,
  isImageAttachment,
  normalizeBookingDocuments,
} from '../src/utils/bookingDocuments.js';
import { formatBookingPoSummary } from '../src/utils/poTokens.js';

interface BookingDetailModalProps {
  open: boolean;
  booking: SubcontractorBooking | null;
  currentUser?: User | null;
  rolesList?: any[];
  statusBadge?: React.ReactNode;
  scrollToSqc?: boolean;
  onClose: () => void;
  onStartInspection?: (booking: SubcontractorBooking) => void;
  onViewInspection?: (inspectionId: string) => void;
  onOpenAssignModal?: (
    booking: SubcontractorBooking,
    options?: { mode?: 'ASSIGN' | 'RETURN'; prefillReason?: string }
  ) => void;
  onReconciled?: () => void | Promise<void>;
}

export const renderBookingStatusBadge = (status: string): React.ReactNode => {
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-orange-700 border border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" /> Chờ Phân Công
        </span>
      );
    case 'ASSIGNED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5" /> Đã Phân Công
        </span>
      );
    case 'IN_PROGRESS':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5" /> Đang Kiểm Tra
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" /> Đã nghiệm thu • PASS
        </span>
      );
    case 'RETURNED_FOR_SUPPLEMENT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5" /> Đã nghiệm thu • FAIL
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
          <Ban className="w-3.5 h-3.5" /> Đã Hủy
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          {status}
        </span>
      );
  }
};

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  open,
  booking,
  currentUser = null,
  rolesList = [],
  statusBadge,
  scrollToSqc = false,
  onClose,
  onStartInspection,
  onViewInspection,
  onOpenAssignModal,
  onReconciled,
}) => {
  const [liveBooking, setLiveBooking] = useState<SubcontractorBooking | null>(booking);
  const [relatedSqcReports, setRelatedSqcReports] = useState<RelatedSqcReport[]>([]);
  const [relatedSqcContext, setRelatedSqcContext] = useState<{
    poTerms: string[];
    prTerms: string[];
    materialTerms: string[];
  } | null>(null);
  const [isLoadingRelatedSqc, setIsLoadingRelatedSqc] = useState(false);
  const [relatedSqcError, setRelatedSqcError] = useState<string | null>(null);
  const [relatedSqcTypeFilter, setRelatedSqcTypeFilter] = useState<
    'ALL' | 'SQC_VT' | 'SQC_BTP' | 'SQC_TP'
  >('ALL');
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [copiedField, setCopiedField] = useState<'phone' | 'address' | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [showManualStatusPanel, setShowManualStatusPanel] = useState(false);
  const [manualResult, setManualResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [manualSqcCode, setManualSqcCode] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [isSavingManualStatus, setIsSavingManualStatus] = useState(false);
  const [manualStatusError, setManualStatusError] = useState<string | null>(null);

  const sqcSectionRef = useRef<HTMLDivElement | null>(null);
  const manualPanelRef = useRef<HTMLFormElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setLiveBooking(booking);
  }, [booking]);

  const loadRelatedSqc = useCallback(async (bookingIdOrCode: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    setIsLoadingRelatedSqc(true);
    setRelatedSqcError(null);
    try {
      const res = await fetchRelatedSqcForBooking(bookingIdOrCode, controller.signal);
      if (!controller.signal.aborted) {
        setRelatedSqcReports(Array.isArray(res?.reports) ? res.reports : []);
        setRelatedSqcContext(res?.searchContext || null);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (!controller.signal.aborted) {
          setRelatedSqcError('Quá thời gian tra cứu báo cáo SQC. Vui lòng thử lại.');
        }
      } else {
        console.error('Failed to fetch related SQC reports:', err);
        setRelatedSqcError(err?.message || 'Không thể tải danh sách báo cáo SQC liên quan.');
      }
    } finally {
      clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        setIsLoadingRelatedSqc(false);
      }
    }
  }, []);

  const bookingKey = booking?.id || booking?.bookingCode || '';

  useEffect(() => {
    if (!open || !bookingKey) return;
    setRelatedSqcTypeFilter('ALL');
    setRelatedSqcReports([]);
    setRelatedSqcContext(null);
    setCopiedField(null);
    setReconcileNotice(null);
    setShowManualStatusPanel(false);
    setManualResult('PASS');
    setManualSqcCode('');
    setManualReason('');
    setManualStatusError(null);

    loadRelatedSqc(bookingKey);

    if (scrollToSqc) {
      const scrollTimer = setTimeout(() => {
        sqcSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return () => {
        clearTimeout(scrollTimer);
        abortControllerRef.current?.abort();
      };
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [open, bookingKey, scrollToSqc, loadRelatedSqc]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const activeBooking = liveBooking || booking;
  const canAssignQc = useMemo(
    () => (activeBooking ? canAssignM03Booking(currentUser, activeBooking, rolesList) : false),
    [currentUser, activeBooking, rolesList]
  );
  const canReconcile = useMemo(
    () => canReconcileM03(currentUser, rolesList),
    [currentUser, rolesList]
  );
  const canManualOverride = useMemo(
    () => (activeBooking ? canManualOverrideM03Booking(currentUser, activeBooking, rolesList) : false),
    [currentUser, activeBooking, rolesList]
  );
  const canInspectThis = useMemo(
    () => (activeBooking ? canInspectM03Booking(currentUser, activeBooking, rolesList) : false),
    [currentUser, activeBooking, rolesList]
  );

  const handleReconcile = async () => {
    const activeBk = liveBooking || booking;
    if (!activeBk || isReconciling) return;
    if (!canReconcile) {
      setReconcileNotice({
        type: 'error',
        text: 'Bạn không có quyền đối chiếu tự động (yêu cầu SIGN1/SIGN2 hoặc ADMIN/MANAGER/QA/QC_LEAD).',
      });
      return;
    }
    setIsReconciling(true);
    setReconcileNotice(null);
    try {
      const res = await reconcileSubcontractorBookingsApi();
      const refreshed = await fetchSubcontractorBookingById(activeBk.id || activeBk.bookingCode);
      if (refreshed) {
        setLiveBooking(refreshed);
      }
      await loadRelatedSqc(activeBk.id || activeBk.bookingCode);
      if (onReconciled) {
        await onReconciled();
      }
      if (res && res.updatedCount > 0) {
        setReconcileNotice({
          type: 'success',
          text: `Đã đối chiếu và cập nhật ${res.updatedCount} lịch Book QC khớp với báo cáo SQC.`,
        });
      } else {
        setReconcileNotice({
          type: 'info',
          text: 'Đã quét đối chiếu theo PO / PR / Mã Booking. Trạng thái hiện tại đã được đồng bộ.',
        });
      }
    } catch (err: any) {
      setReconcileNotice({
        type: 'error',
        text: err?.message || 'Lỗi khi đối chiếu Booking QC với báo cáo SQC.',
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const manualResultOptions: ComboboxOption<'PASS' | 'FAIL'>[] = [
    {
      value: 'PASS',
      label: 'Đạt nghiệm thu (PASS)',
      description: 'Chuyển phiếu Book QC sang Đã nghiệm thu • PASS',
    },
    {
      value: 'FAIL',
      label: 'Không đạt — Cần kiểm lại (FAIL)',
      description: 'Chuyển phiếu Book QC sang Đã nghiệm thu • FAIL để yêu cầu khắc phục',
    },
  ];

  const handleOpenManualPanel = (defaultResult?: 'PASS' | 'FAIL') => {
    setManualResult(defaultResult || (activeBooking?.sqcResult === 'FAIL' ? 'FAIL' : 'PASS'));
    setManualSqcCode(activeBooking?.manualOverrideSqcRef || activeBooking?.lastSqcId || '');
    setManualReason(activeBooking?.manualOverrideReason || '');
    setManualStatusError(null);
    setShowManualStatusPanel(true);
    setTimeout(() => {
      manualPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleSubmitManualStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeBk = liveBooking || booking;
    if (!activeBk || isSavingManualStatus) return;

    if (!canManualOverride) {
      setManualStatusError(
        'Bạn không có quyền gán trạng thái thủ công (yêu cầu Tổ trưởng QC, QA, MANAGER, ADMIN hoặc SIGN1/SIGN2).'
      );
      return;
    }

    const trimmedReason = manualReason.trim();
    if (!trimmedReason) {
      setManualStatusError('Vui lòng nhập lý do gán trạng thái thủ công.');
      return;
    }

    setIsSavingManualStatus(true);
    setManualStatusError(null);
    try {
      const updated = await manualOverrideBookingStatusApi(activeBk.id, {
        result: manualResult,
        reason: trimmedReason,
        sqcCode: manualSqcCode.trim() || undefined,
        version: activeBk.version,
      });
      setLiveBooking(updated);
      setShowManualStatusPanel(false);
      setReconcileNotice({
        type: 'success',
        text: `Đã gán trạng thái thủ công ${manualResult === 'PASS' ? 'ĐẠT (PASS)' : 'KHÔNG ĐẠT (FAIL)'} cho phiếu ${updated.bookingCode}. Trạng thái sẽ được giữ nguyên cho tới khi có phiếu SQC mới gắn vào.`,
      });
      if (onReconciled) {
        await onReconciled();
      }
    } catch (err: any) {
      setManualStatusError(err?.message || 'Không thể lưu trạng thái thủ công. Vui lòng thử lại.');
    } finally {
      setIsSavingManualStatus(false);
    }
  };

  const filteredRelatedSqcReports = useMemo(() => {
    if (relatedSqcTypeFilter === 'ALL') return relatedSqcReports;
    return relatedSqcReports.filter((r) => {
      const t = String(r.type || '').toUpperCase();
      if (relatedSqcTypeFilter === 'SQC_VT') return t === 'SQC_VT' || t === 'SQC_MAT';
      return t === relatedSqcTypeFilter;
    });
  }, [relatedSqcReports, relatedSqcTypeFilter]);

  const relatedSqcCounts = useMemo(() => {
    let vt = 0;
    let btp = 0;
    let tp = 0;
    for (const r of relatedSqcReports) {
      const t = String(r.type || '').toUpperCase();
      if (t === 'SQC_VT' || t === 'SQC_MAT') vt++;
      else if (t === 'SQC_BTP') btp++;
      else if (t === 'SQC_TP') tp++;
    }
    return { all: relatedSqcReports.length, vt, btp, tp };
  }, [relatedSqcReports]);

  const ownFailedSqcReport = useMemo(() => {
    if (!activeBooking) return null;
    const activeCodeLower = String(activeBooking.bookingCode || '').trim().toLowerCase();
    return (
      relatedSqcReports.find((r) => {
        const belongsToOtherBatch = Boolean(
          (r.bookingId && r.bookingId !== activeBooking.id) ||
          (r.bookingCode && r.bookingCode.trim().toLowerCase() !== activeCodeLower)
        );
        if (belongsToOtherBatch) return false;
        const stUpper = String(r.status || '').toUpperCase();
        const isFailStatus = ['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(stUpper);
        const hasFailedQty = Number(r.failedQuantity || 0) > 0;
        return isFailStatus || hasFailedQty;
      }) || null
    );
  }, [relatedSqcReports, activeBooking]);

  const handleCopyText = async (text: string, field: 'phone' | 'address') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2000);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  if (!open || !activeBooking) return null;

  const normalizedDocs = normalizeBookingDocuments(activeBooking.documents);
  const totalDocsCount = countBookingDocuments(activeBooking.documents).total;

  const mapsQueryUrl = activeBooking.locationAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeBooking.locationAddress)}`
    : '';
  const mapsEmbedUrl = activeBooking.locationAddress
    ? `https://maps.google.com/maps?q=${encodeURIComponent(activeBooking.locationAddress)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
    : '';

  const resolvedStatusBadge =
    activeBooking.id === booking?.id &&
    liveBooking?.status === booking?.status &&
    liveBooking?.version === booking?.version &&
    liveBooking?.manualStatusOverride === booking?.manualStatusOverride &&
    statusBadge
      ? statusBadge
      : renderBookingStatusBadge(activeBooking.status);

  const modalNode = (
    <>
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/60 backdrop-blur-sm overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-detail-modal-title"
    >
      <div className="booking-print-area bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden">
        {/* Pinned Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
            <h2
              id="booking-detail-modal-title"
              className="text-base sm:text-lg font-bold uppercase tracking-tight text-slate-900 dark:text-white truncate"
            >
              Chi Tiết Booking {activeBooking.bookingCode}
            </h2>
            {activeBooking.totalBatchesForPo && activeBooking.totalBatchesForPo > 1 && activeBooking.batchNumber && (
              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-xs font-bold tabular-nums shrink-0">
                Đợt {activeBooking.batchNumber}/{activeBooking.totalBatchesForPo}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-print min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
            aria-label="Đóng chi tiết booking"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 text-sm bg-slate-50/40 dark:bg-slate-950/30">
          {reconcileNotice && (
            <div
              role="status"
              className={`no-print flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs font-medium ${
                reconcileNotice.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/50 dark:border-green-800 dark:text-green-200'
                  : reconcileNotice.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
                    : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-200'
              }`}
            >
              <span>{reconcileNotice.text}</span>
              <button
                type="button"
                onClick={() => setReconcileNotice(null)}
                className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] inline-flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
                aria-label="Đóng thông báo đối chiếu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeBooking.status === 'RETURNED_FOR_SUPPLEMENT' && (
            <div
              role="alert"
              className="no-print rounded-xl border border-orange-200 dark:border-orange-800 bg-yellow-50 dark:bg-orange-950/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 text-xs text-orange-900 dark:text-orange-100 min-w-0">
                <div className="font-bold uppercase flex items-center gap-1.5 text-orange-700 dark:text-orange-300">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  Đợt nghiệm thu này đang chờ bổ sung / kiểm tra lại
                </div>
                {activeBooking.rejectionReason && (
                  <p className="leading-relaxed">
                    <strong>Lý do / Ghi chú:</strong> {activeBooking.rejectionReason}
                  </p>
                )}
                {activeBooking.suggestedDate && activeBooking.suggestedDate > 0 ? (
                  <p className="font-mono tabular-nums font-semibold">
                    Ngày đề xuất kiểm lại: {new Date(activeBooking.suggestedDate * 1000).toLocaleDateString('vi-VN')}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {onStartInspection && canInspectThis && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartInspection(activeBooking);
                    }}
                    className="min-h-[44px] lg:min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-2 lg:py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    Nghiệm Thu Lại
                  </button>
                )}
                {onOpenAssignModal && canAssignQc && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAssignModal(activeBooking, { mode: 'RETURN' });
                    }}
                    className="min-h-[44px] lg:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-slate-900 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/60 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Cập nhật phản hồi
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Card 1: Order Info, Contact, Address & Embedded Google Map */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3.5 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Đơn hàng PO / PR:
                </span>
                {(() => {
                  const poSum = formatBookingPoSummary(activeBooking);
                  if (poSum.allPos.length <= 1) {
                    return (
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 ml-1.5 tabular-nums">
                        {poSum.primaryPo || activeBooking.poNumber || '—'}
                      </span>
                    );
                  }
                  return (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {poSum.allPos.map((tok) => (
                        <span
                          key={tok}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono text-xs font-bold tabular-nums"
                        >
                          {tok}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Xưởng Vệ Tinh:
                </span>
                <span className="font-semibold text-slate-900 dark:text-white ml-1.5">
                  {activeBooking.supplierName || '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  QC Phụ trách:
                </span>
                <span className="text-slate-700 dark:text-slate-200">
                  {activeBooking.assignedQcName || 'Chưa phân công'}
                </span>
                {onOpenAssignModal &&
                  canAssignQc &&
                  activeBooking.status !== 'COMPLETED' &&
                  activeBooking.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAssignModal(activeBooking);
                      }}
                      className="no-print inline-flex items-center gap-1 min-h-[44px] lg:min-h-[32px] px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {activeBooking.assignedQcName ? 'Đổi QC / Phản hồi' : 'Phân công QC'}
                    </button>
                  )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Trạng thái:
                </span>
                {resolvedStatusBadge}
                {canManualOverride && (
                  <button
                    type="button"
                    onClick={() =>
                      showManualStatusPanel
                        ? setShowManualStatusPanel(false)
                        : handleOpenManualPanel()
                    }
                    className="no-print inline-flex items-center gap-1.5 min-h-[44px] lg:min-h-[32px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    {showManualStatusPanel ? 'Đóng gán thủ công' : 'Gán trạng thái thủ công'}
                  </button>
                )}
              </div>
            </div>

            {Array.isArray(activeBooking.supplierMismatchWarnings) &&
              activeBooking.supplierMismatchWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Lưu ý: Một số mã PO/PR thuộc Nhà cung cấp khác trên ERP</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {activeBooking.supplierMismatchWarnings.map((w, idx) => (
                      <li key={`${w.poNumber}-${idx}`}>
                        Mã <span className="font-mono font-bold">{w.poNumber}</span> trên ERP thuộc{' '}
                        <strong>{w.expectedSupplier}</strong> (khác xưởng booking:{' '}
                        <strong>{w.currentSupplier}</strong>)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {activeBooking.manualStatusOverride && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    Trạng thái được gán thủ công ({activeBooking.manualOverrideResult || activeBooking.sqcResult || '—'})
                  </span>
                  <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                    {activeBooking.manualOverrideByName || 'Quản lý QC'}
                    {activeBooking.manualOverrideAt
                      ? ` · ${new Intl.DateTimeFormat('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(activeBooking.manualOverrideAt * 1000))}`
                      : ''}
                  </span>
                </div>
                {activeBooking.manualOverrideReason && (
                  <div className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    <strong>Lý do:</strong> {activeBooking.manualOverrideReason}
                  </div>
                )}
                {activeBooking.manualOverrideSqcRef && (
                  <div className="text-slate-600 dark:text-slate-300 font-mono">
                    <strong>Mã phiếu SQC tham chiếu:</strong> {activeBooking.manualOverrideSqcRef}
                  </div>
                )}
                <div className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                  Trạng thái này được giữ nguyên qua các lần tải lại / đối chiếu tự động cho tới khi có phiếu SQC mới gắn vào mã Booking {activeBooking.bookingCode}.
                </div>
              </div>
            )}

            {(activeBooking.rejectionReason || (activeBooking.suggestedDate && activeBooking.suggestedDate > 0)) && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                {activeBooking.suggestedDate && activeBooking.suggestedDate > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap text-orange-700 dark:text-orange-300 font-semibold">
                    <span>Đề xuất ngày nghiệm thu:</span>
                    <span className="font-mono tabular-nums">
                      {new Date(activeBooking.suggestedDate * 1000).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                ) : null}
                {activeBooking.rejectionReason ? (
                  <div className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      Ghi chú phản hồi:{' '}
                    </span>
                    <span>{activeBooking.rejectionReason}</span>
                    {activeBooking.rejectedByName && (
                      <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                        ({activeBooking.rejectedByName}
                        {activeBooking.rejectedAt
                          ? ` · ${new Date(activeBooking.rejectedAt * 1000).toLocaleDateString('vi-VN')}`
                          : ''}
                        )
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Contact Row */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Người liên hệ xưởng:
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {activeBooking.contactPerson || '—'}
                </span>
                {activeBooking.contactPhone && (
                  <a
                    href={`tel:${activeBooking.contactPhone.replace(/[^0-9+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[34px] rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-mono text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {activeBooking.contactPhone}
                  </a>
                )}
              </div>

              {activeBooking.contactPhone && (
                <button
                  type="button"
                  onClick={() => handleCopyText(activeBooking.contactPhone, 'phone')}
                  className="no-print inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[36px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedField === 'phone' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      Đã sao chép
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Sao chép SĐT
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Address + Actions + Embedded Map */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Địa chỉ xưởng khảo sát:
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 leading-snug">
                      {activeBooking.locationAddress || 'Chưa cập nhật địa chỉ'}
                    </div>
                  </div>
                </div>

                {activeBooking.locationAddress && (
                  <div className="no-print flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCopyText(activeBooking.locationAddress, 'address')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[36px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedField === 'address' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-600" />
                          Đã sao chép
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Sao chép địa chỉ
                        </>
                      )}
                    </button>

                    <a
                      href={mapsQueryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[36px] rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Mở Google Maps chỉ đường
                    </a>
                  </div>
                )}
              </div>

              {mapsEmbedUrl && (
                <div className="no-print relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 h-52 w-full">
                  <iframe
                    title={`Bản đồ vị trí xưởng ${activeBooking.supplierName}`}
                    src={mapsEmbedUrl}
                    className="w-full h-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Inline Manual Status Override Panel (Zero Modal Nesting) */}
          {showManualStatusPanel && canManualOverride && (
            <form
              ref={manualPanelRef}
              onSubmit={handleSubmitManualStatus}
              className="no-print bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-blue-300 dark:border-blue-800 shadow-sm space-y-3.5"
            >
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-tight text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 shrink-0" />
                    Gán Trạng Thái Phiếu Book QC Thủ Công
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Áp dụng khi không tìm thấy báo cáo SQC hoặc hệ thống chưa tự nhận báo cáo. Trạng thái sẽ được giữ nguyên cho đến khi có phiếu SQC mới gắn vào Booking này.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualStatusPanel(false)}
                  disabled={isSavingManualStatus}
                  className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] -mr-1.5 -mt-1 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  aria-label="Đóng biểu mẫu gán trạng thái thủ công"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {manualStatusError && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs font-medium text-red-700 dark:text-red-300 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{manualStatusError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5">
                    Kết quả nghiệm thu <span className="text-red-600">*</span>
                  </label>
                  <Combobox<'PASS' | 'FAIL'>
                    value={manualResult}
                    onChange={(val) => {
                      if (val === 'PASS' || val === 'FAIL') setManualResult(val);
                    }}
                    options={manualResultOptions}
                    allowClear={false}
                    placeholder="Chọn PASS hoặc FAIL..."
                    searchPlaceholder="Tìm kết quả..."
                    ariaLabel="Chọn kết quả gán thủ công PASS hoặc FAIL"
                  />
                </div>

                <div>
                  <label
                    htmlFor="manual-sqc-code-input"
                    className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Mã phiếu SQC tham chiếu (Tùy chọn)
                  </label>
                  <input
                    id="manual-sqc-code-input"
                    type="text"
                    value={manualSqcCode}
                    onChange={(e) => setManualSqcCode(e.target.value)}
                    placeholder="VD: SQC-BTP-20261120-001 (có thể bỏ trống)"
                    maxLength={120}
                    className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-900 dark:text-slate-100"
                  />
                  {relatedSqcReports.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Chọn nhanh:
                      </span>
                      {relatedSqcReports.slice(0, 4).map((rep) => (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => setManualSqcCode(rep.id)}
                          className={`px-2 py-0.5 rounded-md border font-mono text-[11px] transition-colors cursor-pointer ${
                            manualSqcCode.trim() === rep.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {rep.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="manual-override-reason-input"
                  className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Lý do gán trạng thái thủ công <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="manual-override-reason-input"
                  rows={2}
                  required
                  maxLength={1000}
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Nhập căn cứ nghiệm thu (VD: Đã nghiệm thu đạt tại xưởng theo biên bản giấy / phiếu SQC lưu khác mã PO)..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowManualStatusPanel(false)}
                  disabled={isSavingManualStatus}
                  className="min-h-[44px] lg:min-h-[36px] px-4 py-2 lg:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingManualStatus}
                  className={`min-h-[44px] lg:min-h-[36px] inline-flex items-center gap-1.5 px-4 py-2 lg:py-1.5 rounded-lg text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    manualResult === 'PASS'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isSavingManualStatus ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {isSavingManualStatus
                    ? 'Đang lưu...'
                    : manualResult === 'PASS'
                      ? 'Xác nhận ĐẠT (PASS)'
                      : 'Xác nhận KHÔNG ĐẠT (FAIL)'}
                </button>
              </div>
            </form>
          )}

          {/* Card 2: Technical Documents (4 Structured Categories) */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-blue-600 shrink-0" />
                Hồ Sơ & Tài Liệu Kỹ Thuật Nghiệm Thu
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono text-[11px] font-semibold tabular-nums">
                {totalDocsCount} tệp / link
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {BOOKING_DOCUMENT_GROUPS.map((group) => {
                const items = normalizedDocs[group.field];
                const imageItems = items.filter((it) => isImageAttachment(it));
                const fileItems = items.filter((it) => !isImageAttachment(it));

                return (
                  <div
                    key={group.key}
                    className="p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {group.title}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        ({items.length})
                      </span>
                    </div>

                    {items.length === 0 ? (
                      <div className="text-slate-400 dark:text-slate-500 italic">
                        Chưa đính kèm
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Image Thumbnails Grid */}
                        {imageItems.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {imageItems.map((imgItem) => {
                              const openHref = getAttachmentActionUrl(imgItem.url);
                              return (
                                <div key={imgItem.id} className="group relative">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage({ url: openHref, name: imgItem.name })}
                                    className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in hover:ring-2 hover:ring-blue-500 transition-all"
                                    title={`Xem ảnh: ${imgItem.name}`}
                                  >
                                    <ProxyImage
                                      src={openHref}
                                      alt={imgItem.name}
                                      className="w-16 h-16 object-cover rounded-lg"
                                      allowDirectOpen={false}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* File / Document Links */}
                        {fileItems.length > 0 && (
                          <div className="space-y-1.5">
                            {fileItems.map((doc) => {
                              const openHref = getAttachmentActionUrl(doc.url);
                              const extBadge = getFileExtBadge(doc);
                              const sizeStr = formatFileSize(doc.size);
                              return (
                                <div
                                  key={doc.id}
                                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold shrink-0">
                                      {extBadge}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-slate-800 dark:text-slate-100 truncate" title={doc.name}>
                                        {doc.name}
                                      </div>
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                        {isGoogleDriveUrl(doc.url) ? 'Google Drive' : doc.sourceType === 'LINK' ? 'Liên kết' : 'Tệp đính kèm'}
                                        {sizeStr ? ` · ${sizeStr}` : ''}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <a
                                      href={openHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 min-h-[44px] lg:min-h-[32px] px-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold hover:underline whitespace-nowrap"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Xem
                                    </a>
                                    {doc.sourceType === 'UPLOAD' && (
                                      <a
                                        href={openHref}
                                        download={doc.name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="no-print inline-flex items-center justify-center min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                                        title="Tải về"
                                        aria-label={`Tải về ${doc.name}`}
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Booking Items */}
          {Array.isArray(activeBooking.items) && activeBooking.items.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-500" />
                  Hạng Mục Gia Công Đặt Lịch ({activeBooking.items.length})
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeBooking.items.map((it, idx) => (
                  <div
                    key={it.id || idx}
                    className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{it.itemName}</span>
                        {it.poNumber && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300 tabular-nums shrink-0">
                            {it.poNumber}
                          </span>
                        )}
                      </div>
                      {it.specifications && (
                        <div className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {it.specifications}
                        </div>
                      )}
                    </div>
                    <div className="font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 tabular-nums">
                      {it.quantity} {it.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card 4: Related SQC Reports Section (PO / PR / Booking / Material) */}
          <div
            ref={sqcSectionRef}
            className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
          >
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold uppercase text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    Báo Cáo SQC Liên Quan Đến PO / PR ({relatedSqcReports.length})
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 flex-wrap tabular-nums">
                    <span>
                      PO: {formatBookingPoSummary(activeBooking).joinedPo || activeBooking.poNumber || '—'}
                    </span>
                    {relatedSqcContext && relatedSqcContext.prTerms.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>PR/FO: {relatedSqcContext.prTerms.slice(0, 5).join(', ')}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Booking: {activeBooking.bookingCode}</span>
                  </div>
                </div>

                <div className="no-print flex items-center gap-2 shrink-0 flex-wrap">
                  {ownFailedSqcReport &&
                    onOpenAssignModal &&
                    canAssignQc &&
                    activeBooking.status !== 'COMPLETED' &&
                    activeBooking.status !== 'CANCELLED' &&
                    activeBooking.status !== 'RETURNED_FOR_SUPPLEMENT' && (
                      <button
                        type="button"
                        onClick={() => {
                          const failedQtyText = Number(ownFailedSqcReport.failedQuantity || 0) > 0
                            ? ` (SL lỗi: ${ownFailedSqcReport.failedQuantity})`
                            : '';
                          const prefillReason = `Phiếu SQC ${ownFailedSqcReport.id} có kết quả không đạt${failedQtyText}. Yêu cầu khắc phục & đặt lịch kiểm tra lại.`;
                          onClose();
                          onOpenAssignModal(activeBooking, { mode: 'RETURN', prefillReason });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[36px] rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Yêu cầu kiểm lại
                      </button>
                    )}

                  {canReconcile && (
                    <button
                      type="button"
                      onClick={handleReconcile}
                      disabled={isReconciling}
                      className="inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[36px] rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      <GitCompare className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                      {isReconciling ? 'Đang đối chiếu...' : 'Đối Chiếu'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => loadRelatedSqc(activeBooking.id || activeBooking.bookingCode)}
                    disabled={isLoadingRelatedSqc}
                    className="inline-flex items-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingRelatedSqc ? 'animate-spin' : ''}`}
                    />
                    Làm mới
                  </button>
                </div>
              </div>

              {/* Segmented Filter Tabs by SQC Type */}
              <div className="no-print flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg w-fit max-w-full overflow-x-auto">
                {(
                  [
                    { id: 'ALL', label: `Tất cả (${relatedSqcCounts.all})` },
                    { id: 'SQC_VT', label: `SQC-VT (${relatedSqcCounts.vt})` },
                    { id: 'SQC_BTP', label: `SQC-BTP (${relatedSqcCounts.btp})` },
                    { id: 'SQC_TP', label: `SQC-TP (${relatedSqcCounts.tp})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRelatedSqcTypeFilter(tab.id)}
                    className={`min-h-[44px] lg:min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                      relatedSqcTypeFilter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading / Error / Empty / Table States */}
            {isLoadingRelatedSqc ? (
              <div className="p-4 space-y-2.5">
                {[1, 2, 3].map((rowIdx) => (
                  <div
                    key={rowIdx}
                    className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ) : relatedSqcError ? (
              <div className="p-5 flex flex-col items-center justify-center text-center gap-2.5">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {relatedSqcError}
                </p>
                <button
                  type="button"
                  onClick={() => loadRelatedSqc(activeBooking.id || activeBooking.bookingCode)}
                  className="min-h-[44px] lg:min-h-[36px] px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-semibold border border-red-200 dark:border-red-800 transition-colors cursor-pointer"
                >
                  Thử lại
                </button>
              </div>
            ) : filteredRelatedSqcReports.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {relatedSqcReports.length === 0
                    ? 'Chưa có báo cáo SQC nào khớp với Số PO, PR, Mã Booking hoặc Vật tư của đơn hàng này.'
                    : 'Không có báo cáo thuộc phân loại SQC đang chọn.'}
                </p>
                {relatedSqcReports.length === 0 && (
                  <div className="no-print flex items-center justify-center gap-2 flex-wrap">
                    {onStartInspection && canInspectThis && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onStartInspection(activeBooking);
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Tạo Phiếu Nghiệm Thu SQC
                      </button>
                    )}
                    {canManualOverride && !showManualStatusPanel && (
                      <button
                        type="button"
                        onClick={() => handleOpenManualPanel()}
                        className="inline-flex items-center gap-1.5 min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        Gán Trạng Thái Thủ Công
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Cards (< md) */}
                <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {filteredRelatedSqcReports.map((r) => {
                    const tUpper = String(r.type || 'SQC_BTP').toUpperCase();
                    const typeLabel =
                      tUpper === 'SQC_VT' || tUpper === 'SQC_MAT'
                        ? 'SQC-VT'
                        : tUpper === 'SQC_TP'
                          ? 'SQC-TP'
                          : 'SQC-BTP';
                    const stUpper = String(r.status || '').toUpperCase();
                    const isPass = ['APPROVED', 'COMPLETED', 'VERIFIED', 'PASSED', 'PASS', 'LOCKED'].includes(stUpper);
                    const isFail = ['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(stUpper);
                    const isDraft = stUpper === 'DRAFT';
                    const activeCodeLower = String(activeBooking.bookingCode || '').trim().toLowerCase();
                    const isSameBooking = Boolean(
                      (r.bookingId && r.bookingId === activeBooking.id) ||
                      (r.bookingCode && r.bookingCode.trim().toLowerCase() === activeCodeLower)
                    );
                    const isOtherBooking = Boolean(
                      !isSameBooking &&
                      ((r.bookingId && r.bookingId !== activeBooking.id) ||
                        (r.bookingCode && r.bookingCode.trim().toLowerCase() !== activeCodeLower))
                    );
                    const statusBadgeClass = isPass
                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                      : isFail
                        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                        : isDraft
                          ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          : 'bg-yellow-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
                    const statusLabel = isPass ? 'Đạt / Đã duyệt' : isFail ? 'Không đạt' : isDraft ? 'Bản nháp' : 'Chờ duyệt';

                    return (
                      <div key={r.id} className="p-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 truncate">{r.id}</span>
                              {isSameBooking && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold">
                                  Đợt này
                                </span>
                              )}
                              {isOtherBooking && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold">
                                  Đợt khác{r.bookingCode ? `: ${r.bookingCode}` : ''}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              <strong className="text-slate-700 dark:text-slate-300">{typeLabel}</strong> · {r.date || '—'}
                              {Number(r.failedQuantity || 0) > 0 && (
                                <span className="ml-1.5 text-red-600 dark:text-red-400 font-semibold">
                                  · Lỗi: {r.failedQuantity}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${statusBadgeClass}`}>{statusLabel}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                          <span>QC: {r.inspectorName || '—'}</span>
                          <span className="font-mono font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums">
                            {r.inspectedQuantity ? `${r.passedQuantity ?? 0}/${r.inspectedQuantity}` : r.score ? `${r.score}%` : '—'}
                          </span>
                        </div>
                        {Boolean(onViewInspection) && canViewM03RelatedSqc(currentUser, r.type, rolesList) && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onViewInspection!(r.id);
                            }}
                            className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            Mở phiếu <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet Table (>= md) */}
                <div className="hidden md:block overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 whitespace-nowrap">Mã Phiếu SQC</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Số PO / PR</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Ngày Kiểm</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">QC Kiểm Tra</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Đạt / Kiểm</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Kết Quả</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap no-print">Chi Tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                      {filteredRelatedSqcReports.map((r) => {
                        const tUpper = String(r.type || 'SQC_BTP').toUpperCase();
                        const typeLabel =
                          tUpper === 'SQC_VT' || tUpper === 'SQC_MAT'
                            ? 'SQC-VT'
                            : tUpper === 'SQC_TP'
                              ? 'SQC-TP'
                              : 'SQC-BTP';

                        const reasonLabels: Record<RelatedSqcMatchReason, string> = {
                          PO: 'Khớp PO',
                          PR: 'Khớp PR/FO',
                          BOOKING: 'Khớp Booking',
                          MATERIAL: 'Khớp Vật tư',
                        };

                        const stUpper = String(r.status || '').toUpperCase();
                        const isPass = [
                          'APPROVED',
                          'COMPLETED',
                          'VERIFIED',
                          'PASSED',
                          'PASS',
                          'LOCKED',
                        ].includes(stUpper);
                        const isFail = ['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(stUpper);
                        const isDraft = stUpper === 'DRAFT';

                        const statusBadgeClass = isPass
                          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                          : isFail
                            ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                            : isDraft
                              ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                              : 'bg-yellow-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';

                        const statusLabel = isPass
                          ? 'Đạt / Đã duyệt'
                          : isFail
                            ? 'Không đạt'
                            : isDraft
                              ? 'Bản nháp'
                              : 'Chờ duyệt';

                        const poPrDisplay =
                          [
                            r.poNumber ? `PO ${r.poNumber}` : null,
                            r.prNumber ? `PR ${r.prNumber}` : null,
                            !r.poNumber && !r.prNumber && r.maCt ? r.maCt : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—';

                        const hasQty =
                          r.inspectedQuantity !== undefined && r.inspectedQuantity > 0;

                        const canOpenReport = Boolean(onViewInspection) && canViewM03RelatedSqc(currentUser, r.type, rolesList);
                        const activeCodeLower = String(activeBooking.bookingCode || '').trim().toLowerCase();
                        const isSameBooking = Boolean(
                          (r.bookingId && r.bookingId === activeBooking.id) ||
                          (r.bookingCode && r.bookingCode.trim().toLowerCase() === activeCodeLower)
                        );
                        const isOtherBooking = Boolean(
                          !isSameBooking &&
                          ((r.bookingId && r.bookingId !== activeBooking.id) ||
                            (r.bookingCode && r.bookingCode.trim().toLowerCase() !== activeCodeLower))
                        );

                        return (
                          <tr
                            key={r.id}
                            onClick={() => {
                              if (canOpenReport && onViewInspection) {
                                onClose();
                                onViewInspection(r.id);
                              }
                            }}
                            className={`transition-colors group ${canOpenReport ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer' : ''}`}
                          >
                            <td className="px-3 py-2.5 align-top">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 ${canOpenReport ? 'group-hover:underline' : ''}`}>
                                  {r.id}
                                </span>
                                {isSameBooking && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold">
                                    Đợt này
                                  </span>
                                )}
                                {isOtherBooking && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold">
                                    Đợt khác{r.bookingCode ? `: ${r.bookingCode}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {typeLabel}
                                </span>
                                {r.matchReasons.length > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {r.matchReasons.map((m) => reasonLabels[m] || m).join(' · ')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                              {poPrDisplay}
                            </td>
                            <td className="px-3 py-2.5 align-top font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                              {r.date || '—'}
                            </td>
                            <td className="px-3 py-2.5 align-top text-xs text-slate-700 dark:text-slate-300">
                              {r.inspectorName || '—'}
                            </td>
                            <td className="px-3 py-2.5 align-top text-right font-mono text-xs text-cyan-700 dark:text-cyan-400 font-semibold tabular-nums whitespace-nowrap">
                              <div>
                                {hasQty
                                  ? `${r.passedQuantity ?? 0}/${r.inspectedQuantity}`
                                  : r.score !== undefined && r.score > 0
                                    ? `${r.score}%`
                                    : '—'}
                              </div>
                              {Number(r.failedQuantity || 0) > 0 && (
                                <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                                  Lỗi: {r.failedQuantity}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 align-top whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusBadgeClass}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 align-top text-right whitespace-nowrap no-print">
                              {canOpenReport ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onViewInspection) {
                                      onClose();
                                      onViewInspection(r.id);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 min-h-[44px] lg:min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Mở phiếu
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pinned Footer */}
        <div className="no-print flex items-center justify-between gap-2 px-4 py-2 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 shrink-0 flex-wrap">
          <div>
            {onStartInspection &&
              canInspectThis &&
              activeBooking.status !== 'COMPLETED' &&
              activeBooking.status !== 'CANCELLED' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartInspection(activeBooking);
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeBooking.status === 'RETURNED_FOR_SUPPLEMENT'
                      ? 'bg-orange-600 hover:bg-orange-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {activeBooking.status === 'RETURNED_FOR_SUPPLEMENT' ? 'Nghiệm Thu Lại' : 'Nghiệm Thu SQC'}
                </button>
              )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              In Phiếu
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] sm:min-h-[36px] px-4 sm:px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>

    {previewImage && (
      <div
        className="no-print fixed inset-0 z-[300] bg-black/90 backdrop-blur-md flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden"
        onClick={() => setPreviewImage(null)}
        role="dialog"
        aria-modal="true"
        aria-label={`Xem ảnh ${previewImage.name}`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-white shrink-0">
          <span className="text-xs font-semibold truncate">{previewImage.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={previewImage.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="min-h-[44px] px-3 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center gap-1.5 text-xs font-semibold text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Mở gốc
            </a>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 cursor-pointer"
              aria-label="Đóng xem ảnh"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div
          className="flex-1 min-h-0 flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    )}
    </>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
