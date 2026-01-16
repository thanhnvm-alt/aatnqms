import React, { useState, useRef, useMemo } from 'react';
import { User, UserRole, ModuleId } from '../types';
import { ALL_MODULES } from '../constants';
import { Button } from './Button';
import { 
  Edit2, 
  Trash2, 
  X, 
  Shield, 
  User as UserIcon, 
  Save, 
  Briefcase, 
  MapPin, 
  Calendar, 
  GraduationCap, 
  StickyNote, 
  Camera, 
  Loader2, 
  Search, 
  ShieldCheck, 
  CheckSquare, 
  Square, 
  FileDown, 
  FileUp, 
  UserPlus, 
  Mail, 
  Info,
  ChevronDown,
  Hash
} from 'lucide-react';
// @ts-ignore
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

interface UserManagementProps {
  users: User[];
  onAddUser: (user: User) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onImportUsers?: (users: User[]) => Promise<void>;
}

export const UserManagement: React.FC<UserManagementProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser, onImportUsers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    username: '',
    password: '',
    role: 'QC',
    allowedModules: [],
    avatar: '',
    msnv: '',
    position: '',
    workLocation: '',
    status: 'Đang làm việc',
    joinDate: '',
    education: '',
    notes: ''
  });

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getAvatarBg = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-sky-600 shadow-sky-100';
      case 'MANAGER': return 'bg-indigo-600 shadow-indigo-100';
      case 'QA': return 'bg-teal-500 shadow-teal-100';
      case 'QC': return 'bg-emerald-500 shadow-emerald-100';
      default: return 'bg-rose-500 shadow-rose-100';
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const name = (u.name || '').toLowerCase();
      const username = (u.username || '').toLowerCase();
      const msnv = (u.msnv || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || name.includes(term) || username.includes(term) || msnv.includes(term);
      const matchesRole = filterRole === 'ALL' || u.role === filterRole;
      const matchesStatus = filterStatus === 'ALL' || u.status === filterStatus;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, filterRole, filterStatus]);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ ...user }); 
    } else {
      setEditingUser(null);
      setFormData({
        name: '', username: '', password: '', role: 'QC', allowedModules: ['PQC'],
        msnv: '', position: '', workLocation: '', status: 'Đang làm việc',
        joinDate: new Date().toISOString().split('T')[0], education: '', notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.username || !formData.name || !formData.role) {
      alert("Vui lòng điền đủ thông tin bắt buộc (*)");
      return;
    }
    setIsSaving(true);
    try {
        const userData: User = {
          id: editingUser ? editingUser.id : `user_${Date.now()}`,
          username: formData.username!,
          name: formData.name!,
          role: formData.role as UserRole,
          password: formData.password || (editingUser ? editingUser.password : '123456'),
          avatar: formData.avatar || '',
          allowedModules: formData.allowedModules || [],
          msnv: formData.msnv,
          position: formData.position,
          workLocation: formData.workLocation,
          status: formData.status,
          joinDate: formData.joinDate,
          education: formData.education,
          notes: formData.notes
        };
        if (editingUser) await onUpdateUser(userData);
        else await onAddUser(userData);
        setIsModalOpen(false);
    } catch (e) {
        console.error("Save user failed:", e);
        alert("Lỗi khi lưu người dùng.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = users.map(u => ({
      'MÃ NV': u.msnv || '',
      'HỌ VÀ TÊN': u.name,
      'Tên Đăng Nhập': u.username,
      'Vai Trò': u.role,
      'Chức Vụ': u.position || '',
      'Tình Trạng': u.status || 'Đang làm việc'
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, `AATN_Users_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onImportUsers) return;

      setIsImporting(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const wsname = wb.SheetNames[0];
              const ws = wb.Sheets[wsname];
              const data = XLSX.utils.sheet_to_json(ws);

              const importedUsers: User[] = data.map((row: any) => ({
                  id: `user_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
                  msnv: String(row['MÃ NV'] || ''),
                  name: String(row['HỌ VÀ TÊN'] || ''),
                  username: String(row['Tên Đăng Nhập'] || row['username'] || '').toLowerCase().trim(),
                  role: (row['Vai Trò'] || 'QC') as UserRole,
                  position: String(row['Chức Vụ'] || ''),
                  status: String(row['Tình Trạng'] || 'Đang làm việc'),
                  password: '123', // Mặc định
                  avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(row['HỌ VÀ TÊN'] || 'U')}&background=random&color=fff`,
                  allowedModules: ['PQC']
              })).filter(u => u.username && u.name);

              if (importedUsers.length > 0) {
                  await onImportUsers(importedUsers);
                  alert(`Đã nhập thành công ${importedUsers.length} nhân sự.`);
              } else {
                  alert("Không tìm thấy dữ liệu hợp lệ trong file.");
              }
          } catch (error) {
              console.error("Excel import error:", error);
              alert("Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.");
          } finally {
              setIsImporting(false);
              if (excelImportRef.current) excelImportRef.current.value = '';
          }
      };
      reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      {/* TOOLBAR */}
      <div className="bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg">
                <UserIcon className="w-6 h-6" />
            </div>
            <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Nhân sự Hệ thống</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ISO Competence Records</p>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Tìm tên, mã, username..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all" />
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => excelImportRef.current?.click()} 
                    disabled={isImporting}
                    className="p-2.5 bg-white text-slate-500 rounded-xl border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center justify-center disabled:opacity-50"
                    title="Nhập từ Excel"
                >
                    {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                </button>
                <button 
                    onClick={handleExportExcel} 
                    className="p-2.5 bg-white text-slate-500 rounded-xl border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                    title="Xuất ra Excel"
                >
                    <FileDown className="w-5 h-5" />
                </button>
            </div>
            <Button onClick={() => handleOpenModal()} icon={<UserPlus className="w-4 h-4" />} className="bg-blue-600 shadow-lg shadow-blue-200 font-black px-6 text-xs flex-1 lg:flex-none">THÊM MỚI</Button>
        </div>
      </div>

      <input type="file" ref={excelImportRef} className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />

      {/* USER LIST - MATCHING IMAGE DESIGN */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Nhân sự</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Mã NV</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Chức vụ</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Vai trò</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">Trạng thái</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Thao tác</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map((u) => (
                      <tr key={u.id} className="group hover:bg-slate-50/80 transition-all cursor-pointer">
                          <td className="px-8 py-5">
                              <div className="flex items-center gap-4">
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-sm shadow-lg shrink-0 ${getAvatarBg(u.role as string)}`}>
                                      {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover rounded-full" alt=""/> : getInitials(u.name)}
                                  </div>
                                  <div className="overflow-hidden">
                                      <p className="font-black text-slate-800 text-[13px] uppercase tracking-tight truncate">{u.name}</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">@{u.username}</p>
                                  </div>
                              </div>
                          </td>
                          <td className="px-6 py-5 text-center">
                              <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 text-[10px] font-mono font-bold">
                                  {u.msnv || '---'}
                              </span>
                          </td>
                          <td className="px-6 py-5">
                              <p className="text-[11px] font-black text-slate-600 uppercase tracking-tighter">
                                  {u.position || 'Nhân viên'}
                              </p>
                          </td>
                          <td className="px-6 py-5 text-center">
                              <span className={`inline-block px-4 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                                  u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                  u.role === 'MANAGER' ? 'bg-blue-600 text-white border-blue-600' :
                                  'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                  {u.role}
                              </span>
                          </td>
                          <td className="px-6 py-5 text-center">
                              <span className="inline-block px-4 py-1 bg-green-50 text-green-600 rounded-full border border-green-200 text-[9px] font-black uppercase tracking-tighter">
                                  {u.status || 'Đang làm việc'}
                              </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleOpenModal(u)} className="p-2 text-blue-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-blue-100 transition-all"><Edit2 className="w-4 h-4"/></button>
                                  <button onClick={() => onDeleteUser(u.id)} disabled={u.username === 'admin'} className="p-2 text-red-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-red-100 transition-all disabled:opacity-20"><Trash2 className="w-4 h-4"/></button>
                              </div>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
          {filteredUsers.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                  <UserIcon className="w-16 h-16 opacity-10 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">Không tìm thấy dữ liệu</p>
              </div>
          )}
      </div>

      {/* DETAILED USER MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg">
                              <UserPlus className="w-5 h-5" />
                          </div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg">
                              {editingUser ? 'Cập nhật hồ sơ nhân sự' : 'Đăng ký nhân sự mới'}
                          </h3>
                      </div>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500 transition-colors active:scale-90"><X className="w-7 h-7"/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-slate-50/30">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          {/* Avatar & Basic */}
                          <div className="space-y-6 flex flex-col items-center">
                              <div className="w-32 h-32 rounded-[2rem] border-4 border-white shadow-2xl overflow-hidden relative group bg-slate-200">
                                  <img src={formData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'New')}&background=random&color=fff`} className="w-full h-full object-cover" alt="" />
                                  <button onClick={() => avatarInputRef.current?.click()} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="w-8 h-8"/></button>
                              </div>
                              <div className="w-full space-y-4">
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mã nhân viên (MSNV)</label>
                                      <input value={formData.msnv} onChange={e => setFormData({...formData, msnv: e.target.value.toUpperCase()})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm uppercase outline-none focus:ring-4 ring-blue-100" placeholder="AA-XXXX" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Trạng thái</label>
                                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm uppercase outline-none focus:ring-4 ring-blue-100">
                                          <option value="Đang làm việc">Đang làm việc</option>
                                          <option value="Nghỉ phép">Nghỉ phép</option>
                                          <option value="Đã nghỉ việc">Đã nghỉ việc</option>
                                      </select>
                                  </div>
                              </div>
                          </div>

                          {/* Info Grid */}
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-1 md:col-span-2">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><UserIcon className="w-3 h-3"/> Họ và tên *</label>
                                  <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-black text-sm uppercase outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="VD: NGUYỄN VĂN A" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Mail className="w-3 h-3"/> Tên đăng nhập *</label>
                                  <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm disabled:bg-slate-50 disabled:text-slate-400" disabled={!!editingUser} placeholder="username" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Shield className="w-3 h-3"/> Mật khẩu</label>
                                  <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder={editingUser ? "Bỏ trống để giữ nguyên" : "Mặc định: 123456"} />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Briefcase className="w-3 h-3"/> Chức vụ</label>
                                  <input value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="VD: QC Trưởng" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><MapPin className="w-3 h-3"/> Nơi làm việc</label>
                                  <input value={formData.workLocation} onChange={e => setFormData({...formData, workLocation: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="Nhà máy / Hiện trường" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vai trò hệ thống</label>
                                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase outline-none shadow-sm appearance-none cursor-pointer">
                                      <option value="QC">QC Inspector</option>
                                      <option value="QA">QA Staff</option>
                                      <option value="MANAGER">Manager</option>
                                      <option value="ADMIN">System Admin</option>
                                  </select>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Calendar className="w-3 h-3"/> Ngày nhận việc</label>
                                  <input type="date" value={formData.joinDate} onChange={e => setFormData({...formData, joinDate: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" />
                              </div>
                          </div>
                      </div>

                      {/* Access Matrix */}
                      <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-blue-600"/> Phân quyền Module truy cập</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {ALL_MODULES.map(m => {
                                  const isActive = formData.allowedModules?.includes(m.id);
                                  return (
                                    <button key={m.id} onClick={() => setFormData(prev => { const current = prev.allowedModules || []; return { ...prev, allowedModules: isActive ? current.filter(id => id !== m.id) : [...current, m.id] }; })} className={`px-4 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-tight transition-all flex items-center justify-between group ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400'}`}>
                                        <span className="truncate">{m.label}</span>
                                        {isActive ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 opacity-30 group-hover:opacity-100" />}
                                    </button>
                                  );
                              })}
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><StickyNote className="w-4 h-4 text-slate-300"/> Ghi chú nội bộ (Audit Logs)</label>
                          <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-3xl font-medium text-xs outline-none h-28 focus:ring-4 ring-blue-100 shadow-inner" placeholder="Thông tin kỹ năng, đào tạo, đánh giá chuyên môn..." />
                      </div>
                  </div>

                  <div className="p-6 md:p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsModalOpen(false)} className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSave} disabled={isSaving} className="order-1 md:order-2 px-16 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 active:scale-95 flex items-center justify-center gap-3 transition-all">
                          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          Lưu hồ sơ nhân sự
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if(file){ const r = new FileReader(); r.onloadend = () => setFormData(prev => ({...prev, avatar: r.result as string})); r.readAsDataURL(file); } }} />
    </div>
  );
};