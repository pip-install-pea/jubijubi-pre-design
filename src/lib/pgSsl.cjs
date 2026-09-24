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

function sslConfig(url = process.env.DATABASE_URL || '') {
  const flag = String(process.env.DATABASE_SSL || '').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'disable') return false;

  const wantsSsl = flag === 'true' || flag === '1' || flag === 'require'
    || flag === 'verify-full' || flag === 'verify-ca'
    || /sslmode=(require|verify-ca|verify-full)/i.test(url)
    || /\.rds\.amazonaws\.com/i.test(url);

  if (!wantsSsl) {
    if (/sslmode=disable/i.test(url) || /localhost|127\.0\.0\.1/i.test(url)) return false;
    return false;
  }

  const caPath = resolveCaPath();
  const isRds = /\.rds\.amazonaws\.com/i.test(url);
  if (caPath) {
    return {
      rejectUnauthorized: !isRds,
      ca: fs.readFileSync(caPath, 'utf8')
    };
  }

  return { rejectUnauthorized: false };
}

function clientConfig(url = process.env.DATABASE_URL || '') {
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

module.exports = { sslConfig, resolveCaPath, parseDatabaseUrl, clientConfig };
