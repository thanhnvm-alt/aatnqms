import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export type ConfirmDialogVariant = 'info' | 'warning' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  variant?: ConfirmDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  variant = 'info',
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isLoading, onCancel]);

  if (!open) return null;

  const variantConfig = {
    info: {
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-600 text-white',
      Icon: Info,
    },
    warning: {
      iconBg: 'bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400',
      confirmBtn: 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-500 text-white',
      Icon: AlertTriangle,
    },
    danger: {
      iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400',
      confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white',
      Icon: Trash2,
    },
  }[variant];

  const { Icon } = variantConfig;

  const dialogNode = (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-slate-900/60 backdrop-blur-sm overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${variantConfig.iconBg}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="confirm-dialog-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            aria-label="Đóng hộp thoại"
            className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -mt-1.5 -mr-1.5 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 sm:py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 whitespace-nowrap shrink-0 ${variantConfig.confirmBtn}`}
          >
            {isLoading ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(dialogNode, document.body) : dialogNode;
};
