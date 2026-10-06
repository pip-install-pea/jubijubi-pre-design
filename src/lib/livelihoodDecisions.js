import { fetchall } from './db.js';
import { bindIn, buildFilters, financialYearAliases, whereStr } from './analytics.js';
import { MIX_CANONICAL_ROW } from './educationAnalytics.js';
import {
  genderBucketSql,
  mixWorkingSql,
  monthFilterSql,
  placementStatusSql,
  validIncomeSql
} from './livelihoodAnalytics.js';

/** Client decision 6 Oct 2026 (tracker row 17). Edit this list if JBF changes the definition (e.g. to count Homemaker). */
export const PLACEMENT_ELIGIBLE_STATUSES = ['Working', 'Self employment', 'Job searching'];

/** Tracker row 29. The market-access query still runs; the tile stays hidden while this is false. */
export const SHOW_MARKET_SALES_TOTAL = false;

export const DIDI_LABEL = 'Didi ki Dukan';

const AGE_ORDER = ['<18', '18-25', '26-35', '36-45', '45+', 'Age not recorded'];
const GENDERS = ['Female', 'Male', 'Others', 'Not recorded'];

function oneDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(1));
}

function rate(part, whole) {
  const n = Number(part) || 0;
  const d = Number(whole) || 0;
  return d ? oneDecimal((n / d) * 100) : null;
}

export function placementEligibleSql(col = 'm.placement_status') {
  const status = placementStatusSql(col);
  const list = PLACEMENT_ELIGIBLE_STATUSES.map((name) => `'${name}'`).join(', ');
  return `${status} IN (${list})`;
}

function sheetWhere(filters, { programId = '11', workingOnly = false, applyYear = true, applyMonth = true } = {}) {
  const params = { program_id: String(programId) };
  const clauses = [MIX_CANONICAL_ROW, `m.program_id::text = :program_id`];
  if (applyYear) {
    const year = filters?.academic_year || filters?.financial_year;
    const yearClause = bindIn('m.year', financialYearAliases(year), 'year', params);
    if (yearClause) clauses.push(yearClause);
  }
  if (applyMonth) {
    const monthClause = monthFilterSql('m.month', filters, params, { textMonth: true });
    if (monthClause) clauses.push(monthClause);
  }
  if (workingOnly) clauses.push(mixWorkingSql());
  return { clauses, params, w: whereStr(clauses) };
}

function rosterWhere(filters) {
  const built = buildFilters(filters, {
    module: 'livelihood',
    date_col: 'sp.created_at',
    state_col: 'sp.state_id',
    district_col: 'sp.district_id',
    trade_col: 'sp.training_stream_id'
  });
  const monthClause = monthFilterSql('sp.created_at', filters, built.params);
  if (monthClause) built.clauses.push(monthClause);
  return built;
}

const AGE_YEARS = `(CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER))`;

export const AGE_BAND_SQL = `CASE
  WHEN sp.dob IS NULL OR btrim(sp.dob::text) = '' OR sp.dob::text !~ '^[0-9]{4}' THEN 'Age not recorded'
  WHEN ${AGE_YEARS} < 0 OR ${AGE_YEARS} > 100 THEN 'Age not recorded'
  WHEN ${AGE_YEARS} < 18 THEN '<18'
  WHEN ${AGE_YEARS} BETWEEN 18 AND 25 THEN '18-25'
  WHEN ${AGE_YEARS} BETWEEN 26 AND 35 THEN '26-35'
  WHEN ${AGE_YEARS} BETWEEN 36 AND 45 THEN '36-45'
  ELSE '45+'
END`;

export function funnelStageSql(stage) {
  const status = placementStatusSql('m.placement_status');
  const placed = `${status} IN ('Working', 'Self employment')`;
  const post = validIncomeSql('m.post_income');
  if (stage === 'trained') return `${status} <> 'Ongoing course'`;
  if (stage === 'placed') return placed;
  if (stage === 'earning') return `(${placed} AND ${post} IS NOT NULL)`;
  return 'TRUE';
}

