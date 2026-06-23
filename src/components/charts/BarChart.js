'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const BarChart = ({ data, title, onClick }) => {
  const options = {
    responsive: true,
    onClick: (event, elements) => {
      if (onClick && elements.length > 0) {
        const { index, datasetIndex } = elements[0];
        const label = data.labels[index];
        const value = data.datasets[datasetIndex].data[index];
        const datasetLabel = data.datasets[datasetIndex].label;
        onClick(label, datasetLabel, index, value);
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12, weight: '500' }
        }
      },
      title: {
        display: !!title,
        text: title,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          display: true,
          drawBorder: false,
          color: '#f1f5f9'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  return <Bar options={options} data={data} />;
};

export default BarChart;
