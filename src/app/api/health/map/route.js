import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest, buildFilters, stripGeo, whereStr } from '@/lib/analytics.js';
import { fetchall, isDatabaseConfigured } from '@/lib/db.js';
import { HEALTH_GEO_JOIN } from '@/lib/geoLookups.js';
import { buildDistrictIndex, matchAdminCounts } from '@/lib/geo/regionNames.js';

const PATIENT_OPTS = {
  date_col: 'health_profile_patients.created_at',
  state_col: 'health_profile_patients.state_id',
  district_col: 'health_profile_patients.district_id',
  gender_col: 'health_profile_patients.gender',
  partner_col: 'health_profile_patients.partner_id',
  module: 'health'
};

function districtIndex() {
  const file = path.join(process.cwd(), 'public', 'geo', 'india_districts.geojson');
  const geo = JSON.parse(fs.readFileSync(file, 'utf8'));
  return buildDistrictIndex(geo.features);
}

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'health') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const filters = getFiltersFromRequest(req);
  const empty = { stateMetrics: {}, districtMetrics: {}, unmapped: [], stateById: {}, year: filters.year || null };
  if (!isDatabaseConfigured()) return NextResponse.json(empty);

  try {
    const { clauses, params } = buildFilters(stripGeo(filters), PATIENT_OPTS);
    const where = whereStr(clauses);
    const [stateRows, districtRows] = await Promise.all([
      fetchall(
        `SELECT COALESCE(NULLIF(TRIM(hs.name), ''), health_profile_patients.state_id::text, 'Unknown') AS state,
                hs.source_id::text AS state_id,
                COUNT(*)::integer AS value
         FROM health_profile_patients
         ${HEALTH_GEO_JOIN}
         ${where}
         GROUP BY 1, 2`,
        params
      ),
      fetchall(
        `SELECT COALESCE(NULLIF(TRIM(hs.name), ''), health_profile_patients.state_id::text, 'Unknown') AS state,
                hs.source_id::text AS state_id,
                COALESCE(NULLIF(TRIM(hd.name), ''), health_profile_patients.district_id::text, 'Unknown') AS district,
                hd.source_id::text AS district_id,
                COUNT(*)::integer AS value
         FROM health_profile_patients
         ${HEALTH_GEO_JOIN}
         ${where}
         GROUP BY 1, 2, 3, 4`,
        params
      )
    ]);
    const matched = matchAdminCounts(stateRows, districtRows, districtIndex());
    return NextResponse.json({ ...matched, year: filters.year || null });
  } catch (err) {
    console.error('Error in health map API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
