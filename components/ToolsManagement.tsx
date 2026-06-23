import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ToolCatalog, ToolAsset, ToolTransfer, ToolCalibration, Role, hasPermission } from '../types';
import { fetchToolCatalogs, saveToolCatalog, deleteToolCatalog, fetchToolAssetsByCatalog, saveToolAsset, deleteToolAsset, fetchToolTransfers, saveToolTransfer, fetchToolCalibrations, saveToolCalibration, uploadQMSImage, fetchRoles } from '../services/apiService';
import { Plus, Search, Wrench, Edit, Trash2, ArrowRightLeft, FileText, FileBadge, CheckCircle, ExternalLink, Image as ImageIcon, Loader2, BookOpen, Hash, ChevronDown, Upload, Download, Filter, X } from 'lucide-react';
import Markdown from 'react-markdown';
import { SignaturePad } from './SignaturePad';

interface QCSelectionComboboxProps {
  label: string;
  value: string;
  onChange: (userId: string) => void;
  users: User[];
  disabled?: boolean;
}

const QCSelectionCombobox: React.FC<QCSelectionComboboxProps> = ({ label, value, onChange, users, disabled }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter users - show everyone so we can find any employee
  const selectableUsers = useMemo(() => {
    return users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users]);

  const selectedUser = useMemo(() => {
    return users.find(u => u.id === value || u.username === value);
  }, [users, value]);

  const filtered = useMemo(() => {
    const removeAccents = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = removeAccents(search.trim());
    if (!q) return selectableUsers;
    return selectableUsers.filter(u => {
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
    if (roleStr === 'LEAD_QC') roleStr = 'Lead QC';
    else if (roleStr === 'QC') roleStr = 'QC';
    
    const pos = u.position ? ` - ${u.position}` : '';
    return `${msnvStr}${u.name} (${roleStr}${pos})`;
  };

  return (
    <div className="relative space-y-1 w-full" ref={dropdownRef}>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center cursor-pointer transition h-11 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-100'}`}
      >
        <span className="font-bold text-sm text-slate-800 truncate">
          {selectedUser ? getQCUserLabel(selectedUser) : '--- CHỌN NHÂN VIÊN ---'}
        </span>
        {!disabled && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 flex flex-col overflow-hidden animate-in fade-in duration-100">
          <div className="p-2 border-b bg-slate-50">
            <input 
              type="text"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo tên, MSNV, vị trí..."
              className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 font-medium"
            />
          </div>
          <div className="overflow-y-auto divide-y divide-slate-100 no-scrollbar">
            <div 
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setSearch('');
              }}
              className="px-4 py-2.5 text-xs font-black cursor-pointer bg-slate-50 text-indigo-600 transition-colors hover:bg-slate-100"
            >
              - THU HỒI / TRẢ VỀ KHO TỔNG -
            </div>
            {filtered.length > 0 ? (
              filtered.map(u => (
                <div 
                  key={u.id}
                  onClick={() => {
                    onChange(u.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`px-4 py-2.5 text-xs font-bold cursor-pointer transition-colors hover:bg-slate-50 ${u.id === value ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-700'}`}
                >
                  {getQCUserLabel(u)}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 font-bold">Không tìm thấy Nhân viên nào.</div>
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
  const [catalogs, setCatalogs] = useState<ToolCatalog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedCatalog, setSelectedCatalog] = useState<ToolCatalog | null>(null);
  const [assets, setAssets] = useState<ToolAsset[]>([]);
  
  const [selectedAsset, setSelectedAsset] = useState<ToolAsset | null>(null);
  const [transfers, setTransfers] = useState<ToolTransfer[]>([]);
  const [calibrations, setToolCalibrations] = useState<ToolCalibration[]>([]);
  
  const [viewState, setViewState] = useState<'LIST' | 'CATALOG_DETAIL' | 'CATALOG_FORM' | 'ASSET_DETAIL' | 'ASSET_FORM' | 'TRANSFER_FORM' | 'CALIB_FORM'>('LIST');
  const [formData, setFormData] = useState<any>({});
  
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    fetchRoles().then(setRoles).catch(err => console.error("Load roles failed in ToolsManagement:", err));
  }, []);

  const isManagerOrAdmin = useMemo(() => {
    if (user.role === 'ADMIN') return true;
    if (hasPermission(user, roles, 'TOOLS', 'CREATE')) return true;
    if (hasPermission(user, roles, 'TOOLS', 'EDIT')) return true;
    if (hasPermission(user, roles, 'TOOLS', 'SIGN2')) return true;
    return user.role === 'ADMIN' || user.role === 'MANAGER';
  }, [user, roles]);

  const [activeTab, setActiveTab] = useState<'KHO' | 'MY_TOOLS'>('MY_TOOLS');
  const [myAssets, setMyAssets] = useState<ToolAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);

  useEffect(() => {
    loadCatalogs();
    loadMyAssets();
    loadUsersList();
  }, []); // Load once on mount

  const loadUsersList = async () => {
    try {
        const { fetchUsers } = await import('../services/apiService');
        const allUsers = await fetchUsers();
        setUsersList(allUsers || []);
    } catch(e) {}
  };

  const formatUserDisplayById = (id: string | null | undefined) => {
    if (!id) return '---';
    if (id === 'KHO_TONG' || id.toUpperCase() === 'KHO' || id.toUpperCase() === 'KHO_TONG') return 'Kho Tổng';
    const findU = usersList.find(u => u.id === id || u.username === id);
    if (!findU) return id;
    const msnvStr = findU.msnv ? `[${findU.msnv}] ` : '';
    const roleStr = findU.role?.toString().toUpperCase() === 'LEAD_QC' ? 'Lead QC' : findU.role?.toString().toUpperCase() === 'ADMIN' ? 'Admin' : findU.role?.toString().toUpperCase() === 'MANAGER' ? 'Manager' : findU.role || 'QC';
    return `${msnvStr}${findU.name} (${roleStr})`;
  };

  const checkIsCurrentUser = (idOrUsername: string | null | undefined) => {
    if (!idOrUsername) return false;
    const cleanId = idOrUsername.trim().toLowerCase();
    const cleanUserId = user.id?.trim().toLowerCase();
    const cleanUsername = user.username?.trim().toLowerCase();
    const cleanMsnv = user.msnv?.trim().toLowerCase();
    const cleanEmail = user.email?.trim().toLowerCase();

    if (cleanId === cleanUserId || cleanId === cleanUsername || cleanId === cleanMsnv || (cleanEmail && cleanId === cleanEmail)) {
        return true;
    }

    if (usersList && usersList.length > 0) {
        const findU = usersList.find(u => 
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
  };

  const loadMyAssets = async () => {
    try {
        const { fetchToolAssets } = await import('../services/apiService');
        const all = await fetchToolAssets();
        setMyAssets(all.filter((a: any) => checkIsCurrentUser(a.current_user_id)));
    } catch(e) {}
  };

  const loadCatalogs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchToolCatalogs();
      setCatalogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCatalogDetails = async (catalog: ToolCatalog) => {
    setSelectedCatalog(catalog);
    setViewState('CATALOG_DETAIL');
    try {
      const a = await fetchToolAssetsByCatalog(catalog.id);
      setAssets(a);
    } catch (e) {
        console.error(e);
    }
  };
  
  const loadAssetDetails = async (asset: ToolAsset) => {
    setSelectedAsset(asset);
    setViewState('ASSET_DETAIL');
    try {
      const [tData, cData] = await Promise.all([
          fetchToolTransfers(asset.id),
          fetchToolCalibrations(asset.id)
      ]);
      setTransfers(tData);
      setToolCalibrations(cData);
    } catch (e) {
        console.error(e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'AVAILABLE': return <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg text-xs font-bold uppercase tracking-wider">SẴN SÀNG</span>;
      case 'IN_USE': return <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider">ĐANG SỬ DỤNG</span>;
      case 'MAINTENANCE': return <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs font-bold uppercase tracking-wider">BẢO TRÌ</span>;
      case 'BROKEN': return <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold uppercase tracking-wider">HỎNG</span>;
      case 'LOST': return <span className="px-2 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 rounded-lg text-xs font-bold uppercase tracking-wider">THẤT LẠC</span>;
      default: return null;
    }
  };

  const filteredCatalogs = catalogs.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const filteredMyAssets = myAssets.filter(asset => {
    const catalogName = (asset as any).catalog_name || '';
    const matchesSearch = catalogName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          asset.asset_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !filterAction || asset.status === filterAction;
    return matchesSearch && matchesStatus;
  });

  const handleExportExcel = async () => {
    try {
        const { utils, writeFile } = await import('xlsx');
        let dataToExport = [];
        let filename = '';

        if (activeTab === 'KHO') {
            dataToExport = filteredCatalogs.map(cat => ({
                'Mã Loại': cat.code,
                'Tên Danh Mục': cat.name,
                'Loại / Kiểu': cat.type || 'Chung',
                'Mô Tả': (cat as any).description || cat.specifications || ''
            }));
            filename = `Danh_muc_CCDC_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        } else {
            dataToExport = filteredMyAssets.map(asset => ({
                'Mã Tài Sản': asset.asset_code,
                'Tên Thiết Bị': (asset as any).catalog_name,
                'Số Serial': asset.serial_number || '',
                'Trạng Thái': asset.status,
                'Hạn Hiệu Chuẩn': asset.next_calibration_date ? new Date(asset.next_calibration_date * 1000).toLocaleDateString('vi-VN') : ''
            }));
            filename = `CCDC_Cua_Toi_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        }

        const ws = utils.json_to_sheet(dataToExport);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Dữ liệu");
        writeFile(wb, filename);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Lỗi xuất file Excel');
    }
  };

  const handleImportButtonClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const { read, utils } = await import('xlsx');
            const data = await file.arrayBuffer();
            const workbook = read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = utils.sheet_to_json(worksheet);
            
            if (!jsonData || jsonData.length === 0) {
                alert('File Excel trống!'); 
                return;
            }

            const headerRow = Object.keys(jsonData[0] as object);
            const isCatalog = headerRow.includes('Mã Loại') && headerRow.includes('Tên Danh Mục');
            const isAsset = headerRow.includes('Mã Tài Sản') && headerRow.includes('Tên Thiết Bị');

            if (isCatalog) {
                if (!window.confirm(`Tìm thấy ${jsonData.length} danh mục. Tiến hành nhập dữ liệu?`)) return;
                let successCount = 0;
                for (const row of jsonData as any[]) {
                    if (!row['Mã Loại'] || !row['Tên Danh Mục']) continue;
                    let existing = catalogs.find(c => c.code === row['Mã Loại']);
                    const catalogId = existing ? existing.id : `CAT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    
                    await saveToolCatalog({
                        id: catalogId,
                        code: String(row['Mã Loại']),
                        name: String(row['Tên Danh Mục']),
                        type: String(row['Loại / Kiểu'] || 'Chung'),
                        specifications: String(row['Mô Tả'] || ''),
                        created_by: existing ? existing.created_by : user.id,
                        created_at: existing ? existing.created_at : Math.floor(Date.now() / 1000),
                        updated_at: Math.floor(Date.now() / 1000)
                    });
                    successCount++;
                }
                alert(`Đã nhập thành công ${successCount} danh mục.`);
                loadCatalogs();
            } else if (isAsset) {
                if (!window.confirm(`Tìm thấy ${jsonData.length} tài sản/công cụ. Tiến hành nhập dữ liệu?`)) return;
                let successCount = 0;
                
                const { fetchToolAssets } = await import('../services/apiService');
                const allAssets = await fetchToolAssets();

                for (const row of jsonData as any[]) {
                    if (!row['Mã Tài Sản']) continue;
                    let existingAsset = allAssets.find((a: ToolAsset) => a.asset_code === row['Mã Tài Sản']);
                    let catalog_id = existingAsset?.catalog_id;
                    
                    if (!catalog_id && row['Mã Loại']) {
                        let cat = catalogs.find(c => c.code === row['Mã Loại']);
                        if (cat) catalog_id = cat.id;
                    }
                    
                    if (!catalog_id && !existingAsset) {
                        let catByName = catalogs.find(c => c.name === row['Tên Thiết Bị']);
                        if (catByName) catalog_id = catByName.id;
                        else continue; 
                    }
                    
                    const assetId = existingAsset ? existingAsset.id : `AST_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    
                    let nextCalibDate = existingAsset?.next_calibration_date || null;
                    if (row['Hạn Hiệu Chuẩn']) {
                        const val = row['Hạn Hiệu Chuẩn'];
                        if (typeof val === 'number') {
                            nextCalibDate = Math.floor((val - 25569) * 86400); 
                        } else if (typeof val === 'string') {
                            const parts = val.split(/[-/]/);
                            if (parts.length === 3) {
                                const d = new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0]));
                                if (!isNaN(d.getTime())) nextCalibDate = Math.floor(d.getTime()/1000);
                            }
                        }
                    }

                    await saveToolAsset({
                        id: assetId,
                        catalog_id: (catalog_id as string),
                        asset_code: String(row['Mã Tài Sản']),
                        serial_number: String(row['Số Serial'] || ''),
                        status: existingAsset ? existingAsset.status : (row['Trạng Thái'] || 'AVAILABLE'),
                        current_user_id: existingAsset?.current_user_id || undefined,
                        next_calibration_date: nextCalibDate
                    });
                    successCount++;
                }
                alert(`Đã nhập thành công ${successCount} tài sản/công cụ.`);
                loadMyAssets();
            } else {
                alert('Tệp Excel không đúng định dạng. Cần chứa cột [Mã Loại, Tên Danh Mục] đối với Danh mục Kho, hoặc [Mã Tài Sản, Tên Thiết Bị] đối với Công cụ con.');
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert('Lỗi nhập file Excel. Hãy chắc chắn tệp đúng định dạng.');
        }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
        
        {/* --- CATALOG LIST / MY TOOLS --- */}
        {viewState === 'LIST' ? (
            <div className="flex flex-col h-full">
                <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10 font-inter">
                    <div className="px-4 py-3 md:px-8">
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                            <div className="flex gap-6 border-b-2 border-transparent">
                                <button 
                                    onClick={() => setActiveTab('MY_TOOLS')} 
                                    className={`pb-3 px-1 border-b-2 -mb-[2px] font-black text-[13px] uppercase transition-all ${activeTab === 'MY_TOOLS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                                >
                                    Công Cụ Của Tôi
                                </button>
                                <button 
                                    onClick={() => setActiveTab('KHO')} 
                                    className={`pb-3 px-1 border-b-2 -mb-[2px] font-black text-[13px] uppercase transition-all ${activeTab === 'KHO' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                                >
                                    Quản Lý Kho Tổng
                                </button>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:w-72">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                        placeholder={activeTab === 'KHO' ? "Tìm mã, tên danh mục..." : "Tìm mã, tên thiết bị..."}
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {hasPermission(user, roles, 'TOOLS', 'IMPORT') && (
                                        <button 
                                            onClick={handleImportButtonClick}
                                            title="Nhập Excel"
                                            className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            <Upload className="w-4 h-4" />
                                        </button>
                                    )}
                                    {hasPermission(user, roles, 'TOOLS', 'EXPORT') && (
                                        <button 
                                            onClick={handleExportExcel}
                                            title="Xuất Excel"
                                            className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    )}
                                    
                                    <div className="relative">
                                        <button 
                                            onClick={() => setShowFilters(!showFilters)}
                                            className={`p-2.5 rounded-xl transition-all ${showFilters || filterType || filterAction ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                        >
                                            <Filter className="w-4 h-4" />
                                        </button>
                                        
                                        {showFilters && (
                                            <div className="absolute right-0 mt-3 w-72 bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 rounded-2xl p-5 z-[60] animate-in fade-in zoom-in-95 duration-200">
                                                <div className="space-y-5">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-900">Bộ lọc thông minh</span>
                                                        <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Loại công cụ</label>
                                                        <select 
                                                            value={filterType}
                                                            onChange={(e) => setFilterType(e.target.value)}
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Tất cả các loại</option>
                                                            {Array.from(new Set(catalogs.map(c => c.type).filter(Boolean))).map(t => (
                                                                <option key={t} value={t}>{t}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    
                                                    {activeTab === 'MY_TOOLS' && (
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Trạng thái thiết bị</label>
                                                            <select 
                                                                value={filterAction}
                                                                onChange={(e) => setFilterAction(e.target.value)}
                                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                                            >
                                                                <option value="">Tất cả trạng thái</option>
                                                                <option value="AVAILABLE">Sẵn sàng</option>
                                                                <option value="IN_USE">Đang sử dụng</option>
                                                                <option value="MAINTENANCE">Bảo trì</option>
                                                                <option value="BROKEN">Hỏng</option>
                                                                <option value="LOST">Thất lạc</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                                        <button 
                                                            onClick={() => {
                                                                setFilterType('');
                                                                setFilterAction('');
                                                                setSearchTerm('');
                                                            }}
                                                            className="text-[10px] font-black text-slate-400 uppercase hover:text-red-500 transition-colors"
                                                        >
                                                            Đặt lại
                                                        </button>
                                                        <button 
                                                            onClick={() => setShowFilters(false)}
                                                            className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-lg shadow-md hover:bg-indigo-700"
                                                        >
                                                            Áp dụng
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {activeTab === 'KHO' && isManagerOrAdmin && (
                                        <button onClick={() => { setFormData({}); setViewState('CATALOG_FORM'); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md transition-all active:scale-95">
                                            <Plus className="w-4 h-4" />
                                            <span className="font-bold text-xs md:text-sm">Thêm Dự án</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 md:p-6">
                    {activeTab === 'KHO' ? (
                        isLoading ? (
                            <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>
                        ) : filteredCatalogs.length === 0 ? (
                            <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                                <BookOpen className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600"/>
                                <p>Không có danh mục nào.</p>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                                <div className="hidden md:block">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Mã Loại</th>
                                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Tên Danh Mục</th>
                                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Loại / Kiểu</th>
                                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Chi Tiết</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredCatalogs.map(cat => (
                                                <tr 
                                                    key={cat.id} 
                                                    onClick={() => loadCatalogDetails(cat)} 
                                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                                >
                                                    <td className="px-6 py-4">
                                                        <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg tracking-tighter">{cat.code}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-black text-slate-800 dark:text-slate-200 uppercase">{cat.name}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{cat.type || 'Chung'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <ExternalLink className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredCatalogs.map(cat => (
                                        <div key={cat.id} onClick={() => loadCatalogDetails(cat)} className="p-4 active:bg-slate-50 flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-mono text-[10px] font-black text-indigo-600 uppercase mb-1">{cat.code}</div>
                                                <div className="font-black text-sm text-slate-800 dark:text-slate-200 uppercase truncate">{cat.name}</div>
                                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{cat.type || 'Chung'}</div>
                                            </div>
                                            <ChevronDown className="w-4 h-4 text-slate-300 -rotate-90" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="max-w-6xl mx-auto pb-24">
                            {filteredMyAssets.length === 0 ? (
                                <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                                    <Wrench className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600"/>
                                    <p className="font-bold text-sm text-slate-500">{myAssets.length === 0 ? "Bạn chưa được bàn giao công cụ dụng cụ nào." : "Không tìm thấy công cụ nào phù hợp với bộ lọc."}</p>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="hidden md:block">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                                    <th className="px-6 py-4 w-12 text-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedAssetIds.length === filteredMyAssets.length && filteredMyAssets.length > 0} 
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedAssetIds(filteredMyAssets.map(a => a.id));
                                                                else setSelectedAssetIds([]);
                                                            }}
                                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                                                        />
                                                    </th>
                                                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Mã Tài Sản</th>
                                                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Tên Thiết Bị</th>
                                                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Trạng Thái</th>
                                                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Hiệu Chuẩn</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {filteredMyAssets.map(asset => {
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
                                                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-50/30' : ''}`}
                                                            onClick={() => loadAssetDetails(asset)}
                                                        >
                                                            <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={isSelected} 
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) setSelectedAssetIds([...selectedAssetIds, asset.id]);
                                                                        else setSelectedAssetIds(selectedAssetIds.filter(id => id !== asset.id));
                                                                    }}
                                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
                                                                />
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-300 tracking-tighter uppercase">{asset.asset_code}</span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="text-sm font-black text-indigo-700 dark:text-indigo-400 uppercase truncate">{(asset as any).catalog_name}</div>
                                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">S/N: {asset.serial_number || '---'}</div>
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                {getStatusBadge(asset.status)}
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                {asset.next_calibration_date ? (
                                                                    <div className={`text-[10px] font-black px-2 py-1 rounded-lg inline-block ${calibStatus === 'overdue' ? 'bg-red-50 text-red-700' : calibStatus === 'upcoming' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                                                        {new Date(asset.next_calibration_date * 1000).toLocaleDateString('vi-VN')}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 font-bold">---</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredMyAssets.map(asset => {
                                            const isSelected = selectedAssetIds.includes(asset.id);
                                            return (
                                                <div key={asset.id} className={`p-4 active:bg-slate-50 transition-colors flex items-center gap-4 ${isSelected ? 'bg-indigo-50/30' : ''}`} onClick={() => loadAssetDetails(asset)}>
                                                    <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedAssetIds([...selectedAssetIds, asset.id]);
                                                                else setSelectedAssetIds(selectedAssetIds.filter(id => id !== asset.id));
                                                            }}
                                                            className="w-5 h-5 rounded border-slate-300 text-indigo-600"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="font-mono text-[10px] font-black text-slate-500 uppercase">{asset.asset_code}</span>
                                                            {getStatusBadge(asset.status)}
                                                        </div>
                                                        <div className="font-black text-sm text-indigo-700 dark:text-indigo-400 uppercase truncate">{(asset as any).catalog_name}</div>
                                                        <div className="flex justify-between items-center mt-1">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase">S/N: {asset.serial_number || '---'}</div>
                                                            {asset.next_calibration_date && (
                                                                <div className="text-[9px] font-black text-slate-500 uppercase">Hạn: {new Date(asset.next_calibration_date * 1000).toLocaleDateString('vi-VN')}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ChevronDown className="w-4 h-4 text-slate-300 -rotate-90" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedAssetIds.length > 0 && activeTab === 'MY_TOOLS' && (
                    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-2xl border border-indigo-100 dark:border-slate-700 px-6 py-4 rounded-3xl flex items-center gap-8 animate-in slide-in-from-bottom-10 z-50 ring-1 ring-slate-900/5">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang thao tác</span>
                            <span className="font-black text-sm text-slate-900 dark:text-slate-100 tracking-tight">{selectedAssetIds.length} thiết bị đã chọn</span>
                        </div>
                        <button 
                            onClick={() => {
                                setFormData({ tool_asset_ids: selectedAssetIds, to_user_id: '', from_user_id: user.id });
                                setViewState('TRANSFER_FORM');
                            }} 
                            className="px-8 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transform transition-all active:scale-95 flex items-center gap-3"
                        >
                            <ArrowRightLeft className="w-5 h-5"/> Bàn Giao
                        </button>
                    </div>
                )}
                </div>
            </div>
        ) : null}
        {/* --- CATALOG FORM --- */}
        {viewState === 'CATALOG_FORM' &&
            <div className="flex flex-col h-full bg-white dark:bg-slate-900">
               <div className="px-4 py-4 md:px-8 border-b flex justify-between items-center">
                    <h2 className="text-xl font-black uppercase text-slate-900 shrink-0 truncate">{formData.id ? 'Sửa Danh Mục' : 'Thêm Mới Danh Mục'}</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setViewState(formData.id ? 'CATALOG_DETAIL' : 'LIST')} className="px-5 py-2 text-slate-500 font-bold uppercase text-xs hover:bg-slate-100 rounded-xl">Hủy</button>
                        <button onClick={async () => {
                            try {
                                await saveToolCatalog({
                                    ...formData,
                                    id: formData.id || `CAT_${Date.now()}`,
                                    created_by: formData.created_by || user.id
                                });
                                await loadCatalogs();
                                if (selectedCatalog && formData.id) loadCatalogDetails(formData);
                                else setViewState('LIST');
                            } catch(e) { alert('Lỗi lưu danh mục'); }
                        }} disabled={!formData.code || !formData.name} className="px-5 py-2 bg-indigo-600 text-white font-bold uppercase text-xs rounded-xl disabled:opacity-50">Lưu</button>
                    </div>
                </div> 
                <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl mx-auto w-full space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1 block"><label className="text-xs font-bold uppercase">Mã Loại *</label><input value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12" placeholder="VD: TC-35M" /></div>
                        <div className="space-y-1 block"><label className="text-xs font-bold uppercase">Tên Loại *</label><input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12" placeholder="Tên Loại CCDC" /></div>
                        <div className="space-y-1 block md:col-span-2"><label className="text-xs font-bold uppercase">Kiểu (Type)</label><input value={formData.type || ''} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12" placeholder="Cầm tay, Đo lường..." /></div>
                        <div className="space-y-1 block md:col-span-2"><label className="text-xs font-bold uppercase">Đặc tính kỹ thuật (Specs)</label><textarea value={formData.specifications || ''} onChange={e => setFormData({...formData, specifications: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-24" /></div>
                        
                        <div className="space-y-1 block md:col-span-2 mt-4">
                            <label className="text-xs font-bold uppercase flex justify-between">Hướng Dẫn Sử Dụng (Markdown)
                                <label className="text-indigo-600 cursor-pointer flex items-center gap-1"><ImageIcon className="w-3 h-3"/> Chèn Ảnh<input type="file" className="hidden" accept="image/*" onChange={async e => {
                                    if(e.target.files?.[0]){
                                        const url = await uploadQMSImage(e.target.files[0], 'MANUAL');
                                        setFormData({...formData, manual_markdown: (formData.manual_markdown || '') + `\n![image](${url})\n`});
                                    }
                                }}/></label>
                            </label>
                            <textarea value={formData.manual_markdown || ''} onChange={e => setFormData({...formData, manual_markdown: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl font-mono text-sm border-none h-48" />
                        </div>
                        <div className="space-y-1 block md:col-span-2">
                            <label className="text-xs font-bold uppercase flex justify-between items-center">
                                <span>Tài liệu đính kèm (Drive URL)</span>
                                <label className="text-indigo-600 hover:text-indigo-700 cursor-pointer flex items-center gap-1 text-xs font-bold transition">
                                    <FileText className="w-3.5 h-3.5" />
                                    Tải lên PDF thiết bị
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="application/pdf" 
                                        onChange={async e => {
                                            if (e.target.files?.[0]) {
                                                try {
                                                    const url = await uploadQMSImage(e.target.files[0], 'CATALOG_PDF');
                                                    setFormData({ ...formData, manual_pdf_url: url });
                                                } catch (err) {
                                                    alert('Không thể tải PDF lên hệ thống.');
                                                }
                                            }
                                        }} 
                                    />
                                </label>
                            </label>
                            <input 
                                value={formData.manual_pdf_url || ''} 
                                onChange={e => setFormData({...formData, manual_pdf_url: e.target.value})} 
                                className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12" 
                                placeholder="Nhập Link hoặc Tải lên tệp PDF từ thiết bị..." 
                            />
                        </div>
                    </div>
                </div>
            </div>
        }

        {/* --- CATALOG DETAIL (Show list of Assets) --- */}
        {viewState === 'CATALOG_DETAIL' && selectedCatalog &&
            <div className="flex flex-col h-full">
                <div className="px-4 py-3 md:px-8 bg-white border-b flex justify-between items-center shrink-0">
                    <button onClick={() => setViewState('LIST')} className="p-2 border rounded-full hover:bg-slate-100 flex items-center justify-center w-8 h-8 shrink-0">{'<'}</button>
                    <div className="flex-1 mx-4 truncate"><h2 className="text-xl font-black uppercase text-slate-900 truncate">{selectedCatalog.code} - {selectedCatalog.name}</h2></div>
                    <div className="flex gap-2 shrink-0">
                        {isManagerOrAdmin && (
                            <>
                                <button onClick={() => { setFormData(selectedCatalog); setViewState('CATALOG_FORM'); }} className="p-2 border rounded-full hover:bg-slate-100"><Edit className="w-4 h-4"/></button>
                                <button onClick={async () => {
                                    if (assets.length > 0) return alert('Không thể xóa danh mục đã có tài sản vất lý.');
                                    if (window.confirm('Xóa danh mục này?')) { await deleteToolCatalog(selectedCatalog.id); setViewState('LIST'); loadCatalogs(); }
                                }} className="p-2 border border-red-200 text-red-500 rounded-full hover:bg-red-50"><Trash2 className="w-4 h-4"/></button>
                            </>
                        )}
                    </div>
                </div> 
                <div className="flex-1 overflow-y-auto p-4 md:p-8 block">
                    <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                         
                         {/* LEFT COL: Catalog info & Manual */}
                         <div className="md:col-span-1 space-y-6">
                             <div className="p-6 bg-white rounded-3xl border shadow-sm">
                                <h3 className="font-black text-lg uppercase tracking-tight mb-4 text-slate-900">Thông Tin Chung</h3>
                                <div className="space-y-3">
                                    <div><p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Loại</p><p className="font-medium text-sm">{selectedCatalog.type || '---'}</p></div>
                                    <div><p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Đặc tính</p><p className="font-medium text-sm">{selectedCatalog.specifications || '---'}</p></div>
                                </div>
                             </div>

                             {(selectedCatalog.manual_markdown || selectedCatalog.manual_pdf_url) && (
                                <div className="p-6 bg-white rounded-3xl border shadow-sm">
                                    <h3 className="font-black text-md uppercase tracking-tight flex items-center gap-2 mb-4"><FileText className="w-4 h-4"/> Hướng Dẫn</h3>
                                    {selectedCatalog.manual_pdf_url && (
                                        <a href={selectedCatalog.manual_pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl text-xs font-bold w-full mb-4 justify-center"><ExternalLink className="w-4 h-4"/> Mở PDF đính kèm (Drive)</a>
                                    )}
                                    {selectedCatalog.manual_markdown && (
                                        <div className="prose prose-sm prose-slate max-w-none text-xs"><Markdown>{selectedCatalog.manual_markdown}</Markdown></div>
                                    )}
                                </div>
                             )}
                         </div>

                         {/* RIGHT COL: Physical Assets */}
                         <div className="md:col-span-2">
                             <div className="p-6 bg-white rounded-3xl border shadow-sm h-full">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2"><Hash className="w-5 h-5"/> Danh Sách Tài Sản Vật Lý</h3>
                                    {isManagerOrAdmin && (
                                        <button onClick={() => { setFormData({ catalog_id: selectedCatalog.id, status: 'AVAILABLE' }); setViewState('ASSET_FORM'); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[10px] hover:bg-indigo-700">Tạo Tài Sản</button>
                                    )}
                                </div>
                                
                                {assets.length === 0 ? <p className="text-sm text-slate-500">Chưa có tài sản thực tế nào.</p> : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {assets.map(asset => {
                                            let calibStatus = 'ok';
                                            if (asset.next_calibration_date) {
                                                const daysLeft = (asset.next_calibration_date * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
                                                if (daysLeft < 0) calibStatus = 'overdue';
                                                else if (daysLeft < 30) calibStatus = 'upcoming';
                                            }
                                            return (
                                            <div key={asset.id} onClick={() => loadAssetDetails(asset)} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-indigo-500 cursor-pointer transition-all">
                                                <div className="flex justify-between mb-2">{getStatusBadge(asset.status)}</div>
                                                <h4 className="font-black text-indigo-700 uppercase tracking-widest text-sm mb-1">{asset.asset_code}</h4>
                                                <p className="text-xs text-slate-600 mb-2">Người giữ: <strong>{formatUserDisplayById(asset.current_user_id)}</strong></p>
                                                {asset.next_calibration_date && (
                                                    <div className={`mt-2 px-2 py-1.5 rounded-lg text-[10px] font-bold ${calibStatus === 'overdue' ? 'bg-red-50 text-red-700' : calibStatus === 'upcoming' ? 'bg-amber-50 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>H.C Tới: {new Date(asset.next_calibration_date * 1000).toLocaleDateString('vi-VN')}</div>
                                                )}
                                            </div>
                                        )})}
                                    </div>
                                )}
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        }

        {/* --- ASSET FORM --- */}
        {viewState === 'ASSET_FORM' &&
            <div className="flex flex-col h-full bg-white dark:bg-slate-900">
               <div className="px-4 py-4 md:px-8 border-b flex justify-between items-center">
                    <h2 className="text-xl font-black uppercase text-slate-900 shrink-0 truncate">{formData.id ? 'Sửa Tài Sản' : 'Tạo Tài Sản Mới'}</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setViewState(formData.id ? 'ASSET_DETAIL' : 'CATALOG_DETAIL')} className="px-5 py-2 text-slate-500 font-bold uppercase text-xs hover:bg-slate-100 rounded-xl">Hủy</button>
                        <button onClick={async () => {
                            try {
                                await saveToolAsset({
                                    ...formData,
                                    id: formData.id || `AST_${Date.now()}`,
                                    created_by: formData.created_by || user.id
                                });
                                if (selectedCatalog) await loadCatalogDetails(selectedCatalog);
                            } catch(e) { alert('Lỗi lưu tài sản'); }
                        }} disabled={!formData.asset_code} className="px-5 py-2 bg-indigo-600 text-white font-bold uppercase text-xs rounded-xl disabled:opacity-50">Lưu</button>
                    </div>
                </div> 
                <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1 block"><label className="text-xs font-bold uppercase">Mã Tài Sản (Asset Tag) *</label><input value={formData.asset_code || ''} onChange={e => setFormData({...formData, asset_code: e.target.value.toUpperCase()})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12 text-indigo-700" placeholder="VD: QC-TC-001" /></div>
                        <div className="space-y-1 block"><label className="text-xs font-bold uppercase">Số Serial (S/N)</label><input value={formData.serial_number || ''} onChange={e => setFormData({...formData, serial_number: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12" /></div>
                        <div className="space-y-1 block md:col-span-2">
                            <label className="text-xs font-bold uppercase">Trạng Thái</label>
                            <select value={formData.status || 'AVAILABLE'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none h-12">
                                <option value="AVAILABLE">Sẵn sàng (Kho)</option>
                                <option value="IN_USE">Đang sử dụng</option>
                                <option value="MAINTENANCE">Bảo trì</option>
                                <option value="BROKEN">Hỏng</option>
                                <option value="LOST">Thất lạc</option>
                            </select>
                        </div>
                        {isManagerOrAdmin && (
                            <div className="space-y-1 block md:col-span-2">
                                <QCSelectionCombobox 
                                    label="Người giữ / Sở hữu tài sản"
                                    value={formData.current_user_id || ''}
                                    onChange={userId => setFormData({ ...formData, current_user_id: userId || '' })}
                                    users={usersList}
                                />
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                    Lưu ý: Chỉ dành cho Admin và Manager thay đổi trực tiếp chủ sở hữu.
                                </p>
                            </div>
                        )}
                        {formData.id && (
                             <div className="space-y-1 block md:col-span-2"><label className="text-xs font-bold uppercase text-red-500">Danger Zone</label>
                             <button onClick={async () => {
                                 if (window.confirm("Thực sự muốn xóa tài sản vật lý này?")) {
                                     await deleteToolAsset(formData.id);
                                     if(selectedCatalog) loadCatalogDetails(selectedCatalog);
                                 }
                             }} className="w-full p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl font-bold text-sm">XÓA TÀI SẢN NÀY</button>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        }

        {/* --- ASSET DETAIL --- */}
        {viewState === 'ASSET_DETAIL' && selectedAsset &&
            <div className="flex flex-col h-full">
                <div className="px-4 py-3 md:px-8 bg-white border-b flex justify-between items-center shrink-0">
                    <button onClick={() => { if(selectedCatalog) loadCatalogDetails(selectedCatalog); else setViewState('LIST'); }} className="p-2 border rounded-full hover:bg-slate-100 flex items-center justify-center w-8 h-8 shrink-0">{'<'}</button>
                    <div className="flex-1 mx-4 truncate"><h2 className="text-xl font-black uppercase text-slate-900 truncate">Tài Sản: {selectedAsset.asset_code}</h2></div>
                    <div className="flex gap-2 shrink-0">
                        {isManagerOrAdmin && (
                            <button onClick={() => { setFormData(selectedAsset); setViewState('ASSET_FORM'); }} className="p-2 border rounded-full hover:bg-slate-100"><Edit className="w-4 h-4"/></button>
                        )}
                    </div>
                </div> 
                <div className="flex-1 overflow-y-auto p-4 md:p-8 block">
                    <div className="max-w-4xl mx-auto space-y-6">
                         
                         <div className="p-6 md:p-8 bg-white rounded-3xl border shadow-sm">
                             <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-2xl uppercase tracking-tight text-indigo-700">{selectedAsset.asset_code}</h3>
                                {getStatusBadge(selectedAsset.status)}
                             </div>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-50 p-4 rounded-xl">
                                 <div><p className="text-xs text-slate-500 font-bold uppercase mb-1">Mã Loại (Catalog)</p><p className="font-medium text-sm">{(selectedAsset as any).catalog_code}</p></div>
                                 <div><p className="text-xs text-slate-500 font-bold uppercase mb-1">Tên Loại</p><p className="font-medium text-sm">{(selectedAsset as any).catalog_name}</p></div>
                                 <div className="col-span-2"><p className="text-xs text-slate-500 font-bold uppercase mb-1">Số Serial</p><p className="font-medium text-sm">{selectedAsset.serial_number || '---'}</p></div>
                             </div>
                             
                             <div className="mt-8 flex gap-4">
                                 <button onClick={() => { setFormData({ tool_asset_id: selectedAsset.id, to_user_id: user.id }); setViewState('TRANSFER_FORM'); }} className="flex-1 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl font-bold uppercase text-xs hover:bg-indigo-100 flex items-center justify-center gap-2"><ArrowRightLeft className="w-4 h-4"/> YÊU CẦU BÀN GIAO</button>
                                 <button onClick={() => { setFormData({ tool_asset_id: selectedAsset.id, requested_by: user.id }); setViewState('CALIB_FORM'); }} className="flex-1 py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold uppercase text-xs hover:bg-amber-100 flex items-center justify-center gap-2"><CheckCircle className="w-4 h-4"/> Y.C HIỆU CHUẨN</button>
                             </div>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* TRANSFERS */}
                            <div className="p-6 bg-white rounded-3xl border shadow-sm">
                                <h3 className="font-black text-md uppercase tracking-tight flex items-center gap-2 mb-4"><ArrowRightLeft className="w-4 h-4"/> Lịch Sử Luân Chuyển</h3>
                                {transfers.length === 0 ? <p className="text-sm text-slate-500">Chưa có luân chuyển.</p> : (
                                    <div className="space-y-4">
                                        {transfers.map(tr => (
                                            <div key={tr.id} className="p-4 border rounded-2xl bg-slate-50">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-bold bg-slate-200 px-2 py-1 text-slate-700 rounded-lg">{new Date(tr.request_date * 1000).toLocaleDateString('vi-VN')}</span>
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-lg ${tr.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{tr.status}</span>
                                                </div>
                                                <p className="text-sm">Từ: <strong className="text-indigo-600">{formatUserDisplayById(tr.from_user_id)}</strong> ➔ Tới: <strong className="text-indigo-600">{formatUserDisplayById(tr.to_user_id)}</strong></p>
                                                {tr.status === 'PENDING' && (checkIsCurrentUser(tr.to_user_id) || isManagerOrAdmin) && (
                                                    <button onClick={() => { setFormData(tr); setViewState('TRANSFER_FORM'); }} className="mt-3 w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg uppercase">Xem / Phê Duyệt</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* CALIBRATIONS */}
                            <div className="p-6 bg-white rounded-3xl border shadow-sm">
                                <h3 className="font-black text-md uppercase tracking-tight flex items-center gap-2 mb-4"><FileBadge className="w-4 h-4"/> Lịch Sử Hiệu Chuẩn</h3>
                                {calibrations.length === 0 ? <p className="text-sm text-slate-500">Chưa có hiệu chuẩn.</p> : (
                                    <div className="space-y-4">
                                        {calibrations.map(cb => (
                                            <div key={cb.id} className="p-4 border rounded-2xl bg-slate-50">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-bold bg-slate-200 px-2 py-1 text-slate-700 rounded-lg">{new Date(cb.request_date * 1000).toLocaleDateString('vi-VN')}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${cb.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{cb.status}</span>
                                                </div>
                                                <p className="text-sm">Người YC: <strong>{formatUserDisplayById(cb.requested_by)}</strong></p>
                                                {cb.status === 'PENDING' && isManagerOrAdmin && (
                                                    <button onClick={() => { setFormData(cb); setViewState('CALIB_FORM'); }} className="mt-3 w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg uppercase">Duyệt Yêu Cầu</button>
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
        }

        {/* --- TRANSFER FORM --- */}
        {viewState === 'TRANSFER_FORM' &&
            <div className="flex flex-col h-full bg-slate-50">
                <div className="px-4 py-4 md:px-8 bg-white border-b flex justify-between items-center">
                    <h2 className="text-lg font-black uppercase text-slate-900 truncate">Phiếu Luân Chuyển</h2>
                    <button onClick={() => setViewState(selectedAsset ? 'ASSET_DETAIL' : 'LIST')} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 rounded-xl">Quay Lại</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl mx-auto w-full">
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border space-y-6">
                        <div className="bg-indigo-50 p-4 rounded-xl">
                            <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Tài Sản Bàn Giao</p>
                            <p className="text-lg font-black text-indigo-700 uppercase">
                                {formData.tool_asset_ids?.length > 1 
                                    ? `Bàn giao hàng loạt (${formData.tool_asset_ids.length} thiết bị)`
                                    : (selectedAsset?.asset_code || 'Chưa xác định')
                                }
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><p className="text-xs text-slate-500 font-bold uppercase mb-1">Người Bàn Giao</p><p className="font-medium text-sm">{formatUserDisplayById(formData.from_user_id)}</p></div>
                            <div>
                                <QCSelectionCombobox 
                                    label="Người Nhận (Nhân viên)"
                                    value={formData.to_user_id || ''}
                                    onChange={userId => setFormData({...formData, to_user_id: userId})}
                                    users={usersList}
                                    disabled={!!formData.id}
                                />
                            </div>
                        </div>
                        
                        {formData.id ? (
                            <>
                                {(!formData.receiver_confirm_date && checkIsCurrentUser(formData.to_user_id)) && (
                                    <div className="space-y-5 pt-4 border-t border-slate-200">
                                        <h4 className="font-bold text-sm uppercase flex items-center gap-2"><CheckCircle className="w-4 h-4 text-indigo-500"/> Người nhận xác nhận</h4>
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ảnh thực trạng (Tùy chọn)</p>
                                            <label className="cursor-pointer bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-slate-100 text-slate-500">
                                                {formData.receiver_image ? <img src={formData.receiver_image} className="h-32 object-contain rounded-lg"/> : <><ImageIcon className="w-6 h-6"/><span className="text-xs font-bold">Chụp hoặc Tải Lên</span></>}
                                                <input type="file" className="hidden" accept="image/*" onChange={async e => {
                                                    if(e.target.files) setFormData({...formData, receiver_image: await uploadQMSImage(e.target.files[0], 'TRANSFER')});
                                                }}/>
                                            </label>
                                        </div>
                                        <SignaturePad label="Chữ ký người nhận" value={formData.receiver_signature || ''} onChange={s => setFormData({...formData, receiver_signature: s})} />
                                        <button onClick={async () => {
                                            if (!formData.receiver_signature) return alert("Bắt buộc phải ký tên xác nhận!");
                                            const confirmDate = Math.floor(Date.now()/1000);
                                            const updatedTransfer = { ...formData, receiver_confirm_date: confirmDate };
                                            await saveToolTransfer(updatedTransfer);
                                            setFormData(updatedTransfer);
                                            if (selectedAsset) {
                                                const [tData] = await Promise.all([
                                                    fetchToolTransfers(selectedAsset.id)
                                                ]);
                                                setTransfers(tData);
                                            }
                                        }} className="w-full py-3 bg-indigo-600 text-white font-bold tracking-widest text-sm rounded-xl hover:bg-indigo-700 transition">XÁC NHẬN ĐÃ NHẬN ĐỦ</button>
                                    </div>
                                )}

                                {/* Informative notice if receiver has not signed yet and current user is not the receiver */}
                                {(!formData.receiver_confirm_date && !checkIsCurrentUser(formData.to_user_id)) && (
                                    <div className="p-5 border border-amber-200 bg-amber-50/50 rounded-2xl text-center space-y-2">
                                        <p className="text-sm font-bold text-amber-800 uppercase flex items-center justify-center gap-2">Chờ người nhận xác nhận</p>
                                        <p className="text-xs text-amber-600">
                                            Phiếu luân chuyển đang chờ người nhận <strong>{formatUserDisplayById(formData.to_user_id)}</strong> ký xác nhận đã nhận đủ thiết bị trước khi có thể phê duyệt.
                                        </p>
                                    </div>
                                )}

                                {(formData.receiver_confirm_date && !formData.manager_approve_date && isManagerOrAdmin) && (
                                    <div className="space-y-5 pt-4 border-t border-slate-200 bg-amber-50/50 rounded-2xl p-6">
                                        <h4 className="font-bold text-sm uppercase text-amber-700 flex items-center gap-2">Phê duyệt của QC Manager</h4>
                                        <SignaturePad label="Chữ ký quản lý" value={formData.manager_signature || ''} onChange={s => setFormData({...formData, manager_signature: s})} />
                                        <button onClick={async () => {
                                            if (!formData.manager_signature) return alert("Vui lòng ký tên phê duyệt");
                                            await saveToolTransfer({ ...formData, status: 'APPROVED', manager_approve_date: Math.floor(Date.now()/1000) });
                                            if (selectedAsset) loadAssetDetails(selectedAsset);
                                            else { setViewState('LIST'); loadMyAssets(); }
                                        }} className="w-full py-3 bg-amber-600 text-white font-bold tracking-widest text-sm rounded-xl hover:bg-amber-700 transition">DUYỆT QUYẾT ĐỊNH LUÂN CHUYỂN</button>
                                    </div>
                                )}

                                {/* Informative notice if receiver has signed but manager has not, and current user is not a manager */}
                                {(formData.receiver_confirm_date && !formData.manager_approve_date && !isManagerOrAdmin) && (
                                    <div className="p-5 border border-teal-200 bg-teal-50/50 rounded-2xl text-center space-y-2">
                                        <p className="text-sm font-bold text-teal-800 uppercase flex items-center justify-center gap-2">Chờ Manager phê duyệt</p>
                                        <p className="text-xs text-teal-600">
                                            Người nhận đã ký nhận. Đang chờ QC Manager hệ thống phê duyệt quyết định luân chuyển cuối cùng.
                                        </p>
                                    </div>
                                )}

                                {formData.status === 'APPROVED' && <div className="p-4 bg-green-50 text-green-700 border border-green-200 font-bold rounded-2xl text-center">✅ PHIẾU ĐÃ KẾT THÚC CẬP NHẬT</div>}
                            </>
                        ) : (
                            <button onClick={async () => {
                                if(!formData.to_user_id) return alert("Chưa nhập người nhận");
                                await saveToolTransfer({ ...formData, from_user_id: formData.from_user_id || selectedAsset?.current_user_id || undefined, id: `TRF_${Date.now()}`, request_date: Math.floor(Date.now()/1000) });
                                if (selectedAsset) loadAssetDetails(selectedAsset);
                                else {
                                    setViewState('LIST');
                                    setSelectedAssetIds([]);
                                    loadMyAssets();
                                }
                            }} className="w-full py-4 bg-indigo-600 text-white font-black text-sm tracking-widest rounded-2xl uppercase hover:bg-indigo-700 mt-4">Kích Hoạt Phiếu Luân Chuyển</button>
                        )}
                    </div>
                </div>
            </div>
        }

        {/* --- CALIBRATION FORM --- */}
        {viewState === 'CALIB_FORM' &&
            <div className="flex flex-col h-full bg-slate-50">
                <div className="px-4 py-4 md:px-8 bg-white border-b flex justify-between items-center">
                    <h2 className="text-lg font-black uppercase text-slate-900 truncate">Phiếu Hiệu Chuẩn</h2>
                    <button onClick={() => setViewState('ASSET_DETAIL')} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 rounded-xl">Quay Lại</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl mx-auto w-full">
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border space-y-6">
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <p className="text-xs font-bold text-amber-600 uppercase mb-1">Mã Tài Sản HC</p>
                            <p className="text-lg font-black text-amber-800 uppercase">{selectedAsset?.asset_code}</p>
                        </div>
                        
                        {formData.id ? (
                            <>
                                {formData.status === 'PENDING' && isManagerOrAdmin && (
                                    <div className="space-y-4 pt-4 border-t border-slate-200">
                                        <h4 className="font-bold text-sm uppercase">Cập nhật kết quả HC</h4>
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] font-bold uppercase text-slate-500">Giấy chứng nhận (Link)</label>
                                                <label className="text-indigo-600 hover:text-indigo-700 cursor-pointer flex items-center gap-1 text-[10px] font-bold transition">
                                                    <FileText className="w-3 h-3" />
                                                    Tải lên PDF thiết bị
                                                    <input 
                                                        type="file" 
                                                        className="hidden" 
                                                        accept="application/pdf" 
                                                        onChange={async e => {
                                                            if (e.target.files?.[0]) {
                                                                try {
                                                                    const url = await uploadQMSImage(e.target.files[0], 'CALIB_CERT_PDF');
                                                                    setFormData({ ...formData, certificate_url: url });
                                                                } catch (err) {
                                                                    alert('Không thể tải PDF lên hệ thống.');
                                                                }
                                                            }
                                                        }} 
                                                    />
                                                </label>
                                            </div>
                                            <input 
                                                value={formData.certificate_url || ''} 
                                                onChange={e => setFormData({...formData, certificate_url: e.target.value})} 
                                                className="w-full p-3 bg-slate-50 rounded-xl font-medium text-sm" 
                                                placeholder="Nhập Link hoặc Tải lên tệp PDF từ thiết bị..." 
                                            />
                                        </div>
                                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Ghi chú kết quả</label><textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl h-20" /></div>
                                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Ngày H.C Tiếp Theo</label><input type="date" onChange={e => {
                                            const d = new Date(e.target.value);
                                            setFormData({...formData, next_calibration_date: Math.floor(d.getTime()/1000)});
                                        }} className="w-full p-3 bg-slate-50 rounded-xl font-bold" /></div>
                                        
                                        <button onClick={async () => {
                                            if (!formData.next_calibration_date) return alert("Vui lòng thiết lập ngày HC tiếp theo!");
                                            await saveToolCalibration({ ...formData, status: 'COMPLETED', calibration_date: Math.floor(Date.now()/1000), approved_by: user.id });
                                            if (selectedAsset) loadAssetDetails(selectedAsset);
                                        }} className="w-full py-4 bg-green-600 text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-green-700">CẬP NHẬT KẾT QUẢ TỐT</button>
                                    </div>
                                )}
                                {formData.status === 'COMPLETED' && <div className="p-4 bg-green-50 text-green-700 font-bold rounded-2xl text-center border border-green-200">✅ ĐÃ HOÀN TẤT CHU KỲ HIỆU CHUẨN</div>}
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-1"><label className="text-xs font-bold uppercase">Lý do / Tình trạng trước HC</label><textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl h-24 border-none text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Máy bị lệch sai số, đến hạn kỳ..."></textarea></div>
                                <button onClick={async () => {
                                    await saveToolCalibration({ ...formData, id: `CAL_${Date.now()}`, request_date: Math.floor(Date.now()/1000) });
                                    if (selectedAsset) loadAssetDetails(selectedAsset);
                                }} className="w-full py-4 bg-amber-500 text-white font-black uppercase text-sm tracking-widest rounded-2xl hover:bg-amber-600 shadow-sm mt-4 text-shadow">PHÁT HÀNH PHIẾU YÊU CẦU HC</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        }
    </div>
  );
};
