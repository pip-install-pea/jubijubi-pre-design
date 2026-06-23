import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { getEducationQuality } from '@/lib/educationAnalytics.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'education') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const filters = getFiltersFromRequest(req);
    const data = await getEducationQuality(filters);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error in education quality API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
