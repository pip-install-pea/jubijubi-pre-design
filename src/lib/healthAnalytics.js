import { fetchall, scalar } from './db.js';
import { buildFilters, whereStr, validDateClause } from './analytics.js';

const GEO = { module: 'health' };

async function safeFetchall(query, params) {
  try {
    return await fetchall(query, params);
  } catch (err) {
    console.warn('[healthAnalytics] query skipped:', err.message);
    return [];
  }
}

export async function getReach(filters) {
  const year = filters?.year || null;
  const locationApplied = Boolean(filters?.state_id || filters?.district_id || filters?.quarter || filters?.gender);

  let envelope = null;
  if (!locationApplied && year) {
    const envRows = await safeFetchall(
      `SELECT year, total_beneficiary, total_village, total_state, total_adolescent_10_19
       FROM health_beneficiary_year
       WHERE year = :year`,
      { year }
    );
    envelope = envRows[0] || null;
  }

  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id',
    gender_col: 'gender',
    ...GEO
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      COALESCE(COUNT(*), 0)::integer                          AS total,
      COALESCE(COUNT(DISTINCT village_id), 0)::integer        AS villages,
      COALESCE(COUNT(DISTINCT state_id), 0)::integer          AS states,
      COALESCE(COUNT(CASE
        WHEN CASE WHEN age ~ '^[0-9]+$' THEN age::integer ELSE 0 END BETWEEN 10 AND 19
        THEN 1 END), 0)::integer                              AS adolescents
    FROM health_profile_patients
    ${w}
  `;
  const rows = await fetchall(query, params);
  const row = rows[0] || { total: 0, villages: 0, states: 0, adolescents: 0 };

  const useEnvelope = Boolean(envelope);

  return {
    direct_beneficiaries: useEnvelope ? Number(envelope.total_beneficiary || 0) : row.total,
    villages_reached:     useEnvelope ? Number(envelope.total_village || 0) : row.villages,
    states_reached:       useEnvelope ? Number(envelope.total_state || 0) : row.states,
    adolescents_10_19:    useEnvelope ? Number(envelope.total_adolescent_10_19 || 0) : row.adolescents,
    source: useEnvelope ? 'year_envelope' : 'patient_table',
    envelope_year: useEnvelope ? envelope.year : (year || null),
    caption: useEnvelope
      ? `Calendar year ${envelope.year} envelope (health_beneficiary). Not location-filterable.`
      : 'Synced patient table (health_profile_patients). Not the year envelope.'
  };
}

export async function getDepth(filters) {
  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id',
    ...GEO
  });
  const extraDate = validDateClause('created_at');
  const w = whereStr([...clauses, extraDate]);

  const totalAppts = await scalar(
    `SELECT COALESCE(COUNT(*), 0)::integer FROM health_patient_appointments ${w}`,
    params
  );

  const repeatCount = await scalar(`
    SELECT COALESCE(COUNT(*), 0)::integer FROM (
      SELECT profile_patient_id
      FROM health_patient_appointments ${w}
      GROUP BY profile_patient_id HAVING COUNT(*) > 1
    ) t
  `, params);

  const totalPatientsForRepeat = await scalar(`
    SELECT COALESCE(COUNT(DISTINCT profile_patient_id), 0)::integer
    FROM health_patient_appointments ${w}
  `, params);

  const repeatPct = totalPatientsForRepeat > 0
    ? parseFloat((repeatCount / totalPatientsForRepeat * 100).toFixed(2))
    : 0.0;

  const feesCollected = await scalar(`
    SELECT COALESCE(SUM(CASE WHEN paid_amount ~ '^[0-9.]+$' THEN paid_amount::numeric ELSE 0 END), 0)
    FROM health_patient_appointments ${w}
  `, params);

  const year = filters?.year || String(new Date().getFullYear());
  const diseaseMix = await safeFetchall(
    `SELECT COALESCE(disease_name, 'Unknown') AS disease,
            COALESCE(total_patients, 0)::integer AS patients
     FROM health_disease_summary
     WHERE year = :year
     ORDER BY patients DESC`,
    { year }
  );

  const symptomMix = await safeFetchall(
    `SELECT COALESCE(symptom_name, 'Unknown') AS symptom,
            COALESCE(total_patients, 0)::integer AS patients
     FROM health_symptom_summary
     WHERE year = :year
     ORDER BY patients DESC`,
    { year }
  );

  const yearRows = await safeFetchall(
    `SELECT DISTINCT year FROM health_disease_summary WHERE year IS NOT NULL ORDER BY year`
  );
  const years = yearRows.map(r => String(r.year));
  let diseaseYoY = [];
  if (years.length >= 2) {
    const lastYear = years[years.length - 2];
    const thisYear = years[years.length - 1];
    const yoyRows = await safeFetchall(
      `SELECT disease_name,
              SUM(CASE WHEN year = :last_year THEN total_patients ELSE 0 END)::integer AS last_year,
              SUM(CASE WHEN year = :this_year THEN total_patients ELSE 0 END)::integer AS this_year
       FROM health_disease_summary
       WHERE year IN (:last_year, :this_year)
       GROUP BY disease_name
       ORDER BY this_year DESC, last_year DESC
       LIMIT 12`,
      { last_year: lastYear, this_year: thisYear }
    );
    diseaseYoY = yoyRows.map(r => ({
      disease: r.disease_name,
      last_year: r.last_year,
      this_year: r.this_year,
      last_year_label: lastYear,
      this_year_label: thisYear
    }));
  }

  return {
    repeat_patient_pct: repeatPct,
    total_appointments: totalAppts,
    fees_collected: Number(feesCollected || 0),
    fees_label: 'Fees collected (paid_amount)',
    disease_mix: diseaseMix.map(r => ({ disease: r.disease, patients: r.patients })),
    symptom_mix: symptomMix.map(r => ({ symptom: r.symptom, patients: r.patients })),
    disease_yoy: diseaseYoY,
    disease_mix_year: year,
    avg_satisfaction: null
  };
}

export async function getInclusion(filters) {
  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id',
    gender_col: 'gender',
    ...GEO
  });
  const w = whereStr(clauses);

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
    community_interventions: communityInterventions,
    senior_citizens: row.seniors,
    people_with_disability: row.disabled,
    women_count: row.women,
    caption: 'Counts from the synced patient table (health_profile_patients), not the year envelope. Gender codes are F/M.'
  };
}

export async function getSustainability() {
  return {
    available: false,
    reason: 'No recorded CO2, hazardous waste, or liquid waste columns in the live schema.'
  };
}
