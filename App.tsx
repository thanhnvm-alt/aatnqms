
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
import { InspectionListPQC } from './components/InspectionListPQC'; 
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
  importInspections, 
  fetchProjects, 
  fetchProjectByCode,
  createNotification
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
  const [settingsInitialTab, setSettingsInitialTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE'>('PROFILE');
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

  const loadUsers = async () => { try { const data = await fetchUsers(); if (Array.isArray(data) && data.length > 0) { setUsers(prev => { const combined = [...MOCK_USERS]; data.forEach(dbUser => { if (dbUser && dbUser.username && !combined.find(u => u.username.toLowerCase() === dbUser.username.toLowerCase())) { combined.push(dbUser); } }); return combined; }); } } catch (e) {} };
  const handleLogin = (loggedInUser: User, remember: boolean) => { const { password, ...safeUser } = loggedInUser; setUser(safeUser as User); const storage = remember ? localStorage : sessionStorage; storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safeUser)); setView(safeUser.role === 'QC' ? 'LIST' : 'DASHBOARD'); };
  const handleLogout = () => { setUser(null); setView('DASHBOARD'); localStorage.removeItem(AUTH_STORAGE_KEY); sessionStorage.removeItem(AUTH_STORAGE_KEY); };
  useEffect(() => { if (user && isDbReady) { loadInspections(); loadProjects(); loadPlans(); } }, [user, isDbReady, planSearchTerm]);
  const checkConn = async () => { try { const status = await checkApiConnection(); setConnectionError(!status.ok); } catch (e) { setConnectionError(true); } };
  const loadTemplates = async () => { try { const data = await fetchTemplates(); if (data && Object.keys(data).length > 0) setTemplates(prev => ({ ...prev, ...data })); } catch (e) {} };
  const loadWorkshops = async () => { try { const data = await fetchWorkshops(); if (data && data.length > 0) setWorkshops(data); } catch (e) {} };
  const loadProjects = async () => { if (!isDbReady) return; try { const data = await fetchProjects(); setProjects(data || []); } catch(e) {} };
  const loadPlans = async () => { if (!isDbReady) return; setIsLoadingPlans(true); try { const result = await fetchPlans(planSearchTerm, 1, 1000); setPlans(result.items || []); } catch (e) {} finally { setIsLoadingPlans(false); } };
  const loadInspections = async () => { if (!isDbReady) return; setIsLoadingInspections(true); try { const data = await fetchInspections({ limit: 1000 }); setInspections(data.items || []); } catch (e) {} finally { setIsLoadingInspections(false); } };
  
  const handleSelectInspection = async (id: string) => { setIsDetailLoading(true); try { const fullInspection = await fetchInspectionById(id); if (fullInspection) { setActiveInspection(fullInspection); setView('DETAIL'); } else alert("Không tìm thấy phiếu."); } catch (error) { alert("Lỗi tải chi tiết."); } finally { setIsDetailLoading(false); } };
  
  const handleEditInspection = async (id: string) => { setIsDetailLoading(true); try { const fullInspection = await fetchInspectionById(id); if (fullInspection) { setActiveInspection(fullInspection); setView('FORM'); } } catch (e) {} finally { setIsDetailLoading(false); } };
  
  const handleSaveInspection = async (newInspection: Inspection) => { 
      await saveInspectionToSheet(newInspection); 
      // ISO-PUSH: Notify managers about new inspection
      if (newInspection.status === InspectionStatus.PENDING) {
          const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN');
          for (const m of managers) {
              await createNotification({
                  userId: m.id,
                  type: 'INSPECTION',
                  title: 'Phiếu kiểm tra mới',
                  message: `QC ${user?.name} vừa gửi phiếu ${newInspection.type} cho ${newInspection.ten_hang_muc}.`,
                  link: { view: 'DETAIL', id: newInspection.id }
              });
          }
      }
      setView('LIST'); loadInspections(); loadProjects(); 
  };

  const handleApproveInspection = async (id: string, signature: string, extraInfo?: any) => { 
    if (!activeInspection) return; 
    const isFullApproval = !!signature;
    const updated: Inspection = { 
        ...activeInspection, 
        status: isFullApproval ? InspectionStatus.APPROVED : activeInspection.status, 
        managerSignature: signature || activeInspection.managerSignature, 
        managerName: isFullApproval ? user?.name : (activeInspection.managerName || extraInfo?.managerName), 
        confirmedDate: isFullApproval ? new Date().toISOString() : activeInspection.confirmedDate 
    }; 
    if (extraInfo) { 
        if (extraInfo.signature) {
            updated.productionSignature = extraInfo.signature;
            updated.productionName = extraInfo.name;
            updated.productionConfirmedDate = new Date().toISOString();
            if (extraInfo.comment) updated.productionComment = extraInfo.comment;
        }
        if (extraInfo.pmSignature !== undefined) updated.pmSignature = extraInfo.pmSignature;
        if (extraInfo.pmComment !== undefined) updated.pmComment = extraInfo.pmComment;
        if (extraInfo.pmName !== undefined) updated.pmName = extraInfo.pmName;
    } 
    await saveInspectionToSheet(updated); 
    
    // ISO-PUSH: Notify QC about approval
    if (isFullApproval) {
        const qc = users.find(u => u.name === updated.inspectorName);
        if (qc) {
            await createNotification({
                userId: qc.id,
                type: 'INSPECTION',
                title: 'Phiếu đã được duyệt',
                message: `Quản lý ${user?.name} đã phê duyệt phiếu ${updated.id}.`,
                link: { view: 'DETAIL', id: updated.id }
            });
        }
    }

    loadInspections(); 
    setActiveInspection(updated);
  };

  const handlePostComment = async (id: string, comment: NCRComment) => { 
      if (!activeInspection) return; 
      const updatedComments = [...(activeInspection.comments || []), comment]; 
      const updated = { ...activeInspection, comments: updatedComments }; 
      await saveInspectionToSheet(updated); 
      
      // ISO-PUSH: Notify other involved parties
      const participants = new Set<string>();
      if (updated.inspectorName !== comment.userName) {
          const qc = users.find(u => u.name === updated.inspectorName);
          if (qc) participants.add(qc.id);
      }
      if (user?.role === 'QC') {
          users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN').forEach(m => participants.add(m.id));
      }

      for (const pId of participants) {
          await createNotification({
              userId: pId,
              type: 'COMMENT',
              title: 'Phản hồi mới',
              message: `${comment.userName} đã để lại bình luận trên phiếu ${updated.id}.`,
              link: { view: 'DETAIL', id: updated.id }
          });
      }

      setActiveInspection(updated); 
      loadInspections(); 
  };

  const handleNavigateToSettings = (tab: any) => { setSettingsInitialTab(tab); setView('SETTINGS'); };
  const handleQrScan = (scannedCode: string) => { setShowQrScanner(false); setPendingScannedCode(scannedCode); setShowModuleSelector(true); };
  
  const startCreateInspection = async (moduleId: ModuleId) => {
      setShowModuleSelector(false); setIsDetailLoading(true);
      // Prioritize existing initialFormState if set from PlanList
      let baseData: Partial<Inspection> = initialFormState || { ma_nha_may: pendingScannedCode || '' };
      
      // Only if no initial state and we have a scanned code, try to lookup
      if (!initialFormState && pendingScannedCode) { 
          try { 
              const searchResult = await fetchPlans(pendingScannedCode, 1, 5); 
              const foundPlan = (searchResult.items || []).find(p => String(p.headcode || '').toLowerCase() === pendingScannedCode.toLowerCase() || String(p.ma_nha_may || '').toLowerCase() === pendingScannedCode.toLowerCase()); 
              if (foundPlan) { 
                  baseData = { 
                      ma_nha_may: foundPlan.ma_nha_may, 
                      headcode: foundPlan.headcode, 
                      ma_ct: foundPlan.ma_ct, 
                      ten_ct: foundPlan.ten_ct, 
                      ten_hang_muc: foundPlan.ten_hang_muc, 
                      dvt: foundPlan.dvt, 
                      so_luong_ipo: foundPlan.so_luong_ipo 
                  }; 
              } 
          } catch (e) {} 
      }
      const template = templates[moduleId] || INITIAL_CHECKLIST_TEMPLATE;
      // Merge base data with new type/template, ensuring we don't lose the pre-filled info
      setInitialFormState({ 
          ...baseData, 
          type: moduleId, 
          items: JSON.parse(JSON.stringify(template)) 
      });
      setActiveInspection(null); setPendingScannedCode(null); setIsDetailLoading(false); setView('FORM');
  };

  const handleSidebarNavigate = (id: string) => {
      if (id === 'PQC_MODE') {
          setCurrentModule('PQC');
          setView('LIST');
      } else {
          if (id === 'LIST') setCurrentModule('ALL'); // Reset to generic list
          setView(id as ViewState);
      }
  };

  const renderForm = () => {
    const data = activeInspection || initialFormState;
    if (!data) return null;
    const commonProps = { initialData: data, onSave: handleSaveInspection, onCancel: () => setView('LIST'), plans, workshops, inspections, user: user!, templates };
    switch (data.type) {
        case 'IQC': return <InspectionFormIQC {...commonProps} />;
        case 'SQC_MAT': return <InspectionFormSQC_VT {...commonProps} />;
        case 'SQC_BTP': return <InspectionFormSQC_BTP {...commonProps} />;
        case 'FSR': return <InspectionFormFRS {...commonProps} />;
        case 'STEP': return <InspectionFormStepVecni {...commonProps} />;
        case 'FQC': return <InspectionFormFQC {...commonProps} />;
        case 'SPR': return <InspectionFormSPR {...commonProps} />;
        case 'SITE': return <InspectionFormSITE {...commonProps} />;
        case 'PQC':
        default: return <InspectionFormPQC {...commonProps} />;
    }
  };

  const renderDetail = () => {
    if (!activeInspection) return null;
    const commonProps = { inspection: activeInspection, user: user!, onBack: () => { setView('LIST'); setActiveInspection(null); }, onEdit: handleEditInspection, onDelete: async (id: string) => { if(window.confirm("Xóa phiếu này?")){ await deleteInspectionFromSheet(id); loadInspections(); setView('LIST'); } }, onApprove: handleApproveInspection, onPostComment: handlePostComment, workshops };
    switch (activeInspection.type) {
        case 'IQC': return <InspectionDetailIQC {...commonProps} />;
        case 'SQC_MAT': return <InspectionDetailSQC_VT {...commonProps} />;
        case 'SQC_BTP': return <InspectionDetailSQC_BTP {...commonProps} />;
        case 'FSR': return <InspectionDetailFRS {...commonProps} />;
        case 'STEP': return <InspectionDetailStepVecni {...commonProps} />;
        case 'FQC': return <InspectionDetailFQC {...commonProps} />;
        case 'SPR': return <InspectionDetailSPR {...commonProps} />;
        case 'SITE': return <InspectionDetailSITE {...commonProps} />;
        case 'PQC':
        default: return <InspectionDetailPQC {...commonProps} />;
    }
  };

  const renderList = () => {
      // If current module is specifically 'PQC', use the specialized component
      if (currentModule === 'PQC') {
          return (
              <InspectionListPQC 
                  inspections={inspections} 
                  onSelect={handleSelectInspection} 
                  onRefresh={loadInspections} 
                  isLoading={isLoadingInspections} 
                  workshops={workshops} 
              />
          );
      }
      
      // Default Generic List
      return (
          <InspectionList 
              inspections={inspections} 
              onSelect={handleSelectInspection} 
              userRole={user!.role} 
              currentUserName={user!.name} 
              selectedModule={currentModule} 
              onRefresh={loadInspections} 
              onModuleChange={setCurrentModule} 
              isLoading={isLoadingInspections} 
              workshops={workshops} 
          />
      );
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} />;
  if (!isDbReady) return <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50"><Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" /><p className="text-sm font-black text-slate-600 uppercase tracking-widest">Đang khởi tạo...</p></div>;

  return (
    <div className="flex flex-row h-[100dvh] bg-slate-50 overflow-hidden font-sans select-none text-slate-900">
      <div className="hidden lg:block h-full shrink-0">
          <Sidebar 
              view={view} 
              currentModule={currentModule}
              onNavigate={handleSidebarNavigate} 
              user={user} 
              onLogout={handleLogout} 
              collapsed={sidebarCollapsed} 
              setCollapsed={setSidebarCollapsed} 
          />
      </div>
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {isDetailLoading && <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center"><div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200"><Loader2 className="w-12 h-12 text-blue-600 animate-spin" /><p className="text-xs font-black text-slate-700 uppercase tracking-widest">Đang tải...</p></div></div>}
        <GlobalHeader 
          user={user} view={view} onNavigate={setView} onLogout={handleLogout} onOpenSettingsTab={handleNavigateToSettings} 
          onRefresh={() => { if(view==='LIST') loadInspections(); if(view==='PLAN') loadPlans(); }} 
          onCreate={() => { setPendingScannedCode(null); setInitialFormState(undefined); setShowModuleSelector(true); }} 
          onScanClick={() => { setPendingScannedCode(null); setShowQrScanner(true); }}
          activeFormType={view === 'FORM' ? (activeInspection?.type || initialFormState?.type) : undefined}
          onNavigateToRecord={(v, id) => { if(v === 'DETAIL') handleSelectInspection(id); else setView(v); }}
        />
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:pb-0">
            {view === 'DASHBOARD' && <Dashboard inspections={inspections} user={user} onLogout={handleLogout} onNavigate={setView} />}
            {view === 'LIST' && renderList()}
            {view === 'FORM' && renderForm()}
            {view === 'DETAIL' && renderDetail()}
            {view === 'PLAN' && <PlanList items={plans} inspections={inspections} onSelect={(item) => { setInitialFormState({ ma_nha_may: item.ma_nha_may, headcode: item.headcode, ma_ct: item.ma_ct, ten_ct: item.ten_ct, ten_hang_muc: item.ten_hang_muc, dvt: item.dvt, so_luong_ipo: item.so_luong_ipo }); setShowModuleSelector(true); }} onViewPlan={(item) => setActivePlan(item)} onViewInspection={handleSelectInspection} onRefresh={loadPlans} onImportPlans={async (p) => { await importPlans(p); }} searchTerm={planSearchTerm} onSearch={setPlanSearchTerm} isLoading={isLoadingPlans} totalItems={plans.length} />}
            {view === 'NCR_LIST' && <NCRList currentUser={user} onSelectNcr={handleSelectInspection} />}
            {view === 'DEFECT_LIST' && <DefectList currentUser={user} onSelectDefect={(d) => { setActiveDefect(d); setView('DEFECT_DETAIL'); }} onViewInspection={handleSelectInspection} />}
            {view === 'DEFECT_DETAIL' && activeDefect && <DefectDetail defect={activeDefect} user={user} onBack={() => { setView('DEFECT_LIST'); setActiveDefect(null); }} onViewInspection={handleSelectInspection} />}
            {view === 'DEFECT_LIBRARY' && <DefectLibrary currentUser={user} />}
            {view === 'SETTINGS' && <Settings currentUser={user} allTemplates={templates} onSaveTemplate={async (m, t) => { await saveTemplate(m, t); loadTemplates(); }} users={users} onAddUser={async u => { await saveUser(u); loadUsers(); }} onUpdateUser={async u => { await saveUser(u); loadUsers(); if(u.id === user.id) setUser(u); }} onDeleteUser={async id => { await deleteUser(id); loadUsers(); }} workshops={workshops} onAddWorkshop={async w => { await saveWorkshop(w); loadWorkshops(); }} onUpdateWorkshop={async w => { await saveWorkshop(w); loadWorkshops(); }} onDeleteWorkshop={async id => { await deleteWorkshop(id); loadWorkshops(); }} onClose={() => setView(user.role === 'QC' ? 'LIST' : 'DASHBOARD')} initialTab={settingsInitialTab} />}
            {view === 'PROJECTS' && <ProjectList projects={projects} inspections={inspections} onSelectProject={async (maCt) => { const found = projects.find(p => p.ma_ct === maCt); if(found) { setActiveProject(found); setView('PROJECT_DETAIL'); } }} />}
            {view === 'PROJECT_DETAIL' && activeProject && <ProjectDetail project={activeProject} inspections={inspections} onUpdate={loadProjects} onBack={() => { setView('PROJECTS'); setActiveProject(null); }} onViewInspection={handleSelectInspection} />}
            {view === 'CONVERT_3D' && <ThreeDConverter />}
        </main>
        <MobileBottomBar view={view} onNavigate={setView} user={user} />
        <AIChatbox inspections={inspections} plans={plans} />
        {showQrScanner && <QRScannerModal onClose={() => setShowQrScanner(false)} onScan={handleQrScan} />}
        {showModuleSelector && (
            <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl p-6 space-y-4 animate-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-2"><h3 className="font-black text-slate-800 uppercase tracking-tighter">Chọn Loại Kiểm Tra</h3><button onClick={() => setShowModuleSelector(false)}><X className="w-6 h-6 text-slate-400"/></button></div>
                    <div className="grid grid-cols-1 gap-2">
                        {ALL_MODULES.filter(m => {
                            const isQcQa = m.group === 'QC' || m.group === 'QA';
                            const hasPermission = user?.role === 'ADMIN' || user?.allowedModules?.includes(m.id);
                            return isQcQa && hasPermission;
                        }).map(mod => (
                            <button key={mod.id} onClick={() => startCreateInspection(mod.id)} className="w-full p-4 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-2xl flex items-center gap-4 transition-all group">
                                <div className="p-2 bg-white rounded-xl shadow-sm text-blue-600 group-hover:scale-110 transition-transform"><FileText className="w-5 h-5" /></div>
                                <span className="font-bold text-slate-700 group-hover:text-blue-700 uppercase text-xs">{mod.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}
        
        {/* Plan Detail Modal - Rendered globally to avoid navigating away if needed, or just cleaner */}
        {activePlan && (
            <PlanDetail 
                item={activePlan} 
                onBack={() => setActivePlan(null)}
                onCreateInspection={(template) => {
                    setInitialFormState({ 
                        ma_nha_may: activePlan.ma_nha_may, 
                        headcode: activePlan.headcode, 
                        ma_ct: activePlan.ma_ct, 
                        ten_ct: activePlan.ten_ct, 
                        ten_hang_muc: activePlan.ten_hang_muc, 
                        dvt: activePlan.dvt, 
                        so_luong_ipo: activePlan.so_luong_ipo,
                        items: template // Pass the checklist from PlanDetail if available
                    });
                    setActivePlan(null);
                    setShowModuleSelector(true);
                }}
                relatedInspections={inspections.filter(i => 
                    i.ma_nha_may === activePlan.ma_nha_may || 
                    (i.ma_ct === activePlan.ma_ct && i.ten_hang_muc === activePlan.ten_hang_muc)
                )}
                onViewInspection={(id) => {
                    setActivePlan(null);
                    handleSelectInspection(id);
                }}
            />
        )}
      </div>
    </div>
  );
};

export default App;
