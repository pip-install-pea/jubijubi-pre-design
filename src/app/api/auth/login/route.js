import { NextResponse } from 'next/server';
import { fetchall } from '@/lib/db.js';
import { checkPassword } from '@/lib/crypto.js';
import { signToken } from '@/lib/auth.js';

export async function POST(req) {
  try {
    const data = await req.json().catch(() => null);
    if (!data) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const identifier = String(data.identifier || '').trim();
    const password = String(data.password || '');

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Query user and join with roles
    const query = `
      SELECT u.id, u.username, u.email, u.password_hash, u.role_id, u.is_active, r.name AS role_name, r.thematic
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.email = :identifier OR u.username = :identifier
      LIMIT 1
    `;
    const users = await fetchall(query, { identifier });

    if (users.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials or account inactive' }, { status: 401 });
    }

    const dbUser = users[0];

    // Check account active
    if (!dbUser.is_active || dbUser.is_active === 0) {
      return NextResponse.json({ error: 'Invalid credentials or account inactive' }, { status: 401 });
    }

    // Verify Password using crypto bridge
    const isPasswordValid = checkPassword(password, dbUser.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials or account inactive' }, { status: 401 });
    }

    const userDict = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role_name,
      role_name: dbUser.role_name,
      role_id: dbUser.role_id,
      thematic: dbUser.thematic,
      is_active: true
    };

    // Sign session JWT
    const token = await signToken(userDict);

    const response = NextResponse.json({ message: 'Login successful', user: userDict });
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
