import { fetchall, scalar } from './db.js';
import { bindIn, buildFilters, financialYearAliases, whereStr, stripDistrict, stripGeo, withPeerAverages, mean } from './analytics.js';
import { MIX_CANONICAL_ROW } from './educationAnalytics.js';
import { foldSql, foldKey, displaySql, softFoldSql, mergeSimilarLabels } from './labelNorm.js';
import { summariseEmployers } from './employerMap.js';

const GEO = { module: 'livelihood' };

function moneySql(col) {
  return `CASE WHEN btrim(COALESCE(${col}::text, '')) ~ '^[0-9]+(\\.[0-9]+)?' THEN btrim(${col}::text)::numeric ELSE NULL END`;
}

/** Numeric, greater than 0, and below 10 lakh. Zero, blank, and placeholder amounts are left out. */
export function validIncomeSql(col) {
  const n = moneySql(col);
  return `(CASE WHEN ${n} > 0 AND ${n} < 1000000 THEN ${n} END)`;
}

const SHEET_INCOME_MIN = 0;
const SHEET_INCOME_MAX = 200000;

function mixYearClauses(filters) {
  const year = filters?.academic_year || filters?.financial_year;
  const params = {};
  const clauses = [MIX_CANONICAL_ROW];
  const yearClause = bindIn('m.year', financialYearAliases(year), 'year', params);
  if (yearClause) clauses.push(yearClause);
  return { clauses, params };
}

export function placementStatusSql(col = 'm.placement_status') {
  const raw = `btrim(COALESCE(${col}::text, ''))`;
  return `CASE
    WHEN ${raw} = '' THEN 'Not reported'
    WHEN ${raw} ~* 'further[[:space:]]*stud' THEN 'Further study'
    WHEN ${raw} ~* 'on[[:space:]]*going|ongoing' THEN 'Ongoing course'
    WHEN ${raw} ~* 'self[[:space:]]*employ' THEN 'Self employment'
    WHEN ${raw} ~* 'job[[:space:]]*search' THEN 'Job searching'
    WHEN ${raw} ~* 'home[[:space:]]*maker' THEN 'Homemaker'
    WHEN ${raw} ~* 'not[[:space:]]*work|unemployed' THEN 'Not working'
    ELSE 'Working'
  END`;
}

export function mixWorkingSql(col = 'm.placement_status') {
  return `(${placementStatusSql(col)} IN ('Working', 'Self employment'))`;
}

/** "Phase 1", "phase 1", and "1" share one bar, ordered by the phase number. */
export function phaseLabelSql(col = 'm.phase') {
  const raw = `btrim(COALESCE(${col}::text, ''))`;
  return `CASE
    WHEN ${raw} ~ '[0-9]' THEN 'Phase ' || ((regexp_match(${raw}, '([0-9]+)'))[1])::integer::text
    WHEN ${raw} = '' THEN 'Not recorded'
    ELSE ${raw}
  END`;
}

/** Sheet and roster spellings collapse to Female, Male, Others, or Not recorded. */
export function genderBucketSql(col) {
  const raw = `lower(regexp_replace(btrim(COALESCE(${col}::text, '')), '\\s+', ' ', 'g'))`;
  return `CASE
    WHEN ${raw} IN ('f', 'female', 'woman', 'women', 'girl') THEN 'Female'
    WHEN ${raw} IN ('m', 'male', 'man', 'men', 'boy') THEN 'Male'
    WHEN ${raw} IN ('other', 'others', 'o') THEN 'Others'
    ELSE 'Not recorded'
  END`;
}

function withCanonicalPlaces(rows) {
  return (rows || []).map((row) => (
    foldKey(row.label) === 'joya' ? { ...row, label: 'Joya' } : row
  ));
}

function mixSkillingWhere(filters, { workingOnly = false } = {}) {
  const { clauses, params } = mixYearClauses(filters);
  clauses.push(`m.program_id::text = '11'`);
  if (workingOnly) clauses.push(mixWorkingSql());
  return { w: whereStr(clauses), params };
}

function oneDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(1));
}

export async function getPlacementIndicators(filters) {
  const { w, params } = mixSkillingWhere(filters);
  const pre = validIncomeSql('m.pre_income');
  const post = validIncomeSql('m.post_income');
  const status = placementStatusSql('m.placement_status');
  const gender = genderBucketSql('m.person_gender');
  const placed = `${status} IN ('Working', 'Self employment')`;
  const empty = { status: 'no_data' };
  try {
    const rows = await fetchall(
      `SELECT
         COUNT(*)::integer AS all_rows,
         COUNT(*) FILTER (WHERE ${status} <> 'Ongoing course')::integer AS trained,
         COUNT(*) FILTER (WHERE ${placed})::integer AS placed,
         COUNT(*) FILTER (WHERE ${status} = 'Self employment')::integer AS self_employed,
         COUNT(*) FILTER (WHERE ${gender} = 'Female')::integer AS women,
         COUNT(*) FILTER (WHERE ${gender} = 'Male')::integer AS men,
         COUNT(*) FILTER (WHERE ${gender} = 'Female' AND ${placed})::integer AS women_placed,
         COUNT(*) FILTER (WHERE ${gender} = 'Male' AND ${placed})::integer AS men_placed,
         COUNT(${post})::integer AS n_post,
         AVG(${post}) AS avg_post,
         COUNT(${post}) FILTER (WHERE ${placed})::integer AS n_placed_post,
         AVG(${post}) FILTER (WHERE ${placed}) AS avg_placed_post,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${post}) FILTER (WHERE ${placed} AND ${post} IS NOT NULL) AS median_placed_post,
         COUNT(*) FILTER (WHERE ${pre} IS NOT NULL AND ${post} IS NOT NULL)::integer AS n_pairs,
         AVG((${post}) - (${pre})) FILTER (WHERE ${pre} IS NOT NULL AND ${post} IS NOT NULL) AS avg_delta
       FROM education_mixprogram m
       ${w}`,
      params
    );
    const statusRows = await fetchall(
      `SELECT btrim(COALESCE(m.placement_status::text, '')) AS raw, COUNT(*)::integer AS count
       FROM education_mixprogram m
       ${w}
       GROUP BY 1`,
      params
    );
    const row = rows[0] || {};
    const all = Number(row.all_rows) || 0;
    if (!all) return empty;
    const placedN = Number(row.placed) || 0;
    const women = Number(row.women) || 0;
    const men = Number(row.men) || 0;
    const womenPlaced = Number(row.women_placed) || 0;
    const menPlaced = Number(row.men_placed) || 0;
    return {
      status: 'ok',
      all,
      trained: Number(row.trained) || 0,
      placed: placedN,
      placed_pct: all ? oneDecimal((placedN / all) * 100) : null,
      self_employed: Number(row.self_employed) || 0,
      self_pct: all ? oneDecimal(((Number(row.self_employed) || 0) / all) * 100) : null,
      avg_placed_post: row.avg_placed_post == null ? null : Math.round(Number(row.avg_placed_post)),
      median_placed_post: row.median_placed_post == null ? null : Math.round(Number(row.median_placed_post)),
      n_placed_post: Number(row.n_placed_post) || 0,
      avg_post: row.avg_post == null ? null : Math.round(Number(row.avg_post)),
      n_post: Number(row.n_post) || 0,
      avg_delta: row.avg_delta == null ? null : Math.round(Number(row.avg_delta)),
      n_pairs: Number(row.n_pairs) || 0,
      women,
      women_placed: womenPlaced,
      female_rate: women ? oneDecimal((womenPlaced / women) * 100) : null,
      men,
      men_placed: menPlaced,
      male_rate: men ? oneDecimal((menPlaced / men) * 100) : null,
      employers: summariseEmployers(statusRows)
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] placement indicators skipped:', err.message);
    return empty;
  }
}

