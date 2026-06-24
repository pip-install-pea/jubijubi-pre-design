import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import pool from '@/lib/db.js';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';

export async function DELETE(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.table || !body?.id) {
    return NextResponse.json({ error: 'Missing "table" or "id" field' }, { status: 400 });
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
      return NextResponse.json({ error: 'Cannot delete API-synced records.' }, { status: 403 });
    }

    // 2. Perform deletion
    const sql = `
      DELETE FROM "${body.table}"
      WHERE "${schema.primaryKey}" = $1 AND "added_by" IS NOT NULL AND "added_by" != 'api'
    `;
    await pool.query(sql, [body.id]);
    return NextResponse.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('[API /data/delete] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
