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
  IconButton,
  CircularProgress,
  InputAdornment,
  Pagination,
  TableSortLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  FormControl,
  InputLabel,
  Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useClinic } from '../contexts/ClinicContext';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';

interface Helper {
  id: string;
  name: string;
  bookingCount: number;
}

// Add a new interface for appointment data
interface Appointment {
  helperId: string;
  helperName: string;
  service: string;
  customer: string;
  practitioner: string;
  date: string;
  bookingId: string;
}

const HelperList: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState<keyof Helper>('bookingCount');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  
  // Date filter states
  const [filterType, setFilterType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
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
  
  // Selected helper for filtering
  const [selectedHelper, setSelectedHelper] = useState<string | null>(null);

  // Add state for CSV export loading
  const [exportingHelpers, setExportingHelpers] = useState(false);
  const [exportingAppointments, setExportingAppointments] = useState(false);

  useEffect(() => {
    if (currentClinic) {
      fetchHelpers();
      fetchAppointments();
    }
  }, [currentClinic, filterType, selectedDate, startDate, endDate]);

  const fetchHelpers = async () => {
    try {
      setLoading(true);
      
      console.log('Current Clinic:', currentClinic);
      console.log('Current Clinic Code:', currentClinic?.code);
      
      // Create date conditions based on selected time period
      let dateCondition: string;
      
      if (filterType === 'daily') {
        // Today
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = DATE('${formattedDate}')`;
      } else if (filterType === 'weekly') {
        // Last 7 days
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'monthly') {
        // Last 30 days
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'custom') {
        // Custom date range
        if (startDate && endDate) {
          const formattedStartDate = format(startDate, 'yyyy-MM-dd');
          const formattedEndDate = format(endDate, 'yyyy-MM-dd');
          dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        } else {
          // Fallback to last 7 days if custom dates are not set
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - 7);
          const formattedStartDate = format(start, 'yyyy-MM-dd');
          const formattedEndDate = format(end, 'yyyy-MM-dd');
          dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        }
      } else {
        // Default fallback to weekly
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      }
      
      const query = `
      SELECT 
        HelperName as name,
        COUNT(*) as bookingCount
      FROM 
        great_time.MainDataView
      WHERE 
        HelperName IS NOT NULL
        AND HelperName != 'N/A'
        AND TRIM(HelperName) != ''
        AND ClinicCode = '${currentClinic?.code}'
        AND ${dateCondition}
      GROUP BY 
        HelperName
      ORDER BY 
        bookingCount DESC
      LIMIT 100
      `;

      console.log('Executing query:', query);

      const response = await axios.post('/api/query', 
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
        throw new Error(response.data.error || 'Failed to fetch helpers');
      }

      const data = response.data.data;
      
      // Map the response data to Helper interface
      const formattedHelpers = data.map((helper: any, index: number) => ({
        id: index.toString(),
        name: helper.name || 'Unknown',
        bookingCount: helper.bookingCount || 0
      }));

      setHelpers(formattedHelpers);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching helpers:', err);
      let errorMessage = 'An error occurred while fetching helper data';
      
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
      
      // Create date conditions based on selected time period
      let dateCondition: string;
      
      if (filterType === 'daily') {
        // Today
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = DATE('${formattedDate}')`;
      } else if (filterType === 'weekly') {
        // Last 7 days
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'monthly') {
        // Last 30 days
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'custom') {
        // Custom date range
        if (startDate && endDate) {
          const formattedStartDate = format(startDate, 'yyyy-MM-dd');
          const formattedEndDate = format(endDate, 'yyyy-MM-dd');
          dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        } else {
          // Fallback to last 7 days if custom dates are not set
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - 7);
          const formattedStartDate = format(start, 'yyyy-MM-dd');
          const formattedEndDate = format(end, 'yyyy-MM-dd');
          dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        }
      } else {
        // Default fallback to weekly
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      }
      
      const query = `
      SELECT 
        BookingID as bookingId,
        HelperName as helperName,
        ServiceName as service,
        CustomerName as customer,
        PractitionerName as practitioner,
        FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', CheckInTime) as date
      FROM 
        great_time.MainDataView
      WHERE 
        HelperName IS NOT NULL
        AND HelperName != 'N/A'
        AND TRIM(HelperName) != ''
        AND ClinicCode = '${currentClinic?.code}'
        AND ${dateCondition}
      ORDER BY 
        CheckInTime DESC
      LIMIT 100
      `;

      console.log('Executing appointments query:', query);

      const response = await axios.post('/api/query', 
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
      const formattedAppointments = data.map((appointment: any, index: number) => ({
        helperId: index.toString(),
        helperName: appointment.helperName || 'Unknown',
        service: appointment.service || 'Unknown',
        customer: appointment.customer || 'Unknown',
        practitioner: appointment.practitioner || 'Unknown',
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
  const handleFilterTypeChange = (event: SelectChangeEvent<'daily' | 'weekly' | 'monthly' | 'custom'>) => {
    const newFilterType = event.target.value as 'daily' | 'weekly' | 'monthly' | 'custom';
    setFilterType(newFilterType);
    
    // Reset data to ensure fetch happens with new filter
    setHelpers([]);
    
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
    }
  };
  
  // Handler for date range change
  const handleDateRangeChange = (isStart: boolean, newDate: Date | null) => {
    if (newDate) {
      if (isStart) {
        setStartDate(newDate);
      } else {
        setEndDate(newDate);
      }
    }
  };

  const handleViewHelper = (helper: Helper) => {
    // Encode helper name for URL and navigate to details page
    const encodedName = encodeURIComponent(helper.name);
    navigate(`/helpers/${encodedName}`);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  // Function to handle sorting
  const handleRequestSort = (property: keyof Helper) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Sort comparator function
  const getComparator = <T extends Helper>(
    order: 'asc' | 'desc',
    orderBy: keyof T
  ): (a: T, b: T) => number => {
    return order === 'desc'
      ? (a, b) => descendingComparator(a, b, orderBy)
      : (a, b) => -descendingComparator(a, b, orderBy);
  };

  // Descending comparator function
  const descendingComparator = <T extends Helper>(
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

  const filteredHelpers = helpers.filter(helper =>
    helper.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort the filtered helpers
  const sortedHelpers = React.useMemo(
    () => [...filteredHelpers].sort(getComparator(order, orderBy)),
    [filteredHelpers, order, orderBy]
  );

  // Calculate pagination
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedHelpers = sortedHelpers.slice(startIndex, endIndex);

  // Filter appointments by search term
  const filteredAppointments = appointments.filter(appointment => {
    const matchesSearch = 
      appointment.helperName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.practitioner.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply helper filter if one is selected
    const matchesHelper = selectedHelper 
      ? appointment.helperName === selectedHelper 
      : true;
    
    return matchesSearch && matchesHelper;
  });

  // Calculate pagination for appointments
  const startAppointmentIndex = (appointmentPage - 1) * appointmentsPerPage;
  const endAppointmentIndex = startAppointmentIndex + appointmentsPerPage;
  const paginatedAppointments = filteredAppointments.slice(startAppointmentIndex, endAppointmentIndex);

  // Add a new function to handle selecting a helper for filtering
  const handleSelectHelper = (helper: Helper) => {
    if (selectedHelper === helper.name) {
      // If already selected, clear the filter
      setSelectedHelper(null);
    } else {
      // Set the selected helper
      setSelectedHelper(helper.name);
      // Reset appointment pagination when changing filter
      setAppointmentPage(1);
    }
  };

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
  
  // Function to handle helper export
  const handleExportHelpers = async () => {
    try {
      setExportingHelpers(true);
      
      // Use existing helpers data if available, or fetch all data if needed
      let dataToExport = helpers;
      
      // If we need to fetch a complete dataset (e.g., if the current data is filtered or incomplete)
      if (currentClinic && helpers.length === 0) {
        await fetchHelpers();
        dataToExport = helpers;
      }
      
      // Define field mappings for better column names
      const fields = {
        name: 'Helper Name',
        bookingCount: 'Booking Count'
      };
      
      const csvData = convertToCSV(dataToExport, fields);
      
      // Generate filename with date
      const date = format(new Date(), 'yyyy-MM-dd');
      const clinicCode = currentClinic?.code || 'all';
      const filename = `helper_list_${clinicCode}_${date}.csv`;
      
      downloadCSV(csvData, filename);
    } catch (error) {
      console.error('Error exporting helpers:', error);
      // You could add error handling/notification here
    } finally {
      setExportingHelpers(false);
    }
  };
  
  // Function to handle appointment export
  const handleExportAppointments = async () => {
    try {
      setExportingAppointments(true);
      
      // Fetch complete appointment data for export
      // This ensures we get ALL appointments, not just the current page
      
      // Create date conditions based on selected time period
      let dateCondition: string;
      
      if (filterType === 'daily') {
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) = DATE('${formattedDate}')`;
      } else if (filterType === 'weekly') {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'monthly') {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'custom') {
        if (startDate && endDate) {
          const formattedStartDate = format(startDate, 'yyyy-MM-dd');
          const formattedEndDate = format(endDate, 'yyyy-MM-dd');
          dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        } else {
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - 7);
          const formattedStartDate = format(start, 'yyyy-MM-dd');
          const formattedEndDate = format(end, 'yyyy-MM-dd');
          dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        }
      } else {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const formattedStartDate = format(start, 'yyyy-MM-dd');
        const formattedEndDate = format(end, 'yyyy-MM-dd');
        dateCondition = `DATE(CheckInTime) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      }
      
      // Add helper filter if selected
      const helperCondition = selectedHelper 
        ? `AND HelperName = '${selectedHelper}'` 
        : '';
      
      const query = `
      SELECT 
        BookingID as bookingId,
        HelperName as helperName,
        ServiceName as service,
        CustomerName as customer,
        PractitionerName as practitioner,
        FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', CheckInTime) as date
      FROM 
        great_time.MainDataView
      WHERE 
        HelperName IS NOT NULL
        AND HelperName != 'N/A'
        AND TRIM(HelperName) != ''
        AND ClinicCode = '${currentClinic?.code}'
        AND ${dateCondition}
        ${helperCondition}
      ORDER BY 
        CheckInTime DESC
      LIMIT 1000
      `;
      
      const response = await axios.post('/api/query', 
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
        helperName: appointment.helperName || 'Unknown',
        service: appointment.service || 'Unknown',
        customer: appointment.customer || 'Unknown',
        practitioner: appointment.practitioner || 'Unknown',
        date: appointment.date || 'Unknown',
        bookingId: appointment.bookingId || 'Unknown'
      }));
      
      // Define field mappings for better column names
      const fields = {
        helperName: 'Helper Name',
        service: 'Service',
        customer: 'Customer',
        practitioner: 'Practitioner',
        date: 'Date & Time',
        bookingId: 'Booking ID'
      };
      
      const csvData = convertToCSV(exportData, fields);
      
      // Generate filename with date
      const date = format(new Date(), 'yyyy-MM-dd');
      const clinicCode = currentClinic?.code || 'all';
      const helperSuffix = selectedHelper ? `_helper_${selectedHelper.replace(/\s+/g, '_')}` : '';
      const filename = `appointments_${clinicCode}${helperSuffix}_${date}.csv`;
      
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
      className="p-6" 
      sx={{ 
        bgcolor: '#111923',
        minHeight: '100vh'
      }}
    >
      <Box className="flex justify-between items-center mb-6">
        <Typography variant="h4" component="h1" className="text-white font-bold">
          Helper List
        </Typography>
        <Box className="flex gap-3">
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            className="bg-[#2563eb] hover:bg-blue-700"
            onClick={() => {
              fetchHelpers();
              fetchAppointments();
            }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      <Paper 
        elevation={3} 
        className="mb-6 p-4"
        sx={{ 
          bgcolor: '#1a2235',
          borderRadius: 2,
          color: 'white'
        }}
      >
        <Box 
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 flex-wrap"
        >
          <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
            <TextField
              placeholder="Search helpers..."
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
                  backgroundColor: '#111923',
                  color: 'white',
                  '& fieldset': {
                    borderColor: '#2d3748',
                  },
                  '&:hover fieldset': {
                    borderColor: '#3b82f6',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#3b82f6',
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
                  bgcolor: '#111923',
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    '& fieldset': { borderColor: '#2d3748' },
                    '&:hover fieldset': { borderColor: '#3b82f6' },
                    '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                  },
                  '& .MuiSvgIcon-root': { color: 'white' }
                }}
              >
                <Select
                  value={filterType}
                  onChange={handleFilterTypeChange}
                  displayEmpty
                >
                  <MenuItem value="daily" sx={{ bgcolor: '#111923', color: 'white' }}>Daily</MenuItem>
                  <MenuItem value="weekly" sx={{ bgcolor: '#111923', color: 'white' }}>Weekly</MenuItem>
                  <MenuItem value="monthly" sx={{ bgcolor: '#111923', color: 'white' }}>Monthly</MenuItem>
                  <MenuItem value="custom" sx={{ bgcolor: '#111923', color: 'white' }}>Custom</MenuItem>
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
                          bgcolor: '#111923',
                          '& .MuiOutlinedInput-root': {
                            color: 'white',
                            '& fieldset': { borderColor: '#2d3748' },
                            '&:hover fieldset': { borderColor: '#3b82f6' },
                            '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          },
                          '& .MuiInputLabel-root': { color: '#9ca3af' },
                          '& .MuiSvgIcon-root': { color: 'white' },
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
                            bgcolor: '#111923',
                            '& .MuiOutlinedInput-root': {
                              color: 'white',
                              '& fieldset': { borderColor: '#2d3748' },
                              '&:hover fieldset': { borderColor: '#3b82f6' },
                              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                            },
                            '& .MuiInputLabel-root': { color: '#9ca3af' },
                            '& .MuiSvgIcon-root': { color: 'white' },
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
                            bgcolor: '#111923',
                            '& .MuiOutlinedInput-root': {
                              color: 'white',
                              '& fieldset': { borderColor: '#2d3748' },
                              '&:hover fieldset': { borderColor: '#3b82f6' },
                              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                            },
                            '& .MuiInputLabel-root': { color: '#9ca3af' },
                            '& .MuiSvgIcon-root': { color: 'white' },
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
        <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
          Helper Summary
        </Typography>
        <Tooltip title="Export all helpers to CSV">
          <Button
            variant="outlined"
            size="small"
            startIcon={exportingHelpers ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
            onClick={handleExportHelpers}
            disabled={exportingHelpers || loading || error !== ''}
            sx={{ 
              color: 'white', 
              borderColor: '#3b82f6',
              '&:hover': { 
                borderColor: 'white',
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
              }
            }}
          >
            {exportingHelpers ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Tooltip>
      </Box>
      
      <Paper 
        className="rounded-lg overflow-hidden w-full mb-6" 
        sx={{ 
          bgcolor: '#111923', 
          boxShadow: 'none',
          border: '1px solid #1a2234',
          width: '100%',
          display: 'table',
          tableLayout: 'fixed'
        }}
      >
        {loading ? (
          <Box className="flex justify-center items-center p-12" sx={{ bgcolor: '#111923' }}>
            <CircularProgress sx={{ color: 'white' }} />
          </Box>
        ) : error ? (
          <Box className="p-6" sx={{ bgcolor: '#111923' }}>
            <Typography className="text-red-400 text-center">
              {error}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#111923' }}>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'name'}
                        direction={orderBy === 'name' ? order : 'asc'}
                        onClick={() => handleRequestSort('name')}
                        sx={{
                          color: 'white !important',
                          '&.MuiTableSortLabel-active': {
                            color: '#3b82f6 !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: '#3b82f6 !important',
                          },
                        }}
                      >
                        Helper Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell 
                      align="center"
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'bookingCount'}
                        direction={orderBy === 'bookingCount' ? order : 'asc'}
                        onClick={() => handleRequestSort('bookingCount')}
                        sx={{
                          color: 'white !important',
                          '&.MuiTableSortLabel-active': {
                            color: '#3b82f6 !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: '#3b82f6 !important',
                          },
                        }}
                      >
                        Booking Count
                      </TableSortLabel>
                    </TableCell>
                    <TableCell 
                      align="right"
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedHelpers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ color: 'white' }}>
                        No helpers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedHelpers.map((helper) => (
                      <TableRow 
                        key={helper.id}
                        hover
                        sx={{ 
                          '&:hover': { backgroundColor: '#1a2440 !important' },
                          cursor: 'pointer',
                          // Highlight selected helper
                          ...(selectedHelper === helper.name && {
                            backgroundColor: '#1e3a8a !important',
                            '&:hover': { backgroundColor: '#1e3a8a !important' },
                          })
                        }}
                        onClick={() => handleSelectHelper(helper)}
                      >
                        <TableCell 
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Avatar 
                              sx={{ 
                                width: 40, 
                                height: 40, 
                                bgcolor: '#3b82f6',
                                fontSize: '1rem'
                              }}
                            >
                              {helper.name.charAt(0)}
                            </Avatar>
                            <Typography 
                              className="ml-3 font-medium" 
                              sx={{ 
                                color: selectedHelper === helper.name ? '#ffffff' : '#3b82f6',
                                fontWeight: selectedHelper === helper.name ? 'bold' : 'medium'
                              }}
                            >
                              {helper.name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell 
                          align="center"
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          {helper.bookingCount}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          sx={{ 
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          <Button
                            variant="contained"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewHelper(helper);
                            }}
                            sx={{ 
                              bgcolor: '#0f172a', 
                              '&:hover': { 
                                bgcolor: '#1e293b' 
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
                borderTop: '1px solid #1e293b',
                backgroundColor: '#131b2c'
              }}
            >
              <Pagination
                count={Math.ceil(sortedHelpers.length / rowsPerPage)}
                page={page}
                onChange={handleChangePage}
                color="primary"
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: 'white',
                  },
                  '& .Mui-selected': {
                    backgroundColor: '#3b82f6 !important',
                  },
                }}
              />
            </Box>
          </>
        )}
      </Paper>
      
      {/* Appointments Table */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
        <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          Appointment Details
          {selectedHelper && (
            <>
              <span style={{ margin: '0 10px', color: '#9ca3af' }}>|</span>
              <span style={{ color: '#3b82f6', fontWeight: 'normal', fontSize: '1rem' }}>
                Filtered by: {selectedHelper}
              </span>
              <Button 
                size="small"
                variant="text"
                onClick={() => setSelectedHelper(null)}
                sx={{ 
                  ml: 2, 
                  color: '#9ca3af',
                  '&:hover': { color: '#ffffff' }
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
            startIcon={exportingAppointments ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
            onClick={handleExportAppointments}
            disabled={exportingAppointments || appointmentsLoading || appointmentsError !== ''}
            sx={{ 
              color: 'white', 
              borderColor: '#3b82f6',
              '&:hover': { 
                borderColor: 'white',
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
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
          bgcolor: '#111923', 
          boxShadow: 'none',
          border: '1px solid #1a2234',
          width: '100%',
          display: 'table',
          tableLayout: 'fixed'
        }}
      >
        {appointmentsLoading ? (
          <Box className="flex justify-center items-center p-12" sx={{ bgcolor: '#111923' }}>
            <CircularProgress sx={{ color: 'white' }} />
          </Box>
        ) : appointmentsError ? (
          <Box className="p-6" sx={{ bgcolor: '#111923' }}>
            <Typography className="text-red-400 text-center">
              {appointmentsError}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 'calc(100vh - 500px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#111923' }}>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Helper Name
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Service
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Customer
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Practitioner
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#131b2c', 
                        color: 'white',
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
                      <TableCell colSpan={5} align="center" sx={{ color: 'white' }}>
                        No appointments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedAppointments.map((appointment) => (
                      <TableRow 
                        key={appointment.bookingId}
                        hover
                        sx={{ 
                          '&:hover': { backgroundColor: '#1a2440 !important' },
                        }}
                      >
                        <TableCell 
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          {appointment.helperName}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          {appointment.service}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          {appointment.customer}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
                          }}
                        >
                          {appointment.practitioner}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: 'white',
                            borderBottom: '1px solid #1e293b'
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
                borderTop: '1px solid #1e293b',
                backgroundColor: '#131b2c'
              }}
            >
              <Pagination
                count={Math.ceil(filteredAppointments.length / appointmentsPerPage)}
                page={appointmentPage}
                onChange={(_event, newPage) => setAppointmentPage(newPage)}
                color="primary"
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: 'white',
                  },
                  '& .Mui-selected': {
                    backgroundColor: '#3b82f6 !important',
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

export default HelperList; 