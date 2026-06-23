import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ status: 'Dashboard API is running' });
}
