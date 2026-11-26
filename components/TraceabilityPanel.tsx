import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Inspection,
  User,
  TraceabilityBundle,
  TraceabilityMatchReason,
  TraceabilityInspectionItem,
  TraceabilityNcrItem,
  TraceabilityBookingItem,
} from '../types';
import {
  fetchInspectionTraceability,
  fetchPublicInspectionTraceability,
  fetchTraceabilityByCodes,
} from '../services/apiService';
import { getProxyImageUrl } from '../src/utils';
import { formatDisplayDate } from '../lib/utils';
import {
  GitBranch,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  AlertTriangle,
  Calendar,
  ArrowLeft,
  X,
  Plus,
  ExternalLink,
  Search,
} from 'lucide-react';

interface TraceabilityPanelProps {
  inspection?: Inspection | null;
  inspectionId?: string;
  ipoCode?: string;
  poCode?: string;
  prCode?: string;
  searchCode?: string;
  user?: User | null;
  isPublicView?: boolean;
  variant?: 'banner-drawer' | 'embedded';
  compact?: boolean;
  canGoBackInStack?: boolean;
  onGoBackInStack?: () => void;
  onViewInspection?: (inspectionId: string) => void;
  onCreateNewForCode?: (code: string) => void;
}

const REASON_LABELS: Record<TraceabilityMatchReason, string> = {
  CURRENT: 'Phiếu đang xem',
  IPO: 'Khớp Mã NM',
  PO: 'Khớp Số PO',
  PR: 'Khớp Số PR',
  ERP_BRIDGE: 'Liên kết ERP',
  BOOKING: 'Khớp Booking',
};

const TYPE_LABELS: Record<string, string> = {
  IQC: 'IQC · Đầu vào',
  SQC_VT: 'SQC-VT · Vật tư GCN',
  SQC_MAT: 'SQC-VT · Vật tư GCN',
  SQC_BTP: 'SQC-BTP · Bán thành phẩm',
  SQC_TP: 'SQC-TP · Thành phẩm GCN',
  PQC: 'PQC · Sản xuất',
  STEP: 'STEP · Sơn / Vecni',
  FQC: 'FQC · Thành phẩm',
  SPR: 'SPR · Trước lắp đặt',
  FSR: 'FSR · Công trường',
  SITE: 'SITE · Mặt bằng',
};

