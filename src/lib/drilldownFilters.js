const SAFE_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const SELECT_KEYS = new Set([
  'gender', 'person_gender', 'placement_status', 'work_status', 'status',
  'year', 'academic_year', 'financial_year', 'month',
  'course_name', 'trade', 'training_type', 'trade_name',
  'program', 'program_name', 'phase', 'class',
  'caste', 'category', 'person_category',
  'district', 'state', 'block', 'location',
  'funding_support', 'livelihood', 'assessment_type',
  'market_access_type', 'member_type', 'time_bucket', 'delta_bucket',
  'theme_touched', 'activity_name', 'disability', 'community'
]);

export const SKIP_KEYS = new Set([
  'person_id', 'member_id', 'patient_id', 'appointment_id', 'id',
  'source_id', 'mobile_number', 'phone_number', 'pre_post_id'
]);

const FACET_MAX = 50;

const MIX_EXPR = {
  course_name: 'm.course_name',
  location: 'm.location',
  year: 'm.year',
  pre_income: 'm.pre_income',
  post_income: 'm.post_income',
  placement_status: 'm.placement_status',
  gender: 'm.person_gender',
  person_gender: 'm.person_gender',
  school_name: 'm.school_name',
  block: 'm.block',
  class: 'm.class',
  activity_name: 'm.activity_name',
  phase: 'm.phase',
  farmers: 'm.number_of_farmers',
  students_total: 'm.students_total',
  students_male: 'm.students_male',
  students_female: 'm.students_female',
  district: 'm.district',
  trade: 'm.trade',
  training_type: 'm.training_type',
  funding_support: 'm.funding_support',
  program_name: 'p.program_name',
  program: `COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text)`
};

export function parseColFilters(searchParams) {
  const out = {};
  if (!searchParams) return out;
  const entries = typeof searchParams.entries === 'function'
    ? [...searchParams.entries()]
    : Object.entries(searchParams);
  for (const [k, v] of entries) {
    if (!String(k).startsWith('f_')) continue;
    const key = String(k).slice(2);
    if (!SAFE_KEY.test(key)) continue;
    const val = String(v || '').trim();
    if (val) out[key] = val;
  }
  return out;
}

function genderGroup(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['f', 'female', 'woman', 'women', 'girl'].includes(s)) return 'f';
  if (['m', 'male', 'man', 'men', 'boy'].includes(s)) return 'm';
  return s;
}

export function valuesMatch(cell, needle, key) {
  const a = String(cell ?? '').trim();
  const b = String(needle ?? '').trim();
  if (!b) return true;
  if (!a || a === '—') return false;
  if (key === 'gender' || key === 'person_gender') {
    return genderGroup(a) === genderGroup(b);
  }
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return true;
  return left.includes(right);
}

export function addColFilters(searchParams, clauses, params, exprByKey) {
  const filters = parseColFilters(searchParams);
  for (const [key, val] of Object.entries(filters)) {
    const expr = exprByKey?.[key];
    if (!expr) continue;
    const pname = `cf_${key}`;
    const text = `BTRIM(${expr}::text)`;
    if (key === 'gender' || key === 'person_gender') {
      const g = genderGroup(val);
      if (g === 'f') {
        clauses.push(`LOWER(${text}) IN ('f', 'female', 'woman', 'women', 'girl')`);
      } else if (g === 'm') {
        clauses.push(`LOWER(${text}) IN ('m', 'male', 'man', 'men', 'boy')`);
      } else {
        clauses.push(`${text} ILIKE :${pname}`);
        params[pname] = `%${val}%`;
      }
    } else {
      clauses.push(`${text} ILIKE :${pname}`);
      params[pname] = `%${val}%`;
    }
  }
  return filters;
}

export function filterKind(key) {
  if (SKIP_KEYS.has(key)) return 'skip';
  if (SELECT_KEYS.has(key)) return 'select';
  return 'text';
}

export async function fetchFacets({ fetchall, fromSql, whereSql, params, columns, exprByKey }) {
  const facets = {};
  if (!fromSql || !columns?.length) return facets;
  const where = whereSql && whereSql.trim() ? whereSql : 'WHERE TRUE';
  for (const col of columns) {
    if (filterKind(col.key) !== 'select') continue;
    const expr = exprByKey?.[col.key];
    if (!expr) continue;
    try {
      const rows = await fetchall(
        `SELECT DISTINCT BTRIM(${expr}::text) AS v
         FROM ${fromSql}
         ${where}
           AND ${expr} IS NOT NULL
           AND BTRIM(${expr}::text) <> ''
         ORDER BY 1
         LIMIT ${FACET_MAX + 1}`,
        params || {}
      );
      if (rows.length && rows.length <= FACET_MAX) {
        facets[col.key] = rows.map((r) => r.v).filter(Boolean);
      }
    } catch {
      /* leave this column as text search */
    }
  }
  return facets;
}

export function mixFilterExpr(key) {
  if (MIX_EXPR[key]) return MIX_EXPR[key];
  if (SAFE_KEY.test(key)) return `m.${key}`;
  return null;
}

export function filterRows(rows, columns, colFilters) {
  const entries = Object.entries(colFilters || {});
  if (!entries.length) return rows;
  const keys = new Set((columns || []).map((c) => c.key));
  return (rows || []).filter((row) => entries.every(([key, val]) => {
    if (!keys.has(key)) return true;
    return valuesMatch(row?.[key], val, key);
  }));
}
