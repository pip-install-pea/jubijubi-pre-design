import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall } from '@/lib/db.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Restrict to super_admin or admin roles
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const logs = await fetchall('SELECT * FROM sync_log ORDER BY finished_at DESC LIMIT 100');
    
    // Map backend response structures (to_dict parity)
    const result = logs.map(l => ({
      id: l.id,
      module: l.module,
      table_name: l.table_name,
      records_fetched: l.records_fetched,
      records_upserted: l.records_upserted,
      status: l.status,
      error_message: l.error_message,
      started_at: l.started_at,
      finished_at: l.finished_at
    }));
    
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error fetching sync logs:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
