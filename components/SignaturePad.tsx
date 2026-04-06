
import React, { useState, useRef, useEffect } from 'react';
import { Eraser } from 'lucide-react';

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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = "anonymous"; // Handle potential CORS for remote URLs
            img.onload = () => {
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = value;
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
            
            // Upload to server instead of returning base64
            try {
                const blob = await (await fetch(base64)).blob();
                const formData = new FormData();
                formData.append('image', blob, `signature_${Date.now()}.png`);
                
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                console.log("Upload response status:", response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log("Upload response data:", data);
                    onChange(data.url); // Return the URL from storage
                } else {
                    const errorText = await response.text();
                    console.error("Signature upload failed. Status:", response.status, "Error:", errorText);
                    onChange(base64); // Fallback to base64 if upload fails (though not ideal)
                }
            } catch (err) {
                console.error("Error uploading signature (catch block):", err);
                onChange(base64);
            }
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

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center px-1">
                <label className="text-slate-600 font-bold text-[9px] uppercase tracking-widest">{label}</label>
                {!readOnly && (
                    <button 
                        onClick={clearSignature} 
                        className="text-[9px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" 
                        type="button"
                    >
                        <Eraser className="w-3 h-3" /> Xóa
                    </button>
                )}
            </div>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-28 shadow-sm">
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
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-bold uppercase tracking-widest">
                        Ký tại đây
                    </div>
                )}
            </div>
        </div>
    );
};