export async function getPlacementEligibility(filters) {
  const { w, params } = sheetWhere(filters);
  const status = placementStatusSql('m.placement_status');
  const gender = genderBucketSql('m.person_gender');
  const placed = `${status} IN ('Working', 'Self employment')`;
  const eligible = placementEligibleSql();
  const rows = await fetchall(
    `SELECT
       COUNT(*)::integer AS all_rows,
       COUNT(*) FILTER (WHERE ${placed})::integer AS placed,
       COUNT(*) FILTER (WHERE ${eligible})::integer AS eligible,
       COUNT(*) FILTER (WHERE ${gender} = 'Female' AND ${placed})::integer AS women_placed,
       COUNT(*) FILTER (WHERE ${gender} = 'Female' AND ${eligible})::integer AS women_eligible,
       COUNT(*) FILTER (WHERE ${gender} = 'Male' AND ${placed})::integer AS men_placed,
       COUNT(*) FILTER (WHERE ${gender} = 'Male' AND ${eligible})::integer AS men_eligible
     FROM education_mixprogram m
     ${w}`,
    params
  );
  const row = rows[0] || {};
  const all = Number(row.all_rows) || 0;
  const placedN = Number(row.placed) || 0;
  const eligibleN = Number(row.eligible) || 0;
  const womenPlaced = Number(row.women_placed) || 0;
  const womenEligible = Number(row.women_eligible) || 0;
  const menPlaced = Number(row.men_placed) || 0;
  const menEligible = Number(row.men_eligible) || 0;
  return {
    status: all ? 'ok' : 'no_data',
    all,
    placed: placedN,
    eligible: eligibleN,
    eligible_pct: rate(placedN, eligibleN),
    overall_pct: rate(placedN, all),
    women_placed: womenPlaced,
    women_eligible: womenEligible,
    female_pct: rate(womenPlaced, womenEligible),
    men_placed: menPlaced,
    men_eligible: menEligible,
    male_pct: rate(menPlaced, menEligible),
    eligible_statuses: PLACEMENT_ELIGIBLE_STATUSES
  };
}

export async function getOutcomeFunnel(filters) {
  const { w, params } = sheetWhere(filters);
  const rows = await fetchall(
    `SELECT
       COUNT(*)::integer AS enrolled,
       COUNT(*) FILTER (WHERE ${funnelStageSql('trained')})::integer AS trained,
       COUNT(*) FILTER (WHERE ${funnelStageSql('placed')})::integer AS placed,
       COUNT(*) FILTER (WHERE ${funnelStageSql('earning')})::integer AS earning
     FROM education_mixprogram m
     ${w}`,
    params
  );
  const row = rows[0] || {};
  const counts = [
    ['enrolled', 'Enrolled', Number(row.enrolled) || 0],
    ['trained', 'Trained', Number(row.trained) || 0],
    ['placed', 'Placed/Self-employed', Number(row.placed) || 0],
    ['earning', 'Earning', Number(row.earning) || 0]
  ];
  const first = counts[0][2];
  const stages = counts.map(([key, label, value], index) => {
    const previous = index === 0 ? null : counts[index - 1][2];
    return {
      key,
      label,
      value,
      pct_of_enrolled: rate(value, first),
      pct_of_previous: previous == null ? null : rate(value, previous)
    };
  });
  return { status: first ? 'ok' : 'no_data', stages };
}

export async function getIncomeByYear(filters = {}) {
  const { w, params } = sheetWhere(filters, { workingOnly: true, applyYear: false });
  const post = validIncomeSql('m.post_income');
  const rows = await fetchall(
    `SELECT
       COALESCE(NULLIF(TRIM(m.year), ''), 'Unknown') AS yr,
       COUNT(${post})::integer AS n,
       AVG(${post}) AS mean_income,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${post}) AS median_income
     FROM education_mixprogram m
     ${w}
     GROUP BY 1
     ORDER BY yr`,
    params
  );
  const years = rows
    .map((row) => ({
      year: row.yr,
      n: Number(row.n) || 0,
      mean: row.mean_income == null ? null : Math.round(Number(row.mean_income)),
      median: row.median_income == null ? null : Math.round(Number(row.median_income))
    }))
    .filter((row) => row.n > 0);
  return {
    status: years.length ? 'ok' : 'no_data',
    follows_year: false,
    years,
    n_total: years.reduce((sum, row) => sum + row.n, 0)
  };
}

