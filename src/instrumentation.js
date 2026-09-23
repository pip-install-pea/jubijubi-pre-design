export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { isDatabaseConfigured, describeDatabase } = await import('./lib/db.js');
      const db = describeDatabase();
      if (!isDatabaseConfigured()) {
        console.log(`[Auto-Sync] Skipped — ${db.reason}`);
        return;
      }
      console.log(`[db] ${db.target} ssl=${db.ssl} passwordSet=${db.passwordSet}`);

      if (process.env.VERCEL || process.env.AUTO_SYNC === 'false' || process.env.AUTO_SYNC === '0') {
        console.log('[Auto-Sync] Skipped — set AUTO_SYNC=true on a long-running Node host, or run npm run db:sync');
        return;
      }
      if (process.env.AUTO_SYNC !== 'true' && process.env.AUTO_SYNC !== '1') {
        console.log('[Auto-Sync] Off by default. Set AUTO_SYNC=true to schedule sync in this process.');
        return;
      }

      const { syncAll } = await import('./lib/syncEngine.js');

      const intervalMs = Number(process.env.SYNC_INTERVAL_MS) || 1800000;
      console.log(`[Auto-Sync] Scheduler initialized. Sync interval set to ${intervalMs / 1000 / 60} minutes.`);

      setInterval(async () => {
        console.log('[Auto-Sync] Running scheduled background data sync...');
        try {
          const summary = await syncAll();
          if (summary && summary.error) {
            console.log(`[Auto-Sync] Scheduled sync deferred: ${summary.error}`);
          } else {
            console.log('[Auto-Sync] Scheduled background data sync completed successfully.');
          }
        } catch (err) {
          console.error('[Auto-Sync] Scheduled background data sync failed:', err);
        }
      }, intervalMs);

    } catch (error) {
      console.error('[Auto-Sync] Failed to initialize scheduler:', error);
    }
  }
}
