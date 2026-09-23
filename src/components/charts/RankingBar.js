'use client';

import React from 'react';
import { Bar, Chart } from 'react-chartjs-2';
import { seriesColors, rankingBarOptions, baseOptions, hasValues, GOLD, fadeIfUnfocused } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function RankingBar({
  items,
  title,
  onBarClick,
  caption,
  maxItems = 12,
  pareto = false,
  focus = []
}) {
  const source = (items || []).map((it) => ({
    label: it.label ?? it.name ?? it.disease ?? it.trade ?? it.program ?? it.symptom ?? 'Unknown',
    value: Number(it.value ?? it.count ?? it.patients ?? it.students ?? it.batches ?? 0)
  })).filter((r) => r.value > 0);

  const grandTotal = source.reduce((s, r) => s + r.value, 0);
  const sorted = [...source].sort((a, b) => b.value - a.value);
  let ranked;
  if (sorted.length <= maxItems) {
    ranked = sorted;
  } else {
    const head = sorted.slice(0, maxItems - 1);
    const rest = sorted.slice(maxItems - 1);
    ranked = [...head, { label: 'Other', value: rest.reduce((s, r) => s + r.value, 0) }];
  }

  const labels = ranked.map((r) => r.label);
  const values = ranked.map((r) => r.value);

  if (!grandTotal || !hasValues(values)) {
    return <ChartEmpty caption={caption} />;
  }

  let running = 0;
  const shares = values.map((v) => Number(((v / grandTotal) * 100).toFixed(1)));
  const cumulative = values.map((v) => {
    running += v;
    return Number(((running / grandTotal) * 100).toFixed(1));
  });

  const barColors = seriesColors(values.length).map((c, i) => fadeIfUnfocused(c, labels[i], focus));

  const barDataset = {
    type: 'bar',
    label: 'Count',
    data: values,
    backgroundColor: barColors,
    borderRadius: 6,
    maxBarThickness: pareto ? 36 : 28,
    order: 2
  };

  const datasets = [barDataset];
  if (pareto) {
    datasets.push({
      type: 'line',
      label: 'Cumulative % of total',
      data: cumulative,
      borderColor: GOLD,
      backgroundColor: GOLD,
      pointRadius: 3,
      tension: 0.2,
      yAxisID: 'y1',
      order: 1
    });
  }

  const options = pareto
    ? {
        ...baseOptions,
        indexAxis: 'x',
        plugins: {
          ...baseOptions.plugins,
          legend: {
            display: true,
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16, color: '#142033', font: { size: 12, weight: '500' } }
          },
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label(ctx) {
                if (ctx.dataset.type === 'line') {
                  return `Cumulative: ${ctx.parsed.y}% of total`;
                }
                const v = Number(ctx.parsed.y) || 0;
                const i = ctx.dataIndex;
                return `${v.toLocaleString('en-IN')} (${shares[i]}% of total; ${cumulative[i]}% cumulative)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: '#142033', font: { size: 11 }, maxRotation: 45, minRotation: 0 }
          },
          y: {
            beginAtZero: true,
            position: 'left',
            title: { display: true, text: 'Count', color: '#142033', font: { size: 11 } },
            grid: { color: 'rgba(20, 32, 51, 0.08)', drawBorder: false },
            ticks: {
              color: '#142033',
              font: { size: 11 },
              callback: (v) => (typeof v === 'number' ? v.toLocaleString('en-IN') : v)
            }
          },
          y1: {
            min: 0,
            max: 100,
            position: 'right',
            grid: { drawOnChartArea: false, drawBorder: false },
            title: { display: true, text: 'Cumulative %', color: '#142033', font: { size: 11 } },
            ticks: { color: '#142033', font: { size: 11 }, callback: (v) => `${v}%` }
          }
        },
        onClick: (event, elements) => {
          if (onBarClick && elements.length > 0) {
            const idx = elements[0].index;
            onBarClick(labels[idx], values[idx], idx, event);
          }
        }
      }
    : {
        ...rankingBarOptions,
        plugins: {
          ...rankingBarOptions.plugins,
          legend: { display: false },
          tooltip: {
            ...rankingBarOptions.plugins.tooltip,
            callbacks: {
              label(ctx) {
                const v = Number(ctx.parsed?.x ?? ctx.raw) || 0;
                return `${v.toLocaleString('en-IN')} (${shares[ctx.dataIndex]}% of total)`;
              }
            }
          }
        },
        onClick: (event, elements) => {
          if (onBarClick && elements.length > 0) {
            const idx = elements[0].index;
            onBarClick(labels[idx], values[idx], idx, event);
          }
        }
      };

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className={pareto ? 'h-[360px]' : 'h-[320px]'}>
        {pareto
          ? <Chart type="bar" data={{ labels, datasets }} options={options} />
          : <Bar data={{ labels, datasets }} options={options} />}
      </div>
      {caption ? <p className="chart-caption">{caption}</p> : null}
    </div>
  );
}
