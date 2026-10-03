function trimDecimals(n) {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

/** Full rupees, or the short lakh/crore form used on tiles. */
export function formatINR(value, { short = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (!short || abs < 100000) {
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
  }
  if (abs >= 10000000) return `${sign}₹${trimDecimals(abs / 10000000)} Cr`;
  return `${sign}₹${trimDecimals(abs / 100000)} L`;
}

export function formatINRFull(value) {
  return formatINR(value, { short: false });
}
