
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, DefectLibraryItem } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, 
  Calendar, CheckSquare, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, MapPin, Locate, CheckCircle2,
  AlertTriangle, AlertOctagon
} from 'lucide-react';
import { fetchProjects, fetchDefectLibrary, saveDefectLibraryItem, fetchPlans, uploadQMSImage, fetchIpoByFactoryOrder, fetchMaterials } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

import { SignaturePad } from './SignaturePad';

export const InspectionFormSQC_BTP: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `SQC-BTP-${Date.now()}`,
    type: 'SQC_BTP' as ModuleId,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    ten_ct: initialData?.ten_ct || '',
    ten_hang_muc: initialData?.ten_hang_muc || '',
    dvt: initialData?.dvt || '',
    supplier: initialData?.supplier || '',
    supplierAddress: initialData?.supplierAddress || '',
    location: initialData?.location || '',
    reportImage: initialData?.reportImage || '',
    reportImages: initialData?.reportImages || (initialData?.reportImage ? [initialData.reportImage] : []),
    deliveryNoteImage: initialData?.deliveryNoteImage || '',
    deliveryNoteImages: initialData?.deliveryNoteImages || (initialData?.deliveryNoteImage ? [initialData.deliveryNoteImage] : []),
    drawingImages: initialData?.drawingImages || [],
    summary: initialData?.summary || '',
    score: 0,
    items: initialData?.items || [], 
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL' | 'DRAWING', matIdx?: number, itemIdx?: number } | null>(null);

  const getProxyImageUrl = (url: string) => url.startsWith('http') ? url : `/api/images/proxy?url=${encodeURIComponent(url)}`;

  const btpGroups = useMemo(() => {
      const btpTpl = templates['SQC_BTP'] || [];
      return Array.from(new Set(btpTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const historicalRecords = useMemo(() => {
    if (!inspections || !formData.po_number) return [];
    return inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number);
  }, [inspections, formData.po_number, formData.id]);

  const handleInputChange = (field: keyof Inspection, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); };

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
              async (pos) => {
                  const lat = pos.coords.latitude;
                  const lng = pos.coords.longitude;
                  const loc = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                  setFormData(prev => ({ ...prev, location: loc, supplierAddress: loc }));
                  setIsGettingLocation(false);
              },
              (err) => {
                  alert("Không thể lấy vị trí GPS.");
                  setIsGettingLocation(false);
              }
          );
      } else {
          setIsGettingLocation(false);
      }
  };

  const handlePoBlur = async () => {
    if (!formData.po_number || formData.po_number.length < 3) return;
    setIsLookupLoading(true);
    try {
      // Try IPO first
      const ipoResponse = await fetchIpoByFactoryOrder(formData.po_number);
      // ipoResponse is { items: [], total: ... }
      if (ipoResponse && ipoResponse.items && ipoResponse.items.length > 0) {
        const item = ipoResponse.items[0];
        setFormData(prev => ({ 
            ...prev, 
            ma_ct: item.ma_ct || item.Ma_Tender || '',
            ten_ct: item.ten_ct || item.Project_name || '',
            ten_hang_muc: item.ten_hang_muc || item.Material_description || '',
            dvt: item.dvt || item.Base_Unit || ''
        }));
        // If it's a PO search we also want materials, so we don't return here
      }
      
      // Try Materials table
      const materialResults = await fetchMaterials(formData.po_number);
      console.log("DEBUG: materialResults:", materialResults);
      
      if (materialResults && materialResults.items && materialResults.items.length > 0) {
        console.log("DEBUG: Found materials:", materialResults.items);
        
        // Take supplier from the first item
        const firstMat = materialResults.items[0];
        
        // Map all matching items to BTP materials
        const newMaterials: MaterialIQC[] = materialResults.items.map((mat: any) => ({
            id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: mat.Factory_Order || mat.material || '', // Mã định danh = id_factory_order
            category: mat.shortText || '', 
            inspectType: '100%',
            scope: 'PROJECT',
            projectCode: mat.Ma_Tender || '', 
            projectName: mat.projectName || '',
            orderQty: Number(mat.orderQuantity) || 0,
            deliveryQty: Number(mat.orderQuantity) || 0,
            unit: mat.orderUnit || 'PCS',
            criteria: [],
            items: [],
            inspectQty: Number(mat.orderQuantity) || 0,
            passQty: Number(mat.orderQuantity) || 0,
            failQty: 0,
            images: [],
            type: '100%',
            date: new Date().toISOString().split('T')[0]
        }));

        setFormData(prev => ({ 
            ...prev,
            supplier: firstMat.supplierName || prev.supplier, // Đối tác gia công btp = tên nhà cung cấp
            ten_ct: firstMat.projectName || prev.ten_ct, // Update project name
            materials: newMaterials // Replace to ensure exact match for the entered PO
        }));
      }
    } catch (e) {
      console.error("Error in handlePoBlur:", e);
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        inspectType: '100%',
        scope: 'PROJECT',
        projectCode: '',
        projectName: '',
        orderQty: 0,
        deliveryQty: 0,
        unit: 'PCS',
        criteria: [],
        items: [],
        inspectQty: 0,
        passQty: 0,
        failQty: 0,
        images: [],
        type: '100%',
        date: new Date().toISOString().split('T')[0]
    };
    setFormData(prev => ({ ...prev, materials: [...(prev.materials || []), newMaterial] }));
    setExpandedMaterial(newMaterial.id);
  };

  const updateMaterial = (idx: number, field: keyof MaterialIQC, value: any) => {
    setFormData(prev => {
        const nextMaterials = [...(prev.materials || [])];
        if (!nextMaterials[idx]) return prev;
        let val = value;
        if (['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'].includes(field)) {
            val = parseFloat(String(value)) || 0;
        }
        let mat = { ...nextMaterials[idx], [field]: val };
        if (field === 'category') {
            const btpTpl = templates['SQC_BTP'] || [];
            mat.items = btpTpl
                .filter(i => i.category === value)
                .map(i => ({
                    ...i,
                    id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    status: CheckStatus.PENDING,
                    notes: '',
                    images: []
                }));
        }
        if (field === 'inspectQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        else if (field === 'passQty') mat.failQty = Math.max(0, (mat.inspectQty || 0) - (mat.passQty || 0));
        else if (field === 'failQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        nextMaterials[idx] = mat;
        return { ...prev, materials: nextMaterials };
    });
  };

  const updateMaterialItem = (matIdx: number, itemIdx: number, field: keyof CheckItem, value: any) => {
      const nextMaterials = [...(formData.materials || [])];
      if (!nextMaterials[matIdx]) return;
      const matItems = [...(nextMaterials[matIdx].items || [])];
      if (!matItems[itemIdx]) return;
      matItems[itemIdx] = { ...matItems[itemIdx], [field]: value };
      nextMaterials[matIdx].items = matItems;
      setFormData(prev => ({ ...prev, materials: nextMaterials }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadContext) return;
    setIsProcessingImages(true);
    const { type, matIdx, itemIdx } = activeUploadContext;
    try {
        const base64Images = await Promise.all(
            Array.from(files).map((file: File) => {
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            })
        );
        
        setFormData(prev => {
            if (type === 'DELIVERY') return { ...prev, deliveryNoteImages: [...(prev.deliveryNoteImages || []), ...base64Images] };
            if (type === 'REPORT') return { ...prev, reportImages: [...(prev.reportImages || []), ...base64Images] };
            if (type === 'DRAWING') return { ...prev, drawingImages: [...(prev.drawingImages || []), ...base64Images] };
            if (type === 'MATERIAL' && matIdx !== undefined) {
                const nextMats = [...(prev.materials || [])];
                nextMats[matIdx] = { ...nextMats[matIdx], images: [...(nextMats[matIdx].images || []), ...base64Images] };
                return { ...prev, materials: nextMats };
            }
            if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
                const nextMats = [...(prev.materials || [])];
                const items = [...nextMats[matIdx].items];
                items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...base64Images] };
                nextMats[matIdx] = { ...nextMats[matIdx], items };
                return { ...prev, materials: nextMats };
            }
            return prev;
        });
    } catch (err) { 
        console.error("ISO-LOCAL-STORAGE: Failed", err); 
        alert("Lỗi xử lý ảnh.");
    } finally { 
        setIsProcessingImages(false); 
        e.target.value = ''; 
    }
  };

  const onImageSave = async (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;
      
      setFormData(prev => {
          if (type === 'DELIVERY') { const newImgs = [...(prev.deliveryNoteImages || [])]; newImgs[idx] = updatedImg; return { ...prev, deliveryNoteImages: newImgs }; }
          if (type === 'REPORT') { const newImgs = [...(prev.reportImages || [])]; newImgs[idx] = updatedImg; return { ...prev, reportImages: newImgs }; }
          if (type === 'DRAWING') { const newImgs = [...(prev.drawingImages || [])]; newImgs[idx] = updatedImg; return { ...prev, drawingImages: newImgs }; }
          if (type === 'MATERIAL' && matIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              const newImgs = [...(nextMats[matIdx].images || [])];
              newImgs[idx] = updatedImg;
              nextMats[matIdx] = { ...nextMats[matIdx], images: newImgs };
              return { ...prev, materials: nextMats };
          }
          if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              const items = [...nextMats[matIdx].items];
              const imgs = [...(items[itemIdx].images || [])];
              imgs[idx] = updatedImg;
              items[itemIdx] = { ...items[itemIdx], images: imgs };
              nextMats[matIdx] = { ...nextMats[matIdx], items };
              return { ...prev, materials: nextMats };
          }
          return prev;
      });
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier || !formData.supplierAddress) { alert("Vui lòng nhập đầy đủ thông tin."); return; }
    if (!formData.signature) { alert("QC bắt buộc ký tên."); return; }
    setIsSaving(true);
    try {
        await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e) { alert("Lỗi lưu SQC-BTP."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-teal-50 pb-2 mb-1">
                <h3 className="text-teal-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN GIA CÔNG BÁN THÀNH PHẨM</h3>
                <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 hover:bg-teal-100 text-slate-600 rounded-lg font-bold uppercase text-[9px] flex items-center gap-1"><History className="w-3 h-3" /> Lịch sử ({historicalRecords.length})</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Lệnh Sản Xuất / PO Gia Công *</label>
                    <div className="relative flex items-center">
                        <input 
                            value={formData.po_number} 
                            onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} 
                            onBlur={handlePoBlur}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9 shadow-inner" 
                            placeholder="Mã LSX..."
                        />
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400" type="button"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Đối Tác Gia Công BTP *</label>
                    <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] uppercase shadow-inner" placeholder="Tên đơn vị..."/>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Địa chỉ xưởng *</label>
                    <div className="flex gap-1.5 items-center">
                        <input value={formData.supplierAddress || ''} onChange={e => handleInputChange('supplierAddress', e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9 shadow-inner" placeholder="Địa chỉ..."/>
                        <button onClick={handleGetLocation} disabled={isGettingLocation} className="p-2.5 rounded-lg border bg-slate-50 text-slate-400"><Locate className="w-4 h-4" /></button>
                        {formData.location && (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${formData.location}`} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-lg border bg-slate-50 text-teal-600">
                                <MapPin className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                </div>
                {/* 1. Supporting Docs */}
                <div className="md:col-span-2 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5"/> DANH MỤC TÀI LIỆU HỖ TRỢ</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {['Bản vẽ có chữ ký', 'Spec', 'Chứng nhận nguyên liệu', 'Rập cỡ có chữ ký', 'Mẫu màu', 'Phiếu thông tin BTP'].map(doc => (
                           <label key={doc} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600"><input type="checkbox" className="rounded accent-teal-600"/> {doc}</label>
                        ))}
                    </div>
                </div>

                <div className="md:col-span-2 space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <label className="text-[9px] font-black text-indigo-600 uppercase flex items-center justify-between">Tải lên Bản vẽ / PO / Chất lượng
                        <div className="flex gap-1">
                            <button onClick={() => { setActiveUploadContext({ type: 'DRAWING' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'DRAWING' }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3 h-3"/></button>
                        </div>
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">
                        {formData.drawingImages?.map((img, i) => (
                            <img key={i} src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: formData.drawingImages!, index: i, context: { type: 'DRAWING' } })} />
                        ))}
                    </div>
                </div>
            </div>
        </section>
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1"><h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-teal-600"/> II. DANH MỤC BTP KIỂM TRA ({formData.materials?.length || 0})</h3><button onClick={handleAddMaterial} className="bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3" type="button"><Plus className="w-3 h-3"/><span className="text-[10px] font-bold uppercase">Thêm BTP</span></button></div>
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const failRate = mat.inspectQty > 0 ? ((mat.failQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const hasError = mat.failQty > 0;
                    return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-teal-50/50 border-b border-teal-100' : 'bg-white'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${isExp ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{matIdx + 1}</div><div className="flex-1 overflow-hidden"><h4 className="font-bold text-slate-800 uppercase text-xs truncate">{mat.category || 'BÁN THÀNH PHẨM MỚI'}</h4><div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">SL: {mat.deliveryQty} {mat.unit}</span><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${hasError ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>{passRate}% ĐẠT</span></div></div></div>
                            <div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-600" type="button"><Trash2 className="w-4 h-4"/></button>{isExp ? <ChevronUp className="w-4 h-4 text-teal-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}</div>
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 bg-white border-t border-slate-50">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                      <div className="col-span-6 md:col-span-3 space-y-1">
                                         <label className="text-[9px] font-bold text-slate-500 uppercase">Mã Định Danh *</label>
                                         <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-8 shadow-inner uppercase" placeholder="Mã định danh..."/>
                                      </div>
                                      <div className="col-span-6 md:col-span-3 space-y-1">
                                         <label className="text-[9px] font-bold text-slate-500 uppercase">Mã Dự Án</label>
                                         <input value={mat.projectCode || ''} onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-8 shadow-inner uppercase" placeholder="Mã dự án..."/>
                                      </div>
                                      <div className="col-span-6 md:col-span-3 space-y-1">
                                         <label className="text-[9px] font-bold text-slate-500 uppercase">Tên Dự Án</label>
                                         <input value={mat.projectName || ''} onChange={e => updateMaterial(matIdx, 'projectName', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-8 shadow-inner" placeholder="Tên dự án..."/>
                                      </div>
                                      <div className="col-span-6 md:col-span-3 space-y-1">
                                          <label className="text-[9px] font-bold text-slate-500 uppercase">Tên Hạng Mục</label>
                                          <input value={mat.category || ''} onChange={e => updateMaterial(matIdx, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-8 shadow-inner" placeholder="Hạng mục..."/>
                                      </div>
                                      <div className="col-span-4 md:col-span-2 space-y-1">
                                          <label className="text-[9px] font-bold text-slate-500 uppercase">ĐVT</label>
                                          <input value={mat.unit || ''} onChange={e => updateMaterial(matIdx, 'unit', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-8 shadow-inner uppercase" placeholder="DVT..."/>
                                      </div>
                                      <div className="col-span-4 md:col-span-3 space-y-1">
                                         <label className="text-[9px] font-bold text-slate-500 uppercase">QC Kiểm Tra</label>
                                         <input value={user.name} disabled className="w-full px-2 py-1.5 border border-slate-200 rounded-md font-bold text-[11px] h-8 bg-slate-100 text-slate-500"/>
                                      </div>
                                      <div className="col-span-4 md:col-span-3 space-y-1">
                                          <label className="text-[9px] font-bold text-slate-500 uppercase">Ngày Kiểm Tra</label>
                                          <input type="date" value={mat.date} onChange={e => updateMaterial(matIdx, 'date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-8 shadow-inner"/>
                                      </div>
                                 </div>
                                 <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase block text-center">Giao(DN)</label><input type="number" step="any" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', e.target.value)} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-teal-600 uppercase block text-center">Kiểm tra</label><input type="number" step="any" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', e.target.value)} className="w-full px-2 py-1 border border-teal-300 rounded-md font-bold text-center text-teal-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-green-600 uppercase flex items-center justify-between"><span>Đạt</span><span className="text-[8px] bg-green-100 px-1 rounded">{passRate}%</span></label><input type="number" step="any" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', e.target.value)} className="w-full px-2 py-1 border border-green-300 rounded-md font-bold text-center text-green-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-red-600 uppercase flex items-center justify-between"><span>Lỗi</span><span className="text-[8px] bg-red-100 px-1 rounded">{failRate}%</span></label><input type="number" step="any" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', e.target.value)} className="w-full px-2 py-1 border border-red-300 rounded-md font-bold text-center text-red-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                 </div>
                                 <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                                     <label className="text-[9px] font-black text-indigo-600 uppercase flex items-center justify-between">Tải lên Ảnh lỗi (nếu có)
                                        <div className="flex gap-1">
                                            <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx: 0 }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button>
                                            <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx: 0 }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3 h-3"/></button>
                                        </div>
                                     </label>
                                     <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">
                                        {mat.items[0]?.images?.map((img, i) => (
                                            <img key={i} src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: mat.items[0].images!, index: i, context: { type: 'ITEM', matIdx, itemIdx: 0 } })} />
                                        ))}
                                     </div>
                                 </div>
                                 <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 mt-2">
                                     <label className="text-[9px] font-black text-indigo-600 uppercase flex items-center justify-between">Tải ảnh sản phẩm
                                        <div className="flex gap-1">
                                            <button onClick={() => { setActiveUploadContext({ type: 'MATERIAL', matIdx }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button>
                                            <button onClick={() => { setActiveUploadContext({ type: 'MATERIAL', matIdx }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3 h-3"/></button>
                                        </div>
                                     </label>
                                     <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">
                                        {mat.images?.map((img, i) => (
                                            <img key={i} src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: mat.images!, index: i, context: { type: 'MATERIAL', matIdx } })} />
                                        ))}
                                     </div>
                                 </div>
                             </div>
                        )}
                    </div>
                );
              })}
            </div>
        </section>
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-3">
           <h3 className="text-slate-700 border-b border-slate-100 pb-2 mb-3 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><AlertOctagon className="w-4 h-4 text-amber-500"/> III. GHI CHÚ</h3>
           <textarea
               value={formData.summary || ''}
               onChange={e => handleInputChange('summary', e.target.value)}
               placeholder="Nhập ghi chú tổng hợp (nếu có)..."
               className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-1 focus:ring-teal-500 outline-none shadow-sm min-h-[80px]"
           />
        </section>
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-3">
          <h3 className="text-teal-800 border-b border-teal-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3>
          <SignaturePad 
            label={`QC Ký Tên (${user.name})`} 
            value={formData.signature} 
            onChange={sig => setFormData({...formData, signature: sig})} 
            uploadContext={{ entityId: formData.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_QC' }}
          />
        </section>
      </div>
      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"><button onClick={onCancel} className="h-[44px] px-6 text-slate-500 font-bold uppercase tracking-widest rounded-xl border border-slate-200 text-[10px]" type="button">HỦY BỎ</button><button onClick={handleSubmit} disabled={isSaving} className="h-[44px] flex-1 bg-teal-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-teal-800 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}<span>GỬI DUYỆT SQC-BTP</span></button></div>
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
