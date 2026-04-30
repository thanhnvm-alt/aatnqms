import React, { useState, useEffect } from 'react';
import { IPOItem } from '../types';
import { ArrowLeft, FileText, Package, Ruler, Info, BrainCircuit, History, Share2, AlertTriangle, CheckCircle2, ChevronRight, Upload, Search, FileDiff, Edit, Trash2, X } from 'lucide-react';
import { fetchIpoDetailExtended, saveIpoDrawingRecord, uploadFileToStorage, saveIpoMaterialRecord, saveIpoSampleRecord, updateIpoSampleRecord, deleteIpoSampleRecord, fetchProjectByCode } from '../services/apiService';
import { analyzeIpo } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

interface IPODetailProps {
  item: IPOItem;
  onBack: () => void;
  onCreateInspection: () => void;
  onViewInspection: () => void;
  onUpdatePlan: (item: Partial<IPOItem>) => Promise<void>;
}

export const IPODetail: React.FC<IPODetailProps> = ({ item, onBack }) => {
  const [extendedDetail, setExtendedDetail] = useState<any>(null);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'drawings' | 'materials' | 'samples' | 'ai'>('info');
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [projectData, setProjectData] = useState<any>(null);
  const [editingSample, setEditingSample] = useState<any>(null);

  useEffect(() => {
    loadData();
    if (item.ma_ct) {
      handleProjectLookup(item.ma_ct);
    }
  }, [item.ma_nha_may]);

  const handleProjectLookup = async (code: string) => {
    try {
      const data = await fetchProjectByCode(code);
      setProjectData(data);
    } catch (error) {
      console.error("Project lookup failed:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchIpoDetailExtended(item.ma_nha_may);
      setExtendedDetail(data.detail);
      setDrawings(data.drawings || []);
      setMaterials(data.materials || []);
      setSamples(data.samples || []);
    } catch (error) {
      console.error("Error loading IPO extended data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const context = {
        ipo_header: item,
        material_group: {
          current: item.ten_hang_muc,
          history: extendedDetail?.material_history || "No history logged."
        },
        sample_group: {
          current: "Current sample status",
          history: extendedDetail?.sample_history || "No samples logged."
        },
        drawing_group: {
          old_v: drawings[1]?.version || "N/A",
          new_v: drawings[0]?.version || "current",
          history_notes: drawings.map(d => d.revision_notes).join("; "),
          page_target: 1
        },
        quality_data: {
          iqc: "Pending",
          pqc: "In progress",
          sqc: "Not started"
        }
      };

      const result = await analyzeIpo(context);
      setAiResult(result);
      setActiveTab('ai');
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFileToStorage(file, `drawing_${item.ma_nha_may}_${Date.now()}.pdf`);
      const newDrawing = {
        id_factory_order: item.ma_nha_may,
        drawing_name: file.name,
        version: drawings.length > 0 ? (drawings.length + 1).toFixed(1) : "1.0",
        file_url: url,
        revision_notes: "New version uploaded via IPO Detail Applet.",
        page_count: 0
      };
      await saveIpoDrawingRecord(newDrawing);
      loadData();
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading IPO Intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg tracking-wider uppercase">INTERNAL ORDER</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.ma_ct}</span>
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight leading-none uppercase">{item.ma_nha_may}</h2>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={handleAIAnalysis}
            disabled={analyzing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-wider transition-all shadow-sm ${analyzing ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200'}`}
          >
            {analyzing ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
            {analyzing ? 'Analyzing...' : 'Prompt AI Studio'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex px-6 pt-2 bg-white border-b border-slate-100 gap-8 overflow-x-auto no-scrollbar">
        {[
          { id: 'info', label: 'THÔNG TIN CHUNG', icon: FileText },
          { id: 'drawings', label: 'HỒ SƠ BẢN VẼ', icon: Ruler },
          { id: 'materials', label: 'QUẢN LÝ VẬT LIỆU', icon: Package },
          { id: 'samples', label: 'QUẢN LÝ MẪU', icon: Info },
          { id: 'ai', label: 'AI INSIGHTS', icon: BrainCircuit }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 pb-3 pt-2 text-[11px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`} />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
          
          <AnimatePresence mode="wait">
            {activeTab === 'info' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SỐ LƯỢNG IPO</p>
                    <div className="flex items-end gap-2">
                      <p className="text-3xl font-black text-slate-800">{item.so_luong_ipo}</p>
                      <p className="text-xs font-black text-slate-400 mb-1">{item.dvt}</p>
                    </div>
                  </div>
                  <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TÊN CÔNG TRÌNH</p>
                    <p className="text-sm font-black text-slate-700 leading-tight line-clamp-2">{item.ten_ct}</p>
                  </div>
                  <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HẠNG MỤC</p>
                    <p className="text-sm font-bold text-slate-600 leading-tight line-clamp-2">{item.ten_hang_muc}</p>
                  </div>
                </div>

                {/* History Summary */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                        <History className="w-5 h-5 text-indigo-500" />
                      </div>
                      <h3 className="font-black text-[13px] text-slate-800 uppercase tracking-wider">Lịch sử thay đổi hệ thống</h3>
                    </div>
                  </div>
                  <div className="p-8 space-y-8">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="w-1 h-4 bg-indigo-400 rounded-full"></span> NHÓM VẬT LIỆU
                      </h4>
                      <p className="text-sm text-slate-600 italic leading-relaxed">
                        {extendedDetail?.material_history || "Chưa có dữ liệu thay đổi vật liệu được ghi nhận trong hệ thống."}
                      </p>
                    </div>
                    <div className="pt-6 border-t border-slate-50">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="w-1 h-4 bg-amber-400 rounded-full"></span> NHÓM MẪU VẬT LIỆU
                      </h4>
                      <p className="text-sm text-slate-600 italic leading-relaxed">
                        {extendedDetail?.sample_history || "Chưa có dữ liệu thay đổi mẫu mẫu vật liệu được ghi nhận."}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'drawings' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Drawing Actions */}
                <div className="flex justify-between items-center bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-indigo-100 shadow-xl border border-indigo-100">
                      <FileDiff className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-black text-indigo-900 text-sm uppercase">Cập nhật bản vẽ mới</h3>
                      <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">Hệ thống sẽ tự động so sánh revision</p>
                    </div>
                  </div>
                  <label className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest cursor-pointer hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200">
                    <Upload className="w-4 h-4" />
                    Tải lên (PDF)
                    <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
                  </label>
                </div>

                {/* Drawing List */}
                <div className="grid grid-cols-1 gap-4">
                  {drawings.length > 0 ? drawings.map((dw, idx) => (
                    <div key={dw.id || idx} className="group bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-start gap-6">
                      <div className={`shrink-0 w-14 h-14 rounded-3xl flex items-center justify-center ${idx === 0 ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                        <FileText className="w-7 h-7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${idx === 0 ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            VER {dw.version}
                          </span>
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                            • {new Date(Number(dw.created_at) * 1000).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-800 truncate uppercase mt-1">{dw.drawing_name}</h4>
                        <p className="text-xs text-slate-500 mt-2 italic font-medium leading-relaxed">
                          {dw.revision_notes || "No revision notes provided."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                         <a href={dw.file_url} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-100 rounded-xl text-indigo-600">
                           <ChevronRight className="w-5 h-5" />
                         </a>
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-100 rounded-3xl mx-auto flex items-center justify-center">
                        <Ruler className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">Chưa có bản vẽ nào được lưu trữ</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'materials' && (
               <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
               >
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                   <div className="flex items-center justify-between">
                     <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">Cập nhật hồ sơ vật liệu</h3>
                     <Package className="w-5 h-5 text-indigo-500" />
                   </div>
                   <form className="space-y-4" onSubmit={async (e) => {
                     e.preventDefault();
                     const form = e.currentTarget;
                     const formData = new FormData(form);
                     const material_name = formData.get('material_name') as string;
                     const specification = formData.get('specification') as string;
                     const drawing_ref = formData.get('drawing_ref') as string;
                     const ma_ct = formData.get('ma_ct') as string;
                     const ten_ct = formData.get('ten_ct') as string;
                     const file = (form.querySelector('input[type="file"]') as HTMLInputElement)?.files?.[0];
                     
                     if (!material_name) return;
                     
                     let file_url = "";
                     if (file) {
                       setUploadingMaterial(true);
                       try {
                         file_url = await uploadFileToStorage(file, `material_${item.ma_nha_may}_${Date.now()}_${file.name}`);
                       } catch (err) {
                         console.error("Upload failed:", err);
                       } finally {
                         setUploadingMaterial(false);
                       }
                     }
                     
                     await saveIpoMaterialRecord({
                       id_factory_order: item.ma_nha_may,
                       material_name,
                       specification,
                       drawing_ref,
                       file_url,
                       data: { ma_ct, ten_ct },
                       version: materials.length > 0 ? (materials.length + 1).toFixed(1) : "1.0"
                     });
                     loadData();
                     form.reset();
                   }}>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <input name="material_name" placeholder="Tên vật liệu" className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100" required />
                       <input name="drawing_ref" placeholder="Mã bản vẽ đối chiếu" className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100" />
                       
                       <div className="flex flex-col gap-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Mã công trình (Auto-filled)</label>
                         <input name="ma_ct" defaultValue={projectData?.ma_ct || item.ma_ct} placeholder="Mã công trình" className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100" />
                       </div>
                       <div className="flex flex-col gap-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tên công trình (Auto-filled)</label>
                         <input name="ten_ct" defaultValue={projectData?.ten_ct || item.ten_ct} placeholder="Tên công trình" className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100" />
                       </div>

                       <textarea name="specification" placeholder="Quy cách kỹ thuật chi tiết..." className="md:col-span-2 bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 h-24" />
                       <div className="md:col-span-2">
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Ảnh vật liệu / Specs</label>
                         <div className="relative group">
                           <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="image/*,.pdf" />
                           <div className="bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl px-5 py-4 flex items-center justify-center gap-3 group-hover:border-indigo-200 transition-all">
                             <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-all" />
                             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest group-hover:text-indigo-600">Chọn tệp tin (Ảnh/PDF)</span>
                           </div>
                         </div>
                       </div>
                     </div>
                     <button type="submit" disabled={uploadingMaterial} className="w-full bg-slate-800 text-white py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 disabled:opacity-50">
                       {uploadingMaterial ? 'ĐANG TẢI LÊN...' : 'LƯU PHIÊN BẢN HỒ SƠ'}
                     </button>
                   </form>
                 </div>

                 <div className="space-y-4">
                    {materials.map((m, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-start gap-4">
                        <div className="shrink-0 w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-black text-[10px]">
                          V{m.version}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                             <h4 className="font-black text-slate-800 text-sm uppercase">{m.material_name}</h4>
                             <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">• {new Date(Number(m.created_at) * 1000).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-bold">REF: {m.drawing_ref || 'N/A'}</p>
                          <p className="text-xs text-slate-600 italic mt-2">{m.specification}</p>
                          {m.file_url && (
                            <a href={m.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 transition-all">
                              <FileText className="w-3 h-3" />
                              Xem tài liệu / Ảnh
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                 </div>
               </motion.div>
            )}

            {activeTab === 'samples' && (
               <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
               >
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                   <div className="flex items-center justify-between">
                     <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">{editingSample ? 'Chỉnh sửa hồ sơ mẫu' : 'Cập nhật hồ sơ mẫu'}</h3>
                     <div className="flex items-center gap-2">
                       {editingSample && (
                         <button onClick={() => setEditingSample(null)} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest px-2 py-1 bg-slate-100 rounded-lg">Hủy</button>
                       )}
                       <Info className="w-5 h-5 text-amber-500" />
                     </div>
                   </div>
                   <form key={editingSample?.id || 'new'} className="space-y-4" onSubmit={async (e) => {
                     e.preventDefault();
                     const form = e.currentTarget;
                     const formData = new FormData(form);
                     const sample_name = formData.get('sample_name') as string;
                     const status = formData.get('status') as string;
                     const file = (form.querySelector('input[type="file"]') as HTMLInputElement)?.files?.[0];
                     
                     if (!sample_name) return;
                     
                     let file_url = editingSample?.file_url || "";
                     if (file) {
                       setUploadingSample(true);
                       try {
                         file_url = await uploadFileToStorage(file, `sample_${item.ma_nha_may}_${Date.now()}_${file.name}`);
                       } catch (err) {
                         console.error("Upload failed:", err);
                       } finally {
                         setUploadingSample(false);
                       }
                     }
                     
                     if (editingSample) {
                       await updateIpoSampleRecord(editingSample.id, {
                         sample_name,
                         status,
                         file_url
                       });
                       setEditingSample(null);
                     } else {
                       const ma_ct = formData.get('ma_ct') as string;
                       const ten_ct = formData.get('ten_ct') as string;
                       await saveIpoSampleRecord({
                         id_factory_order: item.ma_nha_may,
                         sample_name,
                         status,
                         file_url,
                         data: { ma_ct, ten_ct },
                         version: samples.length > 0 ? (samples.length + 1).toFixed(1) : "1.0"
                       });
                     }
                     
                     loadData();
                     form.reset();
                   }}>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <input name="sample_name" defaultValue={editingSample?.sample_name} placeholder="Tên mẫu vật liệu" className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-50" required />
                       <select name="status" defaultValue={editingSample?.status || 'DRAFT'} className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-50">
                         <option value="DRAFT">DRAFT</option>
                         <option value="SUBMITTED">SUBMITTED</option>
                         <option value="APPROVED">APPROVED</option>
                         <option value="REJECTED">REJECTED</option>
                       </select>

                       <div className="flex flex-col gap-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Mã công trình (Auto-filled)</label>
                         <input name="ma_ct" defaultValue={projectData?.ma_ct || item.ma_ct} placeholder="Mã công trình" disabled={!!editingSample} className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-50" />
                       </div>
                       <div className="flex flex-col gap-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tên công trình (Auto-filled)</label>
                         <input name="ten_ct" defaultValue={projectData?.ten_ct || item.ten_ct} placeholder="Tên công trình" disabled={!!editingSample} className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-50" />
                       </div>

                       <div className="md:col-span-2">
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Ảnh mẫu thực tế {editingSample?.file_url ? '(Đã có ảnh)' : ''}</label>
                         <div className="relative group">
                           <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="image/*" />
                           <div className="bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl px-5 py-4 flex items-center justify-center gap-3 group-hover:border-amber-200 transition-all">
                             <Upload className="w-5 h-5 text-slate-400 group-hover:text-amber-500 transition-all" />
                             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest group-hover:text-amber-600">Chọn ảnh mẫu tải lên</span>
                           </div>
                         </div>
                       </div>
                     </div>
                     <button type="submit" disabled={uploadingSample} className="w-full bg-amber-600 text-white py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 disabled:opacity-50">
                       {uploadingSample ? 'ĐANG TẢI LÊN...' : (editingSample ? 'LƯU THAY ĐỔI' : 'CẬP NHẬT TRẠNG THÁI MẪU')}
                     </button>
                   </form>
                 </div>

                 <div className="space-y-4">
                    {samples.map((s, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-start gap-4">
                        <div className="shrink-0 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-black text-[10px]">
                          V{s.version}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                               <h4 className="font-black text-slate-800 text-sm uppercase">{s.sample_name}</h4>
                               <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">• {new Date(Number(s.created_at) * 1000).toLocaleDateString()}</span>
                             </div>
                             <div className="flex items-center gap-1">
                               <button type="button" onClick={() => setEditingSample(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit className="w-4 h-4"/></button>
                               <button type="button" onClick={async () => {
                                 if(window.confirm('Bạn có chắc chắn muốn xóa mẫu này?')) {
                                   await deleteIpoSampleRecord(s.id);
                                   loadData();
                                 }
                               }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                             </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                              s.status === 'APPROVED' ? 'bg-green-100 text-green-600' : 
                              s.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {s.status}
                            </span>
                          </div>
                          {s.file_url && (
                             <a href={s.file_url} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">
                               Xem hình ảnh mẫu
                             </a>
                          )}
                        </div>
                      </div>
                    ))}
                 </div>
               </motion.div>
            )}

            {activeTab === 'ai' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                {aiResult ? (
                  <div className="space-y-6">
                    {/* Header Summary */}
                    <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 p-8 rounded-[3rem] text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <BrainCircuit className="w-40 h-40" />
                      </div>
                      <div className="relative z-10 space-y-4">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-indigo-300" />
                          <h3 className="font-black text-[13px] uppercase tracking-[0.2em] text-indigo-200">ISO Intelligence Compliance</h3>
                        </div>
                        <p className="text-2xl font-black leading-tight">
                          {aiResult.Field_ISO_Compliance_Status}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {/* Revision Notes */}
                       <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                         <div className="flex items-center gap-3 mb-2">
                           <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                             <FileDiff className="w-5 h-5" />
                           </div>
                           <h4 className="font-black text-[11px] text-slate-800 uppercase tracking-widest">Phân tích Revision mới</h4>
                         </div>
                         <p className="text-sm text-slate-600 font-medium leading-relaxed italic border-l-4 border-indigo-100 pl-4 py-1">
                           {aiResult.Field_Drawing_Revision_Notes}
                         </p>
                       </div>

                       {/* Material Verification */}
                       <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                         <div className="flex items-center gap-3 mb-2">
                           <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                             <Package className="w-5 h-5" />
                           </div>
                           <h4 className="font-black text-[11px] text-slate-800 uppercase tracking-widest">Kiểm soát vật liệu</h4>
                         </div>
                         <p className="text-sm text-slate-600 font-medium leading-relaxed">
                           {aiResult.Field_Material_Verification}
                         </p>
                       </div>

                       {/* History Summary */}
                       <div className="col-span-full bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                         <div className="flex items-center gap-3 mb-2">
                           <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600">
                             <History className="w-5 h-5" />
                           </div>
                           <h4 className="font-black text-[11px] text-slate-800 uppercase tracking-widest">Tóm tắt lộ trình thay đổi</h4>
                         </div>
                         <p className="text-sm text-slate-700 font-bold leading-relaxed bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                           {aiResult.Field_Group_History_Summary}
                         </p>
                       </div>

                       {/* Risk Correlation */}
                       <div className="col-span-full p-8 bg-red-50/50 rounded-[3rem] border border-red-100 space-y-4">
                         <div className="flex items-center gap-3 mb-2 text-red-700">
                           <AlertTriangle className="w-6 h-6" />
                           <h4 className="font-black text-[11px] uppercase tracking-widest">Đối chiếu rủi ro chất lượng (Quality Correlation)</h4>
                         </div>
                         <div className="p-6 bg-white rounded-3xl border border-red-100 shadow-sm">
                           <p className="text-sm text-slate-700 leading-relaxed font-medium">
                             {aiResult.Field_Quality_Correlation}
                           </p>
                         </div>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] mx-auto flex items-center justify-center relative">
                       <BrainCircuit className="w-12 h-12 text-indigo-400" />
                       <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-4 border-white rounded-full animate-pulse"></div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Chưa có phân tích từ Prompt AI Studio</p>
                      <p className="text-xs text-slate-300 max-w-xs mx-auto">Vui lòng nhấn nút phân tích AI trên thanh tiêu chuẩn để bắt đầu quá trình kiểm soát Revision.</p>
                    </div>
                    <button 
                      onClick={handleAIAnalysis}
                      className="inline-flex items-center gap-2 bg-white border border-indigo-200 px-6 py-3 rounded-2xl text-[11px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-sm"
                    >
                      Bắt đầu phân tích ngay
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          
        </div>
      </div>
    </div>
  );
};
