import axios from 'axios';
import pool from './db.js';

import { currentCalendarYear, financialYearsFrom } from './phpRegistry.js';

const API_BASE = 'https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/';
const BATCH_SIZE = 300;
const MAX_TEXT_LEN = 1000;
const HTML_RE = /<[^>]+>/g;
const HEALTH_SYNC_START = process.env.HEALTH_SYNC_START || '2025-01-01';
const cy = Number(currentCalendarYear());
const HEALTH_SUMMARY_YEARS = (process.env.HEALTH_SUMMARY_YEARS
  || [cy - 2, cy - 1, cy].join(','))
  .split(',')
  .map((y) => y.trim())
  .filter(Boolean);
function yearList(start, end) {
  const out = [];
  for (let y = Number(start); y <= Number(end); y++) out.push(String(y));
  return out;
}
const HEALTH_BENEFICIARY_YEARS = (process.env.HEALTH_BENEFICIARY_YEARS
  || yearList(2016, Number(currentCalendarYear())).join(','))
  .split(',')
  .map((y) => y.trim())
  .filter(Boolean);
const MIXPROGRAM_ID = process.env.EDU_PROGRAM_ID || '5';
const MIXPROGRAM_YEARS = (process.env.EDU_MIX_YEARS || financialYearsFrom('2023-24').join(','))
  .split(',')
  .map((y) => y.trim())
  .filter(Boolean);
const MIXPROGRAM_CALL_GAP_MS = 600;

// Helper to sanitise API string values (remove tags and cap length)
function _sanitise(val) {
  if (val === null || val === undefined) return null;
  const cleaned = String(val).replace(HTML_RE, '');
  return cleaned.substring(0, MAX_TEXT_LEN);
}

// Normalise API nested JSON lists
function parseApiResponse(raw) {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        raw = JSON.parse(trimmed);
      } catch (e) {
        throw new Error(`Invalid JSON string returned from API: ${trimmed.substring(0, 200)}`);
      }
    } else {
      throw new Error(`API returned error string: ${trimmed.substring(0, 200)}`);
    }
  }

  if (Array.isArray(raw)) {
    const skipKeys = new Set(['status', 'msg', 'message', 'error']);
    const result = [];
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item);
        if (keys.length > 0 && keys.every(k => skipKeys.has(k))) {
          continue;
        }
      }
      result.push(item);
    }
    return result;
  }

  if (typeof raw === 'object' && raw !== null) {
    if (raw.status === false || raw.status === 'error' || raw.status === 'fail') {
      const errMsg = raw.msg || raw.message || 'Unknown API error status';
      throw new Error(`API error response: ${errMsg}`);
    }

    const skipKeys = new Set(['status', 'msg', 'message', 'error']);
    const keys = Object.keys(raw);
    if (keys.length > 0 && keys.every(k => skipKeys.has(k))) {
      return [];
    }
    // PHP envelopes often wrap a scalar object in .data
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      const inner = { ...raw.data };
      if (raw.year != null && inner.year == null) inner.year = raw.year;
      return [inner];
    }
    for (const val of Object.values(raw)) {
      if (Array.isArray(val)) {
        return parseApiResponse(val);
      }
    }
    return [raw];
  }
  return [];
}

// Fetch with backoff retries
async function fetchWithRetry(endpoint, payload, timeout = 30, maxRetries = 2) {
  const url = `${API_BASE}${endpoint}`;
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        timeout: timeout * 1000,
        headers: { 'Content-Type': 'application/json' }
      });
      const data = response.data;
      return parseApiResponse(data);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      if (status === 500) throw err;
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise(res => setTimeout(res, waitTime));
      }
    }
  }
  throw lastError;
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function midIso(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return new Date(a + Math.floor((b - a) / 2)).toISOString().slice(0, 10);
}

function buildDateChunks(fromDate, toDate, chunkDays) {
  const chunks = [];
  let currentFrom = new Date(`${fromDate}T00:00:00Z`);
  const targetTo = new Date(`${toDate}T00:00:00Z`);
  const size = Math.max(1, Number(chunkDays) || 10);
  while (currentFrom <= targetTo) {
    const currentTo = new Date(currentFrom);
    currentTo.setUTCDate(currentTo.getUTCDate() + (size - 1));
    if (currentTo > targetTo) currentTo.setTime(targetTo.getTime());
    chunks.push({
      from: currentFrom.toISOString().slice(0, 10),
      to: currentTo.toISOString().slice(0, 10)
    });
    currentFrom = new Date(currentTo);
    currentFrom.setUTCDate(currentFrom.getUTCDate() + 1);
  }
  return chunks;
}

async function loadSyncProgress(tableName) {
  try {
    const res = await pool.query(
      `SELECT last_to_date FROM sync_progress WHERE table_name = $1`,
      [tableName]
    );
    return res.rows[0]?.last_to_date || null;
  } catch {
    return null;
  }
}

async function saveSyncProgress(tableName, lastToDate) {
  await pool.query(
    `INSERT INTO sync_progress (table_name, last_to_date, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (table_name)
     DO UPDATE SET last_to_date = EXCLUDED.last_to_date, updated_at = EXCLUDED.updated_at`,
    [tableName, lastToDate, new Date().toISOString()]
  );
}

/** Fetch one date window, upsert immediately. On PHP 500, split the window and upsert each half. */
async function ingestDatedWindow(plan, from, to, timeout, maxRetries, depth = 0) {
  try {
    const records = await fetchWithRetry(
      plan.endpoint,
      { ...plan.payload, from_date: from, to_date: to },
      timeout,
      maxRetries
    );
    if (!records?.length) return { fetched: 0, upserted: 0 };
    const upserted = await ingestRecords(plan, records, timeout, maxRetries);
    return { fetched: records.length, upserted };
  } catch (err) {
    if (err.response?.status === 500 && from && to && depth < 3 && from < to) {
      let mid = midIso(from, to);
      if (mid >= to) mid = addDaysIso(to, -1);
      if (mid < from) mid = from;
      console.warn(`[syncEngine] HTTP 500 on ${plan.endpoint} ${from}..${to}; split at ${mid} and upsert each half`);
      const first = await ingestDatedWindow(plan, from, mid, timeout, maxRetries, depth + 1);
      const nextFrom = addDaysIso(mid, 1);
      const second = nextFrom <= to
        ? await ingestDatedWindow(plan, nextFrom, to, timeout, maxRetries, depth + 1)
        : { fetched: 0, upserted: 0 };
      return {
        fetched: first.fetched + second.fetched,
        upserted: first.upserted + second.upserted
      };
    }
    throw err;
  }
}

