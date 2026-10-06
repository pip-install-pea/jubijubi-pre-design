import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall, scalar, isDatabaseConfigured } from '@/lib/db.js';
import { getFiltersFromRequest, buildFilters, whereStr } from '@/lib/analytics.js';
import { getReach, getDepth, healthFilters, listHealthVillages, listHealthDoctors } from '@/lib/healthAnalytics.js';
import { buildJob } from '@/lib/phpRegistry.js';
import { postPhpEnvelope, sanitiseRow } from '@/lib/phpClient.js';
import { addColFilters, filterRows, parseColFilters } from '@/lib/drilldownFilters.js';
import { HEALTH_GEO_JOIN, HEALTH_DISTRICT, HEALTH_STATE, resolveGeoId } from '@/lib/geoLookups.js';

const LIVE_PAGE = 20;
const PATIENT_LIST_COLS = [
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'full_name', label: 'Name' },
  { key: 'year', label: 'Year' }
];

function pickPatientFields(row, year) {
  const clean = sanitiseRow(row);
  return {
    patient_id: clean.patient_id,
    full_name: clean.full_name,
    year: clean.year || year || '—'
  };
}

function matchByName(items, value, key) {
  const needle = String(value || '').trim().toLowerCase();
  if (!needle) return items[0] || null;
  return items.find((r) => String(r[key] || '').toLowerCase() === needle)
    || items.find((r) => String(r[key] || '').toLowerCase().includes(needle))
    || null;
}

