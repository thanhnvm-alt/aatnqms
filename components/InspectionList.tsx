import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Calendar, Search, Filter, ChevronRight, ChevronDown, ChevronLeft,
    Building2, ClipboardList, User as UserIcon, Clock, Loader2,
    Download, ArrowRight, Info, CheckCircle2, LayoutGrid, X, Maximize2,
    Image as ImageIcon, AlertTriangle, CalendarDays
} from 'lucide-react';
import { Inspection, InspectionStatus, User, Workshop } from '../types';
import { apiService } from '../services/apiService';
import { formatDisplayDate, getProxyImageUrl } from '../lib/utils';
import { ProxyImage } from './ProxyImage';

interface InspectionListProps {
    user: User;
    onSelect: (id: string) => void;
    // Props passed by App.tsx that we might need or stay compatible with
    inspections?: Inspection[];
    isLoading?: boolean;
    workshops?: Workshop[];
    total?: number;
    page?: number;
    onPageChange?: (page: number) => void;
    onRefresh?: () => void;
}

const MODULE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
    PQC: { icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
    IQC: { icon: Building2, color: 'text-orange-600', bg: 'bg-orange-50' },
    SQC_VT: { icon: UserIcon, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    SQC_BTP: { icon: UserIcon, color: 'text-purple-600', bg: 'bg-purple-50' }
};

export const InspectionList: React.FC<InspectionListProps> = (props) => {
    const { user, onSelect } = props;
    // 1. DATA STATES
    const [totalCount, setTotalCount] = useState(0);
    const [groupedTimeline, setGroupedTimeline] = useState<Record<string, Record<string, string[]>>>({});
    const [yearCounts, setYearCounts] = useState<Record<string, number>>({});
    const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
    const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
    const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({ [new Date().getFullYear().toString()]: true });
    const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
    const [projects, setProjects] = useState<any[]>([]);
    const [currentItems, setCurrentItems] = useState<Inspection[]>([]);
    const [selectedItemDesktop, setSelectedItemDesktop] = useState<Inspection | null>(null);

    // 2. CACHE STATES (Client-Side Caching)
    const [timelineCache, setTimelineCache] = useState<any>(null);
    const [projectsCache, setProjectsCache] = useState<Record<string, any[]>>({});
    const [itemsCache, setItemsCache] = useState<Record<string, Inspection[]>>({});

    // 3. UI STATES
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [mobileStep, setMobileStep] = useState(0); // 0: Timeline, 1: Projects, 2: Items, 3: Full
    const [searchTerm, setSearchTerm] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
    const [colSizes, setColSizes] = useState([230, 200, 250, 0]);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 4. LOAD INITIAL TIMELINE
    useEffect(() => {
        const loadTimeline = async () => {
            if (timelineCache) {
                setGroupedTimeline(timelineCache.grouped);
                setTotalCount(timelineCache.total);
                return;
            }
            setIsLoadingTimeline(true);
            try {
                const rawData = await apiService.fetchInspectionTimeline();
                
                const groups: Record<string, Record<string, string[]>> = {};
                const yCounts: Record<string, number> = {};
                const mCounts: Record<string, number> = {};
                const dCounts: Record<string, number> = {};
                let total = 0;
                
                if (Array.isArray(rawData)) {
                    rawData.forEach((item: any) => {
                        const dateStr = item.date_str;
                        const count = Number(item.total_count || 0);
                        total += count;
                        
                        if (dateStr && dateStr.includes('-')) {
                            const [y, m] = dateStr.split('-');
                            const monthKey = `${y}-${m}`;
                            
                            if (!groups[y]) groups[y] = {};
                            if (!groups[y][m]) groups[y][m] = [];
                            groups[y][m].push(dateStr);

                            yCounts[y] = (yCounts[y] || 0) + count;
                            mCounts[monthKey] = (mCounts[monthKey] || 0) + count;
                            dCounts[dateStr] = count;
                        }
                    });
                }

                setGroupedTimeline(groups);
                setYearCounts(yCounts);
                setMonthCounts(mCounts);
                setDayCounts(dCounts);
                setTotalCount(total);
                
                // Auto expand current month
                const now = new Date();
                const curY = now.getFullYear().toString();
                const curM = (now.getMonth() + 1).toString().padStart(2, '0');
                setExpandedMonths({ [`${curY}-${curM}`]: true });

                setTimelineCache({ grouped: groups, total, yCounts, mCounts, dCounts });
            } catch (error) {
                console.error("Timeline error:", error);
            } finally {
                setIsLoadingTimeline(false);
            }
        };
        loadTimeline();
    }, [timelineCache]); // Added timelineCache dependency for stability

    const excelImportRef = useRef<HTMLInputElement>(null);

    // 5. HANDLERS
    const handleSelectDate = async (dateStr: string) => {
        setSelectedDate(dateStr);
        setSelectedProject(null);
        setCurrentItems([]);
        setMobileStep(1);

        if (projectsCache[dateStr]) {
            setProjects(projectsCache[dateStr]);
            return;
        }

        setIsLoadingProjects(true);
        try {
            const data = await apiService.fetchProjectsByDate(dateStr);
            const projectsArray = Array.isArray(data) ? data : [];
            setProjects(projectsArray);
            setProjectsCache(prev => ({ ...prev, [dateStr]: projectsArray }));
        } catch (error) {
            console.error("Projects error:", error);
        } finally {
            setIsLoadingProjects(false);
        }
    };

    const handleSelectProject = async (projectCode: string) => {
        setSelectedProject(projectCode);
        setMobileStep(2);

        const cacheKey = `${selectedDate}_${projectCode}`;
        if (itemsCache[cacheKey]) {
            setCurrentItems(itemsCache[cacheKey]);
            return;
        }

        setIsLoadingItems(true);
        try {
            const res = await apiService.fetchInspections({ 
                startDate: selectedDate || undefined, 
                endDate: selectedDate || undefined, 
                project: projectCode 
            });
            const items = res?.items || res?.inspections || [];
            setCurrentItems(items);
            setItemsCache(prev => ({ ...prev, [cacheKey]: items }));
        } catch (error) {
            console.error("Items error:", error);
        } finally {
            setIsLoadingItems(false);
        }
    };

    const handleSelectItem = async (item: Inspection) => {
        setSelectedItemDesktop(item);
        setMobileStep(3);
        setIsLoadingDetail(true);
        try {
            const detail = await apiService.fetchInspectionDetail(item.id);
            setSelectedItemDesktop(detail);
        } catch (error) {
            console.error("Detail error:", error);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await apiService.exportInspections({
                startDate: selectedDate || undefined,
                endDate: selectedDate || undefined,
                project: selectedProject || undefined
            });
            alert("Đã xuất dữ liệu Excel thành công!");
        } catch (error) {
            console.error("Export error:", error);
            alert("Xuất dữ liệu thất bại!");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await apiService.importInspectionsFile(file);
            alert("Nhập dữ liệu thành công!");
            // Refresh logic
            window.location.reload(); 
        } catch (error) {
            console.error("Import error:", error);
            alert("Nhập dữ liệu thất bại: " + (error instanceof Error ? error.message : String(error)));
        }
    };

    const startDrag = (index: number) => (e: React.MouseEvent) => {
        const startX = e.pageX;
        const startWidth = colSizes[index];
        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.pageX - startX;
            setColSizes(prev => {
                const next = [...prev];
                next[index] = Math.max(150, startWidth + delta);
                return next;
            });
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden relative font-sans text-slate-900">
            
            {/* TOOLBAR */}
            <div className="shrink-0 bg-[#f8fafc] px-6 py-4">
                <div className="max-w-full flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                        <button className="p-2 rounded-lg text-slate-400 hover:bg-slate-50"><LayoutGrid className="w-4.5 h-4.5" /></button>
                    </div>
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-300" />
                        <input 
                            type="text" placeholder="Tìm Dự án, Sản phẩm..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-slate-600 outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300 shadow-sm transition-all"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`p-3 bg-white border border-slate-200 text-slate-400 rounded-2xl hover:bg-slate-50 hover:text-slate-600 transition-all shadow-sm ${isFilterOpen ? 'bg-blue-50 text-blue-600' : ''}`}>
                            <Filter className="w-5 h-5" />
                        </button>
                        {isFilterOpen && (
                            <div className="absolute top-20 right-6 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-[100] p-4 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
                                <div className="flex justify-between items-center">
                                    <span className="font-black text-slate-800 uppercase tracking-widest text-xs">Bộ lọc</span>
                                    <button onClick={() => setIsFilterOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                                </div>
                                {/* Filter controls would go here to trigger re-fetching */}
                                <div className="p-2 bg-slate-100 rounded-lg text-xs text-slate-500 italic">Tính năng lọc đang được phát triển.</div>
                            </div>
                        )}
                        <input type="file" ref={excelImportRef} className="hidden" accept=".xlsx, .xls" onChange={handleImport} />
                        <button onClick={() => excelImportRef.current?.click()} className="p-3 bg-white border border-slate-200 text-slate-400 rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
                            <Download className="w-5 h-5 rotate-180" />
                        </button>
                        <button onClick={handleExport} className="p-3 bg-white border border-slate-200 text-slate-400 rounded-2xl hover:bg-slate-50 transition-all shadow-sm">
                            <Download className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-hidden flex flex-col pb-4 px-4 md:px-6 md:pb-6 gap-0 bg-[#f8fafc]">
                
                {/* HORIZONTAL SCROLL WRAPPER */}
                <div className="flex-1 h-full w-full overflow-hidden">
                    
                    {/* DESKTOP 4-COLUMN VIEW */}
                    <div className="h-full bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-row divide-x divide-slate-100 overflow-x-auto overflow-y-hidden min-w-full">
                        
                        {/* COL 1: TIMELINE */}
                    <div className={`flex flex-col bg-slate-50/20 overflow-hidden shrink-0 ${isMobile && mobileStep !== 0 ? 'hidden' : ''}`} style={{ width: isMobile ? '100%' : colSizes[0] }}>
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-1 justify-center shrink-0">
                            <h3 className="font-black text-slate-800 tracking-tighter text-[11px] uppercase">1. NGÀY THÁNG - {totalCount}</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
                            {Object.keys(groupedTimeline).sort((a,b)=>b.localeCompare(a)).map(year => (
                                <div key={year} className="space-y-1">
                                    <button 
                                        onClick={() => setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }))}
                                        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all ${expandedYears[year] ? 'bg-slate-100/50' : 'hover:bg-slate-100/30'}`}
                                    >
                                        <span className="text-[13px] font-black text-slate-800 uppercase tracking-tight">Năm {year}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-md text-slate-500 shadow-sm">{yearCounts[year]}</span>
                                            {expandedYears[year] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
                                        </div>
                                    </button>
                                    
                                    {expandedYears[year] && Object.keys(groupedTimeline[year] || {}).sort((a,b)=>b.localeCompare(a)).map(month => {
                                        const monthKey = `${year}-${month}`;
                                        const isMExpanded = expandedMonths[monthKey];
                                        return (
                                            <div key={monthKey} className="ml-4 space-y-1 border-l-2 border-slate-100 pl-2">
                                                <button 
                                                    onClick={() => setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }))}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all ${isMExpanded ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                                                >
                                                    <span className="text-[12px] font-bold">Tháng {month}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-black bg-slate-50 px-1.5 py-0.5 rounded text-slate-400">{monthCounts[monthKey]}</span>
                                                        {isMExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
                                                    </div>
                                                </button>
                                                
                                                {isMExpanded && (groupedTimeline[year]?.[month] || []).sort((a,b)=>b.localeCompare(a)).map(dateStr => (
                                                    <button 
                                                        key={dateStr} 
                                                        onClick={() => handleSelectDate(dateStr)} 
                                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all group ${selectedDate === dateStr ? 'bg-[#dbeafe] text-blue-700 font-black shadow-sm ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <CalendarDays className={`w-3.5 h-3.5 ${selectedDate === dateStr ? 'text-blue-600' : 'text-slate-300 group-hover:text-slate-400'}`} />
                                                            <span className="text-[12px]">{dateStr}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${selectedDate === dateStr ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                                {dayCounts[dateStr]}
                                                            </span>
                                                            <ChevronRight className={`w-3.5 h-3.5 ${selectedDate === dateStr ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    {!isMobile && <div className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 transition-colors z-10" onMouseDown={startDrag(0)} />}

                    {/* COL 2: PROJECTS */}
                    <div className={`flex flex-col bg-white overflow-hidden shrink-0 ${!isMobile ? 'border-r border-slate-100' : ''} ${isMobile && mobileStep !== 1 ? 'hidden' : ''}`} style={{ width: isMobile ? '100%' : colSizes[1] }}>

                        <div className="px-5 py-4 border-b border-slate-100 shrink-0 flex items-center gap-3">
                            {isMobile && (
                                <button onClick={() => setMobileStep(0)} className="text-slate-400 hover:text-slate-800 -ml-2 p-1">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                            )}
                            <h3 className="font-black text-slate-800 tracking-tighter text-[11px] uppercase truncate">2. CÔNG TRÌNH / DỰ ÁN - {projects.length}</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
                            {projects.map((p: any) => (
                                <button key={p.ma_ct} onClick={() => handleSelectProject(p.ma_ct)} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all group ${selectedProject === p.ma_ct ? 'bg-[#dbeafe] text-blue-700 font-bold shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
                                    <h4 className="font-black text-[13px] uppercase tracking-tight truncate mr-2">{p.ma_ct}</h4>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md transition-colors ${selectedProject === p.ma_ct ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                                        {p.total_count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {!isMobile && <div className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 transition-colors z-10" onMouseDown={startDrag(1)} />}

                    {/* COL 3: ITEMS */}
                    <div className={`flex flex-col bg-[#f8fafc]/50 overflow-hidden shrink-0 ${isMobile && mobileStep !== 2 ? 'hidden' : ''}`} style={{ width: isMobile ? '100%' : colSizes[2] }}>
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
                            {isMobile && (
                                <button onClick={() => setMobileStep(1)} className="text-slate-400 hover:text-slate-800 -ml-2 p-1">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                            )}
                            <h3 className="font-black text-slate-800 tracking-tighter text-[11px] uppercase truncate">3. HẠNG MỤC ({currentItems.length})</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
                            {currentItems.map(item => {
                                const cfg = (item.type && MODULE_CONFIG[item.type]) ? MODULE_CONFIG[item.type] : MODULE_CONFIG['PQC'];
                                const isSelected = selectedItemDesktop?.id === item.id;
                                const headCode = (item as any).headcode || (item as any).id_factory_order || item.ma_nha_may || item.id.slice(0, 8);
                                
                                return (
                                    <button key={item.id} onClick={() => handleSelectItem(item)} className={`w-full flex flex-col p-4 rounded-2xl text-left transition-all border ${isSelected ? 'bg-white border-blue-400 shadow-lg shadow-blue-600/5 ring-1 ring-blue-100' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-black text-slate-800 text-[13px] leading-tight flex-1 uppercase italic tracking-tighter pr-4">{item.ten_hang_muc}</h4>
                                            <div className="p-1.5 bg-blue-50 text-blue-500 rounded-lg shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /></div>
                                        </div>

                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[11px] font-black text-slate-400 tracking-wider font-mono">{headCode}</span>
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <Calendar className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-bold tracking-tight">03/05/2026</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase ring-1 ring-opacity-20 ${cfg.bg} ${cfg.color} ring-current`}>
                                                {item.type || 'PQC'}
                                            </span>
                                            <span className="text-[11px] font-black uppercase text-slate-500 tracking-tighter truncate max-w-[120px]">
                                                {item.inspectorName || '---'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {!isMobile && <div className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 transition-colors z-10" onMouseDown={startDrag(2)} />}


                    {/* COL 4: PREVIEW */}
                    <div className={`flex flex-col bg-white overflow-y-auto overflow-x-hidden relative ${isMobile && mobileStep !== 3 ? 'hidden' : 'flex-1 min-w-[400px]'}`} style={isMobile ? { width: '100%' } : {}}>
                        <div className="px-5 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                            <div className="flex items-center gap-3">
                                {isMobile && (
                                    <button onClick={() => setMobileStep(2)} className="text-slate-400 hover:text-slate-800 -ml-2 p-1">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                )}
                                <h3 className="font-black text-slate-800 tracking-tighter text-[11px] md:text-[11px] uppercase leading-none">4. CHI TIẾT</h3>
                            </div>
                            {selectedItemDesktop && (
                                <button onClick={() => onSelect(selectedItemDesktop.id)} className="bg-[#dbeafe] text-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 hover:text-white transition-all group">
                                    <span>MỞ ĐẦY ĐỦ</span>
                                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {!selectedItemDesktop ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-200 text-center opacity-70 scale-90 grayscale">
                                    <Info className="w-20 h-20 mb-6 opacity-20" />
                                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Chọn phiếu để xem nhanh</p>
                                </div>
                            ) : isLoadingDetail ? (
                                <div className="flex flex-col items-center justify-center h-full py-20 text-blue-600">
                                    <Loader2 className="w-10 h-10 animate-spin" />
                                    <p className="mt-4 text-[10px] font-black uppercase tracking-widest animate-pulse">Đang tải...</p>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto space-y-10 border border-slate-200 rounded-[2rem] p-6 md:p-10 bg-white shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                                     <div className="space-y-4">
                                        <div className="text-[11px] font-black text-blue-600 uppercase tracking-widest">{selectedItemDesktop.ten_ct || 'BIỆT THỰ STARLAKE HÀ NỘI'}</div>
                                         <h2 className="text-[18px] md:text-[22px] font-black text-slate-900 tracking-tighter leading-tight uppercase mt-1">
                                            {selectedItemDesktop.ten_hang_muc}
                                        </h2>
                                        <div className="flex items-center gap-3 mt-4">
                                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">PENDING</span>
                                            <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-black uppercase tracking-widest">{selectedItemDesktop.type || 'PQC'}</span>
                                            <span className="text-[12px] font-black text-slate-700 uppercase tracking-wider ml-1 font-mono">{(selectedItemDesktop as any).headcode || (selectedItemDesktop as any).id_factory_order || selectedItemDesktop.ma_nha_may || selectedItemDesktop.id.slice(0, 8)}</span>
                                        </div>
                                     </div>

                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8 py-2">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">XƯỞNG SẢN XUẤT:</label>
                                            <p className="font-medium text-slate-900 text-[14px]">{(selectedItemDesktop as any).workshop || '1006'}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">CÔNG ĐOẠN KIỂM TRA:</label>
                                            <p className="font-medium text-slate-900 text-[14px]">{(selectedItemDesktop as any).inspectionStage || 'P17 - Làm Nguội, Hoàn Thiện'}</p>
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">NGƯỜI KIỂM TRA:</label>
                                            <p className="font-medium text-slate-900 text-[14px] uppercase">{selectedItemDesktop.inspectorName || 'LÊ QUANG HUY'}</p>
                                        </div>
                                     </div>

                                     <div className="bg-[#f8fafc] rounded-[1.5rem] p-6">
                                        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-y-6 gap-x-4">
                                            {[
                                                { label: 'SL ĐƠN HÀNG', value: selectedItemDesktop.so_luong_ipo || '2', color: 'text-slate-800' },
                                                { label: 'ĐVT', value: selectedItemDesktop.dvt || 'PCS', color: 'text-slate-800' },
                                                { label: 'SL KIỂM', value: selectedItemDesktop.inspectedQuantity || '2', color: 'text-blue-600' },
                                                { label: 'PASS', value: selectedItemDesktop.inspectedQuantity || '2', color: 'text-emerald-500' },
                                                { label: 'FAIL', value: '0', color: 'text-red-500' },
                                                { label: '% PASS', value: '100.0%', color: 'text-emerald-500' },
                                                { label: '% FAIL', value: '0.0%', color: 'text-red-500' },
                                            ].map((col, idx) => (
                                                <div key={idx} className="space-y-1">
                                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{col.label}</div>
                                                    <div className={`text-[15px] font-black tracking-tight ${col.color}`}>{col.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                     </div>

                                     {selectedItemDesktop.images && selectedItemDesktop.images.length > 0 && (
                                        <div className="space-y-6 pt-2">
                                            <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">HÌNH ẢNH SẢN PHẨM ({selectedItemDesktop.images.length})</label>
                                            <div className="flex flex-wrap gap-3">
                                                {selectedItemDesktop.images?.slice(0, 8).map((img: any, i) => (
                                                    <div key={i} onClick={() => {
                                                        const imgList = selectedItemDesktop.images || [];
                                                        setLightboxState({ images: imgList.map((im: any) => typeof im === 'string' ? im : (im.file_url || im.url)), index: i });
                                                    }} className="w-[100px] h-[130px] overflow-hidden rounded-xl border-2 border-white shadow-sm hover:translate-y-[-4px] transition-transform duration-500 cursor-pointer shrink-0">
                                                        <ProxyImage src={typeof img === 'string' ? img : (img.file_url || img.url)} className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                     )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                </div>
            </div>

            {/* LIGHTBOX */}
            {lightboxState && (
                <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4">
                    <button 
                        className="absolute top-8 right-8 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all"
                        onClick={() => setLightboxState(null)}    
                    >
                        <X className="w-8 h-8" />
                    </button>

                    {lightboxState.images.length > 1 && (
                        <>
                            <button
                                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxState(prev => prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : null);
                                }}
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                            <button
                                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxState(prev => prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : null);
                                }}
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>
                        </>
                    )}

                    {(() => {
                        let src = lightboxState.images[lightboxState.index] || '';
                        let proxySrc = src.startsWith('http') ? src : (src.startsWith('/') ? src : `/${src}`);
                        if (proxySrc.startsWith('/api/')) {
                            const token = localStorage.getItem('aatn_qms_token');
                            if (token) {
                                const separator = proxySrc.includes('?') ? '&' : '?';
                                proxySrc += `${separator}token=${token}`;
                            }
                        }
                        return <img src={proxySrc} className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl" />;
                    })()}

                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 rounded-full text-white text-[11px] font-bold tracking-widest backdrop-blur-md">
                        {lightboxState.index + 1} / {lightboxState.images.length}
                    </div>
                </div>
            )}
        </div>
    );
};
