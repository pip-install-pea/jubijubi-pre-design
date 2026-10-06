import { fetchall, scalar, isDatabaseConfigured } from './db.js';
import { bindIn, buildFilters, splitList, whereStr, validDateClause, stripDistrict, stripGeo, withPeerAverages, mean } from './analytics.js';
import { postPhpEnvelope } from './phpClient.js';
import { API_BASE, DEFAULT_YEAR, SYMPTOM_PATHS } from './phpRegistry.js';

const GEO = { module: 'health' };
const CACHE_TTL_MS = 90_000;
const TREND_TTL_MS = 10 * 60_000;
const TREND_START_YEAR = 2020;
const cache = new Map();

async function cachedFor(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  const empty = value == null
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'object' && value.mix && value.mix.length === 0);
  if (!empty) cache.set(key, { at: Date.now(), value });
  return value;
}

const SYMPTOM_ALT_URLS = SYMPTOM_PATHS.slice(1).map((p) => `${API_BASE}/${p}`);

async function cached(key, fn) {
  return cachedFor(key, CACHE_TTL_MS, fn);
}

function trendYears() {
  const end = new Date().getFullYear();
  const years = [];
  for (let y = TREND_START_YEAR; y <= end; y++) years.push(String(y));
  return years;
}

function withChangePct(rows) {
  return (rows || []).map((row, i, list) => {
    const prev = i > 0 ? num(list[i - 1].total_beneficiary) : null;
    const current = num(row.total_beneficiary);
    return {
      ...row,
      change_pct: prev > 0 ? Number((((current - prev) / prev) * 100).toFixed(1)) : null
    };
  });
}

async function persistEnvelope(env) {
  if (!isDatabaseConfigured() || !env?.year) return;
  try {
    await fetchall(
      `INSERT INTO health_beneficiary_year
         (year, total_beneficiary, total_village, total_state, total_adolescent_10_19, synced_at, added_by)
       VALUES (:year, :total_beneficiary, :total_village, :total_state, :adolescents, :synced_at, 'api')
       ON CONFLICT (year) DO UPDATE SET
         total_beneficiary = EXCLUDED.total_beneficiary,
         total_village = EXCLUDED.total_village,
         total_state = EXCLUDED.total_state,
         total_adolescent_10_19 = EXCLUDED.total_adolescent_10_19,
         synced_at = EXCLUDED.synced_at`,
      {
        year: String(env.year),
        total_beneficiary: num(env.total_beneficiary),
        total_village: num(env.total_village),
        total_state: num(env.total_state),
        adolescents: num(env.total_adolescent_10_19),
        synced_at: new Date().toISOString()
      }
    );
  } catch (err) {
    console.warn('[healthAnalytics] persist envelope skipped:', err.message);
  }
}

async function persistDiseaseMix(year, mix) {
  if (!isDatabaseConfigured() || !year || !mix?.length) return;
  const now = new Date().toISOString();
  for (const row of mix) {
    const diseaseId = row.disease_id != null && row.disease_id !== '' ? String(row.disease_id) : '';
    try {
      await fetchall(
        `INSERT INTO health_disease_summary
           (id, year, disease_id, disease_name, total_patients, synced_at, added_by)
         VALUES (:id, :year, :disease_id, :disease_name, :total_patients, :synced_at, 'api')
         ON CONFLICT (id) DO UPDATE SET
           disease_id = EXCLUDED.disease_id,
           disease_name = EXCLUDED.disease_name,
           total_patients = EXCLUDED.total_patients,
           synced_at = EXCLUDED.synced_at`,
        {
          id: `${year}_${diseaseId || row.disease}`,
          year: String(year),
          disease_id: diseaseId || null,
          disease_name: row.disease,
          total_patients: num(row.patients),
          synced_at: now
        }
      );
    } catch (err) {
      console.warn('[healthAnalytics] persist disease skipped:', err.message);
      break;
    }
  }
}

