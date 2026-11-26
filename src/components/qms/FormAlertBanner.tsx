import React, { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export interface FormAlertState {
  type: 'error' | 'warning' | 'success';
  title?: string;
  message: string;
}

interface FormAlertBannerProps {
  alert: FormAlertState | null;
  onClose?: () => void;
  className?: string;
}

export const FormAlertBanner: React.FC<FormAlertBannerProps> = ({ alert, onClose, className = '' }) => {
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (alert && bannerRef.current) {
      bannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [alert]);

  if (!alert || !alert.message) return null;

  const isError = alert.type === 'error';
  const isWarning = alert.type === 'warning';

  const containerCls = isError
    ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-900 dark:text-red-100'
    : isWarning
    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
    : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100';

  const Icon = isError ? AlertCircle : isWarning ? AlertTriangle : CheckCircle2;
  const iconCls = isError
    ? 'text-red-600 dark:text-red-400'
    : isWarning
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-emerald-600 dark:text-emerald-400';

  const defaultTitle = isError
    ? 'Không thể hoàn tất thao tác'
    : isWarning
    ? 'Cảnh báo tải tệp / dữ liệu'
    : 'Thông báo';

  return (
    <div
      ref={bannerRef}
      role="alert"
      aria-live="polite"
      className={`rounded-xl border px-3.5 py-2.5 shadow-sm flex items-start gap-2.5 text-xs ${containerCls} ${className}`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconCls}`} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-bold uppercase tracking-wide text-[11px] leading-tight">
          {alert.title || defaultTitle}
        </p>
        <p className="text-xs font-medium leading-relaxed whitespace-pre-line break-words">
          {alert.message}
        </p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 -mr-1.5 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export function extractFormErrorMessage(err: any, fallback: string = 'Không thể lưu báo cáo. Vui lòng kiểm tra lại dữ liệu và thử lại.'): string {
  if (!err) return fallback;
  const raw = typeof err === 'string' ? err : String(err?.message || err?.error || '');
  if (!raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return String(parsed.error);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // Not raw JSON
  }
  return raw;
}

export default FormAlertBanner;
