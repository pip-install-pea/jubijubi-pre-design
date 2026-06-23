import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest, buildFilters, whereStr } from '@/lib/analytics.js';
import { fetchall, scalar } from '@/lib/db.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'education') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const drillType = searchParams.get('type') || 'activity';
    const value = searchParams.get('value') || '';
    const academicYear = searchParams.get('academic_year') || '';
    const programName = searchParams.get('program_name') || '';
    const q = searchParams.get('q') || '';
    
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get('per_page') || '50', 10)));
    const offset = (page - 1) * perPage;

    const filters = getFiltersFromRequest(req);
    let columns = [];
    let rows = [];
    let total = 0;

    if (drillType === 'activity') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id',
        academic_year_col: 'academic_year'
      });
      if (value) {
        clauses.push("academic_year = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(program_name ILIKE :q OR school_name ILIKE :q OR activity_type ILIKE :q OR program_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);

      rows = await fetchall(`
        SELECT
          program_id, program_name, activity_type, school_name,
          academic_year, activity_date,
          COALESCE(student_count, 0)::integer AS student_count,
          state_id, district_id
        FROM education_program
        ${w}
        ORDER BY activity_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "program_id",    label: "Program ID" },
        { key: "program_name",  label: "Program" },
        { key: "activity_type", label: "Activity Type" },
        { key: "school_name",   label: "School" },
        { key: "academic_year", label: "Academic Year" },
        { key: "activity_date", label: "Date" },
        { key: "student_count", label: "Students" },
        { key: "district_id",   label: "District" },
      ];

    } else if (drillType === 'school') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id',
        academic_year_col: 'academic_year'
      });
      if (academicYear) {
        clauses.push("academic_year = :drill_ay");
        params.drill_ay = academicYear;
      }
      if (programName) {
        clauses.push("program_name = :drill_prog");
        params.drill_prog = programName;
      }
      if (q) {
        clauses.push("(program_name ILIKE :q OR school_name ILIKE :q OR school_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);

      rows = await fetchall(`
        SELECT
          program_id, program_name, activity_type, school_name, school_id,
          academic_year, activity_date,
          COALESCE(student_count, 0)::integer AS student_count
        FROM education_program
        ${w}
        ORDER BY activity_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "program_id",    label: "Program ID" },
        { key: "program_name",  label: "Program" },
        { key: "school_name",   label: "School" },
        { key: "school_id",     label: "School ID" },
        { key: "academic_year", label: "Academic Year" },
        { key: "activity_date", label: "Date" },
        { key: "student_count", label: "Students" },
      ];

    } else if (drillType === 'assessment') {
      const { clauses, params } = buildFilters(filters, {
        school_col: 'school_id',
        academic_year_col: 'academic_year'
      });
      if (value) {
        clauses.push("value_name = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(student_id::text LIKE :q OR value_name ILIKE :q OR assessment_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_assessment ${w}`, params);

      rows = await fetchall(`
        SELECT
          assessment_id, student_id, value_name,
          ROUND(pre_score, 2)::float  AS pre_score,
          ROUND(post_score, 2)::float AS post_score,
          assessment_date, academic_year, school_id
        FROM education_assessment
        ${w}
        ORDER BY assessment_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "assessment_id",  label: "Assessment ID" },
        { key: "student_id",     label: "Student ID" },
        { key: "value_name",     label: "Value" },
        { key: "pre_score",      label: "Pre Score" },
        { key: "post_score",     label: "Post Score" },
        { key: "assessment_date", label: "Date" },
        { key: "academic_year",  label: "Academic Year" },
      ];

    } else if (drillType === 'muskaan') {
      const { clauses, params } = buildFilters(filters, {
        school_col: 'school_id',
        academic_year_col: 'academic_year'
      });
      if (value) {
        clauses.push("skill_area = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(student_id::text LIKE :q OR skill_area ILIKE :q OR assessment_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_muskaan_assessment ${w}`, params);

      rows = await fetchall(`
        SELECT
          assessment_id, student_id, skill_area,
          pre_level, post_level, assessment_date, academic_year, school_id
        FROM education_muskaan_assessment
        ${w}
        ORDER BY assessment_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "assessment_id",  label: "Assessment ID" },
        { key: "student_id",     label: "Student ID" },
        { key: "skill_area",     label: "Skill Area" },
        { key: "pre_level",      label: "Pre Level" },
        { key: "post_level",     label: "Post Level" },
        { key: "assessment_date", label: "Date" },
        { key: "academic_year",  label: "Academic Year" },
      ];

    } else {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id',
        academic_year_col: 'academic_year'
      });
      if (q) {
        clauses.push("(program_name ILIKE :q OR school_name ILIKE :q OR activity_type ILIKE :q OR program_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);

      rows = await fetchall(`
        SELECT
          program_id, program_name, activity_type, school_name,
          academic_year, activity_date,
          COALESCE(student_count, 0)::integer AS student_count
        FROM education_program
        ${w}
        ORDER BY activity_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "program_id",    label: "Program ID" },
        { key: "program_name",  label: "Program" },
        { key: "activity_type", label: "Activity Type" },
        { key: "school_name",   label: "School" },
        { key: "academic_year", label: "Academic Year" },
        { key: "activity_date", label: "Date" },
        { key: "student_count", label: "Students" },
      ];
    }

    return NextResponse.json({
      columns,
      rows,
      total,
      page,
      per_page: perPage
    });
  } catch (err) {
    console.error('Error in education drilldown API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
