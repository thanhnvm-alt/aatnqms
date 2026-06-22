
import React from 'react';
import { Notification, ViewState } from '../types';
import { 
    Bell, CheckCircle2, MessageSquare, 
    Clock, X, ChevronRight, Check,
    AlertOctagon, Info
} from 'lucide-react';

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate: (view: ViewState, id: string) => void;
  onClose: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
    notifications, onMarkRead, onMarkAllRead, onNavigate, onClose, onLoadMore, hasMore 
}) => {
    const unreadCount = notifications.filter(n => !n.isRead).length;

    const getIcon = (type: Notification['type'], isRead: boolean) => {
        const baseClass = "w-5 h-5 transition-colors";
        switch (type) {
            case 'INSPECTION': 
                return <CheckCircle2 className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-blue-500 dark:text-blue-400'}`} />;
            case 'NCR': 
                return <AlertOctagon className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-red-500 dark:text-red-400'}`} />;
            case 'COMMENT': 
                return <MessageSquare className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-purple-500'}`} />;
            case 'DEADLINE': 
                return <Clock className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-orange-500'}`} />;
            default: 
                return <Info className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'}`} />;
        }
    };

    const formatTime = (ts: number) => {
        const diff = Date.now() - ts * 1000;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'VỪA XONG';
        if (mins < 60) return `${mins} PHÚT TRƯỚC`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} GIỜ TRƯỚC`;
        return new Date(ts * 1000).toLocaleDateString('vi-VN');
    };

    return (
        <div className="flex flex-col h-full max-h-[300px] md:max-h-[500px] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
            {/* Header: Cập nhật theo hình mẫu */}
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Bell className="w-5 h-5 text-slate-800 dark:text-slate-200" strokeWidth={2.5} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white text-[7px] font-black rounded-full flex items-center justify-center border border-white shadow-sm">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <h3 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter text-[7px] md:text-[11px] leading-none">THÔNG BÁO</h3>
                        <p className="text-[6px] md:text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                            {unreadCount} TIN CHƯA ĐỌC
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onMarkAllRead(); }}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-lg transition-all active:scale-90"
                        title="Đánh dấu tất cả đã đọc"
                    >
                        <Check className="w-4 h-4" strokeWidth={3} />
                    </button>
                    <button onClick={onClose} className="p-1.5 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:bg-red-900/20 hover:text-red-500 dark:text-red-400 rounded-lg transition-all active:scale-90">
                        <X className="w-4 h-4" strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* List: Tối ưu hiển thị mobile */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/50/30 no-scrollbar">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                        <Bell className="w-16 h-16 opacity-10 mb-4" />
                        <p className="font-black uppercase tracking-[0.2em] text-[10px]">Hệ thống chưa có thông báo</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {notifications.map((n) => (
                            <div 
                                key={n.id}
                                onClick={() => {
                                    onMarkRead(n.id);
                                    if (n.link) onNavigate(n.link.view, n.link.id);
                                    onClose();
                                }}
                                className={`p-1.5 flex gap-2 rounded-xl transition-all cursor-pointer group relative border ${
                                    n.isRead 
                                    ? 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-70' 
                                    : 'bg-white dark:bg-slate-900 border-blue-100 dark:border-slate-700 shadow-sm ring-1 ring-blue-50'
                                } active:scale-[0.98]`}
                            >
                                {/* Circle Icon - Ẩn trên mobile theo yêu cầu */}
                                <div className={`hidden md:flex w-7 h-7 rounded-full items-center justify-center shrink-0 shadow-sm border-2 ${
                                    n.isRead 
                                    ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800' 
                                    : 'bg-white dark:bg-slate-900 border-blue-500/20'
                                }`}>
                                    {React.cloneElement(getIcon(n.type, n.isRead) as React.ReactElement, { className: 'w-3.5 h-3.5' })}
                                </div>

                                <div className="flex-1 min-w-0 pr-1">
                                    <div className="flex justify-between items-start mb-0">
                                        <h4 className={`text-[7px] md:text-[10px] uppercase tracking-tight truncate pr-1 ${n.isRead ? 'font-bold text-slate-500 dark:text-slate-400' : 'font-black text-slate-900 dark:text-slate-100'}`}>
                                            {n.title}
                                        </h4>
                                        <span className="text-[5.5px] md:text-[7.5px] font-black text-slate-400 dark:text-slate-500 whitespace-nowrap uppercase shrink-0 mt-0.5 ml-1">
                                            {formatTime(n.createdAt)}
                                        </span>
                                    </div>
                                    <p className={`text-[6.5px] md:text-[9px] leading-tight line-clamp-1 ${n.isRead ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300 font-medium'}`}>
                                        {(n.message || '').replace('undefined', 'dự án')}
                                    </p>
                                </div>
                                
                                {!n.isRead && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ChevronRight className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer: Tải thêm thông báo */}
            {hasMore && (
                <div className="p-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 text-center">
                    <button 
                        onClick={onLoadMore}
                        className="w-full py-1 text-[7px] md:text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider hover:text-blue-800 transition-colors"
                    >
                        TẢI THÊM THÔNG BÁO CŨ
                    </button>
                </div>
            )}
        </div>
    );
};
