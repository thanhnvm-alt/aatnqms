

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
  Hammer
} from 'lucide-react';

interface HomeMenuProps {
  onNavigate: (module: string) => void;
  currentUser: User;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void; 
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
    className={`bg-white p-5 rounded-2xl border shadow-sm transition-all h-full flex items-center gap-4 group relative overflow-hidden ${
        disabled 
        ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50' 
        : 'border-slate-200 hover:shadow-md hover:border-blue-300 cursor-pointer active:scale-[0.98]'
    }`}
  >
    <div className={`p-3.5 rounded-xl transition-colors ${disabled ? 'bg-slate-200 text-slate-400' : `bg-slate-50 group-hover:bg-blue-50 ${color}`}`}>
      {icon}
    </div>
    <span className={`font-bold text-sm transition-colors ${disabled ? 'text-slate-400' : 'text-slate-700 group-hover:text-blue-700'}`}>
        {title}
    </span>
    {disabled && (
        <div className="absolute top-2 right-2 text-[8px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-tight">
            KHÓA
        </div>
    )}
  </div>
);

// Added SQC_VT and SUPPLIERS to ICON_MAP
const ICON_MAP: Record<ModuleId, React.ReactNode> = {
    'IQC': <PackageCheck className="w-6 h-6"/>,
    'SQC_MAT': <Truck className="w-6 h-6"/>,
    'SQC_VT': <Truck className="w-6 h-6"/>,
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
    'DEFECTS': <Hammer className="w-6 h-6"/>,
    'SUPPLIERS': <Truck className="w-6 h-6"/>
};

// Added SQC_VT and SUPPLIERS to COLOR_MAP
const COLOR_MAP: Record<ModuleId, string> = {
    'IQC': "text-blue-600",
    'SQC_MAT': "text-teal-600",
    'SQC_VT': "text-teal-600",
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
    'DEFECTS': "text-orange-600",
    'SUPPLIERS': "text-blue-600"
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
      const allowedModules = ALL_MODULES.filter(m => m.group === groupKey && hasAccess(m.id));
      if (allowedModules.length === 0) return null;

      return (
        <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
    <div className="h-full overflow-y-auto no-scrollbar p-4 md:p-8 animate-fade-in bg-slate-50">
      <div className="space-y-8 max-w-7xl mx-auto pb-4">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-visible">
          <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
              <div className="relative" ref={menuRef}>
                  <div 
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="relative group cursor-pointer z-10"
                  >
                      <div className={`absolute -inset-1.5 bg-blue-500/10 rounded-full blur transition-all ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}></div>
                      <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full border-4 shadow-xl overflow-hidden transition-all active:scale-95 ${isMenuOpen ? 'border-blue-500' : 'border-white'}`}>
                          <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover bg-slate-100" />
                          <div className="absolute bottom-0 right-0 left-0 bg-black/40 backdrop-blur-sm h-6 flex items-center justify-center">
                              <ChevronDown className={`w-3 h-3 text-white transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`} />
                          </div>
                      </div>
                  </div>

                  {isMenuOpen && (
                      <div className="absolute left-1/2 sm:left-0 -translate-x-1/2 sm:translate-x-0 mt-4 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-[100] animate-in zoom-in slide-in-from-top-2 duration-200 origin-top">
                          <div className="px-6 py-5 border-b border-slate-50 mb-2">
                              <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Online</span>
                              </div>
                              <p className="font-bold text-slate-800 text-lg truncate leading-tight">{currentUser.name}</p>
                              <p className="text-xs text-blue-600 font-medium mt-1 uppercase">{currentUser.msnv || 'NHÂN VIÊN HỆ THỐNG'}</p>
                          </div>
                          
                          <div className="px-2 space-y-1">
                              <button 
                                  onClick={() => { if(onOpenProfile) onOpenProfile(); else onOpenSettings(); setIsMenuOpen(false); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-all group"
                              >
                                  <UserCircle className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
                                  <div className="text-left">
                                      <span className="block font-bold text-sm">Tài khoản</span>
                                      <span className="block text-xs text-slate-400">Thông tin cá nhân</span>
                                  </div>
                              </button>

                              <button 
                                  onClick={() => { onOpenSettings(); setIsMenuOpen(false); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-all group"
                              >
                                  <Settings className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
                                  <div className="text-left">
                                      <span className="block font-bold text-sm">Cài đặt</span>
                                      <span className="block text-xs text-slate-400">Thiết lập hệ thống</span>
                                  </div>
                              </button>
                              
                              <div className="h-px bg-slate-50 my-1 mx-2"></div>

                              <button 
                                  onClick={onLogout}
                                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-all group"
                              >
                                  <LogOut className="w-5 h-5" />
                                  <div className="text-left">
                                      <span className="block font-bold text-sm">Đăng xuất</span>
                                  </div>
                              </button>
                          </div>
                      </div>
                  )}
              </div>

              <div className="text-center sm:text-left overflow-hidden">
                  <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
                      <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Home</h1>
                      <div className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase flex items-center gap-1">
                          PRO
                      </div>
                  </div>
                  <div className="space-y-0.5">
                      <p className="text-slate-500 font-medium text-base">
                          Chào mừng trở lại, <span className="text-slate-800 font-bold">{currentUser.name}</span>
                      </p>
                      <p className="text-slate-400 text-xs font-medium">Hệ thống quản lý chất lượng toàn diện.</p>
                  </div>
              </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
               <button className="relative p-3 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-blue-600 hover:border-blue-200 hover:shadow-md transition-all active:scale-95 group">
                  <Bell className="w-6 h-6" />
                  <span className="absolute top-2.5 right-3 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
               </button>
          </div>
        </div>

        <div className="space-y-10 px-1">
            <div className="w-full">
               {renderSection("Công cụ AI & Tiện ích", "TOOLS")}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               <div className="space-y-10">
                  {renderSection("Kiểm soát chất lượng (QC)", "QC")}
                  {renderSection("Dịch vụ OEM", "OEM")}
               </div>
               <div className="space-y-10">
                  {renderSection("Đảm bảo chất lượng (QA)", "QA")}
                  {renderSection("Quản lý dự án", "PM")}
               </div>
            </div>
        </div>
      </div>
    </div>
  );
};