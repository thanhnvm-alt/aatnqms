import React from 'react';
import { User } from '../types';
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
  onStartInspectionForBooking: (bookingId: string) => void;
  onNavigateToBookingList: () => void;
  onClose: () => void;
}

export const QCAssignmentReminderModal: React.FC<QCAssignmentReminderModalProps> = ({
  currentUser,
  onStartInspectionForBooking,
  onNavigateToBookingList,
  onClose
}) => {
  const [pendingItems, setPendingItems] = React.useState<PendingAssignmentItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    loadPendingAssignments();
  }, [currentUser.id]);

  const loadPendingAssignments = async () => {
    try {
      setLoading(true);
      // Read from local storage first
      const rawStored = localStorage.getItem('aatn_qc_pending_assignments');
      let storedList: PendingAssignmentItem[] = rawStored ? JSON.parse(rawStored) : [];
      let userItems = storedList.filter(item => item.qcId === currentUser.id);

      // Also query server for ASSIGNED bookings for this user
      const serverRes = await fetchSubcontractorBookings({ assignedQcId: currentUser.id, status: 'ASSIGNED' });
      const assignedBookings = serverRes.bookings || [];

      if (assignedBookings.length > 0) {
        // Filter out already acknowledged items if any, or map server items
        const serverPending: PendingAssignmentItem[] = assignedBookings.map((b: any) => ({
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
        
        // Combine server and local list without duplicates
        const uniqueMap = new Map<string, PendingAssignmentItem>();
        [...userItems, ...serverPending].forEach(item => {
          uniqueMap.set(item.bookingId, item);
        });
        userItems = Array.from(uniqueMap.values());
      }

      setPendingItems(userItems);
    } catch (e) {
      console.error("Failed to fetch pending assignment reminders:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDismissItem = (bookingId: string) => {
    const updated = pendingItems.filter(item => item.bookingId !== bookingId);
    setPendingItems(updated);
    
    // Update local storage
    try {
      const rawStored = localStorage.getItem('aatn_qc_pending_assignments');
      let storedList: PendingAssignmentItem[] = rawStored ? JSON.parse(rawStored) : [];
      storedList = storedList.filter(item => !(item.qcId === currentUser.id && item.bookingId === bookingId));
      localStorage.setItem('aatn_qc_pending_assignments', JSON.stringify(storedList));
    } catch (e) {}

    if (updated.length === 0) {
      onClose();
    }
  };

  if (pendingItems.length === 0) return null;

  const currentItem = pendingItems[0];

  return (
    <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-5 relative">
          <button 
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-white/20 transition-colors text-white"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-md border border-white/20">
              <Bell className="w-6 h-6 text-yellow-300 animate-bounce" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-100 bg-blue-500/30 px-2 py-0.5 rounded-full border border-blue-400/30">
                THÔNG BÁO PHÂN CÔNG QC
              </span>
              <h3 className="text-lg font-bold tracking-tight text-white mt-0.5">
                Bạn Có Lịch Nghiệm Thu Mới!
              </h3>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <div className="bg-blue-50/70 dark:bg-slate-800/80 p-4 rounded-xl border border-blue-100 dark:border-slate-700 space-y-2.5">
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
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => {
              handleDismissItem(currentItem.bookingId);
              onStartInspectionForBooking(currentItem.bookingId);
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
          >
            <PenTool className="w-4 h-4" /> Nghiệm Thu Ngay (Tự Điền Form)
          </button>
          
          <button
            onClick={() => {
              handleDismissItem(currentItem.bookingId);
              onNavigateToBookingList();
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
          >
            <Calendar className="w-4 h-4" /> Mở Lịch
          </button>

          <button
            onClick={() => handleDismissItem(currentItem.bookingId)}
            className="px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
};
