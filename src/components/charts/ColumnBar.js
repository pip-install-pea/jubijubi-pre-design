'use client';

import React, { useMemo } from 'react';
import EChart, { groupedBarOption } from './EChart';
import { hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function ColumnBar({
  labels = [],
  values = [],
  series = null,
  title,
  caption,
  onBarClick,
  focus = [],
  axisTitle = ''
}) {
  const option = useMemo(() => {
    const datasets = series || [{ label: 'Count', data: values }];
    const flat = datasets.flatMap((item) => item.data || []);
    if (!hasValues(flat)) return null;
    return groupedBarOption(labels, datasets, { yName: axisTitle, legend: Boolean(series) });
  }, [labels, values, series, axisTitle]);

  if (!option) return <ChartEmpty caption={caption} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={280}
        caption={caption}
        focus={focus}
        onPoint={onBarClick
          ? (p) => onBarClick(p.name, Number(p.value) || 0, p.dataIndex, p.nativeEvent)
          : undefined}
      />
    </div>
  );
}
