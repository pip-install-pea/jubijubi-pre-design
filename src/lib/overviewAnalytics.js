import { fetchall, scalar } from './db.js';
import { bindIn, buildFilters, whereStr } from './analytics.js';
import { getMixprogramSchools, MIX_CANONICAL_ROW } from './educationAnalytics.js';
import { fetchFarmerYearSeries } from './livelihoodAnalytics.js';

function canSee(user, thematic) {
  return user?.role === 'super_admin' || user?.role === 'admin' || user?.thematic === thematic;
}

async function safeScalar(sql, params) {
  try {
    return Number(await scalar(sql, params)) || 0;
  } catch (err) {
    console.warn('[overview] scalar skipped:', err.message);
    return 0;
  }
}

async function safeRows(sql, params) {
  try {
    return await fetchall(sql, params);
  } catch (err) {
    console.warn('[overview] query skipped:', err.message);
    return [];
  }
}

export async function getOverview(filters, user) {
  const yearOnly = { year: filters?.year, quarter: filters?.quarter, geo_module: 'overview' };
  const mixYear = filters?.academic_year || filters?.financial_year;
  const mixParams = {};
  const mixYearClause = bindIn('m.year', mixYear, 'year', mixParams);
  const mixWhere = mixYearClause
    ? `WHERE ${mixYearClause} AND ${MIX_CANONICAL_ROW}`
    : `WHERE ${MIX_CANONICAL_ROW}`;

  const result = {
    health_patients: 0,
    livelihood_roster: 0,
    livelihood_trained: 0,
    enterprise_members: 0,
    education_students: 0,
    education_sessions: 0,
    farmers: 0,
    skilling_sheet: 0,
    didi_people: 0,
    school_students: 0,
    school_count: 0,
    health_diseases: [],
    education_by_program: [],
    livelihood_counts: [],
    farmers_by_year: [],
    farmer_locations_by_year: {}
  };

  if (canSee(user, 'health')) {
    const hf = buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false });
    result.health_patients = await safeScalar(
      `SELECT COUNT(*)::integer FROM health_profile_patients ${whereStr(hf.clauses)}`,
      hf.params
    );
    const diseaseParams = {};
    const diseaseClause = bindIn('year', filters?.year, 'dy', diseaseParams);
    result.health_diseases = await safeRows(
      `SELECT COALESCE(NULLIF(TRIM(disease_name), ''), 'Unknown') AS label,
              COALESCE(SUM(total_patients), 0)::integer AS value
       FROM health_disease_summary
       ${diseaseClause ? `WHERE ${diseaseClause}` : ''}
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 12`,
      diseaseParams
    );
  }

  if (canSee(user, 'livelihood')) {
    const lf = buildFilters(yearOnly, { date_col: 'created_at', apply_geo: false });
    result.livelihood_roster = await safeScalar(
      `SELECT COUNT(*)::integer FROM skilltracking_persons ${whereStr(lf.clauses)}`,
      lf.params
    );
    result.livelihood_trained = result.livelihood_roster;
    result.enterprise_members = await safeScalar(
      `SELECT COUNT(*)::integer FROM enterprise_support ${whereStr(lf.clauses)}`,
      lf.params
    );
    result.farmers = await safeScalar(
      `SELECT COALESCE(SUM(number_of_farmers), 0)::integer FROM education_mixprogram m
       ${mixWhere} AND m.program_id::text IN ('1','2')`,
      mixParams
    );
    result.skilling_sheet = await safeScalar(
      `SELECT COUNT(*)::integer FROM education_mixprogram m
       ${mixWhere} AND m.program_id::text = '11'`,
      mixParams
    );
    result.didi_people = await safeScalar(
      `SELECT COUNT(*)::integer FROM education_mixprogram m
       ${mixWhere} AND m.program_id::text = '12'`,
      mixParams
    );
    result.livelihood_counts = [
      { label: 'Skill roster', value: result.livelihood_roster },
      { label: 'Skilling sheet', value: result.skilling_sheet },
      { label: 'Enterprise members', value: result.enterprise_members },
      { label: 'Didi ki dukan', value: result.didi_people },
      { label: 'Jubifarm farmers', value: result.farmers }
    ].filter((r) => r.value > 0);
    try {
      const series = await fetchFarmerYearSeries();
      result.farmers_by_year = series.by_year;
      result.farmer_locations_by_year = series.locations_by_year;
    } catch (err) {
      console.warn('[overview] farmer years skipped:', err.message);
    }
  }

  if (canSee(user, 'education')) {
    const ef = buildFilters(
      { academic_year: filters?.academic_year, geo_module: 'overview' },
      { academic_year_col: 'academic_year', apply_geo: false }
    );
    try {
      const mix = await getMixprogramSchools(filters);
      if (mix?.status === 'ok') {
        result.school_count = mix.school?.kpis?.schools || 0;
        result.school_students = mix.school?.kpis?.students || 0;
        result.education_by_program = (mix.school?.by_program || []).map((r) => ({
          label: r.label,
          value: Number(r.students) || 0
        })).filter((r) => r.value > 0);
      }
    } catch (err) {
      console.warn('[overview] school sheets skipped:', err.message);
    }
    if (result.school_count > 0) {
      result.education_students = result.school_students;
      result.education_sessions = result.school_students;
    } else {
      result.education_students = await safeScalar(
        `SELECT COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer
         FROM education_program ${whereStr(ef.clauses)}`,
        ef.params
      );
      result.education_sessions = result.education_students;
    }
  }

  return result;
}
