import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Paper, Typography, Avatar, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, IconButton, Select, MenuItem, Pagination, Container, TextField, useTheme, Button } from '@mui/material';
import axios from 'axios';
import { SelectChangeEvent } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

interface TherapistDetailsProps {}

interface ServiceByMonth {
  service_name: string;
  month: string;
  count: number;
}

// Add this interface for customer visit data
interface CustomerVisit {
  customer_name: string;
  customer_phone?: string;
  month: string;
  visit_count: number;
}

// Add new interface for service records
interface ServiceRecord {
  checkin_time: string;
  service: string;
  customer_name: string;
  customer_phone?: string;
}

const TherapistDetails: React.FC<TherapistDetailsProps> = (): JSX.Element => {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [therapistData, setTherapistData] = useState<any>(null);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [years, setYears] = useState<string[]>([]);
  const [filteredServicesByMonth, setFilteredServicesByMonth] = useState<ServiceByMonth[]>([]);

  // Add state for customer data
  const [customerVisitData, setCustomerVisitData] = useState<{
    months: string[];
    customers: string[];
    data: { [key: string]: { [key: string]: number } };
  }>({ months: [], customers: [], data: {} });

  // Add new state for service records
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(0);
  const [recordsPerPage] = useState(20);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filteredServiceRecords, setFilteredServiceRecords] = useState<ServiceRecord[]>(serviceRecords);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage - 1);
  };

  const handleChangeRowsPerPage = (event: SelectChangeEvent<number>) => {
    setRowsPerPage(parseInt(event.target.value.toString(), 10));
    setPage(0);
  };

  const handleBack = React.useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Add this function to format month names
  const getMonthName = (monthNumber: string): string => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[parseInt(monthNumber) - 1];
  };

  // Add this function to calculate heatmap color based on value
  const getHeatmapColor = (value: number, maxValue: number) => {
    if (value === 0) return 'transparent';
    const opacity = 0.2 + (value / maxValue) * 0.7;
    return `rgba(26, 115, 232, ${opacity})`;
  };

  // Add this function to get the maximum value for proper color scaling
  const getMaxValue = (data: ServiceByMonth[]): number => {
    return Math.max(...data.map(item => item.count));
  };

  // Add this function to prepare customer visit data
  const prepareCustomerVisitData = (data: CustomerVisit[]) => {
    if (!data || !Array.isArray(data)) return { months: [], customers: [], data: {} };

    const months = Array.from(new Set(data.map(item => item.month))).sort((a, b) => b.localeCompare(a));
    const customers = Array.from(new Set(data.map(item => item.customer_name))).sort();
    
    // Create a map to store phone numbers by customer name
    const phoneNumberMap: { [key: string]: string } = {};
    
    // Collect phone numbers for each customer
    data.forEach(visit => {
      if (visit.customer_name && visit.customer_phone) {
        phoneNumberMap[visit.customer_name] = visit.customer_phone;
      }
    });
    
    const visitData: { [key: string]: { [key: string]: number, } } = {};
    customers.forEach(customer => {
      visitData[customer] = {
        ...months.reduce((obj, month) => ({ ...obj, [month]: 0 }), {}),
        phone: phoneNumberMap[customer] // Store the phone number for each customer
      } as any;
    });

    data.forEach(visit => {
      if (visit.customer_name && visit.month) {
        visitData[visit.customer_name][visit.month] = visit.visit_count;
      }
    });

    return { months, customers, data: visitData };
  };

  // Add handler for records pagination
  const handleRecordsPageChange = (_event: unknown, newPage: number) => {
    setRecordsPage(newPage - 1);
  };

  useEffect(() => {
    const fetchTherapistData = async () => {
      if (!name) {
        setError('Therapist name is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const decodedTherapistName = decodeURIComponent(name);
        
        // First, fetch therapist profile
        const profileQuery = `
WITH TherapistStats AS (
  SELECT
    PractitionerName,
    PractitionerImage,
    COUNT(DISTINCT BookingID) as total_services,
    MIN(CheckInTime) as first_service_date,
    MAX(CheckInTime) as last_service_date,
    TIMESTAMP_DIFF(MAX(CheckInTime), MIN(CheckInTime), HOUR) as total_service_hours
  FROM great_time.MainDataView
  WHERE PractitionerName = '${decodedTherapistName}'
  GROUP BY PractitionerName, PractitionerImage
)
SELECT
  PractitionerName as name,
  PractitionerImage as image,
  total_services,
  FORMAT_TIMESTAMP('%d %b, %Y', first_service_date) as first_service_date,
  FORMAT_TIMESTAMP('%d %b, %Y', last_service_date) as last_service_date,
  CAST(total_service_hours / 24 AS INT64) as total_service_days
FROM TherapistStats;`;

        const profileResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: profileQuery },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
            },
            timeout: 10000
          }
        );

        if (!profileResponse.data.success || !profileResponse.data.data[0]) {
          throw new Error('Therapist profile not found');
        }

        const profile = profileResponse.data.data[0];
        
        // Then fetch service data by month and customers
        const dataQuery = `
WITH ServicesByMonth AS (
  SELECT
    ServiceName as service_name,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
    COUNT(*) as count
  FROM great_time.MainDataView
  WHERE PractitionerName = '${decodedTherapistName}'
  GROUP BY ServiceName, month
  ORDER BY month DESC, count DESC
),

CustomersByMonth AS (
  SELECT
    CustomerName as customer_name,
    CustomerPhoneNumber as customer_phone,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
    COUNT(*) as visit_count
  FROM great_time.MainDataView
  WHERE PractitionerName = '${decodedTherapistName}'
  GROUP BY CustomerName, customer_phone, month
  ORDER BY month DESC, visit_count DESC
),

ServiceRecords AS (
  SELECT
    FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', CheckInTime) as checkin_time,
    ServiceName as service,
    CustomerName as customer_name,
    CustomerPhoneNumber as customer_phone
  FROM great_time.MainDataView
  WHERE PractitionerName = '${decodedTherapistName}'
  ORDER BY CheckInTime DESC
)

SELECT
  ARRAY(SELECT AS STRUCT * FROM ServicesByMonth) as servicesByMonth,
  ARRAY(SELECT AS STRUCT * FROM CustomersByMonth) as customersByMonth,
  ARRAY(SELECT AS STRUCT * FROM ServiceRecords) as serviceRecords;`;

        const dataResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
          { query: dataQuery },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
            },
            timeout: 10000
          }
        );

        if (!dataResponse.data.success) {
          throw new Error(dataResponse.data.error || 'Failed to fetch therapist data');
        }

        const result = dataResponse.data.data[0];
        if (!result) {
          throw new Error('Therapist data not found');
        }

        setTherapistData({
          ...profile,
          servicesByMonth: result.servicesByMonth
        });

        // Process customer visit data
        const customerVisitData = prepareCustomerVisitData(result.customersByMonth);
        setCustomerVisitData(customerVisitData);

        // Set service records
        setServiceRecords(result.serviceRecords || []);

        // Calculate years from all months
        const yearsSet = new Set<string>([
          ...result.servicesByMonth.map((item: ServiceByMonth) => item.month.split('-')[0]),
          ...result.customersByMonth.map((item: CustomerVisit) => item.month.split('-')[0])
        ]);
        const yearsArray = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
        setYears(yearsArray);

        // Set initial year if not already set
        if (!selectedYear || !yearsArray.includes(selectedYear)) {
          setSelectedYear(yearsArray[0] || new Date().getFullYear().toString());
        }

      } catch (err: any) {
        console.error('Error fetching therapist data:', err);
        let errorMessage = 'Failed to fetch therapist data';
        
        if (err.response?.data?.error) {
          errorMessage = err.response.data.error;
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

    fetchTherapistData();
  }, [name, selectedYear]);

  useEffect(() => {
    if (therapistData?.servicesByMonth) {
      const filteredServices = therapistData.servicesByMonth.filter((item: ServiceByMonth) => 
        item.month.split('-')[0] === selectedYear
      );
      setFilteredServicesByMonth(filteredServices);
    }
  }, [selectedYear, therapistData]);

  useEffect(() => {
    if (serviceRecords.length > 0) {
      const filtered = serviceRecords.filter(record => {
        const date = new Date(record.checkin_time);
        const recordMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return selectedMonth === recordMonth;
      });
      setFilteredServiceRecords(filtered);
    }
  }, [selectedMonth, serviceRecords]);

  const formatMonthDisplay = (monthStr: string): string => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return new Intl.DateTimeFormat('en-US', { 
        year: 'numeric', 
        month: 'long'
      }).format(date);
    } catch {
      return monthStr;
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
        <CircularProgress sx={{ color: '#3b82f6' }} />
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
        <Typography color="error" variant="h6" align="center">{error}</Typography>
      </Box>
    );
  }

  if (!therapistData) {
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
        <Typography color="#d1d5db" variant="h6" align="center">No employee data found</Typography>
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
            Employee Details
          </Typography>
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
          Back to Employees
        </Button>
      </Box>

      {/* Employee Details Section */}
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
              src={!imageError ? therapistData.image : undefined}
              alt={therapistData.name}
              sx={{ 
                width: { xs: 100, sm: 140 }, 
                height: { xs: 100, sm: 140 }, 
                bgcolor: '#3b82f6',
                fontSize: { xs: '2.5rem', sm: '3.5rem' },
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                margin: { xs: '0 auto', sm: 0 }
              }}
              imgProps={{
                onError: () => {
                  setImageError(true);
                }
              }}
            >
              {(imageError || !therapistData.image) && therapistData.name?.charAt(0)?.toUpperCase()}
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
              {therapistData.name}
            </Typography>
            <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }}>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: '#111923',
                  borderRadius: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <Typography variant="body2" color="#9ca3af">Total Services</Typography>
                  <Typography variant="h6" sx={{ 
                    color: '#f3f4f6',
                    fontSize: { xs: '1.1rem', sm: '1.25rem' }
                  }}>
                    {therapistData.total_services}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: '#111923',
                  borderRadius: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <Typography variant="body2" color="#9ca3af">Total Days Active</Typography>
                  <Typography variant="h6" sx={{ 
                    color: '#f3f4f6',
                    fontSize: { xs: '1.1rem', sm: '1.25rem' }
                  }}>
                    {therapistData.total_service_days}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: '#111923',
                  borderRadius: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <Typography variant="body2" color="#9ca3af">First Service</Typography>
                  <Typography variant="h6" sx={{ 
                    color: '#f3f4f6',
                    fontSize: { xs: '1.1rem', sm: '1.25rem' }
                  }}>
                    {therapistData.first_service_date}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ 
                  p: { xs: 1.5, sm: 2 }, 
                  bgcolor: '#111923',
                  borderRadius: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <Typography variant="body2" color="#9ca3af">Last Service</Typography>
                  <Typography variant="h6" sx={{ 
                    color: '#f3f4f6',
                    fontSize: { xs: '1.1rem', sm: '1.25rem' }
                  }}>
                    {therapistData.last_service_date}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Service Count Table */}
      <Box sx={{ 
        height: { 
          xs: 'calc(100vh - 340px)', 
          sm: 'calc(100vh - 320px)', 
          md: 'calc(100vh - 300px)' 
        },
        overflowY: 'auto',
        overflowX: 'hidden',
        mb: 3,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
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
        <Paper 
          elevation={3}
          sx={{ 
            width: '100%',
            p: { xs: 1, sm: 2, md: 3 }, 
            bgcolor: '#1a2235',
            color: '#f3f4f6',
            mb: { xs: 0, sm: 0 },  // Removed bottom margin since we're using gap in the parent
            borderRadius: 2,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
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
              onChange={(e) => setSelectedYear(e.target.value)}
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
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#111923',
                      color: '#f3f4f6',
                      fontWeight: 600,
                      minWidth: { xs: '200px', sm: '250px' },
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      borderBottom: '1px solid #2d3748',
                      borderRight: '1px solid #2d3748'
                    }}
                  >
                    Service
                  </TableCell>
                  {[...new Set<string>(filteredServicesByMonth.map((item: ServiceByMonth) => item.month))]
                    .sort((a, b) => b.localeCompare(a))
                    .map((month: string) => (
                      <TableCell 
                        key={month} 
                        align="center"
                        sx={{ 
                          bgcolor: '#111923',
                          color: '#f3f4f6',
                          fontWeight: 600,
                          minWidth: { xs: '120px', sm: '140px' },
                          borderBottom: '1px solid #2d3748'
                        }}
                      >
                        {getMonthName(month.split('-')[1])}
                      </TableCell>
                    ))
                  }
                </TableRow>
              </TableHead>
              <TableBody>
                {[...new Set<string>(filteredServicesByMonth.map((item: ServiceByMonth) => item.service_name))]
                  .sort()
                  .map((serviceName: string) => {
                    const maxValue = getMaxValue(filteredServicesByMonth);
                    return (
                      <TableRow key={serviceName}>
                        <TableCell 
                          sx={{ 
                            color: '#f3f4f6',
                            cursor: 'pointer',
                            position: 'sticky',
                            left: 0,
                            bgcolor: '#1a2235',
                            borderBottom: '1px solid #2d3748',
                            borderRight: '1px solid #2d3748',
                            '&:hover': {
                              color: '#3b82f6',
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => navigate(`/services/${encodeURIComponent(serviceName)}`)}
                        >
                          {serviceName}
                        </TableCell>
                        {[...new Set<string>(filteredServicesByMonth.map((item: ServiceByMonth) => item.month))]
                          .sort((a, b) => b.localeCompare(a))
                          .map((month: string) => {
                            const serviceMonth = filteredServicesByMonth.find(
                              (item: ServiceByMonth) => item.service_name === serviceName && item.month === month
                            );
                            const count = serviceMonth ? serviceMonth.count : 0;
                            return (
                              <TableCell 
                                key={`${serviceName}-${month}`} 
                                align="center"
                                sx={{ 
                                  color: '#f3f4f6',
                                  bgcolor: count > 0 ? getHeatmapColor(count, maxValue) : 'transparent',
                                  borderBottom: '1px solid #2d3748',
                                  transition: 'background-color 0.3s ease',
                                  '&:hover': {
                                    bgcolor: count > 0 ? `rgba(59, 130, 246, ${Math.min((count / maxValue) * 0.9 + 0.2, 1)})` : 'transparent'
                                  }
                                }}
                              >
                                {count}
                              </TableCell>
                            );
                          })
                        }
                      </TableRow>
                    );
                  })
                }
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Customer Visits by Month */}
        <Paper 
          elevation={3}
          sx={{ 
            width: '100%',
            p: { xs: 1, sm: 2, md: 3 }, 
            bgcolor: '#1a2235',
            color: '#f3f4f6',
            mb: { xs: 0, sm: 0 },
            borderRadius: 2,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
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
              Customer Visits by Month
            </Typography>
            <Select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
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
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#111923',
                      color: '#f3f4f6',
                      fontWeight: 600,
                      minWidth: { xs: '200px', sm: '250px' },
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      borderBottom: '1px solid #2d3748',
                      borderRight: '1px solid #2d3748'
                    }}
                  >
                    Customer
                  </TableCell>
                  {customerVisitData.months
                    .filter(month => month.startsWith(selectedYear))
                    .map((month) => (
                      <TableCell 
                        key={month} 
                        align="center"
                        sx={{ 
                          bgcolor: '#111923',
                          color: '#f3f4f6',
                          fontWeight: 600,
                          minWidth: { xs: '120px', sm: '140px' },
                          borderBottom: '1px solid #2d3748'
                        }}
                      >
                        {getMonthName(month.split('-')[1])}
                      </TableCell>
                    ))
                  }
                </TableRow>
              </TableHead>
              <TableBody>
                {customerVisitData.customers
                  .filter(customerName => {
                    // Only show customers who have at least one non-zero visit in the selected year
                    return customerVisitData.months
                      .filter(month => month.startsWith(selectedYear))
                      .some(month => customerVisitData.data[customerName][month] > 0);
                  })
                  .map((customerName) => {
                    const maxValue = Math.max(...Object.values(customerVisitData.data[customerName] || {}).map(Number));
                    return (
                      <TableRow key={customerName}>
                        <TableCell 
                          sx={{ 
                            color: '#f3f4f6',
                            cursor: 'pointer',
                            position: 'sticky',
                            left: 0,
                            bgcolor: '#1a2235',
                            borderBottom: '1px solid #2d3748',
                            borderRight: '1px solid #2d3748',
                            '&:hover': {
                              color: '#3b82f6',
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => {
                            // Get the phone number from our data structure
                            const phoneNumber = customerVisitData.data[customerName]?.phone;
                            navigate(`/customers/${encodeURIComponent(phoneNumber || customerName)}`);
                          }}
                        >
                          {customerName}
                        </TableCell>
                        {customerVisitData.months
                          .filter(month => month.startsWith(selectedYear))
                          .map((month) => {
                            const count = customerVisitData.data[customerName]?.[month] || 0;
                            return (
                              <TableCell 
                                key={`${customerName}-${month}`} 
                                align="center"
                                sx={{ 
                                  color: '#f3f4f6',
                                  bgcolor: count > 0 ? getHeatmapColor(count, maxValue) : 'transparent',
                                  borderBottom: '1px solid #2d3748',
                                  transition: 'background-color 0.3s ease',
                                  '&:hover': {
                                    bgcolor: count > 0 ? `rgba(59, 130, 246, ${Math.min((count / maxValue) * 0.9 + 0.2, 1)})` : 'transparent'
                                  }
                                }}
                              >
                                {count}
                              </TableCell>
                            );
                          })
                        }
                      </TableRow>
                    );
                  })}
                {customerVisitData.customers
                  .filter(customerName => {
                    // Check if we have any customers with visits in the selected year
                    return customerVisitData.months
                      .filter(month => month.startsWith(selectedYear))
                      .some(month => customerVisitData.data[customerName][month] > 0);
                  }).length === 0 && (
                    <TableRow>
                      <TableCell 
                        colSpan={1 + customerVisitData.months.filter(month => month.startsWith(selectedYear)).length}
                        align="center"
                        sx={{ 
                          color: '#9ca3af',
                          py: 4,
                          borderBottom: '1px solid #2d3748'
                        }}
                      >
                        No customers with visits in {selectedYear}
                      </TableCell>
                    </TableRow>
                  )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Service Records Section */}
        <Paper 
          sx={{ 
            p: { xs: 2, sm: 3 }, 
            bgcolor: '#1a2235', 
            color: '#f3f4f6',
            borderRadius: 2,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            mb: 2,
            flexDirection: { xs: 'column', sm: 'row' },
            gap: { xs: 1.5, sm: 0 }
          }}>
            <Typography variant="h6" sx={{ 
              color: '#f3f4f6',
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.25rem' }
            }}>
              Service Records
            </Typography>
            <Select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              sx={{
                minWidth: { xs: 150, sm: 200 },
                color: '#f3f4f6',
                bgcolor: '#111923',
                '& .MuiSelect-icon': { color: '#f3f4f6' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
              }}
              size="small"
            >
              {Array.from(new Set(serviceRecords.map(record => {
                const date = new Date(record.checkin_time);
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              }))).sort((a, b) => b.localeCompare(a)).map((month) => (
                <MenuItem key={month} value={month}>
                  {formatMonthDisplay(month)}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#111923',
                      color: '#f3f4f6',
                      fontWeight: 600,
                      minWidth: '180px',
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Check-in Time
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#111923',
                      color: '#f3f4f6',
                      fontWeight: 600,
                      minWidth: '200px',
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Service
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#111923',
                      color: '#f3f4f6',
                      fontWeight: 600,
                      minWidth: '200px',
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Customer
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredServiceRecords
                  .slice(recordsPage * recordsPerPage, (recordsPage * recordsPerPage) + recordsPerPage)
                  .map((record, index) => (
                    <TableRow 
                      key={index}
                      sx={{
                        '&:hover': {
                          bgcolor: '#242f3d'
                        }
                      }}
                    >
                      <TableCell sx={{ 
                        color: '#d1d5db',
                        borderBottom: '1px solid #2d3748'
                      }}>
                        {record.checkin_time}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          color: '#d1d5db',
                          cursor: 'pointer',
                          borderBottom: '1px solid #2d3748',
                          '&:hover': {
                            color: '#3b82f6',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => navigate(`/services/${encodeURIComponent(record.service)}`)}
                      >
                        {record.service}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          color: '#d1d5db',
                          cursor: 'pointer',
                          borderBottom: '1px solid #2d3748',
                          '&:hover': {
                            color: '#3b82f6',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => navigate(`/customers/${encodeURIComponent(record.customer_phone || record.customer_name)}`)}
                      >
                        {record.customer_name}
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
            gap: 2,
            alignItems: 'center'
          }}>
            <Typography sx={{ color: '#9ca3af' }}>
              {`${recordsPage * recordsPerPage + 1}-${Math.min((recordsPage + 1) * recordsPerPage, filteredServiceRecords.length)} of ${filteredServiceRecords.length}`}
            </Typography>
            <Pagination
              count={Math.ceil(filteredServiceRecords.length / recordsPerPage)}
              page={recordsPage + 1}
              onChange={handleRecordsPageChange}
              sx={{
                '& .MuiPaginationItem-root': {
                  color: '#d1d5db',
                  borderColor: '#2d3748'
                },
                '& .MuiPaginationItem-root.Mui-selected': {
                  bgcolor: '#3b82f6',
                  color: '#ffffff',
                  '&:hover': {
                    bgcolor: '#2563eb'
                  }
                }
              }}
            />
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default TherapistDetails; 