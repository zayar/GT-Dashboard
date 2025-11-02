import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  alpha,
  useTheme,
  TextField,
  MenuItem,
  Select,
  Grid,
  InputAdornment,
  IconButton,
  SelectChangeEvent,
  Chip,
  ButtonGroup
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack'; // Assuming you might want a back button
import { useClinic } from '../contexts/ClinicContext';
import axios from 'axios'; // Import axios for making direct API calls

// Define the interface for the record based on schema
interface CheckInOutRecord {
  OrderId: string | null;
  CheckInTime: string | null; // Assuming datetime comes as string
  CheckOutTime: string | null; // Assuming datetime comes as string
  Servicename: string;
  TherapicName: string;
  HelperName: string | null;
  CustomerName: string | null;
  CustomerPhoneNumber: string;
  PaymentMethod: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER' | null; // Adjust enum values if needed
  PaymentStatus: 'PAID' | 'PENDING' | 'CANCELLED' | 'REFUNDED' | null; // Adjust enum values if needed
  Total: number | null;
  SellerName: string | null;
  // Add other fields from inoutview if needed for display or filtering
}

// MySQL connection details
const connectionConfig = {
  host: '34.69.63.226',
  port: 3306,
  user: 'gtadmin',
  password: 'gtapp456$%^',
  database: 'great_time'
};

// Base URL for the new MySQL service
const MYSQL_SERVICE_URL = 'http://localhost:5004/api/mysql';

