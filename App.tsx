
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { ViewState, Inspection, CheckItem, User, ModuleId, Workshop, Project, Defect, InspectionStatus, NCRComment, Notification, Supplier, Role, canUserModifyInspection, canUserDeleteInspection, hasPermission } from './types';
import { InspectionProvider } from './src/context/InspectionContext';
import { 
  INITIAL_CHECKLIST_TEMPLATE, 
  MOCK_USERS, 
  MOCK_WORKSHOPS, 
  IQC_CHECKLIST_TEMPLATE, 
  PQC_CHECKLIST_TEMPLATE, 
  SQC_MAT_CHECKLIST_TEMPLATE, 
  SQC_BTP_CHECKLIST_TEMPLATE, 
  FSR_CHECKLIST_TEMPLATE,
  STEP_CHECKLIST_TEMPLATE,
  FQC_CHECKLIST_TEMPLATE,
  SPR_CHECKLIST_TEMPLATE,
  SITE_TEMPLATES,
  ALL_MODULES
} from './constants';

import { LoginPage } from './components/LoginPage';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { GlobalHeader } from './components/GlobalHeader';
import { Sidebar } from './components/Sidebar';
import { ChatAI } from './components/ChatAI';
import { MobileBottomBar } from './components/MobileBottomBar';
import { 
  fetchInspections, 
  fetchDashboardStats,
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
  fetchProjects, 
  createNotification,
  fetchRoles
} from './services/apiService';
import { Loader2, X, FileText, ChevronRight, Bell } from 'lucide-react';

const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const InspectionList = lazy(() => import('./components/InspectionList').then(m => ({ default: m.InspectionList })));
const InspectionFormPQC = lazy(() => import('./components/inspectionformPQC').then(m => ({ default: m.InspectionFormPQC })));
const InspectionFormIQC = lazy(() => import('./components/inspectionformIQC').then(m => ({ default: m.InspectionFormIQC })));
const InspectionFormSQC_VT = lazy(() => import('./components/inspectionformSQC_VT').then(m => ({ default: m.InspectionFormSQC_VT })));
const InspectionFormSQC_BTP = lazy(() => import('./components/inspectionformSQC_BTP').then(m => ({ default: m.InspectionFormSQC_BTP })));
const InspectionFormFRS = lazy(() => import('./components/inspectionformFRS').then(m => ({ default: m.InspectionFormFRS })));
const InspectionFormStepVecni = lazy(() => import('./components/inspectionformStepVecni').then(m => ({ default: m.InspectionFormStepVecni })));
const InspectionFormFQC = lazy(() => import('./components/inspectionformFQC').then(m => ({ default: m.InspectionFormFQC })));
const InspectionFormSPR = lazy(() => import('./components/inspectionformSPR').then(m => ({ default: m.InspectionFormSPR })));
const InspectionFormSITE = lazy(() => import('./components/inspectionformSITE').then(m => ({ default: m.InspectionFormSITE })));

const InspectionDetailPQC = lazy(() => import('./components/inspectiondetailPQC').then(m => ({ default: m.InspectionDetailPQC })));
const InspectionDetailIQC = lazy(() => import('./components/inspectiondetailIQC').then(m => ({ default: m.InspectionDetailIQC })));
const InspectionDetailSQC_VT = lazy(() => import('./components/inspectiondetailSQC_VT').then(m => ({ default: m.InspectionDetailSQC_VT })));
const InspectionDetailSQC_BTP = lazy(() => import('./components/inspectiondetailSQC_BTP').then(m => ({ default: m.InspectionDetailSQC_BTP })));
const InspectionDetailFRS = lazy(() => import('./components/inspectiondetailFRS').then(m => ({ default: m.InspectionDetailFRS })));
const InspectionDetailStepVecni = lazy(() => import('./components/inspectiondetailStepVecni').then(m => ({ default: m.InspectionDetailStepVecni })));
const InspectionDetailFQC = lazy(() => import('./components/inspectiondetailFQC').then(m => ({ default: m.InspectionDetailFQC })));
const InspectionDetailSPR = lazy(() => import('./components/inspectiondetailSPR').then(m => ({ default: m.InspectionDetailSPR })));
const InspectionDetailSITE = lazy(() => import('./components/inspectiondetailSITE').then(m => ({ default: m.InspectionDetailSITE })));