async function livePatientSlice(sheet, idField, idValue, year, page) {
  const offset = (page - 1) * LIVE_PAGE;
  const job = buildJob(sheet, {
    year,
    [idField]: idValue,
    Limit: String(LIVE_PAGE),
    offset: String(offset)
  });
  const { rows } = await postPhpEnvelope(job.endpoint, job.body, { altUrls: job.altUrls });
  return {
    columns: PATIENT_LIST_COLS,
    rows: rows.map((r) => pickPatientFields(r, year)),
    page,
    per_page: LIVE_PAGE
  };
}

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'health') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const drill_type = url.searchParams.get('type') || 'patients';
    const value = url.searchParams.get('value') || '';
    const q = url.searchParams.get('q') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const per_page = Math.min(200, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10)));
    const offset = (page - 1) * per_page;
    const filters = healthFilters(getFiltersFromRequest(req));

    if (drill_type === 'villages') {
      const rows = await listHealthVillages(filters);
      const total = rows.reduce((sum, row) => sum + (Number(row.patients) || 0), 0);
      return NextResponse.json({
        columns: [
          { key: 'village', label: 'Village' },
          { key: 'patients', label: 'Patients' }
        ],
        rows,
        total,
        page: 1,
        per_page: Math.max(rows.length, 1),
        caption: 'Patient counts under the selected year and geography. The Villages reached tile is the envelope count and does not follow state, district, or month.'
      });
    }

    if (drill_type === 'doctors') {
      const list = await listHealthDoctors(filters);
      return NextResponse.json({
        columns: [
          { key: 'partner', label: 'Partner' },
          { key: 'specialization', label: 'Specialization' },
          { key: 'doctors', label: 'Doctors' }
        ],
        rows: list.rows,
        total: list.doctors,
        page: 1,
        per_page: Math.max(list.rows.length, 1),
        caption: 'Unique active doctors. Deleted profiles are excluded. Names are not listed.'
      });
    }

    if (drill_type === 'patients') {
      const reach = await getReach(filters);
      return NextResponse.json({
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value' }
        ],
        rows: [
          { metric: 'Direct beneficiaries', value: reach.direct_beneficiaries },
          { metric: 'Villages reached', value: reach.villages_reached },
          { metric: 'States reached', value: reach.states_reached },
          { metric: 'Adolescents 10–19', value: reach.adolescents_10_19 }
        ],
        total: 4,
        page: 1,
        per_page: 4
      });
    }

    if (drill_type === 'disease' || drill_type === 'symptom') {
      const isDisease = drill_type === 'disease';
      try {
        const depth = await getDepth({ ...filters, year: filters.year || undefined });
        const match = isDisease
          ? matchByName(depth.disease_mix || [], value, 'disease')
          : matchByName(depth.symptom_mix || [], value, 'symptom');
        const chartTotal = Number(match?.patients) || 0;
        const idValue = isDisease ? match?.disease_id : match?.symptom_id;
        const year = String(depth.disease_mix_year || filters.year || '');
        const caption = 'Count is the chart total from the disease/symptom summary. The table is a 20-row live page.';

        if (idValue) {
          try {
            const live = await livePatientSlice(
              isDisease ? 'HL_disease_patients' : 'HL_symptom_patients',
              isDisease ? 'disease_id' : 'symptom_id',
              String(idValue),
              year,
              page
            );
            const colFilters = parseColFilters(searchParams);
            const filtered = filterRows(live.rows, live.columns, colFilters);
            return NextResponse.json({
              ...live,
              rows: filtered,
              total: chartTotal,
              caption: Object.keys(colFilters).length
                ? `${caption} Column filters apply to this page of 20 live rows only.`
                : caption
            });
          } catch (err) {
            console.warn('[health drilldown] live patient page skipped:', err.message);
          }
        }

        if (match) {
          return NextResponse.json({
            columns: [
              { key: isDisease ? 'disease' : 'symptom', label: isDisease ? 'Disease' : 'Symptom' },
              { key: 'patients', label: 'Patients' },
              { key: 'year', label: 'Year' }
            ],
            rows: [{
              [isDisease ? 'disease' : 'symptom']: isDisease ? match.disease : match.symptom,
              patients: chartTotal,
              year
            }],
            total: chartTotal,
            page: 1,
            per_page: 1,
            caption
          });
        }
      } catch (err) {
        console.warn('[health drilldown] mix lookup skipped:', err.message);
      }
      return NextResponse.json({
        columns: [],
        rows: [],
        total: 0,
        page,
        per_page: LIVE_PAGE,
        caption: 'No matching disease or symptom on the chart.'
      });
    }

    if (drill_type === 'envelope' || drill_type === 'age') {
      const year = /^\d{4}$/.test(String(value)) ? String(value) : String(filters.year || '');
      const reach = await getReach({ ...filters, year: year || filters.year });
      const rows = drill_type === 'age' && value && !/^\d{4}$/.test(String(value))
        ? (reach.adolescent_share || []).filter((r) => String(r.label) === String(value))
        : [
          { metric: 'Direct beneficiaries', value: reach.direct_beneficiaries },
          { metric: 'Villages reached', value: reach.villages_reached },
          { metric: 'Adolescents 10–19', value: reach.adolescents_10_19 },
          { metric: 'Year', value: reach.envelope_year }
        ];
      const cols = drill_type === 'age' && value && !/^\d{4}$/.test(String(value))
        ? [{ key: 'label', label: 'Group' }, { key: 'value', label: 'People' }]
        : [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }];
      return NextResponse.json({
        columns: cols,
        rows,
        total: rows.length,
        page: 1,
        per_page: rows.length,
        caption: 'Year envelope totals. Same source as the chart, not a patient list.'
      });
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        columns: [],
        rows: [],
        total: 0,
        page,
        per_page,
        caption: 'No records found for this view.'
      });
    }

    let columns = [];
    let rows = [];
    let total = 0;

    if (drill_type === 'appointments') {
      const { clauses, params } = buildFilters(filters, {
        date_col: 'a.created_at',
        partner_col: 'a.partner_id',
        state_col: 'a.state_id',
        district_col: 'a.district_id'
      });
      if (q) {
        clauses.push("(p.full_name ILIKE :q OR a.appointment_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, {
        appointment_id: 'a.appointment_id',
        full_name: 'p.full_name',
        gender: 'p.gender',
        age: 'p.age',
        visit_date: 'a.created_at'
      });
      const w = whereStr(clauses);
      total = await scalar(
        `SELECT COUNT(*)::integer
         FROM health_patient_appointments a
         LEFT JOIN health_profile_patients p ON a.profile_patient_id = p.patient_id
         ${w}`,
        params
      );
      rows = await fetchall(
        `SELECT
           a.appointment_id,
           COALESCE(p.full_name, '—') AS full_name,
           COALESCE(p.gender, '—') AS gender,
           COALESCE(p.age, '—') AS age,
           a.created_at AS visit_date
         FROM health_patient_appointments a
         LEFT JOIN health_profile_patients p ON a.profile_patient_id = p.patient_id
         ${w}
         ORDER BY a.created_at DESC
         LIMIT :lim OFFSET :off`,
        { ...params, lim: per_page, off: offset }
      );
      columns = [
        { key: 'appointment_id', label: 'Appt ID' },
        { key: 'full_name', label: 'Patient' },
        { key: 'gender', label: 'Gender' },
        { key: 'age', label: 'Age' },
        { key: 'visit_date', label: 'Visit Date' }
      ];

    } else if (drill_type === 'inclusion') {
      const { clauses, params } = buildFilters(filters, {
        date_col: 'created_at',
        partner_col: 'partner_id',
        gender_col: 'gender',
        state_col: 'state_id',
        district_col: 'district_id',
        module: 'health'
      });
      if (value === 'seniors') {
        clauses.push("CASE WHEN age ~ '^[0-9]+$' THEN age::integer ELSE 0 END >= 60");
      } else if (value === 'disability') {
        clauses.push("disability = 'Yes'");
      } else if (value === 'women') {
        clauses.push("gender = 'F'");
      }
      if (q) {
        clauses.push('(full_name ILIKE :q OR patient_id::text LIKE :q)');
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, {
        patient_id: 'patient_id',
        full_name: 'full_name',
        gender: 'gender',
        age: 'age',
        created_at: 'created_at',
        district_id: 'district_id',
        state_id: 'state_id'
      });
      const w = whereStr(clauses);
      total = await scalar(`SELECT COUNT(*)::integer FROM health_profile_patients ${w}`, params);
      rows = await fetchall(
        `SELECT patient_id, full_name, gender, age, created_at
         FROM health_profile_patients
         ${w}
         ORDER BY created_at DESC
         LIMIT :lim OFFSET :off`,
        { ...params, lim: per_page, off: offset }
      );
      columns = [
        { key: 'patient_id', label: 'Patient ID' },
        { key: 'full_name', label: 'Name' },
        { key: 'gender', label: 'Gender' },
        { key: 'age', label: 'Age' },
        { key: 'created_at', label: 'Registered' }
      ];

    } else if (drill_type === 'community') {
      const { clauses, params } = buildFilters(filters, {
        date_col: 'health_profile_patients.created_at',
        partner_col: 'health_profile_patients.partner_id',
        state_col: 'health_profile_patients.state_id',
        district_col: 'health_profile_patients.district_id',
        gender_col: 'health_profile_patients.gender',
        module: 'health'
      });
      if (value === 'Unknown') {
        clauses.push("(caste_id IS NULL OR caste_id = '')");
      } else if (value) {
        clauses.push('caste_id = :drill_value');
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(full_name ILIKE :q OR patient_id::text LIKE :q OR caste_id ILIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, {
        patient_id: 'patient_id',
        full_name: 'full_name',
        gender: 'gender',
        age: 'age',
        community: 'caste_id',
        district: HEALTH_DISTRICT,
        state: HEALTH_STATE,
        created_at: 'health_profile_patients.created_at'
      });
      const w = whereStr(clauses);

      total = await scalar(
        `SELECT COUNT(*)::integer FROM health_profile_patients ${HEALTH_GEO_JOIN} ${w}`,
        params
      );

      rows = await fetchall(
        `SELECT
           patient_id, full_name, gender, age,
           caste_id AS community,
           ${HEALTH_STATE} AS state, ${HEALTH_DISTRICT} AS district,
           created_at
         FROM health_profile_patients
         ${HEALTH_GEO_JOIN}
         ${w}
         ORDER BY created_at DESC
         LIMIT :lim OFFSET :off`,
        { ...params, lim: per_page, off: offset }
      );

      columns = [
        { key: 'patient_id',  label: 'Patient ID' },
        { key: 'full_name',   label: 'Name' },
        { key: 'gender',      label: 'Gender' },
        { key: 'age',         label: 'Age' },
        { key: 'community',   label: 'Community' },
        { key: 'state',       label: 'State' },
        { key: 'district',    label: 'District' },
        { key: 'created_at',  label: 'Registered' }
      ];

    } else if (drill_type === 'geo') {
      const grain = url.searchParams.get('grain') || 'state';
      const geoId = await resolveGeoId({
        module: 'health',
        grain,
        geoId: url.searchParams.get('geo_id') || value,
        label: value,
        stateId: filters.state_id
      });
      const scoped = {
        ...filters,
        ...(grain === 'district'
          ? { district_id: geoId }
          : { state_id: geoId, district_id: null })
      };
      const { clauses, params } = buildFilters(scoped, {
        date_col: 'health_profile_patients.created_at',
        state_col: 'health_profile_patients.state_id',
        district_col: 'health_profile_patients.district_id',
        gender_col: 'health_profile_patients.gender',
        partner_col: 'partner_id',
        module: 'health'
      });
      if (q) {
        clauses.push('(full_name ILIKE :q OR patient_id::text LIKE :q)');
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, {
        patient_id: 'health_profile_patients.patient_id',
        full_name: 'health_profile_patients.full_name',
        gender: 'health_profile_patients.gender',
        age: 'health_profile_patients.age',
        created_at: 'health_profile_patients.created_at',
        district: HEALTH_DISTRICT,
        state: HEALTH_STATE
      });
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM health_profile_patients ${HEALTH_GEO_JOIN} ${w}`, params);
      rows = await fetchall(
        `SELECT patient_id, full_name, gender, age,
                ${HEALTH_STATE} AS state, ${HEALTH_DISTRICT} AS district, created_at
         FROM health_profile_patients
         ${HEALTH_GEO_JOIN}
         ${w}
         ORDER BY created_at DESC
         LIMIT :lim OFFSET :off`,
        { ...params, lim: per_page, off: offset }
      );
      columns = [
        { key: 'patient_id',  label: 'Patient ID' },
        { key: 'full_name',   label: 'Name' },
        { key: 'gender',      label: 'Gender' },
        { key: 'age',         label: 'Age' },
        { key: 'state',       label: 'State' },
        { key: 'district',    label: 'District' },
        { key: 'created_at',  label: 'Registered' }
      ];
    }

    return NextResponse.json({
      columns,
      rows,
      total,
      page,
      per_page
    });
  } catch (err) {
    console.error('Error in health drilldown API:', err);
    return NextResponse.json({
      error: err.message || 'Internal Server Error',
      columns: [],
      rows: [],
      total: 0
    }, { status: 500 });
  }
}
