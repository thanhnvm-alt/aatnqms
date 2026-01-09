
import { NextRequest } from 'next/server';
import { verifyToken } from './jwt';

export interface AuthUser {
  userId: string;
  role: 'QC' | 'QA' | 'MANAGER' | 'ADMIN';
  name?: string;
  username?: string;
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const payload = await verifyToken(token);
  
  if (!payload) {
    return null;
  }

  return {
    userId: payload.sub as string,
    role: payload.role as any,
    name: payload.name as string,
    username: payload.username as string
  };
}

export function canModifyInspection(user: AuthUser, recordOwnerId: string): boolean {
  if (['ADMIN', 'MANAGER'].includes(user.role)) return true;
  if (user.role === 'QC') return user.userId === recordOwnerId;
  return false;
}
