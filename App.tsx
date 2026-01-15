
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState, Inspection, PlanItem, CheckItem, User, ModuleId, Workshop, Project, Defect, InspectionStatus, NCRComment, Notification } from './types';
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
  STEP_CHECKLIST_TEMPLATE,
  FQC_CHECKLIST_TEMPLATE,
  SPR_CHECKLIST_TEMPLATE,
  SITE_CHECKLIST_TEMPLATE,
  ALL_MODULES
} from './constants';
import { Dashboard } from './components/Dashboard';
import { InspectionList } from './components/InspectionList';
import { InspectionListPQC } from './components/InspectionListPQC'; // Import PQC List if exists, or use generic
import { InspectionFormPQC } from './components/inspectionformPQC';
import { InspectionFormIQC } from './components/inspectionformIQC';
import { InspectionFormSQC_VT } from './components/inspectionformSQC_VT';
import { InspectionFormSQC_BTP } from './components/inspectionformSQC_BTP';
import { InspectionFormFRS } from './components/inspectionformFRS';
import { InspectionFormStepVecni } from './components/inspectionformStepVecni';
import { InspectionFormFQC } from './components/inspectionformFQC';
import { InspectionFormSPR } from './components/inspectionformSPR';
import { InspectionFormSITE } from './components/inspectionformSITE';
import { InspectionDetailPQC } from './components/inspectiondetailPQC'; 
import { InspectionDetailIQC } from './components/inspectiondetailIQC';
import { InspectionDetailSQC_VT } from './components/inspectiondetailSQC_VT';
import { InspectionDetailSQC_BTP } from './components/inspectiondetailSQC_BTP';
import { InspectionDetailFRS } from './components/inspectiondetailFRS';
import { InspectionDetailStepVecni } from './components/inspectiondetailStepVecni';
import { InspectionDetailFQC } from './components/inspectiondetailFQC';
import { InspectionDetailSPR } from './components/inspectiondetailSPR';
import { InspectionDetailSITE } from './components/inspectiondetailSITE';
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
import { NCRList } from './components/NCRList';
import { DefectLibrary } from './components/DefectLibrary';
import { DefectList } from './components/DefectList';
import { DefectDetail } from './components/DefectDetail';
import { QRScannerModal } from './components/QRScannerModal';
import { MobileBottomBar } from './components/MobileBottomBar';
import { 
  fetchPlans, 
  fetchInspections, 
  fetchInspectionById,
  saveInspection, // Changed from saveInspectionToSheet
  deleteInspection, // Changed from deleteInspectionFromSheet
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
  fetchProjects, 
  createNotification,
  saveNcrMapped
} from './services/apiService';
import { initDatabase } from './services/tursoService';
import { Loader2, X, FileText } from 'lucide-react';

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [currentModule, setCurrentModule] = useState<string>('ALL');
  const [inspections, setInspections] = useState<Inspection[]>([]); 
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [activeDefect, setActiveDefect] = useState<Defect | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]); 
  const [activePlan, setActivePlan] = useState<PlanItem | null>(null);
  const [planSearchTerm, setPlanSearchTerm] = useState('');
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES'>('PROFILE');
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [workshops, setWorkshops] = useState<Workshop[]>(MOCK_WORKSHOPS);
  const [templates, setTemplates] = useState<Record<string, CheckItem[]>>({
      'SITE': SITE_CHECKLIST_TEMPLATE, 
      'PQC': PQC_CHECKLIST_TEMPLATE, 
      'IQC': IQC_CHECKLIST_TEMPLATE,
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE, 
      'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE, 
      'FSR': FSR_CHECKLIST_TEMPLATE,
      'STEP': STEP_CHECKLIST_TEMPLATE,
      'FQC': FQC_CHECKLIST_TEMPLATE,
      'SPR': SPR_CHECKLIST_TEMPLATE
  });
  const [initialFormState, setInitialFormState] = useState<Partial<Inspection> | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [pendingScannedCode, setPendingScannedCode] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
        try {
            await initDatabase(); setIsDbReady(true);
            const localData = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
            if (localData) { try { const parsedUser = JSON.parse(localData); setUser(parsedUser); setView(parsedUser.role === 'QC' ? 'LIST' : 'DASHBOARD'); } catch (e) {} }
            await Promise.allSettled([checkConn(), loadUsers(), loadWorkshops(), loadTemplates()]);
        } catch (error) { setIsDbReady(true); setConnectionError(true); }
    };
    init();
  }, []);

  const checkConn = async () => {
    try {
        const res = await checkApiConnection();
        if (!res.ok) setConnectionError(true);
    } catch (e) {
        setConnectionError(true);
    }
  };

  const loadWorkshops = async () => {
    try {
        const data = await fetchWorkshops();
        if (data && data.length > 0) setWorkshops(data);
    } catch (e) {
        console.error("Failed to load workshops", e);
    }
  };

  const loadTemplates = async () => {
    try {
        const data = await fetchTemplates();
        if (data) setTemplates(prev => ({ ...prev, ...data }));
    } catch (e) {
        console.error("Failed to load templates", e);
    }
  };

  const loadUsers = async () => { 
      try { 
          const data = await fetchUsers(); 
          if (Array.isArray(data) && data.length > 0) { 
              setUsers(prev => { 
                  const combined = [...MOCK_USERS]; 
                  data.forEach(dbUser => { 
                      if (dbUser && dbUser.username && !combined.find(u => u.username === dbUser.username)) {
                          combined.push(dbUser);
                      }
                  }); 
                  return combined;
              }); 
          }
      } catch (e) {
          console.error("Failed to load users", e);
      }
  };

  useEffect(() => {
    if (user && view === 'PROJECTS') loadProjects();
    if (user && (view === 'DASHBOARD' || view === 'LIST' || view === 'PROJECT_DETAIL')) loadInspections();
    if (user && view === 'PLAN') loadPlans();
  }, [user, view]);

  const loadProjects = async () => {
      const data = await fetchProjects();
      setProjects(data);
  };

  const loadInspections = async () => {
      setIsLoadingInspections(true);
      try {
          const res = await fetchInspections();
          setInspections(res.items);
      } catch (e) {} finally { setIsLoadingInspections(false); }
  };

  const loadPlans = async () => {
      setIsLoadingPlans(true);
      try {
          const res = await fetchPlans(planSearchTerm);
          setPlans(res.items);
      } catch (e) {} finally { setIsLoadingPlans(false); }
  };

  const handleLogin = (user: User, remember: boolean) => {
      setUser(user);
      if (remember) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      else sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      setView(user.role === 'QC' ? 'LIST' : 'DASHBOARD');
  };

  const handleLogout = () => {
      setUser(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handleNavigate = (v: ViewState) => {
      if (v === 'SETTINGS') setSettingsInitialTab('PROFILE');
      setView(v);
      setActiveInspection(null);
      setActivePlan(null);
      setActiveProject(null);
  };

  const handleSaveInspection = async (insp: Inspection) => {
      await saveInspection(insp);
      loadInspections();
      setView('LIST');
  };

  const handleDeleteInspection = async (id: string) => {
      if (window.confirm("Xóa phiếu này?")) {
          await deleteInspection(id);
          loadInspections();
          setView('LIST');
      }
  };

  const handleViewInspection = async (id: string) => {
      setIsDetailLoading(true);
      try {
          const insp = await fetchInspectionById(id);
          if (insp) {
              setActiveInspection(insp);
              setView('DETAIL');
          }
      } catch (e) { alert("Lỗi tải chi tiết phiếu."); } finally { setIsDetailLoading(false); }
  };

  const renderContent = () => {
      if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} />;

      switch (view) {
          case 'DASHBOARD':
              return <Dashboard inspections={inspections} user={user} onNavigate={handleNavigate} />;
          case 'LIST':
              return <InspectionList inspections={inspections} onSelect={handleViewInspection} onRefresh={loadInspections} isLoading={isLoadingInspections} workshops={workshops} selectedModule={currentModule} onModuleChange={setCurrentModule} />;
          case 'PLAN':
              return <PlanList items={plans} inspections={inspections} onSelect={(item, customItems) => { setInitialFormState({ ma_ct: item.ma_ct, ten_ct: item.ten_ct, ten_hang_muc: item.ten_hang_muc, dvt: item.dvt, so_luong_ipo: item.so_luong_ipo, items: customItems }); setShowModuleSelector(true); }} onViewInspection={handleViewInspection} onRefresh={loadPlans} onImportPlans={importPlans} searchTerm={planSearchTerm} onSearch={setPlanSearchTerm} isLoading={isLoadingPlans} totalItems={plans.length} onViewPlan={(p) => { setActivePlan(p); }} />;
          case 'PROJECTS':
              return <ProjectList projects={projects} inspections={inspections} onSelectProject={async (maCt) => { const p = projects.find(pr => pr.ma_ct === maCt); if (p) { setActiveProject(p); setView('PROJECT_DETAIL'); } }} />;
          case 'PROJECT_DETAIL':
              return activeProject ? <ProjectDetail project={activeProject} inspections={inspections} onBack={() => setView('PROJECTS')} onUpdate={loadProjects} onViewInspection={handleViewInspection} /> : null;
          case 'FORM':
              const commonProps = { initialData: initialFormState, onSave: handleSaveInspection, onCancel: () => setView('LIST'), plans, workshops, user, inspections };
              if (currentModule === 'IQC') return <InspectionFormIQC {...commonProps} templates={templates} />;
              if (currentModule === 'SQC_MAT') return <InspectionFormSQC_VT {...commonProps} templates={templates} />;
              if (currentModule === 'SQC_BTP') return <InspectionFormSQC_BTP {...commonProps} templates={templates} />;
              if (currentModule === 'PQC') return <InspectionFormPQC {...commonProps} templates={templates} />;
              if (currentModule === 'FSR') return <InspectionFormFRS {...commonProps} />;
              if (currentModule === 'STEP') return <InspectionFormStepVecni {...commonProps} />;
              if (currentModule === 'FQC') return <InspectionFormFQC {...commonProps} />;
              if (currentModule === 'SPR') return <InspectionFormSPR {...commonProps} />;
              if (currentModule === 'SITE') return <InspectionFormSITE {...commonProps} />;
              return <InspectionFormPQC {...commonProps} templates={templates} />;
          case 'DETAIL':
              if (!activeInspection) return null;
              const detailProps = { inspection: activeInspection, user, onBack: () => setView('LIST'), onEdit: (id: string) => { setInitialFormState(activeInspection); setView('FORM'); }, onDelete: handleDeleteInspection, onApprove: async (id: string, sig: string, info: any) => { await saveInspection({...activeInspection, status: InspectionStatus.APPROVED, managerSignature: sig, ...info}); loadInspections(); }, onPostComment: async (id: string, comment: NCRComment) => { const updated = { ...activeInspection, comments: [...(activeInspection.comments || []), comment] }; await saveInspection(updated); setActiveInspection(updated); } };
              if (activeInspection.type === 'IQC') return <InspectionDetailIQC {...detailProps} />;
              if (activeInspection.type === 'SQC_MAT') return <InspectionDetailSQC_VT {...detailProps} />;
              if (activeInspection.type === 'SQC_BTP') return <InspectionDetailSQC_BTP {...detailProps} />;
              if (activeInspection.type === 'PQC') return <InspectionDetailPQC {...detailProps} />;
              if (activeInspection.type === 'FSR') return <InspectionDetailFRS {...detailProps} />;
              if (activeInspection.type === 'STEP') return <InspectionDetailStepVecni {...detailProps} />;
              if (activeInspection.type === 'FQC') return <InspectionDetailFQC {...detailProps} />;
              if (activeInspection.type === 'SPR') return <InspectionDetailSPR {...detailProps} />;
              if (activeInspection.type === 'SITE') return <InspectionDetailSITE {...detailProps} />;
              return <InspectionDetailPQC {...detailProps} />;
          case 'SETTINGS':
              return <Settings currentUser={user} allTemplates={templates} onSaveTemplate={saveTemplate} users={users} onAddUser={saveUser} onUpdateUser={saveUser} onDeleteUser={deleteUser} workshops={workshops} onAddWorkshop={saveWorkshop} onUpdateWorkshop={saveWorkshop} onDeleteWorkshop={deleteWorkshop} onClose={() => setView('DASHBOARD')} onCheckConnection={checkApiConnection} initialTab={settingsInitialTab} />;
          case 'CONVERT_3D':
              return <ThreeDConverter />;
          case 'NCR_LIST':
              return <NCRList currentUser={user} onSelectNcr={handleViewInspection} />;
          case 'DEFECT_LIBRARY':
              return <DefectLibrary currentUser={user} />;
          case 'DEFECT_LIST':
              return <DefectList currentUser={user} onSelectDefect={(d) => { setActiveDefect(d); setView('DEFECT_DETAIL'); }} onViewInspection={handleViewInspection} />;
          case 'DEFECT_DETAIL':
              return activeDefect ? <DefectDetail defect={activeDefect} user={user} onBack={() => setView('DEFECT_LIST')} onViewInspection={handleViewInspection} /> : null;
          default: return <Dashboard inspections={inspections} user={user} onNavigate={handleNavigate} />;
      }
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <div className="hidden lg:block h-full">
        <Sidebar 
            view={view} 
            onNavigate={handleNavigate} 
            user={user} 
            onLogout={handleLogout} 
            collapsed={sidebarCollapsed} 
            setCollapsed={setSidebarCollapsed} 
        />
      </div>
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        <GlobalHeader 
            user={user} 
            view={view} 
            onNavigate={handleNavigate} 
            onLogout={handleLogout}
            onRefresh={() => { loadInspections(); loadPlans(); }}
            onCreate={() => setShowModuleSelector(true)}
            onScanClick={() => setShowQrScanner(true)}
            onOpenSettingsTab={(tab) => { setSettingsInitialTab(tab); setView('SETTINGS'); }}
            activeFormType={currentModule}
            onNavigateToRecord={(v, id) => { if (v === 'DETAIL') handleViewInspection(id); else if (v === 'NCR_LIST') setView('NCR_LIST'); }}
        />
        <main className="flex-1 overflow-hidden relative">
            {renderContent()}
        </main>
        <MobileBottomBar view={view} onNavigate={handleNavigate} user={user} />
      </div>

      <AIChatbox inspections={inspections} plans={plans} />

      {activePlan && (
          <PlanDetail 
            item={activePlan} 
            onBack={() => setActivePlan(null)} 
            onCreateInspection={(customItems) => { 
                setInitialFormState({ ma_ct: activePlan.ma_ct, ten_ct: activePlan.ten_ct, ten_hang_muc: activePlan.ten_hang_muc, dvt: activePlan.dvt, so_luong_ipo: activePlan.so_luong_ipo, items: customItems, ma_nha_may: activePlan.ma_nha_may });
                setActivePlan(null);
                setShowModuleSelector(true);
            }} 
            relatedInspections={inspections.filter(i => i.ma_ct === activePlan.ma_ct && i.ten_hang_muc === activePlan.ten_hang_muc)}
            onViewInspection={handleViewInspection}
          />
      )}

      {showModuleSelector && (
          <div className="fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-800">Chọn loại phiếu kiểm tra</h3>
                      <button onClick={() => setShowModuleSelector(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                      {ALL_MODULES.filter(m => m.group !== 'TOOLS' && user.allowedModules?.includes(m.id)).map(m => (
                          <button key={m.id} onClick={() => { setCurrentModule(m.id); setView('FORM'); setShowModuleSelector(false); }} className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-center">
                              <p className="font-bold text-sm text-slate-700">{m.label}</p>
                              <p className="text-xs text-slate-400 mt-1">{m.group}</p>
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {showQrScanner && (
          <QRScannerModal 
            onClose={() => setShowQrScanner(false)} 
            onScan={(code) => { 
                setPendingScannedCode(code); 
                setShowQrScanner(false);
                // Simple routing logic based on code format or lookup
                if (code.startsWith('INS-') || code.startsWith('IQC-')) handleViewInspection(code);
                else { setPlanSearchTerm(code); setView('PLAN'); }
            }} 
          />
      )}
    </div>
  );
};

export default App;
