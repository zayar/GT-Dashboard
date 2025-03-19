import React from 'react';
import { Bar } from 'react-chartjs-2';

interface BarChartProps {
  data: {
    labels: string[];
    datasets: Array<{
      data: number[];
      backgroundColor?: string[];
      borderColor?: string;
    }>;
  };
}

const BarChart: React.FC<BarChartProps> = React.memo(({ data }) => {
  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          title: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          x: {
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        }
      }}
    />
  );
});

export default BarChart;