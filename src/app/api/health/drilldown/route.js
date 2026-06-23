import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { fetchall, scalar } from '@/lib/db.js';
import { getFiltersFromRequest, buildFilters, whereStr } from '@/lib/analytics.js';

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
    const drill_type = url.searchParams.get('type') || 'patients';
    const value = url.searchParams.get('value') || '';
    const q = url.searchParams.get('q') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const per_page = Math.min(200, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10)));
    const offset = (page - 1) * per_page;

    const filters = getFiltersFromRequest(req);

    let columns = [];
    let rows = [];
    let total = 0;

    if (drill_type === 'disease') {
      const { clauses, params } = buildFilters(filters, {
        date_col: 'a.created_at',
        partner_col: 'a.partner_id',
        state_col: 'a.state_id',
        district_col: 'a.district_id'
      });
      if (value) {
        clauses.push('a.disease LIKE :drill_value');
        params.drill_value = `%${value}%`;
      }
      if (q) {
        clauses.push("(p.full_name ILIKE :q OR a.disease ILIKE :q OR a.appointment_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
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
           COALESCE(p.full_name, '—')   AS full_name,
           COALESCE(p.gender, '—')      AS gender,
           COALESCE(p.age, '—')         AS age,
           a.disease,
           a.created_at                 AS visit_date,
           COALESCE(a.doctor_remarks, '—') AS doctor_remarks
         FROM health_patient_appointments a
         LEFT JOIN health_profile_patients p ON a.profile_patient_id = p.patient_id
         ${w}
         ORDER BY a.created_at DESC
         LIMIT :lim OFFSET :off`,
        { ...params, lim: per_page, off: offset }
      );

      columns = [
        { key: 'appointment_id', label: 'Appt ID' },
        { key: 'full_name',      label: 'Patient' },
        { key: 'gender',         label: 'Gender' },
        { key: 'age',            label: 'Age' },
        { key: 'disease',        label: 'Disease' },
        { key: 'visit_date',     label: 'Visit Date' },
        { key: 'doctor_remarks', label: 'Remarks' }
      ];

    } else if (drill_type === 'symptom') {
      const { clauses, params } = buildFilters(filters, {
        date_col: 'a.created_at',
        partner_col: 'a.partner_id',
        state_col: 'a.state_id',
        district_col: 'a.district_id'
      });
      if (value) {
        clauses.push('a.symtom LIKE :drill_value');
        params.drill_value = `%${value}%`;
      }
      if (q) {
        clauses.push("(p.full_name ILIKE :q OR a.symtom ILIKE :q OR a.appointment_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
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
           COALESCE(p.full_name, '—')   AS full_name,
           COALESCE(p.gender, '—')      AS gender,
           COALESCE(p.age, '—')         AS age,
           a.symtom                     AS symptom,
           a.created_at                 AS visit_date,
           COALESCE(a.doctor_remarks, '—') AS doctor_remarks
         FROM health_patient_appointments a
         LEFT JOIN health_profile_patients p ON a.profile_patient_id = p.patient_id
         ${w}
         ORDER BY a.created_at DESC
         LIMIT :lim OFFSET :off`,
        { ...params, lim: per_page, off: offset }
      );

      columns = [
        { key: 'appointment_id', label: 'Appt ID' },
        { key: 'full_name',      label: 'Patient' },
        { key: 'gender',         label: 'Gender' },
        { key: 'age',            label: 'Age' },
        { key: 'symptom',        label: 'Symptom' },
        { key: 'visit_date',     label: 'Visit Date' },
        { key: 'doctor_remarks', label: 'Remarks' }
      ];

    } else if (drill_type === 'community') {
      const { clauses, params } = buildFilters(filters, {
        date_col: 'created_at',
        partner_col: 'partner_id'
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
      const w = whereStr(clauses);

      total = await scalar(
        `SELECT COUNT(*)::integer FROM health_profile_patients ${w}`,
        params
      );

      rows = await fetchall(
        `SELECT
           patient_id, full_name, gender, age,
           caste_id AS community, state_id, district_id, created_at
         FROM health_profile_patients
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
        { key: 'district_id', label: 'District' },
        { key: 'created_at',  label: 'Registered' }
      ];

    } else {
      // Default: patients
      const { clauses, params } = buildFilters(filters, {
        date_col: 'created_at',
        partner_col: 'partner_id',
        gender_col: 'gender'
      });
      if (q) {
        clauses.push("(full_name ILIKE :q OR patient_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(
        `SELECT COUNT(*)::integer FROM health_profile_patients ${w}`,
        params
      );

      rows = await fetchall(
        `SELECT
           patient_id, full_name, gender, age,
           state_id, district_id, village_id, created_at
         FROM health_profile_patients
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
        { key: 'district_id', label: 'District' },
        { key: 'village_id',  label: 'Village' },
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