async function persistSymptomMix(year, mix) {
  if (!isDatabaseConfigured() || !year || !mix?.length) return;
  const now = new Date().toISOString();
  for (const row of mix) {
    const symptomId = row.symptom_id != null && row.symptom_id !== '' ? String(row.symptom_id) : '';
    try {
      await fetchall(
        `INSERT INTO health_symptom_summary
           (id, year, symptom_id, symptom_name, total_patients, synced_at, added_by)
         VALUES (:id, :year, :symptom_id, :symptom_name, :total_patients, :synced_at, 'api')
         ON CONFLICT (id) DO UPDATE SET
           symptom_id = EXCLUDED.symptom_id,
           symptom_name = EXCLUDED.symptom_name,
           total_patients = EXCLUDED.total_patients,
           synced_at = EXCLUDED.synced_at`,
        {
          id: `${year}_${symptomId || row.symptom}`,
          year: String(year),
          symptom_id: symptomId || null,
          symptom_name: row.symptom,
          total_patients: num(row.patients),
          synced_at: now
        }
      );
    } catch (err) {
      console.warn('[healthAnalytics] persist symptom skipped:', err.message);
      break;
    }
  }
}

async function fetchPostgresEnvelope(year) {
  if (!isDatabaseConfigured()) return null;
  const years = splitList(year).filter((item) => /^\d{4}$/.test(item));
  if (!years.length) return null;
  const params = {};
  const clause = bindIn('year', years, 'yr', params);
  const rows = await safeFetchall(
    `SELECT year, total_beneficiary, total_village, total_state, total_adolescent_10_19
     FROM health_beneficiary_year
     WHERE ${clause}`,
    params
  );
  if (!rows.length) return null;
  const summed = rows.reduce((acc, row) => ({
    total_beneficiary: acc.total_beneficiary + num(row.total_beneficiary),
    total_village: acc.total_village + num(row.total_village),
    total_state: Math.max(acc.total_state, num(row.total_state)),
    total_adolescent_10_19: acc.total_adolescent_10_19 + num(row.total_adolescent_10_19)
  }), { total_beneficiary: 0, total_village: 0, total_state: 0, total_adolescent_10_19: 0 });
  return {
    year: years.join(', '),
    ...summed
  };
}

async function fetchPostgresMix(year) {
  const years = splitList(year).filter((item) => /^\d{4}$/.test(item));
  const params = {};
  const clause = years.length ? bindIn('year', years, 'yr', params) : null;
  const yearSql = clause ? `WHERE ${clause}` : '';
  const label = years.join(', ') || String(year);
  const diseaseMix = await safeFetchall(
    `SELECT COALESCE(disease_name, 'Unknown') AS disease,
            COALESCE(SUM(total_patients), 0)::integer AS patients,
            MIN(disease_id) AS disease_id
     FROM health_disease_summary
     ${yearSql}
     GROUP BY COALESCE(disease_name, 'Unknown')
     ORDER BY patients DESC`,
    params
  );
  const symptomMix = await safeFetchall(
    `SELECT COALESCE(symptom_name, 'Unknown') AS symptom,
            COALESCE(SUM(total_patients), 0)::integer AS patients,
            MIN(symptom_id) AS symptom_id
     FROM health_symptom_summary
     ${yearSql}
     GROUP BY COALESCE(symptom_name, 'Unknown')
     ORDER BY patients DESC`,
    params
  );
  return {
    disease: { year: label, total_diseases: diseaseMix.length, mix: mapDiseaseRows(diseaseMix) },
    symptoms: { year: label, total_symptoms: symptomMix.length, mix: mapSymptomRows(symptomMix) }
  };
}

function reachPayload(envelope, trend) {
  const adolescents = num(envelope.total_adolescent_10_19);
  const rest = Math.max(num(envelope.total_beneficiary) - adolescents, 0);
  return {
    direct_beneficiaries: num(envelope.total_beneficiary),
    villages_reached: num(envelope.total_village),
    states_reached: num(envelope.total_state),
    adolescents_10_19: adolescents,
    adolescent_share: [
      { label: 'Adolescents (10–19)', value: adolescents },
      { label: 'Other ages', value: rest }
    ],
    beneficiary_yoy: trend,
    envelope_year: envelope.year
  };
}

async function fetchPostgresTrend() {
  if (!isDatabaseConfigured()) return [];
  const rows = await safeFetchall(
    `SELECT year,
            COALESCE(total_beneficiary, 0)::integer AS total_beneficiary,
            COALESCE(total_village, 0)::integer AS total_village,
            COALESCE(total_state, 0)::integer AS total_state,
            COALESCE(total_adolescent_10_19, 0)::integer AS total_adolescent_10_19
     FROM health_beneficiary_year
     WHERE year ~ '^[0-9]+$' AND year::integer >= :start
     ORDER BY year`,
    { start: TREND_START_YEAR }
  );
  return withChangePct(rows.map((r) => ({
    year: String(r.year),
    total_beneficiary: num(r.total_beneficiary),
    total_village: num(r.total_village),
    total_state: num(r.total_state),
    total_adolescent_10_19: num(r.total_adolescent_10_19),
    reported_year: String(r.year)
  })));
}

