import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { getSessionsByTrade, getBatchCourseStatus } from '@/lib/livelihoodAnalytics.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'livelihood') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const filters = getFiltersFromRequest(req);
    const [trades, batches] = await Promise.all([
      getSessionsByTrade(filters),
      getBatchCourseStatus(filters)
    ]);
    return NextResponse.json({ trades, batches });
  } catch (err) {
    console.error('Error in skilling sessions_by_trade API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
