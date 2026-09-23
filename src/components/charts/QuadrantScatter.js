'use client';

import React, { useMemo } from 'react';
import EChart from './EChart';
import { NAVY, SKY, GOLD, LIME, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

const QUAD_COLORS = {
  'High reach, high gain': LIME,
  'High reach, low gain': GOLD,
  'Low reach, high gain': SKY,
  'Low reach, low gain': NAVY
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

  const option = useMemo(() => {
    if (payload?.status === 'no_data' || !points.length || (!hasValues(xs) && !ys.some((v) => v !== 0))) {
      return null;
    }
    const series = Object.keys(QUAD_COLORS).map((quad) => ({
      type: 'scatter',
      name: quad,
      symbolSize: 10,
      itemStyle: { color: QUAD_COLORS[quad] },
      data: points
        .filter((p) => p.quadrant === quad)
        .map((p) => ({
          value: [Number(p.x) || 0, Number(p.y) || 0],
          name: p.label,
          key: p.key,
          label: p.label
        }))
    })).filter((ds) => ds.data.length);
    if (!series.length) return null;
    const medianX = Number(payload?.median_students) || 0;
    const medianY = Number(payload?.median_gain) || 0;
    series[0] = {
      ...series[0],
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(27, 42, 74, 0.35)', type: 'dashed' },
        data: [
          ...(Number.isFinite(medianX) ? [{ xAxis: medianX }] : []),
          ...(Number.isFinite(medianY) ? [{ yAxis: medianY }] : [])
        ]
      }
    };
    return {
      tooltip: {
        trigger: 'item',
        renderMode: 'richText',
        formatter: (p) => {
          const xy = Array.isArray(p.value) ? p.value : [p.value, 0];
          return `${p.data?.name || p.name || ''}\nReach ${Number(xy[0] || 0).toLocaleString('en-IN')} · Gain ${Number(xy[1] || 0).toFixed(2)}`;
        }
      },
      legend: { bottom: 0 },
      grid: { left: 48, right: 16, top: 24, bottom: 56, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      xAxis: {
        name: xLabel,
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') }
      },
      yAxis: {
        name: yLabel,
        nameLocation: 'middle',
        nameGap: 36
      },
      series
    };
  }, [payload, points, xLabel, xs, yLabel, ys]);

  if (!option) return <ChartEmpty caption={caption || payload?.message} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={360}
        caption={caption}
        onPoint={onPointClick
          ? (p) => onPointClick({
            x: Array.isArray(p.value) ? p.value[0] : p.value,
            y: Array.isArray(p.value) ? p.value[1] : 0,
            label: p.data?.label || p.name,
            key: p.data?.key
          })
          : undefined}
      />
    </div>
  );
}
