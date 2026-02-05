
import React, { useState } from 'react';
import { FloorPlan, Project } from '../types';
import { 
    Plus, Upload, FileText, ChevronRight, 
    MoreVertical, Trash2, Edit3, CheckCircle, 
    LayoutGrid, List, Search, Filter, 
    RefreshCw, Loader2, Building2, Layers
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
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                        <Layers className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                        Drawing Library
                    </h3>
                    <p className="text-[8px] md:text-[10px] text-slate-400 font-bold mt-0.5 md:mt-1 uppercase tracking-widest">
                        MANAGE ARCHITECTURAL LEVELS & VERSIONS
                    </p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button 
                            onClick={() => setViewMode('GRID')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'GRID' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setViewMode('LIST')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                    <button 
                        onClick={onUploadPlan}
                        className="flex-1 md:flex-none bg-blue-600 text-white px-6 py-3 md:py-2.5 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2 transition-all"
                    >
                        <Upload className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>NEW LAYOUT</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-10 h-10 md:w-12 md:h-12 animate-spin text-blue-600 mb-4" />
                    <p className="font-black uppercase tracking-widest text-[9px] md:text-xs">Loading Drawing Library...</p>
                </div>
            ) : plans.length === 0 ? (
                <div 
                    onClick={onUploadPlan}
                    className="py-16 md:py-24 border-4 border-dashed border-slate-200 rounded-[2rem] md:rounded-[3rem] flex flex-col items-center justify-center text-slate-300 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer group"
                >
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-50 flex items-center justify-center mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 md:w-10 md:h-10" />
                    </div>
                    <p className="font-black uppercase tracking-widest text-xs md:text-sm">UPLOAD FIRST FLOOR PLAN</p>
                    <p className="text-[8px] md:text-[10px] font-bold mt-2 uppercase">Hỗ trợ PDF, PNG, JPG High-Res</p>
                </div>
            ) : (
                <div className={`grid ${viewMode === 'GRID' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'} gap-4 md:gap-6`}>
                    {plans.map(plan => (
                        <div 
                            key={plan.id}
                            className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:border-blue-300 transition-all animate-in zoom-in duration-300"
                        >
                            <div 
                                onClick={() => onSelectPlan(plan)}
                                className="aspect-[16/10] sm:aspect-[4/3] bg-slate-100 relative cursor-pointer overflow-hidden border-b border-slate-50"
                            >
                                <img src={plan.image_url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" alt="" />
                                <div className="absolute top-3 left-3 md:top-4 md:left-4">
                                    <span className={`px-2 md:px-2.5 py-1 bg-white/90 backdrop-blur-md rounded-lg text-[8px] font-black uppercase tracking-widest border border-blue-100 shadow-sm ${plan.status === 'ACTIVE' ? 'text-blue-600' : 'text-slate-400'}`}>
                                        V{plan.version} • {plan.status}
                                    </span>
                                </div>
                            </div>

                            <div className="p-5 md:p-6 flex-1 flex flex-col justify-between">
                                <div className="space-y-1.5 md:space-y-2">
                                    <h4 className="font-black text-slate-800 uppercase text-xs md:text-sm tracking-tight truncate">{plan.name}</h4>
                                    <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase truncate">ID: {plan.file_name}</p>
                                </div>

                                <div className="mt-4 md:mt-6 flex items-center justify-between border-t border-slate-50 pt-3 md:pt-4">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 text-blue-600">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            <span className="text-[9px] md:text-[10px] font-black uppercase">{plan.active_inspections || 0} Points</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete this layout?')) onDeletePlan(plan.id); }} className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all"><Trash2 className="w-4 h-4" /></button>
                                        <button onClick={() => onSelectPlan(plan)} className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-blue-600 transition-all shadow-lg active:scale-90"><ChevronRight className="w-5 h-5" /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
