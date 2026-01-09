
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/jwt';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Bypass authentication for Login endpoint
  if (path === '/api/auth/login') {
    return NextResponse.next();
  }

  // 2. Enforce strict authentication for all other /api routes
  if (path.startsWith('/api')) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Missing or invalid token' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Valid token -> Proceed
    return NextResponse.next();
  }

  // Default behavior for non-api routes
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
