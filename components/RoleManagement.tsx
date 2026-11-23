import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Loader2,
  CheckSquare,
  AlertCircle,
  CheckCircle2,
  Lock,
  Eye,
  Users as UsersIcon,
} from 'lucide-react';
import { RoleObject, User } from '../types';
import { ALL_MODULES } from '../constants';
import { PageActions, SearchInput, ConfirmDialog } from '../src/components/qms';

interface RoleManagementProps {
  currentUser: User;
  roles: RoleObject[];
  users: User[];
  isLoading?: boolean;
  onSaveRole: (role: RoleObject) => Promise<void>;
  onDeleteRole: (id: string) => Promise<void>;
}

const ACTION_COLUMNS = [
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
  { id: 'SIGN2', title: 'SIGN2', desc: 'L2' },
];

const getModuleAllowedActions = (mid: string): string[] => {
  if (mid === 'MATERIALS' || mid === 'IPO') {
    return ['VIEW', 'VIEW_ALL', 'EXPORT'];
  }
  if (
    [
      'IQC',
      'SQC_MAT',
      'SQC_BTP',
      'SQC_TP',
      'PQC',
      'FSR',
      'STEP',
      'FQC',
      'SPR',
      'SITE',
      'LIST',
      'NCR_LIST',
      'TOOLS',
      'SUBCONTRACTOR_BOOKING',
    ].includes(mid)
  ) {
    return [
      'VIEW',
      'VIEW_ALL',
      'CREATE',
      'EDIT_OWN',
      'EDIT_ALL',
      'DELETE_OWN',
      'DELETE_ALL',
      'IMPORT',
      'EXPORT',
      'SIGN1',
      'SIGN2',
    ];
  }
  if (
    [
      'PROJECTS',
      'SUPPLIERS',
      'DEFECT_LIBRARY',
      'SETTINGS_USERS',
      'SETTINGS_ROLES',
      'SETTINGS_WORKSHOPS',
      'SETTINGS_DEPARTMENTS',
      'SETTINGS_TEMPLATE',
    ].includes(mid)
  ) {
    return ['VIEW', 'VIEW_ALL', 'CREATE', 'EDIT_OWN', 'EDIT_ALL', 'DELETE_OWN', 'DELETE_ALL', 'IMPORT', 'EXPORT'];
  }
  if (mid === 'SYSTEM_ADMIN') {
    return ['VIEW', 'CREATE', 'EDIT_ALL', 'DELETE_ALL'];
  }
  return ['VIEW', 'VIEW_ALL'];
};

const normalizePermissionsList = (raw: any): Array<{ moduleId: string; actions: string[] }> => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && p.moduleId && Array.isArray(p.actions) && p.actions.length > 0)
    .map((p) => ({
      moduleId: String(p.moduleId),
      actions: Array.from(new Set(p.actions.map((a: any) => String(a).toUpperCase().trim()))),
    }));
};

