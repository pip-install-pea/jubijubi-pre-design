import { fetchall, scalar } from './db.js';
import { buildFilters, whereStr } from './analytics.js';

const TARIFF_SAVED_PER_VISIT = 150;
const WAGE_LOSS_SAVED_PER_VISIT = 200;
const CO2_PER_PATIENT_KG = 0.3;

/**
 * Replicates get_reach health analytics query
 */
export async function getReach(filters) {
  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id',
    gender_col: 'gender'
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

  return {
    direct_beneficiaries: row.total,
    villages_reached:     row.villages,
    states_reached:       row.states,
    adolescents_10_19:    row.adolescents,
  };
}

/**
 * Replicates get_depth health analytics query
 */
export async function getDepth(filters) {
  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id'
  });
  const w = whereStr(clauses);

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

  const rawRows = await fetchall(`
    SELECT
      disease,
      symtom AS symptom,
      SUBSTR(created_at::text, 1, 4)  AS yr
    FROM health_patient_appointments
    ${w}
  `, params);

  const diseaseMap = {};
  const symptomMap = {};

  for (const r of rawRows) {
    const yr = r.yr;
    if (r.disease) {
      const ds = r.disease.split(',').map(x => x.trim()).filter(Boolean);
      for (const d of ds) {
        if (!diseaseMap[d]) diseaseMap[d] = {};
        diseaseMap[d][yr] = (diseaseMap[d][yr] || 0) + 1;
      }
    }
    if (r.symptom) {
      const ss = r.symptom.split(',').map(x => x.trim()).filter(Boolean);
      for (const s of ss) {
        if (!symptomMap[s]) symptomMap[s] = {};
        symptomMap[s][yr] = (symptomMap[s][yr] || 0) + 1;
      }
    }
  }

  const thisYear = String(new Date().getFullYear());
  const lastYear = String(new Date().getFullYear() - 1);

  let diseaseYoY = Object.entries(diseaseMap).map(([d, years]) => ({
    disease: d,
    last_year: years[lastYear] || 0,
    this_year: years[thisYear] || 0
  }));
  diseaseYoY.sort((a, b) => b.this_year - a.this_year || b.last_year - a.last_year);
  diseaseYoY = diseaseYoY.slice(0, 15);

  let symptomYoY = Object.entries(symptomMap).map(([s, years]) => ({
    symptom: s,
    last_year: years[lastYear] || 0,
    this_year: years[thisYear] || 0
  }));
  symptomYoY.sort((a, b) => b.this_year - a.this_year || b.last_year - a.last_year);
  symptomYoY = symptomYoY.slice(0, 15);

  const tariffSaved = totalAppts * TARIFF_SAVED_PER_VISIT;
  const wageLossSaved = totalAppts * WAGE_LOSS_SAVED_PER_VISIT;

  return {
    repeat_patient_pct: repeatPct,
    disease_yoy: diseaseYoY,
    symptom_yoy: symptomYoY,
    avg_satisfaction: null,
    avg_satisfaction_note: 'data pending',
    money_saved: {
      tariff_saved: tariffSaved,
      wage_loss_saved: wageLossSaved,
      total: tariffSaved + wageLossSaved
    }
  };
}

/**
 * Replicates get_inclusion health analytics query
 */
export async function getInclusion(filters) {
  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id'
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
    bpl_households: 0,
    bpl_households_note: 'No BPL field in current schema',
    senior_citizens: row.seniors,
    people_with_disability: row.disabled,
    women_count: row.women
  };
}

/**
 * Replicates get_sustainability health analytics query
 */
export async function getSustainability(filters) {
  const { clauses, params } = buildFilters(filters, {
    date_col: 'created_at',
    state_col: 'state_id',
    district_col: 'district_id',
    partner_col: 'partner_id'
  });
  const w = whereStr(clauses);

  const patientCount = await scalar(
    `SELECT COALESCE(COUNT(*), 0)::integer FROM health_profile_patients ${w}`,
    params
  );

  return {
    co2_saved: parseFloat((patientCount * CO2_PER_PATIENT_KG).toFixed(2)),
    co2_formula: 'patient_count × CO2_PER_PATIENT_KG kg',
    hazardous_waste_treated: 0,
    liquid_waste_treated: 0
  };
}
