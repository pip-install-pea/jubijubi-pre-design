import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall } from '@/lib/db.js';
import pool from '@/lib/db.js';
import { generatePasswordHash } from '@/lib/crypto.js';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

function validatePassword(pwd) {
  if (!pwd || typeof pwd !== 'string' || pwd.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!PASSWORD_RE.test(pwd)) {
    return 'Password must contain uppercase, lowercase, digit, and special character.';
  }
  return null;
}

// DELETE: Delete a user (prevent self-deletion)
export async function DELETE(req, { params }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const resolvedParams = await params;
    const uid = parseInt(resolvedParams.id, 10);

    if (user.id === uid) {
      return NextResponse.json({ error: 'Cannot delete self' }, { status: 400 });
    }

    // Verify user exists
    const existing = await fetchall('SELECT id FROM users WHERE id = :uid LIMIT 1', { uid });
    if (existing.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    return NextResponse.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST/PATCH: Edit user role, email, is_active status
export async function POST(req, { params }) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const resolvedParams = await params;
    const uid = Number.parseInt(resolvedParams.id, 10);
    if (Number.isNaN(uid)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const data = await req.json().catch(() => null);
    if (!data) {
      return NextResponse.json({ error: 'Missing update fields' }, { status: 400 });
    }

    // Verify user exists
    const existing = await fetchall('SELECT id FROM users WHERE id = :uid LIMIT 1', { uid });
    if (existing.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if ('role_id' in data) {
      const roleId = Number.parseInt(data.role_id, 10);
      if (Number.isNaN(roleId)) {
        return NextResponse.json({ error: 'Invalid role_id' }, { status: 400 });
      }
      updates.push(`role_id = $${idx++}`);
      values.push(roleId);
    }
    if ('is_active' in data) {
      updates.push(`is_active = $${idx++}`);
      values.push(data.is_active ? 1 : 0);
    }
    if ('email' in data) {
      const email = String(data.email || '').trim();
      if (!email) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }
      updates.push(`email = $${idx++}`);
      values.push(email);
    }
    if ('password' in data) {
      const password = String(data.password || '');
      const passwordError = validatePassword(password);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }
      updates.push(`password_hash = $${idx++}`);
      values.push(generatePasswordHash(password));
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: 'No fields to update' }, { status: 200 });
    }

    values.push(uid);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`;
    await pool.query(query, values);

    return NextResponse.json({ message: 'User updated' });
  } catch (err) {
    console.error('Error updating user:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Support PATCH as well for REST standards
export async function PATCH(req, { params }) {
  return POST(req, { params });
}
