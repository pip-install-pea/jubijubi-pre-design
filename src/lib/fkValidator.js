import pool from './db.js';

// In-memory cache for table constraints: Map<tableName, Array<{localColumn, referencedTable, referencedColumn}>>
const constraintCache = new Map();

/**
 * Retrieves the foreign key constraints for a given table from PostgreSQL's information_schema.
 * Uses an in-memory cache to guarantee sub-millisecond execution on subsequent calls.
 * 
 * @param {string} tableName - The database table to query constraints for
 * @returns {Promise<Array<{localColumn: string, referencedTable: string, referencedColumn: string}>>}
 */
export async function getTableConstraints(tableName) {
  if (constraintCache.has(tableName)) {
    return constraintCache.get(tableName);
  }

  const query = `
    SELECT
        kcu.column_name AS local_column, 
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name = $1 
      AND tc.table_schema = 'public';
  `;

  try {
    const res = await pool.query(query, [tableName]);
    const constraints = res.rows.map(r => ({
      localColumn: r.local_column,
      referencedTable: r.referenced_table,
      referencedColumn: r.referenced_column
    }));

    constraintCache.set(tableName, constraints);
    return constraints;
  } catch (err) {
    console.error(`[fkValidator] Error fetching constraints for table ${tableName}:`, err);
    throw err;
  }
}

/**
 * Validates a single record's foreign keys.
 * Performs fast parameterized index lookups.
 * 
 * @param {string} tableName - The target table name
 * @param {object} record - The row data object to validate
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateRecordFKs(tableName, record) {
  if (!record || typeof record !== 'object') {
    return { valid: false, error: 'Record must be a non-null object.' };
  }

  try {
    const constraints = await getTableConstraints(tableName);

    for (const constr of constraints) {
      const val = record[constr.localColumn];
      // Skip validation if the field is omitted, null, or empty string (allows optional foreign keys)
      if (val === null || val === undefined || String(val).trim() === '') {
        continue;
      }

      const checkQuery = `
        SELECT 1 FROM "${constr.referencedTable}" 
        WHERE "${constr.referencedColumn}" = $1 
        LIMIT 1
      `;
      const res = await pool.query(checkQuery, [val]);
      if (res.rows.length === 0) {
        // Map invalid foreign key to null instead of failing
        record[constr.localColumn] = null;
      }
    }

    return { valid: true };
  } catch (err) {
    console.error(`[fkValidator] Validation error on table ${tableName}:`, err);
    return { valid: false, error: `Internal database validation error: ${err.message}` };
  }
}

/**
 * Validates a batch of records.
 * Uses a single batch query (with ANY operator) per constraint to prevent N+1 query bottlenecks.
 * 
 * @param {string} tableName - The target table name
 * @param {Array<object>} records - The array of row data objects to validate
 * @returns {Promise<{valid: boolean, filteredRecords: Array<object>, removedCount: number, error?: string}>}
 */
export async function validateBatchFKs(tableName, records) {
  if (!Array.isArray(records)) {
    return { valid: false, filteredRecords: [], removedCount: 0, error: 'Records must be an array.' };
  }
  if (records.length === 0) {
    return { valid: true, filteredRecords: [], removedCount: 0 };
  }

  try {
    const constraints = await getTableConstraints(tableName);
    // Clone records to avoid mutating caller's original array or objects directly
    let filtered = records.map(rec => ({ ...rec }));

    for (const constr of constraints) {
      // Collect unique, non-empty values for this foreign key column from current filtered set
      const uniqueValues = Array.from(
        new Set(
          filtered
            .map(rec => rec[constr.localColumn])
            .filter(val => val !== null && val !== undefined && String(val).trim() !== '')
        )
      ).map(v => String(v));

      if (uniqueValues.length === 0) {
        continue; // No values to validate for this column
      }

      // Check all unique keys in a single batched query
      const checkQuery = `
        SELECT "${constr.referencedColumn}" AS id 
        FROM "${constr.referencedTable}" 
        WHERE "${constr.referencedColumn}" = ANY($1::varchar[])
      `;
      const res = await pool.query(checkQuery, [uniqueValues]);
      const validIds = new Set(res.rows.map(row => String(row.id)));

      // Map records' invalid foreign keys to null instead of filtering them out
      let nullified = 0;
      filtered = filtered.map(rec => {
        const val = rec[constr.localColumn];
        if (val === null || val === undefined || String(val).trim() === '') {
          return rec;
        }
        if (!validIds.has(String(val))) {
          rec[constr.localColumn] = null;
          nullified++;
        }
        return rec;
      });

      if (nullified > 0) {
        console.log(`[fkValidator] Table ${tableName}: Mapped ${nullified} invalid foreign keys to NULL on column ${constr.localColumn}`);
      }
    }

    return {
      valid: true,
      filteredRecords: filtered,
      removedCount: 0 // Since we no longer drop records
    };
  } catch (err) {
    console.error(`[fkValidator] Batch validation error on table ${tableName}:`, err);
    return { valid: false, filteredRecords: [], removedCount: 0, error: `Internal database validation error: ${err.message}` };
  }
}

/**
 * Resets the in-memory constraint cache.
 * Useful for hot-reloads, tests, or metadata updates.
 */
export function clearConstraintCache() {
  constraintCache.clear();
}
