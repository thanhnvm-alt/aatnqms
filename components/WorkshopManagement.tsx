import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Workshop } from '../types';
import { Button } from './Button';
import { Plus, Edit2, Trash2, X, Save, Factory, MapPin, Phone, User, Image as ImageIcon, Camera, Locate, Layers, Check, Loader2, Pencil, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { uploadQMSImage } from '../services/apiService';
import { ConfirmDialog, PageActions, SearchInput } from '../src/components/qms';

interface WorkshopManagementProps {
  workshops: Workshop[];
  isReadOnly?: boolean;
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

export const WorkshopManagement: React.FC<WorkshopManagementProps> = ({ workshops, isReadOnly = false, onAddWorkshop, onUpdateWorkshop, onDeleteWorkshop }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State for stage management
  const [newStageInput, setNewStageInput] = useState('');
  const [localStages, setLocalStages] = useState<string[]>([]);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editStageValue, setEditStageValue] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [stageToDelete, setStageToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Workshop>>({
    code: '',
    name: '',
    location: '',
    manager: '',
    phone: '',
    image: undefined,
    stages: []
  });

  const filteredWorkshops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workshops;
    return workshops.filter(
      (ws) =>
        String(ws.code || '').toLowerCase().includes(q) ||
        String(ws.name || '').toLowerCase().includes(q) ||
        String(ws.manager || '').toLowerCase().includes(q) ||
        String(ws.location || '').toLowerCase().includes(q)
    );
  }, [workshops, searchQuery]);

  const handleOpenModal = (workshop?: Workshop) => {
    if (isReadOnly) return;
    setModalError(null);
    if (workshop) {
      setEditingWorkshop(workshop);
      setFormData({ ...workshop, stages: workshop.stages || [] });
      // Initialize local stages with predefined + workshop specific stages
      const combined = Array.from(new Set([...PREDEFINED_STAGES, ...(workshop.stages || [])]));
      setLocalStages(combined);
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
      setLocalStages([...PREDEFINED_STAGES]);
    }
    setNewStageInput('');
    setEditingStage(null);
    setIsModalOpen(true);
  };

  const toggleStage = (stage: string) => {
      // Don't toggle if we are clicking inside the edit input
      if (editingStage === stage) return;

      setFormData(prev => {
          const currentStages = prev.stages || [];
          if (currentStages.includes(stage)) {
              return { ...prev, stages: currentStages.filter(s => s !== stage) };
          } else {
              return { ...prev, stages: [...currentStages, stage] };
          }
      });
  };

  const handleAddCustomStage = () => {
      const stageName = newStageInput.trim();
      if (!stageName) return;

      if (!localStages.includes(stageName)) {
          setLocalStages(prev => [...prev, stageName]);
      }

      // Automatically select the new stage
      setFormData(prev => {
          const currentStages = prev.stages || [];
          if (currentStages.includes(stageName)) return prev;
          return { ...prev, stages: [...currentStages, stageName] };
      });
      setNewStageInput('');
  };

  const handleDeleteStage = (e: React.MouseEvent, stage: string) => {
      e.stopPropagation();
      setStageToDelete(stage);
  };

  const startEditStage = (e: React.MouseEvent, stage: string) => {
      e.stopPropagation();
      setEditingStage(stage);
      setEditStageValue(stage);
  };

  const saveEditStage = () => {
      if (editingStage && editStageValue.trim()) {
          const oldName = editingStage;
          const newName = editStageValue.trim();

          // Update local list
          setLocalStages(prev => prev.map(s => s === oldName ? newName : s));

          // Update selection if it was selected
          setFormData(prev => {
              const currentStages = prev.stages || [];
              if (currentStages.includes(oldName)) {
                  // Replace old name with new name in selection
                  return {
                      ...prev,
                      stages: currentStages.map(s => s === oldName ? newName : s)
                  };
              }
              return prev;
          });
      }
      setEditingStage(null);
      setEditStageValue('');
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!formData.code?.trim() || !formData.name?.trim()) {
      setModalError('Vui lòng điền đầy đủ Mã xưởng và Tên xưởng.');
      return;
    }

    setIsSaving(true);
    setModalError(null);
    try {
        let resolvedImage = formData.image;
        if (resolvedImage && resolvedImage.startsWith('data:')) {
            resolvedImage = await uploadQMSImage(resolvedImage, {
                entityType: 'WORKSHOP',
                entityId: editingWorkshop?.id || 'new',
                role: 'WORKSHOP_IMAGE',
            });
        }
        const workshopData: Workshop = {
          id: editingWorkshop ? editingWorkshop.id : `ws_${Date.now()}`,
          code: formData.code.trim(),
          name: formData.name.trim(),
          location: formData.location || '',
          manager: formData.manager || '',
          phone: formData.phone || '',
          image: resolvedImage,
          stages: formData.stages || []
        };

        if (editingWorkshop) {
          await onUpdateWorkshop(workshopData);
        } else {
          await onAddWorkshop(workshopData);
        }
        setFeedback({
          type: 'success',
          message: editingWorkshop ? `Đã cập nhật xưởng "${workshopData.name}".` : `Đã thêm xưởng "${workshopData.name}".`,
        });
        setIsModalOpen(false);
    } catch (error: any) {
        console.error("Save workshop failed:", error);
        setModalError(error?.message || "Lỗi khi lưu thông tin xưởng.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadQMSImage(file, {
        entityType: 'WORKSHOP',
        entityId: editingWorkshop?.id || 'new',
        role: 'WORKSHOP_IMAGE',
      });
      setFormData(prev => ({ ...prev, image: url }));
    } catch (err: any) {
      console.error("Upload workshop image failed:", err);
      setModalError("Lỗi khi tải ảnh xưởng lên: " + (err?.message || "Thất bại"));
    } finally {
      e.target.value = '';
    }
  };

  const handleGetLocation = () => {
    setIsGettingLocation(true);
    setModalError(null);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const locationString = `${lat}, ${lng}`;
        setFormData(prev => ({ ...prev, location: locationString }));
        setIsGettingLocation(false);
      }, function(error) {
        console.error("Error getting location", error);
        setModalError("Không thể lấy vị trí hiện tại. Vui lòng cho phép truy cập vị trí.");
        setIsGettingLocation(false);
      });
    } else {
      setModalError("Trình duyệt không hỗ trợ định vị.");
      setIsGettingLocation(false);
    }
  };

  const workshopModalNode = isModalOpen ? (
        <div className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-fade-in">
             <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50 dark:bg-slate-800/50 shrink-0">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm truncate">
                    <Factory className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"/> 
                    <span className="truncate">{editingWorkshop ? 'Chỉnh sửa thông tin' : 'Thêm xưởng mới'}</span>
                </h3>
                <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-800">
                    <X className="w-5 h-5"/>
                </button>
             </div>

             <div className="overflow-y-auto p-3.5 sm:p-5 space-y-4 flex-1 min-h-0">
                {modalError && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}
                {/* Image Upload */}
                <div className="flex flex-col items-center justify-center">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-32 bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 transition-all relative overflow-hidden group"
                    >
                        {formData.image ? (
                            <>
                                <img src={getProxyImageUrl(formData.image)} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center md:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="w-8 h-8 text-slate-300 mb-1" />
                                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Tải lên hình ảnh xưởng</span>
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
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Mã xưởng *</label>
                      <input 
                        type="text" 
                        value={formData.code}
                        onChange={e => setFormData({...formData, code: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="VD: XSX-01"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Tên xưởng *</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="VD: Xưởng Mộc 1"
                      />
                   </div>
                   <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase flex justify-between">
                          Vị trí xưởng (Google Maps)
                      </label>
                      <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={formData.location}
                            onChange={e => setFormData({...formData, location: e.target.value})}
                            className="flex-1 min-h-[44px] lg:min-h-[38px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                            placeholder="Nhập địa chỉ hoặc tọa độ..."
                        />
                        <button
                            type="button"
                            onClick={handleGetLocation}
                            disabled={isGettingLocation}
                            className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] px-3 py-2 bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-blue-50 dark:bg-slate-800/80 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            title="Lấy tọa độ GPS hiện tại"
                        >
                            {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Locate className="w-4 h-4" />}
                        </button>
                      </div>
                   </div>

                   {/* Production Stages Management */}
                   <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                       <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                           <div className="flex items-center gap-2"><Layers className="w-3 h-3 text-blue-500 dark:text-blue-400"/> Chọn công đoạn sản xuất</div>
                           <span className="text-slate-400 dark:text-slate-500 text-[9px]">{formData.stages?.length} đã chọn</span>
                       </label>
                       
                       <div className="flex gap-2 mb-2">
                           <input 
                              type="text" 
                              value={newStageInput}
                              onChange={e => setNewStageInput(e.target.value)}
                              onKeyDown={e => { if(e.key === 'Enter') handleAddCustomStage() }}
                              className="flex-1 min-h-[44px] lg:min-h-[36px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs outline-none focus:border-blue-500"
                              placeholder="Thêm công đoạn mới..."
                           />
                           <button 
                              type="button"
                              onClick={handleAddCustomStage}
                              className="min-h-[44px] lg:min-h-[36px] px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors flex items-center gap-1 active:scale-95 shrink-0"
                           >
                               <Plus className="w-3.5 h-3.5" /> Thêm
                           </button>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                           {localStages.map(stage => {
                               const isSelected = formData.stages?.includes(stage);
                               const isEditingThis = editingStage === stage;

                               if (isEditingThis) {
                                   return (
                                       <div key={stage} className="flex gap-1">
                                           <input 
                                              autoFocus
                                              type="text"
                                              value={editStageValue}
                                              onChange={(e) => setEditStageValue(e.target.value)}
                                              onKeyDown={(e) => { if(e.key === 'Enter') saveEditStage() }}
                                              onBlur={saveEditStage}
                                              className="flex-1 min-h-[44px] lg:min-h-[36px] px-2.5 py-2 border border-blue-500 rounded-lg text-xs outline-none bg-blue-50 dark:bg-slate-800/80"
                                           />
                                           <button type="button" onMouseDown={saveEditStage} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center px-2 bg-green-500 text-white rounded-lg"><Check className="w-4 h-4" /></button>
                                       </div>
                                   );
                               }

                               return (
                                   <div 
                                       key={stage} 
                                       onClick={() => toggleStage(stage)}
                                       className={`
                                           min-h-[44px] lg:min-h-[38px] cursor-pointer px-3 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-between select-none group relative
                                           ${isSelected 
                                               ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.01]' 
                                               : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800/80'
                                           }
                                       `}
                                   >
                                       <div className="flex items-center gap-2 overflow-hidden">
                                           <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white dark:bg-slate-900 border-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                                               {isSelected && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 stroke-[4px]" />}
                                           </div>
                                           <span className="truncate">{stage}</span>
                                       </div>
                                       
                                       <div className={`flex gap-1 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400 dark:text-slate-500'} opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity`}>
                                           <button 
                                              type="button"
                                              onClick={(e) => startEditStage(e, stage)}
                                              className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center p-1.5 rounded-lg hover:bg-white/20"
                                              title="Sửa tên"
                                           >
                                               <Pencil className="w-3.5 h-3.5" />
                                           </button>
                                           <button 
                                              type="button"
                                              onClick={(e) => handleDeleteStage(e, stage)}
                                              className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center p-1.5 rounded-lg hover:bg-red-500 hover:text-white"
                                              title="Xóa"
                                           >
                                               <Trash2 className="w-3.5 h-3.5" />
                                           </button>
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Quản lý xưởng</label>
                      <input 
                        type="text" 
                        value={formData.manager}
                        onChange={e => setFormData({...formData, manager: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="Tên quản lý"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Số điện thoại</label>
                      <input 
                        type="text" 
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="SĐT liên hệ"
                      />
                   </div>
                </div>
             </div>

             <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex justify-end gap-2 shrink-0">
                 <Button variant="secondary" onClick={() => setIsModalOpen(false)} className="flex-1 md:flex-none min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0">Hủy bỏ</Button>
                 <Button onClick={handleSave} disabled={isSaving} icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>} className="flex-1 md:flex-none min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0">
                    {isSaving ? 'Đang lưu...' : 'Lưu thông tin'}
                 </Button>
             </div>
          </div>
        </div>
  ) : null;

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <PageActions
        title="Danh sách xưởng sản xuất"
        subtitle="Quản lý danh mục xưởng và các công đoạn sản xuất đồng bộ trực tiếp sang biểu mẫu PQC."
        totalCount={filteredWorkshops.length}
        countLabel="xưởng"
        icon={<Factory className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
        actions={
          !isReadOnly ? (
            <Button onClick={() => handleOpenModal()} icon={<Plus className="w-4 h-4" />} className="min-h-[44px] lg:min-h-[38px]">
              Thêm xưởng mới
            </Button>
          ) : undefined
        }
      />

      {isReadOnly && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Chế độ chỉ xem: Chỉ tài khoản ADMIN mới được thêm, sửa hoặc xóa xưởng sản xuất.</span>
        </div>
      )}

      {feedback && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-sm font-medium ${feedback.type === 'success' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng thông báo" className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Tìm theo mã xưởng, tên xưởng, quản lý hoặc vị trí..."
          className="w-full sm:max-w-md"
        />
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-sm">
        <table className="w-full min-w-[680px] text-sm text-left">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold uppercase border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3 py-2.5">Thông tin xưởng</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Vị trí & Công đoạn</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Liên hệ</th>
              {!isReadOnly && <th className="px-3 py-2.5 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredWorkshops.map(ws => (
              <tr key={ws.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700">
                        {ws.image ? (
                            <img src={getProxyImageUrl(ws.image)} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                                <Factory className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{ws.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded inline-block mt-0.5">
                        {ws.code}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                   <div className="flex flex-col gap-2">
                       <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                           <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                           <span className="truncate max-w-[200px] text-xs">{ws.location || '---'}</span>
                       </div>
                       {ws.stages && ws.stages.length > 0 && (
                           <div className="flex flex-wrap gap-1 mt-1">
                               {ws.stages.slice(0, 3).map(stage => (
                                   <span key={stage} className="text-[9px] bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-100 dark:border-slate-700 font-medium">
                                       {stage}
                                   </span>
                               ))}
                               {ws.stages.length > 3 && (
                                   <span className="text-[9px] bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-800 font-medium">
                                       +{ws.stages.length - 3}
                                   </span>
                               )}
                           </div>
                       )}
                   </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                   <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                           <User className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                           {ws.manager || '---'}
                       </div>
                       <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 dark:text-slate-500 text-xs">
                           <Phone className="w-3 h-3" />
                           {ws.phone || '---'}
                       </div>
                   </div>
                </td>
                {!isReadOnly && (
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        type="button"
                        onClick={() => handleOpenModal(ws)}
                        className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-colors"
                        title="Sửa xưởng"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => setDeleteTargetId(ws.id)}
                        className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20 rounded-xl transition-colors"
                        title="Xóa xưởng"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filteredWorkshops.length === 0 && (
                <tr>
                    <td colSpan={isReadOnly ? 3 : 4} className="p-8 text-center text-slate-500 dark:text-slate-400">
                        Chưa có dữ liệu xưởng sản xuất phù hợp.
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-3">
        {filteredWorkshops.map(ws => (
            <div key={ws.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700">
                        {ws.image ? (
                            <img src={getProxyImageUrl(ws.image)} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                                <Factory className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-start">
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{ws.name}</h4>
                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700">{ws.code}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {ws.manager || '---'}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {ws.phone || '---'}
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{ws.location || 'Chưa cập nhật vị trí'}</span>
                    </div>
                    {ws.stages && ws.stages.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {ws.stages.slice(0, 4).map(stage => (
                                <span key={stage} className="text-[9px] bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-100 dark:border-slate-700 font-medium">
                                    {stage}
                                </span>
                            ))}
                            {ws.stages.length > 4 && (
                                <span className="text-[9px] bg-slate-50 dark:bg-slate-800/50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-800 font-medium">
                                    +{ws.stages.length - 4}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {!isReadOnly && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button 
                          type="button"
                          onClick={() => handleOpenModal(ws)}
                          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 font-bold text-xs active:scale-95 transition-all"
                      >
                          <Edit2 className="w-4 h-4" /> Sửa
                      </button>
                      <button 
                          type="button"
                          onClick={() => setDeleteTargetId(ws.id)}
                          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold text-xs active:scale-95 transition-all"
                      >
                          <Trash2 className="w-4 h-4" /> Xóa
                      </button>
                  </div>
                )}
            </div>
        ))}
        {filteredWorkshops.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                Chưa có dữ liệu.
            </div>
        )}
      </div>

      {/* Modal - Optimized for mobile */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-fade-in">
             <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50 dark:bg-slate-800/50 shrink-0">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm truncate">
                    <Factory className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"/> 
                    <span className="truncate">{editingWorkshop ? 'Chỉnh sửa thông tin' : 'Thêm xưởng mới'}</span>
                </h3>
                <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-800">
                    <X className="w-5 h-5"/>
                </button>
             </div>

             <div className="overflow-y-auto p-3.5 sm:p-5 space-y-4 flex-1 min-h-0">
                {/* Image Upload */}
                <div className="flex flex-col items-center justify-center">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-32 bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 transition-all relative overflow-hidden group"
                    >
                        {formData.image ? (
                            <>
                                <img src={getProxyImageUrl(formData.image)} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center md:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="w-8 h-8 text-slate-300 mb-1" />
                                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 font-medium">Tải lên hình ảnh xưởng</span>
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
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Mã xưởng *</label>
                      <input 
                        type="text" 
                        value={formData.code}
                        onChange={e => setFormData({...formData, code: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="VD: XSX-01"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Tên xưởng *</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="VD: Xưởng Mộc 1"
                      />
                   </div>
                   <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase flex justify-between">
                          Vị trí xưởng (Google Maps)
                      </label>
                      <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={formData.location}
                            onChange={e => setFormData({...formData, location: e.target.value})}
                            className="flex-1 min-h-[44px] lg:min-h-[38px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                            placeholder="Nhập địa chỉ hoặc tọa độ..."
                        />
                        <button
                            onClick={handleGetLocation}
                            disabled={isGettingLocation}
                            className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] px-3 py-2 bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-blue-50 dark:bg-slate-800/80 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            title="Lấy tọa độ GPS hiện tại"
                        >
                            {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Locate className="w-4 h-4" />}
                        </button>
                      </div>
                   </div>

                   {/* Production Stages Management */}
                   <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                       <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                           <div className="flex items-center gap-2"><Layers className="w-3 h-3 text-blue-500 dark:text-blue-400"/> Chọn công đoạn sản xuất</div>
                           <span className="text-slate-400 dark:text-slate-500 text-[9px]">{formData.stages?.length} đã chọn</span>
                       </label>
                       
                       {/* Custom Stage Input */}
                       <div className="flex gap-2 mb-2">
                           <input 
                               type="text" 
                               value={newStageInput}
                               onChange={e => setNewStageInput(e.target.value)}
                               onKeyDown={e => { if(e.key === 'Enter') handleAddCustomStage() }}
                               className="flex-1 min-h-[44px] lg:min-h-[36px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs outline-none focus:border-blue-500"
                               placeholder="Thêm công đoạn mới..."
                           />
                           <button 
                               onClick={handleAddCustomStage}
                               className="min-h-[44px] lg:min-h-[36px] px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors flex items-center gap-1 active:scale-95 shrink-0"
                           >
                               <Plus className="w-3.5 h-3.5" /> Thêm
                           </button>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                           {localStages.map(stage => {
                               const isSelected = formData.stages?.includes(stage);
                               const isEditingThis = editingStage === stage;

                               if (isEditingThis) {
                                   return (
                                       <div key={stage} className="flex gap-1">
                                           <input 
                                              autoFocus
                                              type="text"
                                              value={editStageValue}
                                              onChange={(e) => setEditStageValue(e.target.value)}
                                              onKeyDown={(e) => { if(e.key === 'Enter') saveEditStage() }}
                                              onBlur={saveEditStage}
                                              className="flex-1 min-h-[44px] lg:min-h-[36px] px-2.5 py-2 border border-blue-500 rounded-lg text-xs outline-none bg-blue-50 dark:bg-slate-800/80"
                                           />
                                           <button onMouseDown={saveEditStage} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center px-2 bg-green-500 text-white rounded-lg"><Check className="w-4 h-4" /></button>
                                       </div>
                                   );
                               }

                               return (
                                   <div 
                                       key={stage} 
                                       onClick={() => toggleStage(stage)}
                                       className={`
                                           min-h-[44px] lg:min-h-[38px] cursor-pointer px-3 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-between select-none group relative
                                           ${isSelected 
                                               ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.01]' 
                                               : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800/80'
                                           }
                                       `}
                                   >
                                       <div className="flex items-center gap-2 overflow-hidden">
                                           <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white dark:bg-slate-900 border-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                                               {isSelected && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 stroke-[4px]" />}
                                           </div>
                                           <span className="truncate">{stage}</span>
                                       </div>
                                       
                                       <div className={`flex gap-1 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400 dark:text-slate-500'} opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity`}>
                                           <button 
                                              type="button"
                                              onClick={(e) => startEditStage(e, stage)}
                                              className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center p-1.5 rounded-lg hover:bg-white/20"
                                              title="Sửa tên"
                                           >
                                               <Pencil className="w-3.5 h-3.5" />
                                           </button>
                                           <button 
                                              type="button"
                                              onClick={(e) => handleDeleteStage(e, stage)}
                                              className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center p-1.5 rounded-lg hover:bg-red-500 hover:text-white"
                                              title="Xóa"
                                           >
                                               <Trash2 className="w-3.5 h-3.5" />
                                           </button>
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Quản lý xưởng</label>
                      <input 
                        type="text" 
                        value={formData.manager}
                        onChange={e => setFormData({...formData, manager: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="Tên quản lý"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Số điện thoại</label>
                      <input 
                        type="text" 
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base md:text-sm"
                        placeholder="SĐT liên hệ"
                      />
                   </div>
                </div>
             </div>

             <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex justify-end gap-2 shrink-0">
                 <Button variant="secondary" onClick={() => setIsModalOpen(false)} className="flex-1 md:flex-none min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0">Hủy bỏ</Button>
                 <Button onClick={handleSave} disabled={isSaving} icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>} className="flex-1 md:flex-none min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0">
                    {isSaving ? 'Đang lưu...' : 'Lưu thông tin'}
                 </Button>
             </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        variant="danger"
        title="Xác nhận xóa xưởng"
        message="Bạn có chắc chắn muốn xóa xưởng sản xuất này?"
        confirmLabel="Xóa xưởng"
        cancelLabel="Hủy"
        onConfirm={() => {
          if (deleteTargetId) onDeleteWorkshop(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      <ConfirmDialog
        open={stageToDelete !== null}
        variant="danger"
        title="Xác nhận xóa công đoạn"
        message={stageToDelete ? `Bạn có chắc chắn muốn xóa công đoạn "${stageToDelete}"?` : ''}
        confirmLabel="Xóa công đoạn"
        cancelLabel="Hủy"
        onConfirm={() => {
          if (stageToDelete) {
            setLocalStages(prev => prev.filter(s => s !== stageToDelete));
            setFormData(prev => ({
              ...prev,
              stages: prev.stages?.filter(s => s !== stageToDelete)
            }));
          }
          setStageToDelete(null);
        }}
        onCancel={() => setStageToDelete(null)}
      />
    </div>
  );
};
