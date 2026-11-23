import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Inspection,
  RelatedBookingSummary,
  RelatedSqcMatchReason,
  SubcontractorBooking,
  User,
} from '../types.js';
import { canViewM03, canAssignM03Booking } from '../src/utils/m03Rbac.js';
import {
  fetchRelatedBookingsForInspection,
  fetchSubcontractorBookingById,
} from '../services/apiService.js';
import { BookingDetailModal, renderBookingStatusBadge } from './BookingDetailModal';
import { QCAssignmentModal } from './QCAssignmentModal';
import { formatBookingPoSummary } from '../src/utils/poTokens.js';
import { Calendar, ChevronRight, RefreshCw, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react';

interface LinkedBookingsBadgeBarProps {
  inspection: Inspection;
  currentUser?: User | null;
  rolesList?: any[];
  onViewInspection?: (inspectionId: string) => void;
  compact?: boolean;
}

const REASON_LABELS: Record<RelatedSqcMatchReason, string> = {
  BOOKING: 'Khớp Booking',
  PO: 'Khớp PO',
  PR: 'Khớp PR/FO',
  MATERIAL: 'Khớp Vật tư',
};

export const LinkedBookingsBadgeBar: React.FC<LinkedBookingsBadgeBarProps> = ({
  inspection,
  currentUser,
  rolesList = [],
  onViewInspection,
  compact = false,
}) => {
  const [bookings, setBookings] = useState<RelatedBookingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<SubcontractorBooking | null>(null);
  const [openingBookingId, setOpeningBookingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Single-level QCAssignmentModal state (mutually exclusive with BookingDetailModal)
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignBooking, setAssignBooking] = useState<SubcontractorBooking | null>(null);
  const [assignOptions, setAssignOptions] = useState<{ mode?: 'ASSIGN' | 'RETURN'; prefillReason?: string } | null>(null);

  const inspType = String(inspection?.type || '').toUpperCase();
  const isSqc = inspType.startsWith('SQC') || Boolean(inspection?.booking_code || inspection?.booking_id);
  const canOpenBookingModal = canViewM03(currentUser, rolesList);

  const sqcFailInfo = useMemo(() => {
    if (!inspection) return { isFailed: false, prefillReason: '' };
    const statusUpper = String(inspection.status || '').toUpperCase().trim();
    const failedQty = Number(inspection.failedQuantity || 0);
    const failedItemsCount = Array.isArray(inspection.items)
      ? inspection.items.filter((it: any) => String(it?.status || '').toUpperCase() === 'FAIL').length
      : 0;
    const failedMaterialsCount = Array.isArray(inspection.materials)
      ? inspection.materials.filter(
          (m: any) => Number(m?.failQty || 0) > 0 || String(m?.status || '').toUpperCase() === 'FAIL'
        ).length
      : 0;

    const isFailed =
      failedQty > 0 ||
      ['REJECTED', 'FLAGGED', 'FAILED', 'REJECT'].includes(statusUpper) ||
      failedItemsCount > 0 ||
      failedMaterialsCount > 0;

    const detailParts: string[] = [];
    if (failedQty > 0) detailParts.push(`SL lỗi: ${failedQty}`);
    if (failedItemsCount > 0) detailParts.push(`${failedItemsCount} tiêu chí không đạt`);
    if (failedMaterialsCount > 0) detailParts.push(`${failedMaterialsCount} vật tư/hạng mục lỗi`);
    const detailsText = detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '';

    return {
      isFailed,
      prefillReason: isFailed
        ? `Phiếu SQC ${inspection.id} ghi nhận kết quả KHÔNG ĐẠT${detailsText}. Yêu cầu xưởng khắc phục & đặt lịch kiểm tra lại.`
        : '',
    };
  }, [inspection]);

  const loadBookings = useCallback(async (signal?: AbortSignal) => {
    if (!inspection?.id || !isSqc) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchRelatedBookingsForInspection(inspection.id, signal);
      if (!signal?.aborted) {
        setBookings(Array.isArray(res?.bookings) ? res.bookings : []);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && !signal?.aborted) {
        setError(err?.message || 'Không thể tra cứu Booking QC liên quan.');
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [inspection?.id, isSqc]);

  useEffect(() => {
    if (!isSqc || !inspection?.id) {
      setBookings([]);
      return;
    }
    const controller = new AbortController();
    loadBookings(controller.signal);
    return () => controller.abort();
  }, [inspection?.id, isSqc, loadBookings]);

  const handleOpenBookingModal = async (summary: RelatedBookingSummary) => {
    if (!canOpenBookingModal) return;
    setOpeningBookingId(summary.id);
    setError(null);
    try {
      const fullBooking = await fetchSubcontractorBookingById(summary.id);
      if (fullBooking) {
        setAssignModalOpen(false);
        setActiveBooking(fullBooking);
        setModalOpen(true);
      } else {
        setError('Không tìm thấy thông tin chi tiết Booking QC.');
      }
    } catch (err: any) {
      setError(err?.message || 'Bạn không có quyền xem chi tiết Booking QC.');
    } finally {
      setOpeningBookingId(null);
    }
  };

  const handleOpenReinspectionModal = async (summary: RelatedBookingSummary) => {
    if (!canAssignM03Booking(currentUser, summary, rolesList)) return;
    setOpeningBookingId(summary.id);
    setError(null);
    try {
      const fullBooking = await fetchSubcontractorBookingById(summary.id);
      if (fullBooking) {
        setModalOpen(false);
        setAssignBooking(fullBooking);
        setAssignOptions({
          mode: 'RETURN',
          prefillReason: sqcFailInfo.prefillReason,
        });
        setAssignModalOpen(true);
      } else {
        setError('Không tìm thấy thông tin Booking QC để chuyển trạng thái kiểm lại.');
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể mở thao tác yêu cầu kiểm lại.');
    } finally {
      setOpeningBookingId(null);
    }
  };

  if (!isSqc) return null;

  return (
    <>
      <div
        className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 ${
          compact ? 'px-3.5 py-2.5' : 'px-4 py-3'
        } space-y-2`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Booking QC Liên Kết ({bookings.length})</span>
          </div>

          <button
            type="button"
            onClick={() => loadBookings()}
            disabled={isLoading}
            className="min-h-[44px] lg:min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {actionSuccess && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-xs font-medium text-green-700 dark:text-green-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {isLoading ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Đang đối chiếu Booking QC theo PO / PR...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Chưa tìm thấy lịch Book QC nào khớp PO / PR của phiếu này.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bookings.map((bk) => {
              const dateText = bk.requestedDate
                ? new Date(bk.requestedDate * 1000).toLocaleDateString('vi-VN')
                : '—';
              const isOpening = openingBookingId === bk.id;
              const canTriggerReinspection =
                sqcFailInfo.isFailed &&
                bk.status !== 'COMPLETED' &&
                bk.status !== 'CANCELLED' &&
                bk.status !== 'RETURNED_FOR_SUPPLEMENT' &&
                canAssignM03Booking(currentUser, bk, rolesList);

              return (
                <div
                  key={bk.id}
                  className="w-full min-h-[44px] flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold tabular-nums whitespace-nowrap text-blue-600 dark:text-blue-400">
                      {bk.bookingCode}
                    </span>
                    {bk.totalBatchesForPo && bk.totalBatchesForPo > 1 && bk.batchNumber && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[10px] font-bold tabular-nums">
                        Đợt {bk.batchNumber}/{bk.totalBatchesForPo}
                      </span>
                    )}
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                    {(() => {
                      const poSum = formatBookingPoSummary(bk);
                      return (
                        <span
                          className="font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap inline-flex items-center gap-1"
                          title={poSum.allPos.length > 1 ? poSum.allPos.join(', ') : poSum.primaryPo}
                        >
                          <span>PO {poSum.primaryPo || bk.poNumber || '—'}</span>
                          {poSum.additionalCount > 0 && (
                            <span className="px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold">
                              +{poSum.additionalCount}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                      {bk.supplierName}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {dateText}
                    </span>
                    {bk.matchReasons.length > 0 && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {bk.matchReasons.map((r) => REASON_LABELS[r] || r).join(', ')}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {renderBookingStatusBadge(bk.status)}
                    {canTriggerReinspection && (
                      <button
                        type="button"
                        onClick={() => handleOpenReinspectionModal(bk)}
                        disabled={isOpening}
                        className="min-h-[44px] lg:min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Trả lại / Cần kiểm lại</span>
                      </button>
                    )}
                    {canOpenBookingModal && (
                      <button
                        type="button"
                        onClick={() => handleOpenBookingModal(bk)}
                        disabled={isOpening}
                        className="min-h-[44px] lg:min-h-[32px] inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-xs font-semibold text-blue-600 dark:text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {isOpening ? 'Đang mở...' : 'Mở Booking'}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canOpenBookingModal && (
        <BookingDetailModal
          open={modalOpen}
          booking={activeBooking}
          currentUser={currentUser}
          rolesList={rolesList}
          onClose={() => setModalOpen(false)}
          onViewInspection={onViewInspection}
          onOpenAssignModal={(bk, options) => {
            setModalOpen(false);
            setAssignBooking(bk);
            setAssignOptions(options || null);
            setAssignModalOpen(true);
          }}
          onReconciled={async () => {
            await loadBookings();
          }}
        />
      )}

      <QCAssignmentModal
        open={assignModalOpen}
        booking={assignBooking}
        currentUser={currentUser}
        rolesList={rolesList}
        initialMode={assignOptions?.mode}
        initialFeedbackNote={assignOptions?.prefillReason}
        onClose={() => {
          setAssignModalOpen(false);
          setAssignBooking(null);
          setAssignOptions(null);
        }}
        onSaved={async (updated, mode) => {
          setAssignModalOpen(false);
          setAssignBooking(null);
          setAssignOptions(null);
          setActionSuccess(
            mode === 'RETURN'
              ? `Đã chuyển Booking ${updated.bookingCode} sang trạng thái Yêu cầu kiểm lại.`
              : `Đã cập nhật phân công QC cho Booking ${updated.bookingCode}.`
          );
          await loadBookings();
        }}
      />
    </>
  );
};
