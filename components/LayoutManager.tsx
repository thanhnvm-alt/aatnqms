
import React, { useState, useRef, useEffect } from 'react';
import { FloorPlan, LayoutPin, InspectionStatus } from '../types';
import { 
    Search, Plus, ZoomIn, ZoomOut, Maximize, 
    Layers, AlertCircle, CheckCircle2, MoreVertical,
    X, ArrowLeft, Download, ShieldCheck, MapPin, 
    ChevronRight, Loader2, Info
} from 'lucide-react';

interface LayoutManagerProps {
    floorPlan: FloorPlan;
    pins: LayoutPin[];
    onBack: () => void;
    onAddPin: (x: number, y: number) => void;
    onSelectPin: (pin: LayoutPin) => void;
}

export const LayoutManager: React.FC<LayoutManagerProps> = ({ 
    floorPlan, pins, onBack, onAddPin, onSelectPin 
}) => {
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });
    const [activeLayers, setActiveLayers] = useState(['Architectural']);
    const [showLayerPanel, setShowLayerPanel] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const handleZoom = (delta: number) => {
        setScale(prev => Math.min(Math.max(1, prev + delta), 5));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        setIsDragging(true);
        setStartDrag({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setOffset({
            x: e.clientX - startDrag.x,
            y: e.clientY - startDrag.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleLayoutClick = (e: React.MouseEvent) => {
        if (isDragging || !imgRef.current) return;
        
        // Calculate relative coordinates for pin placement
        const rect = imgRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // If user is just clicking (not dragging), prompt to add pin
        if (Math.abs(e.clientX - (startDrag.x + offset.x)) < 5) {
            onAddPin(x, y);
        }
    };

    const getPinColor = (status: string) => {
        switch (status) {
            case InspectionStatus.APPROVED: return 'bg-green-500';
            case InspectionStatus.FLAGGED: return 'bg-red-500 animate-pulse';
            case InspectionStatus.PENDING: return 'bg-orange-500';
            default: return 'bg-blue-600';
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900 flex flex-col animate-in fade-in duration-300">
            {/* ProConstruct Styled Header */}
            <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <div>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">{floorPlan.name}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Version {floorPlan.version} • {floorPlan.file_name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button onClick={() => handleZoom(0.5)} className="p-2 hover:bg-white rounded-lg transition-all shadow-sm"><ZoomIn className="w-4 h-4" /></button>
                        <span className="px-3 text-[10px] font-black text-slate-500">{Math.round(scale * 100)}%</span>
                        <button onClick={() => handleZoom(-0.5)} className="p-2 hover:bg-white rounded-lg transition-all shadow-sm"><ZoomOut className="w-4 h-4" /></button>
                    </div>
                    <button onClick={() => setShowLayerPanel(!showLayerPanel)} className={`p-2.5 rounded-xl border transition-all ${showLayerPanel ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        <Layers className="w-5 h-5" />
                    </button>
                    <button className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95">
                        Export PDF
                    </button>
                </div>
            </header>

            <div className="flex-1 relative overflow-hidden flex">
                {/* Left Sidebar: Layers & Pins Summary */}
                <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 hidden lg:flex">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Layer Control</h3>
                        <div className="space-y-2">
                            {['Architectural', 'Electrical', 'Plumbing', 'HVAC System'].map(layer => (
                                <button 
                                    key={layer}
                                    onClick={() => setActiveLayers(prev => prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer])}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${activeLayers.includes(layer) ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold' : 'bg-white border-slate-100 text-slate-400'}`}
                                >
                                    <span className="text-xs uppercase">{layer}</span>
                                    {activeLayers.includes(layer) ? <ShieldCheck className="w-4 h-4" /> : <Layers className="w-4 h-4 opacity-20" />}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Inspection History</h3>
                        <div className="space-y-3">
                            {pins.filter(p => p.inspection_id).map(pin => (
                                <div key={pin.id} onClick={() => onSelectPin(pin)} className="p-4 rounded-2xl border border-slate-100 hover:border-blue-300 transition-all cursor-pointer group bg-slate-50/50 hover:bg-white shadow-sm">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`w-2 h-2 rounded-full ${getPinColor(pin.status)}`}></div>
                                        <span className="text-[11px] font-black text-slate-800 uppercase truncate">{pin.label || 'Site Check'}</span>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Coord: {pin.x.toFixed(1)}%, {pin.y.toFixed(1)}%</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Interactive Map Container */}
                <div 
                    ref={containerRef}
                    className="flex-1 cursor-grab active:cursor-grabbing bg-slate-100 flex items-center justify-center select-none overflow-hidden"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onClick={handleLayoutClick}
                >
                    <div 
                        className="relative shadow-2xl transition-transform duration-75 ease-out"
                        style={{ 
                            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                            transformOrigin: 'center'
                        }}
                    >
                        {/* Floor Plan Image */}
                        <img 
                            ref={imgRef}
                            src={floorPlan.image_url} 
                            alt="Floor Plan" 
                            className="max-w-[90vw] max-h-[80vh] object-contain bg-white border-4 border-white pointer-events-none"
                        />

                        {/* Layout Pins Overlay */}
                        {pins.map(pin => (
                            <button
                                key={pin.id}
                                onClick={(e) => { e.stopPropagation(); onSelectPin(pin); }}
                                className={`absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full text-white shadow-xl border-4 border-white transition-all hover:scale-125 z-20 ${getPinColor(pin.status)}`}
                                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                            >
                                <MapPin className="w-4 h-4" />
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded opacity-0 group-hover:opacity-100 transition-opacity uppercase whitespace-nowrap">
                                    {pin.label}
                                </div>
                            </button>
                        ))}
                        
                        {/* Grid Pattern Overlay (Visual only) */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>
                    </div>

                    {/* Floating Controls Overlay */}
                    <div className="absolute bottom-8 right-8 flex flex-col gap-2">
                        <button onClick={() => onAddPin(50, 50)} className="w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-blue-700 transition-all active:scale-95 group">
                            <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Mobile Info Overlay (Optional) */}
            <div className="lg:hidden p-4 bg-white border-t border-slate-200">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span className="text-[10px] font-black text-slate-500 uppercase">Touch anywhere to place inspection pin</span>
                    </div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">PRO MODE</span>
                </div>
            </div>
        </div>
    );
};
