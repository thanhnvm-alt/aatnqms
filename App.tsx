
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState, Inspection, PlanItem, CheckItem, User, ModuleId, Workshop } from './types';
import { 
  INITIAL_CHECKLIST_TEMPLATE, 
  MOCK_USERS, 
  MOCK_INSPECTIONS, 
  MOCK_WORKSHOPS, 
  IQC_CHECKLIST_TEMPLATE,
  PQC_CHECKLIST_TEMPLATE,
  SQC_MAT_CHECKLIST_TEMPLATE,
  SQC_BTP_CHECKLIST_TEMPLATE,
  FSR_CHECKLIST_TEMPLATE
} from './constants';
import { Dashboard } from './components/Dashboard';
import { InspectionList } from './components/InspectionList';
import { InspectionForm } from './components/InspectionForm';
import { InspectionDetail } from './components/InspectionDetail';
import { PlanList } from './components/PlanList';
import { PlanDetail } from './components/PlanDetail';
import { Settings } from './components/Settings';
import { HomeMenu } from './components/HomeMenu';
import { AIChatbox } from './components/AIChatbox';
import { LoginPage } from './components/LoginPage';
import { ThreeDConverter } from './components/ThreeDConverter';
import { 
  fetchPlans, 
  fetchInspections, 
  saveInspectionToSheet, 
  deleteInspectionFromSheet, 
  checkApiConnection,
  fetchUsers,
  saveUser,
  deleteUser,
  fetchWorkshops,
  saveWorkshop,
  deleteWorkshop,
  fetchTemplates,
  saveTemplate,
  importPlans,
  importUsers,
  importInspections
} from './services/apiService';
import { 
  LayoutDashboard, List, Plus, Settings as SettingsIcon, FileSpreadsheet, 
  Home, LogOut, Box, WifiOff, QrCode, Zap, X, 
  User as UserIcon, Shield, UserCircle, Menu, PanelLeftClose, PanelLeftOpen,
  FileText, ChevronDown
} from 'lucide-react';
// @ts-ignore
import jsQR from 'jsqr';

// Key for storage
const AUTH_STORAGE_KEY = 'aatn_auth_storage';
const SIDEBAR_PREF_KEY = 'aatn_sidebar_collapsed';

interface MobileNavItemProps {
  viewName: ViewState;
  label: string;
  icon: React.ElementType;
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
}

