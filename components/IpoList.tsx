
import React, { useState } from 'react';
import { IPO } from '../types';
import { 
  Search, RefreshCw
} from 'lucide-react';
import { IpoTable } from './IpoTable';

interface IpoListProps {
  ipos: IPO[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  onSearch?: (term: string) => void;
  onRefresh?: () => void;
}

export const IpoList: React.FC<IpoListProps> = ({ 
  ipos, onSelect, isLoading = false, onSearch, onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (onSearch) {
      onSearch(e.target.value);
    }
  };

  const handleRowClick = (row: any) => {
      // Assuming 'id' is always present or fallback to row content if needed
      if (row.id) onSelect(row.id);
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x">
      {/* HEADER TOOLBAR */}
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-30 shadow-sm">
          <div className="max-w-[100rem] mx-auto flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:max-w-md group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    type="text" placeholder="Tìm kiếm dữ liệu toàn hệ thống..." 
                    value={searchTerm}
                    onChange={handleSearch}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  />
              </div>
              
              <div className="flex items-center gap-2 w-full md:w-auto">
                  {onRefresh && (
                    <button 
                        onClick={onRefresh} 
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white text-slate-500 border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 shadow-sm"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Làm mới</span>
                    </button>
                  )}
              </div>
          </div>
      </div>

      {/* DYNAMIC TABLE CONTENT */}
      <div className="flex-1 overflow-hidden p-3 md:p-4">
        <div className="max-w-[100rem] mx-auto h-full flex flex-col">
            <IpoTable 
                data={ipos} 
                isLoading={isLoading} 
                onRefresh={onRefresh || (() => {})} 
                onRowClick={handleRowClick}
            />
        </div>
      </div>
    </div>
  );
};
