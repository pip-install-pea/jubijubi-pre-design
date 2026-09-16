'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { BRAND_SERIES, bucketTop, rankingBarOptions, hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function RankingBar({ items, title, color = BRAND_SERIES[0], onBarClick, caption, maxItems = 12 }) {
  const ranked = bucketTop(
    (items || []).map((it) => ({
      label: it.label ?? it.name ?? it.disease ?? it.trade ?? it.program ?? it.symptom ?? 'Unknown',
      value: Number(it.value ?? it.count ?? it.patients ?? it.students ?? it.batches ?? 0)
    })),
    maxItems
  );
  const labels = ranked.map((r) => r.label);
  const values = ranked.map((r) => r.value);

  if (!hasValues(values)) {
    return <ChartEmpty caption={caption} />;
  }

  const options = {
    ...rankingBarOptions,
    maxBarThickness: 28,
    onClick: (event, elements) => {
      if (onBarClick && elements.length > 0) {
        const idx = elements[0].index;
        onBarClick(labels[idx], values[idx], idx);
      }
    }
  };

  return (
    <div className="chart-wrap">
      {title && <p className="chart-kicker">{title}</p>}
      <div className="h-[320px]">
        <Bar
          data={{
            labels,
            datasets: [{
              data: values,
              backgroundColor: color,
              borderRadius: 6,
              maxBarThickness: 28
            }]
          }}
          options={options}
        />
      </div>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
