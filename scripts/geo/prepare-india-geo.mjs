// Converts the SoI-derived GeoJSONL (ramSeraph/indian_admin_boundaries releases) into
// clean FeatureCollections with app-friendly properties. Geometry is NOT changed here.
// Usage: node prepare-india-geo.mjs <SOI_States.geojsonl> <SOI_Districts.geojsonl> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [statesIn, districtsIn, outDir] = process.argv.slice(2);
if (!statesIn || !districtsIn || !outDir) { console.error('usage: node prepare-india-geo.mjs <states.geojsonl> <districts.geojsonl> <outDir>'); process.exit(1); }

// LGD state code -> [canonical display name, 2-letter abbreviation]
const STATES = {
  1: ['Jammu and Kashmir', 'JK'], 2: ['Himachal Pradesh', 'HP'], 3: ['Punjab', 'PB'], 4: ['Chandigarh', 'CH'],
  5: ['Uttarakhand', 'UK'], 6: ['Haryana', 'HR'], 7: ['Delhi', 'DL'], 8: ['Rajasthan', 'RJ'], 9: ['Uttar Pradesh', 'UP'],
  10: ['Bihar', 'BR'], 11: ['Sikkim', 'SK'], 12: ['Arunachal Pradesh', 'AR'], 13: ['Nagaland', 'NL'], 14: ['Manipur', 'MN'],
  15: ['Mizoram', 'MZ'], 16: ['Tripura', 'TR'], 17: ['Meghalaya', 'ML'], 18: ['Assam', 'AS'], 19: ['West Bengal', 'WB'],
  20: ['Jharkhand', 'JH'], 21: ['Odisha', 'OD'], 22: ['Chhattisgarh', 'CG'], 23: ['Madhya Pradesh', 'MP'], 24: ['Gujarat', 'GJ'],
  27: ['Maharashtra', 'MH'], 28: ['Andhra Pradesh', 'AP'], 29: ['Karnataka', 'KA'], 30: ['Goa', 'GA'], 31: ['Lakshadweep', 'LD'],
  32: ['Kerala', 'KL'], 33: ['Tamil Nadu', 'TN'], 34: ['Puducherry', 'PY'], 35: ['Andaman and Nicobar Islands', 'AN'],
  36: ['Telangana', 'TS'], 37: ['Ladakh', 'LA'], 38: ['Dadra and Nagar Haveli and Daman and Diu', 'DH'],
};
const SMALL = new Set(['and', 'of', 'the', 'ka', 'ki', 'ke']);
const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const title = (s) => ascii(s).toLowerCase().replace(/\s+/g, ' ').trim()
  .split(' ').map((w, i) => (i > 0 && SMALL.has(w)) ? w : w.replace(/(^|[(\-&/])([a-z])/g, (m, a, b) => a + b.toUpperCase())).join(' ');
const slug = (s) => ascii(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const disputedName = (s) => 'Disputed area ' + title(s).replace(/^Disputed\s*/i, '').replace(/\s+,/g, ',').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace('Rajathan', 'Rajasthan').replace(/^(\([^)]*)$/, '$1)');

async function readLines(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) { if (line.trim()) fn(JSON.parse(line)); }
}

const states = [];
await readLines(statesIn, (f) => {
  const p = f.properties; const code = Number(p.State_LGD);
  if (code && STATES[code]) {
    states.push({ type: 'Feature', properties: { name: STATES[code][0], state_code: code, state_abbr: STATES[code][1], disputed: false, source_name: p.STATE_C }, geometry: f.geometry });
  } else {
    states.push({ type: 'Feature', properties: { name: disputedName(p.STATE_C), state_code: 0, state_abbr: null, disputed: true, source_name: p.STATE_C }, geometry: f.geometry });
  }
});

const districts = [];
await readLines(districtsIn, (f) => {
  const p = f.properties; const sc = Number(p.State_LGD); const st = STATES[sc];
  const dcode = p.DISTRICT_L == null || p.DISTRICT_L === '' ? null : Number(p.DISTRICT_L);
  const disputedPiece = !st || /^\s*disputed/i.test(ascii(p.District_C));
  const name = disputedPiece ? disputedName(p.District_C) : title(p.District_C);
  const stateName = !st ? disputedName(p.STATE_C) : st[0];
  districts.push({ type: 'Feature', properties: {
    name, district_code: dcode, state_name: stateName, state_code: st ? sc : 0, state_abbr: st ? st[1] : null,
    key: `${st ? st[1] : 'XX'}-${dcode ?? slug(p.District_C)}`, disputed: disputedPiece,
    remarks: p.REMARKS ?? null, source_name: p.District_C,
  }, geometry: f.geometry });
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'states_clean.geojson'), JSON.stringify({ type: 'FeatureCollection', features: states }));
fs.writeFileSync(path.join(outDir, 'districts_clean.geojson'), JSON.stringify({ type: 'FeatureCollection', features: districts }));
const real = states.filter((f) => !f.properties.disputed);
console.log(`states: ${states.length} features (${real.length} states/UTs, ${states.length - real.length} disputed inter-state areas)`);
console.log(`districts: ${districts.length} features (${districts.filter((f) => f.properties.disputed).length} disputed pieces, ${districts.filter((f) => f.properties.district_code == null).length} without LGD code)`);
const keys = new Set(districts.map((f) => f.properties.key)); if (keys.size !== districts.length) { console.error('duplicate district keys'); process.exit(2); }
