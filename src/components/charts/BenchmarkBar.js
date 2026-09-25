'use client';

import React, { useMemo } from 'react';
import EChart, { groupedBarOption } from './EChart';
import { NAVY, SKY, GOLD, LIME, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function BenchmarkBar({ payload, title, caption, onBarClick }) {
  const rows = payload?.rows || [];
  const labels = rows.map((r) => r.label);
  const values = rows.map((r) => Number(r.value) || 0);

  const option = useMemo(() => {
    if (!labels.length || !hasValues(values)) return null;
    const grainLabel = payload?.grain === 'district' ? 'District' : 'State';
    const unit = payload?.unit || 'count';
    const stateAvg = payload?.grain === 'district' ? Number(payload.state_average) || 0 : 0;
    const progAvg = Number(payload?.programme_average) || 0;
    const nProg = Number(payload?.programme_n) || 0;
    const nState = Number(payload?.state_n) || 0;
    const markLineData = [];
    if (stateAvg > 0) {
      markLineData.push({
        xAxis: stateAvg,
        name: `State mean · ${nState || 'all'} districts`,
        lineStyle: { color: SKY, type: 'dashed', width: 2 },
        label: { formatter: 'State mean', color: SKY }
      });
    }
    if (progAvg > 0) {
      markLineData.push({
        xAxis: progAvg,
        name: `Programme mean · ${nProg || 'all'} ${grainLabel.toLowerCase()}s`,
        lineStyle: { color: GOLD, type: 'dashed', width: 2 },
        label: { formatter: 'Programme mean', color: GOLD }
      });
    }

    const base = groupedBarOption(labels, [{ label: grainLabel, data: values }], { horizontal: true });
    const yAxis = Array.isArray(base.yAxis) ? base.yAxis[0] : base.yAxis;
    return {
      ...base,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        renderMode: 'richText',
        formatter: (items) => {
          const item = Array.isArray(items) ? items[0] : items;
          const named = rows.find((r) => String(r.label) === String(item?.name));
          const row = named || rows[item?.dataIndex] || {};
          const v = Number(row.value ?? item?.value) || 0;
          const bits = [`${item?.name || ''}`, `${v.toLocaleString('en-IN')} ${unit}`];
          if (row.vs_programme_pct != null) {
            bits.push(`${row.vs_programme_pct > 0 ? '+' : ''}${row.vs_programme_pct}% vs programme mean`);
          }
          if (row.vs_state_pct != null) {
            bits.push(`${row.vs_state_pct > 0 ? '+' : ''}${row.vs_state_pct}% vs state mean`);
          }
          return bits.join('\n');
        }
      },
      yAxis: { ...yAxis, inverse: true },
      series: [{
        type: 'bar',
        name: grainLabel,
        emphasis: { focus: 'series' },
        data: rows.map((row) => ({
          value: Number(row.value) || 0,
          name: row.label,
          geoId: row.id,
          itemStyle: {
            color: progAvg > 0 && Number(row.value) >= progAvg ? LIME : NAVY
          }
        })),
        markLine: markLineData.length ? { symbol: 'none', data: markLineData } : undefined
      }]
    };
  }, [labels, payload, rows, values]);

  if (!option) return <ChartEmpty caption={caption} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={Math.max(280, labels.length * 28)}
        caption={caption}
        onPoint={onBarClick
          ? (p) => {
            if (p.componentType && p.componentType !== 'series') return;
            if (p.seriesType && p.seriesType !== 'bar') return;
            const named = rows.find((row) => String(row.label) === String(p.name));
            const embedded = p.data?.geoId != null
              ? rows.find((row) => String(row.id) === String(p.data.geoId))
              : null;
            const row = named || embedded || rows[p.dataIndex];
            if (!row) return;
            onBarClick(row.label, row, p.dataIndex);
          }
          : undefined}
      />
    </div>
  );
}
