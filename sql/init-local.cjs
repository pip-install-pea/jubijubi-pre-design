/**
 * Create local schema + seed admin on DATABASE_URL.
 * Usage: node --env-file=.env sql/init-local.cjs
 */
const { Client } = require('pg');
const crypto = require('crypto');
const { clientConfig } = require('../src/lib/pgSsl.cjs');

function generatePasswordHash(password) {
  const salt = crypto.randomBytes(12)
    .toString('base64')
    .replace(/\+/g, '.')
    .replace(/\//g, '.')
    .substring(0, 16);
  const iterations = 1000000;
  const keylen = 32;
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256');
  return `pbkdf2:sha256:${iterations}$${salt}$${derivedKey.toString('hex')}`;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new Client(clientConfig(url));

const AUTH_SQL = [
  `CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      thematic VARCHAR(100)
    )`,
  `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  `CREATE TABLE IF NOT EXISTS sync_log (
      id SERIAL PRIMARY KEY,
      module VARCHAR(50) NOT NULL,
      table_name VARCHAR(100) NOT NULL,
      records_fetched INTEGER DEFAULT 0,
      records_upserted INTEGER DEFAULT 0,
      status VARCHAR(20) NOT NULL,
      error_message VARCHAR(500),
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_users_login ON users (email, username)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_lookup ON sync_log (module, table_name, started_at DESC)`
];

const ENVELOPE_SQL = [
  `CREATE TABLE IF NOT EXISTS health_beneficiary_year (
      year TEXT PRIMARY KEY,
      total_beneficiary INTEGER,
      total_village INTEGER,
      total_state INTEGER,
      total_adolescent_10_19 INTEGER,
      synced_at TEXT,
      added_by TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS health_disease_summary (
      id TEXT PRIMARY KEY,
      year TEXT,
      disease_id TEXT,
      disease_name TEXT,
      total_patients INTEGER,
      synced_at TEXT,
      added_by TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS health_symptom_summary (
      id TEXT PRIMARY KEY,
      year TEXT,
      symptom_id TEXT,
      symptom_name TEXT,
      total_patients INTEGER,
      synced_at TEXT,
      added_by TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS health_disease_patients (
      id TEXT PRIMARY KEY,
      year TEXT,
      disease_id TEXT,
      patient_id TEXT,
      patient_name TEXT,
      full_name TEXT,
      payload TEXT,
      synced_at TEXT,
      added_by TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS education_mixprogram (
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
    )`,
  `CREATE TABLE IF NOT EXISTS skilltracking_program (
      program_id TEXT PRIMARY KEY,
      program_name TEXT,
      code TEXT,
      status TEXT,
      synced_at TEXT,
      added_by TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS skilltracking_kkp_pre_and_post (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_health_disease_summary_year ON health_disease_summary (year)`,
  `CREATE INDEX IF NOT EXISTS idx_health_symptom_summary_year ON health_symptom_summary (year)`,
  `CREATE INDEX IF NOT EXISTS idx_education_mixprogram_year ON education_mixprogram (year, program_id)`
];

const TABLES = [
  ['education_program', 'program_id', ['program_id', 'program_name', 'state_id', 'district_id', 'school_count', 'student_count', 'activity_count', 'total_interventions', 'academic_year', 'status', 'created_at']],
  ['education_assessment', 'assessment_id', ['assessment_id', 'program_id', 'school_id', 'student_id', 'value_name', 'pre_score', 'post_score', 'assessment_date', 'academic_year', 'created_at']],
  ['education_muskaan_assessment', 'assessment_id', ['assessment_id', 'school_id', 'student_id', 'skill_area', 'pre_level', 'post_level', 'assessment_date', 'academic_year', 'created_at']],
  ['health_state', 'source_id', ['source_id', 'name', 'del_action']],
  ['health_district', 'source_id', ['source_id', 'name', 'state_id', 'del_action']],
  ['health_block', 'source_id', ['source_id', 'name', 'district_id', 'del_action']],
  ['health_village', 'source_id', ['source_id', 'name', 'block_id', 'del_action']],
  ['health_disease', 'source_id', ['source_id', 'disease_name', 'del_action']],
  ['health_partner', 'source_id', ['source_id', 'name', 'del_action']],
  ['health_profile_patients', 'patient_id', ['patient_id', 'user_id', 'full_name', 'gender', 'age', 'age_month', 'dob', 'aadhar_no', 'contact_no', 'partner_id', 'state_id', 'district_id', 'block_id', 'village_id', 'address', 'pin_code', 'height', 'weight', 'blood_group_id', 'caste_id', 'disability', 'female_is_pregnant', 'self_added', 'created_at', 'updated_at', 'del_action', 'unique_code', 'sync_status']],
  ['health_patient_appointments', 'appointment_id', ['appointment_id', 'profile_patient_id', 'symtom', 'bp_lower', 'bp_upper', 'sugar', 'temperature', 'blood_oxygen_level', 'pulse', 'hemoglobin', 'disease', 'fees_free_or_paid', 'paid_amount', 'assigned_doctor_id', 'doctor_remarks', 'patient_remark', 'is_doctor_done', 'is_doctor_done_date', 'prescription', 'pharmacist_prescription', 'is_pharmacist_done', 'pharmacist_done_date', 'medicine_given', 'state_id', 'district_id', 'partner_id', 'created_at', 'sync_status']],
  ['health_profile_doctors', 'source_id', ['source_id', 'doctor_name', 'specialization', 'state_id', 'district_id', 'partner_id', 'del_action']],
  ['skilltracking_state', 'state_id', ['state_id', 'state_name', 'status', 'created_at']],
  ['skilltracking_district', 'district_id', ['district_id', 'district_name', 'state_id', 'status', 'created_at']],
  ['skilltracking_block', 'block_id', ['block_id', 'block_name', 'district_id', 'state_id', 'status', 'created_at']],
  ['skilltracking_village', 'village_id', ['village_id', 'village_name', 'block_id', 'district_id', 'state_id', 'status', 'created_at']],
  ['skilltracking_training_stream', 'stream_id', ['stream_id', 'stream_name', 'status', 'created_at']],
  ['skilltracking_skill_center', 'center_id', ['center_id', 'center_name', 'state_id', 'district_id', 'status', 'created_at']],
  ['skilltracking_qualification', 'qualification_id', ['qualification_id', 'qualification_name', 'status', 'created_at']],
  ['skilltracking_batch_list', 'batch_id', ['batch_id', 'batch_name', 'state_id', 'district_id', 'course_id', 'batch_strength', 'batch_start_date', 'batch_end_date', 'center_id', 'training_id', 'user_id', 'latitude', 'longitude', 'created_at', 'updated_at', 'status']],
  ['skilltracking_persons', 'person_id', ['person_id', 'batch_id', 'person_name', 'email', 'dob', 'gender', 'mobile_number', 'address', 'qualification_id', 'training_stream_id', 'center_id', 'date_of_completion_of_training', 'district_id', 'state_id', 'status', 'created_at', 'user_id', 'latitude', 'longitude']],
  ['skilltracking_monitor', 'monitoring_id', ['monitoring_id', 'person_id', 'date_of_monitor', 'work_status', 'current_work', 'employment_type', 'monthly_income', 'remark', 'district_id', 'state_id', 'status', 'created_at', 'user_id']],
  ['enterprise_support', 'member_id', ['member_id', 'member_name', 'member_type', 'member_mode', 'phone_number', 'state_id', 'district_id', 'block_id', 'village_id', 'user_id', 'supported_by', 'status', 'created_at']],
  ['enterprise_support_monitoring', 'monitoring_id', ['monitoring_id', 'member_id', 'user_id', 'financial_year', 'profit', 'status', 'created_at']],
  ['skilltracking_pre_post_master', 'pre_post_id', ['pre_post_id', 'state_id', 'district_id', 'user_id', 'financial_year', 'livelihood', 'trade_name', 'candidates_trained', 'age_group', 'category', 'male_count', 'female_count', 'placement_status', 'assessment_type', 'created_at']],
  ['skilltracking_kkp_pre_and_post', 'id', ['id', 'financial_year', 'location_name', 'value_name', 'pre_kkp', 'post_kkp', 'created_at', 'updated_at']],
  ['enterprise_market_access', 'access_id', ['access_id', 'agency_name', 'sales_generated_average', 'market_access_type', 'state_id', 'district_id', 'user_id', 'financial_year', 'status', 'created_at']]
];

function tableSql(table, uniqueField, columns) {
  const cols = new Set(columns);
  cols.add(uniqueField);
  cols.add('synced_at');
  cols.add('added_by');
  const defs = [...cols].map((col) => (
    col === uniqueField ? `"${col}" TEXT PRIMARY KEY` : `"${col}" TEXT`
  ));
  return `CREATE TABLE IF NOT EXISTS "${table}" (${defs.join(', ')})`;
}

async function main() {
  await client.connect();
  console.log(`[init-local] connected`);

  for (const sql of AUTH_SQL) await client.query(sql);
  for (const sql of ENVELOPE_SQL) await client.query(sql);
  for (const [table, uniqueField, columns] of TABLES) {
    await client.query(tableSql(table, uniqueField, columns));
  }

  await client.query(`
    INSERT INTO roles (id, name, thematic) VALUES
      (1, 'super_admin', NULL),
      (2, 'admin', NULL),
      (3, 'health', 'health'),
      (4, 'livelihood', 'livelihood'),
      (5, 'education', 'education')
    ON CONFLICT (name) DO NOTHING
  `);
  await client.query(`SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 1))`);

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
    await client.query(`ALTER TABLE education_mixprogram ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
  }
  await client.query(`ALTER TABLE education_program ADD COLUMN IF NOT EXISTS activity_count TEXT`);
  await client.query(`ALTER TABLE education_program ADD COLUMN IF NOT EXISTS total_interventions TEXT`);
  await client.query(`
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

  const password = process.env.ADMIN_PASSWORD || process.env.DEV_LOGIN_PASSWORD || 'admin';
  const username = process.env.ADMIN_USER || process.env.DEV_LOGIN_USER || 'admin';
  const email = process.env.ADMIN_EMAIL || process.env.DEV_LOGIN_EMAIL || `${username}@local`;
  const hash = generatePasswordHash(password);
  const forceSeed = process.env.SEED_ADMIN === '1' || process.env.SEED_ADMIN === 'true';

  if (forceSeed) {
    await client.query(
      `INSERT INTO users (username, email, password_hash, role_id, is_active, created_at)
       VALUES ($1, $2, $3, 1, 1, NOW())
       ON CONFLICT (username) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role_id = 1,
         is_active = 1`,
      [username, email, hash]
    );
    console.log(`[init-local] seeded/reset user ${username} (super_admin)`);
  } else {
    const inserted = await client.query(
      `INSERT INTO users (username, email, password_hash, role_id, is_active, created_at)
       VALUES ($1, $2, $3, 1, 1, NOW())
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [username, email, hash]
    );
    if (inserted.rowCount) {
      console.log(`[init-local] created user ${username} (super_admin)`);
    } else {
      console.log(`[init-local] left existing user ${username} unchanged (SEED_ADMIN=1 to reset)`);
    }
  }

  const tables = await client.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  console.log(`[init-local] public tables: ${tables.rows[0].n}`);
  await client.end();
}

main().catch(async (err) => {
  console.error('[init-local] failed:', err.message);
  try { await client.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
