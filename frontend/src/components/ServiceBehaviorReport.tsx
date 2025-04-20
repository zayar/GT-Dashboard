import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  SelectChangeEvent,
  Button,
  TextField,
  InputAdornment,
  Chip,
  Tooltip
} from '@mui/material';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useClinic } from '../contexts/ClinicContext';

// Define period type for time selection
type PeriodType = 'monthly' | 'quarterly' | 'annual';

interface ServiceData {
  serviceName: string;
  month: string;
  bookingCount: number;
}

interface MonthlyServiceCount {
  month: string;
  totalBookings: number;
}

interface ServiceSummary {
  serviceName: string;
  totalBookings: number;
  description?: string;
  change?: number;
}

interface PractitionerServiceData {
  practitionerName: string;
  serviceName: string;
  bookingCount: number;
}

const ServiceBehaviorReport: React.FC = () => {
  const { currentClinic } = useClinic();
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyServiceCounts, setMonthlyServiceCounts] = useState<MonthlyServiceCount[]>([]);
  const [serviceData, setServiceData] = useState<ServiceData[]>([]);
  const [serviceSummary, setServiceSummary] = useState<ServiceSummary[]>([]);
  const [practitionerServiceData, setPractitionerServiceData] = useState<PractitionerServiceData[]>([]);
  const [yearSelection, setYearSelection] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [
      currentYear - 2,
      currentYear - 1,
      currentYear
    ];
  }, []);

  useEffect(() => {
    fetchServiceData();
  }, [period, yearSelection]);

  const fetchServiceData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let timeFilterSQL;
      let groupFormat;
      
      // Configure time filter based on period selection
      if (period === 'monthly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "FORMAT_TIMESTAMP('%b %Y', CheckInTime)";
      } else if (period === 'quarterly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "CONCAT('Q', EXTRACT(QUARTER FROM CheckInTime), ' ', EXTRACT(YEAR FROM CheckInTime))";
      } else if (period === 'annual') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) >= ${yearSelection - 2} AND EXTRACT(YEAR FROM CheckInTime) <= ${yearSelection}`;
        groupFormat = "EXTRACT(YEAR FROM CheckInTime)::text";
      }
      
      if (!currentClinic) {
        setError('No clinic selected. Please select a clinic first.');
        setLoading(false);
        return;
      }
      
      // SQL for service bookings by month
      const serviceBookingsSQL = `
        SELECT 
          ServiceName AS serviceName,
          ${groupFormat} AS month,
          COUNT(*) AS bookingCount
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND ServiceName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY ServiceName, ${groupFormat}
        ORDER BY ServiceName, ${groupFormat} ASC
      `;
      
      // SQL for monthly booking totals
      const monthlyTotalsSQL = `
        SELECT 
          ${groupFormat} AS month,
          COUNT(*) AS totalBookings
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND ServiceName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY ${groupFormat}
        ORDER BY ${groupFormat} ASC
      `;
      
      // SQL for practitioner-service data
      const practitionerServicesSQL = `
        SELECT 
          PractitionerName AS practitionerName,
          ServiceName AS serviceName,
          COUNT(*) AS bookingCount
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND ServiceName IS NOT NULL
        AND PractitionerName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY PractitionerName, ServiceName
        ORDER BY bookingCount DESC
        LIMIT 100
      `;
      
      // Execute queries in parallel
      const [serviceResponse, monthlyResponse, practitionerResponse] = await Promise.all([
        axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: serviceBookingsSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: monthlyTotalsSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: practitionerServicesSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        )
      ]);
      
      if (serviceResponse.data.success) {
        // Transform the response data to match our updated interface without revenue
        const transformedData = serviceResponse.data.data.map((item: any) => ({
          serviceName: item.serviceName,
          month: item.month,
          bookingCount: item.bookingCount
        }));
        
        setServiceData(transformedData);
        
        // Calculate service summary data
        const summary = calculateServiceSummary(transformedData);
        setServiceSummary(summary);
      } else {
        setError(serviceResponse.data.error || 'Failed to fetch service data.');
        return;
      }
      
      if (monthlyResponse.data.success) {
        // Transform the monthly response data to match our updated interface without totalRevenue
        const transformedMonthlyData = monthlyResponse.data.data.map((item: any) => ({
          month: item.month,
          totalBookings: item.totalBookings
        }));
        
        setMonthlyServiceCounts(transformedMonthlyData);
      } else {
        setError(monthlyResponse.data.error || 'Failed to fetch monthly service data.');
        return;
      }
      
      if (practitionerResponse.data.success) {
        setPractitionerServiceData(practitionerResponse.data.data || []);
      } else {
        setError(practitionerResponse.data.error || 'Failed to fetch practitioner service data.');
        return;
      }
    } catch (err: any) {
      console.error('Error fetching service data:', err);
      let errorMessage = 'An unexpected error occurred while fetching data.';
      
      if (err.response) {
        errorMessage = `Server error (${err.response.status}): ${err.response.data?.error || 'Unknown error'}`;
      } else if (err.request) {
        errorMessage = 'No response from server. Please check your connection.';
      } else {
        errorMessage = err.message || 'Unknown error occurred';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate service summary from raw data
  const calculateServiceSummary = (data: ServiceData[]): ServiceSummary[] => {
    // Group by service name
    const serviceMap: Record<string, { totalBookings: number, byMonth: Record<string, { bookings: number }> }> = {};
    
    data.forEach(item => {
      if (!serviceMap[item.serviceName]) {
        serviceMap[item.serviceName] = { 
          totalBookings: 0,
          byMonth: {}
        };
      }
      
      serviceMap[item.serviceName].totalBookings += item.bookingCount;
      
      // Track monthly data for change calculation
      if (!serviceMap[item.serviceName].byMonth[item.month]) {
        serviceMap[item.serviceName].byMonth[item.month] = {
          bookings: 0
        };
      }
      
      serviceMap[item.serviceName].byMonth[item.month].bookings += item.bookingCount;
    });
    
    // Convert to array and calculate change percentage
    const summaryArray = Object.entries(serviceMap).map(([serviceName, data]) => {
      // Calculate change percentage based on the last 2 months if available
      let change = 0;
      const months = Object.keys(data.byMonth).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB.getTime() - dateA.getTime();
      });
      
      if (months.length >= 2) {
        const currentMonth = months[0];
        const previousMonth = months[1];
        
        const currentBookings = data.byMonth[currentMonth].bookings;
        const previousBookings = data.byMonth[previousMonth].bookings;
        
        if (previousBookings > 0) {
          change = ((currentBookings - previousBookings) / previousBookings) * 100;
        }
      }
      
      return {
        serviceName,
        totalBookings: data.totalBookings,
        change
      };
    });
    
    // Sort by total bookings descending
    return summaryArray.sort((a, b) => b.totalBookings - a.totalBookings);
  };
  
  // Handle period change
  const handlePeriodChange = (event: SelectChangeEvent<string>) => {
    setPeriod(event.target.value as PeriodType);
  };
  
  // Handle year change
  const handleYearChange = (event: SelectChangeEvent<string>) => {
    setYearSelection(Number(event.target.value));
  };
  
  // Handle search term change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Filter services based on search term
  const filteredServices = useMemo(() => {
    if (!searchTerm.trim()) {
      return serviceSummary;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return serviceSummary.filter(service => 
      service.serviceName.toLowerCase().includes(searchLower)
    );
  }, [serviceSummary, searchTerm]);

  // Monthly Service Chart Options
  const monthlyServiceChartOptions: ApexOptions = {
    chart: {
      height: 350,
      type: 'bar',
      fontFamily: 'Poppins, Arial, sans-serif',
      background: 'transparent',
      toolbar: {
        show: false
      },
      stacked: true
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '60%',
      }
    },
    colors: ['#4f46e5'],
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    grid: {
      borderColor: '#334155',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    xaxis: {
      categories: monthlyServiceCounts.map(item => item.month),
      labels: {
        style: {
          colors: '#d1d5db',
          fontSize: '12px'
        }
      },
      axisBorder: {
        show: true,
        color: '#334155'
      },
      axisTicks: {
        show: true,
        color: '#334155'
      }
    },
    yaxis: {
      title: {
        text: 'Number of Bookings',
        style: {
          color: '#d1d5db',
          fontSize: '13px',
          fontWeight: 500
        }
      },
      labels: {
        style: {
          colors: '#d1d5db',
          fontSize: '12px'
        }
      }
    },
    tooltip: {
      y: {
        formatter: function (val: number) {
          return val.toString() + ' bookings';
        }
      }
    },
    fill: {
      opacity: 0.9
    },
    legend: {
      show: false
    }
  };

  const monthlyServiceChartSeries = [
    {
      name: 'Service Bookings',
      data: monthlyServiceCounts.map(item => item.totalBookings)
    }
  ];

  return (
    <Box sx={{ 
      p: 3, 
      bgcolor: '#0f172a', 
      minHeight: '100vh',
      color: '#e2e8f0'
    }}>
      <Typography variant="h5" component="h1" sx={{ mb: 4, fontWeight: 600, color: '#e2e8f0' }}>
        Service Behavior Report
      </Typography>

      {/* Filter controls */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 120, bgcolor: '#1e293b', borderRadius: 1 }}>
            <InputLabel id="period-select-label" sx={{ color: '#94a3b8' }}>Period</InputLabel>
            <Select
              labelId="period-select-label"
              id="period-select"
              value={period}
              label="Period"
              onChange={handlePeriodChange}
              sx={{ 
                color: 'white',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#334155'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#475569'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3b82f6'
                },
                '& .MuiSvgIcon-root': {
                  color: '#94a3b8'
                }
              }}
            >
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="quarterly">Quarterly</MenuItem>
              <MenuItem value="annual">Annual</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 120, bgcolor: '#1e293b', borderRadius: 1 }}>
            <InputLabel id="year-select-label" sx={{ color: '#94a3b8' }}>Year</InputLabel>
            <Select
              labelId="year-select-label"
              id="year-select"
              value={yearSelection.toString()}
              label="Year"
              onChange={handleYearChange}
              sx={{ 
                color: 'white',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#334155'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#475569'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3b82f6'
                },
                '& .MuiSvgIcon-root': {
                  color: '#94a3b8'
                }
              }}
            >
              {years.map(year => (
                <MenuItem key={year} value={year.toString()}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button 
            variant="contained" 
            onClick={fetchServiceData}
            sx={{ 
              bgcolor: '#1e40af', 
              color: 'white',
              '&:hover': {
                bgcolor: '#1e3a8a'
              }
            }}
          >
            Refresh Data
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <CircularProgress sx={{ color: '#3b82f6' }} />
        </Box>
      ) : error ? (
        <Paper sx={{ 
          p: 4, 
          bgcolor: '#111827', 
          color: '#e2e8f0',
          border: '1px solid #334155',
          textAlign: 'center'
        }}>
          <Typography color="error" variant="h6" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button 
            variant="contained" 
            onClick={fetchServiceData}
            sx={{ bgcolor: '#1e40af' }}
          >
            Try Again
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* Monthly Service Metrics Chart */}
          <Grid item xs={12}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              height: '100%'
            }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 500, color: '#e2e8f0' }}>
                Monthly Service Bookings
              </Typography>
              <Box sx={{ height: 350 }}>
                <ReactApexChart 
                  options={monthlyServiceChartOptions} 
                  series={monthlyServiceChartSeries} 
                  type="bar" 
                  height={350} 
                />
              </Box>
            </Paper>
          </Grid>
          
          {/* Service Rankings Table with search */}
          <Grid item xs={12}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              overflow: 'hidden'
            }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 500, color: '#e2e8f0' }}>
                  Top Service Rankings
                </Typography>
                <Box sx={{ width: '300px' }}>
                  <TextField
                    placeholder="Search services..."
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                      sx: {
                        color: 'white',
                        bgcolor: '#1e293b',
                        borderRadius: 1,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#334155'
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#475569'
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#3b82f6'
                        }
                      }
                    }}
                  />
                </Box>
              </Box>
              
              <TableContainer sx={{ 
                overflowX: 'auto',
                maxHeight: '500px',
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
                  backgroundColor: '#4a5568',
                }
              }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        width: '50px'
                      }}>
                        RANK
                      </TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        minWidth: '250px'
                      }}>
                        SERVICE NAME
                      </TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        width: '150px',
                        textAlign: 'center'
                      }}>
                        BOOKINGS
                      </TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        width: '120px',
                        textAlign: 'center'
                      }}>
                        CHANGE
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredServices.map((service, index) => (
                      <TableRow 
                        key={service.serviceName}
                        sx={{
                          '&:nth-of-type(odd)': { bgcolor: '#162032' },
                          '&:nth-of-type(even)': { bgcolor: '#111923' },
                          '&:hover': { bgcolor: '#1c2a41' },
                        }}
                      >
                        <TableCell sx={{ 
                          color: '#e2e8f0',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {index + 1}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#e2e8f0',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 500
                        }}>
                          {service.serviceName}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#4f46e5',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {service.totalBookings.toLocaleString()}
                        </TableCell>
                        <TableCell sx={{ 
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          textAlign: 'center'
                        }}>
                          <Chip
                            icon={(service.change || 0) > 0 ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
                            label={`${Math.abs(service.change || 0).toFixed(1)}%`}
                            size="small"
                            sx={{
                              bgcolor: (service.change || 0) > 0 ? 'rgba(16, 185, 129, 0.1)' : (service.change || 0) < 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                              color: (service.change || 0) > 0 ? '#10b981' : (service.change || 0) < 0 ? '#ef4444' : '#94a3b8',
                              border: `1px solid ${(service.change || 0) > 0 ? '#10b981' : (service.change || 0) < 0 ? '#ef4444' : '#4b5563'}`,
                              '.MuiChip-icon': {
                                color: (service.change || 0) > 0 ? '#10b981' : (service.change || 0) < 0 ? '#ef4444' : '#94a3b8',
                              }
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
          
          {/* Practitioner-Service Distribution */}
          <Grid item xs={12}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              overflow: 'hidden'
            }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 500, color: '#e2e8f0' }}>
                Top Practitioner-Service Combinations
              </Typography>
              
              <TableContainer sx={{ 
                maxHeight: '400px',
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
                  backgroundColor: '#4a5568',
                }
              }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        minWidth: '200px'
                      }}>
                        PRACTITIONER
                      </TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        minWidth: '250px'
                      }}>
                        SERVICE
                      </TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        width: '120px',
                        textAlign: 'center'
                      }}>
                        BOOKINGS
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {practitionerServiceData.slice(0, 30).map((item, index) => (
                      <TableRow 
                        key={`${item.practitionerName}-${item.serviceName}`}
                        sx={{
                          '&:nth-of-type(odd)': { bgcolor: '#162032' },
                          '&:nth-of-type(even)': { bgcolor: '#111923' },
                          '&:hover': { bgcolor: '#1c2a41' },
                        }}
                      >
                        <TableCell sx={{ 
                          color: '#e2e8f0',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 500
                        }}>
                          {item.practitionerName}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#e2e8f0',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748'
                        }}>
                          {item.serviceName}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#4f46e5',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {item.bookingCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ServiceBehaviorReport; 