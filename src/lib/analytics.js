/**
 * Replicates the legacy Flask app's analytics filter builder in JS.
 * Location IDs are module-scoped: health state_id=1 ≠ livelihood state_id=1.
 * Filter values may be one id or a comma-separated list.
 */

export function splitList(value) {
  if (Array.isArray(value)) return value.flatMap((item) => splitList(item));
  if (value == null) return [];
  return String(value).split(',').map((part) => part.trim()).filter(Boolean);
}

/**
 * One selected FY matches the spellings stored on different tables:
 * 2025-26, 2025-2026, and 25-26. Other values are left as given.
 */
export function financialYearAliases(value) {
  const out = [];
  const seen = new Set();
  const add = (item) => {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  for (const raw of splitList(value)) {
    add(raw);
    let start = null;
    const fourTwo = raw.match(/^(\d{4})-(\d{2})$/);
    const fourFour = raw.match(/^(\d{4})-(\d{4})$/);
    const twoTwo = raw.match(/^(\d{2})-(\d{2})$/);
    if (fourTwo) start = Number(fourTwo[1]);
    else if (fourFour) start = Number(fourFour[1]);
    else if (twoTwo) {
      const yy = Number(twoTwo[1]);
      start = yy >= 70 ? 1900 + yy : 2000 + yy;
    }
    if (start == null) continue;
    const end = start + 1;
    add(`${start}-${String(end).slice(-2)}`);
    add(`${start}-${end}`);
    add(`${String(start).slice(-2)}-${String(end).slice(-2)}`);
  }
  return out;
}

/** Equality for one value, IN for several. Returns null when the list is empty. */
export function bindIn(column, value, prefix, params) {
  const list = splitList(value);
  if (!list.length) return null;
  if (list.length === 1) {
    params[prefix] = list[0];
    return `${column} = :${prefix}`;
  }
  list.forEach((item, index) => {
    params[`${prefix}_${index}`] = item;
  });
  return `${column} IN (${list.map((_, index) => `:${prefix}_${index}`).join(', ')})`;
}

export function buildFilters(filters, options = {}) {
  const {
    date_col = null,
    state_col = 'state_id',
    district_col = 'district_id',
    partner_col = null,
    gender_col = null,
    school_col = null,
    academic_year_col = null,
    financial_year_col = null,
    trade_col = null,
    module = null,
    apply_geo = true
  } = options;

  const clauses = [];
  const params = {};

  const geoModule = filters?.geo_module;
  const skipGeo = !apply_geo || !geoModule || geoModule === 'overview';
  const geoMatches = !skipGeo && (!module || geoModule === module);

  const state_id = filters?.state_id;
  const district_id = filters?.district_id;
  const year = filters?.year;
  const quarter = filters?.quarter;
  const partner_id = filters?.partner_id;
  const gender = filters?.gender;
  const trade = filters?.trade;
  const academic_yr = filters?.academic_year;
  const financial_yr = filters?.financial_year;
  const school_id = filters?.school_id;

  const stateClause = geoMatches && state_col ? bindIn(state_col, state_id, 'state_id', params) : null;
  const districtClause = geoMatches && district_col ? bindIn(district_col, district_id, 'district_id', params) : null;
  const partnerClause = partner_col ? bindIn(partner_col, partner_id, 'partner_id', params) : null;
  const genderClause = gender_col ? bindIn(gender_col, gender, 'gender', params) : null;
  const tradeClause = trade_col ? bindIn(trade_col, trade, 'trade', params) : null;
  const schoolClause = school_col ? bindIn(school_col, school_id, 'school_id', params) : null;
  const academicClause = academic_year_col ? bindIn(academic_year_col, financialYearAliases(academic_yr), 'academic_year', params) : null;
  const financialClause = financial_year_col ? bindIn(financial_year_col, financialYearAliases(financial_yr), 'financial_year', params) : null;
  const yearClause = date_col ? bindIn(`SUBSTR(${date_col}::text, 1, 4)`, year, 'year', params) : null;
  for (const clause of [stateClause, districtClause, partnerClause, genderClause, tradeClause, schoolClause, academicClause, financialClause, yearClause]) {
    if (clause) clauses.push(clause);
  }
  if (date_col && quarter) {
    const quarter_map = {
      'Q1': ['01', '03'],
      'Q2': ['04', '06'],
      'Q3': ['07', '09'],
      'Q4': ['10', '12']
    };
    if (quarter in quarter_map) {
      const [m_start, m_end] = quarter_map[quarter];
      clauses.push(`SUBSTR(${date_col}::text, 6, 2) BETWEEN :q_start AND :q_end`);
      params.q_start = m_start;
      params.q_end = m_end;
    }
  }

  return { clauses, params };
}

export function whereStr(clauses) {
  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

export function validDateClause(col) {
  return `(${col} IS NOT NULL AND ${col}::text !~ '^(0000|1970-01-01)' AND SUBSTR(${col}::text, 1, 4) NOT IN ('0000', '1970'))`;
}

/** Drop district so a selected district can be compared with peers in the same filter set. */
export function stripDistrict(filters) {
  if (!filters) return filters;
  return { ...filters, district_id: null };
}

/** Drop state and district for a programme-wide peer set. Year/gender/FY stay. */
export function stripGeo(filters) {
  if (!filters) return filters;
  return { ...filters, state_id: null, district_id: null };
}

export function withPeerAverages(rows, stateAverage, programmeAverage) {
  const state = Number(stateAverage) || 0;
  const prog = Number(programmeAverage) || 0;
  return (rows || []).map((r) => {
    const value = Number(r.value) || 0;
    return {
      ...r,
      value,
      vs_state_pct: state > 0 ? Number((((value - state) / state) * 100).toFixed(1)) : null,
      vs_programme_pct: prog > 0 ? Number((((value - prog) / prog) * 100).toFixed(1)) : null,
      below_peers: state > 0 ? value < state : (prog > 0 && value < prog)
    };
  });
}

export function mean(values) {
  const list = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (!list.length) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export function getFiltersFromRequest(req) {
  const url = new URL(req.url);
  return {
    state_id: url.searchParams.get('state_id') || null,
    district_id: url.searchParams.get('district_id') || null,
    year: url.searchParams.get('year') || null,
    quarter: url.searchParams.get('quarter') || null,
    partner_id: url.searchParams.get('partner_id') || null,
    gender: url.searchParams.get('gender') || null,
    trade: url.searchParams.get('trade') || null,
    academic_year: url.searchParams.get('academic_year') || null,
    financial_year: url.searchParams.get('financial_year') || null,
    school_id: url.searchParams.get('school_id') || null,
    geo_module: url.searchParams.get('geo_module') || null,
  };
}
