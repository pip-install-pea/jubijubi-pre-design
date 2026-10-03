import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest, buildFilters, whereStr } from '@/lib/analytics.js';
import { fetchall, scalar } from '@/lib/db.js';
import { placementWindowCte, mixWorkingSql, placementStatusSql, genderBucketSql, phaseLabelSql, validIncomeSql, incomeDeltaSql } from '@/lib/livelihoodAnalytics.js';
import { queryMixRows } from '@/lib/mixDrilldown.js';
import { eqFold, eqSoft } from '@/lib/labelNorm.js';
import { addColFilters } from '@/lib/drilldownFilters.js';
import {
  SKILL_PERSON_GEO_JOIN,
  SKILL_BARE_GEO_JOIN,
  SKILL_DISTRICT,
  SKILL_STATE,
  SKILL_DISTRICT_BARE,
  SKILL_STATE_BARE,
  resolveGeoId
} from '@/lib/geoLookups.js';

const F_PERSON_SP = {
  person_id: 'sp.person_id',
  person_name: 'sp.person_name',
  gender: 'sp.gender',
  mobile_number: 'sp.mobile_number',
  trade: 'COALESCE(ts.stream_name, sp.training_stream_id)',
  district: SKILL_DISTRICT,
  state: SKILL_STATE,
  date_of_completion_of_training: 'sp.date_of_completion_of_training',
  created_at: 'sp.created_at'
};
const F_MONITOR = {
  ...F_PERSON_SP,
  work_status: 'sm.work_status',
  current_work: 'sm.current_work',
  date_of_monitor: 'sm.date_of_monitor',
  monthly_income: 'sm.monthly_income',
  trade: 'sp.training_stream_id'
};
const F_PERSON = {
  person_id: 'person_id',
  person_name: 'person_name',
  gender: 'gender',
  mobile_number: 'mobile_number',
  trade: 'training_stream_id',
  district: SKILL_DISTRICT_BARE,
  state: SKILL_STATE_BARE,
  date_of_completion_of_training: 'date_of_completion_of_training',
  created_at: 'created_at'
};
const F_ENTERPRISE = {
  member_id: 'es.member_id',
  member_name: 'es.member_name',
  phone_number: 'es.phone_number',
  member_type: 'es.member_type',
  district_id: 'es.district_id',
  status: 'es.status',
  financial_year: 'es.financial_year',
  profit: 'esm.profit'
};
const F_PREPOST = {
  trade_name: 'trade_name',
  livelihood: 'livelihood',
  financial_year: 'financial_year',
  placement_status: 'placement_status',
  assessment_type: 'assessment_type'
};
const F_MARKET = {
  agency_name: 'agency_name',
  market_access_type: 'market_access_type',
  financial_year: 'financial_year',
  sales_generated_average: 'sales_generated_average'
};
const F_TIME = {
  person_id: 'c.person_id',
  person_name: 'sp.person_name',
  gender: 'sp.gender',
  mobile_number: 'sp.mobile_number',
  time_bucket: 'c.time_bucket',
  first_dt: 'c.first_dt',
  first_working_dt: 'c.first_working_dt'
};

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'super_admin' && user.role !== 'admin' && user.thematic !== 'livelihood') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const drillType = searchParams.get('type') || 'persons';
    const value = searchParams.get('value') || '';
    const placedOnly = searchParams.get('placed_only') === '1';
    const q = searchParams.get('q') || '';
    
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get('per_page') || '50', 10)));
    const offset = (page - 1) * perPage;

    const filters = getFiltersFromRequest(req);
    let columns = [];
    let rows = [];
    let total = 0;

    if (drillType === 'work_status' || drillType === 'placement_status') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'sm.state_id',
        district_col: 'sm.district_id',
        date_col: 'sm.date_of_monitor'
      });
      if (value === 'Not reported' || value === 'Not Reported') {
        clauses.push("(sm.work_status IS NULL OR btrim(COALESCE(sm.work_status, '')) = '')");
      } else if (value) {
        clauses.push("COALESCE(sm.work_status, '') = :drill_value");
        params.drill_value = value;
      }
      const sliceGender = searchParams.get('slice_gender');
      if (sliceGender) {
        clauses.push(`${genderBucketSql('sp.gender')} = :slice_gender`);
        params.slice_gender = sliceGender;
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_MONITOR);
      const w = whereStr(clauses);

      total = await scalar(`
        SELECT COUNT(*)::integer 
        FROM skilltracking_monitor sm
        LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
        ${w}
      `, params);

      rows = await fetchall(`
        SELECT
          sm.person_id, sp.person_name, sp.gender, sp.mobile_number,
          sm.work_status, sm.current_work,
          sm.date_of_monitor
        FROM skilltracking_monitor sm
        LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
        ${w}
        ORDER BY sm.date_of_monitor DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",       label: "Person ID" },
        { key: "person_name",     label: "Name" },
        { key: "gender",          label: "Gender" },
        { key: "mobile_number",   label: "Mobile" },
        { key: "work_status",     label: "Work Status" },
        { key: "current_work",    label: "Current Work" },
        { key: "date_of_monitor", label: "Monitored On" },
      ];

    } else if (drillType === 'income_range') {
      const post = `CASE WHEN btrim(COALESCE(m.post_income::text, '')) ~ '^[0-9]+(\\.[0-9]+)?' THEN btrim(m.post_income::text)::numeric END`;
      let band = `${post} IS NOT NULL AND ${post} <= 5000`;
      if (value.includes('5K–10K') || value.includes('5001')) {
        band = `${post} BETWEEN 5001 AND 10000`;
      } else if (value.includes('10K') || value.includes('10001')) {
        band = `${post} > 10000`;
      }
      const payload = await queryMixRows({
        searchParams,
        year: filters.academic_year || filters.financial_year,
        q,
        page,
        perPage,
        extraClauses: [`m.program_id::text = '11'`, mixWorkingSql(), band],
        qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
        selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
          COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
          m.year, m.pre_income, m.post_income, m.placement_status`,
        columns: [
          { key: 'course_name', label: 'Course' },
          { key: 'location', label: 'Location' },
          { key: 'year', label: 'Year' },
          { key: 'pre_income', label: 'Pre income' },
          { key: 'post_income', label: 'Post income' },
          { key: 'placement_status', label: 'Placement' }
        ]
      });
      return NextResponse.json(payload);

    } else if (drillType === 'income_range_legacy') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'sm.state_id',
        district_col: 'sm.district_id',
        date_col: 'sm.date_of_monitor'
      });
      if (placedOnly) {
        clauses.push("sm.work_status = 'Working'");
      }

      if (value.includes('5K–10K') || value.includes('5001')) {
        clauses.push("CASE WHEN sm.monthly_income ~ '^[0-9]+$' THEN sm.monthly_income::integer ELSE 0 END BETWEEN 5001 AND 10000");
      } else if (value.includes('10K') || value.includes('10001')) {
        clauses.push("CASE WHEN sm.monthly_income ~ '^[0-9]+$' THEN sm.monthly_income::integer ELSE 0 END > 10000");
      } else {
        clauses.push("CASE WHEN sm.monthly_income ~ '^[0-9]+$' THEN sm.monthly_income::integer ELSE 0 END BETWEEN 0 AND 5000");
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_MONITOR);
      const w = whereStr(clauses);

      total = await scalar(`
        SELECT COUNT(*)::integer 
        FROM skilltracking_monitor sm
        LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
        ${w}
      `, params);

      rows = await fetchall(`
        SELECT
          sm.person_id, sp.person_name, sp.gender,
          sm.work_status, sm.monthly_income, sm.date_of_monitor
        FROM skilltracking_monitor sm
        LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
        ${w}
        ORDER BY CASE WHEN sm.monthly_income ~ '^[0-9]+$' THEN sm.monthly_income::integer ELSE 0 END DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",      label: "Person ID" },
        { key: "person_name",    label: "Name" },
        { key: "gender",         label: "Gender" },
        { key: "work_status",    label: "Work Status" },
        { key: "monthly_income", label: "Monthly Income (₹)" },
        { key: "date_of_monitor", label: "Monitored On" },
      ];

    } else if (drillType === 'trade') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'sp.state_id',
        district_col: 'sp.district_id',
        date_col: 'sp.created_at'
      });
      if (value) {
        clauses.push("COALESCE(ts.stream_name, sp.training_stream_id) = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_PERSON_SP);
      const w = whereStr(clauses);

      const baseJoin = `
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${SKILL_PERSON_GEO_JOIN}
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseJoin}`, params);

      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training, ${SKILL_STATE} AS state, ${SKILL_DISTRICT} AS district
        ${baseJoin}
        ORDER BY sp.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",     label: "Person ID" },
        { key: "person_name",   label: "Name" },
        { key: "gender",        label: "Gender" },
        { key: "mobile_number", label: "Mobile" },
        { key: "trade",         label: "Trade" },
        { key: "date_of_completion_of_training", label: "Completed On" },
        { key: "state",         label: "State" },
        { key: "district",      label: "District" },
      ];

    } else if (drillType === 'placement_year') {
      const payload = await queryMixRows({
        searchParams,
        year: value || filters.academic_year || filters.financial_year,
        q,
        page,
        perPage,
        extraClauses: [`m.program_id::text = '11'`, mixWorkingSql()],
        qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
        selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
          COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
          m.year, m.pre_income, m.post_income, m.placement_status`,
        columns: [
          { key: 'course_name', label: 'Course' },
          { key: 'location', label: 'Location' },
          { key: 'year', label: 'Year' },
          { key: 'pre_income', label: 'Pre income' },
          { key: 'post_income', label: 'Post income' },
          { key: 'placement_status', label: 'Placement' }
        ]
      });
      return NextResponse.json(payload);

    } else if (drillType === 'placement_year_legacy') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'sm.state_id',
        district_col: 'sm.district_id',
        date_col: 'sm.date_of_monitor'
      });
      if (value) {
        clauses.push("SUBSTR(sm.date_of_monitor::text, 1, 4) = :drill_value");
        params.drill_value = String(value);
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_MONITOR);
      const w = whereStr(clauses);

      total = await scalar(`
        SELECT COUNT(*)::integer 
        FROM skilltracking_monitor sm
        LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
        ${w}
      `, params);

      rows = await fetchall(`
        SELECT
          sm.person_id, sp.person_name, sp.gender,
          sm.work_status, sm.monthly_income, sm.date_of_monitor
        FROM skilltracking_monitor sm
        LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
        ${w}
        ORDER BY sm.date_of_monitor DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",      label: "Person ID" },
        { key: "person_name",    label: "Name" },
        { key: "gender",         label: "Gender" },
        { key: "work_status",    label: "Work Status" },
        { key: "monthly_income", label: "Monthly Income (₹)" },
        { key: "date_of_monitor", label: "Monitored On" },
      ];

    } else if (drillType === 'gender') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'sp.state_id',
        district_col: 'sp.district_id',
        date_col: 'sp.created_at',
        trade_col: 'sp.training_stream_id'
      });
      if (value) {
        clauses.push(`${genderBucketSql('sp.gender')} = :drill_value`);
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_PERSON_SP);
      const w = whereStr(clauses);

      const baseJoin = `
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${SKILL_PERSON_GEO_JOIN}
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseJoin}`, params);

      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training, ${SKILL_STATE} AS state, ${SKILL_DISTRICT} AS district
        ${baseJoin}
        ORDER BY sp.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",     label: "Person ID" },
        { key: "person_name",   label: "Name" },
        { key: "gender",        label: "Gender" },
        { key: "mobile_number", label: "Mobile" },
        { key: "trade",         label: "Trade" },
        { key: "date_of_completion_of_training", label: "Completed On" },
        { key: "state",         label: "State" },
        { key: "district",      label: "District" },
      ];

    } else if (drillType === 'age') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'sp.state_id',
        district_col: 'sp.district_id',
        date_col: 'sp.created_at',
        trade_col: 'sp.training_stream_id'
      });
      
      const ageExpr = `(CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER) - CASE WHEN sp.dob ~ '^[0-9]{4}' THEN CAST(SUBSTR(sp.dob, 1, 4) AS INTEGER) ELSE 0 END)`;
      if (value === '<18') {
        clauses.push(`${ageExpr} < 18`);
      } else if (value === '18-25') {
        clauses.push(`${ageExpr} BETWEEN 18 AND 25`);
      } else if (value === '26-35') {
        clauses.push(`${ageExpr} BETWEEN 26 AND 35`);
      } else if (value === '36-45') {
        clauses.push(`${ageExpr} BETWEEN 36 AND 45`);
      } else if (value === '45+') {
        clauses.push(`${ageExpr} > 45`);
      }
      
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_PERSON_SP);
      const w = whereStr(clauses);

      const baseJoin = `
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${SKILL_PERSON_GEO_JOIN}
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseJoin}`, params);

      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training, ${SKILL_STATE} AS state, ${SKILL_DISTRICT} AS district,
          ${ageExpr} AS age
        ${baseJoin}
        ORDER BY sp.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",     label: "Person ID" },
        { key: "person_name",   label: "Name" },
        { key: "gender",        label: "Gender" },
        { key: "age",           label: "Age" },
        { key: "mobile_number", label: "Mobile" },
        { key: "trade",         label: "Trade" },
        { key: "date_of_completion_of_training", label: "Completed On" },
        { key: "state",         label: "State" },
        { key: "district",      label: "District" },
      ];

    } else if (drillType === 'enterprise_total') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'es.state_id',
        district_col: 'es.district_id',
        date_col: 'es.created_at'
      });
      if (q) {
        clauses.push("(es.member_name ILIKE :q OR es.phone_number ILIKE :q OR es.member_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_ENTERPRISE);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM enterprise_support es ${w}`, params);

      rows = await fetchall(`
        SELECT
          es.member_id, es.member_name, es.member_type, es.member_mode,
          es.phone_number, es.supported_by,
          CASE WHEN es.status = '1' THEN 'Active' ELSE 'Inactive' END AS status,
          es.created_at
        FROM enterprise_support es
        ${w}
        ORDER BY es.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "member_id",    label: "Member ID" },
        { key: "member_name",  label: "Name" },
        { key: "member_type",  label: "Type" },
        { key: "member_mode",  label: "Mode" },
        { key: "phone_number", label: "Phone" },
        { key: "supported_by", label: "Supported By" },
        { key: "status",       label: "Status" },
        { key: "created_at",   label: "Created On" }
      ];

    } else if (drillType === 'enterprise_active') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'es.state_id',
        district_col: 'es.district_id',
        date_col: 'es.created_at'
      });
      clauses.push("es.status = '1'");
      if (q) {
        clauses.push("(es.member_name ILIKE :q OR es.phone_number ILIKE :q OR es.member_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_ENTERPRISE);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM enterprise_support es ${w}`, params);

      rows = await fetchall(`
        SELECT
          es.member_id, es.member_name, es.member_type, es.member_mode,
          es.phone_number, es.supported_by, es.created_at
        FROM enterprise_support es
        ${w}
        ORDER BY es.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "member_id",    label: "Member ID" },
        { key: "member_name",  label: "Name" },
        { key: "member_type",  label: "Type" },
        { key: "member_mode",  label: "Mode" },
        { key: "phone_number", label: "Phone" },
        { key: "supported_by", label: "Supported By" },
        { key: "created_at",   label: "Created On" }
      ];

    } else if (drillType === 'enterprise_monitored') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'es.state_id',
        district_col: 'es.district_id',
        date_col: 'em.created_at'
      });
      if (q) {
        clauses.push("(es.member_name ILIKE :q OR es.phone_number ILIKE :q OR es.member_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_ENTERPRISE);
      const w = whereStr(clauses);

      const baseQuery = `
        FROM enterprise_support_monitoring em
        JOIN enterprise_support es ON es.member_id = em.member_id
        ${w}
      `;

      total = await scalar(`SELECT COUNT(DISTINCT em.member_id)::integer ${baseQuery}`, params);

      rows = await fetchall(`
        SELECT DISTINCT ON (em.member_id)
          es.member_id, es.member_name, es.member_type,
          es.phone_number, em.financial_year, em.profit, em.created_at
        ${baseQuery}
        ORDER BY em.member_id, em.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "member_id",      label: "Member ID" },
        { key: "member_name",    label: "Name" },
        { key: "member_type",    label: "Type" },
        { key: "phone_number",   label: "Phone" },
        { key: "financial_year", label: "Financial Year" },
        { key: "profit",         label: "Profit (₹)" },
        { key: "created_at",     label: "Monitored On" }
      ];

    } else if (drillType === 'enterprise_fy_profit') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'es.state_id',
        district_col: 'es.district_id',
        date_col: 'em.created_at'
      });
      if (value) {
        clauses.push("em.financial_year = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(es.member_name ILIKE :q OR es.phone_number ILIKE :q OR es.member_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_ENTERPRISE);
      const w = whereStr(clauses);

      const baseQuery = `
        FROM enterprise_support_monitoring em
        JOIN enterprise_support es ON es.member_id = em.member_id
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseQuery}`, params);

      rows = await fetchall(`
        SELECT
          es.member_id, es.member_name, es.member_type,
          es.phone_number, em.financial_year, em.profit, em.created_at
        ${baseQuery}
        ORDER BY em.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "member_id",      label: "Member ID" },
        { key: "member_name",    label: "Name" },
        { key: "member_type",    label: "Type" },
        { key: "phone_number",   label: "Phone" },
        { key: "financial_year", label: "Financial Year" },
        { key: "profit",         label: "Profit (₹)" },
        { key: "created_at",     label: "Monitored On" }
      ];

    } else if (drillType === 'pre_post') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id'
      });
      if (value) {
        clauses.push("assessment_type = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(trade_name ILIKE :q OR livelihood ILIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_PREPOST);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM skilltracking_pre_post_master ${w}`, params);

      rows = await fetchall(`
        SELECT
          pre_post_id, trade_name, livelihood, financial_year,
          assessment_type, candidates_trained, male_count, female_count,
          placement_status
        FROM skilltracking_pre_post_master
        ${w}
        ORDER BY trade_name, assessment_type
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "pre_post_id",          label: "ID" },
        { key: "trade_name",          label: "Trade" },
        { key: "livelihood",          label: "Livelihood Module" },
        { key: "financial_year",      label: "FY" },
        { key: "assessment_type",     label: "Assessment Type" },
        { key: "candidates_trained",  label: "Candidates Trained" },
        { key: "male_count",          label: "Male" },
        { key: "female_count",        label: "Female" },
        { key: "placement_status",    label: "Placed" }
      ];

    } else if (drillType === 'market_access') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id'
      });
      if (q) {
        clauses.push("(agency_name ILIKE :q OR market_access_type ILIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_MARKET);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM enterprise_market_access ${w}`, params);

      rows = await fetchall(`
        SELECT
          access_id, agency_name, market_access_type, sales_generated_average,
          financial_year, status
        FROM enterprise_market_access
        ${w}
        ORDER BY agency_name
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "access_id",               label: "ID" },
        { key: "agency_name",             label: "Agency Name" },
        { key: "market_access_type",      label: "Market Access Type" },
        { key: "sales_generated_average", label: "Avg Sales Generated" },
        { key: "financial_year",          label: "FY" },
        { key: "status",                  label: "Status" }
      ];

    } else if (drillType === 'geo') {
      const grain = searchParams.get('grain') || 'state';
      const geoId = await resolveGeoId({
        module: 'livelihood',
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
        state_col: 'sp.state_id',
        district_col: 'sp.district_id',
        date_col: 'sp.created_at',
        module: 'livelihood'
      });
      if (q) {
        clauses.push('(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)');
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_PERSON_SP);
      const w = whereStr(clauses);
      total = await scalar(`SELECT COUNT(*)::integer FROM skilltracking_persons sp ${SKILL_PERSON_GEO_JOIN} ${w}`, params);
      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training,
          ${SKILL_STATE} AS state, ${SKILL_DISTRICT} AS district
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${SKILL_PERSON_GEO_JOIN}
        ${w}
        ORDER BY sp.created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });
      columns = [
        { key: 'person_id', label: 'Person ID' },
        { key: 'person_name', label: 'Name' },
        { key: 'gender', label: 'Gender' },
        { key: 'mobile_number', label: 'Mobile' },
        { key: 'trade', label: 'Trade' },
        { key: 'state', label: 'State' },
        { key: 'district', label: 'District' }
      ];

    } else if (drillType === 'funnel') {
      if (value === 'roster') {
        const { clauses, params } = buildFilters(filters, {
          state_col: 'skilltracking_persons.state_id',
          district_col: 'skilltracking_persons.district_id',
          date_col: 'skilltracking_persons.created_at',
          module: 'livelihood'
        });
        if (q) {
          clauses.push('(person_name ILIKE :q OR mobile_number ILIKE :q OR person_id::text LIKE :q)');
          params.q = `%${q}%`;
        }
        addColFilters(searchParams, clauses, params, F_PERSON);
        const w = whereStr(clauses);
        total = await scalar(`SELECT COUNT(*)::integer FROM skilltracking_persons ${SKILL_BARE_GEO_JOIN} ${w}`, params);
        rows = await fetchall(`
          SELECT person_id, person_name, gender, mobile_number,
                 COALESCE(ts.stream_name, training_stream_id, '—') AS trade,
                 date_of_completion_of_training,
                 ${SKILL_STATE_BARE} AS state, ${SKILL_DISTRICT_BARE} AS district
          FROM skilltracking_persons
          LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = skilltracking_persons.training_stream_id
          ${SKILL_BARE_GEO_JOIN}
          ${w}
          ORDER BY created_at DESC
          LIMIT :lim OFFSET :off
        `, { ...params, lim: perPage, off: offset });
        columns = [
          { key: 'person_id', label: 'Person ID' },
          { key: 'person_name', label: 'Name' },
          { key: 'gender', label: 'Gender' },
          { key: 'mobile_number', label: 'Mobile' },
          { key: 'trade', label: 'Trade' },
          { key: 'state', label: 'State' },
          { key: 'district', label: 'District' }
        ];
      } else if (value === 'earning') {
        const payload = await queryMixRows({
        searchParams,
          year: filters.academic_year || filters.financial_year,
          q,
          page,
          perPage,
          extraClauses: [
            `m.program_id::text = '11'`,
            `CASE WHEN btrim(COALESCE(m.post_income::text, '')) ~ '^[0-9]+(\\.[0-9]+)?' THEN btrim(m.post_income::text)::numeric END > 0`
          ],
          qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
            COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
            m.year, m.pre_income, m.post_income, m.placement_status`,
          columns: [
            { key: 'course_name', label: 'Course' },
            { key: 'location', label: 'Location' },
            { key: 'year', label: 'Year' },
            { key: 'pre_income', label: 'Pre income' },
            { key: 'post_income', label: 'Post income' },
            { key: 'placement_status', label: 'Placement' }
          ]
        });
        return NextResponse.json(payload);
      } else {
        const { clauses, params } = buildFilters(filters, {
          state_col: 'sm.state_id',
          district_col: 'sm.district_id',
          date_col: 'sm.date_of_monitor',
          module: 'livelihood'
        });
        if (value === 'working') {
          clauses.push("sm.work_status = 'Working'");
        }
        if (q) {
          clauses.push('(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)');
          params.q = `%${q}%`;
        }
        addColFilters(searchParams, clauses, params, F_MONITOR);
        const w = whereStr(clauses);
        total = await scalar(`
          SELECT COUNT(DISTINCT sm.person_id)::integer
          FROM skilltracking_monitor sm
          LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
          ${w}
        `, params);
        rows = await fetchall(`
          SELECT DISTINCT ON (sm.person_id)
            sm.person_id, sp.person_name, sp.gender, sp.mobile_number,
            sm.work_status, sm.date_of_monitor
          FROM skilltracking_monitor sm
          LEFT JOIN skilltracking_persons sp ON sp.person_id = sm.person_id
          ${w}
          ORDER BY sm.person_id, sm.date_of_monitor DESC
          LIMIT :lim OFFSET :off
        `, { ...params, lim: perPage, off: offset });
        columns = [
          { key: 'person_id', label: 'Person ID' },
          { key: 'person_name', label: 'Name' },
          { key: 'gender', label: 'Gender' },
          { key: 'work_status', label: 'Work Status' },
          { key: 'date_of_monitor', label: 'Monitored On' }
        ];
      }

    } else if (drillType === 'income_delta') {
      const pre = validIncomeSql('m.pre_income');
      const post = validIncomeSql('m.post_income');
      const bucket = incomeDeltaSql(pre, post);
      const payload = await queryMixRows({
        searchParams,
        year: filters.academic_year || filters.financial_year,
        q,
        page,
        perPage,
        extraClauses: [
          `m.program_id::text = '11'`,
          `${pre} IS NOT NULL`,
          `${post} IS NOT NULL`,
          value ? `${bucket} = :drill_value` : 'TRUE'
        ],
        extraParams: value ? { drill_value: value } : {},
        qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
        selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
          COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
          m.year, m.pre_income, m.post_income`,
        columns: [
          { key: 'course_name', label: 'Course' },
          { key: 'location', label: 'Location' },
          { key: 'year', label: 'Year' },
          { key: 'pre_income', label: 'Pre income' },
          { key: 'post_income', label: 'Post income' }
        ]
      });
      return NextResponse.json(payload);

    } else if (drillType === 'time_to_placement') {
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id',
        date_col: 'date_of_monitor',
        module: 'livelihood'
      });
      const cte = placementWindowCte(whereStr(clauses));
      const bucketCol = drillType === 'time_to_placement' ? 'time_bucket' : 'delta_bucket';
      const bucketFilter = value ? `WHERE ${bucketCol} = :drill_value` : '';
      if (value) params.drill_value = value;
      const nameFilter = q
        ? `${bucketFilter ? 'AND' : 'WHERE'} (sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)`
        : '';
      if (q) params.q = `%${q}%`;
      const timeClauses = [];
      addColFilters(searchParams, timeClauses, params, F_TIME);
      const timeFilter = timeClauses.length
        ? `${bucketFilter || nameFilter ? 'AND' : 'WHERE'} ${timeClauses.join(' AND ')}`
        : '';

      total = await scalar(`
        ${cte}
        SELECT COUNT(*)::integer
        FROM classified c
        LEFT JOIN skilltracking_persons sp ON sp.person_id = c.person_id
        ${bucketFilter} ${nameFilter} ${timeFilter}
      `, params);
      rows = await fetchall(`
        ${cte}
        SELECT
          c.person_id, sp.person_name, sp.gender, sp.mobile_number,
          c.time_bucket, c.completion_dt, c.first_working_dt
        FROM classified c
        LEFT JOIN skilltracking_persons sp ON sp.person_id = c.person_id
        ${bucketFilter} ${nameFilter} ${timeFilter}
        ORDER BY c.person_id
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });
      columns = [
        { key: 'person_id', label: 'Person ID' },
        { key: 'person_name', label: 'Name' },
        { key: 'gender', label: 'Gender' },
        { key: 'time_bucket', label: 'Time to placement' },
        { key: 'completion_dt', label: 'Training completed' },
        { key: 'first_working_dt', label: 'First working' }
      ];

    } else if (!String(drillType).startsWith('mix_')) {
      // Default: persons list
      const { clauses, params } = buildFilters(filters, {
        state_col: 'skilltracking_persons.state_id',
        district_col: 'skilltracking_persons.district_id',
        trade_col: 'skilltracking_persons.training_stream_id',
        date_col: 'skilltracking_persons.created_at'
      });
      if (q) {
        clauses.push("(person_name ILIKE :q OR mobile_number ILIKE :q OR person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      addColFilters(searchParams, clauses, params, F_PERSON);
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM skilltracking_persons ${SKILL_BARE_GEO_JOIN} ${w}`, params);

      rows = await fetchall(`
        SELECT
          person_id, person_name, gender, mobile_number,
          COALESCE(ts.stream_name, training_stream_id, '—') AS trade,
          date_of_completion_of_training,
          ${SKILL_STATE_BARE} AS state, ${SKILL_DISTRICT_BARE} AS district,
          created_at
        FROM skilltracking_persons
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = skilltracking_persons.training_stream_id
        ${SKILL_BARE_GEO_JOIN}
        ${w}
        ORDER BY created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",     label: "Person ID" },
        { key: "person_name",   label: "Name" },
        { key: "gender",        label: "Gender" },
        { key: "mobile_number", label: "Mobile" },
        { key: "trade",         label: "Trade" },
        { key: "state",         label: "State" },
        { key: "district",      label: "District" },
        { key: "date_of_completion_of_training", label: "Completed On" },
      ];
    }

    if (String(drillType).startsWith('mix_')) {
      const year = filters.academic_year || filters.financial_year;
      const location = searchParams.get('location') || '';
      const mixCommon = { year, q, page, perPage };
      if (drillType === 'mix_skill_heat') {
        const payload = await queryMixRows({
        searchParams,
          ...mixCommon,
          extraClauses: [
            `m.program_id::text = '11'`,
            eqFold('m.course_name', 'drill_value'),
            location ? eqFold('m.location', 'location') : 'TRUE'
          ],
          extraParams: { drill_value: value, location },
          qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
            COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
            COALESCE(NULLIF(TRIM(m.person_gender), ''), '—') AS gender,
            COALESCE(NULLIF(TRIM(m.placement_status), ''), '—') AS placement_status,
            m.year, m.pre_income, m.post_income`,
          columns: [
            { key: 'course_name', label: 'Course' },
            { key: 'location', label: 'Location' },
            { key: 'gender', label: 'Gender' },
            { key: 'placement_status', label: 'Placement' },
            { key: 'year', label: 'Year' },
            { key: 'pre_income', label: 'Pre income' },
            { key: 'post_income', label: 'Post income' }
          ]
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_course' || drillType === 'mix_skill_gender' || drillType === 'mix_placement' || drillType === 'mix_skill_location') {
        const field = {
          mix_course: 'course_name',
          mix_skill_gender: 'person_gender',
          mix_placement: 'placement_status',
          mix_skill_location: 'location'
        }[drillType];
        const payload = await queryMixRows({
        searchParams,
          ...mixCommon,
          extraClauses: [
            `m.program_id::text = '11'`,
            !value
              ? 'TRUE'
              : field === 'placement_status'
                ? `${placementStatusSql('m.placement_status')} = :drill_value`
                : field === 'person_gender'
                  ? `${genderBucketSql('m.person_gender')} = :drill_value`
                  : (field === 'location' || field === 'course_name'
                    ? eqFold(`m.${field}`, 'drill_value')
                    : eqSoft(`m.${field}`, 'drill_value'))
          ],
          extraParams: { drill_value: value },
          qSql: '(m.course_name ILIKE :q OR m.location ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.course_name), ''), '—') AS course_name,
            COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
            COALESCE(NULLIF(TRIM(m.person_gender), ''), '—') AS gender,
            COALESCE(NULLIF(TRIM(m.placement_status), ''), '—') AS placement_status,
            m.year, m.pre_income, m.post_income`,
          columns: [
            { key: 'course_name', label: 'Course' },
            { key: 'location', label: 'Location' },
            { key: 'gender', label: 'Gender' },
            { key: 'placement_status', label: 'Placement' },
            { key: 'year', label: 'Year' },
            { key: 'pre_income', label: 'Pre income' },
            { key: 'post_income', label: 'Post income' }
          ]
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_farmer_location') {
        const payload = await queryMixRows({
        searchParams,
          ...mixCommon,
          extraClauses: [
            `m.program_id::text IN ('1','2')`,
            value ? eqFold('m.location', 'drill_value') : 'TRUE'
          ],
          extraParams: { drill_value: value },
          qSql: '(m.location ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
            m.year, COALESCE(m.number_of_farmers, 0)::integer AS farmers`,
          columns: [
            { key: 'location', label: 'Location' },
            { key: 'year', label: 'Year' },
            { key: 'farmers', label: 'Farmers' }
          ]
        });
        return NextResponse.json(payload);
      }
      if (drillType === 'mix_didi_location' || drillType === 'mix_didi_gender' || drillType === 'mix_didi_phase') {
        const field = {
          mix_didi_location: 'location',
          mix_didi_gender: 'person_gender',
          mix_didi_phase: 'phase'
        }[drillType];
        const payload = await queryMixRows({
        searchParams,
          ...mixCommon,
          extraClauses: [
            `m.program_id::text = '12'`,
            value
              ? (field === 'location'
                ? eqFold(`m.${field}`, 'drill_value')
                : field === 'person_gender'
                  ? `${genderBucketSql('m.person_gender')} = :drill_value`
                  : field === 'phase'
                    ? `${phaseLabelSql('m.phase')} = :drill_value`
                    : eqSoft(`m.${field}`, 'drill_value'))
              : 'TRUE'
          ],
          extraParams: { drill_value: value },
          qSql: '(m.location ILIKE :q OR m.phase ILIKE :q)',
          selectSql: `SELECT COALESCE(NULLIF(TRIM(m.location), ''), '—') AS location,
            COALESCE(NULLIF(TRIM(m.person_gender), ''), '—') AS gender,
            COALESCE(NULLIF(TRIM(m.phase), ''), '—') AS phase,
            COALESCE(NULLIF(TRIM(m.training_type), ''), '—') AS training_type,
            m.year, m.pre_income_individual, m.post_income_individual`,
          columns: [
            { key: 'location', label: 'Location' },
            { key: 'gender', label: 'Gender' },
            { key: 'phase', label: 'Phase' },
            { key: 'training_type', label: 'Training' },
            { key: 'year', label: 'Year' },
            { key: 'pre_income_individual', label: 'Pre individual' },
            { key: 'post_income_individual', label: 'Post individual' }
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
    console.error('Error in livelihood drilldown API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
