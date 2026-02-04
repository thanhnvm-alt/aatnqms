
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  User, ViewState, Inspection, PlanItem, Workshop, Role, CheckItem, 
  Notification, Defect, DefectLibraryItem, Supplier, FloorPlan, LayoutPin, Project, NCR, InspectionStatus,
  InspectionFormProps // Import the common interface
} from './types';
import { 
  fetchPlans, 
  fetchInspections, 
  fetchInspectionById,
  saveInspection, 
  deleteInspection,
  updateInspection,
  checkApiConnection, 
  fetchUsers, 
  saveUser, 
  updateUser,
  deleteUser, 
  fetchWorkshops, 
  saveWorkshop, 
  deleteWorkshop, 
  fetchTemplates, 
  saveTemplate, 
  fetchProjects, 
  createNotification, 
  fetchRoles,
  updatePlan,
  fetchDefectLibrary,
  saveDefectLibraryItem,
  deleteDefectLibraryItem,
  fetchNcrs,
  fetchDefects,
  fetchSuppliers,
  saveSupplier,
  deleteSupplier,
  fetchFloorPlans,
  saveFloorPlan,
  deleteFloorPlan,
  fetchLayoutPins,
  saveLayoutPin,
  verifyUserCredentials,
  fetchPlansByProject,
  updateProject 
} from './services/apiService';
import { Loader2, X, FileText, ChevronRight } from 'lucide-react';

// Import all UI Components
import { LoginPage } from './components/LoginPage';
import { GlobalHeader } from './components/GlobalHeader';
import { Sidebar } from './components/Sidebar';
import { HomeMenu } from './components/HomeMenu';
import { Dashboard } from './components/Dashboard';
import { InspectionList } from './components/InspectionList';
import { PlanList } from './components/PlanList';
import { ProjectList } from './components/ProjectList';
import { Settings } from './components/Settings';
import { ThreeDConverter } from './components/ThreeDConverter';
import { NCRList } from './components/NCRList';
import { DefectList } from './components/DefectList';
import { DefectLibrary } from './components/DefectLibrary';
import { SupplierManagement } from './components/SupplierManagement';
import { SupplierDetail } from './components/SupplierDetail';
import { ProjectDetail } from './components/ProjectDetail';
import { PlanDetail } from './components/PlanDetail';
import { InspectionFormPQC } from './components/inspectionformPQC';
import { InspectionFormIQC } from './components/inspectionformIQC';
import { InspectionFormSQC_VT } from './components/inspectionformSQC_VT';
import { InspectionFormSQC_BTP } from './components/inspectionformSQC_BTP';
import { InspectionFormFRS } from './components/inspectionformFRS';
import { InspectionFormStepVecni } from './components/inspectionformStepVecni';
import { InspectionFormFQC } from './components/inspectionformFQC';
import { InspectionFormSPR } from './components/inspectionformSPR';
import { InspectionFormSITE } from './components/inspectionformSITE';
// Explicitly import all InspectionDetail components
import { InspectionDetailPQC } from './components/inspectiondetailPQC';
import { InspectionDetailIQC } from './components/inspectiondetailIQC';
import { InspectionDetailSQC_VT } from './components/inspectiondetailSQC_VT';
import { InspectionDetailSQC_BTP } from './components/inspectiondetailSQC_BTP'; 
import { InspectionDetailFRS } from './components/inspectiondetailFRS';
import { InspectionDetailStepVecni } from './components/inspectiondetailStepVecni';
import { InspectionDetailFQC } from './components/inspectiondetailFQC';
import { InspectionDetailSPR } from './components/inspectiondetailSPR';
import { InspectionDetailSITE } from './components/inspectiondetailSITE';
import { DefectDetail } from './components/DefectDetail'; 
import { AIChatbox } from './components/AIChatbox'; 
import { MobileBottomBar } from './components/MobileBottomBar'; 