function lf(filters, options) {
  return buildFilters(filters, { ...GEO, ...options });
}

function parseSalesGeneratedAverage(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .replace(/\+/g, '')
    .replace(/,/g, ' ')
    .toUpperCase();

  const tokenRegex = /([0-9]+(?:\.[0-9]+)?)\s*(CR|CRORE|LAKHS?|LACS?|LAC|THOUSAND|K|MILLION|M|BILLION|BN)?/g;
  let match;
  let total = 0;
  let found = false;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    const value = parseFloat(match[1]);
    if (Number.isNaN(value)) continue;

    const unit = (match[2] || '').toUpperCase();
    let multiplier = 1;
    if (unit.startsWith('CR') || unit.startsWith('CRORE')) {
      multiplier = 10000000;
    } else if (unit.startsWith('LAKH') || unit.startsWith('LAC') || unit.startsWith('LACS')) {
      multiplier = 100000;
    } else if (unit === 'THOUSAND' || unit === 'K') {
      multiplier = 1000;
    } else if (unit === 'M' || unit === 'MILLION') {
      multiplier = 1000000;
    } else if (unit === 'B' || unit === 'BN' || unit === 'BILLION') {
      multiplier = 1000000000;
    }

    total += value * multiplier;
    found = true;
  }

  return found ? total : null;
}

async function _incomeBuckets(extraWhere = '', params = {}, placedOnly = false) {
  const placedClause = placedOnly
    ? (extraWhere ? 'AND' : 'WHERE') + " work_status = 'Working'"
    : '';

  const query = `
    SELECT
      SUM(CASE WHEN CASE WHEN monthly_income ~ '^[0-9]+$' THEN monthly_income::integer ELSE 0 END BETWEEN 0 AND 5000
          THEN 1 ELSE 0 END)::integer      AS "0_5000",
      SUM(CASE WHEN CASE WHEN monthly_income ~ '^[0-9]+$' THEN monthly_income::integer ELSE 0 END BETWEEN 5001 AND 10000
          THEN 1 ELSE 0 END)::integer      AS "5001_10000",
      SUM(CASE WHEN CASE WHEN monthly_income ~ '^[0-9]+$' THEN monthly_income::integer ELSE 0 END > 10000
          THEN 1 ELSE 0 END)::integer      AS "10001_plus"
    FROM skilltracking_monitor
    ${extraWhere} ${placedClause}
  `;
  const rows = await fetchall(query, params);
  const r = rows[0] || {};
  return {
    "0_5000":     r["0_5000"] || 0,
    "5001_10000": r["5001_10000"] || 0,
    "10001_plus": r["10001_plus"] || 0,
  };
}

export async function getSkillingBeneficiaries(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    trade_col: 'training_stream_id',
    date_col: 'created_at'
  });
  const w = whereStr(clauses);

  const total = await scalar(
    `SELECT COALESCE(COUNT(*), 0)::integer FROM skilltracking_persons ${w}`,
    params
  );

  const { clauses: mClauses, params: mParams } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'date_of_monitor'
  });
  const mw = whereStr(mClauses);

  const statusRows = await fetchall(
    `SELECT
       COALESCE(work_status, '')  AS status,
       COUNT(*)::integer          AS cnt
     FROM skilltracking_monitor
     ${mw}
     GROUP BY work_status
     ORDER BY cnt DESC`,
    mParams
  );

  const statusBreakdown = statusRows.map(r => ({
    status: r.status || 'Not reported',
    count: r.cnt
  }));

  const monitoredPeople = await scalar(
    `SELECT COUNT(DISTINCT person_id)::integer FROM skilltracking_monitor ${mw}`,
    mParams
  );

  const { clauses: dClauses, params: dParams } = lf(filters, {
    state_col: 'sm.state_id',
    district_col: 'sm.district_id',
    date_col: 'sm.date_of_monitor'
  });
  const statusByDistrict = await fetchall(
    `SELECT
       COALESCE(NULLIF(btrim(sd.district_name), ''), NULLIF(sm.district_id::text, ''), 'Not recorded') AS district,
       NULLIF(sm.district_id::text, '') AS district_id,
       COALESCE(NULLIF(btrim(sm.work_status), ''), 'Not reported') AS status,
       COUNT(*)::integer AS cnt
     FROM skilltracking_monitor sm
     LEFT JOIN skilltracking_district sd
       ON sd.district_id::text = sm.district_id::text
      AND sd.state_id::text = sm.state_id::text
     ${whereStr(dClauses)}
     GROUP BY 1, 2, 3
     ORDER BY 1, cnt DESC`,
    dParams
  );

  return {
    roster_count: total,
    total_trained: total,
    status_breakdown: statusBreakdown,
    monitored_people: monitoredPeople,
    status_by_district: statusByDistrict
  };
}

export async function getIncomeDistribution(filters) {
  return getSheetIncomeBuckets(filters);
}

export async function getSkillingDemographics(filters) {
  const { clauses, params } = lf(filters, {
    date_col: 'sp.created_at',
    state_col: 'sp.state_id',
    district_col: 'sp.district_id',
    trade_col: 'sp.training_stream_id'
  });
  const w = whereStr(clauses);

  const genderRows = await fetchall(
    `SELECT
       ${genderBucketSql('sp.gender')} AS gender,
       COUNT(*)::integer              AS cnt
     FROM skilltracking_persons sp
     ${w}
     GROUP BY 1
     ORDER BY cnt DESC`,
    params
  );

  const genderBreakdown = genderRows.map(r => ({
    gender: r.gender,
    count: r.cnt
  }));

  const ageQuery = `
    SELECT
      COALESCE(COUNT(CASE WHEN (CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CASE WHEN sp.dob ~ '^[0-9]{4}' THEN CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER) ELSE 0 END) < 18 THEN 1 END), 0)::integer AS u18,
      COALESCE(COUNT(CASE WHEN (CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CASE WHEN sp.dob ~ '^[0-9]{4}' THEN CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER) ELSE 0 END) BETWEEN 18 AND 25 THEN 1 END), 0)::integer AS a18_25,
      COALESCE(COUNT(CASE WHEN (CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CASE WHEN sp.dob ~ '^[0-9]{4}' THEN CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER) ELSE 0 END) BETWEEN 26 AND 35 THEN 1 END), 0)::integer AS a26_35,
      COALESCE(COUNT(CASE WHEN (CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CASE WHEN sp.dob ~ '^[0-9]{4}' THEN CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER) ELSE 0 END) BETWEEN 36 AND 45 THEN 1 END), 0)::integer AS a36_45,
      COALESCE(COUNT(CASE WHEN (CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CASE WHEN sp.dob ~ '^[0-9]{4}' THEN CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER) ELSE 0 END) > 45 THEN 1 END), 0)::integer AS a45plus
    FROM skilltracking_persons sp
    ${w}
  `;
  const ageRows = await fetchall(ageQuery, params);
  const ageRow = ageRows[0] || { u18: 0, a18_25: 0, a26_35: 0, a36_45: 0, a45plus: 0 };

  const ageBrackets = {
    "<18":   ageRow.u18,
    "18-25": ageRow.a18_25,
    "26-35": ageRow.a26_35,
    "36-45": ageRow.a36_45,
    "45+":   ageRow.a45plus,
  };

  return {
    gender_breakdown: genderBreakdown,
    age_brackets: ageBrackets
  };
}

