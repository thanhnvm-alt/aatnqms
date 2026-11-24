import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User, ToolCatalog, ToolAsset, ToolTransfer, ToolCalibration, RoleObject, hasPermission } from '../types';
import {
  fetchToolCatalogs,
  saveToolCatalog,
  deleteToolCatalog,
  fetchToolAssets,
  fetchToolAssetsByCatalog,
  saveToolAsset,
  deleteToolAsset,
  fetchToolTransfers,
  saveToolTransfer,
  fetchToolCalibrations,
  saveToolCalibration,
  uploadQMSImage,
  fetchRoles,
  fetchUsers,
} from '../services/apiService';
import {
  Plus,
  Search,
  Wrench,
  Edit,
  Trash2,
  ArrowRightLeft,
  FileText,
  FileBadge,
  CheckCircle,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  BookOpen,
  Hash,
  ChevronDown,
  Upload,
  Download,
  Filter,
  X,
  AlertCircle,
  RotateCcw,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { SignaturePad } from './SignaturePad';
import { getProxyImageUrl } from '../src/utils';
import { Combobox, ConfirmDialog } from '../src/components/qms';

function getExplicitToolsActions(user: User, roles: Array<RoleObject | any>): string[] | null {
  const rawPerms = (user as any).userPermissions || (user as any).user_permissions || (user as any).permissions;
  let userPerms: any[] = [];
  if (typeof rawPerms === 'string') {
    try {
      userPerms = JSON.parse(rawPerms);
    } catch {
      userPerms = [];
    }
  } else if (Array.isArray(rawPerms)) {
    userPerms = rawPerms;
  }

  let matched = userPerms.filter((p) => String(p?.moduleId || '').toUpperCase().trim() === 'TOOLS');
  if (matched.length === 0 && userPerms.length === 0 && Array.isArray(roles) && roles.length > 0) {
    const roleUpper = String(user.role || '').toUpperCase().trim();
    const matchedRole = roles.find(
      (r: any) =>
        r &&
        typeof r === 'object' &&
        (String(r.id || '').toUpperCase() === roleUpper || String(r.name || '').toUpperCase() === roleUpper)
    );
    if (matchedRole && Array.isArray(matchedRole.permissions)) {
      matched = matchedRole.permissions.filter((p: any) => String(p?.moduleId || '').toUpperCase().trim() === 'TOOLS');
    }
  }

  if (matched.length === 0) return null;
  const actions: string[] = [];
  for (const m of matched) {
    if (Array.isArray(m?.actions)) {
      for (const a of m.actions) actions.push(String(a || '').toUpperCase().trim());
    }
  }
  return actions;
}

function computeCanManageTools(user: User, roles: Array<RoleObject | any>): boolean {
  if (!user) return false;
  const roleUpper = String(user.role || '').toUpperCase().trim();
  if (roleUpper === 'GUEST') return false;
  if (roleUpper === 'ADMIN') return true;
  if (hasPermission(user, roles, 'SYSTEM_ADMIN', 'CREATE') || hasPermission(user, roles, 'SYSTEM_ADMIN', 'EDIT')) {
    return true;
  }
  if (['MANAGER', 'QA', 'QC_LEAD', 'LEAD_QC'].includes(roleUpper) || Boolean((user as any).la_to_truong)) {
    return true;
  }
  const explicit = getExplicitToolsActions(user, roles);
  if (explicit !== null) {
    return explicit.some((a) => ['CREATE', 'EDIT', 'EDIT_ALL', 'DELETE', 'DELETE_ALL', 'SIGN1', 'SIGN2'].includes(a));
  }
  return false;
}

function computeCanDeleteTools(user: User, roles: Array<RoleObject | any>): boolean {
  if (!user) return false;
  const roleUpper = String(user.role || '').toUpperCase().trim();
  if (roleUpper === 'ADMIN') return true;
  if (hasPermission(user, roles, 'SYSTEM_ADMIN', 'DELETE')) return true;
  const explicit = getExplicitToolsActions(user, roles);
  if (explicit !== null) {
    return explicit.some((a) => ['DELETE', 'DELETE_ALL'].includes(a));
  }
  return false;
}

function formatUnixDate(ts: number | string | null | undefined): string {
  if (!ts) return '---';
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return '---';
  return new Date(num * 1000).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function formatUnixDateInputValue(ts: number | string | null | undefined): string {
  if (!ts) return '';
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return '';
  const d = new Date(num * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface QCSelectionComboboxProps {
  label: string;
  value: string;
  onChange: (userId: string) => void;
  users: User[];
  disabled?: boolean;
  warehouseValue?: string;
}

const QCSelectionCombobox: React.FC<QCSelectionComboboxProps> = ({
  label,
  value,
  onChange,
  users,
  disabled,
  warehouseValue = '',
}) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectableUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users]);

  const isWarehouseSelected = useMemo(() => {
    if (warehouseValue && String(value || '').toUpperCase() === warehouseValue.toUpperCase()) return true;
    return !warehouseValue && !value;
  }, [value, warehouseValue]);

  const selectedUser = useMemo(() => {
    if (!value || String(value).toUpperCase() === 'KHO_TONG') return undefined;
    return users.find((u) => u.id === value || u.username === value || u.msnv === value);
  }, [users, value]);

  const filtered = useMemo(() => {
    const removeAccents = (str: string) =>
      str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const q = removeAccents(search.trim());
    if (!q) return selectableUsers;
    return selectableUsers.filter((u) => {
      const name = removeAccents(u.name || '');
      const msnv = removeAccents(u.msnv || '');
      const id = removeAccents(u.id || '');
      const username = removeAccents(u.username || '');
      const pos = removeAccents(u.position || '');
      return name.includes(q) || msnv.includes(q) || id.includes(q) || username.includes(q) || pos.includes(q);
    });
  }, [selectableUsers, search]);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  const getQCUserLabel = (u: User) => {
    const msnvStr = u.msnv ? `[${u.msnv}] ` : u.username ? `[${u.username}] ` : `[${u.id}] `;
    let roleStr = u.role?.toString() || 'USER';
    if (roleStr === 'LEAD_QC' || roleStr === 'QC_LEAD') roleStr = 'Lead QC';
    else if (roleStr === 'QC') roleStr = 'QC';
    const pos = u.position ? ` - ${u.position}` : '';
    return `${msnvStr}${u.name} (${roleStr}${pos})`;
  };

  return (
    <div className="relative space-y-1.5 w-full" ref={dropdownRef}>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-center text-left transition min-h-[44px] sm:min-h-[38px] ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer'
        }`}
      >
        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
          {selectedUser
            ? getQCUserLabel(selectedUser)
            : isWarehouseSelected && warehouseValue
              ? 'Kho Tổng (Thu hồi / Lưu kho)'
              : value && warehouseValue
                ? value
                : '--- CHỌN NHÂN VIÊN / KHO TỔNG ---'}
        </span>
        {!disabled && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 max-h-64 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, MSNV, vị trí..."
              className="w-full min-h-[44px] sm:min-h-[36px] px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-600 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 no-scrollbar">
            <button
              type="button"
              onClick={() => {
                onChange(warehouseValue);
                setIsOpen(false);
                setSearch('');
              }}
              className="w-full text-left min-h-[44px] sm:min-h-[36px] flex items-center px-4 py-2 text-xs font-bold cursor-pointer bg-slate-50 dark:bg-slate-900/60 text-blue-600 dark:text-blue-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              - THU HỒI / TRẢ VỀ KHO TỔNG -
            </button>
            {filtered.length > 0 ? (
              filtered.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    onChange(u.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left min-h-[44px] sm:min-h-[36px] flex items-center px-4 py-2 text-xs font-semibold cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                    u.id === value
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-900/20'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {getQCUserLabel(u)}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 font-semibold">Không tìm thấy nhân viên nào.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ToolsManagementProps {
  user: User;
}

export const ToolsManagement: React.FC<ToolsManagementProps> = ({ user }) => {
  const [roles, setRoles] = useState<Array<RoleObject | any>>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const canManageTools = useMemo(() => computeCanManageTools(user, roles), [user, roles]);
  const canDeleteTools = useMemo(() => computeCanDeleteTools(user, roles), [user, roles]);

  const [hasUserSwitchedTab, setHasUserSwitchedTab] = useState(false);
  const [activeTab, setActiveTab] = useState<'KHO' | 'MY_TOOLS'>(() =>
    computeCanManageTools(user, []) ? 'KHO' : 'MY_TOOLS'
  );

  const [catalogs, setCatalogs] = useState<ToolCatalog[]>([]);
  const [allAssets, setAllAssets] = useState<ToolAsset[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedCatalog, setSelectedCatalog] = useState<ToolCatalog | null>(null);
  const [assets, setAssets] = useState<ToolAsset[]>([]);

  const [selectedAsset, setSelectedAsset] = useState<ToolAsset | null>(null);
  const [transfers, setTransfers] = useState<ToolTransfer[]>([]);
  const [calibrations, setToolCalibrations] = useState<ToolCalibration[]>([]);

  const [viewState, setViewState] = useState<
    'LIST' | 'CATALOG_DETAIL' | 'CATALOG_FORM' | 'ASSET_DETAIL' | 'ASSET_FORM' | 'TRANSFER_FORM' | 'CALIB_FORM'
  >('LIST');
  const [formData, setFormData] = useState<any>({});
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    variant: 'info' | 'warning' | 'danger';
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchRoles()
      .then((res) => {
        if (mounted) {
          setRoles(res || []);
          setRolesLoaded(true);
        }
      })
      .catch((err) => {
        console.error('Load roles failed in ToolsManagement:', err);
        if (mounted) setRolesLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Honor RBAC Rule #1: QC_INSPECTOR sees ONLY MY_TOOLS; Managers default to KHO unless manually switched
  useEffect(() => {
    if (!rolesLoaded) return;
    if (!canManageTools) {
      if (activeTab !== 'MY_TOOLS') setActiveTab('MY_TOOLS');
    } else if (!hasUserSwitchedTab && activeTab !== 'KHO') {
      setActiveTab('KHO');
    }
  }, [rolesLoaded, canManageTools, hasUserSwitchedTab, activeTab]);

  const checkIsCurrentUser = useCallback(
    (idOrUsername: string | null | undefined) => {
      if (!idOrUsername) return false;
      const cleanId = String(idOrUsername).trim().toLowerCase();
      if (!cleanId || cleanId === 'kho_tong') return false;
      const cleanUserId = user.id?.trim().toLowerCase();
      const cleanUsername = user.username?.trim().toLowerCase();
      const cleanMsnv = user.msnv?.trim().toLowerCase();
      const cleanEmail = user.email?.trim().toLowerCase();

      if (
        (cleanUserId && cleanId === cleanUserId) ||
        (cleanUsername && cleanId === cleanUsername) ||
        (cleanMsnv && cleanId === cleanMsnv) ||
        (cleanEmail && cleanId === cleanEmail)
      ) {
        return true;
      }

      if (usersList && usersList.length > 0) {
        const findU = usersList.find(
          (u) =>
            u.id?.trim().toLowerCase() === cleanId ||
            u.username?.trim().toLowerCase() === cleanId ||
            u.msnv?.trim().toLowerCase() === cleanId ||
            u.email?.trim().toLowerCase() === cleanId
        );
        if (findU) {
          const targetMsnv = findU.msnv?.trim().toLowerCase();
          const targetUsername = findU.username?.trim().toLowerCase();
          const targetEmail = findU.email?.trim().toLowerCase();
          if (cleanMsnv && targetMsnv && cleanMsnv === targetMsnv) return true;
          if (cleanUsername && targetUsername && cleanUsername === targetUsername) return true;
          if (cleanEmail && targetEmail && cleanEmail === targetEmail) return true;
        }
      }
      return false;
    },
    [user, usersList]
  );

  const myAssets = useMemo(
    () => allAssets.filter((a: any) => checkIsCurrentUser(a.current_user_id)),
    [allAssets, checkIsCurrentUser]
  );

  const loadUsersList = useCallback(async () => {
    try {
      const allUsers = await fetchUsers();
      setUsersList(allUsers || []);
    } catch (err) {
      console.warn('Load users failed in ToolsManagement:', err);
    }
  }, []);

  const loadCatalogs = useCallback(async () => {
    setIsLoading(true);
    setCatalogsError(null);
    try {
      const data = await fetchToolCatalogs();
      setCatalogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setCatalogsError(err?.message || 'Không thể tải danh mục Kho Tổng.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAllAssets = useCallback(async () => {
    setAssetsError(null);
    try {
      const all = await fetchToolAssets();
      setAllAssets(Array.isArray(all) ? all : []);
    } catch (err: any) {
      setAssetsError(err?.message || 'Không thể tải danh sách công cụ dụng cụ.');
    }
  }, []);

  useEffect(() => {
    loadCatalogs();
    loadAllAssets();
    loadUsersList();
  }, [loadCatalogs, loadAllAssets, loadUsersList]);

  const formatUserDisplayById = (id: string | null | undefined) => {
    if (!id) return 'Kho Tổng';
    if (String(id).toUpperCase() === 'KHO' || String(id).toUpperCase() === 'KHO_TONG') return 'Kho Tổng';
    const cleanId = String(id).trim().toLowerCase();
    const findU = usersList.find(
      (u) =>
        u.id?.toLowerCase() === cleanId ||
        u.username?.toLowerCase() === cleanId ||
        u.msnv?.toLowerCase() === cleanId
    );
    if (!findU) return id;
    const msnvStr = findU.msnv ? `[${findU.msnv}] ` : '';
    const roleUpper = String(findU.role || '').toUpperCase();
    const roleStr =
      roleUpper === 'LEAD_QC' || roleUpper === 'QC_LEAD'
        ? 'Lead QC'
        : roleUpper === 'ADMIN'
          ? 'Admin'
          : roleUpper === 'MANAGER'
            ? 'Manager'
            : findU.role || 'QC';
    return `${msnvStr}${findU.name} (${roleStr})`;
  };

  const loadCatalogDetails = async (catalog: ToolCatalog) => {
    setSelectedCatalog(catalog);
    setViewState('CATALOG_DETAIL');
    setIsDetailLoading(true);
    setDetailError(null);
    try {
      const a = await fetchToolAssetsByCatalog(catalog.id);
      setAssets(Array.isArray(a) ? a : []);
    } catch (err: any) {
      setDetailError(err?.message || 'Không thể tải danh sách tài sản thuộc danh mục này.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const loadAssetDetails = async (asset: ToolAsset) => {
    setSelectedAsset(asset);
    setViewState('ASSET_DETAIL');
    setIsDetailLoading(true);
    setDetailError(null);
    try {
      const [tData, cData, freshAll] = await Promise.all([
        fetchToolTransfers(asset.id),
        fetchToolCalibrations(asset.id),
        fetchToolAssets().catch(() => null),
      ]);
      setTransfers(Array.isArray(tData) ? tData : []);
      setToolCalibrations(Array.isArray(cData) ? cData : []);
      if (Array.isArray(freshAll)) {
        setAllAssets(freshAll);
        const refreshed = freshAll.find((x: any) => x.id === asset.id);
        if (refreshed) setSelectedAsset(refreshed);
      }
    } catch (err: any) {
      setDetailError(err?.message || 'Không thể tải lịch sử luân chuyển và hiệu chuẩn của tài sản.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (String(status || '').toUpperCase()) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
            SẴN SÀNG
          </span>
        );
      case 'IN_USE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
            ĐANG SỬ DỤNG
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
            BẢO TRÌ
          </span>
        );
      case 'BROKEN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 rounded-md text-[10px] font-bold uppercase tracking-wider">
            HỎNG
          </span>
        );
      case 'LOST':
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 rounded-md text-[10px] font-bold uppercase tracking-wider">
            THẤT LẠC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 rounded-md text-[10px] font-bold uppercase">
            {status || '---'}
          </span>
        );
    }
  };

  const getTransferStatusBadge = (tr: ToolTransfer) => {
    const st = String(tr.status || 'PENDING').toUpperCase();
    if (st === 'APPROVED') {
      return (
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          ĐÃ DUYỆT
        </span>
      );
    }
    if (tr.receiver_confirm_date) {
      return (
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          CHỜ QUẢN LÝ DUYỆT
        </span>
      );
    }
    return (
      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        CHỜ NGƯỜI NHẬN KÝ
      </span>
    );
  };

  const filteredCatalogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return catalogs.filter((t) => {
      const matchesSearch =
        !q ||
        String(t.name || '').toLowerCase().includes(q) ||
        String(t.code || '').toLowerCase().includes(q) ||
        String(t.specifications || '').toLowerCase().includes(q);
      const matchesType = !filterType || t.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [catalogs, searchTerm, filterType]);

  const filteredMyAssets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return myAssets.filter((asset) => {
      const catalogName = String((asset as any).catalog_name || '').toLowerCase();
      const catalogType = String((asset as any).catalog_type || '');
      const matchesSearch =
        !q ||
        catalogName.includes(q) ||
        String(asset.asset_code || '').toLowerCase().includes(q) ||
        String(asset.serial_number || '').toLowerCase().includes(q);
      const matchesStatus = !filterAction || asset.status === filterAction;
      const matchesType = !filterType || catalogType === filterType;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [myAssets, searchTerm, filterAction, filterType]);

  const handleExportExcel = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');
      let dataToExport: any[] = [];
      let filename = '';

      if (activeTab === 'KHO' && canManageTools) {
        dataToExport = filteredCatalogs.map((cat) => ({
          'Mã Loại': cat.code,
          'Tên Danh Mục': cat.name,
          'Loại / Kiểu': cat.type || 'Chung',
          'Số Thiết Bị': cat.asset_count ?? 0,
          'Mô Tả': (cat as any).description || cat.specifications || '',
        }));
        filename = `Danh_muc_CCDC_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
      } else {
        dataToExport = filteredMyAssets.map((asset) => ({
          'Mã Tài Sản': asset.asset_code,
          'Tên Thiết Bị': (asset as any).catalog_name,
          'Số Serial': asset.serial_number || '',
          'Trạng Thái': asset.status,
          'Hạn Hiệu Chuẩn': asset.next_calibration_date ? formatUnixDate(asset.next_calibration_date) : '',
        }));
        filename = `CCDC_Cua_Toi_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
      }

      const ws = utils.json_to_sheet(dataToExport);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Dữ liệu');
      writeFile(wb, filename);
      setNotice({ type: 'success', message: `Đã xuất file Excel (${dataToExport.length} dòng).` });
    } catch (error: any) {
      console.error('Export failed:', error);
      setNotice({ type: 'error', message: error?.message || 'Lỗi xuất file Excel.' });
    }
  };

  const handleImportButtonClick = () => {
    if (!canManageTools) {
      setNotice({ type: 'error', message: 'Bạn không có quyền nhập dữ liệu CCDC vào Kho Tổng.' });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const { read, utils } = await import('xlsx');
        const data = await file.arrayBuffer();
        const workbook = read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = utils.sheet_to_json(worksheet);

        if (!jsonData || jsonData.length === 0) {
          setNotice({ type: 'error', message: 'File Excel trống, không có dữ liệu để nhập.' });
          return;
        }

        const headerRow = Object.keys(jsonData[0] as object);
        const isCatalog = headerRow.includes('Mã Loại') && headerRow.includes('Tên Danh Mục');
        const isAsset = headerRow.includes('Mã Tài Sản') && headerRow.includes('Tên Thiết Bị');

        if (isCatalog) {
          setConfirmDialog({
            variant: 'info',
            title: 'Xác nhận nhập danh mục',
            message: `Tìm thấy ${jsonData.length} danh mục. Tiến hành nhập dữ liệu?`,
            confirmLabel: 'Nhập dữ liệu',
            onConfirm: async () => {
              setIsSaving(true);
              try {
                let successCount = 0;
                for (const row of jsonData as any[]) {
                  if (!row['Mã Loại'] || !row['Tên Danh Mục']) continue;
                  const codeStr = String(row['Mã Loại']).trim().toUpperCase();
                  const existing = catalogs.find((c) => String(c.code || '').toUpperCase() === codeStr);
                  const catalogId = existing ? existing.id : `CAT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

                  await saveToolCatalog({
                    id: catalogId,
                    code: codeStr,
                    name: String(row['Tên Danh Mục']).trim(),
                    type: String(row['Loại / Kiểu'] || 'Chung').trim(),
                    specifications: String(row['Mô Tả'] || '').trim(),
                    created_by: existing ? existing.created_by : user.id,
                    version: existing?.version,
                  });
                  successCount++;
                }
                setNotice({ type: 'success', message: `Đã nhập thành công ${successCount} danh mục CCDC.` });
                await loadCatalogs();
              } catch (err: any) {
                setNotice({ type: 'error', message: err?.message || 'Lỗi trong quá trình nhập danh mục Excel.' });
              } finally {
                setIsSaving(false);
              }
            },
          });
        } else if (isAsset) {
          setConfirmDialog({
            variant: 'info',
            title: 'Xác nhận nhập tài sản',
            message: `Tìm thấy ${jsonData.length} tài sản/công cụ. Tiến hành nhập dữ liệu?`,
            confirmLabel: 'Nhập dữ liệu',
            onConfirm: async () => {
              setIsSaving(true);
              try {
                let successCount = 0;
                const latestAssets = await fetchToolAssets();

                for (const row of jsonData as any[]) {
                  if (!row['Mã Tài Sản']) continue;
                  const assetCodeStr = String(row['Mã Tài Sản']).trim().toUpperCase();
                  const existingAsset = latestAssets.find(
                    (a: ToolAsset) => String(a.asset_code || '').toUpperCase() === assetCodeStr
                  );
                  let catalog_id = existingAsset?.catalog_id;

                  if (!catalog_id && row['Mã Loại']) {
                    const codeLookup = String(row['Mã Loại']).trim().toUpperCase();
                    const cat = catalogs.find((c) => String(c.code || '').toUpperCase() === codeLookup);
                    if (cat) catalog_id = cat.id;
                  }

                  if (!catalog_id && !existingAsset) {
                    const nameLookup = String(row['Tên Thiết Bị'] || '').trim().toLowerCase();
                    const catByName = catalogs.find((c) => String(c.name || '').trim().toLowerCase() === nameLookup);
                    if (catByName) catalog_id = catByName.id;
                    else continue;
                  }

                  const assetId = existingAsset
                    ? existingAsset.id
                    : `AST_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

                  let nextCalibDate = existingAsset?.next_calibration_date || null;
                  if (row['Hạn Hiệu Chuẩn']) {
                    const val = row['Hạn Hiệu Chuẩn'];
                    if (typeof val === 'number') {
                      nextCalibDate = Math.floor((val - 25569) * 86400);
                    } else if (typeof val === 'string') {
                      const parts = val.split(/[-/]/);
                      if (parts.length === 3) {
                        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                        if (!isNaN(d.getTime())) nextCalibDate = Math.floor(d.getTime() / 1000);
                      }
                    }
                  }

                  await saveToolAsset({
                    id: assetId,
                    catalog_id: catalog_id as string,
                    asset_code: assetCodeStr,
                    serial_number: String(row['Số Serial'] || '').trim(),
                    status: existingAsset ? existingAsset.status : row['Trạng Thái'] || 'AVAILABLE',
                    current_user_id: existingAsset?.current_user_id ?? null,
                    next_calibration_date: nextCalibDate,
                    version: existingAsset?.version,
                  });
                  successCount++;
                }
                setNotice({ type: 'success', message: `Đã nhập thành công ${successCount} tài sản/công cụ.` });
                await Promise.all([loadAllAssets(), loadCatalogs()]);
              } catch (err: any) {
                setNotice({ type: 'error', message: err?.message || 'Lỗi trong quá trình nhập tài sản Excel.' });
              } finally {
                setIsSaving(false);
              }
            },
          });
        } else {
          setNotice({
            type: 'error',
            message:
              'Tệp Excel không đúng định dạng. Cần chứa cột [Mã Loại, Tên Danh Mục] cho Danh mục Kho, hoặc [Mã Tài Sản, Tên Thiết Bị] cho Công cụ.',
          });
        }
      } catch (error: any) {
        console.error('Import failed:', error);
        setNotice({ type: 'error', message: error?.message || 'Lỗi đọc file Excel. Hãy chắc chắn tệp đúng định dạng.' });
      }
    };
    input.click();
  };

  const renderNoticeBanner = () => {
    if (!notice) return null;
    const toneClass =
      notice.type === 'success'
        ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
        : notice.type === 'error'
          ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
    return (
      <div className={`mx-3 sm:mx-4 md:mx-8 mt-3 px-4 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold ${toneClass}`}>
        <div className="flex items-center gap-2 min-w-0">
          {notice.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="break-words">{notice.message}</span>
        </div>
        <button
          type="button"
          onClick={() => setNotice(null)}
          aria-label="Đóng thông báo"
          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const transferAssetSummaryText = useMemo(() => {
    const ids: string[] = Array.isArray(formData.tool_asset_ids)
      ? formData.tool_asset_ids
      : formData.tool_asset_id
        ? [formData.tool_asset_id]
        : [];
    if (ids.length === 0) return selectedAsset?.asset_code || 'Chưa xác định';
    const matchedCodes = ids.map((id) => {
      const found =
        (selectedAsset?.id === id ? selectedAsset : null) ||
        allAssets.find((a) => a.id === id) ||
        assets.find((a) => a.id === id);
      return found ? found.asset_code : id;
    });
    if (ids.length === 1) return matchedCodes[0];
    return `${ids.length} thiết bị (${matchedCodes.join(', ')})`;
  }, [formData.tool_asset_ids, formData.tool_asset_id, selectedAsset, allAssets, assets]);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* --- CATALOG LIST / MY TOOLS --- */}
      {viewState === 'LIST' && (
        <div className="flex flex-col h-full">
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10">
            <div className="px-3 sm:px-4 py-3 md:px-8">
              <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-start md:items-center">
                <div className="flex gap-4 sm:gap-6 border-b-2 border-transparent w-full md:w-auto overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => {
                      setHasUserSwitchedTab(true);
                      setActiveTab('MY_TOOLS');
                    }}
                    className={`min-h-[44px] flex items-center pb-2.5 pt-1 px-1 border-b-2 -mb-[2px] font-bold text-[13px] uppercase transition-all whitespace-nowrap shrink-0 ${
                      activeTab === 'MY_TOOLS'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Công Cụ Của Tôi ({myAssets.length})
                  </button>
                  {canManageTools && (
                    <button
                      type="button"
                      onClick={() => {
                        setHasUserSwitchedTab(true);
                        setActiveTab('KHO');
                      }}
                      className={`min-h-[44px] flex items-center pb-2.5 pt-1 px-1 border-b-2 -mb-[2px] font-bold text-[13px] uppercase transition-all whitespace-nowrap shrink-0 ${
                        activeTab === 'KHO'
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Quản Lý Kho Tổng ({catalogs.length})
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 min-w-[180px] md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="w-full min-h-[44px] sm:min-h-[38px] pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder={activeTab === 'KHO' ? 'Tìm mã, tên danh mục...' : 'Tìm mã, tên thiết bị...'}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {canManageTools && hasPermission(user, roles, 'TOOLS', 'IMPORT') && (
                      <button
                        type="button"
                        onClick={handleImportButtonClick}
                        title="Nhập Excel"
                        aria-label="Nhập Excel"
                        className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission(user, roles, 'TOOLS', 'EXPORT') && (
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        title="Xuất Excel"
                        aria-label="Xuất Excel"
                        className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowFilters(!showFilters)}
                        aria-label="Bộ lọc"
                        className={`min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center p-2.5 rounded-xl border transition-all ${
                          showFilters || filterType || filterAction
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Filter className="w-4 h-4" />
                      </button>

                      {showFilters && (
                        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-[calc(100vw-1.5rem)] sm:w-72 max-h-[75dvh] overflow-y-auto bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 z-[120]">
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                                Bộ lọc CCDC
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowFilters(false)}
                                aria-label="Đóng bộ lọc"
                                className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                                Loại công cụ
                              </label>
                              <Combobox
                                value={filterType || null}
                                onChange={(v) => setFilterType(v || '')}
                                options={Array.from(new Set(catalogs.map((c) => c.type).filter(Boolean))).map((t) => ({
                                  value: t as string,
                                  label: t as string,
                                }))}
                                placeholder="Tất cả các loại"
                                allowClear={true}
                                ariaLabel="Lọc theo loại công cụ"
                              />
                            </div>

                            {activeTab === 'MY_TOOLS' && (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                                  Trạng thái thiết bị
                                </label>
                                <Combobox
                                  value={filterAction || null}
                                  onChange={(v) => setFilterAction(v || '')}
                                  options={[
                                    { value: 'AVAILABLE', label: 'Sẵn sàng' },
                                    { value: 'IN_USE', label: 'Đang sử dụng' },
                                    { value: 'MAINTENANCE', label: 'Bảo trì' },
                                    { value: 'BROKEN', label: 'Hỏng' },
                                    { value: 'LOST', label: 'Thất lạc' },
                                  ]}
                                  placeholder="Tất cả trạng thái"
                                  allowClear={true}
                                  ariaLabel="Lọc theo trạng thái thiết bị"
                                />
                              </div>
                            )}

                            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterType('');
                                  setFilterAction('');
                                  setSearchTerm('');
                                }}
                                className="min-h-[44px] sm:min-h-[36px] px-3 text-xs font-bold text-slate-500 uppercase hover:text-red-600 transition-colors rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                Đặt lại
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowFilters(false)}
                                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 bg-blue-600 text-white text-xs font-bold uppercase rounded-xl shadow-sm hover:bg-blue-700"
                              >
                                Áp dụng
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {activeTab === 'KHO' && canManageTools && (
                      <button
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setFormData({});
                          setViewState('CATALOG_FORM');
                        }}
                        className="min-h-[44px] sm:min-h-[38px] flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="font-semibold text-xs sm:text-sm whitespace-nowrap">Thêm Danh Mục</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-24 lg:pb-6">
            {activeTab === 'KHO' && canManageTools ? (
              isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Đang tải danh mục Kho Tổng...</span>
                </div>
              ) : catalogsError ? (
                <div className="max-w-xl mx-auto mt-10 p-6 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl text-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold uppercase text-slate-900 dark:text-white">Lỗi tải dữ liệu Kho Tổng</h3>
                    <p className="text-xs text-red-600 dark:text-red-400">{catalogsError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadCatalogs}
                    className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-xl"
                  >
                    <RotateCcw className="w-4 h-4" /> Thử lại
                  </button>
                </div>
              ) : filteredCatalogs.length === 0 ? (
                <div className="text-center py-20 text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                  <BookOpen className="w-12 h-12 mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold">
                    {catalogs.length === 0 ? 'Chưa có danh mục CCDC nào trong Kho Tổng.' : 'Không có danh mục nào phù hợp bộ lọc.'}
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">Mã Loại</th>
                          <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">Tên Danh Mục</th>
                          <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">Loại / Kiểu</th>
                          <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 text-right">Số Thiết Bị</th>
                          <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 text-right">Chi Tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredCatalogs.map((cat) => (
                          <tr
                            key={cat.id}
                            onClick={() => loadCatalogDetails(cat)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                          >
                            <td className="px-3 py-2.5">
                              <span className="font-mono tabular-nums text-xs font-bold text-blue-600 dark:text-blue-400">
                                {cat.code}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase">
                                {cat.name}
                              </div>
                              {cat.specifications && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                                  {cat.specifications}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                              {cat.type || 'Chung'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-200">
                              {cat.asset_count ?? 0}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="inline-flex justify-end text-slate-400 group-hover:text-blue-600 transition-colors">
                                <ExternalLink className="w-4 h-4" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredCatalogs.map((cat) => (
                      <div
                        key={cat.id}
                        onClick={() => loadCatalogDetails(cat)}
                        className="p-4 active:bg-slate-50 dark:active:bg-slate-800/60 flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums mb-0.5">
                            <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">{cat.code}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 dark:text-slate-400">{cat.type || 'Chung'}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{cat.asset_count ?? 0} TB</span>
                          </div>
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100 uppercase truncate">{cat.name}</div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="max-w-6xl mx-auto pb-24">
                {assetsError ? (
                  <div className="max-w-xl mx-auto mt-10 p-6 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl text-center space-y-4 shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold uppercase text-slate-900 dark:text-white">Lỗi tải Công cụ của tôi</h3>
                      <p className="text-xs text-red-600 dark:text-red-400">{assetsError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={loadAllAssets}
                      className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-xl"
                    >
                      <RotateCcw className="w-4 h-4" /> Thử lại
                    </button>
                  </div>
                ) : filteredMyAssets.length === 0 ? (
                  <div className="text-center py-20 text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                    <Wrench className="w-12 h-12 mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="font-semibold text-sm">
                      {myAssets.length === 0
                        ? 'Bạn chưa được bàn giao công cụ dụng cụ nào.'
                        : 'Không tìm thấy công cụ nào phù hợp với bộ lọc.'}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                            <th className="px-3 py-2.5 w-12 text-center">
                              <input
                                type="checkbox"
                                aria-label="Chọn tất cả công cụ"
                                checked={selectedAssetIds.length === filteredMyAssets.length && filteredMyAssets.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedAssetIds(filteredMyAssets.map((a) => a.id));
                                  else setSelectedAssetIds([]);
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </th>
                            <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">Mã Tài Sản</th>
                            <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">Tên Thiết Bị</th>
                            <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 text-center">Trạng Thái</th>
                            <th className="px-3 py-2.5 text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 text-right">Hiệu Chuẩn</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredMyAssets.map((asset) => {
                            let calibStatus = 'ok';
                            if (asset.next_calibration_date) {
                              const daysLeft = (asset.next_calibration_date * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
                              if (daysLeft < 0) calibStatus = 'overdue';
                              else if (daysLeft < 30) calibStatus = 'upcoming';
                            }
                            const isSelected = selectedAssetIds.includes(asset.id);
                            return (
                              <tr
                                key={asset.id}
                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                                  isSelected ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
                                }`}
                                onClick={() => loadAssetDetails(asset)}
                              >
                                <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    aria-label={`Chọn ${asset.asset_code}`}
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedAssetIds([...selectedAssetIds, asset.id]);
                                      else setSelectedAssetIds(selectedAssetIds.filter((id) => id !== asset.id));
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="font-mono tabular-nums text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
                                    {asset.asset_code}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="text-sm font-semibold text-blue-700 dark:text-blue-400 uppercase truncate">
                                    {(asset as any).catalog_name || '---'}
                                  </div>
                                  <div className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 uppercase">
                                    S/N: {asset.serial_number || '---'}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-center">{getStatusBadge(asset.status || 'AVAILABLE')}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                  {asset.next_calibration_date ? (
                                    <span
                                      className={`text-xs font-semibold px-2 py-1 rounded-md inline-block ${
                                        calibStatus === 'overdue'
                                          ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : calibStatus === 'upcoming'
                                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                      }`}
                                    >
                                      {formatUnixDate(asset.next_calibration_date)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">---</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredMyAssets.map((asset) => {
                        const isSelected = selectedAssetIds.includes(asset.id);
                        return (
                          <div
                            key={asset.id}
                            className={`p-4 active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors flex items-center gap-3 ${
                              isSelected ? 'bg-blue-50/40 dark:bg-blue-900/20' : ''
                            }`}
                            onClick={() => loadAssetDetails(asset)}
                          >
                            <div
                              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedAssetIds([...selectedAssetIds, asset.id]);
                                  else setSelectedAssetIds(selectedAssetIds.filter((id) => id !== asset.id));
                                }}
                                className="w-5 h-5 rounded border-slate-300 text-blue-600"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="font-mono tabular-nums text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                                  {asset.asset_code}
                                </span>
                                {getStatusBadge(asset.status || 'AVAILABLE')}
                              </div>
                              <div className="font-bold text-sm text-blue-700 dark:text-blue-400 uppercase truncate">
                                {(asset as any).catalog_name || '---'}
                              </div>
                              <div className="flex justify-between items-center mt-1 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                                <span>S/N: {asset.serial_number || '---'}</span>
                                {asset.next_calibration_date && <span>Hạn: {formatUnixDate(asset.next_calibration_date)}</span>}
                              </div>
                            </div>
                            <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90 shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedAssetIds.length > 0 && activeTab === 'MY_TOOLS' && (
              <div className="fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-auto max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl border border-blue-200 dark:border-slate-700 px-4 sm:px-6 py-3 rounded-2xl flex items-center justify-between gap-4 sm:gap-8 z-50">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Đang chọn</span>
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                    {selectedAssetIds.length} thiết bị
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setSelectedAsset(null);
                    setFormData({ tool_asset_ids: selectedAssetIds, to_user_id: '', from_user_id: user.id });
                    setViewState('TRANSFER_FORM');
                  }}
                  className="min-h-[44px] px-5 py-2.5 bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2 shrink-0"
                >
                  <ArrowRightLeft className="w-4 h-4" /> Bàn Giao
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- CATALOG FORM --- */}
      {viewState === 'CATALOG_FORM' && (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
          <div className="px-4 py-3 sm:py-4 md:px-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 shrink-0">
            <h2 className="text-lg sm:text-xl font-bold uppercase text-slate-900 dark:text-white truncate">
              {formData.id ? 'Sửa Danh Mục CCDC' : 'Thêm Mới Danh Mục CCDC'}
            </h2>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setNotice(null);
                  setViewState(formData.id ? 'CATALOG_DETAIL' : 'LIST');
                }}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-slate-600 dark:text-slate-300 font-bold uppercase text-xs hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  setNotice(null);
                  setIsSaving(true);
                  try {
                    const saved = await saveToolCatalog({
                      ...formData,
                      id: formData.id || `CAT_${Date.now()}`,
                      created_by: formData.created_by || user.id,
                    });
                    await loadCatalogs();
                    setNotice({ type: 'success', message: formData.id ? 'Đã cập nhật danh mục CCDC.' : 'Đã tạo danh mục CCDC mới.' });
                    if (formData.id && saved) {
                      await loadCatalogDetails(saved);
                    } else {
                      setViewState('LIST');
                    }
                  } catch (err: any) {
                    setNotice({ type: 'error', message: err?.message || 'Lỗi lưu danh mục CCDC.' });
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving || !String(formData.code || '').trim() || !String(formData.name || '').trim()}
                className="min-h-[44px] sm:min-h-[38px] px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs rounded-xl disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Lưu
              </button>
            </div>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8 max-w-3xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Mã Loại *</label>
                <input
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-mono font-bold h-12 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="VD: TC-35M"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Tên Loại *</label>
                <input
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-semibold h-12 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Tên Loại CCDC"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Kiểu (Type)</label>
                <input
                  value={formData.type || ''}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium h-12 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Cầm tay, Đo lường, Dụng cụ..."
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Đặc tính kỹ thuật (Specs)</label>
                <textarea
                  value={formData.specifications || ''}
                  onChange={(e) => setFormData({ ...formData, specifications: e.target.value })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium h-24 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2 mt-2">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 flex justify-between items-center">
                  <span>Hướng Dẫn Sử Dụng (Markdown)</span>
                  <label className="text-blue-600 dark:text-blue-400 cursor-pointer inline-flex items-center gap-1 min-h-[36px] px-2 hover:underline">
                    <ImageIcon className="w-3.5 h-3.5" /> Chèn Ảnh
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          try {
                            const url = await uploadQMSImage(e.target.files[0], 'MANUAL');
                            setFormData({
                              ...formData,
                              manual_markdown: (formData.manual_markdown || '') + `\n![image](${url})\n`,
                            });
                          } catch (err: any) {
                            setNotice({ type: 'error', message: err?.message || 'Không thể tải ảnh hướng dẫn lên.' });
                          }
                        }
                      }}
                    />
                  </label>
                </label>
                <textarea
                  value={formData.manual_markdown || ''}
                  onChange={(e) => setFormData({ ...formData, manual_markdown: e.target.value })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-mono text-sm h-48 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 flex justify-between items-center">
                  <span>Tài liệu đính kèm (Drive URL)</span>
                  <label className="text-blue-600 dark:text-blue-400 cursor-pointer inline-flex items-center gap-1 text-xs font-bold min-h-[36px] px-2 hover:underline">
                    <FileText className="w-3.5 h-3.5" />
                    Tải lên PDF
                    <input
                      type="file"
                      className="hidden"
                      accept="application/pdf"
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          try {
                            const url = await uploadQMSImage(e.target.files[0], 'CATALOG_PDF');
                            setFormData({ ...formData, manual_pdf_url: url });
                          } catch (err: any) {
                            setNotice({ type: 'error', message: err?.message || 'Không thể tải PDF lên hệ thống.' });
                          }
                        }
                      }}
                    />
                  </label>
                </label>
                <input
                  value={formData.manual_pdf_url || ''}
                  onChange={(e) => setFormData({ ...formData, manual_pdf_url: e.target.value })}
                  className="w-full px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium h-12 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nhập Link hoặc Tải lên tệp PDF từ thiết bị..."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CATALOG DETAIL --- */}
      {viewState === 'CATALOG_DETAIL' && selectedCatalog && (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
          <div className="px-3 sm:px-4 py-3 md:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setViewState('LIST');
              }}
              aria-label="Quay lại"
              className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 mx-2 sm:mx-4 truncate">
              <h2 className="text-base sm:text-xl font-bold uppercase text-slate-900 dark:text-white truncate">
                <span className="font-mono text-blue-600 dark:text-blue-400 mr-2">{selectedCatalog.code}</span>
                {selectedCatalog.name}
              </h2>
            </div>
            <div className="flex gap-2 shrink-0">
              {canManageTools && (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setFormData(selectedCatalog);
                    setViewState('CATALOG_FORM');
                  }}
                  aria-label="Sửa danh mục"
                  className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              {canDeleteTools && (
                <button
                  type="button"
                  onClick={() => {
                    if (assets.length > 0) {
                      setNotice({
                        type: 'error',
                        message: `Không thể xóa danh mục đang có ${assets.length} tài sản vật lý hoạt động.`,
                      });
                      return;
                    }
                    const targetCatalogId = selectedCatalog.id;
                    setConfirmDialog({
                      variant: 'danger',
                      title: 'Xóa danh mục thiết bị',
                      message: `Bạn có chắc chắn muốn xóa danh mục "${selectedCatalog.name}"?`,
                      confirmLabel: 'Xóa danh mục',
                      onConfirm: async () => {
                        setIsSaving(true);
                        try {
                          await deleteToolCatalog(targetCatalogId);
                          setNotice({ type: 'success', message: `Đã xóa danh mục "${selectedCatalog.name}".` });
                          setViewState('LIST');
                          await loadCatalogs();
                        } catch (err: any) {
                          setNotice({ type: 'error', message: err?.message || 'Không thể xóa danh mục.' });
                        } finally {
                          setIsSaving(false);
                        }
                      },
                    });
                  }}
                  aria-label="Xóa danh mục"
                  className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center p-2 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8">
            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-6">
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="font-bold text-base uppercase tracking-tight mb-4 text-slate-900 dark:text-white">Thông Tin Chung</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-0.5">Loại</p>
                      <p className="font-medium text-sm text-slate-800 dark:text-slate-200">{selectedCatalog.type || '---'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-0.5">Đặc tính</p>
                      <p className="font-medium text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">
                        {selectedCatalog.specifications || '---'}
                      </p>
                    </div>
                  </div>
                </div>

                {(selectedCatalog.manual_markdown || selectedCatalog.manual_pdf_url) && (
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="font-bold text-base uppercase tracking-tight flex items-center gap-2 mb-4 text-slate-900 dark:text-white">
                      <FileText className="w-4 h-4" /> Hướng Dẫn
                    </h3>
                    {selectedCatalog.manual_pdf_url && (
                      <a
                        href={selectedCatalog.manual_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[44px] sm:min-h-[38px] flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl text-xs font-bold w-full mb-4 justify-center"
                      >
                        <ExternalLink className="w-4 h-4" /> Mở PDF đính kèm (Drive)
                      </a>
                    )}
                    {selectedCatalog.manual_markdown && (
                      <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-xs">
                        <Markdown>{selectedCatalog.manual_markdown}</Markdown>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm h-full">
                  <div className="flex justify-between items-center gap-2 mb-6 flex-wrap">
                    <h3 className="font-bold text-base uppercase tracking-tight flex items-center gap-2 text-slate-900 dark:text-white">
                      <Hash className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Danh Sách Tài Sản Vật Lý ({assets.length})
                    </h3>
                    {canManageTools && (
                      <button
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setFormData({ catalog_id: selectedCatalog.id, status: 'AVAILABLE' });
                          setViewState('ASSET_FORM');
                        }}
                        className="min-h-[44px] sm:min-h-[36px] px-4 py-2 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-blue-700 inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Tạo Tài Sản
                      </button>
                    )}
                  </div>

                  {isDetailLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                    </div>
                  ) : detailError ? (
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-center space-y-3">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300">{detailError}</p>
                      <button
                        type="button"
                        onClick={() => loadCatalogDetails(selectedCatalog)}
                        className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white text-xs font-bold uppercase rounded-lg"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Thử lại
                      </button>
                    </div>
                  ) : assets.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có tài sản thực tế nào thuộc danh mục này.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {assets.map((asset) => {
                        let calibStatus = 'ok';
                        if (asset.next_calibration_date) {
                          const daysLeft = (asset.next_calibration_date * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
                          if (daysLeft < 0) calibStatus = 'overdue';
                          else if (daysLeft < 30) calibStatus = 'upcoming';
                        }
                        return (
                          <div
                            key={asset.id}
                            onClick={() => loadAssetDetails(asset)}
                            className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 cursor-pointer transition-all"
                          >
                            <div className="flex justify-between items-center mb-2">
                              {getStatusBadge(asset.status || 'AVAILABLE')}
                              {asset.serial_number && (
                                <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                                  S/N: {asset.serial_number}
                                </span>
                              )}
                            </div>
                            <h4 className="font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400 uppercase tracking-tight text-sm mb-1">
                              {asset.asset_code}
                            </h4>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Người giữ: <strong>{formatUserDisplayById(asset.current_user_id)}</strong>
                            </p>
                            {asset.next_calibration_date && (
                              <div
                                className={`mt-2 px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold ${
                                  calibStatus === 'overdue'
                                    ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : calibStatus === 'upcoming'
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                      : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                }`}
                              >
                                H.C Tới: {formatUnixDate(asset.next_calibration_date)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ASSET FORM --- */}
      {viewState === 'ASSET_FORM' && (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
          <div className="px-4 py-3 sm:py-4 md:px-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 shrink-0">
            <h2 className="text-lg sm:text-xl font-bold uppercase text-slate-900 dark:text-white truncate">
              {formData.id ? 'Sửa Tài Sản' : 'Tạo Tài Sản Mới'}
            </h2>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setNotice(null);
                  setViewState(formData.id ? 'ASSET_DETAIL' : 'CATALOG_DETAIL');
                }}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-slate-600 dark:text-slate-300 font-bold uppercase text-xs hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  setNotice(null);
                  setIsSaving(true);
                  try {
                    const savedAsset = await saveToolAsset({
                      ...formData,
                      id: formData.id || `AST_${Date.now()}`,
                      created_by: formData.created_by || user.id,
                    });
                    await Promise.all([loadAllAssets(), loadCatalogs()]);
                    setNotice({ type: 'success', message: formData.id ? 'Đã cập nhật tài sản CCDC.' : 'Đã tạo tài sản CCDC mới.' });
                    if (selectedCatalog) {
                      await loadCatalogDetails(selectedCatalog);
                    } else if (savedAsset) {
                      await loadAssetDetails(savedAsset);
                    } else {
                      setViewState('LIST');
                    }
                  } catch (err: any) {
                    setNotice({ type: 'error', message: err?.message || 'Lỗi lưu tài sản CCDC.' });
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving || !String(formData.asset_code || '').trim()}
                className="min-h-[44px] sm:min-h-[38px] px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs rounded-xl disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Lưu
              </button>
            </div>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Mã Tài Sản (Asset Tag) *</label>
                <input
                  value={formData.asset_code || ''}
                  onChange={(e) => setFormData({ ...formData, asset_code: e.target.value.toUpperCase() })}
                  className="w-full px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold h-12 text-blue-700 dark:text-blue-400 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="VD: QC-TC-001"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Số Serial (S/N)</label>
                <input
                  value={formData.serial_number || ''}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  className="w-full px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-mono font-medium h-12 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Trạng Thái</label>
                <Combobox
                  value={formData.status || 'AVAILABLE'}
                  onChange={(v) => setFormData({ ...formData, status: v || 'AVAILABLE' })}
                  options={[
                    { value: 'AVAILABLE', label: 'Sẵn sàng (Kho)' },
                    { value: 'IN_USE', label: 'Đang sử dụng' },
                    { value: 'MAINTENANCE', label: 'Bảo trì' },
                    { value: 'BROKEN', label: 'Hỏng' },
                    { value: 'LOST', label: 'Thất lạc' },
                  ]}
                  allowClear={false}
                  ariaLabel="Trạng thái tài sản"
                />
              </div>
              {canManageTools && (
                <div className="space-y-1.5 md:col-span-2">
                  <QCSelectionCombobox
                    label="Người giữ / Sở hữu tài sản"
                    value={formData.current_user_id || ''}
                    onChange={(userId) =>
                      setFormData({
                        ...formData,
                        current_user_id: userId || null,
                        status: userId ? (formData.status === 'AVAILABLE' ? 'IN_USE' : formData.status) : 'AVAILABLE',
                      })
                    }
                    users={usersList}
                    warehouseValue=""
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                    Lưu ý: Chỉ Quản lý CCDC được phép gán trực tiếp chủ sở hữu tại hồ sơ tài sản.
                  </p>
                </div>
              )}
              {formData.id && canDeleteTools && (
                <div className="space-y-1.5 md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <label className="text-xs font-bold uppercase text-red-600 dark:text-red-400">Vùng Nguy Hiểm</label>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      const targetAssetId = formData.id;
                      setConfirmDialog({
                        variant: 'danger',
                        title: 'Xóa tài sản vật lý',
                        message: `Thực sự muốn xóa tài sản vật lý "${formData.asset_code}"?`,
                        confirmLabel: 'Xóa tài sản',
                        onConfirm: async () => {
                          setIsSaving(true);
                          try {
                            await deleteToolAsset(targetAssetId);
                            setNotice({ type: 'success', message: `Đã xóa tài sản "${formData.asset_code}".` });
                            await Promise.all([loadAllAssets(), loadCatalogs()]);
                            if (selectedCatalog) await loadCatalogDetails(selectedCatalog);
                            else setViewState('LIST');
                          } catch (err: any) {
                            setNotice({ type: 'error', message: err?.message || 'Không thể xóa tài sản.' });
                          } finally {
                            setIsSaving(false);
                          }
                        },
                      });
                    }}
                    className="w-full min-h-[44px] p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-100 dark:hover:bg-red-950/50"
                  >
                    XÓA TÀI SẢN NÀY
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- ASSET DETAIL --- */}
      {viewState === 'ASSET_DETAIL' && selectedAsset && (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
          <div className="px-3 sm:px-4 py-3 md:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                if (selectedCatalog) loadCatalogDetails(selectedCatalog);
                else setViewState('LIST');
              }}
              aria-label="Quay lại"
              className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 mx-2 sm:mx-4 truncate">
              <h2 className="text-base sm:text-xl font-bold uppercase text-slate-900 dark:text-white truncate">
                Tài Sản: <span className="font-mono text-blue-600 dark:text-blue-400">{selectedAsset.asset_code}</span>
              </h2>
            </div>
            <div className="flex gap-2 shrink-0">
              {canManageTools && (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setFormData(selectedAsset);
                    setViewState('ASSET_FORM');
                  }}
                  aria-label="Sửa tài sản"
                  className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="p-6 md:p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-center gap-2 mb-6 flex-wrap">
                  <h3 className="font-mono font-bold text-xl sm:text-2xl uppercase tracking-tight text-blue-700 dark:text-blue-400">
                    {selectedAsset.asset_code}
                  </h3>
                  {getStatusBadge(selectedAsset.status || 'AVAILABLE')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-1">Mã Loại (Catalog)</p>
                    <p className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {(selectedAsset as any).catalog_code || selectedCatalog?.code || '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-1">Tên Loại</p>
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {(selectedAsset as any).catalog_name || selectedCatalog?.name || '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-1">Số Serial</p>
                    <p className="font-mono font-medium text-sm text-slate-800 dark:text-slate-200">
                      {selectedAsset.serial_number || '---'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase mb-1">Người đang giữ</p>
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {formatUserDisplayById(selectedAsset.current_user_id)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      const isOwner = checkIsCurrentUser(selectedAsset.current_user_id);
                      setFormData({
                        tool_asset_id: selectedAsset.id,
                        tool_asset_ids: [selectedAsset.id],
                        from_user_id: selectedAsset.current_user_id || 'KHO_TONG',
                        to_user_id: isOwner ? '' : user.id,
                      });
                      setViewState('TRANSFER_FORM');
                    }}
                    className="flex-1 min-h-[44px] py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-xl font-bold uppercase text-xs hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center justify-center gap-2"
                  >
                    <ArrowRightLeft className="w-4 h-4" /> YÊU CẦU BÀN GIAO
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setFormData({ tool_asset_id: selectedAsset.id, requested_by: user.id });
                      setViewState('CALIB_FORM');
                    }}
                    className="flex-1 min-h-[44px] py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-xl font-bold uppercase text-xs hover:bg-amber-100 dark:hover:bg-amber-900/40 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Y.C HIỆU CHUẨN
                  </button>
                </div>
              </div>

              {detailError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">{detailError}</span>
                  <button
                    type="button"
                    onClick={() => loadAssetDetails(selectedAsset)}
                    className="min-h-[36px] px-3 py-1 bg-red-600 text-white text-xs font-bold uppercase rounded-lg shrink-0 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Thử lại
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* TRANSFERS */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="font-bold text-base uppercase tracking-tight flex items-center gap-2 mb-4 text-slate-900 dark:text-white">
                    <ArrowRightLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Lịch Sử Luân Chuyển
                  </h3>
                  {isDetailLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    </div>
                  ) : transfers.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có luân chuyển.</p>
                  ) : (
                    <div className="space-y-3">
                      {transfers.map((tr) => {
                        const isWarehouseReturn = String(tr.to_user_id || '').toUpperCase() === 'KHO_TONG';
                        const canOpenAction =
                          tr.status === 'PENDING' &&
                          (checkIsCurrentUser(tr.to_user_id) ||
                            canManageTools ||
                            (isWarehouseReturn && canManageTools));
                        return (
                          <div
                            key={tr.id}
                            className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2"
                          >
                            <div className="flex justify-between items-center gap-2 flex-wrap">
                              <span className="font-mono tabular-nums text-xs font-semibold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-slate-700 dark:text-slate-200 rounded-md">
                                {formatUnixDate(tr.request_date)}
                              </span>
                              {getTransferStatusBadge(tr)}
                            </div>
                            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                              Từ: <strong className="text-blue-600 dark:text-blue-400">{formatUserDisplayById(tr.from_user_id)}</strong>{' '}
                              ➔ Tới: <strong className="text-blue-600 dark:text-blue-400">{formatUserDisplayById(tr.to_user_id)}</strong>
                            </p>
                            {tr.notes && <p className="text-xs text-slate-500 dark:text-slate-400 italic">{tr.notes}</p>}
                            {canOpenAction && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNotice(null);
                                  setFormData(tr);
                                  setViewState('TRANSFER_FORM');
                                }}
                                className="mt-2 w-full min-h-[44px] sm:min-h-[36px] py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl uppercase"
                              >
                                {!tr.receiver_confirm_date ? 'Ký Xác Nhận Nhận' : 'Xem / Phê Duyệt (Bước 2)'}
                              </button>
                            )}
                            {tr.status === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNotice(null);
                                  setFormData(tr);
                                  setViewState('TRANSFER_FORM');
                                }}
                                className="mt-1 w-full min-h-[36px] py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                Xem chi tiết chữ ký
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* CALIBRATIONS */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="font-bold text-base uppercase tracking-tight flex items-center gap-2 mb-4 text-slate-900 dark:text-white">
                    <FileBadge className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Lịch Sử Hiệu Chuẩn
                  </h3>
                  {isDetailLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                    </div>
                  ) : calibrations.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có hiệu chuẩn.</p>
                  ) : (
                    <div className="space-y-3">
                      {calibrations.map((cb) => (
                        <div
                          key={cb.id}
                          className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-mono tabular-nums text-xs font-semibold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-slate-700 dark:text-slate-200 rounded-md">
                              {formatUnixDate(cb.request_date)}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                cb.status === 'COMPLETED'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}
                            >
                              {cb.status}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                            Người YC: <strong>{formatUserDisplayById(cb.requested_by)}</strong>
                          </p>
                          {cb.next_calibration_date && (
                            <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              H.C Tiếp theo: {formatUnixDate(cb.next_calibration_date)}
                            </p>
                          )}
                          {cb.notes && <p className="text-xs text-slate-500 dark:text-slate-400">{cb.notes}</p>}
                          {cb.certificate_url && (
                            <a
                              href={cb.certificate_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Giấy chứng nhận
                            </a>
                          )}
                          {cb.status === 'PENDING' && canManageTools && (
                            <button
                              type="button"
                              onClick={() => {
                                setNotice(null);
                                setFormData(cb);
                                setViewState('CALIB_FORM');
                              }}
                              className="mt-2 w-full min-h-[44px] sm:min-h-[36px] py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl uppercase"
                            >
                              Duyệt & Cập Nhật Kết Quả
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TRANSFER FORM (2-STEP WORKFLOW) --- */}
      {viewState === 'TRANSFER_FORM' && (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
          <div className="px-4 py-3 sm:py-4 md:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 shrink-0">
            <h2 className="text-base sm:text-lg font-bold uppercase text-slate-900 dark:text-white truncate">
              Phiếu Luân Chuyển CCDC (2 Bước)
            </h2>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setNotice(null);
                setViewState(selectedAsset ? 'ASSET_DETAIL' : 'LIST');
              }}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl shrink-0"
            >
              Quay Lại
            </button>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto w-full">
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 p-4 rounded-xl">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase mb-1">Tài Sản Bàn Giao</p>
                <p className="text-base sm:text-lg font-mono font-bold text-blue-800 dark:text-blue-300 break-words">
                  {transferAssetSummaryText}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase mb-1">Người Bàn Giao</p>
                  <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {formatUserDisplayById(formData.from_user_id)}
                  </p>
                </div>
                <div>
                  <QCSelectionCombobox
                    label="Người Nhận (Nhân viên / Kho Tổng)"
                    value={formData.to_user_id || ''}
                    onChange={(userId) => setFormData({ ...formData, to_user_id: userId })}
                    users={usersList}
                    disabled={!!formData.id}
                    warehouseValue="KHO_TONG"
                  />
                </div>
              </div>

              {!formData.id && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Ghi chú bàn giao</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl h-20 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Lý do hoặc tình trạng thiết bị trước khi luân chuyển..."
                  />
                </div>
              )}

              {formData.id ? (
                <>
                  {/* Step 2A: Receiver Sign-off */}
                  {!formData.receiver_confirm_date &&
                    (checkIsCurrentUser(formData.to_user_id) ||
                      (String(formData.to_user_id || '').toUpperCase() === 'KHO_TONG' && canManageTools)) && (
                      <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <h4 className="font-bold text-sm uppercase flex items-center gap-2 text-slate-900 dark:text-white">
                          <CheckCircle className="w-4 h-4 text-blue-600" /> Bước 2A: Người nhận ký xác nhận
                        </h4>
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Ảnh thực trạng (Tùy chọn)
                          </p>
                          <label className="cursor-pointer bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-400 min-h-[64px] justify-center">
                            {formData.receiver_image ? (
                              <img src={getProxyImageUrl(formData.receiver_image)} alt="Thực trạng thiết bị" className="h-32 object-contain rounded-lg" />
                            ) : (
                              <>
                                <ImageIcon className="w-6 h-6" />
                                <span className="text-xs font-bold">Chụp hoặc Tải Lên ảnh thực trạng</span>
                              </>
                            )}
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={async (e) => {
                                if (e.target.files?.[0]) {
                                  try {
                                    const uploadedUrl = await uploadQMSImage(e.target.files[0], {
                                      entityType: 'TOOL_TRANSFER',
                                      entityId: formData.id || 'new',
                                      role: 'TRANSFER_IMAGE',
                                    });
                                    setFormData({ ...formData, receiver_image: uploadedUrl });
                                  } catch (err: any) {
                                    setNotice({ type: 'error', message: err?.message || 'Không thể tải ảnh thực trạng lên.' });
                                  }
                                }
                              }}
                            />
                          </label>
                        </div>
                        <SignaturePad
                          label="Chữ ký người nhận"
                          value={formData.receiver_signature || ''}
                          onChange={(s) => setFormData({ ...formData, receiver_signature: s })}
                          uploadContext={{ entityId: formData.id || 'new', type: 'TOOL_TRANSFER', role: 'RECEIVER_SIGNATURE' }}
                        />
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            if (!formData.receiver_signature) {
                              setNotice({ type: 'error', message: 'Bắt buộc phải ký tên xác nhận đã nhận đủ thiết bị!' });
                              return;
                            }
                            setNotice(null);
                            setIsSaving(true);
                            try {
                              let resolvedSig = formData.receiver_signature;
                              if (resolvedSig.startsWith('data:')) {
                                resolvedSig = await uploadQMSImage(resolvedSig, {
                                  entityType: 'TOOL_TRANSFER',
                                  entityId: formData.id || 'new',
                                  role: 'RECEIVER_SIGNATURE',
                                });
                              }
                              let resolvedImg = formData.receiver_image;
                              if (resolvedImg && resolvedImg.startsWith('data:')) {
                                resolvedImg = await uploadQMSImage(resolvedImg, {
                                  entityType: 'TOOL_TRANSFER',
                                  entityId: formData.id || 'new',
                                  role: 'TRANSFER_IMAGE',
                                });
                              }
                              const confirmDate = Math.floor(Date.now() / 1000);
                              const updatedTransfer = await saveToolTransfer({
                                ...formData,
                                receiver_signature: resolvedSig,
                                receiver_image: resolvedImg,
                                receiver_confirm_date: confirmDate,
                              });
                              setFormData(updatedTransfer);
                              setNotice({
                                type: 'success',
                                message: 'Người nhận đã ký xác nhận. Đang chờ Quản lý phê duyệt chuyển sở hữu (Bước 2B).',
                              });
                              if (selectedAsset) {
                                const tData = await fetchToolTransfers(selectedAsset.id);
                                setTransfers(tData);
                              }
                            } catch (err: any) {
                              setNotice({ type: 'error', message: err?.message || 'Lỗi xác nhận nhận thiết bị.' });
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          className="w-full min-h-[44px] py-3 bg-blue-600 text-white font-bold tracking-wider text-sm rounded-xl hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          XÁC NHẬN ĐÃ NHẬN ĐỦ
                        </button>
                      </div>
                    )}

                  {/* Informative waiting notice if Step 2A not signed yet and actor cannot sign */}
                  {!formData.receiver_confirm_date &&
                    !checkIsCurrentUser(formData.to_user_id) &&
                    !(String(formData.to_user_id || '').toUpperCase() === 'KHO_TONG' && canManageTools) && (
                      <div className="p-5 border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl text-center space-y-2">
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase flex items-center justify-center gap-2">
                          <Clock className="w-4 h-4" /> Chờ người nhận xác nhận (Bước 2A)
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Phiếu đang chờ <strong>{formatUserDisplayById(formData.to_user_id)}</strong> ký xác nhận đã nhận đủ thiết bị trước khi Quản lý phê duyệt đổi chủ sở hữu.
                        </p>
                      </div>
                    )}

                  {/* Show Receiver Evidence once Step 2A signed */}
                  {formData.receiver_confirm_date && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold uppercase text-slate-600 dark:text-slate-300">Xác nhận của người nhận</span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatUnixDate(formData.receiver_confirm_date)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {formData.receiver_signature && (
                          <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Chữ ký người nhận</p>
                            <img src={getProxyImageUrl(formData.receiver_signature)} alt="Chữ ký người nhận" className="h-20 mx-auto object-contain" />
                          </div>
                        )}
                        {formData.receiver_image && (
                          <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Ảnh thực trạng</p>
                            <img src={getProxyImageUrl(formData.receiver_image)} alt="Thực trạng" className="h-20 mx-auto object-contain" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 2B: Manager Final Approval */}
                  {formData.receiver_confirm_date && !formData.manager_approve_date && canManageTools && (
                    <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800/50">
                      <h4 className="font-bold text-sm uppercase text-amber-800 dark:text-amber-300">
                        Bước 2B: Phê duyệt của Quản lý CCDC
                      </h4>
                      <SignaturePad
                        label="Chữ ký quản lý"
                        value={formData.manager_signature || ''}
                        onChange={(s) => setFormData({ ...formData, manager_signature: s })}
                        uploadContext={{ entityId: formData.id || 'new', type: 'TOOL_TRANSFER', role: 'MANAGER_SIGNATURE' }}
                      />
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={async () => {
                          if (!formData.manager_signature) {
                            setNotice({ type: 'error', message: 'Vui lòng ký tên quản lý để phê duyệt luân chuyển!' });
                            return;
                          }
                          setNotice(null);
                          setIsSaving(true);
                          try {
                            let resolvedMgrSig = formData.manager_signature;
                            if (resolvedMgrSig.startsWith('data:')) {
                              resolvedMgrSig = await uploadQMSImage(resolvedMgrSig, {
                                entityType: 'TOOL_TRANSFER',
                                entityId: formData.id || 'new',
                                role: 'MANAGER_SIGNATURE',
                              });
                            }
                            await saveToolTransfer({
                              ...formData,
                              manager_signature: resolvedMgrSig,
                              status: 'APPROVED',
                              manager_approve_date: Math.floor(Date.now() / 1000),
                            });
                            await Promise.all([loadAllAssets(), loadCatalogs()]);
                            setNotice({
                              type: 'success',
                              message: 'Đã phê duyệt hoàn tất luân chuyển và cập nhật chủ sở hữu thiết bị.',
                            });
                            if (selectedAsset) {
                              await loadAssetDetails(selectedAsset);
                            } else {
                              setViewState('LIST');
                            }
                          } catch (err: any) {
                            setNotice({ type: 'error', message: err?.message || 'Lỗi phê duyệt luân chuyển.' });
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className="w-full min-h-[44px] py-3 bg-amber-600 text-white font-bold tracking-wider text-sm rounded-xl hover:bg-amber-700 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                      >
                        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                        DUYỆT QUYẾT ĐỊNH LUÂN CHUYỂN
                      </button>
                    </div>
                  )}

                  {formData.receiver_confirm_date && !formData.manager_approve_date && !canManageTools && (
                    <div className="p-5 border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 rounded-2xl text-center space-y-2">
                      <p className="text-sm font-bold text-teal-800 dark:text-teal-300 uppercase">Chờ Quản lý phê duyệt (Bước 2B)</p>
                      <p className="text-xs text-teal-700 dark:text-teal-400">
                        Người nhận đã ký nhận. Đang chờ Quản lý CCDC phê duyệt để hoàn tất đổi chủ sở hữu.
                      </p>
                    </div>
                  )}

                  {formData.status === 'APPROVED' && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 font-bold rounded-xl text-center space-y-2">
                      <p className="text-sm">ĐÃ PHÊ DUYỆT HOÀN TẤT CHUYỂN GIAO SỞ HỮU</p>
                      {formData.manager_signature && (
                        <div className="pt-2">
                          <img
                            src={getProxyImageUrl(formData.manager_signature)}
                            alt="Chữ ký quản lý"
                            className="h-16 mx-auto object-contain bg-white rounded-lg p-1 border border-green-200"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    if (!formData.to_user_id) {
                      setNotice({ type: 'error', message: 'Vui lòng chọn Người nhận hoặc Thu hồi về Kho Tổng.' });
                      return;
                    }
                    setNotice(null);
                    setIsSaving(true);
                    try {
                      await saveToolTransfer({
                        ...formData,
                        from_user_id: formData.from_user_id || selectedAsset?.current_user_id || user.id,
                        id: `TRF_${Date.now()}`,
                        request_date: Math.floor(Date.now() / 1000),
                      });
                      setNotice({
                        type: 'success',
                        message: 'Đã phát hành phiếu luân chuyển (Bước 1). Chờ người nhận ký xác nhận và Quản lý duyệt.',
                      });
                      if (selectedAsset) {
                        await loadAssetDetails(selectedAsset);
                      } else {
                        setViewState('LIST');
                        setSelectedAssetIds([]);
                        await loadAllAssets();
                      }
                    } catch (err: any) {
                      setNotice({ type: 'error', message: err?.message || 'Lỗi tạo phiếu luân chuyển.' });
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className="w-full min-h-[44px] py-3.5 bg-blue-600 text-white font-bold text-sm tracking-wider rounded-xl uppercase hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Kích Hoạt Phiếu Luân Chuyển
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- CALIBRATION FORM --- */}
      {viewState === 'CALIB_FORM' && (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
          <div className="px-4 py-3 sm:py-4 md:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 shrink-0">
            <h2 className="text-base sm:text-lg font-bold uppercase text-slate-900 dark:text-white truncate">Phiếu Hiệu Chuẩn</h2>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setNotice(null);
                setViewState('ASSET_DETAIL');
              }}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl shrink-0"
            >
              Quay Lại
            </button>
          </div>

          {renderNoticeBanner()}

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto w-full">
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
              <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase mb-1">Mã Tài Sản Hiệu Chuẩn</p>
                <p className="text-lg font-mono font-bold text-amber-900 dark:text-amber-300 uppercase">
                  {selectedAsset?.asset_code}
                </p>
              </div>

              {formData.id ? (
                <>
                  {formData.status === 'PENDING' && canManageTools && (
                    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <h4 className="font-bold text-sm uppercase text-slate-900 dark:text-white">Cập nhật kết quả Hiệu chuẩn</h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                            Giấy chứng nhận (Link)
                          </label>
                          <label className="min-h-[36px] px-2 -mr-2 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold">
                            <FileText className="w-3.5 h-3.5" />
                            Tải lên PDF
                            <input
                              type="file"
                              className="hidden"
                              accept="application/pdf"
                              onChange={async (e) => {
                                if (e.target.files?.[0]) {
                                  try {
                                    const url = await uploadQMSImage(e.target.files[0], 'CALIB_CERT_PDF');
                                    setFormData({ ...formData, certificate_url: url });
                                  } catch (err: any) {
                                    setNotice({ type: 'error', message: err?.message || 'Không thể tải PDF chứng nhận lên.' });
                                  }
                                }
                              }}
                            />
                          </label>
                        </div>
                        <input
                          value={formData.certificate_url || ''}
                          onChange={(e) => setFormData({ ...formData, certificate_url: e.target.value })}
                          className="w-full min-h-[44px] px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Nhập Link hoặc Tải lên tệp PDF từ thiết bị..."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Ghi chú kết quả</label>
                        <textarea
                          value={formData.notes || ''}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl h-20 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">Ngày H.C Tiếp Theo *</label>
                        <input
                          type="date"
                          value={formatUnixDateInputValue(formData.next_calibration_date)}
                          onChange={(e) => {
                            if (!e.target.value) {
                              setFormData({ ...formData, next_calibration_date: null });
                              return;
                            }
                            const d = new Date(e.target.value);
                            if (!isNaN(d.getTime())) {
                              setFormData({ ...formData, next_calibration_date: Math.floor(d.getTime() / 1000) });
                            }
                          }}
                          className="w-full min-h-[44px] px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={async () => {
                          if (!formData.next_calibration_date) {
                            setNotice({ type: 'error', message: 'Vui lòng thiết lập ngày hiệu chuẩn tiếp theo!' });
                            return;
                          }
                          setNotice(null);
                          setIsSaving(true);
                          try {
                            await saveToolCalibration({
                              ...formData,
                              status: 'COMPLETED',
                              calibration_date: Math.floor(Date.now() / 1000),
                              approved_by: user.id,
                            });
                            setNotice({ type: 'success', message: 'Đã cập nhật kết quả hiệu chuẩn và đồng bộ hạn mới lên thiết bị.' });
                            if (selectedAsset) await loadAssetDetails(selectedAsset);
                          } catch (err: any) {
                            setNotice({ type: 'error', message: err?.message || 'Lỗi cập nhật kết quả hiệu chuẩn.' });
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className="w-full min-h-[48px] py-3.5 bg-green-600 text-white font-bold text-sm uppercase tracking-wider rounded-xl hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                      >
                        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                        CẬP NHẬT KẾT QUẢ HOÀN TẤT
                      </button>
                    </div>
                  )}
                  {formData.status === 'PENDING' && !canManageTools && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-semibold rounded-xl text-center border border-amber-200 dark:border-amber-800 text-xs">
                      Đang chờ Quản lý CCDC duyệt và cập nhật kết quả hiệu chuẩn.
                    </div>
                  )}
                  {formData.status === 'COMPLETED' && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-bold rounded-xl text-center border border-green-200 dark:border-green-800 text-sm">
                      ĐÃ HOÀN TẤT CHU KỲ HIỆU CHUẨN
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                      Lý do / Tình trạng trước Hiệu chuẩn
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl h-24 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                      placeholder="Máy bị lệch sai số, đến hạn định kỳ..."
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={async () => {
                      setNotice(null);
                      setIsSaving(true);
                      try {
                        await saveToolCalibration({
                          ...formData,
                          id: `CAL_${Date.now()}`,
                          request_date: Math.floor(Date.now() / 1000),
                        });
                        setNotice({ type: 'success', message: 'Đã phát hành phiếu yêu cầu hiệu chuẩn.' });
                        if (selectedAsset) await loadAssetDetails(selectedAsset);
                      } catch (err: any) {
                        setNotice({ type: 'error', message: err?.message || 'Lỗi tạo phiếu yêu cầu hiệu chuẩn.' });
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="w-full min-h-[48px] py-3.5 bg-amber-600 text-white font-bold uppercase text-sm tracking-wider rounded-xl hover:bg-amber-700 shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    PHÁT HÀNH PHIẾU YÊU CẦU HC
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog !== null}
        variant={confirmDialog?.variant || 'info'}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel={confirmDialog?.confirmLabel || 'Xác nhận'}
        cancelLabel="Hủy"
        onConfirm={async () => {
          const action = confirmDialog?.onConfirm;
          setConfirmDialog(null);
          if (action) await action();
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
};
