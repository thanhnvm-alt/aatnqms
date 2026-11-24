import React, { useRef, useState } from 'react';
import {
  BookingAttachmentItem,
  BookingDocumentCategory,
  SubcontractorBookingDocuments,
} from '../types.js';
import {
  BOOKING_DOCUMENT_GROUPS,
  BookingDocumentGroupConfig,
  flattenBookingDocumentsForReview,
  formatFileSize,
  getAttachmentActionUrl,
  getFileExtBadge,
  isGoogleDriveUrl,
  isImageAttachment,
  isValidAttachmentUrl,
  normalizeBookingDocuments,
} from '../src/utils/bookingDocuments.js';
import { uploadFileToStorage } from '../services/apiService.js';
import { ProxyImage } from '../src/components/ProxyImage.js';
import { BookingAttachmentReviewModal } from './BookingAttachmentReviewModal';
import {
  AlertCircle,
  Camera,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface BookingDocumentsUploaderProps {
  value: SubcontractorBookingDocuments;
  onChange: (next: SubcontractorBookingDocuments) => void;
  bookingId?: string;
  currentUserName?: string;
  onUploadingChange?: (isUploading: boolean) => void;
  onOpenAttachmentReview?: (item: BookingAttachmentItem) => void;
}

const GROUP_ICONS: Record<BookingDocumentCategory, React.ComponentType<{ className?: string }>> = {
  PR_PO: FileSpreadsheet,
  QUALITY_AGREEMENT: FileCheck2,
  SAMPLE_IMAGE: ImageIcon,
  SPEC_DRAWING: FileText,
};

export const BookingDocumentsUploader: React.FC<BookingDocumentsUploaderProps> = ({
  value,
  onChange,
  bookingId,
  currentUserName,
  onUploadingChange,
  onOpenAttachmentReview,
}) => {
  const normalized = normalizeBookingDocuments(value);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [uploadingGroup, setUploadingGroup] = useState<BookingDocumentCategory | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [linkComposerGroup, setLinkComposerGroup] = useState<BookingDocumentCategory | null>(null);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkNameInput, setLinkNameInput] = useState('');
  const [groupError, setGroupError] = useState<{ category: BookingDocumentCategory; message: string } | null>(null);
  const [localReviewTarget, setLocalReviewTarget] = useState<{ id?: string; url?: string } | null>(null);

  const handleOpenItemReview = (item: BookingAttachmentItem) => {
    if (onOpenAttachmentReview) {
      onOpenAttachmentReview(item);
    } else {
      setLocalReviewTarget({ id: item.id, url: item.url });
    }
  };

  const setUploadingState = (cat: BookingDocumentCategory | null) => {
    setUploadingGroup(cat);
    onUploadingChange?.(cat !== null);
  };

  const updateGroupItems = (
    group: BookingDocumentGroupConfig,
    updater: (prev: BookingAttachmentItem[]) => BookingAttachmentItem[]
  ) => {
    const nextNorm = {
      ...normalized,
      [group.field]: updater(normalized[group.field]),
    };
    onChange({
      ...value,
      ...nextNorm,
    });
  };

  const handleFileSelect = async (
    group: BookingDocumentGroupConfig,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    setGroupError(null);
    setUploadingState(group.key);
    setUploadProgress(10);

    const addedItems: BookingAttachmentItem[] = [];
    const fileArr = Array.from(files);

    try {
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        if (file.size > 25 * 1024 * 1024) {
          throw new Error(`Tệp "${file.name}" vượt quá giới hạn tối đa 25MB.`);
        }
        const uploadedUrl = await uploadFileToStorage(file, file.name, {
          entityType: 'SUBCONTRACTOR_BOOKING',
          entityId: bookingId || 'new',
          role: group.key,
        });
        addedItems.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          url: uploadedUrl,
          category: group.key,
          sourceType: 'UPLOAD',
          mimeType: file.type || undefined,
          size: file.size,
          uploadedAt: Math.floor(Date.now() / 1000),
          uploadedBy: currentUserName,
        });
        setUploadProgress(Math.round(((i + 1) / fileArr.length) * 100));
      }

      if (addedItems.length > 0) {
        updateGroupItems(group, (prev) => [...prev, ...addedItems]);
      }
    } catch (err: any) {
      setGroupError({
        category: group.key,
        message: err?.message || 'Không thể tải tệp lên. Vui lòng thử lại.',
      });
    } finally {
      setUploadingState(null);
      setUploadProgress(0);
    }
  };

  const handleAddLink = (group: BookingDocumentGroupConfig) => {
    const cleanUrl = linkUrlInput.trim();
    if (!isValidAttachmentUrl(cleanUrl)) {
      setGroupError({
        category: group.key,
        message: 'Đường dẫn không hợp lệ. Vui lòng nhập URL bắt đầu bằng https:// hoặc http://.',
      });
      return;
    }

    const fallbackName = isGoogleDriveUrl(cleanUrl)
      ? `${group.shortTitle} (Google Drive)`
      : `${group.shortTitle} (Liên kết ERP/Web)`;
    const itemName = linkNameInput.trim() || fallbackName;

    const newItem: BookingAttachmentItem = {
      id: `lnk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: itemName,
      url: cleanUrl,
      category: group.key,
      sourceType: 'LINK',
      uploadedAt: Math.floor(Date.now() / 1000),
      uploadedBy: currentUserName,
    };

    updateGroupItems(group, (prev) => [...prev, newItem]);
    setLinkUrlInput('');
    setLinkNameInput('');
    setLinkComposerGroup(null);
    setGroupError(null);
  };

  const handleRemoveItem = (group: BookingDocumentGroupConfig, itemId: string) => {
    updateGroupItems(group, (prev) => prev.filter((item) => item.id !== itemId));
  };

  const totalCount =
    normalized.prPoFiles.length +
    normalized.qualityAgreementFiles.length +
    normalized.sampleImages.length +
    normalized.specDrawings.length;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase flex items-center gap-1.5">
            <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Hồ sơ & Tài liệu đính kèm (Tùy chọn)</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Tải lên nhiều tệp/ảnh (tối đa 25MB/tệp) hoặc dán đường dẫn Google Drive / ERP theo từng nhóm.
          </p>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-mono tabular-nums shrink-0">
          {totalCount} tài liệu
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {BOOKING_DOCUMENT_GROUPS.map((group) => {
          const items = normalized[group.field];
          const Icon = GROUP_ICONS[group.key];
          const isUploading = uploadingGroup === group.key;
          const isLinkOpen = linkComposerGroup === group.key;
          const errForGroup = groupError?.category === group.key ? groupError.message : null;

          return (
            <div
              key={group.key}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-col justify-between gap-2.5"
            >
              <div className="space-y-2">
                {/* Group Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug">
                        {group.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                        {group.description}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums shrink-0 ${
                      items.length > 0
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[group.key] = el;
                    }}
                    type="file"
                    multiple
                    accept={group.accept}
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelect(group, e.target.files);
                      e.target.value = '';
                    }}
                  />
                  {group.allowCamera && (
                    <input
                      ref={(el) => {
                        cameraInputRefs.current[group.key] = el;
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        handleFileSelect(group, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  )}

                  <button
                    type="button"
                    disabled={uploadingGroup !== null}
                    onClick={() => fileInputRefs.current[group.key]?.click()}
                    className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang tải ({uploadProgress}%)</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Tải tệp / Ảnh</span>
                      </>
                    )}
                  </button>

                  {group.allowCamera && (
                    <button
                      type="button"
                      disabled={uploadingGroup !== null}
                      onClick={() => cameraInputRefs.current[group.key]?.click()}
                      className="min-h-[44px] lg:min-h-[34px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      aria-label={`Chụp ảnh ${group.shortTitle}`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="sm:hidden lg:inline">Chụp</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setGroupError(null);
                      if (isLinkOpen) {
                        setLinkComposerGroup(null);
                      } else {
                        setLinkComposerGroup(group.key);
                        setLinkUrlInput('');
                        setLinkNameInput('');
                      }
                    }}
                    className={`min-h-[44px] lg:min-h-[34px] px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isLinkOpen
                        ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                        : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Dán Link Drive / ERP</span>
                  </button>
                </div>

                {/* Inline Link Paster */}
                {isLinkOpen && (
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                    <input
                      type="url"
                      value={linkUrlInput}
                      onChange={(e) => setLinkUrlInput(e.target.value)}
                      placeholder="https://drive.google.com/... hoặc đường dẫn ERP"
                      className="w-full min-h-[44px] lg:min-h-[36px] px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex flex-col sm:flex-row gap-1.5">
                      <input
                        type="text"
                        value={linkNameInput}
                        onChange={(e) => setLinkNameInput(e.target.value)}
                        placeholder="Tên tài liệu hiển thị (tùy chọn)..."
                        className="flex-1 min-h-[44px] lg:min-h-[36px] px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAddLink(group)}
                          className="flex-1 sm:flex-initial min-h-[44px] lg:min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm
                        </button>
                        <button
                          type="button"
                          onClick={() => setLinkComposerGroup(null)}
                          className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center cursor-pointer"
                          aria-label="Hủy thêm link"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {errForGroup && (
                  <div className="flex items-start gap-1.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{errForGroup}</span>
                  </div>
                )}
              </div>

              {/* Attached Items List */}
              {items.length > 0 ? (
                <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {items.map((item) => {
                    const isImg = isImageAttachment(item);
                    const extBadge = getFileExtBadge(item);
                    const openHref = getAttachmentActionUrl(item.url);
                    const sizeStr = formatFileSize(item.size);

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isImg ? (
                            <button
                              type="button"
                              onClick={() => handleOpenItemReview(item)}
                              className="shrink-0 cursor-zoom-in rounded-md overflow-hidden border border-slate-200 dark:border-slate-700"
                              title={`Review tài liệu: ${item.name}`}
                            >
                              <ProxyImage
                                src={openHref}
                                alt={item.name}
                                className="w-10 h-10 object-cover rounded-md"
                                allowDirectOpen={false}
                              />
                            </button>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold shrink-0">
                              {extBadge}
                            </span>
                          )}

                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleOpenItemReview(item)}
                              className="block w-full text-left text-xs font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate cursor-pointer"
                              title={`Review tài liệu: ${item.name}`}
                            >
                              {item.name}
                            </button>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums flex items-center gap-1.5">
                              <span>{item.sourceType === 'LINK' ? (isGoogleDriveUrl(item.url) ? 'Google Drive' : 'Liên kết') : 'Tệp tải lên'}</span>
                              {sizeStr && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{sizeStr}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenItemReview(item)}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                            aria-label={`Review ${item.name}`}
                            title="Review tài liệu"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(group, item.id)}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            aria-label={`Xóa ${item.name}`}
                            title="Xóa tài liệu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] italic text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {group.emptyText}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Standalone fallback Attachment Review Modal when used outside suspended parent */}
      {localReviewTarget && (
        <BookingAttachmentReviewModal
          open={true}
          items={flattenBookingDocumentsForReview(value)}
          initialItemId={localReviewTarget.id}
          initialItemUrl={localReviewTarget.url}
          titleContext="Tài liệu đính kèm Book QC"
          onClose={() => setLocalReviewTarget(null)}
        />
      )}
    </div>
  );
};