export async function getBeneficiariesByTrade(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'sp.state_id',
    district_col: 'sp.district_id'
  });
  const w = whereStr(clauses);

  const rows = await fetchall(
    `SELECT
       COALESCE(ts.stream_name, sp.training_stream_id, 'Unknown') AS trade,
       COUNT(*)::integer AS cnt
     FROM skilltracking_persons sp
     LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
     ${w}
     GROUP BY ts.stream_name, sp.training_stream_id
     ORDER BY cnt DESC`,
    params
  );

  return rows.map(r => ({ trade: r.trade, count: r.cnt }));
}

export async function getSessionsByTrade(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'bl.state_id',
    district_col: 'bl.district_id'
  });
  const w = whereStr(clauses);

  const rows = await fetchall(
    `SELECT
       COALESCE(ts.stream_name, bl.course_id, 'Unknown') AS trade,
       COUNT(*)::integer AS batches
     FROM skilltracking_batch_list bl
     LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = bl.course_id
     ${w}
     GROUP BY ts.stream_name, bl.course_id
     ORDER BY batches DESC`,
    params
  );

  return rows.map(r => ({ trade: r.trade, batches: r.batches }));
}

export async function getBatchCourseStatus(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'bl.state_id',
    district_col: 'bl.district_id'
  });
  const start = `CASE WHEN bl.batch_start_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND bl.batch_start_date::text !~ '^(0000|1970)' THEN bl.batch_start_date::date END`;
  const end = `CASE WHEN bl.batch_end_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND bl.batch_end_date::text !~ '^(0000|1970)' THEN bl.batch_end_date::date END`;
  const rows = await fetchall(
    `SELECT
       COUNT(*)::integer AS total,
       COUNT(*) FILTER (WHERE ${start} IS NULL AND ${end} IS NULL)::integer AS no_dates,
       COUNT(*) FILTER (WHERE ${end} IS NOT NULL AND ${end} < CURRENT_DATE)::integer AS completed,
       COUNT(*) FILTER (
         WHERE ${start} IS NOT NULL
           AND ${start} <= CURRENT_DATE
           AND (${end} IS NULL OR ${end} >= CURRENT_DATE)
       )::integer AS ongoing,
       COUNT(*) FILTER (WHERE ${start} IS NOT NULL AND ${start} > CURRENT_DATE)::integer AS upcoming
     FROM skilltracking_batch_list bl
     ${whereStr(clauses)}`,
    params
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    completed: Number(row.completed) || 0,
    ongoing: Number(row.ongoing) || 0,
    upcoming: Number(row.upcoming) || 0,
    no_dates: Number(row.no_dates) || 0
  };
}

export async function getPlacementStatus(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'date_of_monitor'
  });
  const w = whereStr(clauses);

  const rows = await fetchall(
    `SELECT
       COALESCE(work_status, '') AS status,
       COUNT(*)::integer          AS cnt
     FROM skilltracking_monitor
     ${w}
     GROUP BY work_status
     ORDER BY cnt DESC`,
    params
  );

  const total = rows.reduce((sum, r) => sum + r.cnt, 0);
  const people = await scalar(
    `SELECT COUNT(DISTINCT person_id)::integer FROM skilltracking_monitor ${w}`,
    params
  );
  const breakdown = rows.map(r => ({
    status: r.status || 'Not Reported',
    count: r.cnt,
    percent: total ? parseFloat((r.cnt / total * 100).toFixed(1)) : 0
  }));

  const { clauses: gClauses, params: gParams } = lf(filters, {
    state_col: 'sm.state_id',
    district_col: 'sm.district_id',
    date_col: 'sm.date_of_monitor'
  });
  const genderRows = await fetchall(
    `SELECT ${genderBucketSql('sp.gender')} AS gender,
            COALESCE(NULLIF(btrim(sm.work_status), ''), 'Not reported') AS status,
            COUNT(*)::integer AS cnt
     FROM skilltracking_monitor sm
     LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
     ${whereStr(gClauses)}
     GROUP BY 1, 2`,
    gParams
  );
  const genderTitle = {
    Female: 'Female',
    Male: 'Male',
    Others: 'Others',
    'Not recorded': 'Gender not recorded'
  };
  const byGender = ['Female', 'Male', 'Others', 'Not recorded'].map((gender) => {
    const slices = genderRows.filter((row) => row.gender === gender);
    const n = slices.reduce((sum, row) => sum + row.cnt, 0);
    const percents = sharesOf100(slices.map((row) => row.cnt));
    return {
      gender: genderTitle[gender],
      total: n,
      breakdown: slices.map((row, index) => ({
        status: row.status,
        count: row.cnt,
        percent: percents[index] || 0
      }))
    };
  }).filter((group) => group.total > 0);

  return { total, people, breakdown, by_gender: byGender };
}

function sharesOf100(counts) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((n) => Math.round((n / total) * 1000) / 10);
  const drift = Math.round((100 - raw.reduce((sum, n) => sum + n, 0)) * 10) / 10;
  let index = 0;
  raw.forEach((n, i) => {
    if (n > raw[index]) index = i;
  });
  raw[index] = Math.round((raw[index] + drift) * 10) / 10;
  return raw;
}

export async function getPlacementIncomeRange(filters) {
  return getSheetIncomeBuckets(filters);
}

async function getSheetIncomeBuckets(filters) {
  const empty = { '0_5000': 0, '5001_10000': 0, '10001_plus': 0, source: 'education_mixprogram' };
  try {
    const { w, params } = mixSkillingWhere(filters, { workingOnly: true });
    const post = moneySql('m.post_income');
    const rows = await fetchall(
      `SELECT
         SUM(CASE WHEN ${post} IS NOT NULL AND ${post} <= 5000 THEN 1 ELSE 0 END)::integer AS "0_5000",
         SUM(CASE WHEN ${post} BETWEEN 5001 AND 10000 THEN 1 ELSE 0 END)::integer AS "5001_10000",
         SUM(CASE WHEN ${post} > 10000 THEN 1 ELSE 0 END)::integer AS "10001_plus"
       FROM education_mixprogram m
       ${w}`,
      params
    );
    const r = rows[0] || {};
    return {
      '0_5000': Number(r['0_5000']) || 0,
      '5001_10000': Number(r['5001_10000']) || 0,
      '10001_plus': Number(r['10001_plus']) || 0,
      source: 'education_mixprogram'
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] sheet income buckets skipped:', err.message);
    return empty;
  }
}

