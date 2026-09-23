/**
 * Place and category labels on mix sheets are free text.
 * Fold for grouping and drilldown: case, spaces, punctuation.
 * Do not treat "Nira" and "Nara" as the same (short names, one letter off).
 */

export function softFoldSql(expr) {
  return `lower(regexp_replace(btrim(COALESCE(${expr}, '')), '\\s+', ' ', 'g'))`;
}

export function foldSql(expr) {
  return `regexp_replace(lower(btrim(COALESCE(${expr}, ''))), '[^a-z0-9]+', '', 'g')`;
}

export function foldLabelSql(expr, empty = 'unknown') {
  return `NULLIF(${foldSql(expr)}, '')`;
}

export function displaySql(expr) {
  return `MIN(NULLIF(btrim(${expr}), ''))`;
}

export function eqFold(colExpr, paramName) {
  return `(${foldSql(colExpr)} = ${foldSql(`:${paramName}`)} AND ${foldSql(`:${paramName}`)} <> '')`;
}

export function eqSoft(colExpr, paramName) {
  return `(${softFoldSql(colExpr)} = ${softFoldSql(`:${paramName}`)} AND ${softFoldSql(`:${paramName}`)} <> '')`;
}

export function foldKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = cur[j];
  }
  return prev[n];
}

export function sameFoldedPlace(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  const limit = a.length >= 10 && b.length >= 10 ? 2 : 1;
  return levenshtein(a, b) <= limit;
}

export function mergeSimilarLabels(items) {
  if (!Array.isArray(items) || items.length < 2) return items || [];
  const rows = items.map((r) => ({
    ...r,
    _key: foldKey(r.label ?? r.location ?? r.name)
  }));
  const used = new Set();
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (used.has(i) || !rows[i]._key) continue;
    let label = rows[i].label ?? rows[i].location ?? rows[i].name;
    let value = Number(rows[i].value) || 0;
    used.add(i);
    for (let j = i + 1; j < rows.length; j += 1) {
      if (used.has(j) || !rows[j]._key) continue;
      if (!sameFoldedPlace(rows[i]._key, rows[j]._key)) continue;
      value += Number(rows[j].value) || 0;
      const other = rows[j].label ?? rows[j].location ?? rows[j].name;
      if (String(other || '').length > String(label || '').length) label = other;
      used.add(j);
    }
    out.push({ ...rows[i], label, value, _key: undefined });
  }
  return out.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
}
