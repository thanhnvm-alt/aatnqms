import { getProxyImageUrl } from '../src/utils';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckItem, User, Workshop, Role, RoleObject, ModuleId, hasPermission } from '../types';
import { TemplateEditor } from './TemplateEditor';
import { UserManagement } from './UserManagement';
import { RoleManagement } from './RoleManagement';
import { WorkshopManagement } from './WorkshopManagement';
import { DepartmentManagement } from './DepartmentManagement';
import { UserActivityList } from './UserActivityList';
import { SystemAuditPanel } from './SystemAuditPanel';
import { SignaturePad } from './SignaturePad';
import { uploadQMSImage, changePassword, fetchRoles, saveRole, deleteRole as apiDeleteRole } from '../services/apiService';
import { 
    FileCheck, 
    Users, 
    Factory, 
    AlertCircle, 
    Layers,
    UserCircle,
    Lock,
    Eye,
    EyeOff,
    Save,
    ShieldCheck,
    Shield,
    Loader2,
    Edit3,
    Camera,
    ShieldAlert,
    Building,
    Activity,
    CheckCircle2,
    X
} from 'lucide-react';
import { ALL_MODULES } from '../constants';
import { Combobox } from '../src/components/qms';

interface SettingsProps {
  currentUser: User; 
  roles?: Array<Role | RoleObject>;
  onRolesChanged?: () => Promise<void>;
  allTemplates: Record<string, CheckItem[]>;
  onSaveTemplate: (moduleId: string, newTemplate: CheckItem[]) => void;
  users: User[];
  onAddUser: (user: User) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onImportUsers?: (users: User[]) => Promise<void>;
  onPasswordUpdated?: (updatedUser: User) => void;
  workshops: Workshop[];
  onAddWorkshop: (workshop: Workshop) => Promise<void>;
  onUpdateWorkshop: (workshop: Workshop) => Promise<void>;
  onDeleteWorkshop: (id: string) => Promise<void>;
  onClose: () => void;
  onCheckConnection?: () => Promise<boolean>;
  initialTab?: 'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS' | 'SYSTEM_AUDIT'; 
}

