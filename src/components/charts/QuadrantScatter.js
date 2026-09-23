'use client';

import React from 'react';
import { Scatter } from 'react-chartjs-2';
import { NAVY, SKY, GOLD, LIME, baseOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

const QUAD_COLORS = {
  'High reach, high gain': LIME,
  'High reach, low gain': GOLD,
  'Low reach, high gain': SKY,
  'Low reach, low gain': NAVY
};

const medianLines = {
  id: 'medianLines',
  afterDraw(chart) {
    const cfg = chart.options.plugins?.medianLines;
    if (!cfg) return;
    const { medianX, medianY } = cfg;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x || !scales.y) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(27, 42, 74, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    if (Number.isFinite(medianX)) {
      const x = scales.x.getPixelForValue(medianX);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    }
    if (Number.isFinite(medianY)) {
      const y = scales.y.getPixelForValue(medianY);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
    }
    ctx.restore();
  }
};

export default function QuadrantScatter({
  payload,
  title,
  caption,
  xLabel = 'Students (reach)',
  yLabel = 'Assessment gain',
  onPointClick
}) {
  const points = payload?.points || [];
  const xs = points.map((p) => Number(p.x) || 0);
  const ys = points.map((p) => Number(p.y) || 0);

  if (payload?.status === 'no_data' || !points.length || (!hasValues(xs) && !ys.some((v) => v !== 0))) {
    return <ChartEmpty caption={caption || payload?.message} />;
  }

  const datasets = Object.keys(QUAD_COLORS).map((quad) => ({
    label: quad,
    data: points
      .filter((p) => p.quadrant === quad)
      .map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0, label: p.label, key: p.key })),
    backgroundColor: QUAD_COLORS[quad],
    pointRadius: 6,
    pointHoverRadius: 8
  })).filter((ds) => ds.data.length);

  if (!datasets.length) {
    return <ChartEmpty caption={caption || payload?.message} />;
  }

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[360px]">
        <Scatter
          plugins={[medianLines]}
          data={{ datasets }}
          options={{
            ...baseOptions,
            plugins: {
              ...baseOptions.plugins,
              legend: { ...baseOptions.plugins.legend, position: 'bottom' },
              medianLines: {
                medianX: Number(payload?.median_students) || 0,
                medianY: Number(payload?.median_gain) || 0
              },
              tooltip: {
                ...baseOptions.plugins.tooltip,
                callbacks: {
                  title(items) {
                    return items[0]?.raw?.label || '';
                  },
                  label(ctx) {
                    const p = ctx.raw || {};
                    return `Reach ${Number(p.x || 0).toLocaleString('en-IN')} · Gain ${Number(p.y || 0).toFixed(2)}`;
                  }
                }
              }
            },
            scales: {
              x: {
                ...baseOptions.scales.x,
                title: { display: true, text: xLabel, color: '#142033' },
                grid: { color: 'rgba(141, 198, 63, 0.18)', drawBorder: false }
              },
              y: {
                ...baseOptions.scales.y,
                beginAtZero: false,
                title: { display: true, text: yLabel, color: '#142033' }
              }
            },
            onClick: (event, elements) => {
              if (onPointClick && elements.length > 0) {
                const el = elements[0];
                const point = datasets[el.datasetIndex]?.data[el.index];
                if (point) onPointClick(point);
              }
            }
          }}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
