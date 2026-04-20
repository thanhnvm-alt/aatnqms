/**
 * Utility to convert Google Drive URLs to proxy URLs that don't require Google login.
 */
export const getProxyImageUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  
  // If it's already a data URL or blob, return as is
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  
  // If it's already using our proxy, return as is
  if (url.includes('/display-image/') || url.includes('/api/image/') || url.includes('/api/proxy-image')) return url;

  // We should proxy ALL non-local images to avoid CORS and Auth issues on mobile
  if (url.startsWith('http')) {
      return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }

  return url;
};
