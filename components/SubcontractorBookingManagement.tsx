import React, { useState, useEffect, useRef } from 'react';
import { 
  SubcontractorBooking, 
  SubcontractorInspection, 
  SubcontractorReinspectionCost, 
  User, 
  Supplier,
  SQCType,
  SQC_TYPES_CONFIG,
  Inspection
} from '../types';
import { 
  fetchSubcontractorBookings, 
  createSubcontractorBooking, 
  updateSubcontractorBooking, 
  deleteSubcontractorBooking,
  submitSubcontractorInspection, 
  fetchSubcontractorReinspectionCosts,
  fetchIpoData,
  fetchSuppliers,
  fetchUsers,
  uploadFileToStorage,
  lookupPoMaterials,
  saveSupplier,
  createNotification,
  fetchInspections
} from '../services/apiService';
import { SubcontractorSlideGuideModal } from './SubcontractorSlideGuideModal';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  UserCheck, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText, 
  DollarSign, 
  Truck, 
  PenTool, 
  RefreshCw, 
  ChevronRight, 
  Phone, 
  Building2, 
  Camera, 
  Upload, 
  Printer, 
  Check, 
  X,
  FileCheck2,
  Pencil,
  Trash2,
  BookOpen,
  Download,
  ExternalLink
} from 'lucide-react';
import { removeVietnameseTones } from '../lib/utils';

// Google Drive URL helpers
export const getGoogleDriveFileId = (rawUrl: string): string | null => {
  if (!rawUrl) return null;
  const str = rawUrl.trim();
  // 1. Raw fileId string (no slash or colon, length 25-50)
  if (str.length >= 25 && str.length <= 50 && !str.includes('/') && !str.includes(':')) {
    return str;
  }
  // 2. Local proxy endpoints: /api/media/image/:id or /api/media/file/:id or /api/image/:id
  const apiMatch = str.match(/\/api\/(?:media\/)?(?:image|file|document)\/([a-zA-Z0-9_-]+)/) ||
                   str.match(/\/(?:display-image|media\/stream|api\/image)\/([a-zA-Z0-9_-]+)/);
  if (apiMatch && apiMatch[1]) {
    return apiMatch[1];
  }
  // 3. Google Drive URLs: /file/d/:id/ or id=:id
  const match = str.match(/\/d\/([a-zA-Z0-9_-]+)/) || str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
};

export const getFileViewUrl = (rawUrl: string): string => {
  if (!rawUrl) return '#';
  const fileId = getGoogleDriveFileId(rawUrl);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return rawUrl;
};

export const getFileDownloadUrl = (rawUrl: string): string => {
  if (!rawUrl) return '#';
  const fileId = getGoogleDriveFileId(rawUrl);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return rawUrl;
};

// Format Date helpers for local calendar (avoid timezone offset bugs)
export const formatLocalDateToYMD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatLocalDateToDMY = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
};

/**
 * Quy định nghiệm thu trước 24 tiếng theo mốc 15:00:
 * 1. Nếu book trước 15:00 ngày hiện tại thì được chọn ngày hôm sau (+1 ngày).
 * 2. Nếu book sau hoặc đúng 15:00 ngày hiện tại thì phải chọn ngày mốt (+2 ngày).
 * Ví dụ: Thứ 2 sau 15:00 phải chọn từ Thứ 4 trở đi, không được chọn Thứ 3.
 */
export const getBookingDatePolicy = (refDate = new Date()) => {
  const currentHour = refDate.getHours();
  const currentMinute = refDate.getMinutes();
  const isAfter15h = currentHour >= 15;
  const daysToAdd = isAfter15h ? 2 : 1;

  // Earliest allowable inspection date
  const minTargetDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + daysToAdd);
  const minDateStr = formatLocalDateToYMD(minTargetDate);
  const minDateDisplay = formatLocalDateToDMY(minTargetDate);

  // Tomorrow
  const tomorrowDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1);
  const tomorrowStr = formatLocalDateToYMD(tomorrowDate);
  const tomorrowDisplay = formatLocalDateToDMY(tomorrowDate);

  // Day after tomorrow (Ngày mốt)
  const dayAfterDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 2);
  const dayAfterStr = formatLocalDateToYMD(dayAfterDate);
  const dayAfterDisplay = formatLocalDateToDMY(dayAfterDate);

  const currentTimeFormatted = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

  return {
    currentTimeFormatted,
    isAfter15h,
    daysToAdd,
    minDateStr,
    minDateDisplay,
    tomorrowStr,
    tomorrowDisplay,
    dayAfterStr,
    dayAfterDisplay
  };
};

interface SubcontractorBookingManagementProps {
  currentUser: User | null;
  onStartInspection?: (booking: SubcontractorBooking) => void;
}

