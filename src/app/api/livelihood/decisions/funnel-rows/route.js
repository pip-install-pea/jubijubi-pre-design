import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest } from '@/lib/analytics.js';
import { monthFilterSql } from '@/lib/livelihoodAnalytics.js';
import { funnelStageSql } from '@/lib/livelihoodDecisions.js';
import { queryMixRows } from '@/lib/mixDrilldown.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'livelihood') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const filters = getFiltersFromRequest(req);
    const stage = url.searchParams.get('stage') || 'enrolled';
    const monthParams = {};
    const monthClause = monthFilterSql('m.month', filters, monthParams, { textMonth: true });
    const payload = await queryMixRows({
      searchParams: url.searchParams,
      year: filters.academic_year || filters.financial_year,
      q: url.searchParams.get('q') || '',
      page: Math.max(1, parseInt(url.searchParams.get('page') || '1', 10)),
      perPage: Math.min(200, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10))),
      extraClauses: [
        `m.program_id::text = '11'`,
        funnelStageSql(stage),
        ...(monthClause ? [monthClause] : [])
      ],
      extraParams: monthParams,
      qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
      selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
        COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
        COALESCE(NULLIF(TRIM(m.person_gender), ''), '—') AS gender,
        COALESCE(NULLIF(TRIM(m.placement_status), ''), '—') AS placement_status,
        m.year, m.pre_income, m.post_income`,
      columns: [
        { key: 'course_name', label: 'Course' },
        { key: 'location', label: 'Location' },
        { key: 'gender', label: 'Gender' },
        { key: 'placement_status', label: 'Placement' },
        { key: 'year', label: 'Year' },
        { key: 'pre_income', label: 'Pre income' },
        { key: 'post_income', label: 'Post income' }
      ]
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Error in livelihood decisions funnel-rows API:', err);
    return NextResponse.json({ status: 'no_data' });
  }
}
