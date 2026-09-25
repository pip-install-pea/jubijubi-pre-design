import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall, isDatabaseConfigured } from '@/lib/db.js';
import { bindIn, splitList } from '@/lib/analytics.js';

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
    const stateIds = splitList(url.searchParams.get('state_id'));
    const module = url.searchParams.get('module') || 'health';
    const stateParams = {};
    const stateClause = bindIn('state_id::text', stateIds, 'sid', stateParams);
    const manyStates = stateIds.length > 1;

    if (module === 'livelihood') {
      if (stateClause) {
        const rows = await fetchall(
          `SELECT d.district_id AS id,
                  CASE WHEN :many = '1'
                    THEN s.state_name || ' · ' || d.district_name
                    ELSE d.district_name
                  END AS name
           FROM skilltracking_district d
           LEFT JOIN skilltracking_state s ON s.state_id::text = d.state_id::text
           WHERE ${stateClause.replaceAll('state_id::text', 'd.state_id::text')}
           ORDER BY name`,
          { ...stateParams, many: manyStates ? '1' : '0' }
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
      if (stateClause) {
        const rows = await fetchall(
          `SELECT DISTINCT ep.district_id AS id,
                  CASE WHEN :many = '1'
                    THEN COALESCE(ss.state_name, ep.state_id::text) || ' · ' || COALESCE(sd.district_name, ep.district_id::text)
                    ELSE COALESCE(sd.district_name, ep.district_id::text)
                  END AS name
           FROM education_program ep
           LEFT JOIN skilltracking_district sd
             ON sd.district_id::text = ep.district_id::text
            AND sd.state_id::text = ep.state_id::text
           LEFT JOIN skilltracking_state ss ON ss.state_id::text = ep.state_id::text
           WHERE ${stateClause.replaceAll('state_id::text', 'ep.state_id::text')}
             AND ep.district_id IS NOT NULL
           ORDER BY name`,
          { ...stateParams, many: manyStates ? '1' : '0' }
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

    if (stateClause) {
      const rows = await fetchall(
        `SELECT d.source_id AS id,
                CASE WHEN :many = '1'
                  THEN COALESCE(s.name, d.state_id::text) || ' · ' || d.name
                  ELSE d.name
                END AS name
         FROM health_district d
         LEFT JOIN health_state s ON s.source_id::text = d.state_id::text
         WHERE ${stateClause.replaceAll('state_id::text', 'd.state_id::text')}
           AND d.source_id IS NOT NULL
         ORDER BY name`,
        { ...stateParams, many: manyStates ? '1' : '0' }
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
