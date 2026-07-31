import React from 'react';
import { useTheme } from '@mui/material/styles';
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
  const theme = useTheme();

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
            ticks: { color: theme.palette.text.secondary },
            grid: { color: theme.palette.divider }
          },
          x: {
            ticks: { color: theme.palette.text.secondary },
            grid: { color: theme.palette.divider }
          }
        }
      }}
    />
  );
});

export default BarChart;
