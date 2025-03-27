import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  IconButton,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Grid,
  Chip,
  Pagination,
  SelectChangeEvent,
  Button,
  Tooltip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useClinic } from '../contexts/ClinicContext';
import { format } from 'date-fns';

interface CheckInOutRecord {
  CheckInTime: string;
  CheckOutTime: string;
  UsePurchasedServcie: number;
  Servicename: string;
  TherapicName: string; // This appears to be a typo in the schema but keeping it as is
  CustomerName: string;
  CustomerPhoneNumber: string;
  ClinicName: string;
  ClinicId: string;
  ClinicCode: string;
  OrderId: string;
  Discount: number;
  Tax: number;
  Total: number;
  NetTotal: number;
  PaymentMethod: string;
  PaymentStatus: string;
  HelperName: string;
}

const CheckInOut: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<CheckInOutRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CheckInOutRecord[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingCSV, setExportingCSV] = useState(false);
  const [availablePaymentStatuses, setAvailablePaymentStatuses] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<'day' | 'week' | 'month'>('day');

  useEffect(() => {
    if (currentClinic) {
      fetchCheckInOutData();
    }
  }, [currentClinic, selectedDate, filterType]);

  useEffect(() => {
    applyFilters();
  }, [records, paymentStatusFilter, searchQuery]);

  const fetchCheckInOutData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let dateCondition: string;
      const currentDate = selectedDate || new Date();
      
      if (filterType === 'day') {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = '${dateStr}'`;
      } else if (filterType === 'week') {
        const endDate = format(currentDate, 'yyyy-MM-dd');
        const startDate = format(new Date(currentDate.getTime() - 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN '${startDate}' AND '${endDate}'`;
      } else if (filterType === 'month') {
        const endDate = format(currentDate, 'yyyy-MM-dd');
        const startDate = format(new Date(currentDate.getTime() - 29 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN '${startDate}' AND '${endDate}'`;
      } else {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = '${dateStr}'`;
      }
      
      console.log('Fetching check-in/out data with filter:', filterType);
      console.log('Date condition:', dateCondition);
      console.log('Current Clinic:', currentClinic);
      console.log('Current Clinic Code:', currentClinic?.code);
      
      const query = `
        SELECT
          FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', CheckInTime) as CheckInTime,
          FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', CheckOutTime) as CheckOutTime,
          UsePurchasedServcie,
          Servicename,
          TherapicName,
          CustomerName,
          CustomerPhoneNumber,
          ClinicName,
          ClinicId,
          ClinicCode,
          OrderId,
          Discount,
          Tax,
          Total,
          NetTotal,
          PaymentMethod,
          PaymentStatus,
          HelperName
        FROM great_time.CheckInOutView
        WHERE ${dateCondition}
        AND ClinicCode = '${currentClinic?.code}'
        ORDER BY CheckInTime DESC
      `;
    
      console.log('Executing query:', query);
      const response = await axios.post('/api/query', { query });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch check-in/out data');
      }
      
      const data = response.data.data;
      
      if (data && data.length > 0) {
        const paymentStatuses = [...new Set(data.map((record: any) => record.PaymentStatus))]
          .filter((status): status is string => typeof status === 'string' && status !== '')
          .sort();
        
        console.log('Available payment status values:', paymentStatuses);
        setAvailablePaymentStatuses(paymentStatuses);
      } else {
        setAvailablePaymentStatuses([]);
      }
      
      setRecords(data);
      
    } catch (err: any) {
      console.error('Error fetching check-in/out data:', err);
      setError(err.message || 'Failed to fetch check-in/out data');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...records];
    
    if (paymentStatusFilter !== 'all') {
      filtered = filtered.filter(record => {
        console.log('Record PaymentStatus:', record.PaymentStatus, 
                   'Filter value:', paymentStatusFilter, 
                   'Comparison result:', record.PaymentStatus?.toLowerCase() === paymentStatusFilter.toLowerCase());
        
        return record.PaymentStatus && 
               record.PaymentStatus.toLowerCase() === paymentStatusFilter.toLowerCase();
      });
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(record => 
        record.CustomerName?.toLowerCase().includes(query) ||
        record.Servicename?.toLowerCase().includes(query) ||
        record.TherapicName?.toLowerCase().includes(query) ||
        record.HelperName?.toLowerCase().includes(query) ||
        record.ClinicName?.toLowerCase().includes(query) ||
        record.PaymentMethod?.toLowerCase().includes(query) ||
        record.OrderId?.toLowerCase().includes(query)
      );
    }
    
    setFilteredRecords(filtered);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handlePaymentStatusFilterChange = (event: SelectChangeEvent) => {
    setPaymentStatusFilter(event.target.value as string);
  };

  const handleRefresh = () => {
    fetchCheckInOutData();
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    if (date) {
      fetchCheckInOutData();
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return '#10b981'; // Green
      case 'pending':
        return '#f59e0b'; // Yellow/Orange
      case 'failed':
        return '#ef4444'; // Red
      case 'refunded':
        return '#3b82f6'; // Blue
      case 'cancelled':
        return '#6b7280'; // Gray
      default:
        return '#6b7280'; // Default Gray
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MMK',
      // MMK typically doesn't use decimal places
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleFilterTypeChange = (newFilterType: 'day' | 'week' | 'month') => {
    setFilterType(newFilterType);
  };

  const downloadCSV = async () => {
    try {
      setExportingCSV(true);
      
      let dateCondition: string;
      const currentDate = selectedDate || new Date();
      
      if (filterType === 'day') {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = '${dateStr}'`;
      } else if (filterType === 'week') {
        const endDate = format(currentDate, 'yyyy-MM-dd');
        const startDate = format(new Date(currentDate.getTime() - 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN '${startDate}' AND '${endDate}'`;
      } else if (filterType === 'month') {
        const endDate = format(currentDate, 'yyyy-MM-dd');
        const startDate = format(new Date(currentDate.getTime() - 29 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN '${startDate}' AND '${endDate}'`;
      } else {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = '${dateStr}'`;
      }
      
      let dataToExport = filteredRecords;
      
      if (records.length < 100 && !searchQuery) {
        const query = `
          SELECT
            FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', CheckInTime) as CheckInTime,
            FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', CheckOutTime) as CheckOutTime,
            UsePurchasedServcie,
            Servicename,
            TherapicName,
            CustomerName,
            CustomerPhoneNumber,
            ClinicName,
            ClinicId,
            ClinicCode,
            OrderId,
            Discount,
            Tax,
            Total,
            NetTotal,
            PaymentMethod,
            PaymentStatus,
            HelperName
          FROM great_time.CheckInOutView
          WHERE ${dateCondition}
          AND ClinicCode = '${currentClinic?.code}'
          ${paymentStatusFilter !== 'all' ? `AND PaymentStatus = '${paymentStatusFilter}'` : ''}
          ORDER BY CheckInTime DESC
          LIMIT 1000
        `;
        
        const response = await axios.post('/api/query', { query }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 30000
        });
        
        if (response.data.success) {
          dataToExport = response.data.data;
        }
      }
      
      let filenameDate: string;
      if (filterType === 'day') {
        filenameDate = format(currentDate, 'yyyy-MM-dd');
      } else if (filterType === 'week') {
        const startDate = format(new Date(currentDate.getTime() - 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        filenameDate = `${startDate}_to_${format(currentDate, 'yyyy-MM-dd')}`;
      } else {
        const startDate = format(new Date(currentDate.getTime() - 29 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
        filenameDate = `${startDate}_to_${format(currentDate, 'yyyy-MM-dd')}`;
      }
      
      const headers = [
        'Check-In Time', 
        'Check-Out Time', 
        'Service', 
        'Therapist', 
        'Customer',
        'Phone Number',
        'Order ID',
        'Payment Method',
        'Payment Status',
        'Helper',
        'Net Total',
        'Discount',
        'Tax',
        'Total'
      ];
      
      const rows = dataToExport.map(record => [
        record.CheckInTime,
        record.CheckOutTime || '',
        record.Servicename || '',
        record.TherapicName || '',
        record.CustomerName || '',
        record.CustomerPhoneNumber || '',
        record.OrderId || '',
        record.PaymentMethod || '',
        record.PaymentStatus || '',
        record.HelperName || '',
        record.NetTotal?.toString() || '',
        record.Discount?.toString() || '',
        record.Tax?.toString() || '',
        record.Total?.toString() || ''
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `checkin_checkout_${currentClinic?.code}_${filenameDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exporting CSV:', err);
    } finally {
      setExportingCSV(false);
    }
  };

  const paginatedRecords = filteredRecords.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  if (loading && records.length === 0) {
    return (
      <Box sx={{ 
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100%',
        bgcolor: '#111923'
      }}>
        <CircularProgress sx={{ color: 'white' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#111923', minHeight: '100vh', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton 
            onClick={handleBack} 
            sx={{ mr: 2, color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" sx={{ color: 'white', fontWeight: 'bold' }}>
            Check-In/Out Records
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Export to CSV">
            <Button
              variant="outlined"
              startIcon={exportingCSV ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <FileDownloadIcon />}
              onClick={downloadCSV}
              disabled={exportingCSV || loading || filteredRecords.length === 0}
              sx={{ 
                mr: 2,
                color: 'white', 
                borderColor: '#3b82f6',
                '&:hover': { 
                  borderColor: 'white',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)'
                }
              }}
            >
              {exportingCSV ? 'Exporting...' : 'Export CSV'}
            </Button>
          </Tooltip>
          <IconButton 
            onClick={handleRefresh} 
            sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Paper sx={{ bgcolor: '#1a2234', p: 2, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column', mb: { xs: 2, sm: 0 } }}>
                  <Typography sx={{ color: 'white', mb: 1, fontWeight: 'medium' }}>Date Range</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button 
                      variant={filterType === 'day' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleFilterTypeChange('day')}
                      sx={{ 
                        minWidth: '60px',
                        color: 'white',
                        borderColor: '#3b82f6',
                        bgcolor: filterType === 'day' ? '#3b82f6' : 'transparent',
                        '&:hover': { borderColor: 'white', bgcolor: filterType === 'day' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)' }
                      }}
                    >
                      Day
                    </Button>
                    <Button 
                      variant={filterType === 'week' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleFilterTypeChange('week')}
                      sx={{ 
                        minWidth: '60px',
                        color: 'white',
                        borderColor: '#3b82f6',
                        bgcolor: filterType === 'week' ? '#3b82f6' : 'transparent',
                        '&:hover': { borderColor: 'white', bgcolor: filterType === 'week' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)' }
                      }}
                    >
                      Week
                    </Button>
                    <Button 
                      variant={filterType === 'month' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleFilterTypeChange('month')}
                      sx={{ 
                        minWidth: '60px',
                        color: 'white',
                        borderColor: '#3b82f6',
                        bgcolor: filterType === 'month' ? '#3b82f6' : 'transparent',
                        '&:hover': { borderColor: 'white', bgcolor: filterType === 'month' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)' }
                      }}
                    >
                      Month
                    </Button>
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <Typography sx={{ color: 'white', mb: 1, fontWeight: 'medium' }}>
                    {filterType === 'day' ? "Select Date" : "End Date"}
                  </Typography>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker 
                      value={selectedDate}
                      onChange={handleDateChange}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          variant: "outlined",
                          size: "small",
                          sx: {
                            '& .MuiOutlinedInput-root': {
                              '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                            },
                            '& .MuiInputBase-input': { color: 'white', py: 1 },
                            '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.7)' },
                          }
                        }
                      }}
                    />
                  </LocalizationProvider>
                </Box>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography sx={{ color: 'white', mb: 1, fontWeight: 'medium' }}>Payment Status</Typography>
                  <FormControl fullWidth variant="outlined" size="small">
                    <Select
                      value={paymentStatusFilter}
                      onChange={handlePaymentStatusFilterChange}
                      sx={{
                        color: 'white',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
                        '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.7)' }
                      }}
                    >
                      <MenuItem value="all">All Statuses</MenuItem>
                      {availablePaymentStatuses.map((status) => (
                        <MenuItem key={status} value={status}>{status}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography sx={{ color: 'white', mb: 1, fontWeight: 'medium' }}>Search Records</Typography>
                  <TextField
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={searchQuery}
                    onChange={handleFilterChange}
                    placeholder="Customer, service, therapist..."
                    InputProps={{
                      sx: { 
                        color: 'white',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
                      }
                    }}
                  />
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {error ? (
        <Paper sx={{ bgcolor: '#1a2234', p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleRefresh}
            startIcon={<RefreshIcon />}
          >
            Retry
          </Button>
        </Paper>
      ) : (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ color: 'white' }}>
              {filteredRecords.length} records found
            </Typography>
          </Box>

          <Paper sx={{ bgcolor: '#1a2234', overflow: 'hidden', borderRadius: 2 }}>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Order ID</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Check-In Time</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Check-Out Time</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Service</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Therapist</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Helper</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Customer</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Phone</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Payment Method</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ bgcolor: '#131b2c', color: 'white', fontWeight: 'bold' }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                        No records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRecords.map((record, index) => (
                      <TableRow key={`${record.OrderId}-${index}`} hover sx={{ '&:hover': { bgcolor: '#1e293b !important' } }}>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.OrderId}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.CheckInTime}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.CheckOutTime || '-'}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.Servicename}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.TherapicName}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.HelperName || '-'}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.CustomerName}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.CustomerPhoneNumber}</TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>{record.PaymentMethod}</TableCell>
                        <TableCell sx={{ borderBottom: '1px solid #1e293b' }}>
                          <Chip 
                            label={record.PaymentStatus} 
                            size="small"
                            sx={{ 
                              bgcolor: getPaymentStatusColor(record.PaymentStatus),
                              color: 'white',
                              fontWeight: 'bold'
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                          {formatCurrency(record.Total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            
            {filteredRecords.length > rowsPerPage && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: '1px solid #1e293b' }}>
                <Pagination
                  count={Math.ceil(filteredRecords.length / rowsPerPage)}
                  page={page}
                  onChange={handleChangePage}
                  color="primary"
                  sx={{
                    '& .MuiPaginationItem-root': { color: 'white' },
                    '& .Mui-selected': { bgcolor: '#3b82f6 !important' }
                  }}
                />
              </Box>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
};

export default CheckInOut; 