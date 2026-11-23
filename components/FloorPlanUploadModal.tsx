import { getProxyImageUrl } from '../src/utils';

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
                version: Number(version) || 1,
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
        <div className="fixed inset-0 z-[240] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
                <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm shrink-0">
                            <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase text-sm tracking-tight truncate">Upload Floor Plan Layout</h3>
                            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5 truncate">Hỗ trợ PDF, DWG (Raster), High-res Images</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Đóng cửa sổ" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 cursor-pointer"><X className="w-5 h-5"/></button>
                </div>

                <div className="p-3.5 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto no-scrollbar bg-slate-50 dark:bg-slate-800/30">
                    {!file ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-[16/10] border-4 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem] flex flex-col items-center justify-center text-slate-300 hover:border-blue-300 hover:text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/50 transition-all cursor-pointer group"
                        >
                            <Upload className="w-12 h-12 mb-4 group-hover:scale-110 transition-transform" />
                            <p className="font-black uppercase tracking-widest text-xs">Kéo thả hoặc click để chọn file</p>
                            <p className="text-[9px] font-bold mt-2">Bản vẽ kỹ thuật (.pdf, .png, .jpg)</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,image/*" className="hidden" />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="aspect-[16/10] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden relative shadow-inner group">
                                {previewUrl ? (
                                    <img src={getProxyImageUrl(previewUrl)} className="w-full h-full object-contain" alt="Preview" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                                        <Loader2 className="w-8 h-8 animate-spin" />
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 flex gap-2">
                                    <button type="button" onClick={() => { setFile(null); setPreviewUrl(null); }} aria-label="Gỡ file đã chọn" className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center bg-white dark:bg-slate-900/90 backdrop-blur-md rounded-xl text-red-500 dark:text-red-400 shadow-sm hover:bg-red-500 hover:text-white transition-all"><X className="w-4 h-4"/></button>
                                </div>
                                <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                    {file.type === 'application/pdf' ? <FileText className="w-3 h-3 text-red-400" /> : <ImageIcon className="w-3 h-3 text-blue-400" />}
                                    {file.name}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên Level / Layout Name *</label>
                                    <input 
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full px-5 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 uppercase"
                                        placeholder="VD: MẶT BẰNG TẦNG 5 - KHU A"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Version Control</label>
                                    <input 
                                        value={version}
                                        onChange={e => setVersion(e.target.value)}
                                        className="w-full px-5 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100"
                                        placeholder="v1.0"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-shake">
                            <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" />
                            <p className="text-xs text-red-700 font-bold uppercase leading-tight">{error}</p>
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-col md:flex-row justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="order-2 md:order-1 min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl hover:text-red-600 transition-colors whitespace-nowrap shrink-0">Hủy bỏ</button>
                    <button 
                        type="button"
                        onClick={handleUpload} 
                        disabled={!file || !name || isUploading}
                        className="order-1 md:order-2 min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        TẢI LÊN HỆ THỐNG
                    </button>
                </div>
            </div>
        </div>
    );
};
