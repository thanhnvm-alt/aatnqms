import React, { useState, useEffect, useMemo } from 'react';
import { 
    fetchDeletedInspections, 
    restoreInspection, 
    permanentDeleteInspection,
    fetchInspectionById 
} from '../services/apiService';
import { User, Inspection, InspectionStatus, CheckStatus } from '../types';
import { getProxyImageUrl } from '../src/utils';
import { formatDisplayDate } from '../lib/utils';
import { 
    RefreshCw, 
    Trash2, 
    ShieldAlert, 
    Loader2, 
    Search, 
    ArrowLeft, 
    CheckSquare, 
    Square, 
    X, 
    Eye,
    Calendar,
    User as UserIcon,
    FileText,
    Building2,
    CheckCircle2,
    XCircle,
    Activity,
    Image as ImageIcon,
    Box,
    Factory,
    Hash,
    MapPin,
    AlertCircle,
    Info,
    PenTool,
    ClipboardList,
    ChevronDown,
    ChevronUp,
    FileCheck
} from 'lucide-react';

interface TrashProps {
    user: User;
    onNavigate: (view: any) => void;
}

export const Trash: React.FC<TrashProps> = ({ user, onNavigate }) => {
    const [deletedItems, setDeletedItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isActionLoading, setIsActionLoading] = useState<string | null | boolean>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [reviewItem, setReviewItem] = useState<Inspection | null>(null);
    const [isReviewLoading, setIsReviewLoading] = useState(false);
    const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

    const loadDeleted = async () => {
        setIsLoading(true);
        try {
            const data = await fetchDeletedInspections();
            setDeletedItems(data);
            setSelectedIds([]);
        } catch (error) {
            console.error("Failed to load deleted inspections", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDeleted();
    }, []);

    const handleRestore = async (id: string) => {
        if (!window.confirm("Bạn có chắc chắn muốn khôi phục phiếu này?")) return;
        setIsActionLoading(id);
        try {
            await restoreInspection(id);
            alert("Đã khôi phục thành công!");
            loadDeleted();
        } catch (error) {
            alert("Lỗi khi khôi phục.");
        } finally {
            setIsActionLoading(null);
        }
    };

    const handlePermanentDelete = async (id: string) => {
        if (!window.confirm("CẢNH BÁO: Dữ liệu sẽ bị xóa VĨNH VIỄN khỏi database và không thể khôi phục. Bạn có chắc chắn?")) return;
        setIsActionLoading(id);
        try {
            await permanentDeleteInspection(id);
            alert("Đã xóa vĩnh viễn.");
            loadDeleted();
        } catch (error) {
            alert("Lỗi khi xóa.");
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleBulkRestore = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Bạn có chắc chắn muốn khôi phục ${selectedIds.length} phiếu đã chọn?`)) return;
        setIsActionLoading(true);
        try {
            for (const id of selectedIds) {
                await restoreInspection(id);
            }
            alert(`Đã khôi phục thành công ${selectedIds.length} phiếu!`);
            loadDeleted();
        } catch (error) {
            alert("Lỗi trong quá trình khôi phục hàng loạt.");
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleBulkPermanentDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`CẢNH BÁO CỰC NGUY HIỂM: Bạn đang chuẩn bị xóa VĨNH VIỄN ${selectedIds.length} phiếu đã chọn. Hành động này không thể hoàn tác. Bạn có chắc chắn?`)) return;
        setIsActionLoading(true);
        try {
            for (const id of selectedIds) {
                await permanentDeleteInspection(id);
            }
            alert(`Đã xóa vĩnh viễn ${selectedIds.length} phiếu.`);
            loadDeleted();
        } catch (error) {
            alert("Lỗi trong quá trình xóa hàng loạt.");
        } finally {
            setIsActionLoading(null);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredItems.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredItems.map(item => item.id));
        }
    };

    const toggleSelect = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(idx => idx !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleReview = async (id: string) => {
        setIsReviewLoading(true);
        try {
            const data = await fetchInspectionById(id);
            if (data) {
                setReviewItem(data);
            } else {
                alert("Không thể tải thông tin chi tiết.");
            }
        } catch (error) {
            console.error("Review failed", error);
            alert("Lỗi khi tải chi tiết phiếu.");
        } finally {
            setIsReviewLoading(false);
        }
    };

    const filteredItems = deletedItems.filter(item => 
        item.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.ten_ct?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.ma_ct?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="px-6 py-8 bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <button onClick={() => onNavigate('DASHBOARD')} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 transition-all active:scale-90 lg:hidden">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <ShieldAlert className="w-6 h-6 text-red-600" />
                                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Thùng Rác Hệ Thống</h1>
                            </div>
                            <p className="text-slate-500 font-medium text-sm mt-1">Quản lý các dữ liệu đã xóa (Chỉ dành cho Admin)</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        {selectedIds.length > 0 && (
                            <div className="flex items-center gap-2 animate-in slide-in-from-right duration-300">
                                <button 
                                    onClick={handleBulkRestore}
                                    className="px-6 py-4 bg-emerald-600 text-white rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Khôi phục ({selectedIds.length})
                                </button>
                                <button 
                                    onClick={handleBulkPermanentDelete}
                                    className="px-6 py-4 bg-rose-600 text-white rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Xóa ({selectedIds.length})
                                </button>
                            </div>
                        )}
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Tìm kiếm phiếu đã xóa..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-100 border-none rounded-3xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600/20 transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
                <div className="max-w-7xl mx-auto">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4">
                            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Đang quét dữ liệu...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="bg-white rounded-[2.5rem] p-16 border-2 border-dashed border-slate-200 flex flex-col items-center gap-6 text-center shadow-sm">
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                                <Trash2 className="w-12 h-12" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase">Thùng rác trống</h3>
                                <p className="text-slate-400 font-bold mt-2">Không tìm thấy dữ liệu nào ở trạng thái đã xóa.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/80 border-b border-slate-200">
                                            <th className="px-6 py-5 w-10">
                                                <button onClick={toggleSelectAll} className="p-1 text-slate-400 hover:text-blue-600 transition-colors">
                                                    {selectedIds.length === filteredItems.length ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                                                </button>
                                            </th>
                                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Thông tin phiếu</th>
                                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Dự án / Nội dung</th>
                                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Người lập / Thời gian xóa</th>
                                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right text-red-500">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredItems.map(item => (
                                            <tr key={item.id} className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selectedIds.includes(item.id) ? 'bg-blue-50/30' : ''}`} onClick={() => handleReview(item.id)}>
                                                <td className="px-6 py-5" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => toggleSelect(item.id)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors">
                                                        {selectedIds.includes(item.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-slate-900 text-sm tracking-tight">{item.id}</span>
                                                            <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                        </div>
                                                        <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black w-fit uppercase">
                                                            {item.table_name?.replace('forms_', '').toUpperCase()}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col gap-0.5">
                                                        <p className="text-sm font-black text-slate-800 line-clamp-1 truncate uppercase">{item.ten_ct || 'N/A'}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">{item.ten_hang_muc || 'N/A'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-xs font-bold text-slate-700">{item.inspectorName || 'Sử dụng hệ thống'}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 italic">
                                                            {new Date(Number(item.deleted_at) * 1000).toLocaleString('vi-VN')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button 
                                                            disabled={isActionLoading === item.id || isActionLoading === true}
                                                            onClick={() => handleRestore(item.id)}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50 active:scale-95 shadow-sm shadow-emerald-200/50"
                                                        >
                                                            <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading === item.id ? 'animate-spin' : ''}`} />
                                                            Khôi phục
                                                        </button>
                                                        <button 
                                                            disabled={isActionLoading === item.id || isActionLoading === true}
                                                            onClick={() => handlePermanentDelete(item.id)}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50 active:scale-95 shadow-sm shadow-rose-200/50"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Xóa vĩnh viễn
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Review Modal */}
            {reviewItem && (
                <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-in zoom-in duration-300 border border-white/20">
                        <header className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-900 uppercase text-lg tracking-tight leading-none">{reviewItem.id}</h3>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{reviewItem.type}</span>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Review nhanh phiếu trước khi khôi phục</p>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setReviewItem(null)} className="p-3 hover:bg-slate-200 rounded-2xl text-slate-400 active:scale-90 transition-all"><X className="w-6 h-6"/></button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 no-scrollbar bg-white">
                            {/* --- HEADER INFO CARDS --- */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Building2 className="w-3 h-3"/> DỰ ÁN</p>
                                    <p className="text-xs font-black text-slate-900 uppercase line-clamp-1">{reviewItem.ten_ct || 'N/A'}</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">{reviewItem.ma_ct || 'N/A'}</p>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><UserIcon className="w-3 h-3"/> QC THỰC HIỆN</p>
                                    <p className="text-xs font-black text-slate-900 line-clamp-1">{reviewItem.inspectorName || 'Hệ thống'}</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">MODULE: {reviewItem.type || 'N/A'}</p>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Factory className="w-3 h-3"/> XƯỞNG / CÔNG ĐOẠN</p>
                                    <p className="text-xs font-black text-slate-900 line-clamp-1">{reviewItem.workshop || '---'}</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">{reviewItem.inspectionStage || '---'}</p>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Calendar className="w-3 h-3"/> THỜI GIAN LẬP</p>
                                    <p className="text-xs font-black text-slate-900">{formatDisplayDate(reviewItem.date)}</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">{reviewItem.createdAt ? new Date(Number(reviewItem.createdAt) * 1000).toLocaleTimeString('vi-VN') : '---'}</p>
                                </div>
                            </div>

                            {/* --- STATISTICS --- */}
                            <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-slate-200">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                    <div className="text-center md:border-r border-slate-700">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">SỐ IPO</p>
                                        <p className="text-xl font-black">{reviewItem.so_luong_ipo || 0}</p>
                                    </div>
                                    <div className="text-center md:border-r border-slate-700">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">KIỂM TRA</p>
                                        <p className="text-xl font-black text-blue-400">{reviewItem.inspectedQuantity || 0}</p>
                                    </div>
                                    <div className="text-center md:border-r border-slate-700">
                                        <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">ĐẠT</p>
                                        <p className="text-xl font-black text-emerald-400">{reviewItem.passedQuantity || 0}</p>
                                    </div>
                                    <div className="text-center md:border-r border-slate-700">
                                        <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">HỎNG</p>
                                        <p className="text-xl font-black text-rose-400">{reviewItem.failedQuantity || 0}</p>
                                    </div>
                                    <div className="text-center md:border-r border-slate-700 col-span-2 md:col-span-1">
                                        <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">TỶ LỆ ĐẠT</p>
                                        <p className="text-xl font-black text-amber-400">
                                            {reviewItem.inspectedQuantity && reviewItem.inspectedQuantity > 0 
                                                ? Math.round(((reviewItem.passedQuantity || 0) / reviewItem.inspectedQuantity) * 100) 
                                                : 0}%
                                        </p>
                                    </div>
                                    <div className="text-center col-span-2 md:col-span-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">TRẠNG THÁI</p>
                                        <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            reviewItem.status === InspectionStatus.APPROVED ? 'bg-emerald-500/20 text-emerald-400' : 
                                            reviewItem.status === InspectionStatus.REJECTED ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                                        }`}>
                                            {reviewItem.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* --- GENERAL PHOTOS --- */}
                            {reviewItem.images && reviewItem.images.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4 text-blue-600" /> Hình ảnh hiện trường tổng quát
                                    </h4>
                                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                                        {reviewItem.images.map((img, idx) => (
                                            <div key={idx} className="w-32 h-32 rounded-2xl overflow-hidden border border-slate-100 shrink-0 shadow-sm">
                                                <img 
                                                    src={getProxyImageUrl(img)} 
                                                    className="w-full h-full object-cover" 
                                                    alt={`Scene ${idx}`}
                                                    referrerPolicy="no-referrer"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- SUPPORTING DOCS (IQC/FSR) --- */}
                            {reviewItem.supportingDocs && reviewItem.supportingDocs.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <FileCheck className="w-4 h-4 text-blue-600" /> Tài liệu hồ sơ đính kèm
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {reviewItem.supportingDocs.map(doc => (
                                            <div key={doc.id} className={`flex items-center gap-2 p-3 rounded-2xl border text-[10px] font-bold uppercase tracking-tight ${doc.verified ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                                {doc.verified ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <div className="w-4 h-4 rounded border border-slate-300 shrink-0" />}
                                                <span className="truncate">{doc.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- MATERIALS LIST (IQC) --- */}
                            {reviewItem.materials && reviewItem.materials.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <ClipboardList className="w-4 h-4 text-blue-600" /> Danh mục vật tư kiểm tra
                                    </h4>
                                    <div className="space-y-3">
                                        {reviewItem.materials.map((mat, idx) => {
                                            const isExp = expandedMaterial === mat.id;
                                            return (
                                                <div key={mat.id} className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                                    <div 
                                                        onClick={() => setExpandedMaterial(isExp ? null : mat.id)} 
                                                        className={`p-5 flex items-center justify-between cursor-pointer ${isExp ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'}`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                                                            <div>
                                                                <h5 className="font-black text-slate-900 text-sm uppercase tracking-tight leading-none">{mat.name}</h5>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">
                                                                    {mat.inspectType || '100%'} • {mat.deliveryQty} {mat.unit}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {isExp ? <ChevronUp className="w-5 h-5 text-blue-600"/> : <ChevronDown className="w-5 h-5 text-slate-300"/>}
                                                    </div>
                                                    {isExp && (
                                                        <div className="p-6 space-y-4 border-t border-slate-50 bg-slate-50/30">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-inner">
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Phân loại</p>
                                                                    <p className="text-[11px] font-bold text-slate-800 uppercase mt-1">{mat.scope === 'COMMON' ? 'Dùng chung' : 'Dự án'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mã/Tên dự án</p>
                                                                    <p className="text-[11px] font-bold text-slate-800 uppercase mt-1 truncate">{mat.projectCode || 'N/A'}</p>
                                                                    <p className="text-[9px] text-slate-500 truncate">{mat.projectName}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SL Kiểm tra</p>
                                                                    <p className="text-[11px] font-bold text-slate-800 mt-1">{mat.inspectQty} / {mat.deliveryQty}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kết quả</p>
                                                                    <p className="text-[11px] font-bold text-emerald-600 mt-1">{mat.passQty} Đạt / {mat.failQty} Hỏng</p>
                                                                </div>
                                                            </div>
                                                            {mat.images && mat.images.length > 0 && (
                                                                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                                                    {mat.images.map((img, i) => (
                                                                        <img key={i} src={getProxyImageUrl(img)} className="w-16 h-16 rounded-xl object-cover border border-slate-200" alt="" referrerPolicy="no-referrer" />
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* --- DETAILED CHECK ITEMS --- */}

                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-blue-600" /> Chi tiết kết quả kiểm tra
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        Tổng cộng {(reviewItem.items || []).length} hạng mục
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    {(reviewItem.items || []).map((chk: any, idx: number) => (
                                        <div key={idx} className={`p-6 rounded-[2rem] border transition-all ${
                                            chk.status === CheckStatus.FAIL ? 'bg-red-50/30 border-red-100' : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:shadow-md'
                                        }`}>
                                            <div className="flex justify-between items-start gap-4 mb-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                                            chk.status === CheckStatus.PASS ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                                            chk.status === CheckStatus.FAIL ? 'bg-rose-50 text-rose-700 border-rose-100' : 
                                                            'bg-amber-50 text-amber-700 border-amber-100'
                                                        }`}>
                                                            {chk.status}
                                                        </span>
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{chk.category}</span>
                                                    </div>
                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">{chk.label}</p>
                                                </div>
                                                {chk.status === CheckStatus.PASS ? (
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                                                ) : chk.status === CheckStatus.FAIL ? (
                                                    <XCircle className="w-6 h-6 text-rose-500 shrink-0" />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full border-2 border-slate-200 shrink-0" />
                                                )}
                                            </div>

                                            {chk.notes && (
                                                <div className="mb-4 p-4 bg-white/60 rounded-2xl border border-slate-100/50">
                                                    <p className="text-[11px] text-slate-600 italic leading-relaxed">"{chk.notes}"</p>
                                                </div>
                                            )}

                                            {chk.images && chk.images.length > 0 && (
                                                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                                    {chk.images.map((img: string, i: number) => (
                                                        <div key={i} className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 shadow-sm">
                                                            <img 
                                                                src={getProxyImageUrl(img)} 
                                                                className="w-full h-full object-cover" 
                                                                alt=""
                                                                referrerPolicy="no-referrer"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* --- SUMMARY / SIGNATURES --- */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
                                {reviewItem.summary && (
                                    <div className="p-8 bg-slate-900 rounded-[2.5rem] border border-slate-800 text-white shadow-xl shadow-slate-200">
                                        <div className="flex items-center gap-2 mb-4">
                                            <PenTool className="w-4 h-4 text-blue-400" />
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ghi chú tổng kết của QC</h4>
                                        </div>
                                        <p className="text-sm font-medium leading-relaxed italic opacity-90">"{reviewItem.summary}"</p>
                                    </div>
                                )}
                                
                                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                        <ShieldAlert className="w-4 h-4 text-emerald-600" /> Xác nhận & Chữ ký
                                    </h4>
                                    <div className="grid grid-cols-2 gap-8 text-center">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Người lập phiếu</p>
                                            {reviewItem.signature ? (
                                                <img src={getProxyImageUrl(reviewItem.signature)} className="h-16 mx-auto object-contain my-2 opacity-80" alt="QC Sig" />
                                            ) : (
                                                <div className="h-16 flex items-center justify-center text-slate-300 italic text-[9px] font-bold">Chưa ký</div>
                                            )}
                                            <p className="text-[10px] font-black text-slate-800 uppercase mt-2">{reviewItem.inspectorName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Người phê duyệt</p>
                                            {reviewItem.managerSignature ? (
                                                <img src={getProxyImageUrl(reviewItem.managerSignature)} className="h-16 mx-auto object-contain my-2 opacity-80" alt="Mgr Sig" />
                                            ) : (
                                                <div className="h-16 flex items-center justify-center text-slate-300 italic text-[9px] font-bold">Chưa phê duyệt</div>
                                            )}
                                            <p className="text-[10px] font-black text-slate-800 uppercase mt-2">{reviewItem.managerName || 'Chưa duyệt'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => handleRestore(reviewItem.id)}
                                    className="px-8 py-4 bg-emerald-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 active:scale-95"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Khôi phục phiếu
                                </button>
                                <button 
                                    onClick={() => handlePermanentDelete(reviewItem.id)}
                                    className="px-8 py-4 bg-rose-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 flex items-center gap-2 active:scale-95"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Xóa vĩnh viễn
                                </button>
                            </div>
                            <button 
                                onClick={() => setReviewItem(null)}
                                className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-all flex items-center gap-2"
                            >
                                <X className="w-4 h-4" />
                                Đóng xem nhanh
                            </button>
                        </footer>
                    </div>
                </div>
            )}


            {isReviewLoading && (
                <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Đang tải bản xem trước...</p>
                    </div>
                </div>
            )}
            
            <footer className="p-6 bg-white border-t border-slate-100">
                <div className="max-w-7xl mx-auto flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">
                    <p>Hệ thống ISO QMS - Trash Control Module</p>
                    <p>Tổng cộng: {filteredItems.length} phiếu</p>
                </div>
            </footer>
        </div>
    );
};
