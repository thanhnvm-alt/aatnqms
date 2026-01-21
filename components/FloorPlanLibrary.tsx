
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
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');

    const filteredPlans = plans.filter(p => {
        if (filter === 'ALL') return true;
        return p.status === filter;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                        <Layers className="w-6 h-6 text-blue-600" />
                        Floor Plan Library
                    </h3>
                    <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">
                        Manage architectural levels & version history
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
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
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        Upload New Layout
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                    <p className="font-black uppercase tracking-widest text-xs">Loading Drawing Library...</p>
                </div>
            ) : filteredPlans.length === 0 ? (
                <div 
                    onClick={onUploadPlan}
                    className="py-24 border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-slate-300 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all cursor-pointer group"
                >
                    <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Upload className="w-10 h-10" />
                    </div>
                    <p className="font-black uppercase tracking-widest text-sm">Upload first floor plan</p>
                    <p className="text-[10px] font-bold mt-2">Drag and drop PDF, DWG or High-res images here</p>
                </div>
            ) : (
                <div className={`grid ${viewMode === 'GRID' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'} gap-6`}>
                    {filteredPlans.map(plan => (
                        <div 
                            key={plan.id}
                            className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:border-blue-300 transition-all animate-in zoom-in duration-300"
                        >
                            <div 
                                onClick={() => onSelectPlan(plan)}
                                className="aspect-[4/3] bg-slate-100 relative cursor-pointer overflow-hidden border-b border-slate-50"
                            >
                                <img src={plan.image_url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" alt="" />
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="absolute top-4 left-4">
                                    <span className="px-2.5 py-1 bg-white/90 backdrop-blur-md text-blue-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-blue-100 shadow-sm">
                                        v{plan.version} ({plan.status})
                                    </span>
                                </div>
                            </div>

                            <div className="p-6 flex-1 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <h4 className="font-black text-slate-800 uppercase text-sm tracking-tight truncate">{plan.name}</h4>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase truncate">File: {plan.file_name}</p>
                                </div>

                                <div className="mt-6 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 text-blue-600">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-black">{plan.active_inspections || 0} ACTIVE</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Updated {new Date(plan.updated_at * 1000).toLocaleDateString()}</span>
                                    </div>
                                    <button onClick={() => onSelectPlan(plan)} className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-blue-600 transition-all shadow-lg active:scale-90">
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
