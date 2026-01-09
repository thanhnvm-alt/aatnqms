
import { NextRequest } from 'next/server';

export interface AuthUser {
  userId: string;
  role: 'QC' | 'QA' | 'MANAGER' | 'ADMIN';
  name?: string;
}

export function getAuthUser(req: NextRequest): AuthUser | null {
  const authHeader = req.headers.get('Authorization');
  
  // Mobile Support: Check Bearer token
  if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      // In production: verifyJWT(token)
      // Current implementation: Extract info from fallback headers if token is just userId
      return {
          userId: token,
          role: (req.headers.get('x-user-role') as any) || 'QC',
          name: req.headers.get('x-user-name') || 'Mobile User'
      };
  }

  return null;
}

export function canModifyInspection(user: AuthUser, recordOwnerId: string): boolean {
  if (['ADMIN', 'MANAGER'].includes(user.role)) return true;
  if (user.role === 'QC') return user.userId === recordOwnerId;
  return false;
}
