import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { 
  Box, 
  Paper, 
  Typography, 
  Avatar, 
  Grid, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  CircularProgress, 
  IconButton, 
  Button,
  Pagination,
  useTheme,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import axios from 'axios';
import { useClinic } from '../contexts/ClinicContext';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';

// Interface for bookings data
interface Booking {
  bookingId: string;
  customerName: string;
  serviceName: string;
  serviceDescription: string;
  checkInTime: string;
  checkOutTime: string;
  price: number;
  practitionerName: string;
}

// Interface for service by month data
interface ServiceByMonth {
  service_name: string;
  month: string;
  count: number;
}

interface HelperData {
  name: string;
  totalBookings: number;
  recentBookings: Booking[];
}

const HelperDetails: React.FC = () => {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const { currentClinic } = useClinic();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [helperData, setHelperData] = useState<HelperData | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [imageError, setImageError] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [years, setYears] = useState<string[]>([]);
  const [servicesByMonth, setServicesByMonth] = useState<ServiceByMonth[]>([]);
  const [filteredServicesByMonth, setFilteredServicesByMonth] = useState<ServiceByMonth[]>([]);
  
  // New state variables for date filtering
  const [filterType, setFilterType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().setDate(new Date().getDate() - 7))
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  // Function to format month names
  const getMonthName = (monthNumber: string | number): string => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const index = typeof monthNumber === 'string' ? parseInt(monthNumber) - 1 : monthNumber - 1;
    return months[index];
  };

  // Function to get abbreviated month name
  const getShortMonthName = (monthNumber: string | number): string => {
    const monthName = getMonthName(monthNumber);
    return monthName.substring(0, 3);
  };

  // Function to calculate heatmap color based on value
  const getHeatmapColor = (value: number, maxValue: number) => {
    if (value === 0) return 'transparent';
    const opacity = 0.2 + (value / maxValue) * 0.7;
    return `rgba(26, 115, 232, ${opacity})`;
  };

  // Function to get the maximum value for proper color scaling
  const getMaxValue = (data: ServiceByMonth[]): number => {
    return Math.max(...data.map(item => item.count));
  };

  useEffect(() => {
    if (currentClinic) {
      fetchHelperDetails();
    }
  }, [name, currentClinic, filterType, selectedDate, startDate, endDate]);

  useEffect(() => {
    // Update filtered services when year changes
    if (selectedYear && servicesByMonth.length > 0) {
      const filtered = servicesByMonth.filter(item => item.month.startsWith(selectedYear));
      setFilteredServicesByMonth(filtered);
    }
  }, [selectedYear, servicesByMonth]);

  const fetchHelperDetails = async () => {
    if (!name || !currentClinic) return;
    
    try {
      setLoading(true);
      
      console.log('Current Clinic:', currentClinic);
      console.log('Current Clinic Code:', currentClinic?.code);
      
      // Set current year as default before fetching data
      const currentYear = new Date().getFullYear().toString();
      
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
      
      // Query to fetch helper details and their bookings with date filtering
      const query = `
      WITH HelperBookings AS (
        SELECT
          HelperName as name,
          BookingID as bookingId,
          CustomerName as customerName,
          ServiceName as serviceName,
          ServiceDescription as serviceDescription,
          CheckInTime as checkInTime,
          CheckOutTime as checkOutTime,
          Price as price,
          PractitionerName as practitionerName
        FROM
          great_time.MainDataView
        WHERE
          HelperName = '${decodeURIComponent(name)}'
          AND ClinicCode = '${currentClinic?.code}'
          AND ${dateCondition}
        ORDER BY
          CheckInTime DESC
      ),
      ServicesByMonth AS (
        SELECT
          ServiceName as service_name,
          FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
          COUNT(*) as count
        FROM great_time.MainDataView
        WHERE 
          HelperName = '${decodeURIComponent(name)}'
          AND ClinicCode = '${currentClinic?.code}'
          AND ${dateCondition}
        GROUP BY ServiceName, month
        ORDER BY month DESC, count DESC
      )
      
      SELECT * FROM HelperBookings LIMIT 100;
      `;

      const serviceQuery = `
      SELECT
        ServiceName as service_name,
        FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
        COUNT(*) as count
      FROM great_time.MainDataView
      WHERE 
        HelperName = '${decodeURIComponent(name)}'
        AND ClinicCode = '${currentClinic?.code}'
        AND ${dateCondition}
      GROUP BY ServiceName, month
      ORDER BY month DESC, count DESC;
      `;

      console.log('Executing query:', query);

      // Execute the main query for bookings
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
        throw new Error(response.data.error || 'Failed to fetch helper details');
      }

      const data = response.data.data;
      
      if (data.length === 0) {
        throw new Error('No data found for this helper in the selected clinic');
      }

      // Execute the service by month query
      const serviceResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
        { query: serviceQuery },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (serviceResponse.data.success && serviceResponse.data.data) {
        const services = serviceResponse.data.data as ServiceByMonth[];
        setServicesByMonth(services);

        // Get unique years from the service data
        const monthYears = services.map(item => item.month.substring(0, 4));
        const uniqueYearsSet = new Set(monthYears);
        const sortedUniqueYears = Array.from(uniqueYearsSet) as string[];
        sortedUniqueYears.sort((a, b) => b.localeCompare(a));
        
        // Include current year in the years list if not already present
        if (!sortedUniqueYears.includes(currentYear)) {
          sortedUniqueYears.push(currentYear);
          sortedUniqueYears.sort((a, b) => b.localeCompare(a));
        }
        
        setYears(sortedUniqueYears.length > 0 ? sortedUniqueYears : [currentYear]);

        // Set selected year to most recent if available, otherwise use current year
        let yearToUse = currentYear;
        if (sortedUniqueYears.length > 0) {
          // If current year is in the data, prefer it over older years with data
          if (sortedUniqueYears.includes(currentYear)) {
            yearToUse = currentYear;
          } else {
            yearToUse = sortedUniqueYears[0];
          }
          
          // Update state with the selected year
          setSelectedYear(yearToUse);
          
          // Filter services for the selected year
          setFilteredServicesByMonth(services.filter(item => 
            item.month.startsWith(yearToUse)
          ));
        }
      } else {
        // If no data returned, still set current year as default
        setYears([currentYear]);
        setSelectedYear(currentYear);
      }

      // Process the booking data
      const bookings: Booking[] = data.map((booking: any) => ({
        bookingId: booking.bookingId || 'Unknown',
        customerName: booking.customerName || 'Unknown',
        serviceName: booking.serviceName || 'Unknown',
        serviceDescription: booking.serviceDescription || 'No description',
        checkInTime: booking.checkInTime ? new Date(booking.checkInTime).toLocaleString() : 'Unknown',
        checkOutTime: booking.checkOutTime ? new Date(booking.checkOutTime).toLocaleString() : 'Unknown',
        price: Number(booking.price) || 0,
        practitionerName: booking.practitionerName || 'Unknown'
      }));

      // Set helper data
      setHelperData({
        name: data[0].name,
        totalBookings: bookings.length,
        recentBookings: bookings
      });
      
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching helper details:', err);
      setError(err.message || 'An error occurred while fetching helper data');
      setLoading(false);
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleBack = () => {
    navigate('/helpers');
  };

  // Calculate pagination for bookings
  const paginatedBookings = helperData?.recentBookings.slice(
    (page - 1) * rowsPerPage,
    (page - 1) * rowsPerPage + rowsPerPage
  ) || [];

  // New handlers for date filtering
  const handleFilterTypeChange = (event: SelectChangeEvent<'daily' | 'weekly' | 'monthly' | 'custom'>) => {
    const newFilterType = event.target.value as 'daily' | 'weekly' | 'monthly' | 'custom';
    setFilterType(newFilterType);
    
    // Reset data to ensure fetch happens with new filter
    setHelperData(null);
    
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
  
  const handleDateChange = (newDate: Date | null) => {
    if (newDate) {
      setSelectedDate(newDate);
    }
  };
  
  // Change handler for date range inputs
  const handleDateRangeChange = (isStart: boolean, newDate: Date | null) => {
    if (newDate) {
      if (isStart) {
        setStartDate(newDate);
      } else {
        setEndDate(newDate);
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100%',
        bgcolor: '#101729'
      }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100%',
        bgcolor: '#101729',
        p: 3 
      }}>
        <Typography color="#d1d5db" variant="h6" align="center" mb={3}>{error}</Typography>
        <Button 
          variant="contained" 
          onClick={handleBack}
          sx={{ 
            bgcolor: '#3b82f6', 
            '&:hover': { bgcolor: '#2563eb' } 
          }}
        >
          Back to Helper List
        </Button>
      </Box>
    );
  }

  if (!helperData) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100%',
        bgcolor: '#101729',
        p: 3 
      }}>
        <Typography color="#d1d5db" variant="h6" align="center">No helper data found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 2, sm: 3, md: 4 },
      bgcolor: '#101729',
      minHeight: '100vh',
      width: '100%',
      maxWidth: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxSizing: 'border-box',
      m: 0,
      overflow: 'hidden'
    }}>
      <Box className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Typography variant="h4" component="h1" sx={{ color: 'white', fontWeight: 600 }}>
            Helper Details
          </Typography>
          <IconButton 
            onClick={fetchHelperDetails} 
            sx={{ color: 'white', ml: 2 }}
            title="Refresh"
          >
            <RefreshIcon />
          </IconButton>
        </div>
        <Button
          onClick={handleBack}
          startIcon={<ArrowBackIcon />}
          sx={{ 
            bgcolor: 'transparent', 
            border: '1px solid #2d3748',
            color: 'white',
            '&:hover': {
              bgcolor: '#1a2235',
            }
          }}
        >
          Back to Helpers
        </Button>
      </Box>

      {/* Helper Details Section */}
      <Paper 
        elevation={3}
        sx={{ 
          width: '100%',
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#1a2235',
          color: '#f3f4f6',
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          boxSizing: 'border-box'
        }}
      >
        <Grid container spacing={{ xs: 2, sm: 3 }} alignItems="center">
          <Grid item xs={12} sm="auto">
            <Avatar 
              sx={{ 
                width: { xs: 100, sm: 140 }, 
                height: { xs: 100, sm: 140 }, 
                bgcolor: '#3b82f6',
                fontSize: { xs: '2.5rem', sm: '3.5rem' },
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                margin: { xs: '0 auto', sm: 0 }
              }}
            >
              {helperData.name.charAt(0)}
            </Avatar>
          </Grid>
          <Grid item xs={12} sm>
            <Typography variant="h4" sx={{ 
              mb: { xs: 1.5, sm: 2 }, 
              fontWeight: 600,
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' },
              textAlign: { xs: 'center', sm: 'left' },
              color: '#f3f4f6'
            }}>
              {helperData.name}
            </Typography>
            <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }}>
              <Grid item xs={12} md={12}>
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: '#111923',
                  borderRadius: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <Typography variant="body2" color="#9ca3af">Total Bookings</Typography>
                  <Typography variant="h6" sx={{ 
                    color: '#f3f4f6',
                    fontSize: { xs: '1.1rem', sm: '1.25rem' }
                  }}>
                    {helperData.totalBookings}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Services by Month Section */}
      <Paper 
        elevation={3}
        sx={{ 
          width: '100%',
          p: { xs: 1, sm: 2, md: 3 }, 
          bgcolor: '#1a2235',
          color: '#f3f4f6',
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          flexGrow: 0
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          mb: { xs: 1.5, sm: 2 },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1.5, sm: 0 }
        }}>
          <Typography variant="h6" sx={{ 
            fontWeight: 600,
            fontSize: { xs: '1.1rem', sm: '1.25rem' },
            color: '#f3f4f6'
          }}>
            Services by Month
          </Typography>
          <Select
            value={selectedYear}
            onChange={(e: SelectChangeEvent) => setSelectedYear(e.target.value)}
            size="small"
            sx={{
              minWidth: { xs: 100, sm: 120 },
              color: '#f3f4f6',
              bgcolor: '#111923',
              '& .MuiSelect-icon': { color: '#f3f4f6' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
            }}
          >
            {years.map((year) => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </Box>

        <TableContainer sx={{ 
          maxHeight: 300,
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#111923',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#2d3748',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#3b82f6',
          }
        }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  backgroundColor: '#111923', 
                  color: 'white',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #2d3748',
                  width: '50%'
                }}>
                  Service
                </TableCell>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                  <TableCell 
                    key={month} 
                    align="center"
                    sx={{ 
                      backgroundColor: '#111923', 
                      color: 'white',
                      fontWeight: 'bold',
                      borderBottom: '1px solid #2d3748',
                      minWidth: '50px'
                    }}
                    title={getMonthName(month)}
                  >
                    {getShortMonthName(month)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredServicesByMonth.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ color: 'white', py: 3 }}>
                    No service data found for this year
                  </TableCell>
                </TableRow>
              ) : (
                // Group services by name and display each in a row
                Array.from(
                  new Set(filteredServicesByMonth.map(item => item.service_name))
                ).map(serviceName => {
                  // Get all entries for this service
                  const serviceEntries = filteredServicesByMonth.filter(
                    item => item.service_name === serviceName
                  );
                  
                  // Get max value for color scaling
                  const maxValue = getMaxValue(filteredServicesByMonth);
                  
                  return (
                    <TableRow 
                      key={serviceName} 
                      sx={{ 
                        '&:nth-of-type(odd)': { backgroundColor: '#131b2c' }
                      }}
                    >
                      <TableCell 
                        sx={{ 
                          color: 'white', 
                          borderBottom: '1px solid #1e293b',
                          fontWeight: 'medium'
                        }}
                      >
                        {serviceName}
                      </TableCell>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                        // Format month as in data (YYYY-MM)
                        const monthStr = month < 10 ? `0${month}` : `${month}`;
                        const monthFormat = `${selectedYear}-${monthStr}`;
                        
                        // Find the count for this month
                        const entry = serviceEntries.find(item => item.month === monthFormat);
                        const count = entry ? entry.count : 0;
                        
                        return (
                          <TableCell 
                            key={month} 
                            align="center" 
                            sx={{ 
                              color: 'white', 
                              borderBottom: '1px solid #1e293b',
                              bgcolor: getHeatmapColor(count, maxValue),
                              p: 1,
                              minWidth: '50px'
                            }}
                            title={count > 0 ? `${getMonthName(month)} ${selectedYear}: ${count} bookings` : ''}
                          >
                            {count > 0 ? count : ''}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Recent Bookings */}
      <Paper 
        elevation={3}
        sx={{ 
          width: '100%',
          p: { xs: 1, sm: 2, md: 3 }, 
          bgcolor: '#1a2235',
          color: '#f3f4f6',
          mb: { xs: 0, sm: 0 },
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          mb: { xs: 1.5, sm: 2 },
          pb: 2,
          borderBottom: '1px solid #2d3748'
        }}>
          <Typography variant="h6" sx={{ 
            fontWeight: 600,
            fontSize: { xs: '1.1rem', sm: '1.25rem' },
            color: '#f3f4f6'
          }}>
            Recent Bookings
          </Typography>
        </Box>
        
        <TableContainer sx={{ 
          flexGrow: 1,
          maxHeight: 'calc(100vh - 700px)', // Adjusted for the new services table
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#111923',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#2d3748',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#3b82f6',
          }
        }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  backgroundColor: '#111923', 
                  color: 'white',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #2d3748'
                }}>
                  Service
                </TableCell>
                <TableCell sx={{ 
                  backgroundColor: '#111923', 
                  color: 'white',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #2d3748'
                }}>
                  Customer
                </TableCell>
                <TableCell sx={{ 
                  backgroundColor: '#111923', 
                  color: 'white',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #2d3748'
                }}>
                  Practitioner
                </TableCell>
                <TableCell sx={{ 
                  backgroundColor: '#111923', 
                  color: 'white',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #2d3748'
                }}>
                  Date
                </TableCell>
                <TableCell sx={{ 
                  backgroundColor: '#111923', 
                  color: 'white',
                  fontWeight: 'bold',
                  borderBottom: '1px solid #2d3748'
                }}>
                  Time
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'white', py: 4 }}>
                    No bookings found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedBookings.map((booking, index) => (
                  <TableRow 
                    key={index} 
                    hover 
                    sx={{ 
                      '&:hover': { backgroundColor: '#1a2440 !important' },
                      '&:nth-of-type(odd)': { backgroundColor: '#131b2c' }
                    }}
                  >
                    <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                      <Typography sx={{ color: '#3b82f6', fontWeight: 'medium' }}>
                        {booking.serviceName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'gray', display: 'block' }}>
                        {booking.serviceDescription.substring(0, 50)}
                        {booking.serviceDescription.length > 50 ? '...' : ''}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                      {booking.customerName}
                    </TableCell>
                    <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                      {booking.practitionerName}
                    </TableCell>
                    <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                      {booking.checkInTime.split(',')[0]}
                    </TableCell>
                    <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                      {booking.checkInTime.split(',')[1]?.trim()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          p: 2, 
          borderTop: '1px solid #1e293b',
          mt: 'auto' 
        }}>
          <Pagination
            count={Math.ceil((helperData.recentBookings.length || 0) / rowsPerPage)}
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
      </Paper>
    </Box>
  );
};

export default HelperDetails; 