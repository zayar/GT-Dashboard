import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Typography, 
  CircularProgress, 
  TextField, 
  Button, 
  Pagination, 
  Avatar,
  IconButton
} from '@mui/material';
import { Search as SearchIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useClinic } from '../contexts/ClinicContext';

interface Service {
  id?: string;
  name: string;
  description: string;
  duration: string;
  price: number;
  count: number;
  image?: string;
}

const ServicesTable: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const rowsPerPage = 10;
  const navigate = useNavigate();
  const { currentClinic } = useClinic();

  const fetchServices = async () => {
    if (!currentClinic) return;
    
    setLoading(true);
    setError(null);
    try {
      // Use SQL query to get services from MainDataView
      const query = `
        SELECT 
          ServiceName AS name,
          ServiceDescription AS description,
          CAST(ServiceDuration AS STRING) AS duration,
          CAST(AVG(Price) AS FLOAT64) AS price,
          COUNT(*) AS count,
          MAX(ServiceImage) AS image
        FROM 
          great_time.MainDataView
        WHERE 
          ServiceName IS NOT NULL
          AND ClinicCode = '${currentClinic.code}'
        GROUP BY 
          ServiceName, ServiceDescription, ServiceDuration
        ORDER BY 
          count DESC
        LIMIT 100
      `;

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
        { query },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        // Map API response to Service interface
        const formattedServices = response.data.data.map((service: any, index: number) => ({
          id: index.toString(),
          name: service.name || 'Unknown Service',
          description: service.description || 'No description available',
          duration: service.duration || 'N/A',
          price: service.price || 0,
          count: service.count || 0,
          image: service.image || null
        }));
        setServices(formattedServices);
        setTotalPages(Math.ceil(formattedServices.length / rowsPerPage));
      } else {
        setServices([]);
        setTotalPages(1);
        console.log('No service data returned:', response.data);
      }
    } catch (err: any) {
      console.error('Error fetching services:', err);
      let errorMessage = 'Failed to fetch services. Please try again.';
      
      if (err.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response:', err.response.data);
        console.error('Status code:', err.response.status);
        errorMessage = `Server error (${err.response.status}): ${err.response.data?.error || 'Unknown error'}`;
      } else if (err.request) {
        // The request was made but no response was received
        console.error('No response received:', err.request);
        errorMessage = 'No response from server. Please check if the backend is running.';
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Request setup error:', err.message);
        errorMessage = `Request error: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentClinic) {
      fetchServices();
    }
  }, [currentClinic]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleServiceClick = (serviceName: string) => {
    navigate(`/services/${encodeURIComponent(serviceName)}`);
  };

  const handleImageError = (serviceId: string) => {
    setImageErrors(prev => ({
      ...prev,
      [serviceId]: true
    }));
  };

  const filteredServices = services.filter(service => 
    service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedServices = filteredServices.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  // Format price with thousands separator
  const formatPrice = (price: number): string => {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <Box 
      sx={{ 
        p: 3, 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        bgcolor: '#101729',
        color: '#e2e8f0',
        fontSize: '14px'
      }}
    >
      {/* Header row with title and search */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 3
      }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, fontSize: '1.4rem' }}>
          Services
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            placeholder="Search services..."
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: '#94a3b8' }} />,
            }}
            sx={{ 
              width: 250,
              '& .MuiOutlinedInput-root': { 
                bgcolor: '#1a2235',
                borderRadius: 1,
                fontSize: '0.9rem',
                '& fieldset': { borderColor: '#2d3748' },
                '&:hover fieldset': { borderColor: '#4a5568' },
                '&.Mui-focused fieldset': { borderColor: '#6d8fff' }
              },
              '& .MuiInputBase-input': { color: 'white' }
            }}
          />
        </Box>
        <IconButton 
          onClick={fetchServices} 
          sx={{ color: '#6d8fff', bgcolor: '#1a2235', borderRadius: 1, p: 1 }}
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Services Table */}
      {loading ? (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 'calc(100vh - 160px)' 
        }}>
          <CircularProgress sx={{ color: '#6d8fff' }} />
        </Box>
      ) : error ? (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 'calc(100vh - 160px)' 
        }}>
          <Typography variant="body1" color="error" sx={{ mb: 2, fontSize: '0.9rem' }}>
            {error}
          </Typography>
          <Button 
            variant="contained" 
            onClick={fetchServices}
            sx={{ 
              bgcolor: '#6d8fff', 
              fontSize: '0.9rem',
              '&:hover': { bgcolor: '#5a79e6' } 
            }}
          >
            Retry
          </Button>
        </Box>
      ) : (
        <Paper 
          sx={{ 
            flex: 1, 
            overflow: 'hidden',
            bgcolor: '#1a2235', 
            color: 'white',
            boxShadow: 'none',
            border: '1px solid #2d3748' 
          }}
        >
          <TableContainer sx={{ 
            maxHeight: 'calc(100vh - 220px)', 
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
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#111923', color: '#94a3b8', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    Service
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#111923', color: '#94a3b8', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    Description
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#111923', color: '#94a3b8', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    Duration
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#111923', color: '#94a3b8', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    Price
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#111923', color: '#94a3b8', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    Usage Count
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedServices.length > 0 ? (
                  paginatedServices.map((service) => (
                    <TableRow 
                      key={service.id} 
                      onClick={() => handleServiceClick(service.name)}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#2d3748' },
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      <TableCell 
                        sx={{ 
                          borderBottom: 'none',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <Avatar 
                          src={!imageErrors[service.id || ''] ? service.image : undefined}
                          alt={service.name}
                          sx={{ 
                            mr: 2, 
                            width: 40, 
                            height: 40,
                            bgcolor: '#3b82f6',
                            fontSize: '1rem'
                          }}
                          imgProps={{
                            onError: () => handleImageError(service.id || '')
                          }}
                        >
                          {(imageErrors[service.id || ''] || !service.image) && service.name?.charAt(0)?.toUpperCase()}
                        </Avatar>
                        <Typography variant="body1">
                          {service.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'white' }}>
                        {service.description}
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'white' }}>
                        {service.duration} min
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'white' }}>
                        {formatPrice(service.price)}
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'white' }}>
                        {service.count}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, borderBottom: 'none', color: '#94a3b8' }}>
                      No services found. Try a different search term.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* Pagination */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            p: 2, 
            bgcolor: '#1a2635', 
            borderTop: '1px solid #2d3748' 
          }}>
            <Pagination 
              count={totalPages} 
              page={page} 
              onChange={handlePageChange} 
              sx={{
                '& .MuiPaginationItem-root': {
                  color: 'white',
                },
                '& .MuiPaginationItem-page.Mui-selected': {
                  bgcolor: '#3b82f6',
                }
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default ServicesTable; 