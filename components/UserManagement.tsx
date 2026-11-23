import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { User, UserRole, ModuleId, RoleObject, hasPermission } from '../types';
import { ALL_MODULES } from '../constants';
import { Button } from './Button';
import { SignaturePad } from './SignaturePad';
import { fetchDepartments, fetchDivisions, fetchTeams, fetchUserById, uploadQMSImage } from '../services/apiService';
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
  ShieldCheck, 
  CheckSquare, 
  FileDown, 
  FileUp, 
  UserPlus, 
  Mail, 
  Info,
  AlertCircle,
  Clock,
  Activity,
  Building,
  Filter,
  CheckCircle2,
  FileSpreadsheet,
  Wand2
} from 'lucide-react';
import { UserActivityList } from './UserActivityList';
import { Combobox, ConfirmDialog, PageActions, Pagination, SearchInput } from '../src/components/qms';

export function getLocalAdvisoryModules(phong_ban: string, bo_phan: string): string[] {
    const pb = (phong_ban || '').trim().toLowerCase();
    const bp = (bo_phan || '').trim().toLowerCase();

    if (pb.includes('qaqc') || pb.includes('qa/qc') || pb.includes('qa qc')) {
        if (bp.includes('qa')) {
            return ['FQC', 'SPR', 'SITE'];
        }
        if (bp.includes('qc')) {
            return ['IQC', 'SQC_MAT', 'SQC_BTP', 'SQC_TP', 'PQC', 'FSR', 'STEP', 'SUBCONTRACTOR_BOOKING'];
        }
    } else if (pb.includes('sản xuất') || pb.includes('san xuat')) {
        return ['PQC', 'SQC_BTP', 'SQC_TP', 'STEP'];
    } else if (pb.includes('vật tư') || pb.includes('vat tu') || pb.includes('mua hàng') || pb.includes('procurement')) {
        return ['IQC', 'SQC_MAT', 'SUBCONTRACTOR_BOOKING'];
    } else if (pb.includes('sd') || pb.includes('drawing') || pb.includes('thiết kế') || pb.includes('thiet ke')) {
        return ['CONVERT_3D', 'FSR', 'SPR'];
    } else if (pb.includes('kế hoạch') || pb.includes('ke hoach') || pb.includes('planning')) {
        return ['IQC', 'PQC', 'SITE', 'SUBCONTRACTOR_BOOKING'];
    }
    return [];
}

interface UserManagementProps {
  currentUser: User;
  users: User[];
  roles?: RoleObject[];
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
  const [previewUsers, setPreviewUsers] = useState<User[]>([]);
  const [previewFileName, setPreviewFileName] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const [departments, setDepartments] = useState<{ id: string; name: string; divisions: string[] }[]>([]);
  const [divisionsState, setDivisionsState] = useState<{ id: string; name: string; departmentId: string }[]>([]);
  const [teamsState, setTeamsState] = useState<{ id: string; name: string; divisionId: string; leaderId?: string }[]>([]);
  const [selectedActUserId, setSelectedActUserId] = useState<string | null>(null);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const isAdmin = String(currentUser?.role || '').toUpperCase().trim() === 'ADMIN';
  const canCreate = isAdmin || hasPermission(currentUser, roles, 'SETTINGS_USERS', 'CREATE');
  const canEditAny = isAdmin || hasPermission(currentUser, roles, 'SETTINGS_USERS', 'EDIT');
  const canEditTarget = (target?: User | null) => {
    if (isAdmin) return true;
    if (!canEditAny) return false;
    if (target && String(target.role || '').toUpperCase().trim() === 'ADMIN') return false;
    return true;
  };
  const canDelete = isAdmin;
  const canImport = isAdmin;
  const canExport = isAdmin || hasPermission(currentUser, roles, 'SETTINGS_USERS', 'EXPORT');
  const isReadOnlyView = !canCreate && !canEditAny && !canDelete;