export async function getYoYIncome() {
  const empty = [];
  try {
    const { w, params } = mixSkillingWhere({}, { workingOnly: true });
    const post = moneySql('m.post_income');
    const rows = await fetchall(
      `SELECT
         COALESCE(NULLIF(TRIM(m.year), ''), 'Unknown') AS yr,
         COUNT(*)::integer AS working_rows,
         COUNT(${post})::integer AS with_income,
         COUNT(*) FILTER (
           WHERE ${post} IS NOT NULL
             AND (${post} < ${SHEET_INCOME_MIN} OR ${post} > ${SHEET_INCOME_MAX})
         )::integer AS outliers,
         COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY CASE
             WHEN ${post} BETWEEN ${SHEET_INCOME_MIN} AND ${SHEET_INCOME_MAX}
             THEN ${post}
           END
         ), 0) AS median_income,
         COALESCE(AVG(CASE
           WHEN ${post} BETWEEN ${SHEET_INCOME_MIN} AND ${SHEET_INCOME_MAX}
           THEN ${post}
         END), 0) AS avg_income
       FROM education_mixprogram m
       ${w}
       GROUP BY 1
       ORDER BY yr`,
      params
    );
    return rows.map((r) => ({
      year: r.yr,
      median_income: parseFloat(Number(r.median_income || 0).toFixed(0)),
      avg_income: parseFloat(Number(r.avg_income || 0).toFixed(0)),
      count: Number(r.with_income) || 0,
      working_rows: Number(r.working_rows) || 0,
      outliers: Number(r.outliers) || 0,
      source: 'education_mixprogram'
    }));
  } catch (err) {
    console.warn('[livelihoodAnalytics] sheet income by year skipped:', err.message);
    return empty;
  }
}

export async function getMentorshipStats(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id'
  });
  const w = whereStr(clauses);

  const total = await scalar(`SELECT COUNT(*)::integer FROM enterprise_support ${w}`, params);
  if (total === 0) {
    return { status: 'no_data', total_members: 0, active_members: 0, districts_covered: 0 };
  }

  const rows = await fetchall(
    `SELECT
       COUNT(*)::integer                          AS total_members,
       COUNT(CASE WHEN status = '1' THEN 1 END)::integer AS active_members,
       COUNT(DISTINCT district_id)::integer       AS districts_covered
     FROM enterprise_support
     ${w}`,
    params
  );
  const row = rows[0] || { total_members: 0, active_members: 0, districts_covered: 0 };

  return {
    total_members: row.total_members,
    active_members: row.active_members,
    districts_covered: row.districts_covered
  };
}

export async function getMarketAccessStats(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    financial_year_col: 'financial_year'
  });
  const maW = whereStr(clauses);

  // Fetch all raw rows from enterprise_market_access
  const agencies = await fetchall(
    `SELECT access_id, agency_name, sales_generated_average, market_access_type, financial_year, status
     FROM enterprise_market_access
     ${maW}
     ORDER BY agency_name`,
    params
  );

  const total_records = agencies.length;

  if (total_records === 0) {
    return {
      total_records: 0,
      agency_count: 0,
      total_sales_generated: 0,
      avg_sales_generated: 0,
      sales_generated_average_breakdown: [],
      market_access_type_breakdown: [],
      top_agencies: [],
      agencies: []
    };
  }

  // Parse sales values using existing parser
  const parsedSales = agencies.map(r => parseSalesGeneratedAverage(r.sales_generated_average)).filter(v => v !== null);
  const total_sales_generated = parsedSales.reduce((sum, v) => sum + v, 0);
  const avg_sales_generated = parsedSales.length > 0
    ? parseFloat((total_sales_generated / parsedSales.length).toFixed(2))
    : 0;

  // Unique agency count
  const agency_count = new Set(agencies.map(r => r.agency_name).filter(Boolean)).size;

  // Group by sales_generated_average string (raw label, not parsed)
  const salesBreakdownMap = {};
  for (const r of agencies) {
    const key = r.sales_generated_average || 'Not Reported';
    salesBreakdownMap[key] = (salesBreakdownMap[key] || 0) + 1;
  }
  const sales_generated_average_breakdown = Object.entries(salesBreakdownMap)
    .map(([sales_generated_average, count]) => ({ sales_generated_average, count }))
    .sort((a, b) => b.count - a.count);

  // Group by market_access_type
  const typeBreakdownMap = {};
  for (const r of agencies) {
    const key = r.market_access_type || 'Not Reported';
    typeBreakdownMap[key] = (typeBreakdownMap[key] || 0) + 1;
  }
  const market_access_type_breakdown = Object.entries(typeBreakdownMap)
    .map(([market_access_type, count]) => ({ market_access_type, count }))
    .sort((a, b) => b.count - a.count);

  // Top agencies by record count
  const agencyCountMap = {};
  for (const r of agencies) {
    const key = r.agency_name || 'Unknown';
    agencyCountMap[key] = (agencyCountMap[key] || 0) + 1;
  }
  const top_agencies = Object.entries(agencyCountMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total_records,
    agency_count,
    total_sales_generated,
    avg_sales_generated,
    sales_is_parsed_estimate: true,
    sales_generated_average_breakdown,
    market_access_type_breakdown,
    top_agencies,
    agencies
  };
}

export async function getFundingStats(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'es.state_id',
    district_col: 'es.district_id'
  });
  const w = whereStr(clauses);

  const joinBase = `
    FROM enterprise_support_monitoring em
    JOIN enterprise_support es ON es.member_id = em.member_id
    ${w}
  `;

  const total = await scalar(`SELECT COUNT(*)::integer ${joinBase}`, params);
  if (total === 0) {
    return { status: 'no_data', fy_covered: 0, latest_fy_profit: 0, yoy_growth_pct: 0 };
  }

  const fyRows = await fetchall(
    `SELECT
       em.financial_year,
       COALESCE(SUM(CASE WHEN em.profit ~ '^[0-9\\-]+$' THEN em.profit::bigint ELSE 0 END), 0)::bigint AS fy_profit
     ${joinBase}
     GROUP BY em.financial_year
     ORDER BY em.financial_year`,
    params
  );

  const fyList = fyRows.map(r => [r.financial_year, r.fy_profit]);
  const fyCovered = fyList.length;
  const latestFyProfit = fyList.length > 0 ? fyList[fyList.length - 1][1] : 0;
  const prevFyProfit   = fyList.length >= 2 ? fyList[fyList.length - 2][1] : 0;

  let yoyGrowthPct = 0;
  if (prevFyProfit) {
    yoyGrowthPct = parseFloat(((latestFyProfit - prevFyProfit) / prevFyProfit * 100).toFixed(1));
  }

  return {
    fy_covered: fyCovered,
    latest_fy: fyList.length > 0 ? fyList[fyList.length - 1][0] : '—',
    latest_fy_profit: latestFyProfit,
    yoy_growth_pct: yoyGrowthPct,
    fy_breakdown: fyList.map(([fy, p]) => ({ fy, profit: p }))
  };
}