const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const IPOPage = lazy(() => import('./components/IPOPage'));
const ThreeDConverter = lazy(() => import('./components/ThreeDConverter').then(m => ({ default: m.ThreeDConverter })));
const ProjectList = lazy(() => import('./components/ProjectList').then(m => ({ default: m.ProjectList })));
const ProjectDetail = lazy(() => import('./components/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const NCRList = lazy(() => import('./components/NCRList').then(m => ({ default: m.NCRList })));
const DefectLibrary = lazy(() => import('./components/DefectLibrary').then(m => ({ default: m.DefectLibrary })));
const DefectList = lazy(() => import('./components/DefectList').then(m => ({ default: m.DefectList })));
const DefectDetail = lazy(() => import('./components/DefectDetail').then(m => ({ default: m.DefectDetail })));
const SupplierManagement = lazy(() => import('./components/SupplierManagement').then(m => ({ default: m.SupplierManagement })));
const SupplierDetail = lazy(() => import('./components/SupplierDetail').then(m => ({ default: m.SupplierDetail })));
const MaterialManagement = lazy(() => import('./components/MaterialManagement').then(m => ({ default: m.MaterialManagement })));
const ToolsManagement = lazy(() => import('./components/ToolsManagement').then(m => ({ default: m.ToolsManagement })));
const Trash = lazy(() => import('./components/Trash').then(m => ({ default: m.Trash })));
const QRScannerModal = lazy(() => import('./components/QRScannerModal').then(m => ({ default: m.QRScannerModal })));

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const DETAIL_COMPONENT_MAP: Record<string, any> = {
    'IQC': InspectionDetailIQC,
    'SQC_MAT': InspectionDetailSQC_VT,
    'SQC_VT': InspectionDetailSQC_VT,
    'SQC_BTP': InspectionDetailSQC_BTP,
    'PQC': InspectionDetailPQC,
    'FSR': InspectionDetailFRS,
    'STEP': InspectionDetailStepVecni,
    'FQC': InspectionDetailFQC,
    'SPR': InspectionDetailSPR,
    'SITE': InspectionDetailSITE
};

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8 h-full w-full">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 text-blue-500 dark:text-blue-400 animate-spin" />
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500">Đang tải biểu mẫu...</span>
    </div>
  </div>
);

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [returnView, setReturnView] = useState<ViewState>('LIST');
  const [currentModule, setCurrentModule] = useState<string>('ALL');
  const [inspections, setInspections] = useState<Inspection[]>([]); 
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardFilters, setDashboardFilters] = useState<any>({});
  const [inspectionsTotal, setInspectionsTotal] = useState(0);
  const [inspectionsHierarchy, setInspectionsHierarchy] = useState<{ year: number, month: number, count: number }[]>([]);
  const [projectsByMonth, setProjectsByMonth] = useState<Record<string, {ma_ct: string, ten_ct: string, count: number}[]>>({});
  const [inspectionsPage, setInspectionsPage] = useState(1);
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [activeDefect, setActiveDefect] = useState<Defect | null>(null);
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsSearch, setProjectsSearch] = useState('');
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectInitialFocusedPinId, setProjectInitialFocusedPinId] = useState<string | undefined>(undefined);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [inspectionFilters, setInspectionFilters] = useState<any>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [templates, setTemplates] = useState<Record<string, CheckItem[]>>({
      'SITE': SITE_TEMPLATES.BAN, 
      'SITE_BAN': SITE_TEMPLATES.BAN,
      'SITE_GHE': SITE_TEMPLATES.GHE,
      'SITE_TU': SITE_TEMPLATES.TU,
      'SITE_GIUONG': SITE_TEMPLATES.GIUONG,
      'SITE_GUONG': SITE_TEMPLATES.GUONG,
      'SITE_TU_AO': SITE_TEMPLATES.TU_AO,
      'SITE_TRAN': SITE_TEMPLATES.TRAN,
      'SITE_TUONG': SITE_TEMPLATES.TUONG,
      'SITE_SAN': SITE_TEMPLATES.SAN,
      'SITE_CUA': SITE_TEMPLATES.CUA,
      'PQC': PQC_CHECKLIST_TEMPLATE, 'IQC': IQC_CHECKLIST_TEMPLATE,
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE, 'SQC_VT': SQC_MAT_CHECKLIST_TEMPLATE, 'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE, 
      'FSR': FSR_CHECKLIST_TEMPLATE, 'STEP': STEP_CHECKLIST_TEMPLATE, 'FQC': FQC_CHECKLIST_TEMPLATE, 'SPR': SPR_CHECKLIST_TEMPLATE
  });
  
  const [initialFormState, setInitialFormState] = useState<Partial<Inspection> | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES'>('TEMPLATE');

  useEffect(() => {
    const localData = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (localData) { 
        try { 
            const parsedUser = JSON.parse(localData); 
            if (parsedUser?.role) {
                console.log('User:', parsedUser);
                setUser(parsedUser); 
                setView(parsedUser.role === 'QC' ? 'LIST' : 'DASHBOARD'); 
            }
        } catch (e) { console.error("Auth hydrate failed", e); } 
    }
    const startup = async () => {
        try {
            setIsDbReady(true);
            loadUsers();
            loadRoles();
            loadWorkshops();
            loadTemplates();
        } catch (error) { setIsDbReady(true); }
    };
    startup();
  }, []);

  // Inspections load only once on startup if user is auth
  useEffect(() => {
    if (user && isDbReady) {
        loadInspections(inspectionsPage, inspectionFilters);
    }
  }, [user, isDbReady, inspectionsPage, inspectionFilters]);

  useEffect(() => {
    // We remove interval loading for list to avoid loading everything, InspectionList will fetch.
  }, [user, isDbReady, inspectionsPage, inspectionFilters, view]);

  useEffect(() => {
    if (user && isDbReady) {
        if (view === 'PROJECTS') loadProjects(projectsSearch, projectsPage);
    }
  }, [user, isDbReady, view, projectsPage, projectsSearch]);

  const loadUsers = async () => { try { const data = await fetchUsers(); if (data?.length > 0) { setUsers(data); if (typeof window !== 'undefined') (window as any).__usersCache = data; } else { setUsers(MOCK_USERS); if (typeof window !== 'undefined') (window as any).__usersCache = MOCK_USERS; } } catch (e) { setUsers(MOCK_USERS); if (typeof window !== 'undefined') (window as any).__usersCache = MOCK_USERS; } };
  const loadRoles = async () => { try { const data = await fetchRoles(); if (data?.length > 0) { setRoles(data); if (typeof window !== 'undefined') (window as any).__rolesCache = data; } } catch (e) { console.error("Load roles failed:", e); } };
  const loadWorkshops = async () => { try { const data = await fetchWorkshops(); if (data?.length > 0) setWorkshops(data); else setWorkshops(MOCK_WORKSHOPS); } catch (e) { setWorkshops(MOCK_WORKSHOPS); } };
  const loadTemplates = async () => { try { const data = await fetchTemplates(); if (data && Object.keys(data).length > 0) setTemplates(prev => ({ ...prev, ...data })); } catch (e) {} };
  
  const loadInspections = async (page: number = 1, filters: any = {}) => {
    setIsLoadingInspections(true);
    try {
        const result = await fetchInspections(filters, page, 50);
        setInspections(result.items || []);
        setInspectionsTotal(result.total || 0);
    } catch (e) {
        console.error("Load inspections failed", e);
    } finally {
        setIsLoadingInspections(false);
    }
  };

  const loadDashboardStats = async (filters: any = {}) => {
    setIsDashboardLoading(true);
    try {
        const result = await fetchDashboardStats(filters);
        setDashboardStats(result);
    } catch (e) {
        console.error("ISO-FRONT: Load dashboard stats failed", e);
    } finally {
        setIsDashboardLoading(false);
    }
  };

  // Load dashboard stats when on dashboard view and filters change
  useEffect(() => {
    if (user && isDbReady && view === 'DASHBOARD') {
        loadDashboardStats(dashboardFilters);
    }
  }, [user, isDbReady, view, dashboardFilters]);

  const loadProjects = async (search: string = '', page: number = 1) => { 
    try { 
        const result = await fetchProjects(search, 1, 10000); 
        setProjects(result.items || []); 
        setProjectsTotal(result.total || 0);
    } catch(e) {
        console.error("Load projects failed", e);
    } 
  };
  
  const handleLogin = (loggedInUser: User, remember: boolean) => {  
    const { password, ...safeUser } = loggedInUser; 
    setUser(safeUser as User); 
    const storage = remember ? localStorage : sessionStorage; 
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser)); 
    setView(safeUser.role === 'QC' ? 'LIST' : 'DASHBOARD'); 
  };

  const handlePasswordChangeSuccess = (updatedUser: User) => {
    const { password, ...safeUser } = updatedUser;
    setUser(safeUser as User);
    const storage = localStorage.getItem(AUTH_STORAGE_KEY) ? localStorage : sessionStorage;
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
  };
  
  const handleLogout = () => { 
    setUser(null); 
    setView('DASHBOARD'); 
    localStorage.removeItem(AUTH_STORAGE_KEY); 
    localStorage.removeItem('aatn_qms_token');
    localStorage.removeItem('aatn_saved_username'); 
    sessionStorage.removeItem(AUTH_STORAGE_KEY); 
  };

  const notifyUsers = async (targetRoles: string[], title: string, message: string, link?: { view: ViewState, id: string }, excludeUserId?: string) => {
    const isStandardMatch = (u: User) => targetRoles.includes(u.role as string);

    const qaQcKeywords = ['QA', 'QC', 'CHẤT LƯỢNG', 'CHAT LUONG', 'QUALITY'];
    const targetPositions = [
      'TỔ TRƯỞNG', 'TO TRUONG', 
      'TRƯỞNG BỘ PHẬN', 'TRUONG BO PHAN', 
      'TRƯỞNG PHÒNG', 'TRUONG PHONG', 
      'GIÁM ĐỐC', 'GIAM DOC'
    ];

    const isQaqcManagementMatch = (u: User) => {
      const userDept = (u.phong_ban || (u as any).phongBan || '').trim().toUpperCase();
      const isQaqcDept = qaQcKeywords.some(keyword => userDept.includes(keyword));
      
      const userPos = (u.position || '').trim().toUpperCase();
      const isLeaderPos = targetPositions.some(pos => userPos.includes(pos));
      
      return isQaqcDept && isLeaderPos;
    };

    const targets = users.filter(u => {
      if (u.id === excludeUserId) return false;
      return isStandardMatch(u) || isQaqcManagementMatch(u);
    });

    // Notify asynchronously in parallel using Promise.all
    await Promise.all(targets.map(async (target) => {
      try {
        await createNotification({
          userId: target.id,
          type: 'INFO',
          title,
          message,
          link
        });
      } catch (e) {
        console.error(`Failed to notify user ${target.id}`, e);
      }
    }));
  };

  const updateSingleInspection = async (id: string, notifySuccess: boolean = true) => {
    try {
      const updated = await fetchInspectionById(id);
      if (updated) {
        setInspections(prev => prev.map(item => item.id === id ? updated : item));
        setActiveInspection(updated);
        if (notifySuccess) alert('Thao tác thành công');
      }
    } catch (error) {
      console.error("Failed to update single record:", error);
    }
  };

  const handleSelectInspection = async (id: string) => { 
    setReturnView(view);
    setIsDetailLoading(true); 
    try { 
      const fullInspection = await fetchInspectionById(id); 
      if (fullInspection) { setActiveInspection(fullInspection); setView('DETAIL'); } 
      else { alert("Không tìm thấy phiếu."); }
    } catch (error) { alert("Lỗi tải chi tiết."); } finally { setIsDetailLoading(false); } 
  };

  const handleEditInspection = async (id: string) => { 
    setIsDetailLoading(true); 
    try { 
      const fullInspection = await fetchInspectionById(id); 
      if (fullInspection) {
        if (!canUserModifyInspection(fullInspection, user)) {
            alert("Bạn không có quyền sửa hồ sơ này (Hồ sơ đã được duyệt/ký hoặc không phải do bạn tạo).");
            setIsDetailLoading(false);
            return;
        }
        setActiveInspection(fullInspection); setInitialFormState(fullInspection); setView('FORM'); 
      } 
    } catch (e) { alert("Lỗi tải chi tiết."); } finally { setIsDetailLoading(false); }
  };

  const handleSaveInspection = async (newInspection: Inspection) => { 
      const isNew = !newInspection.id || !inspections.find(i => i.id === newInspection.id);
      await saveInspectionToSheet(newInspection); 
      
      if (isNew && user) {
        // Notify Managers and Admins about new report
        notifyUsers(['MANAGER', 'ADMIN'], 'Phiếu báo cáo mới', `QC ${user.name} vừa gửi phiếu ${newInspection.type} cho dự án ${newInspection.ten_ct}`, { view: 'DETAIL', id: newInspection.id }, user.id);
      }
      
      setView('LIST'); loadInspections(inspectionsPage, inspectionFilters); 
  };

  const startCreateInspection = async (moduleId: ModuleId) => {
      setShowModuleSelector(false);
      const template = templates[moduleId] || INITIAL_CHECKLIST_TEMPLATE;
      setInitialFormState({ 
        ...initialFormState,
        type: moduleId, 
        items: JSON.parse(JSON.stringify(template)) 
      });
      setActiveInspection(null); setView('FORM');
  };

  const handleNavigateToRecord = (targetView: ViewState, id: string) => {
      if (targetView === 'DETAIL') { handleSelectInspection(id); } else { setView(targetView); }
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} dbReady={isDbReady} />;

  if (user.requirePasswordChange || user.require_password_change) {
    return (
      <div className="fixed inset-0 z-[300] bg-slate-950 flex items-center justify-center p-4">
        <ChangePasswordModal 
          onClose={() => {}} 
          onSuccess={handlePasswordChangeSuccess} 
          forcing={true} 
          onLogout={handleLogout} 
        />
      </div>
    );
  }

  return (
    <InspectionProvider>
      <div className="flex flex-row h-[100dvh] bg-slate-50 dark:bg-[#0b1120] overflow-hidden font-sans select-none text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <div className="hidden lg:block h-full shrink-0">
            <Sidebar view={view} currentModule={currentModule} onNavigate={id => { if(id==='LIST')setCurrentModule('ALL'); setView(id as ViewState); }} user={user} onLogout={handleLogout} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} rolesList={roles} />
        </div>
        <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {isDetailLoading && (
          <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-xl flex flex-col items-center gap-4 animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
              <Loader2 className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin" />
              <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Đang tải chi tiết...</p>
            </div>
          </div>
        )}
        <GlobalHeader 
            user={user} view={view} onNavigate={setView} onLogout={handleLogout} 
            onRefresh={() => { if(view==='LIST') loadInspections(); if(view==='PROJECTS') { loadProjects(); } }} 
            onCreate={() => { setInitialFormState(undefined); setShowModuleSelector(true); }} 
            onScanClick={() => setShowQrScanner(true)} 
            onOpenSettingsTab={(tab) => { setSettingsTab(tab); setView('SETTINGS'); }}
            activeFormType={view === 'FORM' ? (activeInspection?.type || initialFormState?.type) : undefined} 
            onNavigateToRecord={handleNavigateToRecord}
        />
        <main className="flex-1 flex flex-col min-h-0 relative overflow-x-hidden overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:pb-0 px-2 md:px-6 safe-pb no-scrollbar" id="main-scroll-container">
            <Suspense fallback={<LoadingFallback />}>
                {view === 'DASHBOARD' && (
                    <Dashboard 
                        dashboardStats={dashboardStats} 
                        user={user} 
                        users={users}
                        workshops={workshops}
                        filters={dashboardFilters}
                        onNavigate={setView} 
                        onViewInspection={handleSelectInspection} 
                        onFilterChange={(filters) => {
                            setDashboardFilters(filters);
                        }}
                    />
                )}
                
                <div className={view === 'LIST' ? "contents" : "hidden"}>
                    <InspectionList 
                        inspections={inspections}
                        isLoading={isLoadingInspections}
                        onSelect={handleSelectInspection} 
                        workshops={workshops} 
                        users={users}
                        total={inspectionsTotal}
                        page={inspectionsPage}
                        onPageChange={setInspectionsPage}
                        user={user}
                        onRefresh={(filters) => {
                            loadInspections(inspectionsPage, filters || inspectionFilters);
                        }}
                        onSearch={(term) => {
                            setInspectionFilters((prev: any) => ({ ...prev, search: term }));
                            setInspectionsPage(1);
                        }}
                        onFilterChange={(filters) => {
                            setInspectionFilters(filters);
                            setInspectionsPage(1);
                        }}
                    />
                </div>
                {view === 'FORM' && (
                    activeInspection?.type === 'IQC' || initialFormState?.type === 'IQC' ? <InspectionFormIQC initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> : 
                    activeInspection?.type === 'SQC_MAT' || initialFormState?.type === 'SQC_MAT' || activeInspection?.type === 'SQC_VT' || initialFormState?.type === 'SQC_VT' ? <InspectionFormSQC_VT initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> :
                    activeInspection?.type === 'SQC_BTP' || initialFormState?.type === 'SQC_BTP' ? <InspectionFormSQC_BTP initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> :
                    activeInspection?.type === 'SITE' || initialFormState?.type === 'SITE' ? <InspectionFormSITE initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} user={user} templates={templates} /> :
                    <InspectionFormPQC initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} inspections={inspections} user={user} templates={templates} />
                )}
                {view === 'DETAIL' && activeInspection && (DETAIL_COMPONENT_MAP[activeInspection.type || 'PQC'] ? React.createElement(DETAIL_COMPONENT_MAP[activeInspection.type || 'PQC'], { 
                  inspection: activeInspection, 
                  user, 
                  onBack: () => setView(returnView), 
                  onEdit: handleEditInspection, 
                  onDelete: async (id: string) => { 
                    if (!canUserDeleteInspection(activeInspection, user)) {
                        alert("Bạn không có quyền xóa hồ sơ này (Hồ sơ đã được duyệt/ký hoặc bạn chưa được cấp quyền xóa).");
                        return;
                    }
                    if(window.confirm("Xóa phiếu này? Dữ liệu sẽ bị xóa vĩnh viễn khỏi audit log.")){ 
                        await deleteInspectionFromSheet(id); loadInspections(); setView('LIST'); 
                    } 
                  }, 
                  onApprove: async (id: string, sig: string, extra: any) => { 
                    try {
                      const updated = { ...activeInspection, ...extra };
                      const oldStatus = activeInspection.status;
                      
                      // Handle explicit status or default to APPROVED if signature is provided
                      if (extra.status) {
                        updated.status = extra.status;
                      } else if (sig || extra.managerSignature) {
                        updated.status = InspectionStatus.APPROVED;
                      }

                      if (updated.status === InspectionStatus.APPROVED) {
                        updated.managerSignature = sig || extra.managerSignature;
                        updated.managerName = extra.managerName || user.name;
                      }
                      
                      await saveInspectionToSheet(updated); 
                      
                      if (updated.status === InspectionStatus.APPROVED && oldStatus !== InspectionStatus.APPROVED) {
                        const inspector = users.find(u => u.name === updated.inspectorName);
                        if (inspector) {
                          createNotification({
                            userId: inspector.id,
                            type: 'SUCCESS',
                            title: 'Phiếu đã được phê duyệt',
                            message: `Quản lý ${user.name} đã phê duyệt phiếu ${updated.type} của bạn`,
                            link: { view: 'DETAIL', id: updated.id }
                          });
                        }
                      } else if (updated.status === InspectionStatus.REJECTED) {
                        const inspector = users.find(u => u.name === updated.inspectorName);
                        if (inspector) {
                          createNotification({
                            userId: inspector.id,
                            type: 'NCR',
                            title: 'Phiếu bị từ chối',
                            message: `Quản lý ${user.name} đã từ chối phiếu ${updated.type} của bạn`,
                            link: { view: 'DETAIL', id: updated.id }
                          });
                        }
                      }
                      
                      await updateSingleInspection(id, true);
                      setView(returnView);
                    } catch (error) {
                      alert("Lỗi xử lý: " + (error instanceof Error ? error.message : "Thất bại"));
                    }
                  }, 
                  onPostComment: async (id: string, cmt: any) => {
                    try {
                      const updated = { ...activeInspection, comments: [...(activeInspection.comments || []), cmt] };
                      await saveInspectionToSheet(updated); 
                      
                      if (user.name !== updated.inspectorName) {
                        const inspector = users.find(u => u.name === updated.inspectorName);
                        if (inspector) {
                          createNotification({
                            userId: inspector.id,
                            type: 'MESSAGE',
                            title: 'Bình luận mới',
                            message: `${user.name} vừa bình luận trong phiếu ${updated.type}`,
                            link: { view: 'DETAIL', id: updated.id }
                          });
                        }
                      }
                      await updateSingleInspection(id, false);
                    } catch (error) {
                      alert("Lỗi bình luận: " + (error instanceof Error ? error.message : "Thất bại"));
                    }
                  },
                  onViewOnPlan: (insp: Inspection) => {
                    const matchingProj = projects.find(p => p.ma_ct === insp.ma_ct);
                    if (matchingProj) {
                      setActiveProject(matchingProj);
                      setProjectInitialFocusedPinId(insp.id);
                      setView('PROJECT_DETAIL');
                    } else {
                      setActiveProject({ ma_ct: insp.ma_ct || 'unknown', name: insp.ten_ct || 'Dự án' } as any);
                      setProjectInitialFocusedPinId(insp.id);
                      setView('PROJECT_DETAIL');
                    }
                  }
                }) : null)}
                {view === 'PROJECTS' && (
                    <ProjectList 
                        projects={projects} 
                        inspections={inspections} 
                        onSelectProject={maCt => { 
                            const found = projects.find(p => p.ma_ct === maCt) || { ma_ct: maCt, name: maCt } as Project; 
                            if(found) { setActiveProject(found); setView('PROJECT_DETAIL'); } 
                        }} 
                        onSearch={(term) => { setProjectsSearch(term); setProjectsPage(1); }}
                        total={projectsTotal}
                        page={projectsPage}
                        onPageChange={setProjectsPage}
                    />
                )}
                {view === 'PROJECT_DETAIL' && activeProject && (
                    <ProjectDetail 
                        project={activeProject} 
                        inspections={inspections} 
                        user={user} 
                        onBack={() => {
                            setProjectInitialFocusedPinId(undefined);
                            setView('PROJECTS');
                        }} 
                        onViewInspection={handleSelectInspection} 
                        onUpdate={() => loadProjects()} 
                        onNavigate={setView} 
                        initialFocusedPinId={projectInitialFocusedPinId}
                    />
                )}
                {view === 'IPO' && <IPOPage user={user} />}
                {view === 'NCR_LIST' && <NCRList currentUser={user} onSelectNcr={handleSelectInspection} />}
                {view === 'DEFECT_LIBRARY' && <DefectLibrary currentUser={user} />}
                {view === 'DEFECT_LIST' && <DefectList currentUser={user} onSelectDefect={d => { setActiveDefect(d); setView('DEFECT_DETAIL'); }} onViewInspection={handleSelectInspection} />}
                {view === 'DEFECT_DETAIL' && activeDefect && <DefectDetail defect={activeDefect} user={user} onBack={() => setView('DEFECT_LIST')} onViewInspection={handleSelectInspection} />}
                {view === 'SUPPLIERS' && <SupplierManagement user={user} onSelectSupplier={s => { setActiveSupplier(s); setView('SUPPLIER_DETAIL'); }} />}
                {view === 'MATERIALS' && <MaterialManagement user={user} />}
                {view === 'TOOLS' && <ToolsManagement user={user} />}
                {view === 'SUPPLIER_DETAIL' && activeSupplier && <SupplierDetail supplier={activeSupplier} user={user} onBack={() => setView('SUPPLIERS')} onViewInspection={handleSelectInspection} />}
                {view === 'SETTINGS' && (
                    <Settings 
                        currentUser={user} allTemplates={templates} onSaveTemplate={async (id, items) => { await saveTemplate(id, items); loadTemplates(); }}
        users={users} 
        onAddUser={async (u) => { await saveUser(u); loadUsers(); }} 
        onUpdateUser={async (u) => { 
            await saveUser(u); 
            if (user && u.id === user.id) {
                const safeUser = {
                    ...u,
                    phong_ban: u.phong_ban || (u as any).phongBan || '',
                    bo_phan: u.bo_phan || (u as any).boPhan || ''
                };
                if (localStorage.getItem(AUTH_STORAGE_KEY)) {
                    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
                } else {
                    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
                }
                setUser(safeUser as User);
            }
            await loadUsers(); 
        }} 
        onDeleteUser={async (id) => { await deleteUser(id); loadUsers(); }}
        onImportUsers={async (importedUsers) => {
            for (const u of importedUsers) {
                await saveUser(u);
            }
            await loadUsers();
        }}
        workshops={workshops} 
        onAddWorkshop={async (w) => { await saveWorkshop(w); loadWorkshops(); }} 
        onUpdateWorkshop={async (w) => { await saveWorkshop(w); loadWorkshops(); }} 
        onDeleteWorkshop={async (id) => { await deleteWorkshop(id); loadWorkshops(); }}
        onClose={() => setView('DASHBOARD')} 
        onCheckConnection={async () => (await checkApiConnection()).ok} 
        initialTab={settingsTab}
    />
                )}
                {view === 'TRASH' && <Trash user={user} onNavigate={setView} />}
                {view === 'CONVERT_3D' && <ThreeDConverter />}
            </Suspense>
        </main>
        <Suspense fallback={null}>
            <MobileBottomBar view={view} onNavigate={setView} user={user} rolesList={roles} />
            <ChatAI user={user} />
            {showQrScanner && <QRScannerModal onClose={() => setShowQrScanner(false)} onScan={code => { setShowQrScanner(false); setInitialFormState({ ma_nha_may: code, workshop: code }); setShowModuleSelector(true); }} />}
        </Suspense>
        </div>
        
        {showModuleSelector && (
            <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white dark:bg-[#0f172a] w-full max-w-sm rounded-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                    <header className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 uppercase text-xs tracking-wider leading-none">LOẠI KIỂM TRA</h3>
                            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase mt-1">Chọn phiếu để khởi tạo</p>
                        </div>
                        <button onClick={() => setShowModuleSelector(false)} className="p-1 px-[7px] py-[7px] hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-md text-slate-400 dark:text-slate-500 active:scale-90 transition-all"><X className="w-4 h-4"/></button>
                    </header>
                    
                    <div className="flex-1 overflow-y-auto p-3 no-scrollbar space-y-1.5 bg-slate-50 dark:bg-slate-800/50/30">
                        {(ALL_MODULES || [])
                            .filter(m => (m.group === 'KIỂM TRA CHẤT LƯỢNG' || m.group === 'QC' || m.group === 'QA') && m.id !== 'SUPPLIERS' && m.id !== 'PROJECTS' && (user.role === 'ADMIN' || user.role === 'MANAGER' || user.allowedModules?.includes(m.id) || hasPermission(user, roles, m.id, 'VIEW') || hasPermission(user, roles, m.id, 'CREATE')))
                            .map(mod => (
                                <button 
                                    key={mod.id} 
                                    onClick={() => startCreateInspection(mod.id)} 
                                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center gap-3 transition-all active:scale-[0.98] hover:border-blue-300 dark:border-slate-700 group shadow-sm"
                                >
                                    <div className="p-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-md text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors border border-slate-50 group-hover:border-blue-600">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <span className="font-bold text-blue-800 text-[13px] tracking-tight truncate block group-hover:text-blue-900">
                                            {mod.label}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest block mt-0.5">
                                            {mod.group} Control
                                        </span>
                                    </div>
                                    <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-300 group-hover:text-blue-50 group-hover:bg-blue-50 dark:bg-slate-800/80 transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                </button>
                            ))
                        }
                    </div>
                    
                    <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                        <button 
                            onClick={() => setShowModuleSelector(false)}
                            className="w-full py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-slate-600 dark:text-slate-400 dark:text-slate-500 transition-colors"
                        >
                            ĐÓNG DANH SÁCH
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </InspectionProvider>
  );
};

export default App;
