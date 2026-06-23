/**
 * Replicates the legacy Flask app's analytics filter builder in JS.
 */

export function buildFilters(filters, options = {}) {
  const {
    date_col = null,
    state_col = 'state_id',
    district_col = 'district_id',
    partner_col = null,
    gender_col = null,
    school_col = null,
    academic_year_col = null,
    trade_col = null
  } = options;

  const clauses = [];
  const params = {};

  const state_id = filters?.state_id;
  const district_id = filters?.district_id;
  const year = filters?.year;
  const quarter = filters?.quarter;
  const partner_id = filters?.partner_id;
  const gender = filters?.gender;
  const trade = filters?.trade;
  const academic_yr = filters?.academic_year;
  const school_id = filters?.school_id;

  if (state_id && state_col) {
    clauses.push(`${state_col} = :state_id`);
    params.state_id = state_id;
  }
  if (district_id && district_col) {
    clauses.push(`${district_col} = :district_id`);
    params.district_id = district_id;
  }
  if (partner_id && partner_col) {
    clauses.push(`${partner_col} = :partner_id`);
    params.partner_id = partner_id;
  }
  if (gender && gender_col) {
    clauses.push(`${gender_col} = :gender`);
    params.gender = gender;
  }
  if (trade && trade_col) {
    clauses.push(`${trade_col} = :trade`);
    params.trade = trade;
  }
  if (school_id && school_col) {
    clauses.push(`${school_col} = :school_id`);
    params.school_id = school_id;
  }
  if (academic_yr && academic_year_col) {
    clauses.push(`${academic_year_col} = :academic_year`);
    params.academic_year = academic_yr;
  }
  
  // cast to text to handle both ISO string and timestamps safely in PG
  if (date_col && year) {
    clauses.push(`SUBSTR(${date_col}::text, 1, 4) = :year`);
    params.year = year;
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
    school_id: url.searchParams.get('school_id') || null,
  };
}
