
import { NextRequest, NextResponse } from 'next/server';
import { turso } from '@/lib/db/turso';
import { signToken } from '@/lib/jwt';
import { User } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, message: 'Missing credentials' }, { status: 400 });
    }

    const res = await turso.execute({
        sql: "SELECT data FROM users WHERE username = ?",
        args: [username]
    });

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const user = JSON.parse(res.rows[0].data as string) as User;

    // NOTE: In production, use bcrypt/argon2. Plaintext comparison used for this audit remediation phase only.
    if (user.password !== password) {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
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
        access_token: token,
        user: safeUser
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
