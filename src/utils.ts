/**
 * Utility to convert Google Drive URLs to proxy URLs that don't require Google login.
 */
export const getProxyImageUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  
  // If it's already a data URL or blob, return as is
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Retrieve auth token for restricted access
  const token = localStorage.getItem('aatn_qms_token');
  const tokenParam = token ? `token=${token}` : '';
  
  // If it's already using our proxy, we might need to append the token if it's missing
  if (url.includes('/display-image/') || url.includes('/api/image/') || url.includes('/api/proxy-image') || url.includes('/api/media/image/') || url.includes('/media/stream/')) {
      if (token && !url.includes('token=')) {
          return url.includes('?') ? `${url}&${tokenParam}` : `${url}?${tokenParam}`;
      }
      return url;
  }

  // We should proxy ALL non-local images to avoid CORS and Auth issues on mobile
  if (url.startsWith('http')) {
      return `/api/proxy-image?url=${encodeURIComponent(url)}&${tokenParam}`;
  }

  return url;
};

export const compressImage = (file: File, maxSizeKB: number = 500): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Keep ratio, reduce dimensions for large images
                const maxDim = 1000;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = (height * maxDim) / width;
                        width = maxDim;
                    } else {
                        width = (width * maxDim) / height;
                        height = maxDim;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                let quality = 0.8;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                
                // Helper to check size
                const getKB = (dataUrl: string) => (dataUrl.length * 3) / 4 / 1024;
                
                while (getKB(dataUrl) > maxSizeKB && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                
                resolve(dataUrl);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};
