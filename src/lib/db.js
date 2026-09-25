import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

let pool = null;
let loggedTarget = false;

function resolveCaPath() {
  const fromEnv = process.env.DATABASE_CA;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    fromEnv,
    path.join(process.cwd(), 'certs', 'global-bundle.pem'),
    path.join(here, '..', '..', 'certs', 'global-bundle.pem')
  ].filter(Boolean);
  for (const candidate of candidates) {
    const abs = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function activeDatabaseUrl() {
  const target = String(process.env.DB_TARGET || '').trim().toLowerCase();
  if (target === 'neon') return String(process.env.DATABASE_URL_NEON || '').trim();
  if (target === 'rds') {
    return String(process.env.DATABASE_URL_RDS || process.env.DATABASE_URL || '').trim();
  }
  return String(process.env.DATABASE_URL || '').trim();
}

function sslConfig(url = activeDatabaseUrl()) {
  const flag = String(process.env.DATABASE_SSL || '').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'disable') return false;
  const isRds = /\.rds\.amazonaws\.com/i.test(url);
  const wantsSsl = flag === 'true' || flag === '1' || flag === 'require'
    || /sslmode=(require|verify-ca|verify-full)/i.test(url)
    || isRds
    || /\.neon\.tech/i.test(url);
  if (!wantsSsl) return false;
  if (isRds) {
    const caPath = resolveCaPath();
    if (caPath) return { rejectUnauthorized: false, ca: fs.readFileSync(caPath, 'utf8') };
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

function parseDatabaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error('DATABASE_URL is not a valid postgres URL.');
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error('DATABASE_URL must start with postgresql://');
  }
  const host = parsed.hostname;
  if (!host || host === 'hostname' || host === 'HOST') {
    throw new Error('DATABASE_URL host is a placeholder. Put the real Postgres host in .env.');
  }
  const user = decodeURIComponent(parsed.username || '');
  if (!user || user === 'username' || user === 'USER') {
    throw new Error('DATABASE_URL user is a placeholder. Put the real Postgres user in .env.');
  }
  return {
    host,
    port: parsed.port || '5432',
    database: decodeURIComponent((parsed.pathname || '/').replace(/^\//, '').split('/')[0] || ''),
    user,
    password: decodeURIComponent(parsed.password || '')
  };
}

export function describeDatabase() {
  const targetName = String(process.env.DB_TARGET || '').trim().toLowerCase();
  const raw = activeDatabaseUrl();
  if (!raw) {
    const missing = targetName === 'neon'
      ? 'DB_TARGET=neon but DATABASE_URL_NEON is not set.'
      : 'DATABASE_URL is not set. The app will not guess a Postgres host.';
    return {
      configured: false,
      target: null,
      host: null,
      port: null,
      database: null,
      user: null,
      ssl: false,
      passwordSet: false,
      reason: missing
    };
  }
  try {
    const parsed = parseDatabaseUrl(raw);
    return {
      configured: true,
      target: `${parsed.user}@${parsed.host}:${parsed.port}/${parsed.database || '(default)'}`,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
      ssl: Boolean(sslConfig(raw)),
      passwordSet: parsed.password.length > 0,
      reason: null
    };
  } catch (err) {
    return {
      configured: false,
      target: null,
      host: null,
      port: null,
      database: null,
      user: null,
      ssl: false,
      passwordSet: false,
      reason: err.message
    };
  }
}

export function isDatabaseConfigured() {
  return describeDatabase().configured;
}

function dbNotConfiguredError(desc = describeDatabase()) {
  const err = new Error(desc.reason || 'Postgres is not configured.');
  err.code = 'DB_NOT_CONFIGURED';
  return err;
}

function getPool() {
  if (pool) return pool;
  const desc = describeDatabase();
  if (!desc.configured) {
    throw dbNotConfiguredError(desc);
  }
  const rawUrl = activeDatabaseUrl();
  const parsed = parseDatabaseUrl(rawUrl);
  pool = new Pool({
    host: parsed.host,
    port: Number(parsed.port),
    database: parsed.database || undefined,
    user: parsed.user,
    password: String(parsed.password ?? ''),
    ssl: sslConfig(rawUrl),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    max: 8,
    // Handshake only. A running query is not cut off by this.
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 5 * 60_000
  });
  pool.on('error', (err) => {
    console.warn(`[db] idle connection dropped: ${err.code || err.message}`);
    resetPool();
  });
  if (!loggedTarget) {
    console.log(
      `[db] Postgres target: ${desc.target} ssl=${desc.ssl} passwordSet=${desc.passwordSet}`
    );
    loggedTarget = true;
  }
  return pool;
}

function resetPool() {
  if (!pool) return;
  const old = pool;
  pool = null;
  old.end().catch(() => {});
}

function isRetryableConnect(err) {
  const code = err?.code || '';
  return ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', '57P01', '57P03'].includes(code)
    || /ETIMEDOUT|ECONNRESET|EPIPE|Connection terminated|timeout expired/i.test(String(err?.message || ''));
}

export async function query(text, params) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getPool().query(text, params);
    } catch (err) {
      last = err;
      if (!isRetryableConnect(err) || attempt === 2) throw err;
      console.warn(`[db] ${err.code || err.message} — reconnect ${attempt + 1}/3`);
      resetPool();
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw last;
}

const poolProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'query') return query;
      const real = getPool();
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    }
  }
);

