import React, { useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { getProxyImageUrl } from '../lib/utils';

interface ProxyImageProps {
    src: string;
    alt?: string;
    className?: string;
}

export const ProxyImage: React.FC<ProxyImageProps> = ({ src, alt = "Image", className = "" }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    let proxySrc = getProxyImageUrl(src);
    if (proxySrc.startsWith('/api/')) {
        const token = localStorage.getItem('aatn_qms_token');
        if (token) {
            const separator = proxySrc.includes('?') ? '&' : '?';
            proxySrc += `${separator}token=${token}`;
        }
    }

    if (hasError) {
        return (
            <div className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2 ${className}`}>
                <ImageIcon className="w-6 h-6 opacity-50" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Lỗi ảnh</span>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden group ${className}`}>
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                </div>
            )}
            <img 
                src={proxySrc} 
                alt={alt}
                loading="lazy"
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                }}
                className={`w-full h-full object-cover transition-all duration-700 ${isLoading ? 'scale-110 blur-sm' : 'scale-100 blur-0'} ${className}`}
            />
        </div>
    );
};
