
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useInspectionContext } from '../src/context/InspectionContext';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId, User, hasPermission } from '../types';
import { exportInspections, deleteInspection, importInspectionsFile, fetchInspectionById } from '../services/apiService';
import { ProxyImage } from '../src/components/ProxyImage';
import { formatDisplayDate, getGmt7DayBounds, getGmt7MonthBounds, getImplementationDate } from '../lib/utils';
import { DateRangePicker } from './DateRangePicker';
import { SearchableSelect } from './SearchableSelect';
import { 
  Search, RefreshCw, FolderOpen, Clock, Upload,
  Loader2, X, ChevronDown, ChevronRight, ChevronLeft, Maximize2,
  Filter, Building2, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid, CheckSquare,
  ClipboardList, AlertTriangle, Info, User as UserIcon, CheckCircle, Image as ImageIcon,
  CalendarDays, ArrowRight, Check, FileText, Download, Trash2, Edit, Eye
} from 'lucide-react';

import { fetchInspectionsDates, fetchInspectionsProjects, fetchInspections } from '../services/apiService';

interface InspectionListProps {                
  inspections?: Inspection[];
  isLoading?: boolean;
  onSelect: (id: string) => void;
  workshops?: Workshop[];
  users?: User[];
  onRefresh?: (filters?: any) => void;
  onSearch?: (term: string) => void;
  onFilterChange?: (filters: any) => void;
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  user: User;
}

// MODULE_CONFIG stays here because it's used for styling icons
const MODULE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    'IQC': { label: 'IQC', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-slate-800/80', icon: PackageCheck },
    'PQC': { label: 'PQC', color: 'text-purple-600', bg: 'bg-purple-50', icon: Factory },
    'SQC_MAT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_VT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_BTP': { label: 'SQC-BTP', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },
    'FQC': { label: 'FQC', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: ShieldCheck },
    'SITE': { label: 'SITE', color: 'text-amber-600', bg: 'bg-amber-50', icon: MapPin },
    'SPR': { label: 'SPR', color: 'text-slate-600 dark:text-slate-400 dark:text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/50', icon: Filter },
    'STEP': { label: 'STEP', color: 'text-rose-600', bg: 'bg-rose-50', icon: SlidersHorizontal },
    'FSR': { label: 'FSR', color: 'text-orange-600', bg: 'bg-orange-50', icon: FolderOpen }
};

