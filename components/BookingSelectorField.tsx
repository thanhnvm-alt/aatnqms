import React, { useEffect, useMemo, useState } from 'react';
import { SubcontractorBooking } from '../types';
import { fetchSubcontractorBookings } from '../services/apiService';
import { Combobox, ComboboxOption } from '../src/components/qms';
import { formatUnixToGmt7Ymd } from '../src/utils/bookingDocuments';
import { formatBookingPoSummary } from '../src/utils/poTokens';
import { Calendar, Link2, RefreshCw, Unlink, Building2, Box } from 'lucide-react';

interface BookingSelectorFieldProps {
  bookingId?: string;
  bookingCode?: string;
  sqcType: 'SQC_VT' | 'SQC_BTP' | 'SQC_TP';
  disabled?: boolean;
  onSelectBooking: (booking: SubcontractorBooking) => void;
  onClearBooking: () => void;
}

const STATUS_PRIORITY: Record<string, number> = {
  ASSIGNED: 1,
  IN_PROGRESS: 2,
  PENDING: 3,
  RETURNED_FOR_SUPPLEMENT: 4,
  COMPLETED: 5,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ phân công',
  ASSIGNED: 'Đã giao QC',
  IN_PROGRESS: 'Đang kiểm tra',
  RETURNED_FOR_SUPPLEMENT: 'Cần bổ sung / Kiểm lại',
  COMPLETED: 'Đã nghiệm thu',
};

