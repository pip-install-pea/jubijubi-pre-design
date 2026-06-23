export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
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
