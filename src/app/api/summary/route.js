import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { getOverview } from '@/lib/overviewAnalytics.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const filters = getFiltersFromRequest(req);
    const data = await getOverview(filters, user);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error fetching global summary metrics:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
