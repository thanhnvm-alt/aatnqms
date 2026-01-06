
import React, { useState, useRef, useEffect } from 'react';
import { User, ModuleId } from '../types';
import { ALL_MODULES } from '../constants';
import { 
  PackageCheck, 
  Truck, 
  Package, 
  Factory, 
  FileQuestion, 
  Palette, 
  ScanEye, 
  ClipboardList, 
  Building2, 
  LayoutGrid, 
  UserCheck,
  Box,
  Settings,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Bell,
  UserCircle,
  // Added Hammer icon for DEFECTS module
  Hammer
} from 'lucide-react';

interface HomeMenuProps {
  onNavigate: (module: string) => void;
  currentUser: User;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void; // New prop for opening profile directly
}

interface ModuleCardProps {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ title, icon, onClick, color = "text-slate-600", disabled = false }) => (
  <div 
    onClick={!disabled ? onClick : undefined} 
    className={`bg-white p-5 md:p-6 rounded-2xl border shadow-sm transition-all h-full flex items-center gap-4 group relative overflow-hidden ${
        disabled 
        ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50' 
        : 'border-slate-200 hover:shadow-md hover:border-blue-300 cursor-pointer active:scale-[0.98]'
    }`}
  >
    <div className={`p-3 rounded-xl transition-colors ${disabled ? 'bg-slate-200 text-slate-400' : `bg-slate-50 group-hover:bg-blue-50 ${color}`}`}>
      {icon}
    </div>
    <span className={`font-bold text-sm md:text-base transition-colors ${disabled ? 'text-slate-400' : 'text-slate-700 group-hover:text-blue-700'}`}>
        {title}
    </span>
    {disabled && (
        <div className="absolute top-2 right-2 text-[8px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
            KHÓA
        </div>
    )}
  </div>
);

// Added DEFECTS property to ICON_MAP to match ModuleId type definition
const ICON_MAP: Record<ModuleId, React.ReactNode> = {
    'IQC': <PackageCheck className="w-6 h-6"/>,
    'SQC_MAT': <Truck className="w-6 h-6"/>,
    'SQC_BTP': <Package className="w-6 h-6"/>,
    'PQC': <Factory className="w-6 h-6"/>,
    'FSR': <FileQuestion className="w-6 h-6"/>,
    'STEP': <Palette className="w-6 h-6"/>,
    'FQC': <ScanEye className="w-6 h-6"/>,
    'SPR': <ClipboardList className="w-6 h-6"/>,
    'SITE': <Building2 className="w-6 h-6"/>,
    'PROJECTS': <LayoutGrid className="w-6 h-6"/>,
    'OEM': <UserCheck className="w-6 h-6"/>,
    'SETTINGS': null,
    'CONVERT_3D': <Box className="w-6 h-6"/>,
    'DEFECTS': <Hammer className="w-6 h-6"/>
};

// Added DEFECTS property to COLOR_MAP to match ModuleId type definition
const COLOR_MAP: Record<ModuleId, string> = {
    'IQC': "text-blue-600",
    'SQC_MAT': "text-teal-600",
    'SQC_BTP': "text-teal-600",
    'PQC': "text-indigo-600",
    'FSR': "text-orange-600",
    'STEP': "text-purple-600",
    'FQC': "text-blue-600",
    'SPR': "text-slate-600",
    'SITE': "text-amber-700",
    'PROJECTS': "text-blue-500",
    'OEM': "text-green-600",
    'SETTINGS': "text-slate-600",
    'CONVERT_3D': "text-purple-600",
    'DEFECTS': "text-orange-600"
};

