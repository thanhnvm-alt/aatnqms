/**
 * Utility to convert Google Drive URLs to proxy URLs that don't require Google login.
 */
export const getProxyImageUrl = (url: any): string => {
  if (!url) return '';
  let rawStr = url;
  if (typeof url === 'object') {
    rawStr = url.url || url.url_hd || url.url_thumbnail || url.file_url || url.fileUrl || url.image_url || url.drive_url || url.thumbnail || url.id || url.fileId || '';
  }
  const trimmed = String(rawStr).trim();
  if (!trimmed) return '';

  // Data URLs & Blobs render directly without proxy
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  // Normalize relative uploads/ path to /uploads/
  let normalizedUrl = trimmed;
  if (normalizedUrl.startsWith('uploads/')) {
    normalizedUrl = '/' + normalizedUrl;
  }

  // Same-origin local uploads render directly with CORS & Cache-Control headers
  if (normalizedUrl.startsWith('/uploads/')) return normalizedUrl;

  let token = '';
  try {
    token = localStorage.getItem('aatn_qms_token') || sessionStorage.getItem('aatn_qms_token') || '';
  } catch {
    token = '';
  }

  // Signed Storage URLs or JWT-authenticated internal storage assets
  if (normalizedUrl.startsWith('/api/storage/files/') || normalizedUrl.includes('/api/storage/files/')) {
    const qIdx = normalizedUrl.indexOf('?');
    const base = qIdx === -1 ? normalizedUrl : normalizedUrl.slice(0, qIdx);
    const params = new URLSearchParams(qIdx === -1 ? '' : normalizedUrl.slice(qIdx + 1));
    const sig = params.get('sig');
    const expRaw = params.get('expires');
    const expNum = expRaw ? Number(expRaw) : 0;
    const isSigExpired = !sig || !expNum || !Number.isFinite(expNum) || (expNum * 1000 <= Date.now());
    if (isSigExpired) {
      params.delete('sig');
      params.delete('expires');
    }
    if (token && !params.has('token')) {
      params.set('token', token);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  // If already routed via /api/media/image/:id or legacy media paths
  if (
    normalizedUrl.includes('/display-image/') ||
    normalizedUrl.includes('/api/image/') ||
    normalizedUrl.includes('/api/media/image/') ||
    normalizedUrl.includes('/media/stream/')
  ) {
    const qIdx = normalizedUrl.indexOf('?');
    if (qIdx === -1) return normalizedUrl;
    const base = normalizedUrl.slice(0, qIdx);
    const params = new URLSearchParams(normalizedUrl.slice(qIdx + 1));
    params.delete('google_token');
    params.delete('token');
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  // If already routed via our proxy endpoint, normalize
  if (normalizedUrl.includes('/api/proxy-image') || normalizedUrl.includes('/api/images/proxy')) {
    return normalizedUrl.replace('/api/images/proxy', '/api/proxy-image');
  }

  // Bare Google Drive file ID
  if (/^[a-zA-Z0-9_-]{15,}$/.test(normalizedUrl)) {
    return `/api/media/image/${normalizedUrl}`;
  }

  // Normalize Google Drive share links into direct image URLs before proxying
  let targetUrl = normalizedUrl;
  if (targetUrl.includes('drive.google.com') || targetUrl.includes('lh3.googleusercontent.com')) {
    const fileMatch = targetUrl.match(/\/file\/d\/([^/?]+)/);
    const idMatch = targetUrl.match(/[?&]id=([^&]+)/);
    const dMatch = targetUrl.match(/\/d\/([^/?]+)/);
    const fileId = fileMatch?.[1] || idMatch?.[1] || dMatch?.[1];
    if (fileId) {
      return `/api/media/image/${fileId}`;
    }
  }

  // Proxy external http(s) URLs to avoid CORS and Drive auth issues on mobile & canvas
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    const params = new URLSearchParams({ url: targetUrl });
    return `/api/proxy-image?${params.toString()}`;
  }

  return targetUrl;
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
