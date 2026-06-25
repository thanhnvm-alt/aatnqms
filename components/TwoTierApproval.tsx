import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Inspection, InspectionStatus, User, Role, ModuleId, hasPermission } from '../types';
import { ShieldCheck, CheckSquare, Edit, X, RefreshCw, AlertCircle, Sparkles, Ban, FastForward, Lock, Clock, History, ChevronDown, ChevronUp } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { getProxyImageUrl } from '../src/utils';
import { fetchRoles, fetchInspectionAuditLogs } from '../services/apiService';

interface TwoTierApprovalProps {
  inspection: Inspection;
  user: User;
  onApprove: (id: string, signature: string, extraInfo?: any) => Promise<void>;
}

export const TwoTierApproval: React.FC<TwoTierApprovalProps> = ({ inspection, user, onApprove }) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [showModal, setShowModal] = useState<false | 'SIGN1' | 'SIGN2'>(false);
  const [signature, setSignature] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isAuditCollapsed, setIsAuditCollapsed] = useState(true);

  useEffect(() => {
    if (!inspection.id) return;
    let active = true;
    setIsAuditLoading(true);
    fetchInspectionAuditLogs(inspection.id)
      .then(data => {
        if (active && Array.isArray(data)) {
          setAuditLogs(data);
        }
      })
      .catch(err => console.error('Failed to load audit logs:', err))
      .finally(() => {
        if (active) setIsAuditLoading(false);
      });
    return () => { active = false; };
  }, [inspection.id]);

  const getChangedFields = (oldVal: any, newVal: any) => {
    if (!oldVal || !newVal) return null;
    const changes: { field: string; from: any; to: any }[] = [];
    const keys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
    
    const ignoredKeys = new Set(['updatedAt', 'updated_at', 'created_at', 'id', 'signature', 'teamLeadSignature', 'managerSignature', 'qcDate', 'teamLeadDate', 'managerDate']);
    
    for (const key of keys) {
      if (ignoredKeys.has(key)) continue;
      
      const vOld = oldVal[key];
      const vNew = newVal[key];
      
      if (JSON.stringify(vOld) !== JSON.stringify(vNew)) {
        let fromText = vOld === undefined || vOld === null ? 'Trống' : String(vOld);
        let toText = vNew === undefined || vNew === null ? 'Trống' : String(vNew);
        
        if (key === 'items' && Array.isArray(vOld) && Array.isArray(vNew)) {
          fromText = `${vOld.length} hạng mục`;
          toText = `${vNew.length} hạng mục`;
        } else if (key.toLowerCase().includes('signature')) {
          fromText = vOld ? 'Đã ký' : 'Chưa ký';
          toText = vNew ? 'Đã ký' : 'Chưa ký';
        }
        
        let fieldLabel = key;
        const keyMap: Record<string, string> = {
          status: 'Trạng thái',
          inspectorName: 'Người kiểm tra',
          inspector_name: 'Người kiểm tra',
          ten_ct: 'Tên công trình/dự án',
          ma_ct: 'Mã công trình/dự án',
          ten_hang_muc: 'Tên hạng mục',
          ma_nha_may: 'Mã nhà máy',
          workshop: 'Xưởng',
          line: 'Chuyền',
          managerName: 'Trưởng phòng duyệt',
          teamLeadName: 'Tổ trưởng duyệt',
          summary: 'Kết luận/Ý kiến',
          ngay_kiem_tra: 'Ngày kiểm tra',
          po_number: 'Số PO',
          quantities: 'Số lượng',
          pass: 'Đạt',
          fail: 'Không đạt',
        };
        
        if (keyMap[key]) {
          fieldLabel = keyMap[key];
        }
        
        changes.push({
          field: fieldLabel,
          from: fromText,
          to: toText
        });
      }
    }
    return changes.length > 0 ? changes : null;
  };

  const renderAuditTrail = () => {
    return (
      <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
        <button
          type="button"
          onClick={() => setIsAuditCollapsed(!isAuditCollapsed)}
          className="w-full flex items-center justify-between py-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest font-mono">
              Nhật ký truy vết hồ sơ (ISO Audit Trail)
            </span>
            {auditLogs.length > 0 && (
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold">
                {auditLogs.length}
              </span>
            )}
          </div>
          {isAuditCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>

        {!isAuditCollapsed && (
          <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1 animate-in fade-in duration-200">
            {isAuditLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs font-medium font-mono uppercase">Đang tải nhật ký...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs font-mono uppercase">
                Không có dữ liệu chỉnh sửa được ghi nhận
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-2.5 pl-4 space-y-4 py-1">
                {auditLogs.map((log) => {
                  const logDate = formatDateTime(log.timestamp);
                  const changes = getChangedFields(log.old_value, log.new_value);
                  
                  let actionLabel = log.action;
                  let actionColor = 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';
                  
                  if (log.action === 'CREATE_INSPECTION') {
                    actionLabel = 'Khởi tạo phiếu';
                    actionColor = 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
                  } else if (log.action === 'UPDATE_INSPECTION') {
                    actionLabel = 'Chỉnh sửa';
                    actionColor = 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400';
                  } else if (log.action === 'DELETE_INSPECTION') {
                    actionLabel = 'Xóa phiếu';
                    actionColor = 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
                  } else if (log.action.includes('APPROVE') || log.action.includes('SIGN')) {
                    actionLabel = 'Phê duyệt / Ký';
                    actionColor = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400';
                  } else if (log.action.includes('REJECT')) {
                    actionLabel = 'Từ chối / Trả lại';
                    actionColor = 'text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400';
                  }
                  
                  return (
                    <div key={log.id} className="relative group/item text-xs text-left">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 group-hover/item:bg-blue-500 transition-colors" />
                      
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${actionColor}`}>
                          {actionLabel}
                        </span>
                        <span className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">
                          {log.user_id || 'Hệ thống'}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          {logDate}
                        </span>
                      </div>
                      
                      {changes ? (
                        <div className="mt-1.5 ml-1 p-2 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100/70 dark:border-slate-800/60 rounded-xl space-y-1.5">
                          {changes.map((change, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1 text-[11px] font-medium leading-relaxed">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[9px] min-w-[100px]">
                                • {change.field}:
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 px-1 py-0.2 rounded font-mono break-all line-through decoration-red-400">
                                  {change.from}
                                </span>
                                <span className="text-slate-400 text-[10px]">&rarr;</span>
                                <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-1 py-0.2 rounded font-mono break-all font-semibold">
                                  {change.to}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        log.action === 'UPDATE_INSPECTION' && (
                          <p className="text-[10px] text-slate-400 italic ml-1 mt-0.5">Không ghi nhận thay đổi giá trị thuộc tính chính</p>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    let active = true;
    fetchRoles()
      .then(data => {
        if (active && data) {
          setRoles(data);
        }
      })
      .catch(err => console.error('Failed to load roles in TwoTierApproval:', err));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/users')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (active) setUsers(data);
      })
      .catch(err => console.error('Failed to load users in TwoTierApproval:', err));
    return () => { active = false; };
  }, []);

  const isAuthorizedTeam = useMemo(() => {
    if (user.role === 'ADMIN') return true;
    if (!user.la_to_truong) return true;
    
    const creatorUser = users.find(u => u.name === inspection.inspectorName);
    if (!creatorUser) {
      if (users.length === 0) return true; // wait for data to load
      return false;
    }
    
    // Check by physical UUID-based team_id first
    if (user.team_id && creatorUser.team_id && user.team_id === creatorUser.team_id) {
      return true;
    }

    // Fallback/compat by string matching
    const userTeam = (user.to_qc || '').trim().toLowerCase();
    const creatorTeam = (creatorUser.to_qc || '').trim().toLowerCase();
    
    if (userTeam && userTeam === creatorTeam) return true;
    
    return false;
  }, [user, inspection.inspectorName, users]);

  const hasSignPermission = (action: 'SIGN1' | 'SIGN2'): boolean => {
    const moduleId = (inspection.type || 'PQC') as ModuleId;

    // Use our refined case-insensitive union permissions checker
    if (hasPermission(user, roles, moduleId, action)) return true;

    // 1. Check user role with direct case-insensitive logic as robust backup
    const rConfig = roles.find(
      r => String(r.id).toLowerCase() === String(user.role).toLowerCase() || 
           String(r.name).toLowerCase() === String(user.role).toLowerCase()
    );
    const rHas = rConfig?.permissions?.find(
      p => String(p.moduleId).toLowerCase() === String(moduleId).toLowerCase()
    )?.actions?.includes(action);

    // 2. Check user position (Chức vụ) with case-insensitive logic as robust backup
    const pConfig = roles.find(
      r => r.isPosition && 
           (String(r.id).toLowerCase() === String(user.position).toLowerCase() || 
            String(r.name).toLowerCase() === String(user.position).toLowerCase())
    );
    const pHas = pConfig?.permissions?.find(
      p => String(p.moduleId).toLowerCase() === String(moduleId).toLowerCase()
    )?.actions?.includes(action);

    if (rHas || pHas) return true;

    // Fallback for MANAGER / Quản lý to have Level 2 signature
    if ((String(user.role).toUpperCase() === 'MANAGER' || String(user.role).toUpperCase() === 'QUẢN LÝ') && action === 'SIGN2') return true;

    return false;
  };

  const formatDateTime = (dateVal: any) => {
    if (!dateVal) return '';
    let d: Date;
    
    // If numeric string or number (unix epoch in seconds or ms)
    if (!isNaN(Number(dateVal)) && String(dateVal).length >= 10 && String(dateVal).length <= 13) {
      const num = Number(dateVal);
      // Heuristic: if <= 2 * 10^9, it's probably seconds, else milliseconds
      d = new Date(num <= 2000000000 ? num * 1000 : num);
    } else {
      d = new Date(dateVal);
    }

    if (isNaN(d.getTime())) return String(dateVal);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}`;
  };

  const handleSigningSubmit = async () => {
    if (!signature) {
      alert("Vui lòng ký tên trước khi xác nhận.");
      return;
    }
    if (!isAuthorizedTeam) {
      alert("Không thuộc thẩm quyền quản lý: Bạn không thuộc Tổ QC quản lý của người lập phiếu này!");
      return;
    }
    setIsProcessing(true);
    try {
      const nowISO = new Date().toISOString();
      if (showModal === 'SIGN1') {
        const isBoss = 
          user.role === 'ADMIN' || 
          user.role === 'MANAGER' ||
          (user.position && (
            user.position.toUpperCase().includes('GIÁM ĐỐC') ||
            user.position.toUpperCase().includes('GIÁM DOC') ||
            user.position.toUpperCase().includes('TRƯỞNG PHÒNG') ||
            user.position.toUpperCase().includes('TRUONG PHONG')
          ));

        if (isBoss) {
          // Rule: If Director/Dept Head signs as L1 in a 2-tier approval, automatically fully approve and go straight to Approved!
          await onApprove(inspection.id, signature, {
            teamLeadSignature: signature,
            teamLeadName: `${user.name} - Ký thay`,
            teamLeadDate: nowISO,
            managerSignature: signature,
            managerName: `${user.name} - Ký thay`,
            status: 'approved' as InspectionStatus,
            updatedAt: nowISO
          });
        } else {
          await onApprove(inspection.id, '', {
            teamLeadSignature: signature,
            teamLeadName: user.name,
            teamLeadDate: nowISO,
            status: 'verified' as InspectionStatus,
            updatedAt: nowISO
          });
        }
      } else if (showModal === 'SIGN2') {
        const is1Level = inspection.type === 'IQC' || inspection.type === 'SITE';
        const isBoss = 
          user.role === 'ADMIN' || 
          user.role === 'MANAGER' ||
          (user.position && (
            user.position.toUpperCase().includes('GIÁM ĐỐC') ||
            user.position.toUpperCase().includes('GIÁM DOC') ||
            user.position.toUpperCase().includes('TRƯỞNG PHÒNG') ||
            user.position.toUpperCase().includes('TRUONG PHONG') ||
            user.position.toUpperCase().includes('BỘ PHẬN') ||
            user.position.toUpperCase().includes('BO PHAN')
          ));

        let mgrName = user.name;
        if (is1Level && isBoss) {
          const userPos = user.position || (user.role === 'ADMIN' ? 'Admin' : 'Giám đốc');
          mgrName = `${userPos} ${user.name} - Ký thay`;
        }

        await onApprove(inspection.id, signature, {
          managerSignature: signature,
          managerName: mgrName,
          managerDate: nowISO,
          status: 'approved' as InspectionStatus,
          updatedAt: nowISO
        });
      }
      setShowModal(false);
      setSignature('');
    } catch (e) {
      alert("Lỗi khi ký duyệt: " + (e instanceof Error ? e.message : "Thất bại"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!isAuthorizedTeam) {
      alert("Không thuộc thẩm quyền quản lý: Bạn không thuộc Tổ QC quản lý của người lập phiếu này!");
      return;
    }
    const reason = window.prompt("Nhập lý do từ chối hồ sơ này:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Vui lòng phục hồi và nhập lý do hợp lệ.");
      return;
    }

    setIsProcessing(true);
    try {
      await onApprove(inspection.id, "", {
        status: 'rejected' as InspectionStatus,
        summary: (inspection.summary || "") + "\n\n[LÝ DO TỪ CHỐI]: " + reason,
        updatedAt: new Date().toISOString()
      });
      alert("Đã trả lại/từ chối phiếu thành công.");
    } catch (e) {
      alert("Lỗi từ chối phiếu.");
    } finally {
      setIsProcessing(false);
    }
  };

  const showSign1Button = hasSignPermission('SIGN1') && !inspection.teamLeadSignature && !inspection.managerSignature;
  const showSign2Button = hasSignPermission('SIGN2') && !inspection.managerSignature;

  // ISO Immutability Lock
  const isFullyApproved = inspection.status === InspectionStatus.APPROVED;

  if (isFullyApproved) {
    return (
        <div className="bg-slate-50 dark:bg-[#0f172a] p-5 md:p-6 rounded-3xl border-2 border-emerald-500/20 dark:border-emerald-500/10 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/5 rounded-full -ml-12 -mb-12 blur-xl"></div>
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                        <ShieldCheck className="w-8 h-8 text-emerald-600 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Hồ sơ đã được phê duyệt & khóa</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">TRẠNG THÁI: ISO IMMUTABLE LOCKED</p>
                        </div>
                    </div>
                </div>
                <div className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    BẢO MẬT ISO-QMS
                </div>
            </div>

            <div className={`grid grid-cols-1 ${(inspection.type === 'IQC' || inspection.type === 'SITE') ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
                <div className="space-y-3 bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">NGƯỜI LẬP PHIẾU (QC)</p>
                    <div className="h-24 bg-slate-50 dark:bg-slate-800 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-100 dark:border-slate-800 border-dashed">
                        {inspection.signature && (
                            <>
                            <img src={getProxyImageUrl(inspection.signature)} alt="Inspector" className="h-full object-contain mix-blend-multiply dark:mix-blend-normal relative z-10" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.25]">
                                <div className="border border-red-600/50 rounded px-2 py-1 flex flex-col items-center transform -rotate-12 bg-red-50/5">
                                    <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">NGƯỜI KÝ</span>
                                    <span className="text-[7px] font-bold text-red-700">{formatDateTime(inspection.qcDate || inspection.date || inspection.createdAt)}</span>
                                </div>
                            </div>
                            </>
                        )}
                    </div>
                    <p className="text-center font-black uppercase text-xs text-slate-800 dark:text-slate-200 truncate mt-2">{inspection.inspectorName}</p>
                </div>

                {!(inspection.type === 'IQC' || inspection.type === 'SITE') && (
                    <div className="space-y-3 bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">XÁC NHẬN L1 (TỔ TRƯỞNG)</p>
                        <div className="h-24 bg-slate-50 dark:bg-slate-800 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-100 dark:border-slate-800 border-dashed">
                            {inspection.teamLeadSignature ? (
                                <>
                                <img src={getProxyImageUrl(inspection.teamLeadSignature)} alt="TeamLead" className="h-full object-contain mix-blend-multiply dark:mix-blend-normal relative z-10" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.25]">
                                    <div className="border border-red-600/50 rounded px-2 py-1 flex flex-col items-center transform rotate-12 bg-red-50/5">
                                    <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">VERIFIED L1</span>
                                    <span className="text-[7px] font-bold text-red-700">{formatDateTime(inspection.teamLeadDate) || 'N/A'}</span>
                                </div>
                            </div>
                            </>
                        ) : <span className="text-[10px] font-black text-slate-300">N/A</span>}
                    </div>
                    <p className="text-center font-black uppercase text-xs text-slate-800 dark:text-slate-200 truncate mt-2">{inspection.teamLeadName || 'Hệ thống tự động'}</p>
                </div>
            )}

            <div className="space-y-3 bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm shadow-emerald-500/5 relative overflow-hidden">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">PHÊ DUYỆT L2 (GIÁM ĐỐC)</p>
                <div className="h-24 bg-slate-50 dark:bg-slate-800 rounded-xl relative overflow-hidden flex items-center justify-center border border-emerald-500/20 border-dashed">
                    {inspection.managerSignature && (
                        <>
                        <img src={getProxyImageUrl(inspection.managerSignature)} alt="Manager" className="h-full object-contain mix-blend-multiply dark:mix-blend-normal relative z-10" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.25]">
                            <div className="border border-red-600/50 rounded px-2 py-1 flex flex-col items-center transform -rotate-6 bg-red-50/5">
                                <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">APPROVED L2</span>
                                <span className="text-[7px] font-bold text-red-700">{formatDateTime(inspection.managerDate) || 'N/A'}</span>
                            </div>
                        </div>
                        </>
                    )}
                    </div>
                    <p className="text-center font-black uppercase text-xs text-emerald-700 dark:text-emerald-400 truncate mt-2 font-bold">{inspection.managerName}</p>
                </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 text-slate-400">
                   <Clock className="w-4 h-4" />
                   <span className="text-[10px] font-medium uppercase tracking-tight">Cập Nhật Cuối: {formatDateTime(inspection.updatedAt || inspection.date)}</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-widest italic group">
                    <Lock className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                    Nội dung đã đóng băng theo tiêu chuẩn ISO
                </div>
            </div>
            {renderAuditTrail()}
        </div>
    );
  }

  return (
    <section className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
        <h3 className="text-blue-700 dark:text-blue-400 font-black text-[11px] uppercase tracking-[0.2em] flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" /> PHÊ DUYỆT ISO HAI TẦNG CHUẨN
        </h3>
        
        {/* Rejected Button for managers / Leads */}
        {(hasSignPermission('SIGN1') || hasSignPermission('SIGN2')) && inspection.status !== 'approved' && inspection.status !== 'rejected' && (
          <button 
            onClick={handleReject}
            disabled={isProcessing || !isAuthorizedTeam}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1 border ${
              isAuthorizedTeam 
                ? 'bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/50 cursor-pointer' 
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed'
            }`}
            title={!isAuthorizedTeam ? "Không thuộc thẩm quyền quản lý của Tổ QC" : ""}
          >
            <Ban className="w-3.5 h-3.5" /> Trả lại / Từ chối
          </button>
        )}
      </div>

      <div className={`grid grid-cols-1 ${(inspection.type === 'IQC' || inspection.type === 'SITE') ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
        {/* CỘT 1: Người lập phiện */}
        <div className="space-y-3 flex flex-col justify-between h-full bg-slate-50/50 dark:bg-slate-800/10 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">QC Inspector (Người Lập)</p>
            <p className="text-[9px] text-slate-400 block italic mt-0.5">Khởi tạo phiếu ban đầu</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl h-24 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-800 shadow-inner my-2 relative">
            {/* Improved Watermark Stamp for Inspector */}
            {inspection.signature && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.3]">
                <div className="border-[2px] border-red-700 rounded-md px-3 py-1.5 flex flex-col items-center transform -rotate-12 bg-red-50/10 shadow-md">
                  <span className="text-[9px] font-black text-red-700 uppercase tracking-[0.2em] mb-1 border-b border-red-700/30 w-full text-center pb-1 leading-none">
                    NGƯỜI KÝ
                  </span>
                  <span className="text-[8px] font-black text-red-800 uppercase my-0.5 text-center px-1 leading-tight">
                    {inspection.inspectorName}
                  </span>
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <span className="text-[8px] font-black text-red-700 tabular-nums leading-none">
                      {(formatDateTime(inspection.qcDate || inspection.date || inspection.createdAt).split(' - ')[0]) || ' '}
                    </span>
                    <span className="text-[7px] font-bold text-red-700/80 tabular-nums leading-none">
                      {(formatDateTime(inspection.qcDate || inspection.date || inspection.createdAt).split(' - ')[1]) || ' '}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {inspection.signature ? (
              <img src={getProxyImageUrl(inspection.signature)} className="h-full object-contain relative z-10 mix-blend-multiply" referrerPolicy="no-referrer" alt="Inspector Sig" />
            ) : (
              <div className="text-[10px] font-mono text-slate-300">N/A</div>
            )}
          </div>
          <div>
            <div className="text-center font-black uppercase text-xs text-slate-800 dark:text-slate-200 truncate">{inspection.inspectorName || 'No Name'}</div>
          </div>
        </div>

        {/* CỘT 2: Tổ trưởng QC - Level 1 */}
        {!(inspection.type === 'IQC' || inspection.type === 'SITE') && (
          <div className="space-y-3 flex flex-col justify-between h-full bg-slate-50/50 dark:bg-slate-800/10 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Tổ Trưởng QC (Xác Nhận Hiện Trường - L1)</p>
              <p className="text-[9px] text-slate-400 block italic mt-0.5">Kiểm soát trực tiếp hiện trường</p>
            </div>
            
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl h-24 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-800 shadow-inner my-2 relative">
              {/* Improved Watermark Stamp for L1 */}
              {inspection.teamLeadSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.3]">
                  <div className="border-[2px] border-red-700 rounded-md px-3 py-1.5 flex flex-col items-center transform rotate-12 bg-red-50/10 shadow-md">
                    <span className="text-[9px] font-black text-red-700 uppercase tracking-[0.15em] mb-1 border-b border-red-700/30 w-full text-center pb-1 leading-none">
                      XÁC NHẬN L1
                    </span>
                    <span className="text-[8px] font-black text-red-800 uppercase my-0.5 text-center px-1 leading-tight">
                      {inspection.teamLeadName}
                    </span>
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <span className="text-[8px] font-black text-red-700 tabular-nums leading-none">
                        {inspection.teamLeadDate ? formatDateTime(inspection.teamLeadDate).split(' - ')[0] : ' '}
                      </span>
                      <span className="text-[7px] font-bold text-red-700/80 tabular-nums leading-none">
                        {inspection.teamLeadDate ? formatDateTime(inspection.teamLeadDate).split(' - ')[1] : ' '}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {inspection.teamLeadSignature ? (
                <img src={getProxyImageUrl(inspection.teamLeadSignature)} className="h-full object-contain relative z-10 mix-blend-multiply" referrerPolicy="no-referrer" alt="Team Lead Sig" />
              ) : inspection.managerSignature ? (
                <div className="text-center px-3 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-black tracking-widest uppercase flex items-center justify-center gap-1.5 opacity-70">
                    <FastForward className="w-4 h-4" /> Bỏ Qua (L2 Đã Ký)
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  {showSign1Button ? (
                    isAuthorizedTeam ? (
                      <button 
                        onClick={() => { setSignature(user.signature_template || ''); setShowModal('SIGN1'); }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center gap-1.5 focus:outline-none"
                      >
                        <CheckSquare className="w-3.5 h-3.5" /> Ký xác nhận L1
                      </button>
                    ) : (
                      <div className="text-center px-2 py-1.5 bg-red-50/50 dark:bg-red-950/10 rounded-xl max-w-[190px] border border-dashed border-red-200 dark:border-red-900/30">
                        <span className="text-[8px] text-red-500 dark:text-red-400 font-black tracking-tight uppercase flex items-center justify-center gap-1 leading-tight">
                          <Ban className="w-2.5 h-2.5 shrink-0" /> Không thuộc thẩm quyền quản lý
                        </span>
                        <p className="text-[7.5px] text-slate-400 mt-0.5 uppercase tracking-normal leading-none font-bold">Yêu cầu Tổ QC của: {inspection.inspectorName}</p>
                      </div>
                    )
                  ) : (
                    <span className="text-[10px] text-orange-400 font-bold animate-pulse tracking-wider">CHỜ TỔ TRƯỞNG DUYỆT</span>
                  )}
                </div>
              )}
            </div>

            <div>
              {inspection.teamLeadSignature ? (
                <>
                  <div className="text-center font-black uppercase text-xs text-slate-800 dark:text-slate-200 truncate">{inspection.teamLeadName}</div>
                </>
              ) : (
                <div className="text-center text-xs italic text-slate-400">Chưa xác nhận</div>
              )}
            </div>
          </div>
        )}

        {/* CỘT 3: Trưởng Phòng / Giám Đốc - Level 2 */}
        <div className="space-y-3 flex flex-col justify-between h-full bg-slate-50/50 dark:bg-slate-800/10 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-sans">
              {(inspection.type === 'IQC' || inspection.type === 'SITE') ? 'Trưởng Bộ Phận Phê Duyệt (Đóng Phiếu)' : 'Trưởng Phòng QA/QC (Phê Duyệt Đóng Phiếu - L2)'}
            </p>
            <p className="text-[9px] text-slate-400 block italic mt-0.5">Xác nhận đóng hồ sơ vĩnh viễn</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl h-24 flex items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-800 shadow-inner my-2 relative">
            {/* Improved Watermark Stamp for L2 */}
            {inspection.managerSignature && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.3]">
                <div className="border-[2px] border-red-700 rounded-md px-3 py-1.5 flex flex-col items-center transform -rotate-6 bg-red-50/10 shadow-md">
                  <span className="text-[9px] font-black text-red-700 uppercase tracking-[0.15em] mb-1 border-b border-red-700/30 w-full text-center pb-1 leading-none">
                    PHÊ DUYỆT L2
                  </span>
                  <span className="text-[8px] font-black text-red-800 uppercase my-0.5 text-center px-1 leading-tight">
                    {inspection.managerName}
                  </span>
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <span className="text-[8px] font-black text-red-700 tabular-nums leading-none">
                      {inspection.managerDate ? formatDateTime(inspection.managerDate).split(' - ')[0] : ' '}
                    </span>
                    <span className="text-[7px] font-bold text-red-700/80 tabular-nums leading-none">
                      {inspection.managerDate ? formatDateTime(inspection.managerDate).split(' - ')[1] : ' '}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {inspection.managerSignature ? (
              <img src={getProxyImageUrl(inspection.managerSignature)} className="h-full object-contain relative z-10 mix-blend-multiply" referrerPolicy="no-referrer" alt="Manager Sig" />
            ) : (
              <div className="text-center">
                {showSign2Button ? (
                  isAuthorizedTeam ? (
                    <button 
                      onClick={() => {
                        setSignature(user.signature_template || '');
                        const isBoss = 
                          user.role === 'ADMIN' || 
                          user.role === 'MANAGER' ||
                          (user.position && (
                            user.position.toUpperCase().includes('GIÁM ĐỐC') ||
                            user.position.toUpperCase().includes('GIÁM DOC') ||
                            user.position.toUpperCase().includes('TRƯỞNG PHÒNG') ||
                            user.position.toUpperCase().includes('TRUONG PHONG') ||
                            user.position.toUpperCase().includes('BỘ PHẬN') ||
                            user.position.toUpperCase().includes('BO PHAN')
                          ));

                        setShowModal('SIGN2');
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center gap-1.5 focus:outline-none"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Ký phê duyệt L2
                    </button>
                  ) : (
                    <div className="text-center px-2 py-1.5 bg-red-50/50 dark:bg-red-950/10 rounded-xl max-w-[190px] border border-dashed border-red-200 dark:border-red-900/30">
                      <span className="text-[8px] text-red-500 dark:text-red-400 font-black tracking-tight uppercase flex items-center justify-center gap-1 leading-tight">
                        <Ban className="w-2.5 h-2.5 shrink-0" /> Không thuộc thẩm quyền quản lý
                      </span>
                      <p className="text-[7.5px] text-slate-400 mt-0.5 uppercase tracking-normal leading-none font-bold">Yêu cầu Tổ QC của: {inspection.inspectorName}</p>
                    </div>
                  )
                ) : (
                  <span className="text-[10px] text-slate-300 font-bold tracking-wider">CHỜ TRƯỞNG PHÒNG DUYỆT</span>
                )}
              </div>
            )}
          </div>

          <div>
            {inspection.managerSignature ? (
              <>
                <div className="text-center font-black uppercase text-xs text-slate-800 dark:text-slate-200 truncate">{inspection.managerName}</div>
              </>
            ) : (
              <div className="text-center text-xs italic text-slate-400">Chưa phê duyệt</div>
            )}
          </div>
        </div>
      </div>

      {/* Signature drawing Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 max-w-lg w-full scale-in duration-200 shadow-2xl border border-slate-100 dark:border-slate-800">
            <header className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3.5 mb-4">
              <div>
                <h4 className="text-md font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  Ký xác nhận điện tử ({showModal === 'SIGN1' ? 'Cấp L1 - Tổ Trưởng' : 'Cấp L2 - Trưởng Phòng'})
                </h4>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">Xác nhận bằng chữ ký thực để ghi nhận bảo mật</p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950 p-2 shadow-inner">
              <SignaturePad label="Chữ ký xác nhận" value={signature} onChange={setSignature} />
            </div>

            {user.signature_template && (
              <div className="mt-4 px-2">
                <button
                  type="button"
                  onClick={() => setSignature(user.signature_template || '')}
                  className="w-full py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-100 transition-all active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  SỬ DỤNG CHỮ KÝ MẪU CỦA BẠN
                </button>
              </div>
            )}

            <footer className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowModal(false)}
                className="px-6 py-3 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-500 transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSigningSubmit}
                disabled={!signature || isProcessing}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin"/> : <ShieldCheck className="w-4 h-4"/>}
                <span>XÁC NHẬN CHỮ KÝ</span>
              </button>
            </footer>
          </div>
        </div>
      )}
      {renderAuditTrail()}
    </section>
  );
};
