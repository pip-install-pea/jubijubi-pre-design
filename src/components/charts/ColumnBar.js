'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { seriesColors, baseOptions, hasValues, fadeIfUnfocused } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function ColumnBar({ labels = [], values = [], colors, title, caption, onBarClick, focus = [] }) {
  if (!hasValues(values)) {
    return <ChartEmpty caption={caption} />;
  }

  const palette = colors?.length
    ? values.map((_, i) => colors[i % colors.length])
    : seriesColors(values.length);
  const painted = palette.map((c, i) => fadeIfUnfocused(c, labels[i], focus));

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[280px]">
        <Bar
          data={{
            labels,
            datasets: [{
              data: values,
              backgroundColor: painted,
              borderRadius: 6,
              maxBarThickness: 48
            }]
          }}
          options={{
            ...baseOptions,
            plugins: { ...baseOptions.plugins, legend: { display: false } },
            onClick: (event, elements) => {
              if (onBarClick && elements.length > 0) {
                const idx = elements[0].index;
                onBarClick(labels[idx], values[idx], idx, event);
              }
            }
          }}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
