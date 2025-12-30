
import React, { useState, useRef } from 'react';
import { User, UserRole, ModuleId } from '../types';
import { ALL_MODULES } from '../constants';
import { Button } from './Button';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  Shield, 
  User as UserIcon, 
  Save, 
  Download, 
  Upload,
  Briefcase,
  MapPin,
  Calendar,
  GraduationCap,
  StickyNote,
  Camera,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  CheckCircle2
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
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Form State
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
    endDate: '',
    notes: ''
  });

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ 
        ...user,
        msnv: user.msnv || '',
        position: user.position || '',
        workLocation: user.workLocation || '',
        status: user.status || 'Đang làm việc',
        joinDate: user.joinDate || '',
        education: user.education || '',
        endDate: user.endDate || '',
        notes: user.notes || '',
        avatar: user.avatar || ''
      }); 
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        username: '',
        password: '',
        role: 'QC',
        allowedModules: ['SITE', 'PQC'],
        avatar: '',
        msnv: '',
        position: '',
        workLocation: '',
        status: 'Đang làm việc',
        joinDate: new Date().toISOString().split('T')[0],
        education: '',
        endDate: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.username || !formData.name || !formData.role) {
      alert("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }

    if (!editingUser && !formData.password) {
       alert("Vui lòng nhập mật khẩu cho người dùng mới");
       return;
    }

    // Nếu tình trạng khác đang làm việc thì bỏ hết quyền
    const finalAllowedModules = formData.status !== 'Đang làm việc' ? [] : formData.allowedModules;

    const userData: User = {
      id: editingUser ? editingUser.id : Date.now().toString(),
      username: formData.username!,
      name: formData.name!,
      role: formData.role as UserRole,
      password: formData.password || (editingUser ? editingUser.password : '123456'), 
      avatar: formData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name!)}&background=random&color=fff`,
      allowedModules: finalAllowedModules,
      msnv: formData.msnv,
      position: formData.position,
      workLocation: formData.workLocation,
      status: formData.status,
      joinDate: formData.joinDate,
      education: formData.education,
      endDate: formData.endDate,
      notes: formData.notes
    };

    if (editingUser) {
      await onUpdateUser(userData);
    } else {
      await onAddUser(userData);
    }
    setIsModalOpen(false);
  };

  const toggleModule = (moduleId: ModuleId) => {
    if (formData.status !== 'Đang làm việc') {
        alert("Người dùng không ở trạng thái 'Đang làm việc' không được cấp quyền.");
        return;
    }

    setFormData(prev => {
      const current = prev.allowedModules || [];
      if (current.includes(moduleId)) {
        return { ...prev, allowedModules: current.filter(id => id !== moduleId) };
      } else {
        return { ...prev, allowedModules: [...current, moduleId] };
      }
    });
  };

  const handleSelectAll = () => {
     if (formData.status !== 'Đang làm việc') {
        alert("Người dùng không ở trạng thái 'Đang làm việc' không được cấp quyền.");
        return;
     }
     setFormData(prev => ({ ...prev, allowedModules: ALL_MODULES.map(m => m.id) }));
  };

  const handleClearAll = () => {
     setFormData(prev => ({ ...prev, allowedModules: [] }));
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'MANAGER': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'QA': return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'QC': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    const s = status || 'Đang làm việc';
    if (s === 'Đang làm việc') return 'bg-green-100 text-green-700';
    if (s === 'Chuyển BP/Phòng/Ban') return 'bg-orange-100 text-orange-700';
    return 'bg-slate-100 text-slate-600';
  };

  // ... (Export/Import logic remains same)
  const handleExportExcel = () => {
    try {
      const exportData = users.map(u => ({
        'MSNV': u.msnv || '',
        'HỌ VÀ TÊN': u.name,
        'CHỨC VỤ': u.position || '',
        'NƠI LÀM VIỆC': u.workLocation || '',
        'TÌNH TRẠNG': u.status || '',
        'NGÀY NHẬN VIỆC': u.joinDate || '',
        'TRÌNH ĐỘ': u.education || '',
        'NGÀY KẾT THÚC': u.endDate || '',
        'GHI CHÚ': u.notes || '',
        'Tên đăng nhập': u.username,
        'Mật khẩu': u.password || '123',
        'Vai trò hệ thống': u.role,
        'Quyền hạn (Modules)': (u.allowedModules || []).join(', ')
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Danh sách nhân sự");
      XLSX.writeFile(wb, `Danh_sach_nhan_su_AATN_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Lỗi khi xuất file Excel.");
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          alert("File Excel không có dữ liệu.");
          return;
        }

        if (window.confirm(`Bạn có chắc chắn muốn nhập ${data.length} nhân sự từ file Excel lên hệ thống?`)) {
          setIsImporting(true);
          setImportProgress(0);
          
          const validUsers: User[] = [];

          for (let i = 0; i < data.length; i++) {
            const row: any = data[i];
            
            // Mapping flexible headers
            const name = row['HỌ VÀ TÊN'] || row['Họ và Tên'] || row['name'] || row['FullName'];
            const msnv = String(row['MSNV'] || row['Mã số NV'] || row['EmployeeID'] || '');
            const username = row['Tên đăng nhập'] || row['username'] || row['User'] || (msnv ? msnv.toLowerCase().replace(/\s+/g, '') : `u_${Date.now()}_${i}`);
            const password = String(row['Mật khẩu'] || row['password'] || '123');
            const position = row['CHỨC VỤ'] || row['Position'] || row['Chức vụ'] || '';
            const workLocation = row['NƠI LÀM VIỆC'] || row['Work Location'] || row['Nơi làm việc'] || '';
            const status = row['TÌNH TRẠNG'] || row['Status'] || row['Tình trạng'] || 'Đang làm việc';
            
            const parseExcelDate = (val: any) => {
                if (!val) return '';
                if (typeof val === 'number') {
                    const date = new Date((val - 25569) * 86400 * 1000);
                    return date.toISOString().split('T')[0];
                }
                return String(val);
            };

            const joinDate = parseExcelDate(row['NGÀY NHẬN VIỆC'] || row['Join Date'] || row['Ngày nhận việc']);
            const education = row['TRÌNH ĐỘ'] || row['Education'] || row['Trình độ'] || '';
            const endDate = parseExcelDate(row['NGÀY KẾT THÚC'] || row['End Date'] || row['Ngày kết thúc']);
            const notes = row['GHI CHÚ'] || row['Notes'] || row['Ghi chú'] || '';
            
            const roleStr = (row['Vai trò hệ thống'] || row['Role'] || row['role'] || 'QC').toUpperCase();
            const role = ['ADMIN', 'MANAGER', 'QC', 'QA'].includes(roleStr) ? roleStr : 'QC';
            
            const modulesStr = row['Quyền hạn (Modules)'] || row['Modules'] || '';
            let allowedModules = modulesStr 
              ? modulesStr.split(/[,;|]/).map((s: string) => s.trim() as ModuleId).filter((m: any) => ALL_MODULES.some(am => am.id === m))
              : ['SITE', 'PQC'];

            // Nếu tình trạng khác đang làm việc thì bỏ hết quyền
            if (status !== 'Đang làm việc') {
                allowedModules = [];
            }

            if (name) {
              const newUser: User = {
                id: msnv ? `usr_${msnv.replace(/[^a-zA-Z0-9]/g, '_')}` : `imp_${Date.now()}_${i}`,
                name,
                username,
                password,
                role: role as UserRole,
                allowedModules,
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`,
                msnv,
                position,
                workLocation,
                status,
                joinDate,
                education,
                endDate,
                notes
              };
              
              validUsers.push(newUser);
            }
          }

          if (validUsers.length > 0) {
              if (onImportUsers) {
                  try {
                      await onImportUsers(validUsers);
                      alert(`Hoàn tất! Đã nhập thành công ${validUsers.length} nhân sự.`);
                  } catch (e) {
                      console.error(e);
                      alert("Lỗi khi nhập dữ liệu.");
                  }
              } else {
                  // Fallback loop if batch import not provided
                  let successCount = 0;
                  for (let i = 0; i < validUsers.length; i++) {
                      try {
                          await onAddUser(validUsers[i]);
                          successCount++;
                      } catch (err) {
                          console.error(`Lỗi khi nhập user:`, err);
                      }
                      setImportProgress(Math.round(((i + 1) / validUsers.length) * 100));
                  }
                  alert(`Hoàn tất! Đã nhập thành công ${successCount}/${validUsers.length} nhân sự.`);
              }
          } else {
              alert("Không tìm thấy dữ liệu hợp lệ trong file Excel.");
          }
          
          setIsImporting(false);
        }
      } catch (err) {
        setIsImporting(false);
        console.error("Import failed:", err);
        alert("Lỗi khi đọc file Excel. Vui lòng kiểm tra định dạng file.");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {isImporting && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center space-y-4">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                  <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Đang đồng bộ dữ liệu...</h3>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{importProgress}% HOÀN TẤT</p>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h3 className="text-lg font-bold text-slate-800">Danh sách nhân sự</h3>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx, .xls, .csv" 
            className="hidden" 
          />
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            icon={<Upload className="w-4 h-4" />}
            className="flex-1 md:flex-none border-blue-200 text-blue-700 bg-blue-50/50"
          >
            Nhập Excel
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleExportExcel} 
            icon={<Download className="w-4 h-4" />}
            className="flex-1 md:flex-none"
          >
            Xuất Excel
          </Button>
          <Button 
            size="sm" 
            onClick={() => handleOpenModal()} 
            icon={<Plus className="w-4 h-4" />}
            className="flex-1 md:flex-none"
          >
            Thêm nhân sự
          </Button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-widest border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left w-24 sticky left-0 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-20">Thao tác</th>
                <th className="px-4 py-3 w-28 hidden md:table-cell">MSNV</th>
                <th className="px-4 py-3">Họ và Tên</th>
                <th className="px-4 py-3 hidden md:table-cell">Chức vụ</th>
                <th className="px-4 py-3 hidden lg:table-cell">Nơi làm việc</th>
                <th className="px-4 py-3 hidden sm:table-cell">Tình trạng</th>
                <th className="px-4 py-3 hidden xl:table-cell">Ngày nhận việc</th>
                <th className="px-4 py-3 hidden xl:table-cell">Trình độ</th>
                <th className="px-4 py-3 hidden xl:table-cell">Ghi chú</th>
                <th className="px-4 py-3">Vai trò HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-10">
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => handleOpenModal(user)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { if(window.confirm('Xóa nhân sự này?')) onDeleteUser(user.id) }}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-30"
                        disabled={user.username === 'admin'} 
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-blue-600 hidden md:table-cell">
                    {user.msnv || '---'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={user.avatar} alt="" className="w-8 h-8 rounded-full border border-slate-200 object-cover bg-slate-100" />
                      <div className="overflow-hidden">
                        <div className="font-bold text-slate-800 truncate max-w-[150px]">{user.name}</div>
                        <div className="text-[10px] text-slate-400">@{user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-600 hidden md:table-cell">{user.position || '---'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{user.workLocation || '---'}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${getStatusBadge(user.status)}`}>
                      {user.status || 'Đang làm việc'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono hidden xl:table-cell">{user.joinDate || '---'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{user.education || '---'}</td>
                  <td className="px-4 py-3 max-w-[150px] truncate italic text-slate-400 hidden xl:table-cell">{user.notes || '---'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${getRoleBadge(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                  <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400 italic">
                          Chưa có dữ liệu nhân sự. Sử dụng nút Nhập Excel hoặc Thêm nhân sự để bắt đầu.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List View (No Horizontal Scroll) */}
      <div className="md:hidden space-y-3">
        {users.map(user => (
            <div key={user.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border border-slate-200 object-cover bg-slate-100" />
                        <div>
                            <div className="font-bold text-slate-800 text-sm">{user.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{user.msnv || '---'} | @{user.username}</div>
                        </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${getRoleBadge(user.role)}`}>
                      {user.role}
                    </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Chức vụ</span>
                        <span className="font-medium text-slate-700">{user.position || '---'}</span>
                    </div>
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Tình trạng</span>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-0.5 ${getStatusBadge(user.status)}`}>
                            {user.status || 'Đang làm việc'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button 
                        onClick={() => handleOpenModal(user)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs active:scale-95 transition-all"
                    >
                        <Edit2 className="w-3.5 h-3.5" /> Sửa
                    </button>
                    <button 
                        onClick={() => { if(window.confirm('Xóa nhân sự này?')) onDeleteUser(user.id) }}
                        disabled={user.username === 'admin'}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-50 text-red-600 font-bold text-xs active:scale-95 transition-all disabled:opacity-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Xóa
                    </button>
                </div>
            </div>
        ))}
        {users.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic bg-white rounded-xl border border-dashed border-slate-200">
                Chưa có dữ liệu.
            </div>
        )}
      </div>

      {/* Modal - Optimized for mobile */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center md:p-4 overflow-hidden">
          <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in duration-300">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                    <UserIcon className="w-5 h-5 text-blue-600"/> 
                    {editingUser ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự mới'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform">
                    <X className="w-6 h-6"/>
                </button>
             </div>

             <div className="overflow-y-auto p-4 md:p-6 space-y-6 flex-1 no-scrollbar pb-24 md:pb-6">
                <div className="space-y-4">
                   <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex flex-col items-center gap-3 shrink-0">
                         <div 
                           onClick={() => avatarInputRef.current?.click()}
                           className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-slate-100 bg-slate-50 shadow-inner flex items-center justify-center overflow-hidden cursor-pointer relative group transition-all hover:border-blue-200"
                         >
                            {formData.avatar ? (
                               <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                               <div className="flex flex-col items-center text-slate-300">
                                  <ImageIcon className="w-8 h-8" />
                                  <span className="text-[8px] font-black uppercase mt-1">Ảnh đại diện</span>
                               </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                               <Camera className="w-6 h-6 text-white" />
                            </div>
                            <input 
                              type="file" 
                              ref={avatarInputRef} 
                              className="hidden" 
                              accept="image/*" 
                              onChange={handleAvatarUpload} 
                            />
                         </div>
                         <div className="flex flex-col items-center gap-1">
                            <button 
                              onClick={() => avatarInputRef.current?.click()}
                              className="text-[10px] font-black text-blue-600 uppercase hover:underline p-1"
                            >
                               Thay đổi ảnh
                            </button>
                         </div>
                      </div>

                      <div className="flex-1 space-y-4">
                         <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 border-b border-blue-50 pb-2">
                            <Briefcase className="w-4 h-4"/> Thông tin công việc
                         </h4>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Mã nhân viên (MSNV)</label>
                                <input 
                                  type="text" 
                                  value={formData.msnv}
                                  onChange={e => setFormData({...formData, msnv: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm font-mono font-bold"
                                  placeholder="MS-000"
                                />
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Họ và Tên *</label>
                                <input 
                                  type="text" 
                                  value={formData.name}
                                  onChange={e => setFormData({...formData, name: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm font-bold"
                                  placeholder="Nhập họ và tên..."
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Chức vụ</label>
                                <input 
                                  type="text" 
                                  value={formData.position}
                                  onChange={e => setFormData({...formData, position: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                                  placeholder="QC Staff..."
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Nơi làm việc</label>
                                <input 
                                  type="text" 
                                  value={formData.workLocation}
                                  onChange={e => setFormData({...formData, workLocation: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                                  placeholder="Nhà máy / Dự án..."
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Tình trạng</label>
                                <select 
                                  value={formData.status}
                                  onChange={e => {
                                      const newStatus = e.target.value;
                                      setFormData(prev => ({
                                          ...prev, 
                                          status: newStatus,
                                          allowedModules: newStatus !== 'Đang làm việc' ? [] : prev.allowedModules
                                      }));
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm bg-white"
                                >
                                   <option value="Đang làm việc">Đang làm việc</option>
                                   <option value="Đã nghỉ việc">Đã nghỉ việc</option>
                                   <option value="Tạm nghỉ">Tạm nghỉ</option>
                                   <option value="Chuyển BP/Phòng/Ban">Chuyển BP/Phòng/Ban</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 md:contents gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày nhận việc</label>
                                    <input 
                                      type="date" 
                                      value={formData.joinDate}
                                      onChange={e => setFormData({...formData, joinDate: e.target.value})}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm font-mono"
                                    />
                                </div>
                                {formData.status !== 'Đang làm việc' && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày kết thúc</label>
                                        <input 
                                          type="date" 
                                          value={formData.endDate}
                                          onChange={e => setFormData({...formData, endDate: e.target.value})}
                                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm text-red-600 font-mono"
                                        />
                                    </div>
                                )}
                            </div>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 border-b border-blue-50 pb-2">
                           <GraduationCap className="w-4 h-4"/> Học vấn & Tài khoản
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Trình độ chuyên môn</label>
                                <input 
                                    type="text" 
                                    value={formData.education}
                                    onChange={e => setFormData({...formData, education: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                                    placeholder="Kỹ sư / Cử nhân..."
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Tên đăng nhập *</label>
                                <input 
                                    type="text" 
                                    value={formData.username}
                                    onChange={e => setFormData({...formData, username: e.target.value})}
                                    disabled={!!editingUser}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm disabled:bg-slate-100 disabled:text-slate-500"
                                    placeholder="Username"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Mật khẩu</label>
                                <input 
                                    type="password" 
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                    placeholder={editingUser ? "•••••• (Để trống nếu không đổi)" : "Nhập mật khẩu"}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                                />
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Vai trò hệ thống</label>
                                <select 
                                    value={formData.role}
                                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm bg-white font-bold"
                                >
                                    <option value="QC">QC Staff</option>
                                    <option value="QA">QA Staff</option>
                                    <option value="MANAGER">Quản lý (Manager)</option>
                                    <option value="ADMIN">Quản trị viên (Admin)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 border-b border-blue-50 pb-2">
                           <StickyNote className="w-4 h-4"/> Ghi chú nhân sự
                        </h4>
                        <textarea 
                            value={formData.notes}
                            onChange={e => setFormData({...formData, notes: e.target.value})}
                            className="w-full h-32 md:h-[155px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm resize-none"
                            placeholder="Nhập thông tin bổ sung về nhân sự..."
                        />
                    </div>
                </div>

                <div className="pt-2">
                   <div className="flex justify-between items-end mb-3">
                      <h4 className="text-xs font-black text-orange-600 uppercase tracking-widest flex items-center gap-2">
                         <Shield className="w-4 h-4"/> Phân quyền Module
                      </h4>
                      <div className="flex gap-3 text-[10px] font-black uppercase tracking-tight mb-0.5">
                         <button onClick={handleSelectAll} className="text-blue-600 hover:underline">Tất cả</button>
                         <span className="text-slate-300">|</span>
                         <button onClick={handleClearAll} className="text-slate-500 hover:text-slate-800 hover:underline">Bỏ hết</button>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {ALL_MODULES.map(module => (
                        <label key={module.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all active:scale-95 ${
                            formData.allowedModules?.includes(module.id) 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        } ${formData.status !== 'Đang làm việc' ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}>
                           <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                               formData.allowedModules?.includes(module.id)
                               ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                               : 'border-slate-300 bg-white'
                           }`}>
                               {formData.allowedModules?.includes(module.id) && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                           </div>
                           <input 
                             type="checkbox" 
                             className="hidden" 
                             checked={formData.allowedModules?.includes(module.id) || false}
                             onChange={() => toggleModule(module.id)}
                             disabled={formData.status !== 'Đang làm việc'}
                           />
                           <div className="overflow-hidden">
                              <div className="text-[11px] font-bold text-slate-800 leading-tight truncate">{module.label}</div>
                              <div className="text-[9px] text-slate-400 font-black uppercase tracking-tighter mt-0.5">{module.group}</div>
                           </div>
                        </label>
                      ))}
                   </div>
                </div>
             </div>

             <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-end gap-3 sticky bottom-0 md:relative z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:shadow-none">
                 <button 
                    onClick={() => setIsModalOpen(false)}
                    className="order-2 md:order-1 py-3 px-6 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors"
                 >
                    Hủy bỏ
                 </button>
                 <button 
                    onClick={handleSave}
                    className="order-1 md:order-2 py-3 px-8 text-sm font-black text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
                 >
                    <Save className="w-4 h-4" /> LƯU NHÂN SỰ
                 </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
