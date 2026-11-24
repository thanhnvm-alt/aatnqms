import React, { useMemo, useState } from 'react';
import {
  SubcontractorBooking,
  SubcontractorBookingItem,
} from '../types.js';
import {
  BookingAttachmentReviewItem,
  flattenBookingDocumentsForReview,
  formatFileSize,
  getAttachmentDownloadUrl,
  getFileExtBadge,
} from '../src/utils/bookingDocuments.js';
import { BookingAttachmentReviewModal } from './BookingAttachmentReviewModal';
import { formatBookingPoSummary } from '../src/utils/poTokens.js';
import {
  AlertTriangle,
  Building2,
  Calendar,
  ClipboardList,
  Download,
  Eye,
  FileText,
  History,
  MapPin,
  Package,
  Phone,
  UserCheck,
  User as UserIcon,
} from 'lucide-react';

interface BookingExpandedDetailPanelProps {
  booking: SubcontractorBooking;
  onOpenFullModal: (booking: SubcontractorBooking) => void;
  onOpenAttachmentReview?: (
    booking: SubcontractorBooking,
    items: BookingAttachmentReviewItem[],
    initialIndex: number
  ) => void;
}

const formatGmt7Date = (unixSeconds?: number): string => {
  if (!unixSeconds || unixSeconds <= 0) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return '—';
  }
};

const formatGmt7DateTime = (unixSeconds?: number): string => {
  if (!unixSeconds || unixSeconds <= 0) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return '—';
  }
};

const getSqcTypeLabel = (sqcType?: string): string => {
  if (sqcType === 'SQC_VT' || sqcType === 'SQC_MAT') return 'Vật tư ngoài (SQC-VT)';
  if (sqcType === 'SQC_TP') return 'Thành phẩm (SQC-TP)';
  return 'Bán thành phẩm (SQC-BTP)';
};

const getBookingOutcome = (booking: SubcontractorBooking): 'PASS' | 'FAIL' | null => {
  if (booking.status === 'COMPLETED') return 'PASS';
  if (booking.status === 'RETURNED_FOR_SUPPLEMENT') {
    if (booking.sqcResult === 'FAIL' || booking.relatedSqcSummary?.latestResult === 'FAIL') return 'FAIL';
    if ((booking.relatedSqcSummary?.rejectedCount || 0) > 0) return 'FAIL';
  }
  return null;
};

const getStatusLabel = (booking: SubcontractorBooking): string => {
  switch (booking.status) {
    case 'COMPLETED':
      return 'Đã nghiệm thu • PASS';
    case 'ASSIGNED':
      return 'Đã phân công QC';
    case 'IN_PROGRESS':
      return 'Đang kiểm tra (Nháp)';
    case 'RETURNED_FOR_SUPPLEMENT':
      return getBookingOutcome(booking) === 'FAIL'
        ? 'Đã nghiệm thu • FAIL (Cần kiểm lại)'
        : 'Yêu cầu bổ sung hồ sơ';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return 'Chờ phân công';
  }
};