const CheckInCheckOutPage: React.FC = () => {
  const [records, setRecords] = useState<CheckInOutRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentClinic } = useClinic();

  // Filter states
  const [dateRange, setDateRange] = useState<'day' | 'week' | 'month'>('day');
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Function to format date strings for SQL queries
  const formatDateForSQL = (date: Date | null): string => {
    if (!date) return '';
    return format(date, 'yyyy-MM-dd HH:mm:ss');
  };

  // Calculate start date based on end date and range
  const getStartDate = (range: 'day' | 'week' | 'month', end: Date | null): Date | null => {
    if (!end) return null;
    switch (range) {
      case 'day':
        return startOfDay(end);
      case 'week':
        return startOfWeek(end, { weekStartsOn: 1 }); // Assuming week starts on Monday
      case 'month':
        return startOfMonth(end);
      default:
        return null;
    }
  };

  const getEndDateRange = (range: 'day' | 'week' | 'month', end: Date | null): Date | null => {
    if (!end) return null;
    switch (range) {
      case 'day':
        return endOfDay(end);
      case 'week':
        return endOfWeek(end, { weekStartsOn: 1 }); // Assuming week starts on Monday
      case 'month':
        return endOfMonth(end);
      default:
        return null;
    }
  };

  const fetchData = useCallback(async () => {
    if (!currentClinic) {
      setError("No clinic selected");
      return;
    }

    setLoading(true);
    setError(null);

    const calculatedStartDate = getStartDate(dateRange, endDate);
    const calculatedEndDate = getEndDateRange(dateRange, endDate); // Use the end of the selected period for range queries

    if (!calculatedStartDate || !calculatedEndDate) {
      setError("Invalid date range selected.");
      setLoading(false);
      return;
    }

    // Query inoutview table - *KEEPING direct axios for the separate MySQL service*
    // If /api/mysql *also* needs Firebase auth, this should use apiClient too.
    let query = `
      SELECT 
        OrderId, CheckInTime, CheckOutTime, Servicename, TherapicName, HelperName, 
        CustomerName, CustomerPhoneNumber, PaymentMethod, PaymentStatus, Total, SellerName
      FROM inoutview 
      WHERE CheckInTime >= '${formatDateForSQL(calculatedStartDate)}' 
        AND CheckInTime <= '${formatDateForSQL(calculatedEndDate)}'
        AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
    `;

    if (paymentStatusFilter !== 'all') {
      query += ` AND PaymentStatus = '${paymentStatusFilter.toUpperCase()}'`;
    }

    query += ` ORDER BY CheckInTime DESC;`; // Example ordering

    try {
      const searchQuery = new URLSearchParams({
        scope: "view.query"
      })
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/sqlquery?${searchQuery}`, {
        ...connectionConfig,
        query: query
      });

      if (response.data.success) {
        setRecords(response.data.data || []);
      } else {
        setError(response.data.error || response.data.message || 'Failed to fetch check-in/out records');
        setRecords([]); // Clear records on error
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to fetch data');
      setRecords([]); // Clear records on error
    } finally {
      setLoading(false);
    }
  }, [dateRange, endDate, paymentStatusFilter, currentClinic]); // Added currentClinic to dependencies

  useEffect(() => {
    if (currentClinic) {
      fetchData();
    }
  }, [fetchData, currentClinic]); // Added currentClinic to dependencies

  // Memoized filtered records based on search term
  const filteredRecords = useMemo(() => {
    if (!searchTerm) {
      return records;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return records.filter(record =>
      record.CustomerName?.toLowerCase().includes(lowerSearchTerm) ||
      record.Servicename?.toLowerCase().includes(lowerSearchTerm) ||
      record.TherapicName?.toLowerCase().includes(lowerSearchTerm) ||
      record.CustomerPhoneNumber?.includes(searchTerm) ||
      record.SellerName?.toLowerCase().includes(lowerSearchTerm)
    );
  }, [records, searchTerm]);

  // Function to format date for display
  const formatDisplayDateTime = (dateTimeString: string | null) => {
    if (!dateTimeString) return '-';
    try {
      // Handle potential Z at the end if it's UTC
      const date = parseISO(dateTimeString.endsWith('Z') ? dateTimeString : dateTimeString.replace(' ', 'T') + 'Z');
      return format(date, 'yyyy-MM-dd hh:mm a');
    } catch (e) {
      console.error("Error parsing date:", dateTimeString, e);
      return 'Invalid Date';
    }
  };

  // Function to format currency
  const formatCurrency = (amount: number | null) => {
    if (amount === null || isNaN(amount)) return 'MMK 0';
    return `MMK ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Function to handle CSV export
  const handleExportCSV = () => {
    if (!filteredRecords.length) return;

    const headers = ['Order ID', 'Check-In Time', 'Check-Out Time', 'Service', 'Therapist', 'Helper', 'Customer', 'Seller Name', 'Phone', 'Payment Method', 'Status', 'Total'];
    const rows = filteredRecords.map(record => [
      record.OrderId ?? '-',
      formatDisplayDateTime(record.CheckInTime),
      formatDisplayDateTime(record.CheckOutTime),
      record.Servicename ?? '-',
      record.TherapicName ?? '-',
      record.HelperName ?? '-',
      record.CustomerName ?? '-',
      record.SellerName ?? '-',
      record.CustomerPhoneNumber ?? '-',
      record.PaymentMethod ?? '-',
      record.PaymentStatus ?? '-',
      formatCurrency(record.Total)
    ]);

    let csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `check_in_out_records_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusChipColor = (status: string | null): "success" | "warning" | "error" | "default" | "info" => {
    switch (status?.toUpperCase()) {
      case 'PAID': return "success";
      case 'PENDING': return "warning";
      case 'CANCELLED':
      case 'REFUNDED': return "error";
      default: return "default";
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Paper
        sx={{
          p: 3,
          m: 3,
          bgcolor: isDarkMode ? alpha(theme.palette.background.paper, 0.85) : theme.palette.background.paper,
          borderRadius: 2,
          boxShadow: isDarkMode ? `0 8px 40px -12px ${alpha(theme.palette.common.black, 0.5)}` : theme.shadows[3],
          border: isDarkMode ? `1px solid ${alpha(theme.palette.divider, 0.2)}` : 'none',
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography
            variant="h5"
            component="h1"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}
          >
            <ArrowBackIcon sx={{ cursor: 'pointer' }} onClick={() => window.history.back()} /> {/* Example Back Button */}
            Check-In/Out Records
          </Typography>
          <Box>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchData}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportCSV}
              disabled={!filteredRecords.length || loading}
            >
              Export CSV
            </Button>
          </Box>
        </Box>

        {/* Filters */}
        <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: isDarkMode ? alpha(theme.palette.background.default, 0.6) : alpha(theme.palette.primary.main, 0.05), borderRadius: 1.5 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Date Range</Typography>
              <ButtonGroup variant="outlined" size="small" fullWidth>
                <Button onClick={() => setDateRange('day')} variant={dateRange === 'day' ? 'contained' : 'outlined'}>Day</Button>
                <Button onClick={() => setDateRange('week')} variant={dateRange === 'week' ? 'contained' : 'outlined'}>Week</Button>
                <Button onClick={() => setDateRange('month')} variant={dateRange === 'month' ? 'contained' : 'outlined'}>Month</Button>
              </ButtonGroup>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>End Date</Typography>
              <DatePicker
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Payment Status</Typography>
              <Select
                value={paymentStatusFilter}
                onChange={(e: SelectChangeEvent<string>) => setPaymentStatusFilter(e.target.value)}
                size="small"
                fullWidth
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="refunded">Refunded</MenuItem>
                {/* Add other statuses if needed */}
              </Select>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Search Records</Typography>
              <TextField
                placeholder="Customer, service, therapist, seller..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Record Count and Loading/Error State */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {loading ? 'Loading records...' : `${filteredRecords.length} records found`}
          </Typography>
          {error && <Alert severity="error" sx={{ py: 0, px: 1 }}>{error}</Alert>}
        </Box>

        {/* Data Table */}
        <TableContainer component={Paper} elevation={1} sx={{ maxHeight: '65vh', overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1400 }}>
            <TableHead>
              <TableRow>
                <TableCell>Order ID</TableCell>
                <TableCell>Check-In Time</TableCell>
                <TableCell>Check-Out Time</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Therapist</TableCell>
                <TableCell>Helper</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell sx={{ bgcolor: '#2563eb', color: 'white', fontWeight: 'bold', minWidth: 130 }}>Seller Name</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} align="center">
                    <CircularProgress sx={{ my: 4 }} />
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 && !error ? (
                <TableRow>
                  <TableCell colSpan={12} align="center">
                    <Typography color="text.secondary" sx={{ my: 4 }}>No records match the current filters.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record, index) => (
                  <TableRow
                    key={record.OrderId ? `${record.OrderId}-${index}` : `record-${index}`}
                    hover
                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                  >
                    <TableCell>{record.OrderId ?? '-'}</TableCell>
                    <TableCell>{formatDisplayDateTime(record.CheckInTime)}</TableCell>
                    <TableCell>{formatDisplayDateTime(record.CheckOutTime)}</TableCell>
                    <TableCell>{record.Servicename}</TableCell>
                    <TableCell>{record.TherapicName}</TableCell>
                    <TableCell>{record.HelperName ?? '-'}</TableCell>
                    <TableCell>{record.CustomerName ?? '-'}</TableCell>
                    <TableCell sx={{ bgcolor: '#1e40af', color: 'white', fontWeight: 'bold', minWidth: 130 }}>{record.SellerName ?? '-'}</TableCell>
                    <TableCell>{record.CustomerPhoneNumber}</TableCell>
                    <TableCell>{record.PaymentMethod ?? '-'}</TableCell>
                    <TableCell>
                      <Chip
                        label={record.PaymentStatus ?? '-'}
                        size="small"
                        color={getStatusChipColor(record.PaymentStatus)}
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(record.Total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </LocalizationProvider>
  );
};

export default CheckInCheckOutPage; 