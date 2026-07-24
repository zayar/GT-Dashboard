import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
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
  ButtonGroup
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useClinic } from '../contexts/ClinicContext';
import { useAuth } from '../contexts/AuthContext';
import { formatAppointmentDateTime, MYANMAR_TIME_LABEL } from '../utils/checkInOutReport';
import {
  fetchAppointmentRecords,
  type AppointmentRecord,
  type BookingStatus,
} from '../api/apicoreReports';

type AppointmentStatusFilter = 'all' | BookingStatus;

const AppointmentsListPage: React.FC = () => {
  const [records, setRecords] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentClinic } = useClinic();
  const { getAccessToken } = useAuth();

  // Filter states
  const [dateRange, setDateRange] = useState<'day' | 'week' | 'month'>('day');
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [statusFilter, setStatusFilter] = useState<AppointmentStatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestIdRef = useRef(0);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

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
    const requestId = ++requestIdRef.current;
    if (!currentClinic) {
      setError("No clinic selected");
      return;
    }

    setLoading(true);
    setError(null);

    const calculatedStartDate = getStartDate(dateRange, endDate);
    const calculatedEndDate = getEndDateRange(dateRange, endDate);

    if (!calculatedStartDate || !calculatedEndDate) {
        setError("Invalid date range selected.");
        setLoading(false);
        return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const nextRecords = await fetchAppointmentRecords({
        clinicCode: currentClinic.code,
        startDate: calculatedStartDate,
        endDate: calculatedEndDate,
        status: statusFilter === 'all' ? undefined : statusFilter,
        accessToken,
      });

      if (requestId !== requestIdRef.current) return;

      setRecords(nextRecords);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return;
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch appointment records');
      setRecords([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange, endDate, statusFilter, currentClinic, getAccessToken]);

  useEffect(() => {
    if (currentClinic) {
      fetchData();
    }
  }, [fetchData, currentClinic]);

  // Memoized filtered records based on search term
  const filteredRecords = useMemo(() => {
    if (!deferredSearchTerm) {
      return records;
    }
    const lowerSearchTerm = deferredSearchTerm.toLowerCase();
    return records.filter(record =>
      record.MemberName?.toLowerCase().includes(lowerSearchTerm) ||
      record.ServiceName?.toLowerCase().includes(lowerSearchTerm) ||
      record.PractitionerName?.toLowerCase().includes(lowerSearchTerm) ||
      record.MemberPhoneNumber?.includes(deferredSearchTerm) ||
      record.bookingid?.toLowerCase().includes(lowerSearchTerm) ||
      record.ClinicName?.toLowerCase().includes(lowerSearchTerm)
    );
  }, [records, deferredSearchTerm]);

  useEffect(() => {
    setPage(0);
  }, [dateRange, endDate, statusFilter, deferredSearchTerm, rowsPerPage]);

  const lastPage = Math.max(0, Math.ceil(filteredRecords.length / rowsPerPage) - 1);
  const effectivePage = Math.min(page, lastPage);

  const paginatedRecords = useMemo(
    () => filteredRecords.slice(effectivePage * rowsPerPage, effectivePage * rowsPerPage + rowsPerPage),
    [effectivePage, filteredRecords, rowsPerPage]
  );

  const statusCounts = useMemo(() => {
    return filteredRecords.reduce<Record<string, number>>((counts, record) => {
      const status = record.status?.toUpperCase() || 'UNKNOWN';
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
  }, [filteredRecords]);

  const selectedPeriodLabel = useMemo(() => {
    const start = getStartDate(dateRange, endDate);
    const end = getEndDateRange(dateRange, endDate);
    if (!start || !end) return 'No date selected';
    if (dateRange === 'day') return format(start, 'EEEE, MMM d, yyyy');
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  }, [dateRange, endDate]);

  // Function to handle CSV export
  const handleExportCSV = () => {
    if (!filteredRecords.length) return;

    const headers = ['Booking ID', 'From (Myanmar Time)', 'To (Myanmar Time)', 'Service', 'Member', 'Phone', 'Practitioner', 'Status', 'Helper', 'Note'];
    const rows = filteredRecords.map(record => [
      record.bookingid ?? '-',
      formatAppointmentDateTime(record.FromTime),
      formatAppointmentDateTime(record.ToTime),
      record.ServiceName ?? '-',
      record.MemberName ?? '-',
      record.MemberPhoneNumber ?? '-',
      record.PractitionerName ?? '-',
      record.status ?? '-',
      record.HelperName ?? '-',
      record.member_note ?? '-' // Handle quotes/commas in notes if necessary
    ]);

    // Simple escaping for CSV (replace quotes with double quotes)
    const escapeCsv = (field: string) => `"${String(field).replace(/"/g, '""')}"`;

    const csvContent = headers.map(escapeCsv).join(",") + "\n"
      + rows.map(row => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", objectUrl);
    link.setAttribute("download", `appointments_${format(getStartDate(dateRange, endDate) || new Date(), 'yyyyMMdd')}_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  // Determine chip color based on appointment status
   const getStatusChipColor = (status: string | null): "success" | "warning" | "error" | "default" | "info" => {
      switch (status?.toUpperCase()) {
        case 'BOOKED':
        case 'CHECKOUT':
             return "success";
        case 'REQUEST':
        case 'CHECKIN': return "info";
        case 'NO_SHOW': return "warning";
        case 'MEMBER_CANCEL':
        case 'MERCHANT_CANCEL': return "error";
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
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
              Appointment List
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedPeriodLabel}
              {lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
              {` · Times shown in ${MYANMAR_TIME_LABEL}`}
            </Typography>
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
            borderRadius: 2,
          }}
        >
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
                 <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>
                   {dateRange === 'day' ? 'Date' : dateRange === 'week' ? 'Week containing' : 'Month containing'}
                 </Typography>
                 <DatePicker
                     value={endDate}
                     onChange={(newValue) => setEndDate(newValue)}
                     slotProps={{ textField: { size: 'small', fullWidth: true } }}
                 />
             </Grid>
             <Grid item xs={12} sm={6} md={3}>
                 <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Appointment Status</Typography>
                 <Select
                     value={statusFilter}
                     onChange={(e: SelectChangeEvent<AppointmentStatusFilter>) => (
                       setStatusFilter(e.target.value as AppointmentStatusFilter)
                     )}
                     size="small"
                     fullWidth
                 >
                     <MenuItem value="all">All Statuses</MenuItem>
                     <MenuItem value="REQUEST">Request</MenuItem>
                     <MenuItem value="BOOKED">Booked</MenuItem>
                     <MenuItem value="CHECKIN">Checked in</MenuItem>
                     <MenuItem value="CHECKOUT">Checked out</MenuItem>
                     <MenuItem value="NO_SHOW">No show</MenuItem>
                     <MenuItem value="MEMBER_CANCEL">Member cancelled</MenuItem>
                     <MenuItem value="MERCHANT_CANCEL">Merchant cancelled</MenuItem>
                 </Select>
             </Grid>
              <Grid item xs={12} sm={6} md={3}>
                 <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Search Records</Typography>
                 <TextField
                     placeholder="Booking ID, member, phone or service"
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
          <Chip label={`${filteredRecords.length} appointments`} variant="outlined" />
          {!!statusCounts.BOOKED && <Chip label={`${statusCounts.BOOKED} booked`} color="success" variant="outlined" />}
          {!!statusCounts.CHECKIN && <Chip label={`${statusCounts.CHECKIN} checked in`} color="info" variant="outlined" />}
          {!!statusCounts.CHECKOUT && <Chip label={`${statusCounts.CHECKOUT} checked out`} color="success" variant="outlined" />}
          {!!(statusCounts.MEMBER_CANCEL || statusCounts.MERCHANT_CANCEL) && (
            <Chip
              label={`${(statusCounts.MEMBER_CANCEL || 0) + (statusCounts.MERCHANT_CANCEL || 0)} cancelled`}
              color="error"
              variant="outlined"
            />
          )}
          {searchTerm && filteredRecords.length !== records.length && (
            <Typography variant="caption" color="text.secondary">
              Filtered from {records.length} loaded records
            </Typography>
          )}
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Data Table */}
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loading && <LinearProgress aria-label="Loading appointments" />}
          <TableContainer sx={{ maxHeight: '62vh', opacity: loading && records.length ? 0.6 : 1, transition: 'opacity 160ms ease' }}>
          <Table stickyHeader size="small" aria-label="Appointments" aria-busy={loading}>
            <TableHead>
              <TableRow>
                {/* Adjust columns based on what's most important */}
                <TableCell sx={{ minWidth: 145, width: 145 }}>From Time (MMT)</TableCell>
                <TableCell sx={{ minWidth: 145, width: 145 }}>To Time (MMT)</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Member</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Practitioner</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Helper</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography color="text.secondary" sx={{ my: 4 }}>Loading appointments…</Typography>
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={9} align="center">
                     <Typography color="text.secondary" sx={{ my: 4 }}>
                       {error ? 'Appointment data is unavailable.' : 'No appointments match the current filters.'}
                     </Typography>
                   </TableCell>
                 </TableRow>
              ) : (
                paginatedRecords.map((record, index) => (
                  <TableRow
                    key={`${record.bookingid}-${record.FromTime}-${record.ServiceName}-${index}`}
                    hover
                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                  >
                    <TableCell sx={{ minWidth: 145, width: 145, whiteSpace: 'nowrap' }}>{formatAppointmentDateTime(record.FromTime)}</TableCell>
                    <TableCell sx={{ minWidth: 145, width: 145, whiteSpace: 'nowrap' }}>{formatAppointmentDateTime(record.ToTime)}</TableCell>
                    <TableCell>{record.ServiceName}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{record.MemberName ?? '-'}</Typography>
                      <Typography variant="caption" color="text.secondary">#{record.bookingid}</Typography>
                    </TableCell>
                    <TableCell>
                      {record.MemberPhoneNumber ? (
                        <Typography
                          component="a"
                          href={`tel:${record.MemberPhoneNumber}`}
                          variant="body2"
                          sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                        >
                          {record.MemberPhoneNumber}
                        </Typography>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{record.PractitionerName}</TableCell>
                    <TableCell>
                      <Chip
                        label={record.status ?? '-'}
                        size="small"
                        color={getStatusChipColor(record.status)}
                        variant="filled"
                       />
                    </TableCell>
                    <TableCell>{record.HelperName ?? '-'}</TableCell>
                    <TableCell title={record.member_note ?? ''} sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {record.member_note ?? '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredRecords.length}
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

export default AppointmentsListPage;
