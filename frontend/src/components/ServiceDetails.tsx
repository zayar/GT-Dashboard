import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Paper, Typography, Avatar, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, IconButton, Select, MenuItem, Pagination, TablePagination, useTheme } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { ChartData } from 'chart.js';
import axios from 'axios';
import { SelectChangeEvent } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useClinic } from '../contexts/ClinicContext';

interface ServiceDetailsProps {}

interface MonthlySale {
  month: string;
  count: number;
}

interface ServiceRecord {
  checkin_time: string;
  customer_name: string;
  therapist_name: string;
  month: string;
  check_in_date?: string;
}

interface ServiceData {
  monthlySales: MonthlySale[];
  serviceRecords: ServiceRecord[];
  description: string;
  name?: string;
  image?: string;
  total_bookings?: number;
  total_customers?: number;
  total_revenue?: number;
  last_booking_date?: string;
  customers?: any[];
  boughtTogether?: any[];
  therapists?: any[];
}

const ServiceDetails: React.FC<ServiceDetailsProps> = React.memo(() => {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const theme = useTheme();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = React.useState(true);
  const [serviceData, setServiceData] = React.useState<ServiceData | null>(null);
  const [error, setError] = React.useState('');
  const [imageError, setImageError] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(12);
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = React.useState<number>(() => {
    return new Date().getFullYear();
  });
  const [recordsPage, setRecordsPage] = React.useState(0);
  const [recordsPerPage, setRecordsPerPage] = React.useState(10);
  const [filteredServiceRecords, setFilteredServiceRecords] = useState<ServiceRecord[]>([]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage - 1);
  };

  const handleChangeRowsPerPage = (event: SelectChangeEvent<number>) => {
    setRowsPerPage(parseInt(event.target.value.toString(), 10));
    setPage(0);
  };

  const handleRecordsPageChange = useCallback((_event: unknown, newPage: number) => {
    setRecordsPage(newPage - 1);
  }, []);

  const handleRecordsPerPageChange = (event: SelectChangeEvent<number>) => {
    setRecordsPerPage(parseInt(event.target.value.toString(), 10));
    setRecordsPage(0);
  };

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleYearChange = (event: SelectChangeEvent<number>) => {
    setSelectedYear(Number(event.target.value));
    setPage(0);
    setRecordsPage(0);
  };

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
  }, []);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `Appointments: ${context.raw}`
        },
        backgroundColor: 'rgba(26, 38, 53, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#3b82f6',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          color: '#94a3b8'
        },
        grid: {
          color: 'rgba(71, 85, 105, 0.2)'
        },
        title: {
          display: true,
          text: 'Number of Appointments',
          color: '#94a3b8'
        }
      },
      x: {
        ticks: {
          color: '#94a3b8',
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: 'rgba(71, 85, 105, 0.2)'
        }
      }
    }
  }), []);

  const chartData = useMemo((): ChartData<'bar'> => {
    if (!serviceData?.monthlySales) return {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
        borderWidth: 1
      }]
    };
    
    return {
      labels: serviceData.monthlySales.map((sale: MonthlySale) => {
        const [year, month] = sale.month.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return new Intl.DateTimeFormat('en-US', { 
          year: 'numeric',
          month: 'short'
        }).format(date);
      }),
      datasets: [{
        data: serviceData.monthlySales.map((sale: MonthlySale) => sale.count),
        backgroundColor: '#3b82f6',
        borderColor: '#60a5fa',
        borderWidth: 1
      }]
    };
  }, [serviceData?.monthlySales]);

  const handleMonthChange = useCallback((event: SelectChangeEvent<string>) => {
    setSelectedMonth(event.target.value);
  }, []);

  const paginatedRecords = useMemo(() => {
    if (!serviceData?.serviceRecords) return [];
    const startIndex = recordsPage * recordsPerPage;
    return serviceData.serviceRecords.slice(startIndex, startIndex + recordsPerPage);
  }, [serviceData?.serviceRecords, recordsPage, recordsPerPage]);

  useEffect(() => {
    if (serviceData?.serviceRecords) {
      const filtered = serviceData.serviceRecords.filter((record: ServiceRecord) => {
        const recordMonth = record.month || record.check_in_date?.substring(0, 7);
        return selectedMonth === '' || selectedMonth === recordMonth;
      });
      setFilteredServiceRecords(filtered);
      setRecordsPage(0); // Reset to first page when filter changes
    }
  }, [selectedMonth, serviceData?.serviceRecords]);

  React.useEffect(() => {
    const fetchServiceData = async () => {
      if (!name || !currentClinic) {
        setError('Service name is required and clinic must be selected');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const decodedServiceName = decodeURIComponent(name);
        
        // Escape single quotes in service name by doubling them to prevent SQL injection
        const escapedServiceName = decodedServiceName.replace(/'/g, "''");
        
        // First, fetch service profile
        const profileQuery = `
WITH ServiceStats AS (
  SELECT
    ServiceName,
    ServiceImage,
    COUNT(DISTINCT BookingID) as total_bookings,
    COUNT(DISTINCT CustomerName) as total_customers,
    CAST(SUM(CAST(Price AS FLOAT64)) AS INT64) as total_revenue
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY ServiceName, ServiceImage
)
SELECT
  ServiceName as name,
  ServiceStats.ServiceImage as image,
  'No description available' as description,
  total_bookings,
  total_customers,
  total_revenue,
  FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_booking_date
FROM great_time.MainDataView
JOIN ServiceStats USING (ServiceName)
WHERE ServiceName = '${escapedServiceName}'
AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
GROUP BY ServiceName, ServiceStats.ServiceImage, total_bookings, total_customers, total_revenue;`;

        const profileResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: profileQuery },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (!profileResponse.data.success || !profileResponse.data.data[0]) {
          throw new Error('Service profile not found');
        }

        const profile = profileResponse.data.data[0];
        
        // Then fetch other data
        const dataQuery = `
WITH MonthlySales AS (
  SELECT
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
    COUNT(*) as count
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY month
  ORDER BY month DESC
  LIMIT 18
),

BoughtTogether AS (
  SELECT
    b2.ServiceName as service_name,
    COUNT(*) as bought_together_count
  FROM great_time.MainDataView b1
  JOIN great_time.MainDataView b2
    ON b1.CustomerName = b2.CustomerName
    AND b1.ServiceName = '${escapedServiceName}'
    AND b2.ServiceName != '${escapedServiceName}'
    AND LOWER(b1.ClinicCode) = LOWER('${currentClinic.code}')
    AND LOWER(b2.ClinicCode) = LOWER('${currentClinic.code}')
  WHERE EXTRACT(YEAR FROM b1.CheckInTime) = ${selectedYear}
  AND EXTRACT(YEAR FROM b2.CheckInTime) = ${selectedYear}
  GROUP BY b2.ServiceName
  ORDER BY bought_together_count DESC
  LIMIT 10
),

Therapists AS (
  SELECT
    PractitionerName as name,
    COUNT(*) as service_count
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
    AND PractitionerName IS NOT NULL
    AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY PractitionerName
  ORDER BY service_count DESC
),

Customers AS (
  SELECT
    CustomerName as name,
    CustomerPhoneNumber as phone,
    COUNT(*) as purchase_count
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY CustomerName, CustomerPhoneNumber
  ORDER BY purchase_count DESC
  LIMIT 100
),

ServiceRecords AS (
  SELECT
    FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', CheckInTime) as checkin_time,
    CustomerName as customer_name,
    PractitionerName as therapist_name,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) as month
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  ORDER BY CheckInTime DESC
)

SELECT
  ARRAY(SELECT AS STRUCT * FROM MonthlySales) as monthlySales,
  ARRAY(SELECT AS STRUCT * FROM BoughtTogether) as boughtTogether,
  ARRAY(SELECT AS STRUCT * FROM Therapists) as therapists,
  ARRAY(SELECT AS STRUCT * FROM Customers) as customers,
  ARRAY(SELECT AS STRUCT * FROM ServiceRecords) as serviceRecords;`;

        const dataResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: dataQuery },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (!dataResponse.data.success) {
          throw new Error(dataResponse.data.error || 'Failed to fetch service data');
        }

        const result = dataResponse.data.data[0];
        if (!result) {
          throw new Error('Service data not found');
        }

        setServiceData({
          ...profile,
          monthlySales: result.monthlySales.reverse(),
          boughtTogether: result.boughtTogether,
          therapists: result.therapists,
          customers: result.customers,
          serviceRecords: result.serviceRecords || []
        });

      } catch (err: any) {
        console.error('Error fetching service data:', err);
        let errorMessage = 'Failed to fetch service data';
        
        if (err.response?.data?.error) {
          errorMessage = `Server error: ${err.response.data.error}`;
        } else if (err.response?.status === 400) {
          // Specific handling for 400 Bad Request
          const responseText = err.response?.data ? JSON.stringify(err.response.data) : 'No details available';
          errorMessage = `Bad request (400): ${responseText}. This may be due to invalid characters in the service name.`;
          console.error('Query that caused error:', { 
            serviceName: name,
            decodedName: decodeURIComponent(name),
            escapedName: decodeURIComponent(name).replace(/'/g, "''") 
          });
        } else if (err.response?.status === 500) {
          errorMessage = 'Internal server error. Please try again later.';
        } else if (err.code === 'ECONNREFUSED') {
          errorMessage = 'Unable to connect to the server. Please check if the backend service is running.';
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchServiceData();
  }, [name, selectedYear, currentClinic]);

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex',
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        height: '100vh',
        width: '100%',
        bgcolor: '#101924'
      }}>
        <CircularProgress sx={{ color: '#3b82f6', margin: 'auto' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        p: 4, 
        maxWidth: '800px', 
        margin: '0 auto', 
        textAlign: 'center',
        bgcolor: '#101924',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Typography variant="h5" sx={{ mb: 2, color: '#f3f4f6' }}>
          Unable to load service details
        </Typography>
        <Paper sx={{ p: 3, bgcolor: '#1e293b', borderRadius: '8px', mb: 3, width: '100%' }}>
          <Typography variant="body1" sx={{ color: '#f3f4f6', mb: 3 }}>
            {error}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 4 }}>
            This could be due to special characters in the service name or a temporary issue with the database.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <IconButton
              sx={{ 
                bgcolor: '#3b82f6', 
                color: 'white', 
                '&:hover': { bgcolor: '#2563eb' } 
              }}
              onClick={() => navigate(-1)}
            >
              <ArrowBackIcon />
            </IconButton>
            <IconButton
              sx={{ 
                bgcolor: '#3b82f6', 
                color: 'white', 
                '&:hover': { bgcolor: '#2563eb' } 
              }}
              onClick={() => window.location.reload()}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (!serviceData) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100%',
        bgcolor: '#101924',
        p: 3 
      }}>
        <Typography color="#fff" variant="h6" align="center">No service data found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 2, sm: 3, md: 4 },
      bgcolor: '#101729',
      minHeight: '100vh',
      height: '100vh',
      width: '100%',
      maxWidth: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxSizing: 'border-box',
      m: 0,
      overflowX: 'hidden',
      overflowY: 'hidden',
      color: '#e2e8f0',
      fontSize: '14px'
    }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        mb: 2,
        width: '100%'
      }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#6d8fff',
            mr: 2,
            '&:hover': {
              bgcolor: 'rgba(109, 143, 255, 0.08)'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        
        {/* Year Selector */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ mr: 1, color: '#94a3b8' }}>
            Year:
          </Typography>
          <Select
            value={selectedYear}
            onChange={handleYearChange}
            size="small"
            sx={{
              height: '32px',
              minWidth: '100px',
              bgcolor: '#1e293b',
              color: '#f1f5f9',
              '& .MuiSelect-icon': {
                color: '#94a3b8'
              },
              '&:hover': {
                bgcolor: '#1e293b'
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#2d3748'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: '#3b82f6'
              }
            }}
          >
            {yearOptions.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>
      
      {/* Main scrollable content container */}
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        flexGrow: 1,
        height: 'calc(100vh - 70px)', // Adjust for header and padding
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#1a2235',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#2d3748',
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: '#4a5568',
        }
      }}>
      
      {/* Service Details Section */}
      <Paper 
        elevation={3}
        sx={{ 
          width: '100%',
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#1a2635',
          color: '#e2e8f0',
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          border: '1px solid #2d3748',
          boxSizing: 'border-box'
        }}
      >
        <Grid container spacing={{ xs: 2, sm: 3 }} alignItems="center">
          <Grid item xs={12} sm="auto">
            <Avatar 
              src={!imageError ? serviceData.image : undefined}
              alt={serviceData.name}
              sx={{ 
                width: { xs: 120, sm: 160 }, 
                height: { xs: 120, sm: 160 }, 
                bgcolor: '#3b82f6',
                fontSize: { xs: '3rem', sm: '4rem' },
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                margin: { xs: '0 auto', sm: 0 }
              }}
              imgProps={{
                onError: () => {
                  setImageError(true);
                }
              }}
            >
              {(imageError || !serviceData.image) && serviceData.name?.charAt(0)?.toUpperCase()}
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
              {serviceData.name}
            </Typography>
            <Typography variant="body1" sx={{ 
              mb: { xs: 1.5, sm: 2 }, 
              color: '#94a3b8',
              textAlign: { xs: 'center', sm: 'left' }
            }}>
              {serviceData.description}
            </Typography>
            <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }}>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#111923', borderRadius: 2, border: '1px solid #2d3748' }}>
                  <Typography variant="body2" color="#94a3b8">Total Bookings</Typography>
                  <Typography variant="h6" sx={{ color: '#f3f4f6', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {serviceData.total_bookings}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#111923', borderRadius: 2, border: '1px solid #2d3748' }}>
                  <Typography variant="body2" color="#94a3b8">Total Customers</Typography>
                  <Typography variant="h6" sx={{ color: '#f3f4f6', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {serviceData.total_customers}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#111923', borderRadius: 2, border: '1px solid #2d3748' }}>
                  <Typography variant="body2" color="#94a3b8">Total Revenue</Typography>
                  <Typography variant="h6" sx={{ color: '#f3f4f6', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    ${serviceData.total_revenue?.toLocaleString()}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#111923', borderRadius: 2, border: '1px solid #2d3748' }}>
                  <Typography variant="body2" color="#94a3b8">Last Booking</Typography>
                  <Typography variant="h6" sx={{ color: '#f3f4f6', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {serviceData.last_booking_date}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Monthly Sales Chart with improved styling */}
      <Paper 
        elevation={3}
        sx={{ 
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#1a2635', 
          color: '#e2e8f0',
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          border: '1px solid #2d3748'
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#f3f4f6' }}>Monthly Appointment</Typography>
        <Box sx={{ height: 300 }}>
          <Bar
            data={chartData}
            options={chartOptions}
          />
        </Box>
      </Paper>

      {/* Customers Section */}
      <Paper 
        elevation={3}
        sx={{ 
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#1a2635', 
          color: '#e2e8f0',
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          border: '1px solid #2d3748'
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#f3f4f6' }}>
          Customers who bought "{decodeURIComponent(name || '')}"
        </Typography>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  bgcolor: '#1e293b',
                  color: '#94a3b8',
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748'
                }}>Name</TableCell>
                <TableCell sx={{ 
                  bgcolor: '#1e293b',
                  color: '#94a3b8',
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748'
                }}>Phone</TableCell>
                <TableCell sx={{ 
                  bgcolor: '#1e293b',
                  color: '#94a3b8',
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748'
                }}>Purchase Count</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {serviceData.customers
                ?.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((customer: any, index: number) => (
                <TableRow key={index} sx={{ '&:hover': { bgcolor: '#242f3d' } }}>
                  <TableCell 
                    sx={{ 
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      borderBottom: '1px solid #2d3748',
                      '&:hover': {
                        color: '#60a5fa',
                        textDecoration: 'underline'
                      }
                    }}
                    onClick={() => navigate(`/customers/${encodeURIComponent(customer.phone || customer.name)}`)}
                  >
                    {customer.name}
                  </TableCell>
                  <TableCell sx={{ color: '#e2e8f0', borderBottom: '1px solid #2d3748' }}>{customer.phone}</TableCell>
                  <TableCell sx={{ color: '#e2e8f0', borderBottom: '1px solid #2d3748' }}>{customer.purchase_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
          <Select
            value={rowsPerPage}
            onChange={handleChangeRowsPerPage}
            sx={{
              color: '#e2e8f0',
              '& .MuiSelect-icon': { color: '#e2e8f0' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
              bgcolor: '#1e293b'
            }}
            size="small"
          >
            <MenuItem value={6}>6 per page</MenuItem>
            <MenuItem value={12}>12 per page</MenuItem>
            <MenuItem value={25}>25 per page</MenuItem>
          </Select>
          <Pagination
            count={Math.ceil((serviceData.customers?.length || 0) / rowsPerPage)}
            page={page + 1}
            onChange={handleChangePage}
            sx={{
              '& .MuiPaginationItem-root': {
                color: '#e2e8f0',
                borderColor: '#2d3748'
              },
              '& .MuiPaginationItem-root.Mui-selected': {
                bgcolor: '#3b82f6',
                '&:hover': {
                  bgcolor: '#2563eb'
                }
              }
            }}
          />
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Bought Together Section */}
        <Grid item xs={12} md={6}>
          <Paper 
            elevation={3}
            sx={{ 
              p: { xs: 2, sm: 3 }, 
              bgcolor: '#1a2635', 
              color: '#e2e8f0',
              height: '100%',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid #2d3748'
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#f3f4f6' }}>
              Bought Together With "{decodeURIComponent(name || '')}"
            </Typography>
            <TableContainer sx={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
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
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Service Name</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Bought Together Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {serviceData.boughtTogether?.map((service: any, index: number) => (
                    <TableRow key={index} sx={{ '&:hover': { bgcolor: '#242f3d' } }}>
                      <TableCell 
                        sx={{ 
                          color: '#e2e8f0',
                          cursor: 'pointer',
                          borderBottom: '1px solid #2d3748',
                          '&:hover': {
                            color: '#60a5fa',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => navigate(`/service/${encodeURIComponent(service.service_name)}`)}
                      >
                        {service.service_name}
                      </TableCell>
                      <TableCell sx={{ color: '#e2e8f0', borderBottom: '1px solid #2d3748' }}>{service.bought_together_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Therapists Section */}
        <Grid item xs={12} md={6}>
          <Paper 
            elevation={3}
            sx={{ 
              p: { xs: 2, sm: 3 }, 
              bgcolor: '#1a2635', 
              color: '#e2e8f0',
              height: '100%',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid #2d3748'
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#f3f4f6' }}>
              Top Therapists
            </Typography>
            <TableContainer sx={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
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
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Name</TableCell>
                    <TableCell sx={{ color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Service Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {serviceData.therapists?.map((therapist: any, index: number) => (
                    <TableRow key={index} sx={{ '&:hover': { bgcolor: '#242f3d' } }}>
                      <TableCell sx={{ color: '#e2e8f0', borderBottom: '1px solid #2d3748' }}>{therapist.name}</TableCell>
                      <TableCell sx={{ color: '#e2e8f0', borderBottom: '1px solid #2d3748' }}>{therapist.service_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Service Records Section */}
        <Grid item xs={12}>
          <Paper 
            elevation={3}
            sx={{ 
              p: { xs: 2, sm: 3 }, 
              bgcolor: '#1a2635', 
              color: '#e2e8f0',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid #2d3748'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#f3f4f6' }}>Service Records</Typography>
              <Select
                value={selectedMonth}
                onChange={handleMonthChange}
                sx={{
                  minWidth: 200,
                  color: '#e2e8f0',
                  '& .MuiSelect-icon': { color: '#e2e8f0' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
                  bgcolor: '#1e293b'
                }}
                size="small"
              >
                <MenuItem value="">All Time</MenuItem>
                {serviceData?.monthlySales?.map((sale: MonthlySale) => (
                  <MenuItem key={sale.month} value={sale.month}>
                    {new Date(sale.month + '-01').toLocaleDateString('en-US', { 
                      year: 'numeric',
                      month: 'long'
                    })}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <TableContainer sx={{ 
              maxHeight: '400px',
              overflowY: 'auto',
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
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#1e293b',
                        color: '#94a3b8',
                        fontWeight: 600,
                        minWidth: '180px',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      Check-in Time
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#1e293b',
                        color: '#94a3b8',
                        fontWeight: 600,
                        minWidth: '200px',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      Customer
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#1e293b',
                        color: '#94a3b8',
                        fontWeight: 600,
                        minWidth: '200px',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      Therapist
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredServiceRecords
                    .slice(recordsPage * recordsPerPage, (recordsPage + 1) * recordsPerPage)
                    .map((record: any, index: number) => (
                      <TableRow key={index} sx={{ '&:hover': { bgcolor: '#242f3d' } }}>
                        <TableCell sx={{ color: '#e2e8f0', borderBottom: '1px solid #2d3748' }}>
                          {record.checkin_time}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: '#e2e8f0',
                            cursor: 'pointer',
                            borderBottom: '1px solid #2d3748',
                            '&:hover': {
                              color: '#60a5fa',
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => {
                            // Look for phone in record or find it in the service data
                            const customerPhone = record.phone || 
                              // Try to find the phone number from the customers array if available
                              (serviceData.customers?.find(c => c.name === record.customer_name)?.phone) || 
                              record.customer_name;
                            navigate(`/customers/${encodeURIComponent(customerPhone)}`);
                          }}
                        >
                          {record.customer_name}
                        </TableCell>
                        <TableCell 
                          sx={{ 
                            color: '#e2e8f0',
                            cursor: 'pointer',
                            borderBottom: '1px solid #2d3748',
                            '&:hover': {
                              color: '#60a5fa',
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => navigate(`/therapist/${encodeURIComponent(record.therapist_name)}`)}
                        >
                          {record.therapist_name}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              mt: 2,
              gap: 2
            }}>
              <Typography sx={{ color: '#94a3b8' }}>
                {`${recordsPage * recordsPerPage + 1}-${Math.min((recordsPage + 1) * recordsPerPage, filteredServiceRecords.length)} of ${filteredServiceRecords.length}`}
              </Typography>
              <Pagination
                count={Math.ceil(filteredServiceRecords.length / recordsPerPage)}
                page={recordsPage + 1}
                onChange={handleRecordsPageChange}
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: '#e2e8f0',
                    borderColor: '#2d3748'
                  },
                  '& .MuiPaginationItem-root.Mui-selected': {
                    bgcolor: '#3b82f6',
                    '&:hover': {
                      bgcolor: '#2563eb'
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
      </Box> {/* End of scrollable container */}
    </Box>
  );
});

export default ServiceDetails; 