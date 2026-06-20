import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Inspection, InspectionStatus, User, Role, ModuleId, hasPermission } from '../types';
import { ShieldCheck, CheckSquare, Edit, X, RefreshCw, AlertCircle, Sparkles, Ban, FastForward } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { getProxyImageUrl } from '../src/utils';
import { fetchRoles } from '../services/apiService';

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
                <div className="border-[1.5px] border-red-600/60 rounded-md px-3 py-1.5 flex flex-col items-center transform -rotate-12 bg-red-50/10">
                  <span className="text-[9px] font-black text-red-600 uppercase tracking-[0.2em] mb-1 border-b border-red-600/30 w-full text-center pb-1">
                    NGƯỜI KÝ
                  </span>
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <span className="text-[8px] font-black text-red-600/80 tabular-nums leading-none">
                      {formatDateTime(inspection.createdAt || inspection.date).split(' - ')[0]}
                    </span>
                    <span className="text-[8px] font-black text-red-600/80 tabular-nums">
                      {formatDateTime(inspection.createdAt || inspection.date).split(' - ')[1]}
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
                  <div className="border-[1.5px] border-red-600/60 rounded-md px-3 py-1.5 flex flex-col items-center transform rotate-12 bg-red-50/10">
                    <span className="text-[9px] font-black text-red-600 uppercase tracking-[0.15em] mb-1 border-b border-red-600/30 w-full text-center pb-1">
                      XÁC NHẬN L1
                    </span>
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <span className="text-[8px] font-black text-red-600/80 tabular-nums leading-none">
                        {formatDateTime(inspection.teamLeadDate || inspection.date).split(' - ')[0]}
                      </span>
                      <span className="text-[8px] font-black text-red-600/80 tabular-nums">
                        {formatDateTime(inspection.teamLeadDate || inspection.date).split(' - ')[1]}
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
                <div className="border-[1.5px] border-red-600/60 rounded-md px-3 py-1.5 flex flex-col items-center transform -rotate-6 bg-red-50/10">
                  <span className="text-[9px] font-black text-red-600 uppercase tracking-[0.15em] mb-1 border-b border-red-600/30 w-full text-center pb-1">
                    PHÊ DUYỆT L2
                  </span>
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <span className="text-[8px] font-black text-red-600/80 tabular-nums leading-none">
                      {formatDateTime(inspection.updatedAt || inspection.date).split(' - ')[0]}
                    </span>
                    <span className="text-[8px] font-black text-red-600/80 tabular-nums">
                      {formatDateTime(inspection.updatedAt || inspection.date).split(' - ')[1]}
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
    </section>
  );
};
