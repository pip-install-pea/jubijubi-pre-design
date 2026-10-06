import { fetchall, scalar } from './db.js';
import { bindIn, buildFilters, splitList, whereStr, withPeerAverages, mean } from './analytics.js';
import { foldSql, displaySql, softFoldSql, mergeSimilarLabels } from './labelNorm.js';
import {
  eduGeoClauses,
  eduPlaceSql,
  eduStateSql,
  excludeWowClause,
  EDU_SCHOOL_IDS,
  EDU_CASTE_IDS,
  kkpNamesForStates
} from './eduGeo.js';
import { INITIATIVE_PROGRAMS, SCHOOL_NETWORK } from './educationInitiatives.js';

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
    state_col: null,
    district_col: null,
    academic_year_col: 'academic_year',
    ...GEO
  });
  clauses.push(excludeWowClause('program_name'));
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
    state_col: null,
    district_col: null,
    academic_year_col: 'academic_year',
    ...GEO
  });
  clauses.push(excludeWowClause('program_name'));
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
  const assessmentCount = await safeScalar("SELECT COUNT(*)::integer FROM education_assessment");
  if (assessmentCount) {
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
    if (!rows.length) {
      return { status: 'no_data', source: 'education_assessment', message: 'No assessment records for the selected filters.', data: [] };
    }
    return {
      status: 'ok',
      source: 'education_assessment',
      data: rows.map(r => ({
        value: r.value_name,
        avg_pre: parseFloat(parseFloat(r.avg_pre).toFixed(2)),
        avg_post: parseFloat(parseFloat(r.avg_post).toFixed(2)),
        count: r.count
      }))
    };
  }

  const year = filters?.academic_year || filters?.financial_year || null;
  const kkpClauses = [];
  const kkpParams = {};
  const yearClause = bindIn('financial_year', year, 'kkp_year', kkpParams);
  if (yearClause) kkpClauses.push(yearClause);
  const stateIds = splitList(filters?.state_id);
  if (stateIds.length) {
    const names = kkpNamesForStates(filters.state_id);
    if (!names.length) {
      return {
        status: 'no_data',
        source: 'skilltracking_kkp_pre_and_post',
        message: 'No education location matches this state filter.',
        data: []
      };
    }
    const locClause = bindIn('LOWER(TRIM(location_name))', names, 'loc', kkpParams);
    if (locClause) kkpClauses.push(locClause);
  }
  const kw = whereStr(kkpClauses);
  const scoreSql = `
    COALESCE(AVG(CASE WHEN pre_kkp::text ~ '^[0-9.]+$' THEN pre_kkp::numeric ELSE NULL END), 0) AS avg_pre,
    COALESCE(AVG(CASE WHEN post_kkp::text ~ '^[0-9.]+$' THEN post_kkp::numeric ELSE NULL END), 0) AS avg_post,
    COUNT(*)::integer AS count`;
  const kkpRows = await safeFetchall(
    `SELECT value_name, ${scoreSql}
     FROM skilltracking_kkp_pre_and_post
     ${kw}
     GROUP BY value_name
     ORDER BY value_name`,
    kkpParams
  );
  const kkpByLocation = await safeFetchall(
    `SELECT COALESCE(NULLIF(TRIM(location_name), ''), 'Not recorded') AS location,
            value_name, ${scoreSql}
     FROM skilltracking_kkp_pre_and_post
     ${kw}
     GROUP BY COALESCE(NULLIF(TRIM(location_name), ''), 'Not recorded'), value_name
     ORDER BY location, value_name`,
    kkpParams
  );
  if (!kkpRows.length) {
    return {
      status: 'no_data',
      source: 'skilltracking_kkp_pre_and_post',
      message: year
        ? `No KKP pre/post rows for financial year ${year}. Live rows use forms such as 2025-26.`
        : 'No KKP pre/post rows. Sync livelihood or enter rows in Admin.',
      data: []
    };
  }
  const scoreRow = (r) => ({
    value: r.value_name,
    avg_pre: parseFloat(parseFloat(r.avg_pre).toFixed(2)),
    avg_post: parseFloat(parseFloat(r.avg_post).toFixed(2)),
    count: r.count
  });
  const byLocation = [];
  for (const row of kkpByLocation) {
    let bucket = byLocation.find((item) => item.location === row.location);
    if (!bucket) {
      bucket = { location: row.location, rows: [] };
      byLocation.push(bucket);
    }
    bucket.rows.push(scoreRow(row));
  }
  return {
    status: 'ok',
    source: 'skilltracking_kkp_pre_and_post',
    data: kkpRows.map(scoreRow),
    by_location: byLocation
  };
}