export async function getPrePostStats(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    financial_year_col: 'financial_year'
  });
  const w = whereStr(clauses);

  const query = `
    SELECT 
      trade_name,
      assessment_type,
      SUM(COALESCE(NULLIF(candidates_trained, '')::integer, 0))::integer AS trained,
      SUM(COALESCE(NULLIF(male_count, '')::integer, 0))::integer AS male,
      SUM(COALESCE(NULLIF(female_count, '')::integer, 0))::integer AS female,
      SUM(COALESCE(NULLIF(placement_status, '')::integer, 0))::integer AS placed
    FROM skilltracking_pre_post_master
    ${w}
    GROUP BY trade_name, assessment_type
    ORDER BY trade_name, assessment_type
  `;
  const rows = await fetchall(query, params);
  return rows;
}

export async function getLivelihoodGeoBenchmarks(filters) {
  const grain = filters?.state_id ? 'district' : 'state';
  const empty = { grain, unit: 'people', rows: [], state_average: 0, programme_average: 0, programme_n: 0, state_n: 0 };
  const peerFilters = grain === 'district' ? stripDistrict(filters) : stripGeo(filters);
  const programmeFilters = stripGeo(filters);
  const opts = {
    date_col: 'sp.created_at',
    state_col: 'sp.state_id',
    district_col: 'sp.district_id',
    ...GEO
  };
  const joinSelect = grain === 'district'
    ? `COALESCE(
         (SELECT NULLIF(TRIM(d.district_name), '') FROM skilltracking_district d
          WHERE d.district_id::text = sp.district_id::text
            AND d.state_id::text = sp.state_id::text
          ORDER BY d.district_name LIMIT 1),
         sp.district_id::text, 'Unknown') AS label,
       sp.district_id::text AS id`
    : `COALESCE(
         (SELECT NULLIF(TRIM(s.state_name), '') FROM skilltracking_state s
          WHERE s.state_id::text = sp.state_id::text
          ORDER BY s.state_name LIMIT 1),
         sp.state_id::text, 'Unknown') AS label,
       sp.state_id::text AS id`;
  const joinSql = '';
  const groupSql = grain === 'district'
    ? `GROUP BY sp.state_id, sp.district_id`
    : `GROUP BY sp.state_id`;

  const run = async (f, limit) => {
    const { clauses, params } = lf(f, opts);
    const lim = limit ? `LIMIT ${Number(limit)}` : '';
    return fetchall(
      `SELECT ${joinSelect}, COUNT(*)::integer AS value
       FROM skilltracking_persons sp
       ${joinSql}
       ${whereStr(clauses)}
       ${groupSql}
       ORDER BY value DESC
       ${lim}`,
      params
    );
  };

  try {
    const [peerRows, programmeRows] = await Promise.all([run(peerFilters), run(programmeFilters)]);
    const stateAverage = grain === 'district' ? mean(peerRows.map((r) => r.value)) : 0;
    const programmeAverage = mean(programmeRows.map((r) => r.value));
    const display = (grain === 'district' ? peerRows : programmeRows).slice(0, 12);
    return {
      grain,
      unit: 'people',
      rows: withPeerAverages(display, stateAverage, programmeAverage),
      state_average: Number(stateAverage.toFixed(1)),
      programme_average: Number(programmeAverage.toFixed(1)),
      programme_n: programmeRows.length,
      state_n: grain === 'district' ? peerRows.length : 0
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] geo benchmarks skipped:', err.message);
    return empty;
  }
}

export async function getPlacementFunnel(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'created_at'
  });
  const w = whereStr(clauses);
  const { clauses: mClauses, params: mParams } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'date_of_monitor'
  });
  const mw = whereStr(mClauses);

  try {
    const roster = await scalar(`SELECT COALESCE(COUNT(*), 0)::integer FROM skilltracking_persons ${w}`, params);
    const monitored = await scalar(
      `SELECT COALESCE(COUNT(DISTINCT person_id), 0)::integer FROM skilltracking_monitor ${mw}`,
      mParams
    );
    const working = await scalar(
      `SELECT COALESCE(COUNT(DISTINCT person_id), 0)::integer
       FROM skilltracking_monitor
       ${mw}${mw ? ' AND' : ' WHERE'} work_status = 'Working'`,
      mParams
    );
    let earning = 0;
    try {
      const { w: sw, params: sparams } = mixSkillingWhere(filters);
      earning = await scalar(
        `SELECT COALESCE(COUNT(*), 0)::integer
         FROM education_mixprogram m
         ${sw} AND ${moneySql('m.post_income')} > 0`,
        sparams
      );
    } catch (err) {
      console.warn('[livelihoodAnalytics] sheet earning count skipped:', err.message);
    }
    const stages = [
      { key: 'roster', label: 'On roster', value: roster },
      { key: 'monitored', label: 'Monitored', value: monitored },
      { key: 'working', label: 'Working', value: working },
      { key: 'earning', label: 'Field sheet with post income', value: earning }
    ].map((s, i, list) => ({
      ...s,
      pct_of_first: list[0].value > 0 ? Number(((s.value / list[0].value) * 100).toFixed(1)) : 0,
      conversion_from_prev: i === 0 || list[i - 1].value === 0
        ? null
        : Number(((s.value / list[i - 1].value) * 100).toFixed(1))
    }));
    return { stages };
  } catch (err) {
    console.warn('[livelihoodAnalytics] funnel skipped:', err.message);
    return { stages: [] };
  }
}

export const TIME_TO_PLACEMENT_BUCKETS = [
  '0–30 days',
  '31–90 days',
  '91–180 days',
  '181–365 days',
  'Over a year',
  'Not placed'
];

export const INCOME_DELTA_BUCKETS = [
  'Income fell',
  'No change',
  '+₹1–2,000',
  '+₹2,001–5,000',
  '+₹5,000+',
  'No income pair'
];

export function incomeDeltaSql(pre, post) {
  return `CASE
    WHEN ${pre} IS NULL OR ${post} IS NULL THEN 'No income pair'
    WHEN ${post} - ${pre} < 0 THEN 'Income fell'
    WHEN ${post} - ${pre} = 0 THEN 'No change'
    WHEN ${post} - ${pre} <= 2000 THEN '+₹1–2,000'
    WHEN ${post} - ${pre} <= 5000 THEN '+₹2,001–5,000'
    ELSE '+₹5,000+'
  END`;
}

async function incomeChangeBuckets(pre, post, whereSql, params) {
  const rows = await fetchall(
    `SELECT ${incomeDeltaSql(pre, post)} AS label,
            ${genderBucketSql('m.person_gender')} AS gender,
            COUNT(*)::integer AS value
     FROM education_mixprogram m
     ${whereSql}
       AND ${pre} IS NOT NULL
       AND ${post} IS NOT NULL
     GROUP BY 1, 2`,
    params
  );
  const labels = INCOME_DELTA_BUCKETS.filter((label) => label !== 'No income pair');
  return labels.map((label) => {
    const match = (gender) => rows
      .filter((row) => row.label === label && row.gender === gender)
      .reduce((sum, row) => sum + (Number(row.value) || 0), 0);
    const female = match('Female');
    const male = match('Male');
    const notRecorded = match('Not recorded');
    const others = match('Others');
    return {
      label,
      female,
      male,
      not_recorded: notRecorded,
      others,
      value: female + male + notRecorded + others
    };
  });
}

