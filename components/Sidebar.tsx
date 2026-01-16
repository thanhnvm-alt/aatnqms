import React from 'react';
import { ViewState, User } from '../types';
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
  Factory
} from 'lucide-react';

interface SidebarProps {
  view: ViewState;
  currentModule?: string;
  onNavigate: (id: string) => void;
  user: User | null;
  onLogout: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ view, currentModule, onNavigate, user, onLogout, collapsed, setCollapsed }) => {
  // Guard Clause for null user
  if (!user) return null;

  // Lọc menu dựa trên vai trò QC
  const menuItems = [
    { id: 'DASHBOARD', label: 'Báo Cáo Tổng Hợp', icon: LayoutDashboard },
    { id: 'PROJECTS', label: 'Quản Lý Dự Án', icon: Briefcase },
    { id: 'PLAN', label: 'Kế Hoạch', icon: FileSpreadsheet },
    { id: 'LIST', label: 'Danh Sách Phiếu', icon: List },
    { id: 'NCR_LIST', label: 'Danh Sách NCR', icon: AlertTriangle },
    { id: 'DEFECT_LIBRARY', label: 'Thư Viện Lỗi', icon: BookOpen },
    { id: 'SETTINGS', label: 'Cài Đặt', icon: Settings },
  ].filter(item => {
    // Logic phân quyền đơn giản
    if (user.role === 'QC') {
      return ['LIST', 'NCR_LIST', 'DEFECT_LIBRARY', 'SETTINGS'].includes(item.id);
    }
    return true;
  });

  const isMenuItemActive = (itemId: string) => {
      if (itemId === 'PQC_MODE') {
          return view === 'LIST' && currentModule === 'PQC';
      }
      if (itemId === 'LIST') {
          return view === 'LIST' && currentModule !== 'PQC';
      }
      if (itemId === 'SETTINGS') return view === 'SETTINGS';
      if (itemId === 'DEFECT_LIBRARY') return view === 'DEFECT_LIBRARY' || view === 'DEFECT_DETAIL';
      return view === itemId;
  };

  return (
    <aside className={`bg-[#0f172a] text-slate-400 flex flex-col h-full transition-all duration-300 border-r border-slate-800 ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className="p-6 flex items-center justify-between h-20">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-bold text-white text-lg tracking-tight">AATN QC</span>
          </div>
        )}
        {collapsed && (
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-lg">
              <span className="text-white font-bold text-xs">AA</span>
            </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-slate-300">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setCollapsed(false)} className="p-3 mx-auto mb-6 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-slate-300">
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

      <nav className="flex-1 px-4 space-y-1.5 mt-2 overflow-y-auto no-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = isMenuItemActive(item.id);
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all group relative font-medium text-sm ${
                isActive 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'hover:bg-slate-800 hover:text-slate-200 text-slate-400'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-blue-400 transition-colors'}`} />
              {!collapsed && <span className="tracking-tight">{item.label}</span>}
              {collapsed && isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></div>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2">
        <div className={`flex items-center gap-3 p-2 rounded-xl bg-slate-800/50 border border-slate-800 ${collapsed ? 'justify-center p-0 bg-transparent border-0' : ''}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-700 shrink-0">
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            </div>
            {!collapsed && (
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{user.name}</p>
                    <p className="text-xs font-medium text-blue-400">{user.role}</p>
                </div>
            )}
        </div>
        
        <button 
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all group ${collapsed ? 'justify-center' : ''}`}
        >
            <LogOut className="w-5 h-5 shrink-0 group-hover:stroke-red-400" />
            {!collapsed && <span className="text-sm font-medium">Đăng xuất</span>}
        </button>
      </div>
    </aside>
  );
};