import { getProxyImageUrl } from '../src/utils';

import React from 'react';
import { ViewState, User, Role, ModuleId, hasPermission } from '../types';
import { 
  Briefcase, 
  FileSpreadsheet, 
  List, 
  LayoutDashboard, 
  Settings, 
  LogOut,
  PanelLeftClose,
  PanelLeft,
  AlertTriangle,
  BookOpen,
  Truck,
  Factory,
  Package,
  Trash2,
  Wrench
} from 'lucide-react';

interface SidebarProps {
  view: ViewState;
  currentModule?: string;
  onNavigate: (id: string) => void;
  user: User | null;
  onLogout: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  rolesList?: Role[];
}

export const Sidebar: React.FC<SidebarProps> = ({ view, currentModule, onNavigate, user, onLogout, collapsed, setCollapsed, rolesList = [] }) => {
  if (!user) return null;

  const menuItems = [
    { id: 'DASHBOARD', label: 'Báo Cáo Tổng Hợp', icon: LayoutDashboard },
    { id: 'PROJECTS', label: 'Quản Lý Dự Án', icon: Briefcase },
    { id: 'SUPPLIERS', label: 'Nhà Cung Cấp', icon: Truck },
    { id: 'LIST', label: 'Danh Sách Phiếu', icon: List },
    { id: 'NCR_LIST', label: 'Danh Sách NCR', icon: AlertTriangle },
    { id: 'DEFECT_LIBRARY', label: 'Thư Viện Lỗi', icon: BookOpen },
    { id: 'MATERIALS', label: 'Quản Lý Vật Liệu', icon: Package },
    { id: 'TOOLS', label: 'Quản Lý CCDC', icon: Wrench },
    { id: 'IPO', label: 'IPO Data', icon: FileSpreadsheet },
    { id: 'SETTINGS', label: 'Cài Đặt', icon: Settings },
    { id: 'TRASH', label: 'Thùng Rác', icon: Trash2 },
  ].filter(item => {
    return hasPermission(user, rolesList, item.id as ModuleId, 'VIEW');
  });

  const isMenuItemActive = (itemId: string) => {
      if (itemId === 'PQC_MODE') return view === 'LIST' && currentModule === 'PQC';
      if (itemId === 'LIST') return view === 'LIST' && currentModule !== 'PQC';
      if (itemId === 'SUPPLIERS') return view === 'SUPPLIERS' || view === 'SUPPLIER_DETAIL';
      if (itemId === 'SETTINGS') return view === 'SETTINGS';
      if (itemId === 'DEFECT_LIBRARY') return view === 'DEFECT_LIBRARY' || view === 'DEFECT_DETAIL';
      if (itemId === 'MATERIALS') return view === 'MATERIALS';
      return view === itemId;
  };

  return (
    <aside className={`bg-[#0f172a] text-slate-400 dark:text-slate-500 flex flex-col h-full transition-all duration-300 border-r border-slate-800 relative ${collapsed ? 'w-20' : 'w-56'}`}>
      <div className="px-2 py-4 flex items-center justify-center h-24 relative">
        {!collapsed && (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center p-1.5 shadow-md shrink-0">
                <img 
                  src={getProxyImageUrl("https://lh3.googleusercontent.com/d/1bDMxj465lBlBF0IJY7R-93MxkulDeMND")} 
                  alt="Logo" 
                  className="w-full h-full object-contain" 
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="font-bold text-white text-sm tracking-tight leading-none mb-1">Quality System</span>
                <span className="text-slate-300 text-[10px] font-bold uppercase tracking-wider leading-none">AA Corporation</span>
              </div>
            </div>
            <button onClick={() => setCollapsed(true)} className="absolute right-2 p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-300">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center p-1.5 shadow-md flex-shrink-0 mx-auto">
              <img 
                src={getProxyImageUrl("https://lh3.googleusercontent.com/d/1bDMxj465lBlBF0IJY7R-93MxkulDeMND")} 
                alt="Logo" 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer"
              />
            </div>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setCollapsed(false)} className="p-3 mx-auto mb-6 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-300">
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

      <nav className="flex-1 px-3 space-y-1.5 mt-2 overflow-y-auto no-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = isMenuItemActive(item.id);
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative font-medium text-[14px] ${
                isActive 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'hover:bg-slate-800 hover:text-slate-200 text-slate-400 dark:text-slate-500'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500 group-hover:text-blue-400 transition-colors'}`} />
              {!collapsed && <span className="tracking-tight truncate whitespace-nowrap">{item.label}</span>}
              {collapsed && isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white dark:bg-slate-900 rounded-r-full"></div>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800 space-y-2">
        <div className={`flex items-center gap-3 p-2 rounded-xl bg-slate-800/50 border border-slate-800 ${collapsed ? 'justify-center p-0 bg-transparent border-0' : ''}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-700 shrink-0">
                <img src={getProxyImageUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            {!collapsed && (
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-white truncate">{user.name}</p>
                    <p className="text-[10px] font-medium text-blue-400">{user.role}</p>
                </div>
            )}
        </div>
        
        <button 
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-500/10 text-slate-400 dark:text-slate-500 hover:text-red-400 transition-all group ${collapsed ? 'justify-center' : ''}`}
        >
            <LogOut className="w-5 h-5 shrink-0 group-hover:stroke-red-400" />
            {!collapsed && <span className="text-[14px] font-medium whitespace-nowrap">Đăng xuất</span>}
        </button>
      </div>
    </aside>
  );
};