/** One row per person: first/last monitor via window functions, then bucket labels. */
export function placementWindowCte(whereSql) {
  return `
  WITH cleaned AS (
    SELECT person_id, work_status, monthly_income, date_of_monitor
    FROM skilltracking_monitor
    ${whereSql}
  ),
  windowed AS (
    SELECT
      person_id,
      FIRST_VALUE(date_of_monitor) OVER (
        PARTITION BY person_id ORDER BY date_of_monitor
      ) AS first_dt,
      FIRST_VALUE(CASE WHEN work_status = 'Working' THEN date_of_monitor END) OVER (
        PARTITION BY person_id
        ORDER BY CASE WHEN work_status = 'Working' THEN 0 ELSE 1 END,
                 date_of_monitor
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
      ) AS first_working_dt,
      FIRST_VALUE(CASE WHEN monthly_income ~ '^[0-9]+$' THEN monthly_income::integer END) OVER (
        PARTITION BY person_id
        ORDER BY CASE WHEN monthly_income ~ '^[0-9]+$' THEN 0 ELSE 1 END,
                 date_of_monitor
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
      ) AS first_income,
      FIRST_VALUE(CASE WHEN monthly_income ~ '^[0-9]+$' THEN monthly_income::integer END) OVER (
        PARTITION BY person_id
        ORDER BY CASE WHEN monthly_income ~ '^[0-9]+$' THEN 0 ELSE 1 END,
                 date_of_monitor DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
      ) AS last_income
    FROM cleaned
  ),
  people AS (
    SELECT DISTINCT ON (windowed.person_id)
      windowed.person_id,
      windowed.first_dt,
      windowed.first_working_dt,
      windowed.first_income,
      windowed.last_income,
      sp.date_of_completion_of_training AS completion_dt
    FROM windowed
    LEFT JOIN skilltracking_persons sp ON sp.person_id = windowed.person_id
    ORDER BY windowed.person_id
  ),
  classified AS (
    SELECT
      person_id,
      first_dt,
      first_working_dt,
      first_income,
      last_income,
      completion_dt,
      CASE
        WHEN completion_dt::text ~ '^(0000|1970)'
          OR first_working_dt::text ~ '^(0000|1970)'
          THEN 'Bad date'
        WHEN NULLIF(btrim(COALESCE(completion_dt::text, '')), '') IS NULL
          OR first_working_dt IS NULL
          OR completion_dt::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          OR first_working_dt::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          THEN 'Not placed'
        WHEN (first_working_dt::date - completion_dt::date) < 0 THEN 'Negative'
        WHEN (first_working_dt::date - completion_dt::date) <= 30 THEN '0–30 days'
        WHEN (first_working_dt::date - completion_dt::date) <= 90 THEN '31–90 days'
        WHEN (first_working_dt::date - completion_dt::date) <= 180 THEN '91–180 days'
        WHEN (first_working_dt::date - completion_dt::date) <= 365 THEN '181–365 days'
        ELSE 'Over a year'
      END AS time_bucket,
      CASE
        WHEN first_income IS NULL OR last_income IS NULL THEN 'No income pair'
        WHEN last_income - first_income < 0 THEN 'Income fell'
        WHEN last_income - first_income = 0 THEN 'No change'
        WHEN last_income - first_income <= 2000 THEN '+₹1–2,000'
        WHEN last_income - first_income <= 5000 THEN '+₹2,001–5,000'
        ELSE '+₹5,000+'
      END AS delta_bucket
    FROM people
  )`;
}

export async function getPlacementDistributions(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'date_of_monitor'
  });
  const w = whereStr(clauses);
  const empty = {
    time_to_placement: [],
    income_delta: [],
    median_days: null,
    n: 0,
    excluded_bad_date: 0,
    excluded_negative: 0
  };
  const cte = placementWindowCte(w);

  try {
    const timeRows = await fetchall(
      `${cte}
       SELECT time_bucket AS label, COUNT(*)::integer AS value
       FROM classified
       GROUP BY time_bucket`,
      params
    );
    const summaryRows = await fetchall(
      `${cte}
       SELECT
         COUNT(*) FILTER (WHERE time_bucket = 'Bad date')::integer AS bad_dates,
         COUNT(*) FILTER (WHERE time_bucket = 'Negative')::integer AS negative,
         COUNT(*) FILTER (
           WHERE time_bucket NOT IN ('Bad date', 'Negative', 'Not placed')
         )::integer AS n,
         PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY (first_working_dt::date - completion_dt::date)
         ) FILTER (
           WHERE time_bucket NOT IN ('Bad date', 'Negative', 'Not placed')
         ) AS median_days
       FROM classified`,
      params
    );
    const timeMap = new Map(timeRows.map((r) => [r.label, Number(r.value) || 0]));
    const summary = summaryRows[0] || {};
    const pre = validIncomeSql('m.pre_income');
    const post = validIncomeSql('m.post_income');
    const { w: sw, params: sparams } = mixSkillingWhere(filters);
    let incomeDelta = [];
    try {
      incomeDelta = await incomeChangeBuckets(pre, post, sw, sparams);
    } catch (err) {
      console.warn('[livelihoodAnalytics] sheet income delta skipped:', err.message);
    }
    return {
      time_to_placement: TIME_TO_PLACEMENT_BUCKETS.map((label) => ({
        label,
        value: timeMap.get(label) || 0
      })),
      median_days: summary.median_days == null ? null : Math.round(Number(summary.median_days)),
      n: Number(summary.n) || 0,
      excluded_bad_date: Number(summary.bad_dates) || 0,
      excluded_negative: Number(summary.negative) || 0,
      income_delta: incomeDelta
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] distributions skipped:', err.message);
    return empty;
  }
}

/** Each later year is a running total. `added` is this year minus the previous year. */
export function farmerIncrements(rows, valueKey = 'farmers') {
  const sorted = [...(rows || [])].sort((a, b) => String(a.year).localeCompare(String(b.year)));
  let prev = null;
  return sorted.map((r, idx) => {
    const stock = Number(r[valueKey] ?? r.stock ?? r.value) || 0;
    const added = prev == null ? stock : Math.max(0, stock - prev);
    const dropped = prev != null && stock < prev ? prev - stock : 0;
    const out = {
      year: r.year,
      stock,
      added,
      dropped,
      opening: idx === 0
    };
    prev = stock;
    return out;
  });
}

