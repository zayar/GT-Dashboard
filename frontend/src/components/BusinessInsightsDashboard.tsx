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

// Define period type for time selection
type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

interface KeyMetrics {
  totalRevenue: number;
  totalBookings: number;
  newCustomers: number;
  returningCustomers: number;
}

interface CustomerData {
  customerName: string;
  visitCount: number;
  totalSpent: number;
}

interface ServiceData {
  serviceName: string;
  bookingCount: number;
}

interface SalesData {
  paymentMethod: string;
  totalAmount: number;
}

const BusinessInsightsDashboard: React.FC = () => {
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [keyMetrics, setKeyMetrics] = useState<KeyMetrics | null>(null);
  const [customerData, setCustomerData] = useState<CustomerData[]>([]);
  const [serviceData, setServiceData] = useState<ServiceData[]>([]);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
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
    fetchBusinessData();
  }, [period, yearSelection]);

  const fetchBusinessData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let timeFilterSQL;
      let groupFormat;
      
      // Configure time filter based on period selection
      if (period === 'daily') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "FORMAT_TIMESTAMP('%d %b %Y', CheckInTime)";
      } else if (period === 'weekly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "CONCAT('Week ', EXTRACT(WEEK FROM CheckInTime), ' ', EXTRACT(YEAR FROM CheckInTime))";
      } else if (period === 'monthly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "FORMAT_TIMESTAMP('%b %Y', CheckInTime)";
      } else if (period === 'quarterly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "CONCAT('Q', EXTRACT(QUARTER FROM CheckInTime), ' ', EXTRACT(YEAR FROM CheckInTime))";
      } else if (period === 'annual') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) >= ${yearSelection - 2} AND EXTRACT(YEAR FROM CheckInTime) <= ${yearSelection}`;
        groupFormat = "EXTRACT(YEAR FROM CheckInTime)::text";
      }
      
      // SQL for key metrics
      const keyMetricsSQL = `
        SELECT 
          SUM(CAST(Price AS FLOAT64)) AS totalRevenue,
          COUNT(*) AS totalBookings,
          COUNT(DISTINCT CASE WHEN isNewCustomer THEN CustomerID END) AS newCustomers,
          COUNT(DISTINCT CASE WHEN NOT isNewCustomer THEN CustomerID END) AS returningCustomers
        FROM great_time.QueenDataView
        WHERE ${timeFilterSQL}
      `;
      
      // SQL for customer data
      const customerDataSQL = `
        SELECT 
          CustomerName AS customerName,
          COUNT(*) AS visitCount,
          SUM(CAST(Price AS FLOAT64)) AS totalSpent
        FROM great_time.QueenDataView
        WHERE ${timeFilterSQL}
        GROUP BY CustomerName
        ORDER BY totalSpent DESC
        LIMIT 10
      `;
      
      // SQL for service data
      const serviceDataSQL = `
        SELECT 
          ServiceName AS serviceName,
          COUNT(*) AS bookingCount
        FROM great_time.QueenDataView
        WHERE ${timeFilterSQL}
        GROUP BY ServiceName
        ORDER BY bookingCount DESC
        LIMIT 10
      `;
      
      // SQL for sales data
      const salesDataSQL = `
        SELECT 
          PaymentMethod AS paymentMethod,
          SUM(CAST(Price AS FLOAT64)) AS totalAmount
        FROM great_time.QueenDataView
        WHERE ${timeFilterSQL}
        GROUP BY PaymentMethod
        ORDER BY totalAmount DESC
      `;
      
      // Execute queries in parallel
      const [keyMetricsResponse, customerResponse, serviceResponse, salesResponse] = await Promise.all([
        axios.post('/api/query', 
          { query: keyMetricsSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post('/api/query', 
          { query: customerDataSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post('/api/query', 
          { query: serviceDataSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post('/api/query', 
          { query: salesDataSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        )
      ]);
      
      if (keyMetricsResponse.data.success) {
        setKeyMetrics(keyMetricsResponse.data.data[0] || null);
      } else {
        setError(keyMetricsResponse.data.error || 'Failed to fetch key metrics.');
        return;
      }
      
      if (customerResponse.data.success) {
        setCustomerData(customerResponse.data.data || []);
      } else {
        setError(customerResponse.data.error || 'Failed to fetch customer data.');
        return;
      }
      
      if (serviceResponse.data.success) {
        setServiceData(serviceResponse.data.data || []);
      } else {
        setError(serviceResponse.data.error || 'Failed to fetch service data.');
        return;
      }
      
      if (salesResponse.data.success) {
        setSalesData(salesResponse.data.data || []);
      } else {
        setError(salesResponse.data.error || 'Failed to fetch sales data.');
        return;
      }
    } catch (err: any) {
      console.error('Error fetching business data:', err);
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

  // Filter customers based on search term
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customerData;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return customerData.filter(customer => 
      customer.customerName.toLowerCase().includes(searchLower)
    );
  }, [customerData, searchTerm]);

  // Format currency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + " MMK";
  };

  // Key Metrics Chart Options
  const keyMetricsChartOptions: ApexOptions = {
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
    colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444'],
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
      categories: ['Revenue', 'Bookings', 'New Customers', 'Returning Customers'],
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
        text: 'Metrics',
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
          return formatCurrency(val);
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

  const keyMetricsChartSeries = [
    {
      name: 'Metrics',
      data: [
        keyMetrics?.totalRevenue || 0,
        keyMetrics?.totalBookings || 0,
        keyMetrics?.newCustomers || 0,
        keyMetrics?.returningCustomers || 0
      ]
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
        Business Insights Dashboard
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
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
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
            onClick={fetchBusinessData}
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
            onClick={fetchBusinessData}
            sx={{ bgcolor: '#1e40af' }}
          >
            Try Again
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* Key Metrics Chart */}
          <Grid item xs={12}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              height: '100%'
            }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 500, color: '#e2e8f0' }}>
                Key Business Metrics
              </Typography>
              <Box sx={{ height: 350 }}>
                <ReactApexChart 
                  options={keyMetricsChartOptions} 
                  series={keyMetricsChartSeries} 
                  type="bar" 
                  height={350} 
                />
              </Box>
            </Paper>
          </Grid>
          
          {/* Customer Insights Table */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              overflow: 'hidden'
            }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 500, color: '#e2e8f0' }}>
                  Top Customers
                </Typography>
                <Box sx={{ width: '300px' }}>
                  <TextField
                    placeholder="Search customers..."
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
                        CUSTOMER NAME
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
                        VISITS
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
                        TOTAL SPENT
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCustomers.map((customer, index) => (
                      <TableRow 
                        key={customer.customerName}
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
                          {customer.customerName}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#4f46e5',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {customer.visitCount.toLocaleString()}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#10b981',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {formatCurrency(customer.totalSpent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
          
          {/* Service Performance Table */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              overflow: 'hidden'
            }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 500, color: '#e2e8f0' }}>
                Top Services
              </Typography>
              
              <TableContainer sx={{ 
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
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {serviceData.map((service) => (
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
                          {service.bookingCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
          
          {/* Sales Data Table */}
          <Grid item xs={12}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              overflow: 'hidden'
            }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 500, color: '#e2e8f0' }}>
                Sales by Payment Method
              </Typography>
              
              <TableContainer sx={{ 
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
                        minWidth: '250px'
                      }}>
                        PAYMENT METHOD
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
                        TOTAL AMOUNT
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {salesData.map((sale) => (
                      <TableRow 
                        key={sale.paymentMethod}
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
                          {sale.paymentMethod}
                        </TableCell>
                        <TableCell sx={{ 
                          color: '#10b981',
                          padding: '12px 16px',
                          borderBottom: '1px solid #2d3748',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {formatCurrency(sale.totalAmount)}
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

export default BusinessInsightsDashboard; 