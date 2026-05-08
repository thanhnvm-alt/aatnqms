/**
 * Image Compression Service for QMS App
 * Optimized for Mobile (iOS/Android) 4G environment
 */

interface CompressionOptions {
  maxSizeMB: number;
  maxWidth: number;
  quality: number;
}

export async function compressImage(
  base64Str: string,
  options: CompressionOptions = { maxSizeMB: 0.5, maxWidth: 1600, quality: 0.7 }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > options.maxWidth) {
        height = Math.round((height * options.maxWidth) / width);
        width = options.maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str); // Fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Recursive compression to hit target size if needed
      let currentQuality = options.quality;
      let result = canvas.toDataURL('image/jpeg', currentQuality);

      // Simple size check (approximate based on base64 length)
      const getApproxSizeMB = (b64: string) => (b64.length * 0.75) / (1024 * 1024);
      
      while (getApproxSizeMB(result) > options.maxSizeMB && currentQuality > 0.3) {
        currentQuality -= 0.1;
        result = canvas.toDataURL('image/jpeg', currentQuality);
      }

      resolve(result);
    };
    img.onerror = (e) => reject(e);
  });
}