export const RoleManagement: React.FC<RoleManagementProps> = ({
  currentUser,
  roles,
  users,
  isLoading = false,
  onSaveRole,
  onDeleteRole,
}) => {
  const canMutate = String(currentUser?.role || '').toUpperCase().trim() === 'ADMIN';
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleObject | null>(null);
  const [roleIdInput, setRoleIdInput] = useState('');
  const [roleNameInput, setRoleNameInput] = useState('');
  const [roleDescInput, setRoleDescInput] = useState('');
  const [permissionsState, setPermissionsState] = useState<Array<{ moduleId: string; actions: string[] }>>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RoleObject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const groupedModules = useMemo(() => {
    const grouped: Record<string, typeof ALL_MODULES> = {};
    ALL_MODULES.forEach((m) => {
      if (!grouped[m.group]) grouped[m.group] = [];
      grouped[m.group].push(m);
    });
    return Object.entries(grouped);
  }, []);

  const userCountByRole = useMemo(() => {
    const counts = new Map<string, number>();
    users.forEach((u) => {
      const rKey = String(u.role || '').trim().toUpperCase();
      if (!rKey) return;
      counts.set(rKey, (counts.get(rKey) || 0) + 1);
    });
    return counts;
  }, [users]);

  const getRoleUserCount = (role: RoleObject) => {
    const idKey = String(role.id || '').trim().toUpperCase();
    const nameKey = String(role.name || '').trim().toUpperCase();
    const countId = userCountByRole.get(idKey) || 0;
    const countName = nameKey && nameKey !== idKey ? userCountByRole.get(nameKey) || 0 : 0;
    return countId + countName;
  };

  const isCoreAdminRole = (role: RoleObject) => {
    const idUp = String(role.id || '').trim().toUpperCase();
    const nameUp = String(role.name || '').trim().toUpperCase();
    return idUp === 'ADMIN' || nameUp === 'ADMIN' || nameUp === 'SYSTEM ADMIN';
  };

  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        String(r.id || '').toLowerCase().includes(q) ||
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.description || '').toLowerCase().includes(q)
    );
  }, [roles, searchQuery]);

  const handleOpenModal = (role?: RoleObject) => {
    setModalError(null);
    if (role) {
      setEditingRole(role);
      setRoleIdInput(String(role.id || ''));
      setRoleNameInput(String(role.name || ''));
      setRoleDescInput(String(role.description || ''));
      setPermissionsState(normalizePermissionsList(role.permissions));
    } else {
      setEditingRole(null);
      setRoleIdInput('');
      setRoleNameInput('');
      setRoleDescInput('');
      setPermissionsState([]);
    }
    setIsModalOpen(true);
  };

  const toggleAction = (moduleId: string, action: string) => {
    if (!canMutate) return;
    setPermissionsState((prev) => {
      const next = [...prev];
      const idx = next.findIndex((p) => String(p.moduleId).toUpperCase() === String(moduleId).toUpperCase());
      const allowed = getModuleAllowedActions(moduleId);
      if (!allowed.includes(action)) return prev;

      if (idx > -1) {
        const cur = next[idx].actions || [];
        let updated: string[];
        if (cur.includes(action)) {
          updated = cur.filter((a) => a !== action);
          if (action === 'EDIT_OWN') updated = updated.filter((a) => a !== 'EDIT_ALL');
          if (action === 'DELETE_OWN') updated = updated.filter((a) => a !== 'DELETE_ALL');
        } else {
          updated = [...cur, action];
          if (action === 'EDIT_ALL' && !updated.includes('EDIT_OWN')) updated.push('EDIT_OWN');
          if (action === 'DELETE_ALL' && !updated.includes('DELETE_OWN')) updated.push('DELETE_OWN');
        }
        next[idx] = { ...next[idx], actions: updated };
      } else {
        const created = [action];
        if (action === 'EDIT_ALL') created.push('EDIT_OWN');
        if (action === 'DELETE_ALL') created.push('DELETE_OWN');
        next.push({ moduleId, actions: created });
      }
      return next.filter((p) => p.actions.length > 0);
    });
  };

  const handleGrantAllView = () => {
    if (!canMutate) return;
    setPermissionsState(
      ALL_MODULES.filter((m) => m.id !== 'SYSTEM_ADMIN').map((m) => ({
        moduleId: m.id,
        actions: ['VIEW'],
      }))
    );
  };

  const handleClearMatrix = () => {
    if (!canMutate) return;
    setPermissionsState([]);
  };

  const handleSave = async () => {
    if (!canMutate) return;
    const cleanName = roleNameInput.trim();
    const cleanId = (editingRole ? editingRole.id : roleIdInput.trim().toUpperCase().replace(/\s+/g, '_'));
    if (!cleanName) {
      setModalError('Vui lòng nhập Tên vai trò.');
      return;
    }
    if (!editingRole && !cleanId) {
      setModalError('Vui lòng nhập Mã vai trò (VD: QC_LEAD, QA_STAFF).');
      return;
    }

    setIsSaving(true);
    setModalError(null);
    try {
      const allowedModules = permissionsState
        .filter((p) => p.actions.length > 0)
        .map((p) => p.moduleId);
      const payload: RoleObject = {
        ...(editingRole || {}),
        id: cleanId,
        name: cleanName,
        description: roleDescInput.trim(),
        permissions: permissionsState,
        allowedModules,
      };
      await onSaveRole(payload);
      setIsModalOpen(false);
      setFeedback({
        type: 'success',
        message: editingRole
          ? `Đã cập nhật vai trò "${cleanName}" thành công.`
          : `Đã tạo vai trò "${cleanName}" thành công.`,
      });
    } catch (err: any) {
      setModalError(err?.message || 'Không thể lưu vai trò. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !canMutate) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      await onDeleteRole(deleteTarget.id);
      setFeedback({
        type: 'success',
        message: `Đã xóa vai trò "${deleteTarget.name}" thành công.`,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Không thể xóa vai trò này.',
      });
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const modalNode = isModalOpen ? (
    <div
      className="fixed inset-0 z-[220] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Compact Modal Header */}
        <div className="px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-blue-600 text-white rounded-lg shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight text-sm truncate">
              {!canMutate
                ? `Chi tiết vai trò: ${editingRole?.name}`
                : editingRole
                ? `Chỉnh sửa vai trò: ${editingRole.name}`
                : 'Tạo vai trò phân quyền mới'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-slate-50/40 dark:bg-slate-900">
          {modalError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {!canMutate && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Chế độ chỉ xem: Chỉ tài khoản ADMIN mới được phép chỉnh sửa cấu hình vai trò.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block">
                Mã vai trò *
              </label>
              <input
                type="text"
                value={roleIdInput}
                disabled={Boolean(editingRole) || !canMutate}
                onChange={(e) => setRoleIdInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="VD: QC_LEAD"
                className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono font-bold uppercase text-slate-900 dark:text-slate-100 disabled:opacity-60 outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block">
                Tên vai trò *
              </label>
              <input
                type="text"
                value={roleNameInput}
                disabled={!canMutate}
                onChange={(e) => setRoleNameInput(e.target.value)}
                placeholder="VD: Tổ trưởng QC"
                className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-slate-100 disabled:opacity-60 outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block">
                Mô tả vai trò
              </label>
              <input
                type="text"
                value={roleDescInput}
                disabled={!canMutate}
                onChange={(e) => setRoleDescInput(e.target.value)}
                placeholder="Phạm vi trách nhiệm chính..."
                className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 disabled:opacity-60 outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
                  Ma trận Phân quyền Chuẩn theo Vai trò
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Module Vật liệu (M08) và IPO (M10) luôn khóa ở chế độ Read-Only (chỉ Xem / Xuất).
                </p>
              </div>
              {canMutate && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleGrantAllView}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    Cấp tất cả Xem (VIEW)
                  </button>
                  <button
                    type="button"
                    onClick={handleClearMatrix}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Xóa trắng
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2.5 sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 min-w-[200px]">
                      Phân hệ / Module
                    </th>
                    {ACTION_COLUMNS.map((act) => (
                      <th key={act.id} className="px-1.5 py-2 text-center whitespace-nowrap">
                        <div className="text-[10px] font-bold">{act.title}</div>
                        <div className="text-[9px] font-normal text-slate-500 dark:text-slate-400 lowercase">
                          ({act.desc})
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {groupedModules.map(([groupName, mods]) => (
                    <React.Fragment key={groupName}>
                      <tr className="bg-slate-50 dark:bg-slate-800/50">
                        <td
                          colSpan={ACTION_COLUMNS.length + 1}
                          className="px-3 py-1.5 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-y border-slate-200/70 dark:border-slate-800"
                        >
                          {groupName}
                        </td>
                      </tr>
                      {mods.map((m) => {
                        const allowedActions = getModuleAllowedActions(m.id);
                        const permObj = permissionsState.find(
                          (p) => String(p.moduleId).toUpperCase() === String(m.id).toUpperCase()
                        );
                        return (
                          <tr
                            key={m.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="px-3 py-2 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800">
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {m.label}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">{m.id}</div>
                            </td>
                            {ACTION_COLUMNS.map((act) => {
                              if (!allowedActions.includes(act.id)) {
                                return (
                                  <td key={act.id} className="px-1.5 py-2 text-center text-slate-300 dark:text-slate-700">
                                    —
                                  </td>
                                );
                              }
                              const isChecked = permObj?.actions?.includes(act.id) || false;
                              return (
                                <td key={act.id} className="px-1 py-1.5 text-center">
                                  <div className="flex justify-center">
                                    <button
                                      type="button"
                                      disabled={!canMutate}
                                      onClick={() => toggleAction(m.id, act.id)}
                                      aria-label={`${m.label} - ${act.title}`}
                                      className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-md transition-colors ${
                                        !canMutate
                                          ? 'cursor-default opacity-80'
                                          : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30'
                                      }`}
                                    >
                                      <span
                                        className={`w-5 h-5 lg:w-4 lg:h-4 rounded border flex items-center justify-center transition-colors ${
                                          isChecked
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-transparent'
                                        }`}
                                      >
                                        {isChecked && <CheckSquare className="w-3.5 h-3.5 lg:w-3 lg:h-3" />}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Compact Modal Footer */}
        <div className="px-4 py-2 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {canMutate ? 'Hủy bỏ' : 'Đóng'}
          </button>
          {canMutate && (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? 'Đang lưu...' : 'Lưu vai trò'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <PageActions
        title="Quản lý Vai trò & Phân quyền"
        subtitle="Danh mục vai trò chuẩn và ma trận phân quyền mặc định áp dụng nhanh khi tạo hoặc phân bổ nhân sự."
        totalCount={filteredRoles.length}
        countLabel="vai trò"
        icon={<Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
        actions={
          canMutate ? (
            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo vai trò mới</span>
            </button>
          ) : undefined
        }
      />

      {!canMutate && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2.5">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Chế độ chỉ xem: Bạn có thể kiểm tra ma trận quyền từng vai trò, chỉ ADMIN mới được thêm, sửa hoặc xóa vai trò.</span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Đóng thông báo"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Tìm theo mã vai trò, tên vai trò hoặc mô tả..."
          className="w-full sm:max-w-md"
        />
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2.5 whitespace-nowrap">Mã vai trò</th>
              <th className="px-3 py-2.5 whitespace-nowrap">Tên vai trò</th>
              <th className="px-3 py-2.5">Mô tả</th>
              <th className="px-3 py-2.5 text-center whitespace-nowrap">Nhân sự</th>
              <th className="px-3 py-2.5 text-center whitespace-nowrap">Số Module</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-3 py-3">
                    <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : filteredRoles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400">
                  Không tìm thấy vai trò phù hợp.
                </td>
              </tr>
            ) : (
              filteredRoles.map((role) => {
                const isCore = isCoreAdminRole(role);
                const assignedCount = getRoleUserCount(role);
                const moduleCount = normalizePermissionsList(role.permissions).length;
                return (
                  <tr
                    key={role.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {role.id}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{role.name}</span>
                        {isCore && (
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Cốt lõi
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {role.description || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {assignedCount}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {moduleCount}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(role)}
                          className="min-w-[34px] min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          {canMutate ? <Edit2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{canMutate ? 'Sửa' : 'Xem'}</span>
                        </button>
                        {canMutate && (
                          <button
                            type="button"
                            disabled={isCore || assignedCount > 0}
                            title={
                              isCore
                                ? 'Không thể xóa vai trò quản trị ADMIN'
                                : assignedCount > 0
                                ? `Đang có ${assignedCount} nhân sự sử dụng vai trò này`
                                : 'Xóa vai trò'
                            }
                            onClick={() => setDeleteTarget(role)}
                            className="min-w-[34px] min-h-[34px] p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2.5">
        {filteredRoles.map((role) => {
          const isCore = isCoreAdminRole(role);
          const assignedCount = getRoleUserCount(role);
          const moduleCount = normalizePermissionsList(role.permissions).length;
          return (
            <div
              key={role.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                    <span>{role.name}</span>
                    {isCore && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        Cốt lõi
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-blue-600 dark:text-blue-400 mt-0.5">{role.id}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md shrink-0">
                  <UsersIcon className="w-3.5 h-3.5" />
                  {assignedCount}
                </span>
              </div>

              {role.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400">{role.description}</p>
              )}

              <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {moduleCount} module được cấu hình quyền
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleOpenModal(role)}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-semibold"
                >
                  {canMutate ? <Edit2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{canMutate ? 'Sửa ma trận quyền' : 'Xem ma trận quyền'}</span>
                </button>
                {canMutate && (
                  <button
                    type="button"
                    disabled={isCore || assignedCount > 0}
                    onClick={() => setDeleteTarget(role)}
                    className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-semibold disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredRoles.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Không tìm thấy vai trò phù hợp.
          </div>
        )}
      </div>

      {typeof document !== 'undefined' && modalNode ? createPortal(modalNode, document.body) : modalNode}

      <ConfirmDialog
        open={deleteTarget !== null}
        variant="danger"
        title="Xác nhận xóa vai trò"
        message={
          deleteTarget
            ? `Bạn có chắc chắn muốn xóa vai trò "${deleteTarget.name}" (${deleteTarget.id})?`
            : ''
        }
        confirmLabel="Xóa vai trò"
        cancelLabel="Hủy"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
