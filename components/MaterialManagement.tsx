import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Package, Download, Upload, Loader2 } from 'lucide-react';
import { Material, User } from '../types';
import { fetchMaterials, saveMaterial, deleteMaterial, exportMaterials, importMaterialsFile } from '../services/apiService';

export const MaterialManagement: React.FC<{ user: User }> = ({ user }) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 50;

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadMaterials(1);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  useEffect(() => {
    loadMaterials(page);
  }, [page]);

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

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportMaterials();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Lỗi khi xuất file Excel');
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
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-40 shadow-sm flex flex-wrap items-center justify-end gap-2 shrink-0">
          <div className="relative flex-1 min-w-[200px] md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />
          {user.role !== 'QC' && (
            <>
              <button 
                onClick={handleImportClick}
                disabled={isImporting}
                title="Nhập Excel"
                className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                title="Xuất Excel"
                className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </>
          )}
          <button 
            onClick={() => { setEditingMaterial(null); setIsModalOpen(true); }}
            title="Thêm Vật Liệu"
            className="p-2 bg-slate-900 text-white rounded-xl shadow-lg active:scale-95 transition-all"
          >
            <Plus size={16} /> 
          </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24 flex flex-col">
        {user.role === 'ADMIN' && selectedIds.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between shrink-0">
            <span className="text-sm font-medium text-red-700">Đã chọn {selectedIds.length} vật liệu</span>
            <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold uppercase hover:bg-red-700 flex items-center gap-2">
              <Trash2 size={14} /> Xóa đã chọn
            </button>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selectedIds.length === materials.length && materials.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Mã Vật Tư</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Tên Vật Tư</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Đơn vị</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Số lượng</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Nhà Cung Cấp</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Dự Án</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Mã PO</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : materials.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} className="rounded border-slate-300" />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{m.material}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate" title={m.shortText}>{m.shortText}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{m.orderUnit}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right whitespace-nowrap">{m.orderQuantity}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[150px] truncate" title={m.supplierName}>{m.supplierName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[150px] truncate" title={m.projectName}>{m.projectName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{m.purchaseDocument}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => { setEditingMaterial(m); setIsModalOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3 p-1"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-800 p-1"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {!isLoading && materials.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Không tìm thấy vật liệu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* PAGINATION */}
        {total > limit && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <button 
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage(page - 1)}
                    className="px-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                    Trang trước
                </button>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Trang {page} / {Math.ceil(total / limit)} ({total} vật liệu)
                </div>
                <button 
                    disabled={page * limit >= total || isLoading}
                    onClick={() => setPage(page + 1)}
                    className="px-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                    Trang sau
                </button>
            </div>
        )}
      </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-slate-800 shrink-0">
              {editingMaterial ? 'Sửa thông tin vật liệu' : 'Thêm vật liệu mới'}
            </h2>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mã Vật Tư *</label>
                  <input name="material" defaultValue={editingMaterial?.material} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên Vật Tư *</label>
                  <input name="shortText" defaultValue={editingMaterial?.shortText} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Đơn vị *</label>
                  <input name="orderUnit" defaultValue={editingMaterial?.orderUnit} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Số lượng</label>
                  <input type="number" step="0.01" name="orderQuantity" defaultValue={editingMaterial?.orderQuantity} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nhà Cung Cấp</label>
                  <input name="supplierName" defaultValue={editingMaterial?.supplierName} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dự Án</label>
                  <input name="projectName" defaultValue={editingMaterial?.projectName} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mã PO (Purchase Document)</label>
                  <input name="purchaseDocument" defaultValue={editingMaterial?.purchaseDocument} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày giao hàng</label>
                  <input type="date" name="deliveryDate" defaultValue={editingMaterial?.deliveryDate?.split('T')[0]} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mã Tender</label>
                  <input name="Ma_Tender" defaultValue={editingMaterial?.Ma_Tender} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Factory Order</label>
                  <input name="Factory_Order" defaultValue={editingMaterial?.Factory_Order} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors">Hủy</button>
              <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-600/20">Lưu thông tin</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
