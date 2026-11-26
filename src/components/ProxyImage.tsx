import React from 'react';
import { getProxyImageUrl } from '../utils';
import { formatDateTime, formatDisplayDate } from '../../lib/utils';
import {
  extractGoogleDriveFileId,
  getDirectGoogleDriveViewUrl,
} from '../services/googleDriveAuth';
import { AlertTriangle, ExternalLink, ImageOff, RefreshCw, Upload } from 'lucide-react';

interface ProxyImageProps {
  src: string | any;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  timestamp?: string | number;
  showTimestamp?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  allowDirectOpen?: boolean;
  onReplace?: () => void;
}

type ImageErrorKind = '404' | 'drive' | 'generic' | null;

function appendRetryParam(url: string, retryCount: number): string {
  if (!url || retryCount <= 0 || url.startsWith('data:') || url.startsWith('blob:')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_r=${retryCount}`;
}

function formatImageTimestamp(timestamp: string | number): string {
  if (!timestamp) return '';
  if (typeof timestamp === 'string') {
    const trimmed = timestamp.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(trimmed)) {
      return formatDisplayDate(trimmed);
    }
  }
  return formatDateTime(timestamp);
}

export const ProxyImage: React.FC<ProxyImageProps> = ({
  src,
  alt,
  className = '',
  timestamp,
  showTimestamp = false,
  onClick,
  allowDirectOpen = true,
  onReplace,
}) => {
  const [error, setError] = React.useState(false);
  const [errorKind, setErrorKind] = React.useState<ImageErrorKind>(null);
  const [retryCount, setRetryCount] = React.useState(0);
  const [isLoaded, setIsLoaded] = React.useState(false);

  const fileId = React.useMemo(() => extractGoogleDriveFileId(src), [src]);
  const driveViewUrl = React.useMemo(() => getDirectGoogleDriveViewUrl(src), [src]);

  React.useEffect(() => {
    setError(false);
    setErrorKind(null);
    setRetryCount(0);
    setIsLoaded(false);
  }, [src]);

  const baseProxiedSrc = React.useMemo(() => getProxyImageUrl(src), [src]);
  const proxiedSrc = React.useMemo(
    () => appendRetryParam(baseProxiedSrc, retryCount),
    [baseProxiedSrc, retryCount]
  );

  const isLegacyStoragePath = React.useMemo(() => {
    const rawStr = typeof src === 'string'
      ? src
      : String(src?.url || src?.url_hd || src?.fileUrl || src?.file_url || '');
    return baseProxiedSrc.includes('/api/storage/files/') || rawStr.includes('/api/storage/files/');
  }, [baseProxiedSrc, src]);

  const handleError = async () => {
    setIsLoaded(false);
    setError(true);
    if (!baseProxiedSrc || baseProxiedSrc.startsWith('data:') || baseProxiedSrc.startsWith('blob:')) {
      setErrorKind('generic');
      return;
    }

    try {
      const probeRes = await fetch(proxiedSrc || baseProxiedSrc, { method: 'HEAD' });
      if (probeRes.status === 404) {
        setErrorKind(fileId ? 'drive' : '404');
      } else if (probeRes.status === 502 || probeRes.status === 503 || probeRes.status === 504) {
        setErrorKind('drive');
      } else if (isLegacyStoragePath && !fileId) {
        setErrorKind('404');
      } else {
        setErrorKind(fileId ? 'drive' : 'generic');
      }
    } catch {
      if (isLegacyStoragePath && !fileId) {
        setErrorKind('404');
      } else {
        setErrorKind(fileId ? 'drive' : 'generic');
      }
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(false);
    setErrorKind(null);
    setIsLoaded(false);
    setRetryCount((prev) => prev + 1);
  };

  const handleOpenDrive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (driveViewUrl) {
      window.open(driveViewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleReplaceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReplace?.();
  };

  const formattedTs = React.useMemo(
    () => (showTimestamp && timestamp ? formatImageTimestamp(timestamp) : ''),
    [showTimestamp, timestamp]
  );

  const isMissingLegacy = errorKind === '404';
  const showDriveButton = Boolean(
    !isMissingLegacy && !isLegacyStoragePath && !onReplace && allowDirectOpen && fileId && driveViewUrl
  );
  const errorTitle = isMissingLegacy
    ? 'Mất tệp (404)'
    : errorKind === 'drive'
      ? 'Lỗi tải ảnh Drive'
      : 'Không tải được ảnh';

  return (
    <div className="flex flex-col gap-1 w-fit" onClick={onClick}>
      <div className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 rounded-xl group/img ${className}`}>
        {error ? (
          <div
            className={`relative z-20 w-full h-full min-h-[80px] p-1.5 flex flex-col items-center justify-center text-center rounded-xl border ${
              isMissingLegacy
                ? 'bg-red-50/95 dark:bg-red-950/40 border-red-200 dark:border-red-900/60'
                : 'bg-amber-50/95 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60'
            }`}
            title={
              isMissingLegacy
                ? 'Tệp ảnh cũ không còn tồn tại trên bộ nhớ tạm máy chủ (404). Vui lòng tải ảnh mới nếu cần.'
                : 'Không thể nạp ảnh từ máy chủ. Bấm Thử lại để kết nối lại.'
            }
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 shrink-0 ${
                isMissingLegacy
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300'
                  : 'bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300'
              }`}
            >
              {isMissingLegacy ? (
                <ImageOff className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
            </div>
            <span
              className={`text-[10px] font-semibold leading-tight line-clamp-1 mb-1.5 px-0.5 ${
                isMissingLegacy
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-800 dark:text-amber-200'
              }`}
            >
              {errorTitle}
            </span>
            <div className="flex flex-col gap-1 w-full px-0.5">
              <button
                type="button"
                onClick={handleRetry}
                className="w-full min-h-[26px] py-0.5 px-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold rounded flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="Thử tải lại ảnh"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Thử lại</span>
              </button>
              {onReplace && (
                <button
                  type="button"
                  onClick={handleReplaceClick}
                  className="w-full min-h-[26px] py-0.5 px-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold rounded flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Tải ảnh mới thay thế"
                >
                  <Upload className="w-2.5 h-2.5" />
                  <span>Tải ảnh mới</span>
                </button>
              )}
              {showDriveButton && (
                <button
                  type="button"
                  onClick={handleOpenDrive}
                  className="w-full min-h-[24px] py-0.5 px-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-semibold rounded flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Mở tệp trên Google Drive"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span>Mở Drive</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <img
            src={proxiedSrc}
            alt={alt}
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            onError={handleError}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-opacity duration-300 hover:opacity-90"
          />
        )}

        {/* Loading / Empty Skeleton */}
        {!error && (!src || !isLoaded) && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-slate-200/70 dark:bg-slate-700/70" />
        )}
      </div>

      {formattedTs && (
        <div className="text-[9px] font-mono font-medium text-slate-500 dark:text-slate-400 px-1 leading-tight mb-1 tabular-nums">
          {formattedTs}
        </div>
      )}
    </div>
  );
};

export default ProxyImage;
