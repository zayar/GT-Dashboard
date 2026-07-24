import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
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
  ButtonGroup,
  IconButton
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
import { useAuth } from '../contexts/AuthContext';
import {
  fetchCheckInOutRecords,
  filterCheckInOutRecords,
  type CheckInOutRecord,
} from '../api/apicoreReports';
import { formatCurrency as formatCurrencyUtil } from '../utils/currency';
import {
  CheckInOutDateRange,
  CheckInOutStatusFilter,
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  formatGraphqlDateTimeInMyanmar,
  getCheckInOutDateRangeBounds,
  MERCHANT_CANCEL_STATUS,
  MYANMAR_TIME_LABEL,
  ORDER_CANCEL_STATUS,
} from '../utils/checkInOutReport';

const CheckInCheckOutPage: React.FC = () => {
  const [records, setRecords] = useState<CheckInOutRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentClinic } = useClinic();
  const { getAccessToken } = useAuth();

  // Filter states
  const [dateRange, setDateRange] = useState<CheckInOutDateRange>('day');
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date | null>(new Date());
  const [statusFilter, setStatusFilter] = useState<CheckInOutStatusFilter>(DEFAULT_CHECK_IN_OUT_STATUS_FILTER);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const latestRequestIdRef = useRef(0);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

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

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const nextRecords = await fetchCheckInOutRecords({
        clinicId: currentClinic.id,
        startDate: dateBounds.startDate,
        endDate: dateBounds.endDate,
        accessToken,
      });

      if (!isLatestRequest()) {
        return;
      }

      setRecords(nextRecords);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      if (!isLatestRequest()) {
        return;
      }

      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch check-in/out records');
      setRecords([]);
    } finally {
      if (isLatestRequest()) {
        setLoading(false);
      }
    }
  }, [currentClinic, customEndDate, customStartDate, dateRange, endDate, getAccessToken, isCustomDateRange]);

  useEffect(() => {
    if (currentClinic) {
      fetchData();
    }
  }, [fetchData, currentClinic]); // Added currentClinic to dependencies

  // Memoized filtered records based on search term
  const filteredRecords = useMemo(() => {
    const statusFilteredRecords = filterCheckInOutRecords(records, statusFilter);

    if (!deferredSearchTerm) {
      return statusFilteredRecords;
    }
    const trimmedSearchTerm = deferredSearchTerm;
    const lowerSearchTerm = trimmedSearchTerm.toLowerCase();
    const normalizedSearchTerm = lowerSearchTerm.replace(/[^a-z0-9]/g, '');

    return statusFilteredRecords.filter(record => {
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
  }, [records, deferredSearchTerm, statusFilter]);

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
        DisplayDiscount: shouldShowDiscount ? record.Discount : null,
        IsFirstOrderRow: shouldShowDiscount
      };
    });
  }, [filteredRecords]);

  useEffect(() => {
    setPage(0);
  }, [dateRange, endDate, customStartDate, customEndDate, statusFilter, deferredSearchTerm, rowsPerPage]);

  const lastPage = Math.max(0, Math.ceil(recordsForDisplay.length / rowsPerPage) - 1);
  const effectivePage = Math.min(page, lastPage);
  const paginatedRecords = useMemo(
    () => recordsForDisplay.slice(effectivePage * rowsPerPage, effectivePage * rowsPerPage + rowsPerPage),
    [effectivePage, recordsForDisplay, rowsPerPage]
  );

  const recordSummary = useMemo(() => {
    const orderIds = new Set<string>();
    const paidOrderIds = new Set<string>();
    const sellerAssignedOrderIds = new Set<string>();

    filteredRecords.forEach((record, index) => {
      const orderKey = record.OrderId?.trim() || `record-${index}`;
      orderIds.add(orderKey);
      if (record.PaymentStatus?.toUpperCase() === 'PAID') paidOrderIds.add(orderKey);
      if (record.SellerName?.trim()) sellerAssignedOrderIds.add(orderKey);
    });

    return {
      orders: orderIds.size,
      paidOrders: paidOrderIds.size,
      sellerAssignedOrders: sellerAssignedOrderIds.size
    };
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

    const headers = ['Order ID', 'Check-In Time (Myanmar Time)', 'Check-Out Time (Myanmar Time)', 'Service', 'Therapist', 'Helper', 'Customer', 'Seller Name', 'Phone', 'Payment Method', 'Status', 'Discount', 'Service Amount'];
    const rows = recordsForDisplay.map(record => [
      record.OrderId ?? '-',
      formatGraphqlDateTimeInMyanmar(record.CheckInTime),
      formatGraphqlDateTimeInMyanmar(record.CheckOutTime),
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

    const csvContent = headers.map(escapeCSVCell).join(",") + "\n"
      + rows.map(row => row.map(escapeCSVCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", objectUrl);
    link.setAttribute("download", `check_in_out_records_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const getStatusChipColor = (status: string | null): "success" | "warning" | "error" | "default" | "info" => {
    switch (status?.toUpperCase()) {
      case 'PAID': return "success";
      case 'UNPAID':
      case 'PARTIAL_PAID':
      case 'PENDING': return "warning";
      case MERCHANT_CANCEL_STATUS.toUpperCase():
      case ORDER_CANCEL_STATUS.toUpperCase():
      case 'CANCELLED':
      case 'REFUNDED': return "error";
      default: return "default";
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Paper
        sx={{
          p: { xs: 2, md: 3 },
          m: { xs: 1.5, md: 3 },
          bgcolor: isDarkMode ? alpha(theme.palette.background.paper, 0.85) : theme.palette.background.paper,
          borderRadius: 3,
          boxShadow: isDarkMode ? `0 8px 40px -12px ${alpha(theme.palette.common.black, 0.5)}` : theme.shadows[2],
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <IconButton size="small" aria-label="Go back" onClick={() => window.history.back()} sx={{ mt: 0.25 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Box>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
                Check-In/Out Records
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Service-level transaction records filtered by check-in time · Times shown in {MYANMAR_TIME_LABEL}{lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchData}
              disabled={loading}
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
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            bgcolor: isDarkMode ? alpha(theme.palette.background.default, 0.6) : theme.palette.background.default,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2
          }}
        >
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

        {/* Operational summary */}
        <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={`${recordSummary.orders} orders`} variant="outlined" />
          <Chip label={`${filteredRecords.length} service lines`} variant="outlined" />
          {!!recordSummary.paidOrders && <Chip label={`${recordSummary.paidOrders} paid`} color="success" variant="outlined" />}
          {!!recordSummary.orders && (
            <Chip
              label={`Seller assigned ${recordSummary.sellerAssignedOrders}/${recordSummary.orders}`}
              variant="outlined"
              sx={{ color: 'text.secondary', borderColor: 'divider' }}
            />
          )}
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Data Table */}
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loading && <LinearProgress aria-label="Loading check-in and check-out records" />}
          <TableContainer sx={{ maxHeight: '62vh', overflowX: 'auto', opacity: loading && records.length ? 0.6 : 1, transition: 'opacity 160ms ease' }}>
          <Table stickyHeader size="small" aria-label="Check-in and check-out records" aria-busy={loading} sx={{ minWidth: 1500 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: 'sticky', left: 0, zIndex: 4, minWidth: 100, borderRight: `1px solid ${theme.palette.divider}` }}>Order ID</TableCell>
                <TableCell>Check-In Time (MMT)</TableCell>
                <TableCell>Check-Out Time (MMT)</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Therapist</TableCell>
                <TableCell>Helper</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell sx={{ minWidth: 150 }}>Seller Name</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Discount</TableCell>
                <TableCell align="right">Service Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center">
                    <Typography color="text.secondary" sx={{ my: 4 }}>Loading records…</Typography>
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center">
                    <Typography color="text.secondary" sx={{ my: 4 }}>
                      {error ? 'Check-in/out data is unavailable.' : 'No records match the current filters.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRecords.map((record, index) => (
                  <TableRow
                    key={`${record.id}-${index}`}
                    hover
                    sx={{
                      '&:last-child td, &:last-child th': { borderBottom: 0 },
                      ...(record.IsFirstOrderRow && index > 0 ? { '& td': { borderTop: `2px solid ${theme.palette.divider}` } } : {})
                    }}
                  >
                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {record.OrderId ?? '-'}
                    </TableCell>
                    <TableCell>{formatGraphqlDateTimeInMyanmar(record.CheckInTime)}</TableCell>
                    <TableCell>{formatGraphqlDateTimeInMyanmar(record.CheckOutTime)}</TableCell>
                    <TableCell>{record.Servicename}</TableCell>
                    <TableCell>{record.TherapicName}</TableCell>
                    <TableCell>{record.HelperName ?? '-'}</TableCell>
                    <TableCell>{record.CustomerName ?? '-'}</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      {record.SellerName ? (
                        <Chip
                          label={record.SellerName}
                          size="small"
                          variant="outlined"
                          sx={{ color: 'text.primary', bgcolor: 'background.default', borderColor: 'divider', fontWeight: 500 }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">Unassigned</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.CustomerPhoneNumber ? (
                        <Typography
                          component="a"
                          href={`tel:${record.CustomerPhoneNumber}`}
                          variant="body2"
                          sx={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                        >
                          {record.CustomerPhoneNumber}
                        </Typography>
                      ) : '-'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{record.PaymentMethod ?? '-'}</TableCell>
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
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatCurrency(record.Total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={recordsForDisplay.length}
            page={effectivePage}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => setRowsPerPage(Number(event.target.value))}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Rows"
          />
        </Paper>
      </Paper>
    </LocalizationProvider>
  );
};

export default CheckInCheckOutPage;