export const HomeMenu: React.FC<HomeMenuProps> = ({ onNavigate, currentUser, onLogout, onOpenSettings, onOpenProfile }) => {
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
  
  const hasAccess = (moduleId: string) => {
      if (currentUser.role === 'ADMIN') return true;
      return currentUser.allowedModules?.includes(moduleId as ModuleId);
  };

  const renderSection = (title: string, groupKey: string) => {
      // Chỉ lấy các module thuộc group và người dùng có quyền truy cập
      const allowedModules = ALL_MODULES.filter(m => m.group === groupKey && hasAccess(m.id));
      
      // Nếu không có module nào được phép hiển thị, ẩn toàn bộ section
      if (allowedModules.length === 0) return null;

      return (
        <div className="space-y-4">
            <h2 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">{title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {allowedModules.map((module) => (
                    <ModuleCard 
                        key={module.id}
                        title={module.label}
                        icon={ICON_MAP[module.id]}
                        color={COLOR_MAP[module.id]}
                        onClick={() => onNavigate(module.id)}
                        disabled={false}
                    />
                ))}
            </div>
        </div>
      );
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-4 md:p-8 animate-fade-in">
      <div className="space-y-6 md:space-y-8 max-w-7xl mx-auto pb-4">
        {/* Header section optimized for mobile */}
        <div className="bg-white p-5 md:p-8 rounded-[2rem] md:rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-visible">
          <div className="flex flex-col sm:flex-row items-center gap-5 md:gap-8 w-full sm:w-auto">
              {/* Clickable Avatar Dropdown */}
              <div className="relative" ref={menuRef}>
                  <div 
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="relative group cursor-pointer z-10"
                  >
                      <div className={`absolute -inset-1.5 bg-blue-500/20 rounded-full blur transition-all ${isMenuOpen ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100 animate-pulse'}`}></div>
                      <div className={`relative w-20 h-20 md:w-28 md:h-28 rounded-full border-4 shadow-2xl overflow-hidden transition-all active:scale-95 ${isMenuOpen ? 'border-blue-500 ring-4 ring-blue-50' : 'border-white'}`}>
                          <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover bg-slate-50" />
                          <div className="absolute bottom-0 right-0 left-0 bg-black/40 backdrop-blur-sm h-6 md:h-8 flex items-center justify-center">
                              <ChevronDown className={`w-3 h-3 md:w-4 md:h-4 text-white transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`} />
                          </div>
                      </div>
                  </div>

                  {/* Account Dropdown Menu */}
                  {isMenuOpen && (
                      <div className="absolute left-1/2 sm:left-0 -translate-x-1/2 sm:translate-x-0 mt-4 w-72 bg-white rounded-[2rem] shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-slate-100 py-3 z-[100] animate-in zoom-in slide-in-from-top-2 duration-200 origin-top">
                          <div className="px-6 py-5 border-b border-slate-50 mb-2">
                              <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang trực tuyến</span>
                              </div>
                              <p className="font-black text-slate-800 text-lg truncate leading-tight uppercase">{currentUser.name}</p>
                              <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-tighter">{currentUser.msnv || 'NHÂN VIÊN HỆ THỐNG'}</p>
                              <div className="mt-3 flex items-center gap-2 text-[10px] font-black text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                                  PHÂN QUYỀN: <span className="text-slate-800">{currentUser.role}</span>
                              </div>
                          </div>
                          
                          <div className="px-2 space-y-1">
                              <button 
                                  onClick={() => { if(onOpenProfile) onOpenProfile(); else onOpenSettings(); setIsMenuOpen(false); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all group"
                              >
                                  <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-white transition-colors shadow-sm">
                                      <UserCircle className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                      <span className="block font-black text-[11px] uppercase tracking-tighter">Thông tin tài khoản</span>
                                      <span className="block text-[10px] text-slate-400 font-medium">Chỉnh sửa hồ sơ cá nhân</span>
                                  </div>
                              </button>

                              <button 
                                  onClick={() => { onOpenSettings(); setIsMenuOpen(false); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all group"
                              >
                                  <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-white transition-colors shadow-sm">
                                      <Settings className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                      <span className="block font-black text-[11px] uppercase tracking-tighter">Cài đặt hệ thống</span>
                                      <span className="block text-[10px] text-slate-400 font-medium">Quản lý nhân sự & mẫu</span>
                                  </div>
                              </button>
                              
                              <div className="h-px bg-slate-50 my-1 mx-2"></div>

                              <button 
                                  onClick={onLogout}
                                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-600 hover:bg-red-50 transition-all group"
                              >
                                  <div className="p-2.5 bg-red-50 rounded-xl group-hover:bg-white transition-colors shadow-sm">
                                      <LogOut className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                      <span className="block font-black text-[11px] uppercase tracking-tighter">Đăng xuất ngay</span>
                                      <span className="block text-[10px] text-red-400 font-medium">Kết thúc phiên làm việc</span>
                                  </div>
                              </button>
                          </div>
                      </div>
                  )}
              </div>

              <div className="text-center sm:text-left overflow-hidden">
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-1.5">
                      <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">Home</h1>
                      <div className="px-3 py-1 bg-blue-600 text-white rounded-full text-[9px] font-black uppercase flex items-center gap-1 shadow-lg shadow-blue-500/20">
                          v3.2 PRO
                      </div>
                  </div>
                  <div className="space-y-0.5">
                      <p className="text-slate-500 font-bold text-lg md:text-xl leading-tight">
                          Xin chào, <span className="text-blue-600 font-black uppercase tracking-tight">{currentUser.name}</span>.
                      </p>
                      <p className="text-slate-400 text-xs md:text-sm font-medium">Hệ thống điều hành quản lý chất lượng QA/QC chuyên sâu.</p>
                  </div>
              </div>
          </div>

          {/* Notifications and status */}
          <div className="hidden md:flex items-center gap-3">
               <button className="relative p-3.5 bg-slate-50 text-slate-400 rounded-2xl hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-90 border border-slate-100 group">
                  <Bell className="w-6 h-6 group-hover:animate-bounce" />
                  <span className="absolute top-3.5 right-3.5 w-3 h-3 bg-red-500 border-2 border-white rounded-full shadow-sm"></span>
               </button>
          </div>
        </div>

        <div className="space-y-8 md:space-y-12 px-1">
            <div className="w-full">
               {renderSection("Công cụ AI thông minh", "TOOLS")}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
               <div className="space-y-8 md:space-y-12">
                  {renderSection("Kiểm soát chất lượng (QC)", "QC")}
                  {renderSection("Dịch vụ OEM", "OEM")}
               </div>
               <div className="space-y-8 md:space-y-12">
                  {renderSection("Đảm bảo chất lượng (QA)", "QA")}
                  {renderSection("Quản lý dự án", "PM")}
               </div>
            </div>
        </div>
      </div>
    </div>
  );
};
