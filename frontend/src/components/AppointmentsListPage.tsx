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
import axios from 'axios';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useClinic } from '../contexts/ClinicContext';

// Interface based on appointmentview schema
interface AppointmentRecord {
  bookingid: string;
  FromTime: string | null;
  ToTime: string | null;
  ServiceName: string;
  MemberName: string | null;
  MemberPhoneNumber: string;
  PractitionerName: string;
  ClinicName: string;
  ClinicCode: string | null;
  ClinicID: string;
  HelperName: string | null;
  status: 'REQUEST' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | string; // Add known statuses + string fallback
  member_note: string | null;
}

// MySQL connection details (copied from CheckInCheckOutPage)
const connectionConfig = {
  host: '34.69.63.226',
  port: 3306,
  user: 'gtadmin',
  password: 'gtapp456$%^',
  database: 'great_time'
};

// Base URL for the MySQL service
const MYSQL_SERVICE_URL = 'http://localhost:5004/api/mysql';

const AppointmentsListPage: React.FC = () => {
  const [records, setRecords] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentClinic } = useClinic();

  // Filter states
  const [dateRange, setDateRange] = useState<'day' | 'week' | 'month'>('day');
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Filter by appointment status
  const [searchTerm, setSearchTerm] = useState('');

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Function to format date strings for SQL queries
  const formatDateForSQL = (date: Date | null): string => {
    if (!date) return '';
    // Use FromTime for filtering appointments
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
    const calculatedEndDate = getEndDateRange(dateRange, endDate);

    if (!calculatedStartDate || !calculatedEndDate) {
        setError("Invalid date range selected.");
        setLoading(false);
        return;
    }

    // Query appointmentview table
    let query = `
      SELECT
        bookingid, FromTime, ToTime, ServiceName, MemberName, MemberPhoneNumber,
        PractitionerName, ClinicName, ClinicCode, ClinicID, HelperName, status, member_note
      FROM appointmentview
      WHERE FromTime >= '${formatDateForSQL(calculatedStartDate)}'
        AND FromTime <= '${formatDateForSQL(calculatedEndDate)}'
        AND ClinicCode = '${currentClinic.code}'
    `;

    // Add status filter if not 'all'
    if (statusFilter !== 'all') {
      query += ` AND status = '${statusFilter.toUpperCase()}'`;
    }

    query += ` ORDER BY FromTime DESC;`;

    try {
      const response = await axios.post(`${MYSQL_SERVICE_URL}/query`, {
        ...connectionConfig,
        query: query
      });

      if (response.data.success) {
        setRecords(response.data.data || []);
      } else {
        setError(response.data.error || response.data.message || 'Failed to fetch appointment records');
        setRecords([]);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to fetch data');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, endDate, statusFilter, currentClinic]);

  useEffect(() => {
    if (currentClinic) {
      fetchData();
    }
  }, [fetchData, currentClinic]);

  // Memoized filtered records based on search term
  const filteredRecords = useMemo(() => {
    if (!searchTerm) {
      return records;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return records.filter(record =>
      record.MemberName?.toLowerCase().includes(lowerSearchTerm) ||
      record.ServiceName?.toLowerCase().includes(lowerSearchTerm) ||
      record.PractitionerName?.toLowerCase().includes(lowerSearchTerm) ||
      record.MemberPhoneNumber?.includes(searchTerm) ||
      record.bookingid?.toLowerCase().includes(lowerSearchTerm) ||
      record.ClinicName?.toLowerCase().includes(lowerSearchTerm)
    );
  }, [records, searchTerm]);

  // Function to format date for display
  const formatDisplayDateTime = (dateTimeString: string | null) => {
    if (!dateTimeString) return '-';
    try {
        const date = parseISO(dateTimeString.endsWith('Z') ? dateTimeString : dateTimeString.replace(' ', 'T') + 'Z');
       return format(date, 'MMM dd, hh:mm a'); // More compact format
    } catch (e) {
       console.error("Error parsing date:", dateTimeString, e);
       return 'Invalid Date';
    }
  };

  // Function to handle CSV export
  const handleExportCSV = () => {
    if (!filteredRecords.length) return;

    const headers = ['From', 'To', 'Service', 'Member', 'Phone', 'Practitioner', 'Status', 'Helper', 'Note'];
    const rows = filteredRecords.map(record => [
      formatDisplayDateTime(record.FromTime),
      formatDisplayDateTime(record.ToTime),
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

    let csvContent = "data:text/csv;charset=utf-8,"
      + headers.map(escapeCsv).join(",") + "\n"
      + rows.map(row => row.map(escapeCsv).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `appointments_list_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Determine chip color based on appointment status
   const getStatusChipColor = (status: string | null): "success" | "warning" | "error" | "default" | "info" => {
      switch (status?.toUpperCase()) {
        case 'CONFIRMED':
        case 'COMPLETED':
             return "success";
        case 'REQUEST': return "info";
        case 'CANCELLED': return "error";
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
            {/* <ArrowBackIcon sx={{ cursor: 'pointer' }} onClick={() => window.history.back()} /> */}
            Appointment List
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
                 <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Appointment Status</Typography>
                 <Select
                     value={statusFilter}
                     onChange={(e: SelectChangeEvent<string>) => setStatusFilter(e.target.value)}
                     size="small"
                     fullWidth
                 >
                     <MenuItem value="all">All Statuses</MenuItem>
                     <MenuItem value="request">Request</MenuItem>
                     <MenuItem value="confirmed">Confirmed</MenuItem>
                     <MenuItem value="completed">Completed</MenuItem>
                     <MenuItem value="cancelled">Cancelled</MenuItem>
                     {/* Add other relevant statuses */}
                 </Select>
             </Grid>
              <Grid item xs={12} sm={6} md={3}>
                 <Typography variant="body2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>Search Records</Typography>
                 <TextField
                     placeholder="Booking ID, Member, Phone, ..."
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
             {loading ? 'Loading records...' : `${filteredRecords.length} appointments found`}
           </Typography>
           {error && <Alert severity="error" sx={{ py: 0, px: 1 }}>{error}</Alert>}
         </Box>

        {/* Data Table */}
        <TableContainer component={Paper} elevation={1} sx={{ maxHeight: '65vh' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {/* Adjust columns based on what's most important */}
                <TableCell sx={{ minWidth: 130, width: 130 }}>From Time</TableCell>
                <TableCell sx={{ minWidth: 130, width: 130 }}>To Time</TableCell>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <CircularProgress sx={{ my: 4 }} />
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 && !error ? (
                 <TableRow>
                   <TableCell colSpan={9} align="center">
                     <Typography color="text.secondary" sx={{ my: 4 }}>No appointments match the current filters.</Typography>
                   </TableCell>
                 </TableRow>
              ) : (
                filteredRecords.map((record, index) => (
                  <TableRow
                    key={`${record.bookingid}-${index}`} // Ensure unique key
                    hover
                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                  >
                    <TableCell sx={{ minWidth: 130, width: 130, whiteSpace: 'nowrap' }}>{formatDisplayDateTime(record.FromTime)}</TableCell>
                    <TableCell sx={{ minWidth: 130, width: 130, whiteSpace: 'nowrap' }}>{formatDisplayDateTime(record.ToTime)}</TableCell>
                    <TableCell>{record.ServiceName}</TableCell>
                    <TableCell>{record.MemberName ?? '-'}</TableCell>
                    <TableCell>{record.MemberPhoneNumber}</TableCell>
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
      </Paper>
    </LocalizationProvider>
  );
};

export default AppointmentsListPage; 