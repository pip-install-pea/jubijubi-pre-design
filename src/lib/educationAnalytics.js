import { fetchall, scalar } from './db.js';
import { buildFilters, whereStr } from './analytics.js';

export async function getActivities(filters) {
  const { clauses, params } = buildFilters(filters, {
    state_col: 'state_id',
    district_col: 'district_id',
    academic_year_col: 'academic_year'
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      COALESCE(program_name, 'Unknown')    AS program,
      COALESCE(activity_type, 'Unknown')   AS activity_type,
      COALESCE(academic_year, 'Unknown')   AS academic_year,
      COALESCE(COUNT(*), 0)::integer       AS sessions,
      COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS students
    FROM education_program
    ${w}
    GROUP BY program_name, activity_type, academic_year
    ORDER BY program_name, academic_year
  `;
  const rows = await fetchall(query, params);
  return rows.map(r => ({
    program: r.program,
    activity_type: r.activity_type,
    academic_year: r.academic_year,
    sessions: r.sessions,
    students: r.students
  }));
}

export async function getPrePostValues(filters) {
  const count = await scalar("SELECT COUNT(*)::integer FROM education_assessment");
  if (count === 0) {
    return { status: "no_data", message: "Assessment data not yet available", data: [] };
  }

  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    school_col: 'school_id'
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
  const rows = await fetchall(query, params);
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
    district_col: 'district_id'
  });
  const w = whereStr(clauses);

  const query = `
    SELECT
      COALESCE(academic_year, 'Unknown') AS yr,
      COALESCE(program_name, 'Unknown')  AS program,
      COUNT(DISTINCT school_id)::integer  AS school_count,
      COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS total_students
    FROM education_program
    ${w}
    GROUP BY academic_year, program_name
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
  const count = await scalar("SELECT COUNT(*)::integer FROM education_muskaan_assessment");
  if (count === 0) {
    return { status: "no_data", message: "Muskaan assessment data not yet available", data: [] };
  }

  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    school_col: 'school_id'
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
  const rows = await fetchall(query, params);
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
    district_col: 'district_id'
  });
  const w = whereStr(clauses);

  const query = `
    SELECT 
      SUM(CASE WHEN school_count::text ~ '^[0-9]+$' THEN school_count::integer ELSE 0 END)::integer AS total_schools,
      SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END)::integer AS total_students
    FROM education_program
    ${w}
  `;
  const rows = await fetchall(query, params);
  const stats = rows[0] || { total_schools: 0, total_students: 0 };

  const typeQuery = `
    SELECT COALESCE(school_type, program_name, 'General') AS label,
           SUM(CASE WHEN school_count::text ~ '^[0-9]+$' THEN school_count::integer ELSE 0 END)::integer AS value
    FROM education_program
    ${w}
    GROUP BY COALESCE(school_type, program_name, 'General')
  `;
  const types = await fetchall(typeQuery, params);

  const trendQuery = `
    SELECT academic_year AS label,
           SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END)::integer AS value
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

export async function getEducationQuality(filters) {
  // Quality is hardcoded as mock in python code but depends on filters.
  return {
    avg_attendance: 85,
    pass_percentage: 92,
    grade_distribution: [
      { label: "A", value: 45 },
      { label: "B", value: 30 },
      { label: "C", value: 15 },
      { label: "D", value: 10 }
    ]
  };
}
