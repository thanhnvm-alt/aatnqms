import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { Building, Plus, Trash2, Edit2, X, Loader2, Users, FolderTree, ShieldCheck, ChevronDown, Search, ChevronLeft } from 'lucide-react';
import { Button } from './Button';
import { removeVietnameseTones } from '../lib/utils';

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


type TabType = 'departments' | 'divisions' | 'teams';

export const DepartmentManagement: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('departments');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

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
    const [isLeaderDropdownOpen, setIsLeaderDropdownOpen] = useState(false);
    const [leaderSearchQuery, setLeaderSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // User change dept modal state
    const [isChangeDeptModalOpen, setIsChangeDeptModalOpen] = useState(false);
    const [userToChangeDept, setUserToChangeDept] = useState<User | null>(null);
    const [newDeptId, setNewDeptId] = useState('');
    const [newDivId, setNewDivId] = useState('');
    const [newTeamId, setNewTeamId] = useState('');

    // Responsive Column Sizing State
    const [colSizes, setColSizes] = useState([300, 300, 300, 350]);

    const startDrag = (index: number) => (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const initialWidths = [...colSizes];
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            setColSizes(prev => {
                const next = [...prev];
                next[index] = Math.max(200, initialWidths[index] + delta);
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

    const token = localStorage.getItem('aatn_qms_token');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch users
            const usersRes = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (usersRes.ok) {
                const uData = await usersRes.json();
                setUsers(uData);
            }

            // Fetch departments
            const deptsRes = await fetch('/api/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (deptsRes.ok) {
                const dData = await deptsRes.json();
                setDepartments(dData);
            }

            // Fetch divisions
            const divsRes = await fetch('/api/divisions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (divsRes.ok) {
                const dvData = await divsRes.json();
                setDivisions(dvData);
            }

            // Fetch teams
            const teamsRes = await fetch('/api/teams', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (teamsRes.ok) {
                const tData = await teamsRes.json();
                setTeams(tData);
            }
        } catch (err) {
            console.error('Error fetching departments/divisions/teams details:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsLeaderDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ---------------- DEPARTMENTS CRUD ----------------
    const handleOpenDeptModal = (dept?: Department) => {
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
        const title = deptName.trim();
        if (!title) return alert('Tên phòng ban không được để trống.');

        setIsSaving(true);
        const payload = {
            id: editingDept ? editingDept.id : 'dept-' + Date.now(),
            name: title,
            divisions: editingDept ? editingDept.divisions : []
        };

        try {
            const res = await fetch('/api/departments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await fetchData();
                setIsDeptModalOpen(false);
            } else {
                alert('Lỗi lưu phòng ban.');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDept = async (id: string, name: string) => {
        if (!window.confirm(`Xóa phòng ban "${name}"? Các đối tượng và bộ phận liên quan sẽ bị ảnh hưởng.`)) return;
        try {
            const res = await fetch(`/api/departments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) await fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    // ---------------- DIVISIONS CRUD ----------------
    const handleOpenDivModal = (div?: Division) => {
        if (div) {
            setEditingDiv(div);
            setDivName(div.name);
            setDivDeptId(div.departmentId);
        } else {
            setEditingDiv(null);
            setDivName('');
            setDivDeptId(departments[0]?.id || '');
        }
        setIsDivModalOpen(true);
    };

    const handleSaveDiv = async () => {
        const title = divName.trim();
        if (!title) return alert('Tên bộ phận không được để trống.');
        if (!divDeptId) return alert('Vui lòng chọn Phòng ban trực thuộc.');

        setIsSaving(true);
        const payload = {
            id: editingDiv ? editingDiv.id : 'div-' + Date.now(),
            name: title,
            departmentId: divDeptId
        };

        try {
            const res = await fetch('/api/divisions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await fetchData();
                setIsDivModalOpen(false);
            } else {
                alert('Lỗi lưu bộ phận.');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDiv = async (id: string, name: string) => {
        if (!window.confirm(`Xóa bộ phận "${name}"? Các tổ trực thuộc cũng sẽ bị ảnh hưởng.`)) return;
        try {
            const res = await fetch(`/api/divisions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) await fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    // ---------------- TEAMS CRUD ----------------
    const handleOpenTeamModal = (tm?: Team) => {
        setIsLeaderDropdownOpen(false);
        setLeaderSearchQuery('');
        if (tm) {
            setEditingTeam(tm);
            setTeamName(tm.name);
            setTeamDivId(tm.divisionId);
            setTeamLeaderId(tm.leaderId || '');
        } else {
            setEditingTeam(null);
            setTeamName('');
            setTeamDivId(divisions[0]?.id || '');
            setTeamLeaderId('');
        }
        setIsTeamModalOpen(true);
    };

    const handleSaveTeam = async () => {
        const title = teamName.trim();
        if (!title) return alert('Tên tổ/nhóm không được để trống.');
        if (!teamDivId) return alert('Vui lòng chọn Bộ phận trực thuộc.');

        setIsSaving(true);
        const payload = {
            id: editingTeam ? editingTeam.id : 'team-' + Date.now(),
            name: title,
            divisionId: teamDivId,
            leaderId: teamLeaderId || null
        };

        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await fetchData();
                setIsTeamModalOpen(false);
            } else {
                alert('Lỗi lưu tổ/nhóm.');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTeam = async (id: string, name: string) => {
        if (!window.confirm(`Xóa tổ "${name}"?`)) return;
        try {
            const res = await fetch(`/api/teams/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) await fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    // ---------------- USER CHANGE DEPT ----------------
    const handleOpenChangeDeptModal = (user: User) => {
        setUserToChangeDept(user);
        setNewDeptId(user.department_id || '');
        setNewDivId(user.division_id || '');
        setNewTeamId(user.team_id || '');
        setIsChangeDeptModalOpen(true);
    };

    const handleSaveChangeDept = async () => {
        if (!userToChangeDept) return;
        setIsSaving(true);

        const newDeptName = departments.find(d => d.id === newDeptId)?.name || '';
        const newDivName = divisions.find(d => d.id === newDivId)?.name || '';
        const newTeamName = teams.find(t => t.id === newTeamId)?.name || '';

        const payload = {
            ...userToChangeDept,
            department_id: newDeptId || null,
            division_id: newDivId || null,
            team_id: newTeamId || null,
            // legacy mapping
            phong_ban: newDeptName,
            bo_phan: newDivName,
            to_qc: newTeamName
        };

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                await fetchData();
                setIsChangeDeptModalOpen(false);
            }
        } catch (err) {
            console.error('Error saving user department change:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredDivisions = selectedDeptId ? divisions.filter(d => d.departmentId === selectedDeptId) : [];
    const filteredTeams = selectedDivId ? teams.filter(t => t.divisionId === selectedDivId) : [];
    
    const filteredUsers = React.useMemo(() => {
        if (!selectedDeptId) return users;
        return users.filter(u => {
            if (selectedTeamId) return u.team_id === selectedTeamId;
            if (selectedDivId) return u.division_id === selectedDivId;
            if (selectedDeptId) return u.department_id === selectedDeptId;
            return true;
        });
    }, [users, selectedDeptId, selectedDivId, selectedTeamId]);

    return (
        <div className="space-y-2 lg:space-y-4 animate-in fade-in duration-300 flex flex-col h-[calc(100vh-130px)] lg:h-[calc(100vh-100px)]">
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
            </div>

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Đang đồng bộ dữ liệu Postgres...</p>
                </div>
            ) : (
                <div className="flex-1 flex lg:gap-4 lg:flex-row pb-2 h-full w-full">
                    
                    {/* CỘT 1: PHÒNG BAN */}
                    <div 
                        className={`flex-shrink-0 lg:flex-1 flex flex-col snap-start bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:w-auto ${activeMobileCol !== 0 ? 'hidden lg:flex' : ''}`}
                        style={{ minWidth: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[0] : '100%', flexBasis: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[0] : 'auto' }}
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
                            <button onClick={() => handleOpenDeptModal()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-blue-600 dark:text-blue-400">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                            {departments.map(dept => (
                                <div 
                                    key={dept.id} 
                                    onClick={() => { setSelectedDeptId(dept.id); setSelectedDivId(null); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(1); }}
                                    className={`p-3.5 rounded-2xl cursor-pointer border transition-all flex flex-col gap-2 group ${selectedDeptId === dept.id ? 'bg-blue-600 border-blue-600 shadow-md transform scale-[1.02]' : 'bg-white dark:bg-slate-900 border-transparent hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className={`font-black text-sm uppercase tracking-tight ${selectedDeptId === dept.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{dept.name}</div>
                                            <div className={`text-[10px] font-mono mt-0.5 ${selectedDeptId === dept.id ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>{dept.id}</div>
                                        </div>
                                        <div className={`flex gap-1 transition-opacity ${selectedDeptId === dept.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                            <button onClick={(e) => { e.stopPropagation(); handleOpenDeptModal(dept); }} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all ${selectedDeptId === dept.id ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600'}`}><Edit2 className="w-3 h-3" /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDept(dept.id, dept.name); }} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all ${selectedDeptId === dept.id ? 'bg-white/20 text-white hover:bg-white/30 hover:text-red-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500'}`}><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                    <div className={`text-[10px] font-bold flex items-center justify-between ${selectedDeptId === dept.id ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                        <span>{divisions.filter(d => d.departmentId === dept.id).length} Bộ phận</span>
                                        <button onClick={(e) => { e.stopPropagation(); setSelectedDeptId(dept.id); setSelectedDivId(null); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }} className={`flex items-center gap-1 transition-colors px-2 py-1 -mr-2 rounded-md ${selectedDeptId === dept.id ? 'hover:bg-white/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                            <Users className="w-3 h-3" />
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
                        className={`flex-shrink-0 lg:flex-1 flex flex-col snap-start bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border table-transition border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:w-auto ${!selectedDeptId ? 'opacity-50 pointer-events-none' : ''} ${activeMobileCol !== 1 ? 'hidden lg:flex' : ''}`}
                        style={{ minWidth: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[1] : '100%', flexBasis: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[1] : 'auto' }}
                    >
                        <div 
                            className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                            onMouseDown={startDrag(1)}
                        />
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2">
                                <button className="lg:hidden p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-700" onClick={() => setActiveMobileCol(0)}>
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <h3 className="font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 lg:hidden" />
                                    Bộ phận ({filteredDivisions.length})
                                </h3>
                            </div>
                            <button onClick={() => { setDivDeptId(selectedDeptId || ''); setIsDivModalOpen(true); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-blue-600 dark:text-blue-400" disabled={!selectedDeptId}>
                                <Plus className="w-4 h-4" />
                            </button>
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
                                    <div className="flex justify-between items-start">
                                        <div className={`font-black text-sm uppercase tracking-tight ${selectedDivId === div.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{div.name}</div>
                                        <div className={`flex gap-1 transition-opacity ${selectedDivId === div.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                            <button onClick={(e) => { e.stopPropagation(); handleOpenDivModal(div); }} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all ${selectedDivId === div.id ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600'}`}><Edit2 className="w-3 h-3" /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDiv(div.id, div.name); }} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all ${selectedDivId === div.id ? 'bg-white/20 text-white hover:bg-white/30 hover:text-red-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500'}`}><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                    <div className={`text-[10px] font-bold flex items-center justify-between mt-1 ${selectedDivId === div.id ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                        <span>{teams.filter(t => t.divisionId === div.id).length} Tổ (Team)</span>
                                        <button onClick={(e) => { e.stopPropagation(); setSelectedDivId(div.id); setSelectedTeamId(null); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }} className={`flex items-center gap-1 transition-colors px-2 py-1 -mr-2 rounded-md ${selectedDivId === div.id ? 'hover:bg-white/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                            <Users className="w-3 h-3" />
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
                        className={`flex-shrink-0 lg:flex-1 flex flex-col snap-start bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border table-transition border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:w-auto ${!selectedDivId ? 'opacity-50 pointer-events-none' : ''} ${activeMobileCol !== 2 ? 'hidden lg:flex' : ''}`}
                        style={{ minWidth: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[2] : '100%', flexBasis: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[2] : 'auto' }}
                    >
                        <div 
                            className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                            onMouseDown={startDrag(2)}
                        />
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2">
                                <button className="lg:hidden p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-700" onClick={() => setActiveMobileCol(1)}>
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <h3 className="font-black text-[11px] uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 lg:hidden" />
                                    Tổ / Team ({filteredTeams.length})
                                </h3>
                            </div>
                            <button onClick={() => { setTeamDivId(selectedDivId || ''); setIsTeamModalOpen(true); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-blue-600 dark:text-blue-400" disabled={!selectedDivId}>
                                <Plus className="w-4 h-4" />
                            </button>
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
                                        <div className="flex justify-between items-start">
                                            <div className={`font-black text-sm uppercase tracking-tight pr-2 ${selectedTeamId === team.id ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{team.name}</div>
                                            <div className={`flex gap-1 transition-opacity ${selectedTeamId === team.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                <button onClick={(e) => { e.stopPropagation(); handleOpenTeamModal(team); }} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all ${selectedTeamId === team.id ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-emerald-600'}`}><Edit2 className="w-3 h-3" /></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id, team.name); }} className={`p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all ${selectedTeamId === team.id ? 'bg-white/20 text-white hover:bg-white/30 hover:text-red-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500'}`}><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <div className={`text-[10px] font-bold p-1.5 rounded-xl flex items-center gap-1.5 ${selectedTeamId === team.id ? 'bg-white/10 text-emerald-100' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'}`}>
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                <span className="truncate max-w-[80px]">{leader ? `${leader.name}` : 'Chưa có'}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedTeamId(team.id); if (typeof window !== 'undefined' && window.innerWidth < 1024) setActiveMobileCol(3); }} className={`text-[10px] font-bold flex items-center gap-1 transition-colors px-2 py-1 -mr-2 rounded-md ${selectedTeamId === team.id ? 'text-emerald-100 hover:bg-white/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                                <Users className="w-3 h-3" />
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
                        className={`flex-shrink-0 lg:flex-1 flex flex-col snap-start bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full relative w-full lg:w-auto ${activeMobileCol !== 3 ? 'hidden lg:flex' : ''}`}
                        style={{ minWidth: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[3] : '100%', flexBasis: typeof window !== 'undefined' && window.innerWidth >= 1024 ? colSizes[3] : 'auto' }}
                    >
                        <div 
                            className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                            onMouseDown={startDrag(3)}
                        />
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2">
                                <button className="lg:hidden p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-700" onClick={() => setActiveMobileCol(selectedTeamId ? 2 : selectedDivId ? 1 : 0)}>
                                    <ChevronLeft className="w-4 h-4" />
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
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className="font-black text-sm text-slate-800 dark:text-slate-200 truncate">{u.name}</h4>
                                                <button onClick={() => handleOpenChangeDeptModal(u)} className="opacity-0 group-hover:opacity-100 text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded transition-opacity shrink-0">ĐỔI PHÒNG</button>
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

            {/* POPUP MODAL FOR ADD / EDIT DEPARTMENT */}
            {isDeptModalOpen && (
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none">
                                    <Building className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs">
                                    {editingDept ? 'Cập nhật phòng ban' : 'Thêm phòng ban mới'}
                                </h3>
                            </div>
                            <button onClick={() => setIsDeptModalOpen(false)} className="p-1.5 text-slate-450 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên phòng ban *</label>
                                <input 
                                    value={deptName} 
                                    onChange={e => setDeptName(e.target.value)} 
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none transition-all rounded-2xl text-xs font-bold leading-relaxed focus:bg-white" 
                                    placeholder="VD: PHÒNG SẢN XUẤT" 
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-2 shrink-0">
                            <button onClick={() => setIsDeptModalOpen(false)} className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider">Hủy bỏ</button>
                            <button 
                                onClick={handleSaveDept} 
                                disabled={isSaving} 
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu lại
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* POPUP MODAL FOR ADD / EDIT DIVISION */}
            {isDivModalOpen && (
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none">
                                    <Building className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs">
                                    {editingDiv ? 'Cập nhật bộ phận' : 'Thêm bộ phận mới'}
                                </h3>
                            </div>
                            <button onClick={() => setIsDivModalOpen(false)} className="p-1.5 text-slate-450 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Phòng ban trực thuộc *</label>
                                <select 
                                    value={divDeptId}
                                    onChange={e => setDivDeptId(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                >
                                    <option value="">-- Chọn Phòng ban --</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên bộ phận *</label>
                                <input 
                                    value={divName} 
                                    onChange={e => setDivName(e.target.value)} 
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none transition-all rounded-2xl text-xs font-bold leading-relaxed focus:bg-white" 
                                    placeholder="VD: BỘ PHẬN CHUẨN BỊ PQC" 
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-2 shrink-0">
                            <button onClick={() => setIsDivModalOpen(false)} className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider">Hủy bỏ</button>
                            <button 
                                onClick={handleSaveDiv} 
                                disabled={isSaving} 
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu lại
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* POPUP MODAL FOR ADD / EDIT TEAM */}
            {isTeamModalOpen && (
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-visible animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center rounded-t-3xl">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none">
                                    <Building className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs">
                                    {editingTeam ? 'Cập nhật Tổ (Team)' : 'Thêm Tổ (Team) mới'}
                                </h3>
                            </div>
                            <button onClick={() => setIsTeamModalOpen(false)} className="p-1.5 text-slate-450 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Bộ phận trực thuộc *</label>
                                <select 
                                    value={teamDivId}
                                    onChange={e => setTeamDivId(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                >
                                    <option value="">-- Chọn Bộ phận --</option>
                                    {divisions.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} ({departments.find(dept => dept.id === d.departmentId)?.name || 'Unknown'})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên tổ *</label>
                                <input 
                                    value={teamName} 
                                    onChange={e => setTeamName(e.target.value)} 
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none transition-all rounded-2xl text-xs font-bold leading-relaxed focus:bg-white" 
                                    placeholder="VD: TỔ LẮP RÁP 1" 
                                />
                            </div>

                            <div className="space-y-1 relative" ref={dropdownRef}>
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Gán Tổ trưởng (Team Leader) thủ công *</label>
                                
                                {/* Trigger button */}
                                <div 
                                    onClick={() => setIsLeaderDropdownOpen(!isLeaderDropdownOpen)}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-750 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer flex items-center justify-between transition-colors hover:border-slate-400"
                                >
                                    <span className="truncate">
                                        {teamLeaderId ? (() => {
                                            const selectedUser = users.find(u => u.id === teamLeaderId);
                                            return selectedUser ? `${selectedUser.name} (${selectedUser.username})` : '-- Chưa gán / Không có Tổ trưởng --';
                                        })() : '-- Chưa gán / Không có Tổ trưởng --'}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                </div>

                                {/* Dropdown Popover */}
                                {isLeaderDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-[150] overflow-hidden flex flex-col max-h-60 animate-in fade-in slide-in-from-top-1 duration-150">
                                        {/* Search Input Header */}
                                        <div className="p-2 border-b border-slate-100 dark:border-slate-900 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2 shrink-0">
                                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <input 
                                                type="text"
                                                value={leaderSearchQuery}
                                                onChange={e => setLeaderSearchQuery(e.target.value)}
                                                placeholder="Tìm theo tên hoặc tài khoản..."
                                                className="w-full bg-transparent border-none outline-none text-xs font-bold font-sans text-slate-800 dark:text-slate-200 placeholder-slate-400"
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            {leaderSearchQuery && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setLeaderSearchQuery(''); }}
                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>

                                        {/* List options */}
                                        <div className="overflow-y-auto max-h-48 p-1.5 no-scrollbar flex-1">
                                            <div 
                                                onClick={() => {
                                                    setTeamLeaderId('');
                                                    setIsLeaderDropdownOpen(false);
                                                }}
                                                className={`px-3 py-2 text-[10px] font-black uppercase rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/80 transition-colors ${!teamLeaderId ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                                            >
                                                -- Chưa gán / Không có Tổ trưởng --
                                            </div>
                                            
                                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2" />
                                            
                                            {(() => {
                                                const filteredUsers = users.filter(u => {
                                                    const q = removeVietnameseTones(leaderSearchQuery.toLowerCase().trim());
                                                    if (!q) return true;
                                                    return removeVietnameseTones(u.name.toLowerCase()).includes(q) || removeVietnameseTones(u.username.toLowerCase()).includes(q);
                                                });

                                                if (filteredUsers.length === 0) {
                                                    return (
                                                        <div className="py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                            Không tìm thấy nhân sự
                                                        </div>
                                                    );
                                                }

                                                return filteredUsers.map(u => (
                                                    <div 
                                                        key={u.id}
                                                        onClick={() => {
                                                            setTeamLeaderId(u.id);
                                                            setIsLeaderDropdownOpen(false);
                                                        }}
                                                        className={`px-3 py-2 text-xs font-bold rounded-xl cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors flex items-center justify-between ${teamLeaderId === u.id ? 'bg-blue-100/50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                                                    >
                                                        <div className="truncate pr-2">
                                                            <span className="font-extrabold text-slate-900 dark:text-slate-100 uppercase">{u.name}</span>
                                                            <span className="ml-1 text-[10px] text-slate-400 font-mono">({u.username})</span>
                                                        </div>
                                                        <div className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 tracking-wider shrink-0">
                                                            {u.role === 'ADMIN' ? 'Admin' : (u.position || 'Nhân viên')}
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                                
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight leading-relaxed mt-1">
                                    Lưu ý: Khi gán Leader, hệ thống sẽ tự đặt flag la_to_truong = true và cập nhật chức vụ thành "Tổ trưởng" tự động.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-2 shrink-0 rounded-b-3xl">
                            <button onClick={() => setIsTeamModalOpen(false)} className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider">Hủy bỏ</button>
                            <button 
                                onClick={handleSaveTeam} 
                                disabled={isSaving} 
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu lại
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* POPUP MODAL FOR USER DEPT CHANGE */}
            {isChangeDeptModalOpen && userToChangeDept && (
                <div className="fixed inset-0 z-[220] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-none">
                                    <Users className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest text-xs">
                                        Đổi phòng ban / bộ phận
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Nhân sự: {userToChangeDept.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsChangeDeptModalOpen(false)} className="p-1.5 text-slate-450 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Phòng ban cấp 1</label>
                                <select 
                                    value={newDeptId}
                                    onChange={e => {
                                        setNewDeptId(e.target.value);
                                        setNewDivId('');
                                        setNewTeamId('');
                                    }}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer"
                                >
                                    <option value="">-- Bỏ trống (Không gán) --</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Bộ phận cấp 2</label>
                                <select 
                                    value={newDivId}
                                    onChange={e => {
                                        setNewDivId(e.target.value);
                                        setNewTeamId('');
                                    }}
                                    disabled={!newDeptId}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="">-- Bỏ trống (Không gán) --</option>
                                    {divisions.filter(d => d.departmentId === newDeptId).map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tổ (Team) cấp 3</label>
                                <select 
                                    value={newTeamId}
                                    onChange={e => setNewTeamId(e.target.value)}
                                    disabled={!newDivId}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-xs uppercase outline-none shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="">-- Bỏ trống (Không gán) --</option>
                                    {teams.filter(t => t.divisionId === newDivId).map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-2 shrink-0 rounded-b-3xl">
                            <button onClick={() => setIsChangeDeptModalOpen(false)} className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider">Hủy bỏ</button>
                            <button 
                                onClick={handleSaveChangeDept} 
                                disabled={isSaving} 
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                            >
                                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
