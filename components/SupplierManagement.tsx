
import React, { useState, useEffect, useMemo } from 'react';
import { Supplier, User } from '../types';
import { fetchSuppliers, saveSupplier, deleteSupplier, fetchSupplierStats } from '../services/apiService';
import { 
  Building2, Search, Plus, Filter, 
  Loader2, Truck, ChevronRight, MapPin, 
  User as UserIcon, Phone, Mail, Activity,
  CheckCircle2, AlertTriangle, MoreVertical, X,
  Trash2, Edit3, Save, Star
} from 'lucide-react';
import { Button } from './Button';

interface SupplierManagementProps {
  user: User;
  onSelectSupplier: (s: Supplier) => void;
}

export const SupplierManagement: React.FC<SupplierManagementProps> = ({ user, onSelectSupplier }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [formData, setFormData] = useState<Partial<Supplier>>({
    code: '', name: '', address: '', contact_person: '', phone: '', email: '', category: 'Raw Materials', status: 'ACTIVE'
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSuppliers();
      // Load stats for each supplier
      const dataWithStats = await Promise.all(data.map(async s => {
        const stats = await fetchSupplierStats(s.name);
        return { ...s, stats };
      }));
      setSuppliers(dataWithStats);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const handleOpenModal = (s?: Supplier) => {
    if (s) {
      setEditingSupplier(s);
      setFormData({ ...s });
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
    if (!formData.name || !formData.code) return alert("Vui lòng nhập tên và mã NCC");
    setIsSaving(true);
    try {
      await saveSupplier(formData as Supplier);
      await loadSuppliers();
      setIsModalOpen(false);
    } catch (e) { alert("Lỗi khi lưu nhà cung cấp."); } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Xóa nhà cung cấp này?")) {
      await deleteSupplier(id);
      await loadSuppliers();
    }
  };

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.code.toLowerCase().includes(term) ||
      (s.category && s.category.toLowerCase().includes(term))
    );
  }, [suppliers, searchTerm]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-40 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none">Danh sách Nhà Cung Cấp</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">ISO 9001 Supplier Audit</p>
              </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" placeholder="Tìm tên, mã, ngành hàng..." 
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                />
              </div>
              <button onClick={() => handleOpenModal()} className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 transition-all"><Plus className="w-5 h-5" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" /><p className="font-black uppercase tracking-widest text-[9px]">Đang tải dữ liệu nhà cung cấp...</p></div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300"><Building2 className="w-16 h-16 opacity-10 mb-4" /><p className="font-black uppercase tracking-[0.2em] text-[10px]">Trống</p></div>
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(s => (
              <div key={s.id} onClick={() => onSelectSupplier(s)} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col overflow-hidden relative">
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm"><Building2 className="w-6 h-6" /></div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#{s.code}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border ${s.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{s.status}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-tight line-clamp-1 group-hover:text-blue-600 transition-colors">{s.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{s.category || 'Vật tư tổng hợp'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-4 border-y border-slate-50">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pass Rate</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-green-600">{Math.round(s.stats?.pass_rate || 0)}%</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total POs</span>
                      <span className="text-xl font-black text-slate-800">{s.stats?.total_pos || 0}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-500"><MapPin className="w-3.5 h-3.5" /><span className="text-[10px] font-medium truncate">{s.address || 'Chưa cập nhật địa chỉ'}</span></div>
                    <div className="flex items-center gap-2 text-slate-500"><UserIcon className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">{s.contact_person || '---'}</span></div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleOpenModal(s); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:underline group-hover:translate-x-1 transition-all">Hồ sơ chi tiết <ChevronRight className="w-4 h-4" /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-blue-600 text-white rounded-2xl"><Truck className="w-6 h-6" /></div>
                <h3 className="font-black text-slate-900 uppercase text-lg tracking-tight">{editingSupplier ? 'Sửa thông tin NCC' : 'Thêm Nhà Cung Cấp Mới'}</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500 transition-all"><X className="w-7 h-7"/></button>
            </div>
            <div className="p-8 space-y-6 bg-slate-50/30 overflow-y-auto max-h-[70vh] no-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Mã NCC *</label><input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-black focus:ring-4 ring-blue-100 outline-none uppercase" placeholder="NCC-XXXX" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Trạng thái</label><select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-bold bg-white outline-none"><option value="ACTIVE">ACTIVE (Đang hợp tác)</option><option value="INACTIVE">INACTIVE (Dừng hợp tác)</option></select></div>
              </div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tên Nhà Cung Cấp *</label><input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-black focus:ring-4 ring-blue-100 outline-none uppercase" placeholder="TÊN CÔNG TY / ĐƠN VỊ..." /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Địa chỉ</label><input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="Địa chỉ trụ sở/nhà máy..." /></div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Người liên hệ</label><input value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="Họ và tên..." /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Số điện thoại</label><input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="SĐT liên lạc..." /></div>
              </div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Email liên hệ</label><input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="email@domain.com" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-2">Ngành hàng / Phân loại</label><select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-5 py-3 border border-slate-200 rounded-2xl font-bold bg-white outline-none"><option value="Raw Materials">Raw Materials (Nguyên vật liệu thô)</option><option value="Hardware">Hardware (Ngũ kim)</option><option value="Finishing">Finishing (Vật liệu hoàn thiện)</option><option value="Subcontractor">Subcontractor (Gia công ngoài)</option></select></div>
            </div>
            <div className="p-8 border-t border-slate-100 flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-red-500 transition-colors">Hủy bỏ</button>
              <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2">{isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} LƯU THÔNG TIN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
