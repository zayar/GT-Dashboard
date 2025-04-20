import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  IconButton,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Grid,
  Chip,
  Pagination,
  SelectChangeEvent
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useClinic } from '../contexts/ClinicContext';

interface Appointment {
  bookingid: string;
  FromTime: string;
  ToTime: string;
  ServiceName: string;
  MemberName: string;
  MemberPhoneNumber: string;
  PractitionerName: string;
  ClinicName: string;
  ClinicID: string;
  ClinicCode: string;
  HelperName: string;
  status: string;
  member_note: string;
}

const Appointments: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentClinic) {
      fetchAppointments();
    }
  }, [currentClinic]);

  useEffect(() => {
    applyFilters();
  }, [appointments, statusFilter, selectedDate, searchQuery]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const dateStr = selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      
      const query = `
        SELECT
          bookingid,
          FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', FromTime) as FromTime,
          FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', ToTime) as ToTime,
          ServiceName,
          MemberName,
          MemberPhoneNumber,
          PractitionerName,
          ClinicName,
          ClinicID,
          ClinicCode,
          HelperName,
          status,
          member_note
        FROM great_time.MainAppointmentView
        WHERE DATE(FromTime) = '${dateStr}'
        AND ClinicCode = '${currentClinic?.code}'
        ORDER BY FromTime DESC
      `;
    
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`, { query });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch appointments');
      }
      
      setAppointments(response.data.data);
      
    } catch (err: any) {
      console.error('Error fetching appointments:', err);
      setError(err.message || 'Failed to fetch appointments');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...appointments];
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(appointment => appointment.status === statusFilter);
    }
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(appointment => 
        appointment.MemberName?.toLowerCase().includes(query) ||
        appointment.ServiceName?.toLowerCase().includes(query) ||
        appointment.PractitionerName?.toLowerCase().includes(query) ||
        appointment.HelperName?.toLowerCase().includes(query) ||
        appointment.ClinicName?.toLowerCase().includes(query) ||
        appointment.member_note?.toLowerCase().includes(query)
      );
    }
    
    setFilteredAppointments(filtered);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleStatusFilterChange = (event: SelectChangeEvent) => {
    setStatusFilter(event.target.value as string);
  };

  const handleRefresh = () => {
    fetchAppointments();
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    if (date) {
      fetchAppointments();
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return '#10b981'; // Green
      case 'pending':
        return '#f59e0b'; // Yellow/Orange
      case 'cancelled':
        return '#ef4444'; // Red
      case 'completed':
        return '#3b82f6'; // Blue
      case 'no show':
        return '#6b7280'; // Gray
      default:
        return '#6b7280'; // Default Gray
    }
  };

  // Download appointments as CSV
  const downloadCSV = () => {
    // Generate headers
    const headers = [
      'Booking ID', 
      'From Time', 
      'To Time', 
      'Service', 
      'Member', 
      'Practitioner', 
      'Clinic', 
      'Helper', 
      'Status', 
      'Member Note'
    ];
    
    // Generate rows
    const rows = filteredAppointments.map(appointment => [
      appointment.bookingid,
      appointment.FromTime,
      appointment.ToTime,
      appointment.ServiceName,
      appointment.MemberName,
      appointment.PractitionerName,
      appointment.ClinicName,
      appointment.HelperName,
      appointment.status,
      appointment.member_note
    ]);
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `appointments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const paginatedAppointments = filteredAppointments.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  if (loading && appointments.length === 0) {
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

  return (
    <Box sx={{ 
      p: { xs: 2, sm: 3, md: 4 },
      bgcolor: '#101729',
      minHeight: '100vh',
      width: '100%',
      maxWidth: '100%',
      position: 'relative'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#f3f4f6',
            mr: 2
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1" sx={{ color: '#f3f4f6', fontWeight: 600 }}>
          Appointments
        </Typography>
      </Box>

      {/* Filters */}
      <Paper sx={{ 
        p: 3, 
        mb: 3, 
        bgcolor: '#1a2234', 
        borderRadius: 2,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Date"
                value={selectedDate}
                onChange={handleDateChange}
                sx={{
                  width: '100%',
                  '& .MuiOutlinedInput-root': {
                    color: '#f3f4f6',
                    '& fieldset': {
                      borderColor: '#384152'
                    },
                    '&:hover fieldset': {
                      borderColor: '#4a536b'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#3b82f6'
                    }
                  },
                  '& .MuiInputLabel-root': {
                    color: '#9ca3af'
                  }
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <FormControl fullWidth>
              <InputLabel id="status-filter-label" sx={{ color: '#9ca3af' }}>Status</InputLabel>
              <Select
                labelId="status-filter-label"
                id="status-filter"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                label="Status"
                sx={{
                  color: '#f3f4f6',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#384152'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#4a536b'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#3b82f6'
                  },
                  '& .MuiSelect-icon': {
                    color: '#f3f4f6'
                  }
                }}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="no show">No Show</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Search"
              value={searchQuery}
              onChange={handleFilterChange}
              placeholder="Search member, service..."
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#f3f4f6',
                  '& fieldset': {
                    borderColor: '#384152'
                  },
                  '&:hover fieldset': {
                    borderColor: '#4a536b'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#3b82f6'
                  }
                },
                '& .MuiInputLabel-root': {
                  color: '#9ca3af'
                }
              }}
            />
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ color: '#d1d5db', mr: 1 }}>
              {filteredAppointments.length} results found
            </Typography>
            <IconButton 
              onClick={handleRefresh}
              size="small"
              sx={{ color: '#3b82f6' }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
          <IconButton
            onClick={downloadCSV}
            sx={{ color: '#3b82f6' }}
            title="Download CSV"
          >
            <FileDownloadIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Error Message */}
      {error && (
        <Paper sx={{ p: 3, mb: 3, bgcolor: '#3f2f2f', color: '#f87171', borderRadius: 2 }}>
          <Typography>{error}</Typography>
        </Paper>
      )}

      {/* Data Table */}
      <Paper sx={{ 
        p: 0, 
        bgcolor: '#1a2234', 
        borderRadius: 2,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        <TableContainer sx={{
          maxHeight: 'calc(100vh - 300px)',
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
          },
        }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '10%'
                }}>
                  From
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '10%'
                }}>
                  To
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '15%'
                }}>
                  Member Name
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '15%'
                }}>
                  Service
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '15%'
                }}>
                  Practitioner
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '15%'
                }}>
                  Helper
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '15%'
                }}>
                  Member Note
                </TableCell>
                <TableCell sx={{ 
                  bgcolor: '#111923', 
                  color: '#f3f4f6', 
                  fontWeight: 600,
                  borderBottom: '1px solid #2d3748',
                  width: '10%',
                  textAlign: 'center'
                }}>
                  Status
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedAppointments.length === 0 ? (
                <TableRow>
                  <TableCell 
                    colSpan={8} 
                    sx={{ 
                      textAlign: 'center', 
                      color: '#d1d5db', 
                      py: 4,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    No appointments found for the selected filters
                  </TableCell>
                </TableRow>
              ) : (
                paginatedAppointments.map((appointment) => (
                  <TableRow 
                    key={appointment.bookingid}
                    sx={{
                      '&:hover': {
                        bgcolor: '#242f3d'
                      }
                    }}
                  >
                    <TableCell 
                      sx={{ 
                        color: '#f3f4f6',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      {appointment.FromTime}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        color: '#f3f4f6',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      {appointment.ToTime}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        color: '#3b82f6',
                        borderBottom: '1px solid #2d3748',
                        cursor: 'pointer',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => {
                        const param = appointment.MemberPhoneNumber || appointment.MemberName;
                        navigate(`/customers/${encodeURIComponent(param)}`);
                      }}
                    >
                      {appointment.MemberName}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        color: '#3b82f6',
                        borderBottom: '1px solid #2d3748',
                        cursor: 'pointer',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => navigate(`/services/${encodeURIComponent(appointment.ServiceName)}`)}
                    >
                      {appointment.ServiceName}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        color: '#3b82f6',
                        borderBottom: '1px solid #2d3748',
                        cursor: 'pointer',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => navigate(`/therapists/${encodeURIComponent(appointment.PractitionerName)}`)}
                    >
                      {appointment.PractitionerName}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        color: '#f3f4f6',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      {appointment.HelperName}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        color: '#d1d5db',
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      {appointment.member_note}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        borderBottom: '1px solid #2d3748',
                        textAlign: 'center'
                      }}
                    >
                      <Chip 
                        label={appointment.status || 'Unknown'}
                        size="small"
                        sx={{ 
                          bgcolor: getStatusColor(appointment.status),
                          color: '#fff',
                          fontWeight: 500,
                          fontSize: '0.75rem'
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Pagination */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          p: 2,
          bgcolor: '#1a2234',
          borderTop: '1px solid #2d3748'
        }}>
          <Pagination
            count={Math.ceil(filteredAppointments.length / rowsPerPage)}
            page={page}
            onChange={handleChangePage}
            color="primary"
            sx={{
              '& .MuiPaginationItem-root': {
                color: '#d1d5db'
              },
              '& .MuiPaginationItem-page.Mui-selected': {
                bgcolor: '#3b82f6',
                color: '#fff'
              }
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default Appointments; 