import { fetchall, scalar } from './db.js';
import { buildFilters, whereStr } from './analytics.js';

const GEO = { module: 'education' };

async function safeScalar(query, params) {
  try {
    return await scalar(query, params);
  } catch (err) {
    console.warn('[educationAnalytics] scalar skipped:', err.message);
    return 0;
  }
}

async function safeFetchall(query, params) {
  try {
    return await fetchall(query, params);
  } catch (err) {
    console.warn('[educationAnalytics] query skipped:', err.message);
    return [];
  }
}

export async function getActivities(filters) {
  const { clauses, params } = buildFilters(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    academic_year_col: 'academic_year',
    ...GEO
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown') AS program,
      COALESCE(academic_year, 'Unknown')                  AS academic_year,
      COUNT(*)::integer                                   AS program_rows,
      COALESCE(SUM(CASE WHEN activity_count::text ~ '^[0-9]+$' THEN activity_count::integer ELSE 0 END), 0)::integer AS activities,
      COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS students,
      COALESCE(SUM(CASE WHEN school_count::text ~ '^[0-9]+$' THEN school_count::integer ELSE 0 END), 0)::integer AS schools
    FROM education_program
    ${w}
    GROUP BY COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown'), academic_year
    ORDER BY students DESC, program
  `;
  const rows = await fetchall(query, params);
  return rows.map(r => ({
    program: r.program,
    academic_year: r.academic_year,
    program_rows: r.program_rows,
    activities: r.activities,
    students: r.students,
    schools: r.schools
  }));
}

export async function getStudentsByProgram(filters) {
  const { clauses, params } = buildFilters(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    academic_year_col: 'academic_year',
    ...GEO
  });
  const w = whereStr(clauses);
  const rows = await fetchall(
    `SELECT
       COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown') AS program,
       COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS students
     FROM education_program
     ${w}
     GROUP BY COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown')
     ORDER BY students DESC`,
    params
  );
  return rows.map(r => ({ program: r.program, students: r.students }));
}

export async function getPrePostValues(filters) {
  const count = await safeScalar("SELECT COUNT(*)::integer FROM education_assessment");
  if (!count) {
    return { status: "no_data", message: "Assessment tables are not in the live extract. Empty until a live call returns rows.", data: [] };
  }

  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    school_col: 'school_id',
    ...GEO
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      value_name,
      COALESCE(AVG(pre_score), 0)  AS avg_pre,
      COALESCE(AVG(post_score), 0) AS avg_post,
      COUNT(*)::integer            AS count
    FROM education_assessment
    ${w}
    GROUP BY value_name
    ORDER BY value_name
  `;
  const rows = await safeFetchall(query, params);
  return {
    status: "ok",
    data: rows.map(r => ({
      value: r.value_name,
      avg_pre: parseFloat(parseFloat(r.avg_pre).toFixed(2)),
      avg_post: parseFloat(parseFloat(r.avg_post).toFixed(2)),
      count: r.count
    }))
  };
}

export async function getSchoolsComparison(filters) {
  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    state_col: 'state_id',
    district_col: 'district_id',
    ...GEO
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      COALESCE(academic_year, 'Unknown') AS yr,
      COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown') AS program,
      COALESCE(SUM(CASE WHEN school_count::text ~ '^[0-9]+$' THEN school_count::integer ELSE 0 END), 0)::integer AS school_count,
      COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS total_students
    FROM education_program
    ${w}
    GROUP BY academic_year, COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown')
    ORDER BY yr, program
  `;
  const rows = await fetchall(query, params);
  return rows.map(r => ({
    academic_year: r.yr,
    program: r.program,
    school_count: r.school_count,
    total_students: r.total_students
  }));
}

export async function getMuskaanPerformance(filters) {
  const count = await safeScalar("SELECT COUNT(*)::integer FROM education_muskaan_assessment");
  if (!count) {
    return { status: "no_data", message: "Muskaan assessment is not in the live extract. Empty until a live call returns rows.", data: [] };
  }

  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    school_col: 'school_id',
    ...GEO
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      skill_area,
      pre_level,
      post_level,
      COUNT(*)::integer AS count
    FROM education_muskaan_assessment
    ${w}
    GROUP BY skill_area, pre_level, post_level
    ORDER BY skill_area
  `;
  const rows = await safeFetchall(query, params);
  return {
    status: "ok",
    data: rows.map(r => ({
      skill_area: r.skill_area,
      pre_level: r.pre_level,
      post_level: r.post_level,
      count: r.count
    }))
  };
}

export async function getEducationReach(filters) {
  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    state_col: 'state_id',
    district_col: 'district_id',
    ...GEO
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN school_count::text ~ '^[0-9]+$' THEN school_count::integer ELSE 0 END), 0)::integer AS total_schools,
      COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS total_students
    FROM education_program
    ${w}
  `;
  const rows = await fetchall(query, params);
  const stats = rows[0] || { total_schools: 0, total_students: 0 };

  const typeQuery = `
    SELECT COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown') AS label,
           COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS value
    FROM education_program
    ${w}
    GROUP BY COALESCE(NULLIF(TRIM(program_name), ''), 'Unknown')
    ORDER BY value DESC
  `;
  const types = await fetchall(typeQuery, params);

  const trendQuery = `
    SELECT academic_year AS label,
           COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS value
    FROM education_program
    ${w}
    GROUP BY academic_year
    ORDER BY academic_year
  `;
  const trend = await fetchall(trendQuery, params);

  return {
    total_schools: stats.total_schools || 0,
    total_students: stats.total_students || 0,
    school_type_distribution: types.map(r => ({ label: r.label, value: r.value })),
    enrollment_trend: trend.map(r => ({ label: r.label, value: r.value }))
  };
}

export async function getMixprogramSchools(filters) {
  const year = filters?.academic_year || filters?.financial_year;
  const params = {};
  const clauses = [];
  if (year) {
    clauses.push('year = :year');
    params.year = year;
  }
  const w = whereStr(clauses);
  const rows = await safeFetchall(
    `SELECT school_name, location, year,
            COALESCE(students_total, 0)::integer AS students_total,
            COALESCE(students_male, 0)::integer AS students_male,
            COALESCE(students_female, 0)::integer AS students_female
     FROM education_mixprogram
     ${w}
     ORDER BY students_total DESC
     LIMIT 20`,
    params
  );
  if (!rows.length) {
    return { status: 'no_data', data: [] };
  }
  return { status: 'ok', data: rows };
}

export async function getEducationQuality() {
  return {
    status: 'no_data',
    message: 'Attendance, pass percentage and grade distribution are not in the live schema.'
  };
}
