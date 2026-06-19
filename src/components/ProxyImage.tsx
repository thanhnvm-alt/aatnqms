import React from 'react';
import { getProxyImageUrl } from '../utils';
import { formatDateTime } from '../../lib/utils';

interface ProxyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  timestamp?: string | number;
  showTimestamp?: boolean;
}

/**
 * ProxyImage Component
 * Displays images fetched via the Google Drive Proxy route.
 * Optimized for mobile with lazy loading and responsive containers.
 */
export const ProxyImage: React.FC<ProxyImageProps> = ({ 
  src, 
  alt, 
  className = '', 
  fallbackSrc = 'https://picsum.photos/seed/broken/400/300',
  timestamp,
  showTimestamp = false
}) => {
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setError(false);
  }, [src]);

  // Handle broken links or restricted access gracefully
  const handleError = () => {
    setError(true);
  };

  const proxiedSrc = React.useMemo(() => getProxyImageUrl(src), [src]);

  return (
    <div className="flex flex-col gap-1 w-fit">
      <div className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 rounded-xl ${className}`}>
        <img
          src={error ? fallbackSrc : proxiedSrc}
          alt={alt}
          loading="lazy"
          onError={handleError}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-opacity duration-500 hover:opacity-90"
        />
        
        {/* Aspect Ratio Skeleton (Optional but recommended for mobile CLS) */}
        {!src && (
          <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />
        )}
      </div>

      {showTimestamp && timestamp && (
        <div className="text-[9px] font-mono font-medium text-slate-500 dark:text-slate-400 px-1 leading-tight mb-1">
          {formatDateTime(timestamp)}
        </div>
      )}

      {/* Style for Responsive Containers */}
      <style>{`
        .image-container-mobile {
          width: 100%;
          aspect-ratio: 16 / 9;
        }
        @media (max-width: 640px) {
          .image-grid-mobile {
            grid-template-columns: 1fr;
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default ProxyImage;
