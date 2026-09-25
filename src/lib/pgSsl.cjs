const fs = require('fs');
const path = require('path');

function resolveCaPath() {
  const fromEnv = process.env.DATABASE_CA;
  const candidates = [
    fromEnv,
    path.join(process.cwd(), 'certs', 'global-bundle.pem'),
    path.join(__dirname, '..', '..', 'certs', 'global-bundle.pem')
  ].filter(Boolean);
  for (const candidate of candidates) {
    const abs = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function parseDatabaseUrl(raw) {
  const parsed = new URL(String(raw || '').trim());
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error('DATABASE_URL must start with postgresql://');
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent((parsed.pathname || '/').replace(/^\//, '').split('/')[0] || 'postgres'),
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || '')
  };
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
    || flag === 'verify-full' || flag === 'verify-ca'
    || /sslmode=(require|verify-ca|verify-full)/i.test(url)
    || isRds
    || /\.neon\.tech/i.test(url);

  if (!wantsSsl) return false;

  if (isRds) {
    const caPath = resolveCaPath();
    if (caPath) {
      return { rejectUnauthorized: false, ca: fs.readFileSync(caPath, 'utf8') };
    }
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
}

function clientConfig(url = activeDatabaseUrl()) {
  const parsed = parseDatabaseUrl(url);
  return {
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    user: parsed.user,
    password: parsed.password,
    ssl: sslConfig(url)
  };
}

module.exports = { sslConfig, resolveCaPath, parseDatabaseUrl, clientConfig, activeDatabaseUrl };
