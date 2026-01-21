
import React, { useState, useRef } from 'react';
import { X, Upload, FileText, ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadFileToStorage } from '../services/apiService';
import { FloorPlan } from '../types';

interface FloorPlanUploadModalProps {
    projectId: string;
    onClose: () => void;
    onSave: (plan: FloorPlan) => Promise<void>;
}

export const FloorPlanUploadModal: React.FC<FloorPlanUploadModalProps> = ({ projectId, onClose, onSave }) => {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [version, setVersion] = useState('1.0');
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setError(null);
        setFile(selectedFile);
        setName(selectedFile.name.replace(/\.[^/.]+$/, ""));

        if (selectedFile.type === 'application/pdf') {
            await renderPdfToImage(selectedFile);
        } else if (selectedFile.type.startsWith('image/')) {
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);
        } else {
            setError("Định dạng file không được hỗ trợ. Vui lòng chọn PDF hoặc Hình ảnh.");
            setFile(null);
        }
    };

    const renderPdfToImage = async (pdfFile: File) => {
        try {
            const pdfjsLib = (window as any).pdfjsLib;
            if (!pdfjsLib) throw new Error("Thư viện xử lý PDF chưa được tải.");

            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            setPreviewUrl(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err: any) {
            setError("Lỗi xử lý file PDF: " + err.message);
        }
    };

    const handleUpload = async () => {
        if (!file || !name || !previewUrl) return;

        setIsUploading(true);
        try {
            // ISO-Compliant: Upload to storage and get URL
            const storageUrl = await uploadFileToStorage(previewUrl, file.name);

            const newPlan: FloorPlan = {
                id: `fp_${Date.now()}`,
                project_id: projectId,
                name: name.toUpperCase(),
                image_url: storageUrl,
                version: version,
                status: 'ACTIVE',
                updated_at: Math.floor(Date.now() / 1000),
                file_name: file.name
            };

            await onSave(newPlan);
            onClose();
        } catch (err: any) {
            setError("Lỗi khi tải lên hệ thống: " + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg">
                            <Upload className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 uppercase text-sm tracking-tight">Upload Floor Plan Layout</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hỗ trợ PDF, DWG (Raster), High-res Images</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 transition-all"><X className="w-6 h-6"/></button>
                </div>

                <div className="p-8 space-y-6 overflow-y-auto no-scrollbar bg-slate-50/30">
                    {!file ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-[16/10] border-4 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center text-slate-300 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer group"
                        >
                            <Upload className="w-12 h-12 mb-4 group-hover:scale-110 transition-transform" />
                            <p className="font-black uppercase tracking-widest text-xs">Kéo thả hoặc click để chọn file</p>
                            <p className="text-[9px] font-bold mt-2">Bản vẽ kỹ thuật (.pdf, .png, .jpg)</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,image/*" className="hidden" />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="aspect-[16/10] bg-white rounded-3xl border border-slate-200 overflow-hidden relative shadow-inner group">
                                {previewUrl ? (
                                    <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <Loader2 className="w-8 h-8 animate-spin" />
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 flex gap-2">
                                    <button onClick={() => { setFile(null); setPreviewUrl(null); }} className="bg-white/90 backdrop-blur-md p-2 rounded-xl text-red-500 shadow-sm hover:bg-red-500 hover:text-white transition-all"><X className="w-4 h-4"/></button>
                                </div>
                                <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                    {file.type === 'application/pdf' ? <FileText className="w-3 h-3 text-red-400" /> : <ImageIcon className="w-3 h-3 text-blue-400" />}
                                    {file.name}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên Level / Layout Name *</label>
                                    <input 
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 uppercase"
                                        placeholder="VD: MẶT BẰNG TẦNG 5 - KHU A"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Version Control</label>
                                    <input 
                                        value={version}
                                        onChange={e => setVersion(e.target.value)}
                                        className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100"
                                        placeholder="v1.0"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-shake">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                            <p className="text-xs text-red-700 font-bold uppercase leading-tight">{error}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 md:p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="order-2 md:order-1 px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                    <button 
                        onClick={handleUpload} 
                        disabled={!file || !name || isUploading}
                        className="order-1 md:order-2 px-12 py-4 bg-blue-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        TẢI LÊN HỆ THỐNG
                    </button>
                </div>
            </div>
        </div>
    );
};
