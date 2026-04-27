
import React, { useState, useEffect, useMemo } from 'react';
import { ViewState, Inspection, CheckItem, User, ModuleId, Workshop, Project, Defect, InspectionStatus, NCRComment, Notification, Supplier } from './types';
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
import { Dashboard } from './components/Dashboard';
import { InspectionList } from './components/InspectionList';
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

import { Settings } from './components/Settings';
import { IPOPage } from './components/IPOPage';
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
import { SupplierManagement } from './components/SupplierManagement';
import { SupplierDetail } from './components/SupplierDetail';
import { MaterialManagement } from './components/MaterialManagement';
import { Trash } from './components/Trash';
import { ChatAI } from './components/ChatAI';
import { QRScannerModal } from './components/QRScannerModal';
import { MobileBottomBar } from './components/MobileBottomBar';
import { 
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
  fetchProjects, 
  createNotification,
  fetchRoles
} from './services/apiService';
import { Loader2, X, FileText, ChevronRight, Bell } from 'lucide-react';

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

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [returnView, setReturnView] = useState<ViewState>('LIST');
  const [currentModule, setCurrentModule] = useState<string>('ALL');
  const [inspections, setInspections] = useState<Inspection[]>([]); 
  const [inspectionsTotal, setInspectionsTotal] = useState(0);
  const [inspectionsPage, setInspectionsPage] = useState(1);
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [activeDefect, setActiveDefect] = useState<Defect | null>(null);
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsSearch, setProjectsSearch] = useState('');
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  
  const [users, setUsers] = useState<User[]>([]);
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
            loadWorkshops();
            loadTemplates();
        } catch (error) { setIsDbReady(true); }
    };
    startup();
  }, []);

  useEffect(() => {
    if (user && isDbReady) {
        if (view === 'LIST' || view === 'DASHBOARD') loadInspections(inspectionsPage);
        if (view === 'PROJECTS') loadProjects(projectsSearch, projectsPage);
    }
  }, [user, isDbReady, view, inspectionsPage, projectsPage, projectsSearch]);

  const loadUsers = async () => { try { const data = await fetchUsers(); if (data?.length > 0) setUsers(data); else setUsers(MOCK_USERS); } catch (e) { setUsers(MOCK_USERS); } };
  const loadWorkshops = async () => { try { const data = await fetchWorkshops(); if (data?.length > 0) setWorkshops(data); else setWorkshops(MOCK_WORKSHOPS); } catch (e) { setWorkshops(MOCK_WORKSHOPS); } };
  const loadTemplates = async () => { try { const data = await fetchTemplates(); if (data && Object.keys(data).length > 0) setTemplates(prev => ({ ...prev, ...data })); } catch (e) {} };
  
  const loadInspections = async (page: number = 1) => {
    setIsLoadingInspections(true);
    try {
        const result = await fetchInspections({}, 1, 50000);
        setInspections(result.items || []);
        setInspectionsTotal(result.total || 0);
    } catch (e) {
        console.error("Load inspections failed", e);
    } finally {
        setIsLoadingInspections(false);
    }
  };

  const loadProjects = async (search: string = '', page: number = 1) => { 
    try { 
        const result = await fetchProjects(search, page, 20); 
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
  
  const handleLogout = () => { 
    setUser(null); 
    setView('DASHBOARD'); 
    localStorage.removeItem(AUTH_STORAGE_KEY); 
    localStorage.removeItem('aatn_qms_token');
    localStorage.removeItem('aatn_saved_username'); 
    sessionStorage.removeItem(AUTH_STORAGE_KEY); 
  };

  const notifyUsers = async (targetRoles: string[], title: string, message: string, link?: { view: ViewState, id: string }, excludeUserId?: string) => {
    const targets = users.filter(u => targetRoles.includes(u.role as string) && u.id !== excludeUserId);
    for (const target of targets) {
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
        const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
        const isOwner = fullInspection.inspectorName === user?.name;
        const isApproved = fullInspection.status === InspectionStatus.APPROVED;
        
        if (!isManagerOrAdmin && (!isOwner || isApproved)) {
            alert("Bạn không có quyền sửa hồ sơ này (Đã khóa hoặc không phải chủ sở hữu).");
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
      
      setView('LIST'); loadInspections(); 
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
  
  return (
    <div className="flex flex-row h-[100dvh] bg-slate-50 overflow-hidden font-sans select-none text-slate-900">
      <div className="hidden lg:block h-full shrink-0">
          <Sidebar view={view} currentModule={currentModule} onNavigate={id => { if(id==='LIST')setCurrentModule('ALL'); setView(id as ViewState); }} user={user} onLogout={handleLogout} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {isDetailLoading && (
          <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Đang tải chi tiết...</p>
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
            {view === 'DASHBOARD' && <Dashboard inspections={inspections} user={user} onNavigate={setView} onViewInspection={handleSelectInspection} />}
            {view === 'LIST' && (
                <InspectionList 
                    inspections={inspections} 
                    onSelect={handleSelectInspection} 
                    isLoading={isLoadingInspections} 
                    workshops={workshops} 
                    total={inspectionsTotal}
                    page={inspectionsPage}
                    onPageChange={setInspectionsPage}
                    user={user}
                    onRefresh={loadInspections}
                />
            )}
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
                const isManagerOrAdmin = user.role === 'ADMIN' || user.role === 'MANAGER';
                const isOwner = activeInspection.inspectorName === user.name;
                const isApproved = activeInspection.status === InspectionStatus.APPROVED;
                if (!isManagerOrAdmin && (!isOwner || isApproved)) {
                    alert("Bạn không có quyền xóa hồ sơ này.");
                    return;
                }
                if(window.confirm("Xóa phiếu này? Dữ liệu sẽ bị xóa vĩnh viễn khỏi audit log.")){ 
                    await deleteInspectionFromSheet(id); loadInspections(); setView('LIST'); 
                } 
              }, 
              onApprove: async (id: string, sig: string, extra: any) => { 
                const updated = { ...activeInspection, ...extra };
                const oldStatus = activeInspection.status;
                if (sig || extra.managerSignature) {
                  updated.status = InspectionStatus.APPROVED;
                  updated.managerSignature = sig || extra.managerSignature;
                  updated.managerName = extra.managerName || user.name;
                }
                await saveInspectionToSheet(updated); 
                
                if (updated.status === InspectionStatus.APPROVED && oldStatus !== InspectionStatus.APPROVED) {
                  // Notify the inspector
                  const inspector = users.find(u => u.name === updated.inspectorName);
                  if (inspector && user) {
                    createNotification({
                      userId: inspector.id,
                      type: 'SUCCESS',
                      title: 'Phiếu đã được phê duyệt',
                      message: `Quản lý ${user.name} đã phê duyệt phiếu ${updated.type} của bạn`,
                      link: { view: 'DETAIL', id: updated.id }
                    });
                  }
                }
                
                setActiveInspection(updated); loadInspections();
              }, 
              onPostComment: async (id: string, cmt: any) => {
                const updated = { ...activeInspection, comments: [...(activeInspection.comments || []), cmt] };
                await saveInspectionToSheet(updated); 
                
                // Notify other participants
                if (user) {
                  // Notify inspector if commenter is not inspector
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
                  // Notify manager if commenter is not manager
                  if (updated.managerName && user.name !== updated.managerName) {
                    const manager = users.find(u => u.name === updated.managerName);
                    if (manager) {
                      createNotification({
                        userId: manager.id,
                        type: 'MESSAGE',
                        title: 'Bình luận mới',
                        message: `${user.name} vừa bình luận trong phiếu ${updated.type}`,
                        link: { view: 'DETAIL', id: updated.id }
                      });
                    }
                  }
                }
                
                setActiveInspection(updated); loadInspections();
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
            {view === 'PROJECT_DETAIL' && activeProject && <ProjectDetail project={activeProject} inspections={inspections} user={user} onBack={() => setView('PROJECTS')} onViewInspection={handleSelectInspection} onUpdate={() => loadProjects()} onNavigate={setView} />}
            {view === 'IPO' && <IPOPage user={user} />}
            {view === 'NCR_LIST' && <NCRList currentUser={user} onSelectNcr={handleSelectInspection} />}
            {view === 'DEFECT_LIBRARY' && <DefectLibrary currentUser={user} />}
            {view === 'DEFECT_LIST' && <DefectList currentUser={user} onSelectDefect={d => { setActiveDefect(d); setView('DEFECT_DETAIL'); }} onViewInspection={handleSelectInspection} />}
            {view === 'DEFECT_DETAIL' && activeDefect && <DefectDetail defect={activeDefect} user={user} onBack={() => setView('DEFECT_LIST')} onViewInspection={handleSelectInspection} />}
            {view === 'SUPPLIERS' && <SupplierManagement user={user} onSelectSupplier={s => { setActiveSupplier(s); setView('SUPPLIER_DETAIL'); }} />}
            {view === 'MATERIALS' && <MaterialManagement user={user} />}
            {view === 'SUPPLIER_DETAIL' && activeSupplier && <SupplierDetail supplier={activeSupplier} user={user} onBack={() => setView('SUPPLIERS')} onViewInspection={handleSelectInspection} />}
            {view === 'SETTINGS' && (
                <Settings 
                    currentUser={user} allTemplates={templates} onSaveTemplate={async (id, items) => { await saveTemplate(id, items); loadTemplates(); }}
    users={users} 
    onAddUser={async (u) => { await saveUser(u); loadUsers(); }} 
    onUpdateUser={async (u) => { await saveUser(u); loadUsers(); }} 
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
        </main>
        <MobileBottomBar view={view} onNavigate={setView} user={user} />
        <ChatAI user={user} />
        {showQrScanner && <QRScannerModal onClose={() => setShowQrScanner(false)} onScan={code => { setShowQrScanner(false); setInitialFormState({ ma_nha_may: code, workshop: code }); setShowModuleSelector(true); }} />}
        
        {showModuleSelector && (
            <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in duration-200">
                    <header className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider leading-none">LOẠI KIỂM TRA</h3>
                            <p className="text-[10px] font-medium text-slate-400 uppercase mt-1">Chọn phiếu để khởi tạo</p>
                        </div>
                        <button onClick={() => setShowModuleSelector(false)} className="p-2 hover:bg-slate-100 rounded-2xl text-slate-400 active:scale-90 transition-all"><X className="w-6 h-6"/></button>
                    </header>
                    
                    <div className="flex-1 overflow-y-auto p-3 no-scrollbar space-y-1.5 bg-slate-50/30">
                        {(ALL_MODULES || [])
                            .filter(m => (m.group === 'QC' || m.group === 'QA') && m.id !== 'SUPPLIERS' && m.id !== 'PROJECTS' && (user.role === 'ADMIN' || user.role === 'MANAGER' || user.allowedModules?.includes(m.id)))
                            .map(mod => (
                                <button 
                                    key={mod.id} 
                                    onClick={() => startCreateInspection(mod.id)} 
                                    className="w-full p-3.5 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 transition-all active:scale-[0.98] hover:border-blue-200 group shadow-sm"
                                >
                                    <div className="p-2.5 bg-slate-50 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors border border-slate-50 group-hover:border-blue-600">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <span className="font-bold text-blue-800 text-[13px] tracking-tight truncate block group-hover:text-blue-900">
                                            {mod.label}
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest block mt-0.5">
                                            {mod.group} Control
                                        </span>
                                    </div>
                                    <div className="p-1.5 rounded-lg bg-slate-50 text-slate-300 group-hover:text-blue-50 group-hover:bg-blue-50 transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                </button>
                            ))
                        }
                    </div>
                    
                    <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                        <button 
                            onClick={() => setShowModuleSelector(false)}
                            className="w-full py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                        >
                            ĐÓNG DANH SÁCH
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
