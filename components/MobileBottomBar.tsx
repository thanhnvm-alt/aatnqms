import React, { useState } from 'react';
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
  Trash2,
  MoreHorizontal,
  X
} from 'lucide-react';

interface MobileBottomBarProps {
  view: ViewState;
  onNavigate: (view: ViewState) => void;
  user: User | null;
  rolesList?: Role[];
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ view, onNavigate, user, rolesList = [] }) => {
  const [showMore, setShowMore] = useState(false);

  // Guard Clause
  if (!user) return null;

  // Render tabs dynamically matching Sidebar permissions
  const allTabs = [
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

  const MAX_VISIBLE_TABS = 5;
  const needsMoreTab = allTabs.length > MAX_VISIBLE_TABS;
  
  const visibleTabs = needsMoreTab ? allTabs.slice(0, 4) : allTabs;
  const moreTabs = needsMoreTab ? allTabs.slice(4) : [];

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around items-center h-[60px] px-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = view === tab.id || (moreTabs.some(t => t.id === view) && needsMoreTab === false); // if it was in moretabs it would be false anyway
            
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id as ViewState)}
                className="flex flex-col items-center justify-center min-w-[56px] flex-1 h-full relative group active:bg-slate-100 dark:active:bg-slate-800 transition-colors py-1 shrink-0"
              >
                <div className={`p-1 rounded-xl transition-all duration-300 ${
                  view === tab.id 
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80' 
                  : 'text-slate-400 dark:text-slate-500 group-active:scale-95'
                }`}>
                  <Icon className={`w-5 h-5 ${view === tab.id ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
                </div>
                <span className={`text-[9px] font-black mt-0.5 transition-colors tracking-tight ${
                  view === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {tab.label}
                </span>
                
                {view === tab.id && (
                  <div className="absolute top-0 left-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-b-full shadow-[0_2px_8px_rgba(37,99,235,0.4)]"></div>
                )}
              </button>
            );
          })}

          {needsMoreTab && (
            <button
              onClick={() => setShowMore(true)}
              className="flex flex-col items-center justify-center min-w-[56px] flex-1 h-full relative group active:bg-slate-100 dark:active:bg-slate-800 transition-colors py-1 shrink-0"
            >
              <div className={`p-1 rounded-xl transition-all duration-300 ${
                showMore || moreTabs.some(t => t.id === view)
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80' 
                : 'text-slate-400 dark:text-slate-500 group-active:scale-95'
              }`}>
                <MoreHorizontal className={`w-5 h-5 ${showMore || moreTabs.some(t => t.id === view) ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
              </div>
              <span className={`text-[9px] font-black mt-0.5 transition-colors tracking-tight ${
                showMore || moreTabs.some(t => t.id === view) ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                Thêm
              </span>
              
              {moreTabs.some(t => t.id === view) && !showMore && (
                <div className="absolute top-0 left-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-b-full shadow-[0_2px_8px_rgba(37,99,235,0.4)]"></div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* More Menu Modal */}
      {showMore && (
        <div className="lg:hidden fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm animate-fade-in flex flex-col justify-end" onClick={() => setShowMore(false)}>
          <div 
            className="bg-white dark:bg-slate-900 rounded-t-3xl shadow-xl animate-slide-up pb-[env(safe-area-inset-bottom)] max-h-[85vh] overflow-hidden flex flex-col pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Menu Mở Rộng</h3>
              <button 
                onClick={() => setShowMore(false)}
                className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 grid grid-cols-4 gap-3 overflow-y-auto no-scrollbar">
              {moreTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = view === tab.id;
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                        onNavigate(tab.id as ViewState);
                        setShowMore(false);
                    }}
                    className={`flex flex-col items-center justify-start gap-2 p-2 rounded-2xl transition-all ${
                        isActive 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-transparent' 
                        : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className={`p-3 rounded-2xl transition-all ${
                        isActive 
                        ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-sm border border-blue-100 dark:border-blue-900/50' 
                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700'
                    }`}>
                      <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
                    </div>
                    <span className={`text-[10px] font-bold tracking-tight text-center leading-tight ${
                        isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
                    }`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