export async function getSchoolsComparison(filters) {
  const { clauses, params } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    state_col: null,
    district_col: null,
    ...GEO
  });
  clauses.push(excludeWowClause('program_name'));
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
    return {
      status: "no_data",
      message: "No school-level Muskaan assessment rows. The PHP API does not expose this table; enter rows in Admin or wait for a new endpoint.",
      data: []
    };
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
    state_col: null,
    district_col: null,
    ...GEO
  });
  clauses.push(excludeWowClause('program_name'));
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

export const MIX_CANONICAL_ROW = `(
  m.id::text LIKE (m.program_id::text || '_%')
  OR NOT EXISTS (
    SELECT 1 FROM education_mixprogram n
    WHERE n.program_id = m.program_id
      AND n.id::text LIKE (n.program_id::text || '_%')
  )
)`;

function mixprogramYearFilter(filters) {
  const year = filters?.academic_year || filters?.financial_year;
  const params = {};
  const clauses = [MIX_CANONICAL_ROW];
  const yearClause = bindIn('m.year', year, 'year', params);
  if (yearClause) clauses.push(yearClause);
  clauses.push(...eduGeoClauses(filters, params));
  return { w: whereStr(clauses), params };
}

const FY_MONTH_ORDER = {
  april: 1, apr: 1,
  may: 2,
  june: 3, jun: 3,
  july: 4, jul: 4,
  august: 5, aug: 5,
  september: 6, sep: 6, sept: 6,
  october: 7, oct: 7,
  november: 8, nov: 8,
  december: 9, dec: 9,
  january: 10, jan: 10,
  february: 11, feb: 11,
  march: 12, mar: 12
};

function monthYearSortKey(month, year) {
  const start = parseInt(String(year || '').slice(0, 4), 10) || 0;
  const raw = String(month || '').trim().toLowerCase();
  const named = FY_MONTH_ORDER[raw];
  const numeric = parseInt(raw, 10);
  let fyMonth = named;
  if (fyMonth == null && numeric >= 1 && numeric <= 12) {
    fyMonth = numeric >= 4 ? numeric - 3 : numeric + 9;
  }
  return start * 100 + (fyMonth || 99);
}

function andPid(w, ids) {
  const list = ids.map((id) => `'${id}'`).join(', ');
  const extra = `m.program_id::text IN (${list})`;
  return w ? `${w} AND ${extra}` : `WHERE ${extra}`;
}

