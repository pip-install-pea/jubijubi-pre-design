export const SKILL_PERSON_GEO_JOIN = `
  LEFT JOIN skilltracking_district sd ON sd.district_id::text = sp.district_id::text
  LEFT JOIN skilltracking_state ss ON ss.state_id::text = sp.state_id::text`;

export const SKILL_BARE_GEO_JOIN = `
  LEFT JOIN skilltracking_district sd ON sd.district_id::text = skilltracking_persons.district_id::text
  LEFT JOIN skilltracking_state ss ON ss.state_id::text = skilltracking_persons.state_id::text`;

export const SKILL_EDU_GEO_JOIN = `
  LEFT JOIN skilltracking_district sd ON sd.district_id::text = education_program.district_id::text
  LEFT JOIN skilltracking_state ss ON ss.state_id::text = education_program.state_id::text`;

export const HEALTH_GEO_JOIN = `
  LEFT JOIN health_district hd ON hd.source_id::text = health_profile_patients.district_id::text
  LEFT JOIN health_state hs ON hs.source_id::text = health_profile_patients.state_id::text`;

export const SKILL_DISTRICT = `COALESCE(NULLIF(TRIM(sd.district_name), ''), sp.district_id::text, '—')`;
export const SKILL_STATE = `COALESCE(NULLIF(TRIM(ss.state_name), ''), sp.state_id::text, '—')`;
export const SKILL_DISTRICT_BARE = `COALESCE(NULLIF(TRIM(sd.district_name), ''), skilltracking_persons.district_id::text, '—')`;
export const SKILL_STATE_BARE = `COALESCE(NULLIF(TRIM(ss.state_name), ''), skilltracking_persons.state_id::text, '—')`;
export const EDU_DISTRICT = `COALESCE(NULLIF(TRIM(sd.district_name), ''), education_program.district_id::text, '—')`;
export const EDU_STATE = `COALESCE(NULLIF(TRIM(ss.state_name), ''), education_program.state_id::text, '—')`;
export const HEALTH_DISTRICT = `COALESCE(NULLIF(TRIM(hd.name), ''), health_profile_patients.district_id::text, '—')`;
export const HEALTH_STATE = `COALESCE(NULLIF(TRIM(hs.name), ''), health_profile_patients.state_id::text, '—')`;
