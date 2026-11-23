import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ApiErrorLogEntry,
  ModuleProbeResult,
  clearSystemAuditErrors,
  fetchSystemAuditErrors,
  probeAllModules,
} from '../services/apiService';
import { Combobox } from '../src/components/qms';

const MODULE_OPTIONS = [
  'M00',
  'M01',
  'M02',
  'M03',
  'M04',
  'M05',
  'M06',
  'M07',
  'M08',
  'M09',
  'M10',
  'M11',
  'M12',
];

const MODULE_LABELS: Record<string, string> = {
  M00: 'M00 · App Shell & Auth',
  M01: 'M01 · Báo Cáo Tổng Hợp',
  M02: 'M02 · Quản Lý Dự Án',
  M03: 'M03 · Lịch Nghiệm Thu GCN',
  M04: 'M04 · Nhà Cung Cấp',
  M05: 'M05 · Danh Sách Phiếu',
  M06: 'M06 · Danh Sách NCR & Sự Cố',
  M07: 'M07 · Thư Viện Lỗi',
  M08: 'M08 · Quản Lý Vật Liệu (Read-Only)',
  M09: 'M09 · Quản Lý CCDC',
  M10: 'M10 · IPO Data (Read-Only)',
  M11: 'M11 · Cài Đặt & Phân Quyền RBAC',
  M12: 'M12 · Thùng Rác & Kiểm Toán',
};

const formatTimestampGmt7 = (unixSec: number): string => {
  if (!unixSec) return '—';
  const ms = unixSec > 1e12 ? unixSec : unixSec * 1000;
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
};

const getHttpStatusMeta = (code: number) => {
  if (code >= 500) {
    return {
      textClass: 'text-red-600 dark:text-red-400',
      rowTint: 'bg-red-50/40 dark:bg-red-950/20',
      label: code === 502 ? '502 HTML Fallback' : code === 503 ? '503 Network/DB' : `${code} Server Error`,
    };
  }
  if (code === 401 || code === 403) {
    return {
      textClass: 'text-orange-600 dark:text-orange-400',
      rowTint: 'bg-yellow-50/50 dark:bg-amber-950/20',
      label: code === 401 ? '401 Unauthorized' : '403 Read-Only / Forbidden',
    };
  }
  if (code === 404) {
    return {
      textClass: 'text-orange-500 dark:text-orange-400',
      rowTint: 'bg-yellow-50/40 dark:bg-amber-950/10',
      label: '404 Not Found',
    };
  }
  if (code === 429) {
    return {
      textClass: 'text-cyan-600 dark:text-cyan-400',
      rowTint: '',
      label: '429 Rate Limit',
    };
  }
  return {
    textClass: 'text-orange-600 dark:text-orange-400',
    rowTint: '',
    label: `${code} Client Error`,
  };
};

