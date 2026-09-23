'use client';

import React, { useMemo } from 'react';
import EChart, { groupedBarOption } from './EChart';
import { hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function ColumnBar({ labels = [], values = [], title, caption, onBarClick, focus = [] }) {
  const option = useMemo(() => {
    if (!hasValues(values)) return null;
    return groupedBarOption(labels, [{ label: 'Count', data: values }]);
  }, [labels, values]);

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
