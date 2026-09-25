import { fetchall } from './db.js';
import { splitList } from './analytics.js';

const LOOKUP = {
  health: {
    state: { table: 'health_state', id: 'source_id', name: 'name', state: null },
    district: { table: 'health_district', id: 'source_id', name: 'name', state: 'state_id' }
  },
  livelihood: {
    state: { table: 'skilltracking_state', id: 'state_id', name: 'state_name', state: null },
    district: { table: 'skilltracking_district', id: 'district_id', name: 'district_name', state: 'state_id' }
  },
  education: {
    state: { table: 'skilltracking_state', id: 'state_id', name: 'state_name', state: null },
    district: { table: 'skilltracking_district', id: 'district_id', name: 'district_name', state: 'state_id' }
  }
};

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * The bar label is the place the user clicked. geo_id can point at a different
 * row when the chart index and the category name disagree. Prefer the id whose
 * lookup name matches the label.
 */
export async function resolveGeoId({ module, grain, geoId, label, stateId }) {
  const id = String(geoId || '').trim();
  const name = String(label || '').trim();
  const spec = LOOKUP[module]?.[grain === 'district' ? 'district' : 'state'];
  if (!spec || !name) return id || name;
  const stateCol = spec.state ? `, ${spec.state}::text AS state_id` : `, NULL::text AS state_id`;
  let rows = [];
  try {
    rows = await fetchall(
      `SELECT ${spec.id}::text AS id, ${spec.name} AS name ${stateCol}
       FROM ${spec.table}
       WHERE lower(btrim(${spec.name}::text)) = lower(btrim(:name))
          OR ${spec.id}::text = :id
       LIMIT 30`,
      { name, id }
    );
  } catch {
    return id || name;
  }
  const idRow = rows.find((row) => String(row.id) === id);
  if (idRow && sameText(idRow.name, name)) return id;
  let named = rows.filter((row) => sameText(row.name, name));
  const stateIds = splitList(stateId);
  if (named.length > 1 && stateIds.length) {
    const scoped = named.filter((row) => row.state_id && stateIds.includes(String(row.state_id)));
    if (scoped.length) named = scoped;
  }
  if (named.length === 1) return String(named[0].id);
  return id || name;
}

export const SKILL_PERSON_GEO_JOIN = `
  LEFT JOIN skilltracking_district sd
    ON sd.district_id::text = sp.district_id::text
   AND sd.state_id::text = sp.state_id::text
  LEFT JOIN skilltracking_state ss ON ss.state_id::text = sp.state_id::text`;

export const SKILL_BARE_GEO_JOIN = `
  LEFT JOIN skilltracking_district sd
    ON sd.district_id::text = skilltracking_persons.district_id::text
   AND sd.state_id::text = skilltracking_persons.state_id::text
  LEFT JOIN skilltracking_state ss ON ss.state_id::text = skilltracking_persons.state_id::text`;

export const SKILL_EDU_GEO_JOIN = `
  LEFT JOIN skilltracking_district sd
    ON sd.district_id::text = education_program.district_id::text
   AND sd.state_id::text = education_program.state_id::text
  LEFT JOIN skilltracking_state ss ON ss.state_id::text = education_program.state_id::text`;

export const HEALTH_GEO_JOIN = `
  LEFT JOIN health_district hd
    ON hd.source_id::text = health_profile_patients.district_id::text
   AND hd.state_id::text = health_profile_patients.state_id::text
  LEFT JOIN health_state hs ON hs.source_id::text = health_profile_patients.state_id::text`;

export const SKILL_DISTRICT = `COALESCE(NULLIF(TRIM(sd.district_name), ''), sp.district_id::text, '—')`;
export const SKILL_STATE = `COALESCE(NULLIF(TRIM(ss.state_name), ''), sp.state_id::text, '—')`;
export const SKILL_DISTRICT_BARE = `COALESCE(NULLIF(TRIM(sd.district_name), ''), skilltracking_persons.district_id::text, '—')`;
export const SKILL_STATE_BARE = `COALESCE(NULLIF(TRIM(ss.state_name), ''), skilltracking_persons.state_id::text, '—')`;
export const EDU_DISTRICT = `COALESCE(NULLIF(TRIM(sd.district_name), ''), education_program.district_id::text, '—')`;
export const EDU_STATE = `COALESCE(NULLIF(TRIM(ss.state_name), ''), education_program.state_id::text, '—')`;
export const HEALTH_DISTRICT = `COALESCE(NULLIF(TRIM(hd.name), ''), health_profile_patients.district_id::text, '—')`;
export const HEALTH_STATE = `COALESCE(NULLIF(TRIM(hs.name), ''), health_profile_patients.state_id::text, '—')`;
