import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SubcontractorBooking, User, SQCType, Supplier, SubcontractorBookingItem, SubcontractorBookingDocuments } from '../types.js';
import {
  getM03Capabilities,
  canEditM03Booking,
  canDeleteM03Booking,
  canAssignM03Booking,
  canInspectM03Booking,
} from '../src/utils/m03Rbac.js';
import { 
  fetchSubcontractorBookings, 
  reconcileSubcontractorBookingsApi, 
  createSubcontractorBooking,
  updateSubcontractorBooking,
  deleteSubcontractorBooking,
  fetchSuppliers,
  findSupplierByName,
  saveSupplier,
  lookupPoMaterials,
  syncSuppliersFromBookingsApi
} from '../services/apiService.js';
import {
  SearchInput,
  Combobox,
  ConfirmDialog,
  Pagination,
} from '../src/components/qms';
import { BookingDetailModal } from './BookingDetailModal';
import { BookingExpandedDetailPanel } from './BookingExpandedDetailPanel';
import { QCAssignmentModal } from './QCAssignmentModal';
import { BookingDocumentsUploader } from './BookingDocumentsUploader';
import { countBookingDocuments, serializeBookingDocumentsForSave } from '../src/utils/bookingDocuments';
import {
  splitPoTokens,
  collectBookingAllPoTokens,
  formatBookingPoSummary,
  computeSupplierMismatchWarnings,
  MAX_BOOKING_PO_TOKENS,
} from '../src/utils/poTokens';

import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  FileText, 
  RefreshCw, 
  User as UserIcon, 
  UserCheck,
  Eye, 
  AlertCircle, 
  AlertTriangle,
  X, 
  Plus,
  Trash2,
  Pencil,
  Check,
  Paperclip,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Download,
  ClipboardCheck,
  List as ListIcon,
  CalendarDays,
  FileSpreadsheet,
} from 'lucide-react';

interface Props {
  currentUser?: User;
  rolesList?: any[];
  onStartInspection?: (booking: SubcontractorBooking) => void;
  onViewInspection?: (inspectionId: string) => void;
}

const SQC_TYPES_CONFIG = [
  {
    id: 'SQC_VT' as SQCType,
    title: 'SQC - VẬT TƯ NGOÀI',
    shortDesc: 'Vật tư / phụ kiện gia công ngoài',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    badgeBorder: 'border-emerald-300 dark:border-emerald-700'
  },
  {
    id: 'SQC_BTP' as SQCType,
    title: 'SQC - BÁN THÀNH PHẨM',
    shortDesc: 'Khung thô, phôi mộc, chi tiết gia công',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40',
    badgeBorder: 'border-blue-300 dark:border-blue-700'
  },
  {
    id: 'SQC_TP' as SQCType,
    title: 'SQC - THÀNH PHẨM',
    shortDesc: 'Sản phẩm hoàn thiện, đóng gói chuẩn bị giao',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/40',
    badgeBorder: 'border-purple-300 dark:border-purple-700'
  }
];

function getBookingDatePolicy() {
  const now = new Date();
  const currentHour = now.getHours();
  const isAfter15h = currentHour >= 15;
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const minDate = isAfter15h ? dayAfter : tomorrow;
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const formatDMY = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  return {
    isAfter15h,
    minDateStr: formatYMD(minDate),
    minDateDisplay: formatDMY(minDate),
    tomorrowDisplay: formatDMY(tomorrow),
    dayAfterDisplay: formatDMY(dayAfter),
    currentTimeFormatted: `${pad(currentHour)}:${pad(now.getMinutes())}`
  };
}