import { MOCK_USERS, MOCK_WORKSHOPS, MOCK_INSPECTIONS, MOCK_PROJECTS, IQC_CHECKLIST_TEMPLATE, PQC_CHECKLIST_TEMPLATE, SITE_CHECKLIST_TEMPLATE, FQC_CHECKLIST_TEMPLATE, FSR_CHECKLIST_TEMPLATE, STEP_CHECKLIST_TEMPLATE, SPR_CHECKLIST_TEMPLATE, SQC_BTP_CHECKLIST_TEMPLATE, SQC_MAT_CHECKLIST_TEMPLATE } from './constants';


const AUTH_STORAGE_KEY = 'aatn_auth_storage';

const App = () => {
  // TEMP: Bypass login for development
  const [user, setUser] = useState<User | null>(MOCK_USERS[0]); // Initialize with admin mock user
  const [isDbReady, setIsDbReady] = useState(true); // Assume DB is ready for bypassed login
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Application Data States
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allWorkshops, setAllWorkshops] = useState<Workshop[]>([]);
  const [allTemplates, setAllTemplates] = useState<Record<string, CheckItem[]>>({});
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allDefectLibrary, setAllDefectLibrary] = useState<DefectLibraryItem[]>([]);
  const [allNcrs, setAllNcrs] = useState<NCR[]>([]);
  const [allDefects, setAllDefects] = useState<Defect[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [totalPlans, setTotalPlans] = useState(0);
  const [planSearchTerm, setPlanSearchTerm] = useState('');
  const [plansPage, setPlansPage] = useState(1);
  const [isPlansLoading, setIsPlansLoading] = useState(false);

  const [currentInspection, setCurrentInspection] = useState<Inspection | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanItem | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [currentDefect, setCurrentDefect] = useState<Defect | null>(null);

  const [activeFormType, setActiveFormType] = useState<string | null>(null); // For inspection forms
  const [settingsTab, setSettingsTab] = useState<'PROFILE' | 'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'ROLES'>('PROFILE');


  // --- Initial Load & Auth Hydration ---
  useEffect(() => {
    const checkDb = async () => {
      const isReady = await checkApiConnection();
      setIsDbReady(isReady);
    };

    checkDb(); // Initial check

    // TEMP: Comment out auth hydration to bypass login
    // const localData = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    // if (localData) {
    //   try {
    //     const parsedUser = JSON.parse(localData);
    //     if (parsedUser?.id && parsedUser?.username && parsedUser?.role) {
    //       setUser(parsedUser);
    //       // Set initial view based on role or default
    //       setView(parsedUser.role === 'QC' ? 'LIST' : 'DASHBOARD');
    //     }
    //   } catch (e) {
    //     console.error("Auth hydration failed:", e);
    //     // Clear corrupt storage if parsing fails
    //     localStorage.removeItem(AUTH_STORAGE_KEY);
    //     sessionStorage.removeItem(AUTH_STORAGE_KEY);
    //   }
    // }
  }, []);

  // --- Data Loading After Login ---
  const refreshAllData = useCallback(async () => {
    if (!user) return; // Only fetch if logged in
    console.log("Refreshing all application data...");

    // Fetch static/less frequent data
    try {
      const [usersData, workshopsData, projectsData, rolesData, defectLibraryData] = await Promise.all([
        fetchUsers(),
        fetchWorkshops(),
        fetchProjects(),
        fetchRoles(),
        fetchDefectLibrary(),
      ]);
      setAllUsers(usersData);
      setAllWorkshops(workshopsData);
      setAllProjects(projectsData);
      setAllRoles(rolesData);
      setAllDefectLibrary(defectLibraryData);
    } catch (error) {
      console.error("Failed to fetch static data:", error);
      // Fallback to mocks if backend isn't ready for everything
      setAllUsers(MOCK_USERS);
      setAllWorkshops(MOCK_WORKSHOPS);
      setAllProjects(MOCK_PROJECTS);
    }

    // Fetch dynamic/frequent data
    try {
        const [inspectionsData, plansData, ncrsData, defectsData, suppliersData] = await Promise.all([
            fetchInspections(),
            fetchPlans(planSearchTerm, plansPage, 20), // Always start with initial page/limit
            fetchNcrs(),
            fetchDefects(),
            fetchSuppliers()
        ]);
        setInspections(inspectionsData);
        setPlans(plansData.items || []);
        setTotalPlans(plansData.total || 0);
        setAllNcrs(ncrsData.items || []);
        setAllDefects(defectsData.items || []);
        setAllSuppliers(suppliersData || []);
    } catch (error) {
        console.error("Failed to fetch dynamic data:", error);
        setInspections(MOCK_INSPECTIONS);
    }

    // Load templates
    setAllTemplates({
      'IQC': IQC_CHECKLIST_TEMPLATE,
      'PQC': PQC_CHECKLIST_TEMPLATE,
      'SITE': SITE_CHECKLIST_TEMPLATE,
      'FQC': FQC_CHECKLIST_TEMPLATE,
      'FSR': FSR_CHECKLIST_TEMPLATE,
      'STEP': STEP_CHECKLIST_TEMPLATE,
      'SPR': SPR_CHECKLIST_TEMPLATE,
      'SQC_BTP': SQC_BTP_CHECKLIST_TEMPLATE,
      'SQC_MAT': SQC_MAT_CHECKLIST_TEMPLATE,
      'SQC_VT': SQC_MAT_CHECKLIST_TEMPLATE, // SQC_VT uses the same template as SQC_MAT for now
    });

  }, [user, planSearchTerm, plansPage]);


  useEffect(() => {
    if (user && isDbReady) {
      refreshAllData();
      const intervalId = setInterval(refreshAllData, 60000); // Refresh every minute
      return () => clearInterval(intervalId);
    }
  }, [user, isDbReady, refreshAllData]);

  // --- Auth Handlers ---
  const handleLoginSuccess = useCallback(async (loggedInUser: User, remember: boolean) => {
    setUser(loggedInUser);
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInUser));
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedInUser));
    }
    setView(loggedInUser.role === 'QC' ? 'LIST' : 'DASHBOARD');
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setView('DASHBOARD'); // Reset view on logout
    setCurrentInspection(null);
    setCurrentPlan(null);
    setCurrentProject(null);
    setCurrentSupplier(null);
    setCurrentDefect(null);
    setActiveFormType(null);
  }, []);

  // --- Navigation & View Management ---
  const handleNavigate = useCallback((newView: ViewState) => {
    setView(newView);
    setCurrentInspection(null); // Clear context when changing main view
    setCurrentPlan(null);
    setCurrentProject(null);
    setCurrentSupplier(null);
    setCurrentDefect(null);
    setActiveFormType(null); // Clear active form
  }, []);

  const handleCreateInspection = useCallback((type: string, initialData?: Partial<Inspection>) => {
    setActiveFormType(type);
    setCurrentInspection({
      id: `${type}-${Date.now()}`,
      type: type as any,
      ma_ct: initialData?.ma_ct || '', 
      ten_ct: initialData?.ten_ct || '', 
      date: new Date().toISOString().split('T')[0],
      status: InspectionStatus.DRAFT, 
      items: (allTemplates[type] || []).map(item => ({ ...item, id: `${item.id}_${Date.now()}` })),
      inspectorName: user?.name || 'N/A',
      score: 0,
      images: [],
      so_luong_ipo: 0, // Default to 0
      ...initialData
    } as Inspection); 
    handleNavigate('FORM');
  }, [user, allTemplates, handleNavigate]);

  const handleSaveInspection = useCallback(async (inspection: Inspection) => {
    try {
      if (currentInspection?.id === inspection.id) {
          await updateInspection(inspection);
      } else {
          await saveInspection(inspection);
      }
      setCurrentInspection(null); // Clear form context
      handleNavigate('LIST'); // Go back to list
      refreshAllData();
      await createNotification(user?.id || 'admin', 'INSPECTION', `New ${inspection.type} Report`, `${inspection.inspectorName} submitted a new ${inspection.type} report for ${inspection.ma_ct || inspection.ten_hang_muc}.`, { view: 'DETAIL', id: inspection.id });
    } catch (e) {
      alert("Failed to save inspection: " + (e as Error).message);
    }
  }, [currentInspection, user, refreshAllData, handleNavigate]);

  const handleEditInspection = useCallback(async (id: string) => {
    try {
      const inspectionData = await fetchInspectionById(id);
      setCurrentInspection(inspectionData);
      setActiveFormType(inspectionData.type);
      handleNavigate('FORM');
    } catch (e) {
      alert("Failed to load inspection for editing: " + (e as Error).message);
    }
  }, [handleNavigate]);

  const handleDeleteInspection = useCallback(async (id: string) => {
    if (window.confirm("Are you sure you want to delete this inspection?")) {
      try {
        await deleteInspection(id);
        handleNavigate('LIST');
        refreshAllData();
      } catch (e) {
        alert("Failed to delete inspection: " + (e as Error).message);
      }
    }
  }, [handleNavigate, refreshAllData]);

  const handleViewInspectionDetail = useCallback(async (id: string) => {
    try {
      const inspectionData = await fetchInspectionById(id);
      setCurrentInspection(inspectionData);
      handleNavigate('DETAIL');
    } catch (e) {
      alert("Failed to load inspection detail: " + (e as Error).message);
    }
  }, [handleNavigate]);

  const handleSelectPlan = useCallback((item: PlanItem, customItems?: CheckItem[]) => {
      setCurrentPlan(item);
      handleNavigate('PLAN_DETAIL');
  }, [handleNavigate]);

  const handleViewProjectDetail = useCallback(async (maCt: string) => {
    const project = allProjects.find(p => p.ma_ct === maCt);
    if (project) {
        setCurrentProject(project);
        handleNavigate('PROJECT_DETAIL');
    } else {
        alert("Project not found.");
    }
  }, [allProjects, handleNavigate]);
  
  const handleUpdateProject = useCallback(async (updatedProject: Project) => {
    try {
      // The actual update was already handled in ProjectDetail.
      // We just need to ensure App's state is consistent and/or refresh global data.
      setCurrentProject(updatedProject); 
      refreshAllData();
    } catch (e) {
      alert("Failed to update project: " + (e as Error).message);
    }
  }, [refreshAllData]);

  const handleViewSupplierDetail = useCallback((supplier: Supplier) => {
      setCurrentSupplier(supplier);
      handleNavigate('SUPPLIER_DETAIL');
  }, [handleNavigate]);

  const handleViewDefectDetail = useCallback((defect: Defect) => {
      setCurrentDefect(defect);
      handleNavigate('DEFECT_DETAIL');
  }, [handleNavigate]);

  const getInspectionFormComponent = (type: string): React.ComponentType<InspectionFormProps> | null => {
    switch (type) {
      case 'IQC': return InspectionFormIQC;
      case 'PQC': return InspectionFormPQC;
      case 'SQC_MAT': return InspectionFormSQC_VT;
      case 'SQC_BTP': return InspectionFormSQC_BTP;
      case 'FSR': return InspectionFormFRS;
      case 'STEP': return InspectionFormStepVecni;
      case 'FQC': return InspectionFormFQC;
      case 'SPR': return InspectionFormSPR;
      case 'SITE': return InspectionFormSITE;
      default: return null;
    }
  };

  const currentModule = useMemo(() => {
    if (view === 'FORM' && activeFormType) return activeFormType;
    if (view === 'LIST') return inspections[0]?.type || 'PQC'; // Default for list view
    return view;
  }, [view, activeFormType, inspections]);

  // TEMP: Remove login page rendering
  // if (!user) {
  //   return <LoginPage onLoginSuccess={handleLoginSuccess} users={allUsers} dbReady={isDbReady} />;
  // }

  // Define a placeholder for onImportPlans
  const handleImportUsers = useCallback(async (users: User[]) => {
    alert("Importing users is not yet fully implemented in the API. Please see backend code.");
    console.log("Attempted to import users:", users);
    // In a real scenario, this would call an API endpoint.
  }, []);

  // Main Application UI
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar 
        view={view} 
        currentModule={currentModule}
        onNavigate={handleNavigate} 
        user={user} 
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'ml-0' : 'lg:ml-0'}`}>
        <GlobalHeader
          user={user as User} // Cast to User since we are bypassing login
          view={view}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onRefresh={refreshAllData}
          onCreate={
            (view === 'LIST' || view === 'PLAN') 
              ? () => handleCreateInspection(currentModule as string)
              : undefined
          }
          onSearchChange={view === 'PLAN' ? setPlanSearchTerm : undefined}
          searchTerm={view === 'PLAN' ? planSearchTerm : undefined}
          onOpenSettingsTab={(tab) => { setSettingsTab(tab); handleNavigate('SETTINGS'); }}
          activeFormType={activeFormType}
          onNavigateToRecord={(targetView, id) => {
            if (targetView === 'DETAIL') handleViewInspectionDetail(id);
            // Add other navigation logic as needed
          }}
        />

        <main className="flex-1 overflow-hidden relative">
          {view === 'DASHBOARD' && <Dashboard inspections={inspections} user={user} onNavigate={handleNavigate} onViewInspection={handleViewInspectionDetail} />}
          {view === 'LIST' && <InspectionList inspections={inspections} onSelect={handleViewInspectionDetail} isLoading={false} workshops={allWorkshops} onRefresh={refreshAllData} />}
          {view === 'PLAN' && <PlanList items={plans} inspections={inspections} onSelect={handleSelectPlan} onViewInspection={handleViewInspectionDetail} onRefresh={refreshAllData} searchTerm={planSearchTerm} onSearch={setPlanSearchTerm} isLoading={isPlansLoading} totalItems={totalPlans} onUpdatePlan={updatePlan} onImportPlans={handleImportUsers} />}
          {view === 'PLAN_DETAIL' && currentPlan && <PlanDetail item={currentPlan} onBack={() => handleNavigate('PLAN')} onCreateInspection={(items) => handleCreateInspection('PQC', { ...currentPlan, id: String(currentPlan.id), items, status: InspectionStatus.DRAFT })} relatedInspections={inspections.filter(i => i.ma_ct === currentPlan.ma_ct)} onViewInspection={handleViewInspectionDetail} onUpdatePlan={updatePlan} />}
          {view === 'PROJECTS' && <ProjectList projects={allProjects} inspections={inspections} plans={plans} onSelectProject={handleViewProjectDetail} />}
          {view === 'PROJECT_DETAIL' && currentProject && <ProjectDetail project={currentProject} inspections={inspections} user={user as User} onBack={() => handleNavigate('PROJECTS')} onUpdate={refreshAllData} onViewInspection={handleViewInspectionDetail} onNavigate={handleNavigate} plans={plans.filter(p => p.ma_ct === currentProject.ma_ct)} />}
          {view === 'SETTINGS' && user && <Settings currentUser={user} allTemplates={allTemplates} onSaveTemplate={() => { /* save logic */ }} users={allUsers} onAddUser={saveUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} onImportUsers={handleImportUsers} workshops={allWorkshops} onAddWorkshop={saveWorkshop} onUpdateWorkshop={saveWorkshop} onDeleteWorkshop={deleteWorkshop} onClose={() => handleNavigate('DASHBOARD')} onCheckConnection={checkApiConnection} initialTab={settingsTab} />}
          {view === 'CONVERT_3D' && <ThreeDConverter />}
          {view === 'NCR_LIST' && user && <NCRList currentUser={user} onSelectNcr={handleViewInspectionDetail} />}
          {view === 'DEFECT_LIBRARY' && user && <DefectLibrary currentUser={user} />}
          {view === 'DEFECT_LIST' && user && <DefectList currentUser={user} onSelectDefect={handleViewDefectDetail} onViewInspection={handleViewInspectionDetail} />}
          {view === 'DEFECT_DETAIL' && currentDefect && user && <DefectDetail defect={currentDefect} user={user} onBack={() => handleNavigate('DEFECT_LIST')} onViewInspection={handleViewInspectionDetail} />}
          
          {view === 'FORM' && currentInspection && user && (() => {
            const FormComponent = getInspectionFormComponent(activeFormType || 'PQC'); 
            return FormComponent && <FormComponent
              initialData={currentInspection}
              onSave={handleSaveInspection}
              onCancel={() => handleNavigate('LIST')}
              plans={plans}
              workshops={allWorkshops}
              inspections={inspections}
              user={user}
              templates={allTemplates}
            />;
          })()}

          {view === 'DETAIL' && currentInspection && user && (() => {
            // Defined the map explicitly
            const DetailComponentMap: Record<string, React.FC<any>> = {
                'InspectionDetailPQC': InspectionDetailPQC,
                'InspectionDetailIQC': InspectionDetailIQC,
                'InspectionDetailSQC_VT': InspectionDetailSQC_VT,
                'InspectionDetailSQC_BTP': InspectionDetailSQC_BTP,
                'InspectionDetailFRS': InspectionDetailFRS,
                'InspectionDetailStepVecni': InspectionDetailStepVecni,
                'InspectionDetailFQC': InspectionDetailFQC,
                'InspectionDetailSPR': InspectionDetailSPR,
                'InspectionDetailSITE': InspectionDetailSITE,
            };
            // Dynamically select the correct detail component
            const FormComponent = getInspectionFormComponent(currentInspection.type as string);
            const detailComponentName = FormComponent ? (FormComponent.name).replace('Form', 'Detail') : '';
            const FinalDetailComponent = DetailComponentMap[detailComponentName] || InspectionDetailPQC; // Fallback

            return <FinalDetailComponent
              inspection={currentInspection}
              user={user}
              onBack={() => handleNavigate('LIST')}
              onEdit={handleEditInspection}
              onDelete={handleDeleteInspection}
              onApprove={async (id, sig, extra) => {
                const updatedInspection = { ...currentInspection, status: InspectionStatus.APPROVED, managerSignature: sig, managerName: user.name, confirmedDate: new Date().toISOString(), ...extra };
                await updateInspection(updatedInspection);
                setCurrentInspection(updatedInspection); // Update current for UI refresh
                refreshAllData(); // Refresh list data
                await createNotification(user.id, 'INSPECTION', `${updatedInspection.type} Approved`, `Your ${updatedInspection.type} report for ${updatedInspection.ma_ct || updatedInspection.ten_hang_muc} has been approved by ${user.name}.`, { view: 'DETAIL', id: updatedInspection.id });
              }}
              onPostComment={async (id, comment) => {
                const updatedComments = [...(currentInspection.comments || []), comment];
                const updatedInspection = { ...currentInspection, comments: updatedComments };
                await updateInspection(updatedInspection);
                setCurrentInspection(updatedInspection); // Update current for UI refresh
                refreshAllData(); // Refresh list data
                await createNotification(currentInspection.inspectorName, 'COMMENT', `New Comment on ${currentInspection.type}`, `${user.name} commented on inspection ${currentInspection.id.split('-').pop()}`, { view: 'DETAIL', id: updatedInspection.id });
              }}
              workshops={allWorkshops}
            />;
          })()}
        </main>

        <AIChatbox inspections={inspections} plans={plans} />
      </div>

      <MobileBottomBar
        view={view}
        onNavigate={handleNavigate}
        user={user}
      />
    </div>
  );
};

export default App;