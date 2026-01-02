
import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import { Search, Plus, Calendar, CheckCircle2, Clock, PauseCircle, ChevronRight, User as UserIcon, ImageIcon } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
}

const STATUS_COLORS = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed': 'bg-green-100 text-green-700',
  'On Hold': 'bg-orange-100 text-orange-700',
  'Planning': 'bg-slate-100 text-slate-700'
};

const STATUS_ICONS = {
  'In Progress': <Clock className="w-4 h-4" />,
  'Completed': <CheckCircle2 className="w-4 h-4" />,
  'On Hold': <PauseCircle className="w-4 h-4" />,
  'Planning': <Calendar className="w-4 h-4" />
};

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onSelectProject }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'All' | 'In Progress' | 'Completed' | 'On Hold'>('All');

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filter === 'All' || p.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [projects, searchTerm, filter]);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-slate-200 sticky top-0 z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Project Master Plan</h2>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95">
            <Plus className="w-5 h-5" /> New
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by Project ID or Name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-100 border-none rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
            {(['All', 'In Progress', 'Completed', 'On Hold'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${
                  filter === f 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p>No projects found matching your criteria.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map(project => {
              // Prioritize the first image from the gallery, fallback to default thumbnail
              const displayImage = (project.images && project.images.length > 0) 
                ? project.images[0] 
                : project.thumbnail;

              return (
                <div key={project.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                  {/* Status Badge */}
                  <div className="flex justify-between items-start mb-4">
                     <div className="flex items-center gap-2">
                        <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                          {project.code}
                        </span>
                     </div>
                     <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[project.status]}`}>
                        {STATUS_ICONS[project.status]} {project.status}
                     </span>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                     {/* Thumbnail */}
                     <div className="w-full md:w-32 h-32 md:h-32 rounded-xl bg-slate-100 shrink-0 overflow-hidden border border-slate-100 relative">
                        {displayImage ? (
                          <img src={displayImage} alt={project.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <ImageIcon className="w-10 h-10" />
                          </div>
                        )}
                     </div>

                     {/* Info */}
                     <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">{project.name}</h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8 mb-4">
                            <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                               <Calendar className="w-4 h-4 text-slate-400" />
                               <span>Start: {project.startDate}</span>
                            </div>
                            <div className={`flex items-center gap-2 text-sm font-medium ${new Date(project.endDate) < new Date() && project.status !== 'Completed' ? 'text-red-600' : 'text-slate-500'}`}>
                               <Clock className="w-4 h-4 text-slate-400" />
                               <span>Due: {project.endDate}</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex -space-x-2">
                                {/* Mock Team Avatars */}
                                {[1,2,3].map(i => (
                                  <img key={i} className="w-8 h-8 rounded-full border-2 border-white" src={`https://ui-avatars.com/api/?name=User+${i}&background=random`} alt="" />
                                ))}
                            </div>
                            <button 
                              onClick={() => onSelectProject(project.id)}
                              className="text-blue-600 font-bold text-sm flex items-center gap-1 hover:gap-2 transition-all"
                            >
                              View Details <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                     </div>
                  </div>
                  
                  {/* Progress Bar (Only visible for active projects) */}
                  {project.status === 'In Progress' && (
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100">
                          <div className="h-full bg-blue-600" style={{ width: `${project.progress}%` }}></div>
                      </div>
                  )}
                  <div className={`absolute left-0 top-6 h-12 w-1 rounded-r-full ${project.status === 'Completed' ? 'bg-green-500' : project.status === 'On Hold' ? 'bg-orange-500' : 'bg-blue-600'}`}></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
