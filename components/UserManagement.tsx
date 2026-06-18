import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { User, UserRole, ModuleId, Role, hasPermission } from '../types';
import { ALL_MODULES } from '../constants';
import { Button } from './Button';
import { saveRole } from '../services/apiService';
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
  Hash,
  AlertCircle,
  Clock,
  Activity,
  Building,
  Filter
} from 'lucide-react';
import { UserActivityList } from './UserActivityList';
import { SearchableSelect } from './SearchableSelect';

export function getLocalAdvisoryModules(phong_ban: string, bo_phan: string): string[] {
    const pb = (phong_ban || '').trim().toLowerCase();
    const bp = (bo_phan || '').trim().toLowerCase();

    if (pb.includes('qaqc') || pb.includes('qa/qc') || pb.includes('qa qc')) {
        if (bp.includes('qa')) {
            return ['FQC', 'SPR', 'SITE'];
        }
        if (bp.includes('qc')) {
            return ['IQC', 'SQC_MAT', 'SQC_BTP', 'PQC', 'FSR', 'STEP'];
        }
    } else if (pb.includes('sản xuất') || pb.includes('san xuat')) {
        return ['PQC', 'SQC_BTP', 'STEP'];
    } else if (pb.includes('vật tư') || pb.includes('vat tu')) {
        return ['IQC', 'SQC_MAT'];
    } else if (pb.includes('sd') || pb.includes('drawing') || pb.includes('thiết kế') || pb.includes('thiet ke')) {
        return ['CONVERT_3D', 'FSR', 'SPR'];
    } else if (pb.includes('kế hoạch') || pb.includes('ke hoach') || pb.includes('planning')) {
        return ['IQC', 'PQC', 'SITE'];
    }
    return [];
}

