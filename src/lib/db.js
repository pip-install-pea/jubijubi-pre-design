import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Executes a PostgreSQL query mapping named parameters (:param) to positional ones ($1).
 * @param {string} sql
 * @param {object} params
 * @returns {Promise<any[]>}
 */
export async function fetchall(sql, params = {}) {
  let paramIndex = 1;
  const values = [];
  
  // Replace named parameters like :state_id or :year with $1, $2...
  // Avoid matching double colons like ::type casts.
  const convertedSql = sql.replace(/(?<!:):([a-zA-Z0-9_]+)/g, (match, paramName) => {
    if (params[paramName] !== undefined) {
      values.push(params[paramName]);
      return `$${paramIndex++}`;
    }
    return match; // Keep it if not defined (might be raw or error)
  });
  
  const res = await pool.query(convertedSql, values);
  return res.rows;
}

/**
 * Returns a single scalar value from a database query.
 * @param {string} sql
 * @param {object} params
 * @returns {Promise<number|string>}
 */
export async function scalar(sql, params = {}) {
  const rows = await fetchall(sql, params);
  if (rows && rows.length > 0) {
    const firstKey = Object.keys(rows[0])[0];
    const val = rows[0][firstKey];
    return val !== null && val !== undefined ? Number(val) : 0;
  }
  return 0;
}

/**
 * Helper to dynamically construct database query WHERE clauses based on input filters.
 * @param {object} filters 
 * @param {object} config 
 * @returns {[string[], object]} Array of filter SQL conditions and mapped parameter values
 */
export function buildFilters(filters = {}, {
  dateCol = null,
  stateCol = 'state_id',
  districtCol = 'district_id',
  partnerCol = null,
  genderCol = null,
  schoolCol = null,
  academicYearCol = null,
  tradeCol = null
} = {}) {
  const clauses = [];
  const params = {};

  const stateId = filters.state_id;
  const districtId = filters.district_id;
  const year = filters.year;
  const quarter = filters.quarter;
  const partnerId = filters.partner_id;
  const gender = filters.gender;
  const trade = filters.trade;
  const academicYr = filters.academic_year;
  const schoolId = filters.school_id;

  if (stateId && stateCol) {
    clauses.push(`${stateCol} = :state_id`);
    params.state_id = stateId;
  }

  if (districtId && districtCol) {
    clauses.push(`${districtCol} = :district_id`);
    params.district_id = districtId;
  }

  if (partnerId && partnerCol) {
    clauses.push(`${partnerCol} = :partner_id`);
    params.partner_id = partnerId;
  }

  if (gender && genderCol) {
    clauses.push(`${genderCol} = :gender`);
    params.gender = gender;
  }

  if (trade && tradeCol) {
    clauses.push(`${tradeCol} = :trade`);
    params.trade = trade;
  }

  if (schoolId && schoolCol) {
    clauses.push(`${schoolCol} = :school_id`);
    params.school_id = schoolId;
  }

  if (academicYr && academicYearCol) {
    clauses.push(`${academicYearCol} = :academic_year`);
    params.academic_year = academicYr;
  }

  if (dateCol && year) {
    clauses.push(`SUBSTR(${dateCol}, 1, 4) = :year`);
    params.year = year;
  }

  if (dateCol && quarter) {
    const quarterMap = {
      'Q1': ['01', '03'],
      'Q2': ['04', '06'],
      'Q3': ['07', '09'],
      'Q4': ['10', '12']
    };
    if (quarterMap[quarter]) {
      const [mStart, mEnd] = quarterMap[quarter];
      clauses.push(`SUBSTR(${dateCol}, 6, 2) BETWEEN :q_start AND :q_end`);
      params.q_start = mStart;
      params.q_end = mEnd;
    }
  }

  return [clauses, params];
}

/**
 * Joins clauses into a single WHERE string.
 * @param {string[]} clauses
 * @returns {string}
 */
export function whereStr(clauses) {
  return clauses && clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

export default pool;
