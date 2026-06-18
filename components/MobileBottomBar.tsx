import React from 'react';
import { ViewState, User, Role, ModuleId, hasPermission } from '../types';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  List, 
  AlertTriangle, 
  Settings,
  Briefcase,
  Truck,
  BookOpen,
  Package,
  Wrench,
  Trash2
} from 'lucide-react';

interface MobileBottomBarProps {
  view: ViewState;
  onNavigate: (view: ViewState) => void;
  user: User | null;
  rolesList?: Role[];
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ view, onNavigate, user, rolesList = [] }) => {
  // Guard Clause
  if (!user) return null;

  // Render tabs dynamically matching Sidebar permissions
  const tabs = [
    { id: 'DASHBOARD', label: 'Báo Cáo', icon: LayoutDashboard },
    { id: 'PROJECTS', label: 'Dự Án', icon: Briefcase },
    { id: 'SUPPLIERS', label: 'Cơ Sở', icon: Truck },
    { id: 'LIST', label: 'Phiếu', icon: List },
    { id: 'NCR_LIST', label: 'NCR', icon: AlertTriangle },
    { id: 'DEFECT_LIBRARY', label: 'Lỗi', icon: BookOpen },
    { id: 'MATERIALS', label: 'Vật Liệu', icon: Package },
    { id: 'TOOLS', label: 'CCDC', icon: Wrench },
    { id: 'IPO', label: 'IPO', icon: FileSpreadsheet },
    { id: 'SETTINGS', label: 'Cài Đặt', icon: Settings },
    { id: 'TRASH', label: 'Thùng Rác', icon: Trash2 },
  ].filter(tab => {
    return hasPermission(user, rolesList, tab.id as ModuleId, 'VIEW');
  });

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-[60px] overflow-x-auto no-scrollbar px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = view === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id as ViewState)}
              className="flex flex-col items-center justify-center min-w-[56px] flex-1 h-full relative group active:bg-slate-100 dark:active:bg-slate-800 transition-colors py-1 shrink-0"
            >
              <div className={`p-1 rounded-xl transition-all duration-300 ${
                isActive 
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80' 
                : 'text-slate-400 dark:text-slate-500 group-active:scale-95'
              }`}>
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
              </div>
              <span className={`text-[9px] font-black mt-0.5 transition-colors tracking-tight ${
                isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {tab.label}
              </span>
              
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-b-full shadow-[0_2px_8px_rgba(37,99,235,0.4)]"></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