export async function getTraineeAges(filters) {
  const { clauses, params } = rosterWhere(filters);
  const w = whereStr(clauses);
  const rows = await fetchall(
    `SELECT band, COUNT(*)::integer AS value
     FROM (
       SELECT ${AGE_BAND_SQL} AS band
       FROM skilltracking_persons sp
       ${w}
     ) people
     GROUP BY band`,
    params
  );
  const byBand = new Map(rows.map((row) => [row.band, Number(row.value) || 0]));
  const brackets = AGE_ORDER.map((label) => ({ label, value: byBand.get(label) || 0 }));
  const total = brackets.reduce((sum, row) => sum + row.value, 0);
  const joinRows = await fetchall(
    `SELECT
       COUNT(*) FILTER (WHERE band <> 'Age not recorded')::integer AS with_age,
       COUNT(*) FILTER (WHERE band <> 'Age not recorded' AND ts.stream_id IS NOT NULL)::integer AS with_trade
     FROM (
       SELECT sp.training_stream_id, ${AGE_BAND_SQL} AS band
       FROM skilltracking_persons sp
       ${w}
     ) people
     LEFT JOIN skilltracking_training_stream ts ON ts.stream_id::text = people.training_stream_id::text`,
    params
  );
  const withAge = Number(joinRows[0]?.with_age) || 0;
  const withTrade = Number(joinRows[0]?.with_trade) || 0;
  const tradeMatchRate = withAge ? withTrade / withAge : 0;
  return {
    status: total ? 'ok' : 'no_data',
    follows_year: false,
    total,
    brackets,
    with_age: withAge,
    with_trade: withTrade,
    trade_match_rate: oneDecimal(tradeMatchRate * 100),
    trade_drill: withAge > 0 && tradeMatchRate >= 0.9
  };
}

export async function getAgeTrades(filters, band) {
  const ages = await getTraineeAges(filters);
  if (!ages.trade_drill) {
    return { columns: [], rows: [], total: 0, caption: 'Trade drill-down is off because fewer than 90% of trainees with an age join to a trade.' };
  }
  const { clauses, params } = rosterWhere(filters);
  params.age_band = band;
  clauses.push(`(${AGE_BAND_SQL}) = :age_band`);
  const rows = await fetchall(
    `SELECT COALESCE(NULLIF(btrim(ts.stream_name), ''), 'Trade not recorded') AS trade,
            COUNT(*)::integer AS trainees
     FROM skilltracking_persons sp
     LEFT JOIN skilltracking_training_stream ts ON ts.stream_id::text = sp.training_stream_id::text
     ${whereStr(clauses)}
     GROUP BY 1
     ORDER BY trainees DESC, trade`,
    params
  );
  const total = rows.reduce((sum, row) => sum + (Number(row.trainees) || 0), 0);
  return {
    columns: [
      { key: 'trade', label: 'Trade' },
      { key: 'trainees', label: 'Trainees' }
    ],
    rows,
    total,
    page: 1,
    per_page: Math.max(total, rows.length, 1),
    caption: 'Trainees in this age bracket, by trade. The total is the number of trainees.'
  };
}

function genderParts(rows) {
  const pick = (label) => Number(rows.find((row) => row.label === label)?.value) || 0;
  const female = pick('Female');
  const male = pick('Male');
  const others = pick('Others');
  const notRecorded = pick('Not recorded');
  return {
    female,
    male,
    others,
    not_recorded: notRecorded,
    total: female + male + others + notRecorded,
    recorded: female + male + others
  };
}

async function countGender(fromSql, whereSql, params, column) {
  const rows = await fetchall(
    `SELECT ${genderBucketSql(column)} AS label, COUNT(*)::integer AS value
     FROM ${fromSql}
     ${whereSql}
     GROUP BY 1`,
    params
  );
  return genderParts(rows);
}

