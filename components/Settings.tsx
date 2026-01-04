
import React, { useState, useEffect, useRef } from 'react';
import { CheckItem, User, Workshop, Role } from '../types';
import { TemplateEditor } from './TemplateEditor';
import { UserManagement } from './UserManagement';
import { WorkshopManagement } from './WorkshopManagement';
import { RoleManagement } from './RoleManagement';
import { Button } from './Button';
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
    ShieldAlert
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
  initialTab?: 'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES'; 
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
  const isAdminOrManager = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  
  const [activeTab, setActiveTab] = useState<'TEMPLATE' | 'USERS' | 'WORKSHOPS' | 'PROFILE' | 'ROLES'>(
    initialTab || (isAdminOrManager ? 'TEMPLATE' : 'PROFILE')
  );
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [selectedModuleForTemplate, setSelectedModuleForTemplate] = useState<string>('PQC');
  const [isChecking, setIsChecking] = useState(false);
  const [connStatus, setConnStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');

  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState<User>(currentUser);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdminOrManager) {
        handleTestConnection();
        loadRoles();
    }
  }, []);

  useEffect(() => {
      setProfileData(currentUser);
  }, [currentUser]);

  const loadRoles = async () => {
    setIsLoadingRoles(true);
    try {
        const data = await fetchRoles();
        setRoles(data);
    } catch (e) {} finally {
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
    if (!newPassword || newPassword.length < 4) { alert("Mật khẩu mới phải có ít nhất 4 ký tự."); return; }
    if (newPassword !== confirmPassword) { alert("Mật khẩu xác nhận không khớp."); return; }
    setIsUpdatingPassword(true);
    try {
        await onUpdateUser({ ...currentUser, password: newPassword });
        alert("Đã cập nhật mật khẩu thành công!");
        setNewPassword(''); setConfirmPassword('');
    } catch (error) { alert("Lỗi khi cập nhật mật khẩu."); } finally { setIsUpdatingPassword(false); }
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
      try { await onUpdateUser(profileData); setIsEditingProfile(false); } 
      catch (error) { alert("Lỗi khi cập nhật thông tin cá nhân"); } finally { setIsSavingProfile(false); }
  };

  const qcModules = ALL_MODULES.filter(m => m.group === 'QC' || m.group === 'QA');

  return (
    <div className="h-full flex flex-col animate-fade-in pb-20 md:pb-0 bg-slate-50">
        <div className="bg-white p-3 md:p-4 border-b border-slate-200 flex flex-col gap-3 sticky top-0 z-20 shadow-sm">
             <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose} icon={<ArrowLeft className="w-4 h-4"/>} className="px-2">
                        <span className="hidden md:inline">Quay lại</span>
                    </Button>
                    <div className="flex items-center gap-2 px-2 border-l border-slate-200">
                        <SettingsIcon className="w-5 h-5 text-slate-700" />
                        <h2 className="text-base md:text-lg font-bold text-slate-800 uppercase tracking-tight">Cài đặt hệ thống</h2>
                    </div>
                 </div>
                 {isAdminOrManager && onCheckConnection && (
                    <Button variant={connStatus === 'ERROR' ? 'danger' : 'secondary'} size="sm" onClick={handleTestConnection} disabled={isChecking} icon={isChecking ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Wifi className="w-4 h-4"/>} className="md:hidden"></Button>
                 )}
             </div>
             <div className="w-full">
                 <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 w-full">
                     {isAdminOrManager && (
                         <>
                            <button onClick={() => setActiveTab('TEMPLATE')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'TEMPLATE' ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}><FileCheck className="w-4 h-4"/> <span>Mẫu kiểm tra</span></button>
                            <button onClick={() => setActiveTab('USERS')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'USERS' ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}><Users className="w-4 h-4"/> <span>Người dùng</span></button>
                            <button onClick={() => setActiveTab('ROLES')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'ROLES' ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}><ShieldAlert className="w-4 h-4"/> <span>Phân quyền</span></button>
                            <button onClick={() => setActiveTab('WORKSHOPS')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'WORKSHOPS' ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}><Factory className="w-4 h-4"/> <span>Quản lý xưởng</span></button>
                         </>
                     )}
                     <button onClick={() => setActiveTab('PROFILE')} className={`px-2 py-2.5 rounded-lg text-xs md:text-sm font-bold md:font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2 text-center border ${activeTab === 'PROFILE' ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'}`}><UserCircle className="w-4 h-4"/> <span>Cá nhân</span></button>
                 </div>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 no-scrollbar">
            <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
                {isAdminOrManager && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm animate-in slide-in-from-top duration-500">
                        <div className="flex items-center gap-3 mb-3 border-b border-slate-100 pb-2"><div className="p-2 bg-slate-100 rounded-lg"><Database className="w-4 h-4 text-slate-700" /></div><h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">Trạng thái hệ thống</h3></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"><Cloud className={`w-5 h-5 ${connStatus === 'SUCCESS' ? 'text-green-500' : connStatus === 'ERROR' ? 'text-red-500' : 'text-slate-400'}`} /><div><p className="text-[10px] font-black text-slate-400 uppercase">Kết nối Database</p><p className={`text-xs font-bold ${connStatus === 'SUCCESS' ? 'text-green-600' : connStatus === 'ERROR' ? 'text-red-600' : 'text-slate-600'}`}>{isChecking ? 'Đang kiểm tra...' : connStatus === 'SUCCESS' ? 'Đã kết nối (Turso)' : connStatus === 'ERROR' ? 'Mất kết nối' : 'Chưa kiểm tra'}</p></div></div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"><HardDrive className="w-5 h-5 text-blue-500" /><div><p className="text-[10px] font-black text-slate-400 uppercase">Storage Mode</p><p className="text-xs font-bold text-slate-600">Hybrid (DB + Local)</p></div></div>
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"><div className="truncate flex-1"><p className="text-[10px] font-black text-slate-400 uppercase">Endpoint</p><p className="text-[10px] font-mono text-slate-600 truncate">{process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.replace(/:\/\/.+@/, '://***@').substring(0, 30) + '...' : 'Not Configured'}</p></div></div>
                        </div>
                    </div>
                )}

                {activeTab === 'TEMPLATE' && isAdminOrManager && (
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Layers className="w-4 h-4" /> Chọn Module cần cấu hình</h3><div className="flex flex-wrap gap-2">{qcModules.map(m => (<button key={m.id} onClick={() => setSelectedModuleForTemplate(m.id)} className={`px-3 py-2 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-tight transition-all border-2 ${selectedModuleForTemplate === m.id ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-300'}`}>{m.label}</button>))}</div></div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><TemplateEditor key={selectedModuleForTemplate} currentTemplate={allTemplates[selectedModuleForTemplate] || []} onSave={(items) => onSaveTemplate(selectedModuleForTemplate, items)} onCancel={onClose} moduleId={selectedModuleForTemplate}/></div>
                    </div>
                )}
                {activeTab === 'USERS' && isAdminOrManager && (
                    <UserManagement users={users} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} onImportUsers={onImportUsers} />
                )}
                {activeTab === 'ROLES' && isAdminOrManager && (
                    <RoleManagement roles={roles} onAddRole={handleAddRole} onUpdateRole={handleUpdateRole} onDeleteRole={handleDeleteRole} />
                )}
                {activeTab === 'WORKSHOPS' && isAdminOrManager && (
                    <WorkshopManagement workshops={workshops} onAddWorkshop={onAddWorkshop} onUpdateWorkshop={onUpdateWorkshop} onDeleteWorkshop={onDeleteWorkshop} />
                )}

                {activeTab === 'PROFILE' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="lg:col-span-2 space-y-4 md:space-y-6 relative">
                            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
                                <div className="bg-slate-900 p-6 md:p-8 flex flex-col items-center text-center relative group">
                                    <div className="absolute top-3 right-3 md:top-4 md:right-4 bg-white/10 px-2 py-1 md:px-3 rounded-full text-[9px] md:text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5 border border-white/10"><ShieldCheck className="w-3 h-3 text-blue-400" /><span className="hidden md:inline">Hệ thống</span> {profileData.role}</div>
                                    <div className="relative"><div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white/20 shadow-2xl overflow-hidden mb-3 md:mb-4 bg-slate-800"><img src={profileData.avatar} alt={profileData.name} className="w-full h-full object-cover" /></div>{isEditingProfile && (<button onClick={() => profileFileInputRef.current?.click()} className="absolute bottom-2 right-0 p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-500 transition-all active:scale-95"><Camera className="w-4 h-4 md:w-5 md:h-5" /></button>)}<input type="file" ref={profileFileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange}/></div>
                                    {isEditingProfile ? (<div className="w-full max-w-sm space-y-2"><input value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} className="w-full px-4 py-2 text-center text-lg md:text-xl font-black text-slate-900 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400" placeholder="Nhập họ và tên"/></div>) : (<h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">{profileData.name}</h3>)}
                                    <p className="text-blue-400 font-bold text-sm mt-1">@{profileData.username}</p>
                                </div>
                                <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                                    <div className="space-y-3 md:space-y-4">
                                        <div><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Mã nhân viên (MSNV)</label>{isEditingProfile ? (<input value={profileData.msnv || ''} onChange={e => setProfileData({...profileData, msnv: e.target.value})} className="w-full text-sm font-bold text-slate-800 bg-white px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập mã nhân viên..."/>) : (<p className="text-sm font-bold text-slate-800 bg-slate-50 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-100">{profileData.msnv || '---'}</p>)}</div>
                                        <div><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Chức vụ</label>{isEditingProfile ? (<input value={profileData.position || ''} onChange={e => setProfileData({...profileData, position: e.target.value})} className="w-full text-sm font-bold text-slate-800 bg-white px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập chức vụ..."/>) : (<p className="text-sm font-bold text-slate-800 bg-slate-50 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-100">{profileData.position || '---'}</p>)}</div>
                                        <div><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ngày nhận việc</label>{isEditingProfile ? (<input type="date" value={profileData.joinDate || ''} onChange={e => setProfileData({...profileData, joinDate: e.target.value})} className="w-full text-sm font-bold text-slate-800 bg-white px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"/>) : (<p className="text-sm font-bold text-slate-800 bg-slate-50 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-100 font-mono">{profileData.joinDate || '---'}</p>)}</div>
                                    </div>
                                    <div className="space-y-3 md:space-y-4">
                                        <div><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nơi làm việc</label>{isEditingProfile ? (<input value={profileData.workLocation || ''} onChange={e => setProfileData({...profileData, workLocation: e.target.value})} className="w-full text-sm font-bold text-slate-800 bg-white px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập nơi làm việc..."/>) : (<p className="text-sm font-bold text-slate-800 bg-slate-50 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-100">{profileData.workLocation || '---'}</p>)}</div>
                                        <div><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Trình độ</label>{isEditingProfile ? (<input value={profileData.education || ''} onChange={e => setProfileData({...profileData, education: e.target.value})} className="w-full text-sm font-bold text-slate-800 bg-white px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="Nhập trình độ..."/>) : (<p className="text-sm font-bold text-slate-800 bg-slate-50 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-slate-100">{profileData.education || '---'}</p>)}</div>
                                        <div><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Quyền truy cập</label><div className="flex flex-wrap gap-1.5 mt-1">{(profileData.allowedModules || []).map(m => (<span key={m} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black border border-blue-100 uppercase">{m}</span>))}{(!profileData.allowedModules || profileData.allowedModules.length === 0) && <span className="text-xs italic text-slate-400">Không có modules</span>}</div></div>
                                    </div>
                                </div>
                            </div>
                            {!isEditingProfile && (<button onClick={() => setIsEditingProfile(true)} className="absolute -bottom-3 right-4 md:right-6 bg-blue-600 text-white w-12 h-12 md:w-14 md:h-14 rounded-full shadow-xl shadow-blue-500/40 flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-10 border-4 border-slate-50"><Edit3 className="w-5 h-5 md:w-6 md:h-6" /></button>)}
                            {isEditingProfile && (<div className="flex justify-end gap-3 mt-4 animate-in slide-in-from-bottom-2 fade-in duration-300"><Button variant="secondary" onClick={() => { setIsEditingProfile(false); setProfileData(currentUser); }} className="text-xs md:text-sm">Hủy bỏ</Button><Button onClick={handleSaveProfile} disabled={isSavingProfile} icon={isSavingProfile ? <Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin"/> : <Save className="w-3 h-3 md:w-4 md:h-4"/>} className="text-xs md:text-sm">{isSavingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}</Button></div>)}
                        </div>
                        <div className="lg:col-span-1 pb-10 md:pb-0"><div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-4 md:space-y-6 sticky top-24"><div className="flex items-center gap-3"><div className="p-3 bg-red-50 text-red-600 rounded-2xl"><Lock className="w-5 h-5 md:w-6 md:h-6" /></div><h3 className="font-black text-slate-800 uppercase tracking-tighter text-sm md:text-base">Bảo mật tài khoản</h3></div><div className="space-y-4"><div className="space-y-2"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu mới</label><div className="relative group"><input type={showPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full pl-4 pr-10 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-sm font-bold" placeholder="Nhập mật khẩu mới..."/><button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div><div className="space-y-2"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Xác nhận mật khẩu</label><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-4 py-2.5 md:py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-sm font-bold" placeholder="Xác nhận lại mật khẩu..."/></div><Button className="w-full py-3 md:py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-slate-200 text-xs md:text-sm" onClick={handleChangePassword} disabled={isUpdatingPassword || !newPassword || !confirmPassword} icon={isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>Cập nhật mật khẩu</Button></div><div className="p-4 bg-orange-50 rounded-2xl border border-orange-100"><div className="flex items-start gap-3"><AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" /><p className="text-[9px] md:text-[10px] text-orange-800 font-medium leading-relaxed uppercase tracking-tighter">Ghi chú: Vui lòng lưu lại mật khẩu mới ở nơi an toàn. Bạn sẽ cần sử dụng nó cho lần đăng nhập tiếp theo.</p></div></div></div></div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
