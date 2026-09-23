'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { NAVY, baseOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function FunnelBars({ stages = [], title, caption, onBarClick }) {
  const labels = stages.map((s) => s.label);
  const reached = stages.map((s) => Number(s.value) || 0);
  const first = reached[0] || 0;
  const dropped = reached.map((v) => Math.max(0, first - v));

  if (!labels.length || !hasValues(reached)) {
    return <ChartEmpty caption={caption} />;
  }

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[300px]">
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: 'Reached',
                data: reached,
                backgroundColor: NAVY,
                borderRadius: 6,
                maxBarThickness: 28,
                stack: 'funnel'
              },
              {
                label: 'Not yet at this stage',
                data: dropped,
                backgroundColor: 'rgba(30, 79, 163, 0.12)',
                borderRadius: 6,
                maxBarThickness: 28,
                stack: 'funnel'
              }
            ]
          }}
          options={{
            ...baseOptions,
            indexAxis: 'y',
            plugins: {
              ...baseOptions.plugins,
              legend: { ...baseOptions.plugins.legend, position: 'bottom' },
              tooltip: {
                ...baseOptions.plugins.tooltip,
                callbacks: {
                  label(ctx) {
                    const stage = stages[ctx.dataIndex] || {};
                    if (ctx.datasetIndex === 0) {
                      const conv = stage.conversion_from_prev != null
                        ? ` · ${stage.conversion_from_prev}% from previous`
                        : '';
                      return `${stage.value?.toLocaleString('en-IN') || 0} people (${stage.pct_of_first || 0}% of roster)${conv}`;
                    }
                    return `${Number(ctx.raw || 0).toLocaleString('en-IN')} not yet at this stage`;
                  }
                }
              }
            },
            scales: {
              x: {
                stacked: true,
                beginAtZero: true,
                grid: { color: 'rgba(141, 198, 63, 0.18)', drawBorder: false },
                ticks: { color: '#142033', font: { size: 11 } }
              },
              y: {
                stacked: true,
                grid: { display: false, drawBorder: false },
                ticks: { color: '#142033', font: { size: 11 } }
              }
            },
            onClick: (event, elements) => {
              if (onBarClick && elements.length > 0) {
                const idx = elements[0].index;
                onBarClick(stages[idx], idx);
              }
            }
          }}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
