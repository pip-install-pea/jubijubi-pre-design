'use client';

import React, { useMemo } from 'react';
import EChart, { stackedBarOption } from './EChart';
import { hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function FunnelBars({ stages = [], title, caption, onBarClick }) {
  const option = useMemo(() => {
    const labels = stages.map((s) => s.label);
    const reached = stages.map((s) => Number(s.value) || 0);
    const first = reached[0] || 0;
    const dropped = reached.map((v) => Math.max(0, first - v));
    if (!labels.length || !hasValues(reached)) return null;
    return stackedBarOption(labels, [
      { label: 'Reached', data: reached },
      { label: 'Not yet at this stage', data: dropped }
    ], { horizontal: true });
  }, [stages]);

  if (!option) return <ChartEmpty caption={caption} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={300}
        caption={caption}
        onPoint={onBarClick
          ? (p) => onBarClick(stages[p.dataIndex], p.dataIndex)
          : undefined}
      />
    </div>
  );
}
