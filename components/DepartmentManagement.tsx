import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User } from '../types';
import { Building, Plus, Trash2, Edit2, X, Loader2, Users, FolderTree, ShieldCheck, ChevronLeft, RefreshCw, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { Combobox, ConfirmDialog } from '../src/components/qms';
import {
    fetchUsers,
    saveUser,
    fetchDepartments,
    saveDepartment,
    deleteDepartment,
    fetchDivisions,
    saveDivision,
    deleteDivision,
    fetchTeams,
    saveTeam,
    deleteTeam,
    syncDepartmentsAdmin
} from '../services/apiService';

interface Department {
    id: string;
    name: string;
    divisions: string[];
}

interface Division {
    id: string;
    name: string;
    departmentId: string;
}

interface Team {
    id: string;
    name: string;
    divisionId: string;
    leaderId?: string | null;
}

interface DepartmentManagementProps {
    isReadOnly?: boolean;
}

export const DepartmentManagement: React.FC<DepartmentManagementProps> = ({ isReadOnly = false }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);

    // Cascading selection state
    const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
    const [selectedDivId, setSelectedDivId] = useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [activeMobileCol, setActiveMobileCol] = useState(0);

    // Lists
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    // Modals & Edits
    const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [deptName, setDeptName] = useState('');

    const [isDivModalOpen, setIsDivModalOpen] = useState(false);
    const [editingDiv, setEditingDiv] = useState<Division | null>(null);
    const [divName, setDivName] = useState('');
    const [divDeptId, setDivDeptId] = useState('');

    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [teamName, setTeamName] = useState('');
    const [teamDivId, setTeamDivId] = useState('');
    const [teamLeaderId, setTeamLeaderId] = useState<string>('');

    // User change dept modal state
    const [isChangeDeptModalOpen, setIsChangeDeptModalOpen] = useState(false);
    const [userToChangeDept, setUserToChangeDept] = useState<User | null>(null);
    const [newDeptId, setNewDeptId] = useState('');
    const [newDivId, setNewDivId] = useState('');
    const [newTeamId, setNewTeamId] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<{
        type: 'DEPT' | 'DIV' | 'TEAM';
        id: string;
        name: string;
    } | null>(null);

    // Responsive Column Sizing State (proportional flex weights on lg+, single column on < lg)
    const [colWeights, setColWeights] = useState([1, 1, 1, 1.25]);
    const columnsContainerRef = useRef<HTMLDivElement>(null);

    const startDrag = (index: number) => (e: React.MouseEvent) => {
        e.preventDefault();
        const containerWidth = columnsContainerRef.current?.clientWidth || 1000;
        const startX = e.clientX;
        const initialWeights = [...colWeights];
        const totalWeight = initialWeights.reduce((a, b) => a + b, 0);
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaWeight = ((moveEvent.clientX - startX) / containerWidth) * totalWeight;
            setColWeights(() => {
                const next = [...initialWeights];
                if (index < 3) {
                    const pairSum = initialWeights[index] + initialWeights[index + 1];
                    const w0 = Math.min(pairSum - 0.55, Math.max(0.55, initialWeights[index] + deltaWeight));
                    next[index] = w0;
                    next[index + 1] = pairSum - w0;
                }
                return next;
            });
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [uData, dData, dvData, tData] = await Promise.all([
                fetchUsers().catch(() => []),
                fetchDepartments().catch(() => []),
                fetchDivisions().catch(() => []),
                fetchTeams().catch(() => []),
            ]);
            setUsers(Array.isArray(uData) ? uData : []);
            setDepartments(Array.isArray(dData) ? dData : []);
            setDivisions(Array.isArray(dvData) ? dvData : []);
            setTeams(Array.isArray(tData) ? tData : []);
        } catch (err: any) {
            setFeedback({ type: 'error', message: err?.message || 'Không thể tải dữ liệu sơ đồ tổ chức.' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ---------------- DEPARTMENTS CRUD ----------------
    const handleOpenDeptModal = (dept?: Department) => {
        if (isReadOnly) return;
        setModalError(null);
        if (dept) {
            setEditingDept(dept);
            setDeptName(dept.name);
        } else {
            setEditingDept(null);
            setDeptName('');
        }
        setIsDeptModalOpen(true);
    };

    const handleSaveDept = async () => {
        if (isReadOnly) return;
        const title = deptName.trim();
        if (!title) {
            setModalError('Tên phòng ban không được để trống.');
            return;
        }

        setIsSaving(true);
        setModalError(null);
        const payload = {
            id: editingDept ? editingDept.id : 'dept-' + Date.now(),
            name: title,
            divisions: editingDept ? editingDept.divisions : []
        };

        try {
            await saveDepartment(payload);
            await fetchData();
            setIsDeptModalOpen(false);
            setFeedback({
                type: 'success',
                message: editingDept ? `Đã cập nhật phòng ban "${title}".` : `Đã thêm phòng ban "${title}".`,
            });
        } catch (err: any) {
            setModalError(err?.message || 'Lỗi lưu phòng ban.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDept = (id: string, name: string) => {
        if (isReadOnly) return;
        setDeleteConfirm({ type: 'DEPT', id, name });
    };

    // ---------------- DIVISIONS CRUD ----------------
    const handleOpenDivModal = (div?: Division, defaultDeptId?: string) => {
        if (isReadOnly) return;
        setModalError(null);
        if (div) {
            setEditingDiv(div);
            setDivName(div.name);
            setDivDeptId(div.departmentId);
        } else {
            setEditingDiv(null);
            setDivName('');
            setDivDeptId(defaultDeptId || departments[0]?.id || '');
        }
        setIsDivModalOpen(true);
    };

    const handleSaveDiv = async () => {
        if (isReadOnly) return;
        const title = divName.trim();
        if (!title) {
            setModalError('Tên bộ phận không được để trống.');
            return;
        }
        if (!divDeptId) {
            setModalError('Vui lòng chọn Phòng ban trực thuộc.');
            return;
        }

        setIsSaving(true);
        setModalError(null);
        const payload = {
            id: editingDiv ? editingDiv.id : 'div-' + Date.now(),
            name: title,
            departmentId: divDeptId
        };

        try {
            await saveDivision(payload);
            await fetchData();
            setIsDivModalOpen(false);
            setFeedback({
                type: 'success',
                message: editingDiv ? `Đã cập nhật bộ phận "${title}".` : `Đã thêm bộ phận "${title}".`,
            });
        } catch (err: any) {
            setModalError(err?.message || 'Lỗi lưu bộ phận.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDiv = (id: string, name: string) => {
        if (isReadOnly) return;
        setDeleteConfirm({ type: 'DIV', id, name });
    };

    // ---------------- TEAMS CRUD ----------------
    const handleOpenTeamModal = (tm?: Team, defaultDivId?: string) => {
        if (isReadOnly) return;
        setModalError(null);
        if (tm) {
            setEditingTeam(tm);
            setTeamName(tm.name);
            setTeamDivId(tm.divisionId);
            setTeamLeaderId(tm.leaderId || '');
        } else {
            setEditingTeam(null);
            setTeamName('');
            setTeamDivId(defaultDivId || divisions[0]?.id || '');
            setTeamLeaderId('');
        }
        setIsTeamModalOpen(true);
    };

    const handleSaveTeam = async () => {
        if (isReadOnly) return;
        const title = teamName.trim();
        if (!title) {
            setModalError('Tên tổ/nhóm không được để trống.');
            return;
        }
        if (!teamDivId) {
            setModalError('Vui lòng chọn Bộ phận trực thuộc.');
            return;
        }

        setIsSaving(true);
        setModalError(null);
        const payload = {
            id: editingTeam ? editingTeam.id : 'team-' + Date.now(),
            name: title,
            divisionId: teamDivId,
            leaderId: teamLeaderId || null
        };

        try {
            await saveTeam(payload);
            await fetchData();
            setIsTeamModalOpen(false);
            setFeedback({
                type: 'success',
                message: editingTeam ? `Đã cập nhật tổ "${title}".` : `Đã thêm tổ "${title}".`,
            });
        } catch (err: any) {
            setModalError(err?.message || 'Lỗi lưu tổ/nhóm.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTeam = (id: string, name: string) => {
        if (isReadOnly) return;
        setDeleteConfirm({ type: 'TEAM', id, name });
    };

    const executeDeleteOrg = async () => {
        if (!deleteConfirm || isReadOnly) return;
        const { type, id, name } = deleteConfirm;
        setIsDeleting(true);
        try {
            if (type === 'DEPT') {
                await deleteDepartment(id);
                if (selectedDeptId === id) {
                    setSelectedDeptId(null);
                    setSelectedDivId(null);
                    setSelectedTeamId(null);
                }
            } else if (type === 'DIV') {
                await deleteDivision(id);
                if (selectedDivId === id) {
                    setSelectedDivId(null);
                    setSelectedTeamId(null);
                }
            } else {
                await deleteTeam(id);
                if (selectedTeamId === id) {
                    setSelectedTeamId(null);
                }
            }
            await fetchData();
            setFeedback({ type: 'success', message: `Đã xóa "${name}" thành công.` });
            setDeleteConfirm(null);
        } catch (err: any) {
            setFeedback({ type: 'error', message: err?.message || `Không thể xóa "${name}".` });
            setDeleteConfirm(null);
        } finally {
            setIsDeleting(false);
        }
    };

    // ---------------- USER CHANGE DEPT ----------------
    const handleOpenChangeDeptModal = (user: User) => {
        if (isReadOnly) return;
        setModalError(null);
        setUserToChangeDept(user);
        setNewDeptId(user.department_id || '');
        setNewDivId(user.division_id || '');
        setNewTeamId(user.team_id || '');
        setIsChangeDeptModalOpen(true);
    };

    const handleSaveChangeDept = async () => {
        if (!userToChangeDept || isReadOnly) return;
        setIsSaving(true);
        setModalError(null);

        const newDeptName = departments.find(d => d.id === newDeptId)?.name || '';
        const newDivName = divisions.find(d => d.id === newDivId)?.name || '';
        const newTeamName = teams.find(t => t.id === newTeamId)?.name || '';

        const payload = {
            ...userToChangeDept,
            department_id: newDeptId || null,
            division_id: newDivId || null,
            team_id: newTeamId || null,
            phong_ban: newDeptName,
            bo_phan: newDivName,
            to_qc: newTeamName
        };

        try {
            await saveUser(payload);
            await fetchData();
            setIsChangeDeptModalOpen(false);
            setFeedback({
                type: 'success',
                message: `Đã cập nhật cơ cấu tổ chức cho "${userToChangeDept.name}".`,
            });
        } catch (err: any) {
            setModalError(err?.message || 'Lỗi khi lưu thay đổi phòng ban.');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredDivisions = selectedDeptId ? divisions.filter(d => d.departmentId === selectedDeptId) : [];
    const filteredTeams = selectedDivId ? teams.filter(t => t.divisionId === selectedDivId) : [];
    const selectedDept = departments.find(d => d.id === selectedDeptId);
    const selectedDiv = divisions.find(d => d.id === selectedDivId);
    const selectedTeam = teams.find(t => t.id === selectedTeamId);
    const filteredUsers = selectedTeamId
        ? users.filter(u => u.team_id === selectedTeamId || (selectedTeam?.name && u.to_qc === selectedTeam.name))
        : selectedDivId
        ? users.filter(u => u.division_id === selectedDivId || (selectedDiv?.name && u.bo_phan === selectedDiv.name))
        : selectedDeptId
        ? users.filter(u => u.department_id === selectedDeptId || (selectedDept?.name && u.phong_ban === selectedDept.name))
        : users;
    
    const handleSyncDepartmentsData = async () => {
        if (isReadOnly) return;
        setIsSyncing(true);
        setFeedback(null);
        try {
            const data = await syncDepartmentsAdmin();
            await fetchData();
            setFeedback({
                type: 'success',
                message: `Đồng bộ thành công: Đã kiểm tra ${data?.totalChecked || 0} hồ sơ nhân sự và cập nhật liên kết 2 chiều cho ${data?.updatedCount || 0} tài khoản.`,
            });
        } catch (err: any) {
            setFeedback({
                type: 'error',
                message: err?.message || 'Không thể đồng bộ dữ liệu phòng ban.',
            });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-2 lg:space-y-4 animate-in fade-in duration-300 flex flex-col h-[calc(100dvh-140px)] lg:h-[calc(100dvh-110px)]">
            {/* Header section card */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 dark:shadow-none">
                        <FolderTree className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Sơ đồ Tổ chức phòng ban</h3>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Quản lý cấu trúc Phòng ban &rarr; Bộ phận &rarr; Tổ (Team) & Tổ trưởng</p>
                    </div>
                </div>
                {!isReadOnly && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={handleSyncDepartmentsData}
                            disabled={isSyncing}
                            className="w-full sm:w-auto min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-2xl hover:bg-blue-100 transition-all font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                            title="Đồng bộ lại tên hiển thị (phong_ban, bo_phan, to_qc) và ID cấu trúc cho toàn bộ nhân sự"
                        >
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Dữ liệu Nhân sự'}</span>
                        </button>
                    </div>
                )}
            </div>

            {isReadOnly && (
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2 shrink-0">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Chế độ chỉ xem: Chỉ tài khoản ADMIN mới được thêm, sửa, xóa phòng ban hoặc đồng bộ sơ đồ nhân sự.</span>
                </div>
            )}

            {feedback && (
                <div className={`p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs font-semibold shrink-0 ${feedback.type === 'success' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
                    <div className="flex items-center gap-2">
                        {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{feedback.message}</span>
                    </div>
                    <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng thông báo" className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Đang đồng bộ dữ liệu Postgres...</p>
                </div>
            ) : (
                <div ref={columnsContainerRef} className="flex-1 min-h-0 flex lg:gap-3 lg:flex-row pb-16 lg:pb-2 h-full w-full overflow-x-auto lg:overflow-x-hidden">
                    
                    {/* CỘT 1: PHÒNG BAN */}
                    <div 
                        className={`flex flex-col bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:min-w-[180px] ${activeMobileCol !== 0 ? 'hidden lg:flex' : ''}`}
                        style={{ flex: `${colWeights[0]} 1 0%` }}
                    >
                        <div 
                            className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                            onMouseDown={startDrag(0)}
                        />
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <h3 className="font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <Building className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                Phòng Ban ({departments.length})
                            </h3>
                            {!isReadOnly && (
                                <button type="button" onClick={() => handleOpenDeptModal()} aria-label="Thêm phòng ban" className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-blue-600 dark:text-blue-400">
                                    <Plus className="w-5 h-5 lg:w-4 lg:h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                            {departments.map(dept => (
                                <div 
                                    key={dept.id} 
                                    onClick={() => { setSelectedDeptId(dept.id); setSelectedDivId(null); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(1); }}
                                    className={`p-3.5 rounded-2xl cursor-pointer border transition-all flex flex-col gap-2 group ${selectedDeptId === dept.id ? 'bg-blue-600 border-blue-600 shadow-md transform scale-[1.02]' : 'bg-white dark:bg-slate-900 border-transparent hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md'}`}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <div className={`font-black text-sm uppercase tracking-tight ${selectedDeptId === dept.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{dept.name}</div>
                                            <div className={`text-[10px] font-mono mt-0.5 ${selectedDeptId === dept.id ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>{dept.id}</div>
                                        </div>
                                        {!isReadOnly && (
                                            <div className={`flex gap-1.5 transition-opacity shrink-0 ${selectedDeptId === dept.id ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}`}>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleOpenDeptModal(dept); }} aria-label="Sửa phòng ban" className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-xl shadow-sm backdrop-blur-sm transition-all ${selectedDeptId === dept.id ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600'}`}><Edit2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteDept(dept.id, dept.name); }} aria-label="Xóa phòng ban" className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-xl shadow-sm backdrop-blur-sm transition-all ${selectedDeptId === dept.id ? 'bg-white/20 text-white hover:bg-white/30 hover:text-red-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500'}`}><Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /></button>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`text-[11px] font-bold flex items-center justify-between ${selectedDeptId === dept.id ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                        <span>{divisions.filter(d => d.departmentId === dept.id).length} Bộ phận</span>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedDeptId(dept.id); setSelectedDivId(null); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }} className={`min-h-[44px] lg:min-h-[28px] flex items-center gap-1 transition-colors px-3 lg:px-2 -mr-2 rounded-lg ${selectedDeptId === dept.id ? 'hover:bg-white/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                            <Users className="w-3.5 h-3.5" />
                                            <span>{users.filter(u => u.department_id === dept.id).length}</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {departments.length === 0 && (
                                <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">Chưa có dữ liệu</div>
                            )}
                        </div>
                    </div>

                    {/* CỘT 2: BỘ PHẬN */}
                    <div 
                        className={`flex flex-col bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border table-transition border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:min-w-[180px] ${!selectedDeptId ? 'opacity-50 pointer-events-none' : ''} ${activeMobileCol !== 1 ? 'hidden lg:flex' : ''}`}
                        style={{ flex: `${colWeights[1]} 1 0%` }}
                    >
                        <div 
                            className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                            onMouseDown={startDrag(1)}
                        />
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2">
                                <button type="button" className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 hover:text-slate-800" onClick={() => setActiveMobileCol(0)}>
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <h3 className="font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 lg:hidden" />
                                    Bộ phận ({filteredDivisions.length})
                                </h3>
                            </div>
                            {!isReadOnly && (
                                <button type="button" onClick={() => handleOpenDivModal(undefined, selectedDeptId || undefined)} aria-label="Thêm bộ phận" className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-blue-600 dark:text-blue-400" disabled={!selectedDeptId}>
                                    <Plus className="w-5 h-5 lg:w-4 lg:h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                            {!selectedDeptId ? (
                                <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                                    <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500">Chọn phòng ban</h4>
                                    <p className="text-[10px] text-slate-400/80 uppercase">Để xem các bộ phận trực thuộc</p>
                                </div>
                            ) : filteredDivisions.map(div => (
                                <div 
                                    key={div.id} 
                                    onClick={() => { setSelectedDivId(div.id); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(2); }}
                                    className={`p-3.5 rounded-2xl cursor-pointer border transition-all flex flex-col gap-2 group ${selectedDivId === div.id ? 'bg-indigo-600 border-indigo-600 shadow-md transform scale-[1.02]' : 'bg-white dark:bg-slate-900 border-transparent hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md'}`}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className={`font-black text-sm uppercase tracking-tight ${selectedDivId === div.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{div.name}</div>
                                        {!isReadOnly && (
                                            <div className={`flex gap-1.5 transition-opacity shrink-0 ${selectedDivId === div.id ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}`}>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleOpenDivModal(div); }} aria-label="Sửa bộ phận" className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-xl shadow-sm backdrop-blur-sm transition-all ${selectedDivId === div.id ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600'}`}><Edit2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteDiv(div.id, div.name); }} aria-label="Xóa bộ phận" className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-xl shadow-sm backdrop-blur-sm transition-all ${selectedDivId === div.id ? 'bg-white/20 text-white hover:bg-white/30 hover:text-red-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500'}`}><Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /></button>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`text-[11px] font-bold flex items-center justify-between mt-1 ${selectedDivId === div.id ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                        <span>{teams.filter(t => t.divisionId === div.id).length} Tổ (Team)</span>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedDivId(div.id); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }} className={`min-h-[44px] lg:min-h-[28px] flex items-center gap-1 transition-colors px-3 lg:px-2 -mr-2 rounded-lg ${selectedDivId === div.id ? 'hover:bg-white/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                            <Users className="w-3.5 h-3.5" />
                                            <span>{users.filter(u => u.division_id === div.id).length}</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {selectedDeptId && filteredDivisions.length === 0 && (
                                <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">Chưa có dữ liệu</div>
                            )}
                        </div>
                    </div>

                    {/* CỘT 3: TEAMS */}
                    <div 
                        className={`flex flex-col bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border table-transition border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:min-w-[180px] ${!selectedDivId ? 'opacity-50 pointer-events-none' : ''} ${activeMobileCol !== 2 ? 'hidden lg:flex' : ''}`}
                        style={{ flex: `${colWeights[2]} 1 0%` }}
                    >
                        <div 
                            className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                            onMouseDown={startDrag(2)}
                        />
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2">
                                <button type="button" className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 hover:text-slate-800" onClick={() => setActiveMobileCol(1)}>
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <h3 className="font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 lg:hidden" />
                                    Tổ / Team ({filteredTeams.length})
                                </h3>
                            </div>
                            {!isReadOnly && (
                                <button type="button" onClick={() => handleOpenTeamModal(undefined, selectedDivId || undefined)} aria-label="Thêm tổ" className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-blue-600 dark:text-blue-400" disabled={!selectedDivId}>
                                    <Plus className="w-5 h-5 lg:w-4 lg:h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                            {!selectedDivId ? (
                                <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                                    <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500">Chọn bộ phận</h4>
                                    <p className="text-[10px] text-slate-400/80 uppercase">Để xem các tổ trực thuộc</p>
                                </div>
                            ) : filteredTeams.map(team => {
                                const leader = users.find(u => u.id === team.leaderId);
                                return (
                                    <div 
                                        key={team.id} 
                                        onClick={() => { setSelectedTeamId(team.id); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }}
                                        className={`p-3.5 rounded-2xl cursor-pointer border transition-all flex flex-col gap-2 group ${selectedTeamId === team.id ? 'bg-emerald-600 border-emerald-600 shadow-md transform scale-[1.02]' : 'bg-white dark:bg-slate-900 border-transparent hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md'}`}
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <div className={`font-black text-sm uppercase tracking-tight pr-2 ${selectedTeamId === team.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{team.name}</div>
                                            {!isReadOnly && (
                                                <div className={`flex gap-1.5 transition-opacity shrink-0 ${selectedTeamId === team.id ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}`}>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleOpenTeamModal(team); }} aria-label="Sửa tổ" className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-xl shadow-sm backdrop-blur-sm transition-all ${selectedTeamId === team.id ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-emerald-600'}`}><Edit2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /></button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id, team.name); }} aria-label="Xóa tổ" className={`min-w-[44px] min-h-[44px] lg:min-w-[30px] lg:min-h-[30px] flex items-center justify-center rounded-xl shadow-sm backdrop-blur-sm transition-all ${selectedTeamId === team.id ? 'bg-white/20 text-white hover:bg-white/30 hover:text-red-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500'}`}><Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /></button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <div className={`text-[10px] font-bold p-1.5 rounded-xl flex items-center gap-1.5 ${selectedTeamId === team.id ? 'bg-white/10 text-emerald-100' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'}`}>
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                <span className="truncate max-w-[100px]">{leader ? `${leader.name}` : 'Chưa có'}</span>
                                            </div>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedTeamId(team.id); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }} className={`min-h-[44px] lg:min-h-[28px] text-[11px] font-bold flex items-center gap-1 transition-colors px-3 lg:px-2 -mr-2 rounded-lg ${selectedTeamId === team.id ? 'text-emerald-100 hover:bg-white/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                                <Users className="w-3.5 h-3.5" />
                                                <span>{users.filter(u => u.team_id === team.id).length}</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {selectedDivId && filteredTeams.length === 0 && (
                                <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">Chưa có dữ liệu</div>
                            )}
                        </div>
                    </div>

                    {/* CỘT 4: NHÂN SỰ */}
                    <div 
                        className={`flex flex-col bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:min-w-[210px] ${activeMobileCol !== 3 ? 'hidden lg:flex' : ''}`}
                        style={{ flex: `${colWeights[3]} 1 0%` }}
                    >
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2">
                                <button type="button" className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 hover:text-slate-800" onClick={() => setActiveMobileCol(selectedTeamId ? 2 : selectedDivId ? 1 : 0)}>
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <h3 className="font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    {selectedTeamId ? 'NS theo Tổ' : selectedDivId ? 'NS theo Bộ phận' : selectedDeptId ? 'NS theo Phòng' : 'Tất cả NS'} ({filteredUsers.length})
                                </h3>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar bg-slate-50/50 dark:bg-slate-900/20">
                            {filteredUsers.map(u => {
                                const dept = departments.find(d => d.id === u.department_id);
                                const div = divisions.find(d => d.id === u.division_id);
                                const t = teams.find(t => t.id === u.team_id);
                                return (
                                    <div key={u.id} className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-3 hover:shadow-md transition-shadow group">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-400 shrink-0">
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <h4 className="font-black text-sm text-slate-800 dark:text-slate-200 truncate">{u.name}</h4>
                                                {!isReadOnly && (
                                                    <button type="button" onClick={() => handleOpenChangeDeptModal(u)} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 min-h-[44px] lg:min-h-[30px] text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-xl transition-opacity shrink-0">ĐỔI PHÒNG</button>
                                                )}
                                            </div>
                                            <div className="text-[10px] font-mono text-slate-400 mb-1.5">{u.username} • {u.position || 'Nhân viên'}</div>
                                            
                                            <div className="space-y-0.5 flex flex-col items-start text-[9px] font-bold text-slate-500 dark:text-slate-400 border-l-2 border-slate-200 dark:border-slate-700 pl-2 ml-1">
                                                {dept && <span>Phòng: {dept.name}</span>}
                                                {div && <span>BP: {div.name}</span>}
                                                {t && <span>Tổ: {t.name}</span>}
                                                {!dept && !div && !t && <span className="italic text-slate-400">Chưa gán</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredUsers.length === 0 && (
                                <div className="h-full flex items-center justify-center p-6 text-center">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Không có nhân sự</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {typeof document !== 'undefined' && isDeptModalOpen && createPortal(
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center gap-2 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none shrink-0">
                                    <Building className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs truncate">
                                    {editingDept ? 'Cập nhật phòng ban' : 'Thêm phòng ban mới'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setIsDeptModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-3.5 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                            {modalError && (
                                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên phòng ban *</label>
                                <input 
                                    value={deptName} 
                                    onChange={e => setDeptName(e.target.value)} 
                                    className="w-full min-h-[44px] px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none transition-all rounded-2xl text-sm lg:text-xs font-bold leading-relaxed focus:bg-white" 
                                    placeholder="VD: PHÒNG SẢN XUẤT" 
                                />
                            </div>
                        </div>

                        <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex justify-end gap-2 shrink-0">
                            <button type="button" onClick={() => setIsDeptModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-colors uppercase tracking-wider whitespace-nowrap shrink-0 rounded-xl">Hủy bỏ</button>
                            <button 
                                type="button"
                                onClick={handleSaveDept} 
                                disabled={isSaving} 
                                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu lại
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {typeof document !== 'undefined' && isDivModalOpen && createPortal(
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center gap-2 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none shrink-0">
                                    <Building className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs truncate">
                                    {editingDiv ? 'Cập nhật bộ phận' : 'Thêm bộ phận mới'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setIsDivModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-3.5 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                            {modalError && (
                                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Phòng ban trực thuộc *</label>
                                <Combobox
                                    value={divDeptId || null}
                                    onChange={(val) => setDivDeptId(val || '')}
                                    options={departments.map(d => ({ value: d.id, label: d.name }))}
                                    placeholder="-- Chọn Phòng ban --"
                                    allowClear={false}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên bộ phận *</label>
                                <input 
                                    value={divName} 
                                    onChange={e => setDivName(e.target.value)} 
                                    className="w-full min-h-[44px] px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none transition-all rounded-2xl text-sm lg:text-xs font-bold leading-relaxed focus:bg-white" 
                                    placeholder="VD: BỘ PHẬN CHUẨN BỊ PQC" 
                                />
                            </div>
                        </div>

                        <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex justify-end gap-2 shrink-0">
                            <button type="button" onClick={() => setIsDivModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-colors uppercase tracking-wider whitespace-nowrap shrink-0 rounded-xl">Hủy bỏ</button>
                            <button 
                                type="button"
                                onClick={handleSaveDiv} 
                                disabled={isSaving} 
                                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu lại
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {typeof document !== 'undefined' && isTeamModalOpen && createPortal(
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center gap-2 shrink-0 rounded-t-3xl">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none shrink-0">
                                    <Building className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs truncate">
                                    {editingTeam ? 'Cập nhật Tổ (Team)' : 'Thêm Tổ (Team) mới'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setIsTeamModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-3.5 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                            {modalError && (
                                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Bộ phận trực thuộc *</label>
                                <Combobox
                                    value={teamDivId || null}
                                    onChange={(val) => setTeamDivId(val || '')}
                                    options={divisions.map(d => ({
                                        value: d.id,
                                        label: `${d.name} (${departments.find(dept => dept.id === d.departmentId)?.name || 'Unknown'})`,
                                    }))}
                                    placeholder="-- Chọn Bộ phận --"
                                    allowClear={false}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên tổ *</label>
                                <input 
                                    value={teamName} 
                                    onChange={e => setTeamName(e.target.value)} 
                                    className="w-full min-h-[44px] px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none transition-all rounded-2xl text-sm lg:text-xs font-bold leading-relaxed focus:bg-white" 
                                    placeholder="VD: TỔ LẮP RÁP 1" 
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Gán Tổ trưởng (Team Leader)</label>
                                <Combobox
                                    value={teamLeaderId || null}
                                    onChange={(val) => setTeamLeaderId(val || '')}
                                    options={users.map(u => ({
                                        value: u.id,
                                        label: `${u.name} (${u.username})`,
                                        description: u.role === 'ADMIN' ? 'Admin' : (u.position || 'Nhân viên'),
                                    }))}
                                    placeholder="-- Chưa gán / Không có Tổ trưởng --"
                                    searchPlaceholder="Tìm theo tên hoặc tài khoản..."
                                    allowClear={true}
                                    ariaLabel="Chọn Tổ trưởng"
                                />
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight leading-relaxed mt-1">
                                    Lưu ý: Khi gán Leader, hệ thống sẽ tự đặt flag la_to_truong = true và cập nhật chức vụ thành "Tổ trưởng" tự động.
                                </p>
                            </div>
                        </div>

                        <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex justify-end gap-2 shrink-0 rounded-b-3xl">
                            <button type="button" onClick={() => setIsTeamModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-colors uppercase tracking-wider whitespace-nowrap shrink-0 rounded-xl">Hủy bỏ</button>
                            <button 
                                type="button"
                                onClick={handleSaveTeam} 
                                disabled={isSaving} 
                                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu lại
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {typeof document !== 'undefined' && isChangeDeptModalOpen && userToChangeDept && createPortal(
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center gap-2 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none shrink-0">
                                    <Users className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs truncate">
                                        Đổi phòng ban / bộ phận
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">Nhân sự: {userToChangeDept.name}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setIsChangeDeptModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-3.5 sm:p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                            {modalError && (
                                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Phòng ban cấp 1</label>
                                <Combobox
                                    value={newDeptId || null}
                                    onChange={(val) => {
                                        setNewDeptId(val || '');
                                        setNewDivId('');
                                        setNewTeamId('');
                                    }}
                                    options={departments.map(d => ({ value: d.id, label: d.name }))}
                                    placeholder="-- Bỏ trống (Không gán) --"
                                    allowClear={true}
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Bộ phận cấp 2</label>
                                <Combobox
                                    value={newDivId || null}
                                    onChange={(val) => {
                                        setNewDivId(val || '');
                                        setNewTeamId('');
                                    }}
                                    options={divisions.filter(d => d.departmentId === newDeptId).map(d => ({ value: d.id, label: d.name }))}
                                    placeholder="-- Bỏ trống (Không gán) --"
                                    disabled={!newDeptId}
                                    allowClear={true}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tổ (Team) cấp 3</label>
                                <Combobox
                                    value={newTeamId || null}
                                    onChange={(val) => setNewTeamId(val || '')}
                                    options={teams.filter(t => t.divisionId === newDivId).map(t => ({ value: t.id, label: t.name }))}
                                    placeholder="-- Bỏ trống (Không gán) --"
                                    disabled={!newDivId}
                                    allowClear={true}
                                />
                            </div>
                        </div>

                        <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex justify-end gap-2 shrink-0 rounded-b-3xl">
                            <button type="button" onClick={() => setIsChangeDeptModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] px-4 py-2 sm:py-1.5 text-xs font-black text-slate-500 hover:text-slate-700 transition-colors uppercase tracking-wider whitespace-nowrap shrink-0 rounded-xl">Hủy bỏ</button>
                            <button 
                                type="button"
                                onClick={handleSaveChangeDept} 
                                disabled={isSaving} 
                                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            <ConfirmDialog
                open={deleteConfirm !== null}
                variant="danger"
                isLoading={isDeleting}
                title={
                    deleteConfirm?.type === 'DEPT' ? 'Xác nhận xóa phòng ban' :
                    deleteConfirm?.type === 'DIV' ? 'Xác nhận xóa bộ phận' :
                    'Xác nhận xóa tổ / nhóm'
                }
                message={
                    deleteConfirm?.type === 'DEPT' ? `Xóa phòng ban "${deleteConfirm.name}"? Các đối tượng và bộ phận liên quan sẽ bị ảnh hưởng.` :
                    deleteConfirm?.type === 'DIV' ? `Xóa bộ phận "${deleteConfirm.name}"? Các tổ trực thuộc cũng sẽ bị ảnh hưởng.` :
                    deleteConfirm ? `Bạn có chắc chắn muốn xóa tổ "${deleteConfirm.name}"?` : ''
                }
                confirmLabel="Xóa"
                cancelLabel="Hủy"
                onConfirm={executeDeleteOrg}
                onCancel={() => setDeleteConfirm(null)}
            />
        </div>
    );
};
