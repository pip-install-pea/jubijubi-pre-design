'use client';

import React from 'react';
import { Line } from 'react-chartjs-2';
import { NAVY, SKY, GOLD, baseOptions, rupeeOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function BrandLine({ labels = [], values = [], title, caption, rupee, onPointClick, label = '' }) {
  if (!hasValues(values)) {
    return <ChartEmpty caption={caption} />;
  }

  const options = rupee ? rupeeOptions() : { ...baseOptions };
  options.plugins = {
    ...options.plugins,
    legend: { display: Boolean(label), ...options.plugins?.legend }
  };
  options.onClick = (event, elements) => {
    if (onPointClick && elements.length > 0) {
      const idx = elements[0].index;
      onPointClick(labels[idx], values[idx], idx);
    }
  };

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[280px]">
        <Line
          data={{
            labels,
            datasets: [{
              label,
              data: values,
              borderColor: SKY,
              backgroundColor: 'rgba(30, 79, 163, 0.12)',
              pointBackgroundColor: GOLD,
              pointBorderColor: NAVY,
              pointRadius: 4,
              fill: true,
              tension: 0.3
            }]
          }}
          options={options}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