  useEffect(() => {
    fetchDepartments()
      .then(data => setDepartments(data || []))
      .catch(err => console.error('Error fetching departments in UserManagement:', err));

    fetchDivisions()
      .then(data => setDivisionsState(data || []))
      .catch(err => console.error('Error fetching divisions in UserManagement:', err));

    fetchTeams()
      .then(data => setTeamsState(data || []))
      .catch(err => console.error('Error fetching teams in UserManagement:', err));
  }, []);

  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterPosition, setFilterPosition] = useState<string | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string | null>(null);
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
      const email = (u.email || '').toLowerCase();
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term || name.includes(term) || username.includes(term) || msnv.includes(term) || email.includes(term);
      const uRole = String(u.role || 'QC').toUpperCase();
      const matchesRole = !filterRole || uRole === String(filterRole).toUpperCase();
      const pos = u.position || 'Nhân viên';
      const matchesPosition = !filterPosition || pos === filterPosition;
      const uDept = u.phong_ban || (u as any).phongBan || 'Chưa gán bộ phận';
      const matchesDepartment = !filterDepartment || uDept === filterDepartment;
      const stat = u.status || 'Đang làm việc';
      const matchesStatus = !filterStatus || stat === filterStatus;
      return matchesSearch && matchesRole && matchesPosition && matchesDepartment && matchesStatus;
    });
  }, [users, searchTerm, filterRole, filterPosition, filterDepartment, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRole, filterPosition, filterDepartment, filterStatus]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage]);

  const roleOptions = useMemo(() => {
    const base: { value: string; label: string }[] = [
      { value: 'ADMIN', label: 'ADMIN — Quản trị hệ thống' },
      { value: 'MANAGER', label: 'MANAGER — Quản lý' },
      { value: 'QA', label: 'QA — Đảm bảo chất lượng' },
      { value: 'QC_LEAD', label: 'QC_LEAD — Tổ trưởng QC' },
      { value: 'QC', label: 'QC — Nhân viên kiểm tra' },
      { value: 'PURCHASING', label: 'PURCHASING — Mua hàng' },
      { value: 'VENDOR', label: 'VENDOR — Nhà cung cấp' },
    ];
    const seen = new Set(base.map(b => b.value.toUpperCase()));
    const extra = (roles || [])
      .map(r => ({ value: String(r.id || r.name).trim(), label: `${r.name}${r.description ? ` — ${r.description}` : ''}` }))
      .filter(o => o.value && !seen.has(o.value.toUpperCase()));
    return [...base, ...extra];
  }, [roles]);

  const selectableRoleOptions = useMemo(() => {
    if (isAdmin) return roleOptions;
    return roleOptions.filter(o => String(o.value).toUpperCase() !== 'ADMIN');
  }, [roleOptions, isAdmin]);

  const uniquePositions = useMemo(() => Array.from(new Set(users.map(u => u.position || 'Nhân viên'))).filter(Boolean).sort(), [users]);
  const uniqueDepartments = useMemo(() => Array.from(new Set(users.map(u => u.phong_ban || (u as any).phongBan || 'Chưa gán bộ phận'))).filter(Boolean).sort(), [users]);
  const uniqueStatuses = useMemo(() => Array.from(new Set(users.map(u => u.status || 'Đang làm việc'))).filter(Boolean).sort(), [users]);

  const applyRoleTemplate = (roleId: string) => {
    if (!roleId) return;
    if (!isAdmin && String(roleId).toUpperCase() === 'ADMIN') return;
    const match = roles.find(r => String(r.id).toUpperCase() === String(roleId).toUpperCase() || String(r.name).toUpperCase() === String(roleId).toUpperCase());
    if (!match || !Array.isArray(match.permissions)) {
      setModalError(`Vai trò "${roleId}" chưa có ma trận quyền mẫu trong Hệ thống Vai trò.`);
      return;
    }
    const sanitizedPerms = match.permissions
      .filter(p => isAdmin || p.moduleId !== 'SYSTEM_ADMIN')
      .map(p => {
        if (p.moduleId === 'MATERIALS' || p.moduleId === 'IPO') {
          return {
            moduleId: p.moduleId,
            actions: (p.actions || []).filter(a => a === 'VIEW' || a === 'VIEW_ALL' || a === 'EXPORT'),
          };
        }
        return { moduleId: p.moduleId, actions: [...(p.actions || [])] };
      })
      .filter(p => p.actions.length > 0);
    const allowedMods = Array.from(new Set(sanitizedPerms.map(p => p.moduleId)));
    setModalError(null);
    setFormData(prev => ({
      ...prev,
      allowedModules: allowedMods,
      userPermissions: sanitizedPerms,
    }));
  };

  const handleOpenModal = (user?: User) => {
    setModalError(null);
    if (user) {
      if (!canEditTarget(user)) {
        setFeedback({ type: 'error', message: 'Bạn không có quyền chỉnh sửa tài khoản Quản trị viên (ADMIN).' });
        return;
      }
      setEditingUser(user);
      setFormData({ 
        ...user,
        password: '',
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
      if (((user as any).hasAvatar && !user.avatar) || ((user as any).hasSignature && !user.signature_template)) {
        fetchUserById(user.id).then((fullUser) => {
          if (fullUser) {
            setFormData(prev => ({
              ...prev,
              avatar: fullUser.avatar || prev.avatar,
              signature_template: fullUser.signature_template || prev.signature_template,
              signatureTemplate: fullUser.signatureTemplate || prev.signatureTemplate,
            }));
          }
        }).catch(() => {});
      }
    } else {
      if (!canCreate) {
        setFeedback({ type: 'error', message: 'Bạn không có quyền tạo tài khoản mới.' });
        return;
      }
      setEditingUser(null);
      setFormData({
        name: '', username: '', password: '', role: 'QC', allowedModules: ['LIST'],
        msnv: '', email: '', position: '', workLocation: '', status: 'Đang làm việc',
        joinDate: new Date().toISOString().split('T')[0], education: '', notes: '',
        phong_ban: '', bo_phan: '',
        to_qc: '', la_to_truong: false,
        department_id: '', division_id: '', team_id: '',
        userPermissions: [{ moduleId: 'LIST', actions: ['VIEW'] }]
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setModalError(null);
    if (!formData.username?.trim() || !formData.name?.trim()) {
      setModalError('Vui lòng điền đủ Họ và tên và Tên đăng nhập (*).');
      return;
    }
    if (!isAdmin && String(formData.role || '').toUpperCase() === 'ADMIN') {
      setModalError('Chỉ Quản trị viên hệ thống (ADMIN) mới được cấp vai trò ADMIN.');
      return;
    }
    setIsSaving(true);
    try {
        const targetEntityId = editingUser ? editingUser.id : 'new';
        let resolvedAvatar = formData.avatar || '';
        if (resolvedAvatar.startsWith('data:')) {
            resolvedAvatar = await uploadQMSImage(resolvedAvatar, {
                entityType: 'USER',
                entityId: targetEntityId,
                role: 'AVATAR',
            });
        }
        let resolvedSig = formData.signature_template || formData.signatureTemplate || '';
        if (resolvedSig.startsWith('data:')) {
            resolvedSig = await uploadQMSImage(resolvedSig, {
                entityType: 'USER',
                entityId: targetEntityId,
                role: 'SIGNATURE_TEMPLATE',
            });
        }
        const sanitizedModules = (formData.allowedModules || []).filter(m => isAdmin || m !== 'SYSTEM_ADMIN');
        const sanitizedPerms = ((formData as any).userPermissions || []).filter((p: any) => isAdmin || p.moduleId !== 'SYSTEM_ADMIN');
        const userData: any = {
          id: editingUser ? editingUser.id : `user_${Date.now()}`,
          username: formData.username!.trim(),
          name: formData.name!.trim(),
          role: formData.role || 'QC',
          password: formData.password || (editingUser ? editingUser.password : '123456'),
          avatar: resolvedAvatar,
          allowedModules: sanitizedModules,
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
          user_permissions: sanitizedPerms,
          signature_template: resolvedSig,
          signatureTemplate: resolvedSig
        };
        if (editingUser) await onUpdateUser(userData);
        else await onAddUser(userData);
        setIsModalOpen(false);
        setFeedback({ type: 'success', message: editingUser ? `Đã cập nhật hồ sơ nhân sự ${userData.name}.` : `Đã thêm nhân sự mới ${userData.name}.` });
    } catch (e: any) {
        console.error("Save user failed:", e);
        setModalError("Lỗi khi lưu người dùng: " + (e?.message || "Thất bại"));
    } finally {
        setIsSaving(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setIsDeleting(true);
    try {
      await onDeleteUser(deleteUserTarget.id);
      setFeedback({ type: 'success', message: `Đã xóa mềm tài khoản "${deleteUserTarget.name}".` });
      setDeleteUserTarget(null);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Không thể xóa tài khoản.' });
      setDeleteUserTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    if (!XLSX) {
      setFeedback({ type: 'error', message: 'Thư viện Excel chưa sẵn sàng.' });
      return;
    }
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

  // Helper: Format Excel date serial or string to standard format
  const formatExcelDate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${y}-${m}-${d}`;
      }
    }
    const str = String(val).trim();
    const parts = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (parts) {
      return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return str;
  };

  // Helper: Extract hierarchy from Department string
  const extractDepartmentHierarchy = (deptRaw: string) => {
    const raw = String(deptRaw || '').trim();
    if (!raw) return { phong_ban: '', bo_phan: '' };
    const segments = raw.split(/[\/\>]/).map(s => s.trim()).filter(Boolean);
    if (segments.length === 1) {
      return { phong_ban: segments[0], bo_phan: '' };
    }
    if (segments.length === 2) {
      return { phong_ban: segments[1], bo_phan: segments[1] };
    }
    return {
      phong_ban: segments[1],
      bo_phan: segments.slice(2).join(' / ')
    };
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onImportUsers) {
          if (!onImportUsers) console.warn("onImportUsers handler is missing in props");
          return;
      }
      if (!XLSX) {
        setFeedback({ type: 'error', message: 'Hệ thống đang tải thư viện Excel, vui lòng đợi giây lát.' });
        return;
      }

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
                  setFeedback({ type: 'error', message: 'File Excel không có dữ liệu hoặc định dạng không đúng.' });
                  setIsImporting(false);
                  return;
              }

              // Mapping logic matching company Excel format
              const importedUsers = json.map((row: any): User | null => {
                  const findVal = (possibleKeys: string[]) => {
                      const keys = Object.keys(row);
                      for (const pk of possibleKeys) {
                          const match = keys.find(k => k.trim().toLowerCase() === pk.toLowerCase());
                          if (match && row[match] !== undefined && row[match] !== null) return row[match];
                      }
                      return '';
                  };

                  const name = String(findVal([
                      'Employee', 'First and last names', 'First and last name', 
                      'HỌ VÀ TÊN', 'Họ Tên', 'Họ và tên', 'Họ tên', 'Name', 'FullName', 'Tên nhân viên'
                  ])).trim();

                  const email = String(findVal(['Email', 'EMAIL', 'Thư điện tử', 'Mail', 'Địa chỉ email'])).toLowerCase().trim();
                  const msnv = String(findVal(['UserID', 'User ID', 'MÃ NV', 'MSNV', 'Mã NV', 'Mã nhân viên', 'StaffCode', 'Staff Code', 'id'])).trim();
                  const rawUsername = String(findVal(['Tên Đăng Nhập', 'username', 'User', 'Tên', 'Acc'])).toLowerCase().trim();

                  // Rule: Sử dụng toàn bộ địa chỉ Email. Nếu không có email, dùng mã nhân viên UserID
                  const username = email || rawUsername || msnv;
                  
                  if (!name && !username) return null;

                  const position = String(findVal(['Position', 'Chức Vụ', 'Chức danh', 'Job', 'Vị trí', 'Chức vụ']) || 'Nhân viên').trim();
                  const deptRaw = String(findVal(['Department', 'Phòng ban', 'Phòng Ban', 'Bộ phận', 'Khối', 'Phòng'])).trim();
                  const { phong_ban, bo_phan } = extractDepartmentHierarchy(deptRaw);

                  const mobile = String(findVal(['Mobile', 'Work phone', 'SĐT', 'Điện thoại', 'Phone', 'Số điện thoại', 'Số ĐT'])).trim();
                  const workLocation = String(findVal(['City', 'Thành phố', 'Địa điểm', 'Nơi làm việc', 'Location', 'Chi nhánh', 'Nhà máy'])).trim();
                  const dateRegisteredRaw = findVal(['Date registered', 'Ngày vào làm', 'Ngày nhận việc', 'JoinDate', 'Ngày đăng ký', 'Registered']);
                  const joinDate = formatExcelDate(dateRegisteredRaw);
                  const photo = String(findVal(['Photo', 'Avatar', 'Ảnh', 'Hình ảnh'])).trim();

                  // Rule: Theo ma trận phân quyền. Mặc định chỉ để quyền xem module danh sách phiếu ('LIST').
                  // Không tự động phân loại dựa trên chức vụ/phòng ban.
                  const defaultRole: UserRole = 'QC';
                  const defaultAllowedModules: ModuleId[] = ['LIST'];
                  const defaultPermissions = [{ moduleId: 'LIST' as ModuleId, actions: ['VIEW' as any] }];

                  return {
                      id: `user_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
                      msnv: msnv,
                      email: email,
                      name: name || username,
                      username: username,
                      role: defaultRole,
                      position: position,
                      phong_ban: phong_ban || deptRaw,
                      phongBan: phong_ban || deptRaw,
                      bo_phan: bo_phan,
                      boPhan: bo_phan,
                      notes: mobile ? `SĐT: ${mobile}` : (deptRaw ? `Phòng ban: ${deptRaw}` : ''),
                      workLocation: workLocation,
                      joinDate: joinDate,
                      status: 'Đang làm việc',
                      password: '123456', 
                      avatar: photo && (photo.startsWith('http://') || photo.startsWith('https://')) 
                          ? photo 
                          : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || username)}&background=random&color=fff`,
                      allowedModules: defaultAllowedModules,
                      user_permissions: defaultPermissions,
                      userPermissions: defaultPermissions,
                      requirePasswordChange: true
                  };
              }).filter((u): u is User => u !== null);

              if (importedUsers.length > 0) {
                  setPreviewUsers(importedUsers);
                  setPreviewFileName(file.name);
                  setModalError(null);
                  setIsPreviewOpen(true);
              } else {
                  setFeedback({ type: 'error', message: 'Không tìm thấy dữ liệu hợp lệ. Vui lòng kiểm tra tiêu đề cột (Employee / Họ tên, Email, UserID / Mã NV...).' });
              }
          } catch (error) {
              console.error("Excel import error:", error);
              setFeedback({ type: 'error', message: 'Lỗi khi xử lý file Excel. Hãy chắc chắn file không bị mật khẩu bảo vệ.' });
          } finally {
              setIsImporting(false);
              if (excelImportRef.current) excelImportRef.current.value = '';
          }
      };

      reader.onerror = () => {
          setFeedback({ type: 'error', message: 'Lỗi khi đọc file từ thiết bị.' });
          setIsImporting(false);
      };

      reader.readAsArrayBuffer(file);
  };

  const previewStats = useMemo(() => {
      let toInsert = 0;
      let toUpdate = 0;
      previewUsers.forEach(u => {
          const exists = users.some(existingU => 
              (u.msnv && existingU.msnv && existingU.msnv.trim().toLowerCase() === u.msnv.trim().toLowerCase()) ||
              (u.email && existingU.email && existingU.email.trim().toLowerCase() === u.email.trim().toLowerCase()) ||
              (u.username && existingU.username && existingU.username.trim().toLowerCase() === u.username.trim().toLowerCase())
          );
          if (exists) toUpdate++;
          else toInsert++;
      });
      return { toInsert, toUpdate };
  }, [previewUsers, users]);

  const handleConfirmBatchImport = async () => {
      if (!previewUsers || previewUsers.length === 0 || !onImportUsers) return;
      setIsImporting(true);
      setModalError(null);
      try {
          await onImportUsers(previewUsers);
          setFeedback({
            type: 'success',
            message: `Đã hoàn tất nạp nhân sự: Thêm mới ${previewStats.toInsert} tài khoản, Cập nhật thông tin ${previewStats.toUpdate} tài khoản có sẵn!`
          });
          setIsPreviewOpen(false);
          setPreviewUsers([]);
      } catch (err: any) {
          console.error("Confirm import error:", err);
          setModalError("Lỗi khi lưu dữ liệu người dùng: " + (err?.message || "Thất bại"));
      } finally {
          setIsImporting(false);
      }
  };

  const activeFilterCount = [filterRole, filterPosition, filterDepartment, filterStatus].filter(Boolean).length;

  return (
    <div className="space-y-3 animate-in fade-in duration-300 pb-2 md:pb-0">
      {isReadOnlyView && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0" />
          <span>Bạn đang xem danh sách nhân sự ở chế độ chỉ đọc.</span>
        </div>
      )}

      {feedback && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200 ${
          feedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng thông báo" className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] -my-1 -mr-1.5 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <PageActions
        title="Nhân sự Hệ thống"
        subtitle="ISO Competence Records"
        totalCount={filteredUsers.length}
        countLabel="nhân sự"
        icon={
          <div className="p-2 bg-blue-600 text-white rounded-lg shadow">
            <UserIcon className="w-5 h-5" />
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto relative">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Tìm tên, username, MSNV..."
              className="flex-1 min-w-[200px] sm:w-56"
            />

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                aria-label="Mở bộ lọc nhân sự"
                className={`min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] p-2 rounded-lg border transition-all shadow-sm flex items-center justify-center relative ${isFilterOpen || activeFilterCount > 0 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95'}`}
              >
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                )}
              </button>
              {isFilterOpen && (
                <>
                  <div className="fixed inset-0 z-[115]" onClick={() => setIsFilterOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[320px] max-w-[340px] max-h-[75dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[120] p-3 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Vai trò</label>
                      <Combobox
                        value={filterRole}
                        onChange={setFilterRole}
                        options={roleOptions}
                        placeholder="Tất cả vai trò"
                        ariaLabel="Lọc theo vai trò"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Chức vụ</label>
                      <Combobox
                        value={filterPosition}
                        onChange={setFilterPosition}
                        options={uniquePositions.map(p => ({ value: p, label: p }))}
                        placeholder="Tất cả chức vụ"
                        ariaLabel="Lọc theo chức vụ"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Phòng ban / Bộ phận</label>
                      <Combobox
                        value={filterDepartment}
                        onChange={setFilterDepartment}
                        options={uniqueDepartments.map(d => ({ value: d, label: d }))}
                        placeholder="Tất cả phòng ban"
                        ariaLabel="Lọc theo phòng ban"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Trạng thái</label>
                      <Combobox
                        value={filterStatus}
                        onChange={setFilterStatus}
                        options={uniqueStatuses.map(s => ({ value: s, label: s }))}
                        placeholder="Tất cả trạng thái"
                        ariaLabel="Lọc theo trạng thái"
                      />
                    </div>
                    <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => { setFilterRole(null); setFilterPosition(null); setFilterDepartment(null); setFilterStatus(null); }}
                        className="min-h-[44px] lg:min-h-[34px] px-3 rounded-lg text-xs uppercase font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Xóa bộ lọc
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {(canImport || canExport) && (
              <div className="flex items-center gap-1.5">
                {canImport && (
                  <button
                    type="button"
                    onClick={() => excelImportRef.current?.click()}
                    disabled={isImporting}
                    className={`min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] p-2 rounded-lg border transition-all shadow-sm flex items-center justify-center ${isImporting ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-slate-700' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-95'}`}
                    title="Nhập từ Excel (Chỉ ADMIN)"
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  </button>
                )}
                {canExport && (
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] p-2 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                    title="Xuất ra Excel"
                  >
                    <FileDown className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {canCreate && (
              <Button onClick={() => handleOpenModal()} icon={<UserPlus className="w-4 h-4" />} className="bg-blue-600 hover:bg-blue-700 font-bold min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-lg text-xs uppercase flex-1 sm:flex-none">
                Thêm mới
              </Button>
            )}
          </div>
        }
      />

      <input type="file" ref={excelImportRef} className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />

      {/* MOBILE USER CARDS (< md) */}
      <div className="md:hidden space-y-2.5">
        {paginatedUsers.map((u) => {
          const allowEditRow = canEditTarget(u);
          const allowDeleteRow = canDelete && u.username !== 'admin' && u.id !== currentUser.id;
          return (
          <div key={u.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm shrink-0 ${getAvatarBg(u.role as string)}`}>
                  {u.avatar ? <img src={getProxyImageUrl(u.avatar)} className="w-full h-full object-cover rounded-full" alt="" /> : getInitials(u.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-tight truncate">{u.name}</p>
                    {(u.signature_template || (u as any).hasSignature) && (
                      <span className="shrink-0 bg-green-50 text-green-600 px-1 py-0.5 rounded border border-green-100" title="Đã có chữ ký mẫu">
                        <ShieldCheck className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded border border-blue-100 dark:border-slate-700 text-[10px] font-mono font-bold tabular-nums">{u.msnv || '---'}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${getRoleBadgeStyle(String(u.role || 'QC'))}`}>{getRoleDisplayName(String(u.role || 'QC'))}</span>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">{u.position || 'Nhân viên'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{u.phong_ban || 'Chưa gán bộ phận'}</p>
                </div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-tight ${
                u.status === 'Đang làm việc' ? 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-500 border-green-200 dark:border-green-900/30' : 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200'
              }`}>
                {u.status || 'Đang làm việc'}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => { setSelectedActUserId(u.id); setIsActivityOpen(true); }} className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-95 transition-all">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Nhật ký
              </button>
              {allowEditRow && (
                <button type="button" onClick={() => handleOpenModal(u)} className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-bold active:scale-95 transition-all">
                  <Edit2 className="w-4 h-4" /> Sửa
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => setDeleteUserTarget(u)} disabled={!allowDeleteRow} className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold disabled:opacity-30 active:scale-95 transition-all">
                  <Trash2 className="w-4 h-4" /> Xóa
                </button>
              )}
            </div>
          </div>
          );
        })}
        {filteredUsers.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 py-12 flex flex-col items-center justify-center text-slate-400">
            <UserIcon className="w-10 h-10 opacity-20 mb-2" />
            <p className="text-xs font-bold uppercase tracking-wider">Không tìm thấy dữ liệu nhân sự</p>
          </div>
        )}
      </div>

      {/* DESKTOP / TABLET USER TABLE (md+) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[700px] text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                  <tr className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-200">
                      <th className="px-3 py-2.5">Nhân sự</th>
                      <th className="px-3 py-2.5 text-center w-28">Mã NV</th>
                      <th className="px-3 py-2.5">Chức vụ / Phòng ban</th>
                      <th className="px-3 py-2.5 text-center w-36">Vai trò</th>
                      <th className="px-3 py-2.5 text-center w-36">Trạng thái</th>
                      <th className="px-3 py-2.5 text-right w-40">Thao tác</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                  {paginatedUsers.map((u) => {
                      const allowEditRow = canEditTarget(u);
                      const allowDeleteRow = canDelete && u.username !== 'admin' && u.id !== currentUser.id;
                      return (
                      <tr key={u.id} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-all text-sm font-medium text-slate-700 dark:text-slate-300">
                          <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5 overflow-hidden">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm shrink-0 ${getAvatarBg(u.role as string)}`}>
                                      {u.avatar ? <img src={getProxyImageUrl(u.avatar)} className="w-full h-full object-cover rounded-full" alt=""/> : getInitials(u.name)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                          <p className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-tight truncate leading-tight">{u.name}</p>
                                          {(u.signature_template || (u as any).hasSignature) && (
                                              <span className="shrink-0 bg-green-50 text-green-600 px-1 py-0.5 rounded border border-green-100" title="Đã có chữ ký mẫu">
                                                  <ShieldCheck className="w-3 h-3" />
                                              </span>
                                          )}
                                      </div>
                                      <p className="text-[11px] font-mono text-slate-400 truncate">@{u.username}</p>
                                  </div>
                              </div>
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                              <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-md border border-blue-100 dark:border-slate-700 text-xs font-mono font-bold leading-none">
                                  {u.msnv || '---'}
                              </span>
                          </td>
                          <td className="px-3 py-2.5">
                              <div>
                                  <p className="font-bold text-slate-800 dark:text-slate-200 leading-tight uppercase text-xs">{u.position || 'Nhân viên'}</p>
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase leading-none mt-1">{u.phong_ban || 'Chưa gán bộ phận'}</p>
                                  {u.to_qc && (
                                      <div className="flex flex-wrap items-center gap-1 mt-1">
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40 uppercase leading-none">Tổ: {u.to_qc}</span>
                                          {u.la_to_truong && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 uppercase leading-none">Tổ trưởng</span>}
                                      </div>
                                  )}
                              </div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                              <span className={`inline-block px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-tight leading-none ${getRoleBadgeStyle(String(u.role || 'QC'))}`}>
                                  {getRoleDisplayName(String(u.role || 'QC'))}
                              </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                              <span className={`inline-block px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-tight leading-none ${
                                  u.status === 'Đang làm việc' ? 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-500 border-green-200 dark:border-green-900/30' : 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200'
                              }`}>
                                  {u.status || 'Đang làm việc'}
                              </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                  <button type="button" onClick={() => { setSelectedActUserId(u.id); setIsActivityOpen(true); }} title="Nhật ký hoạt động" className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 hover:bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60 active:scale-95 transition-all shrink-0"><Clock className="w-4 h-4"/></button>
                                  {allowEditRow && (
                                    <button type="button" onClick={() => handleOpenModal(u)} title="Chỉnh sửa" className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 hover:bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60 active:scale-95 transition-all shrink-0"><Edit2 className="w-4 h-4"/></button>
                                  )}
                                  {canDelete && (
                                    <button type="button" onClick={() => setDeleteUserTarget(u)} disabled={!allowDeleteRow} title="Xóa" className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center text-slate-500 hover:text-red-500 bg-slate-50 dark:bg-slate-800 hover:bg-white rounded-lg border border-slate-200 dark:border-slate-700/60 disabled:opacity-25 active:scale-95 transition-all shrink-0"><Trash2 className="w-4 h-4"/></button>
                                  )}
                              </div>
                          </td>
                      </tr>
                      );
                  })}
              </tbody>
          </table>
          {filteredUsers.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <UserIcon className="w-10 h-10 opacity-20 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider">Không tìm thấy dữ liệu nhân sự</p>
              </div>
          )}
      </div>

      {filteredUsers.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredUsers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* DETAILED USER MODAL */}
      {isModalOpen && createPortal(
          <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
              <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-lg shrink-0">
                              <UserPlus className="w-4 h-4" />
                          </div>
                          <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-sm sm:text-base truncate">
                              {editingUser ? 'Cập nhật hồ sơ nhân sự' : 'Đăng ký nhân sự mới'}
                          </h3>
                      </div>
                      <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors active:scale-90"><X className="w-5 h-5"/></button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-5 no-scrollbar bg-slate-50 dark:bg-slate-800/30">
                      {modalError && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{modalError}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                          {/* Avatar & Basic */}
                          <div className="space-y-6 flex flex-col items-center">
                              <div className="w-32 h-32 rounded-[2rem] border-4 border-white shadow-2xl overflow-hidden relative group bg-slate-200 dark:bg-slate-700">
                                  <img src={getProxyImageUrl(formData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'New')}&background=random&color=fff`)} className="w-full h-full object-cover" alt="" />
                                  <button type="button" onClick={() => avatarInputRef.current?.click()} aria-label="Đổi ảnh đại diện" className="absolute inset-0 bg-black/35 lg:bg-black/40 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="w-8 h-8"/></button>
                              </div>
                              <div className="w-full space-y-4">
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Mã nhân viên (MSNV)</label>
                                      <input value={formData.msnv || ''} onChange={e => setFormData({...formData, msnv: e.target.value.toUpperCase()})} className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm uppercase outline-none focus:ring-4 ring-blue-100" placeholder="AA-XXXX" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Trạng thái</label>
                                      <Combobox
                                          value={formData.status || 'Đang làm việc'}
                                          onChange={val => setFormData({...formData, status: val || 'Đang làm việc'})}
                                          allowClear={false}
                                          ariaLabel="Trạng thái nhân sự"
                                          options={[
                                              { value: 'Đang làm việc', label: 'Đang làm việc' },
                                              { value: 'Nghỉ phép', label: 'Nghỉ phép' },
                                              { value: 'Đã nghỉ việc', label: 'Đã nghỉ việc' }
                                          ]}
                                      />
                                  </div>
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Chữ ký mẫu (Template)</label>
                                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden p-1 shadow-sm">
                                          <SignaturePad 
                                            label="Vẽ mẫu chữ ký cho NV" 
                                            value={formData.signature_template} 
                                            onChange={(val) => setFormData(prev => ({...prev, signature_template: val, signatureTemplate: val}))} 
                                            isTemplateEditor={true}
                                          />
                                      </div>
                                  </div>
                              </div>
                          </div>

                          {/* Info Grid */}
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
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
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><ShieldCheck className="w-3 h-3"/> Vai trò hệ thống (Role) *</label>
                                  <div className="flex items-center gap-1.5">
                                      <div className="flex-1 min-w-0">
                                          <Combobox
                                              value={String(formData.role || 'QC')}
                                              onChange={val => setFormData({ ...formData, role: (val || 'QC') as UserRole })}
                                              options={selectableRoleOptions}
                                              allowClear={false}
                                              disabled={!!editingUser && editingUser.username === 'admin'}
                                              ariaLabel="Vai trò hệ thống"
                                          />
                                      </div>
                                      <button
                                          type="button"
                                          onClick={() => applyRoleTemplate(String(formData.role || 'QC'))}
                                          title="Nạp ma trận quyền từ Vai trò đã chọn"
                                          className="min-h-[44px] lg:min-h-[38px] px-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
                                      >
                                          <Wand2 className="w-3.5 h-3.5" />
                                          <span className="hidden sm:inline">Nạp quyền</span>
                                      </button>
                                  </div>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Briefcase className="w-3 h-3"/> Chức vụ *</label>
                                  <Combobox
                                      value={['GIÁM ĐỐC', 'TRƯỞNG PHÒNG', 'TRƯỞNG BỘ PHẬN', 'TỔ TRƯỞNG', 'NHÂN VIÊN'].includes(String(formData.position).toUpperCase()) ? String(formData.position).toUpperCase() : (formData.position ? 'KHAC' : null)}
                                      onChange={val => {
                                          const nextVal = val || '';
                                          if (nextVal === 'KHAC') {
                                              setFormData({...formData, position: formData.position && !['GIÁM ĐỐC', 'TRƯỞNG PHÒNG', 'TRƯỞNG BỘ PHẬN', 'TỔ TRƯỞNG', 'NHÂN VIÊN'].includes(String(formData.position).toUpperCase()) ? formData.position : 'Chức vụ mới'});
                                          } else {
                                              setFormData({...formData, position: nextVal, la_to_truong: nextVal === 'TỔ TRƯỞNG' ? true : formData.la_to_truong});
                                          }
                                      }}
                                      placeholder="-- Chọn Chức vụ --"
                                      allowClear={true}
                                      ariaLabel="Chức vụ"
                                      options={[
                                          { value: 'GIÁM ĐỐC', label: 'GIÁM ĐỐC' },
                                          { value: 'TRƯỞNG PHÒNG', label: 'TRƯỞNG PHÒNG' },
                                          { value: 'TRƯỞNG BỘ PHẬN', label: 'TRƯỞNG BỘ PHẬN' },
                                          { value: 'TỔ TRƯỞNG', label: 'TỔ TRƯỞNG' },
                                          { value: 'NHÂN VIÊN', label: 'NHÂN VIÊN' },
                                          {
                                              value: 'KHAC',
                                              label: formData.position && !['GIÁM ĐỐC', 'TRƯỞNG PHÒNG', 'TRƯỞNG BỘ PHẬN', 'TỔ TRƯỞNG', 'NHÂN VIÊN'].includes(String(formData.position).toUpperCase())
                                                  ? `KHÁC: ${String(formData.position).toUpperCase()}`
                                                  : '+ KHÁC (TỰ NHẬP)...'
                                          }
                                      ]}
                                  />
                                  
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
                                          className="mt-1.5 w-full min-h-[44px] lg:min-h-[38px] px-4 py-2 text-xs font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2"
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
                                  <Combobox
                                      value={formData.department_id || null}
                                      onChange={val => {
                                          const deptId = val || '';
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
                                      placeholder="-- Chọn Phòng ban --"
                                      ariaLabel="Phòng ban"
                                      options={departments.map(d => ({ value: d.id, label: d.name }))}
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Building className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Bộ phận</label>
                                  <Combobox
                                      value={formData.division_id || null}
                                      onChange={val => {
                                          const divId = val || '';
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
                                      placeholder="-- Chọn Bộ phận --"
                                      disabled={!formData.department_id}
                                      ariaLabel="Bộ phận"
                                      options={divisionsState.filter(div => div.departmentId === formData.department_id).map(div => ({ value: div.id, label: div.name }))}
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Building className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Tổ (Team)</label>
                                  <Combobox
                                      value={formData.team_id || null}
                                      onChange={val => {
                                          const teamId = val || '';
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
                                      placeholder="-- Chọn Tổ --"
                                      disabled={!formData.division_id}
                                      ariaLabel="Tổ"
                                      options={teamsState.filter(team => team.divisionId === formData.division_id).map(team => ({ value: team.id, label: team.name }))}
                                  />
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Calendar className="w-3 h-3"/> Ngày nhận việc</label>
                                  <input type="date" value={formData.joinDate || ''} onChange={e => setFormData({...formData, joinDate: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><UserIcon className="w-3 h-3 text-slate-400" /> Tổ QC</label>
                                  <input value={formData.to_qc || ''} onChange={e => setFormData({...formData, to_qc: e.target.value})} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:ring-4 ring-blue-100 shadow-sm" placeholder="Ví dụ: Tổ 1 - Sơn bóng" />
                              </div>
                              <div className="space-y-1 flex items-center pt-3">
                                  <label className="flex items-center gap-3 min-h-[44px] px-2 -ml-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer select-none">
                                      <input type="checkbox" checked={!!formData.la_to_truong} onChange={e => setFormData({...formData, la_to_truong: e.target.checked})} className="w-5 h-5 text-blue-600 bg-white dark:bg-slate-900 border-slate-300 rounded focus:ring-blue-500" />
                                      <span className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider">Là Tổ trưởng (Team Leader)</span>
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

                          <div className="space-y-3 overflow-x-auto no-scrollbar pb-4 -mx-6 px-6">
                              <table className="w-full min-w-[660px] text-left text-xs border-collapse">
                                  <thead>
                                      <tr className="border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900 z-20">
                                          <th className="py-2 px-2 font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[8px] w-[150px] sticky left-0 bg-white dark:bg-slate-900 z-30 shadow-[1px_0_0_0_rgba(0,0,0,0.08)] dark:shadow-slate-800">Phân hệ / Module</th>
                                          <th className="py-2 text-center font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest text-[8px] bg-blue-50/50 dark:bg-blue-950/10 border-x border-slate-100 dark:border-slate-800 w-[45px]">TRUY CẬP</th>
                                          {[
                                              { id: 'VIEW', title: 'VIEW', desc: 'xem' },
                                              { id: 'VIEW_ALL', title: 'V-ALL', desc: 'tất cả' },
                                              { id: 'CREATE', title: 'CREATE', desc: 'tạo' },
                                              { id: 'EDIT_OWN', title: 'EDIT-O', desc: 'tôi' },
                                              { id: 'EDIT_ALL', title: 'EDIT-A', desc: 'tất cả' },
                                              { id: 'DELETE_OWN', title: 'DEL-O', desc: 'tôi' },
                                              { id: 'DELETE_ALL', title: 'DEL-A', desc: 'tất cả' },
                                              { id: 'IMPORT', title: 'IMPT', desc: 'nhập' },
                                              { id: 'EXPORT', title: 'EXPT', desc: 'xuất' },
                                              { id: 'SIGN1', title: 'SIGN1', desc: 'L1' },
                                              { id: 'SIGN2', title: 'SIGN2', desc: 'L2' }
                                          ].map(act => (
                                              <th key={act.id} className="py-1 px-0 text-center font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter text-[7px] border-r border-slate-100 dark:border-slate-800 w-[38px] leading-tight">
                                                  <div className="flex flex-col items-center justify-center min-h-[36px]">
                                                      <span>{act.title}</span>
                                                      <span className="opacity-60 font-normal lowercase italic text-[6px]">({act.desc})</span>
                                                  </div>
                                              </th>
                                          ))}
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {(() => {
                                          const getModuleAllowedActions = (mid: string): string[] => {
                                              // 1. Read-Only Modules: Only VIEW, VIEW_ALL, EXPORT are allowed. All others: CREATE, EDIT, DELETE, IMPORT, SIGN1, SIGN2 are completely blocked and left blank!
                                              if (mid === 'MATERIALS' || mid === 'IPO') {
                                                  return ['VIEW', 'VIEW_ALL', 'EXPORT'];
                                              }
                                              // 2. Main workflow modules (KIỂM TRA CHẤT LƯỢNG & some main modules)
                                              if (['IQC', 'SQC_MAT', 'SQC_BTP', 'SQC_TP', 'PQC', 'FSR', 'STEP', 'FQC', 'SPR', 'SITE', 'LIST', 'NCR_LIST', 'TOOLS', 'SUBCONTRACTOR_BOOKING'].includes(mid)) {
                                                  return ['VIEW', 'VIEW_ALL', 'CREATE', 'EDIT_OWN', 'EDIT_ALL', 'DELETE_OWN', 'DELETE_ALL', 'IMPORT', 'EXPORT', 'SIGN1', 'SIGN2'];
                                              }
                                              // 3. Simple inventory / config / CRUD tables with import/export (PROJECTS has no import/export but has CRUD)
                                              if (['PROJECTS', 'SUPPLIERS', 'DEFECT_LIBRARY', 'SETTINGS_USERS', 'SETTINGS_ROLES', 'SETTINGS_WORKSHOPS', 'SETTINGS_DEPARTMENTS', 'SETTINGS_TEMPLATE'].includes(mid)) {
                                                  return ['VIEW', 'VIEW_ALL', 'CREATE', 'EDIT_OWN', 'EDIT_ALL', 'DELETE_OWN', 'DELETE_ALL', 'IMPORT', 'EXPORT'];
                                              }
                                              // 4. System Admin
                                              if (mid === 'SYSTEM_ADMIN') {
                                                  return ['VIEW', 'CREATE', 'EDIT_ALL', 'DELETE_ALL'];
                                              }
                                              // 5. Default view-only for dashboard or simple navigation sections
                                              return ['VIEW', 'VIEW_ALL'];
                                          };
                                          
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
                                                  <tr className="bg-slate-100/60 dark:bg-slate-800/40 sticky z-10">
                                                      <td colSpan={13} className="py-1 px-3 font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[8px] border-y border-slate-200/50 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800 sticky left-0">
                                                          📁 {groupName}
                                                      </td>
                                                  </tr>
                                                  {groupModules.map(m => {
                                                      const isSystemAdminMod = m.id === 'SYSTEM_ADMIN';
                                                      const disableModuleGrant = isSystemAdminMod && !isAdmin;
                                                      const userPermissions = (formData.userPermissions || []) as any[];
                                                      const isAllowed = formData.allowedModules?.includes(m.id) || false;
                                                      const existingPerm = userPermissions.find(p => p.moduleId === m.id);
                                                      const allowedActions = getModuleAllowedActions(m.id);
                                                      const hasActions = allowedActions.length > 0;

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
                                                              <td className="py-1.5 px-2 sticky left-0 bg-white dark:bg-[#111827] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] z-[5]">
                                                                  <div className="text-[9px] uppercase font-bold text-slate-700 dark:text-slate-300 truncate tracking-tight transition-all" title={m.label}>{m.label}</div>
                                                                  <div className="flex items-center gap-1 mt-0.5">
                                                                      <span className="font-mono text-[6.5px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1 rounded uppercase tracking-tighter shrink-0">{m.id}</span>
                                                                  </div>
                                                              </td>
                                                              
                                                              {/* TRUY CẬP Column: QMS Blue brand checkbox */}
                                                              <td className="py-1 text-center bg-blue-50/10 dark:bg-blue-950/5 border-x border-slate-100 dark:border-slate-800">
                                                                  <div className="flex justify-center">
                                                                      <button
                                                                          type="button"
                                                                          disabled={disableModuleGrant}
                                                                          onClick={() => {
                                                                              if (disableModuleGrant) return;
                                                                              const current = formData.allowedModules || [];
                                                                              const isCurrentlyAllowed = current.includes(m.id);
                                                                              setFormData(prev => ({
                                                                                  ...prev,
                                                                                  allowedModules: isCurrentlyAllowed 
                                                                                      ? current.filter(id => id !== m.id) 
                                                                                      : [...current, m.id]
                                                                              }));
                                                                          }}
                                                                          className={`min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center rounded-md transition-colors ${disableModuleGrant ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-950/30'}`}
                                                                          title={disableModuleGrant ? 'Chỉ ADMIN mới được cấp quyền SYSTEM_ADMIN' : `TRUY CẬP: ${isAllowed ? 'GỠ' : 'GÁN'}`}
                                                                      >
                                                                          <span className={`w-5 h-5 lg:w-4 lg:h-4 rounded border flex items-center justify-center transition-all ${
                                                                              isAllowed 
                                                                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                                                                                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-transparent'
                                                                          }`}>
                                                                              {isAllowed ? <CheckSquare className="w-3.5 h-3.5 lg:w-3 lg:h-3" /> : null}
                                                                          </span>
                                                                      </button>
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
                                                                  if (!hasActions || !allowedActions.includes(act)) {
                                                                      return (
                                                                          <td key={act} className="py-1 text-center text-slate-200 dark:text-slate-800 text-[8px]">
                                                                              <span className="select-none inline-block w-4 opacity-30">—</span>
                                                                          </td>
                                                                      );
                                                                  }

                                                                  const isChecked = existingPerm?.actions.includes(act) || false;
                                                                  return (
                                                                      <td key={act} className="py-1 text-center border-r border-slate-50 dark:border-slate-800/30">
                                                                          <div className="flex justify-center">
                                                                              <button
                                                                                  type="button"
                                                                                  disabled={!isAllowed || disableModuleGrant}
                                                                                  onClick={() => {
                                                                                      if (!isAllowed || disableModuleGrant) return;
                                                                                      toggleUserPermission(act);
                                                                                  }}
                                                                                  className={`min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center rounded-md transition-colors ${!isAllowed ? 'cursor-not-allowed opacity-25' : 'cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30'}`}
                                                                                  title={`${act}: ${isChecked ? 'GỠ' : 'GÁN'}`}
                                                                              >
                                                                                  <span className={`w-5 h-5 lg:w-4 lg:h-4 rounded border flex items-center justify-center transition-all ${
                                                                                      !isAllowed 
                                                                                          ? 'border-slate-200 dark:border-slate-800' 
                                                                                          : isChecked 
                                                                                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                                                                                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-transparent'
                                                                                  }`}>
                                                                                      {isChecked ? <CheckSquare className="w-3.5 h-3.5 lg:w-3 lg:h-3" /> : null}
                                                                                  </span>
                                                                              </button>
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
                          <textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-5 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl font-medium text-sm lg:text-xs outline-none h-28 focus:ring-4 ring-blue-100 shadow-inner" placeholder="Thông tin kỹ năng, đào tạo, đánh giá chuyên môn..." />
                      </div>
                  </div>

                  <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-col sm:flex-row justify-end gap-2 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] z-10">
                      <button type="button" onClick={() => setIsModalOpen(false)} className="order-2 sm:order-1 min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors whitespace-nowrap shrink-0">Hủy bỏ</button>
                      <button type="button" onClick={handleSave} disabled={isSaving} className="order-1 sm:order-2 min-h-[44px] sm:min-h-[36px] px-6 py-2 sm:py-1.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-[0.12em] shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0">
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Lưu hồ sơ nhân sự
                      </button>
                  </div>
              </div>
          </div>,
          document.body
      )}

      {/* ACTIVITY HISTORY MODAL */}
      {isActivityOpen && selectedActUserId && createPortal(
          <div className="fixed inset-0 z-[250] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
              <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                  <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 bg-indigo-600 text-white rounded-xl shadow-lg shrink-0">
                              <Activity className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                              <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-sm flex items-center gap-2 truncate">
                                  Nhật ký hoạt động nhân viên
                              </h3>
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">
                                  Nhân sự: {users.find(u => u.id === selectedActUserId)?.name || '---'} (Mã NV: {users.find(u => u.id === selectedActUserId)?.msnv || '---'})
                              </p>
                          </div>
                      </div>
                      <button type="button" onClick={() => { setIsActivityOpen(false); setSelectedActUserId(null); }} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors active:scale-90"><X className="w-5 h-5"/></button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 no-scrollbar bg-slate-50 dark:bg-slate-800/30">
                      <UserActivityList userId={selectedActUserId} />
                  </div>
              </div>
          </div>,
          document.body
      )}

      {/* EXCEL IMPORT PREVIEW & CONFIRMATION MODAL */}
      {isPreviewOpen && createPortal(
        <div className="fixed inset-0 z-[260] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 font-sans">
            {/* Modal Header */}
            <div className="px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-emerald-600 text-white rounded-xl shadow-md shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-sm truncate">
                    Xác nhận nạp danh sách nhân sự từ Excel
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <span>Tệp: <span className="font-mono text-blue-600 dark:text-blue-400 lowercase">{previewFileName}</span></span>
                    <span>•</span>
                    <span>Tổng: <strong className="text-slate-900 dark:text-slate-100">{previewUsers.length}</strong></span>
                    <span>•</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-black bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">Thêm mới: {previewStats.toInsert}</span>
                    <span className="text-amber-700 dark:text-amber-300 font-black bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60">Cập nhật: {previewStats.toUpdate}</span>
                  </div>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => { setIsPreviewOpen(false); setPreviewUsers([]); }} 
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center text-slate-400 hover:text-rose-500 rounded-xl transition-colors"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4 no-scrollbar">
              {modalError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}
              {/* Permission & Security Policy Callout */}
              <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3.5 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-black text-blue-900 dark:text-blue-200 uppercase tracking-wider text-[11px]">
                    Quy tắc xử lý tồn tại theo Mã nhân viên (MSNV)
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                    1. <strong className="text-amber-700 dark:text-amber-300">Nếu Mã NV đã tồn tại ({previewStats.toUpdate} nhân sự)</strong>: Hệ thống <strong>chỉ cập nhật thông tin hồ sơ</strong> (chức vụ, phòng ban, SĐT, nơi làm việc...). Không thay đổi mật khẩu và bảo lưu toàn bộ ma trận phân quyền đã cấp trước đó.
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                    2. <strong className="text-emerald-700 dark:text-emerald-300">Nếu Mã NV chưa tồn tại ({previewStats.toInsert} nhân sự)</strong>: Hệ thống <strong>thêm mới tài khoản</strong> với ma trận quyền an toàn mặc định: <em>Chỉ xem module Danh sách phiếu (LIST: VIEW)</em>, mật khẩu khởi tạo <span className="font-mono font-bold">123456</span>.
                  </p>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-100 dark:bg-slate-800/60 px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 tracking-wider">
                    Xem trước bản ghi ({Math.min(previewUsers.length, 8)}/{previewUsers.length} nhân sự đầu tiên)
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">
                    Trường Username: Toàn bộ Email
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700 text-[9px] font-black uppercase tracking-wider text-slate-400">
                        <th className="px-3 py-2 w-10 text-center">STT</th>
                        <th className="px-3 py-2 text-center">Hành vi</th>
                        <th className="px-3 py-2">Mã NV</th>
                        <th className="px-3 py-2">Họ và tên</th>
                        <th className="px-3 py-2">Tên đăng nhập / Email</th>
                        <th className="px-3 py-2">Chức vụ</th>
                        <th className="px-3 py-2">Phòng ban</th>
                        <th className="px-3 py-2">Địa điểm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {previewUsers.slice(0, 8).map((u, idx) => {
                        const exists = users.some(existingU => 
                          (u.msnv && existingU.msnv && existingU.msnv.trim().toLowerCase() === u.msnv.trim().toLowerCase()) ||
                          (u.email && existingU.email && existingU.email.trim().toLowerCase() === u.email.trim().toLowerCase()) ||
                          (u.username && existingU.username && existingU.username.trim().toLowerCase() === u.username.trim().toLowerCase())
                        );

                        return (
                          <tr key={u.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-2 text-center text-[10px] text-slate-400 font-mono">{idx + 1}</td>
                            <td className="px-3 py-2 text-center">
                              {exists ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 whitespace-nowrap" title="Mã NV đã tồn tại trong CSDL - Chỉ cập nhật thông tin hồ sơ">
                                  CẬP NHẬT
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap" title="Mã NV chưa có trong CSDL - Thêm mới tài khoản">
                                  THÊM MỚI
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px]">{u.msnv || '---'}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">{u.name}</td>
                            <td className="px-3 py-2 font-mono text-[10px] text-blue-600 dark:text-blue-400 lowercase">{u.username}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">{u.position || 'Nhân viên'}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 max-w-[150px] truncate" title={u.phong_ban}>{u.phong_ban || '---'}</td>
                            <td className="px-3 py-2 text-[10px] text-slate-500">{u.workLocation || '---'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {previewUsers.length > 8 && (
                  <div className="p-2.5 text-center bg-slate-50 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400">
                    ... và còn {previewUsers.length - 8} nhân sự khác sẽ được xử lý vào hệ thống
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/40 shrink-0">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                Tổng cộng: <strong className="text-slate-900 dark:text-slate-100">{previewUsers.length}</strong> nhân sự (<span className="text-emerald-600 dark:text-emerald-400 font-bold">{previewStats.toInsert} thêm mới</span>, <span className="text-amber-600 dark:text-amber-400 font-bold">{previewStats.toUpdate} cập nhật</span>)
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => { setIsPreviewOpen(false); setPreviewUsers([]); }}
                  disabled={isImporting}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-1 sm:flex-none whitespace-nowrap shrink-0"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBatchImport}
                  disabled={isImporting}
                  className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex-1 sm:flex-none whitespace-nowrap shrink-0"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang xử lý nạp...
                    </>
                  ) : (
                    <>
                      <FileUp className="w-4 h-4" />
                      Xác nhận nạp {previewUsers.length} nhân sự
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={!!deleteUserTarget}
        title="Xác nhận xóa tài khoản"
        message={
          deleteUserTarget
            ? `Bạn có chắc muốn xóa mềm tài khoản "${deleteUserTarget.name}" (@${deleteUserTarget.username})? Người dùng này sẽ không thể đăng nhập.`
            : ''
        }
        variant="danger"
        confirmLabel="Xóa tài khoản"
        isLoading={isDeleting}
        onConfirm={handleConfirmDeleteUser}
        onCancel={() => { if (!isDeleting) setDeleteUserTarget(null); }}
      />
      
      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (file) { try { const url = await uploadQMSImage(file, { entityType: 'USER', entityId: editingUser?.id || 'new', role: 'AVATAR' }); setFormData(prev => ({...prev, avatar: url})); } catch (err: any) { setModalError("Lỗi tải ảnh lên: " + (err?.message || "Thất bại")); } finally { e.target.value = ''; } } }} />
    </div>
  );
};
