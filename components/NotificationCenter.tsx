
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
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
    notifications, onMarkRead, onMarkAllRead, onNavigate, onClose 
}) => {
    const unreadCount = notifications.filter(n => !n.isRead).length;

    const getIcon = (type: Notification['type'], isRead: boolean) => {
        const baseClass = "w-5 h-5 transition-colors";
        switch (type) {
            case 'INSPECTION': 
                return <CheckCircle2 className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-blue-500'}`} />;
            case 'NCR': 
                return <AlertOctagon className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-red-500'}`} />;
            case 'COMMENT': 
                return <MessageSquare className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-purple-500'}`} />;
            case 'DEADLINE': 
                return <Clock className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-orange-500'}`} />;
            default: 
                return <Info className={`${baseClass} ${isRead ? 'text-slate-300' : 'text-slate-500'}`} />;
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
        <div className="flex flex-col h-full max-h-[85vh] md:max-h-[600px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-[2rem] md:rounded-[2.5rem] overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Bell className="w-6 h-6 text-slate-800" strokeWidth={2.5} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter text-sm leading-none">THÔNG BÁO</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {unreadCount} TIN CHƯA ĐỌC
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onMarkAllRead(); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90"
                        title="Đánh dấu tất cả đã đọc"
                    >
                        <Check className="w-5 h-5" strokeWidth={3} />
                    </button>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all active:scale-90">
                        <X className="w-5 h-5" strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-50/30 no-scrollbar">
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
                                className={`p-4 flex gap-4 rounded-2xl transition-all cursor-pointer group relative border ${
                                    n.isRead 
                                    ? 'bg-white border-slate-100 opacity-70' 
                                    : 'bg-white border-blue-100 shadow-sm ring-1 ring-blue-50'
                                } active:scale-[0.98]`}
                            >
                                <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm border-2 ${
                                    n.isRead 
                                    ? 'bg-slate-50 border-slate-100' 
                                    : 'bg-white border-blue-500/20'
                                }`}>
                                    {getIcon(n.type, n.isRead)}
                                </div>

                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex justify-between items-start mb-0.5">
                                        <h4 className={`text-[11px] uppercase tracking-tight truncate pr-2 ${n.isRead ? 'font-bold text-slate-500' : 'font-black text-slate-900'}`}>
                                            {n.title}
                                        </h4>
                                        <span className="text-[8px] font-black text-slate-400 whitespace-nowrap uppercase shrink-0 mt-0.5">
                                            {formatTime(n.createdAt)}
                                        </span>
                                    </div>
                                    <p className={`text-[10px] leading-relaxed line-clamp-2 ${n.isRead ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                                        {(n.message || '').replace('undefined', 'dự án')}
                                    </p>
                                </div>
                                
                                {!n.isRead && (
                                    <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0 text-center">
                <button 
                    onClick={() => { onMarkAllRead(); onClose(); }}
                    className="w-full py-2 text-[10px] font-black text-blue-600 uppercase tracking-[0.25em] hover:text-blue-800 transition-colors"
                >
                    XEM TẤT CẢ THÔNG BÁO
                </button>
            </div>
        </div>
    );
};