async function fetchBeneficiaryTrend() {
  const years = trendYears();
  const key = `hl:beneficiary-trend:${years[0]}-${years[years.length - 1]}`;
  return cachedFor(key, TREND_TTL_MS, async () => {
    const fromDb = await fetchPostgresTrend();
    if (fromDb.some((r) => r.total_beneficiary > 0)) return fromDb;
    return [];
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calendarYear(filters) {
  const years = splitList(filters?.year).filter((item) => /^\d{4}$/.test(item));
  return years.length ? years.join(',') : String(DEFAULT_YEAR);
}

/** Blank Year and the default year share one calendar year on every Health query. */
export function healthFilters(filters = {}) {
  return { ...filters, year: calendarYear(filters) };
}

function mapDiseaseRows(rows) {
  return (rows || [])
    .map((r) => ({
      disease_id: r.disease_id ?? r.id ?? null,
      disease: String(r.disease_name || r.disease || 'Unknown'),
      patients: num(r.total_patients ?? r.patients)
    }))
    .sort((a, b) => b.patients - a.patients);
}

function mapSymptomRows(rows) {
  return (rows || [])
    .map((r) => ({
      symptom_id: r.symptom_id ?? r.symtom_id ?? r.id ?? null,
      symptom: String(r.symptom_name || r.symtom_name || r.symptom || r.symtom || 'Unknown'),
      patients: num(r.total_patients ?? r.patients)
    }))
    .sort((a, b) => b.patients - a.patients);
}

function shareSlices(items, labelKey, topN = 8) {
  const top = items.slice(0, topN);
  const rest = items.slice(topN).reduce((sum, r) => sum + num(r.patients), 0);
  const slices = top.map((r) => ({ label: r[labelKey], value: r.patients }));
  if (rest > 0) slices.push({ label: 'Other', value: rest });
  return slices;
}

async function fetchLiveEnvelope(year, opts = {}) {
  return cached(`hl:beneficiary:${year}`, async () => {
    const { meta, rows } = await postPhpEnvelope(
      'health_beneficiary.php',
      { module_type: 'health', year: String(year) },
      { timeout: 20, maxRetries: 1, ...opts }
    );
    const row = rows[0] || meta || {};
    return {
      year: String(row.year || meta.year || year),
      total_beneficiary: num(row.total_beneficiary ?? meta.total_beneficiary),
      total_village: num(row.total_village ?? meta.total_village),
      total_state: num(row.total_state ?? meta.total_state),
      total_adolescent_10_19: num(row.total_adolescent_10_19 ?? meta.total_adolescent_10_19)
    };
  });
}

async function fetchLiveDisease(year) {
  return cached(`hl:disease:${year}`, async () => {
    const { meta, rows } = await postPhpEnvelope(
      'health_desease.php',
      { module_type: 'health', year: String(year) }
    );
    const mix = mapDiseaseRows(rows);
    return {
      year: String(meta.year || year),
      total_diseases: num(meta.total_diseases) || mix.length,
      mix
    };
  });
}

async function fetchLiveSymptoms(year) {
  return cached(`hl:symptom:${year}`, async () => {
    const { meta, rows } = await postPhpEnvelope(
      'health_symtoms.php',
      { module_type: 'health', year: String(year) },
      { altUrls: SYMPTOM_ALT_URLS }
    );
    const mix = mapSymptomRows(rows);
    return {
      year: String(meta.year || year),
      total_symptoms: num(meta.total_symtom ?? meta.total_symptom) || mix.length,
      mix
    };
  });
}

async function fetchEnvelopeWithFallback(year) {
  const requested = await fetchLiveEnvelope(year);
  if (requested.total_beneficiary > 0 || String(year) === String(DEFAULT_YEAR)) {
    return { ...requested, requested_year: String(year) };
  }
  const fallback = await fetchLiveEnvelope(DEFAULT_YEAR);
  return { ...fallback, requested_year: String(year), fallback_from: String(year) };
}

async function safeFetchall(query, params) {
  if (!isDatabaseConfigured()) return [];
  try {
    return await fetchall(query, params);
  } catch (err) {
    console.warn('[healthAnalytics] query skipped:', err.message);
    return [];
  }
}

async function safeScalar(query, params) {
  if (!isDatabaseConfigured()) return 0;
  try {
    return await scalar(query, params);
  } catch (err) {
    console.warn('[healthAnalytics] scalar skipped:', err.message);
    return 0;
  }
}

export async function getReach(filters) {
  const year = calendarYear(filters);
  const years = splitList(year).filter((item) => /^\d{4}$/.test(item));

  const trend = await fetchBeneficiaryTrend();
  let envelope = await fetchPostgresEnvelope(year);
  if ((!envelope || !envelope.total_beneficiary) && years.length === 1 && trend.length) {
    envelope = trend.find((r) => r.year === String(year) && r.total_beneficiary > 0)
      || [...trend].reverse().find((r) => r.total_beneficiary > 0)
      || null;
    if (envelope) {
      envelope = {
        year: envelope.year,
        total_beneficiary: envelope.total_beneficiary,
        total_village: envelope.total_village,
        total_state: envelope.total_state,
        total_adolescent_10_19: envelope.total_adolescent_10_19 || 0
      };
    }
  }

  if (envelope && envelope.total_beneficiary > 0) {
    return reachPayload(envelope, trend);
  }

  if (years.length === 1) {
  try {
    const live = await fetchEnvelopeWithFallback(year);
    await persistEnvelope(live);
    cache.delete(`hl:beneficiary-trend:${trendYears()[0]}-${trendYears()[trendYears().length - 1]}`);
    const refreshed = await fetchPostgresTrend();
    return reachPayload(
      live,
      refreshed.length ? refreshed : [{
        year: live.year,
        total_beneficiary: live.total_beneficiary,
        total_village: live.total_village,
        total_state: live.total_state,
        change_pct: null
      }]
    );
  } catch (err) {
    console.warn('[healthAnalytics] live beneficiary failed:', err.message);
  }
  }

  if (!isDatabaseConfigured()) {
    return reachPayload(
      { year, total_beneficiary: 0, total_village: 0, total_state: 0, total_adolescent_10_19: 0 },
      []
    );
  }

  const { clauses, params } = buildFilters(healthFilters(filters), {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id',
    gender_col: 'gender',
    ...GEO
  });
  const w = whereStr(clauses);
  const rows = await safeFetchall(
    `SELECT
       COALESCE(COUNT(*), 0)::integer AS total,
       COALESCE(COUNT(DISTINCT village_id), 0)::integer AS villages,
       COALESCE(COUNT(DISTINCT state_id), 0)::integer AS states,
       COALESCE(COUNT(CASE
         WHEN CASE WHEN age ~ '^[0-9]+$' THEN age::integer ELSE 0 END BETWEEN 10 AND 19
         THEN 1 END), 0)::integer AS adolescents
     FROM health_profile_patients
     ${w}`,
    params
  );
  const row = rows[0] || { total: 0, villages: 0, states: 0, adolescents: 0 };
  return reachPayload(
    {
      year,
      total_beneficiary: row.total,
      total_village: row.villages,
      total_state: row.states,
      total_adolescent_10_19: row.adolescents
    },
    trend
  );
}

function buildDiseaseYoY(thisMix, lastMix, thisYear, lastYear) {
  if (!lastMix?.length || !thisMix?.length) return [];
  const lastMap = new Map(lastMix.map((r) => [r.disease, r.patients]));
  const names = new Set([...thisMix.map((r) => r.disease), ...lastMix.map((r) => r.disease)]);
  return [...names]
    .map((disease) => ({
      disease,
      last_year: lastMap.get(disease) || 0,
      this_year: thisMix.find((r) => r.disease === disease)?.patients || 0,
      last_year_label: String(lastYear),
      this_year_label: String(thisYear)
    }))
    .sort((a, b) => b.this_year - a.this_year || b.last_year - a.last_year)
    .slice(0, 12);
}

async function latestDiseaseYears() {
  const rows = await safeFetchall(
    `SELECT year
     FROM health_disease_summary
     WHERE year ~ '^[0-9]{4}$'
     GROUP BY year
     ORDER BY year DESC
     LIMIT 2`
  );
  return rows.map((row) => String(row.year));
}

export async function getDepth(filters) {
  const year = calendarYear(filters);
  const years = splitList(year).filter((item) => /^\d{4}$/.test(item));
  const singleYear = years.length === 1 ? years[0] : null;
  const prevYear = singleYear ? String(Number(singleYear) - 1) : null;

  let disease = { year, total_diseases: 0, mix: [] };
  let symptoms = { year, total_symptoms: 0, mix: [] };
  let prevDisease = { mix: [] };

  if (isDatabaseConfigured()) {
    const fromDb = await fetchPostgresMix(year);
    disease = fromDb.disease;
    symptoms = fromDb.symptoms;
    if (prevYear) prevDisease = (await fetchPostgresMix(prevYear)).disease;
  }

  if (!disease.mix.length && singleYear) {
    try {
      const [thisD, thisS] = await Promise.all([
        fetchLiveDisease(singleYear),
        fetchLiveSymptoms(singleYear).catch((err) => {
          console.warn('[healthAnalytics] live symptoms failed:', err.message);
          return { year, total_symptoms: 0, mix: [] };
        })
      ]);
      disease = thisD;
      symptoms = thisS;
      await persistDiseaseMix(disease.year, disease.mix);
      await persistSymptomMix(symptoms.year, symptoms.mix);

      if (!disease.mix.length && String(year) !== String(DEFAULT_YEAR)) {
        const fallback = await fetchLiveDisease(DEFAULT_YEAR);
        const fallbackSym = await fetchLiveSymptoms(DEFAULT_YEAR).catch(() => symptoms);
        disease = fallback;
        symptoms = fallbackSym;
        await persistDiseaseMix(disease.year, disease.mix);
        await persistSymptomMix(symptoms.year, symptoms.mix);
      }

      if (!prevDisease.mix.length) {
        const lastYear = String(Number(disease.year) - 1);
        const lastD = await fetchLiveDisease(lastYear).catch(() => ({ mix: [] }));
        prevDisease = lastD;
        await persistDiseaseMix(lastYear, lastD.mix);
      }
    } catch (err) {
      console.warn('[healthAnalytics] live disease mix failed:', err.message);
    }
  }

  const diseaseYoYYears = await latestDiseaseYears();
  const yoyThis = diseaseYoYYears[0] || null;
  const yoyLast = diseaseYoYYears[1] || null;
  let yoyThisMix = disease.mix;
  let yoyLastMix = prevDisease.mix;
  if (yoyThis && yoyThis !== String(disease.year)) {
    yoyThisMix = (await fetchPostgresMix(yoyThis)).disease.mix;
  }
  if (yoyLast) {
    yoyLastMix = (await fetchPostgresMix(yoyLast)).disease.mix;
  }
  const diseaseYoY = yoyThis && yoyLast
    ? buildDiseaseYoY(yoyThisMix, yoyLastMix, yoyThis, yoyLast)
    : [];

  let totalAppts = 0;
  let feesCollected = 0;
  let appointmentsAvailable = false;

  if (isDatabaseConfigured()) {
    const { clauses, params } = buildFilters(healthFilters(filters), {
      date_col: 'created_at',
      state_col: 'state_id',
      district_col: 'district_id',
      partner_col: 'partner_id',
      ...GEO
    });
    const extraDate = validDateClause('created_at');
    const w = whereStr([...clauses, extraDate]);
    totalAppts = await safeScalar(
      `SELECT COALESCE(COUNT(*), 0)::integer FROM health_patient_appointments ${w}`,
      params
    );
    feesCollected = await safeScalar(`
      SELECT COALESCE(SUM(CASE WHEN paid_amount ~ '^[0-9.]+$' THEN paid_amount::numeric ELSE 0 END), 0)
      FROM health_patient_appointments ${w}
    `, params);
    appointmentsAvailable = totalAppts > 0;
  }

  return {
    effective_year: year,
    total_appointments: appointmentsAvailable ? totalAppts : null,
    fees_collected: appointmentsAvailable ? Number(feesCollected || 0) : null,
    appointments_available: appointmentsAvailable,
    disease_mix: disease.mix,
    disease_share: shareSlices(disease.mix, 'disease'),
    symptom_mix: symptoms.mix,
    symptom_share: shareSlices(symptoms.mix, 'symptom'),
    disease_yoy: diseaseYoY,
    disease_mix_year: disease.year,
    total_diseases: disease.total_diseases,
    total_symptoms: symptoms.total_symptoms,
    avg_satisfaction: null
  };
}

export async function getInclusion(filters) {
  const effectiveYear = calendarYear(filters);
  if (!isDatabaseConfigured()) {
    return {
      available: false,
      effective_year: effectiveYear,
      community_interventions: [],
      senior_citizens: null,
      people_with_disability: null,
      women_count: null
    };
  }

  const { clauses, params } = buildFilters(healthFilters(filters), {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id',
    gender_col: 'gender',
    ...GEO
  });
  const w = whereStr(clauses);

  try {
    const communityRows = await fetchall(`
      SELECT
        COALESCE(caste_id, 'Unknown')  AS community,
        COUNT(*)::integer              AS cnt
      FROM health_profile_patients
      ${w}
      GROUP BY caste_id
      ORDER BY cnt DESC
    `, params);

    const communityInterventions = communityRows
      .filter(r => r.community !== '' && r.community !== null)
      .map(r => ({ community: r.community, count: r.cnt }));

    const rows = await fetchall(`
      SELECT
        COALESCE(COUNT(CASE WHEN CASE WHEN age ~ '^[0-9]+$' THEN age::integer ELSE 0 END >= 60 THEN 1 END), 0)::integer   AS seniors,
        COALESCE(COUNT(CASE WHEN disability = 'Yes' THEN 1 END), 0)::integer            AS disabled,
        COALESCE(COUNT(CASE WHEN gender = 'F' THEN 1 END), 0)::integer                  AS women
      FROM health_profile_patients
      ${w}
    `, params);
    const row = rows[0] || { seniors: 0, disabled: 0, women: 0 };

    return {
      available: true,
      effective_year: effectiveYear,
      community_interventions: communityInterventions,
      senior_citizens: row.seniors,
      people_with_disability: row.disabled,
      women_count: row.women
    };
  } catch (err) {
    console.warn('[healthAnalytics] inclusion skipped:', err.message);
    return {
      available: false,
      effective_year: effectiveYear,
      community_interventions: [],
      senior_citizens: null,
      people_with_disability: null,
      women_count: null
    };
  }
}

export async function getSustainability() {
  return {
    available: false,
    reason: 'No recorded CO2, hazardous waste, or liquid waste columns in the live schema.'
  };
}

export async function getHealthGeoBenchmarks(filters) {
  const grain = filters?.state_id ? 'district' : 'state';
  const empty = {
    grain,
    unit: 'patients',
    rows: [],
    state_average: 0,
    programme_average: 0,
    programme_n: 0,
    state_n: 0
  };
  if (!isDatabaseConfigured()) return empty;

  const peerFilters = grain === 'district' ? stripDistrict(filters) : stripGeo(filters);
  const programmeFilters = stripGeo(filters);
  const opts = {
    date_col: 'p.created_at',
    state_col: 'p.state_id',
    district_col: 'p.district_id',
    gender_col: 'p.gender',
    partner_col: 'p.partner_id',
    ...GEO
  };

  const joinSelect = grain === 'district'
    ? `COALESCE(
         (SELECT NULLIF(TRIM(d.name), '') FROM health_district d
          WHERE d.source_id::text = p.district_id::text
            AND d.state_id::text = p.state_id::text
          ORDER BY d.name LIMIT 1),
         p.district_id::text, 'Unknown') AS label,
       p.district_id::text AS id`
    : `COALESCE(
         (SELECT NULLIF(TRIM(s.name), '') FROM health_state s
          WHERE s.source_id::text = p.state_id::text
          ORDER BY s.name LIMIT 1),
         p.state_id::text, 'Unknown') AS label,
       p.state_id::text AS id`;
  const joinSql = '';
  const groupSql = grain === 'district'
    ? `GROUP BY p.state_id, p.district_id`
    : `GROUP BY p.state_id`;

  const run = async (f, limit) => {
    const { clauses, params } = buildFilters(healthFilters(f), opts);
    const lim = limit ? `LIMIT ${Number(limit)}` : '';
    return safeFetchall(
      `SELECT ${joinSelect},
              COUNT(*)::integer AS value
       FROM health_profile_patients p
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
      unit: 'patients',
      rows: withPeerAverages(display, stateAverage, programmeAverage),
      state_average: Number(stateAverage.toFixed(1)),
      programme_average: Number(programmeAverage.toFixed(1)),
      programme_n: programmeRows.length,
      state_n: grain === 'district' ? peerRows.length : 0
    };
  } catch (err) {
    console.warn('[healthAnalytics] geo benchmarks skipped:', err.message);
    return empty;
  }
}
