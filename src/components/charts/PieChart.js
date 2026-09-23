'use client';

import React, { useMemo } from 'react';
import EChart, { doughnutOption } from './EChart';

const PieChart = ({ data, title, onClick }) => {
  const option = useMemo(() => {
    const labels = data?.labels || [];
    const values = data?.datasets?.[0]?.data || [];
    const items = labels.map((label, i) => ({ label, value: Number(values[i]) || 0 }));
    return doughnutOption(items);
  }, [data]);

  return (
    <EChart
      option={option}
      height={256}
      caption={title}
      onPoint={onClick
        ? (p) => onClick(p.name, Number(p.value) || 0, p.dataIndex)
        : undefined}
    />
  );
};

export default PieChart;
