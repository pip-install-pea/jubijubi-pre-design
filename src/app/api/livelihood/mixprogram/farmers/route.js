import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { getMixprogramFarmers } from '@/lib/livelihoodAnalytics.js';

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
    const data = await getMixprogramFarmers(filters);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error in livelihood mixprogram farmers API:', err);
    return NextResponse.json({ status: 'no_data', farmers: 0, locations: 0, by_location: [], other: [] });
  }
}
