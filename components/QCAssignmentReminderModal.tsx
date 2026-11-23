import React from 'react';
import { createPortal } from 'react-dom';
import { User } from '../types';
import { getM03Capabilities, canInspectM03Booking } from '../src/utils/m03Rbac';
import { Bell, Calendar, Building2, MapPin, CheckCircle, ArrowRight, X, PenTool, Package } from 'lucide-react';
import { fetchSubcontractorBookings } from '../services/apiService';

interface PendingAssignmentItem {
  id: string;
  qcId: string;
  bookingId: string;
  bookingCode: string;
  poNumber: string;
  supplierName: string;
  locationAddress: string;
  requestedDate?: number;
  itemsCount?: number;
  assignedAt?: number;
}

interface QCAssignmentReminderModalProps {
  currentUser: User;
  rolesList?: any[];
  onStartInspectionForBooking: (bookingId: string) => void;
  onNavigateToBookingList: () => void;
  onClose: () => void;
}

export const QCAssignmentReminderModal: React.FC<QCAssignmentReminderModalProps> = ({
  currentUser,
  rolesList = [],
  onStartInspectionForBooking,
  onNavigateToBookingList,
  onClose
}) => {
  const [pendingItems, setPendingItems] = React.useState<PendingAssignmentItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const m03Caps = React.useMemo(() => getM03Capabilities(currentUser, rolesList), [currentUser, rolesList]);

  React.useEffect(() => {
    if (currentUser?.id && m03Caps.canView && (m03Caps.canInspectAny || m03Caps.canInspectAssigned)) {
      loadPendingAssignments();
    } else {
      setPendingItems([]);
    }
  }, [currentUser?.id, currentUser?.name, m03Caps.canView, m03Caps.canInspectAny, m03Caps.canInspectAssigned]);

  const loadPendingAssignments = async () => {
    try {
      setLoading(true);
      if (!currentUser?.id || !m03Caps.canView || (!m03Caps.canInspectAny && !m03Caps.canInspectAssigned)) {
        setPendingItems([]);
        return;
      }

      // Read user-specific dismissed IDs
      const storageKey = `aatn_qc_dismissed_${currentUser.id}`;
      const rawDismissed = localStorage.getItem(storageKey);
      const dismissedIds: string[] = rawDismissed ? JSON.parse(rawDismissed) : [];
      const dismissedSet = new Set(dismissedIds);

      // Query server for ASSIGNED bookings specifically for this user
      const serverRes = await fetchSubcontractorBookings({ 
        assignedQcId: currentUser.id, 
        assignedQcName: currentUser.name,
        status: 'ASSIGNED' 
      });
      const assignedBookings = serverRes.bookings || [];

      // [Update - Lịch Nghiệm Thu GCN] - [2026-11-14 / v3.1.0]
      // Lọc nghiêm ngặt: Chỉ giữ lại booking được phân công cho đúng chuyên viên QC này & đủ quyền nghiệm thu
      const currentUserNameNorm = (currentUser.name || '').trim().toLowerCase();
      const currentUsernameNorm = (currentUser.username || '').trim().toLowerCase();

      const matchedBookings = assignedBookings.filter((b: any) => {
        if (!b || b.status !== 'ASSIGNED') return false;
        if (dismissedSet.has(b.id)) return false;
        if (!canInspectM03Booking(currentUser, b, rolesList)) return false;

        const bQcId = String(b.assignedQcId || '').trim();
        const bQcName = String(b.assignedQcName || '').trim().toLowerCase();

        const isExactId = bQcId && bQcId === currentUser.id;
        const isNameMatch = bQcName && (bQcName === currentUserNameNorm || bQcName === currentUsernameNorm);

        return isExactId || isNameMatch;
      });

      const serverPending: PendingAssignmentItem[] = matchedBookings.map((b: any) => ({
        id: `server_${b.id}`,
        qcId: currentUser.id,
        bookingId: b.id,
        bookingCode: b.bookingCode,
        poNumber: b.poNumber,
        supplierName: b.supplierName,
        locationAddress: b.locationAddress,
        requestedDate: b.requestedDate,
        itemsCount: b.items?.length || 0
      }));

      setPendingItems(serverPending);
    } catch (e) {
      console.error("Failed to fetch pending assignment reminders:", e);
      setPendingItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDismissItem = (bookingId: string) => {
    const updated = pendingItems.filter(item => item.bookingId !== bookingId);
    setPendingItems(updated);
    
    // Save to user-specific dismissed IDs
    try {
      const storageKey = `aatn_qc_dismissed_${currentUser.id}`;
      const rawDismissed = localStorage.getItem(storageKey);
      const dismissedIds: string[] = rawDismissed ? JSON.parse(rawDismissed) : [];
      if (!dismissedIds.includes(bookingId)) {
        dismissedIds.push(bookingId);
      }
      localStorage.setItem(storageKey, JSON.stringify(dismissedIds));
    } catch (e) {}

    if (updated.length === 0) {
      onClose();
    }
  };

  if (pendingItems.length === 0) return null;

  const currentItem = pendingItems[0];

  const modalNode = (
    <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-in fade-in duration-200 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-2.5 sm:py-3 relative shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-md border border-white/20 shrink-0">
              <Bell className="w-5 h-5 text-yellow-300 animate-bounce" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-100 bg-blue-500/30 px-2 py-0.5 rounded-full border border-blue-400/30 inline-block">
                THÔNG BÁO PHÂN CÔNG QC
              </span>
              <h3 className="text-base font-bold tracking-tight text-white mt-0.5 truncate">
                Bạn Có Lịch Nghiệm Thu Mới!
              </h3>
            </div>
          </div>

          <button 
            onClick={onClose}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1 -mr-1.5 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-white shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-4 space-y-3.5 flex-1 min-h-0 overflow-y-auto">
          <div className="bg-blue-50/70 dark:bg-slate-800/80 p-3.5 rounded-xl border border-blue-100 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-black text-blue-700 dark:text-blue-400">
                {currentItem.bookingCode}
              </span>
              <span className="text-xs font-bold text-slate-500 font-mono">
                PO: {currentItem.poNumber}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span className="font-semibold text-slate-900 dark:text-white">{currentItem.supplierName}</span>
              </div>
              
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span className="text-slate-600 dark:text-slate-400 line-clamp-2">{currentItem.locationAddress}</span>
              </div>

              {currentItem.requestedDate && (
                <div className="flex items-center gap-2 pt-1">
                  <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="font-bold text-blue-700 dark:text-blue-300">
                    Ngày nghiệm thu: {new Date(currentItem.requestedDate * 1000).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              )}
            </div>

            {currentItem.itemsCount ? (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium pt-1 border-t border-slate-200 dark:border-slate-700">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span>Số hạng mục cần kiểm: <strong className="text-slate-900 dark:text-white font-bold">{currentItem.itemsCount}</strong> hạng mục</span>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Vui lòng kiểm tra thông tin đơn hàng và chuẩn bị công tác nghiệm thu tại xưởng.
          </p>
        </div>

        {/* Footer actions */}
        <div className="px-4 py-2 sm:py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            onClick={() => {
              handleDismissItem(currentItem.bookingId);
              onStartInspectionForBooking(currentItem.bookingId);
            }}
            className="flex-1 min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-2 px-3.5 py-2 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PenTool className="w-4 h-4" /> Nghiệm Thu Ngay (Tự Điền Form)
          </button>
          
          <button
            onClick={() => {
              handleDismissItem(currentItem.bookingId);
              onNavigateToBookingList();
            }}
            className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Calendar className="w-4 h-4" /> Mở Lịch
          </button>

          <button
            onClick={() => handleDismissItem(currentItem.bookingId)}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-2 sm:py-1.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
