import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { getGenderSplit } from '@/lib/livelihoodDecisions.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'livelihood') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    return NextResponse.json(await getGenderSplit(
      getFiltersFromRequest(req),
      url.searchParams.get('programme') || '',
      url.searchParams.get('gender') || ''
    ));
  } catch (err) {
    console.error('Error in livelihood decisions gender-split API:', err);
    return NextResponse.json({ status: 'no_data' });
  }
}
