import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Avatar,
  CircularProgress,
  InputAdornment,
  Pagination,
  TableSortLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  FormControl,
  Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useClinic } from '../contexts/ClinicContext';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import DirectoryPageHeader from './DirectoryPageHeader';
import {
  buildTherapistAppointmentsQuery,
  buildTherapistSummaryQuery,
  getTherapistReportPeriod,
  TherapistFilterType,
} from '../utils/therapistReport';

interface Therapist {
  id: string;
  name: string;
  image: string;
  bookingCount: number;
}

// Add a new interface for appointment data
interface Appointment {
  therapistName: string;
  helperName: string;
  service: string;
  customer: string;
  date: string;
  bookingId: string;
}

const TherapistList: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState<keyof Therapist>('bookingCount');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  // Date filter states
  const [filterType, setFilterType] = useState<TherapistFilterType>('weekly');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().setDate(new Date().getDate() - 7))
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  // Appointment details state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [appointmentsPerPage] = useState(10);

  // Selected therapist for filtering
  const [selectedTherapist, setSelectedTherapist] = useState<string | null>(null);

  // Add state for CSV export loading
  const [exportingTherapists, setExportingTherapists] = useState(false);
  const [exportingAppointments, setExportingAppointments] = useState(false);

  useEffect(() => {
    if (currentClinic) {
      fetchTherapists();
    }
  }, [currentClinic, filterType, selectedDate, startDate, endDate]);

  useEffect(() => {
    if (currentClinic) {
      fetchAppointments();
    }
  }, [currentClinic, filterType, selectedDate, startDate, endDate, selectedTherapist]);

  const fetchTherapists = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('Current Clinic:', currentClinic);
      console.log('Current Clinic Code:', currentClinic?.code);

      const period = getTherapistReportPeriod({
        filterType,
        selectedDate,
        customStartDate: startDate,
        customEndDate: endDate,
      });
      if (!period || !currentClinic) {
        throw new Error('Invalid therapist report period or clinic.');
      }

      const query = buildTherapistSummaryQuery({
        clinicCode: currentClinic.code,
        period,
      });

      console.log('Executing query:', query);

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch employees');
      }

      const data = response.data.data;

      // Map the response data to Therapist interface
      const formattedTherapists = data.map((therapist: any, index: number) => ({
        id: index.toString(),
        name: therapist.name || 'Unknown',
        image: therapist.image || '',
        bookingCount: Number(therapist.bookingCount) || 0
      }));

      setTherapists(formattedTherapists);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching employees:', err);
      let errorMessage = 'An error occurred while fetching employee data';

      if (err.response) {
        if (err.response.data && err.response.data.error) {
          errorMessage = `Server error: ${err.response.data.error}`;
        } else {
          errorMessage = `Server error (${err.response.status}): Please check the SQL query syntax`;
        }
      } else if (err.request) {
        errorMessage = 'No response from server. Please check your connection';
      } else {
        errorMessage = err.message || 'Unknown error occurred';
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  // Add fetchAppointments function
  const fetchAppointments = async () => {
    try {
      setAppointmentsLoading(true);
      setAppointmentsError('');

      const period = getTherapistReportPeriod({
        filterType,
        selectedDate,
        customStartDate: startDate,
        customEndDate: endDate,
      });
      if (!period || !currentClinic) {
        throw new Error('Invalid therapist report period or clinic.');
      }

      const query = buildTherapistAppointmentsQuery({
        clinicCode: currentClinic.code,
        period,
        therapistName: selectedTherapist,
      });

      console.log('Executing appointments query:', query);

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch appointments');
      }

      const data = response.data.data;

      // Map the response data to Appointment interface
      const formattedAppointments = data.map((appointment: any) => ({
        therapistName: appointment.therapistName || 'Unknown',
        helperName: appointment.helperName || 'Unknown',
        service: appointment.service || 'Unknown',
        customer: appointment.customer || 'Unknown',
        date: appointment.date || 'Unknown',
        bookingId: appointment.bookingId || 'Unknown'
      }));

      setAppointments(formattedAppointments);
      setAppointmentsLoading(false);
      setAppointmentsError('');
    } catch (err: any) {
      console.error('Error fetching appointments:', err);
      let errorMessage = 'An error occurred while fetching appointment data';

      if (err.response) {
        if (err.response.data && err.response.data.error) {
          errorMessage = `Server error: ${err.response.data.error}`;
        } else {
          errorMessage = `Server error (${err.response.status}): Please check the SQL query syntax`;
        }
      } else if (err.request) {
        errorMessage = 'No response from server. Please check your connection';
      } else {
        errorMessage = err.message || 'Unknown error occurred';
      }

      setAppointmentsError(errorMessage);
      setAppointmentsLoading(false);
    }
  };

  // Handler for date filter type change
  const handleFilterTypeChange = (event: SelectChangeEvent<TherapistFilterType>) => {
    const newFilterType = event.target.value as TherapistFilterType;
    setFilterType(newFilterType);
    setPage(1);
    setAppointmentPage(1);

    // Reset data to ensure fetch happens with new filter
    setTherapists([]);

    // Handle the case when switching to/from custom date range
    if (newFilterType === 'custom') {
      // Set default range to last 7 days when switching to custom
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start);
      setEndDate(end);
    }
  };

  // Handler for single date selection
  const handleDateChange = (newDate: Date | null) => {
    if (newDate) {
      setSelectedDate(newDate);
      setPage(1);
      setAppointmentPage(1);
    }
  };

  // Handler for date range change
  const handleDateRangeChange = (isStart: boolean, newDate: Date | null) => {
    if (newDate) {
      setPage(1);
      setAppointmentPage(1);
      if (isStart) {
        setStartDate(newDate);
      } else {
        setEndDate(newDate);
      }
    }
  };

  const handleViewTherapist = (therapist: Therapist) => {
    // Encode therapist name for URL and navigate to details page
    const encodedName = encodeURIComponent(therapist.name);
    navigate(`/therapists/${encodedName}`);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  // Function to handle sorting
  const handleRequestSort = (property: keyof Therapist) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Sort comparator function
  const getComparator = <T extends Therapist>(
    order: 'asc' | 'desc',
    orderBy: keyof T
  ): (a: T, b: T) => number => {
    return order === 'desc'
      ? (a, b) => descendingComparator(a, b, orderBy)
      : (a, b) => -descendingComparator(a, b, orderBy);
  };

  // Descending comparator function
  const descendingComparator = <T extends Therapist>(
    a: T,
    b: T,
    orderBy: keyof T
  ): number => {
    if (b[orderBy] < a[orderBy]) {
      return -1;
    }
    if (b[orderBy] > a[orderBy]) {
      return 1;
    }
    return 0;
  };

  const filteredTherapists = therapists.filter(therapist =>
    therapist.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort the filtered therapists
  const sortedTherapists = React.useMemo(
    () => [...filteredTherapists].sort(getComparator(order, orderBy)),
    [filteredTherapists, order, orderBy]
  );

  // Calculate pagination
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedTherapists = sortedTherapists.slice(startIndex, endIndex);

  // Add a new function to handle selecting a therapist for filtering
  const handleSelectTherapist = (therapist: Therapist) => {
    if (selectedTherapist === therapist.name) {
      // If already selected, clear the filter
      setSelectedTherapist(null);
      setAppointmentPage(1);
    } else {
      // Set the selected therapist
      setSelectedTherapist(therapist.name);
      // Reset appointment pagination when changing filter
      setAppointmentPage(1);
    }
  };

  // Filter appointments by search term and selected therapist
  const filteredAppointments = appointments.filter(appointment => {
    const matchesSearch =
      appointment.therapistName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.helperName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.customer.toLowerCase().includes(searchTerm.toLowerCase());

    // Apply therapist filter if one is selected
    const matchesTherapist = selectedTherapist
      ? appointment.therapistName === selectedTherapist
      : true;

    return matchesSearch && matchesTherapist;
  });

  // Calculate pagination for appointments
  const startAppointmentIndex = (appointmentPage - 1) * appointmentsPerPage;
  const endAppointmentIndex = startAppointmentIndex + appointmentsPerPage;
  const paginatedAppointments = filteredAppointments.slice(startAppointmentIndex, endAppointmentIndex);

  // Function to convert data to CSV
  const convertToCSV = <T extends Record<string, any>>(data: T[], fields?: { [key: string]: string }): string => {
    if (!data || data.length === 0) return '';

    // Define headers - either use provided field mappings or object keys
    let headers: string[];
    let keys: string[];

    if (fields) {
      headers = Object.values(fields);
      keys = Object.keys(fields);
    } else {
      headers = Object.keys(data[0]);
      keys = headers;
    }

    // Format the header row
    const headerRow = headers.map(header => `"${header}"`).join(',');

    // Format data rows
    const rows = data.map(item => {
      return keys.map(key => {
        const value = item[key]?.toString() || '';
        // Escape quotes and wrap in quotes
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',');
    });

    // Combine header and rows
    return [headerRow, ...rows].join('\n');
  };

  // Function to download CSV
  const downloadCSV = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to handle therapist export
  const handleExportTherapists = async () => {
    try {
      setExportingTherapists(true);

      // Use existing therapists data if available, or fetch all data if needed
      let dataToExport = therapists;

      // If we need to fetch a complete dataset (e.g., if the current data is filtered or incomplete)
      if (currentClinic && therapists.length === 0) {
        await fetchTherapists();
        dataToExport = therapists;
      }

      // Define field mappings for better column names
      const fields = {
        name: 'Therapist Name',
        bookingCount: 'Appointment Count'
      };

      const csvData = convertToCSV(dataToExport, fields);

      // Generate filename with date
      const date = format(new Date(), 'yyyy-MM-dd');
      const clinicCode = currentClinic?.code || 'all';
      const filename = `therapist_list_${clinicCode}_${date}.csv`;

      downloadCSV(csvData, filename);
    } catch (error) {
      console.error('Error exporting therapists:', error);
      // You could add error handling/notification here
    } finally {
      setExportingTherapists(false);
    }
  };

  // Function to handle appointment export
  const handleExportAppointments = async () => {
    try {
      setExportingAppointments(true);

      const period = getTherapistReportPeriod({
        filterType,
        selectedDate,
        customStartDate: startDate,
        customEndDate: endDate,
      });
      if (!period || !currentClinic) {
        throw new Error('Invalid therapist report period or clinic.');
      }

      const query = buildTherapistAppointmentsQuery({
        clinicCode: currentClinic.code,
        period,
        therapistName: selectedTherapist,
      });

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 30000 // Increased timeout for larger dataset
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch appointments for export');
      }

      const exportData = response.data.data.map((appointment: any) => ({
        therapistName: appointment.therapistName || 'Unknown',
        helperName: appointment.helperName || 'Unknown',
        service: appointment.service || 'Unknown',
        customer: appointment.customer || 'Unknown',
        date: appointment.date || 'Unknown',
        bookingId: appointment.bookingId || 'Unknown'
      }));

      // Define field mappings for better column names
      const fields = {
        therapistName: 'Therapist Name',
        helperName: 'Helper Name',
        service: 'Service',
        customer: 'Customer',
        date: 'Date & Time',
        bookingId: 'Booking ID'
      };

      const csvData = convertToCSV(exportData, fields);

      // Generate filename with date
      const date = format(new Date(), 'yyyy-MM-dd');
      const clinicCode = currentClinic?.code || 'all';
      const therapistSuffix = selectedTherapist ? `_therapist_${selectedTherapist.replace(/\s+/g, '_')}` : '';
      const filename = `appointments_${clinicCode}${therapistSuffix}_${date}.csv`;

      downloadCSV(csvData, filename);
    } catch (error) {
      console.error('Error exporting appointments:', error);
      // You could add error handling/notification here
    } finally {
      setExportingAppointments(false);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: 'var(--background)',
        minHeight: '100vh',
        p: { xs: 2, md: 3 },
      }}
    >
      <DirectoryPageHeader
        title="Therapists"
        subtitle="Monitor therapist workload and inspect the appointments behind each total."
        count={filteredTherapists.length}
        countLabel={searchTerm ? 'matches' : 'therapists'}
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              fetchTherapists();
              fetchAppointments();
            }}
            disabled={loading || appointmentsLoading}
            sx={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
          >
            Refresh
          </Button>
        }
      />

      <Paper
        elevation={3}
        className="mb-6 p-4"
        sx={{
          bgcolor: 'var(--surface)',
          borderRadius: 2,
          color: 'var(--text-primary)'
        }}
      >
        <Box
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 flex-wrap"
        >
          <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
            <TextField
              placeholder="Search therapists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              variant="outlined"
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'gray' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                width: { xs: '100%', sm: '250px' },
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                  '& fieldset': {
                    borderColor: 'var(--border)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'var(--primary)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--primary)',
                  },
                }
              }}
            />

            {/* Date Filter Controls */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                width: { xs: '100%', sm: 'auto' },
                alignItems: { xs: 'flex-start', sm: 'center' }
              }}
            >
              <FormControl
                size="small"
                sx={{
                  width: { xs: '100%', sm: '150px' },
                  bgcolor: 'var(--surface-secondary)',
                  '& .MuiOutlinedInput-root': {
                    color: 'var(--text-primary)',
                    '& fieldset': { borderColor: 'var(--border)' },
                    '&:hover fieldset': { borderColor: 'var(--primary)' },
                    '&.Mui-focused fieldset': { borderColor: 'var(--primary)' },
                  },
                  '& .MuiSvgIcon-root': { color: 'var(--text-primary)' }
                }}
              >
                <Select
                  value={filterType}
                  onChange={handleFilterTypeChange}
                  displayEmpty
                >
                  <MenuItem value="daily" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>Daily</MenuItem>
                  <MenuItem value="weekly" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>Weekly</MenuItem>
                  <MenuItem value="monthly" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>Monthly</MenuItem>
                  <MenuItem value="custom" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>Custom</MenuItem>
                </Select>
              </FormControl>

              <LocalizationProvider dateAdapter={AdapterDateFns}>
                {filterType !== 'custom' ? (
                  <DatePicker
                    value={selectedDate}
                    onChange={handleDateChange}
                    views={filterType === 'monthly' ? ['year', 'month'] : ['year', 'month', 'day']}
                    slotProps={{
                      textField: {
                        size: 'small',
                        sx: {
                          width: { xs: '100%', sm: '200px' },
                          bgcolor: 'var(--surface-secondary)',
                          '& .MuiOutlinedInput-root': {
                            color: 'var(--text-primary)',
                            '& fieldset': { borderColor: 'var(--border)' },
                            '&:hover fieldset': { borderColor: 'var(--primary)' },
                            '&.Mui-focused fieldset': { borderColor: 'var(--primary)' },
                          },
                          '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                          '& .MuiSvgIcon-root': { color: 'var(--text-primary)' },
                        },
                      },
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      flexDirection: { xs: 'column', sm: 'row' },
                      width: { xs: '100%', sm: 'auto' }
                    }}
                  >
                    <DatePicker
                      label="Start Date"
                      value={startDate}
                      onChange={(newValue) => handleDateRangeChange(true, newValue)}
                      slotProps={{
                        textField: {
                          size: 'small',
                          sx: {
                            width: { xs: '100%', sm: '160px' },
                            bgcolor: 'var(--surface-secondary)',
                            '& .MuiOutlinedInput-root': {
                              color: 'var(--text-primary)',
                              '& fieldset': { borderColor: 'var(--border)' },
                              '&:hover fieldset': { borderColor: 'var(--primary)' },
                              '&.Mui-focused fieldset': { borderColor: 'var(--primary)' },
                            },
                            '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                            '& .MuiSvgIcon-root': { color: 'var(--text-primary)' },
                          },
                        },
                      }}
                    />
                    <DatePicker
                      label="End Date"
                      value={endDate}
                      onChange={(newValue) => handleDateRangeChange(false, newValue)}
                      slotProps={{
                        textField: {
                          size: 'small',
                          sx: {
                            width: { xs: '100%', sm: '160px' },
                            bgcolor: 'var(--surface-secondary)',
                            '& .MuiOutlinedInput-root': {
                              color: 'var(--text-primary)',
                              '& fieldset': { borderColor: 'var(--border)' },
                              '&:hover fieldset': { borderColor: 'var(--primary)' },
                              '&.Mui-focused fieldset': { borderColor: 'var(--primary)' },
                            },
                            '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                            '& .MuiSvgIcon-root': { color: 'var(--text-primary)' },
                          },
                        },
                      }}
                    />
                  </Box>
                )}
              </LocalizationProvider>
            </Box>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
            Therapist Summary · {filteredTherapists.length.toLocaleString()}
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
            Appointment counts are service rows within the selected calendar period.
          </Typography>
        </Box>
        <Tooltip title="Export all therapists to CSV">
          <Button
            variant="outlined"
            size="small"
            startIcon={exportingTherapists ? <CircularProgress size={20} sx={{ color: 'var(--text-primary)' }} /> : <FileDownloadIcon />}
            onClick={handleExportTherapists}
            disabled={exportingTherapists || loading || error !== ''}
            sx={{
              color: 'var(--text-primary)',
              borderColor: 'var(--primary)',
              '&:hover': {
                borderColor: 'white',
                backgroundColor: 'var(--primary-soft)'
              }
            }}
          >
            {exportingTherapists ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Tooltip>
      </Box>

      <Paper
        className="rounded-lg overflow-hidden w-full mb-6"
        sx={{
          bgcolor: 'var(--surface-secondary)',
          boxShadow: 'none',
          border: '1px solid var(--surface)',
          width: '100%',
          display: 'table',
          tableLayout: 'fixed'
        }}
      >
        {loading ? (
          <Box className="flex justify-center items-center p-12" sx={{ bgcolor: 'var(--surface-secondary)' }}>
            <CircularProgress sx={{ color: 'var(--text-primary)' }} />
          </Box>
        ) : error ? (
          <Box className="p-6" sx={{ bgcolor: 'var(--surface-secondary)' }}>
            <Typography className="text-red-400 text-center">
              {error}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'var(--surface-secondary)' }}>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'name'}
                        direction={orderBy === 'name' ? order : 'asc'}
                        onClick={() => handleRequestSort('name')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': { color: 'var(--primary) !important' },
                          '& .MuiTableSortLabel-icon': { color: 'var(--primary) !important' },
                        }}
                      >
                        Therapist Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'bookingCount'}
                        direction={orderBy === 'bookingCount' ? order : 'asc'}
                        onClick={() => handleRequestSort('bookingCount')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': { color: 'var(--primary) !important' },
                          '& .MuiTableSortLabel-icon': { color: 'var(--primary) !important' },
                        }}
                      >
                        Appointment Count
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedTherapists.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: 'var(--text-primary)' }}>
                        No therapists found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTherapists.map((therapist) => (
                      <TableRow
                        key={therapist.id}
                        hover
                        sx={{
                          '&:hover': { backgroundColor: 'var(--surface-secondary) !important' },
                          cursor: 'pointer',
                          // Highlight selected therapist
                          ...(selectedTherapist === therapist.name && {
                            backgroundColor: 'var(--primary-soft) !important',
                            '&:hover': { backgroundColor: 'var(--primary-soft) !important' },
                          })
                        }}
                        onClick={() => handleSelectTherapist(therapist)}
                      >
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar
                              src={therapist.image || undefined}
                              alt={therapist.name}
                              sx={{ width: 38, height: 38, bgcolor: 'var(--primary)', fontSize: '0.9rem' }}
                            >
                              {therapist.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Typography sx={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                              {therapist.name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          {therapist.bookingCount.toLocaleString()}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          <Button
                            variant="contained"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewTherapist(therapist);
                            }}
                            sx={{
                              bgcolor: 'var(--background)',
                              '&:hover': {
                                bgcolor: 'var(--surface-secondary)'
                              }
                            }}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                padding: 2,
                borderTop: '1px solid var(--surface-secondary)',
                backgroundColor: 'var(--surface-secondary)'
              }}
            >
              <Pagination
                count={Math.ceil(filteredTherapists.length / rowsPerPage)}
                page={page}
                onChange={handleChangePage}
                color="primary"
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: 'var(--text-primary)',
                  },
                  '& .Mui-selected': {
                    backgroundColor: 'var(--primary) !important',
                  },
                }}
              />
            </Box>
          </>
        )}
      </Paper>

      {/* Appointments Table */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
        <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          Appointment Details · {filteredAppointments.length.toLocaleString()}
          {selectedTherapist && (
            <>
              <span style={{ margin: '0 10px', color: 'var(--text-secondary)' }}>|</span>
              <span style={{ color: 'var(--primary)', fontWeight: 'normal', fontSize: '1rem' }}>
                Filtered by: {selectedTherapist}
              </span>
              <Button
                size="small"
                variant="text"
                onClick={() => setSelectedTherapist(null)}
                sx={{
                  ml: 2,
                  color: 'var(--text-secondary)',
                  '&:hover': { color: 'var(--text-primary)' }
                }}
              >
                Clear
              </Button>
            </>
          )}
        </Typography>
        <Tooltip title="Export all appointments to CSV">
          <Button
            variant="outlined"
            size="small"
            startIcon={exportingAppointments ? <CircularProgress size={20} sx={{ color: 'var(--text-primary)' }} /> : <FileDownloadIcon />}
            onClick={handleExportAppointments}
            disabled={exportingAppointments || appointmentsLoading || appointmentsError !== ''}
            sx={{
              color: 'var(--text-primary)',
              borderColor: 'var(--primary)',
              '&:hover': {
                borderColor: 'white',
                backgroundColor: 'var(--primary-soft)'
              }
            }}
          >
            {exportingAppointments ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Tooltip>
      </Box>

      <Paper
        className="rounded-lg overflow-hidden w-full"
        sx={{
          bgcolor: 'var(--surface-secondary)',
          boxShadow: 'none',
          border: '1px solid var(--surface)',
          width: '100%',
          display: 'table',
          tableLayout: 'fixed'
        }}
      >
        {appointmentsLoading ? (
          <Box className="flex justify-center items-center p-12" sx={{ bgcolor: 'var(--surface-secondary)' }}>
            <CircularProgress sx={{ color: 'var(--text-primary)' }} />
          </Box>
        ) : appointmentsError ? (
          <Box className="p-6" sx={{ bgcolor: 'var(--surface-secondary)' }}>
            <Typography className="text-red-400 text-center">
              {appointmentsError}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'var(--surface-secondary)' }}>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Therapist Name
                    </TableCell>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Helper Name
                    </TableCell>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Service
                    </TableCell>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Customer
                    </TableCell>
                    <TableCell
                      sx={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Date
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedAppointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: 'var(--text-primary)' }}>
                        No appointments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedAppointments.map((appointment, index) => (
                      <TableRow
                        key={`${appointment.bookingId}-${appointment.service}-${appointment.date}-${index}`}
                        hover
                        sx={{
                          '&:hover': { backgroundColor: 'var(--surface-secondary) !important' },
                        }}
                      >
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          {appointment.therapistName}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          {appointment.helperName}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          {appointment.service}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          {appointment.customer}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--surface-secondary)'
                          }}
                        >
                          {appointment.date}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                padding: 2,
                borderTop: '1px solid var(--surface-secondary)',
                backgroundColor: 'var(--surface-secondary)'
              }}
            >
              <Pagination
                count={Math.ceil(filteredAppointments.length / appointmentsPerPage)}
                page={appointmentPage}
                onChange={(_event, newPage) => setAppointmentPage(newPage)}
                color="primary"
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: 'var(--text-primary)',
                  },
                  '& .Mui-selected': {
                    backgroundColor: 'var(--primary) !important',
                  },
                }}
              />
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default TherapistList;
