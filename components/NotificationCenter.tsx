
import React from 'react';
import { Notification, ViewState } from '../types';
import { 
    Bell, CheckCircle2, AlertTriangle, MessageSquare, 
    Clock, ShieldCheck, X, ChevronRight, Check,
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

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'INSPECTION': return <CheckCircle2 className="w-5 h-5 text-blue-500" />;
            case 'NCR': return <AlertOctagon className="w-5 h-5 text-red-500" />;
            case 'COMMENT': return <MessageSquare className="w-5 h-5 text-purple-500" />;
            case 'DEADLINE': return <Clock className="w-5 h-5 text-orange-500" />;
            default: return <Info className="w-5 h-5 text-slate-500" />;
        }
    };

    const formatTime = (ts: number) => {
        const diff = Date.now() - ts * 1000;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Vừa xong';
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        return new Date(ts * 1000).toLocaleDateString('vi-VN');
    };

    return (
        <div className="flex flex-col h-full bg-white shadow-2xl rounded-[2rem] overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200 origin-top-right">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Bell className="w-6 h-6 text-slate-800" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <div>
                        <h3 className="font-black text-slate-900 uppercase tracking-tighter">Thông báo</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{unreadCount} tin chưa đọc</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button 
                            onClick={onMarkAllRead}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90"
                            title="Đánh dấu tất cả đã đọc"
                        >
                            <Check className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all active:scale-90">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar bg-white">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                        <Bell className="w-12 h-12 opacity-10 mb-4" />
                        <p className="font-black uppercase tracking-[0.2em] text-[10px]">Hệ thống chưa có thông báo</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {notifications.map((n) => (
                            <div 
                                key={n.id}
                                onClick={() => {
                                    onMarkRead(n.id);
                                    if (n.link) onNavigate(n.link.view, n.link.id);
                                    onClose();
                                }}
                                className={`p-4 flex gap-4 hover:bg-blue-50/50 transition-all cursor-pointer group relative border-l-4 ${
                                    n.isRead ? 'border-transparent' : 'border-blue-500 bg-blue-50/30'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                                    n.isRead ? 'bg-slate-100 text-slate-400' : 'bg-white text-blue-600 border border-blue-100'
                                }`}>
                                    {getIcon(n.type)}
                                </div>
                                <div className="flex-1 min-w-0 pr-4">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className={`text-xs uppercase tracking-tight truncate pr-2 ${n.isRead ? 'font-bold text-slate-600' : 'font-black text-slate-900'}`}>
                                            {n.title}
                                        </h4>
                                        <span className="text-[8px] font-black text-slate-400 whitespace-nowrap uppercase">
                                            {formatTime(n.createdAt)}
                                        </span>
                                    </div>
                                    <p className={`text-[11px] leading-relaxed line-clamp-2 ${n.isRead ? 'text-slate-500' : 'text-slate-700 font-medium'}`}>
                                        {n.message}
                                    </p>
                                </div>
                                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0 text-center">
                <button 
                    onClick={() => { onMarkAllRead(); onClose(); }}
                    className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] hover:underline"
                >
                    Tải thêm thông báo cũ
                </button>
            </div>
        </div>
    );
};
