import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import pool from '@/lib/db.js';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';

/**
 * POST /api/data/foreign-keys
 *
 * Returns a Map of lookup options for every FK field in a given table.
 * Request body: { table: "health_profile_patients" }
 * Response:     { lookups: { partner_id: [{id:1,label:"ABC"},...], state_id: [...] } }
 *
 * Performance: one query per FK dropdown field, all run in parallel via Promise.all.
 */
export async function POST(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.table) {
    return NextResponse.json({ error: 'Missing "table" field' }, { status: 400 });
  }

  const schema = TABLE_SCHEMAS[body.table];
  if (!schema) {
    return NextResponse.json({ error: `Unknown table: ${body.table}` }, { status: 400 });
  }

  // Thematic authorization
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  if (!isAdmin && user.thematic !== schema.thematic) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const lookupFields = schema.fields.filter(f => f.lookup);
    const lookups = {};
    const filters = body.filters || {};

    // Execute all lookup queries concurrently
    await Promise.all(
      lookupFields.map(async (field) => {
        const { table: lookupTable, idCol, labelCol } = field.lookup;
        
        // Fast-path: return empty lists for dependent geographic fields if parent filters are absent
        if (lookupTable.includes('district') && !filters.state_id) {
          lookups[field.col] = [];
          return;
        }
        if (lookupTable.includes('block') && !filters.district_id) {
          lookups[field.col] = [];
          return;
        }
        if (lookupTable.includes('village') && !filters.block_id) {
          lookups[field.col] = [];
          return;
        }

        let sql = `SELECT "${idCol}" AS id, "${labelCol}" AS label FROM "${lookupTable}"`;
        const conditions = [];
        const params = [];

        // Build conditional clauses based on lookup destination and provided filters
        if (lookupTable.includes('district') && filters.state_id) {
          conditions.push(`"state_id" = $${params.length + 1}`);
          params.push(filters.state_id);
        } else if (lookupTable.includes('block') && filters.district_id) {
          conditions.push(`"district_id" = $${params.length + 1}`);
          params.push(filters.district_id);
        } else if (lookupTable.includes('village') && filters.block_id) {
          conditions.push(`"block_id" = $${params.length + 1}`);
          params.push(filters.block_id);
        } else if (lookupTable === 'skilltracking_skill_center') {
          if (filters.district_id) {
            conditions.push(`"district_id" = $${params.length + 1}`);
            params.push(filters.district_id);
          } else if (filters.state_id) {
            conditions.push(`"state_id" = $${params.length + 1}`);
            params.push(filters.state_id);
          }
        } else if (lookupTable === 'skilltracking_batch_list') {
          if (filters.center_id) {
            conditions.push(`"center_id" = $${params.length + 1}`);
            params.push(filters.center_id);
          }
          if (filters.course_id) {
            conditions.push(`"course_id" = $${params.length + 1}`);
            params.push(filters.course_id);
          }
          if (filters.district_id) {
            conditions.push(`"district_id" = $${params.length + 1}`);
            params.push(filters.district_id);
          }
        } else if (lookupTable === 'skilltracking_persons') {
          if (filters.batch_id) {
            conditions.push(`"batch_id" = $${params.length + 1}`);
            params.push(filters.batch_id);
          }
        }

        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ` ORDER BY "${labelCol}" ASC LIMIT 5000`;

        const res = await pool.query(sql, params);
        lookups[field.col] = res.rows;
      })
    );

    return NextResponse.json({ lookups });
  } catch (err) {
    console.error('[API /data/foreign-keys] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
