/**
 * Read-only probe of Jubicare centralizeddashboardapi.
 * Auth/headers come from env (or Content-Type only, matching phpClient.js).
 * Never hard-code secrets. Throttled: >=500ms between requests.
 *
 * Usage (from nextjs-boilerplate):
 *   node --env-file=.env scripts/probe-apis.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'api-samples');
const MIN_GAP_MS = Number(process.env.JUBICARE_PROBE_GAP_MS || 500);
const TIMEOUT_MS = Number(process.env.API_TIMEOUT || 60) * 1000;

function env(name, fallback = '') {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

const API_BASE = env(
  'JUBICARE_API_BASE',
  'https://jubicare.indevconsultancy.com/api/centralizeddashboardapi'
).replace(/\/+$/, '');

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const extra = env('JUBICARE_API_HEADERS');
  if (extra) {
    const parsed = JSON.parse(extra);
    Object.assign(headers, parsed);
  }
  const token = env('JUBICARE_API_TOKEN') || env('JUBICARE_API_KEY');
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return headers;
}

const PII_KEYS = /^(full_name|person_name|member_name|doctor_name|patient_name|name|email|contact_no|phone_number|mobile_number|mobile|aadhar_no|aadhaar|unique_code|address|user_id|patient_id|person_id|member_id)$/i;

function maskValue(key, value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? maskRecord(v) : v));
  if (typeof value === 'object') return maskRecord(value);
  if (PII_KEYS.test(key)) {
    const s = String(value);
    if (s.length <= 2) return '***';
    return `${s.slice(0, 1)}***${s.slice(-1)}`;
  }
  return value;
}

function maskRecord(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = maskValue(k, v);
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unwrapRecords(body) {
  if (body == null) return { records: [], envelopeKeys: [], totalHint: null };
  if (Array.isArray(body)) {
    return { records: body, envelopeKeys: [], totalHint: body.length };
  }
  if (typeof body !== 'object') {
    return { records: [], envelopeKeys: ['<non-object>'], totalHint: null };
  }
  const envelopeKeys = Object.keys(body);
  const totalHint =
    body.total ??
    body.total_count ??
    body.Total ??
    body.count ??
    body.Count ??
    (typeof body.data?.total === 'number' ? body.data.total : null) ??
    null;
  if (Array.isArray(body.data)) {
    return { records: body.data, envelopeKeys, totalHint: totalHint ?? body.data.length };
  }
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    return { records: [body.data], envelopeKeys, totalHint };
  }
  for (const key of ['result', 'records', 'rows', 'list']) {
    if (Array.isArray(body[key])) {
      return { records: body[key], envelopeKeys, totalHint: totalHint ?? body[key].length };
    }
  }
  const skip = new Set(['status', 'msg', 'message', 'error', 'year']);
  const rest = Object.keys(body).filter((k) => !skip.has(k));
  if (rest.length && rest.every((k) => skip.has(k) === false)) {
    return { records: [body], envelopeKeys, totalHint };
  }
  return { records: [], envelopeKeys, totalHint };
}

function inferType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return t;
}

function mergeFieldStats(stats, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return;
  for (const [k, v] of Object.entries(record)) {
    if (!stats[k]) stats[k] = { types: new Set(), nullCount: 0, examples: [] };
    if (v === null || v === undefined || v === '') {
      stats[k].nullCount += 1;
      stats[k].types.add(v === '' ? 'empty-string' : 'null');
    } else {
      stats[k].types.add(inferType(v));
      if (stats[k].examples.length < 3) stats[k].examples.push(v);
    }
  }
}

let lastCallAt = 0;
async function postJson(endpoint, payload, { query = '' } = {}) {
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (lastCallAt && wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  const url = `${API_BASE}/${endpoint.replace(/^\/+/, '')}${query}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  let status = 0;
  let contentType = '';
  let rawText = '';
  let parsed = null;
  let error = null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    status = res.status;
    contentType = res.headers.get('content-type') || '';
    rawText = await res.text();
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }
  } catch (err) {
    error = err.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : String(err.message || err);
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;
  const { records, envelopeKeys, totalHint } = unwrapRecords(parsed);
  return {
    url,
    request: payload,
    httpStatus: status,
    contentType,
    latencyMs,
    error,
    parsed,
    rawPreview: rawText.slice(0, 400),
    envelopeKeys,
    totalHint,
    recordCountThisPage: records.length,
    records
  };
}

function sampleName(endpoint, table) {
  const ep = endpoint.replace(/\.php$/i, '');
  const safe = String(table).replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `${ep}__${safe}.json`;
}

async function saveSample(filename, result, extra = {}) {
  const first3 = result.records.slice(0, 3).map(maskRecord);
  const fieldStats = {};
  for (const r of result.records.slice(0, 50)) mergeFieldStats(fieldStats, r);
  const fields = {};
  for (const [k, v] of Object.entries(fieldStats)) {
    fields[k] = {
      types: [...v.types],
      nullOrEmptyInSample: v.nullCount,
      example: v.examples[0] === undefined ? null : maskValue(k, v.examples[0])
    };
  }
  const out = {
    request: result.request,
    url: result.url,
    httpStatus: result.httpStatus,
    contentType: result.contentType,
    latencyMs: result.latencyMs,
    error: result.error,
    envelopeKeys: result.envelopeKeys,
    totalHint: result.totalHint,
    recordCountThisPage: result.recordCountThisPage,
    first3: first3,
    fields,
    parsedEnvelopeWithoutRows: (() => {
      if (!result.parsed || typeof result.parsed !== 'object' || Array.isArray(result.parsed)) {
        return Array.isArray(result.parsed) ? { kind: 'array' } : result.parsed;
      }
      const copy = { ...result.parsed };
      for (const k of ['data', 'result', 'records', 'rows', 'list']) {
        if (Array.isArray(copy[k])) copy[k] = `[${copy[k].length} records omitted]`;
      }
      return copy;
    })(),
    rawPreview: result.parsed ? undefined : result.rawPreview,
    ...extra
  };
  await writeFile(join(OUT_DIR, filename), JSON.stringify(out, null, 2), 'utf8');
  return { filename, ...out, _records: result.records };
}

const HEALTH_TABLES = [
  'state',
  'district',
  'disease',
  'block',
  'village',
  'profile_patients',
  'patient_appointments_new',
  'profile_doctors',
  'partner'
];
const SKILL_TABLES = [
  'state',
  'district',
  'block',
  'village',
  'persons',
  'monitor',
  'batch_list',
  'qualification',
  'skill_center',
  'training_stream',
  'pre_post_master',
  'program',
  'kkp_pre_and_post'
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const index = [];
  const notes = [];

  console.log(`Base: ${API_BASE}`);
  console.log(`Gap: ${MIN_GAP_MS}ms  Timeout: ${TIMEOUT_MS}ms`);

  // --- STEP 2: documented payloads ---
  for (const table of HEALTH_TABLES) {
    const r = await postJson('health.php', { module_type: 'health', table_name: table });
    index.push(await saveSample(sampleName('health.php', table), r));
    console.log(`health.php ${table} (spec body) -> ${r.httpStatus} n=${r.recordCountThisPage} ${r.rawPreview || ''}`);
  }

  // Spec omits from_date/to_date; live health.php requires YYYY-MM-DD.
  const lookupDates = { from_date: '2025-01-01', to_date: '2025-12-31' };
  const heavyDates = { from_date: '2025-12-29', to_date: '2025-12-31' };
  for (const table of HEALTH_TABLES) {
    const d = ['profile_patients', 'patient_appointments_new'].includes(table) ? heavyDates : lookupDates;
    const payload = { module_type: 'health', table_name: table, ...d };
    if (['profile_patients', 'patient_appointments_new'].includes(table)) {
      payload.Limit = '20';
      payload.offset = '0';
    }
    const r = await postJson('health.php', payload);
    index.push(await saveSample(sampleName('health.php', `${table}__dated`), r, {
      variant: 'live working body; from_date/to_date not in spec'
    }));
    console.log(`health.php ${table} (dated) -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  {
    const r = await postJson('health.php', { module_type: 'health', table_name: 'state' }, { query: '?type=reach' });
    index.push(await saveSample(sampleName('health.php', 'state_type_reach'), r, { variant: 'query ?type=reach' }));
    console.log(`health.php ?type=reach -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  {
    const r = await postJson('health_beneficiary.php', { module_type: 'health', year: '2025' });
    index.push(await saveSample(sampleName('health_beneficiary.php', 'year_2025'), r));
    console.log(`health_beneficiary 2025 -> ${r.httpStatus}`);
  }

  {
    const r = await postJson('health_desease.php', { module_type: 'health', year: '2025' });
    index.push(await saveSample(sampleName('health_desease.php', 'summary_2025'), r));
    console.log(`health_desease summary -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }
  {
    const r = await postJson('health_desease.php', {
      module_type: 'health',
      year: '2025',
      disease_id: '2025',
      Limit: '20',
      offset: '0'
    });
    index.push(await saveSample(sampleName('health_desease.php', 'paged_placeholder_id'), r));
    console.log(`health_desease placeholder disease_id -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  for (const file of ['health_symtom.php', 'health_symtoms.php', 'health_symptom.php']) {
    const r = await postJson(file, { module_type: 'health', year: '2025' });
    index.push(await saveSample(sampleName(file, 'summary_2025'), r, { variant: 'filename spelling' }));
    console.log(`${file} summary -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }
  {
    const r = await postJson('health_symtom.php', {
      module_type: 'health',
      year: '2025',
      disease_id: '2025',
      Limit: '20',
      offset: '0'
    });
    index.push(await saveSample(sampleName('health_symtom.php', 'paged_placeholder_id'), r));
  }

  for (const table of SKILL_TABLES) {
    const r = await postJson('skilltracking.php', {
      module_type: 'livelyhood',
      project: 'skilltracting',
      table_name: table
    });
    index.push(await saveSample(sampleName('skilltracking.php', table), r));
    console.log(`skilltracking ${table} -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  for (const table of ['enterprise_support', 'enterprise_support_monitoring']) {
    const r = await postJson('enterprise_support.php', {
      module_type: 'livelyhood',
      project: 'enterprise_support',
      table_name: table
    });
    index.push(await saveSample(sampleName('enterprise_support.php', table), r));
    console.log(`enterprise_support ${table} -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  {
    const r = await postJson('mixprogram.php', { program_id: '5', year: '2025-26' });
    index.push(await saveSample(sampleName('mixprogram.php', 'program_5_2025-26'), r));
    console.log(`mixprogram 5 / 2025-26 -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  for (const table of ['market_access', 'enterprise_support_monitoring']) {
    const r = await postJson('market_access.php', {
      module_type: 'livelyhood',
      project: 'market_access',
      table_name: table
    });
    index.push(await saveSample(sampleName('market_access.php', table), r));
    console.log(`market_access ${table} -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  {
    const r = await postJson('education.php', {
      module_type: 'education',
      project: 'education_program',
      table_name: 'education_program'
    });
    index.push(await saveSample(sampleName('education.php', 'education_program'), r));
    console.log(`education_program -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  // --- STEP 3: negative / edge ---
  const negatives = [
    ['neg__invalid_table', 'health.php', { module_type: 'health', table_name: 'not_a_real_table' }],
    ['neg__missing_table', 'health.php', { module_type: 'health' }],
    ['neg__missing_module_type', 'health.php', { table_name: 'state' }],
    ['neg__year_2025-26_beneficiary', 'health_beneficiary.php', { module_type: 'health', year: '2025-26' }],
    ['neg__year_2025_mixprogram', 'mixprogram.php', { program_id: '5', year: '2025' }],
    [
      'neg__Limit_offset_numbers',
      'health_desease.php',
      { module_type: 'health', year: '2025', disease_id: '1', Limit: 20, offset: 0 }
    ],
    [
      'neg__limit_lowercase',
      'health_desease.php',
      { module_type: 'health', year: '2025', disease_id: '1', limit: '20', offset: '0' }
    ],
    [
      'neg__Limit_very_large',
      'health_desease.php',
      { module_type: 'health', year: '2025', disease_id: '1', Limit: '100000', offset: '0' }
    ],
    [
      'neg__offset_past_end',
      'health_desease.php',
      { module_type: 'health', year: '2025', disease_id: '1', Limit: '20', offset: '999999' }
    ],
    ['neg__empty_year', 'health_beneficiary.php', { module_type: 'health', year: '2099' }],
    ['neg__empty_mixprogram', 'mixprogram.php', { program_id: '99999', year: '2025-26' }]
  ];
  for (const [name, ep, body] of negatives) {
    const r = await postJson(ep, body);
    index.push(await saveSample(`${name}.json`, r, { variant: 'negative/edge' }));
    console.log(`${name} -> ${r.httpStatus} n=${r.recordCountThisPage} err=${r.error || ''}`);
  }

  // --- STEP 4: spelling + real IDs ---
  const spelling = [
    ['spell__livelihood_skilltracking', 'skilltracking.php', {
      module_type: 'livelihood',
      project: 'skilltracking',
      table_name: 'state'
    }],
    ['spell__livelihood_skilltracting', 'skilltracking.php', {
      module_type: 'livelihood',
      project: 'skilltracting',
      table_name: 'state'
    }],
    ['spell__livelyhood_skilltracking', 'skilltracking.php', {
      module_type: 'livelyhood',
      project: 'skilltracking',
      table_name: 'state'
    }]
  ];
  for (const [name, ep, body] of spelling) {
    const r = await postJson(ep, body);
    index.push(await saveSample(`${name}.json`, r, { variant: 'spelling' }));
    console.log(`${name} -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  const diseaseTable = index.find((s) => s.filename === sampleName('health.php', 'disease__dated'));
  const diseaseSummary = index.find((s) => s.filename === sampleName('health_desease.php', 'summary_2025'));
  const diseaseIds = [];
  for (const row of diseaseSummary?._records || []) {
    const id = row.disease_id ?? row.id;
    if (id != null && id !== '' && id !== 0) diseaseIds.push(String(id));
    if (diseaseIds.length >= 3) break;
  }
  if (!diseaseIds.length) {
    for (const row of diseaseTable?._records || []) {
      const id = row.id ?? row.disease_id;
      if (id != null && id !== '' && id !== 0) diseaseIds.push(String(id));
      if (diseaseIds.length >= 3) break;
    }
  }
  notes.push({ diseaseIdsFromTable: diseaseIds });

  for (const id of diseaseIds.slice(0, 2)) {
    for (const [ep, tag] of [
      ['health_desease.php', 'desease_real_id'],
      ['health_symtom.php', 'symtom_real_id'],
      ['health_symtoms.php', 'symtoms_real_id']
    ]) {
      const r = await postJson(ep, {
        module_type: 'health',
        year: '2025',
        disease_id: id,
        Limit: '20',
        offset: '0'
      });
      index.push(await saveSample(sampleName(ep, `${tag}_${id}`), r, { variant: 'real disease_id' }));
      console.log(`${ep} disease_id=${id} -> ${r.httpStatus} n=${r.recordCountThisPage}`);
    }
  }

  const programSample = index.find((s) => s.filename === sampleName('skilltracking.php', 'program'));
  const programIds = [];
  if (programSample?._records) {
    for (const row of programSample._records) {
      const id = row.program_id ?? row.id;
      if (id != null && id !== '') programIds.push({ id: String(id), name: row.program_name ?? row.name ?? null });
    }
  }
  notes.push({ programCatalog: programIds });

  for (const p of programIds.slice(0, 8)) {
    const r = await postJson('mixprogram.php', { program_id: p.id, year: '2025-26' });
    index.push(await saveSample(sampleName('mixprogram.php', `program_${p.id}_2025-26`), r, {
      variant: 'catalog program_id',
      programName: p.name
    }));
    console.log(`mixprogram program_id=${p.id} -> ${r.httpStatus} n=${r.recordCountThisPage}`);
  }

  {
    const r = await postJson('mixprogram.php', {
      module_type: 'education',
      program_id: '5',
      year: '2025-26'
    });
    index.push(await saveSample(sampleName('mixprogram.php', 'with_module_type'), r, { variant: 'added module_type' }));
  }
  {
    const r = await postJson('mixprogram.php', {
      module_type: 'livelyhood',
      program_id: '5',
      year: '2025-26'
    });
    index.push(await saveSample(sampleName('mixprogram.php', 'with_module_type_livelyhood'), r));
  }

  // Pagination total-count check: two pages of disease-wise with a real id
  if (diseaseIds[0]) {
    const a = await postJson('health_desease.php', {
      module_type: 'health',
      year: '2025',
      disease_id: diseaseIds[0],
      Limit: '5',
      offset: '0'
    });
    const b = await postJson('health_desease.php', {
      module_type: 'health',
      year: '2025',
      disease_id: diseaseIds[0],
      Limit: '5',
      offset: '5'
    });
    index.push(await saveSample(sampleName('health_desease.php', 'page_limit5_off0'), a));
    index.push(await saveSample(sampleName('health_desease.php', 'page_limit5_off5'), b));
    notes.push({
      paginationProbe: {
        envelopeA: a.envelopeKeys,
        envelopeB: b.envelopeKeys,
        totalHintA: a.totalHint,
        totalHintB: b.totalHint,
        nA: a.recordCountThisPage,
        nB: b.recordCountThisPage
      }
    });
  }

  const slimIndex = index.map(({ _records, ...rest }) => rest);
  await writeFile(
    join(OUT_DIR, '_index.json'),
    JSON.stringify({ probedAt: new Date().toISOString(), apiBase: API_BASE, notes, samples: slimIndex }, null, 2),
    'utf8'
  );
  console.log(`Wrote ${index.length} samples to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
