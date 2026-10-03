'use client';

import React, { useMemo } from 'react';
import EChart, { doughnutOption } from './EChart';
import { hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function BrandDoughnut({ labels = [], values = [], percents = [], title, caption, onSliceClick, focus = [], percent = false }) {
  const paired = useMemo(() => labels
    .map((label, i) => ({
      label: String(label ?? 'Unknown'),
      value: Number(values[i] || 0),
      percent: percents[i]
    }))
    .filter((r) => r.value > 0), [labels, values, percents]);

  const option = useMemo(() => {
    if (!hasValues(paired.map((r) => r.value))) return null;
    return doughnutOption(paired, { percent });
  }, [paired, percent]);

  if (!option) return <ChartEmpty caption={caption} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={280}
        caption={caption}
        focus={focus}
        onPoint={onSliceClick
          ? (p) => onSliceClick(p.name, Number(p.value) || 0, p.dataIndex, p.nativeEvent)
          : undefined}
      />
    </div>
  );
}