export const Settings: React.FC<SettingsProps> = ({ 
    currentUser,
    roles: propRoles,
    onRolesChanged,
    allTemplates, 
    onSaveTemplate, 
    users, 
    onAddUser, 
    onUpdateUser, 
    onDeleteUser,
    onImportUsers,
    onPasswordUpdated,
    workshops,
    onAddWorkshop,
    onUpdateWorkshop,
    onDeleteWorkshop,
    initialTab
}) => {
  const [localRoles, setLocalRoles] = useState<RoleObject[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  const effectiveRoles = useMemo<RoleObject[]>(() => {
    const raw = propRoles && propRoles.length > 0 ? propRoles : localRoles;
    return raw.map((r) => (typeof r === 'string' ? { id: r, name: r, permissions: [] } : r));
  }, [propRoles, localRoles]);

  const isAdmin = String(currentUser?.role || '').toUpperCase().trim() === 'ADMIN';

  const showTab = (tabName: 'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS' | 'SYSTEM_AUDIT') => {
      if (tabName === 'SYSTEM_AUDIT') {
          return isAdmin;
      }
      if (isAdmin || hasPermission(currentUser, effectiveRoles, 'SYSTEM_ADMIN', 'VIEW')) return true;
      
      const mapping: Record<string, ModuleId> = {
          'TEMPLATE': 'SETTINGS_TEMPLATE',
          'USERS': 'SETTINGS_USERS',
          'ROLES': 'SETTINGS_ROLES',
          'WORKSHOPS': 'SETTINGS_WORKSHOPS',
          'DEPARTMENTS': 'SETTINGS_DEPARTMENTS',
          'PROFILE': 'SETTINGS_PROFILE'
      };
      return hasPermission(currentUser, effectiveRoles, mapping[tabName], 'VIEW');
  };

  const [activeTab, setActiveTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES' | 'DEPARTMENTS' | 'SYSTEM_AUDIT'>(() => {
    if (initialTab) return initialTab;
    if (String(currentUser?.role || '').toUpperCase().trim() === 'ADMIN') return 'TEMPLATE';
    return 'PROFILE';
  });

  useEffect(() => {
    if (initialTab && showTab(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab, currentUser?.role, effectiveRoles]);

  // Dynamically adjust activeTab once roles list are loaded
  useEffect(() => {
    if (effectiveRoles && effectiveRoles.length > 0 && !initialTab) {
      const order: ('TEMPLATE' | 'USERS' | 'ROLES' | 'WORKSHOPS' | 'DEPARTMENTS' | 'SYSTEM_AUDIT' | 'PROFILE')[] = [
        'TEMPLATE', 'USERS', 'ROLES', 'WORKSHOPS', 'DEPARTMENTS', 'SYSTEM_AUDIT', 'PROFILE'
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
  }, [effectiveRoles]);
  
  const [selectedModuleForTemplate, setSelectedModuleForTemplate] = useState<string>('PQC');

  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState<User>(() => ({
    ...currentUser,
    workLocation: currentUser.workLocation || (currentUser as any).work_location || '',
    joinDate: currentUser.joinDate || (currentUser as any).join_date || ''
  }));
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
        setLocalRoles(Array.isArray(data) ? data.map((r: any) => typeof r === 'string' ? { id: r, name: r, permissions: [] } : r) : []);
    } catch (e) {
        console.error("Load roles failed:", e);
    } finally {
        setIsLoadingRoles(false);
    }
  };

  const handleSaveRole = async (role: RoleObject) => {
    await saveRole(role);
    await loadRoles();
    await onRolesChanged?.();
  };

  const handleDeleteRole = async (id: string) => {
    await apiDeleteRole(id);
    await loadRoles();
    await onRolesChanged?.();
  };

  const handleChangePassword = async () => {
    setProfileFeedback(null);
    if (!currentPassword) {
        setProfileFeedback({ type: 'error', message: 'Vui lòng nhập mật khẩu hiện tại.' });
        return;
    }
    if (!newPassword || newPassword.length < 6) { 
        setProfileFeedback({ type: 'error', message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' }); 
        return; 
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
        setProfileFeedback({ type: 'error', message: 'Mật khẩu mới bắt buộc phải chứa cả ký tự viết Hoa (A-Z) và viết thường (a-z).' });
        return;
    }
    if (newPassword !== confirmPassword) { 
        setProfileFeedback({ type: 'error', message: 'Mật khẩu xác nhận không khớp.' }); 
        return; 
    }
    setIsUpdatingPassword(true);
    try {
        const res = await changePassword(currentPassword, newPassword);
        if (res?.user) {
          onPasswordUpdated?.(res.user);
        }
        setProfileFeedback({ type: 'success', message: 'Đã cập nhật mật khẩu thành công!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    } catch (error: any) { 
        setProfileFeedback({ type: 'error', message: error?.message || 'Lỗi khi cập nhật mật khẩu.' }); 
    } finally { 
        setIsUpdatingPassword(false); 
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const url = await uploadQMSImage(file, {
              entityType: 'USER',
              entityId: currentUser.id,
              role: 'AVATAR',
          });
          setProfileData(prev => ({ ...prev, avatar: url }));
      } catch (err: any) {
          setProfileFeedback({ type: 'error', message: 'Lỗi tải ảnh đại diện lên: ' + (err?.message || 'Thất bại') });
      } finally {
          e.target.value = '';
      }
  };

  const handleSaveProfile = async () => {
      setProfileFeedback(null);
      if (!profileData.name?.trim()) {
          setProfileFeedback({ type: 'error', message: 'Họ và tên không được để trống.' });
          return;
      }
      setIsSavingProfile(true);
      try { 
          let resolvedAvatar = profileData.avatar;
          if (resolvedAvatar && resolvedAvatar.startsWith('data:')) {
              resolvedAvatar = await uploadQMSImage(resolvedAvatar, {
                  entityType: 'USER',
                  entityId: currentUser.id,
                  role: 'AVATAR',
              });
              setProfileData(prev => ({ ...prev, avatar: resolvedAvatar }));
          }
          // Restriction: Only update basic info, strictly preserving sensitive user data
          const updateObj = {
              ...currentUser,
              name: profileData.name.trim(),
              avatar: resolvedAvatar,
              workLocation: profileData.workLocation,
              education: profileData.education,
          };
          await onUpdateUser(updateObj); 
          setIsEditingProfile(false); 
          setProfileFeedback({ type: 'success', message: 'Đã cập nhật thông tin cơ bản thành công!' });
      } 
      catch (error: any) {
          setProfileFeedback({ type: 'error', message: 'Lỗi khi cập nhật thông tin cá nhân: ' + (error?.message || 'Thất bại') });
      } finally { setIsSavingProfile(false); }
  };

  const handleSaveSignature = async () => {
    setProfileFeedback(null);
    if (!profileData.signature_template) {
        setProfileFeedback({ type: 'error', message: 'Vui lòng vẽ chữ ký trước khi lưu.' });
        return;
    }
    setIsSavingSignature(true);
    try {
        let resolvedSig = profileData.signature_template;
        if (resolvedSig.startsWith('data:')) {
            resolvedSig = await uploadQMSImage(resolvedSig, {
                entityType: 'USER',
                entityId: currentUser.id,
                role: 'SIGNATURE_TEMPLATE',
            });
            setProfileData(prev => ({ ...prev, signature_template: resolvedSig }));
        }
        await onUpdateUser({
            ...currentUser,
            signature_template: resolvedSig,
            signatureTemplate: resolvedSig
        });
        setProfileFeedback({ type: 'success', message: 'Đã cập nhật chữ ký mẫu thành công!' });
    } catch (error: any) {
        setProfileFeedback({ type: 'error', message: 'Lỗi khi cập nhật chữ ký: ' + (error?.message || 'Thất bại') });
    } finally {
        setIsSavingSignature(false);
    }
  };

  const qcModules = ALL_MODULES.filter(m => m.group === 'KIỂM TRA CHẤT LƯỢNG' || m.group === 'QC' || m.group === 'QA');

  const resolvedTemplateItems = useMemo(() => {
    if (selectedModuleForTemplate === 'SQC_MAT' || selectedModuleForTemplate === 'SQC_VT') {
      return allTemplates['SQC_MAT'] || allTemplates['SQC_VT'] || [];
    }
    if (selectedModuleForTemplate === 'SITE') {
      return allTemplates['SITE_BAN'] || allTemplates['SITE'] || [];
    }
    return allTemplates[selectedModuleForTemplate] || [];
  }, [allTemplates, selectedModuleForTemplate]);

  const roleBadgeLabel = useMemo(() => {
    const raw = String(profileData.role || 'QC').trim();
    const matched = effectiveRoles.find(r => r.id === raw || r.name === raw);
    if (matched) return matched.name;
    const upper = raw.toUpperCase();
    const map: Record<string, string> = {
      ADMIN: 'Quản trị hệ thống (ADMIN)',
      MANAGER: 'Quản lý',
      QA: 'QA Staff',
      QC_LEAD: 'Tổ trưởng QC',
      QC: 'QC Inspector',
      PURCHASING: 'Mua hàng',
      VENDOR: 'Nhà cung cấp',
    };
    return map[upper] || raw;
  }, [profileData.role, effectiveRoles]);

  return (
    <div className="h-full flex flex-col animate-fade-in pb-2 md:pb-0 bg-slate-50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-900 p-2 px-3 md:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2.5 sticky top-0 z-20 shadow-sm">
             <div className="w-full">
                 <div className="flex overflow-x-auto hide-scrollbar gap-2 w-full pb-1 -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                     {showTab('TEMPLATE') && (
                         <button type="button" onClick={() => setActiveTab('TEMPLATE')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'TEMPLATE' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><FileCheck className="w-4 h-4"/> <span>Mẫu kiểm tra</span></button>
                     )}
                     {showTab('USERS') && (
                         <button type="button" onClick={() => setActiveTab('USERS')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'USERS' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><Users className="w-4 h-4"/> <span>Người dùng</span></button>
                     )}
                     {showTab('ROLES') && (
                         <button type="button" onClick={() => setActiveTab('ROLES')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'ROLES' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><Shield className="w-4 h-4"/> <span>Vai trò</span></button>
                     )}
                     {showTab('WORKSHOPS') && (
                         <button type="button" onClick={() => setActiveTab('WORKSHOPS')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'WORKSHOPS' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><Factory className="w-4 h-4"/> <span>Quản lý xưởng</span></button>
                     )}
                     {showTab('DEPARTMENTS') && (
                         <button type="button" onClick={() => setActiveTab('DEPARTMENTS')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'DEPARTMENTS' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><Building className="w-4 h-4"/> <span>Phòng ban</span></button>
                     )}
                     {showTab('SYSTEM_AUDIT') && (
                         <button type="button" onClick={() => setActiveTab('SYSTEM_AUDIT')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'SYSTEM_AUDIT' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><ShieldAlert className="w-4 h-4"/> <span>Kiểm toán lỗi API</span></button>
                     )}
                     {showTab('PROFILE') && (
                         <button type="button" onClick={() => setActiveTab('PROFILE')} className={`min-h-[44px] lg:min-h-[38px] whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold md:font-medium transition-all flex flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'PROFILE' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-blue-200 dark:border-slate-700 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'}`}><UserCircle className="w-4 h-4"/> <span>Cá nhân</span></button>
                     )}
                 </div>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 py-1.5 md:p-6 no-scrollbar pb-24 lg:pb-6">
            <div className="w-full max-w-none space-y-3 md:space-y-6">
                {activeTab === 'TEMPLATE' && showTab('TEMPLATE') && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 shrink-0">
                                <Layers className="w-4 h-4" /> Cấu hình Module
                            </h3>
                            <div className="relative w-full md:w-80">
                                <Combobox
                                    value={selectedModuleForTemplate}
                                    onChange={(v) => setSelectedModuleForTemplate(v || 'PQC')}
                                    options={qcModules.map(m => ({ value: m.id, label: m.label }))}
                                    allowClear={false}
                                    ariaLabel="Chọn module cấu hình"
                                    className="w-full"
                                />
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <TemplateEditor
                                key={selectedModuleForTemplate}
                                user={currentUser}
                                currentTemplate={resolvedTemplateItems}
                                isReadOnly={!isAdmin}
                                canExport={isAdmin || hasPermission(currentUser, effectiveRoles, 'SETTINGS_TEMPLATE', 'EXPORT')}
                                onSave={(items, subId) => onSaveTemplate(subId || selectedModuleForTemplate, items)}
                                onCancel={() => {}}
                                moduleId={selectedModuleForTemplate}
                                allTemplates={allTemplates}
                            />
                        </div>
                    </div>
                )}
                {activeTab === 'USERS' && showTab('USERS') && (
                    <UserManagement currentUser={currentUser} users={users} roles={effectiveRoles} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} onImportUsers={onImportUsers} />
                )}
                {activeTab === 'ROLES' && showTab('ROLES') && (
                    <RoleManagement
                        currentUser={currentUser}
                        roles={effectiveRoles}
                        users={users}
                        isLoading={isLoadingRoles}
                        onSaveRole={handleSaveRole}
                        onDeleteRole={handleDeleteRole}
                    />
                )}
                {activeTab === 'WORKSHOPS' && showTab('WORKSHOPS') && (
                    <WorkshopManagement workshops={workshops} isReadOnly={!isAdmin} onAddWorkshop={onAddWorkshop} onUpdateWorkshop={onUpdateWorkshop} onDeleteWorkshop={onDeleteWorkshop} />
                )}
                {activeTab === 'DEPARTMENTS' && showTab('DEPARTMENTS') && (
                    <DepartmentManagement isReadOnly={!isAdmin} />
                )}
                {activeTab === 'SYSTEM_AUDIT' && showTab('SYSTEM_AUDIT') && (
                    <SystemAuditPanel />
                )}

                {activeTab === 'PROFILE' && showTab('PROFILE') && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {profileFeedback && (
                            <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${
                                profileFeedback.type === 'success'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
                                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
                            }`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    {profileFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                    <span>{profileFeedback.message}</span>
                                </div>
                                <button type="button" onClick={() => setProfileFeedback(null)} aria-label="Đóng thông báo" className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] -my-1 -mr-1.5 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
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
                                        <button type="button" onClick={() => profileFileInputRef.current?.click()} className="absolute -bottom-1 -right-1 min-w-[36px] min-h-[36px] p-1.5 flex items-center justify-center bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-all active:scale-95 border border-white dark:border-slate-900">
                                            <Camera className="w-4 h-4" />
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
                                                className="min-h-[44px] lg:min-h-[38px] px-3 py-1.5 text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 uppercase" 
                                                placeholder="HỌ VÀ TÊN..."
                                            />
                                        ) : (
                                            <h3 className="text-sm font-black text-slate-950 dark:text-slate-50 uppercase tracking-tight">{profileData.name}</h3>
                                        )}
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider border border-slate-200 dark:border-slate-700">
                                            {roleBadgeLabel}
                                        </span>
                                    </div>
                                    <p className="text-blue-600 dark:text-blue-400 font-bold text-xs mt-0.5">@{profileData.username}</p>
                                </div>
                                <div className="flex gap-2 shrink-0 w-full md:w-auto justify-center">
                                    {!isEditingProfile ? (
                                        <button onClick={() => setIsEditingProfile(true)} className="min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all flex items-center gap-2 shadow-sm shadow-indigo-500/20">
                                            <Edit3 className="w-4 h-4" /> Chỉnh sửa thông tin
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <button onClick={() => { setIsEditingProfile(false); setProfileData({...currentUser, workLocation: currentUser.workLocation || (currentUser as any).work_location || '', joinDate: currentUser.joinDate || (currentUser as any).join_date || ''}); }} className="flex-1 sm:flex-none min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all">
                                                Hủy
                                            </button>
                                            <button onClick={handleSaveProfile} disabled={isSavingProfile} className="flex-1 sm:flex-none min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 disabled:opacity-50">
                                                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                                                <span>Lưu thay đổi</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Info Fields Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 ml-0.5">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Mã nhân viên (MSNV)</span>
                                        <Lock className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 cursor-not-allowed opacity-70">
                                        {profileData.msnv || profileData.username?.toUpperCase() || 'Chưa thiết lập'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 ml-0.5">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Chức danh / Cấp bậc</span>
                                        <Lock className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 cursor-not-allowed opacity-70 uppercase">
                                        {profileData.position || 'Chưa thiết lập'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 ml-0.5">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Ngày nhận việc</span>
                                        <Lock className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 cursor-not-allowed opacity-70 font-mono">
                                        {profileData.joinDate || 'Chưa thiết lập'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Nơi làm việc / Chi nhánh</span>
                                    {isEditingProfile ? (
                                        <input value={profileData.workLocation || ''} onChange={e => setProfileData({...profileData, workLocation: e.target.value})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900 focus:ring-2 focus:ring-indigo-500/20 shadow-sm outline-none transition-all placeholder:font-normal" placeholder="Nhập địa điểm..."/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800">{profileData.workLocation || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block ml-0.5">Trình độ chuyên môn</span>
                                    {isEditingProfile ? (
                                        <input value={profileData.education || ''} onChange={e => setProfileData({...profileData, education: e.target.value})} className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900 focus:ring-2 focus:ring-indigo-500/20 shadow-sm outline-none transition-all placeholder:font-normal" placeholder="Nhập trình độ..."/>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 uppercase">{profileData.education || 'Chưa thiết lập'}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 ml-0.5">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Quyền truy cập Module</span>
                                        <Lock className="w-2.5 h-2.5 text-slate-300 dark:text-slate-600" />
                                    </div>
                                    <div className="flex flex-wrap gap-1 bg-slate-50/20 dark:bg-slate-800/20 border border-slate-150 dark:border-slate-800 p-1.5 rounded-xl min-h-[35px] opacity-70 cursor-not-allowed">
                                        {(profileData?.allowedModules || []).map((m, mIdx) => (
                                            <span key={`${m}-${mIdx}`} className="px-1.5 py-0.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded text-[8px] font-black border border-blue-100 dark:border-slate-700 uppercase leading-none">{m}</span>
                                        ))}
                                        {(!profileData?.allowedModules || profileData.allowedModules.length === 0) && (
                                            <span className="text-[9px] italic text-slate-400 dark:text-slate-500">Chưa cấp quyền module</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Ultra-compact horizontal Password Reset Panel */}
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-slate-500" />
                                    <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">Đổi mật khẩu tài khoản</h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1"
                                >
                                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    <span>{showPassword ? 'Ẩn' : 'Hiện'}</span>
                                </button>
                            </div>
                            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
                                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <div className="min-h-[44px] lg:min-h-[38px] flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase shrink-0">Mật khẩu cũ:</span>
                                        <input type={showPassword ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full bg-transparent border-none p-0 outline-none text-xs font-bold text-slate-800 dark:text-slate-200" placeholder="Nhập mật khẩu cũ..."/>
                                    </div>
                                    <div className="min-h-[44px] lg:min-h-[38px] flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase shrink-0">Mật khẩu mới:</span>
                                        <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-transparent border-none p-0 outline-none text-xs font-bold text-slate-800 dark:text-slate-200" placeholder="Ít nhất 6 ký tự (Hoa+thường)"/>
                                    </div>
                                    <div className="min-h-[44px] lg:min-h-[38px] flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase shrink-0">Xác nhận:</span>
                                        <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-transparent border-none p-0 outline-none text-xs font-bold text-slate-800 dark:text-slate-200" placeholder="Xác nhận lại..."/>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={handleChangePassword} 
                                    disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword} 
                                    className="min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-black text-white text-[11px] font-black uppercase tracking-wider rounded-lg transition-all shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                                    <span>Cập nhật</span>
                                </button>
                            </div>
                        </div>

                        {/* Compact user activity logs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Signature Template Management - Independent Logic */}
                            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Edit3 className="w-4 h-4 text-orange-500" />
                                        <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Dấu chữ ký điện tử</h4>
                                    </div>
                                    {(profileData.signature_template || currentUser.signature_template) && (
                                        <div className="text-[8px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded uppercase border border-green-100 flex items-center gap-1">
                                            <ShieldCheck className="w-2.5 h-2.5" /> Đã cài đặt
                                        </div>
                                    )}
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="bg-slate-50 dark:bg-slate-800/20 rounded-xl p-1 border border-dashed border-slate-200 dark:border-slate-700">
                                        <SignaturePad 
                                            label="Vẽ chữ ký mẫu của bạn (Ký trực tiếp vào khung dưới)" 
                                            value={profileData.signature_template || currentUser.signature_template}
                                            onChange={(val) => setProfileData(prev => ({ ...prev, signature_template: val, signatureTemplate: val }))}
                                            isTemplateEditor={true}
                                        />
                                    </div>
                                    
                                    <div className="text-[9px] text-slate-500 leading-relaxed italic pr-2">
                                        * Chữ ký này sẽ được sử dụng để ký nhanh các phiếu kiểm tra. Hãy đảm bảo bạn vẽ chữ ký rõ ràng và đúng mẫu quy định.
                                    </div>
                                    
                                    {(profileData.signature_template !== (currentUser.signature_template || currentUser.signatureTemplate)) && (
                                        <div className="pt-2 animate-in fade-in zoom-in-95 duration-200">
                                            <button 
                                                onClick={handleSaveSignature}
                                                disabled={isSavingSignature}
                                                className="w-full min-h-[44px] py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95"
                                            >
                                                {isSavingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Xác nhận & Lưu chữ ký mới
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