interface UserManagementProps {
  currentUser: User;
  users: User[];
  roles?: Role[];
  onAddUser: (user: User) => Promise<void>;
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onImportUsers?: (users: User[]) => Promise<void>;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, users, roles = [], onAddUser, onUpdateUser, onDeleteUser, onImportUsers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [departments, setDepartments] = useState<{ id: string; name: string; divisions: string[] }[]>([]);
  const [divisionsState, setDivisionsState] = useState<{ id: string; name: string; departmentId: string }[]>([]);
  const [teamsState, setTeamsState] = useState<{ id: string; name: string; divisionId: string; leaderId?: string }[]>([]);
  const [selectedActUserId, setSelectedActUserId] = useState<string | null>(null);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('aatn_qms_token');
    fetch('/api/departments', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
      .then(res => {
        if (res.ok) return res.json();
        return [];
      })
      .then(data => {
        setDepartments(data);
      })
      .catch(err => console.error('Error fetching departments in UserManagement:', err));

    fetch('/api/divisions', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => setDivisionsState(data))
      .catch(err => console.error('Error fetching divisions in UserManagement:', err));

    fetch('/api/teams', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => setTeamsState(data))
      .catch(err => console.error('Error fetching teams in UserManagement:', err));
  }, []);

  const handleCommitSearch = () => {
    setSearchTerm(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };
  
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPosition, setFilterPosition] = useState<string[]>([]);
  const [filterDepartment, setFilterDepartment] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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
    email: '',
    position: '',
    workLocation: '',
    status: 'Đang làm việc',
    joinDate: '',
    education: '',
    notes: '',
    phong_ban: '',
    bo_phan: '',
    to_qc: '',
    la_to_truong: false
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

  const getRoleDisplayName = (rVal: string) => {
    const match = roles?.find(r => r.id === rVal || r.name === rVal);
    if (match) return match.name;
    if (rVal === 'ADMIN') return 'SYSTEM ADMIN';
    if (rVal === 'MANAGER') return 'MANAGER';
    if (rVal === 'QA') return 'QA STAFF';
    if (rVal === 'QC') return 'QC INSPECTOR';
    return rVal;
  };

  const getRoleBadgeStyle = (rVal: string) => {
    if (rVal === 'ADMIN') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (rVal === 'MANAGER') return 'bg-blue-600 text-white border-blue-600';
    if (rVal === 'QA') return 'bg-teal-500 text-white border-teal-600';
    if (rVal === 'QC') return 'bg-emerald-500 text-white border-emerald-600';
    return 'bg-blue-50 dark:bg-slate-800/80 text-blue-700 border-blue-200 dark:border-slate-700';
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const name = (u.name || '').toLowerCase();
      const username = (u.username || '').toLowerCase();
      const msnv = (u.msnv || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || name.includes(term) || username.includes(term) || msnv.includes(term);
      const pos = u.position || 'Nhân viên';
      const matchesPosition = filterPosition.length === 0 || filterPosition.includes(pos);
      const uDept = u.phong_ban || (u as any).phongBan || 'Chưa gán bộ phận';
      const matchesDepartment = filterDepartment.length === 0 || filterDepartment.includes(uDept);
      const stat = u.status || 'Đang làm việc';
      const matchesStatus = filterStatus.length === 0 || filterStatus.includes(stat);
      return matchesSearch && matchesPosition && matchesDepartment && matchesStatus;
    });
  }, [users, searchTerm, filterPosition, filterDepartment, filterStatus]);

  const uniquePositions = useMemo(() => Array.from(new Set(users.map(u => u.position || 'Nhân viên'))).filter(Boolean).sort(), [users]);
  const uniqueDepartments = useMemo(() => Array.from(new Set(users.map(u => u.phong_ban || (u as any).phongBan || 'Chưa gán bộ phận'))).filter(Boolean).sort(), [users]);
  const uniqueStatuses = useMemo(() => Array.from(new Set(users.map(u => u.status || 'Đang làm việc'))).filter(Boolean).sort(), [users]);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ 
        ...user,
        phong_ban: user.phong_ban || (user as any).phongBan || '',
        bo_phan: user.bo_phan || (user as any).boPhan || '',
        workLocation: user.workLocation || (user as any).work_location || '',
        joinDate: user.joinDate || (user as any).join_date || '',
        to_qc: user.to_qc || '',
        la_to_truong: !!user.la_to_truong,
        department_id: (user as any).department_id || (user as any).departmentId || '',
        division_id: (user as any).division_id || (user as any).divisionId || '',
        team_id: (user as any).team_id || (user as any).teamId || '',
        userPermissions: (user as any).userPermissions || (user as any).user_permissions || []
      }); 
    } else {
      setEditingUser(null);
      setFormData({
        name: '', username: '', password: '', role: 'QC', allowedModules: [],
        msnv: '', email: '', position: '', workLocation: '', status: 'Đang làm việc',
        joinDate: new Date().toISOString().split('T')[0], education: '', notes: '',
        phong_ban: '', bo_phan: '',
        to_qc: '', la_to_truong: false,
        department_id: '', division_id: '', team_id: '', userPermissions: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.username || !formData.name) {
      alert("Vui lòng điền đủ thông tin bắt buộc (*)");
      return;
    }
    setIsSaving(true);
    try {
        const userData: any = {
          id: editingUser ? editingUser.id : `user_${Date.now()}`,
          username: formData.username!,
          name: formData.name!,
          role: (formData.username?.toLowerCase() === 'admin' || (editingUser && editingUser.role === 'ADMIN')) ? 'ADMIN' : 'USER',
          password: formData.password || (editingUser ? editingUser.password : '123456'),
          avatar: formData.avatar || '',
          allowedModules: formData.allowedModules || [],
          msnv: formData.msnv,
          email: formData.email,
          position: formData.position,
          workLocation: formData.workLocation,
          status: formData.status,
          joinDate: formData.joinDate,
          education: formData.education,
          notes: formData.notes,
          phong_ban: formData.phong_ban || (formData as any).phongBan || '',
          bo_phan: formData.bo_phan || (formData as any).boPhan || '',
          to_qc: formData.to_qc || '',
          la_to_truong: !!formData.la_to_truong,
          department_id: formData.department_id || '',
          division_id: formData.division_id || '',
          team_id: formData.team_id || '',
          user_permissions: (formData as any).userPermissions || []
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
    if (!XLSX) return alert("Thư viện Excel chưa sẵn sàng.");
    const exportData = users.map(u => ({
      'MÃ NV': u.msnv || '',
      'EMAIL': u.email || '',
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
      if (!file || !onImportUsers) {
          if (!onImportUsers) console.warn("onImportUsers handler is missing in props");
          return;
      }
      if (!XLSX) return alert("Hệ thống đang tải thư viện Excel, vui lòng đợi giây lát.");

      setIsImporting(true);
      const reader = new FileReader();
      
      reader.onload = async (evt) => {
          try {
              const data = new Uint8Array(evt.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              const sheet = workbook.Sheets[sheetName];
              const json = XLSX.utils.sheet_to_json(sheet);

              if (json.length === 0) {
                  alert("File Excel không có dữ liệu hoặc định dạng không đúng.");
                  setIsImporting(false);
                  return;
              }

              // Mapping logic with flexible key finding
              const importedUsers = json.map((row: any): User | null => {
                  const findVal = (possibleKeys: string[]) => {
                      const keys = Object.keys(row);
                      for (const pk of possibleKeys) {
                          const match = keys.find(k => k.trim().toLowerCase() === pk.toLowerCase());
                          if (match) return row[match];
                      }
                      return '';
                  };

                  const name = String(findVal(['HỌ VÀ TÊN', 'Họ Tên', 'Name', 'FullName', 'Họ và tên'])).trim();
                  const username = String(findVal(['Tên Đăng Nhập', 'username', 'User', 'Tên', 'Acc'])).toLowerCase().trim();
                  
                  if (!name || !username) return null;

                  const role = String(findVal(['Vai Trò', 'Role', 'Quyền']) || 'QC').toUpperCase();
                  const validRoles: UserRole[] = ['ADMIN', 'MANAGER', 'QC', 'QA'];
                  const finalRole = validRoles.includes(role as any) ? role as UserRole : 'QC';

                  return {
                      id: `user_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
                      msnv: String(findVal(['MÃ NV', 'MSNV', 'Mã nhân viên', 'StaffCode']) || ''),
                      email: String(findVal(['EMAIL', 'Thư điện tử', 'Mail']) || ''),
                      name: name,
                      username: username,
                      role: finalRole,
                      position: String(findVal(['Chức Vụ', 'Position', 'Chức danh', 'Job']) || 'Nhân viên'),
                      status: String(findVal(['Tình Trạng', 'Trạng Thái', 'Status']) || 'Đang làm việc'),
                      password: '123', 
                      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`,
                      allowedModules: ['PQC', 'IQC', 'SITE'] as ModuleId[]
                  };
              }).filter((u): u is User => u !== null);

              if (importedUsers.length > 0) {
                  await onImportUsers(importedUsers);
                  alert(`Đã nhập thành công ${importedUsers.length} nhân sự vào hệ thống.`);
              } else {
                  alert("Không tìm thấy dữ liệu hợp lệ. Vui lòng kiểm tra tiêu đề các cột: HỌ VÀ TÊN, Tên Đăng Nhập.");
              }
          } catch (error) {
              console.error("Excel import error:", error);
              alert("Lỗi khi xử lý file Excel. Hãy chắc chắn file không bị mật khẩu bảo vệ.");
          } finally {
              setIsImporting(false);
              if (excelImportRef.current) excelImportRef.current.value = '';
          }
      };

      reader.onerror = () => {
          alert("Lỗi khi đọc file từ thiết bị.");
          setIsImporting(false);
      };

      reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300 pb-20 md:pb-0">
      {/* TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="p-1.5 bg-blue-600 text-white rounded-md shadow">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Nhân sự Hệ thống</h3>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">ISO Competence Records</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto relative">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <input type="text" placeholder="Tìm kiếm nhân sự..." value={searchInput} onChange={e => setSearchInput(e.target.value)} onBlur={handleCommitSearch} onKeyDown={handleKeyDown} className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/10 transition-all" />
          </div>
          
          <div className="relative">
             <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                className={`p-1.5 rounded-md border transition-all shadow-sm flex items-center justify-center relative ${isFilterOpen || filterPosition.length > 0 || filterDepartment.length > 0 || filterStatus.length > 0 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95'}`}
             >
                <Filter className="w-4 h-4" />
                {(filterPosition.length > 0 || filterDepartment.length > 0 || filterStatus.length > 0) && (
                   <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                )}
             </button>
             {isFilterOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />
                   <div className="absolute right-0 top-full mt-2 w-[320px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 p-3 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
                       <SearchableSelect 
                           className="z-[60]"
                           label="Chức vụ" 
                           options={uniquePositions} 
                           values={filterPosition} 
                           onChange={setFilterPosition} 
                       />
                       <SearchableSelect 
                           className="z-[50]"
                           label="Phòng ban / Bộ phận" 
                           options={uniqueDepartments} 
                           values={filterDepartment} 
                           onChange={setFilterDepartment} 
                       />
                       <SearchableSelect 
                           className="z-[40]"
                           label="Trạng thái" 
                           options={uniqueStatuses} 
                           values={filterStatus} 
                           onChange={setFilterStatus} 
                       />
                       <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                           <button onClick={() => { setFilterPosition([]); setFilterDepartment([]); setFilterStatus([]); }} className="text-[10px] uppercase font-black text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                               Xóa bộ lọc
                           </button>
                       </div>
                   </div>
                 </>
             )}
          </div>
          {(hasPermission(currentUser, roles, 'SETTINGS_USERS', 'IMPORT') || hasPermission(currentUser, roles, 'SETTINGS_USERS', 'EXPORT')) && (
            <div className="flex items-center gap-1.5">
              {hasPermission(currentUser, roles, 'SETTINGS_USERS', 'IMPORT') && (
                <button 
                  onClick={() => excelImportRef.current?.click()} 
                  disabled={isImporting}
                  className={`p-1.5 rounded-md border transition-all shadow-sm flex items-center justify-center ${isImporting ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-slate-700' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-95'}`}
                  title="Nhập từ Excel"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                </button>
              )}
              {hasPermission(currentUser, roles, 'SETTINGS_USERS', 'EXPORT') && (
                <button 
                  onClick={handleExportExcel} 
                  className="p-1.5 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                  title="Xuất ra Excel"
                >
                  <FileDown className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <Button onClick={() => handleOpenModal()} icon={<UserPlus className="w-3.5 h-3.5" />} className="bg-blue-600 hover:bg-blue-750 font-black px-3.5 py-1.5 rounded-md text-[10px] uppercase flex-1 sm:flex-none">Thêm mới</Button>
        </div>
      </div>

      <input type="file" ref={excelImportRef} className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />

      {/* USER LIST & HIGH DENSITY DUST TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                      <th className="px-3 py-1.5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nhân sự</th>
                      <th className="px-3 py-1.5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Mã NV</th>
                      <th className="px-3 py-1.5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chức vụ / Phòng ban</th>
                      <th className="px-3 py-1.5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Trạng thái</th>
                      <th className="px-3 py-1.5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Thao tác</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                  {filteredUsers.map((u) => (
                      <tr key={u.id} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-all text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow-sm shrink-0 ${getAvatarBg(u.role as string)}`}>
                                      {u.avatar ? <img src={getProxyImageUrl(u.avatar)} className="w-full h-full object-cover rounded-full" alt=""/> : getInitials(u.name)}
                                  </div>
                                  <div className="overflow-hidden">
                                      <p className="font-bold text-slate-900 dark:text-slate-100 text-[11px] uppercase tracking-tight truncate leading-tight">{u.name}</p>
                                      <p className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider leading-none mt-0.5">@{u.username} {u.email ? `• ${u.email}` : ''}</p>
                                  </div>
                              </div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                              <span className="inline-block px-1.5 py-0.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-md border border-blue-100 dark:border-slate-700 text-[9px] font-mono font-bold leading-none">
                                  {u.msnv || '---'}
                              </span>
                          </td>
                          <td className="px-3 py-1.5">
                              <div>
                                  <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight uppercase text-[10px]">{u.position || 'Nhân viên'}</p>
                                  <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase leading-none mt-0.5">{u.phong_ban || 'Chưa gán bộ phận'}</p>
                                  {u.to_qc && (
                                      <div className="flex flex-wrap items-center gap-1 mt-1">
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/40 uppercase leading-none">Tổ: {u.to_qc}</span>
                                          {u.la_to_truong && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-150 dark:border-amber-900/40 uppercase leading-none">Tổ trưởng ⭐</span>}
                                      </div>
                                  )}
                              </div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-tight leading-none ${
                                  u.status === 'Đang làm việc' ? 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-500 border-green-150 dark:border-green-900/30' : 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-150'
                              }`}>
                                  {u.status || 'Đang làm việc'}
                              </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => { setSelectedActUserId(u.id); setIsActivityOpen(true); }} className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 hover:bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700/60 active:scale-90 transition-all" title="Nhật ký hoạt động"><Clock className="w-3.5 h-3.5"/></button>
                                  <button onClick={() => handleOpenModal(u)} className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 hover:bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700/60 active:scale-90 transition-all"><Edit2 className="w-3.5 h-3.5"/></button>
                                  <button onClick={() => onDeleteUser(u.id)} disabled={u.username === 'admin'} className="p-1 text-slate-400 hover:text-red-500 bg-slate-50 dark:bg-slate-800 hover:bg-white rounded-md border border-slate-200 dark:border-slate-700/60 disabled:opacity-25 active:scale-90 transition-all"><Trash2 className="w-3.5 h-3.5"/></button>
                              </div>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
          {filteredUsers.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <UserIcon className="w-10 h-10 opacity-20 mb-2" />
                  <p className="text-[9px] font-bold uppercase tracking-wider">Không tìm thấy dữ liệu nhân sự</p>
              </div>
          )}
      </div>

      {/* DETAILED USER MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg">
                              <UserPlus className="w-5 h-5" />
                          </div>
                          <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-lg">
                              {editingUser ? 'Cập nhật hồ sơ nhân sự' : 'Đăng ký nhân sự mới'}
                          </h3>
                      </div>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors active:scale-90"><X className="w-7 h-7"/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-slate-50 dark:bg-slate-800/50/30">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          {/* Avatar & Basic */}
                          <div className="space-y-6 flex flex-col items-center">
                              <div className="w-32 h-32 rounded-[2rem] border-4 border-white shadow-2xl overflow-hidden relative group bg-slate-200 dark:bg-slate-700">
                                  <img src={getProxyImageUrl(formData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'New')}&background=random&color=fff`)} className="w-full h-full object-cover" alt="" />
                                  <button onClick={() => avatarInputRef.current?.click()} className="absolute inset-0 bg-black/40 text-white md:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="w-8 h-8"/></button>
                              </div>
                              <div className="w-full space-y-4">
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Mã nhân viên (MSNV)</label>
                                      <input value={formData.msnv || ''} onChange={e => setFormData({...formData, msnv: e.target.value.toUpperCase()})} className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm uppercase outline-none focus:ring-4 ring-blue-100" placeholder="AA-XXXX" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Trạng thái</label>
                                      <select value={formData.status || 'Đang làm việc'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm uppercase outline-none focus:ring-4 ring-blue-100">
                                          <option key="status-working" value="Đang làm việc">Đang làm việc</option>
                                          <option key="status-leave" value="Nghỉ phép">Nghỉ phép</option>
                                          <option key="status-quit" value="Đã nghỉ việc">Đã nghỉ việc</option>
                                      </select>
                                  </div>
                              </div>
                          </div>

                          {/* Info Grid */}
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-1 md:col-span-2">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><UserIcon className="w-3 h-3"/> Họ và tên *</label>
                                  <input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-sm uppercase outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="VD: NGUYỄN VĂN A" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Mail className="w-3 h-3"/> Tên đăng nhập *</label>
                                  <input value={formData.username || ''} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm disabled:bg-slate-50 dark:bg-slate-800/50 disabled:text-slate-400 dark:text-slate-500" disabled={!!editingUser} placeholder="username" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Mail className="w-3 h-3"/> Email</label>
                                  <input value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="email@example.com" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Shield className="w-3 h-3"/> Mật khẩu</label>
                                  <input type="password" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder={editingUser ? "Bỏ trống để giữ nguyên" : "Mặc định: 123456"} />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Briefcase className="w-3 h-3"/> Chức vụ *</label>
                                  <select 
                                      value={['GIÁM ĐỐC', 'TRƯỞNG PHÒNG', 'TRƯỞNG BỘ PHẬN', 'TỔ TRƯỞNG', 'NHÂN VIÊN'].includes(String(formData.position).toUpperCase()) ? String(formData.position).toUpperCase() : (formData.position ? 'KHAC' : '')} 
                                      onChange={e => {
                                          const val = e.target.value;
                                          if (val === 'KHAC') {
                                              setFormData({...formData, position: 'Chức vụ mới'});
                                          } else {
                                              setFormData({...formData, position: val, la_to_truong: val === 'TỔ TRƯỞNG' ? true : formData.la_to_truong});
                                          }
                                      }}
                                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                  >
                                      <option value="">-- Chọn Chức vụ --</option>
                                      <option value="GIÁM ĐỐC">GIÁM ĐỐC</option>
                                      <option value="TRƯỞNG PHÒNG">TRƯỞNG PHÒNG</option>
                                      <option value="TRƯỞNG BỘ PHẬN">TRƯỞNG BỘ PHẬN</option>
                                      <option value="TỔ TRƯỞNG">TỔ TRƯỞNG</option>
                                      <option value="NHÂN VIÊN">NHÂN VIÊN</option>
                                      {formData.position && !['GIÁM ĐỐC', 'TRƯỞNG PHÒNG', 'TRƯỞNG BỘ PHẬN', 'TỔ TRƯỞNG', 'NHÂN VIÊN'].includes(String(formData.position).toUpperCase()) && (
                                          <option value="KHAC">{String(formData.position).toUpperCase()}</option>
                                      )}
                                      <option value="KHAC">+ KHÁC (TỰ NHẬP)...</option>
                                  </select>
                                  
                                  {(!['GIÁM ĐỐC', 'TRƯỞNG PHÒNG', 'TRƯỞNG BỘ PHẬN', 'TỔ TRƯỞNG', 'NHÂN VIÊN'].includes(String(formData.position).toUpperCase()) || formData.position === 'Chức vụ mới') && (
                                      <input 
                                          type="text" 
                                          value={formData.position || ''} 
                                          onChange={e => {
                                              const newPos = e.target.value;
                                              setFormData({
                                                  ...formData, 
                                                  position: newPos,
                                                  la_to_truong: newPos.toUpperCase() === 'TỔ TRƯỞNG' ? true : formData.la_to_truong
                                              });
                                          }} 
                                          className="mt-1.5 w-full px-4 py-2 text-xs font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2"
                                          placeholder="Nhập chức vụ mới..."
                                      />
                                  )}
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><MapPin className="w-3 h-3"/> Nơi làm việc</label>
                                  <input value={formData.workLocation || ''} onChange={e => setFormData({...formData, workLocation: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="Nhà máy / Hiện trường" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Building className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Phòng ban</label>
                                  <select 
                                      value={formData.department_id || ''} 
                                      onChange={e => {
                                          const deptId = e.target.value;
                                          const deptObj = departments.find(d => d.id === deptId);
                                          const pbStr = deptObj ? deptObj.name : '';
                                          
                                          setFormData(prev => ({
                                              ...prev,
                                              department_id: deptId,
                                              phong_ban: pbStr,
                                              phongBan: pbStr,
                                              division_id: '',
                                              bo_phan: '',
                                              boPhan: '',
                                              team_id: '',
                                              to_qc: '',
                                              toQC: ''
                                          }));
                                      }}
                                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                  >
                                      <option value="">-- Chọn Phòng ban --</option>
                                      {departments.map(d => (
                                          <option key={d.id} value={d.id}>{d.name}</option>
                                      ))}
                                  </select>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Building className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Bộ phận</label>
                                  <select 
                                      value={formData.division_id || ''} 
                                      onChange={e => {
                                          const divId = e.target.value;
                                          const divObj = divisionsState.find(d => d.id === divId);
                                          const bpStr = divObj ? divObj.name : '';
                                          
                                          setFormData(prev => ({
                                              ...prev,
                                              division_id: divId,
                                              bo_phan: bpStr,
                                              boPhan: bpStr,
                                              team_id: '',
                                              to_qc: '',
                                              toQC: ''
                                          }));
                                      }}
                                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                      disabled={!formData.department_id}
                                  >
                                      <option value="">-- Chọn Bộ phận --</option>
                                      {divisionsState.filter(div => div.departmentId === formData.department_id).map(div => (
                                          <option key={div.id} value={div.id}>{div.name}</option>
                                      ))}
                                  </select>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Building className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Tổ (Team)</label>
                                  <select 
                                      value={formData.team_id || ''} 
                                      onChange={e => {
                                          const teamId = e.target.value;
                                          const teamObj = teamsState.find(t => t.id === teamId);
                                          const tmStr = teamObj ? teamObj.name : '';
                                          const isLeaderOfThisTeam = teamObj?.leaderId === formData.id;
                                          
                                          setFormData(prev => ({
                                              ...prev,
                                              team_id: teamId,
                                              to_qc: tmStr,
                                              toQC: tmStr,
                                              la_to_truong: isLeaderOfThisTeam || prev.la_to_truong,
                                              position: isLeaderOfThisTeam ? 'TỔ TRƯỞNG' : prev.position
                                          }));
                                      }}
                                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                      disabled={!formData.division_id}
                                  >
                                      <option value="">-- Chọn Tổ --</option>
                                      {teamsState.filter(team => team.divisionId === formData.division_id).map(team => (
                                          <option key={team.id} value={team.id}>{team.name}</option>
                                      ))}
                                  </select>
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Calendar className="w-3 h-3"/> Ngày nhận việc</label>
                                  <input type="date" value={formData.joinDate || ''} onChange={e => setFormData({...formData, joinDate: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><UserIcon className="w-3 h-3 text-slate-400" /> Tổ QC</label>
                                  <input value={formData.to_qc || ''} onChange={e => setFormData({...formData, to_qc: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="Ví dụ: Tổ 1 - Sơn bóng" />
                              </div>
                              <div className="space-y-1 flex items-center pt-5">
                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                      <input type="checkbox" checked={!!formData.la_to_truong} onChange={e => setFormData({...formData, la_to_truong: e.target.checked})} className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-900 border-slate-300 rounded focus:ring-blue-500" />
                                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Là Tổ trưởng (Team Leader)</span>
                                  </label>
                              </div>
                          </div>
                      </div>

                      {/* Unified Permissions Matrix */}
                      <div className="space-y-4 p-6 bg-slate-50 dark:bg-slate-800/20 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-inner">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-250 dark:border-slate-800 pb-4">
                              <div className="space-y-1">
                                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                      <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" /> BẢNG MA TRẬN PHÂN QUYỀN HỆ THỐNG (UNIFIED PERMISSION MATRIX)
                                  </label>
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-relaxed">
                                      Ma trận hợp nhất cho phép quản lý đồng thời quyền hiển thị (Truy cập) và các quyền chức năng chi tiết.
                                  </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-[9px] font-black uppercase tracking-wider bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 px-3 py-1.5 rounded-xl shrink-0 shadow-sm">
                                  <div className="flex items-center gap-1.5">
                                      <span className="w-3 h-3 bg-blue-600 rounded"></span>
                                      <span className="text-blue-600 dark:text-blue-400">TRUY CẬP</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                      <span className="w-3 h-3 bg-emerald-600 rounded"></span>
                                      <span className="text-emerald-600 dark:text-emerald-400">CHỨC NĂNG</span>
                                  </div>
                              </div>
                          </div>

                          <div className="space-y-3 overflow-x-auto no-scrollbar pb-4">
                              <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/10">
                                          <th className="py-2 px-2 font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[9px] min-w-[150px]">Phân hệ / Module</th>
                                          <th className="py-2 text-center font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest text-[9px] bg-blue-50/50 dark:bg-blue-950/10 border-x border-slate-100 dark:border-slate-800 w-[60px]">TRUY CẬP</th>
                                          {[
                                              { id: 'VIEW', title: 'VIEW', desc: 'xem' },
                                              { id: 'VIEW_ALL', title: 'VIEW ALL', desc: 'tất cả' },
                                              { id: 'CREATE', title: 'CREATE', desc: 'tạo' },
                                              { id: 'EDIT_OWN', title: 'EDIT', desc: 'tôi' },
                                              { id: 'EDIT_ALL', title: 'EDIT', desc: 'tất cả' },
                                              { id: 'DELETE_OWN', title: 'DELETE', desc: 'tôi' },
                                              { id: 'DELETE_ALL', title: 'DELETE', desc: 'tất cả' },
                                              { id: 'IMPORT', title: 'IMPORT', desc: 'nhập' },
                                              { id: 'EXPORT', title: 'EXPORT', desc: 'xuất' },
                                              { id: 'SIGN1', title: 'SIGN1', desc: 'L1' },
                                              { id: 'SIGN2', title: 'SIGN2', desc: 'L2' }
                                          ].map(act => (
                                              <th key={act.id} className="py-1 px-1 text-center font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter text-[7.5px] border-r border-slate-100 dark:border-slate-800 w-[45px] leading-tight">
                                                  <div className="flex flex-col items-center justify-center min-h-[40px]">
                                                      <span>{act.title}</span>
                                                      <span className="opacity-60 font-normal lowercase italic text-[6.5px]">({act.desc})</span>
                                                  </div>
                                              </th>
                                          ))}
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {(() => {
                                          const MODULES_WITH_ACTIONS = ['IQC', 'SQC_MAT', 'SQC_BTP', 'PQC', 'FSR', 'STEP', 'FQC', 'SPR', 'SITE'];
                                          
                                          // Group ALL_MODULES by m.group
                                          const grouped: Record<string, typeof ALL_MODULES> = {};
                                          ALL_MODULES.forEach(m => {
                                              if (!grouped[m.group]) {
                                                  grouped[m.group] = [];
                                              }
                                              grouped[m.group].push(m);
                                          });

                                          return Object.entries(grouped).map(([groupName, groupModules]) => (
                                              <React.Fragment key={groupName}>
                                                  {/* Group Section Header */}
                                                  <tr className="bg-slate-100/60 dark:bg-slate-800/40">
                                                      <td colSpan={11} className="py-2 px-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[8.5px] border-y border-slate-200/50 dark:border-slate-800/50">
                                                          📁 {groupName}
                                                      </td>
                                                  </tr>
                                                  {groupModules.map(m => {
                                                      const userPermissions = (formData.userPermissions || []) as any[];
                                                      const isAllowed = formData.allowedModules?.includes(m.id) || false;
                                                      const existingPerm = userPermissions.find(p => p.moduleId === m.id);
                                                      const hasActions = MODULES_WITH_ACTIONS.includes(m.id);

                                                      const toggleUserPermission = (action: string) => {
                                                          setFormData(prev => {
                                                              const list = [...(prev.userPermissions || [])];
                                                              const idx = list.findIndex(p => p.moduleId === m.id);
                                                              let newActions: string[] = [];
                                                              if (idx > -1) {
                                                                  const current = list[idx].actions || [];
                                                                  const isChecked = current.includes(action);
                                                                  if (isChecked) {
                                                                      newActions = current.filter((a: string) => a !== action);
                                                                      if (action === 'EDIT_OWN') {
                                                                          newActions = newActions.filter((a: string) => a !== 'EDIT_ALL');
                                                                      }
                                                                      if (action === 'DELETE_OWN') {
                                                                          newActions = newActions.filter((a: string) => a !== 'DELETE_ALL');
                                                                      }
                                                                  } else {
                                                                      newActions = [...current, action];
                                                                      if (action === 'EDIT_ALL' && !newActions.includes('EDIT_OWN')) {
                                                                          newActions.push('EDIT_OWN');
                                                                      }
                                                                      if (action === 'DELETE_ALL' && !newActions.includes('DELETE_OWN')) {
                                                                          newActions.push('DELETE_OWN');
                                                                      }
                                                                  }
                                                                  list[idx] = { ...list[idx], actions: newActions };
                                                              } else {
                                                                  newActions = [action];
                                                                  if (action === 'EDIT_ALL') {
                                                                      newActions.push('EDIT_OWN');
                                                                  }
                                                                  if (action === 'DELETE_ALL') {
                                                                      newActions.push('DELETE_OWN');
                                                                  }
                                                                  list.push({ moduleId: m.id, actions: newActions });
                                                              }
                                                              
                                                              // Clean up empty actions items
                                                              const filteredList = list.filter(p => p.actions.length > 0);
                                                              return { ...prev, userPermissions: filteredList };
                                                          });
                                                      };

                                                      return (
                                                          <tr key={m.id} className="border-b border-slate-150 dark:border-slate-800/60 hover:bg-slate-100/30 dark:hover:bg-slate-800/20">
                                                              <td className="py-2 px-2">
                                                                  <div className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 truncate tracking-tight transition-all" title={m.label}>{m.label}</div>
                                                                  <div className="flex items-center gap-1 mt-0.5">
                                                                      <span className="font-mono text-[7px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1 rounded uppercase tracking-tighter">{m.id}</span>
                                                                  </div>
                                                              </td>
                                                              
                                                              {/* TRUY CẬP Column: QMS Blue brand checkbox */}
                                                              <td className="py-2 text-center bg-blue-50/10 dark:bg-blue-950/5 border-x border-slate-100 dark:border-slate-800 w-[60px]">
                                                                  <div className="flex justify-center">
                                                                      <div 
                                                                          onClick={() => {
                                                                              const current = formData.allowedModules || [];
                                                                              const isCurrentlyAllowed = current.includes(m.id);
                                                                              setFormData(prev => ({
                                                                                  ...prev,
                                                                                  allowedModules: isCurrentlyAllowed 
                                                                                      ? current.filter(id => id !== m.id) 
                                                                                      : [...current, m.id]
                                                                              }));
                                                                          }}
                                                                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${
                                                                              isAllowed 
                                                                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-100/50 dark:shadow-none scale-105' 
                                                                                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-transparent hover:border-blue-400'
                                                                          }`}
                                                                          title={`TRUY CẬP: ${isAllowed ? 'GỠ' : 'GÁN'}`}
                                                                      >
                                                                          {isAllowed ? <CheckSquare className="w-2.5 h-2.5" /> : <div className="w-2.5 h-2.5" />}
                                                                      </div>
                                                                  </div>
                                                              </td>

                                                              {/* Actions Columns: Emerald checkmarks or Blank */}
                                                              {[
                                                                  'VIEW', 'VIEW_ALL', 'CREATE', 
                                                                  'EDIT_OWN', 'EDIT_ALL', 
                                                                  'DELETE_OWN', 'DELETE_ALL', 
                                                                  'IMPORT', 'EXPORT', 
                                                                  'SIGN1', 'SIGN2'
                                                              ].map(act => {
                                                                  if (!hasActions) {
                                                                      return (
                                                                          <td key={act} className="py-2 text-center text-slate-200 dark:text-slate-800 text-[8px] w-[45px]">
                                                                              <span className="select-none inline-block w-4 opacity-30">—</span>
                                                                          </td>
                                                                      );
                                                                  }

                                                                  const isChecked = existingPerm?.actions.includes(act) || false;
                                                                  return (
                                                                      <td key={act} className="py-2 text-center border-r border-slate-50 dark:border-slate-800/30 w-[45px]">
                                                                          <div className="flex justify-center">
                                                                              <div 
                                                                                  onClick={() => {
                                                                                      if (!isAllowed) return;
                                                                                      toggleUserPermission(act);
                                                                                  }}
                                                                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                                                      !isAllowed 
                                                                                          ? 'opacity-20 cursor-not-allowed border-slate-200 dark:border-slate-800' 
                                                                                          : isChecked 
                                                                                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm scale-105 cursor-pointer' 
                                                                                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-transparent hover:border-emerald-400 cursor-pointer'
                                                                                  }`}
                                                                                  title={`${act}: ${isChecked ? 'GỠ' : 'GÁN'}`}
                                                                              >
                                                                                  {isChecked ? <CheckSquare className="w-2.5 h-2.5" /> : <div className="w-2.5 h-2.5" />}
                                                                              </div>
                                                                          </div>
                                                                      </td>
                                                                  );
                                                              })}
                                                          </tr>
                                                      );
                                                  })}
                                              </React.Fragment>
                                          ));
                                      })()}
                                  </tbody>
                              </table>
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><StickyNote className="w-4 h-4 text-slate-300"/> Ghi chú nội bộ (Audit Logs)</label>
                          <textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-5 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl font-medium text-xs outline-none h-28 focus:ring-4 ring-blue-100 shadow-inner" placeholder="Thông tin kỹ năng, đào tạo, đánh giá chuyên môn..." />
                      </div>
                  </div>

                  <div className="p-6 md:p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsModalOpen(false)} className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-600 dark:text-red-400 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSave} disabled={isSaving} className="order-1 md:order-2 px-16 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 active:scale-95 flex items-center justify-center gap-3 transition-all">
                          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          Lưu hồ sơ nhân sự
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ACTIVITY HISTORY MODAL */}
      {isActivityOpen && selectedActUserId && (
          <div className="fixed inset-0 z-[250] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg">
                              <Activity className="w-5 h-5" />
                          </div>
                          <div>
                              <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-sm md:text-base flex items-center gap-2">
                                  Nhật ký hoạt động nhân viên
                              </h3>
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                  Nhân sự: {users.find(u => u.id === selectedActUserId)?.name || '---'} (Mã NV: {users.find(u => u.id === selectedActUserId)?.msnv || '---'})
                              </p>
                          </div>
                      </div>
                      <button onClick={() => { setIsActivityOpen(false); setSelectedActUserId(null); }} className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors active:scale-90"><X className="w-7 h-7"/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar bg-slate-50 dark:bg-slate-800/50/30">
                      <UserActivityList userId={selectedActUserId} />
                  </div>
              </div>
          </div>
      )}
      
      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if(file){ const r = new FileReader(); r.onloadend = () => setFormData(prev => ({...prev, avatar: r.result as string})); r.readAsDataURL(file); } }} />
    </div>
  );
};
