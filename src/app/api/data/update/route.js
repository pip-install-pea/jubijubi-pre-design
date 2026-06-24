import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import pool from '@/lib/db.js';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';
import { validateRecordFKs } from '@/lib/fkValidator.js';

export async function PUT(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.table || !body?.id || !body?.record) {
    return NextResponse.json({ error: 'Missing "table", "id", or "record" field' }, { status: 400 });
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
    // 1. Verify that the record exists and is manually added (added_by IS NOT NULL)
    const checkQuery = `
      SELECT added_by FROM "${body.table}" 
      WHERE "${schema.primaryKey}" = $1
    `;
    const checkRes = await pool.query(checkQuery, [body.id]);
    if (checkRes.rows.length === 0) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    const targetRecord = checkRes.rows[0];
    if (targetRecord.added_by === null || targetRecord.added_by === undefined || targetRecord.added_by === 'api') {
      return NextResponse.json({ error: 'Cannot modify API-synced records.' }, { status: 403 });
    }

    // 2. Validate FK references
    const record = body.record;
    const fkResult = await validateRecordFKs(body.table, record);
    if (!fkResult.valid) {
      return NextResponse.json({ error: fkResult.error }, { status: 422 });
    }

    // 3. Build dynamic UPDATE query
    const allowedCols = schema.fields.map(f => f.col);
    const updates = [];
    const values = [];
    let idx = 1;

    for (const col of allowedCols) {
      // Don't update the primaryKey itself
      if (col === schema.primaryKey) continue;
      
      if (record[col] !== undefined) {
        updates.push(`"${col}" = $${idx}`);
        values.push(record[col] === '' ? null : record[col]);
        idx++;
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: 'No fields to update' }, { status: 200 });
    }

    // Append id to values array
    values.push(body.id);
    const idParamIdx = `$${idx}`;

    const sql = `
      UPDATE "${body.table}"
      SET ${updates.join(', ')}
      WHERE "${schema.primaryKey}" = ${idParamIdx} AND "added_by" IS NOT NULL AND "added_by" != 'api'
    `;

    await pool.query(sql, values);
    return NextResponse.json({ message: 'Record updated successfully' });
  } catch (err) {
    console.error('[API /data/update] Error:', err);
    if (err.code === '23503') {
      return NextResponse.json(
        { error: `Foreign key violation: ${err.detail || err.message}` },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
