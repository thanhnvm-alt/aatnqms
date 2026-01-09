
import { turso } from '../../lib/db/turso';
import { signToken } from '../../lib/jwt';
import { initializeDatabase } from '../../lib/db/init';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu' }), { status: 400 });
    }

    let res;
    try {
        res = await turso.execute({
            sql: "SELECT data FROM users WHERE lower(username) = lower(?)",
            args: [username.trim()]
        });
    } catch (dbError: any) {
        if (dbError.message?.includes('no such table')) {
            console.log("Login: Tables missing, initializing...");
            await initializeDatabase();
            res = await turso.execute({
                sql: "SELECT data FROM users WHERE lower(username) = lower(?)",
                args: [username.trim()]
            });
        } else {
            throw dbError;
        }
    }

    if (res.rows.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Thông tin đăng nhập không chính xác' }), { status: 401 });
    }

    const user = JSON.parse(res.rows[0].data as string);

    if (user.password !== password) {
      return new Response(JSON.stringify({ success: false, message: 'Thông tin đăng nhập không chính xác' }), { status: 401 });
    }

    const token = await signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    });

    const { password: _, ...safeUser } = user;

    return new Response(JSON.stringify({
      success: true,
      data: {
        token: token,
        user: safeUser
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Login API Error:", error);
    return new Response(JSON.stringify({ success: false, message: 'Lỗi hệ thống: ' + error.message }), { status: 500 });
  }
}
