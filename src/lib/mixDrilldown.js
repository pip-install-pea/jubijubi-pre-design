import { fetchall, scalar } from './db.js';
import { bindIn, whereStr } from './analytics.js';
import { MIX_CANONICAL_ROW } from './educationAnalytics.js';
import { eqFold } from './labelNorm.js';
import { addColFilters, mixFilterExpr, fetchFacets } from './drilldownFilters.js';

export { eqFold };

export async function queryMixRows({
  year,
  extraClauses = [],
  extraParams = {},
  q,
  qSql,
  page = 1,
  perPage = 50,
  selectSql,
  columns,
  joinSql = '',
  searchParams
}) {
  const params = { ...extraParams };
  const clauses = [MIX_CANONICAL_ROW];
  const yearClause = bindIn('m.year', year, 'year', params);
  if (yearClause) clauses.push(yearClause);
  clauses.push(...extraClauses);
  if (q && qSql) {
    clauses.push(qSql);
    params.q = `%${q}%`;
  }
  const exprByKey = {};
  for (const col of columns || []) {
    const expr = mixFilterExpr(col.key);
    if (expr) exprByKey[col.key] = expr;
  }
  const facetWhere = whereStr(clauses);
  const facetParams = { ...params };
  if (searchParams) addColFilters(searchParams, clauses, params, exprByKey);
  const w = whereStr(clauses);
  const total = await scalar(
    `SELECT COUNT(*)::integer FROM education_mixprogram m ${joinSql} ${w}`,
    params
  );
  const rows = await fetchall(
    `${selectSql}
     FROM education_mixprogram m ${joinSql} ${w}
     ORDER BY m.year DESC, m.id
     LIMIT :lim OFFSET :off`,
    { ...params, lim: perPage, off: (page - 1) * perPage }
  );
  const facets = await fetchFacets({
    fetchall,
    fromSql: `education_mixprogram m ${joinSql}`,
    whereSql: facetWhere,
    params: facetParams,
    columns,
    exprByKey
  });
  return { columns, rows, total, page, per_page: perPage, facets };
}
