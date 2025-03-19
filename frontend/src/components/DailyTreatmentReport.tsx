import React, { useState, useEffect, useMemo } from 'react';
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
  Tooltip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface ServiceCount {
  [key: string]: number;
}

interface TherapistData {
  therapist_name: string;
  services: ServiceCount;
  total_services: number;
}

interface TreatmentRecord {
  check_in_time: string;
  therapist_name: string;
  service_name: string;
  customer_name: string;
  customer_phone?: string;
}

const DailyTreatmentReport: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [therapistData, setTherapistData] = useState<TherapistData[]>([]);
  const [uniqueServices, setUniqueServices] = useState<string[]>([]);
  const [treatmentRecords, setTreatmentRecords] = useState<TreatmentRecord[]>([]);
  const [selectedTherapist, setSelectedTherapist] = useState<string | null>(null);

  const fetchDailyReport = async (date: Date) => {
    try {
      setLoading(true);
      const formattedDate = date.toISOString().split('T')[0];
      
      // First query for service matrix
      const matrixQuery = `
      WITH ServiceMatrix AS (
        SELECT
          COALESCE(PractitionerName, 'Unknown') as therapist_name,
          ServiceName as service_name,
          COUNT(*) as service_count
        FROM great_time.QueenDataView
        WHERE DATE(CheckInTime) = '${formattedDate}'
        GROUP BY PractitionerName, ServiceName
      )
      SELECT
        therapist_name,
        ARRAY_AGG(STRUCT(service_name, service_count)) as service_details,
        SUM(service_count) as total_services
      FROM ServiceMatrix
      GROUP BY therapist_name
      ORDER BY therapist_name;`;

      // Second query for detailed treatment records
      const recordsQuery = `
      SELECT
        FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', CheckInTime) as check_in_time,
        COALESCE(PractitionerName, 'Unknown') as therapist_name,
        ServiceName as service_name,
        CustomerName as customer_name,
        CustomerPhoneNumber as customer_phone
      FROM great_time.QueenDataView
      WHERE DATE(CheckInTime) = '${formattedDate}'
      ORDER BY CheckInTime DESC;`;

      const [matrixResponse, recordsResponse] = await Promise.all([
        axios.post(`${import.meta.env.VITE_API_URL}/query`, { query: matrixQuery }),
        axios.post(`${import.meta.env.VITE_API_URL}/query`, { query: recordsQuery })
      ]);

      if (!matrixResponse.data.success || !recordsResponse.data.success) {
        throw new Error('Failed to fetch daily report data');
      }

      // Process matrix data
      const allServices = new Set<string>();
      const therapistsMap = new Map<string, ServiceCount>();

      matrixResponse.data.data.forEach((row: any) => {
        const services: ServiceCount = {};
        row.service_details.forEach((detail: any) => {
          services[detail.service_name] = detail.service_count;
          allServices.add(detail.service_name);
        });

        therapistsMap.set(row.therapist_name, services);
      });

      const processedData: TherapistData[] = Array.from(therapistsMap.entries()).map(([therapist_name, services]) => ({
        therapist_name,
        services,
        total_services: Object.values(services).reduce((sum, count) => sum + count, 0)
      }));

      setTherapistData(processedData);
      setUniqueServices(Array.from(allServices).sort());
      setTreatmentRecords(recordsResponse.data.data);

    } catch (err) {
      console.error('Error fetching daily report:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyReport(selectedDate);
  }, [selectedDate]);

  const handleDateChange = (newDate: Date | null) => {
    if (newDate) {
      setSelectedDate(newDate);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const getHeatmapColor = (value: number, maxValue: number) => {
    if (value === 0) return 'transparent';
    const opacity = 0.2 + (value / maxValue) * 0.7;
    return `rgba(26, 115, 232, ${opacity})`;
  };

  const maxServiceCount = useMemo(() => {
    return Math.max(...therapistData.flatMap(therapist => 
      Object.values(therapist.services)
    ), 0);
  }, [therapistData]);

  const serviceTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    uniqueServices.forEach(service => {
      totals[service] = therapistData.reduce((sum, therapist) => 
        sum + (therapist.services[service] || 0), 0
      );
    });
    return totals;
  }, [therapistData, uniqueServices]);

  const handleDownloadCSV = () => {
    // Create CSV content
    const headers = ['Therapist', ...uniqueServices, 'Total'];
    const totalsRow = ['Total Services', ...uniqueServices.map(service => serviceTotals[service]), 
      Object.values(serviceTotals).reduce((sum, count) => sum + count, 0)];
    
    const rows = therapistData.map(therapist => [
      therapist.therapist_name,
      ...uniqueServices.map(service => therapist.services[service] || 0),
      therapist.total_services
    ]);

    const csvContent = [
      headers.join(','),
      totalsRow.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const formattedDate = selectedDate.toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `daily_treatment_report_${formattedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTherapistClick = (therapistName: string) => {
    if (selectedTherapist === therapistName) {
      // If clicking the same therapist again, clear the filter
      setSelectedTherapist(null);
    } else {
      // Set the selected therapist
      setSelectedTherapist(therapistName);
    }
  };

  const filteredTreatmentRecords = useMemo(() => {
    if (!selectedTherapist) return treatmentRecords;
    return treatmentRecords.filter(record => record.therapist_name === selectedTherapist);
  }, [treatmentRecords, selectedTherapist]);

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        bgcolor: '#ffffff'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, color: 'error.main' }}>
        <Typography>{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 2, sm: 3, md: 4 },
      bgcolor: '#ffffff',
      minHeight: '100vh'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#1a73e8',
            mr: 2,
            '&:hover': {
              bgcolor: 'rgba(26, 115, 232, 0.04)'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
      </Box>

      <Paper sx={{ 
        p: { xs: 2, sm: 3 }, 
        bgcolor: '#ffffff', 
        color: '#000000',
        mb: 3,
        borderRadius: 2,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2
        }}>
          <Typography variant="h5" sx={{ color: '#000000' }}>
            Daily Treatment Report
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Select Date"
                value={selectedDate}
                onChange={handleDateChange}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#000000',
                    '& fieldset': {
                      borderColor: 'rgba(0, 0, 0, 0.23)'
                    },
                    '&:hover fieldset': {
                      borderColor: 'rgba(0, 0, 0, 0.87)'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#1a73e8'
                    }
                  },
                  '& .MuiInputLabel-root': {
                    color: 'rgba(0, 0, 0, 0.6)'
                  }
                }}
              />
            </LocalizationProvider>
            <Tooltip title="Download CSV">
              <IconButton 
                onClick={handleDownloadCSV}
                sx={{
                  color: '#1a73e8',
                  '&:hover': {
                    bgcolor: 'rgba(26, 115, 232, 0.04)'
                  }
                }}
              >
                <FileDownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <TableContainer 
          sx={{
            maxHeight: 'calc(100vh - 300px)',
            overflow: 'auto',
            '&::-webkit-scrollbar': {
              height: 8,
              width: 8
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: '#f5f5f5',
              borderRadius: 4
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#1a73e8',
              borderRadius: 4,
              '&:hover': {
                backgroundColor: '#1557b0'
              }
            }
          }}
        >
          <Table 
            size="small" 
            stickyHeader 
            sx={{ 
              minWidth: uniqueServices.length * 150 + 300,
              borderCollapse: 'separate',
              borderSpacing: 0
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000',
                    fontWeight: 600,
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    minWidth: '200px',
                    borderRight: '1px solid rgba(0, 0, 0, 0.12)',
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                >
                  Therapist
                </TableCell>
                {uniqueServices.map((service) => (
                  <TableCell 
                    key={service}
                    sx={{ 
                      bgcolor: '#f5f5f5',
                      color: '#000000',
                      fontWeight: 600,
                      minWidth: '150px',
                      borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    {service}
                  </TableCell>
                ))}
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000',
                    fontWeight: 600,
                    minWidth: '100px',
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                >
                  Total
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell 
                  sx={{ 
                    position: 'sticky',
                    left: 0,
                    bgcolor: '#e3f2fd',
                    color: '#000000',
                    fontWeight: 600,
                    borderRight: '1px solid rgba(0, 0, 0, 0.12)',
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)',
                    zIndex: 2
                  }}
                >
                  Total Services
                </TableCell>
                {uniqueServices.map((service) => (
                  <TableCell 
                    key={`total-${service}`}
                    align="center"
                    sx={{ 
                      bgcolor: '#e3f2fd',
                      color: '#000000',
                      fontWeight: 600,
                      borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    {serviceTotals[service]}
                  </TableCell>
                ))}
                <TableCell 
                  sx={{ 
                    bgcolor: '#e3f2fd',
                    color: '#000000',
                    fontWeight: 600,
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                  align="center"
                >
                  {Object.values(serviceTotals).reduce((sum, count) => sum + count, 0)}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {therapistData.map((therapist) => (
                <TableRow 
                  key={therapist.therapist_name}
                  sx={{
                    '&:hover': {
                      bgcolor: 'rgba(26, 115, 232, 0.04)'
                    }
                  }}
                >
                  <TableCell 
                    sx={{ 
                      position: 'sticky',
                      left: 0,
                      bgcolor: selectedTherapist === therapist.therapist_name ? 'rgba(26, 115, 232, 0.1)' : '#ffffff',
                      color: '#1a73e8',
                      fontWeight: 500,
                      borderRight: '1px solid rgba(0, 0, 0, 0.12)',
                      cursor: 'pointer',
                      '&:hover': {
                        color: '#1557b0',
                        textDecoration: 'underline',
                        bgcolor: 'rgba(26, 115, 232, 0.1)'
                      }
                    }}
                    onClick={() => handleTherapistClick(therapist.therapist_name)}
                  >
                    {therapist.therapist_name}
                  </TableCell>
                  {uniqueServices.map((service) => {
                    const count = therapist.services[service] || 0;
                    return (
                      <TableCell 
                        key={`${therapist.therapist_name}-${service}`}
                        align="center"
                        sx={{ 
                          bgcolor: getHeatmapColor(count, maxServiceCount),
                          color: '#000000',
                          transition: 'background-color 0.3s ease'
                        }}
                      >
                        {count || '-'}
                      </TableCell>
                    );
                  })}
                  <TableCell 
                    sx={{ 
                      color: '#000000',
                      fontWeight: 600,
                      bgcolor: '#f5f5f5'
                    }}
                    align="center"
                  >
                    {therapist.total_services}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Treatment Records Table */}
      <Paper sx={{ 
        p: { xs: 2, sm: 3 }, 
        bgcolor: '#ffffff', 
        color: '#000000',
        borderRadius: 2,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          mb: 2
        }}>
          <Typography variant="h6" sx={{ color: '#000000' }}>
            Treatment Records {selectedTherapist ? `- ${selectedTherapist}` : ''}
          </Typography>
          {selectedTherapist && (
            <Typography
              variant="body2"
              sx={{
                color: '#1a73e8',
                cursor: 'pointer',
                '&:hover': {
                  textDecoration: 'underline'
                }
              }}
              onClick={() => setSelectedTherapist(null)}
            >
              Clear Filter
            </Typography>
          )}
        </Box>
        
        <TableContainer 
          sx={{
            maxHeight: '400px',
            overflow: 'auto',
            '&::-webkit-scrollbar': {
              width: 8,
              height: 8
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: '#f5f5f5',
              borderRadius: 4
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#1a73e8',
              borderRadius: 4,
              '&:hover': {
                backgroundColor: '#1557b0'
              }
            }
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000',
                    fontWeight: 600,
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                >
                  Date & Time
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000',
                    fontWeight: 600,
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                >
                  Therapist
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000',
                    fontWeight: 600,
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                >
                  Service
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000',
                    fontWeight: 600,
                    borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                  }}
                >
                  Customer
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTreatmentRecords.map((record, index) => (
                <TableRow 
                  key={index}
                  sx={{
                    '&:hover': {
                      bgcolor: 'rgba(26, 115, 232, 0.04)'
                    },
                    bgcolor: record.therapist_name === selectedTherapist ? 'rgba(26, 115, 232, 0.04)' : 'transparent'
                  }}
                >
                  <TableCell sx={{ color: '#000000' }}>
                    {record.check_in_time}
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#1a73e8',
                      cursor: 'pointer',
                      '&:hover': {
                        color: '#1557b0',
                        textDecoration: 'underline'
                      }
                    }}
                    onClick={() => navigate(`/therapist/${encodeURIComponent(record.therapist_name)}`)}
                  >
                    {record.therapist_name}
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#1a73e8',
                      cursor: 'pointer',
                      '&:hover': {
                        color: '#1557b0',
                        textDecoration: 'underline'
                      }
                    }}
                    onClick={() => navigate(`/service/${encodeURIComponent(record.service_name)}`)}
                  >
                    {record.service_name}
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#1a73e8',
                      cursor: 'pointer',
                      '&:hover': {
                        color: '#1557b0',
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
      </Paper>
    </Box>
  );
};

export default DailyTreatmentReport; 