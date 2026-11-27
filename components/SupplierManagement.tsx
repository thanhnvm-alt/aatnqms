
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Supplier, User, hasPermission } from '../types';
import { fetchSuppliers, saveSupplier, deleteSupplier, fetchSupplierStats, exportSuppliers, importSuppliersFile } from '../services/apiService';
import { 
  Building2, Search, Plus, Filter, 
  Loader2, Truck, ChevronRight, MapPin, 
  User as UserIcon, Phone, Mail, Activity,
  CheckCircle2, AlertTriangle, MoreVertical, X,
  Trash2, Edit3, Save, Star, Download, Upload
} from 'lucide-react';
import { Button } from './Button';
import { Combobox } from '../src/components/qms';

interface SupplierManagementProps {
  user: User;
  onSelectSupplier: (s: Supplier) => void;
}

export const SupplierManagement: React.FC<SupplierManagementProps> = ({ user, onSelectSupplier }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('reports');
  const [searchInput, setSearchInput] = useState('');

  const handleCommitSearch = () => {
    setPage(1);
    setSearchTerm(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Supplier>>({
    code: '', name: '', address: '', contact_person: '', phone: '', email: '', category: 'Raw Materials', status: 'ACTIVE'
  });

  useEffect(() => {
    loadSuppliers(searchTerm, page, sortBy);
  }, [searchTerm, page, sortBy]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadSuppliers = async (search = '', currentPage = 1, currentSort = sortBy) => {
    setIsLoading(true);
    try {
      const result = await fetchSuppliers(search, currentPage, 20, currentSort);
      const data = result.items || [];
      setTotal(result.total || 0);
      // Load stats for each supplier
      const dataWithStats = await Promise.all(data.map(async (s: Supplier) => {
        const stats = await fetchSupplierStats(s.name);
        return { ...s, stats };
      }));
      setSuppliers(dataWithStats);
    } catch (e) { 
      console.error(e); 
      setToast({ message: 'Không thể tải danh sách nhà cung cấp', type: 'error' });
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
    setIsExporting(true);
    try {
      await exportSuppliers(format);
      setToast({ message: 'Xuất file thành công', type: 'success' });
    } catch (error) {
      console.error('Export failed:', error);
      setToast({ message: 'Lỗi khi xuất file báo cáo', type: 'error' });
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
      const result = await importSuppliersFile(file);
      setToast({ message: `Nhập thành công ${result.count} nhà cung cấp`, type: 'success' });
      loadSuppliers(searchTerm, page);
    } catch (error) {
      console.error('Import failed:', error);
      setToast({ message: 'Lỗi khi nhập file Excel', type: 'error' });
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleOpenModal = (s?: Supplier) => {
    setFormError('');
    if (s) {
      setEditingSupplier(s);
      setFormData({
        ...s,
        code: s.code ?? '',
        name: s.name ?? '',
        address: s.address ?? '',
        contact_person: s.contact_person ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        category: s.category ?? 'Raw Materials',
        status: s.status ?? 'ACTIVE'
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        id: `SUP-${Date.now()}`,
        code: `NCC-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
        name: '', address: '', contact_person: '', phone: '', email: '', category: 'Raw Materials', status: 'ACTIVE'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.code?.trim()) {
      setFormError("Vui lòng nhập tên và mã NCC");
      return;
    }
    setIsSaving(true);
    try {
      await saveSupplier(formData as Supplier);
      await loadSuppliers(searchTerm, page, sortBy);
      setIsModalOpen(false);
      setToast({ message: 'Đã lưu thông tin nhà cung cấp', type: 'success' });
    } catch (e: any) { 
      setFormError(e?.message || "Lỗi khi lưu nhà cung cấp. Vui lòng thử lại."); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return;
    try {
      await deleteSupplier(supplierToDelete.id);
      await loadSuppliers(searchTerm, page, sortBy);
      setToast({ message: `Đã xóa nhà cung cấp ${supplierToDelete.name}`, type: 'success' });
    } catch (e) {
      setToast({ message: 'Lỗi khi xóa nhà cung cấp', type: 'error' });
    } finally {
      setSupplierToDelete(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-40 shadow-sm flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 flex-wrap sm:flex-nowrap">
            <Combobox
              value={sortBy}
              onChange={(v) => setSortBy(v || 'reports')}
              options={[
                { value: 'reports', label: 'Số lượng báo cáo' },
                { value: 'name', label: 'Tên Nhà Cung Cấp' },
                { value: 'updated_at', label: 'Cập nhật mới nhất' },
              ]}
              allowClear={false}
              ariaLabel="Sắp xếp nhà cung cấp"
              className="w-44 sm:w-52 shrink-0"
            />
            <div className="relative flex-1 min-w-[160px] md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input 
                type="text" placeholder="Tìm tên, mã, ngành hàng..." 
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onBlur={handleCommitSearch}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[44px] lg:min-h-[40px] pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />
          {hasPermission(user, [], 'SUPPLIERS', 'IMPORT') && (
            <button 
              type="button"
              onClick={handleImportClick}
              disabled={isImporting}
              title="Nhập Excel"
              aria-label="Nhập Excel"
              className="min-w-[44px] min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </button>
          )}
          {hasPermission(user, [], 'SUPPLIERS', 'EXPORT') && (
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                title="Xuất CSV Stream"
                className="min-h-[44px] lg:min-h-[40px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>CSV</span>
              </button>
              <button 
                type="button"
                onClick={() => handleExport('xlsx')}
                disabled={isExporting}
                title="Xuất Excel (.xlsx)"
                aria-label="Xuất Excel"
                className="min-w-[44px] min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] p-2 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            </div>
          )}
          {hasPermission(user, [], 'SUPPLIERS', 'CREATE') && (
            <button type="button" onClick={() => handleOpenModal()} aria-label="Thêm nhà cung cấp mới" className="min-w-[44px] min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] flex items-center justify-center p-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 transition-all"><Plus className="w-4 h-4" /></button>
          )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500"><Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400 mb-4" /><p className="font-black uppercase tracking-widest text-[9px]">Đang tải dữ liệu nhà cung cấp...</p></div>
        ) : suppliers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300"><Building2 className="w-16 h-16 opacity-10 mb-4" /><p className="font-black uppercase tracking-[0.2em] text-[10px]">Trống</p></div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Mobile Card List (< md) */}
            <div className="md:hidden space-y-3">
              {suppliers.map(s => (
                <div
                  key={s.id}
                  onClick={() => onSelectSupplier(s)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-3 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase leading-snug">{s.name}</h3>
                      <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">#{s.code}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border shrink-0 ${s.status === 'ACTIVE' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}>{s.status}</span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-700 dark:text-slate-300 uppercase">{s.category || 'Vật tư tổng hợp'}</div>
                    {s.contact_person && (
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{s.contact_person}{s.phone ? ` · ${s.phone}` : ''}</span>
                      </div>
                    )}
                    {s.address && (
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{s.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs tabular-nums">
                    <span>Pass Rate: <strong className="text-green-600 dark:text-green-400">{Math.round(s.stats?.pass_rate || 0)}%</strong></span>
                    <span>Tổng PO: <strong className="text-slate-800 dark:text-slate-200">{s.stats?.total_pos || 0}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onSelectSupplier(s)}
                      className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" /> Chi tiết
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenModal(s)}
                      className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-colors"
                    >
                      <Edit3 className="w-4 h-4" /> Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupplierToDelete(s)}
                      aria-label={`Xóa nhà cung cấp ${s.name}`}
                      className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop & Tablet Table (>= md) */}
            <div className="hidden md:block w-full overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest w-1/3">Nhà cung cấp</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest w-1/4">Ngành hàng & Liên hệ</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center w-28">Pass Rate</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center w-28">Tổng PO</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center w-28">Trạng thái</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right w-28">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {suppliers.map(s => (
                    <tr 
                      key={s.id} 
                      onClick={() => onSelectSupplier(s)} 
                      className="group hover:bg-blue-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{s.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5 tabular-nums">
                            #{s.code}
                            {s.address && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3"/> {s.address}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{s.category || 'Vật tư tổng hợp'}</span>
                          {s.contact_person && <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1"><UserIcon className="w-3 h-3"/> {s.contact_person} {s.phone && ` - ${s.phone}`}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        <span className="text-sm font-black text-green-600 dark:text-green-500">{Math.round(s.stats?.pass_rate || 0)}%</span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        <span className="text-sm font-black text-slate-700 dark:text-slate-300">{s.stats?.total_pos || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${s.status === 'ACTIVE' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                         <div className="inline-flex justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <button type="button" onClick={() => handleOpenModal(s)} aria-label={`Sửa ${s.name}`} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] inline-flex items-center justify-center text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-xl bg-slate-100 lg:bg-transparent hover:bg-blue-50 dark:bg-slate-800 lg:dark:bg-transparent dark:hover:bg-slate-800"><Edit3 className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setSupplierToDelete(s)} aria-label={`Xóa ${s.name}`} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] inline-flex items-center justify-center text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-xl bg-slate-100 lg:bg-transparent hover:bg-red-50 dark:bg-slate-800 lg:dark:bg-transparent dark:hover:bg-slate-800" title="Xóa nhà cung cấp"><Trash2 className="w-4 h-4" /></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {total > 20 && (
                <div className="flex justify-center items-center gap-4 py-6">
                    <button 
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        className="min-h-[44px] lg:min-h-[40px] px-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 disabled:opacity-30 active:scale-95 transition-all shadow-sm"
                    >
                        Trang trước
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Trang {page}</span>
                        <span className="text-[8px] font-bold text-slate-300 uppercase">Tổng {total} nhà cung cấp</span>
                    </div>
                    <button 
                        type="button"
                        disabled={page * 20 >= total}
                        onClick={() => setPage(page + 1)}
                        className="min-h-[44px] lg:min-h-[40px] px-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 disabled:opacity-30 active:scale-95 transition-all shadow-sm"
                    >
                        Trang sau
                    </button>
                </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-600 text-white rounded-xl shrink-0"><Truck className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase text-sm sm:text-base tracking-tight truncate">{editingSupplier ? 'Sửa thông tin NCC' : 'Thêm Nhà Cung Cấp Mới'}</h3>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Đóng cửa sổ" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-3.5 sm:p-5 space-y-4 bg-slate-50 dark:bg-slate-800/30 overflow-y-auto flex-1 min-h-0 no-scrollbar">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Mã NCC *</label><input value={formData.code ?? ''} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full min-h-[44px] px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-black focus:ring-4 ring-blue-100 outline-none uppercase" placeholder="NCC-XXXX" /></div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Trạng thái</label>
                  <Combobox
                    value={formData.status ?? 'ACTIVE'}
                    onChange={(v) => setFormData({ ...formData, status: (v as any) || 'ACTIVE' })}
                    options={[
                      { value: 'ACTIVE', label: 'ACTIVE (Đang hợp tác)' },
                      { value: 'INACTIVE', label: 'INACTIVE (Dừng hợp tác)' },
                    ]}
                    allowClear={false}
                    ariaLabel="Trạng thái hợp tác"
                  />
                </div>
              </div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Tên Nhà Cung Cấp *</label><input value={formData.name ?? ''} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full min-h-[44px] px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-black focus:ring-4 ring-blue-100 outline-none uppercase" placeholder="TÊN CÔNG TY / ĐƠN VỊ..." /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Địa chỉ</label><input value={formData.address ?? ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full min-h-[44px] px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold outline-none" placeholder="Địa chỉ trụ sở/nhà máy..." /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Người liên hệ</label><input value={formData.contact_person ?? ''} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full min-h-[44px] px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold outline-none" placeholder="Họ và tên..." /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Số điện thoại</label><input value={formData.phone ?? ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full min-h-[44px] px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold outline-none" placeholder="SĐT liên lạc..." /></div>
              </div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Email liên hệ</label><input value={formData.email ?? ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full min-h-[44px] px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold outline-none" placeholder="email@domain.com" /></div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Ngành hàng / Phân loại</label>
                <Combobox
                  value={formData.category ?? 'Raw Materials'}
                  onChange={(v) => setFormData({ ...formData, category: v || 'Raw Materials' })}
                  options={[
                    { value: 'Raw Materials', label: 'Raw Materials (Nguyên vật liệu thô)' },
                    { value: 'Hardware', label: 'Hardware (Ngũ kim)' },
                    { value: 'Finishing', label: 'Finishing (Vật liệu hoàn thiện)' },
                    { value: 'Subcontractor', label: 'Subcontractor (Gia công ngoài)' },
                  ]}
                  allowClear={false}
                  ariaLabel="Ngành hàng nhà cung cấp"
                />
              </div>
            </div>
            <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0 bg-slate-50/80 dark:bg-slate-900">
              <button type="button" onClick={() => setIsModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-slate-500 dark:text-slate-400 font-black uppercase text-xs tracking-widest hover:text-red-500 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0">Hủy bỏ</button>
              <button type="button" onClick={handleSave} disabled={isSaving} className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} LƯU THÔNG TIN</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {supplierToDelete && (
        <div className="fixed inset-0 z-[240] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[calc(100dvh-1.5rem)] flex flex-col rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-2.5">
                <div className="p-2 bg-red-100 dark:bg-red-950/60 rounded-xl shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Xác nhận xóa nhà cung cấp</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Bạn có chắc chắn muốn xóa nhà cung cấp <strong className="text-slate-900 dark:text-slate-100 font-semibold">{supplierToDelete.name}</strong> (#{supplierToDelete.code})? Hành động này sẽ thực hiện xóa mềm theo quy định hệ thống.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-2 sm:py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSupplierToDelete(null)}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Toast Banner */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-[120] animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className={`px-4 py-2.5 rounded-2xl shadow-lg border text-xs font-bold flex items-center justify-between gap-2 ${toast.type === 'success' ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'}`}>
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />}
              <span>{toast.message}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo" className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] inline-flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManagement;