// Write a sync log record
async function writeSyncLog(moduleName, tableName, fetched, upserted, status, error, startedAt) {
  try {
    const query = `
      INSERT INTO sync_log (module, table_name, records_fetched, records_upserted, status, error_message, started_at, finished_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await pool.query(query, [
      moduleName,
      tableName,
      fetched,
      upserted,
      status,
      error ? String(error).substring(0, 500) : null,
      startedAt,
      new Date().toISOString()
    ]);
  } catch (err) {
    console.error(`Failed to write sync log for ${tableName}:`, err);
  }
}

async function ensureColumn(table, column, type = 'TEXT') {
  await pool.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
}

export async function ensureEnvelopeTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_progress (
      table_name TEXT PRIMARY KEY,
      last_to_date TEXT,
      updated_at TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_beneficiary_year (
      year TEXT PRIMARY KEY,
      total_beneficiary INTEGER,
      total_village INTEGER,
      total_state INTEGER,
      total_adolescent_10_19 INTEGER,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_disease_summary (
      id TEXT PRIMARY KEY,
      year TEXT,
      disease_id TEXT,
      disease_name TEXT,
      total_patients INTEGER,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_symptom_summary (
      id TEXT PRIMARY KEY,
      year TEXT,
      symptom_id TEXT,
      symptom_name TEXT,
      total_patients INTEGER,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_disease_patients (
      id TEXT PRIMARY KEY,
      year TEXT,
      disease_id TEXT,
      patient_id TEXT,
      patient_name TEXT,
      full_name TEXT,
      payload TEXT,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS education_mixprogram (
      id TEXT PRIMARY KEY,
      program_id TEXT,
      sno TEXT,
      location TEXT,
      block TEXT,
      school_name TEXT,
      year TEXT,
      students_male INTEGER,
      students_female INTEGER,
      students_total INTEGER,
      teachers_reached INTEGER,
      theme_touched TEXT,
      class TEXT,
      status TEXT,
      number_of_farmers INTEGER,
      activity_name TEXT,
      month TEXT,
      fellows INTEGER,
      values_taught TEXT,
      sessions_per_value INTEGER,
      total_sessions INTEGER,
      age_group TEXT,
      number_of_schools INTEGER,
      number_of_teachers INTEGER,
      category_gen INTEGER,
      category_sc_st INTEGER,
      category_obc INTEGER,
      category_ebc INTEGER,
      category_minorities INTEGER,
      person_gender TEXT,
      payload TEXT,
      district TEXT,
      trade TEXT,
      course_name TEXT,
      event_date TEXT,
      person_age INTEGER,
      person_category TEXT,
      placement_status TEXT,
      pre_income TEXT,
      post_income TEXT,
      pre_income_individual TEXT,
      post_income_individual TEXT,
      mentorship_training_sessions TEXT,
      training_type TEXT,
      mix_duration TEXT,
      phase TEXT,
      funding_support TEXT,
      funding_organisation TEXT,
      funding_amount TEXT,
      grand_total INTEGER,
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS skilltracking_program (
      program_id TEXT PRIMARY KEY,
      program_name TEXT,
      code TEXT,
      status TEXT,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS skilltracking_kkp_pre_and_post (
      id TEXT PRIMARY KEY,
      financial_year TEXT,
      location_name TEXT,
      value_name TEXT,
      pre_kkp TEXT,
      post_kkp TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_health_beneficiary_year ON health_beneficiary_year (year)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_health_disease_summary_year ON health_disease_summary (year)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_health_symptom_summary_year ON health_symptom_summary (year)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_education_mixprogram_year ON education_mixprogram (year, program_id)`);
  const extraIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_health_disease_patients_year ON health_disease_patients (year, disease_id)`,
    `CREATE INDEX IF NOT EXISTS idx_health_profile_patients_geo ON health_profile_patients (state_id, district_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_health_appointments_created ON health_patient_appointments (created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_education_mixprogram_students ON education_mixprogram (students_total DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_skilltracking_kkp_year ON skilltracking_kkp_pre_and_post (financial_year)`
  ];
  for (const sql of extraIndexes) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.warn('[syncEngine] index skipped:', err.message);
    }
  }
  try {
    await ensureColumn('education_program', 'activity_count', 'TEXT');
    await ensureColumn('education_program', 'total_interventions', 'TEXT');
  } catch (err) {
    console.warn('[syncEngine] Could not add education_program extra columns:', err.message);
  }
  const mixExtra = [
    ['number_of_farmers', 'INTEGER'],
    ['activity_name', 'TEXT'],
    ['month', 'TEXT'],
    ['fellows', 'INTEGER'],
    ['values_taught', 'TEXT'],
    ['sessions_per_value', 'INTEGER'],
    ['total_sessions', 'INTEGER'],
    ['age_group', 'TEXT'],
    ['number_of_schools', 'INTEGER'],
    ['number_of_teachers', 'INTEGER'],
    ['category_gen', 'INTEGER'],
    ['category_sc_st', 'INTEGER'],
    ['category_obc', 'INTEGER'],
    ['category_ebc', 'INTEGER'],
    ['category_minorities', 'INTEGER'],
    ['person_gender', 'TEXT'],
    ['payload', 'TEXT'],
    ['district', 'TEXT'],
    ['trade', 'TEXT'],
    ['course_name', 'TEXT'],
    ['event_date', 'TEXT'],
    ['person_age', 'INTEGER'],
    ['person_category', 'TEXT'],
    ['placement_status', 'TEXT'],
    ['pre_income', 'TEXT'],
    ['post_income', 'TEXT'],
    ['pre_income_individual', 'TEXT'],
    ['post_income_individual', 'TEXT'],
    ['mentorship_training_sessions', 'TEXT'],
    ['training_type', 'TEXT'],
    ['mix_duration', 'TEXT'],
    ['phase', 'TEXT'],
    ['funding_support', 'TEXT'],
    ['funding_organisation', 'TEXT'],
    ['funding_amount', 'TEXT'],
    ['grand_total', 'INTEGER']
  ];
  for (const [col, type] of mixExtra) {
    try {
      await ensureColumn('education_mixprogram', col, type);
    } catch (err) {
      console.warn(`[syncEngine] Could not add education_mixprogram.${col}:`, err.message);
    }
  }
  try {
    await pool.query(`
      UPDATE education_mixprogram AS a
      SET id = a.program_id || '_' || a.id
      WHERE a.program_id IS NOT NULL
        AND BTRIM(a.program_id) <> ''
        AND a.id IS NOT NULL
        AND a.id NOT LIKE a.program_id || '_%'
        AND NOT EXISTS (
          SELECT 1 FROM education_mixprogram b
          WHERE b.id = a.program_id || '_' || a.id
        )
    `);
    await pool.query(`
      DELETE FROM education_mixprogram AS a
      WHERE a.program_id IS NOT NULL
        AND BTRIM(a.program_id) <> ''
        AND a.id IS NOT NULL
        AND a.id NOT LIKE a.program_id || '_%'
        AND EXISTS (
          SELECT 1 FROM education_mixprogram b
          WHERE b.id = a.program_id || '_' || a.id
        )
    `);
  } catch (err) {
    console.warn('[syncEngine] mixprogram id namespace skipped:', err.message);
  }
  try {
    await pool.query(`
      UPDATE education_mixprogram
      SET
        district = COALESCE(NULLIF(TRIM(district), ''), payload::json->>'district'),
        trade = COALESCE(NULLIF(TRIM(trade), ''), payload::json->>'trade'),
        course_name = COALESCE(NULLIF(TRIM(course_name), ''), payload::json->>'course_name'),
        event_date = COALESCE(NULLIF(TRIM(event_date), ''), payload::json->>'date'),
        person_age = COALESCE(
          person_age,
          CASE WHEN payload::json->>'age' ~ '^[0-9]+$' THEN (payload::json->>'age')::integer ELSE NULL END
        ),
        person_category = COALESCE(NULLIF(TRIM(person_category), ''), payload::json->>'category'),
        person_gender = COALESCE(NULLIF(TRIM(person_gender), ''), payload::json->>'gender'),
        placement_status = COALESCE(NULLIF(TRIM(placement_status), ''), payload::json->>'placement_status'),
        pre_income = COALESCE(NULLIF(TRIM(pre_income), ''), payload::json->>'pre_income'),
        post_income = COALESCE(NULLIF(TRIM(post_income), ''), payload::json->>'post_income'),
        pre_income_individual = COALESCE(NULLIF(TRIM(pre_income_individual), ''), payload::json->>'pre_income_individual'),
        post_income_individual = COALESCE(NULLIF(TRIM(post_income_individual), ''), payload::json->>'post_income_individual'),
        mentorship_training_sessions = COALESCE(NULLIF(TRIM(mentorship_training_sessions), ''), payload::json->>'mentorship_training_sessions'),
        training_type = COALESCE(NULLIF(TRIM(training_type), ''), payload::json->>'training_type'),
        mix_duration = COALESCE(NULLIF(TRIM(mix_duration), ''), payload::json->>'duration'),
        phase = COALESCE(NULLIF(TRIM(phase), ''), payload::json->>'phase'),
        funding_support = COALESCE(NULLIF(TRIM(funding_support), ''), payload::json->>'funding_support'),
        funding_organisation = COALESCE(NULLIF(TRIM(funding_organisation), ''), payload::json->>'funding_organisation'),
        funding_amount = COALESCE(NULLIF(TRIM(funding_amount), ''), payload::json->>'funding_amount'),
        grand_total = COALESCE(
          grand_total,
          CASE WHEN payload::json->>'grand_total' ~ '^[0-9]+$' THEN (payload::json->>'grand_total')::integer ELSE NULL END
        )
      WHERE payload IS NOT NULL AND LEFT(BTRIM(payload), 1) = '{'
    `);
  } catch (err) {
    console.warn('[syncEngine] mixprogram payload backfill skipped:', err.message);
  }
}

// Highly optimized bulk upsert into standard Postgres
async function upsertRecords(tableName, records, uniqueField, fieldMap) {
  if (!records || records.length === 0) return 0;
  
  const columns = [...new Set(Object.values(fieldMap))];
  const allColumns = [...columns, 'synced_at', 'added_by'];
  let upsertedCount = 0;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const valuePlaceholders = [];
    const queryValues = [];
    let paramIdx = 1;
    
    for (const rec of batch) {
      // Deduce record key mapping to unique field
      const uniqueApiKey = Object.keys(fieldMap).find(k => fieldMap[k] === uniqueField) || uniqueField;
      const uniqueVal = rec[uniqueApiKey];
      if (uniqueVal === undefined || uniqueVal === null) continue;
      
      const rowPlaceholders = [];
      for (const col of columns) {
        const apiKey = Object.keys(fieldMap).find(k => fieldMap[k] === col);
        let val = apiKey ? rec[apiKey] : null;
        val = _sanitise(val);
        queryValues.push(val);
        rowPlaceholders.push(`$${paramIdx++}`);
      }
      
      // synced_at column
      queryValues.push(new Date().toISOString());
      rowPlaceholders.push(`$${paramIdx++}`);
      
      // added_by column
      queryValues.push('api');
      rowPlaceholders.push(`$${paramIdx++}`);
      
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }
    
    if (valuePlaceholders.length === 0) continue;
    
    const updateClauses = columns
      .filter(col => col !== uniqueField)
      .map(col => `"${col}" = EXCLUDED."${col}"`);
    updateClauses.push(`"synced_at" = EXCLUDED."synced_at"`);
    updateClauses.push(`"added_by" = EXCLUDED."added_by"`);
    
    const query = `
      INSERT INTO "${tableName}" (${allColumns.map(c => `"${c}"`).join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT ("${uniqueField}") DO UPDATE SET
      ${updateClauses.join(', ')}
    `;
    
    await pool.query(query, queryValues);
    upsertedCount += batch.length;
  }
  
  return upsertedCount;
}

// Ingestion Plans List for Education, Health, and Livelihood
export const SYNC_PLANS = {
  education: [
    {
      table: 'education_program',
      payload: { module_type: 'education', project: 'education_program', table_name: 'education_program' },
      endpoint: 'education.php',
      uniqueField: 'program_id',
      fieldMap: {
        id: 'program_id', program_name: 'program_name',
        state_id: 'state_id', district_id: 'district_id',
        no_of_school: 'school_count', no_of_students_participating: 'student_count',
        activity_count: 'activity_count', total_interventions: 'total_interventions',
        academic_year: 'academic_year', status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'education_mixprogram',
      optional: true,
      payload: { program_id: MIXPROGRAM_ID, year: MIXPROGRAM_YEARS[0] },
      endpoint: 'mixprogram.php',
      uniqueField: 'id',
      chainFromProgramCatalog: true,
      yearPayloads: MIXPROGRAM_YEARS.map((year) => ({ year })),
      fieldMap: {
        id: 'id', program_id: 'program_id', sno: 'sno', location: 'location',
        block: 'block', school_name: 'school_name', year: 'year',
        students_male: 'students_male', students_female: 'students_female',
        students_total: 'students_total', teachers_reached: 'teachers_reached',
        theme_touched: 'theme_touched', class: 'class', status: 'status',
        created_at: 'created_at', updated_at: 'updated_at',
        number_of_farmers: 'number_of_farmers', activity_name: 'activity_name',
        month: 'month', fellows: 'fellows', values_taught: 'values_taught',
        sessions_per_value: 'sessions_per_value', total_sessions: 'total_sessions',
        age_group: 'age_group', number_of_schools: 'number_of_schools',
        number_of_teachers: 'number_of_teachers', category_gen: 'category_gen',
        category_sc_st: 'category_sc_st', category_obc: 'category_obc',
        category_ebc: 'category_ebc', category_minorities: 'category_minorities',
        gender: 'person_gender', payload: 'payload',
        district: 'district', trade: 'trade', course_name: 'course_name',
        date: 'event_date', age: 'person_age', category: 'person_category',
        placement_status: 'placement_status', pre_income: 'pre_income',
        post_income: 'post_income', pre_income_individual: 'pre_income_individual',
        post_income_individual: 'post_income_individual',
        mentorship_training_sessions: 'mentorship_training_sessions',
        training_type: 'training_type', duration: 'mix_duration', phase: 'phase',
        funding_support: 'funding_support', funding_organisation: 'funding_organisation',
        funding_amount: 'funding_amount', grand_total: 'grand_total'
      }
    },
    {
      table: 'education_assessment',
      optional: true,
      skipPhp: true,
      uniqueField: 'assessment_id',
      fieldMap: {
        id: 'assessment_id', program_id: 'program_id',
        school_id: 'school_id', student_id: 'student_id',
        value_name: 'value_name', pre_score: 'pre_score',
        post_score: 'post_score', assessment_date: 'assessment_date',
        academic_year: 'academic_year', created_at: 'created_at'
      }
    },
    {
      table: 'education_muskaan_assessment',
      optional: true,
      skipPhp: true,
      uniqueField: 'assessment_id',
      fieldMap: {
        id: 'assessment_id', school_id: 'school_id',
        student_id: 'student_id', skill_area: 'skill_area',
        pre_level: 'pre_level', post_level: 'post_level',
        assessment_date: 'assessment_date', academic_year: 'academic_year',
        created_at: 'created_at'
      }
    }
  ],
  health: [
    {
      table: 'health_state',
      payload: { module_type: 'health', table_name: 'state' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: { id: 'source_id', name: 'name', del_action: 'del_action' }
    },
    {
      table: 'health_district',
      payload: { module_type: 'health', table_name: 'district' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: { id: 'source_id', name: 'name', state_id: 'state_id', del_action: 'del_action' }
    },
    {
      table: 'health_block',
      payload: { module_type: 'health', table_name: 'block' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: { id: 'source_id', name: 'name', district_id: 'district_id', del_action: 'del_action' }
    },
    {
      table: 'health_village',
      payload: { module_type: 'health', table_name: 'village' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: { id: 'source_id', name: 'name', block_id: 'block_id', del_action: 'del_action' }
    },
    {
      table: 'health_disease',
      payload: { module_type: 'health', table_name: 'disease' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: { id: 'source_id', disease_name: 'disease_name', del_action: 'del_action' }
    },
    {
      table: 'health_partner',
      payload: { module_type: 'health', table_name: 'partner' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: { partner_id: 'source_id', partner_name: 'name', active_status: 'del_action' }
    },
    {
      table: 'health_profile_patients',
      payload: { module_type: 'health', table_name: 'profile_patients' },
      endpoint: 'health.php',
      uniqueField: 'patient_id',
      useDateRange: true,
      dateColumn: 'created_at',
      chunkSizeDays: 7,
      fieldMap: {
        patient_id: 'patient_id', user_id: 'user_id', full_name: 'full_name',
        gender: 'gender', age: 'age', age_month: 'age_month', dob: 'dob',
        aadhar_no: 'aadhar_no', contact_no: 'contact_no',
        partner_id: 'partner_id', state_id: 'state_id',
        district_id: 'district_id', block_id: 'block_id', village_id: 'village_id',
        address: 'address', pin_code: 'pin_code', height: 'height',
        weight: 'weight', blood_group_id: 'blood_group_id', caste_id: 'caste_id',
        disability: 'disability', female_is_pregnant: 'female_is_pregnant',
        self_added: 'self_added', created_at: 'created_at',
        updated_at: 'updated_at', del_action: 'del_action',
        unique_code: 'unique_code', sync_status: 'sync_status'
      }
    },
    {
      table: 'health_patient_appointments',
      payload: { module_type: 'health', table_name: 'patient_appointments_new' },
      endpoint: 'health.php',
      uniqueField: 'appointment_id',
      useDateRange: true,
      dateColumn: 'created_at',
      chunkSizeDays: 3,
      fieldMap: {
        appointment_id: 'appointment_id', profile_patient_id: 'profile_patient_id',
        symtom: 'symtom', bp_lower: 'bp_lower', bp_upper: 'bp_upper',
        sugar: 'sugar', temperature: 'temperature',
        blood_oxygen_level: 'blood_oxygen_level', pulse: 'pulse',
        hemoglobin: 'hemoglobin', disease: 'disease',
        fees_free_or_paid: 'fees_free_or_paid', paid_amount: 'paid_amount',
        assigned_doctor_id: 'assigned_doctor_id', doctor_remarks: 'doctor_remarks',
        patient_remark: 'patient_remark', is_doctro_done: 'is_doctor_done',
        is_doctor_done_date: 'is_doctor_done_date', prescription: 'prescription',
        pharmacist_prescription: 'pharmacist_prescription',
        is_pharmacist_done: 'is_pharmacist_done',
        pharmacist_done_date: 'pharmacist_done_date',
        medicine_given: 'medicine_given', state_id: 'state_id',
        district_id: 'district_id', partner_id: 'partner_id',
        created_at: 'created_at', sync_status: 'sync_status'
      }
    },
    {
      table: 'health_profile_doctors',
      payload: { module_type: 'health', table_name: 'profile_doctors' },
      endpoint: 'health.php',
      uniqueField: 'source_id',
      useDateRange: true,
      dateColumn: 'synced_at',
      chunkSizeDays: 365,
      fieldMap: {
        id: 'source_id', full_name: 'doctor_name', degree: 'specialization',
        state_id: 'state_id', district_id: 'district_id',
        partner_id: 'partner_id', del_action: 'del_action'
      }
    },
    {
      table: 'health_beneficiary_year',
      endpoint: 'health_beneficiary.php',
      uniqueField: 'year',
      yearPayloads: HEALTH_BENEFICIARY_YEARS.map((year) => ({ module_type: 'health', year })),
      fieldMap: {
        year: 'year',
        total_beneficiary: 'total_beneficiary',
        total_village: 'total_village',
        total_state: 'total_state',
        total_adolescent_10_19: 'total_adolescent_10_19'
      }
    },
    {
      table: 'health_disease_summary',
      endpoint: 'health_desease.php',
      uniqueField: 'id',
      yearPayloads: HEALTH_SUMMARY_YEARS.map((year) => ({ module_type: 'health', year })),
      fieldMap: {
        id: 'id', year: 'year', disease_id: 'disease_id',
        disease_name: 'disease_name', total_patients: 'total_patients'
      }
    },
    {
      table: 'health_disease_patients',
      optional: true,
      endpoint: 'health_desease.php',
      uniqueField: 'id',
      chainFromDiseaseSummary: true,
      fieldMap: {
        id: 'id', year: 'year', disease_id: 'disease_id',
        patient_id: 'patient_id', patient_name: 'patient_name',
        full_name: 'full_name', payload: 'payload'
      }
    },
    {
      table: 'health_symptom_summary',
      optional: true,
      endpoint: 'health_symtoms.php',
      uniqueField: 'id',
      yearPayloads: HEALTH_SUMMARY_YEARS.map((year) => ({ module_type: 'health', year })),
      fieldMap: {
        id: 'id', year: 'year', symptom_id: 'symptom_id',
        symptom_name: 'symptom_name', total_patients: 'total_patients'
      }
    }
  ],
  livelihood: [
    {
      table: 'skilltracking_program',
      optional: true,
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'program' },
      endpoint: 'skilltracking.php',
      uniqueField: 'program_id',
      fieldMap: {
        program_id: 'program_id',
        program_name: 'program_name',
        code: 'code',
        status: 'status'
      }
    },
    {
      table: 'skilltracking_state',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'state' },
      endpoint: 'skilltracking.php',
      uniqueField: 'state_id',
      fieldMap: {
        state_id: 'state_id', state_name: 'state_name',
        status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_district',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'district' },
      endpoint: 'skilltracking.php',
      uniqueField: 'district_id',
      fieldMap: {
        district_id: 'district_id', district_name: 'district_name',
        state_id: 'state_id', status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_block',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'block' },
      endpoint: 'skilltracking.php',
      uniqueField: 'block_id',
      fieldMap: {
        block_id: 'block_id', block_name: 'block_name',
        district_id: 'district_id', state_id: 'state_id',
        status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_village',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'village' },
      endpoint: 'skilltracking.php',
      uniqueField: 'village_id',
      fieldMap: {
        village_id: 'village_id', village_name: 'village_name',
        block_id: 'block_id', district_id: 'district_id',
        state_id: 'state_id', status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_training_stream',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'training_stream' },
      endpoint: 'skilltracking.php',
      uniqueField: 'stream_id',
      fieldMap: {
        training_id: 'stream_id', training_name: 'stream_name',
        status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_skill_center',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'skill_center' },
      endpoint: 'skilltracking.php',
      uniqueField: 'center_id',
      fieldMap: {
        center_id: 'center_id', skill_center_name: 'center_name',
        state_id: 'state_id', district_id: 'district_id', status: 'status',
        created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_qualification',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'qualification' },
      endpoint: 'skilltracking.php',
      uniqueField: 'qualification_id',
      fieldMap: {
        qualification_id: 'qualification_id',
        education_qualification: 'qualification_name',
        status: 'status',
        created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_batch_list',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'batch_list' },
      endpoint: 'skilltracking.php',
      uniqueField: 'batch_id',
      fieldMap: {
        batch_id: 'batch_id', batch_name: 'batch_name',
        state_id: 'state_id', district_id: 'district_id',
        course_id: 'course_id', batch_strength: 'batch_strength',
        batch_start_date: 'batch_start_date', batch_end_date: 'batch_end_date',
        center_id: 'center_id', training_id: 'training_id',
        user_id: 'user_id', latitude: 'latitude', longititude: 'longitude',
        created_at: 'created_at', updated_at: 'updated_at', status: 'status'
      }
    },
    {
      table: 'skilltracking_persons',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'persons' },
      endpoint: 'skilltracking.php',
      uniqueField: 'person_id',
      fieldMap: {
        person_id: 'person_id', batch_id: 'batch_id',
        person_name: 'person_name', email: 'email', dob: 'dob',
        gender: 'gender', mobile_number: 'mobile_number', address: 'address',
        qualification_id: 'qualification_id',
        training_stream_id: 'training_stream_id',
        center_id: 'center_id',
        date_of_completion_of_training: 'date_of_completion_of_training',
        district_id: 'district_id', state_id: 'state_id',
        status: 'status', created_at: 'created_at', user_id: 'user_id',
        latitude: 'latitude', longititude: 'longitude'
      }
    },
    {
      table: 'skilltracking_monitor',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'monitor' },
      endpoint: 'skilltracking.php',
      uniqueField: 'monitoring_id',
      fieldMap: {
        monitoring_id: 'monitoring_id', person_id: 'person_id',
        date_of_monitor: 'date_of_monitor', work_status: 'work_status',
        current_work: 'current_work', employement_type: 'employment_type',
        monthly_income: 'monthly_income', remark: 'remark',
        district_id: 'district_id', state_id: 'state_id',
        status: 'status', created_at: 'created_at', user_id: 'user_id'
      }
    },
    {
      table: 'enterprise_support',
      payload: { module_type: 'livelyhood', project: 'enterprise_support', table_name: 'enterprise_support' },
      endpoint: 'enterprise_support.php',
      uniqueField: 'member_id',
      fieldMap: {
        member_id: 'member_id', member_name: 'member_name',
        member_type: 'member_type', member_mode: 'member_mode',
        phone_number: 'phone_number', state_id: 'state_id',
        district_id: 'district_id', block_id: 'block_id',
        village_id: 'village_id', user_id: 'user_id',
        supported_by: 'supported_by', status: 'status',
        created_at: 'created_at'
      }
    },
    {
      table: 'enterprise_support_monitoring',
      payload: { module_type: 'livelyhood', project: 'enterprise_support', table_name: 'enterprise_support_monitoring' },
      endpoint: 'enterprise_support.php',
      uniqueField: 'monitoring_id',
      fieldMap: {
        monitoring_id: 'monitoring_id', member_id: 'member_id',
        user_id: 'user_id', financial_year: 'financial_year',
        profit: 'profit', status: 'status', created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_pre_post_master',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'pre_post_master' },
      endpoint: 'skilltracking.php',
      uniqueField: 'pre_post_id',
      fieldMap: {
        id: 'pre_post_id', state_id: 'state_id', district_id: 'district_id',
        user_id: 'user_id', financial_year: 'financial_year', livelihood: 'livelihood',
        trade_name: 'trade_name', candidates_trained: 'candidates_trained',
        age_group: 'age_group', category: 'category', male_count: 'male_count',
        female_count: 'female_count', placement_status: 'placement_status',
        assessment_type: 'assessment_type', created_at: 'created_at'
      }
    },
    {
      table: 'enterprise_market_access',
      payload: { module_type: 'livelyhood', project: 'market_access', table_name: 'market_access' },
      endpoint: 'market_access.php',
      uniqueField: 'access_id',
      fieldMap: {
        id: 'access_id', agency_name: 'agency_name',
        sales_generated_average: 'sales_generated_average',
        market_access_type: 'market_access_type', state_id: 'state_id',
        district_id: 'district_id', user_id: 'user_id',
        financial_year: 'financial_year', status: 'status',
        created_at: 'created_at'
      }
    },
    {
      table: 'skilltracking_kkp_pre_and_post',
      payload: { module_type: 'livelyhood', project: 'skilltracting', table_name: 'kkp_pre_and_post' },
      endpoint: 'skilltracking.php',
      uniqueField: 'id',
      fieldMap: {
        id: 'id',
        financial_year: 'financial_year',
        location_name: 'location_name',
        value_name: 'value_name',
        pre_kkp: 'pre_kkp',
        post_kkp: 'post_kkp',
        created_at: 'created_at',
        updated_at: 'updated_at'
      }
    }
  ]
};

// Filter out records that violate foreign key constraints in PostgreSQL
async function filterValidForeignKeys(tableName, records, fieldMap) {
  if (!records || records.length === 0) return [];

  const query = `
    SELECT
        kcu.column_name, 
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name = $1 
      AND tc.table_schema = 'public'
  `;
  
  const res = await pool.query(query, [tableName]);
  const constraints = res.rows;
  if (constraints.length === 0) return records;

  // Clone records so we do not mutate the input array
  const processedRecords = records.map(rec => ({ ...rec }));
  
  for (const constr of constraints) {
    const colName = constr.column_name;
    const foreignTable = constr.foreign_table;
    const foreignCol = constr.foreign_column;

    const apiKey = Object.keys(fieldMap).find(k => fieldMap[k] === colName);
    if (!apiKey) continue;

    const foreignRes = await pool.query(`SELECT "${foreignCol}" FROM "${foreignTable}"`);
    const validIds = new Set(foreignRes.rows.map(r => String(r[foreignCol])));

    let nullifiedCount = 0;
    for (const rec of processedRecords) {
      const val = rec[apiKey];
      if (val === null || val === undefined || String(val).trim() === '') {
        continue;
      }
      if (!validIds.has(String(val))) {
        rec[apiKey] = null;
        nullifiedCount++;
      }
    }
    
    if (nullifiedCount > 0) {
      console.log(`Table ${tableName}: Mapped ${nullifiedCount} invalid foreign key references to NULL on field ${colName} (referenced table ${foreignTable}(${foreignCol}))`);
    }
  }

  return processedRecords;
}

function decorateRecords(plan, records, yearHint) {
  if (!records || records.length === 0) return records;
  if (plan.table === 'education_program') {
    records.forEach((rec) => {
      if (typeof rec.program_name === 'string') {
        rec.program_name = rec.program_name.trim();
      }
      if (rec.created_at) {
        const date = new Date(rec.created_at);
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          rec.academic_year = month >= 4
            ? `${year}-${(year + 1).toString().slice(-2)}`
            : `${year - 1}-${year.toString().slice(-2)}`;
        }
      }
    });
  }
  if (plan.table === 'health_beneficiary_year') {
    records.forEach((rec) => {
      if (yearHint && rec.year == null) rec.year = yearHint;
    });
  }
  if (plan.table === 'health_disease_summary') {
    records.forEach((rec) => {
      const year = yearHint || rec.year;
      rec.year = year;
      rec.id = `${year}_${rec.disease_id}`;
    });
  }
  if (plan.table === 'health_symptom_summary') {
    records.forEach((rec) => {
      const year = yearHint || rec.year;
      rec.year = year;
      rec.id = rec.id || `${year}_${rec.symptom_id || rec.symtom_id || rec.id}`;
    });
  }
  if (plan.table === 'health_disease_patients') {
    records.forEach((rec, idx) => {
      if (yearHint && rec.year == null) rec.year = yearHint;
      const pid = rec.patient_id || rec.profile_patient_id || rec.id;
      const pname = rec.patient_name || rec.full_name || rec.name;
      rec.patient_id = pid;
      rec.patient_name = pname;
      rec.full_name = rec.full_name || pname;
      rec.id = rec.id || `${rec.year || yearHint}_${rec.disease_id}_${pid || idx}`;
      try {
        rec.payload = JSON.stringify(rec).substring(0, 2000);
      } catch (e) {
        rec.payload = null;
      }
    });
  }
  if (plan.table === 'skilltracking_program') {
    records.forEach((rec) => {
      if (rec.program && typeof rec.program === 'object') {
        rec.program_id = rec.program_id || rec.program.id || rec.program.program_id;
        rec.program_name = rec.program_name || rec.program.name || rec.program.program_name;
        rec.code = rec.code || rec.program.code || rec.program.program_code;
      }
      rec.program_id = rec.program_id || rec.id || rec.ProgramId;
      rec.program_name = rec.program_name || rec.name;
      rec.code = rec.code || rec.program_code;
    });
  }
  if (plan.table === 'education_mixprogram') {
    records.forEach((rec) => {
      if (yearHint && rec.year == null) rec.year = yearHint;
      const pid = String(rec.program_id || MIXPROGRAM_ID);
      rec.program_id = pid;
      const rawId = rec.id;
      if (rawId == null || String(rawId).trim() === '') {
        rec.id = [pid, rec.year || yearHint, rec.sno, rec.school_name].filter(Boolean).join('_');
      } else if (!String(rawId).startsWith(`${pid}_`)) {
        rec.id = `${pid}_${rawId}`;
      }
      const pii = new Set(['name', 'phone_number', 'phone', 'address', 'dob', 'candidate_name']);
      try {
        const slim = {};
        for (const [key, val] of Object.entries(rec)) {
          if (!pii.has(key) && key !== 'payload') slim[key] = val;
        }
      rec.payload = JSON.stringify(slim).substring(0, 8000);
      } catch {
        rec.payload = null;
      }
    });
  }
  if (plan.table === 'health_patient_appointments') {
    records.forEach((rec) => {
      const mapping = [
        { field: 'symtom', key: 'symptom_name' },
        { field: 'disease', key: 'disease_name' },
        { field: 'prescription', key: 'medicine_name' }
      ];
      for (const item of mapping) {
        const rawVal = rec[item.field];
        if (rawVal && typeof rawVal === 'string' && rawVal.startsWith('[')) {
          try {
            const parsed = JSON.parse(rawVal);
            if (Array.isArray(parsed)) {
              const names = parsed
                .map((subItem) => (subItem && typeof subItem === 'object' ? subItem[item.key] : null))
                .filter(Boolean);
              if (names.length > 0) rec[item.field] = names.join(', ');
            }
          } catch (e) {
            // keep raw
          }
        }
      }
    });
  }
  return records;
}

async function ingestRecords(plan, records, timeout, maxRetries) {
  let decorated = decorateRecords(plan, records);
  const filtered = await filterValidForeignKeys(plan.table, decorated, plan.fieldMap);
  return upsertRecords(plan.table, filtered, plan.uniqueField, plan.fieldMap);
}

function catalogProgramId(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.program && typeof row.program === 'object') {
    const nested = row.program.program_id || row.program.id;
    if (nested != null && nested !== '' && nested !== 0 && nested !== '0') return String(nested);
  }
  const val = row.program_id || row.id || row.ProgramId;
  if (val == null || val === '' || val === 0 || val === '0') return null;
  return String(val);
}

async function loadProgramCatalog(timeout, maxRetries) {
  try {
    const local = await pool.query(
      `SELECT program_id, program_name, code, status
       FROM skilltracking_program
       WHERE program_id IS NOT NULL AND program_id <> ''`
    );
    if (local.rows.length) {
      console.log(`[syncEngine] mixprogram catalog from Postgres skilltracking_program (${local.rows.length} rows)`);
      return { rows: local.rows, source: 'postgres' };
    }
  } catch (err) {
    console.warn('[syncEngine] local skilltracking_program unavailable:', err.message);
  }

  for (const tableName of ['program', 'programs']) {
    try {
      const rows = await fetchWithRetry(
        'skilltracking.php',
        { module_type: 'livelyhood', project: 'skilltracting', table_name: tableName },
        timeout,
        maxRetries
      );
      if (rows && rows.length) {
        console.log(`[syncEngine] mixprogram catalog from skilltracking.php table_name=${tableName} (${rows.length} rows)`);
        return { rows, source: `skilltracking.php:${tableName}` };
      }
    } catch (err) {
      console.warn(`[syncEngine] skilltracking table_name=${tableName} skipped:`, err.message);
    }
  }
  return { rows: [], source: 'empty' };
}

// Main execution function
export async function syncModule(moduleName, forceFull = false) {
  const plans = SYNC_PLANS[moduleName];
  if (!plans) {
    throw new Error(`Unknown sync module: ${moduleName}`);
  }

  await ensureEnvelopeTables();

  const timeout = Number(process.env.API_TIMEOUT) || 45;
  const maxRetries = Number(process.env.API_RETRY_COUNT) || 2;
  
  const summary = [];
  let geoFailed = false;
  
  for (const plan of plans) {
    const startedAt = new Date().toISOString();
    const isGeographicTable = plan.table.includes('state') || plan.table.includes('district') || plan.table.includes('block') || plan.table.includes('village');

    if (isGeographicTable && geoFailed) {
      console.warn(`[syncEngine] Skipping sync for geographic table ${plan.table} because a parent geography table failed in this run.`);
      await writeSyncLog(moduleName, plan.table, 0, 0, 'error', 'Skipped due to parent geography sync failure', startedAt);
      summary.push({ table: plan.table, fetched: 0, upserted: 0, status: 'error', error: 'Skipped due to parent geography sync failure' });
      continue;
    }

    if (plan.skipPhp) {
      const skipMsg = 'No PHP table; manual Postgres entry only (API rejects this table_name).';
      console.log(`[syncEngine] Skipping PHP for ${plan.table}: ${skipMsg}`);
      await writeSyncLog(moduleName, plan.table, 0, 0, 'skipped', skipMsg, startedAt);
      summary.push({ table: plan.table, fetched: 0, upserted: 0, status: 'skipped', error: skipMsg });
      continue;
    }

    try {
      let totalFetched = 0;
      let totalUpserted = 0;

      if (plan.useDateRange && plan.dateColumn) {
        let fromDate = HEALTH_SYNC_START;
        if (!forceFull) {
          const progressTo = await loadSyncProgress(plan.table);
          if (progressTo && progressTo > fromDate) {
            fromDate = addDaysIso(progressTo, 1);
          } else {
            try {
              const maxDateRes = await pool.query(`SELECT MAX("${plan.dateColumn}") AS max_date FROM "${plan.table}"`);
              const maxDate = maxDateRes.rows[0]?.max_date;
              if (maxDate) {
                const d = new Date(maxDate);
                if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1971) {
                  d.setDate(d.getDate() - 1);
                  const fromMax = d.toISOString().split('T')[0];
                  if (fromMax > fromDate) fromDate = fromMax;
                }
              }
            } catch (dbErr) {
              console.warn(`[syncEngine] Failed to query max date for table ${plan.table}, falling back to ${HEALTH_SYNC_START}:`, dbErr.message || dbErr);
            }
          }
        }
        const toDate = new Date().toISOString().split('T')[0];
        const chunkSize = plan.chunkSizeDays || 10;
        const chunks = fromDate <= toDate ? buildDateChunks(fromDate, toDate, chunkSize) : [];

        console.log(`[syncEngine] Table ${plan.table} fetching ${chunks.length} window(s) ${fromDate}..${toDate}, upsert after each`);

        let chunkErrors = 0;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          try {
            const result = await ingestDatedWindow(plan, chunk.from, chunk.to, timeout, maxRetries);
            totalFetched += result.fetched;
            totalUpserted += result.upserted;
            await saveSyncProgress(plan.table, chunk.to);
            if ((i + 1) % 20 === 0 || i === chunks.length - 1) {
              console.log(`[syncEngine] ${plan.table} ${i + 1}/${chunks.length} through ${chunk.to} fetched=${totalFetched} upserted=${totalUpserted}`);
            }
          } catch (chunkErr) {
            chunkErrors += 1;
            console.warn(`[syncEngine] ${plan.table} window ${chunk.from}..${chunk.to} failed: ${chunkErr.message || chunkErr}`);
          }
        }
        if (chunkErrors) {
          throw new Error(`${chunkErrors} date window(s) failed; later runs resume from sync_progress`);
        }
      } else if (plan.chainFromDiseaseSummary) {
        const maxIds = Number(process.env.DISEASE_PATIENT_MAX_IDS) || 12;
        const pageSize = 20;
        const maxPages = Math.max(1, Number(process.env.DISEASE_PATIENT_MAX_PAGES) || 3);
        for (const year of HEALTH_SUMMARY_YEARS) {
          const summary = await fetchWithRetry('health_desease.php', { module_type: 'health', year }, timeout, maxRetries);
          const ids = [...new Set(summary.map((r) => r.disease_id || r.id).filter(Boolean))].slice(0, maxIds);
          for (const diseaseId of ids) {
            for (let page = 0; page < maxPages; page++) {
              let records = await fetchWithRetry(plan.endpoint, {
                module_type: 'health',
                year,
                disease_id: String(diseaseId),
                Limit: String(pageSize),
                offset: String(page * pageSize)
              }, timeout, maxRetries);
              records = decorateRecords(plan, records, year);
              records.forEach((rec) => { rec.disease_id = rec.disease_id || String(diseaseId); });
              totalFetched += records.length;
              if (records.length > 0) {
                totalUpserted += await ingestRecords(plan, records);
              }
              if (!records.length || records.length < pageSize) break;
            }
          }
        }
      } else if (plan.chainFromProgramCatalog) {
        const { rows: catalogRows, source: catalogSource } = await loadProgramCatalog(timeout, maxRetries);
        if (catalogRows.length && catalogSource !== 'postgres') {
          const catalogPlan = SYNC_PLANS.livelihood.find((p) => p.table === 'skilltracking_program');
          if (catalogPlan) {
            await ingestRecords(catalogPlan, catalogRows);
          }
        }
        const ids = [...new Set(catalogRows.map(catalogProgramId).filter(Boolean))];
        const programIds = ids.length ? ids : [MIXPROGRAM_ID];
        if (!ids.length) {
          console.warn(`[syncEngine] skilltracking program catalog empty; mixprogram falling back to EDU_PROGRAM_ID=${MIXPROGRAM_ID}`);
        } else {
          console.log(`[syncEngine] mixprogram using ${programIds.length} program_id(s) from ${catalogSource}`);
        }
        const years = (plan.yearPayloads || []).map((p) => p.year).filter(Boolean);
        const mixYears = years.length ? years : MIXPROGRAM_YEARS;
        let mixCalls = 0;
        for (const programId of programIds) {
          for (const year of mixYears) {
            if (mixCalls > 0) await new Promise((resolve) => setTimeout(resolve, MIXPROGRAM_CALL_GAP_MS));
            mixCalls += 1;
            let records = await fetchWithRetry(plan.endpoint, { program_id: programId, year }, timeout, maxRetries);
            records = decorateRecords(plan, records, year);
            records.forEach((rec) => { rec.program_id = rec.program_id || programId; });
            totalFetched += records.length;
            if (records.length > 0) {
              totalUpserted += await ingestRecords(plan, records);
            }
          }
        }
      } else if (plan.yearPayloads) {
        for (const payload of plan.yearPayloads) {
          let records = await fetchWithRetry(plan.endpoint, payload, timeout, maxRetries);
          records = decorateRecords(plan, records, payload.year);
          totalFetched += records.length;
          if (records.length > 0) {
            const filtered = await filterValidForeignKeys(plan.table, records, plan.fieldMap);
            totalUpserted += await upsertRecords(plan.table, filtered, plan.uniqueField, plan.fieldMap);
          }
        }
      } else {
        let records = await fetchWithRetry(plan.endpoint, plan.payload, timeout, maxRetries);
        totalFetched = records.length;
        if (records && records.length > 0) {
          totalUpserted = await ingestRecords(plan, records);
        }
      }

      await writeSyncLog(moduleName, plan.table, totalFetched, totalUpserted, 'success', null, startedAt);
      summary.push({ table: plan.table, fetched: totalFetched, upserted: totalUpserted, status: 'success' });
    } catch (err) {
      const message = err.message || String(err);
      if (plan.optional) {
        console.warn(`[syncEngine] Optional table ${plan.table} skipped: ${message}`);
        await writeSyncLog(moduleName, plan.table, 0, 0, 'skipped', message, startedAt);
        summary.push({ table: plan.table, fetched: 0, upserted: 0, status: 'skipped', error: message });
        continue;
      }
      if (isGeographicTable) {
        geoFailed = true;
      }
      await writeSyncLog(moduleName, plan.table, 0, 0, 'error', message, startedAt);
      summary.push({ table: plan.table, fetched: 0, upserted: 0, status: 'error', error: message });
    }
  }
  return summary;
}

let globalSyncInProgress = false;

export async function syncAll(forceFull = false) {
  if (globalSyncInProgress) {
    console.warn('[syncEngine] Sync already in progress, skipping concurrent run.');
    return { error: 'Sync already in progress' };
  }
  globalSyncInProgress = true;
  try {
    const livelihoodResult = await syncModule('livelihood', forceFull);
    const educationResult = await syncModule('education', forceFull);
    const healthResult = await syncModule('health', forceFull);
    return {
      education: educationResult,
      health: healthResult,
      livelihood: livelihoodResult
    };
  } finally {
    globalSyncInProgress = false;
  }
}
