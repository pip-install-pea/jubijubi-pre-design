import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import pool from '@/lib/db.js';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';
import { validateRecordFKs } from '@/lib/fkValidator.js';

/**
 * POST /api/data/add
 *
 * Inserts a single record into a data table.
 * Request body:
 *   { table: "health_profile_patients", record: { patient_id: "P100", full_name: "Ravi", ... } }
 *
 * Flow:
 *   1. Auth check + thematic authorization
 *   2. Schema validation (only allowed columns are written)
 *   3. FK validation via fkValidator
 *   4. INSERT … ON CONFLICT (primaryKey) DO UPDATE — upsert semantics
 */
export async function POST(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.table || !body?.record) {
    return NextResponse.json({ error: 'Missing "table" or "record" field' }, { status: 400 });
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
    const record = body.record;

    // Validate required fields
    const allowedCols = schema.fields.map(f => f.col);
    const requiredCols = schema.fields.filter(f => f.required).map(f => f.col);
    for (const col of requiredCols) {
      if (!record[col] && record[col] !== 0) {
        return NextResponse.json(
          { error: `Missing required field: ${col}` },
          { status: 400 }
        );
      }
    }

    // FK validation
    const fkResult = await validateRecordFKs(body.table, record);
    if (!fkResult.valid) {
      return NextResponse.json({ error: fkResult.error }, { status: 422 });
    }

    // Build INSERT … ON CONFLICT DO UPDATE
    const cols = [];
    const vals = [];
    const placeholders = [];
    const updateClauses = [];
    let idx = 1;

    for (const col of allowedCols) {
      if (record[col] !== undefined) {
        cols.push(`"${col}"`);
        vals.push(record[col] === '' ? null : record[col]);
        placeholders.push(`$${idx}`);
        if (col !== schema.primaryKey) {
          updateClauses.push(`"${col}" = EXCLUDED."${col}"`);
        }
        idx++;
      }
    }

    // Add created_at if not provided and table has it
    const hasCreatedAt = body.table !== 'health_profile_doctors';
    if (hasCreatedAt && !record.created_at && !cols.includes('"created_at"')) {
      cols.push('"created_at"');
      vals.push(new Date().toISOString());
      placeholders.push(`$${idx}`);
      updateClauses.push(`"created_at" = EXCLUDED."created_at"`);
      idx++;
    }

    // Add added_by mapping to current user
    if (user?.username) {
      cols.push('"added_by"');
      vals.push(user.username);
      placeholders.push(`$${idx}`);
      updateClauses.push(`"added_by" = EXCLUDED."added_by"`);
      idx++;
    }

    const sql = `
      INSERT INTO "${body.table}" (${cols.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT ("${schema.primaryKey}") DO UPDATE SET
        ${updateClauses.length > 0 ? updateClauses.join(', ') : `"${schema.primaryKey}" = EXCLUDED."${schema.primaryKey}"`}
      RETURNING "${schema.primaryKey}"
    `;

    const result = await pool.query(sql, vals);
    const insertedId = result.rows[0]?.[schema.primaryKey];

    return NextResponse.json({
      message: 'Record saved successfully',
      id: insertedId
    }, { status: 201 });
  } catch (err) {
    console.error('[API /data/add] Error:', err);

    // Provide user-friendly duplicate key message
    if (err.code === '23505') {
      return NextResponse.json(
        { error: `Duplicate key: a record with this ${schema.primaryKey} already exists.` },
        { status: 409 }
      );
    }
    if (err.code === '23503') {
      return NextResponse.json(
        { error: `Foreign key violation: ${err.detail || err.message}` },
        { status: 422 }
      );
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
