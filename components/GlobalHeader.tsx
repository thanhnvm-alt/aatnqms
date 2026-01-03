
import React, { useState, useRef, useEffect } from 'react';
import { User, ViewState } from '../types';
import { 
  ShieldCheck, UserCircle, Settings, LogOut, Search, 
  RefreshCw, QrCode, Bell, ChevronDown, Menu, X,
  LayoutDashboard, List, FileSpreadsheet, Briefcase, Box, Plus
} from 'lucide-react';

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
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  user, view, onNavigate, onLogout, onRefresh, onCreate,
  onSearchChange, searchTerm, onScanClick, onOpenSettingsTab
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
    switch (view) {
      case 'DASHBOARD': return 'Báo cáo tổng hợp';
      case 'LIST': return 'Danh sách kiểm tra';
      case 'PLAN': return 'Kế hoạch sản xuất';
      case 'PROJECTS': return 'Quản lý dự án';
      case 'SETTINGS': return 'Cài đặt hệ thống';
      case 'CONVERT_3D': return 'AI 2D to 3D';
      default: return 'QAQC System';
    }
  };

  const renderMenuItems = () => {
    const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
    return (
      <div className="p-2 space-y-1">
        <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('PROFILE'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
          <UserCircle className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
          <div className="text-left">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-tight">Cá nhân</p>
            <p className="text-[10px] text-slate-400 font-medium">Hồ sơ của tôi</p>
          </div>
        </button>
        {isAdminOrManager && (
          <>
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('USERS'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
              <ShieldCheck className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
              <div className="text-left">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-tight">Quản trị</p>
                <p className="text-[10px] text-slate-400 font-medium">Nhân sự & Phân quyền</p>
              </div>
            </button>
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('TEMPLATE'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
              <Settings className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
              <div className="text-left">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-tight">Cấu hình</p>
                <p className="text-[10px] text-slate-400 font-medium">Mẫu phiếu kiểm tra</p>
              </div>
            </button>
          </>
        )}
        <div className="h-px bg-slate-100 my-1 mx-2"></div>
        <button onClick={() => { setIsMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors group">
          <LogOut className="w-5 h-5 text-red-400 group-hover:text-red-600" />
          <div className="text-left">
            <p className="text-xs font-bold text-red-600 uppercase tracking-tight">Đăng xuất</p>
            <p className="text-[10px] text-red-400 font-medium">Kết thúc phiên</p>
          </div>
        </button>
      </div>
    );
  };

  return (
    <header className="h-16 md:h-20 shrink-0 bg-white border-b border-slate-200 sticky top-0 z-[100] flex items-center px-4 md:px-6 shadow-sm">
      <div className="flex-1 flex items-center gap-3 overflow-hidden">
        <div className="flex flex-col min-w-0">
          <h1 className="text-xs md:text-xl font-black text-slate-900 uppercase tracking-tighter truncate">
            {getPageTitle()}
          </h1>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{user.name}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 ml-2">
        {onRefresh && (
          <button onClick={onRefresh} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90">
            <RefreshCw className="w-5 h-5" />
          </button>
        )}

        {onScanClick && (
          <button onClick={onScanClick} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90">
            <QrCode className="w-5 h-5" />
          </button>
        )}

        {onCreate && (
          <button 
            onClick={onCreate}
            className="w-10 h-10 md:w-11 md:h-11 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center hover:bg-blue-700 transition-all active:scale-90"
            title="Tạo mới"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        <div className="relative" ref={menuRef}>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-1 p-1 rounded-2xl hover:bg-slate-50 transition-all active:scale-95 group">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-slate-100 shadow-sm overflow-hidden relative">
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover bg-slate-100" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 md:w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 py-2 z-[110] animate-in zoom-in-95 origin-top-right overflow-hidden">
               <div className="px-5 py-4 border-b border-slate-50 bg-slate-50/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phiên làm việc</p>
                  <p className="font-black text-slate-800 text-sm truncate uppercase leading-tight">{user.name}</p>
                  <p className="text-[10px] text-blue-600 font-bold mt-0.5">{user.msnv || 'AATN-STAFF'}</p>
               </div>
               {renderMenuItems()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
