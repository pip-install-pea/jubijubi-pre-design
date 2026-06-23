import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall } from '@/lib/db.js';
import pool from '@/lib/db.js';

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
    const uid = parseInt(resolvedParams.id, 10);

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
      updates.push(`role_id = $${idx++}`);
      values.push(parseInt(data.role_id, 10));
    }
    if ('is_active' in data) {
      updates.push(`is_active = $${idx++}`);
      values.push(data.is_active ? 1 : 0);
    }
    if ('email' in data) {
      updates.push(`email = $${idx++}`);
      values.push(String(data.email).trim());
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
