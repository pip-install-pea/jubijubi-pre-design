import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { syncAll } from '@/lib/syncEngine.js';

export async function POST(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Restrict to super_admin or admin roles
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (process.env.VERCEL && process.env.ALLOW_VERCEL_SYNC !== 'true') {
    return NextResponse.json({
      error: 'Sync cannot finish on Vercel serverless. Point DATABASE_URL at the hosted database and run npm run db:sync on a laptop or a worker.'
    }, { status: 501 });
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body.force;
  } catch (e) {
    // Body is empty or invalid JSON, default to false
  }

  // Non-blocking background sync execution to mimic Celery/APScheduler 202 Accepted response.
  syncAll(force)
    .then(summary => {
      console.log(`Manual background sync (force=${force}) completed successfully:`, summary);
    })
    .catch(err => {
      console.error(`Manual background sync (force=${force}) failed:`, err);
    });

  return NextResponse.json({
    status: 'triggered',
    force,
    message: force ? 'Full sync started in background.' : 'Incremental sync started in background.'
  }, { status: 202 });
}
