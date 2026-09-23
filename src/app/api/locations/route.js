import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall, isDatabaseConfigured } from '@/lib/db.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json([]);
    }
    const url = new URL(req.url);
    const state_id = url.searchParams.get('state_id');
    const module = url.searchParams.get('module') || 'health';

    if (module === 'livelihood') {
      if (state_id) {
        const rows = await fetchall(
          `SELECT district_id AS id, district_name AS name
           FROM skilltracking_district
           WHERE state_id = :sid
           ORDER BY district_name`,
          { sid: state_id }
        );
        return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
      }
      const rows = await fetchall(
        `SELECT state_id AS id, state_name AS name
         FROM skilltracking_state
         ORDER BY state_name`
      );
      return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
    }

    if (module === 'education') {
      if (state_id) {
        const rows = await fetchall(
          `SELECT DISTINCT ep.district_id AS id,
                  COALESCE(sd.district_name, ep.district_id::text) AS name
           FROM education_program ep
           LEFT JOIN skilltracking_district sd ON sd.district_id::text = ep.district_id::text
           WHERE ep.state_id::text = :sid AND ep.district_id IS NOT NULL
           ORDER BY name`,
          { sid: String(state_id) }
        );
        return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
      }
      const rows = await fetchall(
        `SELECT DISTINCT ep.state_id AS id,
                COALESCE(ss.state_name, ep.state_id::text) AS name
         FROM education_program ep
         LEFT JOIN skilltracking_state ss ON ss.state_id::text = ep.state_id::text
         WHERE ep.state_id IS NOT NULL
         ORDER BY name`
      );
      return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
    }

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
    return NextResponse.json([]);
  }
}
