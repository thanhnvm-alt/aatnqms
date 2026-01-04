
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
  PanelLeft
} from 'lucide-react';

interface SidebarProps {
  view: ViewState;
  onNavigate: (view: ViewState) => void;
  user: User;
  onLogout: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ view, onNavigate, user, onLogout, collapsed, setCollapsed }) => {
  // Lọc menu dựa trên vai trò QC
  const menuItems = [
    { id: 'PROJECTS', label: 'QUẢN LÝ DỰ ÁN', icon: Briefcase },
    { id: 'PLAN', label: 'KẾ HOẠCH', icon: FileSpreadsheet },
    { id: 'LIST', label: 'DANH SÁCH', icon: List },
    { id: 'DASHBOARD', label: 'BÁO CÁO', icon: LayoutDashboard },
    { id: 'SETTINGS', label: 'CÀI ĐẶT', icon: Settings },
  ].filter(item => {
    if (user.role === 'QC') {
      // QC chỉ được thấy Danh sách và Cài đặt
      return item.id === 'LIST' || item.id === 'SETTINGS';
    }
    return true;
  });

  return (
    <aside className={`bg-[#0f172a] text-slate-400 flex flex-col h-full transition-all duration-300 border-r border-slate-800 ${collapsed ? 'w-20' : 'w-64'}`}>
      {/* Logo Area */}
      <div className="p-6 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">AA</span>
            </div>
            <span className="font-black text-white tracking-tighter text-xl">AATN QC</span>
          </div>
        )}
        {collapsed && (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto">
              <span className="text-white font-black text-[10px]">AA</span>
            </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-slate-800 rounded-md transition-colors">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setCollapsed(false)} className="p-4 mx-auto mb-4 hover:bg-slate-800 rounded-md transition-colors">
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id || (item.id === 'SETTINGS' && view === 'SETTINGS');
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as ViewState)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all group relative ${
                isActive 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'group-hover:text-blue-400 transition-colors'}`} />
              {!collapsed && <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>}
              {collapsed && isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full"></div>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Area */}
      <div className="p-4 border-t border-slate-800 space-y-4">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'px-2'}`}>
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-700 shrink-0">
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            </div>
            {!collapsed && (
                <div className="min-w-0">
                    <p className="text-xs font-black text-white uppercase truncate">{user.name}</p>
                    <p className="text-[10px] font-bold text-blue-500 uppercase">{user.role}</p>
                </div>
            )}
        </div>
        
        <button 
            onClick={onLogout}
            className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all ${collapsed ? 'justify-center' : ''}`}
        >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="text-xs font-black uppercase tracking-widest">Đăng xuất</span>}
        </button>
      </div>
    </aside>
  );
};
