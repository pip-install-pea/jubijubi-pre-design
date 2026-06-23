'use client';

import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const PieChart = ({ data, title, onClick }) => {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event, elements) => {
      if (onClick && elements.length > 0) {
        const { index } = elements[0];
        const label = data.labels[index];
        const value = data.datasets[0].data[index];
        onClick(label, value, index);
      }
    },
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12, weight: '500' }
        }
      },
    },
  };

  return (
    <div className="relative h-64 w-full">
      <Pie options={options} data={data} />
    </div>
  );
};

export default PieChart;
