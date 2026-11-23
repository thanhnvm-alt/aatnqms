import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Package, Download, Upload, Loader2, X } from 'lucide-react';
import { Material, User, Role, hasPermission } from '../types';
import { fetchMaterials, saveMaterial, deleteMaterial, exportMaterials, importMaterialsFile, fetchRoles } from '../services/apiService';
import { useTheme } from '../src/context/ThemeContext';

export const MaterialManagement: React.FC<{ user: User }> = ({ user }) => {
  const { density } = useTheme();
  const paddingClass = density === 'compact' ? 'px-3 py-2.5' : 'px-4 py-3';

  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const handleCommitSearch = () => {
    setSearchTerm(searchInput);
    loadMaterials(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 50;

  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    loadMaterials(page);
  }, [page]);

  useEffect(() => {
    fetchRoles().then(setRoles).catch(err => console.error('Failed to load roles in MaterialManagement:', err));
  }, []);

  const loadMaterials = async (p: number) => {
    setIsLoading(true);
    setSelectedIds([]);
    try {
      const data = await fetchMaterials(searchTerm, p, limit);
      setMaterials(data.items || []);
      setTotal(data.total || 0);
      setPage(p);
    } catch (error) {
      console.error('Failed to load materials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
    setIsExporting(true);
    try {
      await exportMaterials(format);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Lỗi khi xuất file báo cáo');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importMaterialsFile(file);
      alert(`Nhập thành công ${result.count} vật tư`);
      loadMaterials(1);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Lỗi khi nhập file Excel');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const material: Material = {
      id: editingMaterial?.id || '',
      material: formData.get('material') as string,
      shortText: formData.get('shortText') as string,
      orderUnit: formData.get('orderUnit') as string,
      orderQuantity: Number(formData.get('orderQuantity')),
      supplierName: formData.get('supplierName') as string,
      projectName: formData.get('projectName') as string,
      purchaseDocument: formData.get('purchaseDocument') as string,
      deliveryDate: formData.get('deliveryDate') as string,
      Ma_Tender: formData.get('Ma_Tender') as string,
      Factory_Order: formData.get('Factory_Order') as string,
    };
    try {
      await saveMaterial(material);
      setIsModalOpen(false);
      setEditingMaterial(null);
      loadMaterials(page);
    } catch (error) {
      console.error('Failed to save material:', error);
      alert('Lỗi khi lưu vật liệu');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa vật liệu này?')) {
      try {
        await deleteMaterial(id);
        loadMaterials(page);
      } catch (error) {
        console.error('Failed to delete material:', error);
        alert('Lỗi khi xóa vật liệu');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} vật liệu đã chọn?`)) {
      try {
        await Promise.all(selectedIds.map(id => deleteMaterial(id)));
        setSelectedIds([]);
        loadMaterials(page);
      } catch (error) {
        console.error('Failed to bulk delete materials:', error);
        alert('Lỗi khi xóa vật liệu');
      }
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === materials.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(materials.map(m => m.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1120] overflow-hidden transition-colors duration-200">
      <div className="bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 p-3 sticky top-0 z-40 shadow-sm flex flex-wrap items-center justify-end gap-2 shrink-0 transition-colors">
          <div className="relative flex-1 min-w-[200px] md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              value={searchInput} 
              onChange={e => setSearchInput(e.target.value)}
              onBlur={handleCommitSearch}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[44px] lg:min-h-[38px] pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm lg:text-xs font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:bg-slate-800 dark:text-slate-100 transition-all"
            />
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />
          {hasPermission(user, roles, 'MATERIALS', 'IMPORT') && (
            <button 
              onClick={handleImportClick}
              disabled={isImporting}
              title="Nhập Excel"
              className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] p-2 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
            >
              {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            </button>
          )}
          {hasPermission(user, roles, 'MATERIALS', 'EXPORT') && (
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                title="Xuất CSV Stream (Tốc độ cao)"
                className="min-h-[44px] lg:min-h-[38px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>CSV</span>
              </button>
              <button 
                onClick={() => handleExport('xlsx')}
                disabled={isExporting}
                title="Xuất Excel (.xlsx)"
                className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] p-2 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
          )}
          {(user.role === 'ADMIN' || hasPermission(user, roles, 'MATERIALS', 'CREATE')) && (
            <button 
              onClick={() => { setEditingMaterial(null); setIsModalOpen(true); }}
              title="Thêm Vật Liệu"
              className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] p-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center"
            >
              <Plus size={16} /> 
            </button>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 no-scrollbar pb-24 flex flex-col">
        {(user.role === 'ADMIN' || hasPermission(user, roles, 'MATERIALS', 'DELETE')) && selectedIds.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl flex items-center justify-between gap-2 shrink-0">
            <span className="text-sm font-medium text-red-700 dark:text-red-300">Đã chọn {selectedIds.length} vật liệu</span>
            <button onClick={handleBulkDelete} className="min-h-[44px] lg:min-h-[36px] px-3.5 py-2 bg-red-600 text-white rounded-lg text-xs font-bold uppercase hover:bg-red-700 flex items-center gap-2">
              <Trash2 size={14} /> Xóa đã chọn
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 shadow rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex-1 flex flex-col transition-colors">
        {/* Mobile Cards (< md) */}
        <div className="md:hidden flex-1 divide-y divide-slate-200 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">Đang tải dữ liệu...</div>
          ) : materials.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">Không tìm thấy vật liệu nào.</div>
          ) : materials.map(m => (
            <div key={m.id} className="p-4 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 block">{m.material}</span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">{m.shortText}</p>
                  </div>
                </label>
                <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums shrink-0">
                  {m.orderQuantity} {m.orderUnit}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Nhà cung cấp</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate block">{m.supplierName || '---'}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Mã PO</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{m.purchaseDocument || '---'}</span>
                </div>
                <div className="col-span-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Dự án</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate block">{m.projectName || '---'}</span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => { setEditingMaterial(m); setIsModalOpen(true); }} className="min-w-[44px] min-h-[44px] px-3 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold"><Edit2 size={16} /> <span>Xem/Sửa</span></button>
                <button onClick={() => handleDelete(m.id)} className="min-w-[44px] min-h-[44px] px-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Tablet & Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto flex-1">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`${paddingClass} w-12`}>
                  <input type="checkbox" checked={selectedIds.length === materials.length && materials.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700" />
                </th>
                <th className={`${paddingClass} text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap`}>Mã Vật Tư</th>
                <th className={`${paddingClass} text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase`}>Tên Vật Tư</th>
                <th className={`${paddingClass} text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap`}>Đơn vị</th>
                <th className={`${paddingClass} text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap`}>Số lượng</th>
                <th className={`${paddingClass} text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase`}>Nhà Cung Cấp</th>
                <th className={`${paddingClass} text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase`}>Dự Án</th>
                <th className={`${paddingClass} text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap`}>Mã PO</th>
                <th className={`${paddingClass} text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap`}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className={`${paddingClass} text-center text-slate-500 dark:text-slate-400`}>
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : materials.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className={paddingClass}>
                    <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700" />
                  </td>
                  <td className={`${paddingClass} text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap font-mono tabular-nums`}>{m.material}</td>
                  <td className={`${paddingClass} text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate`} title={m.shortText}>{m.shortText}</td>
                  <td className={`${paddingClass} text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono`}>{m.orderUnit}</td>
                  <td className={`${paddingClass} text-sm text-slate-600 dark:text-slate-300 text-right whitespace-nowrap font-mono tabular-nums`}>{m.orderQuantity}</td>
                  <td className={`${paddingClass} text-sm text-slate-600 dark:text-slate-300 max-w-[150px] truncate`} title={m.supplierName}>{m.supplierName}</td>
                  <td className={`${paddingClass} text-sm text-slate-600 dark:text-slate-300 max-w-[150px] truncate`} title={m.projectName}>{m.projectName}</td>
                  <td className={`${paddingClass} text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono tabular-nums`}>{m.purchaseDocument}</td>
                  <td className={`${paddingClass} text-right whitespace-nowrap`}>
                    <div className="inline-flex items-center justify-end gap-2">
                      <button onClick={() => { setEditingMaterial(m); setIsModalOpen(true); }} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(m.id)} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && materials.length === 0 && (
                <tr>
                  <td colSpan={9} className={`${paddingClass} text-center text-slate-500 dark:text-slate-400`}>
                    Không tìm thấy vật liệu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* PAGINATION */}
        {total > limit && (
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <button 
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage(page - 1)}
                    className="min-h-[44px] lg:min-h-[36px] px-4 py-2 lg:py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    Trang trước
                </button>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center tabular-nums">
                    Trang {page} / {Math.ceil(total / limit)} ({total} vật liệu)
                </div>
                <button 
                    disabled={page * limit >= total || isLoading}
                    onClick={() => setPage(page + 1)}
                    className="min-h-[44px] lg:min-h-[36px] px-4 py-2 lg:py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    Trang sau
                </button>
            </div>
        )}
      </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200 truncate">
                {editingMaterial ? 'Sửa thông tin vật liệu' : 'Thêm vật liệu mới'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Mã Vật Tư *</label>
                  <input name="material" defaultValue={editingMaterial?.material} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Tên Vật Tư *</label>
                  <input name="shortText" defaultValue={editingMaterial?.shortText} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Đơn vị *</label>
                  <input name="orderUnit" defaultValue={editingMaterial?.orderUnit} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Số lượng</label>
                  <input type="number" step="0.01" name="orderQuantity" defaultValue={editingMaterial?.orderQuantity} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Nhà Cung Cấp</label>
                  <input name="supplierName" defaultValue={editingMaterial?.supplierName} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Dự Án</label>
                  <input name="projectName" defaultValue={editingMaterial?.projectName} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Mã PO (Purchase Document)</label>
                  <input name="purchaseDocument" defaultValue={editingMaterial?.purchaseDocument} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Ngày giao hàng</label>
                  <input type="date" name="deliveryDate" defaultValue={editingMaterial?.deliveryDate?.split('T')[0]} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Mã Tender</label>
                  <input name="Ma_Tender" defaultValue={editingMaterial?.Ma_Tender} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Factory Order</label>
                  <input name="Factory_Order" defaultValue={editingMaterial?.Factory_Order} className="w-full min-h-[44px] lg:min-h-[40px] p-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0">Hủy</button>
              <button type="submit" className="min-h-[44px] sm:min-h-[36px] px-4 sm:px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm whitespace-nowrap shrink-0">Lưu thông tin</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
