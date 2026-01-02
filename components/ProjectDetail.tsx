
import React, { useState, useMemo, useRef } from 'react';
import { Project, Inspection, InspectionStatus } from '../types';
import { ArrowLeft, MapPin, Calendar, User, LayoutGrid, CheckCircle2, AlertTriangle, Clock, PieChart as PieChartIcon, ShieldCheck, Users, Building2, Hash, Edit3, Save, X, Loader2, ExternalLink, Locate, Image as ImageIcon, Camera, Trash2, Plus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { updateProject } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';

interface ProjectDetailProps {
  project: Project;
  inspections: Inspection[];
  onBack: () => void;
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'];

const resizeImage = (base64Str: string, maxWidth = 1200): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project: initialProject, inspections, onBack }) => {
  const [project, setProject] = useState(initialProject);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Filter inspections for this project
  const projectInspections = useMemo(() => {
    return inspections.filter(i => 
        (i.ma_ct && project.code && i.ma_ct.includes(project.code)) || 
        (i.ma_ct === project.name)
    );
  }, [inspections, project]);

  const stats = useMemo(() => {
    const total = projectInspections.length;
    const completed = projectInspections.filter(i => i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED).length;
    const flagged = projectInspections.filter(i => i.status === InspectionStatus.FLAGGED).length;
    const drafts = projectInspections.filter(i => i.status === InspectionStatus.DRAFT).length;
    
    return {
        total, completed, flagged, drafts,
        passRate: total > 0 ? Math.round((completed / (completed + flagged)) * 100) || 0 : 0
    };
  }, [projectInspections]);

  const pieData = [
    { name: 'Pass', value: stats.completed },
    { name: 'Fail', value: stats.flagged },
    { name: 'Draft', value: stats.drafts },
  ].filter(d => d.value > 0);

  const handleEditClick = () => {
      setEditForm({
          manager: project.manager,
          pc: project.pc,
          qa: project.qa,
          location: project.location,
          startDate: project.startDate,
          endDate: project.endDate,
          status: project.status,
          description: project.description,
          progress: project.progress,
          images: project.images || [],
      });
      setIsEditing(true);
  };

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(function(position) {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const locationString = `${lat}, ${lng}`;
          setEditForm(prev => ({ ...prev, location: locationString }));
          setIsGettingLocation(false);
        }, function(error) {
          console.error("Error getting location", error);
          alert("Không thể lấy vị trí hiện tại. Vui lòng kiểm tra quyền truy cập.");
          setIsGettingLocation(false);
        });
      } else {
        alert("Trình duyệt không hỗ trợ định vị.");
        setIsGettingLocation(false);
      }
  };

  const handleSave = async () => {
      setIsSaving(true);
      try {
          const updatedProject: Project = {
              ...project,
              ...editForm as any
          };
          await updateProject(updatedProject);
          setProject(updatedProject);
          setIsEditing(false);
      } catch (error) {
          alert("Lỗi khi lưu thông tin dự án.");
      } finally {
          setIsSaving(false);
      }
  };

  const openGoogleMaps = () => {
      if (project.location) {
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location)}`, '_blank');
      }
  };

  const handleModalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
        const processedImages = await Promise.all(
            Array.from(files).map((file: File) => {
                return new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        const resized = await resizeImage(reader.result as string);
                        resolve(resized);
                    };
                    reader.readAsDataURL(file);
                });
            })
        );

        setEditForm(prev => ({
            ...prev,
            images: [...(prev.images || []), ...processedImages]
        }));
    } catch (err) {
        console.error("Upload error:", err);
        alert("Lỗi khi tải ảnh.");
    } finally {
        if (modalFileInputRef.current) modalFileInputRef.current.value = '';
    }
  };

  const handleModalRemoveImage = (index: number) => {
      setEditForm(prev => ({
          ...prev,
          images: prev.images?.filter((_, i) => i !== index)
      }));
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-20 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-90">
                <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="overflow-hidden">
                <h2 className="text-lg md:text-xl font-black text-slate-900 leading-none truncate max-w-[200px] md:max-w-md">{project.name}</h2>
                <p className="text-xs text-slate-500 font-mono mt-1">{project.code}</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
             <div className={`px-3 py-1 rounded-full text-xs font-bold border ${project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                 {project.status}
             </div>
             <button onClick={handleEditClick} className="p-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors active:scale-90">
                 <Edit3 className="w-4 h-4" />
             </button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
         {/* Top Info Cards */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* Project Info Card */}
             <div className="bg-white p-6 rounded-[20px] border border-slate-200 shadow-sm">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-6">Project Info</h3>
                 <div className="space-y-6">
                     {/* Ma CT & Ten CT from Plan */}
                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                             <Hash className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Mã Công Trình</p>
                             <p className="text-sm font-bold text-slate-800">{project.ma_ct}</p>
                         </div>
                     </div>
                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                             <Building2 className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Tên Công Trình</p>
                             <p className="text-sm font-bold text-slate-800 leading-tight">{project.ten_ct}</p>
                         </div>
                     </div>

                     {/* Manager (PM) */}
                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                             <User className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Manager (PM)</p>
                             <p className="text-sm font-bold text-slate-800">{project.manager || '---'}</p>
                         </div>
                     </div>
                     
                     {/* Timeline */}
                     <div className="flex items-start gap-4">
                         <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                             <Calendar className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Timeline</p>
                             <p className="text-sm font-bold text-slate-800">{project.startDate} - {project.endDate}</p>
                         </div>
                     </div>
                     
                     {/* Location */}
                     <div className="flex items-start gap-4 group">
                         <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                             <MapPin className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Location</p>
                             <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-800">{project.location || 'N/A'}</p>
                                {project.location && (
                                    <button 
                                        onClick={openGoogleMaps}
                                        className="p-1 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Xem trên Google Maps"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </button>
                                )}
                             </div>
                             {project.location && (
                                 <button onClick={openGoogleMaps} className="text-[10px] font-bold text-blue-600 hover:underline mt-1 flex items-center gap-1 md:hidden">
                                     <MapPin className="w-3 h-3" /> Xem bản đồ
                                 </button>
                             )}
                         </div>
                     </div>

                     {/* PC & QA Section */}
                     <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                <Users className="w-3 h-3" /> PC
                            </div>
                            <p className="text-xs font-bold text-slate-700">{project.pc || '---'}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                <ShieldCheck className="w-3 h-3" /> QA
                            </div>
                            <p className="text-xs font-bold text-slate-700">{project.qa || '---'}</p>
                        </div>
                     </div>
                 </div>
             </div>

             {/* Description */}
             <div className="bg-white p-5 rounded-[20px] border border-slate-200 shadow-sm flex flex-col">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Overview</h3>
                 <p className="text-sm text-slate-600 leading-relaxed italic flex-1 whitespace-pre-wrap">
                     {project.description || 'No description available for this project.'}
                 </p>
                 <div className="mt-4">
                     <div className="flex justify-between text-xs font-bold mb-1">
                         <span>Overall Progress</span>
                         <span>{project.progress}%</span>
                     </div>
                     <div className="w-full bg-slate-100 rounded-full h-2">
                         <div className="bg-blue-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${project.progress}%` }}></div>
                     </div>
                 </div>
             </div>

             {/* QA/QC Quick Stats */}
             <div className="bg-white p-5 rounded-[20px] border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 w-full text-left">Quality Stats</h3>
                 <div className="flex items-center w-full justify-around h-full">
                     <div className="w-24 h-24 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    innerRadius={25}
                                    outerRadius={35}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-xs font-bold text-slate-700">{stats.passRate}%</span>
                            <span className="text-[8px] text-slate-400 uppercase">Pass</span>
                        </div>
                     </div>
                     <div className="space-y-2">
                         <div className="flex items-center gap-2 text-xs">
                             <div className="w-2 h-2 rounded-full bg-green-500"></div>
                             <span className="font-bold text-slate-700">{stats.completed} OK</span>
                         </div>
                         <div className="flex items-center gap-2 text-xs">
                             <div className="w-2 h-2 rounded-full bg-red-500"></div>
                             <span className="font-bold text-slate-700">{stats.flagged} NG</span>
                         </div>
                         <div className="flex items-center gap-2 text-xs">
                             <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                             <span className="font-bold text-slate-700">{stats.drafts} Draft</span>
                         </div>
                     </div>
                 </div>
             </div>
         </div>

         {/* Project Gallery - READ ONLY */}
         <div className="bg-white p-5 rounded-[20px] border border-slate-200 shadow-sm">
             <div className="flex items-center justify-between mb-4">
                 <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     <ImageIcon className="w-4 h-4" /> Project Gallery ({project.images?.length || 0})
                 </h3>
             </div>
             
             {project.images && project.images.length > 0 ? (
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                     {project.images.map((img, idx) => (
                         <div 
                            key={idx} 
                            onClick={() => setLightboxState({ images: project.images || [], index: idx })}
                            className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 cursor-zoom-in"
                         >
                             <img src={img} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" alt={`Project Image ${idx}`} />
                         </div>
                     ))}
                 </div>
             ) : (
                 <div className="p-8 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                     <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
                     <p className="text-xs font-bold uppercase opacity-50">No photos available</p>
                 </div>
             )}
         </div>

         {/* Related Inspections List */}
         <div className="bg-white rounded-[20px] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                 <LayoutGrid className="w-4 h-4 text-slate-500" />
                 <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">Recent Inspections</h3>
             </div>
             <div className="divide-y divide-slate-100">
                 {projectInspections.length > 0 ? (
                     projectInspections.slice(0, 5).map(inspection => (
                         <div key={inspection.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                             <div className="flex items-start gap-3">
                                 <div className={`p-2 rounded-lg ${inspection.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                     {inspection.status === InspectionStatus.FLAGGED ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                 </div>
                                 <div>
                                     <p className="text-sm font-bold text-slate-800">{inspection.ten_hang_muc || 'Unnamed Item'}</p>
                                     <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                         <span>{inspection.date}</span>
                                         <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                         <span>{inspection.inspectorName}</span>
                                     </p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <span className={`text-xs font-bold px-2 py-1 rounded border ${
                                     inspection.status === InspectionStatus.APPROVED ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                     inspection.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' :
                                     'bg-slate-50 text-slate-600 border-slate-200'
                                 }`}>
                                     {inspection.status}
                                 </span>
                             </div>
                         </div>
                     ))
                 ) : (
                     <div className="p-8 text-center text-slate-400 italic">
                         No inspections recorded for this project yet.
                     </div>
                 )}
             </div>
         </div>
      </div>

      {lightboxState && (
        <ImageEditorModal 
          images={lightboxState.images}
          initialIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
          readOnly={true}
        />
      )}

      {/* Edit Modal */}
      {isEditing && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                          <Edit3 className="w-5 h-5 text-blue-600"/> Cập nhật thông tin dự án
                      </h3>
                      <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 active:scale-90 transition-transform">
                          <X className="w-6 h-6"/>
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto space-y-4">
                      <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 mb-2">
                          <strong>Lưu ý:</strong> Mã dự án và Tên dự án được đồng bộ từ danh sách kế hoạch và không thể chỉnh sửa tại đây.
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Trạng thái</label>
                              <select 
                                  value={editForm.status} 
                                  onChange={e => setEditForm({...editForm, status: e.target.value as any})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold"
                              >
                                  <option value="Planning">Planning</option>
                                  <option value="In Progress">In Progress</option>
                                  <option value="On Hold">On Hold</option>
                                  <option value="Completed">Completed</option>
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Tiến độ (%)</label>
                              <input 
                                  type="number" 
                                  min="0" max="100"
                                  value={editForm.progress} 
                                  onChange={e => setEditForm({...editForm, progress: Number(e.target.value)})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold"
                              />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Quản lý dự án (PM)</label>
                          <input 
                              type="text" 
                              value={editForm.manager || ''} 
                              onChange={e => setEditForm({...editForm, manager: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              placeholder="Tên PM..."
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Phụ trách (PC)</label>
                              <input 
                                  type="text" 
                                  value={editForm.pc || ''} 
                                  onChange={e => setEditForm({...editForm, pc: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                  placeholder="Tên PC..."
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">QA/QC</label>
                              <input 
                                  type="text" 
                                  value={editForm.qa || ''} 
                                  onChange={e => setEditForm({...editForm, qa: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                  placeholder="Tên QA..."
                              />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">ĐỊA ĐIỂM (LOCATION)</label>
                          <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={editForm.location || ''} 
                                onChange={e => setEditForm({...editForm, location: e.target.value})}
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                placeholder="Vị trí thi công..."
                            />
                            <button
                                onClick={handleGetLocation}
                                disabled={isGettingLocation}
                                className="px-3 py-2 bg-slate-100 text-blue-600 border border-slate-200 rounded-lg hover:bg-blue-50 flex items-center justify-center transition-colors disabled:opacity-50"
                                title="Lấy vị trí hiện tại"
                            >
                                {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Locate className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-400 italic mt-1">* Nhập địa chỉ hoặc lấy tọa độ GPS hiện tại</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày bắt đầu</label>
                              <input 
                                  type="date" 
                                  value={editForm.startDate || ''} 
                                  onChange={e => setEditForm({...editForm, startDate: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày kết thúc</label>
                              <input 
                                  type="date" 
                                  value={editForm.endDate || ''} 
                                  onChange={e => setEditForm({...editForm, endDate: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                              />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Mô tả dự án</label>
                          <textarea 
                              value={editForm.description || ''} 
                              onChange={e => setEditForm({...editForm, description: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm h-24 resize-none"
                              placeholder="Thông tin chi tiết..."
                          />
                      </div>

                      {/* Modal Image Gallery */}
                      <div className="space-y-2">
                          <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">HÌNH ẢNH DỰ ÁN ({editForm.images?.length || 0})</label>
                              <button 
                                  onClick={() => modalFileInputRef.current?.click()}
                                  className="text-[10px] text-blue-600 font-bold uppercase hover:underline flex items-center gap-1"
                              >
                                  <Plus className="w-3 h-3" /> Thêm ảnh
                              </button>
                              <input 
                                  type="file" 
                                  ref={modalFileInputRef} 
                                  className="hidden" 
                                  multiple 
                                  accept="image/*" 
                                  onChange={handleModalImageUpload} 
                              />
                          </div>
                          
                          <div className="grid grid-cols-4 gap-2">
                              {editForm.images?.map((img, idx) => (
                                  <div key={idx} className="relative aspect-square group">
                                      <img src={img} className="w-full h-full object-cover rounded-lg border border-slate-200" />
                                      <button 
                                          onClick={() => handleModalRemoveImage(idx)}
                                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                      >
                                          <X className="w-3 h-3" />
                                      </button>
                                  </div>
                              ))}
                              {(!editForm.images || editForm.images.length === 0) && (
                                  <div 
                                      onClick={() => modalFileInputRef.current?.click()}
                                      className="col-span-4 border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 transition-colors"
                                  >
                                      <Camera className="w-6 h-6 mb-1 opacity-50" />
                                      <span className="text-[10px] font-bold uppercase">Chưa có ảnh</span>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                      <button 
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors"
                      >
                          Hủy bỏ
                      </button>
                      <button 
                          onClick={handleSave}
                          disabled={isSaving}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center gap-2"
                      >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                          Lưu thay đổi
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
