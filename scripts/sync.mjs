/**
 * Full PHP → Postgres sync. Run against the same DATABASE_URL as production.
 * Usage: node --env-file=.env --experimental-detect-module scripts/sync.mjs
 */
const force = process.argv.includes('--force');
const { syncAll } = await import('../src/lib/syncEngine.js');
const summary = await syncAll(force);
if (summary?.error) {
  console.error('[sync]', summary.error);
  process.exit(1);
}
console.log(JSON.stringify(summary, null, 2));
