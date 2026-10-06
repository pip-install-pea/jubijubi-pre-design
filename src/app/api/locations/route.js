import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall, isDatabaseConfigured } from '@/lib/db.js';
import { bindIn, splitList } from '@/lib/analytics.js';
import { MIX_CANONICAL_ROW } from '@/lib/educationAnalytics.js';
import { EDU_PROGRAM_IDS, eduPlaceSql, eduStateSql } from '@/lib/eduGeo.js';

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
      const ids = EDU_PROGRAM_IDS.map((id) => `'${id}'`).join(', ');
      const place = eduPlaceSql();
      const state = eduStateSql();
      if (stateClause) {
        const rows = await fetchall(
          `SELECT place AS id,
                  CASE WHEN :many = '1' THEN state_name || ' · ' || place ELSE place END AS name
           FROM (
             SELECT ${place} AS place, ${state} AS state_name
             FROM education_mixprogram m
             WHERE ${MIX_CANONICAL_ROW}
               AND m.program_id::text IN (${ids})
           ) mapped
           WHERE ${stateClause.replaceAll('state_id::text', 'state_name')}
             AND place <> 'Not mapped'
           GROUP BY place, state_name
           ORDER BY name`,
          { ...stateParams, many: manyStates ? '1' : '0' }
        );
        return NextResponse.json(rows.map(r => ({ id: r.id, name: r.name })));
      }
      const rows = await fetchall(
        `SELECT state_name AS id, state_name AS name
         FROM (
           SELECT ${state} AS state_name
           FROM education_mixprogram m
           WHERE ${MIX_CANONICAL_ROW}
             AND m.program_id::text IN (${ids})
         ) mapped
         WHERE state_name <> 'Not mapped'
         GROUP BY state_name
         ORDER BY state_name`
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
