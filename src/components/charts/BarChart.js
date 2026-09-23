'use client';

import React, { useMemo } from 'react';
import EChart, { groupedBarOption } from './EChart';

const BarChart = ({ data, title, onClick }) => {
  const option = useMemo(() => groupedBarOption(
    data?.labels || [],
    (data?.datasets || []).map((ds) => ({ label: ds.label, data: ds.data }))
  ), [data]);

  return (
    <div>
      {title && <p className="chart-kicker">{title}</p>}
      <EChart
        option={option}
        height={280}
        onPoint={onClick
          ? (p) => onClick(p.name, p.seriesName, p.dataIndex, p.value)
          : undefined}
      />
    </div>
  );
};

export default BarChart;
