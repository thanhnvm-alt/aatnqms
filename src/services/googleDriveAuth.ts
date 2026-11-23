import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;
const authListeners = new Set<(user: User | null, token: string | null) => void>();

export const initGoogleDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        notifyListeners();
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
        notifyListeners();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
      notifyListeners();
    }
  });
};

const notifyListeners = () => {
  authListeners.forEach((listener) => {
    try {
      listener(currentUser, cachedAccessToken);
    } catch (e) {
      console.warn('Google Drive auth listener error:', e);
    }
  });
};

export const subscribeGoogleDriveAuth = (callback: (user: User | null, token: string | null) => void) => {
  authListeners.add(callback);
  callback(currentUser, cachedAccessToken);
  return () => {
    authListeners.delete(callback);
  };
};

export const signInWithGoogleDrive = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không thể nhận Access Token từ Google Workspace Auth');
    }

    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    notifyListeners();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Workspace sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleDriveAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const isGoogleDriveSignedIn = (): boolean => {
  return !!cachedAccessToken && !!currentUser;
};

export const getGoogleDriveUser = (): User | null => {
  return currentUser;
};

export const signOutGoogleDrive = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  currentUser = null;
  notifyListeners();
};

export const extractGoogleDriveFileId = (input: any): string => {
  if (!input) return '';
  const str = String(typeof input === 'object' ? (input.url || input.fileUrl || input.id || '') : input).trim();
  if (!str) return '';

  if (str.includes('drive.google.com') || str.includes('lh3.googleusercontent.com')) {
    const fileMatch = str.match(/\/file\/d\/([^/?]+)/);
    const idMatch = str.match(/[?&]id=([^&]+)/);
    const dMatch = str.match(/\/d\/([^/?]+)/);
    return fileMatch?.[1] || idMatch?.[1] || dMatch?.[1] || '';
  }
  if (str.includes('/api/media/image/') || str.includes('/api/image/') || str.includes('/display-image/')) {
    const parts = str.split(/[/?]/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[a-zA-Z0-9_-]{15,}$/.test(last)) return last;
  }
  if (/^[a-zA-Z0-9_-]{15,}$/.test(str)) {
    return str;
  }
  return '';
};

export const getDirectGoogleDriveViewUrl = (fileIdOrUrl: string): string => {
  const fileId = extractGoogleDriveFileId(fileIdOrUrl);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
  return fileIdOrUrl.startsWith('http') ? fileIdOrUrl : `https://drive.google.com`;
};

const blobCache = new Map<string, string>();

export const fetchGoogleDriveImageBlob = async (fileId: string): Promise<string | null> => {
  if (!fileId) return null;
  if (blobCache.has(fileId)) {
    return blobCache.get(fileId)!;
  }

  const token = getGoogleDriveAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.warn(`Drive API fetch error ${res.status} for fileId ${fileId}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return null;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobCache.set(fileId, objectUrl);
    return objectUrl;
  } catch (err) {
    console.warn(`Failed to fetch Drive image blob for ${fileId}:`, err);
    return null;
  }
};
