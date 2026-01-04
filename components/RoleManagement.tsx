
import React, { useState, useMemo } from 'react';
import { Role, ModuleId, PermissionAction, ModulePermission } from '../types';
import { ALL_MODULES } from '../constants';
import { Button } from './Button';
import { 
  Plus, Edit2, Trash2, X, Save, ShieldCheck, 
  Check, Lock, Info, LayoutGrid, ShieldAlert, Loader2,
  Eye, MousePointer2, FileEdit, Trash, Download, CheckSquare, Square
} from 'lucide-react';

interface RoleManagementProps {
  roles: Role[];
  onAddRole: (role: Role) => Promise<void>;
  onUpdateRole: (role: Role) => Promise<void>;
  onDeleteRole: (id: string) => Promise<void>;
}

const ACTIONS: { key: PermissionAction; label: string; icon: any }[] = [
  { key: 'VIEW', label: 'Xem', icon: Eye },
  { key: 'CREATE', label: 'Tạo', icon: Plus },
  { key: 'EDIT', label: 'Sửa', icon: FileEdit },
  { key: 'DELETE', label: 'Xóa', icon: Trash },
  { key: 'EXPORT', label: 'Xuất', icon: Download },
];

export const RoleManagement: React.FC<RoleManagementProps> = ({ roles, onAddRole, onUpdateRole, onDeleteRole }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<Role>>({
    name: '',
    description: '',
    permissions: []
  });

  const handleOpenModal = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      // Đảm bảo dữ liệu cũ (allowedModules) được chuyển đổi sang permissions nếu cần
      const initialPermissions = role.permissions || 
        (role.allowedModules || []).map(mId => ({ moduleId: mId, actions: ['VIEW', 'CREATE', 'EDIT'] as PermissionAction[] }));
      setFormData({ ...role, permissions: initialPermissions });
    } else {
      setEditingRole(null);
      setFormData({
        name: '',
        description: '',
        permissions: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert("Vui lòng nhập tên vai trò");
      return;
    }

    setIsSaving(true);
    // Đồng bộ ngược lại allowedModules để các phần khác trong app không bị sập
    const allowedModules = (formData.permissions || [])
        .filter(p => p.actions.length > 0)
        .map(p => p.moduleId);

    const roleData: Role = {
      id: editingRole ? editingRole.id : `role_${Date.now()}`,
      name: formData.name!,
      description: formData.description || '',
      permissions: formData.permissions || [],
      allowedModules,
      isSystem: editingRole?.isSystem || false
    };

    try {
        if (editingRole) {
          await onUpdateRole(roleData);
        } else {
          await onAddRole(roleData);
        }
        setIsModalOpen(false);
    } catch (error) {
        console.error("Save role failed:", error);
    } finally {
        setIsSaving(false);
    }
  };

  const togglePermission = (mId: ModuleId, action: PermissionAction) => {
    setFormData(prev => {
      const currentPerms = [...(prev.permissions || [])];
      const existingIdx = currentPerms.findIndex(p => p.moduleId === mId);
      
      if (existingIdx > -1) {
        const existing = currentPerms[existingIdx];
        const newActions = existing.actions.includes(action)
          ? existing.actions.filter(a => a !== action)
          : [...existing.actions, action];
        
        currentPerms[existingIdx] = { ...existing, actions: newActions };
      } else {
        currentPerms.push({ moduleId: mId, actions: [action] });
      }
      
      return { ...prev, permissions: currentPerms };
    });
  };

  const toggleRow = (mId: ModuleId) => {
    setFormData(prev => {
      const currentPerms = [...(prev.permissions || [])];
      const idx = currentPerms.findIndex(p => p.moduleId === mId);
      const allActions = ACTIONS.map(a => a.key);

      if (idx > -1 && currentPerms[idx].actions.length === allActions.length) {
        currentPerms[idx] = { ...currentPerms[idx], actions: [] };
      } else if (idx > -1) {
        currentPerms[idx] = { ...currentPerms[idx], actions: allActions };
      } else {
        currentPerms.push({ moduleId: mId, actions: allActions });
      }
      return { ...prev, permissions: currentPerms };
    });
  };

  const toggleColumn = (action: PermissionAction) => {
    setFormData(prev => {
      const currentPerms = [...(prev.permissions || [])];
      const allModules = ALL_MODULES.map(m => m.id);
      
      // Kiểm tra xem tất cả các module đã có action này chưa
      const isAllSet = allModules.every(mId => 
        currentPerms.find(p => p.moduleId === mId)?.actions.includes(action)
      );

      allModules.forEach(mId => {
        const idx = currentPerms.findIndex(p => p.moduleId === mId);
        if (idx > -1) {
          if (isAllSet) {
            currentPerms[idx].actions = currentPerms[idx].actions.filter(a => a !== action);
          } else if (!currentPerms[idx].actions.includes(action)) {
            currentPerms[idx].actions.push(action);
          }
        } else if (!isAllSet) {
          currentPerms.push({ moduleId: mId, actions: [action] });
        }
      });

      return { ...prev, permissions: currentPerms };
    });
  };

  const checkStatus = (mId: ModuleId, action: PermissionAction) => {
    return formData.permissions?.find(p => p.moduleId === mId)?.actions.includes(action) || false;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Cấu hình vai trò</h3>
          <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">Phân quyền chi tiết cho từng hành động</p>
        </div>
        <Button onClick={() => handleOpenModal()} icon={<Plus className="w-4 h-4" />} className="bg-blue-600 shadow-lg shadow-blue-200">
          Thêm vai trò mới
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map(role => (
          <div key={role.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-xl transition-all group animate-in fade-in zoom-in duration-300">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                {role.isSystem ? (
                   <span className="text-[9px] font-black bg-slate-100 text-slate-400 px-2 py-1 rounded-full border border-slate-200 uppercase tracking-widest">Hệ thống</span>
                ) : (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(role)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => { if(window.confirm('Xóa vai trò này?')) onDeleteRole(role.id) }} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              
              <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">{role.name}</h4>
              <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-4">{role.description || 'Không có mô tả.'}</p>
              
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto no-scrollbar">
                  {(role.permissions || []).map(p => {
                    if (p.actions.length === 0) return null;
                    return (
                      <div key={p.moduleId} className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg flex flex-col gap-0.5">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{p.moduleId}</span>
                        <div className="flex gap-0.5">
                           {p.actions.map(a => <div key={a} className="w-1.5 h-1.5 rounded-full bg-blue-500" title={a}></div>)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ID: {role.id}</span>
               <button onClick={() => handleOpenModal(role)} className="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest">Thiết lập ma trận</button>
            </div>
          </div>
        ))}
      </div>

      {/* Matrix Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-0 md:p-4 overflow-hidden">
          <div className="bg-white md:rounded-[2.5rem] shadow-2xl w-full max-w-6xl h-full md:h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                   <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                      <ShieldAlert className="w-5 h-5" />
                   </div>
                   <div>
                      <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Ma trận phân quyền</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{editingRole?.name || 'VAI TRÒ MỚI'}</p>
                   </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform"><X className="w-6 h-6"/></button>
             </div>

             <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên vai trò *</label>
                      <input 
                        type="text" 
                        value={formData.name || ''}
                        onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none font-black text-slate-800 transition-all uppercase"
                        placeholder="VD: GIÁM SÁT HIỆN TRƯỜNG"
                        disabled={editingRole?.isSystem}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mô tả nhiệm vụ</label>
                      <input 
                        type="text" 
                        value={formData.description || ''}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none font-bold text-slate-600 transition-all"
                        placeholder="Mô tả quyền hạn của vai trò này..."
                      />
                   </div>
                </div>

                {/* Permission Matrix */}
                <div className="flex-1 overflow-hidden border border-slate-200 rounded-[2rem] bg-white shadow-sm flex flex-col">
                   <div className="overflow-auto no-scrollbar">
                      <table className="w-full border-collapse">
                        <thead className="bg-slate-50/80 sticky top-0 z-20 backdrop-blur-sm border-b border-slate-100">
                          <tr>
                            <th className="p-4 text-left min-w-[200px] bg-slate-50/80 sticky left-0 z-30">
                              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Module / Chức năng</span>
                            </th>
                            {ACTIONS.map(action => (
                              <th key={action.key} className="p-4 text-center">
                                <button 
                                    onClick={() => toggleColumn(action.key)}
                                    className="flex flex-col items-center gap-1 group mx-auto"
                                >
                                  <div className="p-2 bg-white rounded-xl border border-slate-200 text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                                    <action.icon className="w-4 h-4" />
                                  </div>
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mt-1 group-hover:text-blue-600">{action.label}</span>
                                </button>
                              </th>
                            ))}
                            <th className="p-4 text-center">
                               <div className="w-6 h-6 mx-auto"></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ALL_MODULES.map(module => (
                            <tr key={module.id} className="hover:bg-blue-50/20 transition-colors group">
                              <td className="p-4 bg-white group-hover:bg-blue-50/30 sticky left-0 z-10 border-r border-slate-50">
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-xs font-black text-slate-800 uppercase truncate leading-tight">{module.label}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{module.group}</span>
                                </div>
                              </td>
                              {ACTIONS.map(action => {
                                const isSet = checkStatus(module.id, action.key);
                                return (
                                  <td key={action.key} className="p-2 text-center">
                                    <button 
                                      onClick={() => togglePermission(module.id, action.key)}
                                      className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto transition-all active:scale-90 ${
                                        isSet 
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                                        : 'bg-slate-50 text-slate-300 border border-slate-100 hover:border-blue-400 hover:text-blue-400'
                                      }`}
                                    >
                                      {isSet ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 opacity-40" />}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="p-2 text-center">
                                 <button 
                                    onClick={() => toggleRow(module.id)}
                                    className="p-2 text-slate-300 hover:text-blue-600 transition-colors"
                                    title="Chọn tất cả trong dòng"
                                 >
                                    <MousePointer2 className="w-4 h-4" />
                                 </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
             </div>

             <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-end gap-3 shrink-0">
                 <div className="hidden md:flex items-center gap-6 mr-auto px-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase">Được phép</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase">Từ chối</span>
                    </div>
                 </div>
                 <button 
                    onClick={() => setIsModalOpen(false)}
                    className="order-2 md:order-1 px-8 py-3.5 text-xs font-black text-slate-500 uppercase tracking-widest hover:text-slate-800 transition-colors"
                 >
                    Hủy bỏ
                 </button>
                 <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="order-1 md:order-2 px-10 py-3.5 bg-blue-600 text-white rounded-[1.25rem] text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                 >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                    <span>XÁC NHẬN CẤU HÌNH</span>
                 </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