function formatDisplayYmdToVi(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export const BookingSelectorField: React.FC<BookingSelectorFieldProps> = ({
  bookingId,
  bookingCode,
  sqcType,
  disabled = false,
  onSelectBooking,
  onClearBooking,
}) => {
  const [bookings, setBookings] = useState<SubcontractorBooking[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadBookings = async (cancelledRef?: { cancelled: boolean }) => {
    setIsLoading(true);
    try {
      const list = await fetchSubcontractorBookings();
      if (!cancelledRef?.cancelled) {
        setBookings(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.warn('Không thể tải danh sách Mã Book QC:', err);
    } finally {
      if (!cancelledRef?.cancelled) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const ref = { cancelled: false };
    loadBookings(ref);
    return () => {
      ref.cancelled = true;
    };
  }, []);

  const sortedBookings = useMemo(() => {
    return bookings
      .filter((b) => String(b.status || '').toUpperCase() !== 'CANCELLED')
      .slice()
      .sort((a, b) => {
        const aTypeMatch = String(a.sqcType || 'SQC_BTP').toUpperCase() === sqcType ? 0 : 1;
        const bTypeMatch = String(b.sqcType || 'SQC_BTP').toUpperCase() === sqcType ? 0 : 1;
        if (aTypeMatch !== bTypeMatch) return aTypeMatch - bTypeMatch;

        const aPrio = STATUS_PRIORITY[String(a.status || '').toUpperCase()] ?? 9;
        const bPrio = STATUS_PRIORITY[String(b.status || '').toUpperCase()] ?? 9;
        if (aPrio !== bPrio) return aPrio - bPrio;

        return (b.requestedDate || b.createdAt || 0) - (a.requestedDate || a.createdAt || 0);
      });
  }, [bookings, sqcType]);

  const selectedBooking = useMemo(() => {
    if (!bookingId && !bookingCode) return null;
    const codeLower = String(bookingCode || '').trim().toLowerCase();
    return (
      sortedBookings.find(
        (b) =>
          (bookingId && b.id === bookingId) ||
          (codeLower && String(b.bookingCode || '').trim().toLowerCase() === codeLower)
      ) || null
    );
  }, [sortedBookings, bookingId, bookingCode]);

  const options: ComboboxOption<string>[] = useMemo(() => {
    return sortedBookings.map((b) => {
      const batchTag =
        b.totalBatchesForPo && b.totalBatchesForPo > 1 && b.batchNumber
          ? ` (Đợt ${b.batchNumber}/${b.totalBatchesForPo})`
          : '';
      const poSum = formatBookingPoSummary(b);
      const poTag = poSum.additionalCount > 0
        ? `${poSum.primaryPo} (+${poSum.additionalCount})`
        : (poSum.primaryPo || b.poNumber || '—');
      const dateText = b.requestedDate ? formatDisplayYmdToVi(formatUnixToGmt7Ymd(b.requestedDate)) : '—';
      const statusLabel = STATUS_LABELS[String(b.status || '').toUpperCase()] || b.status || '';
      return {
        value: b.id,
        label: `${b.bookingCode}${batchTag} · PO ${poTag} · ${b.supplierName || '—'} · ${dateText}${statusLabel ? ` [${statusLabel}]` : ''}`,
      };
    });
  }, [sortedBookings]);

  const hasLink = Boolean(bookingId || bookingCode);

  return (
    <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/70 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-[10px] font-bold text-blue-800 dark:text-blue-300 uppercase tracking-widest flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 shrink-0" />
          <span>Mã Book QC (Liên kết M03 — Tự điền PO, NCC, Hạng mục)</span>
        </label>
        <div className="flex items-center gap-1.5">
          {hasLink && !disabled && (
            <button
              type="button"
              onClick={onClearBooking}
              className="min-h-[44px] lg:min-h-[30px] px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800/70 bg-white dark:bg-slate-900 text-[10px] font-bold uppercase text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span>Gỡ liên kết</span>
            </button>
          )}
          <button
            type="button"
            disabled={isLoading || disabled}
            onClick={() => loadBookings()}
            title="Làm mới danh sách Book QC"
            aria-label="Làm mới danh sách Book QC"
            className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[30px] inline-flex items-center justify-center rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <Combobox<string>
        value={selectedBooking ? selectedBooking.id : null}
        onChange={(selectedId) => {
          if (!selectedId) {
            onClearBooking();
            return;
          }
          const found = sortedBookings.find((b) => b.id === selectedId);
          if (found) {
            onSelectBooking(found);
          }
        }}
        options={options}
        disabled={disabled}
        allowClear={true}
        placeholder={isLoading ? 'Đang tải danh sách Book QC...' : 'Chọn hoặc tìm Mã Book QC (BK-..., PO, Nhà cung cấp)...'}
        searchPlaceholder="Tìm Mã Book QC, số PO, tên nhà cung cấp..."
        emptyText="Không tìm thấy lịch Book QC phù hợp"
        ariaLabel="Chọn Mã Book QC"
      />

      {hasLink && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/60 rounded-lg px-3 py-2">
          <span className="inline-flex items-center gap-1.5 font-mono font-bold text-blue-700 dark:text-blue-300 tabular-nums">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            {selectedBooking?.bookingCode || bookingCode}
          </span>
          {selectedBooking?.totalBatchesForPo && selectedBooking.totalBatchesForPo > 1 && selectedBooking.batchNumber && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[10px] font-bold tabular-nums">
              Đợt {selectedBooking.batchNumber}/{selectedBooking.totalBatchesForPo}
            </span>
          )}
          {selectedBooking && (() => {
            const poSum = formatBookingPoSummary(selectedBooking);
            if (!poSum.joinedPo && !selectedBooking.poNumber) return null;
            return (
              <span
                className="inline-flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300 tabular-nums flex-wrap"
                title={poSum.allPos.join(', ')}
              >
                <Box className="w-3 h-3 text-slate-400 shrink-0" />
                <span>PO: {poSum.joinedPo || selectedBooking.poNumber}</span>
              </span>
            );
          })()}
          {selectedBooking?.supplierName && (
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 truncate max-w-[240px]">
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              {selectedBooking.supplierName}
            </span>
          )}
          {selectedBooking?.requestedDate ? (
            <span className="inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              <Calendar className="w-3 h-3 text-slate-400" />
              {formatDisplayYmdToVi(formatUnixToGmt7Ymd(selectedBooking.requestedDate))}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
};