export const BookingExpandedDetailPanel: React.FC<BookingExpandedDetailPanelProps> = ({
  booking,
  onOpenFullModal,
  onOpenAttachmentReview,
}) => {
  const [localReviewIndex, setLocalReviewIndex] = useState<number | null>(null);

  const flatAttachments = useMemo(
    () => flattenBookingDocumentsForReview(booking.documents),
    [booking.documents]
  );

  const items: SubcontractorBookingItem[] = Array.isArray(booking.items) ? booking.items : [];
  const poSummary = useMemo(() => formatBookingPoSummary(booking), [booking]);
  const mismatchWarnings = Array.isArray(booking.supplierMismatchWarnings)
    ? booking.supplierMismatchWarnings
    : [];
  const batchText =
    booking.totalBatchesForPo && booking.totalBatchesForPo > 1 && booking.batchNumber
      ? `Đợt ${booking.batchNumber}/${booking.totalBatchesForPo}`
      : 'Đợt 1/1';
  const sqcSum = booking.relatedSqcSummary;

  return (
    <div
      className="bg-slate-50/90 dark:bg-slate-900/60 border-b border-blue-200/80 dark:border-slate-800 px-3 sm:px-4 py-3 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Expanded Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 shrink-0">
            <ClipboardList className="w-3.5 h-3.5" />
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
            Chi tiết phiếu nghiệm thu PO{' '}
            <span className="font-mono text-blue-700 dark:text-blue-400">
              {poSummary.joinedPo || booking.poNumber || '—'}
            </span>{' '}
            <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
              ({booking.bookingCode})
            </span>
          </h4>
        </div>

        <button
          type="button"
          onClick={() => onOpenFullModal(booking)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Xem đầy đủ & SQC liên kết</span>
        </button>
      </div>

      {/* 3-Column ERP Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 sm:gap-3 items-stretch">
        {/* Card 1: THÔNG TIN PHIẾU NGHIỆM THU */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              THÔNG TIN PHIẾU NGHIỆM THU
            </h5>
            <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold">
              {batchText}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
            <div className={poSummary.allPos.length > 1 ? 'col-span-2' : ''}>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                Số PO / PR liên kết ({poSummary.allPos.length || 1})
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {poSummary.allPos.length > 0 ? (
                  poSummary.allPos.map((tok) => (
                    <span
                      key={tok}
                      className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 font-mono text-[11px] font-bold text-blue-700 dark:text-blue-300 tabular-nums"
                    >
                      {tok}
                    </span>
                  ))
                ) : (
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                    {booking.poNumber || '—'}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">Mã phiếu BK</dt>
              <dd className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums mt-0.5">
                {booking.bookingCode}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">Loại nghiệm thu</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {getSqcTypeLabel(booking.sqcType)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">Đợt nghiệm thu</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {batchText}
              </dd>
            </div>

            <div className="col-span-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" /> Xưởng vệ tinh
              </dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">
                {booking.supplierName || '—'}
              </dd>
              {(booking.locationAddress || booking.contactPerson || booking.contactPhone) && (
                <dd className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                  {booking.locationAddress && (
                    <div className="flex items-start gap-1">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                      <span>{booking.locationAddress}</span>
                    </div>
                  )}
                  {(booking.contactPerson || booking.contactPhone) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                      <span>
                        {booking.contactPerson || '—'}
                        {booking.contactPhone ? ` · ${booking.contactPhone}` : ''}
                      </span>
                    </div>
                  )}
                </dd>
              )}
            </div>

            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-slate-400" /> QC phụ trách
              </dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {booking.assignedQcName || 'Chưa phân công'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <UserIcon className="w-3 h-3 text-slate-400" /> Người đăng ký
              </dt>
              <dd className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                {booking.requesterName || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" /> Ngày đăng ký
              </dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300 tabular-nums mt-0.5">
                {formatGmt7DateTime(booking.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-500" /> Nghiệm thu dự kiến
              </dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                {formatGmt7Date(booking.requestedDate)}
                {booking.suggestedDate && booking.suggestedDate > 0 ? (
                  <span className="block text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                    Đề xuất: {formatGmt7Date(booking.suggestedDate)}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>

        {/* Card 2: DANH SÁCH VẬT TƯ / BÁN THÀNH PHẨM */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              DANH SÁCH VẬT TƯ / BÁN THÀNH PHẨM
            </h5>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {items.length} hạng mục
            </span>
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-6 text-xs text-slate-500 dark:text-slate-400">
              Chưa khai báo hạng mục vật tư / bán thành phẩm.
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 sticky top-0">
                  <tr>
                    <th className="px-2.5 py-2 whitespace-nowrap">STT / Mã VT</th>
                    <th className="px-2.5 py-2">Tên hạng mục</th>
                    <th className="px-2.5 py-2 text-right whitespace-nowrap">SL đặt</th>
                    <th className="px-2.5 py-2 text-right whitespace-nowrap">Đợt này</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it, idx) => {
                    const orderQty = (it as any).orderQty ?? it.quantity;
                    const codeDisplay = (it as any).materialCode || (it as any).code || `#${idx + 1}`;
                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-2.5 py-2 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap align-top">
                          {codeDisplay}
                        </td>
                        <td className="px-2.5 py-2 align-top">
                          <div className="font-medium text-slate-800 dark:text-slate-200 leading-snug flex flex-wrap items-center gap-1.5">
                            <span>{it.itemName || 'Hạng mục gia công'}</span>
                            {it.poNumber && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 font-mono text-[10px] font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                                {it.poNumber}
                              </span>
                            )}
                          </div>
                          {it.specifications && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {it.specifications}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap align-top">
                          {orderQty ?? '—'}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400 whitespace-nowrap align-top">
                          {it.quantity} {it.unit || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {mismatchWarnings.length > 0 && (
            <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                Lưu ý khác NCC trên ERP:{' '}
                {mismatchWarnings.map((w) => `${w.poNumber} (${w.expectedSupplier})`).join(', ')}
              </span>
            </div>
          )}

          {booking.notes && (
            <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 rounded-lg px-2.5 py-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Ghi chú:</span>{' '}
              {booking.notes}
            </div>
          )}
        </div>

        {/* Card 3: TÀI LIỆU ĐÍNH KÈM & LỊCH SỬ */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              TÀI LIỆU ĐÍNH KÈM & LỊCH SỬ
            </h5>
            <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 tabular-nums">
              {flatAttachments.length} tệp
            </span>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
            {flatAttachments.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                Không có tài liệu đính kèm.
              </div>
            ) : (
              flatAttachments.map((doc, i) => {
                const downloadUrl = getAttachmentDownloadUrl(doc.url, doc.name);
                const extBadge = getFileExtBadge(doc);
                const sizeText = formatFileSize(doc.size);
                const handleOpenReview = () => {
                  if (onOpenAttachmentReview) {
                    onOpenAttachmentReview(booking, flatAttachments, i);
                  } else {
                    setLocalReviewIndex(i);
                  }
                };
                return (
                  <div
                    key={doc.id || i}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={handleOpenReview}
                      className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
                      title={`Xem tài liệu: ${doc.name}`}
                    >
                      <span className="px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-[10px] font-mono font-bold shrink-0">
                        {extBadge}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                          {doc.name}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {doc.groupLabel}
                          {sizeText ? ` · ${sizeText}` : ''}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleOpenReview}
                        title={`Review tài liệu ${doc.name}`}
                        aria-label={`Review ${doc.name}`}
                        className="min-w-[36px] min-h-[36px] px-2 inline-flex items-center justify-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem</span>
                      </button>
                      {doc.sourceType === 'UPLOAD' && (
                        <a
                          href={downloadUrl}
                          download={doc.name}
                          title={`Tải xuống ${doc.name}`}
                          aria-label={`Tải xuống ${doc.name}`}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Assignment & SQC History Summary */}
          <div className="mt-auto pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Trạng thái hiện tại:</span>
              <span
                className={`font-semibold ${
                  booking.status === 'COMPLETED'
                    ? 'text-green-700 dark:text-green-400'
                    : getBookingOutcome(booking) === 'FAIL'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {getStatusLabel(booking)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Lịch sử phân công:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300 text-right">
                {booking.assignedQcName
                  ? `Đã giao ${booking.assignedQcName}`
                  : 'Chưa giao QC phụ trách'}
              </span>
            </div>
            {booking.manualStatusOverride && (
              <div className="text-[11px] text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5 space-y-0.5">
                <div className="font-semibold">
                  Gán thủ công ({booking.manualOverrideResult || booking.sqcResult || '—'})
                  {booking.manualOverrideByName ? ` · ${booking.manualOverrideByName}` : ''}
                  {booking.manualOverrideAt ? ` · ${formatGmt7DateTime(booking.manualOverrideAt)}` : ''}
                </div>
                {booking.manualOverrideReason && (
                  <div className="text-slate-700 dark:text-slate-300">
                    Lý do: {booking.manualOverrideReason}
                  </div>
                )}
              </div>
            )}
            {booking.rejectionReason && (
              <div className="text-[11px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Phản hồi / Kiểm lại:</span>{' '}
                {booking.rejectionReason}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-slate-500 dark:text-slate-400">Phiếu SQC đối chiếu:</span>
              <button
                type="button"
                onClick={() => onOpenFullModal(booking)}
                className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer tabular-nums text-right"
              >
                {sqcSum && sqcSum.totalCount > 0
                  ? `${sqcSum.totalCount} phiếu (${sqcSum.approvedCount} đạt${sqcSum.rejectedCount > 0 ? `, ${sqcSum.rejectedCount} lỗi` : ''})${(booking.lastSqcId || sqcSum.latestReportId) ? ` · ${booking.lastSqcId || sqcSum.latestReportId}` : ''}`
                  : (booking.lastSqcId ? `Đối chiếu: ${booking.lastSqcId}` : 'Mở đối chiếu SQC →')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {localReviewIndex !== null && (
        <BookingAttachmentReviewModal
          open={true}
          items={flatAttachments}
          initialIndex={localReviewIndex}
          titleContext={`Booking ${booking.bookingCode}${poSummary.primaryPo ? ` · ${poSummary.primaryPo}` : ''}`}
          onClose={() => setLocalReviewIndex(null)}
        />
      )}
    </div>
  );
};
