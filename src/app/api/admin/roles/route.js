import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall } from '@/lib/db.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const roles = await fetchall('SELECT id, name, thematic FROM roles ORDER BY id ASC');
    return NextResponse.json(roles);
  } catch (err) {
    console.error('Error fetching roles:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