export async function fetchFarmerYearSeries() {
  const empty = { by_year: [], locations_by_year: {} };
  try {
    const yearRows = await fetchall(
      `SELECT m.year,
              COALESCE(SUM(m.number_of_farmers), 0)::integer AS farmers
       FROM education_mixprogram m
       WHERE ${MIX_CANONICAL_ROW} AND m.program_id::text IN ('1','2')
         AND NULLIF(TRIM(m.year), '') IS NOT NULL
       GROUP BY m.year
       ORDER BY m.year`
    );
    const locRows = await fetchall(
      `SELECT m.year,
              COALESCE(${displaySql('m.location')}, 'Unknown') AS label,
              COALESCE(SUM(m.number_of_farmers), 0)::integer AS farmers
       FROM education_mixprogram m
       WHERE ${MIX_CANONICAL_ROW} AND m.program_id::text IN ('1','2')
         AND NULLIF(TRIM(m.year), '') IS NOT NULL
       GROUP BY m.year, ${foldSql('m.location')}
       ORDER BY m.year, farmers DESC`
    );
    const byYear = farmerIncrements(yearRows);
    const locHistory = {};
    for (const row of locRows) {
      if (!locHistory[row.label]) locHistory[row.label] = [];
      locHistory[row.label].push({ year: row.year, farmers: Number(row.farmers) || 0 });
    }
    const locationsByYear = {};
    for (const [label, hist] of Object.entries(locHistory)) {
      for (const point of farmerIncrements(hist)) {
        if (!locationsByYear[point.year]) locationsByYear[point.year] = [];
        locationsByYear[point.year].push({
          label,
          value: point.stock,
          stock: point.stock,
          added: point.added,
          dropped: point.dropped,
          opening: point.opening
        });
      }
    }
    Object.keys(locationsByYear).forEach((yr) => {
      locationsByYear[yr].sort((a, b) => (b.stock || b.value) - (a.stock || a.value));
    });
    return { by_year: byYear, locations_by_year: locationsByYear };
  } catch (err) {
    console.warn('[livelihoodAnalytics] farmer year series skipped:', err.message);
    return empty;
  }
}

export async function getMixprogramFarmers(filters) {
  const year = filters?.academic_year || filters?.financial_year;
  const params = {};
  const yearClauses = [MIX_CANONICAL_ROW];
  const yearClause = bindIn('m.year', financialYearAliases(year), 'year', params);
  if (yearClause) yearClauses.push(yearClause);
  const farmerWhere = whereStr([...yearClauses, `m.program_id::text IN ('1','2')`]);
  const otherWhere = whereStr([
    ...yearClauses,
    `m.program_id::text NOT IN ('1','2','3','4','5','6','7','8','9','10','11','12')`
  ]);
  const empty = {
    status: 'no_data',
    farmers: 0,
    locations: 0,
    by_location: [],
    by_year: [],
    locations_by_year: {},
    other: []
  };
  try {
    let farmers = 0;
    let locations = 0;
    let byLocation = [];
    try {
      const kpis = await fetchall(
        `SELECT COALESCE(SUM(m.number_of_farmers), 0)::integer AS farmers,
                COUNT(DISTINCT ${foldSql('m.location')}) FILTER (WHERE NULLIF(btrim(m.location), '') IS NOT NULL)::integer AS locations
         FROM education_mixprogram m
         ${farmerWhere}`,
        params
      );
      byLocation = await fetchall(
        `SELECT COALESCE(${displaySql('m.location')}, 'Unknown') AS label,
                COALESCE(SUM(m.number_of_farmers), 0)::integer AS value
         FROM education_mixprogram m
         ${farmerWhere}
         GROUP BY ${foldSql('m.location')}
         ORDER BY value DESC`,
        params
      );
      farmers = Number(kpis[0]?.farmers) || 0;
      byLocation = withCanonicalPlaces(mergeSimilarLabels(byLocation.filter((r) => Number(r.value) > 0)));
      locations = byLocation.length;
    } catch (err) {
      console.warn('[livelihoodAnalytics] mixprogram farmers columns skipped:', err.message);
    }

    let other = [];
    try {
      const otherPrograms = await fetchall(
        `SELECT m.program_id::text AS program_id,
                COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text) AS label,
                COUNT(*)::integer AS rows,
                COUNT(DISTINCT ${foldSql('m.location')}) FILTER (WHERE NULLIF(btrim(m.location), '') IS NOT NULL)::integer AS locations
         FROM education_mixprogram m
         LEFT JOIN skilltracking_program p ON p.program_id::text = m.program_id::text
         ${otherWhere}
         GROUP BY m.program_id, p.program_name
         ORDER BY rows DESC`,
        params
      );
      const otherLocations = await fetchall(
        `SELECT m.program_id::text AS program_id,
                COALESCE(${displaySql('m.location')}, 'Unknown') AS label,
                COUNT(*)::integer AS value
         FROM education_mixprogram m
         ${otherWhere}
         GROUP BY m.program_id, ${foldSql('m.location')}
         ORDER BY value DESC`,
        params
      );
      const locByPid = {};
      for (const row of otherLocations) {
        if (!locByPid[row.program_id]) locByPid[row.program_id] = [];
        locByPid[row.program_id].push({ label: row.label, value: Number(row.value) || 0 });
      }
      Object.keys(locByPid).forEach((pid) => {
        locByPid[pid] = withCanonicalPlaces(mergeSimilarLabels(locByPid[pid]));
      });
      other = otherPrograms.map((p) => ({
        program_id: p.program_id,
        label: p.label,
        rows: Number(p.rows) || 0,
        locations: Number(p.locations) || 0,
        by_location: locByPid[p.program_id] || []
      }));
    } catch (err) {
      console.warn('[livelihoodAnalytics] mixprogram other skipped:', err.message);
    }

    const yearSeries = await fetchFarmerYearSeries();
    if (!farmers && !other.length && !yearSeries.by_year.length) {
      return empty;
    }
    return {
      status: 'ok',
      farmers,
      locations,
      by_location: byLocation,
      by_year: yearSeries.by_year,
      locations_by_year: yearSeries.locations_by_year,
      other
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] mixprogram farmers skipped:', err.message);
    return empty;
  }
}