function renderInspectionStatusMeta(status: string): {
  label: string;
  textClass: string;
  icon: React.ReactNode;
} {
  const st = String(status || '').toUpperCase();
  if (st === 'VERIFIED') {
    return {
      label: 'Đã duyệt L1',
      textClass: 'text-cyan-600 dark:text-cyan-400',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (['APPROVED', 'COMPLETED', 'PASSED', 'PASS', 'LOCKED'].includes(st)) {
    const labelMap: Record<string, string> = {
      LOCKED: 'Đã khóa ISO',
      APPROVED: 'Đã duyệt L2',
      COMPLETED: 'Hoàn thành',
    };
    return {
      label: labelMap[st] || 'Đạt / Đã duyệt',
      textClass: 'text-green-600 dark:text-green-400',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(st)) {
    return {
      label: 'Không đạt / Từ chối',
      textClass: 'text-red-600 dark:text-red-400',
      icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (st === 'DRAFT') {
    return {
      label: 'Bản nháp',
      textClass: 'text-slate-600 dark:text-slate-400',
      icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  return {
    label: 'Chờ duyệt',
    textClass: 'text-orange-600 dark:text-orange-400',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  };
}

function renderNcrStatusMeta(status: string): {
  label: string;
  textClass: string;
  icon: React.ReactNode;
} {
  const st = String(status || 'OPEN').toUpperCase();
  if (st === 'CLOSED') {
    return {
      label: 'Đã đóng (ISO)',
      textClass: 'text-green-600 dark:text-green-400',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (st === 'VERIFIED') {
    return {
      label: 'Đã thẩm tra',
      textClass: 'text-cyan-600 dark:text-cyan-400',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (st === 'CORRECTED') {
    return {
      label: 'Đã khắc phục',
      textClass: 'text-blue-600 dark:text-blue-400',
      icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  return {
    label: st === 'ASSIGNED' ? 'Đã phân công' : 'Đang mở',
    textClass: 'text-red-600 dark:text-red-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
  };
}

function renderBookingStatusMeta(status: string): {
  label: string;
  textClass: string;
  icon: React.ReactNode;
} {
  const st = String(status || '').toUpperCase();
  if (st === 'COMPLETED') {
    return {
      label: 'Hoàn thành',
      textClass: 'text-green-600 dark:text-green-400',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (st === 'RETURNED_FOR_SUPPLEMENT' || st === 'CANCELLED') {
    return {
      label: st === 'CANCELLED' ? 'Đã hủy' : 'Trả lại bổ sung',
      textClass: 'text-red-600 dark:text-red-400',
      icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  if (st === 'ASSIGNED' || st === 'IN_PROGRESS') {
    return {
      label: st === 'IN_PROGRESS' ? 'Đang kiểm tra' : 'Đã phân công',
      textClass: 'text-blue-600 dark:text-blue-400',
      icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
    };
  }
  return {
    label: 'Chờ phân công',
    textClass: 'text-orange-600 dark:text-orange-400',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  };
}

type FilterTab = 'ALL' | 'INSPECTIONS' | 'NCRS' | 'BOOKINGS';

export const TraceabilityPanel: React.FC<TraceabilityPanelProps> = ({
  inspection,
  inspectionId,
  ipoCode,
  poCode,
  prCode,
  searchCode,
  user,
  isPublicView = false,
  variant = 'embedded',
  compact = false,
  canGoBackInStack = false,
  onGoBackInStack,
  onViewInspection,
  onCreateNewForCode,
}) => {
  const effectiveInspectionId = inspection?.id || inspectionId || undefined;
  const effectivePublic = Boolean(isPublicView || user?.role === 'GUEST');

  const [bundle, setBundle] = useState<TraceabilityBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedNcrIds, setExpandedNcrIds] = useState<Record<string, boolean>>({});

  const loadTraceability = useCallback(
    async (signal?: AbortSignal) => {
      if (!effectiveInspectionId && !ipoCode && !poCode && !prCode && !searchCode) {
        setBundle(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        let data: TraceabilityBundle;
        if (effectivePublic && effectiveInspectionId) {
          data = await fetchPublicInspectionTraceability(effectiveInspectionId, signal);
        } else if (effectiveInspectionId) {
          data = await fetchInspectionTraceability(effectiveInspectionId, signal);
        } else {
          data = await fetchTraceabilityByCodes(
            { ipo: ipoCode, po: poCode, pr: prCode, q: searchCode },
            signal
          );
        }
        if (!signal?.aborted) {
          setBundle(data);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && !signal?.aborted) {
          setError(err?.message || 'Không thể tải lịch sử truy xuất nguồn gốc.');
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [effectiveInspectionId, effectivePublic, ipoCode, poCode, prCode, searchCode]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadTraceability(controller.signal);
    return () => controller.abort();
  }, [loadTraceability]);

  const toggleNcrExpand = (ncrId: string) => {
    setExpandedNcrIds((prev) => ({ ...prev, [ncrId]: !prev[ncrId] }));
  };

  const normalizedQuery = searchFilter.trim().toLowerCase();

  const filteredInspections = useMemo(() => {
    const list = bundle?.inspections || [];
    if (!normalizedQuery) return list;
    return list.filter((it) =>
      [it.id, it.type, it.maNhaMay, it.poNumber, it.prNumber, it.tenHangMuc, it.maCt, it.workshop, it.supplier, it.inspectorName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedQuery))
    );
  }, [bundle?.inspections, normalizedQuery]);

  const filteredNcrs = useMemo(() => {
    const list = bundle?.ncrs || [];
    if (!normalizedQuery) return list;
    return list.filter((n) =>
      [n.id, n.defectCode, n.description, n.title, n.poNumber, n.maNhaMay, n.inspectionId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedQuery))
    );
  }, [bundle?.ncrs, normalizedQuery]);

  const filteredBookings = useMemo(() => {
    const list = bundle?.bookings || [];
    if (!normalizedQuery) return list;
    return list.filter((b) =>
      [b.bookingCode, b.poNumber, b.supplierName, b.sqcType]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedQuery))
    );
  }, [bundle?.bookings, normalizedQuery]);

  const keyTokensSummary = useMemo(() => {
    const parts: string[] = [];
    const propMaNmRaw = String(inspection?.ma_nha_may || '').trim();
    const propSupplier = String(inspection?.supplier || '').trim();
    const isSupFallback =
      Boolean(propMaNmRaw && propSupplier && propMaNmRaw === propSupplier) &&
      !/^\d{5,}$/.test(propMaNmRaw) &&
      !/^(FO|IPO)/i.test(propMaNmRaw);
    const propHeadcode = String(inspection?.headcode || (!isSupFallback ? propMaNmRaw : '') || '').trim();
    const propPo = String(inspection?.po_number || inspection?.poNumber || '').trim();
    const propPr = String(inspection?.pr_number || inspection?.prNumber || '').trim();

    const ipos = Array.from(
      new Set([...(bundle?.queryContext.ipoTerms || []), ipoCode, propHeadcode].filter(Boolean))
    );
    const pos = Array.from(
      new Set([...(bundle?.queryContext.poTerms || []), poCode, propPo].filter(Boolean))
    );
    const prs = Array.from(
      new Set([...(bundle?.queryContext.prTerms || []), prCode, propPr].filter(Boolean))
    );
    if (ipos.length > 0) parts.push(`Mã NM: ${ipos.slice(0, 3).join(', ')}${ipos.length > 3 ? ` (+${ipos.length - 3})` : ''}`);
    if (pos.length > 0) parts.push(`PO: ${pos.slice(0, 3).join(', ')}${pos.length > 3 ? ` (+${pos.length - 3})` : ''}`);
    if (prs.length > 0) parts.push(`PR: ${prs.slice(0, 3).join(', ')}${prs.length > 3 ? ` (+${prs.length - 3})` : ''}`);
    return parts;
  }, [bundle?.queryContext, ipoCode, poCode, prCode, inspection]);

  const totalChainCount =
    (bundle?.summary.totalInspections || 0) +
    (bundle?.summary.totalNcrs || 0) +
    (bundle?.summary.totalBookings || 0);

  const renderTimelineBody = () => {
    if (isLoading && !bundle) {
      return (
        <div className="space-y-3 py-2" aria-busy="true">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-[68px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 animate-pulse"
            />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadTraceability()}
            className="min-h-[44px] lg:min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      );
    }

    const noMatches =
      !bundle ||
      (bundle.inspections.length === 0 && bundle.ncrs.length === 0 && bundle.bookings.length === 0);

    if (noMatches) {
      return (
        <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-center space-y-3">
          <GitBranch className="w-6 h-6 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Chưa tìm thấy hồ sơ truy xuất nguồn gốc liên kết
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {keyTokensSummary.length > 0
                ? `Đã tìm theo ${keyTokensSummary.join(' · ')}. Hiện chưa có phiếu kiểm tra, NCR hoặc Booking khác khớp các mã này.`
                : 'Phiếu hoặc mã hiện tại chưa khai báo mã IPO (Mã nhà máy), PO hoặc PR để liên kết chéo.'}
            </p>
          </div>
          {onCreateNewForCode && (searchCode || ipoCode || poCode) && !effectivePublic && (
            <button
              type="button"
              onClick={() => onCreateNewForCode(searchCode || ipoCode || poCode || '')}
              className="min-h-[44px] lg:min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tạo phiếu kiểm tra mới cho mã này
            </button>
          )}
        </div>
      );
    }

    const showInspections = activeTab === 'ALL' || activeTab === 'INSPECTIONS';
    const showNcrs = activeTab === 'ALL' || activeTab === 'NCRS';
    const showBookings = activeTab === 'ALL' || activeTab === 'BOOKINGS';

    return (
      <div className="space-y-4">
        {/* Metrics Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/60 dark:bg-slate-800/30 p-3">
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Phiếu kiểm tra</span>
            <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {bundle.summary.totalInspections}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Đạt / Đã duyệt</span>
            <span className="font-mono text-base font-bold text-green-600 dark:text-green-400 tabular-nums">
              {bundle.summary.passedInspections}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Báo cáo NCR</span>
            <span className="font-mono text-base font-bold text-red-600 dark:text-red-400 tabular-nums">
              {bundle.summary.totalNcrs}
              {bundle.summary.openNcrs > 0 && (
                <span className="text-xs font-medium text-orange-600 dark:text-orange-400 ml-1">
                  ({bundle.summary.openNcrs} mở)
                </span>
              )}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Booking GCN</span>
            <span className="font-mono text-base font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
              {bundle.summary.totalBookings}
            </span>
          </div>
        </div>

        {/* Filter Bar + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'ALL', label: `Tất cả (${totalChainCount})` },
                { id: 'INSPECTIONS', label: `Phiếu (${bundle.inspections.length})` },
                { id: 'NCRS', label: `NCR (${bundle.ncrs.length})` },
                { id: 'BOOKINGS', label: `Booking (${bundle.bookings.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Lọc mã, xưởng, hạng mục..."
              className="w-full min-h-[40px] lg:min-h-[36px] pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Inspections List */}
        {showInspections && filteredInspections.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Lịch sử phiếu kiểm tra ({filteredInspections.length})
            </h4>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              {filteredInspections.map((item: TraceabilityInspectionItem) => {
                const stMeta = renderInspectionStatusMeta(item.status);
                const tUpper = String(item.type || '').toUpperCase();
                const typeLabel = TYPE_LABELS[tUpper] || item.type || 'QC';
                const reasonsText = item.matchReasons
                  .map((r) => REASON_LABELS[r] || r)
                  .join(' · ');
                const dateText =
                  item.date || (item.createdAt ? formatDisplayDate(item.createdAt) : '—');
                const canClick = Boolean(onViewInspection && !item.isCurrent);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (canClick && onViewInspection) {
                        if (variant === 'banner-drawer') setDrawerOpen(false);
                        onViewInspection(item.id);
                      }
                    }}
                    className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                      item.isCurrent
                        ? 'bg-blue-50/50 dark:bg-blue-950/20'
                        : canClick
                          ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                          : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                          {item.id}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {typeLabel}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${stMeta.textClass}`}>
                          {stMeta.icon}
                          {stMeta.label}
                        </span>
                      </div>

                      {item.tenHangMuc && (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.tenHangMuc}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.maNhaMay && (
                          <span className="font-mono tabular-nums">IPO {item.maNhaMay}</span>
                        )}
                        {item.poNumber && (
                          <>
                            {item.maNhaMay && <span aria-hidden="true">·</span>}
                            <span className="font-mono tabular-nums">PO {item.poNumber}</span>
                          </>
                        )}
                        {item.prNumber && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">PR {item.prNumber}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{dateText}</span>
                        {item.inspectorName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.inspectorName}</span>
                          </>
                        )}
                        {reasonsText && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-cyan-700 dark:text-cyan-400 font-medium">{reasonsText}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      {(item.inspectedQuantity ?? 0) > 0 && (
                        <div className="text-right font-mono text-xs tabular-nums">
                          <span className="text-green-600 dark:text-green-400 font-semibold">
                            {item.passedQuantity ?? 0}
                          </span>
                          <span className="text-slate-400 mx-0.5">/</span>
                          <span className="text-slate-700 dark:text-slate-300">
                            {item.inspectedQuantity}
                          </span>
                          {(item.failedQuantity ?? 0) > 0 && (
                            <span className="text-red-600 dark:text-red-400 ml-1">
                              ({item.failedQuantity} lỗi)
                            </span>
                          )}
                        </div>
                      )}
                      {item.isCurrent ? (
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          Đang mở
                        </span>
                      ) : canClick ? (
                        <span className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 whitespace-nowrap">
                          {effectivePublic ? 'Xem chỉ đọc' : 'Mở phiếu'}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* NCRs List */}
        {showNcrs && filteredNcrs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Báo cáo sự cố NCR liên quan ({filteredNcrs.length})
            </h4>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              {filteredNcrs.map((ncr: TraceabilityNcrItem) => {
                const stMeta = renderNcrStatusMeta(ncr.status);
                const isExpanded = Boolean(expandedNcrIds[ncr.id]);
                const dateText =
                  ncr.createdDate || (ncr.createdAt ? formatDisplayDate(ncr.createdAt) : '—');
                return (
                  <div key={ncr.id} className="p-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                            {ncr.id}
                          </span>
                          {ncr.defectCode && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                                {ncr.defectCode}
                              </span>
                            </>
                          )}
                          {ncr.severity && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                                {ncr.severity}
                              </span>
                            </>
                          )}
                          <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${stMeta.textClass}`}>
                            {stMeta.icon}
                            {stMeta.label}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-200">
                          {ncr.description || ncr.title || 'Báo cáo sự cố chất lượng'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">{dateText}</span>
                          {ncr.inspectionId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">Từ phiếu {ncr.inspectionId}</span>
                            </>
                          )}
                          {ncr.responsiblePerson && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Phụ trách: {ncr.responsiblePerson}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {ncr.inspectionId && onViewInspection && ncr.inspectionId !== effectiveInspectionId && (
                          <button
                            type="button"
                            onClick={() => {
                              if (variant === 'banner-drawer') setDrawerOpen(false);
                              onViewInspection(ncr.inspectionId!);
                            }}
                            className="min-h-[40px] lg:min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 whitespace-nowrap cursor-pointer"
                          >
                            Phiếu gốc
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleNcrExpand(ncr.id)}
                          className="min-h-[40px] lg:min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                        >
                          {isExpanded ? 'Thu gọn' : 'Chi tiết khắc phục'}
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="font-semibold text-slate-700 dark:text-slate-200 block">Nguyên nhân gốc rễ:</span>
                            <span>{ncr.rootCause || 'Chưa cập nhật'}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700 dark:text-slate-200 block">Hành động khắc phục:</span>
                            <span>{ncr.correctiveAction || 'Chưa cập nhật'}</span>
                          </div>
                        </div>
                        {((ncr.imagesBefore && ncr.imagesBefore.length > 0) ||
                          (ncr.imagesAfter && ncr.imagesAfter.length > 0)) && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {[...(ncr.imagesBefore || []), ...(ncr.imagesAfter || [])].slice(0, 6).map((img, i) => (
                              <img
                                key={i}
                                src={getProxyImageUrl(img)}
                                alt={`Bằng chứng NCR ${i + 1}`}
                                referrerPolicy="no-referrer"
                                className="w-14 h-14 object-cover rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Subcontractor Bookings List */}
        {showBookings && filteredBookings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Lịch nghiệm thu gia công ngoài ({filteredBookings.length})
            </h4>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              {filteredBookings.map((bk: TraceabilityBookingItem) => {
                const stMeta = renderBookingStatusMeta(bk.status);
                const dateText = bk.requestedDate ? formatDisplayDate(bk.requestedDate) : '—';
                const reasonsText = bk.matchReasons
                  .map((r) => REASON_LABELS[r] || r)
                  .join(' · ');

                return (
                  <div key={bk.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                          {bk.bookingCode}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {bk.sqcType}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${stMeta.textClass}`}>
                          {stMeta.icon}
                          {stMeta.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums">PO {bk.poNumber || '—'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{bk.supplierName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Ngày hẹn: {dateText}</span>
                        {bk.assignedQcName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>QC: {bk.assignedQcName}</span>
                          </>
                        )}
                        {reasonsText && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-cyan-700 dark:text-cyan-400 font-medium">{reasonsText}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (variant === 'banner-drawer') {
    return (
      <>
        {/* Top Compact Traceability Bar above any Inspection Detail */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 z-20">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {canGoBackInStack && onGoBackInStack && (
              <button
                type="button"
                onClick={onGoBackInStack}
                className="min-h-[40px] lg:min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Quay lại phiếu trước
              </button>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              <div className="inline-flex items-center gap-1.5 shrink-0">
                <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  Truy xuất nguồn gốc
                </span>
              </div>
              {keyTokensSummary.length > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
                  <span className="font-mono text-xs font-medium text-blue-700 dark:text-blue-300 truncate max-w-[380px] tabular-nums">
                    {keyTokensSummary.join(' · ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {bundle && !isLoading && (
              <span className="hidden md:inline text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                {bundle.summary.totalInspections} Phiếu · {bundle.summary.totalNcrs} NCR · {bundle.summary.totalBookings} Booking
              </span>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="min-h-[40px] lg:min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              {isLoading ? 'Đang đối chiếu...' : `Lịch sử liên quan (${totalChainCount})`}
            </button>
          </div>
        </div>

        {/* Slide-over Traceability Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-[240] flex justify-end bg-slate-900/50 backdrop-blur-xs overflow-hidden">
            <div
              className="flex-1"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <div className="w-full max-w-3xl h-full max-h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
              <div className="px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight truncate">
                      Chuỗi Truy Xuất Nguồn Gốc
                    </h3>
                  </div>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate tabular-nums">
                    {keyTokensSummary.length > 0 ? keyTokensSummary.join(' · ') : effectiveInspectionId || '—'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadTraceability()}
                    disabled={isLoading}
                    className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Làm mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Đóng"
                    className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] -my-1 -mr-1 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4">
                {effectivePublic && (
                  <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-300">
                    Chế độ xem chỉ đọc qua mã QR báo cáo PDF. Bấm vào bất kỳ phiếu kiểm tra nào bên dưới để đối chiếu chi tiết.
                  </div>
                )}
                {renderTimelineBody()}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Embedded mode (IPODetail, InspectionList preview pane, BookingDetailModal, QR Lookup Modal)
  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${
        compact ? 'p-3.5 space-y-3' : 'p-4 sm:p-5 space-y-4'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">
              Truy xuất nguồn gốc (Mã NM · PO · PR)
            </h3>
          </div>
          {keyTokensSummary.length > 0 && (
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
              {keyTokensSummary.join(' · ')}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => loadTraceability()}
          disabled={isLoading}
          className="min-h-[40px] lg:min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {renderTimelineBody()}
    </div>
  );
};

interface TraceabilityLookupModalProps {
  open: boolean;
  scannedCode: string;
  user?: User | null;
  onClose: () => void;
  onViewInspection: (inspectionId: string) => void;
  onCreateNewForCode: (code: string) => void;
}

export const TraceabilityLookupModal: React.FC<TraceabilityLookupModalProps> = ({
  open,
  scannedCode,
  user,
  onClose,
  onViewInspection,
  onCreateNewForCode,
}) => {
  if (!open || !scannedCode) return null;

  return (
    <div className="fixed inset-0 z-[240] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
      <div className="w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight truncate">
                Kết Quả Quét QR Truy Xuất Nguồn Gốc
              </h3>
            </div>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
              Mã vừa quét: {scannedCode}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateNewForCode(scannedCode);
              }}
              className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tạo phiếu mới
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] -my-1 -mr-1 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5">
          <TraceabilityPanel
            searchCode={scannedCode}
            user={user}
            variant="embedded"
            onViewInspection={(inspId) => {
              onClose();
              onViewInspection(inspId);
            }}
            onCreateNewForCode={(code) => {
              onClose();
              onCreateNewForCode(code);
            }}
          />
        </div>
      </div>
    </div>
  );
};
