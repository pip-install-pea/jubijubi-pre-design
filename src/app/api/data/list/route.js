import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import pool from '@/lib/db.js';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table');
  if (!table) {
    return NextResponse.json({ error: 'Missing "table" parameter' }, { status: 400 });
  }

  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
  }

  // Thematic authorization
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  if (!isAdmin && user.thematic !== schema.thematic) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Dynamic order column based on physical schema
    const colQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `;
    const colRes = await pool.query(colQuery, [table]);
    const physicalCols = colRes.rows.map(r => r.column_name);

    let orderCol = physicalCols.includes('created_at') 
      ? 'created_at' 
      : (physicalCols.includes('synced_at') ? 'synced_at' : schema.primaryKey);

    const query = `
      SELECT t.*, t.added_by AS added_by_username 
      FROM "${table}" t
      WHERE t.added_by IS NOT NULL AND t.added_by != 'api'
      ORDER BY t."${orderCol}" DESC
      LIMIT 500
    `;

    const result = await pool.query(query);
    return NextResponse.json({ records: result.rows });
  } catch (err) {
    console.error('[API /data/list] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