export async function getMixprogramSchools(filters) {
  const { w, params } = mixprogramYearFilter(filters);
  const schoolIds = EDU_SCHOOL_IDS;
  const schoolWhere = andPid(w, schoolIds);
  const placeSql = eduPlaceSql();

  const byProgram = await safeFetchall(
    `SELECT COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text) AS label,
            m.program_id::text AS program_id,
            COUNT(*) FILTER (WHERE NULLIF(TRIM(m.school_name), '') IS NOT NULL)::integer AS schools,
            COALESCE(SUM(m.students_total), 0)::integer AS students,
            COALESCE(SUM(m.students_male), 0)::integer AS male,
            COALESCE(SUM(m.students_female), 0)::integer AS female,
            COALESCE(SUM(m.teachers_reached), 0)::integer AS teachers
     FROM education_mixprogram m
     LEFT JOIN skilltracking_program p ON p.program_id::text = m.program_id::text
     ${schoolWhere}
     GROUP BY m.program_id, p.program_name
     ORDER BY students DESC`,
    params
  );

  const uniqueRows = await safeFetchall(
    `SELECT COUNT(*)::integer AS schools,
            COALESCE(SUM(students_total), 0)::integer AS students,
            COALESCE(SUM(students_male), 0)::integer AS male,
            COALESCE(SUM(students_female), 0)::integer AS female,
            COALESCE(SUM(teachers_reached), 0)::integer AS teachers
     FROM (
       SELECT ${placeSql} AS loc_key,
              ${foldSql('m.school_name')} AS school_key,
              MAX(m.students_total) AS students_total,
              MAX(m.students_male) AS students_male,
              MAX(m.students_female) AS students_female,
              MAX(m.teachers_reached) AS teachers_reached
       FROM education_mixprogram m
       ${schoolWhere}
         AND NULLIF(TRIM(m.school_name), '') IS NOT NULL
       GROUP BY 1, 2
     ) unique_schools`,
    params
  );
  const unique = uniqueRows[0] || {};
  const male = Number(unique.male) || 0;
  const female = Number(unique.female) || 0;
  const sexDenom = male + female;

  const byLocation = await safeFetchall(
    `SELECT loc_key AS label,
            COALESCE(SUM(students_total), 0)::integer AS value
     FROM (
       SELECT ${placeSql} AS loc_key,
              ${foldSql('m.school_name')} AS school_key,
              MAX(m.students_total) AS students_total
       FROM education_mixprogram m
       ${schoolWhere}
         AND NULLIF(TRIM(m.school_name), '') IS NOT NULL
       GROUP BY 1, 2
     ) school_max
     GROUP BY loc_key
     ORDER BY value DESC`,
    params
  );

  const casteRows = await safeFetchall(
    `SELECT COALESCE(SUM(category_gen), 0)::integer AS gen,
            COALESCE(SUM(category_sc_st), 0)::integer AS sc_st,
            COALESCE(SUM(category_obc), 0)::integer AS obc,
            COALESCE(SUM(category_ebc), 0)::integer AS ebc,
            COALESCE(SUM(category_minorities), 0)::integer AS minorities
     FROM (
       SELECT ${placeSql},
              ${foldSql('m.school_name')},
              MAX(m.category_gen) AS category_gen,
              MAX(m.category_sc_st) AS category_sc_st,
              MAX(m.category_obc) AS category_obc,
              MAX(m.category_ebc) AS category_ebc,
              MAX(m.category_minorities) AS category_minorities
       FROM education_mixprogram m
       ${andPid(w, EDU_CASTE_IDS)}
         AND NULLIF(TRIM(m.school_name), '') IS NOT NULL
       GROUP BY 1, 2
     ) caste_schools`,
    params
  );
  const caste = casteRows[0] || {};
  const casteItems = [
    { label: 'General', value: Number(caste.gen) || 0 },
    { label: 'SC/ST', value: Number(caste.sc_st) || 0 },
    { label: 'OBC', value: Number(caste.obc) || 0 },
    { label: 'EBC', value: Number(caste.ebc) || 0 },
    { label: 'Minorities', value: Number(caste.minorities) || 0 }
  ].filter((r) => r.value > 0);

  const kkpSessionRows = await safeFetchall(
    `SELECT COALESCE(SUM(m.total_sessions), 0)::integer AS total_sessions,
            COUNT(*) FILTER (WHERE NULLIF(TRIM(m.school_name), '') IS NOT NULL)::integer AS schools
     FROM education_mixprogram m
     ${andPid(w, ['4'])}`,
    params
  );

  const kkp2Themes = await safeFetchall(
    `SELECT COALESCE(${displaySql('m.theme_touched')}, 'Unknown') AS label,
            COALESCE(SUM(m.students_total), 0)::integer AS value
     FROM education_mixprogram m
     ${andPid(w, ['5'])}
     GROUP BY ${foldSql('m.theme_touched')}
     ORDER BY value DESC`,
    params
  );

  const muskaanActivities = await safeFetchall(
    `SELECT COALESCE(${displaySql('m.activity_name')}, 'Unknown') AS label,
            COALESCE(SUM(m.students_total), 0)::integer AS value
     FROM education_mixprogram m
     ${andPid(w, ['6'])}
     GROUP BY ${foldSql('m.activity_name')}
     ORDER BY value DESC`,
    params
  );

  const muskaanMonthRows = await safeFetchall(
    `SELECT COALESCE(${displaySql('m.month')}, 'Unknown') AS month,
            COALESCE(NULLIF(TRIM(m.year), ''), 'Unknown') AS year,
            COALESCE(SUM(m.students_total), 0)::integer AS value
     FROM education_mixprogram m
     ${andPid(w, ['6'])}
     GROUP BY ${softFoldSql('m.month')}, COALESCE(NULLIF(TRIM(m.year), ''), 'Unknown')`,
    params
  );
  const muskaanMonths = muskaanMonthRows
    .map((r) => ({
      month: r.month,
      year: r.year,
      label: r.year && r.year !== 'Unknown' ? `${r.month} ${r.year}` : r.month,
      value: Number(r.value) || 0
    }))
    .sort((a, b) => monthYearSortKey(a.month, a.year) - monthYearSortKey(b.month, b.year));

  const fellowshipCountRows = await safeFetchall(
    `SELECT COUNT(*)::integer AS fellows
     FROM education_mixprogram m
     ${andPid(w, ['7'])}`,
    params
  );
  const fellowshipGender = await safeFetchall(
    `SELECT COALESCE(${displaySql('m.person_gender')}, 'Unknown') AS label,
            COUNT(*)::integer AS value
     FROM education_mixprogram m
     ${andPid(w, ['7'])}
     GROUP BY ${softFoldSql('m.person_gender')}
     ORDER BY value DESC`,
    params
  );

  const activityCountRows = await safeFetchall(
    `SELECT COUNT(*)::integer AS rows
     FROM education_mixprogram m
     ${andPid(w, ['6'])}`,
    params
  );

  const initiativePresence = await safeFetchall(
    `SELECT m.program_id::text AS program_id, COUNT(*)::integer AS rows
     FROM education_mixprogram m
     ${andPid(w, INITIATIVE_PROGRAMS.map((program) => program.id))}
     GROUP BY m.program_id`,
    params
  );
  const initiativeById = new Map(initiativePresence.map((row) => [String(row.program_id), Number(row.rows) || 0]));
  const programs = INITIATIVE_PROGRAMS
    .filter((program) => (initiativeById.get(program.id) || 0) > 0)
    .map((program) => ({
      id: program.id,
      name: program.name,
      initiative: program.initiative,
      rows: initiativeById.get(program.id) || 0,
      participations: Boolean(program.participations)
    }));

  const networkPlaceRows = await safeFetchall(
    `SELECT DISTINCT ${placeSql} AS place
     FROM education_mixprogram m
     ${andPid(w, EDU_SCHOOL_IDS)}
       AND NULLIF(TRIM(m.school_name), '') IS NOT NULL`,
    params
  );
  const networkPlaceSet = new Set(networkPlaceRows.map((row) => row.place));
  const networkHits = SCHOOL_NETWORK.filter((row) => networkPlaceSet.has(row.place));
  const network = {
    locations: networkHits.length,
    states: new Set(networkHits.map((row) => row.state)).size,
    location_names: networkHits.map((row) => row.place),
    state_names: [...new Set(networkHits.map((row) => row.state))]
  };

  const locProg = await safeFetchall(
    `SELECT ${placeSql} AS location,
            COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text) AS program,
            COALESCE(SUM(m.students_total), 0)::integer AS students
     FROM education_mixprogram m
     LEFT JOIN skilltracking_program p ON p.program_id::text = m.program_id::text
     ${schoolWhere}
       AND NULLIF(TRIM(m.school_name), '') IS NOT NULL
     GROUP BY 1, 2
     ORDER BY students DESC`,
    params
  );

  const xLabels = [...new Set(locProg.map((r) => r.program))];
  const yLabels = [...new Set(locProg.map((r) => r.location))].slice(0, 16);
  const cellMap = new Map(locProg.map((r) => [`${r.program}\t${r.location}`, Number(r.students) || 0]));
  const heatmapCells = [];
  xLabels.forEach((x, xi) => {
    yLabels.forEach((y, yi) => {
      heatmapCells.push([xi, yi, cellMap.get(`${x}\t${y}`) || 0]);
    });
  });
  const sunburst = [];
  const byLoc = {};
  locProg.forEach((r) => {
    if (!byLoc[r.location]) byLoc[r.location] = [];
    byLoc[r.location].push({ name: r.program, value: Number(r.students) || 0 });
  });
  Object.entries(byLoc).forEach(([name, children]) => {
    sunburst.push({ name, value: children.reduce((s, c) => s + c.value, 0), children });
  });

  const schoolKpis = {
    schools: Number(unique.schools) || 0,
    students: Number(unique.students) || 0,
    teachers: Number(unique.teachers) || 0,
    girls_pct: sexDenom > 0 ? Number(((female / sexDenom) * 100).toFixed(1)) : null
  };

  const hasAny =
    schoolKpis.schools > 0 ||
    byProgram.length > 0 ||
    (Number(kkpSessionRows[0]?.total_sessions) || 0) > 0 ||
    kkp2Themes.length > 0 ||
    muskaanActivities.length > 0 ||
    (Number(fellowshipCountRows[0]?.fellows) || 0) > 0;

  if (!hasAny) {
    return { status: 'no_data' };
  }

  return {
    status: 'ok',
    school: {
      kpis: schoolKpis,
      by_program: byProgram,
      by_location: mergeSimilarLabels(byLocation),
      caste: casteItems,
      heatmap: { x: xLabels, y: yLabels, cells: heatmapCells },
      program_locations: Object.entries(
        locProg.reduce((acc, r) => {
          const program = r.program || 'Unknown';
          if (!acc[program]) acc[program] = [];
          const students = Number(r.students) || 0;
          if (students > 0) acc[program].push({ label: r.location, value: students });
          return acc;
        }, {})
      ).map(([program, rows]) => ({
        program,
        rows: rows.sort((a, b) => b.value - a.value).slice(0, 8)
      })),
      sunburst
    },
    kkp: {
      total_sessions: Number(kkpSessionRows[0]?.total_sessions) || 0,
      schools: Number(kkpSessionRows[0]?.schools) || 0
    },
    kkp2: { themes: kkp2Themes },
    muskaan_activity: {
      activities: muskaanActivities,
      months: muskaanMonths,
      rows: Number(activityCountRows[0]?.rows) || 0
    },
    programs,
    network,
    fellowship: {
      fellows: Number(fellowshipCountRows[0]?.fellows) || 0,
      gender: fellowshipGender
    }
  };
}

