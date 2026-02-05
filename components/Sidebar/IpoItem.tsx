
import React from 'react';
import { IpoEntity } from '../../types/ipo.types';
import { SidebarStyles } from './styles';
import { ChevronRight, Calendar, Package } from 'lucide-react';

interface IpoItemProps {
  ipo: IpoEntity;
  isActive?: boolean;
  onClick: (ipo: IpoEntity) => void;
}

export const IpoItem: React.FC<IpoItemProps> = ({ ipo, isActive, onClick }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-700 border-green-200';
      case 'FLAGGED': return 'bg-red-100 text-red-700 border-red-200';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div 
      onClick={() => onClick(ipo)}
      className={`${SidebarStyles.itemCard} ${isActive ? SidebarStyles.itemActive : SidebarStyles.itemInactive}`}
    >
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
      
      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{ipo.ma_nha_may || 'N/A'}</span>
          <h4 className="text-xs font-black text-slate-800 uppercase line-clamp-1 group-hover:text-blue-700 transition-colors">
            {ipo.ten_hang_muc}
          </h4>
        </div>
        <span className={`${SidebarStyles.statusBadge} ${getStatusColor(ipo.status)}`}>
          {ipo.status || 'PENDING'}
        </span>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
            <Package className="w-3 h-3 text-slate-400" />
            <span>{ipo.so_luong_ipo} {ipo.dvt}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(ipo.created_at)}</span>
          </div>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 transition-all ${isActive ? 'text-blue-600' : 'text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5'}`} />
      </div>
    </div>
  );
};
