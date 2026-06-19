
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
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ 
    label, 
    value, 
    onChange, 
    readOnly = false,
    uploadContext
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);
const getUser = () => {
        try {
            const userStr = localStorage.getItem('aatn_qms_user');
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
        if (readOnly) return;
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
        if (!isDrawing || readOnly) return;
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
        if (readOnly) return;
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
        setIsEmpty(true);
    };

    const handleUseTemplate = () => {
        if (savedSignature) {
            onChange(savedSignature);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="text-slate-500 dark:text-slate-400 font-bold text-[9px] uppercase tracking-widest">{label}</label>
                <div className="flex items-center gap-4">
                    {!readOnly && savedSignature && (
                        <button 
                            onClick={handleUseTemplate} 
                            className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1.5 hover:underline active:scale-95 transition-transform" 
                            type="button"
                        >
                            <FileSignature className="w-3.5 h-3.5" /> Dùng mẫu
                        </button>
                    )}
                    {!readOnly && (
                        <button 
                            onClick={clearSignature} 
                            className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase flex items-center gap-1.5 hover:underline active:scale-95 transition-transform" 
                            type="button"
                        >
                            <Eraser className="w-3.5 h-3.5" /> Xóa
                        </button>
                    )}
                </div>
            </div>
            
            <div className="group relative">
                <div className="border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-900/50 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden relative h-28 shadow-sm transition-all">
                    <canvas 
                        ref={canvasRef} 
                        width={400} 
                        height={112} 
                        className={`w-full h-full touch-none ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`} 
                        onMouseDown={startDrawing} 
                        onMouseMove={draw} 
                        onMouseUp={stopDrawing} 
                        onMouseLeave={stopDrawing} 
                        onTouchStart={startDrawing} 
                        onTouchMove={draw} 
                        onTouchEnd={stopDrawing} 
                    />
                    {isEmpty && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 dark:text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] select-none">
                            Ký tên tại đây
                        </div>
                    )}
                </div>

                {!isEmpty && (
                    <div className="mt-1.5 px-2 flex items-center gap-2 text-slate-400 dark:text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] font-medium italic">
                            Đã ký lúc: {formatDateTime(Math.floor(Date.now() / 1000))}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
