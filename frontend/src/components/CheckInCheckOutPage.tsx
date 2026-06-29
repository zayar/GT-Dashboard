import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  SelectChangeEvent,
  Chip,
  ButtonGroup
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack'; // Assuming you might want a back button
import { useClinic } from '../contexts/ClinicContext';
import axios from 'axios'; // Import axios for making direct API calls
import { formatCurrency as formatCurrencyUtil } from '../utils/currency';
import {
  buildCheckInOutRecordsQuery,
  CheckInOutDateRange,
  CheckInOutStatusFilter,
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  formatReportDateTime,
  getCheckInOutDateRangeBounds,
  MERCHANT_CANCEL_STATUS,
  ORDER_CANCEL_STATUS,
} from '../utils/checkInOutReport';

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
  PaymentStatus: string | null; // Adjust enum values if needed
  Total: number | null;
  Discount: number | null;
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

const CheckInCheckOutPage: React.FC = () => {
  const [records, setRecords] = useState<CheckInOutRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentClinic } = useClinic();

  // Filter states
  const [dateRange, setDateRange] = useState<CheckInOutDateRange>('day');
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date | null>(new Date());
  const [statusFilter, setStatusFilter] = useState<CheckInOutStatusFilter>(DEFAULT_CHECK_IN_OUT_STATUS_FILTER);
  const [searchTerm, setSearchTerm] = useState('');
  const latestRequestIdRef = useRef(0);

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Function to format date strings for SQL queries
  const formatDateForSQL = (date: Date | null): string => {
    if (!date) return '';
    return format(date, 'yyyy-MM-dd HH:mm:ss');
  };

  const isCustomDateRange = dateRange === 'custom';

  const fetchData = useCallback(async () => {
    if (!currentClinic) {
      setError("No clinic selected");
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const isLatestRequest = () => latestRequestIdRef.current === requestId;

    setLoading(true);
    setError(null);

    const dateBounds = getCheckInOutDateRangeBounds({
      dateRange,
      reportDate: endDate,
      customStartDate,
      customEndDate,
    });

    if (!dateBounds) {
      setError(isCustomDateRange ? "Invalid custom date range selected." : "Invalid date range selected.");
      setLoading(false);
      return;
    }

    const query = buildCheckInOutRecordsQuery({
      startDate: formatDateForSQL(dateBounds.startDate),
      endDate: formatDateForSQL(dateBounds.endDate),
      clinicCode: currentClinic.code,
      statusFilter,
    });

    try {
      const searchQuery = new URLSearchParams({
        scope: "view.query"
      })
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/sqlquery?${searchQuery}`, {
        ...connectionConfig,
        query: query
      });

      if (!isLatestRequest()) {
        return;
      }

      if (response.data.success) {
        setRecords(response.data.data || []);
      } else {
        setError(response.data.error || response.data.message || 'Failed to fetch check-in/out records');
        setRecords([]); // Clear records on error
      }
    } catch (err: any) {
      if (!isLatestRequest()) {
        return;
      }

      console.error('Fetch error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to fetch data');
      setRecords([]); // Clear records on error
    } finally {
      if (isLatestRequest()) {
        setLoading(false);
      }
    }
  }, [currentClinic, customEndDate, customStartDate, dateRange, endDate, isCustomDateRange, statusFilter]); // Added currentClinic to dependencies

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
    const trimmedSearchTerm = searchTerm.trim();
    const lowerSearchTerm = trimmedSearchTerm.toLowerCase();
    const normalizedSearchTerm = lowerSearchTerm.replace(/[^a-z0-9]/g, '');

    return records.filter(record => {
      const orderId = record.OrderId?.toLowerCase() ?? '';
      const normalizedOrderId = orderId.replace(/[^a-z0-9]/g, '');

      return (
        orderId.includes(lowerSearchTerm) ||
        (normalizedSearchTerm.length > 0 && normalizedOrderId.includes(normalizedSearchTerm)) ||
        record.CustomerName?.toLowerCase().includes(lowerSearchTerm) ||
        record.Servicename?.toLowerCase().includes(lowerSearchTerm) ||
        record.TherapicName?.toLowerCase().includes(lowerSearchTerm) ||
        record.CustomerPhoneNumber?.includes(trimmedSearchTerm) ||
        record.SellerName?.toLowerCase().includes(lowerSearchTerm)
      );
    });
  }, [records, searchTerm]);

  const recordsForDisplay = useMemo(() => {
    const displayedOrderIds = new Set<string>();

    return filteredRecords.map(record => {
      const orderId = record.OrderId?.trim();
      const shouldShowDiscount = !orderId || !displayedOrderIds.has(orderId);

      if (orderId && shouldShowDiscount) {
        displayedOrderIds.add(orderId);
      }

      return {
        ...record,
        DisplayDiscount: shouldShowDiscount ? record.Discount : null
      };
    });
  }, [filteredRecords]);

  // Function to format currency
  const formatCurrency = (amount: number | null) => {
    if (amount === null || isNaN(amount)) return formatCurrencyUtil(0, currentClinic);
    return formatCurrencyUtil(amount, currentClinic);
  };

  const formatCSVAmount = (amount: number | null) => {
    if (amount === null || amount === undefined) return '';

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return '';

    return Number.isInteger(numericAmount)
      ? numericAmount.toString()
      : numericAmount.toString();
  };

  // Function to handle CSV export
  const handleExportCSV = () => {
    if (!recordsForDisplay.length) return;

    const headers = ['Order ID', 'Check-In Time', 'Check-Out Time', 'Service', 'Therapist', 'Helper', 'Customer', 'Seller Name', 'Phone', 'Payment Method', 'Status', 'Discount', 'Total'];
    const rows = recordsForDisplay.map(record => [
      record.OrderId ?? '-',
      formatReportDateTime(record.CheckInTime),
      formatReportDateTime(record.CheckOutTime),
      record.Servicename ?? '-',
      record.TherapicName ?? '-',
      record.HelperName ?? '-',
      record.CustomerName ?? '-',
      record.SellerName ?? '-',
      record.CustomerPhoneNumber ?? '-',
      record.PaymentMethod ?? '-',
      record.PaymentStatus ?? '-',
      formatCSVAmount(record.DisplayDiscount),
      formatCSVAmount(record.Total)
    ]);

    const escapeCSVCell = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    let csvContent = "data:text/csv;charset=utf-8,"
      + headers.map(escapeCSVCell).join(",") + "\n"
      + rows.map(row => row.map(escapeCSVCell).join(",")).join("\n");

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
      case 'UNPAID':
      case 'PARTIAL_PAID':
      case 'PENDING': return "warning";
      case MERCHANT_CANCEL_STATUS.toUpperCase():
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
                <Button onClick={() => setDateRange('custom')} variant={dateRange === 'custom' ? 'contained' : 'outlined'}>Custom</Button>
              </ButtonGroup>
            </Grid>
            {isCustomDateRange ? (
              <>
                <Grid item xs={12} sm={6} md={2}>
                  <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>From Date</Typography>
                  <DatePicker
                    value={customStartDate}
                    onChange={(newValue) => setCustomStartDate(newValue)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>To Date</Typography>
                  <DatePicker
                    value={customEndDate}
                    onChange={(newValue) => setCustomEndDate(newValue)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Grid>
              </>
            ) : (
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Report Date</Typography>
                <DatePicker
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>
            )}
            <Grid item xs={12} sm={6} md={isCustomDateRange ? 2 : 3}>
              <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Status</Typography>
              <Select
                value={statusFilter}
                onChange={(e: SelectChangeEvent<CheckInOutStatusFilter>) => setStatusFilter(e.target.value as CheckInOutStatusFilter)}
                size="small"
                fullWidth
              >
                <MenuItem value={DEFAULT_CHECK_IN_OUT_STATUS_FILTER}>All Active Statuses</MenuItem>
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="PAID">Paid</MenuItem>
                <MenuItem value="UNPAID">Unpaid</MenuItem>
                <MenuItem value="PARTIAL_PAID">Partial Paid</MenuItem>
                <MenuItem value={MERCHANT_CANCEL_STATUS}>{MERCHANT_CANCEL_STATUS}</MenuItem>
                <MenuItem value={ORDER_CANCEL_STATUS}>{ORDER_CANCEL_STATUS}</MenuItem>
              </Select>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Search Records</Typography>
              <TextField
                placeholder="Order ID, customer, service, therapist..."
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
          <Table stickyHeader size="small" sx={{ minWidth: 1500 }}>
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
                <TableCell align="right">Discount</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} align="center">
                    <CircularProgress sx={{ my: 4 }} />
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 && !error ? (
                <TableRow>
                  <TableCell colSpan={13} align="center">
                    <Typography color="text.secondary" sx={{ my: 4 }}>No records match the current filters.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                recordsForDisplay.map((record, index) => (
                  <TableRow
                    key={record.OrderId ? `${record.OrderId}-${index}` : `record-${index}`}
                    hover
                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                  >
                    <TableCell>{record.OrderId ?? '-'}</TableCell>
                    <TableCell>{formatReportDateTime(record.CheckInTime)}</TableCell>
                    <TableCell>{formatReportDateTime(record.CheckOutTime)}</TableCell>
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
                    <TableCell align="right">
                      {record.DisplayDiscount === null ? '' : formatCurrency(record.DisplayDiscount)}
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
