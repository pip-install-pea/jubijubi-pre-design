'use client';

import React from 'react';
import { Bar } from 'react-chartjs-2';
import { BRAND_SERIES, baseOptions } from '../../lib/chartTheme';

const BarChart = ({ data, title, onClick }) => {
  const themed = {
    ...data,
    datasets: (data?.datasets || []).map((ds, i) => ({
      ...ds,
      backgroundColor: ds.backgroundColor || BRAND_SERIES[i % BRAND_SERIES.length],
      borderRadius: ds.borderRadius ?? 6
    }))
  };

  const options = {
    ...baseOptions,
    onClick: (event, elements) => {
      if (onClick && elements.length > 0) {
        const { index, datasetIndex } = elements[0];
        const label = themed.labels[index];
        const value = themed.datasets[datasetIndex].data[index];
        const datasetLabel = themed.datasets[datasetIndex].label;
        onClick(label, datasetLabel, index, value);
      }
    },
    plugins: {
      ...baseOptions.plugins,
      title: { display: !!title, text: title, color: '#1B2A4A' }
    }
  };

  return <Bar options={options} data={themed} />;
};

export default BarChart;
