
import React, { useState } from 'react';
import { FloorPlan, Project } from '../types';
import { 
    Plus, Upload, FileText, ChevronRight, 
    Trash2, Edit3, CheckCircle, 
    LayoutGrid, List, Search, Filter, 
    RefreshCw, Loader2, Building2, Layers,
    Clock, Calendar, FileType, ZoomIn, Eye
} from 'lucide-react';

interface FloorPlanLibraryProps {
    project: Project;
    plans: FloorPlan[];
    onSelectPlan: (plan: FloorPlan) => void;
    onUploadPlan: () => void;
    onDeletePlan: (id: string) => void;
    isLoading?: boolean;
}

export const FloorPlanLibrary: React.FC<FloorPlanLibraryProps> = ({
    project, plans, onSelectPlan, onUploadPlan, onDeletePlan, isLoading = false
}) => {
    // ISO-UX: Mặc định hiển thị dạng LIST để dễ kiểm soát version
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('LIST');

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
                        <Layers className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Thư viện Bản vẽ Kỹ thuật</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            {project.ma_ct} • ISO VERSION CONTROL SYSTEM
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                        <button 
                            onClick={() => setViewMode('LIST')}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <List className="w-4 h-4" /> Danh sách
                        </button>
                        <button 
                            onClick={() => setViewMode('GRID')}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'GRID' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <LayoutGrid className="w-4 h-4" /> Lưới
                        </button>
                    </div>
                    <button 
                        onClick={onUploadPlan}
                        className="flex-1 md:flex-none bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        <span>TẢI LÊN BẢN VẼ</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="py-32 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                    <p className="font-black uppercase tracking-widest text-xs tracking-[0.2em]">Đang đồng bộ thư viện bản vẽ...</p>
                </div>
            ) : plans.length === 0 ? (
                <div 
                    onClick={onUploadPlan}
                    className="py-24 border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-slate-300 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer group"
                >
                    <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                        <Upload className="w-10 h-10" />
                    </div>
                    <p className="font-black uppercase tracking-widest text-sm">CHƯA CÓ BẢN VẼ TRONG HỆ THỐNG</p>
                    <p className="text-[10px] font-bold mt-2 uppercase text-slate-400 tracking-tighter">Hỗ trợ PDF, PNG, JPG (High Resolution)</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {viewMode === 'LIST' ? (
                        /* LIST VIEW MODE */
                        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-[0.2em] text-[9px]">
                                    <tr>
                                        <th className="px-8 py-5">Bản vẽ / Mặt bằng</th>
                                        <th className="px-6 py-5 text-center">Phiên bản</th>
                                        <th className="px-6 py-5">Trạng thái</th>
                                        <th className="px-6 py-5 text-center">QC Points</th>
                                        <th className="px-6 py-5">Cập nhật cuối</th>
                                        <th className="px-8 py-5 text-right">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {plans.map(plan => (
                                        <tr 
                                            key={plan.id}
                                            onClick={() => onSelectPlan(plan)}
                                            className="group hover:bg-blue-50/30 transition-all cursor-pointer"
                                        >
                                            <td className="px-8 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 shrink-0">
                                                        <img src={plan.image_url} className="w-full h-full object-cover" alt=""/>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-black text-slate-800 text-[13px] uppercase tracking-tight truncate">{plan.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{plan.file_name}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-block px-3 py-1 bg-slate-900 text-white rounded-lg font-black text-[10px] tracking-widest shadow-sm">
                                                    REV {plan.version || '1.0'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border shadow-sm ${plan.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${plan.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                                                    {plan.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-base font-black text-blue-600">{plan.active_inspections || 0}</span>
                                                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">DIỂM QC</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Clock className="w-3.5 h-3.5 opacity-40" />
                                                    <span className="text-[10px] font-bold">{new Date(plan.updated_at * 1000).toLocaleDateString('vi-VN')}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); if(window.confirm('Xác nhận xóa bản vẽ này?')) onDeletePlan(plan.id); }} 
                                                        className="p-2.5 text-slate-300 hover:text-red-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-red-100 transition-all"
                                                        title="Xóa bản vẽ"
                                                    >
                                                        <Trash2 className="w-4.5 h-4.5" />
                                                    </button>
                                                    <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all active:scale-90">
                                                        <Eye className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* GRID VIEW MODE */
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {plans.map(plan => (
                                <div 
                                    key={plan.id}
                                    onClick={() => onSelectPlan(plan)}
                                    className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-2xl hover:border-blue-400 transition-all animate-in zoom-in duration-300 cursor-pointer"
                                >
                                    <div className="aspect-[16/11] bg-slate-100 relative overflow-hidden border-b border-slate-50">
                                        <img src={plan.image_url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-1000" alt="" />
                                        <div className="absolute top-4 left-4 flex gap-2">
                                            <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-[0.15em] shadow-xl">
                                                REV {plan.version}
                                            </span>
                                        </div>
                                        <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="p-3 bg-white rounded-2xl shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300">
                                                <ZoomIn className="w-6 h-6 text-blue-600" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 flex-1 flex flex-col justify-between">
                                        <div className="space-y-1.5">
                                            <h4 className="font-black text-slate-800 uppercase text-sm tracking-tight truncate leading-tight">{plan.name}</h4>
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <FileType className="w-3 h-3" />
                                                <p className="text-[9px] font-bold uppercase truncate">{plan.file_name}</p>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-50 rounded-lg"><CheckCircle className="w-3.5 h-3.5 text-blue-600" /></div>
                                                <span className="text-[10px] font-black text-blue-900 uppercase">{plan.active_inspections || 0} POINTS</span>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Xác nhận xóa bản vẽ này?')) onDeletePlan(plan.id); }} className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all"><Trash2 className="w-4 h-4" /></button>
                                                <div className="p-2 text-slate-300 group-hover:text-blue-500 transition-colors"><ChevronRight className="w-5 h-5" /></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
