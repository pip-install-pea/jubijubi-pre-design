import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { getFiltersFromRequest, buildFilters, whereStr } from '@/lib/analytics.js';
import { fetchall, scalar } from '@/lib/db.js';

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
      if (value) {
        clauses.push("COALESCE(sm.work_status, '') = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
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
          sm.work_status, sm.current_work, sm.monthly_income,
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
        { key: "monthly_income",  label: "Monthly Income (₹)" },
        { key: "date_of_monitor", label: "Monitored On" },
      ];

    } else if (drillType === 'income_range') {
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
      const w = whereStr(clauses);

      const baseJoin = `
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseJoin}`, params);

      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training, sp.state_id, sp.district_id
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
        { key: "district_id",   label: "District" },
      ];

    } else if (drillType === 'placement_year') {
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
        clauses.push("sp.gender = :drill_value");
        params.drill_value = value;
      }
      if (q) {
        clauses.push("(sp.person_name ILIKE :q OR sp.mobile_number ILIKE :q OR sp.person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      const baseJoin = `
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseJoin}`, params);

      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training, sp.state_id, sp.district_id
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
        { key: "district_id",   label: "District" },
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
      const w = whereStr(clauses);

      const baseJoin = `
        FROM skilltracking_persons sp
        LEFT JOIN skilltracking_training_stream ts ON ts.stream_id = sp.training_stream_id
        ${w}
      `;

      total = await scalar(`SELECT COUNT(*)::integer ${baseJoin}`, params);

      rows = await fetchall(`
        SELECT
          sp.person_id, sp.person_name, sp.gender, sp.mobile_number,
          COALESCE(ts.stream_name, sp.training_stream_id, '—') AS trade,
          sp.date_of_completion_of_training, sp.state_id, sp.district_id,
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
        { key: "district_id",   label: "District" },
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

    } else {
      // Default: persons list
      const { clauses, params } = buildFilters(filters, {
        state_col: 'state_id',
        district_col: 'district_id',
        trade_col: 'training_stream_id',
        date_col: 'created_at'
      });
      if (q) {
        clauses.push("(person_name ILIKE :q OR mobile_number ILIKE :q OR person_id::text LIKE :q)");
        params.q = `%${q}%`;
      }
      const w = whereStr(clauses);

      total = await scalar(`SELECT COUNT(*)::integer FROM skilltracking_persons ${w}`, params);

      rows = await fetchall(`
        SELECT
          person_id, person_name, gender, mobile_number,
          training_stream_id AS trade, date_of_completion_of_training,
          state_id, district_id, created_at
        FROM skilltracking_persons
        ${w}
        ORDER BY created_at DESC
        LIMIT :lim OFFSET :off
      `, { ...params, lim: perPage, off: offset });

      columns = [
        { key: "person_id",     label: "Person ID" },
        { key: "person_name",   label: "Name" },
        { key: "gender",        label: "Gender" },
        { key: "mobile_number", label: "Mobile" },
        { key: "trade",         label: "Trade ID" },
        { key: "date_of_completion_of_training", label: "Completed On" },
        { key: "district_id",   label: "District" },
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
    console.error('Error in livelihood drilldown API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
