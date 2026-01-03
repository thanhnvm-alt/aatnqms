
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState, Inspection, PlanItem, CheckItem, User, ModuleId, Workshop, Project } from './types';
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
import { Settings } from './components/Settings';
import { AIChatbox } from './components/AIChatbox';
import { LoginPage } from './components/LoginPage';
import { ThreeDConverter } from './components/ThreeDConverter';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
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
  importInspections,
  fetchProjects
} from './services/apiService';
import { initDatabase } from './services/tursoService';
import { List, Plus, FileSpreadsheet, Box, LayoutDashboard, QrCode, X, FileText, Briefcase } from 'lucide-react';

const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [currentModule, setCurrentModule] = useState<string>('ALL');
  const [inspections, setInspections] = useState<Inspection[]>([]); 
  const [plans, setPlans] = useState<PlanItem[]>([]); 
  const [planSearchTerm, setPlanSearchTerm] = useState('');
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE'>('PROFILE');
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [workshops, setWorkshops] = useState<Workshop[]>(MOCK_WORKSHOPS);
  const [templates, setTemplates] = useState<Record<string, CheckItem[]>>({
      'SITE': INITIAL_CHECKLIST_TEMPLATE, 'PQC': PQC_CHECKLIST_TEMPLATE, 'IQC': IQC_CHECKLIST_TEMPLATE,
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE, 'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE, 'FSR': FSR_CHECKLIST_TEMPLATE
  });
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [initialFormState, setInitialFormState] = useState<Partial<Inspection> | undefined>(undefined);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [isScanSelectionMode, setIsScanSelectionMode] = useState(false);
  const [pendingInspectionData, setPendingInspectionData] = useState<Partial<Inspection> | null>(null);

  const isQC = user?.role === 'QC';

  useEffect(() => {
    const init = async () => {
        await initDatabase();
        const localData = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (localData) {
            try {
                const parsedUser = JSON.parse(localData);
                setUser(parsedUser);
                setView(parsedUser.role === 'QC' ? 'LIST' : 'DASHBOARD');
            } catch (e) {}
        }
        await checkConn();
        await loadUsers();
        loadWorkshops();
        loadTemplates();
    };
    init();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      const combined = [...MOCK_USERS];
      data.forEach(dbUser => { if (!combined.find(u => u.username === dbUser.username)) combined.push(dbUser); });
      setUsers(combined);
    } catch (e) {}
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
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  useEffect(() => { if (user) { loadInspections(); loadProjects(); loadPlans(); } }, [user, planSearchTerm]);

  const checkConn = async () => { try { const status = await checkApiConnection(); setConnectionError(!status.ok); } catch (e) { setConnectionError(true); } };
  const loadTemplates = async () => { try { const data = await fetchTemplates(); if (Object.keys(data).length > 0) setTemplates(prev => ({ ...prev, ...data })); } catch (e) {} };
  const loadWorkshops = async () => { try { const data = await fetchWorkshops(); if (data.length > 0) setWorkshops(data); } catch (e) {} };
  const loadProjects = async () => { try { const data = await fetchProjects(); if (data.length > 0) setProjects(data); } catch(e) {} };
  const loadPlans = async () => {
    if (isLoadingPlans) return;
    setIsLoadingPlans(true);
    try {
        const result = await fetchPlans(planSearchTerm, 1, 1000);
        setPlans(result.items);
    } catch (e) {} finally { setIsLoadingPlans(false); }
  };

  const loadInspections = async () => {
    setIsLoadingInspections(true);
    try { const data = await fetchInspections(); setInspections(data.items || []); } catch (e) {} finally { setIsLoadingInspections(false); }
  };

  const handleSaveInspection = async (newInspection: Inspection) => {
    await saveInspectionToSheet(newInspection);
    setView('LIST');
    loadInspections();
  };

  const handleNavigateToSettings = (tab: any) => {
      setSettingsInitialTab(tab);
      setView('SETTINGS');
  };

  if (!user) return <LoginPage onLoginSuccess={handleLogin} users={users} />;

  return (
    <div className="flex h-[100dvh] bg-slate-50 overflow-hidden font-sans select-none">
      {showModuleSelector && (
        <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg">{isScanSelectionMode ? 'Chọn loại để quét' : 'Chọn loại phiếu'}</h3>
                    <button onClick={() => setShowModuleSelector(false)} className="p-2 text-slate-400"><X className="w-6 h-6" /></button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                    {[
                        { id: 'IQC', label: 'IQC' }, { id: 'SQC_MAT', label: 'SQC-MAT' }, { id: 'SQC_BTP', label: 'SQC-BTP' },
                        { id: 'PQC', label: 'PQC' }, { id: 'FSR', label: 'FSR' }, { id: 'SITE', label: 'SITE' }, { id: 'PROJECTS', label: 'PROJECTS' }
                    ].filter(m => user.role === 'ADMIN' || user.allowedModules?.includes(m.id as any)).map(mod => (
                        <button key={mod.id} onClick={() => { if(mod.id === 'PROJECTS') setView('PROJECTS'); else { setInitialFormState({ ...(pendingInspectionData || {}), type: mod.id as any, inspectorName: user?.name || '', date: new Date().toISOString().split('T')[0], items: templates[mod.id] || [] }); setView('FORM'); } setShowModuleSelector(false); }} className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-200 bg-white hover:border-blue-500 transition-all gap-3 active:scale-95 shadow-sm">
                            <FileText className="w-5 h-5 text-slate-500" />
                            <span className="font-black text-xs text-slate-700 uppercase">{mod.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden pb-[calc(env(safe-area-inset-bottom)+4rem)] lg:pb-0">
            {view === 'DASHBOARD' && <Dashboard inspections={inspections} user={user} onLogout={handleLogout} onNavigate={setView} />}
            {view === 'LIST' && (
                <div className="flex flex-col h-full">
                    <div className="p-4 flex justify-between items-center bg-white border-b border-slate-100">
                        <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2"><List className="w-5 h-5 text-blue-600" /> Checklist</h2>
                        <div className="flex gap-2">
                             <button onClick={() => { setIsScanSelectionMode(true); setShowModuleSelector(true); }} className="p-2.5 bg-slate-900 text-white rounded-xl shadow-lg"><QrCode className="w-5 h-5" /></button>
                             <button onClick={() => { setPendingInspectionData({}); setIsScanSelectionMode(false); setShowModuleSelector(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg"><Plus className="w-5 h-5" /> Tạo mới</button>
                        </div>
                    </div>
                    <InspectionList 
                        inspections={currentModule === 'ALL' ? inspections : inspections.filter(i => i.type === currentModule)} 
                        onSelect={(id) => { setSelectedInspectionId(id); setView('DETAIL'); }} 
                        userRole={user.role} currentUserName={user.name} selectedModule={currentModule}
                        currentUser={user} onLogout={handleLogout} onNavigateSettings={handleNavigateToSettings}
                        onModuleChange={setCurrentModule} onRefresh={loadInspections}
                    />
                </div>
            )}
            {view === 'FORM' && <InspectionForm initialData={selectedInspectionId ? inspections.find(i => i.id === selectedInspectionId) : initialFormState} onSave={handleSaveInspection} onCancel={() => setView('LIST')} plans={plans} workshops={workshops} user={user} />}
            {view === 'DETAIL' && inspections.find(i => i.id === selectedInspectionId) && <InspectionDetail inspection={inspections.find(i => i.id === selectedInspectionId)!} user={user} onBack={() => setView('LIST')} onEdit={(id) => setView('FORM')} onDelete={async (id) => { await deleteInspectionFromSheet(id); loadInspections(); setView('LIST'); }} />}
            {view === 'PLAN' && <PlanList items={plans} inspections={inspections} onSelect={(item) => { setPendingInspectionData({ ma_nha_may: item.ma_nha_may, headcode: item.headcode, ma_ct: item.ma_ct, ten_ct: item.ten_ct, ten_hang_muc: item.ten_hang_muc, dvt: item.dvt, so_luong_ipo: item.so_luong_ipo }); setShowModuleSelector(true); }} onViewInspection={(id) => { setSelectedInspectionId(id); setView('DETAIL'); }} onRefresh={loadPlans} onImportPlans={async (p) => { await importPlans(p); }} searchTerm={planSearchTerm} onSearch={setPlanSearchTerm} isLoading={isLoadingPlans} totalItems={plans.length} currentPage={1} itemsPerPage={1000} onPageChange={()=>{}} />}
            {view === 'SETTINGS' && (
                <Settings 
                    currentUser={user} allTemplates={templates} onSaveTemplate={async (m, t) => { await saveTemplate(m, t); loadTemplates(); }} users={users}
                    onAddUser={async u => { await saveUser(u); loadUsers(); }} onUpdateUser={async u => { await saveUser(u); loadUsers(); if(u.id === user.id) setUser(u); }}
                    onDeleteUser={async id => { await deleteUser(id); loadUsers(); }} workshops={workshops} onAddWorkshop={async w => { await saveWorkshop(w); loadWorkshops(); }}
                    onUpdateWorkshop={async w => { await saveWorkshop(w); loadWorkshops(); }} onDeleteWorkshop={async id => { await deleteWorkshop(id); loadWorkshops(); }}
                    onClose={() => setView(isQC ? 'LIST' : 'DASHBOARD')} initialTab={settingsInitialTab}
                />
            )}
            {view === 'PROJECTS' && <ProjectList projects={projects} onSelectProject={(id) => { setSelectedProjectId(id); setView('PROJECT_DETAIL'); }} />}
            {view === 'PROJECT_DETAIL' && selectedProjectId && <ProjectDetail project={projects.find(p => p.id === selectedProjectId)!} inspections={inspections} onBack={() => setView('PROJECTS')} />}
            {view === 'CONVERT_3D' && <ThreeDConverter />}
        </main>
        
        <AIChatbox inspections={inspections} plans={plans} />
        
        {!isQC && (
            <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200 flex justify-around p-1 fixed bottom-0 w-full z-50">
                <button onClick={() => setView('LIST')} className={`flex flex-col items-center justify-center w-full py-2 ${view === 'LIST' ? 'text-blue-600' : 'text-slate-400'}`}><List className="w-6 h-6" /><span className="text-[9px] font-black uppercase">Checklist</span></button>
                <button onClick={() => setView('PROJECTS')} className={`flex flex-col items-center justify-center w-full py-2 ${view === 'PROJECTS' ? 'text-blue-600' : 'text-slate-400'}`}><Briefcase className="w-6 h-6" /><span className="text-[9px] font-black uppercase">Projects</span></button>
                <div className="relative -top-5"><button onClick={() => setView('CONVERT_3D')} className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-xl flex items-center justify-center text-white border-4 border-white"><Box className="w-7 h-7" /></button></div>
                <button onClick={() => setView('PLAN')} className={`flex flex-col items-center justify-center w-full py-2 ${view === 'PLAN' ? 'text-blue-600' : 'text-slate-400'}`}><FileSpreadsheet className="w-6 h-6" /><span className="text-[9px] font-black uppercase">Plans</span></button>
                <button onClick={() => setView('DASHBOARD')} className={`flex flex-col items-center justify-center w-full py-2 ${view === 'DASHBOARD' ? 'text-blue-600' : 'text-slate-400'}`}><LayoutDashboard className="w-6 h-6" /><span className="text-[9px] font-black uppercase">Report</span></button>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;
