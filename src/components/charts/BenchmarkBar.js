'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import ChartEmpty from './ChartEmpty';
import { NAVY, SKY, GOLD, LIME, rankingBarOptions, hasValues, referenceLinePlugin } from '../../lib/chartTheme';

export default function BenchmarkBar({ payload, title, caption, onBarClick }) {
  const rows = payload?.rows || [];
  const labels = rows.map((r) => r.label);
  const values = rows.map((r) => Number(r.value) || 0);

  if (!labels.length || !hasValues(values)) {
    return <ChartEmpty caption={caption} />;
  }

  const grainLabel = payload?.grain === 'district' ? 'District' : 'State';
  const unit = payload?.unit || 'count';
  const stateAvg = payload?.grain === 'district' ? Number(payload.state_average) || 0 : 0;
  const progAvg = Number(payload?.programme_average) || 0;
  const nProg = Number(payload?.programme_n) || 0;
  const nState = Number(payload?.state_n) || 0;

  const colors = values.map((v) => {
    if (progAvg > 0 && v >= progAvg) return LIME;
    return NAVY;
  });

  const lines = [];
  if (stateAvg > 0) {
    lines.push({
      value: stateAvg,
      color: SKY,
      label: `State mean · ${nState || 'all'} districts`
    });
  }
  if (progAvg > 0) {
    lines.push({
      value: progAvg,
      color: GOLD,
      label: `Programme mean · ${nProg || 'all'} ${grainLabel.toLowerCase()}s`
    });
  }

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[320px]">
        <Bar
          data={{
            labels,
            datasets: [{
              label: grainLabel,
              data: values,
              backgroundColor: colors,
              borderRadius: 6,
              maxBarThickness: 28
            }]
          }}
          options={{
            ...rankingBarOptions,
            plugins: {
              ...rankingBarOptions.plugins,
              legend: { display: false },
              tooltip: {
                ...rankingBarOptions.plugins.tooltip,
                callbacks: {
                  label(ctx) {
                    const v = Number(ctx.parsed?.x ?? ctx.raw) || 0;
                    const bits = [`${v.toLocaleString('en-IN')} ${unit}`];
                    const row = rows[ctx.dataIndex];
                    if (row?.vs_programme_pct != null) {
                      bits.push(`${row.vs_programme_pct > 0 ? '+' : ''}${row.vs_programme_pct}% vs programme mean`);
                    }
                    if (row?.vs_state_pct != null) {
                      bits.push(`${row.vs_state_pct > 0 ? '+' : ''}${row.vs_state_pct}% vs state mean`);
                    }
                    return bits;
                  }
                }
              }
            },
            onClick: (event, elements) => {
              if (onBarClick && elements.length > 0) {
                const idx = elements[0].index;
                onBarClick(labels[idx], rows[idx], idx);
              }
            }
          }}
          plugins={[referenceLinePlugin(lines)]}
        />
      </div>
      {caption ? <p className="chart-caption">{caption}</p> : null}
    </div>
  );
}