export async function getEducationQuality() {
  return {
    status: 'no_data',
    message: 'Attendance and grade distribution are not available yet.'
  };
}

export async function getEducationGeoBenchmarks(filters) {
  const grain = filters?.state_id ? 'district' : 'state';
  const empty = { grain, unit: 'students', rows: [], state_average: 0, programme_average: 0, programme_n: 0, state_n: 0 };
  const scoped = grain === 'district'
    ? { ...filters, district_id: null }
    : { ...filters, state_id: null, district_id: null };
  const labelSql = grain === 'district' ? eduPlaceSql() : eduStateSql();

  try {
    const { w, params } = mixprogramYearFilter(scoped);
    const rows = await safeFetchall(
      `SELECT label, label AS id, COALESCE(SUM(students_total), 0)::integer AS value
       FROM (
         SELECT ${labelSql} AS label,
                ${foldSql('m.school_name')} AS school_key,
                MAX(m.students_total) AS students_total
         FROM education_mixprogram m
         ${andPid(w, EDU_SCHOOL_IDS)}
           AND NULLIF(TRIM(m.school_name), '') IS NOT NULL
         GROUP BY 1, 2
       ) schools
       GROUP BY label
       ORDER BY value DESC`,
      params
    );
    const programmeAverage = mean(rows.map((row) => row.value));
    return {
      grain,
      unit: 'students',
      rows: withPeerAverages(rows, 0, programmeAverage),
      state_average: 0,
      programme_average: Number(programmeAverage.toFixed(1)),
      programme_n: rows.length,
      state_n: 0
    };
  } catch (err) {
    console.warn('[educationAnalytics] geo benchmarks skipped:', err.message);
    return empty;
  }
}

