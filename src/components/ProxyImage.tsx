import React from 'react';
import { getProxyImageUrl } from '../utils';

interface ProxyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
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
  fallbackSrc = 'https://picsum.photos/seed/broken/400/300' 
}) => {
  const [error, setError] = React.useState(false);

  // Handle broken links or restricted access gracefully
  const handleError = () => {
    setError(true);
  };

  const proxiedSrc = React.useMemo(() => getProxyImageUrl(src), [src]);

  return (
    <div className={`relative overflow-hidden bg-slate-100 rounded-xl ${className}`}>
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
        <div className="absolute inset-0 animate-pulse bg-slate-200" />
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
