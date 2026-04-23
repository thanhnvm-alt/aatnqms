import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, Building2, ChevronDown, Download, Upload } from 'lucide-react';
import { IPODetail } from './IPODetail';
import { IPOItem, User } from '../types';
import { exportIpoData, importIpoFile } from '../services/apiService';

export const IPOPage = ({ user }: { user: User }) => {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterFactoryOrder, setFilterFactoryOrder] = useState('');
  const [filterMaTender, setFilterMaTender] = useState('');

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportIpoData({
        factoryOrder: filterFactoryOrder,
        maTender: filterMaTender
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Lỗi khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    try {
      setLoading(true);
      const result = await importIpoFile(file);
      alert(`Đã nhập thành công ${result.count} kế hoạch. Có ${result.errors?.length || 0} lỗi.`);
      window.location.reload();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Lỗi khi nhập file Excel');
    } finally {
      setLoading(false);
    }
  };
  const limit = 50;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedIpo, setSelectedIpo] = useState<IPOItem | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('page', page.toString());
        params.append('limit', limit.toString());
        if (filterFactoryOrder) params.append('factoryOrder', filterFactoryOrder);
        if (filterMaTender) params.append('maTender', filterMaTender);
        
        const response = await fetch(`/api/ipo?${params.toString()}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch IPO data: ${response.status} ${errorText}`);
        }
        const result = await response.json();
        setData(result.items || []);
        setTotal(result.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchData();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [filterFactoryOrder, filterMaTender, page]);

  const groupedItems = useMemo(() => {
      const groups: Record<string, any[]> = {};
      data.forEach(item => {
          const key = item.Project_name || "DỰ ÁN KHÁC";
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
      });
      return groups;
  }, [data]);

  const toggleGroup = (key: string) => {
      setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
      });
  };

  const handleItemClick = (item: any) => {
      // Map IPO item to IPOItem
      const ipoItem: IPOItem = {
          id: item.id || item.ID,
          ma_nha_may: item.ID_Factory_Order || '',
          ma_ct: item.Ma_Tender || '',
          ten_ct: item.Project_name || '',
          ten_hang_muc: item.Material_description || '',
          so_luong_ipo: item.Quantity_IPO || 0,
          dvt: item.Base_Unit || '',
          drawing_url: item.drawing_url,
          description: item.description,
          materials_text: item.materials_text,
          samples_json: item.samples_json,
          simulations_json: item.simulations_json,
      };
      setSelectedIpo(ipoItem);
  };

  if (selectedIpo) {
      return (
          <IPODetail 
            item={selectedIpo}
            onBack={() => setSelectedIpo(null)}
            onCreateInspection={() => {}}
            onViewInspection={() => {}}
            onUpdatePlan={async () => {}}
          />
      );
  }

  if (loading && data.length === 0) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /></div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans">
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-20 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col gap-3">
                <div className="relative w-full flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Filter ID_Factory_Order..." 
                        className="w-full pl-4 pr-4 h-11 bg-[#f1f5f9] border border-slate-200 rounded-full text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                        value={filterFactoryOrder}
                        onChange={(e) => setFilterFactoryOrder(e.target.value)}
                    />
                    <input 
                        type="text" 
                        placeholder="Filter Ma_Tender..." 
                        className="w-full pl-4 pr-4 h-11 bg-[#f1f5f9] border border-slate-200 rounded-full text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                        value={filterMaTender}
                        onChange={(e) => setFilterMaTender(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center justify-between px-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        TỔNG CỘNG: {total} KẾ HOẠCH
                    </p>
                    {user?.role !== 'QC' && (
                        <div className="flex gap-2">
                           <button 
                                onClick={handleExport}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-500/30 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Xuất Excel
                            </button>
                            <input 
                                type="file" 
                                id="ipo-import" 
                                className="hidden" 
                                onChange={handleImport}
                                accept=".xlsx, .xls"
                            />
                            <label 
                                htmlFor="ipo-import"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-500/30 active:scale-95 transition-all cursor-pointer"
                            >
                                <Upload className="w-4 h-4" />
                                Nhập Excel
                            </label>
                        </div>
                    )}
                </div>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-24">
            <div className="max-w-7xl mx-auto space-y-3">
                {Object.keys(groupedItems).sort().map((groupKey) => {
                    const groupItems = groupedItems[groupKey];
                    const isExpanded = expandedGroups.has(groupKey);

                    return (
                        <div key={groupKey} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all">
                            <div onClick={() => toggleGroup(groupKey)} className={`p-4 cursor-pointer flex items-center justify-between ${isExpanded ? 'bg-blue-50/40 border-b border-blue-100' : 'bg-white hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className={`p-2.5 rounded-xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}><Building2 className="w-4.5 h-4.5" /></div>
                                    <h3 className="font-black text-[11px] uppercase truncate text-slate-800 tracking-tight">{groupKey}</h3>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                            </div>
                            {isExpanded && (
                                <div className="p-2.5 space-y-2 bg-slate-50/30 animate-in slide-in-from-top-1">
                                    {groupItems.map((item, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={() => handleItemClick(item)}
                                            className="bg-white p-4 rounded-[1.25rem] border border-slate-200 shadow-sm flex flex-col gap-3 cursor-pointer hover:border-blue-300 transition-all"
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-lg border border-slate-200 uppercase font-mono">#{item.ID_Factory_Order || 'N/A'}</span>
                                            </div>
                                            <h4 className="text-[12px] font-black text-slate-800 uppercase leading-tight">{item.Material_description}</h4>
                                            <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">SL: {item.Quantity_IPO} {item.Base_Unit}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* PAGINATION */}
                {total > limit && (
                    <div className="flex items-center justify-between px-4 py-8 border-t border-slate-100">
                        <button 
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(page - 1)}
                            className="px-6 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 active:scale-95 transition-all shadow-sm"
                        >
                            Trang trước
                        </button>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trang {page}</span>
                            <span className="text-[8px] font-bold text-slate-300 uppercase">Hiển thị {data.length} / {total}</span>
                        </div>
                        <button 
                            disabled={page * limit >= total || loading}
                            onClick={() => setPage(page + 1)}
                            className="px-6 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 active:scale-95 transition-all shadow-sm"
                        >
                            Trang sau
                        </button>
                    </div>
                )}
            </div>
      </div>
    </div>
  );
};
