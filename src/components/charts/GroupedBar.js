'use client';

import React, { useMemo } from 'react';
import EChart, { groupedBarOption } from './EChart';
import { hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function GroupedBar({ labels = [], datasets = [], title, caption, horizontal, onBarClick, focus = [] }) {
  const option = useMemo(() => {
    const any = datasets.some((ds) => hasValues(ds.data || []));
    if (!any || !labels.length) return null;
    return groupedBarOption(
      labels,
      datasets.map((ds) => ({ label: ds.label, data: ds.data, color: ds.color })),
      { horizontal: Boolean(horizontal) }
    );
  }, [datasets, horizontal, labels]);

  if (!option) return <ChartEmpty caption={caption} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={300}
        caption={caption}
        focus={focus}
        onPoint={onBarClick
          ? (p) => {
            const datasetIndex = datasets.findIndex((ds) => ds.label === p.seriesName);
            onBarClick(p.name, p.dataIndex, datasetIndex, p.nativeEvent);
          }
          : undefined}
      />
    </div>
  );
}
