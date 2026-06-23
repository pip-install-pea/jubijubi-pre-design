import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall } from '@/lib/db.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const state_id = url.searchParams.get('state_id');

    if (state_id) {
      const rows = await fetchall(
        `SELECT source_id AS id, name
         FROM health_district
         WHERE state_id = :sid AND source_id IS NOT NULL
         ORDER BY name`,
        { sid: state_id }
      );
      return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
    }

    const rows = await fetchall(
      `SELECT source_id AS id, name
       FROM health_state
       WHERE source_id IS NOT NULL
       ORDER BY name`
    );
    return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
  } catch (err) {
    console.error('Error fetching locations:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
