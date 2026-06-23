import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Thematic verification: super_admin/admin or thematic match
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'health') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ status: 'Health API is running' });
}
