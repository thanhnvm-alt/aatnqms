import React, { useMemo, useState } from 'react';
import { BookingDocumentCategory } from '../types.js';
import {
  flattenReferenceDocsForReview,
  getAttachmentActionUrl,
  getFileExtBadge,
  isGoogleDriveUrl,
  isImageAttachment,
} from '../src/utils/bookingDocuments.js';
import { ProxyImage } from '../src/components/ProxyImage.js';
import { BookingAttachmentReviewModal } from './BookingAttachmentReviewModal';
import {
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react';

interface DocEntryInput {
  id?: string;
  name?: string;
  title?: string;
  url?: string;
  category?: BookingDocumentCategory;
  sourceType?: 'UPLOAD' | 'LINK';
  mimeType?: string;
  size?: number;
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
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  const items = useMemo(() => {
    return flattenReferenceDocsForReview([
      ...(Array.isArray(referenceDocs) ? referenceDocs : []),
      ...(Array.isArray(supportingDocs) ? supportingDocs : []),
    ]);
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
        {items.map((item, idx) => {
          const openHref = getAttachmentActionUrl(item.url);
          const isImg = isImageAttachment(item);
          const extBadge = getFileExtBadge(item);
          const catMeta = item.category ? CATEGORY_META[item.category] : null;
          const CatIcon = catMeta?.Icon || FileText;

          return (
            <div
              key={`${item.id}_${idx}`}
              className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <button
                type="button"
                onClick={() => setReviewIndex(idx)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                title={`Xem tài liệu: ${item.name}`}
              >
                {isImg ? (
                  <div className="shrink-0 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
                    <ProxyImage
                      src={openHref}
                      alt={item.name}
                      className="w-11 h-11 object-cover rounded-md"
                      allowDirectOpen={false}
                    />
                  </div>
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
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isGoogleDriveUrl(item.url) ? 'Google Drive' : item.sourceType === 'LINK' ? 'Liên kết ngoài' : 'Tệp đính kèm'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReviewIndex(idx)}
                className="min-w-[44px] min-h-[44px] lg:min-h-[34px] px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold inline-flex items-center justify-center gap-1 shrink-0 transition-colors cursor-pointer"
                title="Mở trình xem tài liệu"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem</span>
              </button>
            </div>
          );
        })}
      </div>

      <BookingAttachmentReviewModal
        open={reviewIndex !== null}
        items={items}
        initialIndex={reviewIndex ?? 0}
        titleContext={bookingCode ? `Tài liệu Booking ${bookingCode}` : 'Tài liệu Booking QC'}
        onClose={() => setReviewIndex(null)}
      />
    </div>
  );
};