export async function getSchoolQuadrant(filters) {
  const { clauses: pClauses, params: pParams } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    state_col: null,
    district_col: null,
    ...GEO
  });
  pClauses.push(excludeWowClause('program_name'));
  const { clauses: aClauses, params: aParams } = buildFilters(filters, {
    academic_year_col: 'academic_year',
    school_col: 'school_id',
    state_col: null,
    district_col: null,
    ...GEO
  });
  const pw = whereStr(pClauses);
  const aw = whereStr(aClauses);

  const reachRows = await safeFetchall(
    `SELECT
       program_id AS key,
       COALESCE(NULLIF(TRIM(program_name), ''), program_id, 'Unknown') AS label,
       COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0)::integer AS students
     FROM education_program
     ${pw}
     GROUP BY program_id, COALESCE(NULLIF(TRIM(program_name), ''), program_id, 'Unknown')
     HAVING COALESCE(SUM(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END), 0) > 0`,
    pParams
  );

  const gainRows = await safeFetchall(
    `SELECT
       COALESCE(NULLIF(TRIM(school_id), ''), program_id) AS key,
       COALESCE(
         AVG(CASE WHEN post_score::text ~ '^[0-9.]+$' THEN post_score::numeric ELSE NULL END)
         - AVG(CASE WHEN pre_score::text ~ '^[0-9.]+$' THEN pre_score::numeric ELSE NULL END),
         0
       ) AS gain,
       COUNT(*)::integer AS assessments
     FROM education_assessment
     ${aw}
     GROUP BY COALESCE(NULLIF(TRIM(school_id), ''), program_id)`,
    aParams
  );

  if (!reachRows.length || !gainRows.length) {
    return {
      status: 'no_data',
      message: 'Need both enrolment and school-level assessment scores. KKP pre/post is location-level and cannot place schools on this quadrant.',
      points: [],
      median_students: 0,
      median_gain: 0
    };
  }

  const gainMap = new Map(gainRows.map((r) => [String(r.key), r]));
  const points = reachRows
    .map((r) => {
      const g = gainMap.get(String(r.key));
      if (!g) return null;
      return {
        key: String(r.key),
        label: r.label,
        x: Number(r.students) || 0,
        y: Number(g.gain) || 0,
        assessments: g.assessments
      };
    })
    .filter(Boolean);

  if (!points.length) {
    return {
      status: 'no_data',
      message: 'Enrolment and assessment rows did not share a school or programme key.',
      points: [],
      median_students: 0,
      median_gain: 0
    };
  }

  const xs = [...points.map((p) => p.x)].sort((a, b) => a - b);
  const ys = [...points.map((p) => p.y)].sort((a, b) => a - b);
  const mid = (arr) => {
    const m = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
  };
  const medianStudents = mid(xs);
  const medianGain = mid(ys);

  return {
    status: 'ok',
    points: points.map((p) => ({
      ...p,
      quadrant: p.x >= medianStudents && p.y >= medianGain
        ? 'High reach, high gain'
        : p.x >= medianStudents && p.y < medianGain
          ? 'High reach, low gain'
          : p.x < medianStudents && p.y >= medianGain
            ? 'Low reach, high gain'
            : 'Low reach, low gain'
    })),
    median_students: Number(medianStudents.toFixed(1)),
    median_gain: Number(medianGain.toFixed(2))
  };
}
