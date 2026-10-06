import { bindIn } from './analytics.js';

/**
 * Mixprogram has no state_id. Map free-text location, then block.
 * Reviewed 6 Oct 2026.
 */
export const EDU_PLACES = [
  { place: 'Gajraula', state: 'Uttar Pradesh', keys: ['gajraula', 'gajruala', 'gajaruala', 'uttar pradesh', 'amroha'] },
  { place: 'Kapasan', state: 'Rajasthan', keys: ['kapasan', 'rajasthan', 'chittorgarh', 'chittorgah'] },
  { place: 'Savli', state: 'Gujarat', keys: ['savli'] },
  { place: 'Bharuch', state: 'Gujarat', keys: ['bharuch', 'vagra'] },
  { place: 'Nanjangud', state: 'Karnataka', keys: ['nanjangud', 'nanjnagud', 'karnataka'] },
  { place: 'Nira', state: 'Maharashtra', keys: ['nira', 'baramati', 'pune'] },
  { place: 'Bengaluru', state: 'Karnataka', keys: ['bangalore', 'bengaluru', 'bangalore north range 4'] },
  { place: 'Greater Noida', state: 'Uttar Pradesh', keys: ['greater noida', 'greaternoida'] }
];

export const EDU_SCHOOL_IDS = ['3', '4', '8', '9'];
export const EDU_CASTE_IDS = ['3', '4', '9'];
export const EDU_PROGRAM_IDS = ['3', '4', '5', '6', '7', '8', '9', '13', '14'];

const NOT_MAPPED = 'Not mapped';

function normSql(column) {
  return `lower(regexp_replace(btrim(COALESCE(${column}::text, '')), '\\s+', ' ', 'g'))`;
}

function placeCase(normExpr) {
  const whens = EDU_PLACES.map((row) => {
    const list = row.keys.map((key) => `'${key.replace(/'/g, "''")}'`).join(', ');
    return `WHEN ${normExpr} IN (${list}) THEN '${row.place.replace(/'/g, "''")}'`;
  });
  return `CASE ${whens.join(' ')} ELSE NULL END`;
}

export function eduPlaceSql(locationCol = 'm.location', blockCol = 'm.block') {
  return `COALESCE(${placeCase(normSql(locationCol))}, ${placeCase(normSql(blockCol))}, '${NOT_MAPPED}')`;
}

export function eduStateSql(locationCol = 'm.location', blockCol = 'm.block') {
  const place = eduPlaceSql(locationCol, blockCol);
  const whens = EDU_PLACES.map((row) => `WHEN '${row.place.replace(/'/g, "''")}' THEN '${row.state.replace(/'/g, "''")}'`);
  const unique = [];
  const seen = new Set();
  whens.forEach((line) => {
    if (seen.has(line)) return;
    seen.add(line);
    unique.push(line);
  });
  return `CASE ${place} ${unique.join(' ')} ELSE '${NOT_MAPPED}' END`;
}

export function eduGeoClauses(filters, params, locationCol = 'm.location', blockCol = 'm.block') {
  const clauses = [];
  const stateClause = bindIn(eduStateSql(locationCol, blockCol), filters?.state_id, 'edu_state', params);
  const districtClause = bindIn(eduPlaceSql(locationCol, blockCol), filters?.district_id, 'edu_district', params);
  if (stateClause) clauses.push(stateClause);
  if (districtClause) clauses.push(districtClause);
  return clauses;
}

export function excludeWowClause(column = 'program_name') {
  return `(${column} IS NULL OR btrim(${column}::text) = '' OR ${column}::text !~* 'wow')`;
}

export function placesInStates(stateValue) {
  const wanted = new Set(String(stateValue || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return EDU_PLACES.map((row) => row.place);
  return EDU_PLACES.filter((row) => wanted.has(row.state.toLowerCase()) || wanted.has(row.place.toLowerCase())).map((row) => row.place);
}

export function kkpNamesForStates(stateValue) {
  const wanted = new Set(String(stateValue || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];
  const names = new Set();
  EDU_PLACES.forEach((row) => {
    if (!wanted.has(row.state.toLowerCase()) && !wanted.has(row.place.toLowerCase())) return;
    names.add(row.state.toLowerCase());
    names.add(row.place.toLowerCase());
    row.keys.forEach((key) => names.add(key));
  });
  return [...names];
}

export const EDU_STATE_ORDER = ['Rajasthan', 'Gujarat', 'Uttar Pradesh', 'Karnataka', 'Maharashtra'];
