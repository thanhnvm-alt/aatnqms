
import React, { useState, useEffect } from 'react';
import { IPO } from '../types';
import { Search, RefreshCw, Database, AlertCircle } from 'lucide-react';
import { IpoTable } from './IpoTable';

interface IpoListProps {
  ipos: IPO[]; // Still accepts prop data if passed from parent, but handles own fetching now
  onSelect: (id: string) => void;
  isLoading?: boolean;
  onSearch?: (term: string) => void;
  onRefresh?: () => void;
}

export const IpoList: React.FC<IpoListProps> = ({ 
  onSelect
}) => {
  const [data, setData] = useState<any[]>([]);
  const [schema, setSchema] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverSearch, setServerSearch] = useState('');

  // Fetch both Schema and Data
  const fetchData = async (searchQuery: string = '') => {
    setLoading(true);
    setError(null);
    try {
        // 1. Fetch Schema (Structure)
        const schemaRes = await fetch('/api/ipos/schema');
        const schemaJson = await schemaRes.json();
        
        if (!schemaJson.success) throw new Error(schemaJson.error?.message || 'Failed to load schema');
        setSchema(schemaJson.data || []);

        // 2. Fetch Data (Content)
        const queryParams = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
        const dataRes = await fetch(`/api/ipos${queryParams}`);
        const dataJson = await dataRes.json();

        if (!dataJson.success) throw new Error(dataJson.message || 'Failed to load data');
        setData(dataJson.data.items || []);

    } catch (e: any) {
        console.error("IPO Load Error:", e);
        setError(e.message);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleServerSearch = (e: React.FormEvent) => {
      e.preventDefault();
      fetchData(serverSearch);
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x">
      {/* HEADER TOOLBAR */}
      <div className="shrink-0 bg-white px-6 py-4 border-b border-slate-200 z-30 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                  <Database className="w-5 h-5" />
              </div>
              <div>
                  <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">Danh sách IPO</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      Live Database Connection
                  </p>
              </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
              <form onSubmit={handleServerSearch} className="relative flex-1 md:w-80 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Tìm trên máy chủ (Enter)..." 
                    value={serverSearch}
                    onChange={(e) => setServerSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                  />
              </form>
              
              <button 
                onClick={() => fetchData(serverSearch)} 
                className="p-2.5 rounded-xl border bg-white text-slate-500 border-slate-200 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 shadow-sm"
                title="Làm mới dữ liệu"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
          </div>
      </div>

      {/* ERROR STATE */}
      {error && (
          <div className="px-6 pt-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
                  <button onClick={() => fetchData(serverSearch)} className="ml-auto text-[10px] underline font-bold">Thử lại</button>
              </div>
          </div>
      )}

      {/* DYNAMIC TABLE CONTENT */}
      <div className="flex-1 overflow-hidden p-3 md:p-6">
        <div className="max-w-[120rem] mx-auto h-full flex flex-col">
            <IpoTable 
                data={data} 
                schema={schema}
                isLoading={loading} 
                onRowClick={(row) => onSelect(row.id)} // Pass ID to parent if needed
            />
        </div>
      </div>
    </div>
  );
};
