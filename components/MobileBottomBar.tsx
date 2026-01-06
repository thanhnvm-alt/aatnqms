
import React from 'react';
import { ViewState, User } from '../types';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  List, 
  AlertTriangle, 
  Settings,
  Briefcase
} from 'lucide-react';

interface MobileBottomBarProps {
  view: ViewState;
  onNavigate: (view: ViewState) => void;
  user: User;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ view, onNavigate, user }) => {
  // Lọc và sắp xếp các tab quan trọng nhất cho mobile (tối đa 5 tab)
  const isQC = user.role === 'QC';
  
  const tabs = [
    { id: 'DASHBOARD', label: 'Home', icon: LayoutDashboard },
    { id: isQC ? 'LIST' : 'PROJECTS', label: isQC ? 'Phiếu' : 'Dự án', icon: isQC ? List : Briefcase },
    { id: isQC ? 'NCR_LIST' : 'PLAN', label: isQC ? 'Lỗi' : 'Kế hoạch', icon: isQC ? AlertTriangle : FileSpreadsheet },
    { id: isQC ? 'SETTINGS' : 'LIST', label: isQC ? 'Cài đặt' : 'Phiếu', icon: isQC ? Settings : List },
    { id: isQC ? '' : 'NCR_LIST', label: 'NCR', icon: AlertTriangle },
  ].filter(tab => tab.id !== '');

  // Nếu là manager/admin thì lấy 5 tab đầu, nếu là QC thì lấy 4 tab
  const visibleTabs = tabs.slice(0, 5);

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = view === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id as ViewState)}
              className="flex flex-col items-center justify-center flex-1 h-full relative group"
            >
              <div className={`p-1.5 rounded-xl transition-all duration-300 ${
                isActive 
                ? 'text-blue-600 scale-110' 
                : 'text-slate-400 active:scale-90'
              }`}>
                <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
              </div>
              <span className={`text-[9px] font-black uppercase tracking-tighter transition-colors ${
                isActive ? 'text-blue-600' : 'text-slate-400'
              }`}>
                {tab.label}
              </span>
              
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-b-full shadow-[0_2px_10px_rgba(37,99,235,0.4)]"></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
