
import React, { useState, useRef, useEffect } from 'react';
import { Eraser, FileSignature, Clock } from 'lucide-react';

import { formatDateTime } from '../lib/utils';

interface SignaturePadProps {
    label: string;
    value?: string;
    onChange: (value: string) => void;
    readOnly?: boolean;
    uploadContext?: {
        entityId: string;
        type: string;
        role: string;
    };
    isTemplateEditor?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ 
    label, 
    value, 
    onChange, 
    readOnly = false,
    uploadContext,
    isTemplateEditor = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);
    const [isChangeRequested, setIsChangeRequested] = useState(false);
    const autoPopulatedRef = useRef(false);

    const getUser = () => {
        try {
            const userStr = localStorage.getItem('aatn_auth_storage') || 
                            sessionStorage.getItem('aatn_auth_storage') || 
                            localStorage.getItem('aatn_qms_user');
            if (userStr) return JSON.parse(userStr);
        } catch (e) {
            return null;
        }
        return null;
    };
    const user = getUser();
    
    // Check if value is a data URL (manual signature) or a template URL
    const isTemplate = value && !value.startsWith('data:');
    const savedSignature = user?.signature_template || user?.signatureTemplate;
    const isEditor = isTemplateEditor || 
        label.toLowerCase().includes('vẽ chữ ký mẫu') || 
        label.toLowerCase().includes('vẽ mẫu chữ ký') || 
        label.toLowerCase().includes('chữ ký mẫu') || 
        label.toLowerCase().includes('template');
    
    const isLocked = !readOnly && value && !isChangeRequested && (
        (!isEditor && savedSignature && value === savedSignature) ||
        isEditor
    );

    useEffect(() => {
        if (!readOnly && !value && savedSignature && !isEditor && !autoPopulatedRef.current) {
            autoPopulatedRef.current = true;
            onChange(savedSignature);
        }
    }, [readOnly, value, savedSignature, isEditor, onChange]);

    useEffect(() => {
        if (value && (value === savedSignature || (isEditor && !value.startsWith('data:')))) {
            setIsChangeRequested(false);
        }
    }, [value, savedSignature, isEditor]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = "anonymous"; 
            img.onload = () => {
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            if (value.startsWith('http')) {
                img.src = `/api/proxy-image?url=${encodeURIComponent(value)}`;
            } else {
                img.src = value;
            }
            setIsEmpty(false);
        } else if (canvas && !value) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            setIsEmpty(true);
        }
    }, [value]);

    const startDrawing = (e: any) => {
        if (readOnly || isLocked) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        setIsDrawing(true);
        setIsEmpty(false);
    };

    const draw = (e: any) => {
        if (!isDrawing || readOnly || isLocked) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = async () => {
        if (readOnly || isLocked) return;
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            const base64 = canvas.toDataURL('image/png');
            onChange(base64); 
        }
    };

    const clearSignature = () => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            onChange('');
        }
        setIsChangeRequested(true);
        setIsEmpty(true);
    };

    const handleUseTemplate = () => {
        if (savedSignature) {
            onChange(savedSignature);
        } else if (user?.name) {
            // Generate a digital signature stamp if no template is saved
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Add a subtle stamp border
                    ctx.strokeStyle = '#2563EB'; // brand color
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 3]);
                    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
                    ctx.setLineDash([]);
                    
                    // Draw name in a nice script font
                    ctx.fillStyle = '#1E40AF'; // deep blue
                    ctx.font = 'italic bold 48px "Dancing Script", cursive, "Times New Roman"';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(user.name, canvas.width / 2, canvas.height / 2 - 10);
                    
                    // Add timestamp and "ELECTRONIC SIGNATURE" text
                    ctx.font = 'bold 12px "Inter", sans-serif';
                    ctx.fillStyle = '#64748B';
                    const timestamp = formatDateTime(Math.floor(Date.now() / 1000));
                    ctx.fillText(`CHỮ KÝ ĐIỆN TỬ - ${timestamp}`, canvas.width / 2, canvas.height / 2 + 35);
                    ctx.fillText(`VERIFIED BY AATN QMS`, canvas.width / 2, canvas.height / 2 + 55);

                    const base64 = canvas.toDataURL('image/png');
                    onChange(base64);
                    setIsEmpty(false);
                }
            }
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 mb-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                    {label}
                </label>
                <div className="flex items-center gap-3">
                    {isLocked ? (
                        <button 
                            onClick={clearSignature} 
                            className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1.5 hover:text-amber-700 active:scale-95 transition-all px-2 py-1 bg-amber-50 dark:bg-amber-950/10 rounded-md border border-amber-100 dark:border-amber-900/20" 
                            type="button"
                        >
                            <FileSignature className="w-3.5 h-3.5" /> Thay đổi chữ ký
                        </button>
                    ) : (
                        <>
                            {!readOnly && (
                                <button 
                                    onClick={handleUseTemplate} 
                                    className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1.5 hover:text-indigo-700 active:scale-95 transition-all px-2 py-1 bg-indigo-50 dark:bg-indigo-900/10 rounded-md border border-indigo-100 dark:border-indigo-900/20" 
                                    type="button"
                                >
                                    <FileSignature className="w-3.5 h-3.5" /> {savedSignature ? 'Dùng mẫu' : 'Ký điện tử'}
                                </button>
                            )}
                            {!readOnly && (
                                <button 
                                    onClick={clearSignature} 
                                    className="text-[10px] font-black text-red-600 hover:text-red-700 uppercase flex items-center gap-1.5 active:scale-95 transition-all px-2 py-1 bg-red-50 dark:bg-red-900/10 rounded-md border border-red-100 dark:border-red-900/20" 
                                    type="button"
                                >
                                    <Eraser className="w-3.5 h-3.5" /> Xóa
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
            
            <div className="group relative">
                <div className={`border-2 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden relative h-32 md:h-36 shadow-inner transition-all ${
                    isLocked 
                        ? 'border-emerald-500/30 dark:border-emerald-400/20 bg-emerald-50/5' 
                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-800'
                }`}>
                    <canvas 
                        ref={canvasRef} 
                        width={600} 
                        height={200} 
                        className={`w-full h-full touch-none ${readOnly || isLocked ? 'cursor-default' : 'cursor-crosshair'}`} 
                        onMouseDown={startDrawing} 
                        onMouseMove={draw} 
                        onMouseUp={stopDrawing} 
                        onMouseLeave={stopDrawing} 
                        onTouchStart={startDrawing} 
                        onTouchMove={draw} 
                        onTouchEnd={stopDrawing} 
                    />
                    {isLocked && (
                        <div className="absolute inset-0 bg-slate-500/5 dark:bg-slate-950/10 backdrop-blur-[0.5px] flex items-center justify-center pointer-events-none">
                            <div className="bg-white/95 dark:bg-slate-900/95 shadow-sm border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                                    {isEditor ? 'Mẫu chữ ký hiện tại (Đã khóa)' : 'Đã áp dụng chữ ký mẫu (Đã khóa)'}
                                </span>
                            </div>
                        </div>
                    )}
                    {isEmpty && !isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-slate-300 dark:text-slate-700 text-[11px] font-black uppercase tracking-[0.3em] select-none opacity-50">
                                Ký tên tại đây
                            </span>
                        </div>
                    )}
                </div>

                {!isEmpty && (
                    <div className="mt-2.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/10 rounded-lg inline-flex items-center gap-2 border border-slate-100 dark:border-slate-800/20">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 italic">
                            {isLocked 
                                ? (isEditor ? 'Mẫu chữ ký đang được bảo vệ chống vẽ nhầm' : 'Chữ ký được tải tự động từ mẫu của bạn') 
                                : `Đã ký lúc: ${formatDateTime(Math.floor(Date.now() / 1000))}`}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
