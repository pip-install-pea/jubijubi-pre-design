'use client';

import React, { useMemo } from 'react';
import EChart, { lineAreaOption } from './EChart';
import { hasValues } from '../../lib/chartTheme';
import ChartEmpty from './ChartEmpty';

export default function BrandLine({ labels = [], values = [], title, caption, rupee, onPointClick, label = '' }) {
  const option = useMemo(() => {
    if (!hasValues(values)) return null;
    return lineAreaOption(labels, values, { name: label, rupee });
  }, [label, labels, rupee, values]);

  if (!option) return <ChartEmpty caption={caption} />;

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={280}
        caption={caption}
        onPoint={onPointClick
          ? (p) => onPointClick(p.name, Number(p.value) || 0, p.dataIndex)
          : undefined}
      />
    </div>
  );
}
