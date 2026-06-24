import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import pool from '@/lib/db.js';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';
import { validateBatchFKs } from '@/lib/fkValidator.js';

/**
 * POST /api/data/add-batch
 *
 * Bulk inserts records from an Excel / CSV upload.
 * Request body:
 *   { table: "health_profile_patients", records: [ {…}, {…}, … ] }
 *
 * Flow:
 *   1. Auth check + thematic authorization
 *   2. Batch FK validation (batched ANY queries)
 *   3. Chunked INSERT using a single transaction
 *   4. Returns counts: inserted, skipped (FK violations), errors
 *
 * Max batch size: 5000 rows (enforced server-side).
 */
const MAX_BATCH = 5000;

export async function POST(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.table || !Array.isArray(body?.records)) {
    return NextResponse.json({ error: 'Missing "table" or "records" array' }, { status: 400 });
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

  if (body.records.length === 0) {
    return NextResponse.json({ error: 'No records provided' }, { status: 400 });
  }

  if (body.records.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch too large. Maximum ${MAX_BATCH} rows per upload.` },
      { status: 400 }
    );
  }

  try {
    const allowedCols = schema.fields.map(f => f.col);
    const now = new Date().toISOString();

    // 1. Batch FK validation — returns only valid records
    const fkResult = await validateBatchFKs(body.table, body.records);
    if (!fkResult.valid) {
      return NextResponse.json({ error: fkResult.error }, { status: 422 });
    }

    const validRecords = fkResult.filteredRecords;
    const skippedCount = fkResult.removedCount;

    if (validRecords.length === 0) {
      return NextResponse.json({
        message: 'No valid records to insert after FK validation.',
        inserted: 0,
        skipped: skippedCount,
        errors: 0
      }, { status: 200 });
    }

    // 2. Transactional chunk insert
    const client = await pool.connect();
    let insertedCount = 0;
    let errorCount = 0;

    try {
      await client.query('BEGIN');

      for (const record of validRecords) {
        try {
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

          // Inject created_at if missing
          const hasCreatedAt = body.table !== 'health_profile_doctors';
          if (hasCreatedAt && !record.created_at && !cols.includes('"created_at"')) {
            cols.push('"created_at"');
            vals.push(now);
            placeholders.push(`$${idx}`);
            updateClauses.push(`"created_at" = EXCLUDED."created_at"`);
            idx++;
          }

          // Inject added_by mapping to current user
          if (user?.username) {
            cols.push('"added_by"');
            vals.push(user.username);
            placeholders.push(`$${idx}`);
            updateClauses.push(`"added_by" = EXCLUDED."added_by"`);
            idx++;
          }

          if (cols.length === 0) continue;

          const sql = `
            INSERT INTO "${body.table}" (${cols.join(', ')})
            VALUES (${placeholders.join(', ')})
            ON CONFLICT ("${schema.primaryKey}") DO UPDATE SET
              ${updateClauses.length > 0 ? updateClauses.join(', ') : `"${schema.primaryKey}" = EXCLUDED."${schema.primaryKey}"`}
          `;

          await client.query(sql, vals);
          insertedCount++;
        } catch (rowErr) {
          console.warn(`[batch-insert] Row error:`, rowErr.message);
          errorCount++;
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return NextResponse.json({
      message: `Batch processed successfully.`,
      inserted: insertedCount,
      skipped: skippedCount,
      errors: errorCount
    }, { status: 201 });
  } catch (err) {
    console.error('[API /data/add-batch] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
