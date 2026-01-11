
import React, { useState, useRef, useEffect } from 'react';
import { User, ViewState } from '../types';
import { 
  ShieldCheck, UserCircle, Settings, LogOut, Search, 
  RefreshCw, QrCode, Bell, ChevronDown, Menu, X,
  LayoutDashboard, List, FileSpreadsheet, Briefcase, Box, Plus,
  LayoutGrid, AlertTriangle, BookOpen, Hammer, FileText
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
      case 'DASHBOARD': return 'DASHBOARD';
      case 'LIST': return 'INSPECTION';
      case 'PLAN': return 'PLANNING';
      case 'PROJECTS': return 'PROJECTS';
      case 'SETTINGS': return 'SETTINGS';
      case 'CONVERT_3D': return 'AI 3D';
      case 'NCR_LIST': return 'NCR LIST';
      case 'DEFECT_LIST': return 'DEFECTS';
      case 'DEFECT_LIBRARY': return 'LIBRARY';
      case 'formIQC': return 'IQC FORM';
      case 'formPQC': return 'PQC FORM';
      case 'formSQC_MAT': return 'SQC-VT FORM';
      case 'formSQC_BTP': return 'SQC-BTP FORM';
      case 'formFSR': return 'FSR FORM';
      case 'formSTEP': return 'STEP FORM';
      case 'formFQC': return 'FQC FORM';
      case 'formSPR': return 'SPR FORM';
      case 'formSITE': return 'SITE FORM';
      case 'FORM': return 'INSPECTION FORM';
      default: return 'SYSTEM';
    }
  };

  const getPageSubtitle = () => {
    switch (view) {
      case 'DASHBOARD': return 'Báo cáo tổng hợp';
      case 'LIST': return 'Danh sách phiếu kiểm tra';
      case 'PLAN': return 'Kế hoạch sản xuất';
      case 'PROJECTS': return 'Danh mục công trình';
      case 'SETTINGS': return 'Cấu hình hệ thống';
      case 'CONVERT_3D': return 'Chuyển đổi 2D sang 3D';
      case 'NCR_LIST': return 'Hồ sơ lỗi không phù hợp';
      case 'DEFECT_LIST': return 'Theo dõi lỗi kỹ thuật';
      case 'DEFECT_LIBRARY': return 'Thư viện lỗi chuẩn';
      case 'formIQC': return 'Kiểm soát vật liệu đầu vào';
      case 'formPQC': return 'Kiểm soát chất lượng sản xuất';
      case 'formSQC_MAT': return 'Gia công ngoài - Vật tư';
      case 'formSQC_BTP': return 'Gia công ngoài - Bán thành phẩm';
      case 'formFSR': return 'Kiểm tra mẫu đầu tiên';
      case 'formSTEP': return 'Kiểm soát bước màu sơn';
      case 'formFQC': return 'Kiểm tra hoàn thiện cuối';
      case 'formSPR': return 'Kiểm tra mẫu chuẩn';
      case 'formSITE': return 'Kiểm soát lắp đặt hiện trường';
      case 'FORM': return 'Phiếu kiểm tra chất lượng';
      default: return 'Quản lý chất lượng';
    }
  };

  const getPageIcon = () => {
    const className = "w-5 h-5 text-blue-600";
    if (view.startsWith('form')) return <FileText className={className} />;
    
    switch (view) {
      case 'DASHBOARD': return <LayoutDashboard className={className} />;
      case 'LIST': return <List className={className} />;
      case 'PLAN': return <FileSpreadsheet className={className} />;
      case 'PROJECTS': return <Briefcase className={className} />;
      case 'SETTINGS': return <Settings className={className} />;
      case 'NCR_LIST': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'DEFECT_LIBRARY': return <BookOpen className={className} />;
      case 'DEFECT_LIST': return <Hammer className="w-5 h-5 text-orange-500" />;
      default: return <FileText className={className} />;
    }
  };

  const renderMenuItems = () => {
    const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
    return (
      <div className="p-2 space-y-1">
        <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('PROFILE'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
          <UserCircle className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
          <div className="text-left">
            <p className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">Cá nhân</p>
            <p className="text-[10px] text-slate-400 font-medium">Hồ sơ của tôi</p>
          </div>
        </button>
        {isAdminOrManager && (
          <>
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('USERS'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
              <ShieldCheck className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
              <div className="text-left">
                <p className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">Quản trị</p>
                <p className="text-[10px] text-slate-400 font-medium">Nhân sự & Phân quyền</p>
              </div>
            </button>
            <button onClick={() => { setIsMenuOpen(false); onOpenSettingsTab?.('TEMPLATE'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
              <Settings className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
              <div className="text-left">
                <p className="text-[12px] font-bold text-slate-700 uppercase tracking-tight">Cấu hình</p>
                <p className="text-[10px] text-slate-400 font-medium">Mẫu phiếu kiểm tra</p>
              </div>
            </button>
          </>
        )}
        <div className="h-px bg-slate-100 my-1 mx-2"></div>
        <button onClick={() => { setIsMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors group">
          <LogOut className="w-5 h-5 text-red-400 group-hover:text-red-600" />
          <div className="text-left">
            <p className="text-[12px] font-bold text-red-600 uppercase tracking-tight">Đăng xuất</p>
            <p className="text-[10px] text-red-400 font-medium">Kết thúc phiên</p>
          </div>
        </button>
      </div>
    );
  };

  return (
    <header className="h-16 md:h-18 shrink-0 bg-white border-b border-slate-200 sticky top-0 z-[100] flex items-center px-4 md:px-6 shadow-sm">
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          {getPageIcon()}
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[13px] font-black text-slate-900 uppercase tracking-tight truncate leading-none">
            {getPageTitle()} 
            <span className="mx-1.5 text-slate-300 font-medium">-</span>
            <span className="text-slate-400 font-bold text-[10px] tracking-widest">{getPageSubtitle()}</span>
          </h1>
          
          <div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight truncate">
              {user.name}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 ml-2">
        {onRefresh && (
          <button onClick={onRefresh} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90">
            <RefreshCw className="w-4.5 h-4.5" />
          </button>
        )}

        {onScanClick && (
          <button onClick={onScanClick} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90">
            <QrCode className="w-4.5 h-4.5" />
          </button>
        )}

        {onCreate && (
          <button 
            onClick={onCreate}
            className="w-9 h-9 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center hover:bg-blue-700 transition-all active:scale-90"
            title="Tạo mới"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}

        <div className="relative ml-1" ref={menuRef}>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-1 p-0.5 rounded-2xl hover:bg-slate-50 transition-all active:scale-95 group">
            <div className="w-8 h-8 rounded-full border border-slate-200 shadow-sm overflow-hidden relative">
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover bg-slate-100" />
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 md:w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 py-2 z-[110] animate-in zoom-in-95 origin-top-right overflow-hidden">
               <div className="px-5 py-4 border-b border-slate-50 bg-slate-50/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Đang đăng nhập</p>
                  <p className="font-black text-slate-800 text-[13px] truncate uppercase leading-tight">{user.name}</p>
                  <p className="text-[10px] text-blue-600 font-bold mt-0.5 uppercase tracking-tighter">{user.role}</p>
               </div>
               {renderMenuItems()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
