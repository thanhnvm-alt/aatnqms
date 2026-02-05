
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FloorPlan, LayoutPin, InspectionStatus, CheckStatus, Inspection, NCRComment, User } from '../types';
import { 
    Search, Plus, ZoomIn, ZoomOut, Maximize, 
    Layers, AlertCircle, CheckCircle2, MoreVertical,
    X, ArrowLeft, Download, ShieldCheck, MapPin, 
    ChevronRight, Loader2, Info, MousePointer2, Crosshair,
    History, MessageSquare, UserPlus, Send, ExternalLink,
    AlertOctagon, Camera, Clock, Check, 
    User as UserIcon,
    Image as ImageIcon,
    AlertTriangle,
    Filter,
    ListChecks,
    Move,
    ImagePlus,
    Maximize2,
    Flag
} from 'lucide-react';
import { fetchInspectionById, saveInspectionToSheet, fetchUsers, saveLayoutPin } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';

interface LayoutManagerProps {
    floorPlan: FloorPlan;
    pins: LayoutPin[];
    onBack: () => void;
    onAddPin: (x: number, y: number) => void;
    onViewFullDetail: (id: string) => void;
    currentUser: User;
}

const resizeImage = (base64Str: string, maxWidth = 1000): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } }
      else { if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; } }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.7;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 133333 && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = () => resolve(base64Str);
  });
};

// Custom Pin Icon SVG based on the user's image
const CustomPinIcon = ({ color, isSelected }: { color: string, isSelected?: boolean }) => (
    <div className={`relative transition-transform duration-300 ${isSelected ? 'scale-125 z-50' : 'scale-100 z-40'}`}>
        <svg width="28" height="35" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
            <path 
                d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" 
                fill={color} 
                className="transition-colors duration-300"
            />
            <circle cx="12" cy="12" r="6" fill="white" />
            <circle cx="12" cy="12" r="3.5" fill={color} className="transition-colors duration-300" />
        </svg>
        {isSelected && (
            <div className="absolute -top-1 -right-1">
                <div className="w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></div>
                </div>
            </div>
        )}
    </div>
);