export const SubcontractorBookingManagement: React.FC<SubcontractorBookingManagementProps> = ({ currentUser, onStartInspection }) => {
  const [activeTab, setActiveTab] = useState<'BOOKINGS' | 'REINSPECTION_COSTS' | 'SUPPLIER_MAP'>('BOOKINGS');
  const [bookings, setBookings] = useState<SubcontractorBooking[]>([]);
  const [sqcInspections, setSqcInspections] = useState<Inspection[]>([]);
  const [reinspectionCosts, setReinspectionCosts] = useState<SubcontractorReinspectionCost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sqcTypeFilter, setSqcTypeFilter] = useState<string>('ALL');

  // Supplier Map state
  const [mapLayerFilter, setMapLayerFilter] = useState<'ALL' | 'BOOKED' | 'INSPECTED'>('ALL');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [selectedMapSupplierKey, setSelectedMapSupplierKey] = useState<string | null>(null);
  const [selectedSqcReport, setSelectedSqcReport] = useState<Inspection | null>(null);

  // Compute merged supplier locations map & markers (Bookings + Historical SQC Inspection Reports)
  const supplierLocations = React.useMemo(() => {
    const locMap = new Map<string, {
      key: string;
      supplierName: string;
      locationAddress: string;
      contactPerson: string;
      contactPhone: string;
      bookings: SubcontractorBooking[];
      sqcReports: {
        id: string;
        code: string;
        poNumber: string;
        sqcType: SQCType;
        result: 'PASS' | 'REJECT' | 'CONDITIONAL_PASS';
        date: string;
        inspector: string;
        summary: string;
        rawInspection: Inspection;
      }[];
      isBooked: boolean;
      isInspected: boolean;
      locationType: 'BOOKED' | 'INSPECTED' | 'BOTH';
      encodedAddress: string;
    }>();

    // 1. Process Bookings
    bookings.forEach(b => {
      const sName = (b.supplierName || 'Chưa rõ nhà cung cấp').trim();
      const sAddr = (b.locationAddress || 'Chưa cập nhật địa chỉ').trim();
      const key = `${sName}___${sAddr}`;

      const isB = b.status === 'PENDING' || b.status === 'ASSIGNED';
      const isI = b.status === 'IN_PROGRESS' || b.status === 'COMPLETED';

      const existing = locMap.get(key);
      if (existing) {
        existing.bookings.push(b);
        if (isB) existing.isBooked = true;
        if (isI) existing.isInspected = true;
        if (b.contactPerson && (!existing.contactPerson || existing.contactPerson === 'N/A')) {
          existing.contactPerson = b.contactPerson;
        }
        if (b.contactPhone && !existing.contactPhone) {
          existing.contactPhone = b.contactPhone;
        }
        existing.locationType = (existing.isBooked && existing.isInspected) ? 'BOTH' : (existing.isInspected ? 'INSPECTED' : 'BOOKED');
      } else {
        locMap.set(key, {
          key,
          supplierName: sName,
          locationAddress: sAddr,
          contactPerson: b.contactPerson || 'N/A',
          contactPhone: b.contactPhone || '',
          bookings: [b],
          sqcReports: [],
          isBooked: isB,
          isInspected: isI,
          locationType: isI && isB ? 'BOTH' : (isI ? 'INSPECTED' : 'BOOKED'),
          encodedAddress: encodeURIComponent(sAddr)
        });
      }
    });

    // 2. Process Historical SQC Reports
    sqcInspections.forEach(insp => {
      const sName = (insp.supplier || insp.workshop || insp.ten_ct || 'Nhà cung cấp SQC').trim();
      const sAddr = (insp.location || insp.workshop || 'Chưa cập nhật địa chỉ').trim();
      const key = `${sName}___${sAddr}`;

      const poNum = insp.po_number || insp.poNumber || insp.pr_number || insp.ma_ct || 'N/A';
      let resultStatus: 'PASS' | 'REJECT' | 'CONDITIONAL_PASS' = 'PASS';
      if (insp.status === 'rejected' || (insp.score !== undefined && insp.score < 60)) {
        resultStatus = 'REJECT';
      } else if (insp.status === 'flagged' || (insp.score !== undefined && insp.score < 85)) {
        resultStatus = 'CONDITIONAL_PASS';
      }

      const sqcReportItem = {
        id: insp.id,
        code: insp.id,
        poNumber: poNum,
        sqcType: (insp.type as SQCType) || 'SQC_BTP',
        result: resultStatus,
        date: insp.date || (insp.createdAt ? new Date(insp.createdAt).toLocaleDateString('vi-VN') : 'N/A'),
        inspector: insp.inspectorName || 'QC Inspector',
        summary: insp.summary || '',
        rawInspection: insp
      };

      const existing = locMap.get(key);
      if (existing) {
        existing.sqcReports.push(sqcReportItem);
        existing.isInspected = true;
        existing.locationType = (existing.isBooked && existing.isInspected) ? 'BOTH' : 'INSPECTED';
      } else {
        locMap.set(key, {
          key,
          supplierName: sName,
          locationAddress: sAddr,
          contactPerson: 'N/A',
          contactPhone: '',
          bookings: [],
          sqcReports: [sqcReportItem],
          isBooked: false,
          isInspected: true,
          locationType: 'INSPECTED',
          encodedAddress: encodeURIComponent(sAddr)
        });
      }
    });

    return Array.from(locMap.values());
  }, [bookings, sqcInspections]);

  const filteredSupplierLocations = React.useMemo(() => {
    return supplierLocations.filter(loc => {
      // Layer filter
      if (mapLayerFilter === 'BOOKED' && !loc.isBooked) return false;
      if (mapLayerFilter === 'INSPECTED' && !loc.isInspected) return false;

      // Text search
      if (mapSearchQuery.trim()) {
        const q = removeVietnameseTones(mapSearchQuery.toLowerCase());
        const nameMatch = removeVietnameseTones(loc.supplierName.toLowerCase()).includes(q);
        const addrMatch = removeVietnameseTones(loc.locationAddress.toLowerCase()).includes(q);
        const poMatch = loc.bookings.some(b => removeVietnameseTones((b.poNumber || '').toLowerCase()).includes(q) || removeVietnameseTones((b.bookingCode || '').toLowerCase()).includes(q)) ||
                        loc.sqcReports.some(r => removeVietnameseTones((r.poNumber || '').toLowerCase()).includes(q) || removeVietnameseTones((r.code || '').toLowerCase()).includes(q));
        if (!nameMatch && !addrMatch && !poMatch) return false;
      }

      return true;
    });
  }, [supplierLocations, mapLayerFilter, mapSearchQuery]);

  const activeSelectedMapSupplier = React.useMemo(() => {
    if (selectedMapSupplierKey) {
      return supplierLocations.find(l => l.key === selectedMapSupplierKey) || supplierLocations[0] || null;
    }
    return supplierLocations[0] || null;
  }, [supplierLocations, selectedMapSupplierKey]);

  // Modals & Drawers state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<SubcontractorBooking | null>(null);
  const [selectedBookingForEdit, setSelectedBookingForEdit] = useState<SubcontractorBooking | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSlideGuide, setShowSlideGuide] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; rawUrl: string; fileId: string | null } | null>(null);

  // References for dropdown options
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [qcUsers, setQcUsers] = useState<User[]>([]);
  const [ipoList, setIpoList] = useState<any[]>([]);

  // Calculate 15:00 policy for booking lead time
  const bookingPolicy = getBookingDatePolicy();
  const minBookingDateStr = bookingPolicy.minDateStr;

  // Form states
  const [newBooking, setNewBooking] = useState({
    sqcType: 'SQC_BTP' as SQCType,
    poNumber: '',
    supplierName: '',
    locationAddress: '',
    contactPerson: '',
    contactPhone: '',
    requestedDate: bookingPolicy.minDateStr,
    notes: '',
    items: [{ id: '1', itemName: 'Tủ âm tường MFC Phủ Melamine', quantity: 10, unit: 'Bộ', specifications: 'Theo shopdrawing SD-01', isInspected: true }],
    documents: {
      materialSpecUrl: '',
      approvedSampleUrl: '',
      shopdrawingUrl: '',
      qualityAgreementUrl: ''
    }
  });

  const [editBooking, setEditBooking] = useState({
    sqcType: 'SQC_BTP' as SQCType,
    poNumber: '',
    supplierName: '',
    locationAddress: '',
    contactPerson: '',
    contactPhone: '',
    requestedDate: '',
    notes: '',
    status: 'PENDING',
    items: [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '', isInspected: true }],
    documents: {
      materialSpecUrl: '',
      approvedSampleUrl: '',
      shopdrawingUrl: '',
      qualityAgreementUrl: ''
    }
  });

  // Copy to clipboard state
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopyText = (text: string, type: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // State for sequential multi-file PDF upload tracking
  type DocKey = 'materialSpecUrl' | 'approvedSampleUrl' | 'shopdrawingUrl' | 'qualityAgreementUrl';

  interface DocUploadProgress {
    docKey: DocKey;
    label: string;
    file?: File;
    status: 'IDLE' | 'QUEUED' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
    progress: number;
    errorMsg?: string;
    fileUrl?: string;
  }

  const [createUploadState, setCreateUploadState] = useState<Record<DocKey, DocUploadProgress>>({
    materialSpecUrl: { docKey: 'materialSpecUrl', label: '1. Spec Vật Tư / Quy Cách', status: 'IDLE', progress: 0 },
    approvedSampleUrl: { docKey: 'approvedSampleUrl', label: '2. Mẫu Duyệt (Approved Sample)', status: 'IDLE', progress: 0 },
    shopdrawingUrl: { docKey: 'shopdrawingUrl', label: '3. Bản Vẽ Thi Công (Shopdrawing)', status: 'IDLE', progress: 0 },
    qualityAgreementUrl: { docKey: 'qualityAgreementUrl', label: '4. Biên Bản Thống Nhất CL (MoU)', status: 'IDLE', progress: 0 },
  });

  const [editUploadState, setEditUploadState] = useState<Record<DocKey, DocUploadProgress>>({
    materialSpecUrl: { docKey: 'materialSpecUrl', label: '1. Spec Vật Tư / Quy Cách', status: 'IDLE', progress: 0 },
    approvedSampleUrl: { docKey: 'approvedSampleUrl', label: '2. Mẫu Duyệt (Approved Sample)', status: 'IDLE', progress: 0 },
    shopdrawingUrl: { docKey: 'shopdrawingUrl', label: '3. Bản Vẽ Thi Công (Shopdrawing)', status: 'IDLE', progress: 0 },
    qualityAgreementUrl: { docKey: 'qualityAgreementUrl', label: '4. Biên Bản Thống Nhất CL (MoU)', status: 'IDLE', progress: 0 },
  });

  const handleDocFileUploadBatch = async (
    e: React.ChangeEvent<HTMLInputElement>,
    startDocKey: DocKey,
    targetModal: 'create' | 'edit' = 'create'
  ) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;

    const fileArray = Array.from(inputFiles).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (fileArray.length === 0) {
      alert("⚠️ CHỈ CHẤP NHẬN FILE PDF:\nHệ thống quy định hồ sơ & tài liệu kỹ thuật nghiệm thu bắt buộc phải ở định dạng PDF (.pdf). Vui lòng chọn lại file.");
      e.target.value = '';
      return;
    }

    const DOC_ORDER: { key: DocKey; label: string }[] = [
      { key: 'materialSpecUrl', label: '1. Spec Vật Tư / Quy Cách (.pdf)' },
      { key: 'approvedSampleUrl', label: '2. Mẫu Duyệt (Approved Sample - .pdf)' },
      { key: 'shopdrawingUrl', label: '3. Bản Vẽ Thi Công (Shopdrawing - .pdf)' },
      { key: 'qualityAgreementUrl', label: '4. Biên Bản Thống Nhất CL (MoU - .pdf)' },
    ];

    const queueItems: { key: DocKey; file: File; label: string }[] = [];
    let startIdx = DOC_ORDER.findIndex(d => d.key === startDocKey);
    if (startIdx < 0) startIdx = 0;

    fileArray.forEach((file, idx) => {
      const keyObj = DOC_ORDER[(startIdx + idx) % DOC_ORDER.length];
      queueItems.push({ key: keyObj.key, file, label: keyObj.label });
    });

    const setUploadState = targetModal === 'create' ? setCreateUploadState : setEditUploadState;

    // Initialize queue states
    setUploadState(prev => {
      const next = { ...prev };
      queueItems.forEach(item => {
        next[item.key] = {
          docKey: item.key,
          label: item.label,
          file: item.file,
          status: 'QUEUED',
          progress: 0,
          errorMsg: undefined
        };
      });
      return next;
    });

    // Process sequentially in order
    for (const item of queueItems) {
      setUploadState(prev => ({
        ...prev,
        [item.key]: {
          ...prev[item.key],
          status: 'UPLOADING',
          progress: 10
        }
      }));

      try {
        const fileUrl = await uploadFileToStorage(
          item.file,
          item.file.name,
          undefined,
          (percent) => {
            setUploadState(prev => ({
              ...prev,
              [item.key]: {
                ...prev[item.key],
                progress: Math.min(99, Math.max(10, percent))
              }
            }));
          }
        );

        if (fileUrl) {
          setUploadState(prev => ({
            ...prev,
            [item.key]: {
              ...prev[item.key],
              status: 'SUCCESS',
              progress: 100,
              fileUrl
            }
          }));

          if (targetModal === 'create') {
            setNewBooking(prev => ({
              ...prev,
              documents: { ...prev.documents, [item.key]: fileUrl }
            }));
          } else {
            setEditBooking(prev => ({
              ...prev,
              documents: { ...prev.documents, [item.key]: fileUrl }
            }));
          }
        } else {
          throw new Error("Không nhận được URL tài liệu sau khi tải lên");
        }
      } catch (err: any) {
        console.error(`Lỗi tải file ${item.label}:`, err);
        const errorMsg = err?.message || 'Không thể tải lên file tài liệu';
        setUploadState(prev => ({
          ...prev,
          [item.key]: {
            ...prev[item.key],
            status: 'ERROR',
            progress: 0,
            errorMsg
          }
        }));
      }
    }

    e.target.value = '';
  };

  const handleRetryDocUpload = async (docKey: DocKey, targetModal: 'create' | 'edit') => {
    const setUploadState = targetModal === 'create' ? setCreateUploadState : setEditUploadState;
    const currentState = (targetModal === 'create' ? createUploadState : editUploadState)[docKey];

    if (!currentState.file) return;

    setUploadState(prev => ({
      ...prev,
      [docKey]: { ...prev[docKey], status: 'UPLOADING', progress: 10, errorMsg: undefined }
    }));

    try {
      const fileUrl = await uploadFileToStorage(
        currentState.file,
        currentState.file.name,
        undefined,
        (percent) => {
          setUploadState(prev => ({
            ...prev,
            [docKey]: { ...prev[docKey], progress: Math.min(99, Math.max(10, percent)) }
          }));
        }
      );

      if (fileUrl) {
        setUploadState(prev => ({
          ...prev,
          [docKey]: { ...prev[docKey], status: 'SUCCESS', progress: 100, fileUrl }
        }));

        if (targetModal === 'create') {
          setNewBooking(prev => ({
            ...prev,
            documents: { ...prev.documents, [docKey]: fileUrl }
          }));
        } else {
          setEditBooking(prev => ({
            ...prev,
            documents: { ...prev.documents, [docKey]: fileUrl }
          }));
        }
      } else {
        throw new Error("Không nhận được URL tài liệu sau khi tải lên");
      }
    } catch (err: any) {
      console.error(`Lỗi tải lại file ${currentState.label}:`, err);
      setUploadState(prev => ({
        ...prev,
        [docKey]: { ...prev[docKey], status: 'ERROR', progress: 0, errorMsg: err?.message || 'Thử lại thất bại' }
      }));
    }
  };

  const renderDocSection = (targetModal: 'create' | 'edit') => {
    const isCreate = targetModal === 'create';
    const docs = isCreate ? newBooking.documents : editBooking.documents;
    const setDocs = (docKey: DocKey, url: string) => {
      if (isCreate) {
        setNewBooking(prev => ({ ...prev, documents: { ...prev.documents, [docKey]: url } }));
      } else {
        setEditBooking(prev => ({ ...prev, documents: { ...prev.documents, [docKey]: url } }));
      }
    };

    const uploadState = isCreate ? createUploadState : editUploadState;

    const activeItems = Object.values(uploadState).filter(s => s.status !== 'IDLE');
    const totalActive = activeItems.length;
    const successCount = activeItems.filter(s => s.status === 'SUCCESS').length;
    const errorCount = activeItems.filter(s => s.status === 'ERROR').length;
    const uploadingCount = activeItems.filter(s => s.status === 'UPLOADING').length;
    const queuedCount = activeItems.filter(s => s.status === 'QUEUED').length;

    const totalProgressSum = activeItems.reduce((acc, s) => acc + s.progress, 0);
    const overallPercent = totalActive > 0 ? Math.round(totalProgressSum / totalActive) : 0;
    const isAllFinished = totalActive > 0 && (successCount + errorCount) === totalActive;

    const themeBorder = isCreate ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30' : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30';
    const themeText = isCreate ? 'text-blue-900 dark:text-blue-200' : 'text-amber-900 dark:text-amber-200';
    const themeSubtext = isCreate ? 'text-blue-600 dark:text-blue-400' : 'text-amber-700 dark:text-amber-400';
    const themeBtnBg = isCreate ? 'bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-blue-700 dark:text-blue-300' : 'bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-800 dark:text-amber-300';
    const themeProgressFill = isCreate ? 'bg-blue-600' : 'bg-amber-600';

    const docSlots: { key: DocKey; label: string }[] = [
      { key: 'materialSpecUrl', label: '1. Spec Vật Tư / Quy Cách (.pdf)' },
      { key: 'approvedSampleUrl', label: '2. Mẫu Duyệt (Approved Sample - .pdf)' },
      { key: 'shopdrawingUrl', label: '3. Bản Vẽ Thi Công (Shopdrawing - .pdf)' },
      { key: 'qualityAgreementUrl', label: '4. Biên Bản Thống Nhất CL (MoU - .pdf)' },
    ];

    return (
      <div className={`${themeBorder} p-3.5 rounded-lg border space-y-3`}>
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <FileCheck2 className={`w-4 h-4 ${isCreate ? 'text-blue-600' : 'text-amber-600'}`} />
            <span className={`text-xs font-bold uppercase ${themeText}`}>
              Hồ Sơ & Tài Liệu Kỹ Thuật Nghiệm Thu (Định dạng PDF)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className={`cursor-pointer px-2.5 py-1 ${themeBtnBg} rounded text-[11px] font-bold shrink-0 flex items-center gap-1.5 shadow-sm transition-all`}>
              <Upload className="w-3.5 h-3.5" /> Tải Hàng Loạt Nhiều File PDF
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={e => handleDocFileUploadBatch(e, 'materialSpecUrl', targetModal)}
                className="hidden"
              />
            </label>
            <span className={`text-[10px] font-semibold ${themeSubtext}`}>Bắt buộc file PDF (.pdf)</span>
          </div>
        </div>

        {/* Overall Progress Banner */}
        {totalActive > 0 && (
          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                {uploadingCount > 0 && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                {isAllFinished && errorCount === 0 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                {errorCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                <span className="text-slate-800 dark:text-slate-200">
                  {isAllFinished 
                    ? (errorCount === 0 
                        ? `✓ Đã hoàn tất tải lên tất cả ${successCount}/${totalActive} file PDF!` 
                        : `Hoàn tất ${successCount}/${totalActive} file (Có ${errorCount} file bị lỗi)`)
                    : `Đang tải file tuần tự: ${successCount}/${totalActive} hoàn tất ${queuedCount > 0 ? `(${queuedCount} file trong hàng chờ)` : ''}`
                  }
                </span>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {overallPercent}%
              </span>
            </div>

            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${isAllFinished && errorCount === 0 ? 'bg-emerald-500' : themeProgressFill}`} 
                style={{ width: `${overallPercent}%` }} 
              />
            </div>
          </div>
        )}

        {/* 4 Document Slot Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {docSlots.map(slot => {
            const itemState = uploadState[slot.key];
            const currentUrl = docs[slot.key] || '';

            return (
              <div 
                key={slot.key} 
                className={`bg-white dark:bg-slate-900 p-2.5 rounded-lg border transition-all space-y-1.5 ${
                  itemState.status === 'UPLOADING' 
                    ? 'border-blue-500 ring-1 ring-blue-500 dark:border-blue-400' 
                    : itemState.status === 'ERROR'
                    ? 'border-red-400 dark:border-red-800 bg-red-50/20'
                    : itemState.status === 'SUCCESS'
                    ? 'border-emerald-300 dark:border-emerald-800'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                    {slot.label}
                  </label>
                  {itemState.status === 'SUCCESS' && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Đã tải xong
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Dán link Drive hoặc tải file PDF..."
                    value={currentUrl}
                    onChange={e => setDocs(slot.key, e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                  />
                  <label className={`cursor-pointer px-2 py-1 ${themeBtnBg} rounded text-[11px] font-semibold shrink-0 flex items-center gap-1`}>
                    <Upload className="w-3 h-3" /> Tải PDF
                    <input
                      type="file"
                      multiple
                      accept=".pdf,application/pdf"
                      onChange={e => handleDocFileUploadBatch(e, slot.key, targetModal)}
                      className="hidden"
                    />
                  </label>
                </div>

                {itemState.status === 'QUEUED' && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium italic pt-0.5">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Trong hàng chờ tải tuần tự...</span>
                  </div>
                )}

                {itemState.status === 'UPLOADING' && (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                      <span className="flex items-center gap-1 truncate max-w-[70%]">
                        <RefreshCw className="w-3 h-3 animate-spin shrink-0" /> Đang tải ({itemState.file?.name || 'PDF'})...
                      </span>
                      <span>{itemState.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-200" 
                        style={{ width: `${itemState.progress}%` }} 
                      />
                    </div>
                  </div>
                )}

                {itemState.status === 'ERROR' && (
                  <div className="flex items-center justify-between text-[10px] text-red-600 dark:text-red-400 pt-0.5">
                    <span className="flex items-center gap-1 font-medium truncate max-w-[70%]">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> {itemState.errorMsg || 'Lỗi tải file'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetryDocUpload(slot.key, targetModal)}
                      className="px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-bold rounded flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> Tải Lại
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleOpenEditModal = (b: SubcontractorBooking) => {
    setSelectedBookingForEdit(b);
    const reqDateStr = b.requestedDate 
      ? new Date(b.requestedDate * 1000).toISOString().slice(0, 10) 
      : new Date().toISOString().slice(0, 10);
    
    setEditBooking({
      sqcType: (b.sqcType as SQCType) || 'SQC_BTP',
      poNumber: b.poNumber || '',
      supplierName: b.supplierName || '',
      locationAddress: b.locationAddress || '',
      contactPerson: b.contactPerson || '',
      contactPhone: b.contactPhone || '',
      requestedDate: reqDateStr,
      notes: b.notes || '',
      status: b.status || 'PENDING',
      items: b.items && b.items.length > 0 
        ? b.items.map((it, idx) => ({
            id: it.id || (idx + 1).toString(),
            itemName: it.itemName || '',
            quantity: it.quantity || 1,
            unit: it.unit || 'Bộ',
            specifications: it.specifications || '',
            isInspected: it.isInspected !== false
          }))
        : [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '', isInspected: true }],
      documents: {
        materialSpecUrl: b.documents?.materialSpecUrl || '',
        approvedSampleUrl: b.documents?.approvedSampleUrl || '',
        shopdrawingUrl: b.documents?.shopdrawingUrl || '',
        qualityAgreementUrl: b.documents?.qualityAgreementUrl || ''
      }
    });
    setShowEditModal(true);
  };

  const handleUpdateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingForEdit) return;
    if (!editBooking.poNumber || !editBooking.supplierName || !editBooking.locationAddress || !editBooking.contactPerson) {
      alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
      return;
    }

    // Kiểm tra quy định trước 24 tiếng (mốc 15:00) nếu người dùng đổi ngày nghiệm thu cho phiếu PENDING
    const policy = getBookingDatePolicy();
    const originalDateStr = selectedBookingForEdit.requestedDate 
      ? formatLocalDateToYMD(new Date(selectedBookingForEdit.requestedDate * 1000))
      : '';
    if (selectedBookingForEdit.status === 'PENDING' && editBooking.requestedDate && editBooking.requestedDate !== originalDateStr && editBooking.requestedDate < policy.minDateStr) {
      alert(
        `⚠️ NGÀY NGHIỆM THU KHÔNG HỢP LỆ (QUY ĐỊNH 24 TIẾNG):\n\n` +
        (policy.isAfter15h
          ? `• Thời điểm hiện tại: ${policy.currentTimeFormatted} (đã sau 15:00).\n• Bắt buộc phải chọn ngày nghiệm thu từ NGÀY MỐT (${policy.dayAfterDisplay}) trở đi.\n• Không được chọn ngày mai (${policy.tomorrowDisplay}).`
          : `• Thời điểm hiện tại: ${policy.currentTimeFormatted} (trước 15:00).\n• Được phép chọn ngày nghiệm thu sớm nhất là NGÀY MAI (${policy.tomorrowDisplay}).`) +
        `\n\nVui lòng chọn ngày từ ${policy.minDateDisplay} trở đi!`
      );
      return;
    }

    try {
      setIsLoading(true);
      await updateSubcontractorBooking(selectedBookingForEdit.id, {
        ...editBooking,
        requestedDate: editBooking.requestedDate ? new Date(editBooking.requestedDate).getTime() / 1000 : undefined
      });
      alert("Đã cập nhật phiếu book QC thành công!");
      setShowEditModal(false);
      setSelectedBookingForEdit(null);
      await loadData();
    } catch (err: any) {
      alert("Lỗi khi cập nhật phiếu book QC: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBooking = async (b: SubcontractorBooking) => {
    const confirmMsg = `Bạn có chắc chắn muốn xóa phiếu book QC "${b.bookingCode}" (PO: ${b.poNumber})?\n\nHành động này sẽ xóa phiếu khỏi hệ thống.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsLoading(true);
      await deleteSubcontractorBooking(b.id);
      alert(`Đã xóa thành công phiếu ${b.bookingCode}`);
      await loadData();
    } catch (err: any) {
      alert("Lỗi khi xóa phiếu book QC: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // PO/PR Auto-lookup states
  const [poSearchResults, setPoSearchResults] = useState<any[]>([]);
  const [isSearchingPo, setIsSearchingPo] = useState(false);
  const [showPoDropdown, setShowPoDropdown] = useState(false);

  const handlePoSearch = async (queryVal: string) => {
    setNewBooking(prev => ({ ...prev, poNumber: queryVal }));
    if (!queryVal || queryVal.trim().length < 2) {
      setPoSearchResults([]);
      setShowPoDropdown(false);
      return;
    }
    setIsSearchingPo(true);
    setShowPoDropdown(true);
    try {
      const res = await lookupPoMaterials(queryVal);
      setPoSearchResults(res.items || []);
    } catch (err) {
      console.error("Lỗi khi tra cứu PO/Material:", err);
    } finally {
      setIsSearchingPo(false);
    }
  };

  const handleSelectPoItem = (item: any) => {
    const matchedPo = item.poNumber || item.itemCode || newBooking.poNumber;
    const matchedSupplier = item.supplierName || newBooking.supplierName;
    
    // Find all items in search results matching this PO number
    const matchingItems = poSearchResults.filter(r => (r.poNumber || r.itemCode) === matchedPo);
    const itemsToUse = matchingItems.length > 0 ? matchingItems : [item];

    // Check if supplier has saved contact info in suppliers list
    const foundSupplier = suppliers.find(s => s.name.toLowerCase() === matchedSupplier.toLowerCase());

    // Auto-fill form fields
    setNewBooking(prev => ({
      ...prev,
      poNumber: matchedPo,
      supplierName: matchedSupplier,
      locationAddress: foundSupplier?.address || prev.locationAddress || '',
      contactPerson: foundSupplier?.contact_person || prev.contactPerson || '',
      contactPhone: foundSupplier?.phone || prev.contactPhone || '',
      items: itemsToUse.map((it, idx) => ({
        id: String(idx + 1),
        itemName: it.itemName || 'Sản phẩm / Vật tư gia công',
        quantity: it.quantity || 1,
        unit: it.unit || 'Bộ',
        specifications: it.specifications || (it.projectName ? `Dự án: ${it.projectName}` : ''),
        isInspected: true
      }))
    }));
    setShowPoDropdown(false);
  };

  const [assignQcId, setAssignQcId] = useState('');
  const [qcSearchQuery, setQcSearchQuery] = useState('');

  // Inspection form states
  const [vendorRepName, setVendorRepName] = useState('');
  const [inspectionResult, setInspectionResult] = useState<'PASS' | 'REJECT' | 'CONDITIONAL_PASS'>('PASS');
  const [defectSummary, setDefectSummary] = useState('');
  const [qcLaborHours, setQcLaborHours] = useState(4);
  const [travelCost, setTravelCost] = useState(500000);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // E-Signatures Canvas
  const vendorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingVendor, setIsDrawingVendor] = useState(false);
  const [isDrawingQc, setIsDrawingQc] = useState(false);
  const [vendorSignatureData, setVendorSignatureData] = useState<string>('');
  const [qcSignatureData, setQcSignatureData] = useState<string>('');

  useEffect(() => {
    loadData();
    loadReferenceData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [bkRes, costRes, inspRes] = await Promise.all([
        fetchSubcontractorBookings().catch(() => ({ bookings: [] })),
        fetchSubcontractorReinspectionCosts().catch(() => ({ costs: [] })),
        fetchInspections({}, 1, 200).catch(() => ({ data: [] }))
      ]);
      setBookings(bkRes.bookings || []);
      setReinspectionCosts(costRes.costs || []);

      const allInspections: Inspection[] = Array.isArray(inspRes) ? inspRes : (inspRes?.data || inspRes?.inspections || []);
      const sqcList = allInspections.filter(i => {
        const t = String(i.type || '').toUpperCase();
        return t === 'SQC_BTP' || t === 'SQC_TP' || t === 'SQC_VT' || t.startsWith('SQC');
      });
      setSqcInspections(sqcList);
    } catch (err) {
      console.error("Failed to load subcontractor bookings and inspections:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReferenceData = async () => {
    try {
      const [supRes, usersRes, ipoRes] = await Promise.all([
        fetchSuppliers().catch(() => ({ suppliers: [] })),
        fetchUsers().catch(() => []),
        fetchIpoData(1, 20).catch(() => ({ data: [] }))
      ]);
      setSuppliers(supRes.suppliers || []);
      const usersList = Array.isArray(usersRes) ? usersRes : (usersRes.users || []);
      setQcUsers(usersList.filter((u: User) => {
        const pBan = (u.phong_ban || (u as any).phongBan || '').toUpperCase();
        const bPhan = (u.bo_phan || (u as any).boPhan || '').toUpperCase();
        const deptId = (u.department_id || '').toLowerCase();
        const role = (u.role || '').toUpperCase();

        return (
          role === 'QC' ||
          role === 'QA' ||
          deptId === 'dept_qaqc' ||
          pBan.includes('QA') ||
          pBan.includes('QC') ||
          pBan.includes('CHẤT LƯỢNG') ||
          bPhan.includes('QA') ||
          bPhan.includes('QC') ||
          bPhan.includes('PQC') ||
          bPhan.includes('IQC') ||
          bPhan.includes('FQC') ||
          bPhan.includes('SQC') ||
          role === 'ADMIN' ||
          role === 'MANAGER'
        );
      }));
      setIpoList(ipoRes.data || []);
    } catch (err) {
      console.error("Failed to load reference data:", err);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBooking.poNumber || !newBooking.supplierName || !newBooking.locationAddress || !newBooking.contactPerson) {
      alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
      return;
    }

    const policy = getBookingDatePolicy();
    let isUrgent = false;
    if (!newBooking.requestedDate) {
      alert("Vui lòng chọn ngày nghiệm thu!");
      return;
    }
    if (newBooking.requestedDate < policy.minDateStr) {
      const confirmUrgent = window.confirm(
        `⚠️ CẢNH BÁO ĐẶT LỊCH GẤP (MUỘN HƠN QUY ĐỊNH 24 TIẾNG):\n\n` +
        `• Ngày bạn chọn (${newBooking.requestedDate}) sớm hơn thời hạn tối thiểu theo quy định (${policy.minDateDisplay}).\n` +
        `• Đặt lịch gấp cần có xác nhận và phê duyệt từ quản lý.\n\n` +
        `Bạn có muốn xác nhận gửi đơn khẩn cấp và tự động đính kèm cờ 'KHẨN' vào phiếu không?`
      );
      if (!confirmUrgent) {
        return;
      }
      isUrgent = true;
    }

    try {
      setIsLoading(true);

      // Save/update supplier contact info in suppliers table for future auto-fill
      if (newBooking.supplierName && (newBooking.locationAddress || newBooking.contactPerson || newBooking.contactPhone)) {
        try {
          const existingSup = suppliers.find(s => s.name.toLowerCase() === newBooking.supplierName.toLowerCase());
          const supPayload = {
            id: existingSup?.id || `SUP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            code: existingSup?.code || `SUP-${Math.floor(Math.random()*10000)}`,
            name: newBooking.supplierName,
            address: newBooking.locationAddress,
            contact_person: newBooking.contactPerson,
            phone: newBooking.contactPhone,
            email: existingSup?.email || '',
            category: existingSup?.category || 'Gia công ngoài',
            status: 'ACTIVE' as 'ACTIVE'
          };
          await saveSupplier(supPayload);
        } catch (supErr) {
          console.warn("Failed to auto-save supplier info:", supErr);
        }
      }

      await createSubcontractorBooking({
        ...newBooking,
        isUrgent,
        requesterId: currentUser?.id,
        requesterName: currentUser?.name || 'Chuyên viên Mua hàng',
        requestedDate: new Date(newBooking.requestedDate).getTime() / 1000
      });
      setShowCreateModal(false);
      const freshPolicy = getBookingDatePolicy();
      setNewBooking({
        sqcType: 'SQC_BTP' as SQCType,
        poNumber: '',
        supplierName: '',
        locationAddress: '',
        contactPerson: '',
        contactPhone: '',
        requestedDate: freshPolicy.minDateStr,
        notes: '',
        items: [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '', isInspected: true }],
        documents: {
          materialSpecUrl: '',
          approvedSampleUrl: '',
          shopdrawingUrl: '',
          qualityAgreementUrl: ''
        }
      });
      await loadData();
    } catch (err: any) {
      alert("Lỗi khi tạo lịch đặt QC: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignQc = async () => {
    if (!selectedBooking || !assignQcId) return;
    const selectedQc = qcUsers.find(u => u.id === assignQcId);
    try {
      setIsLoading(true);
      await updateSubcontractorBooking(selectedBooking.id, {
        status: 'ASSIGNED',
        assignedQcId: assignQcId,
        assignedQcName: selectedQc?.name || 'QC AA Corp'
      });

      // 1. Send system notification to assigned QC
      try {
        const reqDateFormatted = selectedBooking.requestedDate 
          ? new Date(selectedBooking.requestedDate * 1000).toLocaleDateString('vi-VN') 
          : 'N/A';
        await createNotification({
          userId: assignQcId,
          type: 'ASSIGNMENT',
          title: `📌 PHÂN CÔNG NGHIỆM THU MỚI: ${selectedBooking.bookingCode}`,
          message: `Xưởng: ${selectedBooking.supplierName} | PO: ${selectedBooking.poNumber} | Ngày nghiệm thu: ${reqDateFormatted}`,
          link: {
            view: 'SUBCONTRACTOR_BOOKING',
            id: selectedBooking.id
          }
        });
      } catch (notifErr) {
        console.warn("Lỗi tạo thông báo phân công QC:", notifErr);
      }

      // 2. Store assignment reminder in local storage for login popup check
      try {
        const existing = JSON.parse(localStorage.getItem('aatn_qc_pending_assignments') || '[]');
        const updatedPending = [
          ...existing,
          {
            id: `assign_${selectedBooking.id}_${Date.now()}`,
            qcId: assignQcId,
            bookingId: selectedBooking.id,
            bookingCode: selectedBooking.bookingCode,
            poNumber: selectedBooking.poNumber,
            supplierName: selectedBooking.supplierName,
            locationAddress: selectedBooking.locationAddress,
            requestedDate: selectedBooking.requestedDate,
            itemsCount: selectedBooking.items?.length || 0,
            assignedAt: Math.floor(Date.now() / 1000)
          }
        ];
        localStorage.setItem('aatn_qc_pending_assignments', JSON.stringify(updatedPending));
      } catch (e) {}

      alert(`Đã phân công thành công cho QC ${selectedQc?.name || 'phụ trách'}! Hệ thống đã gửi thông báo và lịch nhắc cho QC.`);
      setShowAssignModal(false);
      setSelectedBooking(null);
      await loadData();
    } catch (err: any) {
      alert("Lỗi khi phân công QC: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileUrl = await uploadFileToStorage(file, file.name);
        if (fileUrl) {
          setUploadedPhotos(prev => [...prev, fileUrl]);
        }
      }
    } catch (err: any) {
      alert("Lỗi tải ảnh lên: " + err.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleClearSignature = (target: 'vendor' | 'qc') => {
    if (target === 'vendor') {
      const canvas = vendorCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setVendorSignatureData('');
    } else {
      const canvas = qcCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setQcSignatureData('');
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, target: 'vendor' | 'qc') => {
    if (target === 'vendor') setIsDrawingVendor(true);
    else setIsDrawingQc(true);
    draw(e, target);
  };

  const stopDrawing = (target: 'vendor' | 'qc') => {
    if (target === 'vendor') {
      setIsDrawingVendor(false);
      if (vendorCanvasRef.current) {
        setVendorSignatureData(vendorCanvasRef.current.toDataURL());
      }
    } else {
      setIsDrawingQc(false);
      if (qcCanvasRef.current) {
        setQcSignatureData(qcCanvasRef.current.toDataURL());
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, target: 'vendor' | 'qc') => {
    const canvas = target === 'vendor' ? vendorCanvasRef.current : qcCanvasRef.current;
    const isDrawing = target === 'vendor' ? isDrawingVendor : isDrawingQc;
    if (!canvas || !isDrawing) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2563EB';

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleSubmitInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    if (!vendorRepName) {
      alert("Vui lòng nhập tên Người Đại Diện Xưởng Vệ Tinh!");
      return;
    }

    try {
      setIsLoading(true);
      await submitSubcontractorInspection({
        bookingId: selectedBooking.id,
        bookingCode: selectedBooking.bookingCode,
        qcUserId: currentUser?.id || 'qc-user',
        qcUserName: currentUser?.name || selectedBooking.assignedQcName || 'QC AA Corp',
        inspectionResult,
        vendorRepresentativeName: vendorRepName,
        vendorSignatureUrl: vendorSignatureData,
        qcSignatureUrl: qcSignatureData,
        defectSummary,
        images: uploadedPhotos,
        qcLaborHours,
        travelCost
      });

      alert(inspectionResult === 'PASS' 
        ? "Đã lưu biên bản Nghiệm thu: PASS! Đơn hàng được cấp quyền giao hàng."
        : `Đã lưu biên bản Nghiệm thu: ${inspectionResult}! Tự động sinh NCR Gia công & Hạch toán phí QC kiểm lại.`);

      setShowInspectModal(false);
      setSelectedBooking(null);
      setUploadedPhotos([]);
      setVendorRepName('');
      setDefectSummary('');
      await loadData();
    } catch (err: any) {
      alert("Lỗi khi gửi kết quả nghiệm thu: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredBookings = bookings.filter(b => {
    const matchSearch = (b.bookingCode || '').toLowerCase().includes(search.toLowerCase()) ||
                        (b.poNumber || '').toLowerCase().includes(search.toLowerCase()) ||
                        (b.supplierName || '').toLowerCase().includes(search.toLowerCase()) ||
                        (b.contactPerson || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
    const matchSqc = sqcTypeFilter === 'ALL' || (b.sqcType || 'SQC_BTP') === sqcTypeFilter;
    return matchSearch && matchStatus && matchSqc;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800"><Clock className="w-3.5 h-3.5" /> Chờ Phân Công</span>;
      case 'ASSIGNED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800"><UserCheck className="w-3.5 h-3.5" /> Đã Phân Công</span>;
      case 'IN_PROGRESS':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800"><Truck className="w-3.5 h-3.5" /> Đang Kiểm Trực Tiếp</span>;
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"><CheckCircle2 className="w-3.5 h-3.5" /> Hoàn Thành</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><XCircle className="w-3.5 h-3.5" /> Đã Hủy</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
            <Building2 className="w-4 h-4" /> Lịch Nghiệm Thu GCN (Gia Công Ngoài & Xưởng Vệ Tinh)
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white uppercase">
            Lịch Nghiệm Thu Hàng Gia Công Ngoài (GCN)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Kết nối Đơn hàng PO ERP $\rightarrow$ Book lịch QC $\rightarrow$ Nghiệm thu tại xưởng vệ tinh & Ký biên bản điện tử
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const freshPolicy = getBookingDatePolicy();
              setNewBooking(prev => ({
                ...prev,
                requestedDate: prev.requestedDate && prev.requestedDate >= freshPolicy.minDateStr 
                  ? prev.requestedDate 
                  : freshPolicy.minDateStr
              }));
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Book Lịch QC Mới
          </button>
          <button
            onClick={() => setShowSlideGuide(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <BookOpen className="w-4 h-4 text-blue-600" /> Hướng Dẫn (Slide)
          </button>
        </div>
      </div>

      {/* Tabs Selection */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('BOOKINGS')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'BOOKINGS'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4" /> Danh Sách Đặt Lịch ({bookings.length})
        </button>
        <button
          onClick={() => setActiveTab('SUPPLIER_MAP')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'SUPPLIER_MAP'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <MapPin className="w-4 h-4 text-emerald-500" /> Bản Đồ Nhà Cung Cấp ({supplierLocations.length})
        </button>
        <button
          onClick={() => setActiveTab('REINSPECTION_COSTS')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'REINSPECTION_COSTS'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <DollarSign className="w-4 h-4" /> Phí QC Kiểm Lại / CoQ ({reinspectionCosts.length})
        </button>
      </div>

      {/* TAB 1: BOOKINGS LIST */}
      {activeTab === 'BOOKINGS' && (
        <div className="space-y-4">
          {/* Executive Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">Tổng Lượt Book</span>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {bookings.length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-amber-600 font-medium">Chờ Phân Công QC</span>
              <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
                {bookings.filter(b => b.status === 'PENDING').length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-blue-600 font-medium">Đã Phân Công QC</span>
              <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
                {bookings.filter(b => b.status === 'ASSIGNED' || b.status === 'IN_PROGRESS').length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-emerald-600 font-medium">Đã Hoàn Thành</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
                {bookings.filter(b => b.status === 'COMPLETED').length}
              </div>
            </div>
          </div>

          {/* Search & Filter bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã Booking, PO, tên xưởng..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={sqcTypeFilter}
                onChange={e => setSqcTypeFilter(e.target.value)}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 dark:text-slate-300"
              >
                <option value="ALL">Tất cả loại SQC</option>
                {SQC_TYPES_CONFIG.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PENDING">Chờ phân công</option>
                <option value="ASSIGNED">Đã phân công</option>
                <option value="IN_PROGRESS">Đang nghiệm thu</option>
                <option value="COMPLETED">Hoàn thành</option>
              </select>

              <button
                onClick={loadData}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                title="Làm mới"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-2.5 py-2.5">Mã Booking / PO</th>
                    <th className="px-2.5 py-2.5">Loại SQC</th>
                    <th className="px-2.5 py-2.5">Xưởng Vệ Tinh / Địa Chỉ</th>
                    <th className="px-2.5 py-2.5">Ngày Đặt Lịch</th>
                    <th className="px-2.5 py-2.5">Ngày Nghiệm Thu</th>
                    <th className="px-2.5 py-2.5">Người Book</th>
                    <th className="px-2.5 py-2.5">QC Phụ Trách</th>
                    <th className="px-2.5 py-2.5">Trạng Thái</th>
                    <th className="px-2.5 py-2.5 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-[8px]">
                  {filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-[8px] text-slate-500 dark:text-slate-400">
                        Chưa có lịch đặt QC nghiệm thu nào.
                      </td>
                    </tr>
                  ) : (
                    filteredBookings.map(b => (
                      <tr 
                        key={b.id} 
                        onClick={() => { setSelectedBooking(b); setShowReportModal(true); }}
                        className="hover:bg-blue-50/70 dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                        title="Bấm vào dòng để xem chi tiết booking"
                      >
                        <td className="px-2.5 py-2 font-medium">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-mono text-blue-600 dark:text-blue-400 font-bold text-[8px]">{b.bookingCode}</span>
                            {b.isUrgent && (
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[7px] font-black bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
                                KHẨN
                              </span>
                            )}
                          </div>
                          <div className="text-[8px] text-slate-500 font-mono mt-0.5">PO: {b.poNumber}</div>
                        </td>
                        <td className="px-2.5 py-2">
                          {(() => {
                            const conf = SQC_TYPES_CONFIG.find(s => s.id === (b.sqcType || 'SQC_BTP')) || SQC_TYPES_CONFIG[1];
                            return (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border ${conf.badgeBg} ${conf.badgeText} ${conf.badgeBorder}`}>
                                {conf.code}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-2.5 py-2">
                          <div className="font-bold text-[8px] text-slate-900 dark:text-white flex items-center justify-between gap-1">
                            <span>{b.supplierName}</span>
                            {b.contactPhone && (
                              <a 
                                href={`tel:${b.contactPhone.replace(/[^0-9+]/g, '')}`} 
                                onClick={e => e.stopPropagation()} 
                                className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-[7px] shrink-0 inline-flex items-center gap-0.5" 
                                title={`Gọi ${b.contactPhone}`}
                              >
                                <Phone className="w-2 h-2" /> {b.contactPhone}
                              </a>
                            )}
                          </div>
                          <div className="text-[8px] text-slate-500 flex items-center justify-between gap-1 mt-0.5">
                            <span className="flex items-center gap-0.5 truncate max-w-xs">
                              <MapPin className="w-2.5 h-2.5 text-red-500 shrink-0" />
                              <span className="truncate">{b.locationAddress}</span>
                            </span>
                            {b.locationAddress && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.locationAddress)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-[7px] text-emerald-600 dark:text-emerald-400 hover:underline shrink-0 font-bold inline-flex items-center gap-0.5"
                                title="Mở Google Maps chỉ đường"
                              >
                                <ExternalLink className="w-2 h-2" /> Maps
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-[8px] font-semibold text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">
                          {b.createdAt ? new Date(b.createdAt * 1000).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-[8px] font-bold text-blue-700 dark:text-blue-300 font-mono whitespace-nowrap">
                          {b.requestedDate ? new Date(b.requestedDate * 1000).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-[8px] font-semibold text-slate-800 dark:text-slate-200">
                          {b.requesterName || 'Chuyên viên Mua hàng'}
                        </td>
                        <td className="px-2.5 py-2">
                          {b.assignedQcName ? (
                            <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-slate-800 dark:text-slate-200">
                              <UserCheck className="w-3 h-3 text-blue-500 shrink-0" />
                              {b.assignedQcName}
                            </span>
                          ) : (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-semibold italic">Chưa phân công</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          {getStatusBadge(b.status)}
                        </td>
                        <td className="px-2.5 py-2 text-right space-x-1 whitespace-nowrap">
                          {b.status === 'PENDING' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); setShowAssignModal(true); }}
                              className="px-2 py-1 text-[8px] font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-100 transition-colors inline-flex items-center gap-0.5"
                            >
                              <UserCheck className="w-3 h-3" /> Phân Công QC
                            </button>
                          )}
                          {(b.status === 'ASSIGNED' || b.status === 'IN_PROGRESS') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onStartInspection) {
                                  onStartInspection(b);
                                } else {
                                  setSelectedBooking(b);
                                  setShowInspectModal(true);
                                }
                              }}
                              className="px-2 py-1 text-[8px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-sm transition-colors inline-flex items-center gap-0.5"
                              title="Thực hiện kiểm tra / Nghiệm thu tại xưởng vệ tinh"
                            >
                              <PenTool className="w-3 h-3" /> Nghiệm Thu
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(b); }}
                            className="p-1 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors inline-flex items-center"
                            title="Sửa phiếu book sai thông tin"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBooking(b); }}
                            className="p-1 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors inline-flex items-center"
                            title="Xóa phiếu book sai thông tin"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); setShowReportModal(true); }}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            title="Xem chi tiết"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REINSPECTION COSTS / COQ ACCOUNTING */}
      {activeTab === 'REINSPECTION_COSTS' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-300">
            <h4 className="font-bold text-sm mb-1 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-amber-600" /> Công Thức Tính Phí QC Kiểm Lại (Subcontractor CoQ Deduction)
            </h4>
            <p className="font-mono text-sm font-semibold bg-white dark:bg-slate-800 p-2 rounded border border-amber-300 dark:border-amber-700 my-2">
              {"Chi Phí QC Kiểm Lại = Phí Đi Lại (Công tác phí) + (Số Giờ QC Kiểm × 250.000 VNĐ/giờ)"}
            </p>
            <p className="mt-1">
              * Khi phiếu nghiệm thu hàng gia công bị <strong>REJECT</strong> hoặc <strong>CONDITIONAL PASS</strong>, hệ thống tự động tính toán khoản phí phạt này và gửi yêu cầu trừ trực tiếp vào giá trị thanh toán hợp đồng trên ERP.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5">Mã Booking / NCR</th>
                    <th className="px-3 py-2.5">Xưởng Vệ Tinh Trừ Phí</th>
                    <th className="px-3 py-2.5">Chi Phí Đi Lại</th>
                    <th className="px-3 py-2.5">Giờ Công QC</th>
                    <th className="px-3 py-2.5">Tổng Phạt Trừ Công Nợ</th>
                    <th className="px-3 py-2.5">Trạng Thái ERP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {reinspectionCosts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        Chưa có khoản chi phí kiểm lại nào cần hạch toán.
                      </td>
                    </tr>
                  ) : (
                    reinspectionCosts.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <div className="font-bold text-slate-900 dark:text-white">{c.bookingCode || 'BK-SUB'}</div>
                          <div className="text-red-600 font-semibold">{c.ncrId}</div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                          {c.subcontractorName}
                        </td>
                        <td className="px-3 py-2.5 font-mono">
                          {c.travelCost.toLocaleString('vi-VN')} VNĐ
                        </td>
                        <td className="px-3 py-2.5 font-mono">
                          {c.qcLaborHours}h ({c.qcLaborRate.toLocaleString('vi-VN')} VNĐ/h)
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-red-600 dark:text-red-400 text-base">
                          {c.totalPenaltyCost.toLocaleString('vi-VN')} VNĐ
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200">
                            Chờ trừ công nợ ERP
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIER LOCATION MAP */}
      {activeTab === 'SUPPLIER_MAP' && (
        <div className="space-y-4">
          {/* Executive Stats Bar for Maps */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">Tổng Xưởng Vệ Tinh</span>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {supplierLocations.length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Vị Trí Đặt Lịch
              </span>
              <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
                {supplierLocations.filter(l => l.isBooked).length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Vị Trí Báo Cáo QC
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
                {supplierLocations.filter(l => l.isInspected).length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Cả 2 Lượt Book & QC
              </span>
              <div className="text-2xl font-bold font-mono text-purple-600 mt-1">
                {supplierLocations.filter(l => l.locationType === 'BOTH').length}
              </div>
            </div>
          </div>

          {/* Layer Controls & Filter Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm xưởng, địa chỉ, mã PO..."
                value={mapSearchQuery}
                onChange={e => setMapSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Layer Toggle Filters */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
              <button
                type="button"
                onClick={() => setMapLayerFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  mapLayerFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-slate-500" /> Tất Cả Vị Trí ({supplierLocations.length})
              </button>

              <button
                type="button"
                onClick={() => setMapLayerFilter('BOOKED')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  mapLayerFilter === 'BOOKED'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-300" /> Vị Trí Đặt Lịch
              </button>

              <button
                type="button"
                onClick={() => setMapLayerFilter('INSPECTED')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  mapLayerFilter === 'INSPECTED'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-300" /> Vị Trí Báo Cáo QC
              </button>
            </div>
          </div>

          {/* Interactive Split View: Supplier Cards List & Embedded Google Map Frame */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Supplier Cards List */}
            <div className="lg:col-span-5 space-y-3 max-h-[750px] overflow-y-auto pr-1">
              {filteredSupplierLocations.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 text-xs">
                  Không tìm thấy địa điểm nhà cung cấp phù hợp bộ lọc.
                </div>
              ) : (
                filteredSupplierLocations.map((loc) => {
                  const isSelected = activeSelectedMapSupplier?.key === loc.key;
                  return (
                    <div
                      key={loc.key}
                      onClick={() => setSelectedMapSupplierKey(loc.key)}
                      className={`bg-white dark:bg-slate-900 p-4 rounded-xl border transition-all cursor-pointer shadow-sm space-y-2.5 ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Header & Layer Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-blue-600 shrink-0" /> {loc.supplierName}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-medium">
                            Người liên hệ: <strong>{loc.contactPerson}</strong>
                          </span>
                        </div>

                        {/* Location Type Badge */}
                        {loc.locationType === 'BOTH' ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" /> Đặt Lịch & QC
                          </span>
                        ) : loc.locationType === 'INSPECTED' ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Báo Cáo QC
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Đặt Lịch Book
                          </span>
                        )}
                      </div>

                      {/* Address & Google Maps Navigation */}
                      <div className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span className="leading-snug">{loc.locationAddress}</span>
                      </div>

                      {/* Contact Phone & Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div className="flex items-center gap-1.5">
                          {loc.contactPhone && (
                            <a
                              href={`tel:${loc.contactPhone.replace(/[^0-9+]/g, '')}`}
                              onClick={e => e.stopPropagation()}
                              className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded text-[11px] font-bold inline-flex items-center gap-1"
                              title="Bấm vào để gọi điện trực tiếp"
                            >
                              <Phone className="w-3 h-3" /> {loc.contactPhone}
                            </a>
                          )}
                          {loc.contactPhone && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCopyText(loc.contactPhone, `map_phone_${loc.key}`); }}
                              className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium"
                            >
                              {copiedText === `map_phone_${loc.key}` ? '✓ Đã sao chép' : 'Sao chép SĐT'}
                            </button>
                          )}
                        </div>

                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${loc.encodedAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold inline-flex items-center gap-1 shadow-sm"
                        >
                          <ExternalLink className="w-3 h-3" /> Chỉ Đường Google Maps
                        </a>
                      </div>

                      {/* Associated PO list badges (Bookings & Historical SQC Reports) */}
                      <div className="space-y-1.5 pt-1">
                        {loc.bookings.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Lịch Book ({loc.bookings.length}):</span>
                            {loc.bookings.map(b => (
                              <span
                                key={b.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); setShowReportModal(true); }}
                                className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded font-mono text-[10px] font-bold cursor-pointer transition-colors border border-blue-200 dark:border-blue-800"
                                title="Xem chi tiết phiếu book này"
                              >
                                {b.poNumber}
                              </span>
                            ))}
                          </div>
                        )}

                        {loc.sqcReports.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Báo Cáo QC ({loc.sqcReports.length}):</span>
                            {loc.sqcReports.map(r => {
                              const badgeStyle = r.result === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : r.result === 'REJECT'
                                ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300';
                              const resLabel = r.result === 'PASS' ? 'ĐẠT' : r.result === 'REJECT' ? 'KHÔNG ĐẠT' : 'ĐẠT CÓ ĐIỀU KIỆN';

                              return (
                                <span
                                  key={r.id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedSqcReport(r.rawInspection); }}
                                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold cursor-pointer transition-colors border flex items-center gap-1 ${badgeStyle}`}
                                  title={`Báo cáo SQC PO: ${r.poNumber} — Kết quả: ${resLabel} (${r.date})`}
                                >
                                  <span>{r.poNumber}</span>
                                  <span className="text-[8px] opacity-90">({resLabel})</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Column: Google Maps View & Selected Supplier Details Popup Card */}
            <div className="lg:col-span-7 space-y-4 sticky top-4">
              {/* Google Maps Embed Frame */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
                      Bản Đồ Google Maps — {activeSelectedMapSupplier ? activeSelectedMapSupplier.supplierName : 'Xưởng Vệ Tinh'}
                    </span>
                  </div>

                  {activeSelectedMapSupplier && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${activeSelectedMapSupplier.encodedAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Mở Trên App Google Maps
                    </a>
                  )}
                </div>

                <div className="w-full h-[380px] rounded-lg overflow-hidden relative bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {activeSelectedMapSupplier ? (
                    <iframe
                      title={`Google Map - ${activeSelectedMapSupplier.supplierName}`}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      allowFullScreen
                      src={`https://maps.google.com/maps?q=${activeSelectedMapSupplier.encodedAddress}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                      Vui lòng chọn xưởng để hiển thị bản đồ định vị
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Supplier PO & QC Reports Details Popup Card */}
              {activeSelectedMapSupplier && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-900/50 p-4 shadow-md space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div>
                      <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        Thông Tin Chi Tiết Đặt Lịch & Báo Cáo QC Tại Xưởng
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {activeSelectedMapSupplier.supplierName}
                      </h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-red-500 shrink-0" /> {activeSelectedMapSupplier.locationAddress}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {activeSelectedMapSupplier.contactPhone && (
                        <a
                          href={`tel:${activeSelectedMapSupplier.contactPhone.replace(/[^0-9+]/g, '')}`}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" /> Gọi {activeSelectedMapSupplier.contactPhone}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* 1. List of Bookings at this Workshop */}
                  {activeSelectedMapSupplier.bookings.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center justify-between">
                        <span>Lịch Book QC Đã Tạo ({activeSelectedMapSupplier.bookings.length})</span>
                        <span className="text-[10px] text-slate-400 font-normal">Bấm vào đơn để xem chi tiết</span>
                      </span>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                        {activeSelectedMapSupplier.bookings.map(b => (
                          <div
                            key={b.id}
                            onClick={() => { setSelectedBooking(b); setShowReportModal(true); }}
                            className="p-2.5 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{b.bookingCode}</span>
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">PO: {b.poNumber}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Ngày nghiệm thu: <strong>{b.requestedDate ? new Date(b.requestedDate * 1000).toLocaleDateString('vi-VN') : '—'}</strong> | QC: {b.assignedQcName || 'Chưa phân công'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {getStatusBadge(b.status)}
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. List of Historical SQC Inspection Reports at this Workshop */}
                  {activeSelectedMapSupplier.sqcReports.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Báo Cáo SQC Đã Nghiệm Thu ({activeSelectedMapSupplier.sqcReports.length})
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">Bấm vào để xem Báo cáo gốc</span>
                      </span>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                        {activeSelectedMapSupplier.sqcReports.map(r => {
                          const badgeStyle = r.result === 'PASS'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : r.result === 'REJECT'
                            ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300';
                          const resText = r.result === 'PASS' ? '✓ ĐẠT' : r.result === 'REJECT' ? '✕ KHÔNG ĐẠT' : '⚠ CÓ ĐIỀU KIỆN';

                          return (
                            <div
                              key={r.id}
                              onClick={() => setSelectedSqcReport(r.rawInspection)}
                              className="p-2.5 hover:bg-emerald-50/60 dark:hover:bg-slate-800/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">PO: {r.poNumber}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase">
                                    {r.sqcType}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Ngày kiểm: <strong>{r.date}</strong> | QC: <strong>{r.inspector}</strong>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${badgeStyle}`}>
                                  {resText}
                                </span>
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE BOOKING */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header (Pinned) */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0 bg-white dark:bg-slate-900 z-10">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" /> Tạo Yêu Cầu Book QC Nghiệm Thu Gia Công
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* SQC Type Selection Radio Group */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Chọn Loại Hình Nghiệm Thu SQC (*)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SQC_TYPES_CONFIG.map(sqcOpt => {
                    const isSelected = newBooking.sqcType === sqcOpt.id;
                    return (
                      <div
                        key={sqcOpt.id}
                        onClick={() => setNewBooking(prev => ({ ...prev, sqcType: sqcOpt.id }))}
                        className={`cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col justify-between ${
                          isSelected 
                            ? `${sqcOpt.badgeBg} ${sqcOpt.badgeBorder} ring-2 ring-blue-500 shadow-md`
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold uppercase ${sqcOpt.badgeText}`}>
                            {sqcOpt.title}
                          </span>
                          <input
                            type="radio"
                            name="createSqcTypeRadio"
                            checked={isSelected}
                            onChange={() => setNewBooking(prev => ({ ...prev, sqcType: sqcOpt.id }))}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Mã Đơn Hàng PO / PR / Hợp Đồng ERP (*)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="Nhập mã PO, PR hoặc tên vật tư để dò..."
                      value={newBooking.poNumber}
                      onChange={e => handlePoSearch(e.target.value)}
                      onFocus={() => { if (poSearchResults.length > 0) setShowPoDropdown(true); }}
                      className="w-full pl-3 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    {isSearchingPo && (
                      <RefreshCw className="w-4 h-4 text-blue-500 animate-spin absolute right-2.5 top-2.5" />
                    )}
                  </div>

                  {/* Auto-lookup results dropdown */}
                  {showPoDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                      <div className="p-2 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                        <span>Kết quả dò trong Bảng Material / IPO ({poSearchResults.length})</span>
                        <button type="button" onClick={() => setShowPoDropdown(false)} className="text-slate-400 hover:text-slate-600">Đóng</button>
                      </div>

                      {poSearchResults.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 italic text-center">
                          {isSearchingPo ? 'Đang dò tìm...' : 'Không tìm thấy thông tin PO/PR phù hợp'}
                        </div>
                      ) : (
                        poSearchResults.map((resItem, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleSelectPoItem(resItem)}
                            className="p-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                              <span>{resItem.poNumber || resItem.itemCode || 'PO / Material'}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{resItem.source?.toUpperCase()}</span>
                            </div>
                            <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">{resItem.itemName}</div>
                            <div className="text-[11px] text-slate-500 flex items-center justify-between mt-1">
                              <span>Xưởng: {resItem.supplierName || 'Mặc định'}</span>
                              <span>SL: {resItem.quantity} {resItem.unit}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Xưởng Vệ Tinh / Nhà Cung Cấp (*)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Xưởng Gỗ Hoàng Gia Bình Dương"
                    value={newBooking.supplierName}
                    onChange={e => setNewBooking({ ...newBooking, supplierName: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Items List Section */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" /> Danh Sách Hạng Mục Hàng Gia Công ({newBooking.items.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewBooking(prev => ({
                      ...prev,
                      items: [...prev.items, { id: Date.now().toString(), itemName: '', quantity: 1, unit: 'Bộ', specifications: '', isInspected: true }]
                    }))}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Hạng Mục
                  </button>
                </div>

                {newBooking.items.map((item, itemIdx) => (
                  <div key={item.id} className={`grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border transition-all items-center text-xs ${item.isInspected === false ? 'border-dashed border-slate-300 dark:border-slate-700 opacity-60' : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="sm:col-span-1 flex flex-col items-center justify-center pt-1">
                      <label className="block text-[10px] text-slate-500 font-bold uppercase">Kiểm</label>
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
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded cursor-pointer mt-1"
                        title="Chọn (kiểm) hoặc Bỏ chọn (không kiểm)"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] text-slate-400 font-medium">Tên Sản Phẩm / Hạng Mục (*)</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: Cửa gỗ tự nhiên OAK..."
                        value={item.itemName}
                        onChange={e => {
                          const val = e.target.value;
                          setNewBooking(prev => {
                            const updated = [...prev.items];
                            updated[itemIdx].itemName = val;
                            return { ...prev, items: updated };
                          });
                        }}
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-semibold"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 font-medium">Số Lượng</label>
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
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 font-medium">Đơn Vị Tính</label>
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
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-1">
                      <div className="flex-1">
                        <label className="block text-[10px] text-slate-400 font-medium">Quy Cách / Ghi Chú</label>
                        <input
                          type="text"
                          placeholder="Quy cách..."
                          value={item.specifications}
                          onChange={e => {
                            const val = e.target.value;
                            setNewBooking(prev => {
                              const updated = [...prev.items];
                              updated[itemIdx].specifications = val;
                              return { ...prev, items: updated };
                            });
                          }}
                          className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </div>
                      {newBooking.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewBooking(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== itemIdx) }))}
                          className="text-red-500 hover:text-red-700 p-1 mt-3"
                          title="Xóa"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Địa Chỉ Xưởng Vệ Tinh Khảo Sát (*)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Số nhà, Đường, KCN, Tỉnh/Thành phố..."
                  value={newBooking.locationAddress}
                  onChange={e => setNewBooking({ ...newBooking, locationAddress: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Người Liên Hệ Xưởng (*)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Anh Nguyễn Văn B"
                    value={newBooking.contactPerson}
                    onChange={e => setNewBooking({ ...newBooking, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    SĐT Liên Hệ (*)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="090x xxx xxx"
                    value={newBooking.contactPhone}
                    onChange={e => setNewBooking({ ...newBooking, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                      Ngày Nghiệm Thu (*)
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
                    min={bookingPolicy.minDateStr}
                    value={newBooking.requestedDate}
                    onChange={e => setNewBooking({ ...newBooking, requestedDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium font-mono"
                  />
                  <div className="mt-1 text-[11px] leading-tight space-y-0.5">
                    <p className="text-slate-500 dark:text-slate-400">
                      * Yêu cầu đặt trước 24 tiếng: Trước 15:00 chọn ngày hôm sau; sau 15:00 phải chọn từ ngày mốt.
                    </p>
                    <p className={`font-semibold ${bookingPolicy.isAfter15h ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      {bookingPolicy.isAfter15h 
                        ? `⚡ Hiện tại đã sau 15:00 → Ngày sớm nhất được chọn: Ngày mốt (${bookingPolicy.dayAfterDisplay})` 
                        : `✓ Hiện tại trước 15:00 → Ngày sớm nhất được chọn: Ngày mai (${bookingPolicy.tomorrowDisplay})`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Hồ Sơ / Tài Liệu Kỹ Thuật Nghiệm Thu (Sequential Multi-File PDF Upload) */}
              {renderDocSection('create')}


              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Ghi Chú Đặt Lịch
                </label>
                <textarea
                  rows={2}
                  placeholder="Các yêu cầu đặc biệt khi QC kiểm định..."
                  value={newBooking.notes}
                  onChange={e => setNewBooking({ ...newBooking, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              </div>

              {/* Modal Footer (Pinned) */}
              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/80 z-10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                >
                  {isLoading ? 'Đang tạo...' : 'Xác Nhận Book Lịch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ASSIGN QC */}
      {showAssignModal && selectedBooking && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" /> Phân Công QC Đi Xưởng Vệ Tinh
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg space-y-1">
              <div><strong>Mã Booking:</strong> <span className="font-mono text-blue-600">{selectedBooking.bookingCode}</span></div>
              <div><strong>Xưởng:</strong> {selectedBooking.supplierName}</div>
              <div><strong>Địa chỉ:</strong> {selectedBooking.locationAddress}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
                Chọn Chuyên Viên QA/QC Phụ Trách (*)
              </label>

              {/* Search Bar */}
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm nhanh tên Chuyên viên hoặc Mã NV/Username..."
                  value={qcSearchQuery}
                  onChange={e => setQcSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                />
                {qcSearchQuery && (
                  <button onClick={() => setQcSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* QC Staff Cards List */}
              <div className="max-h-56 overflow-y-auto space-y-1.5 p-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 no-scrollbar">
                {(() => {
                  const filtered = qcUsers.filter(u => {
                    const q = removeVietnameseTones(qcSearchQuery.toLowerCase().trim());
                    if (!q) return true;
                    const nameMatch = removeVietnameseTones((u.name || '').toLowerCase()).includes(q);
                    const usernameMatch = removeVietnameseTones((u.username || '').toLowerCase()).includes(q);
                    const msnvMatch = removeVietnameseTones((u.msnv || '').toLowerCase()).includes(q);
                    return nameMatch || usernameMatch || msnvMatch;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-6 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Không tìm thấy chuyên viên QA/QC
                      </div>
                    );
                  }

                  return filtered.map(u => {
                    const isSelected = assignQcId === u.id;
                    return (
                      <div
                        key={u.id}
                        onClick={() => setAssignQcId(u.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                        }`}
                      >
                        <div>
                          <div className={`text-xs font-black uppercase flex items-center gap-1.5 ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                            {u.name}
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                              ({u.msnv || u.username})
                            </span>
                          </div>
                          <div className={`text-[10px] font-medium mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {u.phong_ban || (u as any).phongBan || 'Phòng QAQC'} • {u.position || u.role}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleAssignQc}
                disabled={!assignQcId || isLoading}
                className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm"
              >
                Xác Nhận Phân Công
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SITE INSPECTION & E-SIGNATURE */}
      {showInspectModal && selectedBooking && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header (Pinned) */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0 bg-white dark:bg-slate-900 z-10">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-emerald-600" /> Ký Biên Bản Nghiệm Thu Hàng Gia Công
                </h3>
                <span className="text-xs font-mono text-blue-600">{selectedBooking.bookingCode} | PO: {selectedBooking.poNumber}</span>
              </div>
              <button
                onClick={() => setShowInspectModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitInspection} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-slate-500">Xưởng Vệ Tinh:</span>
                  <div className="font-bold text-slate-900 dark:text-white">{selectedBooking.supplierName}</div>
                </div>
                <div>
                  <span className="text-slate-500">QC Phụ Trách:</span>
                  <div className="font-bold text-blue-600">{currentUser?.name || selectedBooking.assignedQcName}</div>
                </div>
              </div>

              {/* Outcome Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
                  Kết Quả Nghiệm Thu Tổng Thể (*)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setInspectionResult('PASS')}
                    className={`py-3 px-2 rounded-lg border text-center font-bold text-sm transition-all flex flex-col items-center gap-1 ${
                      inspectionResult === 'PASS'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ring-2 ring-emerald-500'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    PASS (ĐẠT)
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectionResult('REJECT')}
                    className={`py-3 px-2 rounded-lg border text-center font-bold text-sm transition-all flex flex-col items-center gap-1 ${
                      inspectionResult === 'REJECT'
                        ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/40 dark:text-red-300 ring-2 ring-red-500'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700'
                    }`}
                  >
                    <XCircle className="w-5 h-5 text-red-600" />
                    REJECT (BÁC BỎ)
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectionResult('CONDITIONAL_PASS')}
                    className={`py-3 px-2 rounded-lg border text-center font-bold text-sm transition-all flex flex-col items-center gap-1 ${
                      inspectionResult === 'CONDITIONAL_PASS'
                        ? 'bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-2 ring-amber-500'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    CÓ ĐIỀU KIỆN
                  </button>
                </div>
              </div>

              {/* Vendor Rep Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Họ Tên Người Đại Diện Xưởng Vệ Tinh Ký Xác Nhận (*)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập họ tên đại diện xưởng..."
                  value={vendorRepName}
                  onChange={e => setVendorRepName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Defect summary if rejected */}
              {inspectionResult !== 'PASS' && (
                <div className="space-y-3 bg-red-50/50 dark:bg-red-950/20 p-4 rounded-xl border border-red-200 dark:border-red-900/50">
                  <h4 className="text-xs font-bold text-red-700 dark:text-red-400 uppercase flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Mô Tả Lỗi & Tính Phí Phạt QC Kiểm Lại
                  </h4>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Mô Tả Lỗi Kỹ Thuật (Sơn, Mối Nối, Cong Vênh, Khe Hở...)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Mô tả chi tiết hạng mục hàng bị hỏng..."
                      value={defectSummary}
                      onChange={e => setDefectSummary(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold mb-1">Số Giờ QC Kiểm Lại (Giờ)</label>
                      <input
                        type="number"
                        min="1"
                        value={qcLaborHours}
                        onChange={e => setQcLaborHours(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Phí Đi Lại (Công Tác Phí - VNĐ)</label>
                      <input
                        type="number"
                        step="50000"
                        value={travelCost}
                        onChange={e => setTravelCost(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div className="text-xs font-bold text-red-600 flex justify-between items-center pt-2 border-t border-red-200">
                    <span>Tổng Phí Phạt Tự Động Trừ ERP:</span>
                    <span className="text-base font-mono">{(travelCost + qcLaborHours * 250000).toLocaleString('vi-VN')} VNĐ</span>
                  </div>
                </div>
              )}

              {/* Upload photos */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Hình Ảnh Bằng Chứng Kiểm Tra Tại Xưởng
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700">
                    <Camera className="w-4 h-4 text-blue-500" /> Tải Ảnh Lên
                    <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                  {isUploadingPhoto && <span className="text-xs text-blue-500">Đang tải ảnh...</span>}
                </div>

                {uploadedPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {uploadedPhotos.map((img, idx) => (
                      <img key={idx} src={img} alt="Evidence" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                    ))}
                  </div>
                )}
              </div>

              {/* E-Signature Canvas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                {/* Vendor signature */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                    <span>Chữ Ký Đại Diện Xưởng Vệ Tinh</span>
                    <button type="button" onClick={() => handleClearSignature('vendor')} className="text-red-500 text-[10px] underline">
                      Xóa Ký Lại
                    </button>
                  </div>
                  <div className="border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 touch-none">
                    <canvas
                      ref={vendorCanvasRef}
                      width={300}
                      height={120}
                      className="w-full h-28 cursor-crosshair"
                      onMouseDown={e => startDrawing(e, 'vendor')}
                      onMouseUp={() => stopDrawing('vendor')}
                      onMouseMove={e => draw(e, 'vendor')}
                      onTouchStart={e => startDrawing(e, 'vendor')}
                      onTouchEnd={() => stopDrawing('vendor')}
                      onTouchMove={e => draw(e, 'vendor')}
                    />
                  </div>
                </div>

                {/* QC signature */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                    <span>Chữ Ký QC AA Corporation</span>
                    <button type="button" onClick={() => handleClearSignature('qc')} className="text-red-500 text-[10px] underline">
                      Xóa Ký Lại
                    </button>
                  </div>
                  <div className="border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 touch-none">
                    <canvas
                      ref={qcCanvasRef}
                      width={300}
                      height={120}
                      className="w-full h-28 cursor-crosshair"
                      onMouseDown={e => startDrawing(e, 'qc')}
                      onMouseUp={() => stopDrawing('qc')}
                      onMouseMove={e => draw(e, 'qc')}
                      onTouchStart={e => startDrawing(e, 'qc')}
                      onTouchEnd={() => stopDrawing('qc')}
                      onTouchMove={e => draw(e, 'qc')}
                    />
                  </div>
                </div>
              </div>

              </div>

              {/* Modal Footer (Pinned) */}
              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/80 z-10">
                <button
                  type="button"
                  onClick={() => setShowInspectModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-colors"
                >
                  {isLoading ? 'Đang gửi...' : 'Hoàn Thành & Lưu Biên Bản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: VIEW DETAIL REPORT */}
      {showReportModal && selectedBooking && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header (Pinned) */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0 bg-white dark:bg-slate-900 z-10">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-blue-600" /> Chi Tiết Booking {selectedBooking.bookingCode}
              </h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sm">
              <div className="space-y-3 bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                {/* Row 1: Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><strong>Đơn hàng PO:</strong> <span className="font-mono text-blue-600 font-bold">{selectedBooking.poNumber}</span></div>
                  <div><strong>Xưởng Vệ Tinh:</strong> <span className="font-bold">{selectedBooking.supplierName}</span></div>
                  <div><strong>QC Phụ trách:</strong> {selectedBooking.assignedQcName || 'Chưa phân công'}</div>
                  <div className="flex items-center gap-1.5"><strong>Trạng thái:</strong> {getStatusBadge(selectedBooking.status)}</div>
                </div>

                {/* Row 2: Interactive Contact (Phone + Copy + Tel Link) */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="shrink-0">Người liên hệ xưởng:</strong>
                    <span className="font-semibold text-slate-900 dark:text-white">{selectedBooking.contactPerson || 'Đại diện xưởng'}</span>
                    {selectedBooking.contactPhone && (
                      <a 
                        href={`tel:${selectedBooking.contactPhone.replace(/[^0-9+]/g, '')}`}
                        className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-blue-700 dark:text-blue-300 rounded text-[11px] font-bold inline-flex items-center gap-1 transition-colors shadow-sm"
                        title="Bấm vào để gọi điện trực tiếp"
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> {selectedBooking.contactPhone}
                      </a>
                    )}
                  </div>

                  {selectedBooking.contactPhone && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(selectedBooking.contactPhone, 'phone')}
                      className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors shrink-0"
                    >
                      {copiedText === 'phone' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Đã sao chép SĐT</span>
                      ) : (
                        <>
                          <Download className="w-3 h-3 rotate-180" /> Sao chép SĐT
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Row 3: Interactive Location Address & Google Maps Navigation */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-start gap-1.5 text-slate-800 dark:text-slate-200 flex-1 min-w-[200px]">
                      <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-[11px]">Địa chỉ xưởng khảo sát:</strong>
                        <span className="font-semibold text-slate-900 dark:text-white leading-relaxed">{selectedBooking.locationAddress}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyText(selectedBooking.locationAddress, 'address')}
                        className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        {copiedText === 'address' ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Đã sao chép</span>
                        ) : (
                          'Sao chép địa chỉ'
                        )}
                      </button>

                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedBooking.locationAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 shadow-sm transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Mở Google Maps chỉ đường
                      </a>
                    </div>
                  </div>

                  {/* Embedded Google Maps Mini Preview Frame */}
                  {selectedBooking.locationAddress && (
                    <div className="w-full h-44 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner relative bg-slate-100 dark:bg-slate-800">
                      <iframe
                        title={`Google Maps Preview - ${selectedBooking.supplierName}`}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedBooking.locationAddress)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {selectedBooking.notes && (
                <div className="text-xs bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded border border-amber-200">
                  <strong>Ghi chú:</strong> {selectedBooking.notes}
                </div>
              )}

              {/* Technical Documents list */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-blue-600" /> Hồ Sơ & Tài Liệu Kỹ Thuật Nghiệm Thu
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">1. Spec Vật Tư:</span>
                    {selectedBooking.documents?.materialSpecUrl ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({
                            title: `Spec Vật Tư - PO: ${selectedBooking.poNumber}`,
                            rawUrl: selectedBooking.documents?.materialSpecUrl || '',
                            fileId: getGoogleDriveFileId(selectedBooking.documents?.materialSpecUrl || '')
                          })}
                          className="text-blue-600 hover:text-blue-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer text-xs"
                        >
                          <FileText className="w-3.5 h-3.5" /> Xem File
                        </button>
                        <a 
                          href={getFileDownloadUrl(selectedBooking.documents.materialSpecUrl || '')} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          download 
                          className="text-slate-500 hover:text-blue-600 flex items-center gap-0.5 text-[11px]" 
                          title="Tải file về máy"
                        >
                          <Download className="w-3 h-3" /> Tải về
                        </a>
                      </div>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">2. Mẫu Duyệt:</span>
                    {selectedBooking.documents?.approvedSampleUrl ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({
                            title: `Mẫu Duyệt - PO: ${selectedBooking.poNumber}`,
                            rawUrl: selectedBooking.documents?.approvedSampleUrl || '',
                            fileId: getGoogleDriveFileId(selectedBooking.documents?.approvedSampleUrl || '')
                          })}
                          className="text-blue-600 hover:text-blue-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer text-xs"
                        >
                          <FileText className="w-3.5 h-3.5" /> Xem File
                        </button>
                        <a 
                          href={getFileDownloadUrl(selectedBooking.documents.approvedSampleUrl || '')} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          download 
                          className="text-slate-500 hover:text-blue-600 flex items-center gap-0.5 text-[11px]" 
                          title="Tải file về máy"
                        >
                          <Download className="w-3 h-3" /> Tải về
                        </a>
                      </div>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">3. Bản Vẽ Thi Công:</span>
                    {selectedBooking.documents?.shopdrawingUrl ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({
                            title: `Bản Vẽ Thi Công - PO: ${selectedBooking.poNumber}`,
                            rawUrl: selectedBooking.documents?.shopdrawingUrl || '',
                            fileId: getGoogleDriveFileId(selectedBooking.documents?.shopdrawingUrl || '')
                          })}
                          className="text-blue-600 hover:text-blue-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer text-xs"
                        >
                          <FileText className="w-3.5 h-3.5" /> Xem File
                        </button>
                        <a 
                          href={getFileDownloadUrl(selectedBooking.documents.shopdrawingUrl || '')} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          download 
                          className="text-slate-500 hover:text-blue-600 flex items-center gap-0.5 text-[11px]" 
                          title="Tải file về máy"
                        >
                          <Download className="w-3 h-3" /> Tải về
                        </a>
                      </div>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">4. Biên Bản Thống Nhất:</span>
                    {selectedBooking.documents?.qualityAgreementUrl ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({
                            title: `Biên Bản Thống Nhất Chất Lượng - PO: ${selectedBooking.poNumber}`,
                            rawUrl: selectedBooking.documents?.qualityAgreementUrl || '',
                            fileId: getGoogleDriveFileId(selectedBooking.documents?.qualityAgreementUrl || '')
                          })}
                          className="text-blue-600 hover:text-blue-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer text-xs"
                        >
                          <FileText className="w-3.5 h-3.5" /> Xem File
                        </button>
                        <a 
                          href={getFileDownloadUrl(selectedBooking.documents.qualityAgreementUrl || '')} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          download 
                          className="text-slate-500 hover:text-blue-600 flex items-center gap-0.5 text-[11px]" 
                          title="Tải file về máy"
                        >
                          <Download className="w-3 h-3" /> Tải về
                        </a>
                      </div>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer (Pinned) */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/80 z-10">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" /> In Phiếu
              </button>
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 5: EDIT BOOKING */}
      {showEditModal && selectedBookingForEdit && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header (Pinned) */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0 bg-white dark:bg-slate-900 z-10">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-600" /> Chỉnh Sửa Phiếu Book QC ({selectedBookingForEdit.bookingCode})
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBooking} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {/* SQC Type Selection Radio Group */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                    Chọn Loại Hình Nghiệm Thu SQC (*)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {SQC_TYPES_CONFIG.map(sqcOpt => {
                      const isSelected = editBooking.sqcType === sqcOpt.id;
                      return (
                        <div
                          key={sqcOpt.id}
                          onClick={() => setEditBooking(prev => ({ ...prev, sqcType: sqcOpt.id }))}
                          className={`cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col justify-between ${
                            isSelected 
                              ? `${sqcOpt.badgeBg} ${sqcOpt.badgeBorder} ring-2 ring-amber-500 shadow-md`
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold uppercase ${sqcOpt.badgeText}`}>
                              {sqcOpt.title}
                            </span>
                            <input
                              type="radio"
                              name="editSqcTypeRadio"
                              checked={isSelected}
                              onChange={() => setEditBooking(prev => ({ ...prev, sqcType: sqcOpt.id }))}
                              className="w-4 h-4 text-amber-600 focus:ring-amber-500"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Mã Đơn Hàng PO / PR (*)
                    </label>
                    <input
                      type="text"
                      required
                      value={editBooking.poNumber}
                      onChange={e => setEditBooking({ ...editBooking, poNumber: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Xưởng Vệ Tinh / Nhà Cung Cấp (*)
                    </label>
                    <input
                      type="text"
                      required
                      value={editBooking.supplierName}
                      onChange={e => setEditBooking({ ...editBooking, supplierName: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Items List Section */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-600" /> Danh Sách Hạng Mục Hàng Gia Công ({editBooking.items.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditBooking(prev => ({
                        ...prev,
                        items: [...prev.items, { id: Date.now().toString(), itemName: '', quantity: 1, unit: 'Bộ', specifications: '', isInspected: true }]
                      }))}
                      className="text-xs font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm Hạng Mục
                    </button>
                  </div>

                  {editBooking.items.map((item, itemIdx) => (
                    <div key={item.id || itemIdx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 items-center text-xs">
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] text-slate-400 font-medium">Tên Sản Phẩm / Hạng Mục (*)</label>
                        <input
                          type="text"
                          required
                          value={item.itemName}
                          onChange={e => {
                            const val = e.target.value;
                            setEditBooking(prev => {
                              const updated = [...prev.items];
                              updated[itemIdx].itemName = val;
                              return { ...prev, items: updated };
                            });
                          }}
                          className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-400 font-medium">Số Lượng</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 1;
                            setEditBooking(prev => {
                              const updated = [...prev.items];
                              updated[itemIdx].quantity = val;
                              return { ...prev, items: updated };
                            });
                          }}
                          className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-400 font-medium">Đơn Vị Tính</label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={e => {
                            const val = e.target.value;
                            setEditBooking(prev => {
                              const updated = [...prev.items];
                              updated[itemIdx].unit = val;
                              return { ...prev, items: updated };
                            });
                          }}
                          className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-center gap-1">
                        <div className="flex-1">
                          <label className="block text-[10px] text-slate-400 font-medium">Quy Cách / Ghi Chú</label>
                          <input
                            type="text"
                            value={item.specifications}
                            onChange={e => {
                              const val = e.target.value;
                              setEditBooking(prev => {
                                const updated = [...prev.items];
                                updated[itemIdx].specifications = val;
                                return { ...prev, items: updated };
                              });
                            }}
                            className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                          />
                        </div>
                        {editBooking.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setEditBooking(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== itemIdx) }))}
                            className="text-red-500 hover:text-red-700 p-1 mt-3"
                            title="Xóa"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Địa Chỉ Xưởng Vệ Tinh Khảo Sát (*)
                  </label>
                  <input
                    type="text"
                    required
                    value={editBooking.locationAddress}
                    onChange={e => setEditBooking({ ...editBooking, locationAddress: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Người Liên Hệ Xưởng (*)
                    </label>
                    <input
                      type="text"
                      required
                      value={editBooking.contactPerson}
                      onChange={e => setEditBooking({ ...editBooking, contactPerson: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      SĐT Liên Hệ (*)
                    </label>
                    <input
                      type="text"
                      required
                      value={editBooking.contactPhone}
                      onChange={e => setEditBooking({ ...editBooking, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                        Ngày Nghiệm Thu (*)
                      </label>
                      {editBooking.status === 'PENDING' && (
                        <span 
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            bookingPolicy.isAfter15h 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' 
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {bookingPolicy.isAfter15h ? 'Sau 15h: Từ ngày mốt' : 'Trước 15h: Từ ngày mai'}
                        </span>
                      )}
                    </div>
                    <input
                      type="date"
                      required
                      min={editBooking.status === 'PENDING' ? bookingPolicy.minDateStr : undefined}
                      value={editBooking.requestedDate}
                      onChange={e => setEditBooking({ ...editBooking, requestedDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium font-mono"
                    />
                    {editBooking.status === 'PENDING' && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        * Mốc 15:00: Trước 15h chọn từ {bookingPolicy.tomorrowDisplay}; sau 15h chọn từ {bookingPolicy.dayAfterDisplay}.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Trạng Thái Phiếu
                  </label>
                  <select
                    value={editBooking.status}
                    onChange={e => setEditBooking({ ...editBooking, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium"
                  >
                    <option value="PENDING">Chờ Phân Công</option>
                    <option value="ASSIGNED">Đã Phân Công</option>
                    <option value="IN_PROGRESS">Đang Nghiệm Thu</option>
                    <option value="COMPLETED">Hoàn Thành</option>
                    <option value="CANCELLED">Đã Hủy</option>
                  </select>
                </div>

                {/* Hồ Sơ / Tài Liệu Kỹ Thuật Nghiệm Thu (Sequential Multi-File PDF Upload) */}
                {renderDocSection('edit')}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Ghi Chú
                  </label>
                  <textarea
                    rows={2}
                    value={editBooking.notes}
                    onChange={e => setEditBooking({ ...editBooking, notes: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Modal Footer (Pinned) */}
              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/80 z-10">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
                >
                  {isLoading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app Document & PDF Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-lg shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {previewDoc.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono truncate">
                    {previewDoc.fileId ? `File ID: ${previewDoc.fileId}` : previewDoc.rawUrl}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={getFileViewUrl(previewDoc.rawUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  title="Mở tài liệu toàn màn hình trong tab mới"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Mở Tab Mới (Google Drive)
                </a>
                <a
                  href={getFileDownloadUrl(previewDoc.rawUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
                  title="Tải file PDF gốc về máy"
                >
                  <Download className="w-3.5 h-3.5" /> Tải Về
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded PDF/Document Frame */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative overflow-hidden flex flex-col">
              <iframe
                src={getFileViewUrl(previewDoc.rawUrl)}
                className="w-full flex-1 border-0"
                title={previewDoc.title}
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}

      {/* SQC Report Detail Modal */}
      {selectedSqcReport && (
        <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 rounded-lg shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 uppercase">
                      {selectedSqcReport.type || 'SQC'}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      BÁO CÁO NGHIỆM THU SQC — PO: {selectedSqcReport.po_number || selectedSqcReport.poNumber || selectedSqcReport.ma_ct || 'N/A'}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                    Mã phiếu: {selectedSqcReport.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedSqcReport(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Report Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Nhà Cung Cấp / Xưởng Vệ Tinh:</span>
                  <p className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
                    {selectedSqcReport.supplier || selectedSqcReport.workshop || selectedSqcReport.ten_ct || 'N/A'}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Địa Chỉ Xưởng:</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" /> {selectedSqcReport.location || selectedSqcReport.workshop || 'Chưa cập nhật địa chỉ'}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Chuyên Viên QC Nghiệm Thu:</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" /> {selectedSqcReport.inspectorName || 'QC AA Corp'}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Ngày Nghiệm Thu:</span>
                  <p className="font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 shrink-0" /> {selectedSqcReport.date || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Inspection Items Check List */}
              {selectedSqcReport.items && selectedSqcReport.items.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-600" /> Danh Sách Hạng Mục Đã Kiểm Định ({selectedSqcReport.items.length})
                  </h4>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {selectedSqcReport.items.map((item, idx) => (
                      <div key={item.id || idx} className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{item.label || item.category}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{item.standard || item.notes || 'Đạt tiêu chuẩn chất lượng'}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {item.status || 'ĐẠT'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos & Images Section */}
              {((selectedSqcReport.images && selectedSqcReport.images.length > 0) || (selectedSqcReport.image_refs && selectedSqcReport.image_refs.length > 0)) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" /> Hình Ảnh Thực Tế Tại Xưởng
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(selectedSqcReport.images || selectedSqcReport.image_refs || []).map((imgUrl, imgIdx) => (
                      <a
                        key={imgIdx}
                        href={imgUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-sm"
                      >
                        <img src={imgUrl} alt={`Evidence ${imgIdx}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center">
                          <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Remarks / Summary */}
              {selectedSqcReport.summary && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <strong>Ghi chú / Nhận xét của QC:</strong>
                  <p>{selectedSqcReport.summary}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700"
              >
                <Printer className="w-3.5 h-3.5" /> In Báo Cáo
              </button>
              <button
                type="button"
                onClick={() => setSelectedSqcReport(null)}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide Guide Modal */}
      <SubcontractorSlideGuideModal isOpen={showSlideGuide} onClose={() => setShowSlideGuide(false)} />
    </div>
  );
};
