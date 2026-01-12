
import React, { useState, useRef, useEffect } from 'react';
import { User, ViewState, Inspection } from '../types';
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
  activeFormType?: string;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  user, view, onNavigate, onLogout, onRefresh, onCreate,
  onSearchChange, searchTerm, onScanClick, onOpenSettingsTab,
  activeFormType
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
      case 'DETAIL': return 'Inspection Detail';
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
    return user.name;
  };

  const renderMenuItems = () => {
    const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
    return (
      <div className="p-2 space-y-1">
        <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('PROFILE'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
          <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">
            <UserCircle className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-700">Cá nhân</p>
            <p className="text-xs text-slate-500 font-medium">Hồ sơ của tôi</p>
          </div>
        </button>
        {isAdminOrManager && (
          <>
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('USERS'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
              <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                <ShieldCheck className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-700">Quản trị</p>
                <p className="text-xs text-slate-500 font-medium">Nhân sự & Phân quyền</p>
              </div>
            </button>
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('TEMPLATE'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
              <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                <Settings className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-700">Cấu hình</p>
                <p className="text-xs text-slate-500 font-medium">Mẫu phiếu kiểm tra</p>
              </div>
            </button>
          </>
        )}
        <div className="h-px bg-slate-100 my-1 mx-2"></div>
        <button onClick={() => { setIsMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors group">
          <div className="p-2 bg-red-50 rounded-lg group-hover:bg-red-100 transition-colors">
            <LogOut className="w-5 h-5 text-red-500 group-hover:text-red-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-red-600">Đăng xuất</p>
            <p className="text-xs text-red-400 font-medium">Kết thúc phiên</p>
          </div>
        </button>
      </div>
    );
  };

  return (
    <header className="h-16 md:h-20 shrink-0 bg-white border-b border-slate-200 sticky top-0 z-[100] flex items-center px-4 md:px-8 shadow-sm">
      <div className="flex-1 flex items-center gap-4 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-slate-900 tracking-tight truncate">
            {getPageTitle()}
          </h1>
          <div className="flex items-center gap-2">
            {view !== 'FORM' && <div className="w-1.5 h-1.5 rounded-full bg-green-500 hidden md:block"></div>}
            <span className="text-xs md:text-sm font-medium text-slate-500 truncate">{getPageSubtitle()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-2">
        {onRefresh && (
          <button onClick={onRefresh} className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-all active:scale-95" title="Làm mới dữ liệu">
            <RefreshCw className="w-5 h-5" />
          </button>
        )}

        {onScanClick && (
          <button onClick={onScanClick} className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-all active:scale-95" title="Quét mã QR">
            <QrCode className="w-5 h-5" />
          </button>
        )}

        {onCreate && (
          <button 
            onClick={onCreate}
            className="h-10 px-4 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95 font-bold text-sm"
            title="Tạo mới"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Tạo mới</span>
          </button>
        )}

        <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

        <div className="relative" ref={menuRef}>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-2 p-1 pl-2 rounded-2xl hover:bg-slate-50 transition-all active:scale-95 group border border-transparent hover:border-slate-100">
            <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-slate-700">{user.name}</p>
                <p className="text-[10px] font-medium text-slate-400">{user.role}</p>
            </div>
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full border-2 border-slate-100 shadow-sm overflow-hidden relative">
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover bg-slate-100" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[110] animate-in zoom-in-95 origin-top-right overflow-hidden ring-1 ring-black/5">
               <div className="px-5 py-4 border-b border-slate-50 bg-slate-50/50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Tài khoản</p>
                  <p className="font-bold text-slate-800 text-base truncate">{user.name}</p>
                  <p className="text-xs text-blue-600 font-medium mt-0.5">{user.msnv || 'AATN-STAFF'}</p>
               </div>
               {renderMenuItems()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
