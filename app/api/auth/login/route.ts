
import { NextRequest, NextResponse } from 'next/server';
import { turso } from '@/lib/db/turso';
import { signToken } from '@/lib/jwt';
import { User } from '@/types';
import { initializeDatabase } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu' }, { status: 400 });
    }

    // Try to find user
    let res;
    try {
        res = await turso.execute({
            sql: "SELECT data FROM users WHERE lower(username) = lower(?)",
            args: [username.trim()]
        });
    } catch (dbError: any) {
        // If table doesn't exist, try to init and retry once
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
      return NextResponse.json({ success: false, message: 'Thông tin đăng nhập không chính xác' }, { status: 401 });
    }

    const user = JSON.parse(res.rows[0].data as string) as User;

    // Password validation (Simple text for now as per requirements, hash later)
    if (user.password !== password) {
      return NextResponse.json({ success: false, message: 'Thông tin đăng nhập không chính xác' }, { status: 401 });
    }

    const token = await signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    });

    const { password: _, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      data: {
        token: token,
        user: safeUser
      }
    });

  } catch (error: any) {
    console.error("Login API Error:", error);
    return NextResponse.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, { status: 500 });
  }
}
