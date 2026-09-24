/**
 * Schema + local API smoke check.
 * Usage: node --env-file=.env scripts/check-system.cjs
 */
const { Client } = require('pg');
const { clientConfig } = require('../src/lib/pgSsl.cjs');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const base = process.env.CHECK_BASE_URL || 'http://127.0.0.1:3000';
const identifier = process.env.DEV_LOGIN_USER || process.env.ADMIN_USER || 'admin';
const password = process.env.DEV_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin';

const TABLES = [
  'users',
  'roles',
  'education_mixprogram',
  'skilltracking_program',
  'skilltracking_kkp_pre_and_post',
  'health_beneficiary_year',
  'health_disease_summary',
  'skilltracking_persons',
  'skilltracking_monitor'
];

async function main() {
  const client = new Client(clientConfig(url));
  await client.connect();
  const counts = {};
  for (const table of TABLES) {
    try {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      counts[table] = r.rows[0].n;
    } catch (err) {
      counts[table] = `MISSING (${err.message})`;
    }
  }
  const mixCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'education_mixprogram'
    ORDER BY ordinal_position
  `);
  const needed = ['activity_name', 'month', 'pre_income', 'post_income', 'course_name', 'placement_status'];
  const have = new Set(mixCols.rows.map((r) => r.column_name));
  const missingCols = needed.filter((c) => !have.has(c));
  let leftoverTwins = null;
  try {
    const twins = await client.query(`
      SELECT COUNT(*)::int AS leftover_twins
      FROM education_mixprogram a
      JOIN education_mixprogram b ON b.id = a.program_id || '_' || a.id
      WHERE a.id NOT LIKE a.program_id || '_%'
    `);
    leftoverTwins = twins.rows[0].leftover_twins;
  } catch (err) {
    leftoverTwins = err.message;
  }
  await client.end();

  console.log('[check] table counts');
  console.log(JSON.stringify(counts, null, 2));
  if (missingCols.length) {
    console.log('[check] education_mixprogram missing columns:', missingCols.join(', '));
  } else {
    console.log('[check] education_mixprogram extra columns present');
  }
  console.log('[check] leftover unprefixed mix twins (ignored by charts):', leftoverTwins);

  let cookie = '';
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    const setCookie = typeof login.headers.getSetCookie === 'function'
      ? login.headers.getSetCookie()
      : [login.headers.get('set-cookie')].filter(Boolean);
    const session = setCookie.find((c) => String(c).startsWith('session='));
    cookie = session ? String(session).split(';')[0] : '';
    const body = await login.json().catch(() => ({}));
    console.log(`[check] login ${login.status}`, body.error || body.message || '');
  } catch (err) {
    console.log(`[check] login skipped (${err.message}). Is npm run dev running?`);
    return;
  }

  const paths = [
    '/api/status',
    '/api/summary',
    '/api/health/reach',
    '/api/health/depth',
    '/api/education/mixprogram',
    '/api/education/muskaan_performance',
    '/api/livelihood/mixprogram/skilling',
    '/api/livelihood/mixprogram/farmers'
  ];
  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
      const text = await res.text();
      let hint = '';
      try {
        const json = JSON.parse(text);
        hint = json.error || json.status || json.message || '';
      } catch (e) {
        hint = text.slice(0, 80);
      }
      console.log(`[check] ${res.status} ${path} ${hint}`);
    } catch (err) {
      console.log(`[check] FAIL ${path} ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('[check] failed:', err.message);
  process.exit(1);
});
