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
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import { useClinic } from '../contexts/ClinicContext';
import axios from 'axios';
import { format } from 'date-fns';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';

interface TaskflowData {
  BookingID: string;
  PractitionerName: string;
  CustomerName: string;
  CustomerPhoneNumber: string;
  ServiceName: string;
  HelperName: string | null;
  RoomName: string | null;
  status: string;
  CheckInTime: string;
}

interface SummaryStats {
  totalBookings: number;
  totalCustomers: number;
  totalServices: number;
  totalPractitioners: number;
  completedBookings: number;
  processingBookings: number;
}

const TaskflowDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<TaskflowData[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
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

      // Query 1: Summary statistics (counts unique bookings)
      const summaryQuery = `
        SELECT
          COUNT(DISTINCT BookingID) AS totalBookings,
          COUNT(DISTINCT CustomerPhoneNumber) AS totalCustomers,
          COUNT(DISTINCT ServiceName) AS totalServices,
          COUNT(DISTINCT PractitionerName) AS totalPractitioners,
          COUNT(DISTINCT CASE WHEN CheckOutTime IS NOT NULL THEN BookingID END) AS completedBookings,
          COUNT(DISTINCT CASE WHEN CheckOutTime IS NULL THEN BookingID END) AS processingBookings
        FROM great_time.MainDataView
        WHERE DATE(CheckInTime) = '${selectedDateStr}'
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          AND CustomerName IS NOT NULL
          AND PractitionerName IS NOT NULL
      `;

      const summaryResponse = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
        { query: summaryQuery },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (summaryResponse.data.success && summaryResponse.data.data[0]) {
        setSummaryStats(summaryResponse.data.data[0]);
      }

      // Query 2: Detailed heatmap data (one row per booking)
      const heatmapQuery = `
        WITH BookingDetails AS (
          SELECT
            BookingID,
            MAX(PractitionerName) AS PractitionerName,
            MAX(CustomerName) AS CustomerName,
            MAX(CustomerPhoneNumber) AS CustomerPhoneNumber,
            STRING_AGG(DISTINCT ServiceName, ', ') AS ServiceName,
            MAX(HelperName) AS HelperName,
            MAX(RoomName) AS RoomName,
            CASE
              WHEN MAX(CheckOutTime) IS NOT NULL THEN 'COMPLETED'
              ELSE 'PROCESSING'
            END AS status,
            MAX(CheckInTime) AS CheckInTime
          FROM great_time.MainDataView
          WHERE DATE(CheckInTime) = '${selectedDateStr}'
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            AND CustomerName IS NOT NULL
            AND PractitionerName IS NOT NULL
          GROUP BY BookingID
        )
        SELECT
          BookingID,
          PractitionerName,
          CustomerName,
          CustomerPhoneNumber,
          ServiceName,
          HelperName,
          RoomName,
          status,
          CheckInTime
        FROM BookingDetails
        ORDER BY 
          CASE WHEN RoomName IS NULL THEN 1 ELSE 0 END, -- Rooms first
          RoomName, 
          PractitionerName
      `;

      const heatmapResponse = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
        { query: heatmapQuery },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!heatmapResponse.data.success) {
        throw new Error(heatmapResponse.data.error || 'Failed to fetch taskflow data');
      }

      const data = heatmapResponse.data.data || [];
      console.log('Taskflow data fetched:', data.length, 'unique bookings');
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

  // Use summary statistics from the query
  const summary = useMemo(() => {
    if (!summaryStats) {
      return {
        totalTasks: 0,
        customers: 0,
        services: 0,
        practitioners: 0
      };
    }
    
    return {
      totalTasks: summaryStats.totalBookings,
      customers: summaryStats.totalCustomers,
      services: summaryStats.totalServices,
      practitioners: summaryStats.totalPractitioners
    };
  }, [summaryStats]);

  // Service counts (counting unique bookings per service)
  const serviceCounts = useMemo(() => {
    const counts: { [key: string]: Set<string> } = {};
    rawData.forEach(record => {
      // ServiceName might contain multiple services concatenated, split them
      const services = record.ServiceName.split(', ');
      services.forEach(service => {
        if (!counts[service]) {
          counts[service] = new Set();
        }
        counts[service].add(record.BookingID);
      });
    });
    return Object.entries(counts)
      .map(([service, bookingIds]) => ({ service, count: bookingIds.size }))
      .sort((a, b) => b.count - a.count);
  }, [rawData]);

  // Practitioner counts (counting unique bookings per practitioner)
  const practitionerCounts = useMemo(() => {
    const counts: { [key: string]: Set<string> } = {};
    rawData.forEach(record => {
      if (!counts[record.PractitionerName]) {
        counts[record.PractitionerName] = new Set();
      }
      counts[record.PractitionerName].add(record.BookingID);
    });
    return Object.entries(counts)
      .map(([practitioner, bookingIds]) => ({ practitioner, count: bookingIds.size }))
      .sort((a, b) => b.count - a.count);
  }, [rawData]);

  // Task status data for pie chart (from summary stats)
  const taskStatusData = useMemo(() => {
    if (!summaryStats) {
      return [
        { name: 'Completed', value: 0, color: '#10b981' },
        { name: 'Processing', value: 0, color: '#3b82f6' }
      ];
    }
    
    return [
      { name: 'Completed', value: summaryStats.completedBookings, color: '#10b981' },
      { name: 'Processing', value: summaryStats.processingBookings, color: '#3b82f6' }
    ];
  }, [summaryStats]);

  // Heatmap data: Practitioner x Customer (each row = one booking with concatenated services)
  const heatmapData = useMemo(() => {
    const practitionerCustomerRows: Array<{
      practitioner: string;
      customer: string;
      customerPhone: string;
      helper: string;
      room: string;
      status: string;
      services: string;
      bookingId: string;
    }> = [];
    
    const allServiceNames = new Set<string>();

    // Each booking is one row
    rawData.forEach(record => {
      practitionerCustomerRows.push({
        practitioner: record.PractitionerName,
        customer: record.CustomerName,
        customerPhone: record.CustomerPhoneNumber,
        helper: record.HelperName || '-',
        room: record.RoomName || 'No Room',
        status: record.status,
        services: record.ServiceName, // Already concatenated from the query
        bookingId: record.BookingID
      });

      // Extract individual service names for column headers
      const services = record.ServiceName.split(', ');
      services.forEach(s => allServiceNames.add(s.trim()));
    });

    // Sort by Room first, then Practitioner
    practitionerCustomerRows.sort((a, b) => {
      // Put 'No Room' at the end
      if (a.room === 'No Room' && b.room !== 'No Room') return 1;
      if (a.room !== 'No Room' && b.room === 'No Room') return -1;
      
      const roomComp = a.room.localeCompare(b.room);
      if (roomComp !== 0) return roomComp;
      
      return a.practitioner.localeCompare(b.practitioner);
    });

    const services = Array.from(allServiceNames).sort();

    // Create a map for service counts per row
    const rowServiceCounts = practitionerCustomerRows.map(row => {
      const serviceList = row.services.split(', ').map(s => s.trim());
      const serviceCounts: { [service: string]: number } = {};
      
      services.forEach(service => {
        serviceCounts[service] = serviceList.filter(s => s === service).length;
      });
      
      return serviceCounts;
    });

    return {
      rows: practitionerCustomerRows,
      services,
      serviceCounts: rowServiceCounts
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
              <Box sx={{ height: 280 }}>
                <ReactApexChart
                  options={{
                    chart: {
                      type: 'donut',
                      background: 'transparent'
                    },
                    labels: taskStatusData.map(item => item.name),
                    colors: taskStatusData.map(item => item.color),
                    legend: {
                      position: 'bottom',
                      labels: {
                        colors: '#d1d5db'
                      }
                    },
                    dataLabels: {
                      enabled: true,
                      style: {
                        colors: ['#fff']
                      }
                    },
                    plotOptions: {
                      pie: {
                        donut: {
                          size: '60%'
                        }
                      }
                    },
                    tooltip: {
                      theme: 'dark',
                      style: {
                        fontSize: '12px'
                      }
                    }
                  } as ApexOptions}
                  series={taskStatusData.map(item => item.value)}
                  type="donut"
                  height={280}
                />
              </Box>
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
            Room & Task Overview
          </Typography>

          {heatmapData.rows.length === 0 ? (
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
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 0, zIndex: 3, minWidth: 120 }}>
                      Room
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 120, zIndex: 3, minWidth: 150 }}>
                      Practitioner(s)
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 270, zIndex: 3, minWidth: 150 }}>
                      Customer Name
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 420, zIndex: 3, minWidth: 120 }}>
                      Helpers
                    </TableCell>
                    <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748', position: 'sticky', left: 540, zIndex: 3, minWidth: 120, textAlign: 'center' }}>
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
                          textAlign: 'center',
                          verticalAlign: 'bottom',
                          height: 100
                        }}
                      >
                        <Box sx={{ 
                          writingMode: 'vertical-rl', 
                          transform: 'rotate(180deg)', 
                          textAlign: 'left',
                          maxHeight: 100,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%'
                        }}>
                          {service}
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {heatmapData.rows.map((row, rowIndex) => (
                    <TableRow
                      key={`${row.bookingId}-${rowIndex}`}
                      sx={{ '&:hover': { bgcolor: '#1a2234' } }}
                    >
                      <TableCell
                        sx={{
                          color: row.room === 'No Room' ? '#6b7280' : '#f3f4f6',
                          borderBottom: '1px solid #2d3748',
                          position: 'sticky',
                          left: 0,
                          bgcolor: '#1a2234',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          height: '60px' // Ensure consistent height
                        }}
                      >
                        {row.room !== 'No Room' && <MeetingRoomIcon sx={{ fontSize: 18, color: '#3b82f6' }} />}
                        {row.room}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: '#f3f4f6',
                          borderBottom: '1px solid #2d3748',
                          position: 'sticky',
                          left: 120,
                          bgcolor: '#1a2234',
                          fontWeight: 500
                        }}
                      >
                        {row.practitioner}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: '#f3f4f6',
                          borderBottom: '1px solid #2d3748',
                          position: 'sticky',
                          left: 270,
                          bgcolor: '#1a2234'
                        }}
                      >
                        {row.customer}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: '#d1d5db',
                          borderBottom: '1px solid #2d3748',
                          position: 'sticky',
                          left: 420,
                          bgcolor: '#1a2234'
                        }}
                      >
                        {row.helper}
                      </TableCell>
                      <TableCell
                        sx={{
                          borderBottom: '1px solid #2d3748',
                          position: 'sticky',
                          left: 540,
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
                            bgcolor: row.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            color: row.status === 'COMPLETED' ? '#34d399' : '#60a5fa',
                            border: `1px solid ${row.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}
                        >
                          {row.status}
                        </Box>
                      </TableCell>
                      {heatmapData.services.map((service) => {
                        const count = heatmapData.serviceCounts[rowIndex][service] || 0;
                        return (
                          <TableCell
                            key={`${row.bookingId}-${service}`}
                            align="center"
                            sx={{
                              borderBottom: '1px solid #2d3748',
                              bgcolor: count > 0 ? (row.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)') : 'transparent',
                              color: count > 0 ? (row.status === 'COMPLETED' ? '#34d399' : '#60a5fa') : '#6b7280',
                              fontWeight: count > 0 ? 700 : 400,
                              borderLeft: count > 0 ? `1px solid ${row.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)'}` : 'none',
                              borderRight: count > 0 ? `1px solid ${row.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)'}` : 'none'
                            }}
                          >
                            {count > 0 ? count : '-'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
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

