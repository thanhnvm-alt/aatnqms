
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, DefectLibraryItem, SubcontractorBooking } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, 
  Calendar, CheckSquare, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, MapPin, Locate, CheckCircle2,
  AlertTriangle, AlertOctagon
} from 'lucide-react';
import { fetchProjects, fetchDefectLibrary, saveDefectLibraryItem, fetchPlans, uploadQMSImage, uploadQMSImagesBatch, preprocessInspectionPayloadForStorage, fetchIpoByFactoryOrder, fetchMaterials } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';
import { ImageEditorModal } from './ImageEditorModal';
import { PersistenceService } from '../services/persistenceService';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

import { SignaturePad } from './SignaturePad';
import { ProxyImage } from '../src/components/ProxyImage';
import { getProxyImageUrl } from '../src/utils';
import { Combobox, ConfirmDialog, FormAlertBanner, FormAlertState, extractFormErrorMessage } from '../src/components/qms';
import { BookingReferenceDocsCard } from './BookingReferenceDocsCard';
import { BookingSelectorField } from './BookingSelectorField';
import { buildSqcPrefillFromBooking } from '../src/utils/bookingDocuments';

export const InspectionFormSQC_TP: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `SQC-TP-${Date.now()}`,
    type: 'SQC_TP' as ModuleId,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    ten_ct: initialData?.ten_ct || '',
    ten_hang_muc: initialData?.ten_hang_muc || '',
    dvt: initialData?.dvt || '',
    supplier: initialData?.supplier || '',
    supplierAddress: initialData?.supplierAddress || '',
    location: initialData?.location || '',
    reportImage: initialData?.reportImage || '',
    reportImages: initialData?.reportImages || (initialData?.reportImage ? [initialData.reportImage] : []),
    deliveryNoteImage: initialData?.deliveryNoteImage || '',
    deliveryNoteImages: initialData?.deliveryNoteImages || (initialData?.deliveryNoteImage ? [initialData.deliveryNoteImage] : []),
    drawingImages: initialData?.drawingImages || [],
    summary: initialData?.summary || '',
    score: 0,
    items: initialData?.items || [], 
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [matSearch, setMatSearch] = useState('');
  const [matSearchInput, setMatSearchInput] = useState('');
  const [deleteMatIdx, setDeleteMatIdx] = useState<number | null>(null);
  const [pendingBookingPrefill, setPendingBookingPrefill] = useState<Partial<Inspection> | null>(null);
  const [formAlert, setFormAlert] = useState<FormAlertState | null>(null);

  const applyBookingPrefill = (prefill: Partial<Inspection>, overwriteMaterials: boolean) => {
      setFormData(prev => ({
          ...prev,
          booking_id: prefill.booking_id,
          booking_code: prefill.booking_code,
          po_number: prefill.po_number || prev.po_number,
          ma_ct: prefill.ma_ct || prev.ma_ct,
          ten_ct: prefill.ten_ct || prev.ten_ct,
          supplier: prefill.supplier || prev.supplier,
          supplierName: prefill.supplierName || prev.supplierName,
          ma_nha_may: prefill.ma_nha_may || prev.ma_nha_may,
          workshop: prefill.workshop || prev.workshop,
          supplierAddress: prefill.supplierAddress || prev.supplierAddress,
          location: prefill.location || prev.location,
          dia_chi_xuong: prefill.dia_chi_xuong || prev.dia_chi_xuong,
          nguoi_lien_he: prefill.nguoi_lien_he || prev.nguoi_lien_he,
          so_dien_thoai: prefill.so_dien_thoai || prev.so_dien_thoai,
          date: prefill.date || prev.date,
          supportingDocs: prefill.supportingDocs || prev.supportingDocs,
          referenceDocs: prefill.referenceDocs || prev.referenceDocs,
          drawingImages: prefill.drawingImages && prefill.drawingImages.length > 0 ? prefill.drawingImages : prev.drawingImages,
          ...(overwriteMaterials ? {
              materials: prefill.materials || [],
              items: prefill.items || prev.items,
          } : {}),
      }));
  };

  const handleSelectBooking = (booking: SubcontractorBooking) => {
      const tpl = templates['SQC_TP'] || [];
      const prefill = buildSqcPrefillFromBooking(booking, 'SQC_TP', tpl);
      const hasCustomMaterials = (formData.materials || []).length > 0 && !formData.booking_id;
      if (hasCustomMaterials && (prefill.materials || []).length > 0) {
          applyBookingPrefill(prefill, false);
          setPendingBookingPrefill(prefill);
      } else {
          applyBookingPrefill(prefill, (prefill.materials || []).length > 0);
      }
  };

  const handleClearBooking = () => {
      setFormData(prev => ({ ...prev, booking_id: undefined, booking_code: undefined }));
  };

  const handleCommitMatSearch = () => {
      setMatSearch(matSearchInput);
  };

  const handleKeyDownMatSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          handleCommitMatSearch();
      }
  };

  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL' | 'DRAWING', matIdx?: number, itemIdx?: number } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).current_ma_ct = formData.ma_ct || '';
    }
    return () => {
      if (typeof window !== 'undefined' && (window as any).current_ma_ct === formData.ma_ct) {
        (window as any).current_ma_ct = undefined;
      }
    };
  }, [formData.ma_ct]);

  useEffect(() => {
    PersistenceService.hasDraft('SQC_TP', user.id).then(setHasDraft);
    if (formData.po_number && (!formData.materials || formData.materials.length === 0)) {
      handlePoBlur();
    }
  }, []);

  useEffect(() => {
    if (formData.po_number || formData.booking_code || (formData.materials && formData.materials.length > 0)) {
        PersistenceService.saveDraft('SQC_TP', user.id, formData);
    }
  }, [formData]);

  const recoverDraft = async () => {
    const saved = await PersistenceService.getDraft('SQC_TP', user.id);
    if (saved) {
      setFormData(saved as Inspection);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    PersistenceService.clearDraft('SQC_TP', user.id);
    setHasDraft(false);
  };

  const availableCategories = useMemo(() => {
      const btpTpl = templates['SQC_TP'] || [];
      return Array.from(new Set(btpTpl.map(i => i.stage))).filter(Boolean).sort() as string[];
  }, [templates]);

  const btpGroups = useMemo(() => {
      const btpTpl = templates['SQC_TP'] || [];
      return Array.from(new Set(btpTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const filteredMaterials = useMemo(() => {
      if (!matSearch.trim()) return formData.materials || [];
      const s = matSearch.toLowerCase().trim();
      return (formData.materials || []).filter(m => 
          (m.name || '').toLowerCase().includes(s) || 
          (m.projectCode || '').toLowerCase().includes(s) ||
          (m.category || '').toLowerCase().includes(s)
      );
  }, [formData.materials, matSearch]);

  const historicalRecords = useMemo(() => {
    if (!inspections || !formData.po_number) return [];
    return inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number);
  }, [inspections, formData.po_number, formData.id]);

  const handleInputChange = (field: keyof Inspection, value: any) => {
    if (typeof value === 'string' && ['inspectedQuantity', 'passedQuantity', 'failedQuantity', 'orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty', 'so_luong_ipo'].includes(field)) {
        value = value.replace(/,/g, '.');
    }  setFormData(prev => ({ ...prev, [field]: value })); };

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
              async (pos) => {
                  const lat = pos.coords.latitude;
                  const lng = pos.coords.longitude;
                  const loc = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                  setFormData(prev => ({ ...prev, location: loc, supplierAddress: loc }));
                  setIsGettingLocation(false);
              },
              (err) => {
                  setFormAlert({ type: 'warning', title: 'Vị trí GPS', message: 'Không thể lấy vị trí GPS. Vui lòng cấp quyền vị trí hoặc nhập thủ công.' });
                  setIsGettingLocation(false);
              }
          );
      } else {
          setIsGettingLocation(false);
      }
  };

  const handlePoBlur = async () => {
    if (!formData.po_number || formData.po_number.length < 3) return;
    setIsLookupLoading(true);
    try {
      // Try IPO first
      const ipoResponse = await fetchIpoByFactoryOrder(formData.po_number);
      // ipoResponse is { items: [], total: ... }
      if (ipoResponse && ipoResponse.items && ipoResponse.items.length > 0) {
        const item = ipoResponse.items[0];
        setFormData(prev => ({ 
            ...prev, 
            ma_ct: item.ma_ct || item.Ma_Tender || item.ten_ct || item.Project_name || '',
            ten_ct: item.ten_ct || item.Project_name || '',
            ten_hang_muc: item.ten_hang_muc || item.Material_description || '',
            dvt: item.dvt || item.Base_Unit || '',
            so_luong_ipo: Number(item.Quantity_IPO || item.so_luong_ipo) || 0
        }));
        // If it's a PO search we also want materials, so we don't return here
      }
      
      // Try Materials table
      const materialResults = await fetchMaterials(formData.po_number);
      console.log("DEBUG: materialResults:", materialResults);
      
      if (materialResults && materialResults.items && materialResults.items.length > 0) {
        console.log("DEBUG: Found materials:", materialResults.items);
        
        // Take supplier from the first item
        const firstMat = materialResults.items[0];
        
        // Map all matching items to BTP materials
        const newMaterials: MaterialIQC[] = materialResults.items.map((mat: any) => ({
            id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: mat.Factory_Order || mat.material || '', // Mã định danh = id_factory_order
            category: mat.shortText || '', 
            inspectType: '100%',
            scope: 'PROJECT',
            projectCode: mat.Ma_Tender || mat.projectName || '', 
            projectName: mat.projectName || '',
            orderQty: Number(mat.orderQuantity) || 0,
            deliveryQty: Number(mat.orderQuantity) || 0,
            unit: mat.orderUnit || 'PCS',
            criteria: [],
            items: [],
            inspectQty: Number(mat.orderQuantity) || 0,
            passQty: Number(mat.orderQuantity) || 0,
            failQty: 0,
            images: [],
            type: '100%',
            date: new Date().toISOString().split('T')[0]
        }));

        setFormData(prev => ({ 
            ...prev,
            supplier: firstMat.supplierName || prev.supplier, // Đối tác gia công btp = tên nhà cung cấp
            ten_ct: firstMat.projectName || prev.ten_ct, // Update project name
            materials: newMaterials // Replace to ensure exact match for the entered PO
        }));
      }
    } catch (e) {
      console.error("Error in handlePoBlur:", e);
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        inspectType: '100%',
        scope: 'PROJECT',
        projectCode: '',
        projectName: '',
        orderQty: 0,
        deliveryQty: 0,
        unit: 'PCS',
        criteria: [],
        items: [
            { id: `chk_${Date.now()}_1`, category: '', label: 'Kích thước', status: CheckStatus.PENDING, notes: '', images: [] },
            { id: `chk_${Date.now()}_2`, category: '', label: 'Ngoại quan', status: CheckStatus.PENDING, notes: '', images: [] },
            { id: `chk_${Date.now()}_3`, category: '', label: 'Kết cấu', status: CheckStatus.PENDING, notes: '', images: [] }
        ],
        inspectQty: 0,
        passQty: 0,
        failQty: 0,
        images: [],
        type: '100%',
        date: new Date().toISOString().split('T')[0]
    };
    setFormData(prev => ({ ...prev, materials: [...(prev.materials || []), newMaterial] }));
    setExpandedMaterial(newMaterial.id);
  };

  const updateMaterial = (idx: number, field: string, value: any) => {
    if (typeof value === 'string' && ['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty', 'so_luong_ipo'].includes(field)) {
        value = value.replace(/,/g, '.');
    } 
    setFormData(prev => {
        const nextMaterials = [...(prev.materials || [])];
        if (!nextMaterials[idx]) return prev;
        let val = value;
        let mat = { ...nextMaterials[idx], [field]: val };
        if (field === 'category') {
            const btpTpl = templates['SQC_TP'] || [];
            
            // Defaul items
            const defaultItems = [
                { id: `chk_${Date.now()}_1`, category: value, label: 'Kích thước', status: CheckStatus.PENDING, notes: '', images: [] },
                { id: `chk_${Date.now()}_2`, category: value, label: 'Ngoại quan', status: CheckStatus.PENDING, notes: '', images: [] },
                { id: `chk_${Date.now()}_3`, category: value, label: 'Kết cấu', status: CheckStatus.PENDING, notes: '', images: [] }
            ];

            mat.items = btpTpl
                .filter(i => i.category === value)
                .map(i => ({
                    ...i,
                    id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    status: CheckStatus.PENDING,
                    notes: '',
                    images: []
                }));
            
            // Add defaults if they are missing (simplified)
            if (mat.items.length === 0) mat.items = defaultItems;
        }
        if (field === 'inspectQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        else if (field === 'passQty') mat.failQty = Math.max(0, (mat.inspectQty || 0) - (mat.passQty || 0));
        else if (field === 'failQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        nextMaterials[idx] = mat;
        return { ...prev, materials: nextMaterials };
    });
  };

  const updateMaterialItem = (matIdx: number, itemIdx: number, field: keyof CheckItem, value: any) => {
      const nextMaterials = [...(formData.materials || [])];
      if (!nextMaterials[matIdx]) return;
      const matItems = [...(nextMaterials[matIdx].items || [])];
      if (!matItems[itemIdx]) return;
      matItems[itemIdx] = { ...matItems[itemIdx], [field]: value };
      nextMaterials[matIdx].items = matItems;
      setFormData(prev => ({ ...prev, materials: nextMaterials }));
  };

  const handleEditImage = (images: string[], index: number, context: any) => {
      setEditorState({ images, index, context });
  };

  const onImageSave = async (index: number, newImageUrl: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context || {};
      setFormAlert(null);
      setIsProcessingImages(true);
      setImageUploadProgress(0);
      try {
          const res = await fetch(newImageUrl);
          const blob = await res.blob();
          const file = new File([blob], `edited_${Date.now()}.jpg`, { type: 'image/jpeg' });
          const uploadedUrl = await uploadQMSImage(file, {
              entityId: formData.id || 'new',
              ma_ct: formData.ma_ct,
              type: 'INSPECTION',
              role: type || 'MAIN'
          }, undefined, undefined, (percent) => {
              setImageUploadProgress(percent);
          });

          const newImages = [...editorState.images];
          newImages[index] = uploadedUrl;
          setEditorState({ ...editorState, images: newImages });

          if (type === 'DELIVERY') {
              setFormData(prev => ({ ...prev, deliveryNoteImages: newImages }));
          } else if (type === 'REPORT') {
              setFormData(prev => ({ ...prev, reportImages: newImages }));
          } else if (type === 'DRAWING') {
              setFormData(prev => ({ ...prev, drawingImages: newImages }));
          } else if (type === 'MATERIAL' && matIdx !== undefined) {
              setFormData(prev => {
                  const nextMaterials = [...(prev.materials || [])];
                  if (nextMaterials[matIdx]) {
                      nextMaterials[matIdx] = { ...nextMaterials[matIdx], images: newImages };
                  }
                  return { ...prev, materials: nextMaterials };
              });
          } else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
              setFormData(prev => {
                  const nextMaterials = [...(prev.materials || [])];
                  if (nextMaterials[matIdx] && nextMaterials[matIdx].items) {
                      const nextItems = [...(nextMaterials[matIdx].items || [])];
                      if (nextItems[itemIdx]) {
                          nextItems[itemIdx] = { ...nextItems[itemIdx], images: newImages };
                          nextMaterials[matIdx] = { ...nextMaterials[matIdx], items: nextItems };
                      }
                  }
                  return { ...prev, materials: nextMaterials };
              });
          }
      } catch (err: any) {
          setFormAlert({ type: 'error', title: 'Lỗi lưu ảnh chỉnh sửa', message: extractFormErrorMessage(err, 'Không thể tải ảnh chỉnh sửa lên Google Drive.') });
      } finally {
          setIsProcessingImages(false);
          setImageUploadProgress(null);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadContext) return;
    setFormAlert(null);
    setIsProcessingImages(true);
    setImageUploadProgress(0);
    try {
        const result = await uploadQMSImagesBatch(files, {
            entityId: formData.id || 'new',
            ma_ct: formData.ma_ct,
            type: 'INSPECTION',
            role: activeUploadContext.type
        }, (percent) => {
            setImageUploadProgress(percent);
        });

        const { type, matIdx, itemIdx } = activeUploadContext;
        if (result.uploadedUrls.length > 0) {
            if (type === 'DELIVERY') {
                setFormData(prev => ({ ...prev, deliveryNoteImages: [...(prev.deliveryNoteImages || []), ...result.uploadedUrls] }));
            } else if (type === 'REPORT') {
                setFormData(prev => ({ ...prev, reportImages: [...(prev.reportImages || []), ...result.uploadedUrls] }));
            } else if (type === 'DRAWING') {
                setFormData(prev => ({ ...prev, drawingImages: [...(prev.drawingImages || []), ...result.uploadedUrls] }));
            } else if (type === 'MATERIAL' && matIdx !== undefined) {
                setFormData(prev => {
                    const nextMaterials = [...(prev.materials || [])];
                    if (nextMaterials[matIdx]) {
                        nextMaterials[matIdx] = { ...nextMaterials[matIdx], images: [...(nextMaterials[matIdx].images || []), ...result.uploadedUrls] };
                    }
                    return { ...prev, materials: nextMaterials };
                });
            } else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
                setFormData(prev => {
                    const nextMaterials = [...(prev.materials || [])];
                    if (nextMaterials[matIdx] && nextMaterials[matIdx].items) {
                        const nextItems = [...(nextMaterials[matIdx].items || [])];
                        if (nextItems[itemIdx]) {
                            nextItems[itemIdx] = { ...nextItems[itemIdx], images: [...(nextItems[itemIdx].images || []), ...result.uploadedUrls] };
                            nextMaterials[matIdx] = { ...nextMaterials[matIdx], items: nextItems };
                        }
                    }
                    return { ...prev, materials: nextMaterials };
                });
            }
        }

        if (result.failed.length > 0) {
            setFormAlert({
                type: result.uploadedUrls.length > 0 ? 'warning' : 'error',
                title: result.uploadedUrls.length > 0 ? 'Một số ảnh tải lên thất bại' : 'Lỗi tải ảnh lên Google Drive',
                message: result.failed.map(f => `${f.name}: ${f.error}`).join('\n')
            });
        }
    } catch (err: any) {
        console.error("ISO-UPLOAD: Failed", err);
        setFormAlert({ type: 'error', title: 'Lỗi tải ảnh', message: extractFormErrorMessage(err, 'Không thể tải ảnh lên Google Drive.') });
    } finally {
        setIsProcessingImages(false);
        setImageUploadProgress(null);
        e.target.value = '';
    }
  };

  const handleSubmit = async (targetStatus: InspectionStatus = InspectionStatus.SUBMITTED) => {
    setFormAlert(null);
    if (targetStatus === InspectionStatus.SUBMITTED || targetStatus === InspectionStatus.PENDING) {
      if (!formData.po_number || !formData.supplier || !formData.supplierAddress) {
          setFormAlert({ type: 'warning', title: 'Thiếu thông tin', message: 'Vui lòng nhập đầy đủ Mã PO, Đối tác gia công và Địa điểm kiểm tra.' });
          return;
      }
      if (!formData.signature) {
          setFormAlert({ type: 'warning', title: 'Thiếu chữ ký', message: 'QC bắt buộc ký tên xác nhận báo cáo.' });
          return;
      }

      const invalidQtySum = formData.materials?.find(m => (Number(m.passQty || 0) + Number(m.failQty || 0)) !== Number(m.inspectQty || 0));
      if (invalidQtySum) {
          setFormAlert({ type: 'warning', title: 'Sai lệch số lượng', message: `Thành phẩm "${invalidQtySum.name || 'chưa đặt tên'}" có tổng số lượng Đạt và Lỗi phải đúng bằng Số lượng kiểm tra.` });
          return;
      }
    } else {
      if (!formData.po_number) {
          setFormAlert({ type: 'warning', title: 'Thiếu mã PO', message: 'Vui lòng nhập mã lệnh sản xuất / PO để lưu nháp.' });
          return;
      }
    }

    setIsSaving(true);
    setUploadProgress(0);
    try {
        const totalInspected = (formData.materials || []).reduce((acc: number, mat: any) => acc + (Number(mat.inspectQty) || 0), 0);
        const totalPassed = (formData.materials || []).reduce((acc: number, mat: any) => acc + (Number(mat.passQty) || 0), 0);
        const totalFailed = (formData.materials || []).reduce((acc: number, mat: any) => acc + (Number(mat.failQty) || 0), 0);

        const workingDraft: any = {
            ...JSON.parse(JSON.stringify(formData)),
            booking_id: formData.booking_id,
            booking_code: formData.booking_code,
            status: targetStatus,
            inspectedQuantity: totalInspected,
            passedQuantity: totalPassed,
            failedQuantity: totalFailed,
            splitRequired: targetStatus !== InspectionStatus.DRAFT && (formData.id || '').split('-').length <= 3,
            updatedAt: new Date().toISOString()
        };

        const preparedInspection = await preprocessInspectionPayloadForStorage(workingDraft, (pct) => {
            setUploadProgress(pct);
        });
        setFormData(preparedInspection);

        await onSave(preparedInspection);
        clearDraft();
    } catch (e: any) {
        console.error("ISO-SAVE-TP:", e);
        if (e?.partialPayload) {
            setFormData(e.partialPayload);
        }
        setFormAlert({
            type: 'error',
            title: 'Lỗi lưu báo cáo SQC-TP',
            message: extractFormErrorMessage(e)
        });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {hasDraft && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md animate-in slide-in-from-top-4 duration-500">
              <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md border border-blue-200 dark:border-slate-700 p-3 rounded-2xl shadow-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                      <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">Phát hiện bản nháp</span>
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold">Dữ liệu SQC BTP bạn đang nhập chưa được lưu.</span>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button type="button" onClick={clearDraft} className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest hover:text-red-500 rounded-xl">Xóa</button>
                      <button type="button" onClick={recoverDraft} className="min-h-[44px] lg:min-h-[34px] px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-blue-200 dark:shadow-none active:scale-95 transition-all">Khôi phục</button>
                  </div>
              </div>
          </div>
      )}
      {(isProcessingImages || isLookupLoading || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-5 w-[80%] max-w-sm border border-white/20">
                  <div className="relative flex items-center justify-center">
                      <Loader2 className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin opacity-20" />
                      {isSaving ? (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono tracking-tighter">{uploadProgress}%</span>
                          </div>
                      ) : isProcessingImages && imageUploadProgress !== null ? (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono tracking-tighter">{imageUploadProgress}%</span>
                          </div>
                      ) : (
                          <Loader2 className="absolute w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                      )}
                  </div>
                  
                  <div className="w-full space-y-2">
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest text-center">
                        {isLookupLoading ? "Đang truy xuất dữ liệu..." : isSaving ? "Đang tải dữ liệu & ảnh lên server..." : isProcessingImages ? "Đang tải ảnh..." : "Đang xử lý hình ảnh..."}
                    </p>
                    
                    {isSaving && (
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div 
                                className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    )}
                    {isProcessingImages && imageUploadProgress !== null && (
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div 
                                className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out" 
                                style={{ width: `${imageUploadProgress}%` }}
                            />
                        </div>
                    )}
                  </div>
              </div>
          </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        <FormAlertBanner alert={formAlert} onClose={() => setFormAlert(null)} />
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-teal-50 dark:border-slate-800 pb-2 mb-1">
                <h3 className="text-teal-800 dark:text-teal-400 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4 shrink-0"/> I. THÔNG TIN GIA CÔNG BÁN THÀNH PHẨM</h3>
                <button type="button" onClick={() => setShowHistory(true)} className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 text-slate-600 dark:text-slate-300 rounded-lg font-bold uppercase text-[10px] flex items-center gap-1.5 tabular-nums"><History className="w-3.5 h-3.5" /> Lịch sử ({historicalRecords.length})</button>
            </div>
            <BookingSelectorField
                bookingId={formData.booking_id}
                bookingCode={formData.booking_code}
                sqcType="SQC_TP"
                onSelectBooking={handleSelectBooking}
                onClearBooking={handleClearBooking}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 ml-1">Lệnh Sản Xuất / PO Gia Công *</label>
                    <div className="relative flex items-center">
                        <input 
                            value={formData.po_number} 
                            onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} 
                            onBlur={handlePoBlur}
                            className="w-full pl-3 pr-12 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[38px] shadow-inner" 
                            placeholder="Mã LSX..."
                        />
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-teal-600 rounded-lg" type="button" aria-label="Quét QR"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 ml-1">Đối Tác Gia Công BTP *</label>
                    <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[38px] uppercase shadow-inner" placeholder="Tên đơn vị..."/>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 ml-1">Địa chỉ xưởng *</label>
                    <div className="flex gap-1.5 items-center">
                        <input value={formData.supplierAddress || ''} onChange={e => handleInputChange('supplierAddress', e.target.value)} className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[38px] shadow-inner" placeholder="Địa chỉ..."/>
                        <button type="button" onClick={handleGetLocation} disabled={isGettingLocation} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:text-teal-600 shrink-0" aria-label="Lấy vị trí GPS"><Locate className="w-4 h-4" /></button>
                        {formData.location && (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${formData.location}`} target="_blank" rel="noopener noreferrer" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-teal-600 shrink-0" aria-label="Xem bản đồ">
                                <MapPin className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                </div>
                {/* 1. Supporting Docs */}
                <div className="md:col-span-2 space-y-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5"/> DANH MỤC TÀI LIỆU HỖ TRỢ</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {['Bản vẽ có chữ ký', 'Spec', 'Chứng nhận nguyên liệu', 'Rập cỡ có chữ ký', 'Mẫu màu', 'Phiếu thông tin BTP'].map(doc => (
                           <label key={doc} className="min-h-[44px] lg:min-h-[38px] flex items-center gap-2.5 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"><input type="checkbox" className="w-5 h-5 lg:w-4 lg:h-4 rounded accent-teal-600 shrink-0"/> <span>{doc}</span></label>
                        ))}
                    </div>
                    <BookingReferenceDocsCard
                        bookingCode={formData.booking_code}
                        supportingDocs={formData.supportingDocs}
                        referenceDocs={formData.referenceDocs}
                    />
                </div>

                {/* Evidence Row */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700">
                        <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase flex items-center justify-between gap-2"><span>PHIẾU GIAO HÀNG</span><div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:text-blue-600" type="button" aria-label="Chụp phiếu giao hàng"><Camera className="w-4 h-4"/></button><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:text-blue-600" type="button" aria-label="Chọn ảnh phiếu giao hàng"><ImageIcon className="w-4 h-4"/></button></div></div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[48px] pt-1.5 pr-1.5">
                            {formData.deliveryNoteImages?.map((img, i) => (
                                <div key={i} className="relative group shrink-0">
                                    <button type="button" className="cursor-zoom-in block rounded overflow-hidden" onClick={() => setEditorState({ images: formData.deliveryNoteImages!, index: i, context: { type: 'DELIVERY' } })}>
                                        <ProxyImage src={img} alt="Phiếu giao hàng" className="w-12 h-12 rounded border border-slate-200 dark:border-slate-700 object-cover shadow-sm" />
                                    </button>
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, deliveryNoteImages: prev.deliveryNoteImages?.filter((_, idx) => idx !== i) }))}
                                        className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm"
                                        type="button"
                                        aria-label="Xóa ảnh"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700">
                        <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase flex items-center justify-between gap-2"><span>BÁO CÁO NCC</span><div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:text-emerald-600" type="button" aria-label="Chụp báo cáo NCC"><Camera className="w-4 h-4"/></button><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:text-emerald-600" type="button" aria-label="Chọn ảnh báo cáo NCC"><ImageIcon className="w-4 h-4"/></button></div></div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[48px] pt-1.5 pr-1.5">
                            {formData.reportImages?.map((img, i) => (
                                <div key={i} className="relative group shrink-0">
                                    <button type="button" className="cursor-zoom-in block rounded overflow-hidden" onClick={() => setEditorState({ images: formData.reportImages!, index: i, context: { type: 'REPORT' } })}>
                                        <ProxyImage src={img} alt="Báo cáo NCC" className="w-12 h-12 rounded border border-slate-200 dark:border-slate-700 object-cover shadow-sm" />
                                    </button>
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, reportImages: prev.reportImages?.filter((_, idx) => idx !== i) }))}
                                        className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm"
                                        type="button"
                                        aria-label="Xóa ảnh"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 space-y-1.5 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase flex items-center justify-between gap-2"><span>Tải lên Bản vẽ / PO / Chất lượng</span>
                        <div className="flex gap-1">
                            <button onClick={() => { setActiveUploadContext({ type: 'DRAWING' }); cameraInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:text-indigo-600" type="button" aria-label="Chụp bản vẽ"><Camera className="w-4 h-4"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'DRAWING' }); fileInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:text-indigo-600" type="button" aria-label="Chọn ảnh bản vẽ"><ImageIcon className="w-4 h-4"/></button>
                        </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[48px] pt-1.5 pr-1.5">
                        {formData.drawingImages?.map((img, i) => (
                            <div key={i} className="relative group shrink-0">
                                <button type="button" className="cursor-zoom-in block rounded overflow-hidden" onClick={() => setEditorState({ images: formData.drawingImages!, index: i, context: { type: 'DRAWING' } })}>
                                    <ProxyImage src={img} alt="Bản vẽ" className="w-12 h-12 rounded border border-slate-200 dark:border-slate-700 object-cover" />
                                </button>
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, drawingImages: prev.drawingImages?.filter((_, idx) => idx !== i) }))}
                                    className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm"
                                    type="button"
                                    aria-label="Xóa ảnh"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
        <section className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
                <h3 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 text-xs">
                    <ClipboardList className="w-4 h-4 text-teal-600"/> II. DANH MỤC BTP KIỂM TRA ({formData.materials?.length || 0})
                </h3>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <div className="relative flex-1 sm:flex-initial">
                        <input 
                            type="text" 
                            placeholder="Tìm vật tư..." 
                            value={matSearchInput}
                            onChange={e => setMatSearchInput(e.target.value)}
                            onBlur={handleCommitMatSearch}
                            onKeyDown={handleKeyDownMatSearch}
                            className="pl-9 pr-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg text-xs w-full sm:w-52 min-h-[44px] lg:min-h-[36px] outline-none focus:ring-1 ring-teal-100 shadow-sm"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    </div>
                    {(!initialData?.id || initialData.id.split('-').length <= 3) && <button onClick={handleAddMaterial} className="min-h-[44px] lg:min-h-[36px] bg-teal-600 text-white py-2 px-3.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 shrink-0" type="button">
                        <Plus className="w-4 h-4"/><span className="text-[11px] font-bold uppercase">Thêm Thành Phẩm</span>
                    </button>}
                </div>
            </div>
            
            <div className="space-y-3">
                {filteredMaterials.map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const failRate = mat.inspectQty > 0 ? ((mat.failQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const hasError = mat.failQty > 0;
                    return (
                    <div key={mat.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className={`p-3 min-h-[56px] flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-teal-50/50 dark:bg-teal-900/20 border-b border-teal-100 dark:border-slate-700' : 'bg-white dark:bg-slate-900'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums ${isExp ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{matIdx + 1}</div><div className="flex-1 overflow-hidden"><h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase text-xs truncate">{mat.category || 'BÁN THÀNH PHẨM MỚI'}</h4><div className="flex flex-wrap items-center gap-1.5 mt-0.5"><span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 tabular-nums">SL: {mat.deliveryQty} {mat.unit}</span><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded tabular-nums ${hasError ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' : 'text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-900/20'}`}>{passRate}% ĐẠT</span></div></div></div>
                            <div className="flex items-center gap-1.5"><button onClick={(e) => { e.stopPropagation(); setDeleteMatIdx(matIdx); }} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 rounded-lg" type="button" aria-label="Xóa bán thành phẩm"><Trash2 className="w-4 h-4"/></button>{isExp ? <ChevronUp className="w-5 h-5 text-teal-500 shrink-0"/> : <ChevronDown className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0"/>}</div>
                        </div>
                        {isExp && (
                            <div className="p-3 sm:p-4 space-y-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                                <div className="grid grid-cols-12 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                      <div className="col-span-12 sm:col-span-6 md:col-span-3 space-y-1">
                                         <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Mã Định Danh *</label>
                                         <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[36px] shadow-inner uppercase" placeholder="Mã định danh..."/>
                                      </div>
                                      <div className="col-span-12 sm:col-span-6 md:col-span-3 space-y-1">
                                         <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Mã Dự Án</label>
                                         <input value={mat.projectCode || ''} onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[36px] shadow-inner uppercase" placeholder="Mã dự án..."/>
                                      </div>
                                      <div className="col-span-12 sm:col-span-6 md:col-span-3 space-y-1">
                                         <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Tên Dự Án</label>
                                         <input value={mat.projectName || ''} onChange={e => updateMaterial(matIdx, 'projectName', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[36px] shadow-inner" placeholder="Tên dự án..."/>
                                      </div>
                                      <div className="col-span-12 sm:col-span-6 md:col-span-3 space-y-1">
                                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Công đoạn</label>
                                          <Combobox
                                              value={mat.category || null}
                                              onChange={val => {
                                                  const stageVal = val || '';
                                                  updateMaterial(matIdx, 'category', stageVal);
                                                  const btpTpl = templates['SQC_TP'] || [];
                                                  const defaultItems = [
                                                      { id: `chk_${Date.now()}_1`, category: stageVal, label: 'Kích thước', status: CheckStatus.PENDING, notes: '', images: [] },
                                                      { id: `chk_${Date.now()}_2`, category: stageVal, label: 'Ngoại quan', status: CheckStatus.PENDING, notes: '', images: [] },
                                                      { id: `chk_${Date.now()}_3`, category: stageVal, label: 'Kết cấu', status: CheckStatus.PENDING, notes: '', images: [] }
                                                  ];
                                                  const items = btpTpl.filter(i => i.stage === stageVal).map(i => ({...i, id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: CheckStatus.PENDING, notes: '', images: []}));
                                                  updateMaterial(matIdx, 'items', items.length > 0 ? items : defaultItems);
                                              }}
                                              placeholder="-- Chọn --"
                                              ariaLabel="Công đoạn"
                                              options={availableCategories.map(c => ({ value: c, label: c }))}
                                          />
                                      </div>
                                      <div className="col-span-6 sm:col-span-4 md:col-span-2 space-y-1">
                                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">ĐVT</label>
                                          <input value={mat.unit || ''} onChange={e => updateMaterial(matIdx, 'unit', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[36px] shadow-inner uppercase" placeholder="DVT..."/>
                                      </div>
                                      <div className="col-span-6 sm:col-span-4 md:col-span-3 space-y-1">
                                         <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">QC Kiểm Tra</label>
                                         <input value={user.name} disabled className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[36px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"/>
                                      </div>
                                      <div className="col-span-12 sm:col-span-4 md:col-span-3 space-y-1">
                                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Ngày Kiểm Tra</label>
                                          <input type="date" value={mat.date} onChange={e => updateMaterial(matIdx, 'date', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[36px] shadow-inner tabular-nums"/>
                                      </div>
                                 </div>
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block text-center">Giao (DN)</label><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', e.target.value)} className="w-full px-2 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-center text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 text-xs min-h-[44px] lg:min-h-[36px] shadow-sm tabular-nums"/></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase block text-center">Kiểm tra</label><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', e.target.value)} className="w-full px-2 py-2 border border-teal-300 dark:border-teal-700 rounded-lg font-bold text-center text-teal-700 dark:text-teal-400 bg-white dark:bg-slate-900 text-xs min-h-[44px] lg:min-h-[36px] shadow-sm tabular-nums"/></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-green-600 dark:text-green-500 uppercase flex items-center justify-between"><span>Đạt</span><span className="text-[9px] bg-green-100 dark:bg-green-900/30 px-1.5 rounded tabular-nums">{passRate}%</span></label><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', e.target.value)} className="w-full px-2 py-2 border border-green-300 dark:border-green-700 rounded-lg font-bold text-center text-green-700 dark:text-green-400 bg-white dark:bg-slate-900 text-xs min-h-[44px] lg:min-h-[36px] shadow-sm tabular-nums"/></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase flex items-center justify-between"><span>Lỗi</span><span className="text-[9px] bg-red-100 dark:bg-red-900/30 px-1.5 rounded tabular-nums">{failRate}%</span></label><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', e.target.value)} className="w-full px-2 py-2 border border-red-300 dark:border-red-700 rounded-lg font-bold text-center text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 text-xs min-h-[44px] lg:min-h-[36px] shadow-sm tabular-nums"/></div>
                                 </div>
                                 <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                                    <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase flex items-center justify-between">
                                        <span>DANH MỤC HẠNG MỤC KIỂM TRA</span>
                                        <button 
                                            onClick={() => {
                                                const newItems = [...(mat.items || []), 
                                                    { 
                                                        id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                                        category: mat.category || '',
                                                        label: 'Kích thước',
                                                        status: CheckStatus.PENDING,
                                                        notes: '',
                                                        images: []
                                                    },
                                                    { 
                                                        id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                                        category: mat.category || '',
                                                        label: 'Ngoại quan',
                                                        status: CheckStatus.PENDING,
                                                        notes: '',
                                                        images: []
                                                    },
                                                    { 
                                                        id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                                        category: mat.category || '',
                                                        label: 'Kết cấu',
                                                        status: CheckStatus.PENDING,
                                                        notes: '',
                                                        images: []
                                                    }
                                                ];
                                                
                                                const nextMats = [...(formData.materials || [])];
                                                nextMats[matIdx] = { ...nextMats[matIdx], items: newItems };
                                                setFormData(prev => ({ ...prev, materials: nextMats }));
                                            }}
                                            className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center hover:text-indigo-800 text-indigo-600 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg"
                                            type="button"
                                            aria-label="Thêm hạng mục kiểm tra"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {(mat.items || []).map((item, itemIdx) => (
                                            <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-xl p-3 border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                                                <div className="flex justify-between items-center mb-2 border-b border-slate-100 dark:border-slate-800 pb-2 gap-2">
                                                    <div className="flex-1">
                                                        <input 
                                                            value={item.label || ''} 
                                                            onChange={e => updateMaterialItem(matIdx, itemIdx, 'label', e.target.value)}
                                                            className="w-full min-h-[44px] lg:min-h-[34px] font-bold bg-transparent outline-none text-slate-800 dark:text-slate-200 uppercase text-xs" 
                                                            placeholder="Tên hạng mục..." 
                                                        />
                                                    </div>
                                                    <button 
                                                        onClick={() => {
                                                            const nextMats = [...(formData.materials || [])];
                                                            nextMats[matIdx].items = (nextMats[matIdx].items || []).filter((_, i) => i !== itemIdx);
                                                            setFormData(prev => ({ ...prev, materials: nextMats }));
                                                        }}
                                                        className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center text-slate-400 hover:text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                        type="button"
                                                        aria-label="Xóa hạng mục"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <textarea 
                                                        value={item.notes || ''}
                                                        onChange={e => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)}
                                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 ring-teal-100"
                                                        placeholder="Ghi chú..."
                                                        rows={2}
                                                    />
                                                    
                                                    <div className="flex flex-wrap gap-2 items-center justify-between">
                                                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg gap-1 border border-slate-200 dark:border-slate-700 w-fit">
                                                            {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                                                <button key={st} onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)} className={`min-h-[44px] lg:min-h-[34px] px-3 py-1.5 rounded-md font-bold uppercase transition-all text-[10px] ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white' : st === CheckStatus.FAIL ? 'bg-red-600 text-white' : 'bg-orange-500 text-white') : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'}`} type="button">{st === CheckStatus.PASS ? 'Đạt' : st === CheckStatus.FAIL ? 'Hỏng' : 'ĐK'}</button>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600" type="button" aria-label="Chụp ảnh"><Camera className="w-4 h-4"/></button>
                                                            <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600" type="button" aria-label="Chọn ảnh"><ImageIcon className="w-4 h-4"/></button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[36px] pt-1.5 pr-1.5">
                                                        {(item.images || []).map((img, i) => (
                                                            <div key={i} className="relative group shrink-0">
                                                                <button type="button" className="cursor-zoom-in block rounded overflow-hidden" onClick={() => setEditorState({ images: item.images || [], index: i, context: { type: 'ITEM', matIdx, itemIdx } })}>
                                                                    <ProxyImage src={img} alt="Ảnh item" className="w-12 h-12 rounded border border-slate-200 dark:border-slate-700 object-cover shadow-sm" />
                                                                </button>
                                                                <button type="button" onClick={() => {
                                                                    const nextMats = [...(formData.materials || [])];
                                                                    const nextItems = [...(nextMats[matIdx].items || [])];
                                                                    nextItems[itemIdx].images = nextItems[itemIdx].images?.filter((_, idx) => idx !== i);
                                                                    nextMats[matIdx].items = nextItems;
                                                                    setFormData(prev => ({ ...prev, materials: nextMats }));
                                                                }} className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm" aria-label="Xóa ảnh"><X className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                 </div>
                             </div>
                        )}
                    </div>
                );
              })}
            </div>
        </section>
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-3">
           <h3 className="text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><AlertOctagon className="w-4 h-4 text-amber-500"/> III. GHI CHÚ</h3>
           <textarea
               value={formData.summary || ''}
               onChange={e => handleInputChange('summary', e.target.value)}
               placeholder="Nhập ghi chú tổng hợp (nếu có)..."
               className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-1 focus:ring-teal-500 outline-none shadow-sm min-h-[80px]"
           />
        </section>
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-3">
          <h3 className="text-teal-800 border-b border-teal-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3>
          <SignaturePad 
            label={`QC Ký Tên (${user.name})`} 
            value={formData.signature} 
            onChange={sig => setFormData({...formData, signature: sig})} 
            uploadContext={{ entityId: formData.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_QC' }}
          />
        </section>
      </div>
      <div className="px-4 py-3 lg:pr-24 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"><button onClick={onCancel} className="min-h-[44px] lg:min-h-[40px] px-4 sm:px-6 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]" type="button">HỦY BỎ</button><button onClick={() => handleSubmit(InspectionStatus.DRAFT)} disabled={isSaving} className="min-h-[44px] lg:min-h-[40px] px-4 sm:px-6 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-slate-800 font-bold uppercase tracking-widest rounded-xl shadow-sm text-[11px] whitespace-nowrap" type="button">LƯU NHÁP</button><button onClick={() => handleSubmit(InspectionStatus.SUBMITTED)} disabled={isSaving} className="min-h-[44px] lg:min-h-[40px] flex-1 bg-teal-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-teal-800 flex items-center justify-center gap-2 disabled:opacity-50 text-[11px]" type="button">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}<span>GỬI DUYỆT SQC-TP</span></button></div>
      <ConfirmDialog
        open={deleteMatIdx !== null}
        variant="danger"
        title="Xóa thành phẩm"
        message="Bạn có chắc chắn muốn xóa mục kiểm tra này?"
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        onConfirm={() => {
          if (deleteMatIdx !== null) {
            setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== deleteMatIdx) }));
          }
          setDeleteMatIdx(null);
        }}
        onCancel={() => setDeleteMatIdx(null)}
      />
      <ConfirmDialog
        open={pendingBookingPrefill !== null}
        variant="info"
        title="Cập nhật hạng mục từ Book QC?"
        message="Phiếu hiện đã có danh sách thành phẩm. Bạn có muốn thay thế danh mục theo lịch Book QC vừa chọn không?"
        confirmLabel="Thay thế danh mục"
        cancelLabel="Giữ danh mục hiện tại"
        onConfirm={() => {
          if (pendingBookingPrefill) {
            applyBookingPrefill(pendingBookingPrefill, true);
          }
          setPendingBookingPrefill(null);
        }}
        onCancel={() => setPendingBookingPrefill(null)}
      />
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