/**
 * Executes a PostgreSQL query mapping named parameters (:param) to positional ones ($1).
 * @param {string} sql
 * @param {object} params
 * @returns {Promise<any[]>}
 */
export async function fetchall(sql, params = {}) {
  let paramIndex = 1;
  const values = [];

  const convertedSql = sql.replace(/(?<!:):([a-zA-Z0-9_]+)/g, (match, paramName) => {
    if (params[paramName] !== undefined) {
      values.push(params[paramName]);
      return `$${paramIndex++}`;
    }
    return match;
  });

  const res = await query(convertedSql, values);
  return res.rows;
}

/**
 * Returns a single scalar value from a database query.
 * @param {string} sql
 * @param {object} params
 * @returns {Promise<number|string>}
 */
export async function scalar(sql, params = {}) {
  const rows = await fetchall(sql, params);
  if (rows && rows.length > 0) {
    const firstKey = Object.keys(rows[0])[0];
    const val = rows[0][firstKey];
    return val !== null && val !== undefined ? Number(val) : 0;
  }
  return 0;
}

/**
 * Helper to dynamically construct database query WHERE clauses based on input filters.
 * @param {object} filters
 * @param {object} config
 * @returns {[string[], object]} Array of filter SQL conditions and mapped parameter values
 */
export function buildFilters(filters = {}, {
  dateCol = null,
  stateCol = 'state_id',
  districtCol = 'district_id',
  partnerCol = null,
  genderCol = null,
  schoolCol = null,
  academicYearCol = null,
  tradeCol = null
} = {}) {
  const clauses = [];
  const params = {};

  const stateId = filters.state_id;
  const districtId = filters.district_id;
  const year = filters.year;
  const quarter = filters.quarter;
  const partnerId = filters.partner_id;
  const gender = filters.gender;
  const trade = filters.trade;
  const academicYr = filters.academic_year;
  const schoolId = filters.school_id;

  if (stateId && stateCol) {
    clauses.push(`${stateCol} = :state_id`);
    params.state_id = stateId;
  }

  if (districtId && districtCol) {
    clauses.push(`${districtCol} = :district_id`);
    params.district_id = districtId;
  }

  if (partnerId && partnerCol) {
    clauses.push(`${partnerCol} = :partner_id`);
    params.partner_id = partnerId;
  }

  if (gender && genderCol) {
    clauses.push(`${genderCol} = :gender`);
    params.gender = gender;
  }

  if (trade && tradeCol) {
    clauses.push(`${tradeCol} = :trade`);
    params.trade = trade;
  }

  if (schoolId && schoolCol) {
    clauses.push(`${schoolCol} = :school_id`);
    params.school_id = schoolId;
  }

  if (academicYr && academicYearCol) {
    clauses.push(`${academicYearCol} = :academic_year`);
    params.academic_year = academicYr;
  }

  if (dateCol && year) {
    clauses.push(`SUBSTR(${dateCol}, 1, 4) = :year`);
    params.year = year;
  }

  if (dateCol && quarter) {
    const quarterMap = {
      Q1: ['01', '03'],
      Q2: ['04', '06'],
      Q3: ['07', '09'],
      Q4: ['10', '12']
    };
    if (quarterMap[quarter]) {
      const [mStart, mEnd] = quarterMap[quarter];
      clauses.push(`SUBSTR(${dateCol}, 6, 2) BETWEEN :q_start AND :q_end`);
      params.q_start = mStart;
      params.q_end = mEnd;
    }
  }

  return [clauses, params];
}

/**
 * Joins clauses into a single WHERE string.
 * @param {string[]} clauses
 * @returns {string}
 */
export function whereStr(clauses) {
  return clauses && clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

export default poolProxy;
