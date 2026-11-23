import React, { useMemo, useState } from 'react';
import { BookingDocumentCategory } from '../types.js';
import {
  getAttachmentActionUrl,
  getFileExtBadge,
  isGoogleDriveUrl,
  isImageAttachment,
} from '../src/utils/bookingDocuments.js';
import { ProxyImage } from '../src/components/ProxyImage.js';
import {
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
  X,
} from 'lucide-react';

interface DocEntryInput {
  id?: string;
  name?: string;
  title?: string;
  url?: string;
  category?: BookingDocumentCategory;
  sourceType?: 'UPLOAD' | 'LINK';
  mimeType?: string;
  verified?: boolean;
}

interface BookingReferenceDocsCardProps {
  bookingCode?: string;
  supportingDocs?: DocEntryInput[];
  referenceDocs?: DocEntryInput[];
}

const CATEGORY_META: Record<
  BookingDocumentCategory,
  { label: string; badgeClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  PR_PO: {
    label: 'PR / PO',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
    Icon: FileSpreadsheet,
  },
  QUALITY_AGREEMENT: {
    label: 'Biên bản CL / Book QC',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    Icon: FileCheck2,
  },
  SAMPLE_IMAGE: {
    label: 'Ảnh mẫu / SP NCC',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Icon: ImageIcon,
  },
  SPEC_DRAWING: {
    label: 'Spec / Bản vẽ',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
    Icon: FileText,
  },
};

export const BookingReferenceDocsCard: React.FC<BookingReferenceDocsCardProps> = ({
  bookingCode,
  supportingDocs,
  referenceDocs,
}) => {
  const [previewImg, setPreviewImg] = useState<{ url: string; name: string } | null>(null);

  const items = useMemo(() => {
    const merged: Array<{
      key: string;
      name: string;
      url: string;
      category?: BookingDocumentCategory;
      sourceType?: 'UPLOAD' | 'LINK';
      mimeType?: string;
    }> = [];
    const seen = new Set<string>();

    const ingest = (list?: DocEntryInput[]) => {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const rawUrl = String(entry?.url || '').trim();
        if (!rawUrl || rawUrl === '#') continue;
        const cleanKey = rawUrl.split('?')[0].toLowerCase();
        if (seen.has(cleanKey)) continue;
        seen.add(cleanKey);
        merged.push({
          key: entry.id || `${cleanKey}_${i}`,
          name: String(entry.title || entry.name || 'Tài liệu đính kèm').trim(),
          url: rawUrl,
          category: entry.category,
          sourceType: entry.sourceType,
          mimeType: entry.mimeType,
        });
      }
    };

    ingest(referenceDocs);
    ingest(supportingDocs);
    return merged;
  }, [supportingDocs, referenceDocs]);

  if (items.length === 0) return null;

  return (
    <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/70 rounded-xl p-3 sm:p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
          <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Tài liệu đính kèm từ Booking QC{bookingCode ? ` (${bookingCode})` : ''}
          </span>
        </div>
        <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-[11px] font-mono font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
          {items.length} tệp / link
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => {
          const openHref = getAttachmentActionUrl(item.url);
          const isImg = isImageAttachment(item);
          const extBadge = getFileExtBadge(item);
          const catMeta = item.category ? CATEGORY_META[item.category] : null;
          const CatIcon = catMeta?.Icon || FileText;

          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {isImg ? (
                  <button
                    type="button"
                    onClick={() => setPreviewImg({ url: openHref, name: item.name })}
                    className="shrink-0 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in"
                    title="Phóng to ảnh"
                  >
                    <ProxyImage
                      src={openHref}
                      alt={item.name}
                      className="w-11 h-11 object-cover rounded-md"
                      allowDirectOpen={false}
                    />
                  </button>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    <CatIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300 leading-none mt-0.5">
                      {extBadge}
                    </span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {catMeta && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border mb-0.5 ${catMeta.badgeClass}`}>
                      {catMeta.label}
                    </span>
                  )}
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={item.name}>
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isGoogleDriveUrl(item.url) ? 'Google Drive' : item.sourceType === 'LINK' ? 'Liên kết ngoài' : 'Tệp đính kèm'}
                  </div>
                </div>
              </div>

              <a
                href={openHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-[44px] min-h-[44px] lg:min-h-[34px] px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold inline-flex items-center justify-center gap-1 shrink-0 transition-colors"
                title="Xem / Tải tệp"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở</span>
              </a>
            </div>
          );
        })}
      </div>

      {previewImg && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-md flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden"
          onClick={() => setPreviewImg(null)}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-white shrink-0">
            <span className="text-xs font-semibold truncate">{previewImg.name}</span>
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 cursor-pointer"
              aria-label="Đóng xem ảnh"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div
            className="flex-1 min-h-0 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImg.url}
              alt={previewImg.name}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
