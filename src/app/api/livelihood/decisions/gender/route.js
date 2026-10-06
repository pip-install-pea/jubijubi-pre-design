import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { getProgrammeGender } from '@/lib/livelihoodDecisions.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'livelihood') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    return NextResponse.json(await getProgrammeGender(getFiltersFromRequest(req)));
  } catch (err) {
    console.error('Error in livelihood decisions gender API:', err);
    return NextResponse.json({ status: 'no_data' });
  }
}
