import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { scalar } from '@/lib/db.js';
import { getFiltersFromRequest, buildFilters, whereStr } from '@/lib/analytics.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const filters = getFiltersFromRequest(req);
    const tables = [
      'health_profile_patients',
      'skilltracking_persons',
      'enterprise_support',
      'education_program'
    ];

    const rows = {};
    for (const tbl of tables) {
      const { clauses, params } = buildFilters(filters, { date_col: 'created_at' });
      const where = whereStr(clauses);
      const query = `SELECT COUNT(*)::integer FROM ${tbl} ${where}`;
      const count = await scalar(query, params);
      rows[tbl] = count || 0;
    }

    return NextResponse.json({
      health_patients: rows['health_profile_patients'],
      livelihood_trained: rows['skilltracking_persons'],
      enterprise_members: rows['enterprise_support'],
      education_sessions: rows['education_program']
    });
  } catch (err) {
    console.error('Error fetching global summary metrics:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
