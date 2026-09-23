'use client';

import React, { useMemo, useState } from 'react';
import EChart, { comboLineBarOption, groupedBarOption } from './EChart';

function fmt(n) {
  return n || n === 0 ? Number(n).toLocaleString('en-IN') : '—';
}

export default function FarmerGrowth({
  byYear = [],
  locationsByYear = {},
  onLocationClick
}) {
  const years = byYear.map((r) => r.year);
  const [selected, setSelected] = useState(years[years.length - 1] || '');

  React.useEffect(() => {
    if (!years.length) return;
    if (!years.includes(selected)) setSelected(years[years.length - 1]);
  }, [years, selected]);

  const current = useMemo(
    () => byYear.find((r) => r.year === selected) || byYear[byYear.length - 1] || null,
    [byYear, selected]
  );

  const locations = useMemo(() => {
    const rows = locationsByYear[selected] || [];
    const point = byYear.find((r) => r.year === selected);
    const useAdded = point && !point.opening;
    return rows
      .map((r) => ({
        label: r.label,
        value: useAdded ? Number(r.added) || 0 : Number(r.stock ?? r.value) || 0,
        stock: Number(r.stock ?? r.value) || 0
      }))
      .filter((r) => r.value > 0);
  }, [locationsByYear, selected, byYear]);

  if (!byYear.length) return null;

  const locLabels = locations.map((r) => r.label);
  const locAdded = locations.map((r) => r.value);

  return (
    <div>
      <div className="year-strip year-strip--inline">
        <span className="year-strip__label">Year</span>
        <div className="year-strip__track" role="tablist" aria-label="Farmer year">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              role="tab"
              aria-selected={year === selected}
              className={year === selected ? 'year-strip__btn is-active' : 'year-strip__btn'}
              onClick={() => setSelected(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {current && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-body">
              <div className="kpi-value">{fmt(current.stock)}</div>
              <div className="kpi-label">Running total in {current.year}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-body">
              <div className="kpi-value">{current.opening ? fmt(current.stock) : fmt(current.added)}</div>
              <div className="kpi-label">{current.opening ? 'Opening count' : 'Added since previous year'}</div>
            </div>
          </div>
          {current.dropped > 0 && (
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmt(current.dropped)}</div>
                <div className="kpi-label">Drop vs previous year</div>
              </div>
            </div>
          )}
        </div>
      )}

      <EChart
        option={comboLineBarOption(years, {
          bar: byYear.map((r) => (r.opening ? 0 : r.added)),
          line: byYear.map((r) => r.stock),
          barName: 'Added since previous year',
          lineName: 'Running total'
        })}
        onPoint={(p) => p.name && setSelected(p.name)}
      />

      {locations.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <h4 className="chart-inline-title">
            {current?.opening ? `Stock in ${selected}, by location` : `Added in ${selected}, by location`}
          </h4>
          <EChart
            option={groupedBarOption(
              locLabels,
              [{ label: current?.opening ? 'Stock' : 'Added', data: locAdded }],
              { horizontal: true }
            )}
            height={Math.max(220, locations.length * 36)}
            onPoint={(p) => p.name && onLocationClick?.(p.name)}
          />
        </div>
      )}
    </div>
  );
}
