import React, { useState, useEffect, useRef } from 'react';
import { 
  SubcontractorBooking, 
  SubcontractorInspection, 
  SubcontractorReinspectionCost, 
  User, 
  Supplier,
  SQCType,
  SQC_TYPES_CONFIG
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
  lookupPoMaterials
} from '../services/apiService';
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
  Trash2
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'BOOKINGS' | 'REINSPECTION_COSTS'>('BOOKINGS');
  const [bookings, setBookings] = useState<SubcontractorBooking[]>([]);
  const [reinspectionCosts, setReinspectionCosts] = useState<SubcontractorReinspectionCost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sqcTypeFilter, setSqcTypeFilter] = useState<string>('ALL');
  
  // Modals & Drawers state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<SubcontractorBooking | null>(null);
  const [selectedBookingForEdit, setSelectedBookingForEdit] = useState<SubcontractorBooking | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

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
    items: [{ id: '1', itemName: 'Tủ âm tường MFC Phủ Melamine', quantity: 10, unit: 'Bộ', specifications: 'Theo shopdrawing SD-01' }],
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
    items: [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '' }],
    documents: {
      materialSpecUrl: '',
      approvedSampleUrl: '',
      shopdrawingUrl: '',
      qualityAgreementUrl: ''
    }
  });

  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [uploadingEditDocType, setUploadingEditDocType] = useState<string | null>(null);

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docKey: 'materialSpecUrl' | 'approvedSampleUrl' | 'shopdrawingUrl' | 'qualityAgreementUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocType(docKey);
    try {
      const fileUrl = await uploadFileToStorage(file, file.name);
      if (fileUrl) {
        setNewBooking(prev => ({
          ...prev,
          documents: {
            ...prev.documents,
            [docKey]: fileUrl
          }
        }));
      }
    } catch (err) {
      console.error("Lỗi upload tài liệu:", err);
      alert("Không thể tải lên file tài liệu");
    } finally {
      setUploadingDocType(null);
    }
  };

  const handleEditDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docKey: 'materialSpecUrl' | 'approvedSampleUrl' | 'shopdrawingUrl' | 'qualityAgreementUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEditDocType(docKey);
    try {
      const fileUrl = await uploadFileToStorage(file, file.name);
      if (fileUrl) {
        setEditBooking(prev => ({
          ...prev,
          documents: {
            ...prev.documents,
            [docKey]: fileUrl
          }
        }));
      }
    } catch (err) {
      console.error("Lỗi upload tài liệu:", err);
      alert("Không thể tải lên file tài liệu");
    } finally {
      setUploadingEditDocType(null);
    }
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
            specifications: it.specifications || ''
          }))
        : [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '' }],
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
    
    // Auto-fill form fields
    setNewBooking(prev => ({
      ...prev,
      poNumber: matchedPo,
      supplierName: matchedSupplier,
      items: [
        {
          id: '1',
          itemName: item.itemName || 'Sản phẩm / Vật tư gia công',
          quantity: item.quantity || 1,
          unit: item.unit || 'Bộ',
          specifications: item.specifications || (item.projectName ? `Dự án: ${item.projectName}` : '')
        }
      ]
    }));
    setShowPoDropdown(false);
  };

  const [assignQcId, setAssignQcId] = useState('');

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
      const [bkRes, costRes] = await Promise.all([
        fetchSubcontractorBookings(),
        fetchSubcontractorReinspectionCosts()
      ]);
      setBookings(bkRes.bookings || []);
      setReinspectionCosts(costRes.costs || []);
    } catch (err) {
      console.error("Failed to load subcontractor bookings:", err);
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
      setQcUsers(usersList.filter((u: User) => u.role === 'QC' || u.role === 'QA' || u.role === 'MANAGER' || u.role === 'ADMIN'));
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
    if (!newBooking.requestedDate || newBooking.requestedDate < policy.minDateStr) {
      alert(
        `⚠️ NGÀY NGHIỆM THU KHÔNG HỢP LỆ (QUY ĐỊNH 24 TIẾNG):\n\n` +
        (policy.isAfter15h
          ? `• Thời điểm đặt lịch hiện tại: ${policy.currentTimeFormatted} (đã sau mốc 15:00).\n` +
            `• Quy định: Sau 15:00 bắt buộc phải chọn ngày nghiệm thu từ NGÀY MỐT (${policy.dayAfterDisplay}) trở đi.\n` +
            `• Không được chọn ngày mai (${policy.tomorrowDisplay}).`
          : `• Thời điểm đặt lịch hiện tại: ${policy.currentTimeFormatted} (trước mốc 15:00).\n` +
            `• Quy định: Được phép chọn ngày nghiệm thu sớm nhất là NGÀY MAI (${policy.tomorrowDisplay}).`) +
        `\n\nVui lòng điều chỉnh ngày nghiệm thu từ ${policy.minDateDisplay} trở đi!`
      );
      return;
    }

    try {
      setIsLoading(true);
      await createSubcontractorBooking({
        ...newBooking,
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
        items: [{ id: '1', itemName: '', quantity: 1, unit: 'Bộ', specifications: '' }],
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
            <Building2 className="w-4 h-4" /> Quản Lý Gia Công Ngoài & Xưởng Vệ Tinh (Subcontractor QC)
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white uppercase">
            Sổ Đặt Lịch & Nghiệm Thu Hàng Gia Công
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
        </div>
      </div>

      {/* Tabs Selection */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('BOOKINGS')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'BOOKINGS'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4" /> Danh Sách Đặt Lịch ({bookings.length})
        </button>
        <button
          onClick={() => setActiveTab('REINSPECTION_COSTS')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
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
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5">Mã Booking / PO</th>
                    <th className="px-3 py-2.5">Loại SQC</th>
                    <th className="px-3 py-2.5">Xưởng Vệ Tinh / Địa Chỉ</th>
                    <th className="px-3 py-2.5">Ngày Đặt Lịch</th>
                    <th className="px-3 py-2.5">QC Phụ Trách</th>
                    <th className="px-3 py-2.5">Trạng Thái</th>
                    <th className="px-3 py-2.5 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        Chưa có lịch đặt QC nghiệm thu nào.
                      </td>
                    </tr>
                  ) : (
                    filteredBookings.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-2.5 font-medium">
                          <div className="font-mono text-blue-600 dark:text-blue-400 font-bold">{b.bookingCode}</div>
                          <div className="text-xs text-slate-500 font-mono">PO: {b.poNumber}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          {(() => {
                            const conf = SQC_TYPES_CONFIG.find(s => s.id === (b.sqcType || 'SQC_BTP')) || SQC_TYPES_CONFIG[1];
                            return (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-black uppercase border ${conf.badgeBg} ${conf.badgeText} ${conf.badgeBorder}`}>
                                {conf.code}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900 dark:text-white">{b.supplierName}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-xs">{b.locationAddress}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                          {b.requestedDate ? new Date(b.requestedDate * 1000).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {b.assignedQcName ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                              <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                              {b.assignedQcName}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 dark:text-amber-400 italic">Chưa phân công</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {getStatusBadge(b.status)}
                        </td>
                        <td className="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          {b.status === 'PENDING' && (
                            <button
                              onClick={() => { setSelectedBooking(b); setShowAssignModal(true); }}
                              className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-100 transition-colors inline-flex items-center gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> Phân Công QC
                            </button>
                          )}
                          {(b.status === 'ASSIGNED' || b.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => {
                                if (onStartInspection) {
                                  onStartInspection(b);
                                } else {
                                  setSelectedBooking(b);
                                  setShowInspectModal(true);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-sm transition-colors inline-flex items-center gap-1"
                              title="Thực hiện kiểm tra / Nghiệm thu tại xưởng vệ tinh"
                            >
                              <PenTool className="w-3.5 h-3.5" /> Nghiệm Thu Tại Xưởng
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(b)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors inline-flex items-center gap-1"
                            title="Sửa phiếu book sai thông tin"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBooking(b)}
                            className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors inline-flex items-center gap-1"
                            title="Xóa phiếu book sai thông tin"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setSelectedBooking(b); setShowReportModal(true); }}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            title="Xem chi tiết"
                          >
                            <ChevronRight className="w-4 h-4" />
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
                      items: [...prev.items, { id: Date.now().toString(), itemName: '', quantity: 1, unit: 'Bộ', specifications: '' }]
                    }))}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Hạng Mục
                  </button>
                </div>

                {newBooking.items.map((item, itemIdx) => (
                  <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 items-center text-xs">
                    <div className="sm:col-span-5">
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

              {/* Hồ Sơ / Tài Liệu Kỹ Thuật Nghiệm Thu */}
              <div className="bg-blue-50/50 dark:bg-blue-950/30 p-3.5 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-blue-600" /> Hồ Sơ & Tài Liệu Kỹ Thuật Nghiệm Thu
                  </span>
                  <span className="text-[10px] text-slate-500">Tải file PDF, Ảnh, CAD hoặc Dán Link</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* 1. Spec Vat Tu */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                      1. Spec Vật Tư / Quy Cách
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Dán link hoặc tải file..."
                        value={newBooking.documents.materialSpecUrl}
                        onChange={e => setNewBooking(prev => ({
                          ...prev,
                          documents: { ...prev.documents, materialSpecUrl: e.target.value }
                        }))}
                        className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                      />
                      <label className="cursor-pointer px-2 py-1 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-blue-700 dark:text-blue-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Tải file
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                          onChange={e => handleDocFileUpload(e, 'materialSpecUrl')}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {uploadingDocType === 'materialSpecUrl' && (
                      <span className="text-[10px] text-blue-500 animate-pulse">Đang tải tài liệu...</span>
                    )}
                  </div>

                  {/* 2. Mau Duyet */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                      2. Mẫu Duyệt (Approved Sample)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Dán link hoặc tải file..."
                        value={newBooking.documents.approvedSampleUrl}
                        onChange={e => setNewBooking(prev => ({
                          ...prev,
                          documents: { ...prev.documents, approvedSampleUrl: e.target.value }
                        }))}
                        className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                      />
                      <label className="cursor-pointer px-2 py-1 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-blue-700 dark:text-blue-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Tải file
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={e => handleDocFileUpload(e, 'approvedSampleUrl')}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {uploadingDocType === 'approvedSampleUrl' && (
                      <span className="text-[10px] text-blue-500 animate-pulse">Đang tải tài liệu...</span>
                    )}
                  </div>

                  {/* 3. Ban Ve */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                      3. Bản Vẽ Thi Công (Shopdrawing)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Dán link hoặc tải file..."
                        value={newBooking.documents.shopdrawingUrl}
                        onChange={e => setNewBooking(prev => ({
                          ...prev,
                          documents: { ...prev.documents, shopdrawingUrl: e.target.value }
                        }))}
                        className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                      />
                      <label className="cursor-pointer px-2 py-1 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-blue-700 dark:text-blue-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Tải file
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.dwg"
                          onChange={e => handleDocFileUpload(e, 'shopdrawingUrl')}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {uploadingDocType === 'shopdrawingUrl' && (
                      <span className="text-[10px] text-blue-500 animate-pulse">Đang tải tài liệu...</span>
                    )}
                  </div>

                  {/* 4. Bien Ban Thong Nhat Chat Luong */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                      4. Biên Bản Thống Nhất CL (MoU)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Dán link hoặc tải file..."
                        value={newBooking.documents.qualityAgreementUrl}
                        onChange={e => setNewBooking(prev => ({
                          ...prev,
                          documents: { ...prev.documents, qualityAgreementUrl: e.target.value }
                        }))}
                        className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                      />
                      <label className="cursor-pointer px-2 py-1 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 text-blue-700 dark:text-blue-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Tải file
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.doc,.docx"
                          onChange={e => handleDocFileUpload(e, 'qualityAgreementUrl')}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {uploadingDocType === 'qualityAgreementUrl' && (
                      <span className="text-[10px] text-blue-500 animate-pulse">Đang tải tài liệu...</span>
                    )}
                  </div>
                </div>
              </div>

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
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Chọn Chuyên Viên QC Phụ Trách (*)
              </label>
              <select
                value={assignQcId}
                onChange={e => setAssignQcId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn Nhân Viên QC --</option>
                {qcUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.msnv || u.role})</option>
                ))}
              </select>
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
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-xs">
                <div><strong>Đơn hàng PO:</strong> {selectedBooking.poNumber}</div>
                <div><strong>Xưởng Vệ Tinh:</strong> {selectedBooking.supplierName}</div>
                <div><strong>Địa chỉ:</strong> {selectedBooking.locationAddress}</div>
                <div><strong>Liên hệ:</strong> {selectedBooking.contactPerson} ({selectedBooking.contactPhone})</div>
                <div><strong>QC Phụ trách:</strong> {selectedBooking.assignedQcName || 'Chưa phân công'}</div>
                <div><strong>Trạng thái:</strong> {selectedBooking.status}</div>
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
                      <a href={selectedBooking.documents.materialSpecUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Xem File
                      </a>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">2. Mẫu Duyệt:</span>
                    {selectedBooking.documents?.approvedSampleUrl ? (
                      <a href={selectedBooking.documents.approvedSampleUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Xem File
                      </a>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">3. Bản Vẽ Thi Công:</span>
                    {selectedBooking.documents?.shopdrawingUrl ? (
                      <a href={selectedBooking.documents.shopdrawingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Xem File
                      </a>
                    ) : <span className="text-slate-400 italic">Chưa đính kèm</span>}
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">4. Biên Bản Thống Nhất:</span>
                    {selectedBooking.documents?.qualityAgreementUrl ? (
                      <a href={selectedBooking.documents.qualityAgreementUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Xem File
                      </a>
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
                        items: [...prev.items, { id: Date.now().toString(), itemName: '', quantity: 1, unit: 'Bộ', specifications: '' }]
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

                {/* Hồ Sơ / Tài Liệu Kỹ Thuật Nghiệm Thu */}
                <div className="bg-amber-50/50 dark:bg-amber-950/30 p-3.5 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-amber-600" /> Hồ Sơ & Tài Liệu Kỹ Thuật Nghiệm Thu
                    </span>
                    <span className="text-[10px] text-slate-500">Cập nhật file PDF, Ảnh hoặc Link</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* 1. Spec Vat Tu */}
                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                        1. Spec Vật Tư / Quy Cách
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Dán link hoặc tải file..."
                          value={editBooking.documents.materialSpecUrl}
                          onChange={e => setEditBooking(prev => ({
                            ...prev,
                            documents: { ...prev.documents, materialSpecUrl: e.target.value }
                          }))}
                          className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                        />
                        <label className="cursor-pointer px-2 py-1 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-800 dark:text-amber-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Tải file
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                            onChange={e => handleEditDocFileUpload(e, 'materialSpecUrl')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {uploadingEditDocType === 'materialSpecUrl' && (
                        <span className="text-[10px] text-amber-500 animate-pulse">Đang tải tài liệu...</span>
                      )}
                    </div>

                    {/* 2. Mau Duyet */}
                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                        2. Mẫu Duyệt (Approved Sample)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Dán link hoặc tải file..."
                          value={editBooking.documents.approvedSampleUrl}
                          onChange={e => setEditBooking(prev => ({
                            ...prev,
                            documents: { ...prev.documents, approvedSampleUrl: e.target.value }
                          }))}
                          className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                        />
                        <label className="cursor-pointer px-2 py-1 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-800 dark:text-amber-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Tải file
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            onChange={e => handleEditDocFileUpload(e, 'approvedSampleUrl')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {uploadingEditDocType === 'approvedSampleUrl' && (
                        <span className="text-[10px] text-amber-500 animate-pulse">Đang tải tài liệu...</span>
                      )}
                    </div>

                    {/* 3. Ban Ve */}
                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                        3. Bản Vẽ Thi Công (Shopdrawing)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Dán link hoặc tải file..."
                          value={editBooking.documents.shopdrawingUrl}
                          onChange={e => setEditBooking(prev => ({
                            ...prev,
                            documents: { ...prev.documents, shopdrawingUrl: e.target.value }
                          }))}
                          className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                        />
                        <label className="cursor-pointer px-2 py-1 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-800 dark:text-amber-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Tải file
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.dwg"
                            onChange={e => handleEditDocFileUpload(e, 'shopdrawingUrl')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {uploadingEditDocType === 'shopdrawingUrl' && (
                        <span className="text-[10px] text-amber-500 animate-pulse">Đang tải tài liệu...</span>
                      )}
                    </div>

                    {/* 4. Bien Ban Thong Nhat Chat Luong */}
                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <label className="block font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                        4. Biên Bản Thống Nhất CL (MoU)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Dán link hoặc tải file..."
                          value={editBooking.documents.qualityAgreementUrl}
                          onChange={e => setEditBooking(prev => ({
                            ...prev,
                            documents: { ...prev.documents, qualityAgreementUrl: e.target.value }
                          }))}
                          className="flex-1 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono"
                        />
                        <label className="cursor-pointer px-2 py-1 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-800 dark:text-amber-300 rounded text-[11px] font-semibold shrink-0 flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Tải file
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.doc,.docx"
                            onChange={e => handleEditDocFileUpload(e, 'qualityAgreementUrl')}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {uploadingEditDocType === 'qualityAgreementUrl' && (
                        <span className="text-[10px] text-amber-500 animate-pulse">Đang tải tài liệu...</span>
                      )}
                    </div>
                  </div>
                </div>

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
    </div>
  );
};