export async function getMixprogramSkilling(filters) {
  const { clauses, params } = mixYearClauses(filters);
  clauses.push(`m.program_id::text = '11'`);
  const w = whereStr(clauses);
  const empty = { status: 'no_data' };
  try {
    const kpis = await fetchall(
      `SELECT COUNT(*)::integer AS people,
              COUNT(DISTINCT ${foldSql('m.course_name')}) FILTER (WHERE NULLIF(btrim(m.course_name), '') IS NOT NULL)::integer AS courses,
              COUNT(DISTINCT ${foldSql('m.location')}) FILTER (WHERE NULLIF(btrim(m.location), '') IS NOT NULL)::integer AS locations,
              COUNT(${validIncomeSql('m.pre_income')})::integer AS with_pre,
              COUNT(${validIncomeSql('m.post_income')})::integer AS with_post,
              COUNT(*) FILTER (
                WHERE ${validIncomeSql('m.pre_income')} IS NOT NULL
                  AND ${validIncomeSql('m.post_income')} IS NOT NULL
              )::integer AS with_both,
              COALESCE(AVG(${validIncomeSql('m.pre_income')}), 0) AS avg_pre,
              COALESCE(AVG(${validIncomeSql('m.post_income')}), 0) AS avg_post
       FROM education_mixprogram m
       ${w}`,
      params
    );
    const people = Number(kpis[0]?.people) || 0;
    if (!people) return empty;
    const byCourse = await fetchall(
      `SELECT COALESCE(${displaySql('m.course_name')}, 'Unknown') AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w}
       GROUP BY ${foldSql('m.course_name')} ORDER BY value DESC`,
      params
    );
    const byGender = await fetchall(
      `SELECT ${genderBucketSql('m.person_gender')} AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w}
       GROUP BY 1 ORDER BY value DESC`,
      params
    );
    const byPlacement = await fetchall(
      `SELECT ${placementStatusSql('m.placement_status')} AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w}
       GROUP BY 1 ORDER BY value DESC`,
      params
    );
    const byCategory = await fetchall(
      `SELECT COALESCE(${displaySql('m.person_category')}, 'Unknown') AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w}
       GROUP BY ${softFoldSql('m.person_category')} ORDER BY value DESC`,
      params
    );
    const byCourseIncome = await fetchall(
      `SELECT COALESCE(${displaySql('m.course_name')}, 'Unknown') AS label,
              COALESCE(AVG(${validIncomeSql('m.pre_income')}), 0) AS avg_pre,
              COALESCE(AVG(${validIncomeSql('m.post_income')}), 0) AS avg_post,
              COUNT(${validIncomeSql('m.pre_income')})::integer AS n_pre,
              COUNT(${validIncomeSql('m.post_income')})::integer AS n_post
       FROM education_mixprogram m ${w}
       GROUP BY ${foldSql('m.course_name')}
       HAVING COUNT(${validIncomeSql('m.pre_income')}) > 0
           OR COUNT(${validIncomeSql('m.post_income')}) > 0
       ORDER BY n_post DESC, n_pre DESC`,
      params
    );
    const pre = validIncomeSql('m.pre_income');
    const post = validIncomeSql('m.post_income');
    const incomeChange = await incomeChangeBuckets(
      pre,
      post,
      `${w} AND ${pre} IS NOT NULL AND ${post} IS NOT NULL`,
      params
    );
    const locCourse = await fetchall(
      `SELECT COALESCE(${displaySql('m.location')}, 'Unknown') AS location,
              COALESCE(${displaySql('m.course_name')}, 'Unknown') AS course,
              COUNT(*)::integer AS value
       FROM education_mixprogram m ${w}
       GROUP BY ${foldSql('m.location')}, ${foldSql('m.course_name')}`,
      params
    );
    const courses = [...new Set(locCourse.map((r) => r.course))].slice(0, 10);
    const locations = [...new Set(locCourse.map((r) => r.location))].slice(0, 12);
    const map = new Map(locCourse.map((r) => [`${r.course}\t${r.location}`, Number(r.value) || 0]));
    const cells = [];
    courses.forEach((c, xi) => {
      locations.forEach((l, yi) => cells.push([xi, yi, map.get(`${c}\t${l}`) || 0]));
    });
    return {
      status: 'ok',
      people,
      courses: Number(kpis[0]?.courses) || 0,
      locations: Number(kpis[0]?.locations) || 0,
      with_pre: Number(kpis[0]?.with_pre) || 0,
      with_post: Number(kpis[0]?.with_post) || 0,
      with_both: Number(kpis[0]?.with_both) || 0,
      avg_pre: Number(kpis[0]?.avg_pre) || 0,
      avg_post: Number(kpis[0]?.avg_post) || 0,
      by_course: byCourse,
      by_course_income: byCourseIncome,
      by_gender: byGender,
      by_placement: byPlacement,
      by_category: byCategory,
      income_change: incomeChange,
      heatmap: { x: courses, y: locations, cells }
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] mixprogram skilling skipped:', err.message);
    return empty;
  }
}

export async function getMixprogramDidi(filters) {
  const { clauses, params } = mixYearClauses(filters);
  clauses.push(`m.program_id::text = '12'`);
  const w = whereStr(clauses);
  const empty = { status: 'no_data' };
  try {
    const kpis = await fetchall(
      `SELECT COUNT(*)::integer AS people,
              COUNT(*) FILTER (WHERE ${moneySql('m.pre_income')} IS NOT NULL)::integer AS with_pre,
              COUNT(*) FILTER (WHERE ${moneySql('m.post_income')} IS NOT NULL)::integer AS with_post,
              COALESCE(AVG(${moneySql('m.pre_income')}), 0) AS avg_pre,
              COALESCE(AVG(${moneySql('m.post_income')}), 0) AS avg_post,
              COUNT(*) FILTER (WHERE ${moneySql('m.pre_income_individual')} IS NOT NULL)::integer AS with_pre_ind,
              COUNT(*) FILTER (WHERE ${moneySql('m.post_income_individual')} IS NOT NULL)::integer AS with_post_ind,
              COALESCE(AVG(${moneySql('m.pre_income_individual')}), 0) AS avg_pre_ind,
              COALESCE(AVG(${moneySql('m.post_income_individual')}), 0) AS avg_post_ind
       FROM education_mixprogram m ${w}`,
      params
    );
    const people = Number(kpis[0]?.people) || 0;
    if (!people) return empty;
    const phaseLabel = phaseLabelSql('m.phase');
    const byPhase = await fetchall(
      `SELECT ${phaseLabel} AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w}
       GROUP BY 1
       ORDER BY CASE
         WHEN ${phaseLabel} ~ '^Phase [0-9]+$' THEN substring(${phaseLabel} from '[0-9]+')::integer
         ELSE 999
       END, 1`,
      params
    );
    const byType = await fetchall(
      `SELECT COALESCE(${displaySql('m.training_type')}, 'Unknown') AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w} GROUP BY ${softFoldSql('m.training_type')} ORDER BY value DESC`,
      params
    );
    const byGender = await fetchall(
      `SELECT ${genderBucketSql('m.person_gender')} AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w} GROUP BY 1 ORDER BY value DESC`,
      params
    );
    const byLocation = await fetchall(
      `SELECT COALESCE(${displaySql('m.location')}, 'Unknown') AS label, COUNT(*)::integer AS value
       FROM education_mixprogram m ${w} GROUP BY ${foldSql('m.location')} ORDER BY value DESC`,
      params
    );
    const preInd = validIncomeSql('m.pre_income_individual');
    const postInd = validIncomeSql('m.post_income_individual');
    const incomeChange = await incomeChangeBuckets(
      preInd,
      postInd,
      `${w} AND ${preInd} IS NOT NULL AND ${postInd} IS NOT NULL`,
      params
    );
    return {
      status: 'ok',
      people,
      with_pre: Number(kpis[0]?.with_pre) || 0,
      with_post: Number(kpis[0]?.with_post) || 0,
      avg_pre: Number(kpis[0]?.avg_pre) || 0,
      avg_post: Number(kpis[0]?.avg_post) || 0,
      with_pre_ind: Number(kpis[0]?.with_pre_ind) || 0,
      with_post_ind: Number(kpis[0]?.with_post_ind) || 0,
      avg_pre_ind: Number(kpis[0]?.avg_pre_ind) || 0,
      avg_post_ind: Number(kpis[0]?.avg_post_ind) || 0,
      by_phase: byPhase,
      by_type: byType,
      by_gender: byGender,
      by_location: withCanonicalPlaces(mergeSimilarLabels(byLocation)),
      income_change: incomeChange
    };
  } catch (err) {
    console.warn('[livelihoodAnalytics] mixprogram didi skipped:', err.message);
    return empty;
  }
}
