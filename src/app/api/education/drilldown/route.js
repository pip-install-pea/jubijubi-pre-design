import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest, bindIn, buildFilters, whereStr } from '@/lib/analytics.js';
import { fetchall, scalar } from '@/lib/db.js';
import { queryMixRows } from '@/lib/mixDrilldown.js';
import { getMixprogramSchools } from '@/lib/educationAnalytics.js';
import { eqFold, eqSoft } from '@/lib/labelNorm.js';
import { eduPlaceSql, excludeWowClause, EDU_SCHOOL_IDS, EDU_CASTE_IDS } from '@/lib/eduGeo.js';
import { addColFilters } from '@/lib/drilldownFilters.js';
import { SKILL_EDU_GEO_JOIN, EDU_DISTRICT, EDU_STATE, resolveGeoId } from '@/lib/geoLookups.js';

const F_EDU_PROGRAM = {
  program_id: 'program_id',
  program_name: 'program_name',
  school_name: 'school_name',
  school_id: 'school_id',
  activity_type: 'activity_type',
  academic_year: 'academic_year',
  state: EDU_STATE,
  district: EDU_DISTRICT
};
const F_ASSESS = {
  assessment_id: 'assessment_id',
  student_id: 'student_id',
  value_name: 'value_name',
  skill_area: 'skill_area',
  academic_year: 'academic_year',
  school_id: 'school_id'
};
const F_KKP = {
  location_name: 'location_name',
  value_name: 'value_name',
  financial_year: 'financial_year',
  pre_kkp: 'pre_kkp',
  post_kkp: 'post_kkp'
};

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
        state_col: null,
        district_col: null,
        academic_year_col: 'education_program.academic_year'
      });
      clauses.push(excludeWowClause('program_name'));
      if (value) {
        clauses.push("academic_year = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(program_name ILIKE :q OR school_name ILIKE :q OR activity_type ILIKE :q OR program_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_EDU_PROGRAM);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);

      rows = await fetchall(`
        SELECT
          program_id, program_name, activity_type, school_name,
          academic_year, activity_date,
          COALESCE(student_count, 0)::integer AS student_count,
          ${EDU_STATE} AS state, ${EDU_DISTRICT} AS district
        FROM education_program
        ${SKILL_EDU_GEO_JOIN}
        ${w}
        ORDER BY activity_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "program_name",  label: "Program" },
        { key: "activity_type", label: "Activity Type" },
        { key: "school_name",   label: "School" },
        { key: "academic_year", label: "Academic Year" },
        { key: "activity_date", label: "Date" },
        { key: "student_count", label: "Students" },
        { key: "state",         label: "State" },
        { key: "district",      label: "District" },
      ];

    } else if (drillType === 'school') {
      const { clauses, params } = buildFilters(filters, {
        state_col: null,
        district_col: null,
        academic_year_col: 'education_program.academic_year'
      });
      clauses.push(excludeWowClause('program_name'));
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
      addColFilters(searchParams, clauses, params, F_EDU_PROGRAM);
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
      addColFilters(searchParams, clauses, params, F_ASSESS);
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

    } else if (drillType === 'kkp') {
      const clauses = [];
      const params = {};
      const year = filters.academic_year || filters.financial_year;
      const yearClause = bindIn('financial_year', year, 'kkp_year', params);
      if (yearClause) clauses.push(yearClause);
      if (value) {
        clauses.push('value_name = :drill_value');
        params.drill_value = value;
      }
      const kkpLocation = searchParams.get('location_name') || '';
      if (kkpLocation) {
        clauses.push('LOWER(TRIM(location_name)) = LOWER(TRIM(:kkp_location))');
        params.kkp_location = kkpLocation;
      }
      try {
        if (filters.state_id) {
          const stateParams = {};
          const stateClause = bindIn('state_id::text', filters.state_id, 'sid', stateParams);
          const states = await fetchall(
            `SELECT state_name FROM skilltracking_state WHERE ${stateClause}`,
            stateParams
          );
          const names = states.map((row) => String(row.state_name || '').trim().toLowerCase()).filter(Boolean);
          const locClause = bindIn('LOWER(TRIM(location_name))', names, 'loc', params);
          if (locClause) clauses.push(locClause);
          else clauses.push('FALSE');
        }
        if (q) {
          clauses.push('(location_name ILIKE :q OR value_name ILIKE :q)');
          params.q = `%${q}%`;
        }
        addColFilters(searchParams, clauses, params, F_KKP);
        const w = whereStr(clauses);
        total = await scalar(`SELECT COUNT(*)::integer FROM skilltracking_kkp_pre_and_post ${w}`, params);
        rows = await fetchall(`
          SELECT id, financial_year, location_name, value_name, pre_kkp, post_kkp
          FROM skilltracking_kkp_pre_and_post
          ${w}
          ORDER BY location_name, value_name
          LIMIT :lim OFFSET :off
        `, { ...params, lim: perPage, off: offset });
      } catch (err) {
        console.warn('[education drilldown kkp]', err.message);
        total = 0;
        rows = [];
      }
      columns = [
        { key: 'location_name', label: 'Location' },
        { key: 'value_name', label: 'Value' },
        { key: 'pre_kkp', label: 'Pre' },
        { key: 'post_kkp', label: 'Post' },
        { key: 'financial_year', label: 'Financial year' }
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
      addColFilters(searchParams, clauses, params, F_ASSESS);
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

    } else if (drillType === 'geo') {
      const grain = searchParams.get('grain') || 'state';
      const geoId = await resolveGeoId({
        module: 'education',
        grain,
        geoId: searchParams.get('geo_id') || value,
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
        state_col: null,
        district_col: null,
        academic_year_col: 'education_program.academic_year',
        module: 'education'
      });
      clauses.push(excludeWowClause('program_name'));
      if (q) {
        clauses.push('(program_name ILIKE :q OR school_name ILIKE :q OR program_id::text LIKE :q)');
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_EDU_PROGRAM);
      const w = whereStr(clauses);
      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);
      rows = await fetchall(`
        SELECT
          program_id, program_name, school_name, academic_year,
          COALESCE(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END, 0)::integer AS student_count,
          ${EDU_STATE} AS state, ${EDU_DISTRICT} AS district
        FROM education_program
        ${SKILL_EDU_GEO_JOIN}
        ${w}
        ORDER BY academic_year DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });
      columns = [
        { key: 'program_name', label: 'Program' },
        { key: 'school_name', label: 'School' },
        { key: 'academic_year', label: 'Academic Year' },
        { key: 'student_count', label: 'Students' },
        { key: 'state', label: 'State' },
        { key: 'district', label: 'District' }
      ];

    } else if (drillType === 'quadrant') {
      const { clauses, params } = buildFilters(filters, {
        state_col: null,
        district_col: null,
        academic_year_col: 'education_program.academic_year',
        module: 'education'
      });
      clauses.push(excludeWowClause('program_name'));
      if (value) {
        clauses.push('(school_id = :drill_value OR school_name = :drill_value OR program_id = :drill_value OR program_name = :drill_value)');
        params.drill_value = value;
      }
      if (q) {
        clauses.push('(program_name ILIKE :q OR school_name ILIKE :q OR program_id::text LIKE :q)');
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_EDU_PROGRAM);
      const w = whereStr(clauses);
      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);
      rows = await fetchall(`
        SELECT
          program_id, program_name, school_name, school_id, academic_year,
          COALESCE(CASE WHEN student_count::text ~ '^[0-9]+$' THEN student_count::integer ELSE 0 END, 0)::integer AS student_count
        FROM education_program
        ${w}
        ORDER BY academic_year DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });
      columns = [
        { key: 'program_name', label: 'Program' },
        { key: 'school_name', label: 'School' },
        { key: 'academic_year', label: 'Academic Year' },
        { key: 'student_count', label: 'Students' }
      ];

    } else if (!String(drillType).startsWith('mix_')) {
      const { clauses, params } = buildFilters(filters, {
        state_col: null,
        district_col: null,
        academic_year_col: 'education_program.academic_year'
      });
      clauses.push(excludeWowClause('program_name'));
      if (q) {
        clauses.push("(program_name ILIKE :q OR school_name ILIKE :q OR activity_type ILIKE :q OR program_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_EDU_PROGRAM);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM education_program ${w}`, params);

      rows = await fetchall(`
        SELECT
          program_id, program_name, activity_type, school_name,
          academic_year, activity_date,
          COALESCE(student_count, 0)::integer AS student_count,
          ${EDU_STATE} AS state, ${EDU_DISTRICT} AS district
        FROM education_program
        ${SKILL_EDU_GEO_JOIN}
        ${w}
        ORDER BY activity_date DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "program_name",  label: "Program" },
        { key: "activity_type", label: "Activity Type" },
        { key: "school_name",   label: "School" },
        { key: "academic_year", label: "Academic Year" },
        { key: "state",         label: "State" },
        { key: "district",      label: "District" },
        { key: "activity_date", label: "Date" },
        { key: "student_count", label: "Students" },
      ];
    }

    if (drillType === 'mix_activities') {
      const year = filters.academic_year || filters.financial_year;
      const payload = await queryMixRows({
        searchParams,
        year,
        q,
        page,
        perPage,
        filters,
        extraClauses: [`m.program_id::text = '6'`],
        qSql: '(m.activity_name ILIKE :q OR m.month ILIKE :q)',
        selectSql: `SELECT COALESCE(NULLIF(TRIM(m.activity_name), ''), '—') AS activity_name,
          COALESCE(NULLIF(TRIM(m.month), ''), '—') AS month,
          COALESCE(m.students_total, 0)::integer AS students_total`,
        columns: [
          { key: 'activity_name', label: 'Activity' },
          { key: 'month', label: 'Month' },
          { key: 'students_total', label: 'Students' }
        ]
      });
      return NextResponse.json(payload);
    }

    if (drillType === 'mix_programs') {
      const mix = await getMixprogramSchools(filters);
      const rows = mix?.programs || [];
      return NextResponse.json({
        columns: [
          { key: 'name', label: 'Program' },
          { key: 'initiative', label: 'Initiative' },
          { key: 'rows', label: 'Rows' }
        ],
        rows,
        total: rows.length,
        page: 1,
        per_page: Math.max(rows.length, 1)
      });
    }

    if (String(drillType).startsWith('mix_')) {
      const year = filters.academic_year || filters.financial_year;
      const location = searchParams.get('location') || '';
      const mixCommon = { year, q, page, perPage, filters };
      const schoolJoin = 'LEFT JOIN skilltracking_program p ON p.program_id::text = m.program_id::text';
      const schoolCols = [
        { key: 'school_name', label: 'School' },
        { key: 'location', label: 'Location' },
        { key: 'program', label: 'Programme' },
        { key: 'year', label: 'Year' },
        { key: 'students_total', label: 'Students' }
      ];
      const schoolSelect = `SELECT
        COALESCE(NULLIF(TRIM(m.school_name), ''), '—') AS school_name,
        ${eduPlaceSql()} AS location,
        COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text) AS program,
        m.year,
        COALESCE(m.students_total, 0)::integer AS students_total`;

      if (drillType === 'mix_program') {
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          joinSql: schoolJoin,
          extraClauses: [
            `m.program_id::text IN (${EDU_SCHOOL_IDS.map((id) => `'${id}'`).join(', ')})`,
            eqSoft(`COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text)`, 'drill_value')
          ],
          extraParams: { drill_value: value },
          qSql: '(m.school_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: schoolSelect,
          columns: schoolCols
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_location') {
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          joinSql: schoolJoin,
          extraClauses: [
            `m.program_id::text IN (${EDU_SCHOOL_IDS.map((id) => `'${id}'`).join(', ')})`,
            `(${eduPlaceSql()} = :drill_value)`
          ],
          extraParams: { drill_value: value },
          qSql: '(m.school_name ILIKE :q OR p.program_name ILIKE :q)',
          selectSql: schoolSelect,
          columns: schoolCols
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_heat') {
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          joinSql: schoolJoin,
          extraClauses: [
            `m.program_id::text IN (${EDU_SCHOOL_IDS.map((id) => `'${id}'`).join(', ')})`,
            eqSoft(`COALESCE(NULLIF(TRIM(p.program_name), ''), m.program_id::text)`, 'drill_value'),
            location ? `(${eduPlaceSql()} = :location)` : 'TRUE'
          ],
          extraParams: { drill_value: value, location },
          qSql: '(m.school_name ILIKE :q)',
          selectSql: schoolSelect,
          columns: schoolCols
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_caste') {
        const casteCol = {
          General: 'category_gen',
          'SC/ST': 'category_sc_st',
          OBC: 'category_obc',
          EBC: 'category_ebc',
          Minorities: 'category_minorities'
        }[value];
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          joinSql: schoolJoin,
          extraClauses: [
            `m.program_id::text IN (${EDU_CASTE_IDS.map((id) => `'${id}'`).join(', ')})`,
            casteCol ? `COALESCE(m.${casteCol}, 0) > 0` : 'TRUE'
          ],
          qSql: '(m.school_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: schoolSelect,
          columns: schoolCols
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_theme') {
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          extraClauses: [`m.program_id::text = '5'`, eqFold('m.theme_touched', 'drill_value')],
          extraParams: { drill_value: value },
          qSql: '(m.school_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.school_name), ''), '—') AS school_name,
            ${eduPlaceSql()} AS location,
            m.theme_touched, m.year, COALESCE(m.students_total, 0)::integer AS students_total`,
          columns: [
            { key: 'school_name', label: 'School' },
            { key: 'location', label: 'Location' },
            { key: 'theme_touched', label: 'Theme' },
            { key: 'year', label: 'Year' },
            { key: 'students_total', label: 'Headcount' }
          ]
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_activity' || drillType === 'mix_month') {
        const field = drillType === 'mix_activity' ? 'activity_name' : 'month';
        const monthYear = String(value || '').trim().match(/^(.*)\s+(\d{4}(?:-\d{2})?)$/);
        const monthValue = searchParams.get('month') || (monthYear ? monthYear[1].trim() : value);
        const yearValue = searchParams.get('year') || monthYear?.[2] || year;
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          year: field === 'month' ? yearValue : year,
          extraClauses: [
            `m.program_id::text = '6'`,
            field === 'month'
              ? eqSoft('m.month', 'drill_value')
              : eqFold(`m.${field}`, 'drill_value')
          ],
          extraParams: { drill_value: field === 'month' ? monthValue : value },
          qSql: '(m.activity_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.activity_name), ''), '—') AS activity_name,
            COALESCE(NULLIF(TRIM(m.month), ''), '—') AS month,
            ${eduPlaceSql()} AS location,
            m.year, COALESCE(m.students_total, 0)::integer AS students_total`,
          columns: [
            { key: 'activity_name', label: 'Activity' },
            { key: 'month', label: 'Month' },
            { key: 'location', label: 'Location' },
            { key: 'year', label: 'Year' },
            { key: 'students_total', label: 'Headcount' }
          ]
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_fellow') {
        const payload = await queryMixRows({
          searchParams,
          ...mixCommon,
          extraClauses: [
            `m.program_id::text = '7'`,
            value ? eqSoft('m.person_gender', 'drill_value') : 'TRUE'
          ],
          extraParams: { drill_value: value },
          qSql: '(m.location ILIKE :q)',
          selectSql: `SELECT ${eduPlaceSql()} AS location,
            COALESCE(NULLIF(TRIM(m.person_gender), ''), '—') AS gender,
            m.year, m.person_age`,
          columns: [
            { key: 'location', label: 'Location' },
            { key: 'gender', label: 'Gender' },
            { key: 'year', label: 'Year' },
            { key: 'person_age', label: 'Age' }
          ]
        });
        return NextResponse.json(payload);
      }
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
