import React from 'react';

interface PageActionsProps {
  title: string;
  subtitle?: string;
  totalCount?: number;
  countLabel?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageActions: React.FC<PageActionsProps> = ({
  title,
  subtitle,
  totalCount,
  countLabel = 'dòng',
  icon,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          {icon && <span className="shrink-0">{icon}</span>}
          <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          {typeof totalCount === 'number' && (
            <span className="text-sm font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums">
              ({totalCount.toLocaleString('vi-VN')} {countLabel})
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>
      )}
    </div>
  );
};
