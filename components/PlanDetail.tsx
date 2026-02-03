

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlanItem, CheckItem, Inspection, InspectionStatus } from '../types';
import { 
  ArrowLeft, Building2, Box, Hash, Edit3, Plus, 
  CheckCircle2, Save, Trash2, 
  Info, Clock, FileText, User as UserIcon, ChevronRight,
  ImageIcon, Maximize2, Activity, History, ListChecks, Loader2,
  Package, UploadCloud, ShieldCheck, Camera, X, FileCode, Archive,
  Table, FileUp, FileDown, Layers, Check, ClipboardList, MapPin, Factory,
  Eye, FileSearch, FileType, ZoomIn
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { uploadFileToStorage } from '../services/apiService';

interface TechnicalDrawing {
    id: string;
    url: string;
    name: string;
    version: string;
    date: string;
}

interface PlanDetailProps {
  item: PlanItem;
  onBack: () => void;
  onCreateInspection: (customItems: CheckItem[]) => void;
  relatedInspections?: Inspection[];
  onViewInspection: (id: string) => void;
  onUpdatePlan: (id: number | string, updatedPlan: Partial<PlanItem>) => Promise<void>;
}

export const PlanDetail: React.FC<PlanDetailProps> = ({ 
    item, onBack, onCreateInspection, relatedInspections = [], onViewInspection, onUpdatePlan 
}) => {
  const [isPlanEditing, setIsPlanEditing] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[], index: number } | null>(null);
  const [previewDrawing, setPreviewDrawing] = useState<TechnicalDrawing | null>(null);

  // Access XLSX from global
  const XLSX = (window as any).XLSX;

  // Editable Plan Fields
  const [editedName, setEditedName] = useState(item.ten_hang_muc);
  const [editedAssignee, setEditedAssignee] = useState(item.assignee || 'UNASSIGNED');
  const [editedDate, setEditedDate] = useState(item.plannedDate || 'PENDING');
  const [editedDesc, setEditedDesc] = useState(item.description || '');

  // Parse Drawings List - Robust handling for legacy data and JSON arrays
  const [drawings, setDrawings] = useState<TechnicalDrawing[]>(() => {
    if (!item.drawing_url) return [];
    try {
        const data = JSON.parse(item.drawing_url);
        return Array.isArray(data) ? data : [{ id: 'legacy', url: item.drawing_url, name: 'Bản vẽ hệ thống', version: '1.0', date: item.plannedDate || '' }];
    } catch (e) {
        // If not JSON, it's a direct URL string
        return [{ id: 'legacy', url: item.drawing_url, name: 'Bản vẽ hệ thống', version: '1.0', date: item.plannedDate || '' }];
    }
  });

  const [editedMaterials, setEditedMaterials] = useState<any[]>(() => {
    try { return item.materials_text ? JSON.parse(item.materials_text) : []; } catch(e) { return []; }
  });

  const [editedSamples, setEditedSamples] = useState<any[]>(() => {
    try { return item.samples_json ? JSON.parse(item.samples_json) : []; } catch(e) { return []; }
  });

  const [editedSimulations, setEditedSimulations] = useState<string[]>(() => {
    try { return item.simulations_json ? JSON.parse(item.simulations_json) : []; } catch(e) { return []; }
  });

  const simFileInputRef = useRef<HTMLInputElement>(null);
  const drawFileInputRef = useRef<HTMLInputElement>(null);
  const materialExcelRef = useRef<HTMLInputElement>(null);
  const sampleExcelRef = useRef<HTMLInputElement>(null);

  const handleSavePlan = async () => {
    if (!item.id) return;
    setIsSavingPlan(true);
    try {
        const payload: Partial<PlanItem> = {
            ten_hang_muc: editedName,
            assignee: editedAssignee,
            plannedDate: editedDate,
            drawing_url: JSON.stringify(drawings),
            description: editedDesc,
            materials_text: JSON.stringify(editedMaterials),
            samples_json: JSON.stringify(editedSamples),
            simulations_json: JSON.stringify(editedSimulations)
        };
        await onUpdatePlan(item.id, payload);
        setIsPlanEditing(false);
    } catch (e) {
        alert("Lỗi khi cập nhật thông tin sản phẩm.");
    } finally {
        setIsSavingPlan(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'SIM' | 'DRAW') => {
      const files = e.target.files;
      if (!files?.length) return;
      setIsUploading(true);
      try {
          if (target === 'SIM') {
              const base64Files = await Promise.all(Array.from(files).map(fileToBase64));
              const newUrls = await Promise.all(base64Files.map((base64, index) => uploadFileToStorage(base64, files[index].name)));
              setEditedSimulations([...editedSimulations, ...newUrls]);
          } else {
              const file = files[0];
              const base64 = await fileToBase64(file); // Fixed: Convert File to base64 string
              const url = await uploadFileToStorage(base64, file.name); // Fixed: Pass base64 string
              const version = prompt("Nhập phiên bản bản vẽ (VD: REV 1.1):", "1.0") || "1.0";
              const newDrawing: TechnicalDrawing = {
                  id: `dwg_${Date.now()}`,
                  url,
                  name: file.name,
                  version: version.toUpperCase(),
                  date: new Date().toLocaleDateString('vi-VN')
              };
              setDrawings(prev => [...prev, newDrawing]);
              setIsPlanEditing(true); 
          }
      } catch (e) { alert("Lỗi tải file."); } finally { setIsUploading(false); }
  };

  const handleDeleteDrawing = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (window.confirm("Xác nhận xóa bản vẽ kỹ thuật này khỏi hồ sơ?")) {
          setDrawings(drawings.filter(d => d.id !== id));
      }
  };

  const exportExcel = (data: any[], fileName: string) => {
    if (!XLSX) return alert("Thư viện Excel chưa sẵn sàng.");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>, type: 'MAT' | 'SAM') => {
    const file = e.target.files?.[0];
    if (!file || !XLSX) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.json_to_json(ws);
        
        if (type === 'MAT') {
            const mapped = data.map(row => ({
                name: row['Vật Tư'] || row['Tên vật tư'] || row['Material'] || '',
                spec: row['Quy Cách'] || row['Spec'] || ''
            })).filter(r => r.name);
            setEditedMaterials([...editedMaterials, ...mapped]);
        } else {
            const mapped = data.map(row => ({
                name: row['Tên Mẫu'] || row['Sample Name'] || '',
                code: row['Mã Màu'] || row['Color Code'] || ''
            })).filter(r => r.name);
            setEditedSamples([...editedSamples, ...mapped]);
        }
      } catch (err) {
          alert("Lỗi đọc file Excel. Vui lòng kiểm tra định dạng.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const isPDF = (url: string) => {
      if (!url) return false;
      return url.toLowerCase().includes('.pdf') || url.startsWith('data:application/pdf');
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] animate-in fade-in duration-300 overflow-hidden font-serif select-none" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
        
        {/* COMPACT SLIM HEADER */}
        <div className="bg-[#111827] text-white h-11 md:h-12 shrink-0 z-50 shadow-xl flex items-center px-4 border-b border-white/5">
            <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all active:scale-90">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>
                    <div className="flex items-center gap-2 overflow-hidden">
                        <h2 className="text-[11px] font-bold uppercase tracking-widest text-white whitespace-nowrap overflow-hidden text-ellipsis">
                            PRODUCT SPEC - <span className="text-blue-400 font-medium">{item.ma_ct}</span>
                        </h2>
                        <span className="text-white/20 hidden sm:inline">|</span>
                        <span className="text-white/40 font-bold text-[10px] uppercase tracking-tighter hidden sm:inline">ISO 9001 COMPLIANCE</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isPlanEditing ? (
                        <>
                            <button onClick={() => { setEditedName(item.ten_hang_muc); setIsPlanEditing(false); }} className="px-3 py-1 text-white/50 font-bold text-[10px] uppercase hover:text-white transition-colors">CANCEL</button>
                            <button 
                                onClick={handleSavePlan}
                                disabled={isSavingPlan}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] uppercase shadow-lg shadow-emerald-900/20 active:scale-95 transition-all flex items-center gap-2"
                            >
                                {isSavingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                SAVE
                            </button>
                        </>
                    ) : (
                        <>
                            <button 
                                onClick={() => setIsPlanEditing(true)}
                                className="px-4 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg font-bold text-[10px] uppercase active:scale-95 flex items-center gap-2 transition-all"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                                EDIT
                            </button>
                            <button 
                                onClick={() => onCreateInspection([])}
                                className="px-5 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-[10px] uppercase shadow-lg shadow-blue-900/20 active:scale-95 hover:bg-blue-700 flex items-center gap-2 transition-all"
                            >
                                <Activity className="w-4 h-4" />
                                <span className="hidden sm:inline">START QC</span>
                                <span className="sm:hidden">QC</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* MAIN LAYOUT */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#f0f2f5] no-scrollbar">
            <div className="max-w-[100rem] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-3 pb-20">
                
                {/* LEFT: PRIMARY RENDER FOCUS */}
                <div className="lg:col-span-8 flex flex-col gap-3">
                    {/* Hero Render Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[450px]">
                        <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-purple-600" />
                                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">RENDER / 3D SIMULATIONS</span>
                            </div>
                            {isPlanEditing && (
                                <button onClick={() => simFileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase text-purple-600 hover:bg-purple-50 transition-all">
                                    <Camera className="w-3.5 h-3.5" /> ADD MEDIA
                                </button>
                            )}
                        </div>
                        <div className="flex-1 bg-slate-900 flex items-center justify-center relative overflow-hidden">
                            {editedSimulations.length > 0 ? (
                                <div className="w-full h-full group relative">
                                    <img src={editedSimulations[0]} className="w-full h-full object-contain" alt="Primary Render" />
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {editedSimulations.map((url, i) => (
                                            <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/20 cursor-pointer" onClick={() => setLightbox({ images: editedSimulations, index: i })}>
                                                <img src={url} className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center space-y-3 opacity-20">
                                    <Layers className="w-20 h-20 text-white mx-auto" />
                                    <p className="text-white text-[11px] font-bold uppercase tracking-[0.3em]">NO VISUALS ATTACHED</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tables Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Approval Samples Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[300px]">
                            <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600"/> MẪU ĐỐI CHỨNG / MẪU DUYỆT</span>
                                <div className="flex gap-1">
                                    <button onClick={() => exportExcel(editedSamples, 'Samples')} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" title="Xuất Excel"><FileDown className="w-3.5 h-3.5"/></button>
                                    {isPlanEditing && (
                                        <>
                                            <button onClick={() => sampleExcelRef.current?.click()} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all" title="Nhập Excel"><FileUp className="w-3.5 h-3.5"/></button>
                                            <button onClick={() => setEditedSamples([...editedSamples, { name: '', code: '' }])} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Thêm dòng"><Plus className="w-4 h-4"/></button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto no-scrollbar">
                                <table className="w-full text-left text-[11px]">
                                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-tighter sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2">Tên Mẫu</th>
                                            <th className="px-3 py-2">Mã Màu</th>
                                            <th className="px-3 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {editedSamples.map((s, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-3 py-2">
                                                    {isPlanEditing ? <input value={s.name} onChange={e => { const n = [...editedSamples]; n[i].name = e.target.value.toUpperCase(); setEditedSamples(n); }} className="w-full bg-transparent outline-none font-bold" placeholder="..." /> : <span className="font-bold text-slate-700 uppercase">{s.name || '---'}</span>}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {isPlanEditing ? <input value={s.code} onChange={e => { const n = [...editedSamples]; n[i].code = e.target.value.toUpperCase(); setEditedSamples(n); }} className="w-full bg-transparent outline-none" placeholder="..." /> : <span className="text-slate-500 font-mono uppercase">{s.code || '---'}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isPlanEditing && <button onClick={() => setEditedSamples(editedSamples.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 transition-colors"><X className="w-3.5 h-3.5"/></button>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {editedSamples.length === 0 && <p className="text-center py-10 text-[10px] text-slate-300 font-bold uppercase italic">Chưa cập nhật mẫu</p>}
                            </div>
                        </div>

                        {/* Materials Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[300px]">
                            <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2"><Archive className="w-4 h-4 text-orange-600"/> DANH MỤC VẬT TƯ (BOM)</span>
                                <div className="flex gap-1">
                                    <button onClick={() => exportExcel(editedMaterials, 'Materials')} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors" title="Xuất Excel"><FileDown className="w-3.5 h-3.5"/></button>
                                    {isPlanEditing && (
                                        <>
                                            <button onClick={() => materialExcelRef.current?.click()} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all" title="Nhập Excel"><FileUp className="w-3.5 h-3.5"/></button>
                                            <button onClick={() => setEditedMaterials([...editedMaterials, { name: '', spec: '' }])} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Thêm dòng"><Plus className="w-4 h-4"/></button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto no-scrollbar">
                                <table className="w-full text-left text-[11px]">
                                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-tighter sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2">Vật Tư</th>
                                            <th className="px-3 py-2">Quy Cách</th>
                                            <th className="px-3 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {editedMaterials.map((m, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-3 py-2">
                                                    {isPlanEditing ? <input value={m.name} onChange={e => { const n = [...editedMaterials]; n[i].name = e.target.value.toUpperCase(); setEditedMaterials(n); }} className="w-full bg-transparent outline-none font-bold" placeholder="..." /> : <span className="font-bold text-slate-700 uppercase">{m.name || '---'}</span>}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {isPlanEditing ? <input value={m.spec} onChange={e => { const n = [...editedMaterials]; n[i].spec = e.target.value; setEditedMaterials(n); }} className="w-full bg-transparent outline-none" placeholder="..." /> : <span className="text-slate-500 italic">{m.spec || '---'}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isPlanEditing && <button onClick={() => setEditedMaterials(editedMaterials.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 transition-colors"><X className="w-3.5 h-3.5"/></button>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {editedMaterials.length === 0 && <p className="text-center py-10 text-[10px] text-slate-300 font-bold uppercase italic">Chưa cập nhật vật tư</p>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: DOCS & INFO */}
                <div className="lg:col-span-4 flex flex-col gap-3">
                    {/* Info Grid Card */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg"><Box className="w-4.5 h-4.5" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none truncate">PROJECT #{item.ma_ct}</p>
                                    {isPlanEditing ? (
                                        <input value={editedName} onChange={e => setEditedName(e.target.value.toUpperCase())} className="text-[11px] font-black text-slate-900 border-b border-blue-500 w-full bg-transparent outline-none mt-1 uppercase" />
                                    ) : (
                                        <h1 className="text-[11px] font-black text-slate-900 uppercase tracking-tight mt-1 truncate">{item.ten_hang_muc}</h1>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-50">
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">SL IPO</p>
                                    <p className="text-[11px] font-black text-blue-600">{item.so_luong_ipo} {item.dvt}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">NGÀY DỰ KIẾN</p>
                                    {isPlanEditing ? <input type="date" value={editedDate} onChange={e => setEditedDate(e.target.value)} className="text-[11px] font-black border-b w-full outline-none bg-transparent" /> : <p className="text-[11px] font-black text-slate-800">{editedDate}</p>}
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">PC/ASSIGNEE</p>
                                    {isPlanEditing ? <input value={editedAssignee} onChange={e => setEditedAssignee(e.target.value.toUpperCase())} className="text-[11px] font-black border-b w-full outline-none bg-transparent" /> : <p className="text-[11px] font-black text-slate-800">{editedAssignee}</p>}
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">MÃ SẢN PHẨM</p>
                                    <p className="text-[11px] font-black text-slate-800 font-mono uppercase">{item.ma_nha_may || item.headcode}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Technical Drawing List Card - REFINED AS LIST */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[360px]">
                        <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-600" />
                                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">TECHNICAL DRAWINGS</span>
                            </div>
                            {isPlanEditing && (
                                <button onClick={() => drawFileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase text-blue-600 hover:bg-blue-50 transition-all">
                                    <UploadCloud className="w-3.5 h-3.5"/> UPLOAD
                                </button>
                            )}
                        </div>
                        <div className="flex-1 bg-white relative overflow-y-auto no-scrollbar">
                            {drawings.length > 0 ? (
                                <div className="divide-y divide-slate-50">
                                    {drawings.map((dwg, i) => (
                                        <div 
                                            key={dwg.id || i} 
                                            className="p-3 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer group" 
                                            onClick={() => setPreviewDrawing(dwg)}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isPDF(dwg.url) ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {isPDF(dwg.url) ? <FileText className="w-5 h-5"/> : <ImageIcon className="w-5 h-5"/>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[11px] font-black text-slate-800 uppercase truncate leading-none">{dwg.name || 'Bản vẽ không tên'}</p>
                                                    <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[8px] font-black uppercase tracking-tighter shadow-sm shrink-0">REV {dwg.version || '1.0'}</span>
                                                </div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5 tracking-widest flex items-center gap-1.5">
                                                    <Clock className="w-2.5 h-2.5" /> {dwg.date || '---'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="p-1.5 text-blue-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-blue-100">
                                                    <Eye className="w-4 h-4"/>
                                                </div>
                                                {isPlanEditing && (
                                                    <button onClick={(e) => handleDeleteDrawing(e, dwg.id)} className="p-1.5 text-red-500 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-red-100">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                                    <FileCode className="w-12 h-12 mb-2 text-slate-400" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest">No Technical Data</p>
                                </div>
                            )}
                            {isUploading && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                        <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Processing...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Extended Logs Summary */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-56">
                         <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                            <History className="w-4 h-4 text-indigo-500" />
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">NHẬT KÝ QC ({relatedInspections?.length || 0})</span>
                         </div>
                         <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                            {relatedInspections?.map((ins_item, i) => (
                                <div key={i} onClick={() => onViewInspection(ins_item.id)} className="p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-white hover:border-blue-300 transition-all cursor-pointer group shadow-sm flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm transition-all"><ListChecks className="w-4 h-4" /></div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-800 uppercase leading-none">{ins_item.date}</p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-1">BY: {ins_item.inspectorName}</p>
                                            </div>
                                        </div>
                                        <span className="text-[8px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-tighter shadow-sm">{ins_item.type}</span>
                                    </div>
                                    <div className="flex gap-2 items-center border-t border-slate-100 pt-1.5 overflow-hidden">
                                        <div className="flex items-center gap-1 shrink-0"><Factory className="w-2.5 h-2.5 text-slate-400"/><span className="text-[8px] font-bold text-slate-500 uppercase truncate max-w-[80px]">{ins_item.workshop || 'N/A'}</span></div>
                                        <div className="w-px h-2 bg-slate-200"></div>
                                        <div className="flex items-center gap-1 min-w-0"><ClipboardList className="w-2.5 h-2.5 text-slate-400"/><span className="text-[8px] font-bold text-slate-500 uppercase truncate">{ins_item.inspectionStage || 'N/A'}</span></div>
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-transform ml-auto" />
                                    </div>
                                </div>
                            ))}
                            {(!relatedInspections || relatedInspections.length === 0) && <p className="text-center py-10 text-[9px] text-slate-300 font-bold uppercase tracking-widest italic">Chưa có nhật ký</p>}
                         </div>
                    </div>
                </div>
            </div>
        </div>

        {/* --- REVIEW DRAWING MODAL - REFINED VIEWPORT --- */}
        {previewDrawing && (
            <div className="fixed inset-0 z-[160] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
                <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-[#0f172a] text-white shrink-0 shadow-2xl relative z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setPreviewDrawing(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-90 text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
                        <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>
                        <div className="min-w-0">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90 leading-none flex items-center gap-2">
                                <FileSearch className="w-3.5 h-3.5 text-blue-400"/> DRAWING REVIEW SYSTEM
                            </h3>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 truncate max-w-[250px] sm:max-w-[400px]">
                                {previewDrawing.name} • <span className="text-blue-400">REV {previewDrawing.version || '1.0'}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => window.open(previewDrawing.url, '_blank')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-blue-900/40">
                            <Maximize2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">OPEN FULLSCREEN</span>
                        </button>
                    </div>
                </header>
                
                <div className="flex-1 bg-[#0c1421] relative flex items-center justify-center p-2 sm:p-6 overflow-hidden">
                    {isPDF(previewDrawing.url) ? (
                        <div className="w-full h-full max-w-7xl mx-auto rounded-xl shadow-2xl border-4 border-white/5 overflow-hidden bg-[#525659]">
                            {/* Browser-native PDF rendering for multi-page support and vertical scrolling */}
                            <iframe 
                                src={previewDrawing.url} 
                                className="w-full h-full border-0" 
                                title="Drawing Viewer" 
                            />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center overflow-auto no-scrollbar group select-none">
                            <img 
                                src={previewDrawing.url} 
                                className="max-w-[98%] max-h-[98%] object-contain shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-sm transition-transform duration-500" 
                                alt="Technical Drawing" 
                                onError={(e) => {
                                    // Fallback for broken images
                                    e.currentTarget.style.display = 'none';
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                        parent.innerHTML = `
                                            <div class="flex flex-col items-center gap-4 text-slate-600">
                                                <div class="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center border-2 border-slate-700">
                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                                </div>
                                                <p class="text-[10px] font-black uppercase tracking-[0.2em]">Failed to load drawing source</p>
                                            </div>
                                        `;
                                    }
                                }}
                            />
                        </div>
                    )}
                    
                    {/* Centered Scale Info Overlay */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 opacity-40 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-6">
                            <span className="text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                <ZoomIn className="w-3.5 h-3.5 text-blue-400" /> SCALE ADAPTIVE
                            </span>
                            <div className="h-3 w-px bg-white/10"></div>
                            <span className="text-white text-[9px] font-black uppercase tracking-widest">
                                ISO COMPLIANT VIEWER
                            </span>
                        </div>
                    </div>
                </div>

                <footer className="h-10 bg-[#0f172a] border-t border-white/5 flex items-center justify-center text-white/20 text-[8px] font-black uppercase tracking-[0.5em] select-none shrink-0">
                    AATN Digital Document Control • Security Protected
                </footer>
            </div>
        )}

        {/* HIDDEN INPUTS */}
        <input type="file" ref={drawFileInputRef} onChange={e => handleFileUpload(e, 'DRAW')} accept=".pdf,image/*" className="hidden" />
        <input type="file" ref={simFileInputRef} onChange={e => handleFileUpload(e, 'SIM')} accept="image/*" multiple className="hidden" />
        <input type="file" ref={materialExcelRef} className="hidden" accept=".xlsx, .xls" onChange={e => handleImportExcel(e, 'MAT')} />
        <input type="file" ref={sampleExcelRef} className="hidden" accept=".xlsx, .xls" onChange={e => handleImportExcel(e, 'SAM')} />

        {lightbox && (
            <ImageEditorModal images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} readOnly={true} />
        )}
    </div>
  );
};