export async function getProgrammeGender(filters) {
  const roster = rosterWhere(filters);
  const sheet = sheetWhere(filters, { programId: '11' });
  const didi = sheetWhere(filters, { programId: '12', applyMonth: false });
  const farmers = sheetWhere(filters, { programId: '1', applyYear: false, applyMonth: false });
  farmers.clauses[1] = `m.program_id::text IN ('1', '2')`;
  const [rosterGender, sheetGender, didiGender, farmerGender, enterpriseCols] = await Promise.all([
    countGender('skilltracking_persons sp', whereStr(roster.clauses), roster.params, 'sp.gender'),
    countGender('education_mixprogram m', sheet.w, sheet.params, 'm.person_gender'),
    countGender('education_mixprogram m', didi.w, didi.params, 'm.person_gender'),
    countGender('education_mixprogram m', whereStr(farmers.clauses), farmers.params, 'm.person_gender'),
    fetchall(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'enterprise_support'
         AND column_name ILIKE '%gender%'`
    )
  ]);
  const bars = [];
  if (rosterGender.total) {
    bars.push({ key: 'roster', label: 'Skilling – skill roster', follows_year: false, follows_month: true, ...rosterGender });
  }
  if (sheetGender.total) {
    bars.push({ key: 'sheet', label: 'Skilling – M&E field sheet', follows_year: true, follows_month: true, ...sheetGender });
  }
  const excluded = [
    'HP WOW is not on the livelihood pages.',
    'Neem Pulverizer is not shown.'
  ];
  if (didiGender.recorded > 0) {
    bars.push({
      key: 'didi',
      label: DIDI_LABEL,
      follows_year: true,
      follows_month: false,
      ...didiGender
    });
  } else {
    excluded.push(`${DIDI_LABEL} has no recorded gender.`);
  }
  if (farmerGender.recorded > 0) {
    bars.push({ key: 'farmers', label: 'Jubifarm farmers', follows_year: false, follows_month: false, ...farmerGender });
  } else {
    excluded.push('Jubifarm farmers have no recorded gender.');
  }
  if (!enterpriseCols.length) excluded.push('Enterprise members have no gender field.');
  return { status: bars.length ? 'ok' : 'no_data', bars, excluded, genders: GENDERS };
}

export async function getGenderSplit(filters, programme, gender) {
  if (programme === 'roster') {
    const { clauses, params } = rosterWhere(filters);
    params.gender_label = gender;
    clauses.push(`${genderBucketSql('sp.gender')} = :gender_label`);
    const rows = await fetchall(
      `SELECT COALESCE(NULLIF(btrim(ts.stream_name), ''), 'Trade not recorded') AS trade,
              COUNT(*)::integer AS trainees
       FROM skilltracking_persons sp
       LEFT JOIN skilltracking_training_stream ts ON ts.stream_id::text = sp.training_stream_id::text
       ${whereStr(clauses)}
       GROUP BY 1
       ORDER BY trainees DESC, trade`,
      params
    );
    const total = rows.reduce((sum, row) => sum + (Number(row.trainees) || 0), 0);
    return {
      columns: [
        { key: 'trade', label: 'Trade' },
        { key: 'trainees', label: 'Trainees' }
      ],
      rows,
      total,
      page: 1,
      per_page: Math.max(total, rows.length, 1),
      caption: 'Skill roster trainees of this gender, by trade. The total is the number of trainees.'
    };
  }
  if (programme === 'sheet') {
    const { clauses, params } = sheetWhere(filters, { programId: '11' });
    params.gender_label = gender;
    clauses.push(`${genderBucketSql('m.person_gender')} = :gender_label`);
    const rows = await fetchall(
      `SELECT COALESCE(NULLIF(btrim(m.course_name), ''), 'Course not recorded') AS course,
              COALESCE(NULLIF(btrim(m.location), ''), 'Location not recorded') AS location,
              COUNT(*)::integer AS trainees
       FROM education_mixprogram m
       ${whereStr(clauses)}
       GROUP BY 1, 2
       ORDER BY trainees DESC, course, location`,
      params
    );
    const total = rows.reduce((sum, row) => sum + (Number(row.trainees) || 0), 0);
    return {
      columns: [
        { key: 'course', label: 'Course' },
        { key: 'location', label: 'Location' },
        { key: 'trainees', label: 'Trainees' }
      ],
      rows,
      total,
      page: 1,
      per_page: Math.max(total, rows.length, 1),
      caption: 'M&E field-sheet rows of this gender, by course and location. The total is the number of rows.'
    };
  }
  return { columns: [], rows: [], total: 0, caption: 'This programme opens its own row list.' };
}
