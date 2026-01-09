
import { verifyToken } from './lib/jwt';

export const config = {
  matcher: '/api/:path*',
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Bypass authentication for Login endpoint
  if (path === '/api/auth/login') {
    return new Response(null, {
        headers: { 'x-middleware-next': '1' }
    });
  }

  // 2. Enforce strict authentication for all other /api routes
  if (path.startsWith('/api')) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized: Missing or invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);

    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized: Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Valid token -> Proceed
    return new Response(null, {
        headers: { 'x-middleware-next': '1' }
    });
  }
}
