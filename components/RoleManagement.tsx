
import React, { useState, useMemo } from 'react';
import { Role, ModuleId, PermissionAction, ModulePermission } from '../types';
import { ALL_MODULES } from '../constants';
import { Button } from './Button';
import { 
  Plus, Edit2, Trash2, X, Save, ShieldCheck, 
  Check, Lock, Info, LayoutGrid, ShieldAlert, Loader2,
  Eye, MousePointer2, FileEdit, Trash, Download, CheckSquare, Square,
  Copy, Layers, ChevronRight, Search
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

const ToggleSwitch: React.FC<{ 
    enabled: boolean; 
    onChange: () => void; 
    disabled?: boolean;
    size?: 'sm' | 'md' 
}> = ({ enabled, onChange, disabled, size = 'md' }) => (
    <button
        onClick={(e) => { e.stopPropagation(); if(!disabled) onChange(); }}
        disabled={disabled}
        className={`
            relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none 
            ${enabled ? 'bg-blue-600' : 'bg-slate-200'}
            ${size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'}
            ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        `}
    >
        <span
            className={`
                inline-block transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm
                ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'}
                ${enabled 
                    ? (size === 'sm' ? 'translate-x-4.5' : 'translate-x-5.5') 
                    : 'translate-x-1'}
            `}
            style={{ 
                width: size === 'sm' ? '14px' : '18px', 
                height: size === 'sm' ? '14px' : '18px',
                transform: enabled 
                    ? `translateX(${size === 'sm' ? '18px' : '24px'})` 
                    : 'translateX(4px)' 
            }}
        />
    </button>
);

export const RoleManagement: React.FC<RoleManagementProps> = ({ roles, onAddRole, onUpdateRole, onDeleteRole }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<Partial<Role>>({
    name: '',
    description: '',
    permissions: []
  });

  const filteredRoles = useMemo(() => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) return roles;
      return roles.filter(r => 
        r.name.toLowerCase().includes(term) || 
        r.description.toLowerCase().includes(term) ||
        r.id.toLowerCase().includes(term)
      );
  }, [roles, searchTerm]);

  const handleOpenModal = (role?: Role, isClone = false) => {
    if (role) {
      const initialPermissions = role.permissions || 
        (role.allowedModules || []).map(mId => ({ moduleId: mId, actions: ['VIEW', 'CREATE', 'EDIT'] as PermissionAction[] }));
      
      if (isClone) {
          setEditingRole(null);
          setFormData({ 
              name: `${role.name} (Copy)`, 
              description: role.description, 
              permissions: JSON.parse(JSON.stringify(initialPermissions)) 
          });
      } else {
          setEditingRole(role);
          setFormData({ ...role, permissions: initialPermissions });
      }
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-600" />
            Quản lý Vai trò & Phân quyền
          </h3>
          <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">Thiết lập ma trận quyền hạn ISO 9001</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Tìm vai trò..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                />
            </div>
            <Button onClick={() => handleOpenModal()} icon={<Plus className="w-4 h-4" />} className="bg-blue-600 shadow-lg shadow-blue-200 shrink-0">
                <span className="hidden sm:inline">Thêm vai trò</span>
                <span className="sm:hidden">Thêm</span>
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRoles.map(role => (
          <div key={role.id} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-xl transition-all group animate-in zoom-in duration-300">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    {!role.isSystem && (
                        <>
                            <button onClick={() => handleOpenModal(role)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="Chỉnh sửa"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => { if(window.confirm('Xóa vai trò này?')) onDeleteRole(role.id) }} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Xóa"><Trash2 className="w-4 h-4" /></button>
                        </>
                    )}
                    <button onClick={() => handleOpenModal(role, true)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title="Nhân bản"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">{role.name}</h4>
                  {role.isSystem && <span className="text-[8px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">System</span>}
              </div>
              <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-6 leading-relaxed italic">
                  {role.description || 'Chưa có mô tả chi tiết cho vai trò này.'}
              </p>
              
              <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <span>Module truy cập</span>
                      <span className="text-blue-600">{role.permissions?.length || 0}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto no-scrollbar scroll-smooth">
                      {(role.permissions || []).map(p => {
                        if (p.actions.length === 0) return null;
                        return (
                          <div key={p.moduleId} className="px-2 py-1.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2 group/tag hover:bg-white hover:border-blue-200 transition-colors">
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">{p.moduleId}</span>
                            <div className="flex gap-0.5">
                               {p.actions.map(a => (
                                   <div key={a} className="w-1 h-1 rounded-full bg-blue-500/40" title={a}></div>
                               ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
               <div className="flex flex-col">
                   <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">IDENTIFIER</span>
                   <span className="text-[10px] font-mono font-bold text-slate-400">{role.id}</span>
               </div>
               <button onClick={() => handleOpenModal(role)} className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors group/btn">
                   Thiết lập <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
               </button>
            </div>
          </div>
        ))}

        {/* Empty State Card */}
        <div 
            onClick={() => handleOpenModal()}
            className="rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-8 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all cursor-pointer group"
        >
            <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="w-8 h-8" />
            </div>
            <p className="font-black uppercase tracking-widest text-xs">Thêm vai trò mới</p>
            <p className="text-[10px] font-medium mt-1">Cấu hình ma trận quyền hạn mới</p>
        </div>
      </div>

      {/* Matrix Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-0 md:p-4 overflow-hidden">
          <div className="bg-white md:rounded-[3rem] shadow-2xl w-full max-w-6xl h-full md:h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100">
                      <ShieldAlert className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tighter text-xl">Cấu hình Ma trận Quyền hạn</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">
                        {editingRole ? `Editing: ${editingRole.name}` : 'Creating New Custom Role'}
                      </p>
                   </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-2xl active:scale-90 transition-all"><X className="w-6 h-6"/></button>
             </div>

             <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-8 space-y-8 bg-slate-50/30">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 shrink-0">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên vai trò (Role Name) *</label>
                      <input 
                        type="text" 
                        value={formData.name || ''}
                        onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                        className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-slate-800 transition-all uppercase shadow-sm"
                        placeholder="VD: QUẢN LÝ DỰ ÁN CẤP CAO"
                        disabled={editingRole?.isSystem}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mô tả vai trò</label>
                      <input 
                        type="text" 
                        value={formData.description || ''}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-600 transition-all shadow-sm"
                        placeholder="Ghi chú trách nhiệm của vị trí này..."
                      />
                   </div>
                </div>

                {/* Legend & Bulk Controls */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Được phép (Allowed)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Từ chối (Denied)</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Info className="w-4 h-4 text-slate-300" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase italic">Mẹo: Click tiêu đề cột/dòng để chọn nhanh tất cả</span>
                    </div>
                </div>

                {/* Permission Matrix Table */}
                <div className="flex-1 overflow-hidden border border-slate-200 rounded-[2.5rem] bg-white shadow-xl flex flex-col">
                   <div className="overflow-auto no-scrollbar">
                      <table className="w-full border-collapse">
                        <thead className="bg-slate-900 text-white sticky top-0 z-30 border-b border-white/10">
                          <tr>
                            <th className="p-6 text-left min-w-[240px] bg-slate-900 sticky left-0 z-40">
                              <div className="flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-blue-400" />
                                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">Module Hệ Thống</span>
                              </div>
                            </th>
                            {ACTIONS.map(action => (
                              <th key={action.key} className="p-4 text-center">
                                <button 
                                    onClick={() => toggleColumn(action.key)}
                                    className="flex flex-col items-center gap-2 group mx-auto transition-all active:scale-95"
                                >
                                  <div className="p-2.5 bg-white/10 rounded-xl text-white/60 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                                    <action.icon className="w-4 h-4" />
                                  </div>
                                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white">{action.label}</span>
                                </button>
                              </th>
                            ))}
                            <th className="p-4 text-center w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ALL_MODULES.map((module, mIdx) => (
                            <tr key={module.id} className={`${mIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/40 transition-colors group`}>
                              <td className={`p-5 sticky left-0 z-20 border-r border-slate-100 shadow-[5px_0_15px_rgba(0,0,0,0.02)] transition-colors ${mIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} group-hover:bg-blue-50/40`}>
                                <button 
                                    onClick={() => toggleRow(module.id)}
                                    className="flex flex-col items-start gap-0.5 text-left w-full group/row"
                                >
                                  <span className="text-[13px] font-black text-slate-800 uppercase tracking-tight group-hover/row:text-blue-700 transition-colors">{module.label}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest opacity-60">{module.group}</span>
                                </button>
                              </td>
                              {ACTIONS.map(action => {
                                const isSet = checkStatus(module.id, action.key);
                                return (
                                  <td key={action.key} className="p-3 text-center">
                                    <div className="flex items-center justify-center">
                                        <ToggleSwitch 
                                            enabled={isSet} 
                                            onChange={() => togglePermission(module.id, action.key)} 
                                        />
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="p-3 text-center">
                                 <button 
                                    onClick={() => toggleRow(module.id)}
                                    className="p-2.5 text-slate-300 hover:text-blue-600 hover:bg-white rounded-xl transition-all active:scale-90"
                                    title="Chọn toàn bộ dòng"
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

             <div className="p-6 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.04)] z-10">
                 <button 
                    onClick={() => setIsModalOpen(false)}
                    className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                 >
                    Hủy thiết lập
                 </button>
                 <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="order-1 md:order-2 px-12 py-4 bg-blue-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-[0.25em] shadow-2xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                 >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                    <span>LƯU CẤU HÌNH VAI TRÒ</span>
                 </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