// Removed local SearchableSelect
export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections: propsInspections, isLoading: propsIsLoading, onSelect, workshops = [], users = [], onRefresh, onSearch, onFilterChange, total = 0, page = 1, onPageChange, user
}) => {
  const { inspections: contextInspections, isInspectionsLoading: contextIsLoading, isDatesLoading, isProjectsLoading, loadInspections, loadDates, loadProjects, dates, projects } = useInspectionContext();
  const inspections = propsInspections || contextInspections || [];
  const isInspectionsLoading = propsIsLoading !== undefined ? propsIsLoading : contextIsLoading;
  
  const getWarningConfig = (item: any) => {
    let val = item.createdAt || item.created_at || item.date;
    if (!val) return null;
    
    if (typeof val === 'string' && /^\d+$/.test(val)) {
        val = Number(val);
    }
    
    let createdTime = Date.now();
    if (typeof val === 'number') {
        createdTime = val < 1e12 ? val * 1000 : val;
    } else {
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) {
            createdTime = parsed;
        } else if (typeof val === 'string' && val.includes('/')) {
            const parts = val.split('/');
            if (parts.length === 3) {
                const [d, m, y] = parts;
                const parsedGmt7 = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+07:00`).getTime();
                if (!isNaN(parsedGmt7)) {
                    createdTime = parsedGmt7;
                }
            }
        }
    }
    
    const elapsedHours = (Date.now() - createdTime) / (1000 * 60 * 60);
    const statusLower = String(item.status || '').toLowerCase();
    
    // 2. Cảnh báo Đỏ (Trễ hạn > 24h): đối với các phiếu sau mốc thời gian tạo 24h mà vẫn ở trạng thái pending/ verified
    if (elapsedHours >= 24 && (statusLower === 'pending' || statusLower === 'verified')) {
        return {
            type: 'red' as const,
            bg: 'bg-red-50/70 dark:bg-red-950/20',
            border: 'border-red-400 dark:border-red-900/50 hover:border-red-500',
            text: 'text-red-700 dark:text-red-400',
            badgeBg: 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-900/40',
            badgeText: 'text-red-700 dark:text-red-400',
            label: 'Trễ hạn duyệt > 24h',
            accent: 'before:bg-red-600'
        };
    } 
    // 1. Cảnh báo Vàng (Trễ hạn > 12h): đối với các phiếu sau mốc thời gian tạo 12h mà vẫn ở trạng thái pending
    else if (elapsedHours >= 12 && statusLower === 'pending') {
        return {
            type: 'yellow' as const,
            bg: 'bg-amber-50/70 dark:bg-amber-950/20',
            border: 'border-amber-400 dark:border-amber-900/50 hover:border-amber-500',
            text: 'text-amber-700 dark:text-amber-400',
            badgeBg: 'bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40',
            badgeText: 'text-amber-700 dark:text-amber-400',
            label: 'Trễ hạn duyệt > 12h',
            accent: 'before:bg-amber-600'
        };
    }
    return null;
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const handleCommitSearch = () => {
    if (searchInput !== searchTerm) {
      setSearchTerm(searchInput);
      if (onSearch) onSearch(searchInput);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    if (onSearch) onSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };

  const [selectedMonthDesktop, setSelectedMonthDesktop] = useState<{year: number, month: number} | null>(null);
  const [selectedDateDesktop, setSelectedDateDesktop] = useState<string | null>(null);
  const [selectedProjectDesktop, setSelectedProjectDesktop] = useState<string | null>(null);
  const [selectedItemDesktop, setSelectedItemDesktop] = useState<any | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  
  const [mobileViewStep, setMobileViewStep] = useState<1 | 2 | 3>(1);

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

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set([new Date().getFullYear().toString()]));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2, '0')}`]));
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lazyLoadedItems, setLazyLoadedItems] = useState<Inspection[]>([]);
  const [isItemsLoading, setIsItemsLoading] = useState(false);
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
  
  useEffect(() => {
    if (onFilterChange) {
      let finalStartDate = startDate;
      let finalEndDate = endDate;

      if (selectedMonthDesktop) {
        const { year, month } = selectedMonthDesktop;
        finalStartDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        finalEndDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }

      let finalProject = filterProject.join(',');
      if (selectedProjectDesktop === 'ALL') {
         finalProject = ''; // backend will treat empty as ALL
      } else if (selectedProjectDesktop) {
         finalProject = selectedProjectDesktop;
      } else {
         // If we strictly want NO loading until project is selected (except for months):
         // we might want to pass a flag or just keep it as is if we want to load all.
         // Let's assume for now that if no project is selected, we don't fetch inspection items.
         finalProject = '__NONE__'; 
      }

      onFilterChange({
        status: filterStatus.join(','),
        search: searchTerm,
        qc: filterQC.join(','),
        workshop: filterWorkshop.join(','),
        project: finalProject,
        type: filterType.join(','),
        startDate: finalStartDate,
        endDate: finalEndDate
      });
    }
  }, [filterStatus, searchTerm, filterQC, filterWorkshop, filterProject, filterType, startDate, endDate, selectedMonthDesktop, selectedProjectDesktop]);

  const workshopLabels = useMemo(() => {
    const map: Record<string, string> = {};
    workshops.forEach(w => {
      map[w.code] = `${w.name} (${w.code})`;
    });
    map['VẬT TƯ'] = 'Vật Tư (VẬT TƯ)';
    map['GCN'] = 'GCN (Gia Công Ngoài)';
    map['LẮP ĐẶT'] = 'Lắp Đặt (SITE)';
    return map;
  }, [workshops]);

  const filterOptions = useMemo(() => {
      const showAllInspectors = user?.role === 'ADMIN' || user?.role === 'MANAGER' || hasPermission(user, [], 'LIST', 'VIEW_ALL');
      
      let allPotentialInspectors: string[] = [];
      if (showAllInspectors) {
          // Sort users: QC/QA/ADMIN/MANAGER first
          const sortedUsers = [...(users || [])].sort((a, b) => {
              const roles = ['QC', 'QA', 'ADMIN', 'MANAGER'];
              const idxA = roles.indexOf(a.role as string);
              const idxB = roles.indexOf(b.role as string);
              if (idxA === -1 && idxB === -1) return a.name.localeCompare(b.name);
              if (idxA === -1) return 1;
              if (idxB === -1) return -1;
              return idxA - idxB;
          });
          allPotentialInspectors = sortedUsers.map(u => u.name);
      } else if (user?.role === 'QC') {
          allPotentialInspectors = [user.name];
      } else {
          // Fallback to everyone if restricted but not QC
          allPotentialInspectors = users?.map(u => u.name) || [];
      }

      // Also include people who have actually performed inspections in the current list
      const actualInspectors = inspections.map(i => i.inspectorName).filter((n): n is string => !!n);
      
      return {
          inspectors: Array.from(new Set([...allPotentialInspectors, ...actualInspectors])),
          workshops: Array.from(new Set([
              ...workshops.map(w => w.code),
              'VẬT TƯ', 'GCN', 'LẮP ĐẶT'
          ])),
          projects: Array.from(new Set([
              ...projects.map(p => p.ma_ct),
              ...inspections.map(i => i.ma_ct).filter((s): s is string => !!s)
          ])).sort(),
          types: Object.keys(MODULE_CONFIG),
          statuses: [InspectionStatus.PENDING, InspectionStatus.VERIFIED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
      };
  }, [user, users, workshops, projects, inspections]);

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
    // Collect all dates from the hierarchy
    const dateCounts: Record<string, number> = {};
    dates.forEach(r => {
        const dStr = formatDisplayDate(r.date) || 'KHÔNG RÕ NGÀY';
        dateCounts[dStr] = (dateCounts[dStr] || 0) + (r.count ? Number(r.count) : 1);
    });

    return Object.keys(dateCounts).sort((a, b) => {
        if (a === 'KHÔNG RÕ NGÀY' || a === '---') return 1;
        if (b === 'KHÔNG RÕ NGÀY' || b === '---') return -1;
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        return new Date(`${yb}-${mb}-${db}`).getTime() - new Date(`${ya}-${ma}-${da}`).getTime();
    });
  }, [dates]);

  // Expanded states management
  useEffect(() => {
    // When inspections load, expand current month and year automatically
    const now = new Date();
    const curYear = now.getFullYear().toString();
    const curMonth = `${curYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    setExpandedYears(prev => new Set([...Array.from(prev), curYear]));
    setExpandedMonths(prev => new Set([...Array.from(prev), curMonth]));
  }, [inspections.length]);

  // Disable auto-expand selected month to allow manual collapse

  // Auto-expand current year and month on first load
  useEffect(() => {
    if (sortedDatesList.length > 0 && !selectedMonthDesktop && !selectedDateDesktop) {
        const dateKey = sortedDatesList.find(d => d !== 'KHÔNG RÕ NGÀY' && d !== '---');
        if (dateKey) {
            const [, mStr, yStr] = dateKey.split('/');
            const year = parseInt(yStr, 10);
            const month = parseInt(mStr, 10);
            
            setExpandedYears(prev => new Set([...Array.from(prev), yStr]));
        }
    }
  }, [sortedDatesList, selectedMonthDesktop, selectedDateDesktop]);

  
  // Local Filter argument builder
  const getFilterArgs = () => {
     const args: any = {};
     if (filterQC.length > 0) args.qc = filterQC.join(',');
     if (filterWorkshop.length > 0) args.workshop = filterWorkshop.join(',');
     if (filterStatus.length > 0) args.status = filterStatus.join(',');
     if (filterType.length > 0) args.type = filterType.join(',');
     if (startDate) args.startDate = startDate;
     if (endDate) args.endDate = endDate;
     if (searchTerm) args.search = searchTerm;
     return args;
  };

  // 1. Fetch dates on load / filter change
  useEffect(() => {
     loadDates(getFilterArgs());
  }, [filterQC, filterWorkshop, filterStatus, filterType, startDate, endDate, searchTerm]);

  const nestedDatesTree = useMemo(() => {
    // Process the API response (from context: dates)
    const tree: { year: string, count: number, months: { month: string, count: number, dates: { dateKey: string, count: number }[] }[] }[] = [];
    const yearMap: Record<string, any> = {};
    const noDateDates: { dateKey: string, count: number }[] = [];
    const dateCounts: Record<string, number> = {};
    
    dates.forEach(r => {
        const dStr = formatDisplayDate(r.date) || 'KHÔNG RÕ NGÀY';
        // Handle both grouped dates (from optimized api) and individual records
        dateCounts[dStr] = (dateCounts[dStr] || 0) + (r.count ? Number(r.count) : 1);
    });

    const uniqueDates = Object.keys(dateCounts).sort((a, b) => {
        if (a === 'KHÔNG RÕ NGÀY' || a === '---') return 1;
        if (b === 'KHÔNG RÕ NGÀY' || b === '---') return -1;
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        return new Date(`${yb}-${mb}-${db}`).getTime() - new Date(`${ya}-${ma}-${da}`).getTime();
    });

    uniqueDates.forEach(d => {
        if (d === 'KHÔNG RÕ NGÀY' || d === '---') {
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
  }, [dates]);

  // 2. Fetch projects when date/month selected
  useEffect(() => {
    if (!searchTerm && !selectedDateDesktop && !selectedMonthDesktop && !startDate && !endDate) return;

    loadProjects(getFilterArgs(), selectedDateDesktop, selectedMonthDesktop);
  }, [selectedDateDesktop, selectedMonthDesktop, filterQC, filterWorkshop, filterStatus, filterType, startDate, endDate, searchTerm]);

  // 3. Trigger Item load when Project is selected OR when searching (Global Search Mode)
  useEffect(() => {
      // Clear selected item when project changes to avoid stale detail view
      setSelectedItemDesktop(null);

      if (!searchTerm && !selectedDateDesktop && !selectedMonthDesktop && !startDate && !endDate) {
          setLazyLoadedItems([]);
          return;
      }

      setIsItemsLoading(true);
      let isActive = true;
      const args = getFilterArgs();
      
      // Pass project filter correctly
      if (selectedProjectDesktop && selectedProjectDesktop !== 'ALL') {
        args.project = selectedProjectDesktop;
      }
      
      if (selectedDateDesktop && selectedDateDesktop !== 'ALL') {
             const bounds = getGmt7DayBounds(selectedDateDesktop);
             args.unixStart = bounds.unixStart;
             args.unixEnd = bounds.unixEnd;
      } else if (selectedMonthDesktop) {
             const { year, month } = selectedMonthDesktop;
             const bounds = getGmt7MonthBounds(year, month);
             args.unixStart = bounds.unixStart;
             args.unixEnd = bounds.unixEnd;
      }
      
      fetchInspections(args, 1, 50000).then(res => {
          if (isActive) {
              setLazyLoadedItems(res.items || []);
              setIsItemsLoading(false);
          }
      }).catch(() => {
          if (isActive) setIsItemsLoading(false);
      });

      return () => { isActive = false; };
  }, [selectedProjectDesktop, selectedDateDesktop, selectedMonthDesktop, filterQC, filterWorkshop, filterStatus, filterType, startDate, endDate, searchTerm]);

  const { desktopProjectsList, desktopItems } = useMemo(() => {
      let itemsForProject = lazyLoadedItems;
      
      if (selectedProjectDesktop !== null && selectedProjectDesktop !== 'ALL') {
          if (selectedProjectDesktop === '__UNASSIGNED__') {
              itemsForProject = itemsForProject.filter(i => !i.ma_ct || i.ma_ct === '');
          } else {
              itemsForProject = itemsForProject.filter(i => (i.ma_ct || '') === selectedProjectDesktop);
          }
      }
      
      return { desktopProjectsList: projects, desktopItems: itemsForProject };
  }, [selectedDateDesktop, selectedMonthDesktop, selectedProjectDesktop, projects, lazyLoadedItems]);

  const totalInspectionsCount = useMemo(() => {
    const sum = dates && dates.length > 0 ? dates.reduce((acc, d) => acc + (Number(d.count) || 0), 0) : 0;
    return sum || total;
  }, [dates, total]);

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* BULK ACTION BAR */}
      {user.role === 'ADMIN' && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl shadow-xl flex items-center justify-between z-50 animate-in slide-in-from-bottom-10">
          <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">Đã chọn {selectedIds.size} phiếu</span>
          <button 
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase hover:bg-red-700 transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" /> Xóa hàng loạt
          </button>
        </div>
      )}

      {/* COMPACT TOOLBAR */}
      <div className="shrink-0 bg-white dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-700 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
              {user.role === 'ADMIN' && (
                <button 
                  onClick={toggleSelectAll}
                  className="p-2.5 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all active:scale-95"
                >
                  {selectedIds.size === inspections.length && inspections.length > 0 ? <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" /> : <LayoutGrid className="w-5 h-5" />}
                </button>
              )}
              <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 dark:text-slate-500" />
                  <input 
                    type="text" placeholder="Dự án, Sản phẩm, Inspector, Headcode, Nhà máy..." 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onBlur={handleCommitSearch}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-11 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
                  {searchInput && (
                    <button 
                      onClick={handleClearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:text-slate-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
              </div>
              
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                className={`p-2.5 rounded-xl border transition-all active:scale-95 relative ${isFilterOpen || isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}
              >
                <Filter className="w-5 h-5" />
                {isFilterActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
              </button>

              {isFilterOpen && (
                  <div className="absolute top-12 right-4 w-[210px] bg-white dark:bg-slate-900 rounded-xl p-2 border border-slate-200 dark:border-slate-700 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 max-h-[80vh] overflow-y-auto scrollbar-thin">
                      <div className="flex justify-between items-center mb-1.5 px-1">
                        <span className="font-black text-black dark:text-white uppercase text-[10px] tracking-wider">Bộ lọc tìm kiếm</span>
                        <button onClick={() => setIsFilterOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400 dark:text-slate-500"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="space-y-1 pb-1">
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
                            optionLabels={workshopLabels}
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
                          <div className="pt-1.5">
                             <button onClick={() => { setFilterType([]); setFilterQC([]); setFilterWorkshop([]); setFilterProject([]); setFilterStatus([]); setSearchTerm(''); setStartDate(''); setEndDate(''); setIsFilterOpen(false); }} className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-black dark:text-white rounded-lg text-[10px] font-black uppercase hover:bg-slate-200 transition-all border border-slate-200 dark:border-slate-700 tracking-tighter">XÓA BỘ LỌC</button>
                          </div>
                      </div>
                  </div>
              )}

              <div className="flex items-center gap-1.5">
                {hasPermission(user, [], 'LIST', 'IMPORT') && (
                  <>
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
                      className="p-2.5 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    </button>
                  </>
                )}
                {hasPermission(user, [], 'LIST', 'EXPORT') && (
                  <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    title="Xuất Excel"
                    className="p-2.5 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  </button>
                )}
              </div>
          </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        
        {/* MOBILE VIEW */}
        <div className="md:hidden flex-1 flex flex-col bg-slate-50 dark:bg-slate-800/50 overflow-hidden h-full">
            <div className="px-3 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm flex items-center shrink-0 z-10">
                <div className="flex bg-slate-200 dark:bg-slate-700/60 rounded-lg p-1 w-full relative transition-all gap-1">
                    <button onClick={() => setMobileViewStep(1)} className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-colors ${mobileViewStep === 1 ? 'bg-white dark:bg-slate-900 text-blue-700 shadow-sm' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>Ngày Tháng</button>
                    {(selectedDateDesktop || selectedMonthDesktop) && (
                        <button onClick={() => setMobileViewStep(2)} className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-colors ${mobileViewStep === 2 ? 'bg-white dark:bg-slate-900 text-blue-700 shadow-sm' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>Dự Án {desktopProjectsList.length > 0 && `(${desktopProjectsList.length})`}</button>
                    )}
                    {(selectedProjectDesktop !== null && selectedProjectDesktop !== 'ALL') && (
                        <button onClick={() => setMobileViewStep(3)} className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-colors ${mobileViewStep === 3 ? 'bg-white dark:bg-slate-900 text-blue-700 shadow-sm' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>Hạng Mục {desktopItems.length > 0 && `(${desktopItems.length})`}</button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar relative block h-full w-full">
                {mobileViewStep === 1 && (
                    <div className="p-3 space-y-2 animate-in fade-in slide-in-from-left-4 duration-300">
                        {isDatesLoading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                            </div>
                        ) : (
                            <>
                                {nestedDatesTree.tree.map(({ year, count, months }) => {
                                    const isYearExpanded = expandedYears.has(year);
                                    return (
                                        <div key={year} className="mb-2 space-y-1">
                                            <button 
                                                onClick={() => setExpandedYears(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(year)) next.delete(year); else next.add(year);
                                                    return next;
                                                })}
                                                className="w-full flex items-center justify-between text-left px-4 py-3 rounded-xl text-[14px] font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors"
                                            >
                                                <span>Năm {year}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400 dark:text-slate-500">{count}</span>
                                                    <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-transform ${isYearExpanded ? 'rotate-180' : ''}`} />
                                                </div>
                                            </button>
                                            
                                            {isYearExpanded && months.map(({ month, count, dates }) => {
                                                const mKey = `${year}-${month}`;
                                                const isMonthSelected = selectedMonthDesktop?.year === parseInt(year, 10) && selectedMonthDesktop?.month === parseInt(month, 10) && !selectedDateDesktop;
                                                const isMonthExpanded = expandedMonths.has(mKey);
                                                return (
                                                    <div key={mKey} className="pl-2">
                                                        <button 
                                                            onClick={() => {
                                                                setExpandedMonths(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(mKey)) next.delete(mKey); else next.add(mKey);
                                                                    return next;
                                                                });
                                                                setSelectedDateDesktop('');
                                                                setSelectedMonthDesktop({ year: parseInt(year, 10), month: parseInt(month, 10) });
                                                                setSelectedProjectDesktop('ALL');
                                                                if (window.innerWidth < 768) setTimeout(() => setMobileViewStep(2), 150);
                                                            }}
                                                            className={`w-full flex items-center justify-between text-left px-4 py-2 mt-2 rounded-xl text-[13px] font-semibold transition-colors ${isMonthSelected ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 border border-blue-200 dark:border-slate-700' : 'text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm'}`}
                                                        >
                                                            <span>Tháng {month}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isMonthSelected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500'}`}>{count}</span>
                                                                <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isMonthExpanded ? 'rotate-90' : ''} ${isMonthSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                                                            </div>
                                                        </button>
                                                        
                                                        {isMonthExpanded && dates.map(({ dateKey, count }) => {
                                                            const isDateSelected = selectedDateDesktop === dateKey;
                                                            return (
                                                                <button 
                                                                    key={dateKey}
                                                                    onClick={() => {
                                                                        setSelectedDateDesktop(dateKey);
                                                                        setSelectedMonthDesktop({ year: parseInt(year, 10), month: parseInt(month, 10) });
                                                                        setSelectedProjectDesktop('ALL');
                                                                        if (window.innerWidth < 768) setTimeout(() => setMobileViewStep(2), 150);
                                                                    }}
                                                                    className={`w-full flex items-center justify-between text-left px-4 py-2 mt-2 ml-4 rounded-xl text-[12px] font-medium transition-colors ${isDateSelected ? 'bg-blue-500 text-white font-bold shadow-md' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm'}`}
                                                                    style={{ width: 'calc(100% - 1rem)' }}
                                                                >
                                                                    <span>{dateKey.substring(0, 5)}</span>
                                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDateSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>{count}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                                {totalInspectionsCount > 0 && (
                                    <div className="flex items-center justify-center px-2 py-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tổng {totalInspectionsCount} phiếu</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
                {mobileViewStep === 2 && (
                    <div className="p-3 w-full animate-in fade-in slide-in-from-right-4 duration-300">
                        {isProjectsLoading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                            </div>
                        ) : (!selectedDateDesktop && !selectedMonthDesktop) ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                                <CalendarDays className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-[12px] font-medium text-center">Vui lòng chọn <br/><strong>Ngày / Tháng</strong> ở bước 1</p>
                                <button onClick={() => setMobileViewStep(1)} className="mt-4 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 text-xs font-bold rounded-lg uppercase">Quay lại Chọn Ngày</button>
                            </div>
                        ) : desktopProjectsList.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">Không có dự án</div>
                        ) : (
                            <div className="space-y-2">
                                {/* TẤT CẢ DỰ ÁN */}
                                <button 
                                    onClick={() => {
                                        setSelectedProjectDesktop('ALL');
                                        if (window.innerWidth < 768) setTimeout(() => setMobileViewStep(3), 150);
                                    }}
                                    className={`w-full flex justify-between items-center text-left p-4 rounded-xl border shadow-sm transition-all active:scale-[0.98] ${selectedProjectDesktop === 'ALL' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-slate-700 ring-2 ring-blue-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
                                >
                                    <div className="flex flex-col min-w-0 pr-4">
                                        <span className={`text-[14px] font-bold ${selectedProjectDesktop === 'ALL' ? 'text-blue-900' : 'text-slate-800 dark:text-slate-200'}`}>TẤT CẢ DỰ ÁN</span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Xem toàn bộ hạng mục</span>
                                    </div>
                                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md shrink-0 ${selectedProjectDesktop === 'ALL' ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                        {desktopProjectsList.reduce((acc, p) => acc + (p.count || 0), 0)}
                                    </span>
                                </button>

                                {desktopProjectsList.map((p, idx) => {
                                    const projCode = p.ma_ct || '__UNASSIGNED__';
                                    const isSelected = selectedProjectDesktop === projCode;
                                    return (
                                        <button 
                                            key={`${projCode}_${idx}`}
                                            onClick={() => {
                                                setSelectedProjectDesktop(projCode);
                                                if (window.innerWidth < 768) setTimeout(() => setMobileViewStep(3), 150);
                                            }}
                                            className={`w-full flex justify-between items-center text-left p-4 rounded-xl border shadow-sm transition-all active:scale-[0.98] ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-slate-700 ring-2 ring-blue-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
                                        >
                                            <div className="flex flex-col min-w-0 pr-4">
                                                <span className={`text-[14px] font-bold line-clamp-2 ${isSelected ? 'text-blue-900' : 'text-slate-800 dark:text-slate-200'}`}>{p.ten_ct || 'CHƯA RÕ TÊN DỰ ÁN'}</span>
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium mt-0.5">{p.ma_ct || 'CHƯA GÁN MÃ DỰ ÁN'}</span>
                                            </div>
                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md shrink-0 ${isSelected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{p.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {mobileViewStep === 3 && (
                    <div className="p-3 w-full animate-in fade-in slide-in-from-right-4 duration-300">
                        {isItemsLoading && desktopItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                            </div>
                        ) : !searchTerm && selectedProjectDesktop === null ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                                <Building2 className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-[12px] font-medium text-center">Vui lòng chọn <br/><strong>Dự Án</strong> ở bước 2</p>
                                <button onClick={() => setMobileViewStep(2)} className="mt-4 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 text-xs font-bold rounded-lg uppercase">Quay lại Chọn Dự Án</button>
                            </div>
                        ) : desktopItems.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                {searchTerm ? `Không tìm thấy hạng mục nào cho "${searchTerm}"` : 'Không có hạng mục nào'}
                            </div>
                        ) : (
                            <div className="space-y-3 pb-2">
                                {desktopItems.map((item) => {
                                    const cfg = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                    const warn = getWarningConfig(item);
                                    return (
                                        <div 
                                            key={item.id}
                                            onClick={() => onSelect(item.id)}
                                            className={`border rounded-2xl p-4 shadow-sm transition-all cursor-pointer active:scale-[0.98] group overflow-hidden relative ${
                                                warn 
                                                    ? `${warn.bg} ${warn.border}` 
                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                                            }`}
                                        >
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.bg} ${cfg.color} uppercase border shadow-sm tracking-tight`}>{cfg.label}</span>
                                                        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase">
                                                            {
                                                                (item.type === 'PQC') ? (item.ma_nha_may || item.headcode || '---') :
                                                                (item.type === 'IQC' || item.type === 'SQC_VT' || item.type === 'SQC_BTP') ? (item.po_number || item.ma_ct || item.ma_nha_may || '---') :
                                                                (item.ma_nha_may || item.headcode || '---')
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {warn && (
                                                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1 animate-pulse ${warn.badgeBg} ${warn.badgeText}`}>
                                                                <Clock className="w-2.5 h-2.5" />
                                                                {warn.label}
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                                                            item.status === InspectionStatus.APPROVED ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                            item.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-700' :
                                                            'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                        }`}>
                                                            {item.status}
                                                        </span>
                                                    </div>
                                                </div>
                                                <h4 className="text-[14px] font-bold text-slate-800 dark:text-slate-200 leading-snug pr-6 group-hover:text-blue-700 transition-colors line-clamp-3">
                                                    {item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ'}
                                                </h4>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-slate-800/80 flex items-center justify-center border border-blue-100 dark:border-slate-700 shrink-0">
                                                        <UserIcon className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                                                    </div>
                                                    <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 truncate">{item.inspectorName || item.created_by || '---'}</span>
                                                </div>
                                                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                                                    {formatDisplayDate(getImplementationDate(item))}
                                                </span>
                                            </div>
                                            
                                            {user.role === 'ADMIN' && (
                                                <div className="absolute top-2 right-2 p-2" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                         type="checkbox"
                                                         checked={selectedIds.has(item.id)}
                                                         onChange={() => toggleSelect(item.id)}
                                                         className="w-5 h-5 rounded-md border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 cursor-pointer shadow-sm"
                                                     />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* DESKTOP 4-COLUMN VIEW */}
        <div className="hidden md:flex flex-1 h-full w-full bg-white dark:bg-slate-900 divide-x divide-slate-200 dark:divide-slate-800 overflow-x-auto overflow-y-hidden text-sm">
            
            {/* COLUMN 1: DATES */}
            <div className="flex flex-col shrink-0 bg-slate-50 dark:bg-slate-800/50/50 relative" style={{ width: colSizes[0] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(0)}
                />
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0 flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300 tracking-tight text-xs uppercase">1. Ngày Tháng - {totalInspectionsCount}</h3>
                    {isDatesLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 dark:text-blue-400" />}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
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
                                    className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-[13px] font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 transition-colors"
                                >
                                    <span>Năm {year}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-white dark:bg-slate-900 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 dark:text-slate-500">{count}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-transform ${isYearExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                
                                {isYearExpanded && months.map(({ month, count, dates }) => {
                                    const mKey = `${year}-${month}`;
                                    const isMonthSelected = selectedMonthDesktop?.year === parseInt(year, 10) && selectedMonthDesktop?.month === parseInt(month, 10) && !selectedDateDesktop;
                                    const isMonthExpanded = expandedMonths.has(mKey);
                                    return (
                                        <div key={mKey}>
                                            <button 
                                                onClick={() => {
                                                    setExpandedMonths(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(mKey)) next.delete(mKey); else next.add(mKey);
                                                        return next;
                                                    });
                                                    setSelectedDateDesktop('');
                                                    setSelectedMonthDesktop({ year: parseInt(year, 10), month: parseInt(month, 10) });
                                                    setSelectedProjectDesktop('ALL');
                                                    setSelectedItemDesktop(null);
                                                }}
                                                className={`w-full flex items-center justify-between text-left px-3 py-1.5 ml-2 mt-1 rounded-lg text-[12px] font-semibold transition-colors ${isMonthSelected ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
                                            >
                                                <span>Tháng {month}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isMonthSelected ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>{count}</span>
                                                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isMonthExpanded ? 'rotate-90' : ''} ${isMonthSelected ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                                                </div>
                                            </button>
                                            
                                            {isMonthExpanded && dates.map(({ dateKey, count }) => {
                                                const isDateSelected = selectedDateDesktop === dateKey;
                                                return (
                                                    <button 
                                                        key={dateKey}
                                                        onClick={() => {
                                                            setSelectedDateDesktop(dateKey);
                                                            setSelectedMonthDesktop({ year: parseInt(year, 10), month: parseInt(month, 10) });
                                                            setSelectedProjectDesktop('ALL');
                                                            setSelectedItemDesktop(null);
                                                        }}
                                                        className={`w-full flex items-center justify-between text-left px-3 py-1 ml-6 mt-1 rounded-lg text-[11px] font-medium transition-colors ${isDateSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 font-bold' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
                                                        style={{ width: 'calc(100% - 1.5rem)' }}
                                                    >
                                                        <span>{dateKey.substring(0, 5)}</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${isDateSelected ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>{count}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* COLUMN 2: PROJECTS */}
            <div className="flex flex-col shrink-0 bg-white dark:bg-slate-900 relative" style={{ width: colSizes[1] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(1)}
                />
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300 tracking-tight text-xs uppercase">2. Công Trình / Dự Án - {desktopProjectsList.length}</h3>
                    {isProjectsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 dark:text-blue-400" />}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                    {!selectedDateDesktop && !selectedMonthDesktop && !startDate && !endDate ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 p-4 text-center">
                            <CalendarDays className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-[11px] font-medium">Vui lòng chọn <br/><strong>Ngày / Tháng</strong></p>
                        </div>
                    ) : (
                        <>
                            {(() => {
                                if (desktopProjectsList.length === 0 && !isProjectsLoading) {
                                    return <div className="p-4 text-center text-[11px] text-slate-400 dark:text-slate-500">Không có dự án</div>;
                                }

                                return (
                                    <>
                                        {/* TẤT CẢ DỰ ÁN */}
                                        <button 
                                            onClick={() => setSelectedProjectDesktop('ALL')}
                                            className={`w-full flex flex-col text-left px-3 py-2 rounded-lg transition-colors mb-1 ${selectedProjectDesktop === 'ALL' ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex flex-col min-w-0 pr-2">
                                                    <span className={`text-[13px] font-bold ${selectedProjectDesktop === 'ALL' ? 'text-blue-900' : 'text-slate-700 dark:text-slate-300'}`}>TẤT CẢ DỰ ÁN</span>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Xem toàn bộ hạng mục</span>
                                                </div>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${selectedProjectDesktop === 'ALL' ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                                    {desktopProjectsList.reduce((acc, p) => acc + (p.count || 0), 0)}
                                                </span>
                                            </div>
                                        </button>

                                        {desktopProjectsList.map((p, idx) => {
                                            const projCode = p.ma_ct || '__UNASSIGNED__';
                                            const isSelected = selectedProjectDesktop === projCode;
                                            return (
                                                <button 
                                                    key={`${projCode}_${idx}`}
                                                    onClick={() => setSelectedProjectDesktop(projCode)}
                                                    className={`w-full flex flex-col text-left px-3 py-2 rounded-lg transition-colors ${isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex flex-col min-w-0 pr-2">
                                                            <span className={`text-[13px] font-bold line-clamp-2 ${isSelected ? 'text-blue-900' : 'text-slate-700 dark:text-slate-300'}`}>{p.ten_ct || 'CHƯA RÕ TÊN DỰ ÁN'}</span>
                                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">{p.ma_ct || 'CHƯA GÁN MÃ DỰ ÁN'}</span>
                                                        </div>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${isSelected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{p.count}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </>
                                );
                            })()}
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
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300 tracking-tight text-xs uppercase">
                        {searchTerm ? 'Kết quả tìm kiếm' : '3. Hạng Mục'} - {desktopItems.length} Phiếu
                    </h3>
                    {isItemsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 dark:text-blue-400" />}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-0">
                    {!searchTerm && selectedProjectDesktop === null ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 p-4 text-center">
                            <Building2 className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-[11px] font-medium">Vui lòng chọn <br/><strong>Công trình / Dự án</strong></p>
                        </div>
                    ) : (isItemsLoading && desktopItems.length === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full py-20">
                            <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                        </div>
                    ) : desktopItems.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">Không có hạng mục nào</div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {desktopItems.map(item => {
                                const warn = getWarningConfig(item);
                                const isSelected = selectedItemDesktop?.id === item.id;
                                return (
                                    <div 
                                        key={item.id}
                                        onClick={() => handleSelectItemDesktop(item)}
                                        className={`p-4 hover:bg-blue-50/80 dark:hover:bg-slate-800/80 cursor-pointer transition-all relative ${
                                            isSelected 
                                                ? 'bg-blue-50/90 dark:bg-blue-950/40 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:bg-blue-600' 
                                                : warn 
                                                    ? `${warn.bg} before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${warn.accent}` 
                                                    : 'bg-white dark:bg-slate-900'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start gap-2 mb-2">
                                            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[13px] leading-snug line-clamp-2 pr-6">
                                                {(item.type === 'IQC' || item.type === 'SQC_VT') 
                                                    ? (item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                    : (item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')}
                                            </h4>
                                        </div>
                                        <div className="flex flex-col gap-1 mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                            <div className="flex items-center gap-1">
                                                <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1 rounded">{
                                                    (item.type === 'PQC') ? (item.ma_nha_may || item.headcode || '---') :
                                                    (item.type === 'IQC' || item.type === 'SQC_VT' || item.type === 'SQC_BTP') ? (item.po_number || item.ma_ct || item.ma_nha_may || '---') :
                                                    (item.ma_nha_may || item.headcode || '---')
                                                }</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-blue-600 dark:text-blue-400 font-bold">{item.inspectorName || item.created_by || '---'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                                                    item.status === InspectionStatus.APPROVED ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                    item.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}>
                                                    {item.status}
                                                </span>
                                                {warn && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 animate-pulse ${warn.badgeBg} ${warn.badgeText}`}>
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {warn.label}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 flex gap-2 items-center justify-between">
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border shadow-sm ${MODULE_CONFIG[item.type || 'PQC']?.bg} ${MODULE_CONFIG[item.type || 'PQC']?.color}`}>{item.type || 'PQC'}</span>
                                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{formatDisplayDate(getImplementationDate(item))}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* COLUMN 4: DETAIL */}
            <div className="flex flex-1 flex-col bg-white dark:bg-slate-900 overflow-hidden relative shrink-0" style={{ minWidth: colSizes[3] }}>
                <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors" 
                    onMouseDown={startDrag(3)}
                />
                <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300 tracking-tight text-xs uppercase">4. Chi Tiết Hạng Mục</h3>
                    {selectedItemDesktop && (
                        <button onClick={() => onSelect(selectedItemDesktop.id)} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 text-[11px] font-bold rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1">
                            MỞ ĐẦY ĐỦ <ArrowRight className="w-3 h-3" />
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-6 bg-slate-50 dark:bg-slate-800/50/30">
                    {!selectedItemDesktop ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                            <Info className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-sm font-medium">Chọn một hạng mục để xem chi tiết</p>
                        </div>
                    ) : isLoadingDetail ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                            <Loader2 className="w-8 h-8 mb-4 animate-spin text-blue-500 dark:text-blue-400" />
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Đang tải dữ liệu chi tiết...</p>
                        </div>
                    ) : (
                        <div className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-8 space-y-6">
                            <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
                                <p className="text-[13px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                                    {(selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') ? (selectedItemDesktop.materials?.[0]?.projectName || selectedItemDesktop.ten_ct || '---') : (selectedItemDesktop.ten_ct || '---')}
                                </p>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                    {(selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') 
                                                ? (selectedItemDesktop.materials?.[0]?.name || selectedItemDesktop.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                : (selectedItemDesktop.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')}
                                </h2>
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${selectedItemDesktop.status === InspectionStatus.APPROVED ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : selectedItemDesktop.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500'}`}>{selectedItemDesktop.status}</span>
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${MODULE_CONFIG[selectedItemDesktop.type || 'PQC']?.bg} ${MODULE_CONFIG[selectedItemDesktop.type || 'PQC']?.color}`}>{selectedItemDesktop.type}</span>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 border-l border-slate-300 dark:border-slate-600 pl-2">
                                        {(selectedItemDesktop.type === 'IQC' || selectedItemDesktop.type === 'SQC_VT') ? (selectedItemDesktop.materials?.[0]?.projectCode || selectedItemDesktop.ma_nha_may || selectedItemDesktop.po_number || selectedItemDesktop.headcode || '---') : (selectedItemDesktop.ma_nha_may || selectedItemDesktop.po_number || selectedItemDesktop.headcode || '---')}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Xưởng Sản Xuất:</label>
                                        <p className="text-[14px] font-medium text-slate-800 dark:text-slate-200">{workshopLabels[selectedItemDesktop.workshop || ''] || selectedItemDesktop.workshop || '---'}</p>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Công Đoạn Kiểm Tra:</label>
                                        <p className="text-[14px] font-medium text-slate-800 dark:text-slate-200">{selectedItemDesktop.inspectionStage || selectedItemDesktop.type || '---'} {selectedItemDesktop.subStage ? `(${selectedItemDesktop.subStage})` : ''}</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Người Kiểm Tra:</label>
                                        <p className="text-[14px] font-medium text-slate-800 dark:text-slate-200">{selectedItemDesktop.inspectorName || '---'}</p>
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
                                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="min-w-[80px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">SL Đơn Hàng</label>
                                                <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{so_luong_ipo ?? '---'}</p>
                                            </div>
                                            <div className="min-w-[40px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">ĐVT</label>
                                                <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{dvt || 'PCS'}</p>
                                            </div>
                                            <div className="min-w-[60px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">SL Kiểm</label>
                                                <p className="text-[13px] font-bold text-blue-600 dark:text-blue-400 truncate">{inspectedQuantity ?? '---'}</p>
                                            </div>
                                            <div className="min-w-[40px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">Pass</label>
                                                <p className="text-[13px] font-bold text-green-600 dark:text-green-500 truncate">{passedQuantity ?? '0'}</p>
                                            </div>
                                            <div className="min-w-[40px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">Fail</label>
                                                <p className="text-[13px] font-bold text-red-600 dark:text-red-400 truncate">{failedQuantity ?? '0'}</p>
                                            </div>
                                            <div className="min-w-[50px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">% Pass</label>
                                                <p className="text-[13px] font-bold text-green-600 dark:text-green-500 truncate">{parseFloat(inspectedQuantity?.toString() || '0') > 0 ? ((parseFloat(passedQuantity?.toString() || '0') / parseFloat(inspectedQuantity?.toString() || '0')) * 100).toFixed(1) + '%' : '---'}</p>
                                            </div>
                                            <div className="min-w-[50px]">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 whitespace-nowrap">% Fail</label>
                                                <p className="text-[13px] font-bold text-red-600 dark:text-red-400 truncate">{parseFloat(inspectedQuantity?.toString() || '0') > 0 ? ((parseFloat(failedQuantity?.toString() || '0') / parseFloat(inspectedQuantity?.toString() || '0')) * 100).toFixed(1) + '%' : '---'}</p>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {(selectedItemDesktop.images && selectedItemDesktop.images.length > 0) ? (
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-3">Hình Ảnh Sản Phẩm ({selectedItemDesktop.images.length})</label>
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                            {selectedItemDesktop.images.map((img: any, i: number) => {
                                                const src = typeof img === 'string' ? img : (img.url_hd || img.url_thumbnail || img.file_url);
                                                return (
                                                    <div key={i} className="relative group cursor-pointer shrink-0" onClick={() => {
                                                        const formattedImages = selectedItemDesktop.images?.map((im: any) => {
                                                            return typeof im === 'string' ? im : (im.url_hd || im.url_thumbnail || im.file_url);
                                                        }) || [];
                                                        setLightboxState({ images: formattedImages, index: i });
                                                    }}>
                                                        <ProxyImage 
                                                            src={src} 
                                                            alt="Product image" 
                                                            className="w-24 h-24 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-sm shrink-0" 
                                                            showTimestamp={true}
                                                            timestamp={typeof img === 'object' ? (img.created_at || selectedItemDesktop.date) : selectedItemDesktop.date}
                                                        />
                                                        <div className="absolute inset-0 bg-black/20 md:opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                                            <Maximize2 className="w-5 h-5 text-white" />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ) : (
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-3">Hình Ảnh Sản Phẩm</label>
                                    <div className="h-24 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500">
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
                  <button onClick={() => setLightboxState(null)} className="p-2 hover:bg-white dark:bg-slate-900/10 rounded-full transition-colors">
                      <X className="w-6 h-6 text-white"/>
                  </button>
              </div>
              <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
                  <img src={lightboxState.images[lightboxState.index]} className="max-w-full max-h-full object-contain rounded-lg" referrerPolicy="no-referrer" />
                  {lightboxState.index > 0 && (
                      <button onClick={() => setLightboxState({ ...lightboxState, index: lightboxState.index - 1 })} className="absolute left-4 p-3 bg-black/50 hover:bg-white dark:bg-slate-900/20 text-white rounded-full backdrop-blur-md transition-colors">
                          <ChevronLeft className="w-6 h-6" />
                      </button>
                  )}
                  {lightboxState.index < lightboxState.images.length - 1 && (
                      <button onClick={() => setLightboxState({ ...lightboxState, index: lightboxState.index + 1 })} className="absolute right-4 p-3 bg-black/50 hover:bg-white dark:bg-slate-900/20 text-white rounded-full backdrop-blur-md transition-colors">
                          <ChevronRight className="w-6 h-6" />
                      </button>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};
