import { MAP_LOCATIONS } from './locations.js';

export function normaliseName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const MAP_STATE_NAMES = [
  'Jammu and Kashmir',
  'Himachal Pradesh',
  'Punjab',
  'Chandigarh',
  'Uttarakhand',
  'Haryana',
  'Delhi',
  'Rajasthan',
  'Uttar Pradesh',
  'Bihar',
  'Sikkim',
  'Arunachal Pradesh',
  'Nagaland',
  'Manipur',
  'Mizoram',
  'Tripura',
  'Meghalaya',
  'Assam',
  'West Bengal',
  'Jharkhand',
  'Odisha',
  'Chhattisgarh',
  'Madhya Pradesh',
  'Gujarat',
  'Maharashtra',
  'Andhra Pradesh',
  'Karnataka',
  'Goa',
  'Lakshadweep',
  'Kerala',
  'Tamil Nadu',
  'Puducherry',
  'Andaman and Nicobar Islands',
  'Telangana',
  'Ladakh',
  'Dadra and Nagar Haveli and Daman and Diu'
];

const STATE_BY_NORM = new Map(MAP_STATE_NAMES.map((name) => [normaliseName(name), name]));

export const STATE_ALIASES = {
  up: 'Uttar Pradesh',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  jarkhand: 'Jharkhand'
};

/** App district spelling -> SoI key, only where exactly one candidate exists. */
export const DISTRICT_ALIASES = {
  'KA|mysore': 'KA-545',
  'UP|gautam budh nagar': 'UP-144',
  'UP|gautam buddha nagar': 'UP-144',
  'WB|hooghly': 'WB-312',
  'WB|howrah': 'WB-313',
  'PB|mohali': 'PB-608'
};

export function toMapState(appName) {
  const key = normaliseName(appName);
  if (!key) return null;
  return STATE_BY_NORM.get(key) || STATE_ALIASES[key] || null;
}

export function buildDistrictIndex(features) {
  const abbrByState = new Map();
  const byStateNorm = new Map();
  const byKey = new Map();
  for (const feature of features || []) {
    const props = feature.properties || {};
    if (!props.state_abbr || props.disputed) continue;
    abbrByState.set(props.state_name, props.state_abbr);
    if (!byStateNorm.has(props.state_abbr)) byStateNorm.set(props.state_abbr, new Map());
    const bucket = byStateNorm.get(props.state_abbr);
    const norm = normaliseName(props.name);
    const list = bucket.get(norm) || [];
    list.push(props.key);
    bucket.set(norm, list);
    byKey.set(props.key, props);
  }
  return { abbrByState, byStateNorm, byKey };
}

function townDistrictKey(stateName, normDistrict) {
  const hits = MAP_LOCATIONS.filter((pin) => (
    normaliseName(pin.town) === normDistrict && toMapState(pin.state) === stateName
  ));
  return hits.length === 1 ? hits[0].districtKey : null;
}

export function toMapDistrict(appState, appDistrict, districtIndex) {
  if (!districtIndex) return null;
  const stateName = toMapState(appState);
  if (!stateName) return null;
  const abbr = districtIndex.abbrByState.get(stateName);
  if (!abbr) return null;
  const norm = normaliseName(appDistrict);
  if (!norm) return null;
  const alias = DISTRICT_ALIASES[`${abbr}|${norm}`];
  if (alias) return alias;
  const hits = districtIndex.byStateNorm.get(abbr)?.get(norm);
  if (hits && hits.length === 1) return hits[0];
  if (hits && hits.length > 1) return null;
  return townDistrictKey(stateName, norm);
}

function countLabel(name, value) {
  const n = Number(value) || 0;
  return `${name} (${n.toLocaleString('en-IN')})`;
}

export function stateMetricsFromLabels(rows, metricLabel) {
  const stateMetrics = {};
  const unmapped = [];
  for (const row of rows || []) {
    const value = Number(row.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const name = toMapState(row.label);
    if (!name) {
      unmapped.push(countLabel(row.label, value));
      continue;
    }
    const prev = stateMetrics[name];
    stateMetrics[name] = { value: (prev?.value || 0) + value, label: metricLabel };
  }
  return { stateMetrics, unmapped };
}

export function matchAdminCounts(stateRows, districtRows, districtIndex) {
  const stateMetrics = {};
  const districtMetrics = {};
  const unmapped = [];

  for (const row of stateRows || []) {
    const value = Number(row.value) || 0;
    if (value <= 0) continue;
    const mapName = toMapState(row.state);
    if (!mapName) {
      unmapped.push(countLabel(row.state, value));
      continue;
    }
    const prev = stateMetrics[mapName];
    stateMetrics[mapName] = {
      value: (prev?.value || 0) + value,
      label: 'Patients',
      stateId: !prev || value >= prev.value ? String(row.state_id ?? '') : prev.stateId
    };
  }

  for (const row of districtRows || []) {
    const value = Number(row.value) || 0;
    if (value <= 0) continue;
    const key = toMapDistrict(row.state, row.district, districtIndex);
    if (!key) {
      unmapped.push(`${row.district} (${row.state}) (${value.toLocaleString('en-IN')})`);
      continue;
    }
    const prev = districtMetrics[key];
    const districtId = String(row.district_id ?? '');
    districtMetrics[key] = {
      value: (prev?.value || 0) + value,
      stateId: String(row.state_id ?? prev?.stateId ?? ''),
      districtId: !prev ? districtId : (prev.districtId === districtId ? prev.districtId : null),
      stateName: toMapState(row.state)
    };
  }

  const stateById = {};
  for (const [name, metric] of Object.entries(stateMetrics)) {
    if (metric.stateId) stateById[metric.stateId] = name;
  }
  return { stateMetrics, districtMetrics, unmapped, stateById };
}
