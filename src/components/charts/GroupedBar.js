'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { NAVY, SKY, GOLD, LIME, baseOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

const SERIES = [NAVY, SKY, GOLD, LIME];

export default function GroupedBar({ labels = [], datasets = [], title, caption, horizontal, onBarClick }) {
  const any = datasets.some((ds) => hasValues(ds.data || []));
  if (!any || !labels.length) {
    return <ChartEmpty caption={caption} />;
  }

  const chartDatasets = datasets.map((ds, i) => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: ds.color || SERIES[i % SERIES.length],
    borderRadius: 6,
    maxBarThickness: 28
  }));

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[300px]">
        <Bar
          data={{ labels, datasets: chartDatasets }}
          options={{
            ...baseOptions,
            indexAxis: horizontal ? 'y' : 'x',
            plugins: { ...baseOptions.plugins, legend: { ...baseOptions.plugins.legend, position: 'bottom' } },
            onClick: (event, elements) => {
              if (onBarClick && elements.length > 0) {
                const idx = elements[0].index;
                onBarClick(labels[idx], idx, elements[0].datasetIndex);
              }
            }
          }}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
