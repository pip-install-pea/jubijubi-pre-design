'use client';

import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { seriesColors, baseOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function BrandDoughnut({ labels = [], values = [], title, caption, onSliceClick, colors }) {
  const paired = labels.map((label, i) => ({ label, value: Number(values[i] || 0) }))
    .filter((r) => r.value > 0);
  const filteredLabels = paired.map((r) => r.label);
  const filteredValues = paired.map((r) => r.value);

  if (!hasValues(filteredValues)) {
    return <ChartEmpty caption={caption} />;
  }

  const palette = colors || seriesColors(filteredLabels.length);

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[280px]">
        <Doughnut
          data={{
            labels: filteredLabels,
            datasets: [{
              data: filteredValues,
              backgroundColor: palette,
              borderWidth: 0
            }]
          }}
          options={{
            ...baseOptions,
            cutout: '62%',
            plugins: {
              ...baseOptions.plugins,
              legend: { ...baseOptions.plugins.legend, position: 'right' }
            },
            onClick: (event, elements) => {
              if (onSliceClick && elements.length > 0) {
                const idx = elements[0].index;
                onSliceClick(filteredLabels[idx], filteredValues[idx], idx);
              }
            }
          }}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
