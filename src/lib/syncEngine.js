import axios from 'axios';
import pool from './db.js';

const API_BASE = 'https://jubicare.indevconsultancy.com/api/centralizeddashboardapi/';
const BATCH_SIZE = 300;
const MAX_TEXT_LEN = 1000;
const HTML_RE = /<[^>]+>/g;
const HEALTH_SYNC_START = process.env.HEALTH_SYNC_START || '2025-01-01';
const HEALTH_SUMMARY_YEARS = (process.env.HEALTH_SUMMARY_YEARS || '2024,2025,2026')
  .split(',')
  .map((y) => y.trim())
  .filter(Boolean);
const MIXPROGRAM_ID = process.env.EDU_PROGRAM_ID || '5';
const MIXPROGRAM_YEARS = (process.env.EDU_MIX_YEARS || '2024-25,2025-26')
  .split(',')
  .map((y) => y.trim())
  .filter(Boolean);

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
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise(res => setTimeout(res, waitTime));
      }
    }
  }
  throw lastError;
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

async function ensureEnvelopeTables() {
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
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT,
      added_by TEXT
    )
  `);
  try {
    await ensureColumn('education_program', 'activity_count', 'TEXT');
    await ensureColumn('education_program', 'total_interventions', 'TEXT');
  } catch (err) {
    console.warn('[syncEngine] Could not add education_program extra columns:', err.message);
  }
}

// Highly optimized bulk upsert into standard Postgres
async function upsertRecords(tableName, records, uniqueField, fieldMap) {
  if (!records || records.length === 0) return 0;
  
  const columns = Object.values(fieldMap);
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
      yearPayloads: MIXPROGRAM_YEARS.map((year) => ({ program_id: MIXPROGRAM_ID, year })),
      fieldMap: {
        id: 'id', program_id: 'program_id', sno: 'sno', location: 'location',
        block: 'block', school_name: 'school_name', year: 'year',
        students_male: 'students_male', students_female: 'students_female',
        students_total: 'students_total', teachers_reached: 'teachers_reached',
        theme_touched: 'theme_touched', class: 'class', status: 'status',
        created_at: 'created_at', updated_at: 'updated_at'
      }
    },
    {
      table: 'education_assessment',
      optional: true,
      payload: { module_type: 'education', project: 'education_program', table_name: 'education_assessment' },
      endpoint: 'education.php',
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
      payload: { module_type: 'education', project: 'education_program', table_name: 'education_muskaan_assessment' },
      endpoint: 'education.php',
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
      chunkSizeDays: 31,
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
      yearPayloads: HEALTH_SUMMARY_YEARS.map((year) => ({ module_type: 'health', year })),
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
  if (plan.table === 'education_mixprogram') {
    records.forEach((rec) => {
      if (yearHint && rec.year == null) rec.year = yearHint;
      if (!rec.id) {
        rec.id = [rec.program_id || MIXPROGRAM_ID, rec.year || yearHint, rec.sno, rec.school_name]
          .filter(Boolean)
          .join('_');
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

    try {
      let totalFetched = 0;
      let totalUpserted = 0;

      if (plan.useDateRange && plan.dateColumn) {
        let fromDate = HEALTH_SYNC_START;
        if (!forceFull) {
          try {
            const maxDateRes = await pool.query(`SELECT MAX("${plan.dateColumn}") AS max_date FROM "${plan.table}"`);
            const maxDate = maxDateRes.rows[0]?.max_date;
            if (maxDate) {
              const d = new Date(maxDate);
              if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1971) {
                d.setDate(d.getDate() - 1);
                fromDate = d.toISOString().split('T')[0];
              }
            }
          } catch (dbErr) {
            console.warn(`[syncEngine] Failed to query max date for table ${plan.table}, falling back to ${HEALTH_SYNC_START}:`, dbErr.message || dbErr);
          }
        }
        const toDate = new Date().toISOString().split('T')[0];
        const chunkSize = plan.chunkSizeDays || 10;
        const chunks = [];
        let currentFrom = new Date(fromDate);
        const targetTo = new Date(toDate);
        while (currentFrom <= targetTo) {
          let currentTo = new Date(currentFrom);
          currentTo.setDate(currentTo.getDate() + (chunkSize - 1));
          if (currentTo > targetTo) {
            currentTo = new Date(targetTo);
          }
          chunks.push({
            from: currentFrom.toISOString().split('T')[0],
            to: currentTo.toISOString().split('T')[0]
          });
          currentFrom = new Date(currentTo);
          currentFrom.setDate(currentFrom.getDate() + 1);
        }

        console.log(`[syncEngine] Table ${plan.table} is using incremental syncing with ${chunks.length} chunks from ${fromDate} to ${toDate}`);

        for (const chunk of chunks) {
          const chunkPayload = {
            ...plan.payload,
            from_date: chunk.from,
            to_date: chunk.to
          };
          let chunkRecords = await fetchWithRetry(plan.endpoint, chunkPayload, timeout, maxRetries);
          if (chunkRecords && chunkRecords.length > 0) {
            totalFetched += chunkRecords.length;
            totalUpserted += await ingestRecords(plan, chunkRecords);
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
    const educationResult = await syncModule('education', forceFull);
    const healthResult = await syncModule('health', forceFull);
    const livelihoodResult = await syncModule('livelihood', forceFull);
    return {
      education: educationResult,
      health: healthResult,
      livelihood: livelihoodResult
    };
  } finally {
    globalSyncInProgress = false;
  }
}