export const SystemAuditPanel: React.FC = () => {
  const [errors, setErrors] = useState<ApiErrorLogEntry[]>([]);
  const [probes, setProbes] = useState<ModuleProbeResult[]>([]);
  const [probeCheckedAt, setProbeCheckedAt] = useState<number | null>(null);
  const [isLoadingErrors, setIsLoadingErrors] = useState(true);
  const [isProbing, setIsProbing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [loadErrorMsg, setLoadErrorMsg] = useState<string | null>(null);

  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [statusGroup, setStatusGroup] = useState<'ALL' | '4xx' | '5xx'>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [showProbeTable, setShowProbeTable] = useState(true);

  const loadErrors = useCallback(async () => {
    setIsLoadingErrors(true);
    setLoadErrorMsg(null);
    try {
      const moduleParam = selectedModule && selectedModule !== 'ALL' ? selectedModule : 'ALL';
      const res = await fetchSystemAuditErrors({
        limit: 50,
        moduleId: moduleParam,
        statusGroup,
        search: searchTerm,
      });
      setErrors(Array.isArray(res?.items) ? res.items : []);
    } catch (err: any) {
      setLoadErrorMsg(err?.message || 'Không thể tải nhật ký kiểm toán API');
    } finally {
      setIsLoadingErrors(false);
    }
  }, [selectedModule, statusGroup, searchTerm]);

  const handleProbeModules = useCallback(async () => {
    setIsProbing(true);
    try {
      const res = await probeAllModules();
      setProbes(Array.isArray(res?.results) ? res.results : []);
      setProbeCheckedAt(res?.checkedAt || Math.floor(Date.now() / 1000));
    } catch (err: any) {
      setLoadErrorMsg(err?.message || 'Không thể chạy kiểm tra kết nối 13 module (M00–M12)');
    } finally {
      setIsProbing(false);
    }
  }, []);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  useEffect(() => {
    handleProbeModules();
  }, [handleProbeModules]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadErrors();
    }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadErrors]);

  const visibleErrors = useMemo(() => {
    if (!selectedModule || selectedModule === 'ALL') return errors.slice(0, 50);
    return errors.filter((e) => e.moduleId === selectedModule).slice(0, 50);
  }, [errors, selectedModule]);

  const metrics = useMemo(() => {
    const totalErrors = visibleErrors.length;
    const count4xx = visibleErrors.filter((e) => e.statusCode >= 400 && e.statusCode < 500).length;
    const count5xx = visibleErrors.filter((e) => e.statusCode >= 500).length;
    const healthyModules = probes.filter((p) => p.status === 'OK').length;
    const failingModules = probes.filter((p) => p.status !== 'OK').length;
    return { totalErrors, count4xx, count5xx, healthyModules, failingModules };
  }, [visibleErrors, probes]);

  const handleConfirmClear = async () => {
    setIsClearing(true);
    try {
      await clearSystemAuditErrors();
      setConfirmClearOpen(false);
      await loadErrors();
    } catch (err: any) {
      setLoadErrorMsg(err?.message || 'Xóa nhật ký thất bại');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6 text-sm text-slate-800 dark:text-slate-200 pb-20 lg:pb-0">
      {/* Page Title & Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 md:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">
              KIỂM TOÁN HỆ THỐNG & LỖI API
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Theo dõi 50 phản hồi lỗi API gần nhất (HTTP 4xx/5xx) trên toàn bộ 13 module nghiệp vụ (M00–M12) và kiểm tra kết nối PostgreSQL trực tiếp.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`min-h-[44px] lg:min-h-[38px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoRefresh
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {autoRefresh ? 'Tự động cập nhật: Bật (10s)' : 'Tự động cập nhật: Tắt'}
            </button>

            <button
              type="button"
              onClick={handleProbeModules}
              disabled={isProbing}
              className="min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className={`w-4 h-4 ${isProbing ? 'animate-spin' : ''}`} />
              <span>{isProbing ? 'Đang kiểm tra...' : 'Kiểm tra 13 Module'}</span>
            </button>

            <button
              type="button"
              onClick={loadErrors}
              disabled={isLoadingErrors}
              className="min-h-[44px] lg:min-h-[38px] px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingErrors ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              disabled={visibleErrors.length === 0 || confirmClearOpen}
              className="min-h-[44px] lg:min-h-[38px] px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa nhật ký</span>
            </button>
          </div>
        </div>

        {/* Inline Confirm Bar (No window.confirm, no nested modal) */}
        {confirmClearOpen && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Xác nhận xóa danh sách 50 lỗi API hiện tại? Thao tác này sẽ được ghi vào Audit Log hệ thống.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="min-h-[44px] lg:min-h-[36px] px-4 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="min-h-[44px] lg:min-h-[36px] px-4 py-1.5 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 cursor-pointer"
              >
                {isClearing ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        )}

        {/* Single-Elevation Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Kết nối 13 Module (Live)
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {probes.length > 0 ? (
                <span className={metrics.failingModules > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                  {metrics.healthyModules}/{probes.length} Đạt
                </span>
              ) : (
                '—'
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Tổng lỗi hiển thị (Tối đa 50)
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {metrics.totalErrors}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Lỗi Client / Auth / 404 (4xx)
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-orange-500 dark:text-orange-400">
              {metrics.count4xx}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Lỗi Server / CSDL (5xx)
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
              {metrics.count5xx}
            </div>
          </div>
        </div>
      </div>

      {/* Live 12-Module Connectivity Diagnostic Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowProbeTable((v) => !v)}
          className="w-full min-h-[44px] px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700 text-left cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            {showProbeTable ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Trạng thái kết nối trực tiếp M00 – M12
            </span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {probeCheckedAt ? `Kiểm tra lúc: ${formatTimestampGmt7(probeCheckedAt)}` : 'Chưa kiểm tra'}
          </span>
        </button>

        {showProbeTable && (
          <div>
            {isProbing && probes.length === 0 ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Mobile Probe Cards (< md) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {probes.map((p) => {
                    const isOk = p.status === 'OK';
                    return (
                      <div key={p.moduleId} className={`p-3.5 space-y-1.5 ${!isOk ? 'bg-red-50/70 dark:bg-red-950/20' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono tabular-nums font-bold text-xs text-blue-600 dark:text-blue-400 mr-1.5">{p.moduleId}</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{p.moduleName}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${isOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            <span className="font-mono tabular-nums">{p.httpStatus}</span>
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.endpoint} · {p.table}</div>
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>{p.rowCount.toLocaleString('vi-VN')} bản ghi</span>
                          <span>{p.latencyMs} ms</span>
                        </div>
                        {!isOk && p.message && (
                          <p className="text-xs text-red-600 dark:text-red-400 font-medium break-words">{p.message}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet Probe Table (md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2.5 whitespace-nowrap">Module</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Chức năng</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Endpoint Chính</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Bảng DB</th>
                        <th className="px-3 py-2.5 whitespace-nowrap">Trạng thái HTTP</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Số bản ghi</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Độ trễ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {probes.map((p) => {
                        const isOk = p.status === 'OK';
                        return (
                          <tr
                            key={p.moduleId}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${!isOk ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                          >
                            <td className="px-3 py-2.5 font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              {p.moduleId}
                            </td>
                            <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {p.moduleName}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {p.endpoint}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {p.table}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 font-medium ${
                                  isOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {isOk ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                                <span className="font-mono tabular-nums">{p.httpStatus}</span>
                                <span>{isOk ? 'Hoạt động' : p.message}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {p.rowCount.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {p.latencyMs} ms
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filters & Last 50 API Errors Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest pl-1">
                  Lọc theo Module (M00–M12)
                </label>
                <Combobox
                  value={selectedModule === 'ALL' ? null : selectedModule}
                  onChange={(v) => setSelectedModule(v || 'ALL')}
                  options={MODULE_OPTIONS.map((m) => ({ value: m, label: MODULE_LABELS[m] || m }))}
                  placeholder="Tất cả 13 module (M00–M12)"
                  allowClear={true}
                  ariaLabel="Lọc theo Module (M00–M12)"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest pl-1">
                  Nhóm mã trạng thái HTTP
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 min-h-[44px] lg:min-h-[38px]">
                  {(['ALL', '4xx', '5xx'] as const).map((grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setStatusGroup(grp)}
                      className={`flex-1 min-h-[36px] lg:min-h-[30px] px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        statusGroup === grp
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {grp === 'ALL' ? 'Tất cả' : grp === '4xx' ? '4xx Client' : '5xx Server'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest pl-1">
                  Tìm endpoint / thông báo lỗi
                </label>
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSearchTerm(searchInput);
                    }}
                    onBlur={() => setSearchTerm(searchInput)}
                    placeholder="VD: /api/projects, 404, password..."
                    className="w-full min-h-[44px] lg:min-h-[38px] pl-9 pr-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm lg:text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
              Hiển thị {visibleErrors.length} / 50 bản ghi gần nhất
            </div>
          </div>
        </div>

        {/* Error State with Retry Button */}
        {loadErrorMsg ? (
          <div className="p-8 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{loadErrorMsg}</p>
            <button
              type="button"
              onClick={loadErrors}
              className="min-h-[44px] lg:min-h-[38px] px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : isLoadingErrors ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : visibleErrors.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Chưa ghi nhận phản hồi lỗi API nào phù hợp bộ lọc
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Mọi yêu cầu API có mã HTTP &ge; 400 trên cả 13 module (M00–M12) đều được tự động ghi nhận tại đây theo thời gian thực.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Error Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {visibleErrors.map((err) => {
                const statusMeta = getHttpStatusMeta(err.statusCode);
                const isExpanded = expandedErrorId === err.id;
                return (
                  <div key={err.id} className={statusMeta.rowTint}>
                    <button
                      type="button"
                      onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}
                      className="w-full min-h-[44px] p-3.5 text-left space-y-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`font-mono tabular-nums text-xs font-bold ${statusMeta.textClass}`}>
                          {statusMeta.label}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {formatTimestampGmt7(err.timestamp)}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <span className="font-mono text-blue-600 dark:text-blue-400">{err.moduleId}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span>{err.moduleName}</span>
                      </div>
                      <div className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                        <span className="font-semibold text-cyan-600 dark:text-cyan-400 mr-1.5">{err.method}</span>
                        <span>{err.path}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 break-words">{err.errorMessage}</p>
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400 pt-0.5">
                        <span>{err.durationMs} ms · {err.userId || 'anon'}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-sans font-medium">
                          {isExpanded ? 'Thu gọn ▲' : 'Chi tiết ▼'}
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-200/70 dark:border-slate-700 pt-2.5 bg-slate-50 dark:bg-slate-800/40">
                        <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                          Chi tiết ({err.id})
                        </div>
                        <div className="text-xs text-slate-800 dark:text-slate-200 font-medium break-words">
                          {err.errorMessage}
                        </div>
                        {err.details && (
                          <pre className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                            {JSON.stringify(err.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Error Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[780px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2.5 whitespace-nowrap">Thời gian (GMT+7)</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Module</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">HTTP Code</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Method & Endpoint</th>
                    <th className="px-3 py-2.5">Thông báo lỗi</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Độ trễ / User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {visibleErrors.map((err) => {
                    const statusMeta = getHttpStatusMeta(err.statusCode);
                    const isExpanded = expandedErrorId === err.id;
                    return (
                      <React.Fragment key={err.id}>
                        <tr
                          onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}
                          className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${statusMeta.rowTint}`}
                        >
                          <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {formatTimestampGmt7(err.timestamp)}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{err.moduleId}</span>
                            <span className="text-slate-400 mx-1">·</span>
                            <span className="text-slate-700 dark:text-slate-300">{err.moduleName}</span>
                          </td>
                          <td className={`px-3 py-2.5 font-mono tabular-nums font-semibold whitespace-nowrap ${statusMeta.textClass}`}>
                            {statusMeta.label}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            <span className="font-semibold text-cyan-600 dark:text-cyan-400 mr-2">{err.method}</span>
                            <span>{err.path}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 max-w-md truncate" title={err.errorMessage}>
                            {err.errorMessage}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {err.durationMs} ms · {err.userId || 'anon'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
                            <td colSpan={6} className="px-4 py-3 space-y-1.5">
                              <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                                Chi tiết phản hồi lỗi ({err.id})
                              </div>
                              <div className="text-sm text-slate-800 dark:text-slate-200 font-medium break-words">
                                {err.errorMessage}
                              </div>
                              {err.details && (
                                <pre className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs text-slate-700 dark:text-slate-300 overflow-x-auto">
                                  {JSON.stringify(err.details, null, 2)}
                                </pre>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
