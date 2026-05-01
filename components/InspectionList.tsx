
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId, User } from '../types';
import { exportInspections, deleteInspection, importInspectionsFile, fetchInspectionById } from '../services/apiService';
import { getProxyImageUrl } from '../src/utils';
import { formatDisplayDate } from '../lib/utils';
import { DateRangePicker } from './DateRangePicker';
import { 
  Search, RefreshCw, FolderOpen, Clock, Upload,
  Loader2, X, ChevronDown, ChevronRight, ChevronLeft, Maximize2,
  Filter, Building2, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid, CheckSquare,
  ClipboardList, AlertTriangle, Info, User as UserIcon, CheckCircle, Image as ImageIcon,
  CalendarDays, ArrowRight, Check, FileText, Download, Trash2, Edit, Eye
} from 'lucide-react';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  workshops?: Workshop[];
  onRefresh?: () => void;
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  user: User;
}

const MODULE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    'IQC': { label: 'IQC', color: 'text-blue-600', bg: 'bg-blue-50', icon: PackageCheck },
    'PQC': { label: 'PQC', color: 'text-purple-600', bg: 'bg-purple-50', icon: Factory },
    'SQC_MAT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_VT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_BTP': { label: 'SQC-BTP', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },
    'FQC': { label: 'FQC', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: ShieldCheck },
    'SITE': { label: 'SITE', color: 'text-amber-600', bg: 'bg-amber-50', icon: MapPin },
    'SPR': { label: 'SPR', color: 'text-slate-600', bg: 'bg-slate-50', icon: Filter },
    'STEP': { label: 'STEP', color: 'text-rose-600', bg: 'bg-rose-50', icon: SlidersHorizontal },
    'FSR': { label: 'FSR', color: 'text-orange-600', bg: 'bg-orange-50', icon: FolderOpen }
};

