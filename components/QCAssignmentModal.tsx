import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SubcontractorBooking, User } from '../types.js';
import { canAssignM03Booking } from '../src/utils/m03Rbac.js';
import { fetchUsers, updateSubcontractorBooking } from '../services/apiService.js';
import { Combobox, ComboboxOption } from '../src/components/qms';
import {
  X,
  UserCheck,
  Calendar,
  MessageSquare,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface QCAssignmentModalProps {
  open: boolean;
  booking: SubcontractorBooking | null;
  currentUser?: User;
  rolesList?: any[];
  initialMode?: 'ASSIGN' | 'RETURN';
  initialFeedbackNote?: string;
  onClose: () => void;
  onSaved: (updatedBooking: SubcontractorBooking, mode: 'ASSIGN' | 'RETURN') => void;
}

const QC_PRIORITY_ROLES = new Set(['QC_INSPECTOR', 'QC_LEAD', 'MANAGER', 'ADMIN']);

function isQcPriorityUser(user: User): boolean {
  const roleUpper = String(user.role || '').toUpperCase().trim();
  if (QC_PRIORITY_ROLES.has(roleUpper)) return true;
  if (String(user.to_qc || '').trim()) return true;
  const metaText = `${user.position || ''} ${user.phong_ban || ''} ${user.bo_phan || ''}`.toLowerCase();
  return metaText.includes('qc') || metaText.includes('qa') || metaText.includes('chất lượng');
}

function formatUnixToYmd(ts?: number): string {
  if (!ts || ts <= 0) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatUnixToVi(ts?: number): string {
  if (!ts || ts <= 0) return '—';
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN');
}

export const QCAssignmentModal: React.FC<QCAssignmentModalProps> = ({
  open,
  booking,
  currentUser,
  rolesList = [],
  initialMode,
  initialFeedbackNote,
  onClose,
  onSaved,
}) => {
  const canAssign = useMemo(
    () => (booking ? canAssignM03Booking(currentUser, booking, rolesList) : false),
    [currentUser, booking, rolesList]
  );
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedQcId, setSelectedQcId] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [suggestedDateStr, setSuggestedDateStr] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittingMode, setSubmittingMode] = useState<'ASSIGN' | 'RETURN' | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const list = await fetchUsers();
      const activeUsers = (Array.isArray(list) ? list : []).filter((u) => {
        const st = String(u.status || 'ACTIVE').toUpperCase();
        return st !== 'INACTIVE' && st !== 'LOCKED' && st !== 'DISABLED';
      });
      setUsers(activeUsers);
    } catch (err: any) {
      setUsersError(err?.message || 'Không thể tải danh sách nhân sự QC.');
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !booking) return;
    setSelectedQcId(booking.assignedQcId || null);
    setFeedbackNote(initialFeedbackNote?.trim() || booking.rejectionReason || '');
    setSuggestedDateStr(formatUnixToYmd(booking.suggestedDate));
    setErrorMsg(null);
    setSubmittingMode(null);
    loadUsers();
  }, [open, booking?.id, initialFeedbackNote, loadUsers]);

  // Auto-resolve assignedQcId from assignedQcName if booking only stored name
  useEffect(() => {
    if (!open || !booking || selectedQcId || !booking.assignedQcName || users.length === 0) return;
    const targetName = booking.assignedQcName.trim().toLowerCase();
    const matched = users.find((u) => String(u.name || '').trim().toLowerCase() === targetName);
    if (matched) {
      setSelectedQcId(matched.id);
    }
  }, [open, booking, selectedQcId, users]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingMode) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, submittingMode, onClose]);

  const qcUserOptions = useMemo<ComboboxOption<string>[]>(() => {
    const sorted = [...users].sort((a, b) => {
      const aQc = isQcPriorityUser(a) ? 0 : 1;
      const bQc = isQcPriorityUser(b) ? 0 : 1;
      if (aQc !== bQc) return aQc - bQc;
      return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
    });

    return sorted.map((u) => {
      const isQc = isQcPriorityUser(u);
      const label = `${u.name || u.username || u.id}${u.msnv ? ` (${u.msnv})` : ''}`;
      const descParts = [
        isQc ? 'Nhóm QC' : 'Nhân sự khác',
        u.position || u.role,
        u.to_qc || u.phong_ban,
      ].filter(Boolean);
      return {
        value: u.id,
        label,
        description: descParts.join(' · '),
      };
    });
  }, [users]);

  const selectedQcUser = useMemo(
    () => (selectedQcId ? users.find((u) => u.id === selectedQcId) || null : null),
    [users, selectedQcId]
  );

  if (!open || !booking) return null;

  const handleSave = async (mode: 'ASSIGN' | 'RETURN') => {
    if (submittingMode) return;
    if (!canAssign) {
      setErrorMsg('Bạn không có quyền Phân công QC hoặc Trả lại yêu cầu bổ sung (yêu cầu SIGN1/SIGN2 hoặc ADMIN/MANAGER/QA/QC_LEAD).');
      return;
    }
    setErrorMsg(null);

    if (mode === 'ASSIGN' && !selectedQcId) {
      setErrorMsg('Vui lòng chọn chuyên viên QC phụ trách trước khi xác nhận phân công.');
      return;
    }

    if (mode === 'RETURN' && !feedbackNote.trim()) {
      setErrorMsg('Vui lòng nhập Ghi chú phản hồi / nội dung cần bổ sung trước khi trả lại phiếu.');
      return;
    }

    let suggestedTs = 0;
    if (suggestedDateStr.trim()) {
      const parsedMs = new Date(`${suggestedDateStr.trim()}T08:00:00`).getTime();
      if (isNaN(parsedMs)) {
        setErrorMsg('Ngày đề xuất nghiệm thu không hợp lệ.');
        return;
      }
      suggestedTs = Math.floor(parsedMs / 1000);
    }

    setSubmittingMode(mode);
    try {
      const resolvedQcId = selectedQcUser?.id || (selectedQcId ?? booking.assignedQcId ?? '');
      const resolvedQcName =
        selectedQcUser?.name ||
        (selectedQcId === booking.assignedQcId ? booking.assignedQcName || '' : '');

      const updates: Partial<SubcontractorBooking> =
        mode === 'ASSIGN'
          ? {
              status: 'ASSIGNED',
              assignedQcId: resolvedQcId,
              assignedQcName: resolvedQcName,
              rejectionReason: feedbackNote.trim(),
              suggestedDate: suggestedTs,
              version: booking.version,
            }
          : {
              status: 'RETURNED_FOR_SUPPLEMENT',
              assignedQcId: resolvedQcId || undefined,
              assignedQcName: resolvedQcName || undefined,
              rejectionReason: feedbackNote.trim(),
              suggestedDate: suggestedTs,
              rejectedAt: Math.floor(Date.now() / 1000),
              rejectedByName: currentUser?.name || currentUser?.username || 'Quản lý QC',
              version: booking.version,
            };

      const updated = await updateSubcontractorBooking(booking.id, updates);
      onSaved(updated, mode);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể lưu thông tin phân công. Vui lòng thử lại.');
    } finally {
      setSubmittingMode(null);
    }
  };

  const sqcTypeLabel =
    booking.sqcType === 'SQC_VT'
      ? 'Vật tư ngoài'
      : booking.sqcType === 'SQC_TP'
        ? 'Thành phẩm'
        : 'Bán thành phẩm';

  const modalNode = (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/60 backdrop-blur-sm overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qc-assignment-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
            <h2
              id="qc-assignment-modal-title"
              className="text-sm sm:text-base font-bold uppercase tracking-tight text-slate-900 dark:text-white truncate"
            >
              Phân Công QC & Phản Hồi
            </h2>
          </div>
          <button
            type="button"
            disabled={!!submittingMode}
            onClick={onClose}
            aria-label="Đóng cửa sổ phân công QC"
            className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unboxed Booking Context Summary Strip */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 space-y-0.5 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700 dark:text-slate-200">
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {booking.bookingCode}
            </span>
            {booking.totalBatchesForPo && booking.totalBatchesForPo > 1 && booking.batchNumber && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[10px] font-bold tabular-nums">
                Đợt {booking.batchNumber}/{booking.totalBatchesForPo}
              </span>
            )}
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              PO: {booking.poNumber || '—'}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-medium">{sqcTypeLabel}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
              Ngày yêu cầu: {formatUnixToVi(booking.requestedDate)}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={booking.supplierName}>
            {booking.supplierName || '—'}
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">
          {initialMode === 'RETURN' && (
            <div
              role="status"
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-orange-200 dark:border-orange-800 bg-yellow-50 dark:bg-orange-950/40 text-xs font-medium text-orange-800 dark:text-orange-200"
            >
              <RotateCcw className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Đang ở chế độ <strong>Trả lại / Cần kiểm lại</strong>: Vui lòng xác nhận lý do không đạt và chọn ngày đề xuất kiểm tra lại (nếu có) để thông báo cho người đặt lịch.
              </span>
            </div>
          )}

          {!canAssign && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-orange-200 dark:border-orange-800 bg-yellow-50 dark:bg-orange-950/40 text-xs font-medium text-orange-800 dark:text-orange-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Bạn không có quyền Phân công QC / Trả lại bổ sung cho phiếu này theo ma trận phân quyền hiện tại.</span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs font-medium text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Chọn QC phụ trách */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                Chọn chuyên viên QC phụ trách
              </label>
              {isLoadingUsers && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Đang tải...
                </span>
              )}
            </div>

            {usersError ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                <span>{usersError}</span>
                <button
                  type="button"
                  onClick={loadUsers}
                  className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-red-200 dark:border-red-700 font-semibold hover:bg-red-100 cursor-pointer shrink-0"
                >
                  Thử lại
                </button>
              </div>
            ) : (
              <Combobox
                value={selectedQcId}
                onChange={(val) => {
                  setSelectedQcId(val);
                  if (errorMsg) setErrorMsg(null);
                }}
                options={qcUserOptions}
                disabled={isLoadingUsers || !!submittingMode}
                placeholder="Chọn QC phụ trách từ danh sách nhân sự..."
                searchPlaceholder="Tìm theo tên hoặc mã nhân viên..."
                emptyText="Không tìm thấy nhân sự phù hợp"
                ariaLabel="Chọn QC phụ trách"
              />
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nhân sự thuộc bộ phận QC được ưu tiên hiển thị lên đầu danh sách; có thể tìm kiếm toàn bộ nhân sự.
            </p>
          </div>

          {/* 2. Đề xuất ngày nghiệm thu */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="qc-assign-suggested-date"
                className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                Đề xuất ngày nghiệm thu
              </label>
              {suggestedDateStr && (
                <button
                  type="button"
                  disabled={!!submittingMode}
                  onClick={() => setSuggestedDateStr('')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                >
                  Xóa ngày đề xuất
                </button>
              )}
            </div>
            <input
              id="qc-assign-suggested-date"
              type="date"
              value={suggestedDateStr}
              disabled={!!submittingMode}
              onChange={(e) => setSuggestedDateStr(e.target.value)}
              className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Để trống nếu giữ nguyên ngày nghiệm thu yêu cầu ({formatUnixToVi(booking.requestedDate)}).
            </p>
          </div>

          {/* 3. Ghi chú phản hồi */}
          <div className="space-y-1.5">
            <label
              htmlFor="qc-assign-feedback-note"
              className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
              Ghi chú phản hồi
            </label>
            <textarea
              id="qc-assign-feedback-note"
              rows={4}
              value={feedbackNote}
              disabled={!!submittingMode}
              onChange={(e) => {
                setFeedbackNote(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Nhập ghi chú lưu ý cho QC, yêu cầu bổ sung hồ sơ/bản vẽ hoặc lý do đề xuất sắp xếp lại ngày nghiệm thu..."
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-y disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bắt buộc nhập khi chọn Trả lại / Yêu cầu bổ sung.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-2 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={!!submittingMode}
            onClick={onClose}
            className="min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            Đóng
          </button>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              disabled={!!submittingMode || !canAssign}
              onClick={() => handleSave('RETURN')}
              className={`min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                initialMode === 'RETURN'
                  ? 'bg-orange-600 hover:bg-orange-700 text-white border border-orange-600'
                  : 'border border-orange-200 dark:border-orange-800 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300'
              }`}
            >
              {submittingMode === 'RETURN' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              <span>Trả Lại / Cần Kiểm Lại</span>
            </button>

            <button
              type="button"
              disabled={!!submittingMode || !canAssign}
              onClick={() => handleSave('ASSIGN')}
              className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {submittingMode === 'ASSIGN' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Xác Nhận Phân Công</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
