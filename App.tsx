
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
  SQC_TP_CHECKLIST_TEMPLATE, 
  FSR_CHECKLIST_TEMPLATE,
  STEP_CHECKLIST_TEMPLATE,
  FQC_CHECKLIST_TEMPLATE,
  SPR_CHECKLIST_TEMPLATE,
  SITE_TEMPLATES,
  ALL_MODULES
} from './constants';

import { LoginPage } from './components/LoginPage';
import { GlobalHeader } from './components/GlobalHeader';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileBottomBar } from './components/MobileBottomBar';
import { ConfirmDialog } from './src/components/qms';
import { 
  fetchInspections, 
  fetchDashboardStats,
  fetchInspectionById,
  fetchPublicInspectionById,
  saveInspectionToSheet, 
  deleteInspectionFromSheet, 
  checkApiConnection, 
  fetchUsers, 
  saveUser, 
  importUsersBatch,
  deleteUser, 
  fetchWorkshops, 
  saveWorkshop, 
  deleteWorkshop, 
  fetchTemplates, 
  saveTemplate, 
  fetchProjects, 
  createNotification,
  fetchRoles,
  fetchSubcontractorBookingById
} from './services/apiService';
import { Loader2, X, FileText, ChevronRight, Bell } from 'lucide-react';
import { buildSqcPrefillFromBooking } from './src/utils/bookingDocuments';
import { canInspectM03Booking } from './src/utils/m03Rbac';

const lazyWithRetry = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) =>
  lazy(async () => {
    const reloadFlag = 'qms_lazy_chunk_reloaded';
    try {
      const mod = await factory();
      if (typeof window !== 'undefined') {
        try { sessionStorage.removeItem(reloadFlag); } catch {}
      }
      return mod;
    } catch (firstErr) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const mod = await factory();
        if (typeof window !== 'undefined') {
          try { sessionStorage.removeItem(reloadFlag); } catch {}
        }
        return mod;
      } catch (secondErr) {
        if (typeof window !== 'undefined') {
          let alreadyReloaded = false;
          try { alreadyReloaded = sessionStorage.getItem(reloadFlag) === '1'; } catch {}
          if (!alreadyReloaded) {
            try { sessionStorage.setItem(reloadFlag, '1'); } catch {}
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        }
        throw secondErr;
      }
    }
  });

const ChatAI = lazyWithRetry(() => import('./components/ChatAI').then(m => ({ default: m.ChatAI })));
const ChangePasswordModal = lazyWithRetry(() => import('./components/ChangePasswordModal').then(m => ({ default: m.ChangePasswordModal })));
const QCAssignmentReminderModal = lazyWithRetry(() => import('./components/QCAssignmentReminderModal').then(m => ({ default: m.QCAssignmentReminderModal })));
import { TraceabilityPanel, TraceabilityLookupModal } from './components/TraceabilityPanel';

