
import React, { useMemo, useState, useEffect } from 'react';
import { Inspection, InspectionStatus, Priority, User, ViewState, Workshop, NCR } from '../types';
import { fetchInspectionsProjects, fetchNcrs } from '../services/apiService';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ComposedChart, Line, CartesianGrid, Legend, LabelList
} from 'recharts';
import { 
  ClipboardCheck, AlertTriangle, CheckCircle2, Flag, 
  Activity, Clock, AlertOctagon,
  ArrowRight, ShieldCheck, UserCircle, Filter, X, Search, RotateCcw, ChevronDown
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { DateRangePicker } from './DateRangePicker';
import { Combobox } from '../src/components/qms';

interface DashboardProps {
  dashboardStats?: any;
  user?: User;
  users?: User[];
  workshops?: Workshop[];
  filters?: any;
  onLogout?: () => void;
  onNavigate?: (view: ViewState) => void;
  onViewInspection?: (id: string) => void;
  onFilterChange?: (filters: any) => void;
}

const COLORS = {
  pass: '#10b981',
  fail: '#ef4444',
  pending: '#f59e0b',
  draft: '#94a3b8',
  blue: '#3b82f6',
};

const MODULE_CONFIG: Record<string, { label: string }> = {
    'IQC': { label: 'IQC' },
    'PQC': { label: 'PQC' },
    'SQC_MAT': { label: 'SQC-VT' },
    'SQC_VT': { label: 'SQC-VT' },
    'SQC_BTP': { label: 'SQC-BTP' },
    'SQC_TP': { label: 'SQC-TP' },
    'FQC': { label: 'FQC' },
    'SITE': { label: 'SITE' },
    'SPR': { label: 'SPR' },
    'STEP': { label: 'STEP' },
    'FSR': { label: 'FSR' }
};

export const Dashboard: React.FC<DashboardProps> = ({ dashboardStats, user, users = [], workshops = [], filters, onLogout, onNavigate, onViewInspection, onFilterChange }) => {
  const splitCsv = (val: any): string[] =>
    val ? String(val).split(',').map((s) => s.trim()).filter((s) => s.length > 0 && s !== 'ALL') : [];

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterQC, setFilterQC] = useState<string[]>(() => splitCsv(filters?.qc));
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>(() => splitCsv(filters?.workshop));
  const [filterStatus, setFilterStatus] = useState<string[]>(() => splitCsv(filters?.status));
  const [filterType, setFilterType] = useState<string[]>(() => splitCsv(filters?.type));
  const [filterProject, setFilterProject] = useState<string[]>(() => splitCsv(filters?.project));
  const [filterStage, setFilterStage] = useState<string[]>(() => splitCsv(filters?.stage ?? filters?.inspectionStage));
  const [startDate, setStartDate] = useState(() => filters?.startDate || '');
  const [endDate, setEndDate] = useState(() => filters?.endDate || '');
  const [projectOptions, setProjectOptions] = useState<any[]>([]);
  const [ncrList, setNcrList] = useState<NCR[]>([]);
  const [isLoadingNcrs, setIsLoadingNcrs] = useState(false);
  const [ncrGroupRange, setNcrGroupRange] = useState<'DAY'|'WEEK'|'MONTH'|'YEAR'>('DAY');
  const [selectedNcrDateKey, setSelectedNcrDateKey] = useState<string | null>(null);

  useEffect(() => {
    setFilterQC(splitCsv(filters?.qc));
    setFilterWorkshop(splitCsv(filters?.workshop));
    setFilterStatus(splitCsv(filters?.status));
    setFilterType(splitCsv(filters?.type));
    setFilterProject(splitCsv(filters?.project));
    setFilterStage(splitCsv(filters?.stage ?? filters?.inspectionStage));
    setStartDate(filters?.startDate || '');
    setEndDate(filters?.endDate || '');
    setSelectedNcrDateKey(null);
  }, [filters]);

  const emitFilterChange = (overrides: Record<string, any> = {}) => {
    if (!onFilterChange) return;
    const next = {
      qc: (overrides.qc ?? filterQC).join(','),
      workshop: (overrides.workshop ?? filterWorkshop).join(','),
      status: (overrides.status ?? filterStatus).join(','),
      type: (overrides.type ?? filterType).join(','),
      project: (overrides.project ?? filterProject).join(','),
      stage: (overrides.stage ?? filterStage).join(','),
      startDate: overrides.startDate !== undefined ? overrides.startDate : startDate,
      endDate: overrides.endDate !== undefined ? overrides.endDate : endDate,
    };
    onFilterChange(next);
  };

  useEffect(() => {
    let active = true;
    setIsLoadingNcrs(true);

    const ncrFilters: any = {};
    if (filters?.qc && filters.qc !== 'ALL') ncrFilters.qc = filters.qc;
    if (filters?.workshop && filters.workshop !== 'ALL') ncrFilters.workshop = filters.workshop;
    if (filters?.project && filters.project !== 'ALL') ncrFilters.project = filters.project;
    if (filters?.type && filters.type !== 'ALL') ncrFilters.type = filters.type;
    if (filters?.stage && filters.stage !== 'ALL') ncrFilters.stage = filters.stage;
    if (filters?.status && filters.status !== 'ALL') ncrFilters.inspectionStatus = filters.status;
    if (filters?.startDate) ncrFilters.startDate = filters.startDate;
    if (filters?.endDate) ncrFilters.endDate = filters.endDate;

    fetchNcrs(ncrFilters, 1, 1000)
      .then((res: any) => {
        if (active) {
            setNcrList(res?.items || []);
        }
      })
      .catch((err: any) => {
        console.warn("Could not load NCRs for dashboard:", err?.message || err);
        if (active) {
            setNcrList([]);
        }
      })
      .finally(() => {
        if (active) setIsLoadingNcrs(false);
      });

    return () => { active = false; };
  }, [filters]);

  const getNcrGmt7Ymd = (ncr: NCR): { year: number; month: number; day: number } | null => {
    const rawDate = typeof ncr.createdDate === 'string' ? ncr.createdDate.trim() : '';
    const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) };
    }
    const rawTs = ncr.created_at !== undefined && ncr.created_at !== null ? Number(ncr.created_at) : NaN;
    let ms = NaN;
    if (Number.isFinite(rawTs) && rawTs > 0) {
      ms = rawTs > 1e12 ? rawTs : rawTs * 1000;
    } else if (rawDate) {
      ms = Date.parse(rawDate);
    }
    if (!Number.isFinite(ms)) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(ms));
      const y = Number(parts.find((p) => p.type === 'year')?.value);
      const m = Number(parts.find((p) => p.type === 'month')?.value);
      const d = Number(parts.find((p) => p.type === 'day')?.value);
      if (y && m && d) return { year: y, month: m, day: d };
    } catch {
      // fallback below
    }
    const dt = new Date(ms + 7 * 3600 * 1000);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
  };

  const getNcrGroupBucket = (ncr: NCR, range: 'DAY'|'WEEK'|'MONTH'|'YEAR'): { key: string; label: string } | null => {
    const ymd = getNcrGmt7Ymd(ncr);
    if (!ymd) return null;
    const pad2 = (n: number) => String(n).padStart(2, '0');
    if (range === 'DAY') {
      return {
        key: `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}`,
        label: `${pad2(ymd.day)}/${pad2(ymd.month)}`,
      };
    }
    if (range === 'WEEK') {
      const utcDate = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
      const dayOfWeek = utcDate.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(utcDate.getTime() + diffToMonday * 86400000);
      const wy = monday.getUTCFullYear();
      const wm = monday.getUTCMonth() + 1;
      const wd = monday.getUTCDate();
      const weekNum = Math.ceil(wd / 7);
      return {
        key: `${wy}-${pad2(wm)}-${pad2(wd)}`,
        label: `Tuần ${weekNum} (${pad2(wd)}/${pad2(wm)})`,
      };
    }
    if (range === 'MONTH') {
      return {
        key: `${ymd.year}-${pad2(ymd.month)}`,
        label: `T${ymd.month}/${ymd.year}`,
      };
    }
    return {
      key: `${ymd.year}`,
      label: `Năm ${ymd.year}`,
    };
  };

  const ncrChartData = useMemo(() => {
    const grouped: Record<string, { dateLabel: string; count: number }> = {};

    ncrList.forEach(ncr => {
      const bucket = getNcrGroupBucket(ncr, ncrGroupRange);
      if (!bucket) return;
      if (!grouped[bucket.key]) {
        grouped[bucket.key] = { dateLabel: bucket.label, count: 0 };
      }
      grouped[bucket.key].count += 1;
    });

    return Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, val]) => ({
        key,
        name: val.dateLabel,
        count: val.count
      }));
  }, [ncrList, ncrGroupRange]);

  const filteredNcrList = useMemo(() => {
    if (!selectedNcrDateKey) return ncrList;
    return ncrList.filter(ncr => {
      const bucket = getNcrGroupBucket(ncr, ncrGroupRange);
      return bucket?.key === selectedNcrDateKey;
    });
  }, [ncrList, selectedNcrDateKey, ncrGroupRange]);

  const filteredInspectionNcrList = useMemo(() => {
    const map = new Map();
    filteredNcrList.forEach(ncr => {
        if (!map.has(ncr.inspection_id)) {
            map.set(ncr.inspection_id, {
                inspection_id: ncr.inspection_id,
                ma_ct: ncr.ma_ct,
                ten_hang_muc: ncr.ten_hang_muc,
                workshop: ncr.workshop,
                createdDate: ncr.createdDate,
                createdAt: ncr.created_at || ncr.createdDate,
                inspectorName: ncr.inspectorName,
                ncrCount: 1,
            });
        } else {
            map.get(ncr.inspection_id).ncrCount += 1;
        }
    });
    return Array.from(map.values());
  }, [filteredNcrList]);

  useEffect(() => {
    let active = true;
    fetchInspectionsProjects()
      .then((projs) => {
        if (active) {
          setProjectOptions(projs || []);
        }
      })
      .catch((err) => console.error("Failed to load dashboard projects filtering options", err));
    return () => {
      active = false;
    };
  }, []);

  const workshopLabels = useMemo(() => {
    const map: Record<string, string> = {};
    workshops.forEach(w => {
      map[w.code] = `${w.name} (${w.code})`;
    });
    map['VẬT TƯ'] = 'Vật Tư (VẬT TƯ)';
    map['GCN'] = 'GCN (Gia Công Ngoài)';
    map['SQC_TP'] = 'SQC - Thành Phẩm';
    map['LẮP ĐẶT'] = 'Lắp Đặt (SITE)';
    return map;
  }, [workshops]);

  const projectLabels = useMemo(() => {
    const map: Record<string, string> = {};
    projectOptions.forEach(p => {
      map[p.ma_ct] = `${p.ten_ct || p.name || p.ma_ct} (${p.ma_ct})`;
    });
    return map;
  }, [projectOptions]);

  const filterOptions = useMemo(() => {
    const qaqcUsers = (users || []).filter(u => {
      const isRoleQC = u.role === 'QC';
      const dept = String(u.phong_ban || u.phongBan || '').toUpperCase();
      return isRoleQC || dept.includes('QA') || dept.includes('QC') || dept.includes('CHẤT LƯỢNG') || dept.includes('CHAT LUONG');
    });

    const workshopStages = workshops.flatMap(w => w.stages || []);
    const stageDedupeMap = new Map<string, string>();
    [
      'P18 - Sơn - Vecni - PVD - UPH - Đan Mây',
      ...workshopStages,
    ]
      .filter(Boolean)
      .forEach((raw) => {
        const clean = String(raw).trim();
        const key = clean.toLowerCase();
        if (!stageDedupeMap.has(key)) {
          stageDedupeMap.set(key, clean);
        }
      });
    const allStages = Array.from(stageDedupeMap.values()).sort((a, b) => a.localeCompare(b, 'vi'));

    return {
      inspectors: Array.from(new Set(user?.role === 'QC' ? [user.name] : (qaqcUsers.map(u => u.name) || []))),
      workshops: Array.from(new Set([
        ...workshops.map(w => w.code),
        'VẬT TƯ', 'GCN', 'LẮP ĐẶT'
      ])),
      types: Object.keys(MODULE_CONFIG),
      projects: projectOptions.map(p => p.ma_ct),
      statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.VERIFIED, InspectionStatus.APPROVED, InspectionStatus.LOCKED, InspectionStatus.REJECTED, InspectionStatus.FLAGGED],
      stages: allStages
    };
  }, [user, users, workshops, projectOptions]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterStatus.length > 0 || filterType.length > 0 || filterProject.length > 0 || filterStage.length > 0 || startDate !== '' || endDate !== '';

  const clearFilters = () => {
    setFilterQC([]);
    setFilterWorkshop([]);
    setFilterStatus([]);
    setFilterType([]);
    setFilterProject([]);
    setFilterStage([]);
    setStartDate('');
    setEndDate('');
    setSelectedNcrDateKey(null);
    if (onFilterChange) onFilterChange({});
  };

  const toSafeNumber = (val: unknown, fallback = 0): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const clampRate = (val: number): number => {
    if (!Number.isFinite(val)) return 0;
    return Math.min(100, Math.max(0, val));
  };

  const stats = useMemo(() => {
    const raw = dashboardStats?.stats;
    if (raw) {
      const avgSuccessRate = clampRate(toSafeNumber(raw.avgSuccessRate, 0));
      const avgErrorRate = clampRate(toSafeNumber(raw.avgErrorRate, 0));
      return {
        total: toSafeNumber(raw.total, 0),
        drafts: toSafeNumber(raw.drafts, 0),
        highPriority: toSafeNumber(raw.highPriority, 0),
        nonDraftCount: toSafeNumber(raw.nonDraftCount, 0),
        avgSuccessRate,
        avgErrorRate,
      };
    }
    return { total: 0, drafts: 0, highPriority: 0, nonDraftCount: 0, avgSuccessRate: 0, avgErrorRate: 0 };
  }, [dashboardStats]);

  const statusData = useMemo(() => {
    return [
      { name: '% Đạt', value: toSafeNumber(stats.avgSuccessRate, 0), color: COLORS.pass },
      { name: '% Lỗi', value: toSafeNumber(stats.avgErrorRate, 0), color: COLORS.fail },
    ].filter(item => Number.isFinite(item.value) && item.value > 0);
  }, [stats]);

  const monthlyData = useMemo(() => {
    if (!Array.isArray(dashboardStats?.monthlyData)) return [];

    return dashboardStats.monthlyData.map((m: any) => {
      const inspected = toSafeNumber(m.inspected, 0);
      const passed = toSafeNumber(m.passed, 0);
      const failed = toSafeNumber(m.failed, 0);
      const count = toSafeNumber(m.count, 0);
      const fallbackScore = toSafeNumber(m.fallbackScore, 0);

      let passRate = 0;
      let failRate = 0;

      if (inspected > 0) {
        passRate = clampRate(Number(((passed / inspected) * 100).toFixed(1)));
        failRate = clampRate(Number(((failed / inspected) * 100).toFixed(1)));
      } else if (count > 0 && fallbackScore > 0) {
        passRate = clampRate(Number((fallbackScore / count).toFixed(1)));
        failRate = clampRate(Number((100 - passRate).toFixed(1)));
      }

      return {
        name: String(m.month || '—'),
        passRate,
        failRate,
        inspected,
        count,
      };
    });
  }, [dashboardStats]);

  const workshopData = useMemo(() => {
    if (!Array.isArray(dashboardStats?.workshopData)) return [];

    return dashboardStats.workshopData
      .map((item: any) => {
        const inspected = toSafeNumber(item.inspected, 0);
        const passed = toSafeNumber(item.passed, 0);
        const failed = toSafeNumber(item.failed, 0);
        const count = toSafeNumber(item.count, 0);
        const fallbackScore = toSafeNumber(item.fallbackScore, 0);

        let passRate = 0;
        let failRate = 0;
        if (inspected > 0) {
          passRate = clampRate(parseFloat(((passed / inspected) * 100).toFixed(1)));
          failRate = clampRate(parseFloat(((failed / inspected) * 100).toFixed(1)));
        } else if (count > 0 && fallbackScore > 0) {
          passRate = clampRate(parseFloat((fallbackScore / count).toFixed(1)));
          failRate = clampRate(parseFloat((100 - passRate).toFixed(1)));
        }

        const code = String(item.code || 'XƯỞNG MẶC ĐỊNH');
        const wsObj = workshops.find(w => w.code === code);
        const displayName = wsObj ? wsObj.name : (workshopLabels[code] || code);

        return {
          code,
          name: displayName,
          passRate,
          failRate,
        };
      })
      .sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .slice(0, 15);
  }, [dashboardStats, workshops, workshopLabels]);

  const stageData = useMemo(() => {
    if (!Array.isArray(dashboardStats?.stageData)) return [];

    const stageMap: Record<string, { inspected: number; passed: number; failed: number; count: number }> = {};

    dashboardStats.stageData.forEach((item: any) => {
      let stageName = String(item.stageName || '').trim();
      if (!stageName) return;

      const numericMatches = stageName.match(/\d+/);
      if (numericMatches) {
        stageName = `P${Number(numericMatches[0])}`;
      } else if (!stageName.startsWith('P')) {
        stageName = `P${stageName}`;
      }

      if (!stageMap[stageName]) stageMap[stageName] = { inspected: 0, passed: 0, failed: 0, count: 0 };

      stageMap[stageName].inspected += toSafeNumber(item.inspected, 0);
      stageMap[stageName].passed += toSafeNumber(item.passed, 0);
      stageMap[stageName].failed += toSafeNumber(item.failed, 0);
      stageMap[stageName].count += toSafeNumber(item.count, 0);
    });

    return Object.keys(stageMap)
      .map(key => {
        const item = stageMap[key];
        let passRate = 0;
        let failRate = 0;
        if (item.inspected > 0) {
          passRate = clampRate(parseFloat(((item.passed / item.inspected) * 100).toFixed(1)));
          failRate = clampRate(parseFloat(((item.failed / item.inspected) * 100).toFixed(1)));
        }

        return {
          name: key,
          passRate,
          failRate,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [dashboardStats]);



  const StatCard = ({ title, value, icon: Icon, colorHex, subtitle }: any) => (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 leading-tight">{value}</h3>
          <p className="text-[7px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{subtitle}</p>
        </div>
        <div className={`p-2 rounded-xl shrink-0`} style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-50 dark:bg-slate-800/50 flex flex-col no-scroll-x">
      <div className="p-4 space-y-5 max-w-7xl mx-auto w-full pb-28">
        
        {/* Filter Section */}
        <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex items-center justify-between cursor-pointer select-none min-h-[44px]" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Filter className="w-4 h-4" /> BỘ LỌC DỮ LIỆU {isFilterActive && <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded text-[8px] animate-pulse">ĐANG TÁC DỤNG</span>}
                </h3>
                <div className="flex items-center gap-2">
                  {isFilterActive && (
                      <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                          className="min-h-[44px] lg:min-h-[36px] px-3 py-2 text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                      >
                          Xóa tất cả
                      </button>
                  )}
                  <div className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-full">
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isFilterOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>
            </div>
            
            {isFilterOpen && (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <SearchableSelect 
                        label="Loại phiếu"
                        values={filterType}
                        options={filterOptions.types}
                        onChange={(vals) => { setFilterType(vals); emitFilterChange({ type: vals }); }}
                        optionLabels={Object.fromEntries(Object.entries(MODULE_CONFIG).map(([k, v]) => [k, v.label]))}
                    />
                    <SearchableSelect 
                        label="Dự án"
                        values={filterProject}
                        options={filterOptions.projects}
                        onChange={(vals) => { setFilterProject(vals); emitFilterChange({ project: vals }); }}
                        optionLabels={projectLabels}
                    />
                    <SearchableSelect 
                        label="Xưởng Sản Xuất"
                        values={filterWorkshop}
                        options={filterOptions.workshops}
                        onChange={(vals) => { setFilterWorkshop(vals); emitFilterChange({ workshop: vals }); }}
                        optionLabels={workshopLabels}
                    />
                    <SearchableSelect 
                        label="Công đoạn kiểm tra"
                        values={filterStage}
                        options={filterOptions.stages}
                        onChange={(vals) => { setFilterStage(vals); emitFilterChange({ stage: vals }); }}
                    />
                    <SearchableSelect 
                        label="QC Kiểm tra"
                        values={filterQC}
                        options={filterOptions.inspectors}
                        onChange={(vals) => { setFilterQC(vals); emitFilterChange({ qc: vals }); }}
                    />
                    <DateRangePicker 
                        label="Khoảng ngày"
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={(d) => { setStartDate(d); emitFilterChange({ startDate: d }); }}
                        onEndDateChange={(d) => { setEndDate(d); emitFilterChange({ endDate: d }); }}
                        onRangeChange={(s, e) => { setStartDate(s); setEndDate(e); emitFilterChange({ startDate: s, endDate: e }); }}
                    />
                </div>
            )}
        </div>

        {/* Top Stat Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="TỔNG PHIẾU" value={stats.total} icon={ClipboardCheck} colorHex="#3b82f6" subtitle={`${stats.drafts} bản nháp`} />
            <StatCard title="TỶ LỆ ĐẠT AVG" value={`${stats.avgSuccessRate}%`} icon={CheckCircle2} colorHex="#10b981" subtitle="KPI: >90%" />
            <StatCard title="% LỖI AVG" value={`${stats.avgErrorRate}%`} icon={AlertTriangle} colorHex="#ef4444" subtitle="Trung bình/Phiếu" />
            <StatCard title="CẤP BÁCH" value={stats.highPriority} icon={Flag} colorHex="#f59e0b" subtitle="Ưu tiên cao" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4">
            {/* Status Pie */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
               <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 w-full text-center border-b border-slate-50 pb-2">PHÂN BỔ TỶ LỆ (%)</h3>
               <div className="w-full h-40 relative min-h-[160px]">
                  <ResponsiveContainer width="99%" height={160}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {statusData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <p className="text-xl font-black text-slate-800 dark:text-slate-200 leading-none">{stats.avgSuccessRate}%</p>
                     <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">TRUNG BÌNH</p>
                  </div>
               </div>
               <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {statusData.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase whitespace-nowrap">{entry.name}: {entry.value}%</p>
                      </div>
                  ))}
               </div>
            </div>



            {/* Workshop Quality Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
               <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center justify-between">
                  CHẤT LƯỢNG XƯỞNG SẢN XUẤT
               </h3>
               <div className="h-64 w-full min-h-[256px]">
                  <ResponsiveContainer width="99%" height={256}>
                    <ComposedChart data={workshopData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                        angle={-45}
                        textAnchor="end"
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={[0, 100]} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 'auto']} 
                        hide
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                        labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                      />
                      <Legend 
                        iconType="circle" 
                        wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                      />
                      <Bar yAxisId="left" dataKey="passRate" name="Tỷ Lệ Đạt %" fill={COLORS.pass} barSize={24} radius={[4, 4, 0, 0]}>
                        {workshopData.map((entry: any, index: number) => (
                           <Cell key={`cell-${index}`} fill={COLORS.pass} />
                        ))}
                        <LabelList dataKey="passRate" position="insideTop" style={{ fill: '#fff', fontSize: 8, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }}>
                        <LabelList dataKey="failRate" position="top" offset={10} style={{ fill: '#dc2626', fontSize: 9, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Stage Quality Chart (PQC) */}
            {stageData.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">
                    HIỆU SUẤT THEO CÔNG ĐOẠN PQC (%)
                 </h3>
                 <div className="h-64 w-full min-h-[256px]">
                    <ResponsiveContainer width="99%" height={256}>
                      <ComposedChart data={stageData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                        />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                          labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b' }}
                        />
                        <Bar dataKey="passRate" name="Tỷ Lệ Đạt %" fill={COLORS.pass} barSize={24} radius={[4, 4, 0, 0]}>
                           <LabelList dataKey="passRate" position="insideTop" style={{ fill: '#fff', fontSize: 8, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Bar>
                        <Line type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }}>
                           <LabelList dataKey="failRate" position="top" offset={10} style={{ fill: '#dc2626', fontSize: 9, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            )}

            {/* Monthly Quality Chart */}
            {monthlyData.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center justify-between">
                    CHẤT LƯỢNG THEO THÁNG
                 </h3>
                 <div className="h-64 w-full min-h-[256px]">
                    <ResponsiveContainer width="99%" height={256}>
                      <ComposedChart data={monthlyData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                          angle={-45}
                          textAnchor="end"
                        />
                        <YAxis 
                          yAxisId="left"
                          domain={[0, 100]} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 'auto']} 
                          hide
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                          labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                        />
                        <Legend 
                          iconType="circle" 
                          wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                        />
                        <Bar yAxisId="left" dataKey="passRate" name="Tỷ Lệ Đạt %" fill={COLORS.pass} barSize={24} radius={[4, 4, 0, 0]}>
                          {monthlyData.map((entry: any, index: number) => (
                             <Cell key={`cell-${index}`} fill={COLORS.pass} />
                          ))}
                          <LabelList dataKey="passRate" position="insideTop" style={{ fill: '#fff', fontSize: 8, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }}>
                          <LabelList dataKey="failRate" position="top" offset={10} style={{ fill: '#dc2626', fontSize: 9, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            )}

            {/* NCR Quality Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
               <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-slate-50 dark:border-slate-800 pb-2">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    BIỂU ĐỒ LỖI (NCR)
                 </h3>
                 <Combobox
                   value={ncrGroupRange}
                   onChange={(val) => {
                     setNcrGroupRange((val as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR') || 'DAY');
                     setSelectedNcrDateKey(null);
                   }}
                   options={[
                     { value: 'DAY', label: 'Theo Ngày' },
                     { value: 'WEEK', label: 'Theo Tuần' },
                     { value: 'MONTH', label: 'Theo Tháng' },
                     { value: 'YEAR', label: 'Theo Năm' },
                   ]}
                   allowClear={false}
                   ariaLabel="Phạm vi nhóm biểu đồ NCR"
                   className="w-40"
                 />
               </div>
               
               <div className="h-64 w-full min-h-[256px]">
                  {isLoadingNcrs ? (
                     <div className="h-full flex items-center justify-center text-slate-400">Đang tải dữ liệu...</div>
                  ) : ncrChartData.length === 0 ? (
                     <div className="h-full flex items-center justify-center text-slate-400 font-medium text-xs">Không có dữ liệu lỗi</div>
                  ) : (
                     <ResponsiveContainer width="99%" height={256}>
                       <BarChart 
                         data={ncrChartData} 
                         margin={{ top: 20, right: 0, left: -20, bottom: 20 }}
                         onClick={(data) => {
                           if (data && data.activePayload && data.activePayload.length > 0) {
                             const key = data.activePayload[0].payload.key;
                             setSelectedNcrDateKey(key === selectedNcrDateKey ? null : key);
                           }
                         }}
                       >
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                         <XAxis 
                           dataKey="name" 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                           angle={ncrGroupRange === 'DAY' ? -45 : 0}
                           textAnchor={ncrGroupRange === 'DAY' ? 'end' : 'middle'}
                         />
                         <YAxis 
                           domain={[0, 'auto']} 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                         />
                         <Tooltip 
                           cursor={{fill: 'rgba(0,0,0,0.05)'}}
                           contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                           itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                           labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                         />
                         <Bar dataKey="count" name="Số lượng NCR" fill="#ef4444" barSize={32} radius={[4, 4, 0, 0]}>
                           {ncrChartData.map((entry, index) => (
                             <Cell 
                               key={`cell-${index}`} 
                               fill={entry.key === selectedNcrDateKey ? "#dc2626" : "#ef4444"} 
                               className="cursor-pointer transition-colors duration-200"
                             />
                           ))}
                           <LabelList dataKey="count" position="top" style={{ fill: '#b91c1c', fontSize: 9, fontWeight: '900' }} />
                         </Bar>
                       </BarChart>
                     </ResponsiveContainer>
                  )}
               </div>
            </div>



            {/* NCR List Details */}
            {ncrList.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                   <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 dark:border-slate-800 pb-2 flex items-center justify-between gap-2">
                      <span>DANH SÁCH PHIẾU KIỂM TRA CÓ LỖI (NCR)</span>
                      {selectedNcrDateKey && (
                        <button 
                          type="button"
                          onClick={() => setSelectedNcrDateKey(null)}
                          className="min-h-[44px] lg:min-h-[36px] px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center gap-1.5 font-bold text-xs transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Bỏ lọc
                        </button>
                      )}
                   </h3>
                   {/* Mobile Cards (< md) */}
                   <div className="md:hidden space-y-2.5 max-h-[440px] overflow-y-auto no-scrollbar">
                      {filteredInspectionNcrList.map(item => (
                        <button
                          key={item.inspection_id}
                          type="button"
                          onClick={() => onViewInspection && onViewInspection(item.inspection_id)}
                          className="w-full text-left p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-3 min-h-[60px]"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                #{item.inspection_id.substring(0, 8).toUpperCase()}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                                {item.createdDate ? new Date(item.createdDate).toLocaleDateString('vi-VN') : (item.createdAt ? new Date(item.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.ten_hang_muc || '---'}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {item.ma_ct || '---'} {item.workshop ? ` - ${item.workshop}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className="px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-black tabular-nums">
                              {item.ncrCount} NCR
                            </span>
                            <ArrowRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </button>
                      ))}
                      {filteredInspectionNcrList.length === 0 && (
                        <div className="py-6 text-center text-xs font-medium text-slate-400">
                          Không có dữ liệu phù hợp
                        </div>
                      )}
                   </div>
                   {/* Desktop & Tablet Table (>= md) */}
                   <div className="hidden md:block max-h-[440px] overflow-auto w-full no-scrollbar rounded-xl border border-slate-100 dark:border-slate-800">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Mã phiếu</th>
                            <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Hạng mục / Công trình</th>
                            <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 uppercase text-center border-b border-slate-200 dark:border-slate-700">Số lỗi (NCR)</th>
                            <th className="px-3 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right border-b border-slate-200 dark:border-slate-700">Ngày tạo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredInspectionNcrList.map(item => (
                            <tr 
                              key={item.inspection_id} 
                              onClick={() => onViewInspection && onViewInspection(item.inspection_id)}
                              className="hover:bg-blue-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group"
                            >
                              <td className="px-3 py-3 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 transition-colors tabular-nums">
                                #{item.inspection_id.substring(0, 8).toUpperCase()}
                              </td>
                              <td className="px-3 py-3 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {item.ten_hang_muc || '---'}
                                <span className="block text-[10px] text-slate-400">
                                  {item.ma_ct || '---'} {item.workshop ? ` - ${item.workshop}` : ''}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-xs font-black text-red-500 text-center tabular-nums">
                                {item.ncrCount}
                              </td>
                              <td className="px-3 py-3 text-xs font-medium text-slate-500 text-right tabular-nums">
                                {item.createdDate ? new Date(item.createdDate).toLocaleDateString('vi-VN') : (item.createdAt ? new Date(item.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </td>
                            </tr>
                          ))}
                          {filteredInspectionNcrList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-xs font-medium text-slate-400">
                                Không có dữ liệu phù hợp
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                   </div>
                </div>
            )}


        </div>


      </div>
    </div>
  );
};
