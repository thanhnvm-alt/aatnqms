
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState, Inspection, PlanItem, CheckItem, User, ModuleId, Workshop, Project, Defect } from './types';
import { 
  INITIAL_CHECKLIST_TEMPLATE, 
  MOCK_USERS, 
  MOCK_INSPECTIONS, 
  MOCK_WORKSHOPS, 
  IQC_CHECKLIST_TEMPLATE, 
  PQC_CHECKLIST_TEMPLATE, 
  SQC_MAT_CHECKLIST_TEMPLATE, 
  SQC_BTP_CHECKLIST_TEMPLATE, 
  FSR_CHECKLIST_TEMPLATE,
  ALL_MODULES
} from './constants';
import { Dashboard } from './components/Dashboard';
import { InspectionList } from './components/InspectionList';
import { InspectionForm } from './components/InspectionForm';
import { InspectionDetail } from './components/InspectionDetail';
import { PlanList } from './components/PlanList';
import { PlanDetail } from './components/PlanDetail';
import { Settings } from './components/Settings';
import { AIChatbox } from './components/AIChatbox';
import { LoginPage } from './components/LoginPage';
import { ThreeDConverter } from './components/ThreeDConverter';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { GlobalHeader } from './components/GlobalHeader';
import { Sidebar } from './components/Sidebar';
// Fixed: Corrected import path to match file system (NCRList instead of NCR_LIST)
import { NCRList } from './components/NCRList';
import { DefectLibrary } from './components/DefectLibrary';
import { DefectDetail } from './components/DefectDetail';
import { 
  fetchPlans, 
  fetchInspections, 
  fetchInspectionById,
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
  importInspections, 
  fetchProjectsSummary,
  fetchProjectDetailByMaCt 
} from './services/apiService';
import { initDatabase } from './services/tursoService';
import { List, Plus, FileSpreadsheet, Box, LayoutDashboard, QrCode, X, FileText, Briefcase, Loader2, UserCircle, Settings as SettingsIcon, AlertTriangle, Hammer, BookOpen, ChevronRight, Zap, Camera } from 'lucide-react';
// @ts-ignore
import jsQR from 'jsqr';

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [currentModule, setCurrentModule] = useState<string>('ALL');
  const [inspections, setInspections] = useState<Inspection[]>([]); 
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]); 
  const [selectedPlanItem, setSelectedPlanItem] = useState<PlanItem | null>(null);
  const [planSearchTerm, setPlanSearchTerm] = useState('');
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE'>('PROFILE');
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [workshops, setWorkshops] = useState<Workshop[]>(MOCK_WORKSHOPS);
  const [templates, setTemplates] = useState<Record<string, CheckItem[]>>({
      'SITE': INITIAL_CHECKLIST_TEMPLATE, 'PQC': PQC_CHECKLIST_TEMPLATE, 'IQC': IQC_CHECKLIST_TEMPLATE,
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE, 'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE, 'FSR': FSR_CHECKLIST_TEMPLATE
  });
  const [initialFormState, setInitialFormState] = useState<Partial<Inspection> | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Modals States
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [isScanSelectionMode, setIsScanSelectionMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrRequestRef = useRef<number>(0);

  const isQC = user?.role === 'QC';

  useEffect(() => {
    const init = async () => {
        try {
            await initDatabase();
            setIsDbReady(true);
            const localData = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
            if (localData) {
                try {
                    const parsedUser = JSON.parse(localData);
                    setUser(parsedUser);
                    setView(parsedUser.role === 'QC' ? 'LIST' : 'DASHBOARD');
                } catch (e) {}
            }
            await Promise.allSettled([checkConn(), loadUsers(), loadWorkshops(), loadTemplates()]);
        } catch (error) {
            console.error("Critical: Initialization failed", error);
            setIsDbReady(true);
            setConnectionError(true);
        }
    };
    init();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      if (Array.isArray(data) && data.length > 0) {
          setUsers(prev => {
              const combined = [...MOCK_USERS];
              data.forEach(dbUser => { if (!combined.find(u => u.username.toLowerCase() === dbUser.username.toLowerCase())) combined.push(dbUser); });
              return combined;
          });
      }
    } catch (e) {}
  };

  const handleLogin = (loggedInUser: User, remember: boolean) => {
      const { password, ...safeUser } = loggedInUser;
      setUser(safeUser as User); 
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
      setView(safeUser.role === 'QC' ? 'LIST' : 'DASHBOARD');
  };

  const handleLogout = () => { setUser(null); setView('DASHBOARD'); localStorage.removeItem(AUTH_STORAGE_KEY); sessionStorage.removeItem(AUTH_STORAGE_KEY); };

  useEffect(() => { if (user && isDbReady) { loadInspections(); loadProjects(); loadPlans(); } }, [user, isDbReady, planSearchTerm]);

  const checkConn = async () => { try { const status = await checkApiConnection(); setConnectionError(!status.ok); } catch (e) { setConnectionError(true); } };
  const loadTemplates = async () => { try { const data = await fetchTemplates(); if (Object.keys(data).length > 0) setTemplates(prev => ({ ...prev, ...data })); } catch (e) {} };
  const loadWorkshops = async () => { try { const data = await fetchWorkshops(); if (data.length > 0) setWorkshops(data); } catch (e) {} };
  
  const loadProjects = async (search: string = "") => { 
    if (isLoadingInspections || !isDbReady) return;
    try { 
        // Sync & Fetch summary logic is built into fetchProjectsSummary
        const data = await fetchProjectsSummary(search); 
        if (data.length > 0) setProjects(data); 
    } catch(e) {} 
  };
  
  const loadPlans = async () => {
    if (isLoadingPlans || !isDbReady) return;
    setIsLoadingPlans(true);
    try { const result = await fetchPlans(planSearchTerm, 1, 1000); setPlans(result.items || []); } catch (e) {} finally { setIsLoadingPlans(false); }
  };

  const loadInspections = async () => {
    if (isLoadingInspections || !isDbReady) return;
    setIsLoadingInspections(true);
    try { const data = await fetchInspections(); setInspections(data.items || []); } catch (e) {} finally { setIsLoadingInspections(false); }
  };

  const handleSelectInspection = async (id: string) => {
      setIsDetailLoading(true);
      try {
          const fullInspection = await fetchInspectionById(id);
          if (fullInspection) { setActiveInspection(fullInspection); setView('DETAIL'); }
          else alert("Không tìm thấy dữ liệu phiếu kiểm tra.");
      } catch (error) { alert("Lỗi tải chi tiết phiếu."); } finally { setIsDetailLoading(false); }
  };

  const handleSelectProject = async (maCt: string) => {
      setIsDetailLoading(true);
      try {
          // Lấy chi tiết từ DB theo ma_ct
          const fullProject = await fetchProjectDetailByMaCt(maCt);
          if (fullProject) { setActiveProject(fullProject); setView('PROJECT_DETAIL'); }
          else alert("Không tìm thấy chi tiết dự án.");
      } catch (error) { alert("Lỗi tải dữ liệu dự án."); } finally { setIsDetailLoading(false); }
  };

  const handleEditInspection = async (id: string) => {
    setIsDetailLoading(true);
    try {
        const fullInspection = await fetchInspectionById(id);
        if (fullInspection) { setActiveInspection(fullInspection); setView('FORM'); }
    } catch (e) {} finally { setIsDetailLoading(false); }
  };

  const handleSaveInspection = async (newInspection: Inspection) => { await saveInspectionToSheet(newInspection); setView('LIST'); loadInspections(); loadProjects(); };

  const handleNavigateToSettings = (tab: any) => { setSettingsInitialTab(tab); setView('SETTINGS'); };

  // --- QR Scanner Logic ---
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (showQrScanner) {
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current && stream) {
              videoRef.current.srcObject = stream;
              videoRef.current.setAttribute('playsinline', 'true');
              videoRef.current.play();
              qrRequestRef.current = requestAnimationFrame(tick);
          }
        } catch (err) {
          alert('Không thể truy cập camera. Vui lòng cấp quyền.');
          setShowQrScanner(false);
        }
      };
      startCamera();
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (qrRequestRef.current) cancelAnimationFrame(qrRequestRef.current);
    };
  }, [showQrScanner]);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = scannerCanvasRef.current;
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
             const scannedCode = code.data.trim();
             setShowQrScanner(false);
             
             let foundPlan = plans.find(p => String(p.headcode).toLowerCase() === scannedCode.toLowerCase());
             if (!foundPlan) {
                 foundPlan = plans.find(p => String(p.ma_nha_may).toLowerCase() === scannedCode.toLowerCase());
             }

             setIsScanSelectionMode(true);
             if (foundPlan) {
                setInitialFormState({
                    ma_nha_may: foundPlan.ma_nha_may,
                    headcode: foundPlan.headcode,
                    ma_ct: foundPlan.ma_ct,
                    ten_ct: foundPlan.ten_ct,
                    ten_hang_muc: foundPlan.ten_hang_muc,
                    dvt: foundPlan.dvt,
                    so_luong_ipo: foundPlan.so_luong_ipo
                });
             } else {
                setInitialFormState({ ma_nha_may: scannedCode });
             }
             
             setShowModuleSelector(true);
             return;
          }
        }
      }
    }
    if (showQrScanner) qrRequestRef.current = requestAnimationFrame(tick);
  };

  const startCreateInspection = (moduleId: ModuleId) => {
      setShowModuleSelector(false);
      const template = templates[moduleId] || INITIAL_CHECKLIST_TEMPLATE;
      const baseState = initialFormState || {};
      setInitialFormState({ ...baseState, type: moduleId, items: JSON.parse(JSON.stringify(template)) });
      setActiveInspection(null);
      setView('FORM');
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} />;

  const headerActions = {
    onRefresh: view === 'LIST' || view === 'DASHBOARD' || view === 'NCR_LIST' ? loadInspections : (view === 'PLAN' || view === 'PROJECTS' ? loadPlans : undefined),
    onScanClick: () => setShowQrScanner(true),
    onCreate: () => { 
        setInitialFormState(undefined); 
        setIsScanSelectionMode(false); 
        setShowModuleSelector(true); 
    },
  };

  if (!isDbReady) return <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50"><Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" /><p className="text-sm font-black text-slate-600 uppercase tracking-widest">Đang khởi tạo hệ thống...</p></div>;

  return (
    <div className="flex flex-row h-[100dvh] bg-slate-50 overflow-hidden font-sans select-none">
      <div className="hidden lg:block h-full shrink-0"><Sidebar view={view} onNavigate={setView} user={user} onLogout={handleLogout} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} /></div>
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {isDetailLoading && (
            <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Đang tải dữ liệu...</p>
                </div>
            </div>
        )}

        <GlobalHeader user={user} view={view} onNavigate={setView} onLogout={handleLogout} onOpenSettingsTab={handleNavigateToSettings} {...headerActions} />
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden pb-[calc(env(safe-area-inset-bottom)+4rem)] lg:pb-0">
            {view === 'DASHBOARD' && <Dashboard inspections={inspections} user={user} onLogout={handleLogout} onNavigate={setView} />}
            {view === 'LIST' && <InspectionList inspections={inspections} onSelect={handleSelectInspection} userRole={user.role} currentUserName={user.name} selectedModule={currentModule} currentUser={user} onLogout={handleLogout} onNavigateSettings={handleNavigateToSettings} onModuleChange={setCurrentModule} onRefresh={loadInspections} />}
            {view === 'FORM' && <InspectionForm initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} plans={plans} workshops={workshops} user={user} />}
            {view === 'DETAIL' && activeInspection && <InspectionDetail inspection={activeInspection} user={user} onBack={() => { setView('LIST'); setActiveInspection(null); }} onEdit={handleEditInspection} onDelete={async (id) => { if(window.confirm("Xóa vĩnh viễn phiếu này?")){ await deleteInspectionFromSheet(id); loadInspections(); setView('LIST'); } }} />}
            {view === 'PLAN' && <PlanList items={plans} inspections={inspections} onSelect={(item) => { setInitialFormState({ ma_nha_may: item.ma_nha_may, headcode: item.headcode, ma_ct: item.ma_ct, ten_ct: item.ten_ct, ten_hang_muc: item.ten_hang_muc, dvt: item.dvt, so_luong_ipo: item.so_luong_ipo }); setShowModuleSelector(true); }} onViewInspection={handleSelectInspection} onRefresh={loadPlans} onImportPlans={async (p) => { await importPlans(p); }} searchTerm={planSearchTerm} onSearch={setPlanSearchTerm} isLoading={isLoadingPlans} totalItems={plans.length} onViewPlan={(item) => setSelectedPlanItem(item)} />}
            {view === 'NCR_LIST' && <NCRList currentUser={user} onSelectNcr={handleSelectInspection} />}
            {view === 'DEFECT_LIBRARY' && <DefectLibrary currentUser={user} />}
            {view === 'SETTINGS' && <Settings currentUser={user} allTemplates={templates} onSaveTemplate={async (m, t) => { await saveTemplate(m, t); loadTemplates(); }} users={users} onAddUser={async u => { await saveUser(u); loadUsers(); }} onUpdateUser={async u => { await saveUser(u); loadUsers(); if(u.id === user.id) setUser(u); }} onDeleteUser={async id => { await deleteUser(id); loadUsers(); }} workshops={workshops} onAddWorkshop={async w => { await saveWorkshop(w); loadWorkshops(); }} onUpdateWorkshop={async w => { await saveWorkshop(w); loadWorkshops(); }} onDeleteWorkshop={async id => { await deleteWorkshop(id); loadWorkshops(); }} onClose={() => setView(isQC ? 'LIST' : 'DASHBOARD')} initialTab={settingsInitialTab} />}
            {view === 'PROJECTS' && <ProjectList projects={projects} inspections={inspections} onSelectProject={handleSelectProject} onRefreshProjects={loadProjects} />}
            {view === 'PROJECT_DETAIL' && activeProject && <ProjectDetail project={activeProject} inspections={inspections} onUpdate={loadProjects} onBack={() => { setView('PROJECTS'); setActiveProject(null); }} />}
            {view === 'CONVERT_3D' && <ThreeDConverter />}
        </main>
        <AIChatbox inspections={inspections} plans={plans} />
      </div>
    </div>
  );
};

export default App;