const Dashboard = lazyWithRetry(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const InspectionList = lazyWithRetry(() => import('./components/InspectionList').then(m => ({ default: m.InspectionList })));
const InspectionFormPQC = lazyWithRetry(() => import('./components/inspectionformPQC').then(m => ({ default: m.InspectionFormPQC })));
const InspectionFormIQC = lazyWithRetry(() => import('./components/inspectionformIQC').then(m => ({ default: m.InspectionFormIQC })));
const InspectionFormSQC_VT = lazyWithRetry(() => import('./components/inspectionformSQC_VT').then(m => ({ default: m.InspectionFormSQC_VT })));
const InspectionFormSQC_BTP = lazyWithRetry(() => import('./components/inspectionformSQC_BTP').then(m => ({ default: m.InspectionFormSQC_BTP })));
const InspectionFormSQC_TP = lazyWithRetry(() => import('./components/inspectionformSQC_TP').then(m => ({ default: m.InspectionFormSQC_TP })));
const InspectionFormFRS = lazyWithRetry(() => import('./components/inspectionformFRS').then(m => ({ default: m.InspectionFormFRS })));
const InspectionFormStepVecni = lazyWithRetry(() => import('./components/inspectionformStepVecni').then(m => ({ default: m.InspectionFormStepVecni })));
const InspectionFormFQC = lazyWithRetry(() => import('./components/inspectionformFQC').then(m => ({ default: m.InspectionFormFQC })));
const InspectionFormSPR = lazyWithRetry(() => import('./components/inspectionformSPR').then(m => ({ default: m.InspectionFormSPR })));
const InspectionFormSITE = lazyWithRetry(() => import('./components/inspectionformSITE').then(m => ({ default: m.InspectionFormSITE })));

const InspectionDetailPQC = lazyWithRetry(() => import('./components/inspectiondetailPQC').then(m => ({ default: m.InspectionDetailPQC })));
const InspectionDetailIQC = lazyWithRetry(() => import('./components/inspectiondetailIQC').then(m => ({ default: m.InspectionDetailIQC })));
const InspectionDetailSQC_VT = lazyWithRetry(() => import('./components/inspectiondetailSQC_VT').then(m => ({ default: m.InspectionDetailSQC_VT })));
const InspectionDetailSQC_BTP = lazyWithRetry(() => import('./components/inspectiondetailSQC_BTP').then(m => ({ default: m.InspectionDetailSQC_BTP })));
const InspectionDetailSQC_TP = lazyWithRetry(() => import('./components/inspectiondetailSQC_TP').then(m => ({ default: m.InspectionDetailSQC_TP })));
const InspectionDetailFRS = lazyWithRetry(() => import('./components/inspectiondetailFRS').then(m => ({ default: m.InspectionDetailFRS })));
const InspectionDetailStepVecni = lazyWithRetry(() => import('./components/inspectiondetailStepVecni').then(m => ({ default: m.InspectionDetailStepVecni })));
const InspectionDetailFQC = lazyWithRetry(() => import('./components/inspectiondetailFQC').then(m => ({ default: m.InspectionDetailFQC })));
const InspectionDetailSPR = lazyWithRetry(() => import('./components/inspectiondetailSPR').then(m => ({ default: m.InspectionDetailSPR })));
const InspectionDetailSITE = lazyWithRetry(() => import('./components/inspectiondetailSITE').then(m => ({ default: m.InspectionDetailSITE })));

const Settings = lazyWithRetry(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const IPOPage = lazyWithRetry(() => import('./components/IPOPage'));
const ThreeDConverter = lazyWithRetry(() => import('./components/ThreeDConverter').then(m => ({ default: m.ThreeDConverter })));
const ProjectList = lazyWithRetry(() => import('./components/ProjectList').then(m => ({ default: m.ProjectList })));
const ProjectDetail = lazyWithRetry(() => import('./components/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const NCRList = lazyWithRetry(() => import('./components/NCRList').then(m => ({ default: m.NCRList })));
const DefectLibrary = lazyWithRetry(() => import('./components/DefectLibrary').then(m => ({ default: m.DefectLibrary })));
const DefectList = lazyWithRetry(() => import('./components/DefectList').then(m => ({ default: m.DefectList })));
const DefectDetail = lazyWithRetry(() => import('./components/DefectDetail').then(m => ({ default: m.DefectDetail })));
const SupplierManagement = lazyWithRetry(() => import('./components/SupplierManagement').then(m => ({ default: m.default || m.SupplierManagement })));
const SupplierDetail = lazyWithRetry(() => import('./components/SupplierDetail').then(m => ({ default: m.default || m.SupplierDetail })));
const MaterialManagement = lazyWithRetry(() => import('./components/MaterialManagement').then(m => ({ default: m.MaterialManagement })));
const ToolsManagement = lazyWithRetry(() => import('./components/ToolsManagement').then(m => ({ default: m.ToolsManagement })));
const Trash = lazyWithRetry(() => import('./components/Trash').then(m => ({ default: m.Trash })));
const QRScannerModal = lazyWithRetry(() => import('./components/QRScannerModal').then(m => ({ default: m.QRScannerModal })));
const SubcontractorBookingManagement = lazyWithRetry(() => import('./components/SubcontractorBookingManagement').then(m => ({ default: m.SubcontractorBookingManagement })));

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const safeStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (storageType: 'local' | 'session', key: string, value: string) => {
  try {
    const target = storageType === 'local' ? localStorage : sessionStorage;
    target.setItem(key, value);
  } catch {}
};

const safeStorageRemove = (key: string) => {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
};

const DETAIL_COMPONENT_MAP: Record<string, any> = {
    'IQC': InspectionDetailIQC,
    'SQC_MAT': InspectionDetailSQC_VT,
    'SQC_VT': InspectionDetailSQC_VT,
    'SQC_BTP': InspectionDetailSQC_BTP, 'SQC_TP': InspectionDetailSQC_TP,
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
  const [isPublicView, setIsPublicView] = useState(false);
  const [shareId] = useState(() => {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        return params.get('share');
    }
    return null;
  });
  const [isDbReady, setIsDbReady] = useState(true);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [deleteInspectionId, setDeleteInspectionId] = useState<string | null>(null);
  const [hasVisitedList, setHasVisitedList] = useState(false);
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
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE, 'SQC_VT': SQC_MAT_CHECKLIST_TEMPLATE, 'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE, 'SQC_TP': SQC_TP_CHECKLIST_TEMPLATE, 
      'FSR': FSR_CHECKLIST_TEMPLATE, 'STEP': STEP_CHECKLIST_TEMPLATE, 'FQC': FQC_CHECKLIST_TEMPLATE, 'SPR': SPR_CHECKLIST_TEMPLATE
  });
  
  const [initialFormState, setInitialFormState] = useState<Partial<Inspection> | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrTraceCode, setQrTraceCode] = useState<string | null>(null);
  const [inspectionNavStack, setInspectionNavStack] = useState<string[]>([]);
  const [settingsTab, setSettingsTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS' | 'SYSTEM_AUDIT'>('TEMPLATE');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__QMS_MARK_MOUNTED__?.();
    }
    const localData = safeStorageGet(AUTH_STORAGE_KEY);
    const authToken = safeStorageGet('aatn_qms_token');
    if (localData && authToken) {
      try {
        const parsedUser = JSON.parse(localData);
        if (parsedUser?.role) {
          setUser(parsedUser);
          const initialView: ViewState = parsedUser.role === 'QC' ? 'LIST' : 'DASHBOARD';
          setView(initialView);
          if (initialView === 'LIST') setHasVisitedList(true);
          if (typeof window !== 'undefined') {
            const traceParam = new URLSearchParams(window.location.search).get('trace');
            if (traceParam && !shareId) {
              setQrTraceCode(traceParam.trim());
            }
          }
        }
      } catch (e) {
        console.error("Auth hydrate failed", e);
        safeStorageRemove(AUTH_STORAGE_KEY);
        safeStorageRemove('aatn_qms_token');
      }
    } else if (localData && !authToken && !shareId) {
      // Clear legacy pre-JWT session without a Bearer token so user cleanly logs in
      safeStorageRemove(AUTH_STORAGE_KEY);
    }

    const startup = async () => {
      try {
        setIsDbReady(true);
        if (shareId) {
          const inspection = await fetchPublicInspectionById(shareId);
          if (inspection) {
            setIsPublicView(true);
            setUser({
              id: 'guest',
              username: 'guest',
              name: 'Khách xem báo cáo',
              role: 'GUEST',
              avatar: '',
              workLocation: 'Hệ thống QMS',
            } as any);
            setActiveInspection(inspection);
            setView('DETAIL');
          }
        }
      } catch (error) {
        setIsDbReady(true);
      }
    };
    startup();

    const handleAuthExpired = () => {
      if (!shareId) {
        hydratedForUserRef.current = null;
        safeStorageRemove(AUTH_STORAGE_KEY);
        safeStorageRemove('aatn_qms_token');
        setDashboardStats(null);
        setUser(null);
        setActiveInspection(null);
        setView('DASHBOARD');
      }
    };
    window.addEventListener('qms-auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('qms-auth-expired', handleAuthExpired);
    };
  }, []);

  // Track LIST visit once so InspectionList preserves state across DETAIL -> Back without eager Dashboard mount storm
  useEffect(() => {
    if (view === 'LIST' && !hasVisitedList) {
      setHasVisitedList(true);
    }
  }, [view, hasVisitedList]);

  // Hydrate directory/reference metadata only after user is authenticated (skip 5MB preload at LoginPage)
  const hydratedForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || !isDbReady) return;
    if (hydratedForUserRef.current === user.id) return;
    hydratedForUserRef.current = user.id;
    if (isPublicView) return;
    Promise.all([loadUsers(), loadRoles(), loadWorkshops(), loadTemplates()]).catch(() => {});
  }, [user?.id, isDbReady, isPublicView]);

  // Inspections load only when user actually views LIST (or Projects/Form if empty)
  useEffect(() => {
    if (user && isDbReady && (view === 'LIST' || (inspections.length === 0 && (view === 'PROJECTS' || view === 'PROJECT_DETAIL')))) {
      loadInspections(inspectionsPage, inspectionFilters);
    }
  }, [user, isDbReady, view, inspectionsPage, inspectionFilters]);

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
    } catch (e: any) {
        if (e?.status === 401) return;
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
    } catch (e: any) {
        if (e?.status === 401) return;
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
    } catch (e: any) {
        if (e?.status === 401) return;
        console.error("Load projects failed", e);
    } 
  };
  
  const handleLogin = (loggedInUser: User, remember: boolean) => {  
    const { password, ...safeUser } = loggedInUser; 
    setUser(safeUser as User); 
    safeStorageSet(remember ? 'local' : 'session', AUTH_STORAGE_KEY, JSON.stringify(safeUser)); 
    const nextView: ViewState = safeUser.role === 'QC' ? 'LIST' : 'DASHBOARD';
    setView(nextView); 
    if (nextView === 'LIST') setHasVisitedList(true);
  };

  const handlePasswordChangeSuccess = (updatedUser: User) => {
    const { password, ...safeUser } = updatedUser;
    setUser(safeUser as User);
    let isLocal = false;
    try { isLocal = Boolean(localStorage.getItem(AUTH_STORAGE_KEY)); } catch {}
    safeStorageSet(isLocal ? 'local' : 'session', AUTH_STORAGE_KEY, JSON.stringify(safeUser));
  };
  
  const handleLogout = () => { 
    hydratedForUserRef.current = null;
    setUser(null); 
    setView('DASHBOARD'); 
    setHasVisitedList(false);
    safeStorageRemove(AUTH_STORAGE_KEY);
    safeStorageRemove('aatn_qms_token');
    safeStorageRemove('aatn_saved_username');
  };

  const notifyUsers = async (targetRoles: string[], title: string, message: string, link?: { view: ViewState, id: string }, excludeUserId?: string, sender?: User) => {
    const isStandardMatch = (u: User) => targetRoles.includes(u.role as string);

    const qaQcKeywords = ['QA', 'QC', 'CHẤT LƯỢNG', 'CHAT LUONG', 'QUALITY'];
    const highLevelPositions = [
      'TRƯỞNG BỘ PHẬN', 'TRUONG BO PHAN', 
      'TRƯỞNG PHÒNG', 'TRUONG PHONG', 
      'GIÁM ĐỐC', 'GIAM DOC'
    ];
    const teamLeadPositions = ['TỔ TRƯỞNG', 'TO TRUONG'];

    const targets = users.filter(u => {
      if (u.id === excludeUserId) return false;
      
      const userPos = (u.position || '').trim().toUpperCase();
      const userDept = (u.phong_ban || (u as any).phongBan || '').trim().toUpperCase();
      const isQaqcDept = qaQcKeywords.some(keyword => userDept.includes(keyword));
      
      const isHighLevel = highLevelPositions.some(pos => userPos.includes(pos)) && isQaqcDept;
      const isStandardRole = isStandardMatch(u);
      
      // Rule: Team Leads ONLY receive from their own team (Strict restriction override)
      const isTeamLead = teamLeadPositions.some(pos => userPos.includes(pos));

      if (isTeamLead) {
        if (!sender) return false; // Don't notify if we don't know who sent it
        const uTeam = (u.to_qc || u.team_id || (u as any).toQC || '').trim().toUpperCase();
        const sTeam = (sender.to_qc || sender.team_id || (sender as any).toQC || '').trim().toUpperCase();
        return uTeam === sTeam && uTeam !== '';
      }

      // Rule: High Level QAQC Management or Managers/Admins receive all
      return isStandardRole || isHighLevel;
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

  const handleSelectInspection = async (id: string, options?: { pushStack?: boolean }) => {
    const willPush = Boolean(options?.pushStack && view === 'DETAIL' && activeInspection?.id && activeInspection.id !== id);
    if (willPush && activeInspection?.id) {
      setInspectionNavStack(prev => [...prev, activeInspection.id]);
    } else if (!options?.pushStack) {
      if (view !== 'DETAIL') {
        setReturnView(view);
      }
      setInspectionNavStack([]);
    }
    setIsDetailLoading(true);
    try {
      if (!id) {
        throw new Error("Không tìm thấy mã hồ sơ trong liên kết.");
      }
      const fullInspection = isPublicView
        ? await fetchPublicInspectionById(id)
        : await fetchInspectionById(id);
      if (fullInspection) {
        setActiveInspection(fullInspection);
        setView('DETAIL');
        if (typeof document !== 'undefined') {
          const mainEl = document.getElementById('main-scroll-container');
          if (mainEl) mainEl.scrollTop = 0;
        }
      } else {
        alert("Không tìm thấy phiếu.");
      }
    } catch (error) {
      console.error("Lỗi tải chi tiết:", error);
      alert("Lỗi tải chi tiết: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handlePopInspectionStack = async () => {
    if (inspectionNavStack.length === 0) {
      if (!isPublicView) setView(returnView);
      return;
    }
    const previousId = inspectionNavStack[inspectionNavStack.length - 1];
    setInspectionNavStack(prev => prev.slice(0, -1));
    setIsDetailLoading(true);
    try {
      const prevInspection = isPublicView
        ? await fetchPublicInspectionById(previousId)
        : await fetchInspectionById(previousId);
      if (prevInspection) {
        setActiveInspection(prevInspection);
        setView('DETAIL');
      }
    } catch (error) {
      console.error("Lỗi quay lại phiếu trước:", error);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleEditInspection = async (id: string) => { 
    setIsDetailLoading(true); 
    try { 
      if (!id) {
        throw new Error("Không tìm thấy mã hồ sơ.");
      }
      const fullInspection = await fetchInspectionById(id); 
      if (fullInspection) {
        if (!canUserModifyInspection(fullInspection, user)) {
            alert("Bạn không có quyền sửa hồ sơ này (Hồ sơ đã được duyệt/ký hoặc không phải do bạn tạo).");
            setIsDetailLoading(false);
            return;
        }
        setActiveInspection(fullInspection); setInitialFormState(fullInspection); setView('FORM'); 
      } 
    } catch (e) { 
      console.error("Lỗi tải chi tiết:", e);
      alert("Lỗi tải chi tiết: " + (e instanceof Error ? e.message : String(e))); 
    } finally { setIsDetailLoading(false); }
  };

  const handleSaveInspection = async (newInspection: Inspection) => { 
      const hasExplicitBookingId = Object.prototype.hasOwnProperty.call(newInspection, 'booking_id');
      const hasExplicitBookingCode = Object.prototype.hasOwnProperty.call(newInspection, 'booking_code');
      const fallbackBookingId = !activeInspection && !hasExplicitBookingId ? (initialFormState as any)?.booking_id : undefined;
      const fallbackBookingCode = !activeInspection && !hasExplicitBookingCode ? (initialFormState as any)?.booking_code : undefined;
      const inspectionToSave: Inspection = {
        ...newInspection,
        ...(!hasExplicitBookingId && fallbackBookingId ? { booking_id: fallbackBookingId } : {}),
        ...(!hasExplicitBookingCode && fallbackBookingCode ? { booking_code: fallbackBookingCode } : {}),
      };
      const isNew = !inspectionToSave.id || !inspections.find(i => i.id === inspectionToSave.id);
      await saveInspectionToSheet(inspectionToSave); 
      
      if (isNew && user) {
        // Notify Managers and Admins about new report
        notifyUsers(['MANAGER', 'ADMIN'], 'Phiếu báo cáo mới', `QC ${user.name} vừa gửi phiếu ${inspectionToSave.type} cho dự án ${inspectionToSave.ten_ct}`, { view: 'DETAIL', id: inspectionToSave.id }, user.id, user);
      }

      const hasLinkedBooking = Boolean(
        (inspectionToSave as any)?.booking_id ||
        (inspectionToSave as any)?.bookingId ||
        (inspectionToSave as any)?.booking_code ||
        (inspectionToSave as any)?.bookingCode
      );
      const isSqcType = String(inspectionToSave.type || '').toUpperCase().startsWith('SQC');
      setView(hasLinkedBooking && isSqcType ? 'SUBCONTRACTOR_BOOKING' : 'LIST');
      loadInspections(inspectionsPage, inspectionFilters); 
  };

  const startCreateInspection = async (moduleId: ModuleId) => {
      setShowModuleSelector(false);
      const template = templates[moduleId] || INITIAL_CHECKLIST_TEMPLATE;
      setInitialFormState({ 
        type: moduleId, 
        items: JSON.parse(JSON.stringify(template)) 
      });
      setActiveInspection(null); setView('FORM');
  };

  const handleNavigateToRecord = (targetView: ViewState, id: string) => {
      let resolvedView = targetView;
      let resolvedId = id;
      
      // Support link object if passed as targetView or targetId
      if (targetView && typeof targetView === 'object') {
          const obj = targetView as any;
          resolvedView = obj.view;
          resolvedId = obj.id || obj.inspectionId || obj.ncrId;
          if (!resolvedView && obj.inspectionId) resolvedView = 'DETAIL';
          if (!resolvedView && obj.ncrId) resolvedView = 'NCR_LIST';
      } else if (id && typeof id === 'object') {
          const obj = id as any;
          resolvedId = obj.id || obj.inspectionId || obj.ncrId;
          if (!resolvedView && obj.inspectionId) resolvedView = 'DETAIL';
          if (!resolvedView && obj.ncrId) resolvedView = 'NCR_LIST';
      }

      if (resolvedView === 'DETAIL') { 
          handleSelectInspection(resolvedId); 
      } else if (resolvedView) { 
          setView(resolvedView); 
      }
  };

  const startSubcontractorInspection = (booking: any) => {
    if (!canInspectM03Booking(user, booking, roles)) {
      alert('Bạn không có quyền nghiệm thu SQC cho lịch hẹn này.');
      return;
    }
    const sqcType = (booking.sqcType as ModuleId) || 'SQC_BTP';
    const template = templates[sqcType] || SQC_BTP_CHECKLIST_TEMPLATE;
    const prefill = buildSqcPrefillFromBooking(booking, sqcType, template);

    setInitialFormState(prefill as any);
    setActiveInspection(null);
    setView('FORM');
  };

  const handleStartInspectionByBookingId = async (bookingId: string) => {
    try {
      const bRes = await fetchSubcontractorBookingById(bookingId);
      const bk = (bRes as any)?.booking || bRes;
      if (bk) {
        startSubcontractorInspection(bk);
      }
    } catch (e) {
      console.error("Lỗi khi tải thông tin booking:", e);
      setView('SUBCONTRACTOR_BOOKING');
    }
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} dbReady={isDbReady} />;

  if (user.requirePasswordChange || user.require_password_change) {
    return (
      <div className="fixed inset-0 z-[300] bg-slate-950 flex items-center justify-center p-4">
        <Suspense fallback={<LoadingFallback />}>
          <ChangePasswordModal 
            onClose={() => {}} 
            onSuccess={handlePasswordChangeSuccess} 
            forcing={true} 
            onLogout={handleLogout} 
          />
        </Suspense>
      </div>
    );
  }

  return (
      <InspectionProvider autoInit={hasVisitedList}>
      <div className="flex flex-row h-[100dvh] bg-slate-50 dark:bg-[#0b1120] overflow-hidden font-sans select-none text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {!isPublicView && (
            <div className="hidden lg:block h-full shrink-0">
                <Sidebar view={view} currentModule={currentModule} onNavigate={id => { if(id==='LIST')setCurrentModule('ALL'); setView(id as ViewState); }} user={user} onLogout={handleLogout} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} rolesList={roles} />
            </div>
        )}
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
            user={user} roles={roles} view={view} onNavigate={setView} onLogout={handleLogout} 
            onRefresh={() => { if(view==='LIST') loadInspections(); if(view==='PROJECTS') { loadProjects(); } }} 
            onCreate={() => { setInitialFormState(undefined); setShowModuleSelector(true); }} 
            onScanClick={() => setShowQrScanner(true)} 
            onOpenSettingsTab={(tab) => { setSettingsTab(tab); setView('SETTINGS'); }}
            activeFormType={view === 'FORM' ? (activeInspection?.type || initialFormState?.type) : undefined} 
            onNavigateToRecord={handleNavigateToRecord}
            isPublicView={isPublicView}
        />
        <main className={`flex-1 flex flex-col min-h-0 relative overflow-x-hidden ${view === 'DETAIL' ? 'overflow-hidden pb-[calc(env(safe-area-inset-bottom)+3.75rem)] lg:pb-0' : 'overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:pb-0'} ${view === 'SUBCONTRACTOR_BOOKING' ? 'px-0' : 'px-2 md:px-6'} safe-pb no-scrollbar`} id="main-scroll-container">
          <ErrorBoundary>
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
                
                {hasVisitedList && (
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
                )}
                {view === 'FORM' && (
                    activeInspection?.type === 'IQC' || initialFormState?.type === 'IQC' ? <InspectionFormIQC initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} inspections={inspections} user={user} templates={templates} /> : 
                    activeInspection?.type === 'SQC_MAT' || initialFormState?.type === 'SQC_MAT' || activeInspection?.type === 'SQC_VT' || initialFormState?.type === 'SQC_VT' ? <InspectionFormSQC_VT initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView((activeInspection as any)?.booking_id || (initialFormState as any)?.booking_id ? 'SUBCONTRACTOR_BOOKING' : 'LIST')} inspections={inspections} user={user} templates={templates} /> :
                    activeInspection?.type === 'SQC_BTP' || initialFormState?.type === 'SQC_BTP' ? <InspectionFormSQC_BTP initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView((activeInspection as any)?.booking_id || (initialFormState as any)?.booking_id ? 'SUBCONTRACTOR_BOOKING' : 'LIST')} inspections={inspections} user={user} templates={templates} /> :
                    activeInspection?.type === 'SQC_TP' || initialFormState?.type === 'SQC_TP' ? <InspectionFormSQC_TP initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView((activeInspection as any)?.booking_id || (initialFormState as any)?.booking_id ? 'SUBCONTRACTOR_BOOKING' : 'LIST')} inspections={inspections} user={user} templates={templates} /> :
                    activeInspection?.type === 'FSR' || initialFormState?.type === 'FSR' ? <InspectionFormFRS initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} user={user} templates={templates} inspections={inspections} /> :
                    activeInspection?.type === 'FQC' || initialFormState?.type === 'FQC' ? <InspectionFormFQC initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} user={user} templates={templates} inspections={inspections} /> :
                    activeInspection?.type === 'SPR' || initialFormState?.type === 'SPR' ? <InspectionFormSPR initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} user={user} templates={templates} inspections={inspections} /> :
                    activeInspection?.type === 'STEP' || initialFormState?.type === 'STEP' ? <InspectionFormStepVecni initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} user={user} templates={templates} inspections={inspections} /> :
                    activeInspection?.type === 'SITE' || initialFormState?.type === 'SITE' ? <InspectionFormSITE initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} user={user} templates={templates} /> :
                    <InspectionFormPQC initialData={activeInspection || initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} workshops={workshops} inspections={inspections} user={user} templates={templates} />
                )}
                {view === 'DETAIL' && activeInspection && (
                  <div className="flex flex-col h-full min-h-0 overflow-hidden">
                    <div className="shrink-0 mb-2">
                      <TraceabilityPanel
                        variant="banner-drawer"
                        inspection={activeInspection}
                        user={user}
                        isPublicView={isPublicView}
                        canGoBackInStack={inspectionNavStack.length > 0}
                        onGoBackInStack={handlePopInspectionStack}
                        onViewInspection={(targetId) => handleSelectInspection(targetId, { pushStack: true })}
                      />
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                      {DETAIL_COMPONENT_MAP[activeInspection.type || 'PQC'] ? React.createElement(DETAIL_COMPONENT_MAP[activeInspection.type || 'PQC'], { 
                        inspection: activeInspection, 
                        user, 
                        onBack: () => {
                          if (inspectionNavStack.length > 0) {
                            handlePopInspectionStack();
                          } else if (!isPublicView) {
                            setView(returnView);
                          }
                        }, 
                        onEdit: handleEditInspection, 
                        onDelete: async (id: string) => { 
                          if (!canUserDeleteInspection(activeInspection, user)) {
                              alert("Bạn không có quyền xóa hồ sơ này (Hồ sơ đã được duyệt/ký hoặc bạn chưa được cấp quyền xóa).");
                              return;
                          }
                          setDeleteInspectionId(id);
                        }, 
                  onApprove: async (id: string, sig: string, extra: any = {}) => { 
                    try {
                      const updated = { ...activeInspection, ...extra };
                      const oldStatus = String(activeInspection.status || '').toUpperCase();
                      
                      // Handle explicit status or default to APPROVED only if no explicit status provided
                      if (extra?.status) {
                        updated.status = String(extra.status).toUpperCase() as InspectionStatus;
                      } else if (sig || extra?.managerSignature) {
                        updated.status = InspectionStatus.APPROVED;
                      }

                      if (sig || extra?.managerSignature) {
                        updated.managerSignature = sig || extra.managerSignature;
                        updated.managerName = extra.managerName || user.name;
                      }
                      
                      await saveInspectionToSheet(updated); 
                      
                      const nextStatusUpper = String(updated.status || '').toUpperCase();
                      if ((nextStatusUpper === 'APPROVED' || nextStatusUpper === 'VERIFIED' || nextStatusUpper === 'LOCKED') && oldStatus !== nextStatusUpper) {
                        const inspector = users.find(u => u.name === updated.inspectorName);
                        if (inspector) {
                          const actionTitle =
                            nextStatusUpper === 'LOCKED'
                              ? 'Phiếu đã khóa hồ sơ ISO'
                              : nextStatusUpper === 'VERIFIED'
                                ? 'Phiếu đã được thẩm tra'
                                : 'Phiếu đã được phê duyệt';
                          createNotification({
                            userId: inspector.id,
                            type: 'SUCCESS',
                            title: actionTitle,
                            message: `${user.name} đã cập nhật phiếu ${updated.type} sang trạng thái ${nextStatusUpper}`,
                            link: { view: 'DETAIL', id: updated.id }
                          });
                        }
                      } else if (nextStatusUpper === 'REJECTED') {
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
                      throw error;
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
                  onViewInspection: handleSelectInspection,
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
                }) : null}
                    </div>
                  </div>
                )}
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
                {view === 'IPO' && <IPOPage user={user} onViewInspection={handleSelectInspection} />}
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
                        currentUser={user}
                        roles={roles}
                        onRolesChanged={loadRoles}
                        allTemplates={templates}
                        onSaveTemplate={async (id, items) => {
                            await saveTemplate(id, items);
                            if (id === 'SQC_MAT') await saveTemplate('SQC_VT', items).catch(() => {});
                            else if (id === 'SQC_VT') await saveTemplate('SQC_MAT', items).catch(() => {});
                            await loadTemplates();
                        }}
                        users={users} 
                        onAddUser={async (u) => { await saveUser(u); await loadUsers(); }} 
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
                        onPasswordUpdated={(updatedUser) => {
                            if (updatedUser && user && updatedUser.id === user.id) {
                                const safeUser = {
                                    ...user,
                                    ...updatedUser,
                                    requirePasswordChange: false,
                                    require_password_change: false,
                                    phong_ban: updatedUser.phong_ban || (updatedUser as any).phongBan || user.phong_ban || '',
                                    bo_phan: updatedUser.bo_phan || (updatedUser as any).boPhan || user.bo_phan || '',
                                };
                                if (localStorage.getItem(AUTH_STORAGE_KEY)) {
                                    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
                                } else {
                                    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser));
                                }
                                setUser(safeUser as User);
                            }
                            loadUsers();
                        }}
                        onDeleteUser={async (id) => { await deleteUser(id); await loadUsers(); }}
                        onImportUsers={async (importedUsers) => {
                            try {
                                await importUsersBatch(importedUsers);
                            } catch (err) {
                                console.warn('Batch import failed, falling back to sequential saveUser:', err);
                                for (const u of importedUsers) {
                                    await saveUser(u);
                                }
                            }
                            await loadUsers();
                        }}
                        workshops={workshops} 
                        onAddWorkshop={async (w) => { await saveWorkshop(w); await loadWorkshops(); }} 
                        onUpdateWorkshop={async (w) => { await saveWorkshop(w); await loadWorkshops(); }} 
                        onDeleteWorkshop={async (id) => { await deleteWorkshop(id); await loadWorkshops(); }}
                        onClose={() => setView('DASHBOARD')} 
                        onCheckConnection={async () => (await checkApiConnection()).ok} 
                        initialTab={settingsTab}
                    />
                )}
                {view === 'TRASH' && <Trash user={user} onNavigate={setView} />}
                {view === 'CONVERT_3D' && <ThreeDConverter />}
                {view === 'SUBCONTRACTOR_BOOKING' && (
                    <SubcontractorBookingManagement 
                        currentUser={user} 
                        rolesList={roles}
                        onStartInspection={startSubcontractorInspection}
                        onViewInspection={handleSelectInspection}
                    />
                )}
            </Suspense>
          </ErrorBoundary>
        </main>
        <Suspense fallback={null}>
            {!isPublicView && <MobileBottomBar view={view} onNavigate={setView} user={user} rolesList={roles} />}
            {!isPublicView && <ChatAI user={user} hideFloatingTriggerOnMobile={view === 'FORM' || view === 'DETAIL'} />}
            {showQrScanner && (
              <QRScannerModal
                onClose={() => setShowQrScanner(false)}
                onScan={(rawCode) => {
                  setShowQrScanner(false);
                  const trimmed = (rawCode || '').trim();
                  if (!trimmed) return;
                  const shareMatch = trimmed.match(/[?&]share=([^&#\s]+)/i);
                  if (shareMatch && shareMatch[1]) {
                    handleSelectInspection(decodeURIComponent(shareMatch[1]));
                    return;
                  }
                  setQrTraceCode(trimmed);
                }}
              />
            )}
            {qrTraceCode && (
              <TraceabilityLookupModal
                open={Boolean(qrTraceCode)}
                scannedCode={qrTraceCode}
                user={user}
                onClose={() => setQrTraceCode(null)}
                onViewInspection={(targetId) => {
                  setQrTraceCode(null);
                  handleSelectInspection(targetId);
                }}
                onCreateNewForCode={(c) => {
                  setQrTraceCode(null);
                  setInitialFormState({ ma_nha_may: c, workshop: c });
                  setShowModuleSelector(true);
                }}
              />
            )}
            {!isPublicView && (
              <ErrorBoundary>
                <QCAssignmentReminderModal
                    currentUser={user}
                    rolesList={roles}
                    onStartInspectionForBooking={handleStartInspectionByBookingId}
                    onNavigateToBookingList={() => setView('SUBCONTRACTOR_BOOKING')}
                    onClose={() => {}}
                />
              </ErrorBoundary>
            )}
        </Suspense>
        </div>
        
        {showModuleSelector && (
            <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
                <div className="bg-white dark:bg-[#0f172a] w-full max-w-sm rounded-lg shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[85dvh] overflow-hidden animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                    <header className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-900 shrink-0">
                        <div className="flex flex-col min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 uppercase text-xs tracking-wider leading-tight truncate">LOẠI KIỂM TRA</h3>
                            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase mt-0.5 truncate">Chọn phiếu để khởi tạo</p>
                        </div>
                        <button onClick={() => setShowModuleSelector(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 active:scale-90 transition-all shrink-0 cursor-pointer" title="Đóng"><X className="w-4 h-4"/></button>
                    </header>
                    
                    <div className="flex-1 overflow-y-auto p-3 no-scrollbar space-y-2 bg-slate-50 dark:bg-slate-800/30">
                        {(ALL_MODULES || [])
                            .filter(m => (m.group === 'KIỂM TRA CHẤT LƯỢNG' || m.group === 'QC' || m.group === 'QA') && m.id !== 'SUPPLIERS' && m.id !== 'PROJECTS' && (user.allowedModules?.includes(m.id) || hasPermission(user, roles, m.id, 'VIEW') || hasPermission(user, roles, m.id, 'CREATE')))
                            .map(mod => (
                                <button 
                                    key={mod.id} 
                                    onClick={() => startCreateInspection(mod.id)} 
                                    className="w-full min-h-[54px] p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center gap-3 transition-all active:scale-[0.98] hover:border-blue-300 dark:hover:border-blue-700 group shadow-sm"
                                >
                                    <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors border border-slate-100 dark:border-slate-700 group-hover:border-blue-600">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <span className="font-bold text-blue-800 dark:text-blue-300 text-sm tracking-tight truncate block group-hover:text-blue-900 dark:group-hover:text-blue-200">
                                            {mod.label}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest block mt-0.5">
                                            {mod.group} Control
                                        </span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-slate-800 transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                </button>
                            ))
                        }
                    </div>
                    
                    <div className="px-4 py-2 sm:py-2.5 bg-slate-50/80 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                        <button 
                            onClick={() => setShowModuleSelector(false)}
                            className="w-full min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                            ĐÓNG DANH SÁCH
                        </button>
                    </div>
                </div>
            </div>
        )}
        <ConfirmDialog
          open={deleteInspectionId !== null}
          variant="danger"
          title="Xác nhận xóa phiếu"
          message="Xóa phiếu này? Hồ sơ sẽ được chuyển vào Thùng rác theo quy trình audit."
          confirmLabel="Xác nhận xóa"
          cancelLabel="Hủy"
          onConfirm={async () => {
            if (deleteInspectionId) {
              await deleteInspectionFromSheet(deleteInspectionId);
              loadInspections();
              setView('LIST');
            }
            setDeleteInspectionId(null);
          }}
          onCancel={() => setDeleteInspectionId(null)}
        />
      </div>
    </InspectionProvider>
  );
};

export default App;
