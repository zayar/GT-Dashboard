import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Card,
  CardContent
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PeopleIcon from '@mui/icons-material/People';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PersonIcon from '@mui/icons-material/Person';
import { useClinic } from '../contexts/ClinicContext';
import axios from 'axios';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface TaskflowData {
  PractitionerName: string;
  CustomerName: string;
  CustomerPhoneNumber: string;
  ServiceName: string;
  HelperName: string | null;
  status: string;
  CheckInTime: string;
}

interface ServiceCount {
  service: string;
  count: number;
}

interface PractitionerCount {
  practitioner: string;
  count: number;
}

const TaskflowDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<TaskflowData[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const fetchTaskflowData = useCallback(async () => {
    if (!currentClinic) {
      setError('No clinic selected');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const selectedDateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');

      const query = `
        SELECT
          PractitionerName,
          CustomerName,
          CustomerPhoneNumber,
          ServiceName,
          HelperName,
          CASE
            WHEN CheckOutTime IS NOT NULL THEN 'COMPLETED'
            ELSE 'PROCESSING'
          END AS status,
          CheckInTime
        FROM great_time.MainDataView
        WHERE DATE(CheckInTime) = '${selectedDateStr}'
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          AND CustomerName IS NOT NULL
          AND PractitionerName IS NOT NULL
          AND ServiceName IS NOT NULL
        ORDER BY PractitionerName, CustomerName, ServiceName
      `;

      console.log('Executing taskflow query:', query);

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
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
        throw new Error(response.data.error || 'Failed to fetch taskflow data');
      }

      const data = response.data.data || [];
      console.log('Taskflow data fetched:', data.length, 'records');
      setRawData(data);
    } catch (err: any) {
      console.error('Error fetching taskflow data:', err);
      setError(err.message || 'Failed to fetch taskflow data');
    } finally {
      setLoading(false);
    }
  }, [currentClinic, selectedDate]);

  useEffect(() => {
    if (currentClinic) {
      fetchTaskflowData();
    }
  }, [currentClinic, fetchTaskflowData]);

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  // Calculate summary statistics
  const summary = useMemo(() => {
    const uniqueCustomers = new Set(rawData.map(r => r.CustomerPhoneNumber));
    const uniqueServices = new Set(rawData.map(r => r.ServiceName));
    const uniquePractitioners = new Set(rawData.map(r => r.PractitionerName));
    
    return {
      totalTasks: rawData.length,
      customers: uniqueCustomers.size,
      services: uniqueServices.size,
      practitioners: uniquePractitioners.size
    };
  }, [rawData]);

  // Service counts
  const serviceCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    rawData.forEach(record => {
      counts[record.ServiceName] = (counts[record.ServiceName] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count);
  }, [rawData]);

  // Practitioner counts
  const practitionerCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    rawData.forEach(record => {
      counts[record.PractitionerName] = (counts[record.PractitionerName] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([practitioner, count]) => ({ practitioner, count }))
      .sort((a, b) => b.count - a.count);
  }, [rawData]);

  // Task status data for pie chart
  const taskStatusData = useMemo(() => {
    const completed = rawData.filter(r => r.status === 'COMPLETED').length;
    const processing = rawData.filter(r => r.status === 'PROCESSING').length;
    
    return [
      { name: 'Completed', value: completed, color: '#10b981' },
      { name: 'Processing', value: processing, color: '#3b82f6' }
    ];
  }, [rawData]);

  // Heatmap data: Practitioner x Customer x Service
  const heatmapData = useMemo(() => {
    const practitionerCustomerMap: { 
      [practitioner: string]: { 
        [customer: string]: {
          helper: string;
          status: string;
          services: { [service: string]: number };
        }
      }
    } = {};
    
    const allServices = new Set<string>();
    const allPractitioners = new Set<string>();

    rawData.forEach(record => {
      const practitioner = record.PractitionerName;
      const customer = record.CustomerName;
      const service = record.ServiceName;
      
      allPractitioners.add(practitioner);
      allServices.add(service);

      if (!practitionerCustomerMap[practitioner]) {
        practitionerCustomerMap[practitioner] = {};
      }

      if (!practitionerCustomerMap[practitioner][customer]) {
        practitionerCustomerMap[practitioner][customer] = {
          helper: record.HelperName || '-',
          status: record.status,
          services: {}
        };
      }

      if (!practitionerCustomerMap[practitioner][customer].services[service]) {
        practitionerCustomerMap[practitioner][customer].services[service] = 0;
      }

      practitionerCustomerMap[practitioner][customer].services[service]++;
    });

    const services = Array.from(allServices).sort();
    const practitioners = Array.from(allPractitioners).sort();

    return {
      practitioners,
      services,
      data: practitionerCustomerMap
    };
  }, [rawData]);

  const handleBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        bgcolor: '#111923'
      }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ bgcolor: '#111923', minHeight: '100vh', p: 3 }}>
        <Paper sx={{ p: 4, bgcolor: '#1a2234', textAlign: 'center', borderRadius: 2 }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ bgcolor: '#111923', minHeight: '100vh', p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              onClick={handleBack}
              sx={{
                mr: 2,
                color: 'white',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" component="h1" sx={{ color: 'white', fontWeight: 'bold' }}>
              Taskflow Dashboard
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <DatePicker
              value={selectedDate}
              onChange={handleDateChange}
              slotProps={{
                textField: {
                  size: 'small',
                  sx: {
                    bgcolor: '#1a2234',
                    borderRadius: 1,
                    '& .MuiOutlinedInput-root': {
                      color: '#d1d5db',
                      '& fieldset': { borderColor: '#2d3748' },
                      '&:hover fieldset': { borderColor: '#4a5568' },
                      '&.Mui-focused fieldset': { borderColor: '#3b82f6' }
                    },
                    '& .MuiSvgIcon-root': { color: '#d1d5db' }
                  }
                }
              }}
            />
            <IconButton
              onClick={fetchTaskflowData}
              sx={{
                color: 'white',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1a2234', border: '1px solid #2d3748' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }}>
                  <AssignmentIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#9ca3af' }}>Total Tasks</Typography>
                  <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                    {summary.totalTasks}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1a2234', border: '1px solid #2d3748' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }}>
                  <PeopleIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#9ca3af' }}>Customers</Typography>
                  <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                    {summary.customers}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1a2234', border: '1px solid #2d3748' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }}>
                  <MedicalServicesIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#9ca3af' }}>Services</Typography>
                  <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                    {summary.services}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1a2234', border: '1px solid #2d3748' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }}>
                  <PersonIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#9ca3af' }}>Practitioners</Typography>
                  <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                    {summary.practitioners}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Middle Section: Services, Task Status, Practitioners */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {/* Services List */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748', height: 350 }}>
              <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 2, fontWeight: 600 }}>
                Services
              </Typography>
              <Box sx={{ maxHeight: 270, overflowY: 'auto' }}>
                {serviceCounts.slice(0, 10).map((item, index) => (
                  <Box
                    key={item.service}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1.5,
                      mb: 1,
                      bgcolor: '#111923',
                      borderRadius: 1,
                      '&:hover': { bgcolor: '#1a2234' }
                    }}
                  >
                    <Typography sx={{ color: '#d1d5db' }}>{item.service}</Typography>
                    <Typography sx={{ color: '#3b82f6', fontWeight: 600 }}>{item.count}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>

          {/* Task Status Pie Chart */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748', height: 350 }}>
              <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 2, fontWeight: 600, textAlign: 'center' }}>
                Task Status
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={taskStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {taskStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a2234',
                      border: '1px solid #2d3748',
                      borderRadius: '4px',
                      color: '#f3f4f6'
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: '#d1d5db' }}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Practitioners List */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748', height: 350 }}>
              <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 2, fontWeight: 600 }}>
                Practitioners
              </Typography>
              <Box sx={{ maxHeight: 270, overflowY: 'auto' }}>
                {practitionerCounts.slice(0, 10).map((item, index) => (
                  <Box
                    key={item.practitioner}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1.5,
                      mb: 1,
                      bgcolor: '#111923',
                      borderRadius: 1,
                      '&:hover': { bgcolor: '#1a2234' }
                    }}
                  >
                    <Typography sx={{ color: '#d1d5db' }}>{item.practitioner}</Typography>
                    <Typography sx={{ color: '#3b82f6', fontWeight: 600 }}>{item.count}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* Heatmap Grid */}
        <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748' }}>
          <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 3, fontWeight: 600 }}>
            Practitioner Task Overview
          </Typography>

          {heatmapData.practitioners.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography sx={{ color: '#9ca3af' }}>
                No task data available for the selected date
              </Typography>
            </Box>
          ) : (
            <TableContainer
              sx={{
                maxHeight: 'calc(100vh - 700px)',
                overflowY: 'auto',
                overflowX: 'auto',
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
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 0, zIndex: 3, minWidth: 150 }}>
                      Practitioner(s)
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 150, zIndex: 3, minWidth: 150 }}>
                      Customer Name
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 300, zIndex: 3, minWidth: 120 }}>
                      Helpers
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 420, zIndex: 3, minWidth: 120, textAlign: 'center' }}>
                      Status
                    </TableCell>
                    {heatmapData.services.map((service) => (
                      <TableCell
                        key={service}
                        sx={{
                          bgcolor: '#101924',
                          color: '#d1d5db',
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748',
                          minWidth: 120,
                          textAlign: 'center'
                        }}
                      >
                        {service}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {heatmapData.practitioners.map((practitioner) => {
                    const customers = Object.keys(heatmapData.data[practitioner] || {});
                    return customers.map((customer, custIndex) => {
                      const customerData = heatmapData.data[practitioner][customer];
                      return (
                        <TableRow
                          key={`${practitioner}-${customer}-${custIndex}`}
                          sx={{ '&:hover': { bgcolor: '#1a2234' } }}
                        >
                          <TableCell
                            sx={{
                              color: '#f3f4f6',
                              borderBottom: '1px solid #2d3748',
                              position: 'sticky',
                              left: 0,
                              bgcolor: '#1a2234',
                              fontWeight: 500
                            }}
                          >
                            {practitioner}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: '#f3f4f6',
                              borderBottom: '1px solid #2d3748',
                              position: 'sticky',
                              left: 150,
                              bgcolor: '#1a2234'
                            }}
                          >
                            {customer}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: '#d1d5db',
                              borderBottom: '1px solid #2d3748',
                              position: 'sticky',
                              left: 300,
                              bgcolor: '#1a2234'
                            }}
                          >
                            {customerData.helper}
                          </TableCell>
                          <TableCell
                            sx={{
                              borderBottom: '1px solid #2d3748',
                              position: 'sticky',
                              left: 420,
                              bgcolor: '#1a2234',
                              textAlign: 'center'
                            }}
                          >
                            <Box
                              sx={{
                                display: 'inline-block',
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 1,
                                bgcolor: customerData.status === 'COMPLETED' ? '#10b981' : '#3b82f6',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}
                            >
                              {customerData.status}
                            </Box>
                          </TableCell>
                          {heatmapData.services.map((service) => {
                            const count = customerData.services[service] || 0;
                            return (
                              <TableCell
                                key={`${practitioner}-${customer}-${service}`}
                                align="center"
                                sx={{
                                  borderBottom: '1px solid #2d3748',
                                  bgcolor: count > 0 ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                                  color: count > 0 ? '#f3f4f6' : '#6b7280',
                                  fontWeight: count > 0 ? 600 : 400
                                }}
                              >
                                {count > 0 ? count : '-'}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </LocalizationProvider>
  );
};

export default TaskflowDashboard;

