import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  SelectChangeEvent,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useNavigate } from 'react-router-dom';

interface CommissionData {
  check_in_time: string;
  practitioner_name: string;
  service_name: string;
  total_service_count: number;
  commission_price: number;
  total_commission: number;
}

const mockData: CommissionData[] = [
  {
    check_in_time: '2025-03-05 04:18 PM',
    practitioner_name: 'Moh Moh',
    service_name: 'Whitening Laser Dark Spot',
    total_service_count: 4,
    commission_price: 1500,
    total_commission: 6000
  },
  {
    check_in_time: '2025-03-06 10:41 AM',
    practitioner_name: 'Moh Moh',
    service_name: 'Hair Removal Half Leg',
    total_service_count: 5,
    commission_price: 3000,
    total_commission: 15000
  }
];

const Commission = () => {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const handleMonthChange = (event: SelectChangeEvent<string>) => {
    setSelectedMonth(event.target.value);
  };

  const formatPrice = (price: number): string => {
    return `${price.toLocaleString()} MMK`;
  };

  const exportToCSV = () => {
    const headers = ['Check-in Time', 'Practitioner Name', 'Service Name', 'Total Service Count', 'Commission Price', 'Total Commission'];
    const csvContent = [
      headers.join(','),
      ...mockData.map(row => [
        row.check_in_time,
        `"${row.practitioner_name}"`,
        `"${row.service_name}"`,
        row.total_service_count,
        row.commission_price,
        row.total_commission
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `commission_data_${selectedMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ p: 3, bgcolor: '#111923', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ color: 'white' }}>Commission</Typography>
          <Select
            value={selectedMonth}
            onChange={handleMonthChange}
            sx={{
              minWidth: 200,
              bgcolor: '#1a2234',
              color: 'white',
              '& .MuiSelect-icon': { color: 'white' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' }
            }}
            size="small"
          >
            <MenuItem value="2025-03">March 2025</MenuItem>
            <MenuItem value="2025-02">February 2025</MenuItem>
            <MenuItem value="2025-01">January 2025</MenuItem>
          </Select>
          <Tooltip title="Export to CSV">
            <IconButton
              onClick={exportToCSV}
              sx={{
                color: '#3b82f6',
                '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.1)' }
              }}
            >
              <FileDownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Paper sx={{ bgcolor: '#1a2234', color: 'white' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }}>Check-in Time</TableCell>
                <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }}>Practitioner Name</TableCell>
                <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }}>Service Name</TableCell>
                <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }} align="right">Total Service Count</TableCell>
                <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }} align="right">Commission Price</TableCell>
                <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }} align="right">Total Commission</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockData.map((row, index) => (
                <TableRow 
                  key={index}
                  sx={{ '&:hover': { bgcolor: '#242f3d' } }}
                >
                  <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }}>{row.check_in_time}</TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#3b82f6',
                      borderBottom: '1px solid #2d3748',
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' }
                    }}
                    onClick={() => navigate(`/therapists/${encodeURIComponent(row.practitioner_name)}`)}
                  >
                    {row.practitioner_name}
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#3b82f6',
                      borderBottom: '1px solid #2d3748',
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' }
                    }}
                    onClick={() => navigate(`/services/${encodeURIComponent(row.service_name)}`)}
                  >
                    {row.service_name}
                  </TableCell>
                  <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }} align="right">
                    {row.total_service_count.toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }} align="right">
                    {formatPrice(row.commission_price)}
                  </TableCell>
                  <TableCell sx={{ color: 'white', borderBottom: '1px solid #2d3748' }} align="right">
                    {formatPrice(row.total_commission)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default Commission; 