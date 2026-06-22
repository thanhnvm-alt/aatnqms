import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect } from 'react';
import { User, ViewState, Inspection, Notification } from '../types';
import { 
  ShieldCheck, UserCircle, Settings, LogOut, Search, 
  RefreshCw, QrCode, Bell, ChevronDown, Menu, X,
  LayoutDashboard, List, FileSpreadsheet, Briefcase, Box, Plus, Key, Monitor, Sun, Moon, FileSignature
} from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';
import { ChangePasswordModal } from './ChangePasswordModal';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../services/apiService';
import { useTheme } from '../src/context/ThemeContext';

interface GlobalHeaderProps {
  user: User;
  view: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  onRefresh?: () => void;
  onCreate?: () => void;
  onSearchChange?: (term: string) => void;
  searchTerm?: string;
  onScanClick?: () => void;
  onOpenSettingsTab?: (tab: 'PROFILE' | 'TEMPLATE' | 'USERS' | 'WORKSHOPS') => void;
  activeFormType?: string;
  onNavigateToRecord?: (view: ViewState, id: string) => void;
  isPublicView?: boolean;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  user, view, onNavigate, onLogout, onRefresh, onCreate,
  onSearchChange, searchTerm, onScanClick, onOpenSettingsTab,
  activeFormType, onNavigateToRecord, isPublicView
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifPage, setNotifPage] = useState(1);
  const [hasMoreNotifs, setHasMoreNotifs] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { theme, setTheme, density, setDensity } = useTheme();
  
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications(true);
    const interval = setInterval(() => loadNotifications(true), 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, [user.id]);

  const loadNotifications = async (isInitial = false) => {
      try {
          const page = isInitial ? 1 : notifPage + 1;
          const data = await fetchNotifications(user.id, page, 50);
          
          if (isInitial) {
              setNotifications(data);
              setNotifPage(1);
              setHasMoreNotifs(data.length === 50);
          } else if (data.length > 0) {
              setNotifications(prev => {
                  const existingIds = new Set(prev.map(n => n.id));
                  const newItems = data.filter((n: Notification) => !existingIds.has(n.id));
                  return [...prev, ...newItems].sort((a, b) => b.createdAt - a.createdAt);
              });
              setNotifPage(page);
              setHasMoreNotifs(data.length === 50);
          } else {
              setHasMoreNotifs(false);
          }
      } catch (e) {}
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkRead = async (id: string) => {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleMarkAllRead = async () => {
      await markAllNotificationsAsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const getPageTitle = () => {
    if (view === 'FORM') {
      switch (activeFormType) {
        case 'IQC': return 'IQC Inspection';
        case 'SQC_MAT': return 'SQC Material';
        case 'SQC_BTP': return 'SQC Semi-Product';
        case 'PQC': return 'PQC Inspection';
        case 'FSR': return 'FSR Sample';
        case 'STEP': return 'Step Vecni';
        case 'FQC': return 'FQC Final';
        case 'SPR': return 'SPR Product';
        case 'SITE': return 'Site Installation';
        default: return 'Inspection Form';
      }
    }
    switch (view) {
      case 'DASHBOARD': return 'Dashboard';
      case 'LIST': return 'Inspection List';
      case 'PLAN': return 'Production Plan';
      case 'PROJECTS': return 'Projects';
      case 'SETTINGS': return 'Settings';
      case 'CONVERT_3D': return 'AI 3D Tools';
      case 'NCR_LIST': return 'NCR Management';
      case 'DEFECT_LIST': return 'Defect Tracker';
      case 'DEFECT_LIBRARY': return 'Defect Library';
      case 'SUPPLIERS': return 'Danh sách Nhà cung cấp';
      case 'SUPPLIER_DETAIL': return 'Hồ sơ Nhà cung cấp';
      case 'MATERIALS': return 'Quản lý Vật liệu';
      case 'IPO': return 'IPO Data';
      case 'DETAIL': return 'Inspection Detail';
      case 'TOOLS': return 'Quản lý Công cụ dụng cụ';
      default: return 'QAQC System';
    }
  };

  const getPageSubtitle = () => {
    if (view === 'FORM') {
      switch (activeFormType) {
        case 'IQC': return 'Kiểm soát vật liệu đầu vào';
        case 'SQC_MAT': return 'Gia công ngoài - Vật tư';
        case 'SQC_BTP': return 'Gia công ngoài - Bán thành phẩm';
        case 'PQC': return 'Kiểm tra quá trình sản xuất';
        case 'FSR': return 'Thẩm định mẫu đầu tiên';
        case 'STEP': return 'Kiểm soát các bước màu';
        case 'FQC': return 'Kiểm tra hoàn thiện cuối';
        case 'SPR': return 'Kiểm tra mẫu chuẩn duyệt';
        case 'SITE': return 'Kiểm soát lắp đặt hiện trường';
        default: return 'Đang thực hiện kiểm tra';
      }
    }
    return '';
  };

  const renderMenuItems = () => {
    const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
    return (
      <div className="p-1 space-y-0.5 dark:bg-slate-900 border-t dark:border-slate-800">
        <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('PROFILE'); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition-colors group">
          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md group-hover:bg-blue-100 dark:bg-blue-900/30 dark:group-hover:bg-blue-900 transition-colors">
            <UserCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">Hồ sơ của tôi</p>
          </div>
        </button>

        <button onClick={() => { setIsMenuOpen(false); setIsChangePasswordOpen(true); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition-colors group">
          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md group-hover:bg-blue-100 dark:bg-blue-900/30 dark:group-hover:bg-blue-900 transition-colors">
            <Key className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">Đổi mật khẩu</p>
          </div>
        </button>

        <div className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
             <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md shrink-0">
                <List className="w-4 h-4 text-slate-500 dark:text-slate-400" />
             </div>
             <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">Mật độ: {density === 'comfortable' ? 'Thoáng' : 'Gọn'}</p>
          </div>
          <div className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase shrink-0 ml-1">
             {density === 'comfortable' ? 'THOÁNG' : 'GỌN'}
          </div>
        </div>

        <div className="px-2 pb-1.5 pt-1 border-b border-slate-50 dark:border-slate-800">
           <div className="flex items-center gap-1.5 mb-1.5 text-slate-500">
              <Moon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-tight">Giao diện</span>
           </div>
           <div className="bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg flex items-center text-[9px] font-black text-slate-500">
              <button onClick={() => setTheme('light')} className={`flex-1 flex flex-col items-center py-1 rounded-md gap-0.5 transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                 <Sun className="w-3.5 h-3.5" /> Sáng
              </button>
              <button onClick={() => setTheme('dark')} className={`flex-1 flex flex-col items-center py-1 rounded-md gap-0.5 transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                 <Moon className="w-3.5 h-3.5" /> Tối
              </button>
              <button onClick={() => setTheme('auto')} className={`flex-1 flex flex-col items-center py-1 rounded-md gap-0.5 transition-all ${theme === 'auto' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                 <Monitor className="w-3.5 h-3.5" /> Tự động
              </button>
           </div>
        </div>
        
        {isAdminOrManager && (
          <div className="space-y-0.5">
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('USERS'); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition-colors group">
              <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md group-hover:bg-blue-100 dark:bg-blue-900/30 dark:group-hover:bg-blue-900 transition-colors">
                <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">Quản trị nhân sự</p>
              </div>
            </button>
                <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('PROFILE'); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md group-hover:bg-indigo-100 dark:bg-indigo-900/30 dark:group-hover:bg-indigo-900 transition-colors">
                    <FileSignature className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">Chữ ký cá nhân</p>
                  </div>
                </button>
                <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('TEMPLATE'); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition-colors group">
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md group-hover:bg-blue-100 dark:bg-blue-900/30 dark:group-hover:bg-blue-900 transition-colors">
                    <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">Cấu hình biểu mẫu</p>
                  </div>
                </button>
          </div>
        )}
        <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-1"></div>
        <button onClick={() => { setIsMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-red-50 dark:bg-red-900/20 dark:hover:bg-red-900/20 transition-colors group">
          <div className="p-1.5 bg-red-50 dark:bg-red-500/10 rounded-md group-hover:bg-red-100 dark:group-hover:bg-red-500/20 transition-colors">
            <LogOut className="w-4 h-4 text-red-500 dark:text-red-400 group-hover:text-red-600 dark:group-hover:text-red-300" />
          </div>
          <div className="text-left flex-1 min-w-0">
             <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-tight">Đăng xuất</p>
          </div>
        </button>
      </div>
    );
  };

  return (
    <header className="h-16 md:h-20 shrink-0 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[100] flex items-center px-4 md:px-8 shadow-sm transition-colors duration-200">
      <div className="flex-1 flex items-center gap-4 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">
            {getPageTitle()}
          </h1>
          {getPageSubtitle() && (
            <div className="flex items-center gap-2">
              {view !== 'FORM' && <div className="w-1.5 h-1.5 rounded-full bg-green-500 hidden md:block"></div>}
              <span className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate">{getPageSubtitle()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-2 text-slate-100">
        {!isPublicView && onRefresh && (
          <button 
            onClick={() => {
              setIsRefreshing(true);
              onRefresh();
              setTimeout(() => setIsRefreshing(false), 1000);
            }} 
            className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl transition-all active:scale-95" 
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}

        {!isPublicView && onScanClick && (
          <button onClick={onScanClick} className="p-2.5 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95" title="Quét mã QR">
            <QrCode className="w-5 h-5" />
          </button>
        )}

        {!isPublicView && (
          <div className="relative" ref={notifRef}>
              <button 
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className={`p-2.5 rounded-xl transition-all active:scale-95 relative ${isNotifOpen ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-800'}`}
              >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                      <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0f172a] ${isNotifOpen ? 'bg-white dark:bg-slate-900' : 'bg-red-500'}`}></span>
                  )}
              </button>
              {isNotifOpen && (
                  <div className="fixed md:absolute top-16 md:top-auto right-4 md:right-0 mt-2 w-44 md:w-[260px] z-[120]">
                      <NotificationCenter 
                          notifications={notifications}
                          onMarkRead={handleMarkRead}
                          onMarkAllRead={handleMarkAllRead}
                          onNavigate={(v, id) => {
                              onNavigateToRecord?.(v, id);
                              setIsNotifOpen(false);
                          }}
                          onClose={() => setIsNotifOpen(false)}
                          onLoadMore={() => loadNotifications(false)}
                          hasMore={hasMoreNotifs}
                      />
                  </div>
              )}
          </div>
        )}

        {!isPublicView && onCreate && (
          <button 
            onClick={onCreate}
            className="h-8 px-3 bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-500/10 flex items-center gap-1.5 hover:bg-blue-700 transition-all active:scale-95 font-black text-[10px] uppercase tracking-wider"
            title="Tạo mới"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Tạo mới</span>
          </button>
        )}

        {!isPublicView && <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>}

        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => !isPublicView && setIsMenuOpen(!isMenuOpen)} 
            className={`flex items-center gap-2 p-1 pl-2 rounded-2xl transition-all active:scale-95 group border border-transparent ${isPublicView ? 'cursor-default' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 hover:border-slate-100 dark:border-slate-800'}`}
          >
            <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{user.name}</p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{user.role}</p>
            </div>
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full border-2 border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden relative">
              <img src={getProxyImageUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover bg-slate-100 dark:bg-slate-800" referrerPolicy="no-referrer" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
          </button>
          {!isPublicView && isMenuOpen && (
            <div className="absolute right-0 mt-2 w-[220px] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-800 py-1.5 z-[110] animate-in zoom-in-95 origin-top-right overflow-hidden ring-1 ring-black/5">
               <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 dark:bg-slate-800/20">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Tài khoản</p>
                  <p className="font-black text-slate-800 dark:text-slate-100 text-[11px] truncate">{user.name}</p>
                  <p className="text-[9px] text-blue-600 dark:text-blue-400 font-bold mt-0.5">{user.msnv || 'AATN-STAFF'}</p>
               </div>
               {renderMenuItems()}
            </div>
          )}
        </div>
      </div>
      {isChangePasswordOpen && (
        <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />
      )}
    </header>
  );
};