interface SearchableSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps & { optionLabels?: Record<string, string> }> = ({ label, values, options, onChange, placeholder = '- TẤT CẢ -', className, optionLabels }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const getLabel = (opt: string) => optionLabels?.[opt] || opt;

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase()) || 
      getLabel(opt).toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search, optionLabels]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (opt: string) => {
    if (values.includes(opt)) {
      onChange(values.filter(v => v !== opt));
    } else {
      onChange([...values, opt]);
    }
  };

  const displayValue = values.length > 0 ? (values.length === 1 ? getLabel(values[0]) : `${values.length} mục đã chọn`) : placeholder;

  return (
    <div className={`space-y-1 relative ${className}`} ref={containerRef}>
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-all h-[38px]"
      >
        <span className={`truncate ${values.length > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
          {displayValue}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[100] max-h-64 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input 
                   autoFocus
                   type="text"
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   placeholder="Tìm nhanh..."
                   className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100"
                   onClick={(e) => e.stopPropagation()}
                 />
              </div>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 no-scrollbar p-1">
            <div 
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className={`px-3 py-2 text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-50 transition-all mb-1 ${values.length === 0 ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
            >
              - TẤT CẢ -
            </div>
            <div className="h-px bg-slate-100 mb-1 mx-2" />
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt}
                  onClick={(e) => { e.stopPropagation(); handleToggle(opt); }}
                  className={`px-3 py-2 text-sm font-medium flex items-center justify-between rounded-lg cursor-pointer hover:bg-blue-50 transition-all ${values.includes(opt) ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}
                >
                  <span className="truncate">{getLabel(opt)}</span>
                  {values.includes(opt) && <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs font-medium text-slate-400">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, isLoading, workshops = [], onRefresh, total = 0, page = 1, onPageChange, user
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [selectedDateDesktop, setSelectedDateDesktop] = useState<string>('ALL');
  const [selectedProjectDesktop, setSelectedProjectDesktop] = useState<string>('ALL');
  const [selectedItemDesktop, setSelectedItemDesktop] = useState<Inspection | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

  const [colSizes, setColSizes] = useState([260, 260, 280, 500]);

  const startDrag = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const initialWidths = [...colSizes];
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setColSizes(prev => {
        const next = [...prev];
        next[index] = Math.max(100, initialWidths[index] + delta);
        return next;
      });
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleCommitSearch = () => {
    setSearchTerm(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set([new Date().getFullYear().toString()]));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2, '0')}`]));
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  
  const handleSelectItemDesktop = async (item: Inspection) => {
      setSelectedItemDesktop(item); // Optimistic UI
      setIsLoadingDetail(true);
      try {
          const detailedItem = await fetchInspectionById(item.id);
          setSelectedItemDesktop(detailedItem);
      } catch (err) {
          console.error("Failed to fetch item details:", err);
      } finally {
          setIsLoadingDetail(false);
      }
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectAll = () => {
    if (selectedIds.size === inspections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inspections.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectDateGroup = (e: React.MouseEvent, dateKey: string) => {
    e.stopPropagation();
    const dateGroup = groupedData[dateKey];
    let allItemsInGroup: string[] = [];
    Object.values(dateGroup).forEach(project => {
        allItemsInGroup = allItemsInGroup.concat(project.items.map(item => item.id));
    });
    
    // Check if all are currently selected
    const areAllSelected = allItemsInGroup.every(id => selectedIds.has(id));
    
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (areAllSelected) {
            // Deselect all in group
            allItemsInGroup.forEach(id => next.delete(id));
        } else {
            // Select all in group
            allItemsInGroup.forEach(id => next.add(id));
        }
        return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.size} phiếu đã chọn?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteInspection(id)));
      setSelectedIds(new Set());
      if (onRefresh) onRefresh();
      alert('Đã xóa thành công các phiếu đã chọn.');
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Lỗi khi xóa hàng loạt: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const [filterQC, setFilterQC] = useState<string[]>([]);
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterOptions = useMemo(() => ({
      inspectors: Array.from(new Set(inspections.map(i => i.inspectorName).filter((s): s is string => !!s))).sort(),
      workshops: Array.from(new Set(inspections.map(i => i.workshop).filter((s): s is string => !!s))).sort(),
      projects: Array.from(new Set(inspections.map(i => i.ma_ct).filter((s): s is string => !!s))).sort(),
      types: Array.from(new Set(inspections.map(i => String(i.type)).filter((s): s is string => !!s && s !== 'undefined'))).sort(),
      statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.COMPLETED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
  }), [inspections]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterProject.length > 0 || filterStatus.length > 0 || filterType.length > 0 || startDate !== '' || endDate !== '';

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const filters = {
        qc: filterQC.join(','),
        workshop: filterWorkshop.join(','),
        project: filterProject.join(','),
        status: filterStatus.join(','),
        type: filterType.join(','),
        search: searchTerm,
        startDate,
        endDate
      };
      await exportInspections(filters);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Lỗi khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importInspectionsFile(file);
      alert(`Nhập thành công ${result.count} phiếu kiểm tra`);
      if (onRefresh) onRefresh();
      if (onPageChange && page !== 1) onPageChange(1);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Lỗi khi nhập file Excel');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const groupedData = useMemo(() => {
    const groups: Record<string, Record<string, { 
        projectName: string, 
        items: Inspection[]
    }>> = {};

    const filtered = (inspections || []).filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term || 
               item.ma_ct?.toLowerCase().includes(term) ||
               item.ten_ct?.toLowerCase().includes(term) ||
               item.ten_hang_muc?.toLowerCase().includes(term) ||
               item.ma_nha_may?.toLowerCase().includes(term);
        if (!matchesSearch) return false;
        if (filterQC.length > 0 && !filterQC.includes(item.inspectorName || '')) return false;
        if (filterWorkshop.length > 0 && !filterWorkshop.includes(item.workshop || '')) return false;
        if (filterProject.length > 0 && !filterProject.includes(item.ma_ct || '')) return false;
        if (filterStatus.length > 0 && !filterStatus.includes(item.status)) return false;
        // Improved type filtering
        if (filterType.length > 0) {
            const itemType = String(item.type);
            // Special handling for SQC modules which might have overlapping labels
            if (!filterType.includes(itemType)) {
               return false;
            }
        }
        
        // Robust date filtering
        if (startDate || endDate) {
            let itemDateStr = String(item.date);
            let d: Date | null = null;

            if (/^\d{2}\/\d{2}\/\d{4}/.test(itemDateStr)) {
                const [day, month, year] = itemDateStr.substring(0, 10).split('/');
                d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
            } else if (/^\d{10}$/.test(itemDateStr)) {
                d = new Date(parseInt(itemDateStr, 10) * 1000);
            } else {
                d = new Date(itemDateStr);
            }

            if (d && !isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const normalizedItemDate = `${yyyy}-${mm}-${dd}`;

                if (startDate && normalizedItemDate < startDate) return false;
                if (endDate && normalizedItemDate > endDate) return false;
            } else {
                // If we can't parse the date, and a range is set, we skip this item
                return false;
            }
        }

        return true;
    });

    filtered.forEach(item => {
        const dateKey = formatDisplayDate(item.date) || 'KHÔNG RÕ NGÀY';
        const pKey = (item.type === 'IQC' || item.type === 'SQC_VT') 
            ? (item.materials?.[0]?.projectCode || item.ma_ct || 'DÙNG CHUNG') 
            : (item.ma_ct || 'DÙNG CHUNG');
        
        if (!groups[dateKey]) {
            groups[dateKey] = {};
        }

        if (!groups[dateKey][pKey]) {
            const projectName = (item.type === 'IQC' || item.type === 'SQC_VT')
                ? (item.materials?.[0]?.projectName || item.ten_ct || (pKey === 'DÙNG CHUNG' ? 'DANH MỤC DÙNG CHUNG' : 'DỰ ÁN KHÁC'))
                : (item.ten_ct || (pKey === 'DÙNG CHUNG' ? 'DANH MỤC DÙNG CHUNG' : 'DỰ ÁN KHÁC'));
            
            groups[dateKey][pKey] = { 
                projectName,
                items: [] 
            };
        }
        groups[dateKey][pKey].items.push(item);
    });

    return groups;
  }, [inspections, searchTerm, filterQC, filterWorkshop, filterProject, filterStatus, filterType, startDate, endDate]);

  const toggleDate = (dateKey: string) => {
    setExpandedDates(prev => {
        const next = new Set(prev);
        if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey);
        return next;
    });
  };

  const toggleProject = (dateKey: string, pKey: string) => {
    const key = `${dateKey}_${pKey}`;
    setExpandedProjects(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
  };

  const sortedDatesList = useMemo(() => {
    return Object.keys(groupedData).sort((a, b) => {
        if (a === 'KHÔNG RÕ NGÀY') return 1;
        if (b === 'KHÔNG RÕ NGÀY') return -1;
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        const dateA = new Date(`${ya}-${ma}-${da}`);
        const dateB = new Date(`${yb}-${mb}-${db}`);
        return dateB.getTime() - dateA.getTime();
    });
  }, [groupedData]);

  // Handle desktop side effects when data changes
  useEffect(() => {
      // Auto-select date if current is empty or not in list, and wait, if 'ALL' is valid we keep it.
      if (selectedDateDesktop !== 'ALL' && !sortedDatesList.includes(selectedDateDesktop)) {
          setSelectedDateDesktop('ALL');
          setSelectedProjectDesktop('ALL');
          setSelectedItemDesktop(null);
      }
  }, [sortedDatesList, selectedDateDesktop]);

  const desktopProjects = useMemo(() => {
      if (selectedDateDesktop === 'ALL') {
          const allProjects = new Set<string>();
          Object.values(groupedData).forEach(dateGroup => {
              Object.keys(dateGroup).forEach(pKey => allProjects.add(pKey));
          });
          return Array.from(allProjects).sort();
      }
      return Object.keys(groupedData[selectedDateDesktop] || {}).sort();
  }, [groupedData, selectedDateDesktop]);

  const nestedDatesTree = useMemo(() => {
    const tree: { year: string, count: number, months: { month: string, count: number, dates: { dateKey: string, count: number }[] }[] }[] = [];
    
    const dateCounts: Record<string, number> = {};
    sortedDatesList.forEach(d => {
        dateCounts[d] = Object.values(groupedData[d] || {}).reduce((acc, p) => acc + p.items.length, 0);
    });

    const yearMap: Record<string, any> = {};
    const noDateDates: { dateKey: string, count: number }[] = [];

    sortedDatesList.forEach(d => {
        if (d === 'KHÔNG RÕ NGÀY') {
            noDateDates.push({ dateKey: d, count: dateCounts[d] });
            return;
        }
        const [day, month, year] = d.split('/');
        if (!yearMap[year]) yearMap[year] = { count: 0, monthMap: {} };
        yearMap[year].count += dateCounts[d];
        
        if (!yearMap[year].monthMap[month]) yearMap[year].monthMap[month] = { count: 0, dates: [] };
        yearMap[year].monthMap[month].count += dateCounts[d];
        yearMap[year].monthMap[month].dates.push({ dateKey: d, count: dateCounts[d] });
    });

    const sortedYears = Object.keys(yearMap).sort((a,b) => Number(b) - Number(a));
    sortedYears.forEach(y => {
        const sortedMonths = Object.keys(yearMap[y].monthMap).sort((a,b) => Number(b) - Number(a));
        const months = sortedMonths.map(m => ({
            month: m,
            count: yearMap[y].monthMap[m].count,
            dates: yearMap[y].monthMap[m].dates
        }));
        tree.push({ year: y, count: yearMap[y].count, months });
    });

    return { tree, noDateDates };
  }, [sortedDatesList, groupedData]);

  const desktopItems = useMemo(() => {
      let items: Inspection[] = [];
      const datesToProcess = selectedDateDesktop === 'ALL' ? sortedDatesList : [selectedDateDesktop];
      
      datesToProcess.forEach(d => {
          const dGroup = groupedData[d];
          if (!dGroup) return;
          const projectsToProcess = selectedProjectDesktop === 'ALL' ? Object.keys(dGroup) : [selectedProjectDesktop];
          projectsToProcess.forEach(p => {
              if (dGroup[p]) {
                  items = items.concat(dGroup[p].items);
              }
          });
      });
      return items;
  }, [groupedData, selectedDateDesktop, selectedProjectDesktop, sortedDatesList]);

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* BULK ACTION BAR */}
      {user.role === 'ADMIN' && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 bg-white border border-slate-200 p-4 rounded-2xl shadow-xl flex items-center justify-between z-50 animate-in slide-in-from-bottom-10">
          <span className="text-xs font-black text-slate-800 uppercase">Đã chọn {selectedIds.size} phiếu</span>
          <button 
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase hover:bg-red-700 transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" /> Xóa hàng loạt
          </button>
        </div>
      )}

      {/* COMPACT TOOLBAR */}
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
              {user.role === 'ADMIN' && (
                <button 
                  onClick={toggleSelectAll}
                  className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
                >
                  {selectedIds.size === inspections.length && inspections.length > 0 ? <CheckCircle2 className="w-5 h-5 text-blue-600" /> : <LayoutGrid className="w-5 h-5" />}
                </button>
              )}
              <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                  <input 
                    type="text" placeholder="Tìm Dự án, Sản phẩm..." 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onBlur={handleCommitSearch}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
              </div>
              
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                className={`p-2.5 rounded-xl border transition-all active:scale-95 relative ${isFilterOpen || isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'}`}
              >
                <Filter className="w-5 h-5" />
                {isFilterActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
              </button>

              {isFilterOpen && (
                  <div className="absolute top-16 right-4 w-[320px] bg-white rounded-2xl p-4 border border-slate-200 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-bold text-slate-800">Bộ lọc</span>
                        <button onClick={() => setIsFilterOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="space-y-3">
                          <SearchableSelect 
                            label="LOẠI PHIẾU" 
                            values={filterType} 
                            options={filterOptions.types} 
                            onChange={vals => setFilterType(vals)} 
                            optionLabels={Object.fromEntries(Object.entries(MODULE_CONFIG).map(([k, v]) => [k, v.label]))}
                          />
                          <SearchableSelect 
                            label="TRẠNG THÁI" 
                            values={filterStatus} 
                            options={filterOptions.statuses} 
                            onChange={vals => setFilterStatus(vals)} 
                          />
                          <SearchableSelect 
                            label="QC KIỂM TRA" 
                            values={filterQC} 
                            options={filterOptions.inspectors} 
                            onChange={vals => setFilterQC(vals)} 
                          />
                          <SearchableSelect 
                            label="XƯỞNG SẢN XUẤT" 
                            values={filterWorkshop} 
                            options={filterOptions.workshops} 
                            onChange={vals => setFilterWorkshop(vals)} 
                          />
                          <SearchableSelect 
                            label="MÃ DỰ ÁN" 
                            values={filterProject} 
                            options={filterOptions.projects} 
                            onChange={vals => setFilterProject(vals)}
                          />
                          <DateRangePicker 
                            label="KHOẢNG NGÀY"
                            startDate={startDate}
                            endDate={endDate}
                            onStartDateChange={setStartDate}
                            onEndDateChange={setEndDate}
                          />
                          <button onClick={() => { setFilterType([]); setFilterQC([]); setFilterWorkshop([]); setFilterProject([]); setFilterStatus([]); setSearchTerm(''); setStartDate(''); setEndDate(''); setIsFilterOpen(false); }} className="w-full p-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold uppercase hover:bg-blue-100 transition-colors border border-blue-200">XÓA BỘ LỌC</button>
                      </div>
                  </div>
              )}

              {user.role !== 'QC' && (
                <div className="flex items-center gap-1.5">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".xlsx, .xls" 
                    className="hidden" 
                  />
                  <button 
                    onClick={handleImportClick}
                    disabled={isImporting}
                    title="Nhập Excel"
                    className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    title="Xuất Excel"
                    className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  </button>
                </div>
              )}
          </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row pb-[80px] lg:pb-0">
        
        {/* MOBILE VIEW */}
        <div className="md:hidden flex-1 overflow-y-auto p-3 no-scrollbar">
            <div className="space-y-2">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                        <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
                    </div>
                ) : Object.keys(groupedData).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                        <FolderOpen className="w-16 h-16 opacity-10 mb-2" />
                        <p className="font-black uppercase tracking-widest text-[10px]">Không tìm thấy dữ liệu</p>
                    </div>
                ) : (
                    sortedDatesList.map(dateKey => {
                    const dateGroup = groupedData[dateKey];
                    const isDateExpanded = expandedDates.has(dateKey) || searchTerm.length > 0;
                    return (
                        <div key={dateKey} className="space-y-3 mb-3">
                            <div 
                                onClick={() => toggleDate(dateKey)}
                                className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors rounded-xl"
                            >
                                <div className="flex items-center gap-2.5">
                                    {user.role === 'ADMIN' && (
                                        <div 
                                            onClick={(e) => toggleSelectDateGroup(e, dateKey)}
                                            className="cursor-pointer mr-1 flex items-center"
                                        >
                                            {(() => {
                                                const totalItems = Object.values(dateGroup).reduce((acc, project) => acc + project.items.length, 0);
                                                const selectedItemsInGroup = Object.values(dateGroup).reduce((acc, project) => acc + project.items.filter(item => selectedIds.has(item.id)).length, 0);
                                                return (
                                                    <input 
                                                        type="checkbox"
                                                        readOnly
                                                        checked={selectedItemsInGroup > 0}
                                                        ref={(input) => {
                                                            if (input) {
                                                                input.indeterminate = selectedItemsInGroup > 0 && selectedItemsInGroup < totalItems;
                                                            }
                                                        }}
                                                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                                                    />
                                                );
                                            })()}
                                        </div>
                                    )}
                                    <CalendarDays className="w-5 h-5 text-blue-500" />
                                    <h2 className="font-bold text-slate-800 text-[15px] tracking-tight">{dateKey}</h2>
                                    <span className="ml-2 bg-blue-100/80 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                        {Object.values(dateGroup).reduce((acc, project) => acc + project.items.length, 0)} phiếu
                                    </span>
                                </div>
                                <ChevronDown className={`w-4 h-4 transition-transform ${isDateExpanded ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                            </div>
                            
                            {isDateExpanded && (
                                <div className="space-y-2 mt-2">
                                    {Object.keys(dateGroup).map(pKey => {
                                        const project = dateGroup[pKey];
                                        const expKey = `${dateKey}_${pKey}`;
                                        const isExpanded = searchTerm.length > 0 ? true : expandedProjects.has(expKey);
                                        
                                        return (
                                        <div key={expKey} className="space-y-1">
                                            {/* PROJECT HEADER */}
                                            <div 
                                                onClick={() => toggleProject(dateKey, pKey)}
                                                className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${isExpanded ? 'bg-blue-50 text-blue-900 border-blue-100 shadow-sm' : 'bg-white border border-slate-100 shadow-sm hover:border-blue-200'}`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`p-2 rounded-xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                                                        <Building2 className="w-4 h-4" />
                                                    </div>
                                                        <div className="flex flex-col">
                                                        <div className="flex items-center gap-2.5">
                                                            <h3 className="font-bold text-[13px] tracking-tight text-slate-800">{pKey}</h3>
                                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${isExpanded ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>{project.items.length} phiếu</span>
                                                        </div>
                                                        <p className={`text-[11px] font-medium tracking-tight ${isExpanded ? 'text-blue-500' : 'text-slate-400'}`}>{project.projectName}</p>
                                                    </div>
                                                </div>
                                                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                                            </div>

                                            {/* PROJECT ITEMS (TABLE VIEW & MOBILE CARDS) */}
                                            {isExpanded && (
                                                <div className="pl-2 pr-1 py-3 overflow-x-auto">
                                                    <div className="hidden md:block min-w-[600px] border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead>
                                                                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 tracking-tight">
                                                                    {user.role === 'ADMIN' && (
                                                                        <th className="p-3 w-10 text-center border-r border-slate-100">
                                                                            <CheckSquare className="w-4 h-4 mx-auto text-slate-300"/>
                                                                        </th>
                                                                    )}
                                                                    <th className="p-4 w-24 border-r border-slate-100">LOẠI</th>
                                                                    <th className="p-4 w-36 border-r border-slate-100">MÃ ĐỊNH DANH</th>
                                                                    <th className="p-4 border-r border-slate-100">HẠNG MỤC</th>
                                                                    <th className="p-4 w-36 border-r border-slate-100">QC KIỂM TRA</th>
                                                                    <th className="p-4 w-32 border-r border-slate-100">XƯỞNG/CĐ</th>
                                                                    <th className="p-4 w-32">TRẠNG THÁI</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {project.items.map((item, index) => {
                                                                    const cfg = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                                                    
                                                                    return (
                                                                        <tr 
                                                                            key={item.id} 
                                                                            className={`group hover:bg-blue-50/50 transition-colors cursor-pointer ${index < project.items.length - 1 ? 'border-b border-slate-100' : ''}`}
                                                                            onClick={() => onSelect(item.id)}
                                                                        >
                                                                            {user.role === 'ADMIN' && (
                                                                                <td className="p-3 text-center border-r border-slate-100" onClick={(e) => e.stopPropagation()}>
                                                                                    <input 
                                                                                        type="checkbox"
                                                                                        checked={selectedIds.has(item.id)}
                                                                                        onChange={() => toggleSelect(item.id)}
                                                                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                                    />
                                                                                </td>
                                                                            )}
                                                                            <td className="p-4 border-r border-slate-100">
                                                                                <div className="flex flex-col gap-1 inline-flex">
                                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cfg.bg} ${cfg.color} inline-block uppercase text-center border shadow-sm`}>{cfg.label}</span>
                                                                                    <span className="text-[9px] font-mono font-medium text-slate-400">
                                                                                        {
                                                                                            (item.type === 'PQC') ? (item.inspectionStage || `---`) :
                                                                                            (item.type === 'SQC_BTP' || item.type === 'IQC' || item.type === 'SQC_VT') ? (item.materials?.[0]?.category || item.ten_hang_muc || '---') :
                                                                                            `#${item.id.split('-').pop()}`
                                                                                        }
                                                                                    </span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-4 border-r border-slate-100 text-[13px] font-medium text-slate-700">
                                                                                {
                                                                                    (item.type === 'PQC') ? (item.ma_nha_may || item.headcode || '---') :
                                                                                    (item.type === 'IQC' || item.type === 'SQC_VT' || item.type === 'SQC_BTP') ? (item.po_number ? `PO: ${item.po_number}` : (item.ma_ct || item.ma_nha_may || '---')) :
                                                                                    (item.ma_nha_may || item.headcode || '---')
                                                                                }
                                                                            </td>
                                                                            <td className="p-4 border-r border-slate-100">
                                                                                <p className="text-[14px] font-medium text-slate-800 tracking-tight group-hover:text-blue-700 transition-colors">
                                                                                    {
                                                                                        (item.type === 'IQC' || item.type === 'SQC_VT') 
                                                                                            ? (item.materials?.[0]?.name || item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                                                            : (item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                                                    }
                                                                                </p>
                                                                            </td>
                                                                            <td className="p-4 border-r border-slate-100">
                                                                                <div className="flex items-center gap-2 whitespace-nowrap">
                                                                                    <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                                                                        <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                                                                                    </div>
                                                                                    <span className="text-[13px] font-medium text-slate-700 truncate">{item.inspectorName || '---'}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-4 border-r border-slate-100 text-[13px] font-medium text-slate-600">
                                                                                {item.workshop || '---'}
                                                                            </td>
                                                                            <td className="p-4">
                                                                                <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase border tracking-tight block text-center ${
                                                                                    item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' :
                                                                                    item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' :
                                                                                    'bg-slate-50 text-slate-500 border-slate-200'
                                                                                }`}>
                                                                                    {item.status}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile Card View */}
                                                    <div className="md:hidden space-y-3">
                                                        {project.items.map((item) => {
                                                            const cfg = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                                            return (
                                                                <div 
                                                                    key={item.id}
                                                                    onClick={() => onSelect(item.id)}
                                                                    className="bg-white border hover:border-blue-400 border-slate-200 rounded-2xl p-3 shadow-sm transition-all cursor-pointer active:scale-[0.98] group overflow-hidden relative"
                                                                >
                                                                    <div className="flex justify-between items-start gap-4 mb-2">
                                                                        <div className="flex flex-col gap-1.5 flex-1">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${cfg.bg} ${cfg.color} uppercase border shadow-sm`}>{cfg.label}</span>
                                                                                <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 rounded-md">
                                                                                    {
                                                                                        (item.type === 'PQC') ? (item.inspectionStage || `---`) :
                                                                                        (item.type === 'SQC_BTP' || item.type === 'IQC' || item.type === 'SQC_VT') ? (item.materials?.[0]?.category || item.ten_hang_muc || '---') :
                                                                                        `#${item.id.split('-').pop()}`
                                                                                    }
                                                                                </span>
                                                                            </div>
                                                                            <h4 className="text-[15px] font-bold text-slate-800 leading-snug group-hover:text-blue-700 transition-colors line-clamp-2">
                                                                                {
                                                                                    (item.type === 'IQC' || item.type === 'SQC_VT') 
                                                                                        ? (item.materials?.[0]?.name || item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                                                        : (item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                                                }
                                                                            </h4>
                                                                        </div>
                                                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                                                            <span className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                                                                                item.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                                                                item.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-700' :
                                                                                'bg-slate-100 text-slate-600'
                                                                            }`}>
                                                                                {item.status}
                                                                            </span>
                                                                            {user.role === 'ADMIN' && (
                                                                                 <div className="mt-1 p-2 -mr-2" onClick={(e) => e.stopPropagation()}>
                                                                                     <input 
                                                                                         type="checkbox"
                                                                                         checked={selectedIds.has(item.id)}
                                                                                         onChange={() => toggleSelect(item.id)}
                                                                                         className="w-5 h-5 rounded-md border-slate-300 text-blue-600 cursor-pointer"
                                                                                     />
                                                                                 </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="space-y-1 mb-4 hidden">
                                                                        {/* Kept empty to match previous structure slightly, but we merge title to top */}
                                                                    </div>

                                                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 bg-slate-50/50 -mx-3 -mb-3 px-3 pb-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                                                                                <UserIcon className="w-3 h-3 text-blue-600" />
                                                                            </div>
                                                                            <span className="text-[13px] font-semibold text-slate-700">{item.inspectorName || '---'}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-right">
                                                                            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                                                                                 {
                                                                                     (item.type === 'PQC') ? (item.ma_nha_may || item.headcode || '---') :
                                                                                     (item.type === 'IQC' || item.type === 'SQC_VT' || item.type === 'SQC_BTP') ? (item.po_number ? `PO: ${item.po_number}` : (item.ma_ct || item.ma_nha_may || '---')) :
                                                                                     (item.ma_nha_may || item.headcode || '---')
                                                                                 }
                                                                             </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {/* PAGINATION CONTROLS */}
            {total > 0 && (
                <div className="flex items-center justify-center px-2 py-6 border-t border-slate-100 mt-4">
                    <div className="flex flex-col items-center">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">Tổng {total} phiếu</span>
                    </div>
                </div>
            )}
        </div>
        </div>

        {/* DESKTOP 4-COLUMN VIEW */}
        <div className="hidden md:flex flex-1 h-full w-full bg-white divide-x divide-slate-200 overflow-x-auto overflow-y-hidden text-sm">
            
            {/* COLUMN 1: DATES */}
            <div className="flex flex-col shrink-0 bg-slate-50/50 relative" style={{ width: colSizes[0] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(0)}
                />
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
                    <h3 className="font-bold text-slate-700 tracking-tight text-xs uppercase">1. Ngày Tháng</h3>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                    <button 
                        onClick={() => { setSelectedDateDesktop('ALL'); setSelectedProjectDesktop('ALL'); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors mb-2 ${selectedDateDesktop === 'ALL' ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        Tất cả ngày ({inspections.length})
                    </button>
                    
                    {nestedDatesTree.tree.map(({ year, count, months }) => {
                        const isYearExpanded = expandedYears.has(year);
                        return (
                            <div key={year} className="mb-1 space-y-1">
                                <button 
                                    onClick={() => setExpandedYears(prev => {
                                        const next = new Set(prev);
                                        if (next.has(year)) next.delete(year); else next.add(year);
                                        return next;
                                    })}
                                    className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-[13px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
                                >
                                    <span>Năm {year}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-white px-2 py-0.5 rounded text-slate-600">{count}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isYearExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                
                                {isYearExpanded && months.map(({ month, count, dates }) => {
                                    const mKey = `${year}-${month}`;
                                    const isMonthExpanded = expandedMonths.has(mKey);
                                    return (
                                        <div key={mKey} className="ml-2 space-y-1 border-l-2 border-slate-100 pl-2">
                                            <button 
                                                onClick={() => setExpandedMonths(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(mKey)) next.delete(mKey); else next.add(mKey);
                                                    return next;
                                                })}
                                                className="w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                                            >
                                                <span>Tháng {month}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{count}</span>
                                                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isMonthExpanded ? 'rotate-180' : ''}`} />
                                                </div>
                                            </button>

                                            {isMonthExpanded && dates.map(({ dateKey, count: dCount }) => (
                                                <button 
                                                    key={dateKey}
                                                    onClick={() => { setSelectedDateDesktop(dateKey); setSelectedProjectDesktop('ALL'); }}
                                                    className={`w-full flex items-center justify-between text-left px-3 py-1.5 ml-2 rounded-lg text-[12px] font-medium transition-colors ${selectedDateDesktop === dateKey ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    <span><CalendarDays className="w-3 h-3 inline mr-1.5 text-slate-400"/> {dateKey}</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${selectedDateDesktop === dateKey ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{dCount}</span>
                                                        <ChevronRight className={`w-3 h-3 ${selectedDateDesktop === dateKey ? 'text-blue-500' : 'text-slate-300'}`} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}

                    {nestedDatesTree.noDateDates.map(({ dateKey, count }) => (
                        <button 
                            key={dateKey}
                            onClick={() => { setSelectedDateDesktop(dateKey); setSelectedProjectDesktop('ALL'); }}
                            className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${selectedDateDesktop === dateKey ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <span><CalendarDays className="w-3.5 h-3.5 inline mr-2 text-slate-400"/> {dateKey}</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${selectedDateDesktop === dateKey ? 'bg-white text-blue-600' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* COLUMN 2: PROJECTS */}
            <div className="flex flex-col shrink-0 bg-white relative" style={{ width: colSizes[1] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(1)}
                />
                <div className="px-4 py-3 border-b border-slate-200 shrink-0">
                    <h3 className="font-bold text-slate-700 tracking-tight text-xs uppercase">2. Công Trình / Dự Án</h3>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                    {selectedDateDesktop === 'ALL' ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-4 text-center">
                            <CalendarDays className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-[11px] font-medium">Vui lòng chọn <br/><strong>Ngày tháng</strong></p>
                        </div>
                    ) : (
                        <>
                            <button 
                                onClick={() => setSelectedProjectDesktop('ALL')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors mb-2 ${selectedProjectDesktop === 'ALL' ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                Tất cả dự án ({desktopProjects.length})
                            </button>
                            {desktopProjects.map(pKey => {
                                let count = 0;
                                if (selectedDateDesktop !== 'ALL') {
                                    count = groupedData[selectedDateDesktop]?.[pKey]?.items?.length || 0;
                                } else {
                                    Object.values(groupedData).forEach(g => {
                                        if (g[pKey]) count += g[pKey].items.length;
                                    });
                                }
                                
                                return (
                                <button 
                                    key={pKey}
                                    onClick={() => setSelectedProjectDesktop(pKey)}
                                    className={`w-full flex flex-col text-left px-3 py-2 rounded-lg transition-colors ${selectedProjectDesktop === pKey ? 'bg-blue-100' : 'hover:bg-slate-50'}`}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className={`text-[13px] font-bold truncate ${selectedProjectDesktop === pKey ? 'text-blue-900' : 'text-slate-700'}`}>{pKey}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${selectedProjectDesktop === pKey ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                                    </div>
                                </button>
                            )})}
                        </>
                    )}
                </div>
            </div>

            {/* COLUMN 3: ITEMS */}
            <div className="flex flex-col shrink-0 bg-[#f8fafc] relative" style={{ width: colSizes[2] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(2)}
                />
                <div className="px-4 py-3 border-b border-slate-200 shrink-0">
                    <h3 className="font-bold text-slate-700 tracking-tight text-xs uppercase">3. Hạng Mục ({desktopItems.length})</h3>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-0">
                    {selectedProjectDesktop === 'ALL' ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-4 text-center">
                            <Building2 className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-[11px] font-medium">Vui lòng chọn <br/><strong>Công trình / Dự án</strong></p>
                        </div>
                    ) : desktopItems.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">Không có hạng mục nào</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {desktopItems.map(item => (
                                <div 
                                    key={item.id}
                                    onClick={() => handleSelectItemDesktop(item)}
                                    className={`p-4 hover:bg-blue-50/50 cursor-pointer transition-colors relative ${selectedItemDesktop?.id === item.id ? 'bg-blue-50/80 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-blue-600' : 'bg-white'}`}
                                >
                                    <div className="flex justify-between items-start gap-2 mb-2">
                                        <h4 className="font-bold text-slate-800 text-[13px] leading-snug line-clamp-2 pr-6">
                                            {(item.type === 'IQC' || item.type === 'SQC_VT') 
                                                ? (item.materials?.[0]?.name || item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                : (item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')}
                                        </h4>
                                        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-600">
                                            {item.status === InspectionStatus.FLAGGED ? <AlertTriangle className="w-4 h-4"/> : <CheckSquare className="w-4 h-4 text-blue-600"/>}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center mt-2 text-[11px] text-slate-500 font-mono">
                                        <span>
                                            {(item.type === 'PQC') ? (item.ma_nha_may || item.headcode || '---') :
                                            (item.type === 'IQC' || item.type === 'SQC_VT' || item.type === 'SQC_BTP') ? (item.po_number || item.ma_ct || item.ma_nha_may || '---') :
                                            (item.ma_nha_may || item.headcode || '---')}
                                        </span>
                                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3"/> {formatDisplayDate(item.date)}</span>
                                    </div>
                                    <div className="mt-2 flex gap-2 items-center">
                                         <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border shadow-sm ${MODULE_CONFIG[item.type || 'PQC']?.bg} ${MODULE_CONFIG[item.type || 'PQC']?.color}`}>{item.type || 'PQC'}</span>
                                         <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{item.inspectorName || '---'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* COLUMN 4: DETAIL */}
            <div className="flex flex-1 flex-col bg-white overflow-hidden relative shrink-0" style={{ minWidth: colSizes[3] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(3)}
                />
                <div className="px-6 py-3 border-b border-slate-200 shrink-0 bg-white flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 tracking-tight text-xs uppercase">4. Chi Tiết Hạng Mục</h3>
                    {selectedItemDesktop && (
                        <button onClick={() => onSelect(selectedItemDesktop.id)} className="px-3 py-1 bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1">
                            MỞ ĐẦY ĐỦ <ArrowRight className="w-3 h-3" />
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-6 bg-slate-50/30">
                    {!selectedItemDesktop ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Info className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-sm font-medium">Chọn một hạng mục để xem chi tiết</p>
                        </div>
                    ) : isLoadingDetail ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Loader2 className="w-8 h-8 mb-4 animate-spin text-blue-500" />
                            <p className="text-sm font-medium text-slate-500">Đang tải dữ liệu chi tiết...</p>
                        </div>
                    ) : (
                        <div className="max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
                            <div className="pb-4 border-b border-slate-100">
                                <p className="text-[13px] font-bold text-blue-600 uppercase tracking-wide mb-1">
                                    {(selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') ? (selectedItemDesktop.materials?.[0]?.projectName || selectedItemDesktop.ten_ct || '---') : (selectedItemDesktop.ten_ct || '---')}
                                </p>
                                <h2 className="text-xl font-bold text-slate-900 leading-snug">
                                    {(selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') 
                                                ? (selectedItemDesktop.materials?.[0]?.name || selectedItemDesktop.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                : (selectedItemDesktop.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')}
                                </h2>
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${selectedItemDesktop.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-700' : selectedItemDesktop.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{selectedItemDesktop.status}</span>
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${MODULE_CONFIG[selectedItemDesktop.type || 'PQC']?.bg} ${MODULE_CONFIG[selectedItemDesktop.type || 'PQC']?.color}`}>{selectedItemDesktop.type}</span>
                                    <span className="text-sm font-bold text-slate-700 border-l border-slate-300 pl-2">
                                        {(selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') ? (selectedItemDesktop.materials?.[0]?.projectCode || selectedItemDesktop.ma_nha_may || selectedItemDesktop.po_number || selectedItemDesktop.headcode || '---') : (selectedItemDesktop.ma_nha_may || selectedItemDesktop.po_number || selectedItemDesktop.headcode || '---')}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Xưởng Sản Xuất:</label>
                                        <p className="text-[14px] font-medium text-slate-800">{selectedItemDesktop.workshop || '---'}</p>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Công Đoạn Kiểm Tra:</label>
                                        <p className="text-[14px] font-medium text-slate-800">{selectedItemDesktop.inspectionStage || selectedItemDesktop.type || '---'}</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Người Kiểm Tra:</label>
                                        <p className="text-[14px] font-medium text-slate-800">{selectedItemDesktop.inspectorName || '---'}</p>
                                    </div>
                                </div>

                                {(()=>{
                                    let so_luong_ipo = selectedItemDesktop.so_luong_ipo;
                                    let dvt = selectedItemDesktop.dvt;
                                    let inspectedQuantity = selectedItemDesktop.inspectedQuantity;
                                    let passedQuantity = selectedItemDesktop.passedQuantity;
                                    let failedQuantity = selectedItemDesktop.failedQuantity;
                                    
                                    if ((selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') && selectedItemDesktop.materials && selectedItemDesktop.materials.length > 0) {
                                        so_luong_ipo = selectedItemDesktop.materials[0].orderQty ?? so_luong_ipo;
                                        dvt = selectedItemDesktop.materials[0].unit || dvt;
                                        inspectedQuantity = selectedItemDesktop.materials[0].inspectQty ?? inspectedQuantity;
                                        passedQuantity = selectedItemDesktop.materials[0].passQty ?? passedQuantity;
                                        failedQuantity = selectedItemDesktop.materials[0].failQty ?? failedQuantity;
                                    }

                                    return (
                                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <div className="min-w-[80px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">SL Đơn Hàng</label>
                                                <p className="text-[13px] font-medium text-slate-800 truncate">{so_luong_ipo ?? '---'}</p>
                                            </div>
                                            <div className="min-w-[40px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">ĐVT</label>
                                                <p className="text-[13px] font-medium text-slate-800 truncate">{dvt || 'PCS'}</p>
                                            </div>
                                            <div className="min-w-[60px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">SL Kiểm</label>
                                                <p className="text-[13px] font-bold text-blue-600 truncate">{inspectedQuantity ?? '---'}</p>
                                            </div>
                                            <div className="min-w-[40px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">Pass</label>
                                                <p className="text-[13px] font-bold text-green-600 truncate">{passedQuantity ?? '0'}</p>
                                            </div>
                                            <div className="min-w-[40px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">Fail</label>
                                                <p className="text-[13px] font-bold text-red-600 truncate">{failedQuantity ?? '0'}</p>
                                            </div>
                                            <div className="min-w-[50px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">% Pass</label>
                                                <p className="text-[13px] font-bold text-green-600 truncate">{parseFloat(inspectedQuantity?.toString() || '0') > 0 ? ((parseFloat(passedQuantity?.toString() || '0') / parseFloat(inspectedQuantity?.toString() || '0')) * 100).toFixed(1) + '%' : '---'}</p>
                                            </div>
                                            <div className="min-w-[50px]">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 whitespace-nowrap">% Fail</label>
                                                <p className="text-[13px] font-bold text-red-600 truncate">{parseFloat(inspectedQuantity?.toString() || '0') > 0 ? ((parseFloat(failedQuantity?.toString() || '0') / parseFloat(inspectedQuantity?.toString() || '0')) * 100).toFixed(1) + '%' : '---'}</p>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {(selectedItemDesktop.images && selectedItemDesktop.images.length > 0) ? (
                                <div className="pt-4 border-t border-slate-100">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Hình Ảnh Sản Phẩm ({selectedItemDesktop.images.length})</label>
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                        {selectedItemDesktop.images.map((img: any, i) => {
                                            const src = typeof img === 'string' ? img : (img.url_hd || img.url_thumbnail || img.file_url);
                                            const proxySrc = getProxyImageUrl(src);
                                            return (
                                                <div key={i} className="relative group cursor-pointer shrink-0" onClick={() => {
                                                    const formattedImages = selectedItemDesktop.images?.map((im: any) => {
                                                        const imSrc = typeof im === 'string' ? im : (im.url_hd || im.url_thumbnail || im.file_url);
                                                        return getProxyImageUrl(imSrc);
                                                    }) || [];
                                                    setLightboxState({ images: formattedImages, index: i });
                                                }}>
                                                    <img loading="lazy" src={proxySrc} className="w-24 h-24 rounded-lg object-cover border border-slate-200 shadow-sm shrink-0" />
                                                    <div className="absolute inset-0 bg-black/20 md:opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                        <Maximize2 className="w-5 h-5 text-white" />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="pt-4 border-t border-slate-100">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Hình Ảnh Sản Phẩm</label>
                                    <div className="h-24 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                                        <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                        <span className="text-xs">Không có ảnh</span>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>

        </div>

      </div>

      {lightboxState && (
          <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex flex-col transition-all">
              <div className="flex justify-between items-center p-4 text-white/50 shrink-0">
                  <div className="text-xs font-bold tracking-widest">{lightboxState.index + 1} / {lightboxState.images.length}</div>
                  <button onClick={() => setLightboxState(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                      <X className="w-6 h-6 text-white"/>
                  </button>
              </div>
              <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
                  <img src={lightboxState.images[lightboxState.index]} className="max-w-full max-h-full object-contain rounded-lg" />
                  {lightboxState.index > 0 && (
                      <button onClick={() => setLightboxState({ ...lightboxState, index: lightboxState.index - 1 })} className="absolute left-4 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors">
                          <ChevronLeft className="w-6 h-6" />
                      </button>
                  )}
                  {lightboxState.index < lightboxState.images.length - 1 && (
                      <button onClick={() => setLightboxState({ ...lightboxState, index: lightboxState.index + 1 })} className="absolute right-4 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors">
                          <ChevronRight className="w-6 h-6" />
                      </button>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};
