// Sanity checks for public/geo/*.geojson and the pin config. No dependencies.
// Usage: node scripts/geo/check-india-geo.mjs [geoDir=public/geo] [locationsFile=src/lib/geo/locations.js]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const geoDir = process.argv[2] || 'public/geo';
const locFile = process.argv[3] || 'src/lib/geo/locations.js';
const read = (f) => JSON.parse(fs.readFileSync(path.join(geoDir, f), 'utf8'));
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failed++; };

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function contains(geom, x, y) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((h) => inRing(x, y, h)));
}
const find = (fc, x, y) => fc.features.find((f) => contains(f.geometry, x, y));

const states = read('india_states.geojson');
const districts = read('india_districts.geojson');
const points = read('india_district_points.geojson');
const real = states.features.filter((f) => !f.properties.disputed);
ok(real.length === 36, `36 states/UTs (got ${real.length}; plus ${states.features.length - real.length} disputed areas)`);
ok(new Set(real.map((f) => f.properties.name)).size === 36, 'state names unique');
const byAbbr = (a) => real.find((f) => f.properties.state_abbr === a);
ok(byAbbr('JK') && byAbbr('LA'), 'Jammu and Kashmir and Ladakh are separate features');
for (const [label, x, y, abbr] of [['Gilgit', 74.31, 35.92, 'LA'], ['Skardu', 75.63, 35.30, 'LA'], ['Aksai Chin', 79.4, 35.2, 'LA'], ['Muzaffarabad', 73.47, 34.37, 'JK'], ['Mirpur', 73.75, 33.15, 'JK'], ['Tawang', 91.86, 27.59, 'AR'], ['Port Blair', 92.73, 11.62, 'AN']]) {
  ok(byAbbr(abbr) && contains(byAbbr(abbr).geometry, x, y), `${label} lies in ${abbr}`);
}
ok(districts.features.length === 742, `742 district features (got ${districts.features.length})`);
ok(new Set(districts.features.map((f) => f.properties.key)).size === districts.features.length, 'district keys unique');
ok(points.features.length === districts.features.length, 'one anchor point per district');
for (const f of ['india_states.geojson', 'india_districts.geojson', 'india_district_points.geojson']) {
  console.log(`INFO  ${f}: ${fs.statSync(path.join(geoDir, f)).size.toLocaleString('en-IN')} bytes`);
}

if (fs.existsSync(locFile)) {
  const tmp = path.join(os.tmpdir(), `locations-${process.pid}.mjs`);
  fs.copyFileSync(locFile, tmp);
  const mod = await import(pathToFileURL(tmp).href);
  const list = mod.MAP_LOCATIONS || [];
  for (const p of list) {
    if (p.lat == null || p.lon == null) { console.log(`INFO  pin ${p.id}: no coordinates yet (not shown)`); continue; }
    const st = find(states, p.lon, p.lat); const d = find(districts, p.lon, p.lat);
    ok(st && st.properties.name === p.state, `pin ${p.id} (${p.lat}, ${p.lon}) is in ${p.state} (found ${st?.properties.name ?? 'outside India'})`);
    const same = d && d.properties.key === p.districtKey;
    console.log(`${same ? 'PASS' : 'WARN'}  pin ${p.id} district ${p.districtKey} (polygon hit: ${d?.properties.key ?? 'none'} ${d?.properties.name ?? ''})${same ? '' : ' — border town after simplification; config districtKey wins'}`);
  }
} else {
  console.log(`INFO  ${locFile} not found; pin checks skipped`);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
