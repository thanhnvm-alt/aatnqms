
export interface AuthUser {
  userId: string;
  role: 'QC' | 'QA' | 'MANAGER' | 'ADMIN';
  name?: string;
}

export function getAuthUser(req: any): AuthUser | null {
  // Handle VercelRequest (headers is object) or Web Request (headers is Headers object)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || (typeof req.headers.get === 'function' ? req.headers.get('Authorization') : null);
  
  // Mobile Support: Check Bearer token
  if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      // In production: verifyJWT(token)
      // Current implementation: Extract info from fallback headers if token is just userId
      const role = req.headers['x-user-role'] || (typeof req.headers.get === 'function' ? req.headers.get('x-user-role') : 'QC');
      const name = req.headers['x-user-name'] || (typeof req.headers.get === 'function' ? req.headers.get('x-user-name') : 'Mobile User');

      return {
          userId: token,
          role: role as any,
          name: typeof name === 'string' ? decodeURIComponent(name) : name
      };
  }

  return null;
}

export function canModifyInspection(user: AuthUser, recordOwnerId: string): boolean {
  if (['ADMIN', 'MANAGER'].includes(user.role)) return true;
  if (user.role === 'QC') return user.userId === recordOwnerId;
  return false;
}