export const LayoutManager: React.FC<LayoutManagerProps> = ({ 
    floorPlan, pins: initialPins, onBack, onAddPin, onViewFullDetail, currentUser
}) => {
    const [pins, setPins] = useState<LayoutPin[]>(initialPins);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startDrag, setStartDrag] = useState({ x: 0, y: 0 });
    const [isAddingMode, setIsAddingMode] = useState(false);
    const [leftSidebarSearch, setLeftSidebarSearch] = useState('');
    
    const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
    const [originalPinPos, setOriginalPinPos] = useState<{x: number, y: number} | null>(null);
    const [hoverCoord, setHoverCoord] = useState<{x: number, y: number} | null>(null);

    const [selectedPin, setSelectedPin] = useState<LayoutPin | null>(null);
    const [quickDetail, setQuickDetail] = useState<Inspection | null>(null);
    const [isLoadingQuickDetail, setIsLoadingQuickDetail] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

    const [isUserSelectorOpen, setIsUserSelectorOpen] = useState(false);
    const [systemUsers, setSystemUsers] = useState<User[]>([]);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);

    const quickCameraRef = useRef<HTMLCanvasElement>(null);
    const quickFileRef = useRef<HTMLInputElement>(null);

    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartPos = useRef({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => { setPins(initialPins); }, [initialPins]);

    const handleSelectPin = async (pin: LayoutPin) => {
        if (!pin.inspection_id) return;
        
        // ISO-MOBILE UX: Trên thiết bị di động, ưu tiên mở Full Detail ngay lập tức
        if (window.innerWidth < 640) {
            setSelectedPin(pin);
            onViewFullDetail(pin.inspection_id);
            return;
        }

        // Trên Desktop: Chỉ thực hiện nếu không đang trong quá trình kéo Pin
        if (draggingPinId) return;

        setSelectedPin(pin);
        setIsLoadingQuickDetail(true);
        try {
            const data = await fetchInspectionById(pin.inspection_id);
            setQuickDetail(data);
        } catch (e) {
            console.error("Failed to load quick detail", e);
        } finally {
            setIsLoadingQuickDetail(false);
        }
    };

    const handleQuickStatusUpdate = async (newStatus: InspectionStatus) => {
        if (!quickDetail) return;
        setIsUpdating(true);
        try {
            const updated = { ...quickDetail, status: newStatus, updatedAt: new Date().toISOString() };
            await saveInspectionToSheet(updated);
            setQuickDetail(updated);
            setPins(prev => prev.map(p => p.inspection_id === quickDetail.id ? { ...p, status: newStatus } : p));
        } catch (e) {
            alert("Lỗi cập nhật trạng thái");
        } finally {
            setIsUpdating(false);
        }
    };

    const handlePostQuickComment = async () => {
        if (!newComment.trim() || !quickDetail || !currentUser) return;
        setIsUpdating(true);
        try {
            const comment: NCRComment = {
                id: `cmt_${Date.now()}`,
                userId: currentUser.id,
                userName: currentUser.name,
                userAvatar: currentUser.avatar,
                content: newComment,
                createdAt: new Date().toISOString()
            };
            const updated: Inspection = { 
                ...quickDetail, 
                comments: [...(quickDetail.comments || []), comment],
                updatedAt: new Date().toISOString()
            };
            await saveInspectionToSheet(updated);
            setQuickDetail(updated);
            setNewComment('');
        } catch (e: any) {
            alert(`Lỗi gửi tin nhắn: ${e.message || "Lỗi kết nối"}`);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleQuickAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!quickDetail || !e.target.files?.length) return;
        setIsUpdating(true);
        try {
            const files = Array.from(e.target.files) as any[];
            const processed = await Promise.all(files.map(async (file) => {
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                return resizeImage(base64);
            }));

            const updated: Inspection = {
                ...quickDetail,
                images: [...(quickDetail.images || []), ...processed],
                updatedAt: new Date().toISOString()
            };
            await saveInspectionToSheet(updated);
            setQuickDetail(updated);
        } catch (err) {
            alert("Lỗi khi thêm ảnh nhanh.");
        } finally {
            setIsUpdating(false);
            e.target.value = '';
        }
    };

    const handleQuickDeleteImage = async (idx: number) => {
        if (!quickDetail || !window.confirm("Xóa ảnh minh chứng này?")) return;
        setIsUpdating(true);
        try {
            const updated: Inspection = {
                ...quickDetail,
                images: quickDetail.images?.filter((_, i) => i !== idx),
                updatedAt: new Date().toISOString()
            };
            await saveInspectionToSheet(updated);
            setQuickDetail(updated);
        } catch (err) {
            alert("Lỗi khi xóa ảnh.");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAssignUser = async (targetUser: User) => {
        if (!quickDetail) return;
        setIsUpdating(true);
        try {
            const updated: Inspection = {
                ...quickDetail,
                responsiblePerson: targetUser.name,
                updatedAt: new Date().toISOString()
            };
            await saveInspectionToSheet(updated);
            setQuickDetail(updated);
            setIsUserSelectorOpen(false);
        } catch (e) {
            alert("Lỗi phân công nhân sự");
        } finally {
            setIsUpdating(false);
        }
    };

    const openUserSelector = async () => {
        setIsUserSelectorOpen(true);
        setIsLoadingUsers(true);
        try {
            const users = await fetchUsers();
            setSystemUsers(users);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handleZoom = useCallback((delta: number) => {
        setScale(prev => {
            const newScale = Math.min(Math.max(1, prev + delta), 8);
            if (newScale === 1) setOffset({ x: 0, y: 0 });
            return newScale;
        });
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.2 : 0.2;
            handleZoom(delta);
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [handleZoom]);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        if (!isAddingMode && !draggingPinId) {
            touchStartPos.current = { x: clientX, y: clientY };
            longPressTimer.current = setTimeout(() => {
                triggerLongPress(clientX, clientY);
            }, 600);
        }

        if (('button' in e && e.button !== 0) || isAddingMode || draggingPinId) return; 
        setIsDragging(true);
        setStartDrag({ x: clientX - offset.x, y: clientY - offset.y });
    };

    const triggerLongPress = (clientX: number, clientY: number) => {
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            const x = ((clientX - rect.left) / rect.width) * 100;
            const y = ((clientY - rect.top) / rect.height) * 100;
            if ('vibrate' in navigator) navigator.vibrate(50);
            setIsDragging(false);
            onAddPin(x, y);
        }
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (longPressTimer.current) {
            const dx = Math.abs(clientX - touchStartPos.current.x);
            const dy = Math.abs(clientY - touchStartPos.current.y);
            if (dx > 10 || dy > 10) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }

        if (!imgRef.current) return;
        
        const rect = imgRef.current.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;
        setHoverCoord({ x, y });

        if (draggingPinId) {
            setPins(prev => prev.map(p => p.id === draggingPinId ? { ...p, x, y } : p));
            return;
        }

        if (!isDragging || scale === 1) return;
        setOffset({ x: clientX - startDrag.x, y: clientY - offset.y });
    };

    const handleMouseUp = async () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        if (draggingPinId) {
            const pin = pins.find(p => p.id === draggingPinId);
            if (pin) {
                // ISO: Nếu pin đã có hồ sơ, yêu cầu xác nhận trước khi lưu vị trí mới
                if (pin.inspection_id) {
                    const hasMoved = originalPinPos && (Math.abs(originalPinPos.x - pin.x) > 0.1 || Math.abs(originalPinPos.y - pin.y) > 0.1);
                    if (hasMoved) {
                        if (window.confirm("Bạn có chắc chắn muốn thay đổi vị trí điểm kiểm tra này?")) {
                            await saveLayoutPin(pin);
                        } else {
                            // Revert to original
                            setPins(prev => prev.map(p => p.id === draggingPinId ? { ...p, x: originalPinPos!.x, y: originalPinPos!.y } : p));
                        }
                    }
                } else {
                    await saveLayoutPin(pin);
                }
            }
            setDraggingPinId(null);
            setOriginalPinPos(null);
        }
        setIsDragging(false);
    };

    const handleLayoutClick = (e: React.MouseEvent) => {
        if (isDragging || !imgRef.current || !isAddingMode || draggingPinId) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        onAddPin(x, y);
        setIsAddingMode(false); 
        setHoverCoord(null);
    };

    // ISO Colors: Approved = Green, Others = Orange
    const getPinColorHex = (status: string) => {
        if (status === InspectionStatus.APPROVED) return '#10b981'; // Green
        return '#f97316'; // Orange
    };

    const filteredPins = useMemo(() => {
        const term = leftSidebarSearch.toLowerCase().trim();
        if (!term) return pins;
        return pins.filter(p => (p.label || '').toLowerCase().includes(term) || (p.inspection_id || '').toLowerCase().includes(term));
    }, [pins, leftSidebarSearch]);

    const filteredUsers = useMemo(() => {
        const term = userSearchTerm.toLowerCase().trim();
        if (!term) return systemUsers;
        return systemUsers.filter(u => u.name.toLowerCase().includes(term) || (u.msnv || '').toLowerCase().includes(term));
    }, [systemUsers, userSearchTerm]);

    return (
        <div className="absolute inset-0 z-40 bg-[#f1f5f9] flex flex-col animate-in fade-in duration-300 overflow-hidden">
            <header className="h-14 bg-white border-b border-slate-200 px-3 md:px-4 flex items-center justify-between shrink-0 shadow-sm z-50">
                <div className="flex items-center gap-2 md:gap-3">
                    <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
                    <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
                    <div className="overflow-hidden">
                        <h2 className="text-[10px] md:text-[11px] font-black text-slate-800 uppercase tracking-tight truncate max-w-[140px] md:max-w-[200px]">{floorPlan.name}</h2>
                        <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5">REV {floorPlan.version}</p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 md:gap-2">
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button onClick={() => handleZoom(0.5)} className="p-1.5 hover:bg-white rounded-md text-slate-600"><ZoomIn className="w-3.5 h-3.5" /></button>
                        <span className="hidden sm:inline-block px-2 text-[9px] font-black text-slate-500 min-w-[30px] text-center">{Math.round(scale * 100)}%</span>
                        <button onClick={() => handleZoom(-0.5)} className="p-1.5 hover:bg-white rounded-md text-slate-600"><ZoomOut className="w-3.5 h-3.5" /></button>
                    </div>
                    <button 
                        onClick={() => setIsAddingMode(!isAddingMode)}
                        className={`px-2.5 py-1.5 rounded-lg border font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm ${isAddingMode ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-100' : 'bg-white text-blue-600 border-blue-200'}`}
                    >
                        {isAddingMode ? <Crosshair className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        <span className="hidden md:inline">{isAddingMode ? 'CANCEL' : 'DROP PIN'}</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 relative overflow-hidden flex">
                <div className="hidden lg:flex w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 z-30 shadow-sm">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                                value={leftSidebarSearch}
                                onChange={e => setLeftSidebarSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 ring-blue-100 transition-all"
                                placeholder="Tìm điểm kiểm tra..."
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                        {filteredPins.map(pin => {
                            const isSelected = selectedPin?.id === pin.id;
                            const color = getPinColorHex(pin.status);
                            return (
                                <div 
                                    key={pin.id}
                                    onClick={() => handleSelectPin(pin)}
                                    className={`p-3 rounded-2xl border transition-all cursor-pointer group ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="shrink-0 mt-0.5">
                                            <svg width="16" height="20" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill={color} />
                                                <circle cx="12" cy="12" r="6" fill="white" />
                                                <circle cx="12" cy="12" r="3.5" fill={color} />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-[11px] font-black uppercase truncate pr-1 ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{pin.label || 'Chưa đặt tên'}</h4>
                                            <p className={`text-[8px] font-black uppercase mt-0.5 ${pin.status === InspectionStatus.APPROVED ? 'text-emerald-600' : 'text-orange-600'}`}>{pin.status}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div 
                    ref={containerRef}
                    className={`flex-1 flex items-center justify-center select-none overflow-hidden relative bg-[#cbd5e1] ${isAddingMode ? 'cursor-crosshair' : scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                    onClick={handleLayoutClick}
                >
                    <div 
                        className="relative shadow-[0_40px_120px_rgba(0,0,0,0.2)] rounded-sm overflow-hidden bg-white"
                        style={{ 
                            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                            transformOrigin: 'center',
                            transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
                            willChange: 'transform'
                        }}
                    >
                        <img ref={imgRef} src={floorPlan.image_url} alt="Drawing" className={`max-w-[95vw] sm:max-w-[85vw] max-h-[85vh] sm:max-h-[80vh] object-contain pointer-events-none transition-opacity ${isAddingMode ? 'opacity-50' : 'opacity-100'}`} />

                        {isAddingMode && hoverCoord && (
                            <div 
                                className="absolute pointer-events-none z-50 flex flex-col items-center"
                                style={{ left: `${hoverCoord.x}%`, top: `${hoverCoord.y}%`, transform: 'translate(-50%, -50%)' }}
                            >
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-blue-500 border-dashed animate-spin duration-3000"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-3 h-3 md:w-4 md:h-4 bg-orange-500 rounded-full border-2 border-white shadow-lg"></div>
                                </div>
                            </div>
                        )}

                        {pins.map(pin => {
                            const isSelected = selectedPin?.id === pin.id;
                            const color = getPinColorHex(pin.status);
                            
                            return (
                                <div
                                    key={pin.id}
                                    onMouseDown={(e) => { 
                                        e.stopPropagation(); 
                                        if (window.innerWidth >= 640) {
                                            setDraggingPinId(pin.id);
                                            setOriginalPinPos({ x: pin.x, y: pin.y });
                                        }
                                    }}
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleSelectPin(pin); 
                                    }}
                                    className={`absolute cursor-pointer transform -translate-x-1/2 -translate-y-[calc(100%-5px)]`}
                                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                                >
                                    <CustomPinIcon color={color} isSelected={isSelected} />
                                    
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden md:group-hover:block bg-slate-900 text-white text-[7px] font-black px-2 py-0.5 rounded whitespace-nowrap shadow-xl z-[60] uppercase tracking-widest pointer-events-none">
                                        {pin.label || 'Incomplete'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white text-[8px] md:text-[9px] font-bold uppercase tracking-widest flex items-center gap-2 pointer-events-none opacity-60">
                        <Info className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400" />
                        <span>{isAddingMode ? 'TAP TO ADD' : 'HOLD TO DROP PIN'}</span>
                    </div>
                </div>
            </div>

            {/* --- QUICK REVIEW OVERLAY (Desktop Only) --- */}
            {selectedPin && window.innerWidth >= 640 && (
                <div className="absolute inset-0 sm:left-auto sm:right-0 sm:w-[400px] bg-white flex flex-col z-[100] shadow-[-20px_0_60px_rgba(0,0,0,0.15)] animate-in slide-in-from-bottom sm:slide-in-from-right duration-300">
                    {isLoadingQuickDetail ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-white">
                            <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-600" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Đang đồng bộ dữ liệu...</p>
                        </div>
                    ) : quickDetail ? (
                        <>
                            <header className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white shadow-sm z-10">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setSelectedPin(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 active:scale-90 transition-all sm:hidden"><ArrowLeft className="w-5 h-5"/></button>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Flag className="w-3.5 h-3.5 text-orange-500 fill-current animate-bounce" />
                                            <h3 className="font-black text-slate-900 text-xs uppercase tracking-tight">Hồ sơ #{quickDetail.id.split('-').pop()}</h3>
                                        </div>
                                        <div className="flex gap-1.5 mt-1">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border shadow-sm ${quickDetail.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{quickDetail.status}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedPin(null)} className="p-2.5 hover:bg-slate-100 rounded-2xl text-slate-400 active:scale-90 transition-all"><X className="w-6 h-6"/></button>
                            </header>

                            <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-6 bg-slate-50/30">
                                <div className="space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Hạng mục thẩm định</p>
                                    <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                                        <p className="text-[13px] font-black text-slate-800 leading-relaxed uppercase tracking-tight italic">"{quickDetail.ten_hang_muc}"</p>
                                        {quickDetail.summary && <p className="text-[11px] text-slate-500 leading-relaxed border-l-3 border-orange-200 pl-4 mt-3">Notes: {quickDetail.summary}</p>}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between ml-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                                            Minh chứng ({(quickDetail.images || []).length})
                                        </p>
                                        <div className="flex gap-1.5">
                                            <button onClick={() => quickCameraRef.current?.click()} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-90 transition-all border border-blue-100" title="Chụp ảnh nhanh">
                                                <Camera className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => quickFileRef.current?.click()} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 active:scale-90 transition-all border border-slate-200" title="Tải ảnh">
                                                <ImagePlus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        {quickDetail.images?.map((img, idx) => (
                                            <div 
                                                key={idx} 
                                                className="aspect-square bg-white rounded-[2rem] border border-slate-200 overflow-hidden cursor-zoom-in group shadow-sm hover:border-blue-400 hover:shadow-xl transition-all relative"
                                            >
                                                <img 
                                                    src={img} 
                                                    onClick={() => setLightbox({ images: quickDetail.images!, index: idx })} 
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500" 
                                                />
                                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                    <div className="bg-white/90 backdrop-blur-md p-2 rounded-xl shadow-lg">
                                                        <Maximize2 className="w-4 h-4 text-blue-600" />
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleQuickDeleteImage(idx); }}
                                                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {(quickDetail.images?.length === 0) && (
                                            <div 
                                                onClick={() => quickCameraRef.current?.click()}
                                                className="col-span-2 py-12 flex flex-col items-center justify-center bg-white rounded-[2rem] border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 group-hover:scale-110 transition-all">
                                                    <Camera className="w-6 h-6 text-slate-300 group-hover:text-blue-500" />
                                                </div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600">Bấm để chụp ảnh minh chứng</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Phân công xử lý</p>
                                    <button 
                                        onClick={openUserSelector}
                                        className="w-full flex items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm group hover:border-blue-300 transition-all active:scale-[0.98]"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-300 group-hover:text-blue-50 group-hover:bg-blue-50 transition-all">
                                            <UserIcon className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="text-[12px] font-black text-slate-800 uppercase truncate">{quickDetail.responsiblePerson || 'CHƯA PHÂN CÔNG'}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Assigned Staff</p>
                                        </div>
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between ml-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5"/> Thảo luận</p>
                                    </div>
                                    <div className="space-y-5 px-1 pb-4">
                                        {(quickDetail.comments || []).slice(-4).map((cmt, idx) => (
                                            <div key={idx} className="flex gap-4 animate-in slide-in-from-bottom-1">
                                                <img src={cmt.userAvatar} className="w-9 h-9 rounded-xl bg-white shrink-0 border border-slate-200 shadow-sm object-cover" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-black text-slate-800 uppercase truncate pr-1">{cmt.userName}</span>
                                                        <span className="text-[8px] text-slate-400 font-mono shrink-0 uppercase">{formatTime(cmt.createdAt)}</span>
                                                    </div>
                                                    <div className="bg-white p-3.5 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm">
                                                        <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{cmt.content}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {(quickDetail.comments?.length || 0) === 0 && (
                                            <p className="text-center text-[9px] text-slate-300 py-10 font-black uppercase tracking-[0.3em]">Trống thảo luận</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-white border-t border-slate-100 shrink-0 space-y-4 shadow-[0_-15px_40px_rgba(0,0,0,0.05)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
                                <div className="flex gap-2">
                                    <input 
                                        value={newComment} 
                                        onChange={e => setNewComment(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && handlePostQuickComment()} 
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-[12px] font-medium outline-none focus:ring-4 focus:ring-blue-100 h-12 transition-all shadow-inner" 
                                        placeholder="Phản hồi nhanh..." 
                                    />
                                    <button 
                                        onClick={handlePostQuickComment} 
                                        disabled={isUpdating || !newComment.trim()} 
                                        className="w-12 h-12 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-30 hover:bg-blue-600 hover:text-white"
                                    >
                                        <Send className="w-5 h-5"/>
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => handleQuickStatusUpdate(InspectionStatus.APPROVED)} 
                                        disabled={isUpdating || quickDetail.status === InspectionStatus.APPROVED} 
                                        className="py-4 px-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 transition-all"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> XÁC NHẬN
                                    </button>
                                    <button 
                                        onClick={() => onViewFullDetail(quickDetail.id)} 
                                        className="py-4 px-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 active:scale-95 transition-all"
                                    >
                                        <ExternalLink className="w-4 h-4" /> XEM CHI TIẾT
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* HIDDEN INPUTS FOR QUICK GALLERY ADDITION */}
            <input type="file" ref={quickCameraRef as any} accept="image/*" capture="environment" className="hidden" onChange={handleQuickAddImage} />
            <input type="file" ref={quickFileRef} accept="image/*" multiple className="hidden" onChange={handleQuickAddImage} />

            {isUserSelectorOpen && (
                <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">
                        <header className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Phân công nhân sự</h3>
                            <button onClick={() => setIsUserSelectorOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6"/></button>
                        </header>
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 shrink-0">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input value={userSearchTerm} onChange={e => setUserSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-100/50" placeholder="Tìm tên nhân viên..." />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 no-scrollbar space-y-1">
                            {filteredUsers.map(u => (
                                <button key={u.id} onClick={() => handleAssignUser(u)} className="w-full flex items-center gap-4 p-4 rounded-[1.5rem] hover:bg-blue-50 transition-all border border-transparent active:scale-95 text-left group">
                                    <div className="relative">
                                        <img src={u.avatar} className="w-11 h-11 rounded-2xl object-cover shrink-0 border border-slate-200 shadow-sm" />
                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-black text-slate-800 uppercase truncate leading-none">{u.name}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5">{u.position || u.role}</p>
                                    </div>
                                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all"><Check className="w-4 h-4" /></div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {lightbox && (
                <ImageEditorModal 
                    images={lightbox.images} 
                    initialIndex={lightbox.index} 
                    onSave={async (idx, updated) => {
                        if (!quickDetail) return;
                        const newImages = [...(quickDetail.images || [])];
                        newImages[idx] = updated;
                        const final = { ...quickDetail, images: newImages, updatedAt: new Date().toISOString() };
                        await saveInspectionToSheet(final);
                        setQuickDetail(final);
                    }} 
                    onClose={() => setLightbox(null)} 
                    readOnly={false} 
                />
            )}
        </div>
    );
};

function formatTime(isoStr: string) {
    try {
        const date = new Date(isoStr);
        return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch(e) { return '---'; }
}
