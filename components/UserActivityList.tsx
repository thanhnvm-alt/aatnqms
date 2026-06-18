import React, { useState, useEffect } from 'react';
import { Activity, Clock, LogIn, Monitor, Globe, Shield, Loader2, RefreshCw } from 'lucide-react';

interface AuditLogEntry {
    id: string;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    old_value: string;
    new_value: string;
    timestamp: string | number;
    ip_address?: string;
    user_agent?: string;
}

interface ActivityStats {
    totalLogins: number;
    lastLogin: number | null;
    operations: AuditLogEntry[];
    logins: AuditLogEntry[];
}

interface UserActivityListProps {
    userId: string;
    onClose?: () => void;
}

export const UserActivityList: React.FC<UserActivityListProps> = ({ userId, onClose }) => {
    const [stats, setStats] = useState<ActivityStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'OPS' | 'LOGINS'>('OPS');

    const fetchActivity = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('aatn_qms_token');
            const res = await fetch(`/api/users/${userId}/activity`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) {
                if (res.status === 403) {
                    throw new Error('Bạn không có quyền truy cập thông tin hoạt động của nhân sự này.');
                }
                throw new Error('Không thể tải nhật ký hoạt động.');
            }
            const data = await res.json();
            setStats(data);
        } catch (err: any) {
            setError(err.message || 'Lỗi kết nối máy chủ');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (userId) {
            fetchActivity();
        }
    }, [userId]);

    const formatTime = (ts: any) => {
        if (!ts) return '---';
        const num = typeof ts === 'string' ? parseInt(ts) : ts;
        if (isNaN(num)) return '---';
        const d = new Date(num * 1000);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN');
    };

    const getActionLabel = (action: string) => {
        const a = action.toUpperCase();
        if (a === 'LOGIN') return 'Đăng nhập hệ thống';
        if (a.includes('CREATE_USER')) return 'Tạo mới nhân sự';
        if (a.includes('UPDATE_USER')) return 'Cập nhật nhân sự';
        if (a.includes('DELETE_USER')) return 'Xóa nhân sự';
        if (a.includes('CREATE_INSPECTION')) return 'Tạo phiếu Inspection';
        if (a.includes('SUBMIT_INSPECTION')) return 'Nộp phiếu Inspection';
        if (a.includes('APPROVE_INSPECTION')) return 'Phê duyệt phiếu Inspection';
        if (a.includes('REJECT_INSPECTION')) return 'Từ chối phiếu Inspection';
        if (a.includes('VERIFY_INSPECTION')) return 'Thẩm tra phiếu';
        if (a.includes('CREATE_NCR')) return 'Khởi tạo NCR';
        if (a.includes('CORRECT_NCR')) return 'Khắc phục NCR';
        if (a.includes('APPROVE_NCR') || a.includes('CLOSE_NCR')) return 'Đóng phiếu NCR';
        if (a.includes('CREATE_CAPA')) return 'Khởi tạo CAPA';
        if (a.includes('UPDATE_CAPA')) return 'Cập nhật CAPA';
        if (a.includes('DELETE_CAPA')) return 'Xóa CAPA';
        if (a.includes('DOWNLOAD') || a.includes('EXPORT')) return 'Xuất dữ liệu Excel';
        if (a.includes('NAVIGATE')) return 'Chuyển trang điều hướng';
        if (a.includes('FILTER')) return 'Lọc danh sách dữ liệu';
        return action;
    };

    const getActionColor = (action: string) => {
        const a = action.toUpperCase();
        if (a === 'LOGIN') return 'bg-cyan-50 text-cyan-600 border-cyan-100';
        if (a.includes('CREATE')) return 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500 border-green-100';
        if (a.includes('DELETE')) return 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100';
        if (a.includes('APPROVE') || a.includes('CLOSE')) return 'bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-slate-700';
        if (a.includes('REJECT')) return 'bg-amber-50 text-amber-600 border-amber-100';
        if (a.includes('DOWNLOAD') || a.includes('EXPORT')) return 'bg-purple-50 text-purple-600 border-purple-100';
        if (a.includes('NAVIGATE') || a.includes('FILTER')) return 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800';
        return 'bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-slate-700';
    };

    if (isLoading) {
        return (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Đang tải lịch sử hoạt động...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 rounded-lg text-center space-y-2">
                <Shield className="w-8 h-8 text-red-600 dark:text-red-450 mx-auto" />
                <p className="text-xs font-black text-red-850 uppercase tracking-tight">Lỗi bảo mật hoặc kết nối</p>
                <p className="text-[11px] text-red-650 dark:text-red-400 font-bold max-w-md mx-auto">{error}</p>
                <button onClick={fetchActivity} className="px-4 py-1.5 bg-white dark:bg-slate-900 text-red-700 border border-red-200 rounded-md text-[9px] font-black uppercase tracking-wider hover:bg-red-50 transition-colors">Thử lại</button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* OVERVIEW METRICS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                    <div className="space-y-0.5">
                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Tổng lượt đăng nhập</span>
                        <h4 className="text-xl font-bold font-mono text-slate-800 dark:text-slate-200 leading-none">
                            {stats?.totalLogins || 0} <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">lượt</span>
                        </h4>
                    </div>
                    <div className="p-2 bg-cyan-50 text-cyan-600 rounded-md shadow-sm">
                        <LogIn className="w-5 h-5" />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                    <div className="space-y-0.5">
                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Hoạt động cuối cùng</span>
                        <h4 className="text-xs font-mono text-slate-700 dark:text-slate-300 font-bold leading-tight">
                            {stats?.lastLogin ? formatTime(stats.lastLogin) : 'Chưa có dữ liệu'}
                        </h4>
                    </div>
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md shadow-sm">
                        <Clock className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* TAB SELECTORS */}
            <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded-lg flex gap-1">
                <button 
                    onClick={() => setActiveTab('OPS')} 
                    className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'OPS' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-200/50 dark:border-slate-850' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                >
                    <Activity className="w-3.5 h-3.5" />
                    Thao tác ({stats?.operations.length || 0})
                </button>
                <button 
                    onClick={() => setActiveTab('LOGINS')} 
                    className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'LOGINS' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-200/50 dark:border-slate-850' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                >
                    <Clock className="w-3.5 h-3.5" />
                    Đăng nhập ({stats?.logins.length || 0})
                </button>
            </div>

            {/* LIVE DATA CONTAINER */}
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                {activeTab === 'OPS' ? (
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Thời gian</th>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hành động</th>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Đối tượng</th>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Chi tiết</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                {(stats?.operations || []).map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-3 py-1.5">
                                            <p className="font-mono font-bold text-[10px] text-slate-500 dark:text-slate-400">{formatTime(log.timestamp)}</p>
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <span className={`inline-block px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-tight border rounded-md ${getActionColor(log.action)}`}>
                                                {getActionLabel(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <p className="text-[9px] font-mono font-bold text-slate-605 dark:text-slate-405 bg-slate-50 dark:bg-slate-800/40 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 inline-block uppercase">
                                                {log.entity_type} {log.entity_id !== 'na' ? `#${log.entity_id.split('-').pop()}` : ''}
                                            </p>
                                        </td>
                                        <td className="px-3 py-1.5 text-right">
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500">Bản ghi hệ thống</span>
                                        </td>
                                    </tr>
                                ))}
                                {(!stats?.operations || stats.operations.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-slate-400">
                                            <Activity className="w-8 h-8 opacity-20 mx-auto mb-1" />
                                            <p className="text-[9px] font-bold uppercase tracking-wider">Chưa ghi nhận hoạt động nào</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Thời gian</th>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Địa chỉ IP</th>
                                    <th className="px-3 py-1.5 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Thiết bị / Trình duyệt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                {(stats?.logins || []).map((log) => {
                                    let ip = log.ip_address || '127.0.0.1';
                                    let ua = log.user_agent || 'Chrome / WebApp';
                                    try {
                                        if (log.new_value) {
                                            const p = JSON.parse(log.new_value);
                                            if (p.ip) ip = p.ip;
                                            if (p.userAgent) ua = p.userAgent;
                                        }
                                    } catch(e){}
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-3 py-1.5">
                                                <p className="font-mono font-bold text-[10px] text-slate-500 dark:text-slate-400">{formatTime(log.timestamp)}</p>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                                                    <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                                                    {ip}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500 truncate max-w-xs" title={ua}>
                                                    <Monitor className="w-3 h-3 text-slate-405 shrink-0" />
                                                    {ua.includes('Mozilla') ? 'Google Chrome (macOS / Windows)' : ua}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {(!stats?.logins || stats.logins.length === 0) && (
                                    <tr>
                                        <td colSpan={3} className="py-8 text-center text-slate-404">
                                            <Clock className="w-8 h-8 opacity-20 mx-auto mb-1" />
                                            <p className="text-[9px] font-bold uppercase tracking-wider">Chưa ghi nhận lịch sử đăng nhập</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800">
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> PostgreSQL ISO Append-Only Log</span>
                <button onClick={fetchActivity} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:rotate-45 duration-300">
                    <RefreshCw className="w-2.5 h-2.5" /> Làm mới
                </button>
            </div>
        </div>
    );
};