export const SubcontractorBookingManagement: React.FC<Props> = ({ currentUser, rolesList = [], onStartInspection, onViewInspection }) => {
  const m03Caps = useMemo(() => getM03Capabilities(currentUser, rolesList), [currentUser, rolesList]);

  const [bookings, setBookings] = useState<SubcontractorBooking[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [sqcTypeFilter, setSqcTypeFilter] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'GROUPED_BY_DATE' | 'FLAT'>('GROUPED_BY_DATE');

  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set());
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Set<string>>(() => new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Non-blocking inline feedback & confirm dialog
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Detail Modal state
  const [selectedBooking, setSelectedBooking] = useState<SubcontractorBooking | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [scrollModalToSqc, setScrollModalToSqc] = useState(false);

  // QC Assignment & Feedback Modal state (single-level modal, never nested)
  const [assignTargetBooking, setAssignTargetBooking] = useState<SubcontractorBooking | null>(null);
  const [assignModalOptions, setAssignModalOptions] = useState<{ mode?: 'ASSIGN' | 'RETURN'; prefillReason?: string } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const openAssignModal = (
    booking: SubcontractorBooking,
    options?: { mode?: 'ASSIGN' | 'RETURN'; prefillReason?: string }
  ) => {
    if (!canAssignM03Booking(currentUser, booking, rolesList)) {
      showNotice('error', 'Bạn không có quyền Phân công QC hoặc Trả lại bổ sung cho phiếu này.');
      return;
    }
    setShowDetailModal(false);
    setShowCreateModal(false);
    setAssignTargetBooking(booking);
    setAssignModalOptions(options || null);
    setShowAssignModal(true);
  };

  // Create / Edit Booking Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState<SubcontractorBooking | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const bookingPolicy = getBookingDatePolicy();

  const [newBooking, setNewBooking] = useState<{
    sqcType: SQCType;
    poNumber: string;
    poNumbers: string[];
    supplierName: string;
    locationAddress: string;
    contactPerson: string;
    contactPhone: string;
    requestedDate: string;
    notes: string;
    items: SubcontractorBookingItem[];
    documents: SubcontractorBookingDocuments;
  }>({
    sqcType: 'SQC_BTP',
    poNumber: '',
    poNumbers: [],
    supplierName: '',
    locationAddress: '',
    contactPerson: '',
    contactPhone: '',
    requestedDate: bookingPolicy.minDateStr,
    notes: '',
    items: [
      { id: '1', itemName: 'Tủ âm tường MFC Phủ Melamine', quantity: 10, unit: 'Bộ', specifications: 'Theo shopdrawing SD-01', poNumber: '', isInspected: true }
    ],
    documents: {}
  });

  // PO Autocomplete & Multi-PO state
  const [poSearchResults, setPoSearchResults] = useState<any[]>([]);
  const [isSearchingPo, setIsSearchingPo] = useState(false);
  const [showPoDropdown, setShowPoDropdown] = useState(false);
  const [poSupplierMap, setPoSupplierMap] = useState<Record<string, string>>({});
  const poInputRef = useRef<HTMLInputElement>(null);

  const allFormPoTokens = useMemo(() => {
    return splitPoTokens([
      ...(newBooking.poNumbers || []),
      newBooking.poNumber,
      ...newBooking.items.map((it) => it.poNumber),
    ]);
  }, [newBooking.poNumbers, newBooking.poNumber, newBooking.items]);

  const supplierMismatchWarnings = useMemo(() => {
    const sources: Array<{ poNumber?: string | null; supplierName?: string | null }> = [];
    for (const tok of allFormPoTokens) {
      const mapped = poSupplierMap[tok.toLowerCase()];
      if (mapped) {
        sources.push({ poNumber: tok, supplierName: mapped });
      }
    }
    for (const it of newBooking.items) {
      if (it.poNumber && it.supplierName) {
        sources.push({ poNumber: it.poNumber, supplierName: it.supplierName });
      }
    }
    return computeSupplierMismatchWarnings(newBooking.supplierName, sources);
  }, [allFormPoTokens, poSupplierMap, newBooking.items, newBooking.supplierName]);

  // Supplier Lookup Status
  const [supplierStatus, setSupplierStatus] = useState<{
    status: 'idle' | 'loading' | 'found' | 'not_found';
    originalSupplier: Supplier | null;
    message?: string;
  }>({
    status: 'idle',
    originalSupplier: null
  });

  useEffect(() => {
    if (!m03Caps.canView) {
      setBookings([]);
      return;
    }
    loadData();
    loadSuppliersList();
  }, [m03Caps.canView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sqcTypeFilter, supplierFilter, statusFilter, dateFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setNotice({ type, text });
  };

  const loadData = async () => {
    if (!m03Caps.canView) return;
    setIsLoading(true);
    try {
      const bkRes = await fetchSubcontractorBookings();
      const rawBookings: SubcontractorBooking[] = bkRes.bookings || [];
      setBookings(rawBookings);
    } catch (err: any) {
      console.error("Failed to load subcontractor bookings:", err);
      if (err?.status === 403) {
        showNotice('error', err?.message || 'Bạn không có quyền truy cập danh sách Lịch nghiệm thu (HTTP 403).');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadSuppliersList = async () => {
    if (!m03Caps.canView) return;
    try {
      if (m03Caps.canCreate || m03Caps.canEditOwn || m03Caps.canEditAll) {
        await syncSuppliersFromBookingsApi().catch(() => {});
      }
      const res = await fetchSuppliers('', 300);
      const list = res.items || (res as any).suppliers || (Array.isArray(res) ? res : []);
      setSuppliers(list);
    } catch (e) {
      console.warn("Could not load suppliers list:", e);
    }
  };


  // Helper: Tra cứu thông tin chi tiết nhà cung cấp theo tên từ state và API
  const lookupAndApplySupplier = async (supplierName: string) => {
    const cleanName = supplierName.trim();
    if (!cleanName) {
      setSupplierStatus({ status: 'idle', originalSupplier: null });
      return;
    }

    setSupplierStatus(prev => ({ ...prev, status: 'loading' }));

    // 1. Kiểm tra trong danh sách suppliers đã nạp sẵn
    let found = suppliers.find(s => 
      s.name && s.name.trim().toLowerCase() === cleanName.toLowerCase()
    );

    // 2. Nếu chưa có hoặc thiếu thông tin, gọi API findSupplierByName
    if (!found || (!found.address && !found.phone && !found.contact_person)) {
      try {
        const apiRes = await findSupplierByName(cleanName);
        if (apiRes && apiRes.supplier) {
          found = apiRes.supplier;
        }
      } catch (e) {
        console.warn("findSupplierByName error:", e);
      }
    }

    if (found && (found.address || found.contact_person || found.phone)) {
      setNewBooking(prev => ({
        ...prev,
        supplierName: found!.name || prev.supplierName,
        locationAddress: found!.address || prev.locationAddress,
        contactPerson: found!.contact_person || prev.contactPerson,
        contactPhone: found!.phone || prev.contactPhone,
      }));
      setSupplierStatus({
        status: 'found',
        originalSupplier: found,
        message: `Đã tìm thấy thông tin NCC trong danh bạ (${found.name})`
      });
    } else if (found) {
      setSupplierStatus({
        status: 'not_found',
        originalSupplier: found,
        message: 'NCC có trong danh bạ nhưng chưa có SĐT/Địa chỉ - Vui lòng nhập tay bên dưới'
      });
    } else {
      setSupplierStatus({
        status: 'not_found',
        originalSupplier: null,
        message: 'NCC mới chưa có trong danh bạ - Vui lòng nhập tay bên dưới để lưu cho lần sau'
      });
    }
  };

  const cachePoSuppliersFromResults = (results: any[]) => {
    if (!Array.isArray(results) || results.length === 0) return;
    setPoSupplierMap(prev => {
      let changed = false;
      const next = { ...prev };
      for (const r of results) {
        const code = String(r?.poNumber || r?.itemCode || '').trim();
        const sup = String(r?.supplierName || '').trim();
        if (code && sup && next[code.toLowerCase()] !== sup) {
          next[code.toLowerCase()] = sup;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  // Tra cứu PO khi gõ
  const handlePoSearch = async (queryVal: string) => {
    setNewBooking(prev => ({ ...prev, poNumber: queryVal }));
    const segments = queryVal.split(/[,;\n|]+/);
    const activeSegment = (segments[segments.length - 1] || '').trim();
    if (!activeSegment || activeSegment.length < 2) {
      setPoSearchResults([]);
      setShowPoDropdown(false);
      return;
    }
    setIsSearchingPo(true);
    setShowPoDropdown(true);
    try {
      const res = await lookupPoMaterials(activeSegment);
      const foundItems = res.items || [];
      setPoSearchResults(foundItems);
      cachePoSuppliersFromResults(foundItems);
    } catch (err) {
      console.error("Lỗi khi tra cứu PO/Material:", err);
    } finally {
      setIsSearchingPo(false);
    }
  };

  const handleCommitHeaderPoTokens = async (rawInput?: string) => {
    const tokensToAdd = splitPoTokens(rawInput ?? newBooking.poNumber);
    if (tokensToAdd.length === 0) return;

    setNewBooking(prev => {
      const mergedChips = splitPoTokens([...(prev.poNumbers || []), ...tokensToAdd]).slice(0, MAX_BOOKING_PO_TOKENS);
      const nextItems = prev.items.length === 1 && !String(prev.items[0].poNumber || '').trim() && mergedChips.length === 1
        ? [{ ...prev.items[0], poNumber: mergedChips[0] }]
        : prev.items;
      return {
        ...prev,
        poNumbers: mergedChips,
        poNumber: '',
        items: nextItems,
      };
    });
    setShowPoDropdown(false);

    // Dò nền thông tin NCC cho các mã mới thêm để cảnh báo nếu khác NCC (không tự thêm hạng mục)
    for (const tok of tokensToAdd.slice(0, 3)) {
      if (!poSupplierMap[tok.toLowerCase()]) {
        try {
          const res = await lookupPoMaterials(tok);
          const list = res.items || [];
          cachePoSuppliersFromResults(list);
          const exact = list.find((i: any) =>
            String(i?.poNumber || '').toLowerCase() === tok.toLowerCase() ||
            String(i?.itemCode || '').toLowerCase() === tok.toLowerCase()
          ) || list[0];
          if (exact?.supplierName && !newBooking.supplierName.trim()) {
            setNewBooking(prev => ({
              ...prev,
              supplierName: prev.supplierName || exact.supplierName,
              locationAddress: prev.locationAddress || exact.supplierAddress || '',
              contactPerson: prev.contactPerson || exact.supplierContactPerson || '',
              contactPhone: prev.contactPhone || exact.supplierPhone || '',
            }));
            await lookupAndApplySupplier(exact.supplierName);
          }
        } catch {
          // Ignore background lookup failure
        }
      }
    }
  };

  const handleRemoveHeaderPoToken = (tokenToRemove: string) => {
    const keyLower = tokenToRemove.trim().toLowerCase();
    setNewBooking(prev => ({
      ...prev,
      poNumbers: (prev.poNumbers || []).filter(t => t.trim().toLowerCase() !== keyLower),
      items: prev.items.map(it =>
        String(it.poNumber || '').trim().toLowerCase() === keyLower
          ? { ...it, poNumber: '' }
          : it
      ),
    }));
  };

  // Khi chọn một mục từ kết quả gợi ý PO/PR
  // Quy tắc đã chốt: Từ PO/PR thứ 2 trở đi (hoặc forceCodeOnly) CHỈ thêm mã PO/PR, KHÔNG tự thêm hạng mục.
  const handleSelectPoItem = (item: any, forceCodeOnly = false) => {
    const matchedPo = String(item.poNumber || item.itemCode || '').trim();
    const matchedSupplier = String(item.supplierName || '').trim();
    if (!matchedPo) return;

    if (matchedSupplier) {
      setPoSupplierMap(prev => ({ ...prev, [matchedPo.toLowerCase()]: matchedSupplier }));
    }

    const existingCommittedCount = splitPoTokens([
      ...(newBooking.poNumbers || []),
      ...newBooking.items.map(i => i.poNumber),
    ]).length;

    const hasCustomItems = newBooking.items.some(it => {
      const nameTrim = String(it.itemName || '').trim();
      const poTrim = String(it.poNumber || '').trim();
      return Boolean(poTrim) || (nameTrim.length > 0 && nameTrim !== 'Tủ âm tường MFC Phủ Melamine');
    });

    const shouldPopulateItems = !forceCodeOnly && existingCommittedCount === 0 && !hasCustomItems;

    if (shouldPopulateItems) {
      const matchingItems = poSearchResults.filter(r => (r.poNumber || r.itemCode) === matchedPo);
      const itemsToUse = matchingItems.length > 0 ? matchingItems : [item];
      const newItems: SubcontractorBookingItem[] = itemsToUse.map((it, idx) => ({
        id: String(idx + 1),
        itemName: it.itemName || 'Sản phẩm / Vật tư gia công',
        quantity: it.quantity || 1,
        unit: it.unit || 'Bộ',
        specifications: it.specifications || (it.projectName ? `Dự án: ${it.projectName}` : ''),
        poNumber: matchedPo,
        supplierName: it.supplierName || matchedSupplier || undefined,
        isInspected: true,
      }));

      setNewBooking(prev => ({
        ...prev,
        poNumber: '',
        poNumbers: splitPoTokens([...(prev.poNumbers || []), matchedPo]),
        supplierName: prev.supplierName || matchedSupplier,
        locationAddress: prev.locationAddress || item.supplierAddress || '',
        contactPerson: prev.contactPerson || item.supplierContactPerson || '',
        contactPhone: prev.contactPhone || item.supplierPhone || '',
        items: newItems.length > 0 ? newItems : prev.items,
      }));

      if (!newBooking.supplierName && matchedSupplier) {
        lookupAndApplySupplier(matchedSupplier);
      }
    } else {
      // Từ mã thứ 2 trở đi hoặc đã có hạng mục: CHỈ thêm mã PO/PR, KHÔNG tự thêm/ghi đè danh sách hạng mục
      setNewBooking(prev => {
        const mergedChips = splitPoTokens([...(prev.poNumbers || []), matchedPo]).slice(0, MAX_BOOKING_PO_TOKENS);
        return {
          ...prev,
          poNumber: '',
          poNumbers: mergedChips,
          supplierName: prev.supplierName || matchedSupplier,
          locationAddress: prev.locationAddress || item.supplierAddress || '',
          contactPerson: prev.contactPerson || item.supplierContactPerson || '',
          contactPhone: prev.contactPhone || item.supplierPhone || '',
        };
      });

      if (!newBooking.supplierName && matchedSupplier) {
        lookupAndApplySupplier(matchedSupplier);
      }
    }

    setShowPoDropdown(false);
  };

  // Khi người dùng hoàn thành nhập ô PO/PR rồi rời ô (onBlur)
  const handlePoInputBlur = async () => {
    setTimeout(async () => {
      setShowPoDropdown(false);
      const poVal = newBooking.poNumber.trim();
      if (!poVal) return;

      const lastSeg = splitPoTokens(poVal).slice(-1)[0] || poVal;
      try {
        const res = await lookupPoMaterials(lastSeg);
        const items = res.items || [];
        cachePoSuppliersFromResults(items);
        if (items.length > 0 && !newBooking.supplierName.trim()) {
          const exactMatch = items.find((i: any) =>
            (i.poNumber && i.poNumber.toLowerCase() === lastSeg.toLowerCase()) ||
            (i.itemCode && i.itemCode.toLowerCase() === lastSeg.toLowerCase())
          ) || items[0];

          if (exactMatch && exactMatch.supplierName) {
            setNewBooking(prev => ({
              ...prev,
              supplierName: prev.supplierName || exactMatch.supplierName,
              locationAddress: prev.locationAddress || exactMatch.supplierAddress || '',
              contactPerson: prev.contactPerson || exactMatch.supplierContactPerson || '',
              contactPhone: prev.contactPhone || exactMatch.supplierPhone || '',
            }));
            await lookupAndApplySupplier(exactMatch.supplierName);
          }
        }
      } catch (e) {
        console.warn("Lookup on blur error:", e);
      }
    }, 250);
  };

  const handleLookupItemPoSupplier = async (itemIdx: number, rawPoVal: string) => {
    const clean = String(rawPoVal || '').trim();
    if (clean.length < 2) return;
    if (poSupplierMap[clean.toLowerCase()]) {
      const cached = poSupplierMap[clean.toLowerCase()];
      setNewBooking(prev => {
        const updated = [...prev.items];
        if (updated[itemIdx]) {
          updated[itemIdx] = { ...updated[itemIdx], supplierName: cached };
        }
        return { ...prev, items: updated };
      });
      return;
    }
    try {
      const res = await lookupPoMaterials(clean);
      const found = res.items || [];
      cachePoSuppliersFromResults(found);
      const exact = found.find((i: any) =>
        String(i?.poNumber || '').toLowerCase() === clean.toLowerCase() ||
        String(i?.itemCode || '').toLowerCase() === clean.toLowerCase()
      ) || found[0];
      if (exact?.supplierName) {
        setNewBooking(prev => {
          const updated = [...prev.items];
          if (updated[itemIdx]) {
            updated[itemIdx] = { ...updated[itemIdx], supplierName: exact.supplierName };
          }
          return { ...prev, items: updated };
        });
      }
    } catch {
      // Ignore optional row lookup failure
    }
  };

  const toYmdDate = (ts?: number): string => {
    if (!ts || ts <= 0) return getBookingDatePolicy().minDateStr;
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return getBookingDatePolicy().minDateStr;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const resetFormState = () => {
    const freshPolicy = getBookingDatePolicy();
    setNewBooking({
      sqcType: 'SQC_BTP',
      poNumber: '',
      poNumbers: [],
      supplierName: '',
      locationAddress: '',
      contactPerson: '',
      contactPhone: '',
      requestedDate: freshPolicy.minDateStr,
      notes: '',
      items: [
        { id: '1', itemName: 'Tủ âm tường MFC Phủ Melamine', quantity: 10, unit: 'Bộ', specifications: 'Theo shopdrawing SD-01', poNumber: '', isInspected: true }
      ],
      documents: {}
    });
    setPoSearchResults([]);
    setPoSupplierMap({});
    setIsUploadingDocs(false);
    setSupplierStatus({ status: 'idle', originalSupplier: null });
    setShowPoDropdown(false);
  };

  const openCreateModal = () => {
    if (!m03Caps.canCreate) {
      showNotice('error', 'Bạn không có quyền tạo mới phiếu Book QC (CREATE).');
      return;
    }
    setEditingBooking(null);
    resetFormState();
    setShowCreateModal(true);
  };

  const openEditModal = (booking: SubcontractorBooking) => {
    if (!canEditM03Booking(currentUser, booking, rolesList)) {
      showNotice('error', 'Bạn không có quyền chỉnh sửa phiếu Book QC này.');
      return;
    }
    setEditingBooking(booking);
    const parsedItems: SubcontractorBookingItem[] =
      Array.isArray(booking.items) && booking.items.length > 0
        ? booking.items.map((it, idx) => ({
            id: it.id || String(idx + 1),
            itemName: it.itemName || '',
            quantity: Number(it.quantity) || 1,
            unit: it.unit || 'Bộ',
            specifications: it.specifications || '',
            poNumber: it.poNumber || '',
            prNumber: it.prNumber || '',
            supplierName: it.supplierName || '',
            isInspected: it.isInspected !== false,
          }))
        : [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '', poNumber: '', isInspected: true }];

    const existingTokens = collectBookingAllPoTokens({
      poNumber: booking.poNumber,
      poNumbers: booking.poNumbers,
      items: parsedItems,
    });

    const cachedSupMap: Record<string, string> = {};
    for (const it of parsedItems) {
      if (it.poNumber && it.supplierName) {
        cachedSupMap[it.poNumber.trim().toLowerCase()] = it.supplierName;
      }
    }
    if (Array.isArray(booking.supplierMismatchWarnings)) {
      for (const w of booking.supplierMismatchWarnings) {
        if (w.poNumber && w.expectedSupplier) {
          cachedSupMap[w.poNumber.trim().toLowerCase()] = w.expectedSupplier;
        }
      }
    }
    setPoSupplierMap(cachedSupMap);

    setNewBooking({
      sqcType: (booking.sqcType as SQCType) || 'SQC_BTP',
      poNumber: '',
      poNumbers: existingTokens,
      supplierName: booking.supplierName || '',
      locationAddress: booking.locationAddress || '',
      contactPerson: booking.contactPerson || '',
      contactPhone: booking.contactPhone || '',
      requestedDate: toYmdDate(booking.requestedDate),
      notes: booking.notes || '',
      items: parsedItems,
      documents: booking.documents || {},
    });
    setIsUploadingDocs(false);
    setSupplierStatus({ status: 'idle', originalSupplier: null });
    setShowPoDropdown(false);
    setShowCreateModal(true);
  };

  // Thao tác Tạo / Cập nhật Phiếu Book QC
  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingBooking) {
      if (!canEditM03Booking(currentUser, editingBooking, rolesList)) {
        showNotice('error', 'Bạn không có quyền sửa phiếu Book QC này.');
        return;
      }
    } else if (!m03Caps.canCreate) {
      showNotice('error', 'Bạn không có quyền tạo mới phiếu Book QC.');
      return;
    }

    const combinedPoTokens = splitPoTokens([
      ...(newBooking.poNumbers || []),
      newBooking.poNumber,
      ...newBooking.items.map(it => it.poNumber),
    ]).slice(0, MAX_BOOKING_PO_TOKENS);

    if (combinedPoTokens.length === 0 || !newBooking.supplierName || !newBooking.locationAddress || !newBooking.contactPerson || !newBooking.contactPhone) {
      showNotice('error', 'Vui lòng điền đầy đủ các trường bắt buộc (*): Mã PO/PR (ít nhất 1 mã), Tên Nhà Cung Cấp, Địa Chỉ, Người Liên Hệ và SĐT.');
      return;
    }

    if (!newBooking.requestedDate) {
      showNotice('error', 'Vui lòng chọn ngày nghiệm thu.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Luôn tự động tạo/cập nhật thông tin Nhà Cung Cấp mới nhất vào bảng suppliers
      if (newBooking.supplierName.trim()) {
        try {
          const origSup = supplierStatus.originalSupplier;
          await saveSupplier({
            id: origSup?.id,
            code: origSup?.code,
            name: newBooking.supplierName.trim(),
            address: newBooking.locationAddress.trim(),
            contact_person: newBooking.contactPerson.trim(),
            phone: newBooking.contactPhone.trim(),
            email: origSup?.email || ''
          });
        } catch (supErr: any) {
          console.warn("Lỗi khi tự động lưu/cập nhật thông tin nhà cung cấp:", supErr);
        }
      }

      const requestedTs = Math.floor(new Date(`${newBooking.requestedDate}T08:00:00`).getTime() / 1000);
      const cleanDocuments = serializeBookingDocumentsForSave(newBooking.documents);
      const normalizedPoStr = combinedPoTokens.join(', ');
      const cleanedItems = newBooking.items.map((it) => ({
        ...it,
        poNumber: it.poNumber ? String(it.poNumber).trim() : '',
      }));

      if (editingBooking) {
        // 2a. Cập nhật phiếu Book QC hiện có
        await updateSubcontractorBooking(editingBooking.id, {
          sqcType: newBooking.sqcType,
          poNumber: normalizedPoStr,
          poNumbers: combinedPoTokens,
          supplierMismatchWarnings,
          supplierName: newBooking.supplierName.trim(),
          locationAddress: newBooking.locationAddress.trim(),
          contactPerson: newBooking.contactPerson.trim(),
          contactPhone: newBooking.contactPhone.trim(),
          requestedDate: requestedTs,
          notes: newBooking.notes,
          items: cleanedItems,
          documents: cleanDocuments,
          version: editingBooking.version,
        });
        showNotice('success', `Đã cập nhật phiếu Book QC ${editingBooking.bookingCode} thành công.`);
      } else {
        // 2b. Tạo mới phiếu Book QC
        await createSubcontractorBooking({
          ...newBooking,
          poNumber: normalizedPoStr,
          poNumbers: combinedPoTokens,
          supplierMismatchWarnings,
          items: cleanedItems,
          documents: cleanDocuments,
          requesterId: currentUser?.id,
          requesterName: currentUser?.name || 'Chuyên viên Mua hàng',
          requestedDate: requestedTs,
        });
        showNotice('success', 'Đã tạo phiếu Book QC thành công.');
      }

      setShowCreateModal(false);
      setEditingBooking(null);
      resetFormState();

      // Nạp lại danh sách
      await Promise.all([loadData(), loadSuppliersList()]);
    } catch (err: any) {
      showNotice('error', 'Lỗi khi lưu phiếu Book QC: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReconcileBookings = async () => {
    if (!m03Caps.canReconcile) {
      showNotice('error', 'Chỉ ADMIN, MANAGER, QA, QC_LEAD hoặc tài khoản có quyền SIGN1/SIGN2 mới được đối chiếu lịch nghiệm thu.');
      return;
    }
    setIsReconciling(true);
    try {
      const res = await reconcileSubcontractorBookingsApi();
      if (res && res.success) {
        showNotice('success', `Đã quét đối chiếu thành công! Cập nhật: ${res.updatedCount || 0} phiếu.`);
        await loadData();
      } else {
        showNotice('info', 'Không có biến động dữ liệu mới.');
      }
    } catch (err: any) {
      showNotice('error', 'Lỗi khi quét đối chiếu: ' + err.message);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const targetObj = bookings.find(b => b.id === deleteTarget.id);
    if (targetObj && !canDeleteM03Booking(currentUser, targetObj, rolesList)) {
      showNotice('error', 'Bạn không có quyền xóa phiếu Book QC này.');
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteSubcontractorBooking(deleteTarget.id);
      setBookings(prev => prev.filter(b => b.id !== deleteTarget.id));
      showNotice('success', `Đã xóa phiếu Book QC ${deleteTarget.code}.`);
      setDeleteTarget(null);
    } catch (e: any) {
      showNotice('error', 'Lỗi khi xóa: ' + e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const sqcTypeOptions = useMemo(() => [
    { value: 'SQC_BTP', label: 'Bán thành phẩm (SQC-BTP)' },
    { value: 'SQC_VT', label: 'Vật tư ngoài (SQC-VT)' },
    { value: 'SQC_TP', label: 'Thành phẩm (SQC-TP)' },
  ], []);

  const supplierOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        bookings
          .map((b) => String(b.supplierName || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'vi'));
    return names.map((name) => ({ value: name, label: name }));
  }, [bookings]);

  const getBookingSqcOutcome = (b: SubcontractorBooking): 'PASS' | 'FAIL' | null => {
    if (b.status === 'COMPLETED') return 'PASS';
    if (b.status === 'RETURNED_FOR_SUPPLEMENT') {
      if (b.sqcResult === 'FAIL' || b.relatedSqcSummary?.latestResult === 'FAIL') return 'FAIL';
      if ((b.relatedSqcSummary?.rejectedCount || 0) > 0) return 'FAIL';
    }
    return null;
  };

  const statusOptions = useMemo(() => [
    { value: 'PENDING', label: 'Chờ phân công' },
    { value: 'ASSIGNED', label: 'Đã phân công' },
    { value: 'IN_PROGRESS', label: 'Đang kiểm tra (Nháp)' },
    { value: 'COMPLETED', label: 'Đã nghiệm thu • PASS' },
    { value: 'RETURNED_FAIL', label: 'Đã nghiệm thu • FAIL' },
    { value: 'RETURNED_FOR_SUPPLEMENT', label: 'Yêu cầu kiểm lại / bổ sung' },
  ], []);

  const toGmt7Ymd = (unixSeconds?: number): string => {
    if (!unixSeconds || unixSeconds <= 0) return '';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(unixSeconds * 1000));
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const d = parts.find((p) => p.type === 'day')?.value;
      return y && m && d ? `${y}-${m}-${d}` : '';
    } catch {
      return '';
    }
  };

  const toGmt7Dmy = (unixSeconds?: number): string => {
    if (!unixSeconds || unixSeconds <= 0) return '—';
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(unixSeconds * 1000));
    } catch {
      return '—';
    }
  };

  const getSqcTypeDisplay = (sqcType?: string) => {
    if (sqcType === 'SQC_VT' || sqcType === 'SQC_MAT') return 'Vật tư ngoài';
    if (sqcType === 'SQC_TP') return 'Thành phẩm';
    return 'Bán thành phẩm';
  };

  const filteredBookings = useMemo(() => bookings.filter(b => {
    if (statusFilter !== null) {
      if (statusFilter === 'RETURNED_FAIL') {
        if (!(b.status === 'RETURNED_FOR_SUPPLEMENT' && getBookingSqcOutcome(b) === 'FAIL')) return false;
      } else if (b.status !== statusFilter) {
        return false;
      }
    }
    if (sqcTypeFilter !== null) {
      const rawType = String(b.sqcType || 'SQC_BTP');
      const normalizedType = rawType === 'SQC_MAT' ? 'SQC_VT' : rawType;
      if (normalizedType !== sqcTypeFilter) return false;
    }
    if (supplierFilter !== null && String(b.supplierName || '').trim() !== supplierFilter) return false;
    if (dateFilter) {
      const bkYmd = toGmt7Ymd(b.requestedDate);
      if (bkYmd !== dateFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchCode = b.bookingCode?.toLowerCase().includes(q);
      const allPos = collectBookingAllPoTokens(b);
      const matchPo =
        b.poNumber?.toLowerCase().includes(q) ||
        allPos.some((tok) => tok.toLowerCase().includes(q));
      const matchSupp = b.supplierName?.toLowerCase().includes(q);
      const matchQc = b.assignedQcName?.toLowerCase().includes(q);
      const matchReq = b.requesterName?.toLowerCase().includes(q);
      const matchSqcId = (b.lastSqcId || b.relatedSqcSummary?.latestReportId || '').toLowerCase().includes(q);
      if (!matchCode && !matchPo && !matchSupp && !matchQc && !matchReq && !matchSqcId) return false;
    }
    return true;
  }), [bookings, statusFilter, sqcTypeFilter, supplierFilter, dateFilter, search]);

  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBookings.slice(start, start + PAGE_SIZE);
  }, [filteredBookings, currentPage]);

  const groupedDateBuckets = useMemo(() => {
    const map = new Map<string, { dateKey: string; dateLabel: string; items: SubcontractorBooking[]; supplierCount: number }>();
    for (const b of paginatedBookings) {
      const dateKey = toGmt7Ymd(b.requestedDate) || 'UNSCHEDULED';
      const dateLabel = b.requestedDate ? toGmt7Dmy(b.requestedDate) : 'Chưa xác định ngày';
      let bucket = map.get(dateKey);
      if (!bucket) {
        bucket = { dateKey, dateLabel, items: [], supplierCount: 0 };
        map.set(dateKey, bucket);
      }
      bucket.items.push(b);
    }
    for (const bucket of map.values()) {
      bucket.supplierCount = new Set(
        bucket.items.map((it) => String(it.supplierName || '').trim().toLowerCase()).filter(Boolean)
      ).size;
    }
    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [paginatedBookings]);

  const toggleRowExpanded = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDateGroup = (dateKey: string) => {
    setCollapsedDateGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const handleExportBookings = async (format: 'xlsx' | 'csv') => {
    setShowExportMenu(false);
    if (filteredBookings.length === 0) {
      showNotice('info', 'Không có dữ liệu phù hợp để xuất file.');
      return;
    }
    setIsExporting(true);
    try {
      const rows = filteredBookings.map((b, idx) => {
        const docCount = countBookingDocuments(b.documents).total;
        const batchLabel =
          b.totalBatchesForPo && b.totalBatchesForPo > 1 && b.batchNumber
            ? `Đợt ${b.batchNumber}/${b.totalBatchesForPo}`
            : 'Đợt 1/1';
        const outcome = getBookingSqcOutcome(b);
        const statusLabel =
          b.status === 'COMPLETED'
            ? 'Đã nghiệm thu - PASS'
            : b.status === 'ASSIGNED'
              ? 'Đã phân công'
              : b.status === 'IN_PROGRESS'
                ? 'Đang kiểm tra (Nháp)'
                : b.status === 'RETURNED_FOR_SUPPLEMENT'
                  ? outcome === 'FAIL'
                    ? 'Đã nghiệm thu - FAIL'
                    : 'Yêu cầu bổ sung'
                  : b.status === 'CANCELLED'
                    ? 'Đã hủy'
                    : 'Chờ phân công';
        return {
          'STT': idx + 1,
          'Số PO / Hợp đồng': formatBookingPoSummary(b).joinedPo || b.poNumber || '',
          'Đợt': batchLabel,
          'Mã Phiếu BK': b.bookingCode || '',
          'Loại Nghiệm Thu': getSqcTypeDisplay(b.sqcType),
          'Xưởng Vệ Tinh': b.supplierName || '',
          'Ngày Nghiệm Thu': toGmt7Dmy(b.requestedDate),
          'Ngày Đề Xuất': b.suggestedDate ? toGmt7Dmy(b.suggestedDate) : '',
          'QC Phụ Trách': b.assignedQcName || 'Chưa phân công',
          'Người Book': b.requesterName || '',
          'Trạng Thái': statusLabel,
          'Số Tài Liệu': docCount,
          'Số Hạng Mục': Array.isArray(b.items) ? b.items.length : 0,
          'Ghi Chú': b.notes || '',
        };
      });

      const dateTag = new Date().toISOString().slice(0, 10);
      if (format === 'xlsx') {
        const { utils, writeFile } = await import('xlsx');
        const ws = utils.json_to_sheet(rows);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'QuanLyNghiemThu');
        writeFile(wb, `QuanLyNghiemThu_M03_${dateTag}.xlsx`);
      } else {
        const { utils } = await import('xlsx');
        const ws = utils.json_to_sheet(rows);
        const csvContent = '\uFEFF' + utils.sheet_to_csv(ws);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QuanLyNghiemThu_M03_${dateTag}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      showNotice('success', `Đã tải xuống ${filteredBookings.length} phiếu (${format.toUpperCase()}).`);
    } catch (err: any) {
      console.error('Export M03 failed:', err);
      showNotice('error', 'Không thể xuất file: ' + (err?.message || 'Lỗi không xác định'));
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters = Boolean(search || sqcTypeFilter || supplierFilter || statusFilter || dateFilter);

  const clearAllFilters = () => {
    setSearch('');
    setSqcTypeFilter(null);
    setSupplierFilter(null);
    setStatusFilter(null);
    setDateFilter('');
  };

  const existingPoBatchesForCreate = useMemo(() => {
    if (editingBooking) return [];
    if (allFormPoTokens.length === 0) return [];
    const formSet = new Set(allFormPoTokens.map((t) => t.toLowerCase()));
    return bookings.filter((b) => {
      if (b.status === 'CANCELLED') return false;
      const bTokens = collectBookingAllPoTokens(b);
      return bTokens.some((tok) => formSet.has(tok.toLowerCase()));
    });
  }, [bookings, editingBooking, allFormPoTokens]);

  const getStatusBadge = (status: string, booking?: SubcontractorBooking) => {
    const isFailResult = Boolean(booking && getBookingSqcOutcome(booking) === 'FAIL');
    const isManual = Boolean(booking?.manualStatusOverride);
    const linkedSqcId =
      booking?.manualOverrideSqcRef || booking?.lastSqcId || booking?.relatedSqcSummary?.latestReportId || '';
    const manualTitleSuffix = isManual
      ? ` (Gán thủ công${booking?.manualOverrideByName ? ` bởi ${booking.manualOverrideByName}` : ''}${booking?.manualOverrideReason ? `: ${booking.manualOverrideReason}` : ''})`
      : '';
    const renderSqcRef = () => {
      if (!linkedSqcId && !isManual) return null;
      const sqcNode = linkedSqcId ? (
        onViewInspection ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewInspection(linkedSqcId);
            }}
            title={`Mở phiếu kiểm tra đối chiếu ${linkedSqcId}`}
            className="text-[10px] font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline tabular-nums cursor-pointer"
          >
            {linkedSqcId}
          </button>
        ) : (
          <span
            title={`Phiếu kiểm tra đối chiếu: ${linkedSqcId}`}
            className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums"
          >
            {linkedSqcId}
          </span>
        )
      ) : null;

      return (
        <div className="inline-flex items-center gap-1 flex-wrap justify-center">
          {isManual && (
            <span
              title={`Trạng thái được gán thủ công${manualTitleSuffix}`}
              className="text-[10px] font-semibold text-slate-500 dark:text-slate-400"
            >
              Thủ công{sqcNode ? ' ·' : ''}
            </span>
          )}
          {sqcNode}
        </div>
      );
    };

    switch (status) {
      case 'COMPLETED':
        return (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span
              title={`${linkedSqcId ? `Đối chiếu phiếu SQC: ${linkedSqcId}` : 'Đã nghiệm thu • PASS'}${manualTitleSuffix}`}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã nghiệm thu • PASS
            </span>
            {renderSqcRef()}
          </div>
        );
      case 'RETURNED_FOR_SUPPLEMENT':
        return isFailResult ? (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span
              title={`${linkedSqcId ? `Đối chiếu phiếu SQC: ${linkedSqcId}` : 'Đã nghiệm thu • FAIL'}${manualTitleSuffix}`}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800 whitespace-nowrap"
            >
              <AlertCircle className="w-3.5 h-3.5" /> Đã nghiệm thu • FAIL
            </span>
            {renderSqcRef()}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800 whitespace-nowrap">
            <AlertCircle className="w-3.5 h-3.5" /> Yêu cầu bổ sung
          </span>
        );
      case 'ASSIGNED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap"><UserCheck className="w-3.5 h-3.5" /> Đã phân công</span>;
      case 'IN_PROGRESS':
        return (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap"><Clock className="w-3.5 h-3.5" /> Đang kiểm (Nháp)</span>
            {renderSqcRef()}
          </div>
        );
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">Đã hủy</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap"><Clock className="w-3.5 h-3.5" /> Chờ phân công</span>;
    }
  };

  if (!m03Caps.canView) {
    return (
      <div className="w-full min-w-0 p-3 sm:p-6 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/50 p-6 sm:p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-slate-900 dark:text-white">
            Không Có Quyền Truy Cập Module Lịch Nghiệm Thu (M03)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Tài khoản của bạn chưa được cấp quyền <span className="font-mono font-semibold">VIEW</span> cho phân hệ <span className="font-mono font-semibold">SUBCONTRACTOR_BOOKING</span>. Vui lòng liên hệ Quản trị viên để được cấp quyền trên ma trận RBAC.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 flex-1 flex flex-col bg-white dark:bg-slate-900 pb-24 lg:pb-0">
      {/* Inline Notification Banner (replaces window.alert) */}
      {notice && (
        <div
          className={`flex items-center justify-between gap-3 px-3 sm:px-4 py-2 border-b text-xs sm:text-sm font-medium ${
            notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-800 dark:text-green-200'
              : notice.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200'
                : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. ERP HEADER (Full-bleed flush with Sidebar) */}
      <div className="w-full min-w-0 px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-slate-900 dark:text-white truncate leading-tight">
              QUẢN LÝ NGHIỆM THU
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Điều phối lịch nghiệm thu gia công ngoài (SQC), phân công QC & đối chiếu chứng từ PO/PR
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 font-mono tabular-nums mr-1">
            {filteredBookings.length.toLocaleString('vi-VN')} phiếu nghiệm thu
          </span>

          {m03Caps.canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[40px] lg:min-h-[36px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tạo Book QC
            </button>
          )}

          <button
            type="button"
            onClick={() => (m03Caps.canReconcile ? handleReconcileBookings() : loadData())}
            disabled={isReconciling || isLoading}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[40px] lg:min-h-[36px] bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
            title={m03Caps.canReconcile ? 'Quét đối chiếu SQC & cập nhật dữ liệu mới nhất' : 'Tải lại dữ liệu mới nhất'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(isReconciling || isLoading) ? 'animate-spin' : ''}`} />
            <span>{isReconciling ? 'Đang cập nhật...' : 'Cập nhật'}</span>
          </button>

          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu((prev) => !prev)}
              disabled={isExporting}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[40px] lg:min-h-[36px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Đang xuất...' : 'Tải về'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-[140] p-1">
                <button
                  type="button"
                  onClick={() => handleExportBookings('xlsx')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Xuất Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportBookings('csv')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Xuất CSV (UTF-8)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. FILTER BAR & STATUS LEGEND (Seamless attached strip) */}
      <div className="w-full min-w-0 px-3 sm:px-4 py-2 bg-slate-50/70 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-center">
          <div className="lg:col-span-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm số PO, mã BK, xưởng vệ tinh..."
              className="w-full"
            />
          </div>

          <div className="lg:col-span-2">
            <Combobox
              value={sqcTypeFilter}
              onChange={setSqcTypeFilter}
              options={sqcTypeOptions}
              placeholder="Loại nghiệm thu..."
              searchPlaceholder="Tìm loại nghiệm thu..."
              className="w-full"
              ariaLabel="Lọc theo loại nghiệm thu"
            />
          </div>

          <div className="lg:col-span-3">
            <Combobox
              value={supplierFilter}
              onChange={setSupplierFilter}
              options={supplierOptions}
              placeholder="Xưởng vệ tinh..."
              searchPlaceholder="Tìm tên xưởng vệ tinh..."
              className="w-full"
              ariaLabel="Lọc theo xưởng vệ tinh"
            />
          </div>

          <div className="lg:col-span-2">
            <Combobox
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              placeholder="Trạng thái..."
              searchPlaceholder="Tìm trạng thái..."
              className="w-full"
              ariaLabel="Lọc theo trạng thái"
            />
          </div>

          <div className="lg:col-span-2 flex items-center gap-1">
            <div className="relative flex-1 min-w-0">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label="Lọc theo ngày nghiệm thu"
                title="Lọc theo ngày nghiệm thu"
                className="w-full min-h-[40px] lg:min-h-[36px] px-2 py-1 text-xs sm:text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                aria-label="Xóa lọc ngày"
                title="Xóa lọc ngày"
                className="min-w-[36px] min-h-[40px] lg:min-h-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* View Toggle & Status Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Chú thích:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-600 shrink-0" aria-hidden="true" />
              <span>Đã nghiệm thu</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" aria-hidden="true" />
              <span>Chờ phân công</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" aria-hidden="true" />
              <span>Đang xử lý</span>
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('FLAT')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'FLAT'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>Theo dòng</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('GROUPED_BY_DATE')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'GROUPED_BY_DATE'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Theo ngày</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. MAIN ERP TABLE & MOBILE CARDS (Edge-to-edge, auto-fit on lg+ with zero clipping) */}
      <div className="w-full min-w-0 flex-1 bg-white dark:bg-slate-900">
        {/* Desktop & Tablet Table View */}
        <div className="hidden md:block w-full overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-left text-sm border-collapse md:min-w-[860px] lg:min-w-0">
            <thead className="bg-[#f1f5f9] dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="w-8 px-1.5 py-2 text-center whitespace-nowrap" aria-label="Mở rộng" />
                <th className="px-2.5 py-2 whitespace-nowrap">PO / Hợp Đồng</th>
                <th className="px-2.5 py-2 whitespace-nowrap">Loại Nghiệm Thu</th>
                <th className="px-2.5 py-2 whitespace-nowrap">Xưởng Vệ Tinh</th>
                <th className="px-2.5 py-2 text-center whitespace-nowrap">Ngày Nghiệm Thu</th>
                <th className="px-2.5 py-2 whitespace-nowrap">Người Phụ Trách</th>
                <th className="px-2.5 py-2 text-center whitespace-nowrap">Trạng Thái / Hành Động</th>
                <th className="sticky right-0 lg:static z-20 w-[108px] bg-[#f1f5f9] dark:bg-slate-800 px-2.5 py-2 text-right whitespace-nowrap border-l border-slate-200/80 dark:border-slate-700/80 lg:border-l-0 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.1)] lg:shadow-none">
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500 dark:text-slate-400">
                    Đang tải danh sách lịch nghiệm thu...
                  </td>
                </tr>
              ) : paginatedBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500 dark:text-slate-400 space-y-2">
                    <p>Không tìm thấy phiếu nghiệm thu phù hợp.</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 text-xs font-semibold cursor-pointer"
                      >
                        Đặt lại bộ lọc
                      </button>
                    )}
                  </td>
                </tr>
              ) : (() => {
                const renderBookingRow = (b: SubcontractorBooking) => {
                  const docCount = countBookingDocuments(b.documents).total;
                  const isExpanded = expandedRowIds.has(b.id);
                  const canAssign = canAssignM03Booking(currentUser, b, rolesList);
                  const canInspect = Boolean(onStartInspection) && canInspectM03Booking(currentUser, b, rolesList);
                  const canEdit = canEditM03Booking(currentUser, b, rolesList);
                  const canDelete = canDeleteM03Booking(currentUser, b, rolesList);
                  const isFinishedOrCancelled = b.status === 'COMPLETED' || b.status === 'CANCELLED';

                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        onClick={() => toggleRowExpanded(b.id)}
                        className={`group transition-colors cursor-pointer ${
                          isExpanded
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Col 1: Expand Chevron */}
                        <td className="px-1.5 py-2 text-center align-middle">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpanded(b.id);
                            }}
                            aria-label={isExpanded ? `Thu gọn ${b.bookingCode}` : `Mở rộng ${b.bookingCode}`}
                            aria-expanded={isExpanded}
                            className={`w-6 h-6 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                              isExpanded
                                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Col 2: PO / Hợp đồng + Đợt + Tài liệu + BK code */}
                        <td className="px-2.5 py-2 whitespace-nowrap align-middle">
                          {(() => {
                            const poSum = formatBookingPoSummary(b);
                            return (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span
                                  className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 tabular-nums"
                                  title={poSum.allPos.length > 1 ? poSum.allPos.join(', ') : poSum.primaryPo}
                                >
                                  {poSum.primaryPo || '—'}
                                </span>
                                {poSum.additionalCount > 0 && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono text-[10px] font-bold tabular-nums"
                                    title={`Gồm ${poSum.allPos.length} mã PO/PR: ${poSum.allPos.join(', ')}`}
                                  >
                                    +{poSum.additionalCount}
                                  </span>
                                )}
                                {b.totalBatchesForPo && b.totalBatchesForPo > 1 && b.batchNumber && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold"
                                    title={`Đợt kiểm ${b.batchNumber} trên tổng ${b.totalBatchesForPo} đợt của PO ${poSum.joinedPo || b.poNumber}`}
                                  >
                                    Đợt {b.batchNumber}/{b.totalBatchesForPo}
                                  </span>
                                )}
                                {docCount > 0 && (
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[10px] font-semibold tabular-nums"
                                    title={`${docCount} tài liệu đính kèm`}
                                  >
                                    <Paperclip className="w-2.5 h-2.5" />
                                    {docCount}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            {b.bookingCode}
                          </div>
                        </td>

                        {/* Col 3: Loại nghiệm thu */}
                        <td className="px-2.5 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap align-middle">
                          {getSqcTypeDisplay(b.sqcType)}
                        </td>

                        {/* Col 4: Xưởng vệ tinh */}
                        <td
                          className="px-2.5 py-2 font-medium text-xs sm:text-sm text-slate-900 dark:text-slate-100 max-w-[165px] xl:max-w-[260px] truncate align-middle"
                          title={b.supplierName}
                        >
                          {b.supplierName || '—'}
                        </td>

                        {/* Col 5: Ngày nghiệm thu (căn giữa) */}
                        <td className="px-2.5 py-2 text-center font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap align-middle">
                          <div>{toGmt7Dmy(b.requestedDate)}</div>
                          {b.suggestedDate && b.suggestedDate > 0 ? (
                            <div
                              className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 mt-0.5"
                              title="Ngày nghiệm thu đề xuất"
                            >
                              Đề xuất: {toGmt7Dmy(b.suggestedDate)}
                            </div>
                          ) : null}
                        </td>

                        {/* Col 6: Người phụ trách (Full width, never overlapped) */}
                        <td className="px-2.5 py-2 max-w-[160px] xl:max-w-[200px] align-middle">
                          <div
                            className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate"
                            title={b.assignedQcName || 'Chưa phân công'}
                          >
                            {b.assignedQcName ? (
                              <span>{b.assignedQcName}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 font-normal">
                                Chưa phân công
                              </span>
                            )}
                          </div>
                          <div
                            className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
                            title={`Người book: ${b.requesterName || '—'}`}
                          >
                            Book: {b.requesterName || '—'}
                          </div>
                        </td>

                        {/* Col 7: Trạng thái / Hành động chính (Non-sticky, never clipped) */}
                        <td
                          className="px-2.5 py-2 text-center whitespace-nowrap align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {b.status === 'PENDING' ? (
                            canAssign ? (
                              <button
                                type="button"
                                onClick={() => openAssignModal(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
                                title="Phân công chuyên viên QC"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Phân Công</span>
                              </button>
                            ) : (
                              getStatusBadge(b.status, b)
                            )
                          ) : b.status === 'RETURNED_FOR_SUPPLEMENT' ? (
                            getBookingSqcOutcome(b) === 'FAIL' ? (
                              <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                                {getStatusBadge(b.status, b)}
                                {canInspect && onStartInspection && (
                                  <button
                                    type="button"
                                    onClick={() => onStartInspection(b)}
                                    className="inline-flex items-center gap-1 px-2 py-1 min-h-[28px] bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
                                    title="Tiến hành nghiệm thu lại lô hàng FAIL"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Kiểm lại</span>
                                  </button>
                                )}
                              </div>
                            ) : canInspect && onStartInspection ? (
                              <button
                                type="button"
                                onClick={() => onStartInspection(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
                                title="Tiến hành nghiệm thu sau khi bổ sung"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                <span>Nghiệm Thu</span>
                              </button>
                            ) : (
                              getStatusBadge(b.status, b)
                            )
                          ) : isFinishedOrCancelled ? (
                            getStatusBadge(b.status, b)
                          ) : b.status === 'IN_PROGRESS' ? (
                            <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                              {getStatusBadge(b.status, b)}
                              {canInspect && onStartInspection && (
                                <button
                                  type="button"
                                  onClick={() => onStartInspection(b)}
                                  className="inline-flex items-center gap-1 px-2 py-1 min-h-[28px] bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
                                  title="Hoàn tất báo cáo nghiệm thu SQC"
                                >
                                  <ClipboardCheck className="w-3 h-3" />
                                  <span>Báo cáo</span>
                                </button>
                              )}
                            </div>
                          ) : canInspect && onStartInspection ? (
                            <button
                              type="button"
                              onClick={() => onStartInspection(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
                              title="Tiến hành lập phiếu nghiệm thu SQC"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              <span>Nghiệm Thu</span>
                            </button>
                          ) : (
                            getStatusBadge(b.status, b)
                          )}
                        </td>

                        {/* Col 8: Thao tác (Static on lg+ so never overlaps Col 7, sticky only on narrow md tablet) */}
                        <td
                          className={`sticky right-0 lg:static z-10 w-[108px] px-2.5 py-2 text-right whitespace-nowrap border-l border-slate-200/80 dark:border-slate-800/80 lg:border-l-0 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)] lg:shadow-none align-middle ${
                            isExpanded
                              ? 'bg-blue-50 dark:bg-slate-900 lg:bg-transparent'
                              : 'bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 lg:bg-transparent lg:group-hover:bg-transparent'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            {canAssign && !isFinishedOrCancelled && (
                              <button
                                type="button"
                                onClick={() => openAssignModal(b)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-800/60 transition-colors cursor-pointer"
                                title="Phân công lại QC / Phản hồi"
                                aria-label={`Phân công lại QC cho ${b.bookingCode}`}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditModal(b)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-800/60 transition-colors cursor-pointer"
                                title="Chỉnh sửa phiếu"
                                aria-label={`Chỉnh sửa ${b.bookingCode}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: b.id, code: b.bookingCode })}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200/70 dark:border-red-800/60 transition-colors cursor-pointer"
                                title="Xóa phiếu"
                                aria-label={`Xóa ${b.bookingCode}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!(canAssign && !isFinishedOrCancelled) && !canEdit && !canDelete && (
                              <button
                                type="button"
                                onClick={() => {
                                  setScrollModalToSqc(b.status === 'COMPLETED');
                                  setSelectedBooking(b);
                                  setShowDetailModal(true);
                                }}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                title="Xem chi tiết đầy đủ"
                                aria-label={`Xem chi tiết ${b.bookingCode}`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Inline 3-Card Expanded Panel */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <BookingExpandedDetailPanel
                              booking={b}
                              onOpenFullModal={(target) => {
                                setScrollModalToSqc(target.status === 'COMPLETED');
                                setSelectedBooking(target);
                                setShowDetailModal(true);
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                };

                if (viewMode === 'FLAT') {
                  return paginatedBookings.map(renderBookingRow);
                }

                return groupedDateBuckets.map((bucket) => {
                  const isGroupCollapsed = collapsedDateGroups.has(bucket.dateKey);
                  return (
                    <React.Fragment key={bucket.dateKey}>
                      {/* Group Header Row */}
                      <tr className="bg-[#eff6ff] dark:bg-blue-950/40 border-y border-blue-200/80 dark:border-blue-900/60">
                        <td colSpan={8} className="px-3 py-1.5">
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200 flex-wrap min-w-0">
                              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span>Ngày {bucket.dateLabel}</span>
                              <span className="text-blue-400 dark:text-blue-600" aria-hidden="true">•</span>
                              <span className="uppercase tracking-wide tabular-nums">
                                TỔNG TRONG NGÀY: {bucket.items.length} phiếu
                              </span>
                              <span className="text-blue-400 dark:text-blue-600" aria-hidden="true">•</span>
                              <span className="font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                                {bucket.supplierCount} xưởng vệ tinh
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDateGroup(bucket.dateKey)}
                              className="px-2.5 py-1 rounded-md bg-white/90 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {isGroupCollapsed ? '+ Mở rộng' : '- Thu gọn'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {!isGroupCollapsed && bucket.items.map(renderBookingRow)}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (< md) — Zero horizontal clipping & >= 44px touch targets */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Đang tải danh sách...</div>
          ) : paginatedBookings.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Không tìm thấy phiếu nghiệm thu nào.</div>
          ) : (
            paginatedBookings.map((b) => {
              const sqcSum = b.relatedSqcSummary;
              const totalSqc = sqcSum?.totalCount || 0;
              const docCount = countBookingDocuments(b.documents).total;
              const isExpanded = expandedRowIds.has(b.id);

              return (
                <div key={b.id} className={isExpanded ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}>
                  <div
                    onClick={() => toggleRowExpanded(b.id)}
                    className="p-3 space-y-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {(() => {
                          const poSum = formatBookingPoSummary(b);
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                              <span>{poSum.primaryPo || '—'}</span>
                              {poSum.additionalCount > 0 && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold"
                                  title={poSum.allPos.join(', ')}
                                >
                                  +{poSum.additionalCount}
                                </span>
                              )}
                              {b.totalBatchesForPo && b.totalBatchesForPo > 1 && b.batchNumber && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold">
                                  Đợt {b.batchNumber}/{b.totalBatchesForPo}
                                </span>
                              )}
                              {docCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[10px] font-semibold">
                                  <Paperclip className="w-2.5 h-2.5" />
                                  {docCount}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                          {b.bookingCode} · {getSqcTypeDisplay(b.sqcType)}
                        </div>
                      </div>
                      <div className="shrink-0">{getStatusBadge(b.status, b)}</div>
                    </div>

                    <div className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                      {b.supplierName}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <div className="space-y-0.5">
                        <div>
                          QC: <strong className="font-semibold text-slate-900 dark:text-slate-100">{b.assignedQcName || 'Chưa phân công'}</strong>
                        </div>
                        <div className="text-[11px]">Book: {b.requesterName || '—'}</div>
                      </div>
                      <div className="font-mono tabular-nums text-right">
                        <div>Ngày: {toGmt7Dmy(b.requestedDate)}</div>
                        {b.suggestedDate && b.suggestedDate > 0 ? (
                          <div className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                            Đề xuất: {toGmt7Dmy(b.suggestedDate)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {totalSqc > 0 && (
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400 tabular-nums">
                        {totalSqc} phiếu SQC liên kết {sqcSum?.latestReportId ? `(${sqcSum.latestReportId})` : ''}
                      </div>
                    )}

                    <div
                      className="flex items-center gap-2 pt-1 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        const canAssign = canAssignM03Booking(currentUser, b, rolesList);
                        const canInspect = Boolean(onStartInspection) && canInspectM03Booking(currentUser, b, rolesList);
                        const canEdit = canEditM03Booking(currentUser, b, rolesList);
                        const canDelete = canDeleteM03Booking(currentUser, b, rolesList);
                        const isFinishedOrCancelled = b.status === 'COMPLETED' || b.status === 'CANCELLED';

                        return (
                          <>
                            {b.status === 'PENDING' ? (
                              canAssign && (
                                <button
                                  type="button"
                                  onClick={() => openAssignModal(b)}
                                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <UserCheck className="w-4 h-4" /> Phân Công
                                </button>
                              )
                            ) : isFinishedOrCancelled ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setScrollModalToSqc(b.status === 'COMPLETED');
                                  setSelectedBooking(b);
                                  setShowDetailModal(true);
                                }}
                                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Eye className="w-4 h-4" /> Xem đầy đủ
                              </button>
                            ) : (
                              <>
                                {canInspect && onStartInspection && (
                                  <button
                                    type="button"
                                    onClick={() => onStartInspection(b)}
                                    className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold transition-colors cursor-pointer ${
                                      b.status === 'RETURNED_FOR_SUPPLEMENT'
                                        ? 'bg-orange-500 hover:bg-orange-600'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                  >
                                    {b.status === 'RETURNED_FOR_SUPPLEMENT' ? 'Nghiệm Thu Lại' : 'Nghiệm Thu'}
                                  </button>
                                )}
                                {canAssign && (
                                  <button
                                    type="button"
                                    onClick={() => openAssignModal(b)}
                                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-colors cursor-pointer"
                                    aria-label={`Phân công QC cho ${b.poNumber}`}
                                  >
                                    <UserCheck className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleRowExpanded(b.id)}
                              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                              aria-label={isExpanded ? 'Thu gọn 3 thẻ' : 'Mở rộng 3 thẻ'}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>

                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditModal(b)}
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-colors cursor-pointer"
                                aria-label={`Sửa phiếu ${b.poNumber}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: b.id, code: b.bookingCode })}
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors cursor-pointer"
                                aria-label={`Xóa phiếu ${b.bookingCode}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {isExpanded && (
                    <BookingExpandedDetailPanel
                      booking={b}
                      onOpenFullModal={(target) => {
                        setScrollModalToSqc(target.status === 'COMPLETED');
                        setSelectedBooking(target);
                        setShowDetailModal(true);
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={filteredBookings.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          className="px-3 sm:px-4 py-2"
        />
      </div>

      {/* MODAL: TẠO / CHỈNH SỬA YÊU CẦU BOOK QC NGHIỆM THU GIA CÔNG */}
      {showCreateModal && (() => {
        const createBookingModal = (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 z-20">
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2 min-w-0">
                {editingBooking ? (
                  <>
                    <Pencil className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
                    <span className="truncate">CHỈNH SỬA PHIẾU BOOK QC — {editingBooking.bookingCode}</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 shrink-0" />
                    <span className="truncate">TẠO YÊU CẦU BOOK QC NGHIỆM THU GIA CÔNG</span>
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingBooking(null);
                }}
                aria-label="Đóng cửa sổ"
                className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveBooking} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4">
                {/* 1. Chọn loại hình nghiệm thu SQC */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                    CHỌN LOẠI HÌNH NGHIỆM THU SQC (*)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {SQC_TYPES_CONFIG.map(sqcOpt => {
                      const isSelected = newBooking.sqcType === sqcOpt.id;
                      return (
                        <div
                          key={sqcOpt.id}
                          onClick={() => setNewBooking(prev => ({ ...prev, sqcType: sqcOpt.id }))}
                          className={`cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col justify-between ${
                            isSelected 
                              ? `${sqcOpt.badgeBg} ${sqcOpt.badgeBorder} ring-2 ring-blue-500 shadow-sm` 
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[11px] font-bold uppercase ${sqcOpt.badgeText}`}>
                              {sqcOpt.title}
                            </span>
                            <input
                              type="radio"
                              name="createSqcTypeRadio"
                              checked={isSelected}
                              onChange={() => setNewBooking(prev => ({ ...prev, sqcType: sqcOpt.id }))}
                              className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                            {sqcOpt.shortDesc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. PO & Supplier Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* PO/PR Input with Multi-PO & Auto-Lookup */}
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                        MÃ ĐƠN HÀNG PO / PR / HỢP ĐỒNG ERP (*)
                      </label>
                      {allFormPoTokens.length > 0 && (
                        <span className="font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                          {allFormPoTokens.length} mã
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1 min-w-0">
                        <input
                          ref={poInputRef}
                          type="text"
                          required={allFormPoTokens.length === 0}
                          placeholder={
                            allFormPoTokens.length > 0
                              ? 'Tra cứu hoặc nhập thêm PO / PR...'
                              : 'Nhập mã PO, PR hoặc tên vật tư để dò...'
                          }
                          value={newBooking.poNumber}
                          onChange={e => handlePoSearch(e.target.value)}
                          onBlur={handlePoInputBlur}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCommitHeaderPoTokens();
                            }
                          }}
                          onFocus={() => { if (poSearchResults.length > 0) setShowPoDropdown(true); }}
                          className="w-full min-h-[44px] lg:min-h-[38px] pl-3 pr-8 py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                        {isSearchingPo && (
                          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin absolute right-2.5 top-2.5" />
                        )}
                      </div>
                      {newBooking.poNumber.trim().length >= 2 && (
                        <button
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            handleCommitHeaderPoTokens();
                          }}
                          title="Thêm mã PO/PR này vào phiếu (không tự thêm hạng mục)"
                          className="min-h-[44px] lg:min-h-[38px] px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Thêm mã</span>
                        </button>
                      )}
                    </div>

                    {/* Active PO/PR Chips */}
                    {allFormPoTokens.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {allFormPoTokens.map((tok) => {
                          const hasSupplierMismatch = supplierMismatchWarnings.some(
                            (w) => w.poNumber.toLowerCase() === tok.toLowerCase()
                          );
                          return (
                            <span
                              key={tok}
                              className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md border font-mono text-[11px] font-semibold tabular-nums ${
                                hasSupplierMismatch
                                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              }`}
                            >
                              <span>{tok}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveHeaderPoToken(tok)}
                                aria-label={`Gỡ mã ${tok}`}
                                className="min-w-[24px] min-h-[24px] inline-flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Auto-lookup dropdown */}
                    {showPoDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                        <div className="p-2 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80">
                          <span>Kết quả dò trong Material / IPO ({poSearchResults.length})</span>
                          <button type="button" onClick={() => setShowPoDropdown(false)} className="min-h-[36px] px-2.5 text-slate-400 hover:text-slate-600 rounded">Đóng</button>
                        </div>

                        {poSearchResults.length === 0 ? (
                          <div className="p-3 text-xs text-slate-500 italic text-center">
                            {isSearchingPo ? 'Đang dò tìm...' : 'Không tìm thấy thông tin PO/PR phù hợp'}
                          </div>
                        ) : (
                          poSearchResults.map((resItem, idx) => {
                            const hasExistingPo = allFormPoTokens.length > 0;
                            return (
                              <div
                                key={idx}
                                onMouseDown={() => handleSelectPoItem(resItem, hasExistingPo)}
                                className="p-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                                  <span>{resItem.poNumber || resItem.itemCode || 'PO / Material'}</span>
                                  <div className="flex items-center gap-1.5">
                                    {hasExistingPo && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-sans font-semibold">
                                        + Chỉ thêm mã PO/PR
                                      </span>
                                    )}
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-sans">
                                      {resItem.source?.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">{resItem.itemName}</div>
                                <div className="text-[11px] text-slate-500 flex items-center justify-between mt-1">
                                  <span className="truncate max-w-[200px]">Xưởng: {resItem.supplierName || 'Mặc định'}</span>
                                  <span>SL: {resItem.quantity} {resItem.unit}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {existingPoBatchesForCreate.length > 0 && (
                      <div className="mt-1.5 text-[11px] leading-snug text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1.5">
                        PO/PR liên quan đã có <strong>{existingPoBatchesForCreate.length}</strong> đợt book trước đó (
                        <span className="font-mono">{existingPoBatchesForCreate.map((x) => x.bookingCode).join(', ')}</span>).
                        Phiếu mới sẽ được quản lý độc lập thành <strong>Đợt {existingPoBatchesForCreate.length + 1}</strong>.
                      </div>
                    )}
                  </div>

                  {/* Supplier Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      XƯỞNG VỆ TINH / NHÀ CUNG CẤP (*)
                    </label>
                    <input
                      type="text"
                      required
                      list="suppliers-datalist"
                      placeholder="VD: Xưởng Gỗ Hoàng Gia Bình Dương"
                      value={newBooking.supplierName}
                      onChange={e => {
                        const val = e.target.value;
                        setNewBooking(prev => ({ ...prev, supplierName: val }));
                        if (val.trim()) {
                          const exactMatch = suppliers.find(s => s.name && s.name.trim().toLowerCase() === val.trim().toLowerCase());
                          if (exactMatch) {
                            lookupAndApplySupplier(val);
                          }
                        }
                      }}
                      onBlur={() => {
                        if (newBooking.supplierName.trim()) {
                          lookupAndApplySupplier(newBooking.supplierName);
                        }
                      }}
                      className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <datalist id="suppliers-datalist">
                      {suppliers.map(s => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>


                    {/* Notice / Status Indicator for Supplier */}
                    {supplierStatus.status === 'found' && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>✓ Đã tìm thấy & tự động tải thông tin địa chỉ, SĐT từ bảng suppliers</span>
                      </div>
                    )}
                    {supplierStatus.status === 'not_found' && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{supplierStatus.message || 'Chưa có thông tin trong bảng suppliers — vui lòng nhập tay bên dưới để lưu cho lần tới'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Non-blocking Amber Supplier Mismatch Warning */}
                {supplierMismatchWarnings.length > 0 && (
                  <div
                    role="status"
                    className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 space-y-1"
                  >
                    <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Cảnh báo khác Nhà cung cấp trên một số mã PO/PR (vẫn cho phép lưu phiếu):</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                      {supplierMismatchWarnings.map((w, idx) => (
                        <li key={`${w.poNumber}-${idx}`}>
                          Mã <span className="font-mono font-bold">{w.poNumber}</span> trên ERP thuộc{' '}
                          <strong>{w.expectedSupplier}</strong> (khác với xưởng đang chọn:{' '}
                          <strong>{w.currentSupplier}</strong>)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Items List Section */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-blue-600" /> DANH SÁCH HẠNG MỤC HÀNG GIA CÔNG ({newBooking.items.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setNewBooking(prev => ({
                        ...prev,
                        items: [
                          ...prev.items,
                          {
                            id: Date.now().toString(),
                            itemName: '',
                            quantity: 1,
                            unit: 'Bộ',
                            specifications: '',
                            poNumber: allFormPoTokens.length === 1 ? allFormPoTokens[0] : '',
                            isInspected: true,
                          },
                        ]
                      }))}
                      className="min-h-[44px] lg:min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Thêm Hạng Mục
                    </button>
                  </div>

                  {newBooking.items.map((item, itemIdx) => (
                    <div key={item.id} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-1 flex sm:flex-col items-center justify-between sm:justify-center pt-1 gap-2">
                          <label className="block text-[10px] text-slate-500 font-bold uppercase">KIỂM</label>
                          <input
                            type="checkbox"
                            checked={item.isInspected !== false}
                            onChange={e => {
                              const checked = e.target.checked;
                              setNewBooking(prev => {
                                const updated = [...prev.items];
                                updated[itemIdx].isInspected = checked;
                                return { ...prev, items: updated };
                              });
                            }}
                            className="w-5 h-5 text-blue-600 focus:ring-blue-500 rounded cursor-pointer sm:mt-1"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-slate-400 font-medium mb-1">Mã PO / PR (Dòng hàng)</label>
                          <input
                            type="text"
                            list={`booking-item-po-list-${itemIdx}`}
                            placeholder={allFormPoTokens[0] || 'VD: PO-001'}
                            value={item.poNumber || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setNewBooking(prev => {
                                const updated = [...prev.items];
                                updated[itemIdx] = { ...updated[itemIdx], poNumber: val };
                                return { ...prev, items: updated };
                              });
                            }}
                            onBlur={e => handleLookupItemPoSupplier(itemIdx, e.target.value)}
                            className="w-full min-h-[44px] lg:min-h-[36px] px-2.5 py-2 lg:py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono text-blue-700 dark:text-blue-300 font-semibold"
                          />
                          <datalist id={`booking-item-po-list-${itemIdx}`}>
                            {allFormPoTokens.map(tok => (
                              <option key={tok} value={tok} />
                            ))}
                          </datalist>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-slate-400 font-medium mb-1">Tên Sản Phẩm / Hạng Mục (*)</label>
                          <input
                            type="text"
                            required
                            placeholder="VD: Tủ âm tường MFC Phủ Melamine..."
                            value={item.itemName}
                            onChange={e => {
                              const val = e.target.value;
                              setNewBooking(prev => {
                                const updated = [...prev.items];
                                updated[itemIdx].itemName = val;
                                return { ...prev, items: updated };
                              });
                            }}
                            className="w-full min-h-[44px] lg:min-h-[36px] px-2.5 py-2 lg:py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-semibold"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-[10px] text-slate-400 font-medium mb-1">Số Lượng</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 1;
                              setNewBooking(prev => {
                                const updated = [...prev.items];
                                updated[itemIdx].quantity = val;
                                return { ...prev, items: updated };
                              });
                            }}
                            className="w-full min-h-[44px] lg:min-h-[36px] px-2 py-2 lg:py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-[10px] text-slate-400 font-medium mb-1">ĐVT</label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={e => {
                              const val = e.target.value;
                              setNewBooking(prev => {
                                const updated = [...prev.items];
                                updated[itemIdx].unit = val;
                                return { ...prev, items: updated };
                              });
                            }}
                            className="w-full min-h-[44px] lg:min-h-[36px] px-2 py-2 lg:py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                          />
                        </div>
                        <div className="sm:col-span-3 flex items-end gap-1.5">
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-400 font-medium mb-1">Quy Cách / Ghi Chú</label>
                            <input
                              type="text"
                              placeholder="Theo shopdrawing..."
                              value={item.specifications}
                              onChange={e => {
                                const val = e.target.value;
                                setNewBooking(prev => {
                                  const updated = [...prev.items];
                                  updated[itemIdx].specifications = val;
                                  return { ...prev, items: updated };
                                });
                              }}
                              className="w-full min-h-[44px] lg:min-h-[36px] px-2.5 py-2 lg:py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                            />
                          </div>
                          {newBooking.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setNewBooking(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== itemIdx) }))}
                              className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] inline-flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:text-red-700 hover:bg-red-100 transition-colors shrink-0"
                              title="Xóa hạng mục"
                              aria-label="Xóa hạng mục"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {allFormPoTokens.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 mr-1">Gắn nhanh PO/PR:</span>
                          {allFormPoTokens.map((tok) => {
                            const isAssignedHere = String(item.poNumber || '').trim().toLowerCase() === tok.toLowerCase();
                            return (
                              <button
                                key={tok}
                                type="button"
                                onClick={() => {
                                  const cachedSup = poSupplierMap[tok.toLowerCase()];
                                  setNewBooking(prev => {
                                    const updated = [...prev.items];
                                    updated[itemIdx] = {
                                      ...updated[itemIdx],
                                      poNumber: isAssignedHere ? '' : tok,
                                      supplierName: cachedSup || updated[itemIdx].supplierName,
                                    };
                                    return { ...prev, items: updated };
                                  });
                                }}
                                className={`px-2 py-0.5 rounded border font-mono text-[10px] font-semibold transition-colors cursor-pointer ${
                                  isAssignedHere
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {tok}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 4. Địa chỉ xưởng */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    ĐỊA CHỈ XƯỞNG VỆ TINH KHẢO SÁT (*)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Số nhà, Đường, KCN, Tỉnh/Thành phố..."
                    value={newBooking.locationAddress}
                    onChange={e => setNewBooking({ ...newBooking, locationAddress: e.target.value })}
                    className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 5. Contact Person, Phone & Requested Date */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      NGƯỜI LIÊN HỆ XƯỞNG (*)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Anh Nguyễn Văn B"
                      value={newBooking.contactPerson}
                      onChange={e => setNewBooking({ ...newBooking, contactPerson: e.target.value })}
                      className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      SĐT LIÊN HỆ (*)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="090x xxx xxx"
                      value={newBooking.contactPhone}
                      onChange={e => setNewBooking({ ...newBooking, contactPhone: e.target.value })}
                      className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                        NGÀY NGHIỆM THU (*)
                      </label>
                      <span 
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          bookingPolicy.isAfter15h 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800' 
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        }`}
                        title={bookingPolicy.isAfter15h ? 'Sau 15:00: Phải chọn từ ngày mốt trở đi' : 'Trước 15:00: Được chọn ngày hôm sau'}
                      >
                        <Clock className="w-3 h-3" />
                        {bookingPolicy.isAfter15h ? 'Sau 15:00 (Từ ngày mốt)' : 'Trước 15:00 (Từ ngày mai)'}
                      </span>
                    </div>
                    <input
                      type="date"
                      required
                      min={editingBooking ? undefined : bookingPolicy.minDateStr}
                      value={newBooking.requestedDate}
                      onChange={e => setNewBooking({ ...newBooking, requestedDate: e.target.value })}
                      className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* 24h Policy Note */}
                <div className="text-[11px] leading-tight space-y-0.5 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">
                    * Yêu cầu đặt trước 24 tiếng: Trước 15:00 chọn ngày hôm sau; sau 15:00 phải chọn từ ngày mốt.
                  </p>
                  <p className={`font-semibold ${bookingPolicy.isAfter15h ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                    {bookingPolicy.isAfter15h 
                      ? `⚡ Hiện tại sau 15:00 → Ngày sớm nhất được chọn: Ngày mốt (${bookingPolicy.dayAfterDisplay})` 
                      : `✓ Hiện tại trước 15:00 → Ngày sớm nhất được chọn: Ngày mai (${bookingPolicy.tomorrowDisplay})`}
                  </p>
                </div>

                {/* 6. Ghi chú */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    GHI CHÚ ĐẶT LỊCH (Tùy chọn)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Các yêu cầu đặc biệt khi QC kiểm định..."
                    value={newBooking.notes}
                    onChange={e => setNewBooking({ ...newBooking, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 7. Hồ sơ & Tài liệu đính kèm (4 nhóm) */}
                <BookingDocumentsUploader
                  value={newBooking.documents}
                  onChange={(nextDocs) => setNewBooking(prev => ({ ...prev, documents: nextDocs }))}
                  bookingId={editingBooking?.id}
                  currentUserName={currentUser?.name}
                  onUploadingChange={setIsUploadingDocs}
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 px-4 py-2 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 shrink-0 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingBooking(null);
                  }}
                  className="px-4 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingDocs}
                  className="px-4 sm:px-5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[36px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-sm hover:shadow flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isUploadingDocs ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Đang Tải Tệp...
                    </>
                  ) : isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Đang Lưu...
                    </>
                  ) : editingBooking ? (
                    'Lưu Thay Đổi'
                  ) : (
                    'Xác Nhận Book Lịch'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
        return typeof document !== 'undefined' ? createPortal(createBookingModal, document.body) : createBookingModal;
      })()}

      {/* Extracted Booking Detail Modal (restores full UI + Related SQC table) */}
      <BookingDetailModal
        open={showDetailModal}
        booking={selectedBooking}
        currentUser={currentUser}
        rolesList={rolesList}
        statusBadge={selectedBooking ? getStatusBadge(selectedBooking.status, selectedBooking) : null}
        scrollToSqc={scrollModalToSqc}
        onClose={() => {
          setShowDetailModal(false);
          setScrollModalToSqc(false);
        }}
        onStartInspection={onStartInspection}
        onViewInspection={onViewInspection}
        onOpenAssignModal={m03Caps.canAssignQc ? openAssignModal : undefined}
        onReconciled={loadData}
      />

      {/* QC Assignment & Feedback Modal */}
      <QCAssignmentModal
        open={showAssignModal}
        booking={assignTargetBooking}
        currentUser={currentUser}
        rolesList={rolesList}
        initialMode={assignModalOptions?.mode}
        initialFeedbackNote={assignModalOptions?.prefillReason}
        onClose={() => {
          setShowAssignModal(false);
          setAssignTargetBooking(null);
          setAssignModalOptions(null);
        }}
        onSaved={(updated, mode) => {
          setBookings(prev =>
            prev.map(item => (item.id === updated.id ? { ...item, ...updated } : item))
          );
          if (selectedBooking?.id === updated.id) {
            setSelectedBooking(prev => (prev ? { ...prev, ...updated } : updated));
          }
          setShowAssignModal(false);
          setAssignTargetBooking(null);
          setAssignModalOptions(null);
          showNotice(
            'success',
            mode === 'ASSIGN'
              ? `Đã phân công QC ${updated.assignedQcName || ''} cho đơn hàng ${updated.poNumber || updated.bookingCode}.`
              : `Đã chuyển phiếu ${updated.bookingCode} sang trạng thái Yêu cầu kiểm lại / bổ sung.`
          );
        }}
      />

      {/* Standardized ConfirmDialog (replaces window.confirm) */}
      <ConfirmDialog
        open={deleteTarget !== null}
        variant="danger"
        title="Xác nhận xóa phiếu Book QC"
        message={
          deleteTarget
            ? `Bạn có chắc chắn muốn xóa phiếu Book QC "${deleteTarget.code}"? Thao tác này không thể hoàn tác.`
            : ''
        }
        confirmLabel="Xóa phiếu"
        cancelLabel="Hủy"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
      />
    </div>
  );
};
