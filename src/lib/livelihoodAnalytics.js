import { fetchall, scalar } from './db.js';
import { buildFilters, whereStr, validDateClause } from './analytics.js';

const GEO = { module: 'livelihood' };

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
    status: r.status || 'Not Reported',
    count: r.cnt
  }));

  return {
    roster_count: total,
    total_trained: total,
    status_breakdown: statusBreakdown,
    caption: 'Roster count of skilltracking_persons. Do not read as “trained” until L1 is defined. Work status is the monitored subset only.'
  };
}

export async function getIncomeDistribution(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'date_of_monitor'
  });
  const w = whereStr(clauses);
  return await _incomeBuckets(w, params, false);
}

export async function getSkillingDemographics(filters) {
  const { clauses, params } = lf(filters, {
    date_col: 'sp.created_at',
    state_col: 'sp.state_id',
    district_col: 'sp.district_id',
    trade_col: 'sp.training_stream_id'
  });
  const w = whereStr(clauses);

  const joinClause = `
    FROM skilltracking_persons sp
    LEFT JOIN skilltracking_monitor sm ON sm.person_id = sp.person_id
    ${w}
  `;

  const genderRows = await fetchall(
    `SELECT
       COALESCE(sp.gender, 'Unknown') AS gender,
       COUNT(*)::integer              AS cnt,
       COALESCE(AVG(CASE WHEN sm.monthly_income ~ '^[0-9]+$' THEN sm.monthly_income::integer ELSE null END), 0) AS avg_income
     ${joinClause}
     GROUP BY sp.gender
     ORDER BY cnt DESC`,
    params
  );

  const genderBreakdown = genderRows.map(r => ({
    gender: r.gender,
    count: r.cnt,
    avg_income: parseFloat(parseFloat(r.avg_income).toFixed(2))
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
  const breakdown = rows.map(r => ({
    status: r.status || 'Not Reported',
    count: r.cnt,
    percent: total ? parseFloat((r.cnt / total * 100).toFixed(1)) : 0
  }));

  return { total, breakdown };
}

export async function getPlacementIncomeRange(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    date_col: 'date_of_monitor'
  });
  const w = whereStr(clauses);
  return await _incomeBuckets(w, params, true);
}

export async function getYoYIncome(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'state_id',
    district_col: 'district_id'
  });
  clauses.push(validDateClause('date_of_monitor'));
  const w = whereStr(clauses);

  const rows = await fetchall(
    `SELECT
       SUBSTR(date_of_monitor::text, 1, 4)                     AS yr,
       COALESCE(AVG(CASE WHEN monthly_income ~ '^[0-9]+$' THEN monthly_income::integer ELSE null END), 0)  AS avg_income,
       COUNT(*)::integer                                       AS count
     FROM skilltracking_monitor
     ${w}
     GROUP BY SUBSTR(date_of_monitor::text, 1, 4)
     ORDER BY yr`,
    params
  );

  return rows.map(r => ({
    year: r.yr,
    avg_income: parseFloat(parseFloat(r.avg_income).toFixed(2)),
    count: r.count
  }));
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
    sales_caption: 'Parsed estimate from sales_generated_average text (e.g. “1 LAKH +”), not an audited total.',
    sales_generated_average_breakdown,
    market_access_type_breakdown,
    top_agencies,
    agencies
  };
}

export async function getFundingStats(filters) {
  const { clauses, params } = lf(filters, {
    state_col: 'es.state_id',
    district_col: 'es.district_id',
    financial_year_col: 'em.financial_year'
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
