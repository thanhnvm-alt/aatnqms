import { getProxyImageUrl } from '../src/utils';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckItem, User, Workshop, Role, ModuleId, hasPermission } from '../types';
import { TemplateEditor } from './TemplateEditor';
import { UserManagement } from './UserManagement';
import { WorkshopManagement } from './WorkshopManagement';
import { DepartmentManagement } from './DepartmentManagement';
import { UserActivityList } from './UserActivityList';
import { Button } from './Button';
import { SignaturePad } from './SignaturePad';
import { 
    ArrowLeft, 
    FileCheck, 
    Users, 
    Settings as SettingsIcon, 
    Wifi, 
    RefreshCw, 
    Factory, 
    AlertCircle, 
    Layers,
    UserCircle,
    Lock,
    Eye,
    EyeOff,
    Save,
    ShieldCheck,
    Loader2,
    Edit3,
    Camera,
    Database,
    Cloud,
    HardDrive,
    ShieldAlert,
    Building,
    Activity
} from 'lucide-react';
import { ALL_MODULES } from '../constants';
import { fetchRoles, saveRole, deleteRole as apiDeleteRole } from '../services/apiService';

interface SettingsProps {
  currentUser: User; 
  allTemplates: Record<string, CheckItem[]>;
  onSaveTemplate: (moduleId: string, newTemplate: CheckItem[]) => void;
  users: User[];
  onAddUser: (user: User) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onImportUsers?: (users: User[]) => Promise<void>;
  workshops: Workshop[];
  onAddWorkshop: (workshop: Workshop) => Promise<void>;
  onUpdateWorkshop: (workshop: Workshop) => Promise<void>;
  onDeleteWorkshop: (id: string) => Promise<void>;
  onClose: () => void;
  onCheckConnection?: () => Promise<boolean>;
  initialTab?: 'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS'; 
}

