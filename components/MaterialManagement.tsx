import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Package } from 'lucide-react';
import { Material } from '../types';
import { fetchMaterials, saveMaterial, deleteMaterial } from '../services/apiService';

export const MaterialManagement = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      const data = await fetchMaterials();
      setMaterials(data);
    } catch (error) {
      console.error('Failed to load materials:', error);
    }
  };

  const filteredMaterials = materials.filter(m => 
    (m.shortText || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.material || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.projectName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      loadMaterials();
    } catch (error) {
      console.error('Failed to save material:', error);
      alert('Lỗi khi lưu vật liệu');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa vật liệu này?')) {
      try {
        await deleteMaterial(id);
        loadMaterials();
      } catch (error) {
        console.error('Failed to delete material:', error);
        alert('Lỗi khi xóa vật liệu');
      }
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="text-blue-600" /> Quản lý Vật liệu
        </h1>
        <button 
          onClick={() => { setEditingMaterial(null); setIsModalOpen(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <Plus size={20} /> Thêm vật liệu
        </button>
      </div>

      <div className="mb-4 relative shrink-0">
        <Search className="absolute left-3 top-3 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Tìm kiếm theo mã, tên, NCC, dự án..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
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
              {filteredMaterials.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
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
              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Không tìm thấy vật liệu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
