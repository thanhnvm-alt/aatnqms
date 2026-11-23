import React from 'react';
import { getProxyImageUrl } from '../utils';
import { formatDateTime } from '../../lib/utils';
import { 
  extractGoogleDriveFileId, 
  getDirectGoogleDriveViewUrl, 
  fetchGoogleDriveImageBlob,
  isGoogleDriveSignedIn,
  signInWithGoogleDrive,
  subscribeGoogleDriveAuth
} from '../services/googleDriveAuth';
import { ExternalLink, KeyRound, RefreshCw } from 'lucide-react';

interface ProxyImageProps {
  src: string | any;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  timestamp?: string | number;
  showTimestamp?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  allowDirectOpen?: boolean;
}

const DEFAULT_BROKEN_IMAGE_SVG =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f1f5f9'/%3E%3Cpath d='M160 120h80v60h-80z' fill='none' stroke='%2394a3b8' stroke-width='4' rx='6'/%3E%3Ccircle cx='182' cy='140' r='6' fill='%2394a3b8'/%3E%3Cpath d='M166 172l24-22 18 16 14-12 12 18z' fill='%23cbd5e1'/%3E%3C/svg%3E";

export const ProxyImage: React.FC<ProxyImageProps> = ({ 
  src, 
  alt, 
  className = '', 
  fallbackSrc = DEFAULT_BROKEN_IMAGE_SVG,
  timestamp,
  showTimestamp = false,
  onClick,
  allowDirectOpen = true
}) => {
  const [error, setError] = React.useState(false);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [isDriveAuth, setIsDriveAuth] = React.useState(isGoogleDriveSignedIn());
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);

  React.useEffect(() => {
    return subscribeGoogleDriveAuth((_user, token) => {
      setIsDriveAuth(!!token);
    });
  }, []);

  const fileId = React.useMemo(() => extractGoogleDriveFileId(src), [src]);
  const driveViewUrl = React.useMemo(() => getDirectGoogleDriveViewUrl(src), [src]);

  React.useEffect(() => {
    setError(false);
    setBlobUrl(null);
  }, [src]);

  // Attempt to fetch via Google Drive API if user is authenticated and error occurred
  React.useEffect(() => {
    let active = true;
    if (error && fileId && isDriveAuth && !blobUrl) {
      fetchGoogleDriveImageBlob(fileId).then((url) => {
        if (active && url) {
          setBlobUrl(url);
          setError(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [error, fileId, isDriveAuth, blobUrl]);

  const handleError = () => {
    if (fileId && isDriveAuth && !blobUrl) {
      fetchGoogleDriveImageBlob(fileId).then((url) => {
        if (url) {
          setBlobUrl(url);
          setError(false);
          return;
        }
        setError(true);
      });
    } else {
      setError(true);
    }
  };

  const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAuthenticating(true);
    try {
      const authRes = await signInWithGoogleDrive();
      if (authRes && fileId) {
        const url = await fetchGoogleDriveImageBlob(fileId);
        if (url) {
          setBlobUrl(url);
          setError(false);
        }
      }
    } catch (err) {
      console.error('Google Workspace Auth failed:', err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleOpenDrive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (driveViewUrl) {
      window.open(driveViewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const proxiedSrc = React.useMemo(() => {
    if (blobUrl) return blobUrl;
    return getProxyImageUrl(src);
  }, [src, blobUrl]);

  return (
    <div className="flex flex-col gap-1 w-fit" onClick={onClick}>
      <div className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 rounded-xl group/img ${className}`}>
        {error && fileId ? (
          <div className="w-full h-full min-h-[96px] p-2 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1">
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 leading-tight line-clamp-1 mb-1.5">
              Ảnh Google Drive
            </span>
            <div className="flex flex-col gap-1 w-full px-1">
              {allowDirectOpen && (
                <button
                  type="button"
                  onClick={handleOpenDrive}
                  className="w-full py-1 px-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold rounded flex items-center justify-center gap-1 shadow-xs transition-colors"
                  title="Mở ảnh trong tab mới bằng tài khoản Google"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span>Mở trên Drive</span>
                </button>
              )}
              {!isDriveAuth && (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isAuthenticating}
                  className="w-full py-0.5 px-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[8px] font-medium rounded flex items-center justify-center gap-1 transition-colors"
                  title="Đăng nhập Google Workspace để xem ảnh nội bộ"
                >
                  {isAuthenticating ? (
                    <RefreshCw className="w-2 h-2 animate-spin" />
                  ) : (
                    <KeyRound className="w-2 h-2 text-amber-500" />
                  )}
                  <span>Đăng nhập Google</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <img
            src={error ? fallbackSrc : proxiedSrc}
            alt={alt}
            loading="lazy"
            onError={handleError}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-opacity duration-500 hover:opacity-90"
          />
        )}
        
        {/* Aspect Ratio Skeleton */}
        {!src && !blobUrl && (
          <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />
        )}
      </div>

      {showTimestamp && timestamp && formatDateTime(timestamp) && (
        <div className="text-[9px] font-mono font-medium text-slate-500 dark:text-slate-400 px-1 leading-tight mb-1 tabular-nums">
          {formatDateTime(timestamp)}
        </div>
      )}
    </div>
  );
};

export default ProxyImage;
