
import React, { useState } from 'react';
import { Defect, User } from '../types';
import { 
    ArrowLeft, Calendar, User as UserIcon, Tag, 
    AlertTriangle, ShieldCheck, Hammer, Box, 
    FileText, CheckCircle2, Clock, Camera, 
    Maximize2, ExternalLink, MapPin, Hash,
    BrainCircuit, ClipboardList
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

interface DefectDetailProps {
  defect: Defect;
  user: User;
  onBack: () => void;
  onViewInspection: (id: string) => void;
}

export const DefectDetail: React.FC<DefectDetailProps> = ({ defect, user, onBack, onViewInspection }) => {
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header Toolbar */}
      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-40 shadow-sm shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-600 font-bold text-sm px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95">
            <ArrowLeft className="w-5 h-5"/> Quay lại
        </button>
        <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${defect.status === 'CLOSED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{defect.status}</span>
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            <button onClick={() => onViewInspection(defect.inspectionId)} className="bg-blue-600 text-white px-4 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95">
                <FileText className="w-4 h-4" /> Phiếu QC Gốc
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Title Block */}
            <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <Hammer className="w-48 h-48" />
                </div>
                <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-20 h-20 bg-orange-600 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-orange-200 shrink-0">
                        <AlertTriangle className="w-10 h-10" />
                    </div>
                    <div className="flex-1 overflow-hidden space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-lg uppercase tracking-widest">DEFECT CODE: {defect.defectCode}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ${defect.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>{defect.severity}</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight uppercase tracking-tighter">{defect.description}</h1>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-blue-500" /> {defect.date}</div>
                            <div className="flex items-center gap-1.5"><UserIcon className="w-4 h-4 text-indigo-500" /> {defect.inspectorName}</div>
                            <div className="flex items-center gap-1.5"><Hash className="w-4 h-4 text-purple-500" /> {defect.ma_ct}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Visual Evidence */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                        <Camera className="w-5 h-5 text-blue-600" />
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Bằng chứng hình ảnh</h3>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                        {defect.images && defect.images.length > 0 ? (
                            defect.images.map((img, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => setLightboxState({ images: defect.images, index: idx })}
                                    className="aspect-square rounded-2xl overflow-hidden border border-slate-100 relative group cursor-zoom-in"
                                >
                                    <img src={img} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Maximize2 className="text-white w-6 h-6" />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                <Camera className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                <p className="text-[10px] font-black text-slate-400 uppercase">Chưa có hình ảnh</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Analysis & Root Cause */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                        <BrainCircuit className="w-5 h-5 text-purple-600" />
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Phân tích kỹ thuật</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Nguyên nhân gốc rễ
                            </label>
                            <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
                                "{defect.rootCause || 'Đang cập nhật phân tích nguyên nhân...'}"
                            </p>
                        </div>
                        <div className="h-px bg-slate-100"></div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> Biện pháp khắc phục
                            </label>
                            <p className="text-sm font-bold text-slate-800 leading-relaxed">
                                {defect.solution || 'Chưa ghi nhận biện pháp xử lý.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Resolution Tracking */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                    <Clock className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Theo dõi xử lý lỗi</h3>
                </div>
                <div className="p-8">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                <UserIcon className="w-6 h-6 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhân sự phụ trách</p>
                                <p className="text-sm font-black text-slate-800 uppercase">{defect.responsiblePerson || 'Chưa phân công'}</p>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-slate-100 hidden md:block"></div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                <Calendar className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thời hạn (Deadline)</p>
                                <p className="text-sm font-black text-red-600 font-mono">{defect.deadline || 'ASAP'}</p>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-slate-100 hidden md:block"></div>
                        <div className="flex items-center gap-3">
                            {defect.status === 'CLOSED' ? (
                                <div className="px-6 py-2.5 bg-green-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2 shadow-lg shadow-green-100">
                                    <CheckCircle2 className="w-4 h-4" /> ĐÃ XỬ LÝ XONG
                                </div>
                            ) : (
                                <div className="px-6 py-2.5 bg-orange-100 text-orange-700 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2 border border-orange-200">
                                    <Clock className="w-4 h-4" /> ĐANG TRONG TIẾN TRÌNH
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="py-10 text-center">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Hồ sơ kỹ thuật mã số {defect.id}</p>
            </div>

        </div>
      </div>

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              readOnly={true} 
          />
      )}
    </div>
  );
};
