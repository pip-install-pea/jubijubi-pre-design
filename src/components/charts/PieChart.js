'use client';

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { seriesColors, baseOptions } from '../../lib/chartTheme';

const PieChart = ({ data, title, onClick }) => {
  const n = data?.labels?.length || 0;
  const themed = {
    ...data,
    datasets: (data?.datasets || []).map((ds) => ({
      ...ds,
      backgroundColor: ds.backgroundColor || seriesColors(n),
      borderWidth: 0
    }))
  };

  const options = {
    ...baseOptions,
    onClick: (event, elements) => {
      if (onClick && elements.length > 0) {
        const { index } = elements[0];
        const label = themed.labels[index];
        const value = themed.datasets[0].data[index];
        onClick(label, value, index);
      }
    },
    plugins: {
      ...baseOptions.plugins,
      legend: { ...baseOptions.plugins.legend, position: 'right' },
      title: { display: !!title, text: title, color: '#142033' }
    }
  };

  return (
    <div className="relative h-64 w-full">
      <Pie options={options} data={themed} />
    </div>
  );
};

export default PieChart;
