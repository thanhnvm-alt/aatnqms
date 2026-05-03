import React, { useEffect, useState, useRef } from 'react';
import { Loader2, Building2, ClipboardList, ChevronRight, Download, ChevronLeft, Upload, Search, Maximize2, LayoutGrid, X } from 'lucide-react';
import { IPODetail } from './IPODetail';
import { IPOItem, User, Project } from '../types';
import { exportIpoData, importIpoFile, fetchProjects, fetchPlansByProject, fetchIpoDetailExtended } from '../services/apiService';

export default function IPOPage({ user }: { user: User }) {
  // 1. DATA STATES
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentPlans, setCurrentPlans] = useState<IPOItem[]>([]);
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<any>(null);

  // 2. CACHE STATES
  const [projectsCache, setProjectsCache] = useState<any>(null);
  const [plansCache, setPlansCache] = useState<Record<string, IPOItem[]>>({});
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});

  // 3. UI STATES
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<IPOItem | null>(null);
  const [mobileStep, setMobileStep] = useState(0); // 0: Projects, 1: Plans, 2: Detail
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const [showFullDetail, setShowFullDetail] = useState(false);
  
  const [colSizes, setColSizes] = useState([300, 350]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 4. LOAD INITIAL PROJECTS
  useEffect(() => {
    const loadProjects = async () => {
      if (projectsCache && !searchTerm) {
        setProjects(projectsCache.items);
        return;
      }
      setIsLoadingProjects(true);
      try {
        const res = await fetchProjects(searchTerm, 1, 100);
        const fetchedProjects = res.items || [];
        setProjects(fetchedProjects);
        if (!searchTerm) {
          setProjectsCache({ items: fetchedProjects });
        }
      } catch (error) {
        console.error("Projects error:", error);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    
    const timeoutId = setTimeout(() => {
        loadProjects();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, projectsCache]);

  const handleSelectProject = async (proj: Project) => {
    setSelectedProject(proj);
    setSelectedPlan(null);
    setShowFullDetail(false);
    setMobileStep(1);

    const cacheKey = proj.ma_ct || proj.id;
    if (plansCache[cacheKey]) {
      setCurrentPlans(plansCache[cacheKey]);
      return;
    }

    setIsLoadingPlans(true);
    try {
      const plans = await fetchPlansByProject(cacheKey);
      const items = Array.isArray(plans) ? plans : (plans.items || []);
      setCurrentPlans(items);
      setPlansCache(prev => ({ ...prev, [cacheKey]: items }));
    } catch (error) {
      console.error("Plans error:", error);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const handleSelectPlan = async (plan: IPOItem) => {
    setSelectedPlan(plan);
    setMobileStep(2);
    
    // Check if drawing_url or data already exist in the plan to save extra calls if possible
    // But fetchIpoDetailExtended gets the extended info (history, drawings, etc)
    const cacheKey = plan.ma_nha_may;
    if (detailsCache[cacheKey]) {
      setSelectedPlanDetails(detailsCache[cacheKey]);
      return;
    }

    setIsLoadingDetail(true);
    try {
      const detail = await fetchIpoDetailExtended(cacheKey);
      setSelectedPlanDetails(detail);
      setDetailsCache(prev => ({ ...prev, [cacheKey]: detail }));
    } catch (error) {
      console.error("Detail error:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportIpoData();
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
      const result = await importIpoFile(file);
      alert(`Đã nhập thành công ${result.count} kế hoạch. Có ${result.errors?.length || 0} lỗi.`);
      window.location.reload();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Lỗi khi nhập file Excel');
    }
  };

  return (
        <div className="h-full flex flex-col bg-[#f0f2f5] font-sans">
            {/* TOP BAR */}
            <div className="shrink-0 bg-white px-4 md:px-6 py-3 border-b border-slate-200 z-20 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md">
                        <LayoutGrid className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-sm md:text-base font-black text-slate-800 uppercase tracking-tight">Kế hoạch IPO</h1>
                        <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider">
                            <span>{projects.length} DỰ ÁN</span>
                            {selectedProject && (
                                <>
                                    <ChevronRight className="w-3 h-3 text-slate-300" />
                                    <span className="text-blue-600">{currentPlans.length} HẠNG MỤC</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="relative hidden md:flex">
                         <input 
                              type="text" 
                              placeholder="Tìm kiếm dự án..." 
                              className="w-60 pl-10 pr-4 h-11 bg-[#f8fafc] border border-slate-200 rounded-full text-[11px] font-black text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                          />
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>

                    {user?.role !== 'QC' && (
                        <div className="flex gap-2 shrink-0">
                            <button 
                                onClick={handleExport}
                                disabled={isExporting}
                                className="p-2.5 md:p-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full transition-all disabled:opacity-50"
                                title="Xuất Excel Dữ Liệu"
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            </button>
                            <input type="file" id="ipo-import" className="hidden" onChange={handleImport} accept=".xlsx, .xls"/>
                            <label htmlFor="ipo-import" className="p-2.5 md:p-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-full transition-all cursor-pointer text-[10px] font-black uppercase flex items-center gap-2">
                                <Upload className="w-4 h-4" /> <span className="hidden md:inline">Nhập IPO</span>
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 overflow-hidden flex flex-col pb-4 px-4 md:px-6 md:pb-6 gap-0 bg-[#f8fafc] pt-4 md:pt-6">
                <div className="flex-1 h-full w-full overflow-hidden">
                    <div className="h-full bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-row divide-x divide-slate-100 overflow-x-auto overflow-y-hidden min-w-full">
                        
                        {/* COL 1: PROJECTS */}
                        <div className={`flex flex-col bg-slate-50/30 overflow-hidden shrink-0 ${isMobile && mobileStep !== 0 ? 'hidden' : ''}`} style={{ width: isMobile ? '100%' : colSizes[0] }}>
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <h3 className="font-black text-slate-800 tracking-tighter text-[11px] uppercase">1. MÃ CÔNG TRÌNH / DỰ ÁN</h3>
                            </div>
                            
                            {isMobile && (
                                <div className="p-4 border-b border-slate-100 shrink-0">
                                    <div className="relative">
                                         <input 
                                              type="text" 
                                              placeholder="Tìm kiếm dự án..." 
                                              className="w-full pl-10 pr-4 h-10 bg-white border border-slate-200 rounded-2xl text-[11px] font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                                              value={searchTerm}
                                              onChange={(e) => setSearchTerm(e.target.value)}
                                          />
                                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                                {isLoadingProjects ? (
                                    <div className="flex flex-col items-center justify-center h-40">
                                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                    </div>
                                ) : projects.map((proj, idx) => (
                                    <button
                                        key={`${proj.ma_ct || proj.id}-${idx}`}
                                        onClick={() => handleSelectProject(proj)}
                                        className={`w-full text-left p-3.5 rounded-2xl transition-all border ${selectedProject?.ma_ct === proj.ma_ct ? 'bg-white border-blue-400 shadow-md ring-1 ring-blue-100' : 'bg-white/50 border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl shrink-0 ${selectedProject?.ma_ct === proj.ma_ct ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <Building2 className="w-4 h-4" />
                                            </div>
                                            <div className="overflow-hidden">
                                                <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase font-mono mb-1 truncate">{proj.ma_ct}</div>
                                                <div className="text-[12px] font-bold text-slate-800 leading-tight truncate uppercase">{proj.ten_ct || proj.name}</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                                {projects.length === 0 && !isLoadingProjects && (
                                    <div className="text-center p-4 text-slate-400 text-[11px] font-bold uppercase mt-4">Không tìm thấy dự án</div>
                                )}
                            </div>
                        </div>

                        {/* COL 2: HẠNG MỤC */}
                        <div className={`flex flex-col bg-[#f8fafc] overflow-hidden shrink-0 ${isMobile && mobileStep !== 1 ? 'hidden' : ''}`} style={{ width: isMobile ? '100%' : colSizes[1] }}>
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                                <div className="flex items-center gap-3">
                                    {isMobile && (
                                        <button onClick={() => setMobileStep(0)} className="p-1.5 -ml-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                    )}
                                    <h3 className="font-black text-slate-800 tracking-tighter text-[11px] uppercase">2. HẠNG MỤC IPO ({currentPlans.length})</h3>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                {!selectedProject ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                                        <Building2 className="w-12 h-12 mb-4 opacity-20" />
                                        <p className="text-[11px] font-bold uppercase tracking-widest">Chọn một dự án ở cột 1</p>
                                    </div>
                                ) : isLoadingPlans ? (
                                    <div className="flex flex-col items-center justify-center h-40">
                                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                    </div>
                                ) : currentPlans.length === 0 ? (
                                    <div className="text-center p-4 text-slate-400 text-[11px] font-bold uppercase mt-4">Chưa có hạng mục cho dự án này</div>
                                ) : currentPlans.map((plan, idx) => (
                                    <button 
                                        key={`${plan.ma_nha_may}-${idx}`} 
                                        onClick={() => handleSelectPlan(plan)} 
                                        className={`w-full flex flex-col gap-3 p-4 rounded-2xl text-left transition-all border ${selectedPlan?.ma_nha_may === plan.ma_nha_may ? 'bg-white border-blue-400 shadow-lg ring-1 ring-blue-100' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <div className="text-[10px] font-black text-slate-400 tracking-wider font-mono">{plan.ma_nha_may}</div>
                                        <h4 className="font-bold text-slate-800 text-[13px] leading-tight uppercase line-clamp-2">{plan.ten_hang_muc}</h4>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SỐ LƯỢNG IPO:</span>
                                            <span className="text-[12px] font-black text-blue-600 tracking-tight">{plan.so_luong_ipo} <span className="text-[9px] text-slate-400 ml-0.5 uppercase">{plan.dvt}</span></span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* COL 3: CHI TIẾT HẠNG MỤC */}
                        <div className={`flex flex-col bg-white overflow-y-auto overflow-x-hidden relative ${isMobile && mobileStep !== 2 ? 'hidden' : 'flex-1 min-w-[300px]'}`} style={isMobile ? { width: '100%' } : {}}>
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 sticky top-0 bg-white/90 backdrop-blur-md z-10">
                                <div className="flex items-center gap-3">
                                    {isMobile && (
                                        <button onClick={() => setMobileStep(1)} className="p-1.5 -ml-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                    )}
                                    <h3 className="font-black text-slate-800 tracking-tighter text-[11px] uppercase">3. CHI TIẾT HẠNG MỤC</h3>
                                </div>
                                {selectedPlan && (
                                    <button 
                                        onClick={() => setShowFullDetail(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors text-[10px] font-black uppercase tracking-widest"
                                    >
                                        MỞ ĐẦY ĐỦ <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto w-full">
                                {!selectedPlan ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                                        <ClipboardList className="w-16 h-16 mb-4 opacity-10" />
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Chọn một hạng mục ở cột 2</p>
                                    </div>
                                ) : isLoadingDetail ? (
                                    <div className="flex flex-col items-center justify-center h-64">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                        <p className="mt-4 text-[10px] font-black uppercase tracking-widest animate-pulse text-slate-400">Đang tải chi tiết...</p>
                                    </div>
                                ) : (
                                    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
                                        
                                        <div className="space-y-3">
                                            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-black uppercase tracking-widest font-mono">
                                                {selectedPlan.ma_nha_may}
                                            </div>
                                            <h2 className="text-[18px] md:text-[22px] font-black text-slate-900 tracking-tight leading-tight uppercase">
                                                {selectedPlan.ten_hang_muc}
                                            </h2>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] p-6">
                                            <div className="space-y-1.5 col-span-2 md:col-span-1 border-r border-slate-200">
                                                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SỐ LƯỢNG IPO</h4>
                                                <p className="text-2xl font-black text-slate-800">{selectedPlan.so_luong_ipo} <span className="text-[10px] text-slate-400 uppercase">{selectedPlan.dvt}</span></p>
                                            </div>
                                            <div className="space-y-1.5 col-span-2 md:col-span-3 pl-2">
                                                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DỰ ÁN TƯƠNG ỨNG</h4>
                                                <p className="text-[13px] font-bold text-slate-700 uppercase leading-snug">{selectedProject?.ten_ct || selectedPlan.ten_ct}</p>
                                                <p className="text-[10px] font-black text-slate-400 uppercase font-mono mt-1">{selectedProject?.ma_ct || selectedPlan.ma_ct}</p>
                                            </div>
                                        </div>

                                        {selectedPlanDetails && selectedPlanDetails.drawings && selectedPlanDetails.drawings.length > 0 && (
                                            <div className="space-y-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center border-b border-slate-100 pb-2">BẢN VẼ / TÀI LIỆU CÓ SẴN ({selectedPlanDetails.drawings.length})</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {selectedPlanDetails.drawings.slice(0, 6).map((doc: any, i: number) => (
                                                        <div key={i} className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col gap-2 shadow-sm">
                                                            <div className="text-[11px] font-bold text-slate-800 uppercase truncate" title={doc.drawing_name}>{doc.drawing_name}</div>
                                                            <div className="flex justify-between items-center text-[9px] font-black text-slate-400">
                                                                <span>VER: {doc.version || '1.0'}</span>
                                                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">XEM TỆP <Maximize2 className="w-3 h-3" /></a>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedPlanDetails && selectedPlanDetails.materials && selectedPlanDetails.materials.length > 0 && (
                                            <div className="space-y-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center border-b border-slate-100 pb-2">VẬT TƯ CHÍNH ({selectedPlanDetails.materials.length})</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedPlanDetails.materials.slice(0, 15).map((mat: any, i: number) => (
                                                        <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold shadow-sm border border-slate-200 uppercase">{mat.material_name}</span>
                                                    ))}
                                                    {selectedPlanDetails.materials.length > 15 && <span className="px-2.5 py-1 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-bold uppercase">...</span>}
                                                </div>
                                            </div>
                                        )}

                                        {(!selectedPlanDetails || (selectedPlanDetails?.drawings?.length === 0 && selectedPlanDetails?.materials?.length === 0)) && (
                                            <div className="text-center p-8 bg-slate-50 rounded-[1.5rem] border border-slate-100 border-dashed">
                                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Chưa có thông tin bổ sung</p>
                                                <button onClick={() => setShowFullDetail(true)} className="mt-4 px-4 py-2 bg-white border border-slate-200 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">Thêm thông tin</button>
                                            </div>
                                        )}

                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* FULL DETAIL MODAL */}
            {showFullDetail && selectedPlan && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom-2 duration-300">
                    <div className="absolute top-4 left-4 md:top-6 md:left-6 z-[110]">
                        <button 
                            onClick={() => setShowFullDetail(false)}
                            className="p-3 bg-white/80 hover:bg-white text-slate-800 rounded-full shadow-lg border border-slate-200 transition-all backdrop-blur-md"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        <IPODetail 
                            item={selectedPlan}
                            onBack={() => setShowFullDetail(false)}
                            onCreateInspection={() => {}}
                            onViewInspection={() => {}}
                            onUpdatePlan={async () => {}}
                        />
                    </div>
                </div>
            )}
        </div>
  );
}
