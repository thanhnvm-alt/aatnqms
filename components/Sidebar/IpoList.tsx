
import React from 'react';
import { Search, RefreshCw, FolderOpen, AlertCircle, Database } from 'lucide-react';
import { useIpoList } from '../../hooks/useIpoList';
import { IpoItem } from './IpoItem';
import { SidebarStyles } from './styles';
import { IpoEntity } from '../../types/ipo.types';

interface IpoListSidebarProps {
  onSelect: (ipo: IpoEntity) => void;
  selectedId?: string;
}

export const IpoListSidebar: React.FC<IpoListSidebarProps> = ({ onSelect, selectedId }) => {
  const { ipos, isLoading, error, searchTerm, setSearchTerm, refresh } = useIpoList();

  return (
    <div className={SidebarStyles.container}>
      <div className={SidebarStyles.header}>
        <div className="flex justify-between items-center">
          <h3 className={SidebarStyles.title}>
            <Database className="w-4 h-4 text-blue-600" />
            DANH SÁCH IPO
          </h3>
          <button 
            onClick={() => refresh()} 
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-all active:scale-90"
            title="Làm mới"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className={SidebarStyles.searchContainer}>
          <Search className={SidebarStyles.searchIcon} />
          <input 
            type="text" 
            placeholder="Tìm theo Mã CT, Tên SP..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={SidebarStyles.searchInput}
          />
        </div>
      </div>

      <div className={SidebarStyles.listContainer}>
        {error && (
          <div className={SidebarStyles.errorState}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4" />
              <span>Lỗi tải dữ liệu</span>
            </div>
            <p className="text-[10px] font-normal opacity-80">{error}</p>
            <button onClick={() => refresh()} className="mt-2 text-[10px] underline hover:text-red-700">Thử lại</button>
          </div>
        )}

        {!isLoading && !error && ipos.length === 0 && (
          <div className={SidebarStyles.emptyState}>
            <FolderOpen className="w-10 h-10 opacity-20" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Không tìm thấy IPO</p>
          </div>
        )}

        {ipos.map((ipo) => (
          <IpoItem 
            key={ipo.id} 
            ipo={ipo} 
            isActive={ipo.id === selectedId}
            onClick={onSelect}
          />
        ))}

        {isLoading && ipos.length > 0 && (
           <div className="py-2 text-center text-[9px] text-slate-400 font-bold uppercase animate-pulse">Đang cập nhật...</div>
        )}
        
        {isLoading && ipos.length === 0 && (
           <div className="space-y-3 p-2">
              {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
              ))}
           </div>
        )}
      </div>
      
      <div className="p-3 border-t border-slate-100 bg-white text-[9px] font-bold text-slate-400 uppercase text-center tracking-widest">
        Total Records: {ipos.length}
      </div>
    </div>
  );
};
