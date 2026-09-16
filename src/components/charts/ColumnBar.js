'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { BRAND_SERIES, baseOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function ColumnBar({ labels = [], values = [], colors, title, caption, onBarClick }) {
  if (!hasValues(values)) {
    return <ChartEmpty caption={caption} />;
  }

  const palette = colors || BRAND_SERIES.slice(0, Math.max(values.length, 1));

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[280px]">
        <Bar
          data={{
            labels,
            datasets: [{
              data: values,
              backgroundColor: palette,
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
                onBarClick(labels[idx], values[idx], idx);
              }
            }
          }}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