export const Settings: React.FC<SettingsProps> = ({ 
    currentUser,
    allTemplates, 
    onSaveTemplate, 
    users, 
    onAddUser, 
    onUpdateUser, 
    onDeleteUser,
    onImportUsers,
    workshops,
    onAddWorkshop,
    onUpdateWorkshop,
    onDeleteWorkshop,
    onClose,
    onCheckConnection,
    initialTab
}) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  const isAdminOrManager = useMemo(() => {
    if (currentUser.role === 'ADMIN' || currentUser.username?.toLowerCase() === 'admin') return true;
    if (hasPermission(currentUser, roles, 'SYSTEM_ADMIN', 'VIEW')) return true;
    if (hasPermission(currentUser, roles, 'SETTINGS_USERS', 'VIEW')) return true;
    if (hasPermission(currentUser, roles, 'SETTINGS_ROLES', 'VIEW')) return true;
    return false;
  }, [currentUser, roles]);
  
  const showTab = (tabName: 'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS') => {
      if (currentUser.role === 'ADMIN' || currentUser.username?.toLowerCase() === 'admin') return true;
      if (hasPermission(currentUser, roles, 'SYSTEM_ADMIN', 'VIEW')) return true;
      
      const mapping: Record<string, ModuleId> = {
          'TEMPLATE': 'SETTINGS_TEMPLATE',
          'USERS': 'SETTINGS_USERS',
          'ROLES': 'SETTINGS_ROLES',
          'WORKSHOPS': 'SETTINGS_WORKSHOPS',
          'DEPARTMENTS': 'SETTINGS_DEPARTMENTS',
          'PROFILE': 'SETTINGS_PROFILE'
      };
      return hasPermission(currentUser, roles, mapping[tabName], 'VIEW');
  };

  const [activeTab, setActiveTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS'>(() => {
    if (initialTab) return initialTab;
    if (currentUser.role === 'ADMIN') return 'TEMPLATE';
    if (currentUser.role === 'MANAGER') return 'TEMPLATE';
    return 'PROFILE';
  });

  // Dynamically adjust activeTab once roles list are loaded
  useEffect(() => {
    if (roles && roles.length > 0 && !initialTab) {
      const order: ('TEMPLATE' | 'USERS' | 'ROLES' | 'WORKSHOPS' | 'DEPARTMENTS' | 'PROFILE')[] = [
        'TEMPLATE', 'USERS', 'ROLES', 'WORKSHOPS', 'DEPARTMENTS', 'PROFILE'
      ];
      const firstAllowed = order.find(tab => showTab(tab));
      if (firstAllowed && firstAllowed !== activeTab) {
        if (activeTab === 'PROFILE' && firstAllowed !== 'PROFILE') {
          setActiveTab(firstAllowed);
        } else if (!showTab(activeTab)) {
          setActiveTab(firstAllowed);
        }
      }
    }
  }, [roles]);
  
  const [selectedModuleForTemplate, setSelectedModuleForTemplate] = useState<string>('PQC');
  const [isChecking, setIsChecking] = useState(false);
  const [connStatus, setConnStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState<User>(() => ({
    ...currentUser,
    workLocation: currentUser.workLocation || (currentUser as any).work_location || '',
    joinDate: currentUser.joinDate || (currentUser as any).join_date || ''
  }));
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleTestConnection();
    loadRoles();
  }, []);

  useEffect(() => {
      setProfileData({
        ...currentUser,
        workLocation: currentUser.workLocation || (currentUser as any).work_location || '',
        joinDate: currentUser.joinDate || (currentUser as any).join_date || ''
      });
  }, [currentUser]);

  const loadRoles = async () => {
    setIsLoadingRoles(true);
    try {
        const data = await fetchRoles();
        setRoles(data);
    } catch (e) {
        console.error("Load roles failed:", e);
    } finally {
        setIsLoadingRoles(false);
    }
  };

  const handleAddRole = async (role: Role) => { await saveRole(role); await loadRoles(); };
  const handleUpdateRole = async (role: Role) => { await saveRole(role); await loadRoles(); };
  const handleDeleteRole = async (id: string) => { await apiDeleteRole(id); await loadRoles(); };

  const handleTestConnection = async () => {
    if (!onCheckConnection) return;
    setIsChecking(true);
    const success = await onCheckConnection();
    setIsChecking(false);
    setConnStatus(success ? 'SUCCESS' : 'ERROR');
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) { 
        alert("Mật khẩu mới phải có tối thiểu 6 ký tự."); 
        return; 
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
        alert("Mật khẩu mới bắt buộc phải chứa cả ký tự viết Hoa (A-Z) và viết thường (a-z).");
        return;
    }
    if (newPassword !== confirmPassword) { 
        alert("Mật khẩu xác nhận không khớp."); 
        return; 
    }
    setIsUpdatingPassword(true);
    try {
        await onUpdateUser({ 
            ...currentUser, 
            password: newPassword,
            require_password_change: false,
            requirePasswordChange: false
        });
        alert("Đã cập nhật mật khẩu thành công!");
        setNewPassword(''); setConfirmPassword('');
    } catch (error) { 
        alert("Lỗi khi cập nhật mật khẩu."); 
    } finally { 
        setIsUpdatingPassword(false); 
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => { setProfileData(prev => ({ ...prev, avatar: reader.result as string })); };
          reader.readAsDataURL(file);
      }
  };

  const handleSaveProfile = async () => {
      if (!profileData.name) { alert("Tên không được để trống"); return; }
      setIsSavingProfile(true);
      try { 
          // ISO Clean Update: Gửi object profile đầy đủ
          await onUpdateUser(profileData); 
          setIsEditingProfile(false); 
      } 
      catch (error) { alert("Lỗi khi cập nhật thông tin cá nhân"); } finally { setIsSavingProfile(false); }
  };

  const qcModules = ALL_MODULES.filter(m => m.group === 'KIỂM TRA CHẤT LƯỢNG' || m.group === 'QC' || m.group === 'QA');

  return (
    <div className="h-full flex flex-col animate-fade-in pb-20 md:pb-0 bg-slate-50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-900 p-3 md:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3 sticky top-0 z-20 shadow-sm">
             <div className="flex items-center justify-end">
                 {isAdminOrManager && onCheckConnection && (
                    <Button variant={connStatus === 'ERROR' ? 'danger' : 'secondary'} size="sm" onClick={handleTestConnection} disabled={isChecking} icon={isChecking ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Wifi className="w-4 h-4"/>} className="md:hidden"></Button>
                 )}
             </div>
             <div className="w-full">
                 <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 w-full">
                     {showTab('TEMPLATE') && (
                         <button onClick={() => setActiveTab('TEMPLATE')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'TEMPLATE' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'}`}><FileCheck className="w-4 h-4"/> <span>Mẫu kiểm tra</span></button>
                     )}
                     {showTab('USERS') && (
                         <button onClick={() => setActiveTab('USERS')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'USERS' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'}`}><Users className="w-4 h-4"/> <span>Người dùng</span></button>
                     )}
                     {showTab('WORKSHOPS') && (
                         <button onClick={() => setActiveTab('WORKSHOPS')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'WORKSHOPS' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'}`}><Factory className="w-4 h-4"/> <span>Quản lý xưởng</span></button>
                     )}
                     {showTab('DEPARTMENTS') && (
                         <button onClick={() => setActiveTab('DEPARTMENTS')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'DEPARTMENTS' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'}`}><Building className="w-4 h-4"/> <span>Phòng ban</span></button>
                     )}
                     {showTab('PROFILE') && (
                         <button onClick={() => setActiveTab('PROFILE')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'PROFILE' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:text-slate-300'}`}><UserCircle className="w-4 h-4"/> <span>Cá nhân</span></button>
                     )}
                 </div>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 no-scrollbar">
            <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
                {activeTab === 'TEMPLATE' && showTab('TEMPLATE') && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"><h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Layers className="w-4 h-4" /> Chọn Module cần cấu hình</h3><div className="flex flex-wrap gap-2">{qcModules.map(m => (<button key={m.id} onClick={() => setSelectedModuleForTemplate(m.id)} className={`px-3 py-2 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-tight transition-all border-2 ${selectedModuleForTemplate === m.id ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:border-slate-600'}`}>{m.label}</button>))}</div></div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"><TemplateEditor key={selectedModuleForTemplate} user={currentUser} currentTemplate={allTemplates[selectedModuleForTemplate] || []} onSave={(items, subId) => onSaveTemplate(subId || selectedModuleForTemplate, items)} onCancel={onClose} moduleId={selectedModuleForTemplate} allTemplates={allTemplates}/></div>
                    </div>
                )}
                {activeTab === 'USERS' && showTab('USERS') && (
                    <UserManagement currentUser={currentUser} users={users} roles={roles} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} onImportUsers={onImportUsers} />
                )}
                {activeTab === 'WORKSHOPS' && showTab('WORKSHOPS') && (
                    <WorkshopManagement workshops={workshops} onAddWorkshop={onAddWorkshop} onUpdateWorkshop={onUpdateWorkshop} onDeleteWorkshop={onDeleteWorkshop} />
                )}
                {activeTab === 'DEPARTMENTS' && showTab('DEPARTMENTS') && (
                    <DepartmentManagement />
                )}

                {activeTab === 'PROFILE' && showTab('PROFILE') && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Compact Horizontal Profile Panel */}
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm flex flex-col gap-3">
                            <div className="flex flex-col md:flex-row items-center gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                                <div className="relative shrink-0">
                                    <div className="w-16 h-16 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden bg-slate-50 dark:bg-slate-850 flex items-center justify-center">
                                        <img 
                                            src={getProxyImageUrl(profileData.avatar)} 
                                            alt={profileData.name} 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => {
                                                const name = profileData.name || 'User';
                                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563EB&color=fff&size=256`;
                                            }}
                                        />
                                    </div>
                                    {isEditingProfile && (
                                        <button onClick={() => profileFileInputRef.current?.click()} className="absolute bottom-0 right-0 p-1 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-all active:scale-95 border border-white dark:border-slate-900">
                                            <Camera className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <input type="file" ref={profileFileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange}/>
                                </div>
                                <div className="flex-1 text-center md:text-left min-w-0">
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                        {isEditingProfile ? (
                                            <input 
                                                value={profileData.name} 
                                                onChange={e => setProfileData({...profileData, name: e.target.value.toUpperCase()})} 
                                                className="px-2 py-1 text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 uppercase" 
                                                placeholder="HỌ VÀ TÊN..."
                                            />
                                        ) : (
                                            <h3 className="text-sm font-black text-slate-950 dark:text-slate-50 uppercase tracking-tight">{profileData.name}</h3>
                                        )}
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border border-slate-200 dark:border-slate-700">
                                            {profileData.role === 'ADMIN' ? 'Admin' : profileData.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'}
                                        </span>
                                    </div>
                                    <p className="text-blue-600 dark:text-blue-400 font-bold text-xs mt-0.5">@{profileData.username}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    {!isEditingProfile ? (
                                        <button onClick={() => setIsEditingProfile(true)} className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-tight rounded-md active:scale-95 transition-all flex items-center gap-1.5 leading-none">
                                            <Edit3 className="w-3.5 h-3.5" /> Thống kê & Chỉnh sửa
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { setIsEditingProfile(false); setProfileData(currentUser); }} className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-tight rounded-md active:scale-95 transition-all leading-none">
                                                Hủy
                                            </button>
                                            <button onClick={handleSaveProfile} disabled={isSavingProfile} className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-tight rounded-md active:scale-95 transition-all flex items-center gap-1 leading-none disabled:opacity-50">
                                                {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
                                                <span>Lưu</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Info Fields Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Mã nhân viên (MSNV)</span>
                                    {isEditingProfile ? (
                                        <input value={profileData.msnv || ''} onChange={e => setProfileData({...profileData, msnv: e.target.value.toUpperCase()})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:font-normal" placeholder="VD: AA-00123"/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-800">{profileData.msnv || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Chức danh / Cấp bậc</span>
                                    {isEditingProfile ? (
                                        <input value={profileData.position || ''} onChange={e => setProfileData({...profileData, position: e.target.value})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập chức danh..."/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-800">{profileData.position || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Ngày nhận việc</span>
                                    {isEditingProfile ? (
                                        <input type="date" value={profileData.joinDate || ''} onChange={e => setProfileData({...profileData, joinDate: e.target.value})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none transition-all"/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-800 font-mono">{profileData.joinDate || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Nơi làm việc / Chi nhánh</span>
                                    {isEditingProfile ? (
                                        <input value={profileData.workLocation || ''} onChange={e => setProfileData({...profileData, workLocation: e.target.value})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập địa điểm..."/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-800">{profileData.workLocation || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Trình độ chuyên môn</span>
                                    {isEditingProfile ? (
                                        <input value={profileData.education || ''} onChange={e => setProfileData({...profileData, education: e.target.value})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập trình độ..."/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-800">{profileData.education || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Quyền truy cập Module</span>
                                    <div className="flex flex-wrap gap-1 bg-slate-50/20 dark:bg-slate-800/20 border border-slate-150 dark:border-slate-800 p-1 rounded-md min-h-[31px]">
                                        {(profileData?.allowedModules || []).map((m, mIdx) => (
                                            <span key={`${m}-${mIdx}`} className="px-1.5 py-0.5 bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 rounded text-[8px] font-black border border-blue-100 dark:border-slate-700 uppercase leading-none">{m}</span>
                                        ))}
                                        {(!profileData?.allowedModules || profileData.allowedModules.length === 0) && (
                                            <span className="text-[10px] italic text-slate-400 dark:text-slate-500">Chưa cấp quyền module</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Ultra-compact horizontal Password Reset Panel */}
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 text-slate-500" />
                                <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">Đổi mật khẩu tài khoản</h4>
                            </div>
                            <div className="flex flex-col md:flex-row items-end md:items-center gap-2">
                                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase shrink-0">Mật khẩu mới:</span>
                                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-transparent border-none p-0 outline-none text-xs font-bold text-slate-800 dark:text-slate-200" placeholder="Ít nhất 4 ký tự..."/>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-705 rounded-md px-2 py-1">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase shrink-0">Xác nhận:</span>
                                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-transparent border-none p-0 outline-none text-xs font-bold text-slate-800 dark:text-slate-200" placeholder="Xác nhận lại..."/>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleChangePassword} 
                                    disabled={isUpdatingPassword || !newPassword || !confirmPassword} 
                                    className="px-3 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider rounded-md transition-all shrink-0 flex items-center gap-1 h-[31px] disabled:opacity-50"
                                >
                                    {isUpdatingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
                                    <span>Cập nhật</span>
                                </button>
                            </div>
                        </div>

                        {/* Compact user activity logs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Signature Template Management */}
                            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Edit3 className="w-4 h-4 text-orange-500" />
                                        <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Dấu chữ ký điện tử</h4>
                                    </div>
                                    {profileData.signature_template && (
                                        <div className="text-[8px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded uppercase border border-green-100 flex items-center gap-1">
                                            <ShieldCheck className="w-2.5 h-2.5" /> Đã cài đặt
                                        </div>
                                    )}
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="bg-slate-50 dark:bg-slate-800/20 rounded-xl p-1 border border-dashed border-slate-200 dark:border-slate-700">
                                        <SignaturePad 
                                            label="VẼ CHỮ KÝ MẪU CỦA BẠN" 
                                            value={profileData.signature_template}
                                            onChange={(val) => setProfileData(prev => ({ ...prev, signature_template: val, signatureTemplate: val }))}
                                        />
                                    </div>
                                    
                                    <div className="text-[9px] text-slate-500 leading-relaxed italic pr-2">
                                        * Chữ ký này sẽ được sử dụng để ký nhanh các phiếu kiểm tra. Hãy đảm bảo bạn vẽ chữ ký rõ ràng và đúng mẫu quy định.
                                    </div>
                                    
                                    {isEditingProfile && (
                                        <div className="pt-2">
                                            <button 
                                                onClick={handleSaveProfile}
                                                disabled={isSavingProfile}
                                                className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
                                            >
                                                {isSavingProfile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                Cập nhật chữ ký mẫu
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Activity Logs */}
                            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm p-3 space-y-2 flex flex-col">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-indigo-500" />
                                    <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Nhật ký hoạt động cá nhân</h4>
                                </div>
                                <div className="flex-1 max-h-[300px] overflow-y-auto no-scrollbar border border-slate-100 dark:border-slate-800 rounded-md bg-slate-50/50 dark:bg-slate-800/30 p-2">
                                    <UserActivityList userId={currentUser.id} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
