
import React, { useState, useEffect, useMemo } from 'react';
import { NCR, User } from '../types';
import { fetchNcrs, fetchNcrById, deleteNcr } from '../services/apiService';
import { 
    AlertTriangle, Search, Clock, CheckCircle2, 
    ArrowRight, Loader2, Calendar, User as UserIcon, 
    FileText, ChevronRight, ShieldAlert,
    Hash, AlertCircle, Maximize2, Upload, Download, Trash2, AlertTriangle,
    Filter, ChevronDown, Layers, X, ChevronUp
} from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';
import { NCRDetail } from './NCRDetail';
import { exportNcrs, importNcrsFile } from '../services/apiService';

interface NCRListProps {
  currentUser: User;
  onSelectNcr: (inspectionId: string) => void;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ label, value, options, onChange, placeholder = '- TẤT CẢ -', className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`space-y-1 relative ${className}`} ref={containerRef}>
      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-all border-slate-200 h-[38px]"
      >
        <span className={`truncate ${value && value !== 'ALL' ? 'text-slate-900' : 'text-slate-400'}`}>
          {value && value !== 'ALL' ? value : placeholder}
        </span>
        <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[100] max-h-64 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input 
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nhanh..."
                className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-100"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 no-scrollbar p-1">
            <div 
              onClick={(e) => { e.stopPropagation(); onChange('ALL'); setIsOpen(false); setSearch(''); }}
              className={`p-2 text-[10px] font-black uppercase rounded-lg cursor-pointer hover:bg-blue-50 transition-all mb-1 ${!value || value === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
            >
              - TẤT CẢ -
            </div>
            <div className="h-px bg-slate-100 mb-1" />
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt}
                  onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); setSearch(''); }}
                  className={`p-2 text-[10px] font-black uppercase rounded-lg cursor-pointer hover:bg-blue-50 transition-all ${value === opt ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
                >
                  {opt}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[9px] font-bold text-slate-400 uppercase">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const NCRList: React.FC<NCRListProps> = ({ currentUser, onSelectNcr }) => {
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [qcFilter, setQcFilter] = useState('ALL');
  const [workshopFilter, setWorkshopFilter] = useState('ALL');
  const [selectedNcr, setSelectedNcr] = useState<NCR | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const limit = 50000;

  const toggleGroup = (key: string) => {
      setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
      });
  }

  useEffect(() => {
    loadNcrs(page);
  }, [statusFilter, page]);

  const loadNcrs = async (p: number = 1) => {
    setIsLoading(true);
    try {
        const result = await fetchNcrs({ status: statusFilter }, p, limit);
        setNcrs(result.items || []);
        setTotal(result.total || 0);
        setPage(p);
    } catch (e) {
        console.error("Load NCRs failed:", e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSelectNcrItem = async (ncrId: string) => {
    setIsDetailLoading(true);
    try {
        const fullNcr = await fetchNcrById(ncrId);
        if (fullNcr) {
            setSelectedNcr(fullNcr);
        } else {
            alert("Không tìm thấy thông tin chi tiết lỗi.");
        }
    } catch (error) {
        console.error("Load NCR detail failed:", error);
        alert("Lỗi khi tải chi tiết NCR.");
    } finally {
        setIsDetailLoading(false);
    }
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNcrs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNcrs.map(n => n.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.size} phiếu NCR đã chọn?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteNcr(id)));
      setSelectedIds(new Set());
      loadNcrs(page);
      alert('Đã xóa thành công các phiếu NCR đã chọn.');
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Lỗi khi xóa hàng loạt: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const filterOptions = useMemo(() => {
    const qcs = new Set<string>();
    const workshops = new Set<string>();
    const projects = new Set<string>();
    
    ncrs.forEach(n => {
      if (n.inspectorName) qcs.add(n.inspectorName);
      if (n.workshop) workshops.add(n.workshop);
      if (n.ma_ct) projects.add(n.ma_ct);
    });

    return {
      qcs: Array.from(qcs).sort(),
      workshops: Array.from(workshops).sort(),
      projects: Array.from(projects).sort()
    };
  }, [ncrs]);

  const filteredNcrs = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return ncrs.filter(n => {
        const matchesSearch = String(n.id || '').toLowerCase().includes(term) || 
            String(n.issueDescription || '').toLowerCase().includes(term) ||
            (n.responsiblePerson && String(n.responsiblePerson).toLowerCase().includes(term)) ||
            String(n.inspection_id || '').toLowerCase().includes(term) ||
            String(n.defect_code || '').toLowerCase().includes(term);
        
        const matchesQC = qcFilter === 'ALL' || n.inspectorName === qcFilter;
        const matchesWorkshop = workshopFilter === 'ALL' || n.workshop === workshopFilter;
        const matchesStatus = statusFilter === 'ALL' || n.status === statusFilter;
        const matchesProject = projectFilter === 'ALL' || n.ma_ct === projectFilter;
        
        const ncrDate = n.createdDate ? n.createdDate.split('T')[0] : '';
        const matchesDate = (!startDate || ncrDate >= startDate) && (!endDate || ncrDate <= endDate);

        return matchesSearch && matchesQC && matchesWorkshop && matchesStatus && matchesProject && matchesDate;
    });
  }, [ncrs, searchTerm, qcFilter, workshopFilter, statusFilter, projectFilter, startDate, endDate]);

  const getSeverityStyle = (severity: string) => {
    switch (severity?.toUpperCase()) {
        case 'CRITICAL': return 'bg-red-600 text-white border-red-700';
        case 'MAJOR': return 'bg-orange-100 text-orange-700 border-orange-200';
        case 'MINOR': return 'bg-blue-50 text-blue-700 border-blue-100';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'CLOSED': return 'bg-green-50 text-green-700 border-green-200';
        case 'IN_PROGRESS': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'OPEN': return 'bg-red-50 text-red-700 border-red-200';
        default: return 'bg-orange-50 text-orange-700 border-orange-200';
    }
  };

  const groupedNcrs = useMemo(() => {
    const groups: { [dateKey: string]: { [projectKey: string]: NCR[] } } = {};
    
    filteredNcrs.forEach(ncr => {
        const dateKey = ncr.createdDate ? ncr.createdDate.split('T')[0] : '---';
        const projectKey = ncr.ma_ct || '---';
        
        if(!groups[dateKey]) groups[dateKey] = {};
        if(!groups[dateKey][projectKey]) groups[dateKey][projectKey] = [];
        groups[dateKey][projectKey].push(ncr);
    });

    return groups;
  }, [filteredNcrs]);

  if (selectedNcr) {
      return (
          <NCRDetail 
            ncr={selectedNcr} 
            user={currentUser} 
            onBack={() => setSelectedNcr(null)} 
            onViewInspection={onSelectNcr}
            onUpdate={loadNcrs}
          />
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Detail Loader Overlay */}
      {isDetailLoading && (
        <div className="absolute inset-0 z-[200] bg-slate-900/20 backdrop-blur-[2px] flex flex-col items-center justify-center">
            <div className="bg-white p-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Đang tải chi tiết...</p>
            </div>
        </div>
      )}

      {/* Compact Toolbar */}
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
              {currentUser.role === 'ADMIN' && (
                <button 
                  onClick={toggleSelectAll}
                  className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
                >
                  {selectedIds.size === ncrs.length && ncrs.length > 0 ? <CheckCircle2 className="w-5 h-5 text-blue-600" /> : <Layers className="w-5 h-5" />}
                </button>
              )}
              <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                  <input 
                    type="text" placeholder="Tìm theo mã, lỗi, người phụ trách..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
              </div>

              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                className={`p-2.5 rounded-xl border transition-all active:scale-95 relative ${isFilterOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'}`}
              >
                <Filter className="w-5 h-5" />
              </button>
              
              {isFilterOpen && (
                  <div className="absolute top-16 right-4 w-[320px] bg-white rounded-2xl p-4 border border-slate-200 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-bold text-slate-800">Bộ lọc chi tiết</span>
                        <button onClick={() => setIsFilterOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="space-y-3">
                        <SearchableSelect label="TRẠNG THÁI" value={statusFilter} options={['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED']} onChange={val => setStatusFilter(val as any)} />
                        <SearchableSelect label="MÃ DỰ ÁN" value={projectFilter} options={filterOptions.projects} onChange={val => setProjectFilter(val)} />
                        <SearchableSelect label="QC KIỂM TRA" value={qcFilter} options={filterOptions.qcs} onChange={val => setQcFilter(val)} />
                        <SearchableSelect label="XƯỞNG SẢN XUẤT" value={workshopFilter} options={filterOptions.workshops} onChange={val => setWorkshopFilter(val)} />
                        <DateRangePicker label="KHOẢNG NGÀY" startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
                        <button onClick={() => { setQcFilter('ALL'); setWorkshopFilter('ALL'); setStatusFilter('ALL'); setProjectFilter('ALL'); setSearchTerm(''); setStartDate(''); setEndDate(''); setIsFilterOpen(false); }} className="w-full p-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold uppercase hover:bg-blue-100 transition-colors border border-blue-200">XÓA BỘ LỌC</button>
                      </div>
                  </div>
              )}

              {currentUser.role !== 'QC' && (
                <div className="flex items-center gap-1.5">
                  <button onClick={exportNcrs} title="Xuất Excel" className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95"><Download className="w-5 h-5" /></button>
                  <input type="file" id="ncr-import" className="hidden" onChange={async (e) => { if (e.target.files && e.target.files[0]) { await importNcrsFile(e.target.files[0]); loadNcrs(); } }} />
                  <label htmlFor="ncr-import" title="Nhập Excel" className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"><Upload className="w-5 h-5" /></label>
                </div>
              )}
          </div>
      </div>

      {/* Bulk Action Bar */}
      {currentUser.role === 'ADMIN' && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10">
          <span className="text-xs font-black uppercase tracking-widest">Đã chọn {selectedIds.size} phiếu</span>
          <button 
            onClick={handleBulkDelete}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Xóa hàng loạt
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                  <p className="font-black uppercase tracking-widest text-[9px]">Đang tải danh sách NCR...</p>
              </div>
          ) : Object.keys(groupedNcrs).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300 space-y-4">
                  <div className="p-12 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 shadow-inner flex flex-col items-center">
                      <CheckCircle2 className="w-16 h-16 opacity-10 mb-4" />
                      <p className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Không có bản ghi NCR nào</p>
                  </div>
              </div>
          ) : (
                <div className="max-w-7xl mx-auto pb-20 space-y-4">
                  {Object.keys(groupedNcrs).sort((a, b) => b.localeCompare(a)).map(dateKey => {
                      const dateGroup = groupedNcrs[dateKey];
                      const isDateExpanded = expandedGroups.has(dateKey);
                      return (
                          <div key={dateKey} className="mb-4">
                              <div 
                                  onClick={() => toggleGroup(dateKey)}
                                  className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors rounded-xl mb-2"
                              >
                                  <div className="flex items-center gap-2.5">
                                      <Calendar className="w-4 h-4 text-blue-500" />
                                      <h2 className="font-bold text-slate-800 text-[13px] tracking-tight">{dateKey}</h2>
                                      <span className="ml-2 bg-blue-100/80 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                          {Object.values(dateGroup).reduce((acc, ncrs) => acc + ncrs.length, 0)}
                                      </span>
                                  </div>
                                  {isDateExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </div>
                              
                              {isDateExpanded && (
                                  <div className="space-y-4 pl-4 mt-2">
                                      {Object.keys(dateGroup).map(projectKey => {
                                          const ncrsUnderProject = dateGroup[projectKey];
                                          const groupKey = `${dateKey}|${projectKey}`;
                                          const isProjectExpanded = expandedGroups.has(groupKey);
                                          
                                          return (
                                              <div key={groupKey} className="space-y-2">
                                                  <div 
                                                      onClick={() => toggleGroup(groupKey)}
                                                      className="flex items-center justify-between p-2 rounded-lg cursor-pointer bg-slate-50 border border-slate-100"
                                                  >
                                                      <h3 className="font-black text-slate-500 text-[10px] uppercase tracking-widest ml-2">Dự án: {projectKey} ({ncrsUnderProject.length})</h3>
                                                      {isProjectExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                  </div>
                                                  
                                                  {isProjectExpanded && (
                                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-4">
                                                          {ncrsUnderProject.map((ncr) => (
                                                              <div 
                                                                  key={ncr.id} 
                                                                  onClick={() => handleSelectNcrItem(ncr.id)}
                                                                  className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-all hover:shadow-md hover:border-blue-300 group"
                                                              >
                                                                  <div className="p-3 flex-1 space-y-3">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-all">
                                                                                <AlertTriangle className="w-4 h-4" />
                                                                            </div>
                                                                            <div>
                                                                                <span className="font-black text-slate-900 text-xs tracking-tight block uppercase">{ncr.ma_ct || '---'} - {ncr.ten_ct || '---'}</span>
                                                                                <span className="text-[9px] font-bold text-slate-400 font-mono tracking-tighter uppercase">{ncr.id_factory_order || '---'} - {ncr.ten_hang_muc || '---'}</span>
                                                                            </div>
                                                                        </div>
                                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${getSeverityStyle(ncr.severity || 'MINOR')}`}>
                                                                            {ncr.severity || 'MINOR'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col space-y-1">
                                                                        <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                                                                            <span className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">{ncr.workshop || '---'}</span>
                                                                            <span>•</span>
                                                                            <span className="truncate">{ncr.inspection_id || '---'}</span>
                                                                            <span>•</span>
                                                                            <span className="truncate">{ncr.inspectorName || '---'}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                                        <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic line-clamp-3">
                                                                            "{ncr.issueDescription}"
                                                                        </p>
                                                                    </div>
                                                                 </div>
                                                                 <div className={`px-4 py-3 border-t flex items-center justify-between transition-colors ${ncr.status === 'CLOSED' ? 'bg-green-50/50 border-green-100' : 'bg-slate-50/50 border-slate-100'}`}>
                                                                     <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${getStatusStyle(ncr.status)}`}>
                                                                         {ncr.status}
                                                                     </span>
                                                                     <div className="flex items-center gap-1.5 text-blue-600 text-[10px] font-black uppercase tracking-tighter hover:underline">
                                                                         CHI TIẾT <ChevronRight className="w-3.5 h-3.5" />
                                                                     </div>
                                                                 </div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                      );
                  })}
                </div>
          )}
      </div>

      {/* Pagination Summary Footer */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] hidden md:flex">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              HIỂN THỊ {filteredNcrs.length} BẢN GHI NCR
          </p>
          <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></div>
                  <span className="text-slate-500">MỚI: {ncrs.filter(n => n.status !== 'CLOSED').length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-slate-500">ĐÃ ĐÓNG: {ncrs.filter(n => n.status === 'CLOSED').length}</span>
              </div>
          </div>
      </div>
    </div>
  );
};
