import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall, scalar } from '@/lib/db.js';
import { generatePasswordHash } from '@/lib/crypto.js';
import pool from '@/lib/db.js';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

function validatePassword(pwd) {
  if (!pwd || pwd.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!PASSWORD_RE.test(pwd)) {
    return 'Password must contain uppercase, lowercase, digit, and special character.';
  }
  return null;
}

// GET: Paginated users list
export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const total = await scalar('SELECT COUNT(*) FROM users');
    const users = await fetchall(
      `SELECT u.id, u.username, u.email, u.role_id, u.is_active, u.created_at, r.name AS role_name, r.thematic
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ORDER BY u.id ASC
       LIMIT :limit OFFSET :offset`,
      { limit, offset }
    );

    const items = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role_name,
      role_name: u.role_name,
      role_id: u.role_id,
      thematic: u.thematic,
      is_active: Boolean(u.is_active)
    }));

    const pages = Math.ceil(total / limit);

    return NextResponse.json({
      items,
      pages,
      total,
      page
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Add a new user
export async function POST(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await req.json().catch(() => null);
    if (!data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { username, email, password, role_id } = data;

    if (!username || !email || !password || !role_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check duplicate
    const existing = await fetchall(
      'SELECT id FROM users WHERE username = :username OR email = :email LIMIT 1',
      { username, email }
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'User or email already exists' }, { status: 409 });
    }

    // Validate password criteria
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // Hash password using crypto pbkdf2 Werkzeug compatibility
    const passwordHash = generatePasswordHash(password);

    await pool.query(
      `INSERT INTO users (username, email, password_hash, role_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, 1, $5)`,
      [username, email, passwordHash, parseInt(role_id, 10), new Date().toISOString()]
    );

    return NextResponse.json({ message: 'User created' }, { status: 201 });
  } catch (err) {
    console.error('Error adding user:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
