'use client';

import React, { useMemo } from 'react';
import EChart, { groupedBarOption, comboLineBarOption } from './EChart';
import { groupBelowShare, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

function rankItems(items, maxItems, minShare) {
  const source = (items || []).map((it) => ({
    label: String(it.label ?? it.name ?? it.disease ?? it.trade ?? it.program ?? it.symptom ?? 'Unknown'),
    value: Number(it.value ?? it.count ?? it.patients ?? it.students ?? it.batches ?? 0)
  })).filter((r) => r.value > 0);

  const grandTotal = source.reduce((s, r) => s + r.value, 0);
  const sorted = [...source].sort((a, b) => b.value - a.value);
  if (minShare) return { ranked: groupBelowShare(sorted, minShare), grandTotal };
  const ranked = !maxItems || sorted.length <= maxItems
    ? sorted
    : [
      ...sorted.slice(0, maxItems - 1),
      { label: 'Other', value: sorted.slice(maxItems - 1).reduce((s, r) => s + r.value, 0) }
    ];

  return { ranked, grandTotal };
}

export default function RankingBar({
  items,
  title,
  onBarClick,
  caption,
  maxItems = 12,
  pareto = false,
  percent = false,
  colors = [],
  focus = [],
  minShare = 0
}) {
  const { ranked, grandTotal } = useMemo(() => rankItems(items, maxItems, minShare), [items, maxItems, minShare]);
  const labels = ranked.map((r) => r.label);
  const values = ranked.map((r) => r.value);

  const option = useMemo(() => {
    if (!grandTotal || !hasValues(values)) return null;
    if (pareto) {
      let running = 0;
      const cumulative = values.map((v) => {
        running += v;
        return Number(((running / grandTotal) * 100).toFixed(1));
      });
      const base = comboLineBarOption(labels, {
        bar: values,
        line: cumulative,
        barName: 'Count',
        lineName: 'Cumulative %',
        dualAxis: true
      });
      return {
        ...base,
        yAxis: [
          { type: 'value', name: 'Count', axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
          { type: 'value', name: 'Cumulative %', min: 0, max: 100, axisLabel: { formatter: (v) => `${v}%` } }
        ]
      };
    }
    return groupedBarOption(labels, [{ label: 'Count', data: values }], { horizontal: true, showLabels: percent, legend: false, withPercent: percent, gridLeft: 160, colors });
  }, [colors, grandTotal, labels, pareto, percent, values]);

  if (!option) return <ChartEmpty caption={caption} />;

  const height = pareto ? 360 : Math.max(280, labels.length * 36);

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={height}
        caption={caption}
        focus={focus}
        onPoint={onBarClick
          ? (p) => {
            const n = Array.isArray(p.value) ? p.value[0] : p.value;
            onBarClick(p.name, Number(n) || 0, p.dataIndex, p.nativeEvent, ranked[p.dataIndex]);
          }
          : undefined}
      />
    </div>
  );
}