const MobileNavItem: React.FC<MobileNavItemProps> = ({ viewName, label, icon: Icon, currentView, onNavigate }) => {
  const isActive = currentView === viewName || (viewName === 'LIST' && (currentView === 'DETAIL' || currentView === 'FORM'));
  return (
    <button 
      onClick={() => onNavigate(viewName)} 
      className={`flex flex-col items-center justify-center w-full py-2 transition-all duration-300 relative group active:scale-95 ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {isActive && <div className="absolute -top-0.5 w-10 h-1 bg-blue-600 rounded-full shadow-[0_2px_8px_rgba(37,99,235,0.5)] animate-in fade-in zoom-in duration-300"></div>}
      <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-blue-50/50 stroke-[2.5px]' : ''}`} />
      <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
    </button>
  );
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('HOME');
  const [currentModule, setCurrentModule] = useState<string>('ALL');
  const [inspections, setInspections] = useState<Inspection[]>([]); 
  
  // Plans State
  const [plans, setPlans] = useState<PlanItem[]>([]); 
  const [planPage, setPlanPage] = useState(1);
  const [totalPlans, setTotalPlans] = useState(0);
  const [planSearchTerm, setPlanSearchTerm] = useState('');
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  
  // Settings Tab State
  const [settingsInitialTab, setSettingsInitialTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE'>('PROFILE');

  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [workshops, setWorkshops] = useState<Workshop[]>(MOCK_WORKSHOPS);

  const [templates, setTemplates] = useState<Record<string, CheckItem[]>>({
      'SITE': INITIAL_CHECKLIST_TEMPLATE,
      'PQC': PQC_CHECKLIST_TEMPLATE,
      'IQC': IQC_CHECKLIST_TEMPLATE,
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE,
      'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE,
      'FSR': FSR_CHECKLIST_TEMPLATE
  });

  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [initialFormState, setInitialFormState] = useState<Partial<Inspection> | undefined>(undefined);

  // Scanner & Module Selection State
  const [showScanner, setShowScanner] = useState(false);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  
  // New States for Scan Flow
  const [isScanSelectionMode, setIsScanSelectionMode] = useState(false);
  const [preSelectedModule, setPreSelectedModule] = useState<string | null>(null);

  const [pendingInspectionData, setPendingInspectionData] = useState<Partial<Inspection> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // User Menu State for QC
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isModuleMenuOpen, setIsModuleMenuOpen] = useState(false);
  const moduleMenuRef = useRef<HTMLDivElement>(null);

  // --- SIDEBAR STATE LOGIC ---
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_PREF_KEY);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const isQC = user?.role === 'QC';

  useEffect(() => {
    const handleResize = () => {
      if (user?.role === 'QC') {
        if (!isSidebarCollapsed) setIsSidebarCollapsed(true);
        return;
      }
      if (window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      } else {
        try {
          const savedPref = localStorage.getItem(SIDEBAR_PREF_KEY);
          const prefValue = savedPref ? JSON.parse(savedPref) : false;
          setIsSidebarCollapsed(prefValue);
        } catch {
          setIsSidebarCollapsed(false);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (moduleMenuRef.current && !moduleMenuRef.current.contains(event.target as Node)) {
            setIsModuleMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSidebar = () => {
    if (isQC) return;
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem(SIDEBAR_PREF_KEY, JSON.stringify(newState));
  };

  // --- AUTH FLOW ---
  useEffect(() => {
    const tryAutoLogin = () => {
        const localData = localStorage.getItem(AUTH_STORAGE_KEY);
        if (localData) {
            try {
                const parsedUser = JSON.parse(localData);
                setUser(parsedUser);
                if (parsedUser.role === 'QC') setView('LIST');
                else if (parsedUser.role === 'ADMIN') setView('DASHBOARD');
                else setView('HOME');
                return;
            } catch (e) {
                console.error("Auth storage corrupted", e);
                localStorage.removeItem(AUTH_STORAGE_KEY);
            }
        }
        const sessionData = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (sessionData) {
            try {
                const parsedUser = JSON.parse(sessionData);
                setUser(parsedUser);
                if (parsedUser.role === 'QC') setView('LIST');
                else if (parsedUser.role === 'ADMIN') setView('DASHBOARD');
                else setView('HOME');
            } catch (e) {
                sessionStorage.removeItem(AUTH_STORAGE_KEY);
            }
        }
    };

    tryAutoLogin();
    checkConn();
    // Only load initial data if we think we have a connection
    loadUsers();
    loadWorkshops();
    loadTemplates();
  }, []);

  const handleLogin = (loggedInUser: User, remember: boolean) => {
      const { password, ...safeUser } = loggedInUser;
      setUser(safeUser as User); 
      if (remember) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
          sessionStorage.removeItem(AUTH_STORAGE_KEY);
      } else {
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
          localStorage.removeItem(AUTH_STORAGE_KEY);
      }
      if (safeUser.role === 'QC') setView('LIST');
      else if (safeUser.role === 'ADMIN') setView('DASHBOARD');
      else setView('HOME');
  };

  const handleLogout = () => {
      setUser(null);
      setView('HOME');
      setIsUserMenuOpen(false);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  useEffect(() => {
    if (user) {
        loadInspections();
    }
  }, [user]);

  // Reload plans when user is present OR search/page changes
  useEffect(() => {
      if (user) {
          loadPlans();
      }
  }, [user, planPage, planSearchTerm]);

  const checkConn = async () => {
      try {
        const status = await checkApiConnection();
        setConnectionError(!status.ok);
      } catch (e) {
        setConnectionError(true);
      }
  };

  const loadTemplates = async () => {
      try {
          const data = await fetchTemplates();
          if (Object.keys(data).length > 0) {
              setTemplates(prev => ({ ...prev, ...data }));
          }
      } catch (e) {
          console.warn("Using default templates");
      }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      if (data.length > 0) setUsers(data);
    } catch (e) {}
  };

  const loadWorkshops = async () => {
    try {
      const data = await fetchWorkshops();
      if (data.length > 0) setWorkshops(data);
    } catch (e) {}
  };

  const loadPlans = async (forceRefresh: boolean = false) => {
    if (isLoadingPlans && !forceRefresh) return;
    setIsLoadingPlans(true);
    try {
        const result = await fetchPlans(planSearchTerm, planPage, 2000);
        setPlans(result.items);
        setTotalPlans(result.total);
        setConnectionError(false);
    } catch (e) {
        console.error("Error loading plans:", e);
        setConnectionError(true);
    } finally {
        setIsLoadingPlans(false);
    }
  };

  const loadInspections = async () => {
    setIsLoadingInspections(true);
    try {
        const data = await fetchInspections();
        setInspections(data || []);
        setConnectionError(false);
    } catch (e) {
        setConnectionError(true);
        setInspections(MOCK_INSPECTIONS);
    } finally {
        setIsLoadingInspections(false);
    }
  };

  const handleSaveInspection = async (newInspection: Inspection) => {
    setInspections(prev => {
        const exists = prev.some(i => i.id === newInspection.id);
        if (exists) return prev.map(i => i.id === newInspection.id ? newInspection : i);
        return [newInspection, ...prev];
    });
    setView('LIST');
    await saveInspectionToSheet(newInspection);
  };

  const handleImportInspections = async (data: Inspection[]) => {
      await importInspections(data);
      loadInspections();
  };

  const handleUpdateTemplate = async (moduleId: string, items: CheckItem[]) => {
      setTemplates(prev => ({ ...prev, [moduleId]: items }));
      await saveTemplate(moduleId, items);
  };

  const handlePlanSelect = (item: PlanItem, customItems?: CheckItem[]) => {
      const targetModule = 'PQC';
      setCurrentModule(targetModule);
      
      const partialData: Partial<Inspection> = {
          ma_ct: item.ma_ct,
          ten_ct: item.ten_ct,
          inspectorName: user?.name || '', 
          ten_hang_muc: item.ten_hang_muc,
          ma_nha_may: item.ma_nha_may,
          headcode: item.headcode,
          dvt: item.dvt,
          so_luong_ipo: item.so_luong_ipo,
          date: new Date().toISOString().split('T')[0],
          type: targetModule, 
          items: customItems || templates[targetModule] || templates['PQC']
      };
      setInitialFormState(partialData);
      setSelectedInspectionId(null);
      setView('FORM');
  };

  const handleViewPlan = (item: PlanItem) => {
      setSelectedPlan(item);
  };

  // --- NEW: Module Selection Handler ---
  const handleSelectModule = (moduleId: string) => {
      // 1. Scan Mode Selection
      if (isScanSelectionMode) {
          setPreSelectedModule(moduleId);
          setShowModuleSelector(false);
          setIsScanSelectionMode(false);
          // Launch Scanner AFTER module selection
          setShowScanner(true);
          return;
      }

      // 2. Normal Mode (Manual Create or Post-Scan)
      const template = templates[moduleId] || [];
      const baseData = pendingInspectionData || {};
      
      const newFormState: Partial<Inspection> = {
          ...baseData,
          type: moduleId as any,
          inspectorName: user?.name || '',
          date: new Date().toISOString().split('T')[0],
          items: template
      };
      
      setInitialFormState(newFormState);
      setCurrentModule(moduleId as any); 
      setSelectedInspectionId(null);
      setShowModuleSelector(false);
      setPendingInspectionData(null);
      setView('FORM');
  };

  // Scanner Logic
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (showScanner) {
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current && stream) {
              videoRef.current.srcObject = stream;
              videoRef.current.setAttribute('playsinline', 'true');
              videoRef.current.play();
              requestRef.current = requestAnimationFrame(tick);
          }
        } catch (err) {
          alert('Không thể truy cập camera. Vui lòng cấp quyền.');
          setShowScanner(false);
        }
      };
      startCamera();
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [showScanner]);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
             const scannedData = code.data.trim();
             
             // Quick find in currently loaded plans
             let matchingPlan = plans.find(p => String(p.headcode).toLowerCase() === scannedData.toLowerCase());
             if (!matchingPlan) {
                 matchingPlan = plans.find(p => String(p.ma_nha_may).toLowerCase() === scannedData.toLowerCase());
             }
             
             const partialData: Partial<Inspection> = {};

             if (matchingPlan) {
                partialData.ma_ct = matchingPlan.ma_ct;
                partialData.ten_ct = matchingPlan.ten_ct;
                partialData.ten_hang_muc = matchingPlan.ten_hang_muc;
                partialData.ma_nha_may = matchingPlan.ma_nha_may;
                partialData.headcode = matchingPlan.headcode;
                partialData.dvt = matchingPlan.dvt;
                partialData.so_luong_ipo = matchingPlan.so_luong_ipo;
             } else {
                partialData.ma_nha_may = scannedData;
             }

             // --- NEW: Handle Pre-selected Module ---
             if (preSelectedModule) {
                 // Use pre-selected module directly
                 const template = templates[preSelectedModule] || [];
                 const newFormState = {
                     ...partialData,
                     type: preSelectedModule as any,
                     items: template,
                     inspectorName: user?.name || '',
                     date: new Date().toISOString().split('T')[0],
                 };
                 setInitialFormState(newFormState);
                 setCurrentModule(preSelectedModule); // Optional: Switch view context to module
                 setPreSelectedModule(null); // Reset
                 
                 setShowScanner(false);
                 setView('FORM');
             } else {
                 // Fallback to old behavior (Select Module AFTER Scanning)
                 setPendingInspectionData(partialData);
                 setShowScanner(false);
                 setShowModuleSelector(true);
             }
             return;
          }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

  const MODULE_TABS = [
      { id: 'IQC', label: 'IQC' },
      { id: 'SQC_MAT', label: 'SQC-MAT' },
      { id: 'SQC_BTP', label: 'SQC-BTP' },
      { id: 'PQC', label: 'PQC' },
      { id: 'FSR', label: 'FSR' },
      { id: 'SITE', label: 'SITE' }
  ];

  const visibleModules = useMemo(() => {
      if (!user) return [];
      if (user.role === 'ADMIN') return MODULE_TABS;
      if (user.allowedModules && user.allowedModules.length > 0) {
          return MODULE_TABS.filter(tab => user.allowedModules?.includes(tab.id as ModuleId));
      }
      return [];
  }, [user]);

  useEffect(() => {
      if (visibleModules.length > 0 && currentModule !== 'ALL') {
          const isCurrentValid = visibleModules.some(m => m.id === currentModule);
          if (!isCurrentValid) {
              setCurrentModule(visibleModules[0].id);
          }
      }
  }, [visibleModules]);

  const renderContent = () => {
    if (!user) return null;
    if (isQC && view !== 'LIST' && view !== 'FORM' && view !== 'DETAIL' && view !== 'SETTINGS') {
        return <div className="p-4 text-center">Redirecting...</div>;
    }

    const content = (() => {
        switch (view) {
          case 'HOME': return (
            <HomeMenu 
                onNavigate={(id) => { 
                    if(['SITE','PQC','IQC','SQC_MAT','SQC_BTP','FSR'].includes(id)){
                        setCurrentModule(id as any); 
                        setView('LIST');
                    } else if(id==='CONVERT_3D') setView('CONVERT_3D'); 
                }} 
                currentUser={user} 
                onLogout={handleLogout}
                onOpenSettings={() => { setSettingsInitialTab('PROFILE'); setView('SETTINGS'); }}
                onOpenProfile={() => { setSettingsInitialTab('PROFILE'); setView('SETTINGS'); }}
            />
          );
          case 'DASHBOARD': return <Dashboard inspections={inspections} />;
          case 'PLAN': return (
            <>
              <PlanList 
                items={plans} 
                inspections={inspections}
                onSelect={handlePlanSelect} 
                onViewInspection={(id) => { setSelectedInspectionId(id); setView('DETAIL'); }}
                onRefresh={() => loadPlans(true)} 
                onImportPlans={importPlans}
                searchTerm={planSearchTerm} 
                onSearch={(term) => { setPlanSearchTerm(term); setPlanPage(1); }} 
                isLoading={isLoadingPlans} 
                totalItems={totalPlans}
                currentPage={planPage}
                itemsPerPage={2000}
                onPageChange={setPlanPage}
                defaultTemplate={templates['PQC']} 
                onViewPlan={handleViewPlan}
              />
              {selectedPlan && (
                <PlanDetail 
                    item={selectedPlan} 
                    onBack={() => setSelectedPlan(null)} 
                    onCreateInspection={(customItems) => {
                        handlePlanSelect(selectedPlan, customItems);
                        setSelectedPlan(null);
                    }} 
                />
              )}
            </>
          );
          case 'PLAN_DETAIL': return null;
          case 'SETTINGS': return (
            <Settings 
                currentUser={user}
                allTemplates = {templates}
                onSaveTemplate = {handleUpdateTemplate}
                onClose = {() => { isQC ? setView('LIST') : setView('HOME'); }}
                users = {users}
                onAddUser = {async u => { await saveUser(u); loadUsers(); }}
                onUpdateUser = {async u => { 
                    await saveUser(u); 
                    loadUsers(); 
                    if (u.id === user.id) {
                        setUser(u);
                        if (localStorage.getItem(AUTH_STORAGE_KEY)) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
                        else sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
                    }
                }}
                onDeleteUser = {async id => { await deleteUser(id); loadUsers(); }}
                onImportUsers={async (u) => { await importUsers(u); loadUsers(); }}
                workshops = {workshops}
                onAddWorkshop = {async w => { await saveWorkshop(w); loadWorkshops(); }}
                onUpdateWorkshop = {async w => { await saveWorkshop(w); loadWorkshops(); }}
                onDeleteWorkshop = {async id => { await deleteWorkshop(id); loadWorkshops(); }}
                onCheckConnection = {async () => { const s = await checkApiConnection(); setConnectionError(!s.ok); return s.ok; }}
                initialTab={settingsInitialTab}
            />
          );
          case 'CONVERT_3D': return <ThreeDConverter />;
          case 'LIST': return (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header/Filter Area */}
              {isQC && isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px]" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className="absolute top-14 right-4 z-[70] w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-1 animate-in zoom-in-95 slide-in-from-top-2 duration-200 origin-top-right overflow-hidden">
                     <div className="p-4 border-b border-slate-50 flex items-center gap-3 bg-slate-50/50">
                        <div className="w-12 h-12 rounded-full border-2 border-white shadow-md overflow-hidden relative shrink-0">
                            <img src={user.avatar} className="w-full h-full object-cover" alt="User" />
                        </div>
                        <div className="overflow-hidden">
                           <p className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{user.name}</p>
                           <p className="text-xs text-slate-500 font-mono font-medium">{user.msnv || 'QC Staff'}</p>
                        </div>
                     </div>
                     <div className="p-2 space-y-1">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl mb-2 border border-slate-100">
                           <div className="flex items-center gap-2">
                              <Shield className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-xs font-bold text-slate-500">Vai trò</span>
                           </div>
                           <span className="text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">{user.role}</span>
                        </div>
                        <button 
                           onClick={() => { 
                               setIsUserMenuOpen(false);
                               setSettingsInitialTab('PROFILE');
                               setView('SETTINGS');
                           }}
                           className="w-full flex items-center gap-3 px-3 py-3 text-slate-600 hover:bg-blue-50 rounded-xl transition-colors font-bold text-sm group"
                        >
                           <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                              <UserCircle className="w-4 h-4" />
                           </div>
                           Thông tin cá nhân
                        </button>
                        <button 
                           onClick={handleLogout}
                           className="w-full flex items-center gap-3 px-3 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-bold text-sm group"
                        >
                           <div className="p-1.5 bg-red-100 text-red-600 rounded-lg group-hover:bg-red-200 transition-colors">
                              <LogOut className="w-4 h-4" />
                           </div>
                           Đăng xuất
                        </button>
                     </div>
                  </div>
                </>
              )}

              <div className="flex-none px-4 pt-4 pb-2">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                        <List className="w-5 h-5 text-blue-600" />
                        <span className="hidden sm:inline truncate">Danh sách kiểm tra</span>
                        <span className="sm:hidden">DS Kiểm Tra</span>
                    </h2>
                    
                    {/* Module Selection Dropdown */}
                    <div className="relative" ref={moduleMenuRef}>
                        <button 
                            onClick={() => setIsModuleMenuOpen(!isModuleMenuOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-all active:scale-95"
                        >
                            <span className="uppercase tracking-wide">{currentModule === 'ALL' ? 'Tất cả' : visibleModules.find(m => m.id === currentModule)?.label}</span>
                            <div className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${currentModule !== 'ALL' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                {currentModule === 'ALL' ? inspections.length : inspections.filter(i => i.type === currentModule).length}
                            </div>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isModuleMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isModuleMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in duration-200 origin-top-left">
                                <button
                                    onClick={() => { setCurrentModule('ALL'); setIsModuleMenuOpen(false); }}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide transition-colors ${
                                        currentModule === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>Tất cả</span>
                                    <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px]">{inspections.length}</span>
                                </button>
                                <div className="h-px bg-slate-50 my-1"></div>
                                {visibleModules.map(mod => {
                                    const count = inspections.filter(i => i.type === mod.id).length;
                                    return (
                                        <button
                                            key={mod.id}
                                            onClick={() => { setCurrentModule(mod.id as any); setIsModuleMenuOpen(false); }}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide transition-colors ${
                                                currentModule === mod.id ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span>{mod.label}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] ${currentModule === mod.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <button 
                        onClick={() => {
                            // NEW FLOW: Show Module Selector FIRST, set Scan Mode
                            setPendingInspectionData(null);
                            setIsScanSelectionMode(true);
                            setShowModuleSelector(true);
                        }}
                        className="group p-2.5 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-black active:scale-95 transition-all flex items-center justify-center border border-slate-700"
                        title="Quét QR Code tạo phiếu"
                    >
                        <QrCode className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                    <button 
                        onClick={() => { 
                            // Manual Creation
                            setPendingInspectionData({}); 
                            setIsScanSelectionMode(false);
                            setShowModuleSelector(true);
                        }} 
                        className="bg-blue-600 text-white p-2.5 md:px-4 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 flex items-center transition-transform active:scale-95 whitespace-nowrap"
                    >
                        <Plus className="w-5 h-5 md:mr-2" /> 
                        <span className="hidden md:inline font-bold">Tạo mới</span>
                    </button>
                    {isQC && (
                        <button 
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className="relative w-10 h-10 rounded-full border-2 border-white shadow-md overflow-hidden active:scale-95 transition-transform ml-1"
                        >
                            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                        </button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Scrollable List */}
              <InspectionList 
                inspections={currentModule === 'ALL' ? inspections : inspections.filter(i => i.type === currentModule)} 
                allInspections={inspections}
                currentModuleLabel={currentModule}
                onSelect={(id) => { setSelectedInspectionId(id); setView('DETAIL'); }} 
                userRole={user.role}
                selectedModule={currentModule}
                onModuleChange={(mod) => setCurrentModule(mod)}
                visibleModules={visibleModules}
                onImportInspections={handleImportInspections}
                onRefresh={loadInspections}
              />
            </div>
          );
          case 'FORM': return (
            <div className="h-full flex flex-col">
                <InspectionForm 
                key={selectedInspectionId || (initialFormState ? JSON.stringify(initialFormState) : 'new')}
                onSave={handleSaveInspection} 
                onCancel={() => setView('LIST')} 
                initialData={selectedInspectionId ? inspections.find(i => i.id === selectedInspectionId) : initialFormState} 
                plans={plans} 
                workshops={workshops} 
                user={user} 
                />
            </div>
          );
          case 'DETAIL': return inspections.find(i => i.id === selectedInspectionId) ? <div className="h-full"><InspectionDetail inspection={inspections.find(i => i.id === selectedInspectionId)!} user={user} onBack={() => setView('LIST')} onEdit={(id) => setView('FORM')} onDelete={async (id) => { await deleteInspectionFromSheet(id); loadInspections(); setView('LIST'); }} /></div> : null;
          default: return <div>404</div>;
        }
    })();

    return (
        <div className="page-enter h-full flex flex-col overflow-hidden">
            {content}
        </div>
    );
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} />;

  return (
    <div className="flex h-[100dvh] bg-slate-50 overflow-hidden font-sans select-none">
      
      {/* Module Selection Modal */}
      {showModuleSelector && (
        <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg">
                            {isScanSelectionMode ? 'Chọn loại phiếu để quét' : 'Chọn loại phiếu'}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                            {isScanSelectionMode ? 'Sau khi chọn, camera sẽ bật để quét QR' : 'Vui lòng chọn quy trình kiểm tra'}
                        </p>
                    </div>
                    <button 
                        onClick={() => {
                            setShowModuleSelector(false);
                            setIsScanSelectionMode(false);
                        }} 
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors active:scale-90"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar">
                    {visibleModules.map(mod => (
                        <button 
                            key={mod.id}
                            onClick={() => handleSelectModule(mod.id)}
                            className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-500 hover:bg-blue-50 transition-all gap-3 group active:scale-95 shadow-sm"
                        >
                            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                                <FileText className="w-5 h-5 text-slate-500 group-hover:text-blue-700" />
                            </div>
                            <span className="font-black text-xs text-slate-700 group-hover:text-blue-700 uppercase tracking-tight text-center">{mod.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* Scanner overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <button onClick={() => setShowScanner(false)} className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-8 h-8"/></button>
            <div className="mb-10 text-center space-y-2 px-6">
                <div className="inline-flex items-center gap-2 bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30 mb-2">
                    <Zap className="w-4 h-4 fill-blue-400" />
                    <span className="text-xs font-black uppercase tracking-widest">
                        {preSelectedModule ? `Đang quét cho ${preSelectedModule}` : 'Auto-Create Mode'}
                    </span>
                </div>
                <h3 className="text-white text-xl font-black uppercase tracking-tighter">Quét mã sản phẩm</h3>
                <p className="text-slate-400 text-sm font-medium">Tự động tạo phiếu kiểm tra mới từ mã quét được</p>
            </div>
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[2.5rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.4)]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
            </div>
            <p className="text-blue-400 mt-10 font-bold text-xs uppercase tracking-[0.2em] animate-pulse">Scanning QR / Barcode...</p>
        </div>
      )}
      {!isQC && (
        <div className={`hidden lg:flex flex-col ${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white shrink-0 transition-all duration-300 ease-in-out`}>
            {/* ... Sidebar Content ... */}
            <div className={`p-4 border-b border-slate-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} h-20`}>
                {!isSidebarCollapsed ? (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shrink-0"><Box className="w-6 h-6" /></div>
                        <h1 className="text-xl font-black uppercase italic tracking-tighter truncate">AATN QC</h1>
                    </div>
                ) : (
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg cursor-pointer" onClick={() => toggleSidebar()}>
                        <Box className="w-6 h-6" />
                    </div>
                )}
                {!isSidebarCollapsed && !isQC && (
                    <button onClick={toggleSidebar} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <PanelLeftClose className="w-5 h-5" />
                    </button>
                )}
            </div>
            {isSidebarCollapsed && !isQC && (
                <div className="flex justify-center py-2 border-b border-slate-800">
                    <button onClick={toggleSidebar} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <PanelLeftOpen className="w-5 h-5" />
                    </button>
                </div>
            )}
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto no-scrollbar">
                {[
                    { id: 'HOME', label: 'TRANG CHỦ', icon: Home },
                    { id: 'PLAN', label: 'KẾ HOẠCH', icon: FileSpreadsheet },
                    { id: 'LIST', label: 'DANH SÁCH', icon: List },
                    { id: 'DASHBOARD', label: 'BÁO CÁO', icon: LayoutDashboard },
                    { id: 'SETTINGS', label: 'CÀI ĐẶT', icon: SettingsIcon },
                ].map((item) => (
                    <button 
                        key={item.id}
                        onClick={() => setView(item.id as ViewState)} 
                        className={`w-full flex items-center py-3 text-sm font-bold transition-all relative group
                            ${isSidebarCollapsed ? 'justify-center px-0' : 'px-6'}
                            ${view === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                        `}
                    >
                        <item.icon className={`w-5 h-5 ${!isSidebarCollapsed ? 'mr-3' : ''}`} />
                        {!isSidebarCollapsed && <span>{item.label}</span>}
                        {isSidebarCollapsed && (
                            <div className="absolute left-14 ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl border border-slate-700 uppercase tracking-wider transform scale-95 group-hover:scale-100 origin-left">
                                {item.label}
                                <div className="absolute top-1/2 left-0 -ml-1 -mt-1 w-2 h-2 bg-slate-800 transform rotate-45 border-l border-b border-slate-700"></div>
                            </div>
                        )}
                    </button>
                ))}
            </nav>
            <div className={`p-4 bg-slate-950/50 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center mb-3' : 'gap-3 mb-4'} cursor-pointer hover:bg-slate-800 p-2 rounded-2xl transition-colors`} onClick={() => setView('HOME')}>
                    <img src={user.avatar} className="w-10 h-10 rounded-xl bg-slate-800 object-cover" alt="User" />
                    {!isSidebarCollapsed && (
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate">{user.name}</p>
                            <p className="text-[10px] text-blue-500 uppercase">{user.role}</p>
                        </div>
                    )}
                </div>
                <button 
                    onClick={handleLogout} 
                    className={`flex items-center justify-center p-2 rounded-xl bg-slate-800 text-xs font-bold uppercase hover:bg-red-600/20 hover:text-red-500 transition-colors ${isSidebarCollapsed ? 'w-10 h-10' : 'w-full'}`}
                    title="Đăng xuất"
                >
                    <LogOut className={`w-4 h-4 ${!isSidebarCollapsed ? 'mr-2' : ''}`} /> 
                    {!isSidebarCollapsed && 'Đăng xuất'}
                </button>
            </div>
        </div>
      )}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {connectionError && (
          <div className="bg-orange-600 text-white px-4 py-2 flex items-center justify-between z-[70] shadow-md shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase"><WifiOff className="w-4 h-4" /><span>Offline: Đang kết nối server...</span></div>
            <button onClick={checkConn} className="px-2 py-1 bg-white/20 rounded text-[10px] font-black uppercase">Thử lại</button>
          </div>
        )}
        
        {/* Main Content Area - Scrollable */}
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden pb-[calc(env(safe-area-inset-bottom)+4rem)] lg:pb-0">
            {renderContent()}
        </main>
        
        <AIChatbox inspections={inspections} plans={plans} />
        
        {!isQC && (
            <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200 flex justify-around p-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] fixed bottom-0 w-full z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
            <MobileNavItem viewName="HOME" label="Home" icon={Home} currentView={view} onNavigate={setView} />
            <MobileNavItem viewName="LIST" label="Checklist" icon={List} currentView={view} onNavigate={setView} />
            <div className="relative -top-5">
                <button 
                    onClick={() => setView('CONVERT_3D')} 
                    className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-xl shadow-blue-500/40 flex items-center justify-center text-white active:scale-95 transition-transform border-4 border-white"
                >
                    <Box className="w-7 h-7" />
                </button>
            </div>
            <MobileNavItem viewName="PLAN" label="Plans" icon={FileSpreadsheet} currentView={view} onNavigate={setView} />
            <MobileNavItem viewName="DASHBOARD" label="Report" icon={LayoutDashboard} currentView={view} onNavigate={setView} />
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
