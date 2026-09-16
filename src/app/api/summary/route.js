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
    const yearOnly = { year: filters.year, quarter: filters.quarter, geo_module: 'overview' };

    const health = await scalar(
      `SELECT COUNT(*)::integer FROM health_profile_patients ${whereStr(buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false }).clauses)}`,
      buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false }).params
    );
    const roster = await scalar(
      `SELECT COUNT(*)::integer FROM skilltracking_persons ${whereStr(buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false }).clauses)}`,
      buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false }).params
    );
    const members = await scalar(
      `SELECT COUNT(*)::integer FROM enterprise_support ${whereStr(buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false }).clauses)}`,
      buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false }).params
    );
    const students = await scalar(
      `SELECT COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer
       FROM education_program ${whereStr(buildFilters({ academic_year: filters.academic_year, geo_module: 'overview' }, { academic_year_col: 'academic_year', apply_geo: false }).clauses)}`,
      buildFilters({ academic_year: filters.academic_year, geo_module: 'overview' }, { academic_year_col: 'academic_year', apply_geo: false }).params
    );

    return NextResponse.json({
      health_patients: health || 0,
      livelihood_trained: roster || 0,
      livelihood_roster: roster || 0,
      enterprise_members: members || 0,
      education_sessions: students || 0,
      education_students: students || 0
    });
  } catch (err) {
    console.error('Error fetching global summary metrics:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
