/**
 * Follow-up probes: health.php date window, real disease_id, pagination cap,
 * symptom_id vs disease_id, mixprogram module_type, negative tests with dates.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'api-samples');

const API_BASE = (process.env.JUBICARE_API_BASE ||
  'https://jubicare.indevconsultancy.com/api/centralizeddashboardapi').replace(/\/+$/, '');
const MIN_GAP_MS = Number(process.env.JUBICARE_PROBE_GAP_MS || 500);
const TIMEOUT_MS = Number(process.env.API_TIMEOUT || 60) * 1000;

function env(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : '';
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (env('JUBICARE_API_HEADERS')) Object.assign(headers, JSON.parse(env('JUBICARE_API_HEADERS')));
  const token = env('JUBICARE_API_TOKEN') || env('JUBICARE_API_KEY');
  if (token && !headers.Authorization) {
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

function inferType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return t;
}

function unwrapRecords(body) {
  if (body == null) return { records: [], envelopeKeys: [], totalHint: null };
  if (Array.isArray(body)) return { records: body, envelopeKeys: [], totalHint: body.length };
  if (typeof body !== 'object') return { records: [], envelopeKeys: ['<non-object>'], totalHint: null };
  const envelopeKeys = Object.keys(body);
  const totalHint = body.total_records ?? body.total ?? body.total_count ?? body.count ?? null;
  if (Array.isArray(body.data)) return { records: body.data, envelopeKeys, totalHint };
  if (body.data && typeof body.data === 'object') return { records: [body.data], envelopeKeys, totalHint };
  for (const key of ['result', 'records', 'rows', 'list']) {
    if (Array.isArray(body[key])) return { records: body[key], envelopeKeys, totalHint };
  }
  return { records: [body], envelopeKeys, totalHint };
}

let lastCallAt = 0;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(endpoint, payload) {
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (lastCallAt && wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  const url = `${API_BASE}/${endpoint.replace(/^\/+/, '')}`;
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
    error = err.name === 'AbortError' ? `timeout` : String(err.message || err);
  } finally {
    clearTimeout(timer);
  }
  const { records, envelopeKeys, totalHint } = unwrapRecords(parsed);
  return {
    url,
    request: payload,
    httpStatus: status,
    contentType,
    latencyMs: Date.now() - started,
    error,
    parsed,
    rawPreview: parsed ? undefined : rawText.slice(0, 500),
    envelopeKeys,
    totalHint,
    recordCountThisPage: records.length,
    records
  };
}

function fieldStats(records) {
  const stats = {};
  for (const record of records.slice(0, 50)) {
    if (!record || typeof record !== 'object') continue;
    for (const [k, v] of Object.entries(record)) {
      if (!stats[k]) stats[k] = { types: new Set(), nullCount: 0, examples: [] };
      if (v === null || v === undefined || v === '') {
        stats[k].nullCount += 1;
        stats[k].types.add(v === '' ? 'empty-string' : 'null');
      } else {
        stats[k].types.add(inferType(v));
        if (stats[k].examples.length < 1) stats[k].examples.push(v);
      }
    }
  }
  const fields = {};
  for (const [k, v] of Object.entries(stats)) {
    fields[k] = {
      types: [...v.types],
      nullOrEmptyInSample: v.nullCount,
      example: v.examples[0] === undefined ? null : maskValue(k, v.examples[0])
    };
  }
  return fields;
}

async function save(filename, result, extra = {}) {
  const copy = result.parsed && typeof result.parsed === 'object' && !Array.isArray(result.parsed)
    ? { ...result.parsed }
    : result.parsed;
  if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
    for (const k of ['data', 'result', 'records', 'rows', 'list']) {
      if (Array.isArray(copy[k])) copy[k] = `[${copy[k].length} records omitted]`;
    }
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
    first3: result.records.slice(0, 3).map(maskRecord),
    fields: fieldStats(result.records),
    parsedEnvelopeWithoutRows: Array.isArray(copy) ? { kind: 'array', length: copy.length } : copy,
    rawPreview: result.rawPreview,
    ...extra
  };
  await writeFile(join(OUT_DIR, filename), JSON.stringify(out, null, 2), 'utf8');
  console.log(`${filename} -> ${result.httpStatus} n=${result.recordCountThisPage} ${result.rawPreview || ''}`);
  return out;
}

const HEALTH_TABLES = [
  'state', 'district', 'disease', 'block', 'village',
  'profile_patients', 'patient_appointments_new', 'profile_doctors', 'partner'
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const dates = { from_date: '2025-01-01', to_date: '2025-12-31' };
  const heavyDates = { from_date: '2025-12-01', to_date: '2025-12-31' };

  for (const table of HEALTH_TABLES) {
    const d = ['profile_patients', 'patient_appointments_new'].includes(table) ? heavyDates : dates;
    const payload = {
      module_type: 'health',
      table_name: table,
      ...d,
      ...(['profile_patients', 'patient_appointments_new'].includes(table)
        ? { Limit: '20', offset: '0' }
        : {})
    };
    await save(`health__${table}__dated.json`, await postJson('health.php', payload), {
      variant: 'live working body (from_date/to_date not in spec)'
    });
  }

  await save('neg__invalid_table_dated.json', await postJson('health.php', {
    module_type: 'health', table_name: 'not_a_real_table', ...dates
  }), { variant: 'negative with dates' });
  await save('neg__missing_table_dated.json', await postJson('health.php', {
    module_type: 'health', ...dates
  }), { variant: 'negative with dates' });
  await save('neg__missing_module_type_dated.json', await postJson('health.php', {
    table_name: 'state', ...dates
  }), { variant: 'negative with dates' });
  await save('neg__missing_table_skill.json', await postJson('skilltracking.php', {
    module_type: 'livelyhood', project: 'skilltracting'
  }));
  await save('neg__invalid_table_skill.json', await postJson('skilltracking.php', {
    module_type: 'livelyhood', project: 'skilltracting', table_name: 'nope'
  }));
  await save('neg__education_assessment.json', await postJson('education.php', {
    module_type: 'education', project: 'education_program', table_name: 'education_assessment'
  }));

  const diseaseId = 36;
  await save('health_desease__paged_real_id_36.json', await postJson('health_desease.php', {
    module_type: 'health', year: '2025', disease_id: String(diseaseId), Limit: '20', offset: '0'
  }));
  await save('health_desease__Limit_50.json', await postJson('health_desease.php', {
    module_type: 'health', year: '2025', disease_id: String(diseaseId), Limit: '50', offset: '0'
  }));
  await save('health_desease__page2.json', await postJson('health_desease.php', {
    module_type: 'health', year: '2025', disease_id: String(diseaseId), Limit: '20', offset: '20'
  }));

  await save('health_symtoms__paged_disease_id_36.json', await postJson('health_symtoms.php', {
    module_type: 'health', year: '2025', disease_id: '36', Limit: '20', offset: '0'
  }));
  await save('health_symtoms__paged_symptom_id_1.json', await postJson('health_symtoms.php', {
    module_type: 'health', year: '2025', symptom_id: '1', Limit: '20', offset: '0'
  }));

  await save('mixprogram__with_module_type_education.json', await postJson('mixprogram.php', {
    module_type: 'education', program_id: '5', year: '2025-26'
  }));
  await save('mixprogram__with_module_type_livelyhood.json', await postJson('mixprogram.php', {
    module_type: 'livelyhood', program_id: '5', year: '2025-26'
  }));

  await save('health_beneficiary__year_2099.json', await postJson('health_beneficiary.php', {
    module_type: 'health', year: '2099'
  }));
  await save('health_beneficiary__year_2025-26.json', await postJson('health_beneficiary.php', {
    module_type: 'health', year: '2025-26'
  }));
  await save('mixprogram__year_2025.json', await postJson('mixprogram.php', {
    program_id: '5', year: '2025'
  }));

  try {
    const idx = JSON.parse(await readFile(join(OUT_DIR, '_index.json'), 'utf8'));
    idx.followUpAt = new Date().toISOString();
    await writeFile(join(OUT_DIR, '_index.json'), JSON.stringify(idx, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
