
import React, { useState, useRef } from 'react';
import { Workshop } from '../types';
import { Button } from './Button';
import { Plus, Edit2, Trash2, X, Save, Factory, MapPin, Phone, User, Image as ImageIcon, Camera, Locate, Layers, Check, Loader2 } from 'lucide-react';

interface WorkshopManagementProps {
  workshops: Workshop[];
  // Chuyển sang Promise<void> để đồng bộ với Settings component
  onAddWorkshop: (workshop: Workshop) => Promise<void>;
  onUpdateWorkshop: (workshop: Workshop) => Promise<void>;
  onDeleteWorkshop: (id: string) => Promise<void>;
}

const PREDEFINED_STAGES = [
  "Cut To Size",
  "Máy Mộc",
  "Lắp Ráp Mộc",
  "Lăn UV",
  "Vecni",
  "Sofa",
  "Fitting - lắp ráp phụ kiện",
  "Packing - Đóng gói",
  "Phôi",
  "Nguội",
  "Hàn",
  "Đánh Bóng",
  "PVD",
  "Drylay"
];

export const WorkshopManagement: React.FC<WorkshopManagementProps> = ({ workshops, onAddWorkshop, onUpdateWorkshop, onDeleteWorkshop }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Workshop>>({
    code: '',
    name: '',
    location: '',
    manager: '',
    phone: '',
    image: undefined,
    stages: []
  });

  const handleOpenModal = (workshop?: Workshop) => {
    if (workshop) {
      setEditingWorkshop(workshop);
      setFormData({ ...workshop, stages: workshop.stages || [] });
    } else {
      setEditingWorkshop(null);
      setFormData({
        code: '',
        name: '',
        location: '',
        manager: '',
        phone: '',
        image: undefined,
        stages: []
      });
    }
    setIsModalOpen(true);
  };

  const toggleStage = (stage: string) => {
      setFormData(prev => {
          const currentStages = prev.stages || [];
          if (currentStages.includes(stage)) {
              return { ...prev, stages: currentStages.filter(s => s !== stage) };
          } else {
              return { ...prev, stages: [...currentStages, stage] };
          }
      });
  };

  // Chuyển sang async để await operations
  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      alert("Vui lòng điền mã và tên xưởng");
      return;
    }

    setIsSaving(true);
    const workshopData: Workshop = {
      id: editingWorkshop ? editingWorkshop.id : `ws_${Date.now()}`,
      code: formData.code!,
      name: formData.name!,
      location: formData.location || '',
      manager: formData.manager || '',
      phone: formData.phone || '',
      image: formData.image,
      stages: formData.stages || []
    };

    try {
        if (editingWorkshop) {
          await onUpdateWorkshop(workshopData);
        } else {
          await onAddWorkshop(workshopData);
        }
        setIsModalOpen(false);
    } catch (error) {
        console.error("Save workshop failed:", error);
    } finally {
        setIsSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGetLocation = () => {
    setIsGettingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const locationString = `${lat}, ${lng}`;
        setFormData(prev => ({ ...prev, location: locationString }));
        setIsGettingLocation(false);
      }, function(error) {
        console.error("Error getting location", error);
        alert("Không thể lấy vị trí hiện tại. Vui lòng cho phép truy cập vị trí.");
        setIsGettingLocation(false);
      });
    } else {
      alert("Trình duyệt không hỗ trợ định vị.");
      setIsGettingLocation(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-800">Danh sách xưởng</h3>
        <Button onClick={() => handleOpenModal()} icon={<Plus className="w-4 h-4" />}>
          Thêm xưởng mới
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Thông tin xưởng</th>
              <th className="px-4 py-3 hidden md:table-cell">Vị trí & Công đoạn</th>
              <th className="px-4 py-3 hidden md:table-cell">Liên hệ</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workshops.map(ws => (
              <tr key={ws.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                        {ws.image ? (
                            <img src={ws.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Factory className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800">{ws.name}</div>
                      <div className="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                        {ws.code}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                   <div className="flex flex-col gap-2">
                       <div className="flex items-center gap-2 text-slate-600">
                           <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                           <span className="truncate max-w-[200px] text-xs">{ws.location || '---'}</span>
                       </div>
                       {ws.stages && ws.stages.length > 0 && (
                           <div className="flex flex-wrap gap-1 mt-1">
                               {ws.stages.slice(0, 3).map(stage => (
                                   <span key={stage} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                                       {stage}
                                   </span>
                               ))}
                               {ws.stages.length > 3 && (
                                   <span className="text-[9px] bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-100 font-medium">
                                       +{ws.stages.length - 3}
                                   </span>
                               )}
                           </div>
                       )}
                   </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                   <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-2 text-slate-700 font-medium">
                           <User className="w-3 h-3 text-slate-400" />
                           {ws.manager || '---'}
                       </div>
                       <div className="flex items-center gap-2 text-slate-500 text-xs">
                           <Phone className="w-3 h-3" />
                           {ws.phone || '---'}
                       </div>
                   </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => handleOpenModal(ws)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => { if(window.confirm('Xóa xưởng này?')) onDeleteWorkshop(ws.id) }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {workshops.length === 0 && (
                <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                        Chưa có dữ liệu xưởng sản xuất.
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-3">
        {workshops.map(ws => (
            <div key={ws.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                        {ws.image ? (
                            <img src={ws.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Factory className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-start">
                            <h4 className="font-bold text-slate-800 text-sm truncate">{ws.name}</h4>
                            <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold border border-slate-200">{ws.code}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {ws.manager || '---'}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {ws.phone || '---'}
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-600 truncate">{ws.location || 'Chưa cập nhật vị trí'}</span>
                    </div>
                    {ws.stages && ws.stages.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {ws.stages.slice(0, 4).map(stage => (
                                <span key={stage} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                                    {stage}
                                </span>
                            ))}
                            {ws.stages.length > 4 && (
                                <span className="text-[9px] bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-100 font-medium">
                                    +{ws.stages.length - 4}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button 
                        onClick={() => handleOpenModal(ws)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs active:scale-95 transition-all"
                    >
                        <Edit2 className="w-3.5 h-3.5" /> Sửa
                    </button>
                    <button 
                        onClick={() => { if(window.confirm('Xóa xưởng này?')) onDeleteWorkshop(ws.id) }}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-50 text-red-600 font-bold text-xs active:scale-95 transition-all"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Xóa
                    </button>
                </div>
            </div>
        ))}
        {workshops.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic bg-white rounded-xl border border-dashed border-slate-200">
                Chưa có dữ liệu.
            </div>
        )}
      </div>

      {/* Modal - Optimized for mobile */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center md:p-4 overflow-hidden">
          <div className="bg-white md:rounded-xl shadow-2xl w-full max-w-lg h-full md:h-auto md:max-h-[95vh] flex flex-col overflow-hidden animate-fade-in">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Factory className="w-5 h-5 text-blue-600"/> 
                    {editingWorkshop ? 'Chỉnh sửa thông tin' : 'Thêm xưởng mới'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5"/>
                </button>
             </div>

             <div className="overflow-y-auto p-4 md:p-6 space-y-5 flex-1 pb-24 md:pb-6">
                {/* Image Upload */}
                <div className="flex flex-col items-center justify-center">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-32 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all relative overflow-hidden group"
                    >
                        {formData.image ? (
                            <>
                                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="w-8 h-8 text-slate-300 mb-1" />
                                <span className="text-xs text-slate-500 font-medium">Tải lên hình ảnh xưởng</span>
                            </>
                        )}
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            accept="image/*"
                            onChange={handleImageUpload}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Mã xưởng *</label>
                      <input 
                        type="text" 
                        value={formData.code}
                        onChange={e => setFormData({...formData, code: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="VD: XSX-01"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Tên xưởng *</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="VD: Xưởng Mộc 1"
                      />
                   </div>
                   <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase flex justify-between">
                          Vị trí xưởng (Google Maps)
                      </label>
                      <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={formData.location}
                            onChange={e => setFormData({...formData, location: e.target.value})}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                            placeholder="Nhập địa chỉ hoặc tọa độ..."
                        />
                        <button
                            onClick={handleGetLocation}
                            disabled={isGettingLocation}
                            className="px-3 py-2 bg-slate-100 text-blue-600 border border-slate-200 rounded-lg hover:bg-blue-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Locate className="w-4 h-4" />}
                        </button>
                      </div>
                   </div>

                   {/* Production Stages Management */}
                   <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-100">
                       <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                           <Layers className="w-3 h-3 text-blue-500"/>
                           Chọn công đoạn sản xuất
                       </label>
                       
                       <div className="grid grid-cols-2 gap-2">
                           {PREDEFINED_STAGES.map(stage => {
                               const isSelected = formData.stages?.includes(stage);
                               return (
                                   <div 
                                       key={stage} 
                                       onClick={() => toggleStage(stage)}
                                       className={`
                                           cursor-pointer px-3 py-2 rounded-lg border text-xs font-bold transition-all flex items-center gap-2 select-none
                                           ${isSelected 
                                               ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.02]' 
                                               : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:bg-blue-50'
                                           }
                                       `}
                                   >
                                       <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white border-white' : 'bg-slate-100 border-slate-300'}`}>
                                           {isSelected && <Check className="w-3 h-3 text-blue-600 stroke-[4px]" />}
                                       </div>
                                       <span className="truncate">{stage}</span>
                                   </div>
                               );
                           })}
                       </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Quản lý xưởng</label>
                      <input 
                        type="text" 
                        value={formData.manager}
                        onChange={e => setFormData({...formData, manager: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="Tên quản lý"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Số điện thoại</label>
                      <input 
                        type="text" 
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="SĐT liên hệ"
                      />
                   </div>
                </div>
             </div>

             <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sticky bottom-0 md:relative z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:shadow-none shrink-0">
                 <Button variant="secondary" onClick={() => setIsModalOpen(false)} className="flex-1 md:flex-none">Hủy bỏ</Button>
                 <Button onClick={handleSave} disabled={isSaving} icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>} className="flex-1 md:flex-none">
                    {isSaving ? 'Đang lưu...' : 'Lưu thông tin'}
                 </Button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
