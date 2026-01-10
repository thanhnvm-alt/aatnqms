
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, MaterialIQC, NCRComment } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  CheckCircle, LayoutList, PenTool, ChevronDown, ChevronUp, Calculator,
  TrendingUp, Layers, MessageSquare, Loader2, Eraser, Info,
  ClipboardList
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string, productionInfo?: any) => Promise<void>;
  onPostComment?: (id: string, comment: NCRComment) => Promise<void>;
}

const SignaturePad = ({ label, value, onChange, readOnly = false }: { label: string; value?: string; onChange: (base64: string) => void; readOnly?: boolean; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => { ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); };
            img.src = value;
        }
    }, [value]);
    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center px-1">
                <label className="block text-slate-700 font-black uppercase text-[10px] tracking-widest">{label}</label>
            </div>
            <div className="border border-slate-300 rounded-[2rem] bg-white overflow-hidden relative h-40 shadow-inner">
                <canvas ref={canvasRef} width={400} height={160} className="w-full h-full cursor-default" />
                {!value && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Chưa ký</div>}
            </div>
        </div>
    );
};

export const InspectionDetailIQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [managerSignature, setManagerSignature] = useState('');
  const [pmSignature, setPmSignature] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.APPROVED || inspection.status === InspectionStatus.COMPLETED;

  const handleApprove = async () => {
      if (!managerSignature) { alert("Bắt buộc QA Manager phê duyệt."); return; }
      if (!onApprove) return;
      setIsApproving(true);
      try {
          await onApprove(inspection.id, managerSignature, { pmSignature });
          onBack();
      } catch (e) { alert("Lỗi phê duyệt."); } finally { setIsApproving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }}>
      <div className="bg-white border-b border-slate-200 p-5 sticky top-0 z-30 shadow-sm flex justify-between items-center">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors border border-slate-100 shadow-sm"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
              <div><h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">IQC REVIEW</h2><div className="flex items-center gap-2 mt-1"><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${isApproved ? 'bg-green-600 text-white' : 'bg-orange-500 text-white'}`}>{inspection.status}</span></div></div>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"><Edit3 className="w-5 h-5" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-all"><Trash2 className="w-5 h-5" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 no-scrollbar bg-slate-50/50 pb-32">
        {/* PO Header */}
        <div className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Purchase Order Management</p><h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">MÃ PO: {inspection.po_number || 'N/A'}</h1><div className="flex items-center gap-3 mt-4 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 w-fit"><Building2 className="w-4 h-4 text-blue-500" /><span className="text-xs font-black text-slate-700 uppercase">Supplier: {inspection.supplier}</span></div></div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Ngày kiểm lô</p><p className="text-sm font-bold text-slate-800">{inspection.date}</p></div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">QC Thực hiện</p><p className="text-sm font-bold text-slate-800 uppercase">{inspection.inspectorName}</p></div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-50"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2">Tài liệu tham chiếu:</span>{(inspection.referenceDocs || []).map(doc => (<span key={doc} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase border border-blue-100">{doc}</span>))}</div>
        </div>

        {/* Materials List */}
        <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] px-4 flex items-center gap-3"><ClipboardList className="w-5 h-5 text-blue-500" /> Chi tiết vật tư thẩm định</h3>
            {(inspection.materials || []).map((mat, idx) => {
                const isExp = expandedMaterial === mat.id;
                const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                return (
                    <div key={mat.id} className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                        <div onClick={() => setExpandedMaterial(isExp ? null : mat.id)} className={`p-6 flex items-center justify-between cursor-pointer ${isExp ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-lg">{idx + 1}</div>
                                <div><h4 className="font-black text-slate-800 text-lg uppercase tracking-tighter leading-none">{mat.name}</h4><div className="flex items-center gap-4 mt-1.5"><span className="text-[10px] font-bold text-slate-400 uppercase">Giao: {mat.deliveryQty} {mat.unit}</span><span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-[9px] font-black uppercase border border-green-100">{passRate}% ĐẠT</span></div></div>
                            </div>
                            {isExp ? <ChevronUp className="w-6 h-6 text-blue-500"/> : <ChevronDown className="w-6 h-6 text-slate-300"/>}
                        </div>
                        {isExp && (
                            <div className="p-8 space-y-8 animate-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 space-y-4 shadow-inner">
                                        <div className="flex items-center gap-2 mb-2"><Calculator className="w-4 h-4 text-blue-500" /><h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chỉ số kiểm tra ({mat.type})</h5></div>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                            <div><p className="text-[8px] font-black text-blue-400 uppercase">Kiểm (K)</p><p className="text-xl font-black text-blue-700">{mat.inspectQty}</p></div>
                                            <div><p className="text-[8px] font-black text-green-400 uppercase">Đạt (Đ)</p><p className="text-xl font-black text-green-700">{mat.passQty}</p></div>
                                            <div><p className="text-[8px] font-black text-red-400 uppercase">Lỗi (L)</p><p className="text-xl font-black text-red-700">{mat.failQty}</p></div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500"/><h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phạm vi & Ảnh chụp</h5></div>
                                        <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100"><Layers className="w-3.5 h-3.5 text-indigo-400"/><span className="text-[10px] font-black text-indigo-700 uppercase">{mat.scope === 'PROJECT' ? `Mã Công Trình: ${mat.projectCode}` : 'VẬT TƯ DÙNG CHUNG'}</span></div>
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar">{mat.images?.map((img, iIdx) => (<img key={iIdx} src={img} onClick={() => setLightboxState({ images: mat.images, index: iIdx })} className="w-16 h-16 rounded-xl border border-slate-200 cursor-zoom-in object-cover" />))}</div>
                                    </div>
                                </div>
                                <div className="space-y-3"><div className="flex items-center gap-2 mb-2"><LayoutList className="w-4 h-4 text-slate-400"/><h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chi tiết hạng mục checklist</h5></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{mat.items?.map(item => (<div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4"><div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.status === CheckStatus.PASS ? 'bg-green-500' : 'bg-red-500'}`}></div><div className="flex-1 overflow-hidden"><p className="text-[11px] font-black text-slate-800 uppercase leading-tight line-clamp-1">{item.label}</p><p className="text-[10px] text-slate-500 mt-1 italic leading-relaxed">{item.notes || '---'}</p></div><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${item.status === CheckStatus.PASS ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>{item.status}</span></div>))}</div></div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* IQC Approvals */}
        <section className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-10">
            <h3 className="text-blue-700 border-b border-blue-50 pb-5 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-green-500"/> PHÊ DUYỆT CHẤT LƯỢNG LÔ HÀNG (ISO)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-500 pl-3">QC Kiểm Tra</p>
                    {inspection.signature ? <div className="bg-slate-50 p-4 rounded-3xl h-40 flex items-center justify-center"><img src={inspection.signature} className="h-full object-contain" /></div> : <div className="h-40 flex items-center justify-center bg-slate-50 rounded-[2rem] border border-dashed text-[10px] text-slate-300 font-bold uppercase tracking-widest">N/A</div>}
                    <div className="text-center font-black uppercase text-sm text-slate-800">{inspection.inspectorName}</div>
                </div>
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-emerald-500 pl-3">QA Manager Approval</p>
                    {isManager && !isApproved ? <SignaturePad label="Manager Sign" value={managerSignature} onChange={setManagerSignature} /> : <div className="bg-slate-50 p-4 rounded-3xl h-40 flex items-center justify-center">{inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <div className="text-[10px] text-orange-400 font-black uppercase">PENDING</div>}</div>}
                    <div className="text-center font-black uppercase text-sm text-slate-800">{inspection.managerName || 'QA Manager'}</div>
                </div>
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Project Manager (PM)</p>
                    {isManager && !isApproved ? <SignaturePad label="PM Sign (Optional)" value={pmSignature} onChange={setPmSignature} /> : <div className="bg-slate-50 p-4 rounded-3xl h-40 flex items-center justify-center">{inspection.pmSignature ? <img src={inspection.pmSignature} className="h-full object-contain" /> : <div className="text-[10px] text-slate-300 font-black uppercase">NO SIGN</div>}</div>}
                    <div className="text-center font-black uppercase text-sm text-slate-800">Dự án xác nhận</div>
                </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mt-6"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">PM Comment / Nhận xét hướng xử lý:</p><p className="text-sm font-bold text-slate-700 italic">"{inspection.pmComment || 'Chưa ghi nhận phản hồi từ bộ phận Dự án.'}"</p></div>
        </section>
      </div>

      {isManager && !isApproved && (
          <div className="fixed bottom-0 left-0 right-0 p-6 md:p-8 border-t border-slate-200 bg-white/90 backdrop-blur-xl flex justify-end gap-5 z-40 shadow-[0_-15px_40px_rgba(0,0,0,0.1)]">
              <button onClick={onBack} className="px-8 py-4 text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 rounded-2xl transition-all">Quay lại</button>
              <button onClick={handleApprove} disabled={isApproving || !managerSignature} className="px-16 py-4 bg-blue-700 text-white font-black uppercase text-xs tracking-[0.3em] rounded-2xl shadow-2xl hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">{isApproving ? <Loader2 className="w-5 h-5 animate-spin"/> : <CheckCircle className="w-5 h-5"/>}<span>DUYỆT & NHẬP KHO</span></button>
          </div>
      )}
      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
