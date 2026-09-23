import { NextResponse } from 'next/server';
import { fetchall, isDatabaseConfigured } from '@/lib/db.js';
import { checkPassword } from '@/lib/crypto.js';
import { signToken } from '@/lib/auth.js';

function devLoginAllowed() {
  if (process.env.ALLOW_DEV_LOGIN === 'true' || process.env.ALLOW_DEV_LOGIN === '1') return true;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') return false;
  return true;
}

function devLoginUser(identifier, password) {
  if (!devLoginAllowed()) return null;
  const user = String(process.env.DEV_LOGIN_USER || '').trim();
  const pass = String(process.env.DEV_LOGIN_PASSWORD || '');
  if (!user || !pass) return null;
  const email = String(process.env.DEV_LOGIN_EMAIL || `${user}@local`).trim();
  const match = identifier === user || identifier.toLowerCase() === email.toLowerCase();
  if (!match || password !== pass) return null;
  const role = process.env.DEV_LOGIN_ROLE || 'super_admin';
  return {
    id: 0,
    username: user,
    email,
    role,
    role_name: role,
    role_id: 1,
    thematic: null,
    is_active: true
  };
}

async function signIn(userDict, extra = {}) {
  const token = await signToken(userDict);
  const response = NextResponse.json({ message: 'Login successful', user: userDict, ...extra });
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/'
  });
  return response;
}

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

    if (isDatabaseConfigured()) {
      try {
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

        if (!dbUser.is_active || dbUser.is_active === 0) {
          return NextResponse.json({ error: 'Invalid credentials or account inactive' }, { status: 401 });
        }

        const isPasswordValid = checkPassword(password, dbUser.password_hash);
        if (!isPasswordValid) {
          return NextResponse.json({ error: 'Invalid credentials or account inactive' }, { status: 401 });
        }

        return signIn({
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          role: dbUser.role_name,
          role_name: dbUser.role_name,
          role_id: dbUser.role_id,
          thematic: dbUser.thematic,
          is_active: true
        });
      } catch (err) {
        console.error('Login Postgres error:', err);
        const local = devLoginUser(identifier, password);
        if (local) {
          return signIn(local);
        }
        return NextResponse.json({
          error: 'Unable to sign in. Please try again.'
        }, { status: 503 });
      }
    }

    const local = devLoginUser(identifier, password);
    if (local) {
      return signIn(local);
    }

    return NextResponse.json({
      error: 'Unable to sign in. Please try again.'
    }, { status: 503 });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({
      error: 'Unable to sign in. Please try again.'
    }, { status: 500 });
  }
}
