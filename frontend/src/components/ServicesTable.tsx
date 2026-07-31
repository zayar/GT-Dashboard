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
  Tooltip
} from '@mui/material';
import { Search as SearchIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useClinic } from '../contexts/ClinicContext';
import DirectoryPageHeader from './DirectoryPageHeader';

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
      } else {
        setServices([]);
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

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
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

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / rowsPerPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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

  const cleanDescription = (description: string) => description
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const totalBookings = services.reduce((sum, service) => sum + Number(service.count || 0), 0);
  const averagePrice = services.length
    ? services.reduce((sum, service) => sum + Number(service.price || 0), 0) / services.length
    : 0;

  return (
    <Box
      sx={{
        p: { xs: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: 'var(--background)',
        color: 'var(--text-primary)',
        fontSize: '14px'
      }}
    >
      <DirectoryPageHeader
        title="Services"
        subtitle="Compare demand, pricing, duration, and service catalogue quality."
        count={filteredServices.length}
        countLabel={searchTerm ? 'matches' : 'services'}
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchServices}
            disabled={loading}
            sx={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
          >
            Refresh
          </Button>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        {[
          { label: 'Services loaded', value: services.length.toLocaleString() },
          { label: 'Total usage', value: totalBookings.toLocaleString() },
          { label: 'Average price', value: `${formatPrice(averagePrice)} MMK` },
        ].map((metric) => (
          <Paper key={metric.label} sx={{ p: 2, bgcolor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 650 }}>{metric.label}</Typography>
            <Typography sx={{ mt: 0.45, color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 750 }}>{metric.value}</Typography>
          </Paper>
        ))}
      </Box>

      <Paper sx={{ p: 1, mb: 2.5, bgcolor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <TextField
            placeholder="Search services or descriptions..."
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            fullWidth
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)' }} />,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'var(--surface)',
                borderRadius: 1,
                fontSize: '0.9rem',
                '& fieldset': { borderColor: 'var(--border)' },
                '&:hover fieldset': { borderColor: 'var(--text-muted)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
              },
              '& .MuiInputBase-input': { color: 'var(--text-primary)' },
              '& .MuiOutlinedInput-notchedOutline': { border: 0 },
            }}
          />
      </Paper>

      {/* Services Table */}
      {loading ? (
        <Box sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 'calc(100vh - 160px)'
        }}>
          <CircularProgress sx={{ color: 'var(--primary)' }} />
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
              bgcolor: 'var(--primary)',
              fontSize: '0.9rem',
              '&:hover': { bgcolor: 'var(--primary-hover)' }
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
            bgcolor: 'var(--surface)',
            color: 'var(--text-primary)',
            boxShadow: 'none',
            border: '1px solid var(--border)'
          }}
        >
          <TableContainer sx={{
            maxHeight: 'calc(100vh - 220px)',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'var(--surface-secondary)',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'var(--border)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              backgroundColor: 'var(--text-muted)',
            }
          }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>
                    Service
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>
                    Description
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>
                    Duration
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>
                    Price
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>
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
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleServiceClick(service.name);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Open details for ${service.name}`}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'var(--primary-soft)' },
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      <TableCell
                        sx={{
                          borderBottom: 'none',
                          color: 'var(--text-primary)',
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
                            bgcolor: 'var(--primary)',
                            fontSize: '1rem'
                          }}
                          imgProps={{
                            onError: () => handleImageError(service.id || '')
                          }}
                        >
                          {(imageErrors[service.id || ''] || !service.image) && service.name?.charAt(0)?.toUpperCase()}
                        </Avatar>
                        <Typography
                          variant="body1"
                          component={RouterLink}
                          to={`/services/${encodeURIComponent(service.name)}`}
                          onClick={(event) => event.stopPropagation()}
                          sx={{
                            color: 'var(--text-primary)',
                            fontWeight: 650,
                            textDecoration: 'none',
                            '&:hover': { color: 'var(--primary)', textDecoration: 'underline' },
                            '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: 3, borderRadius: 0.5 },
                          }}
                        >
                          {service.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'var(--text-secondary)', maxWidth: 520 }}>
                        <Tooltip title={cleanDescription(service.description)} placement="top-start" enterDelay={500}>
                          <Typography
                            component="span"
                            sx={{
                              color: 'inherit',
                              fontSize: '0.875rem',
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              WebkitLineClamp: 2,
                              overflow: 'hidden',
                              lineHeight: 1.5,
                            }}
                          >
                            {cleanDescription(service.description)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'var(--text-primary)' }}>
                        {service.duration === 'N/A' ? 'N/A' : `${service.duration} min`}
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'var(--text-primary)' }}>
                        {formatPrice(service.price)} MMK
                      </TableCell>
                      <TableCell sx={{ borderBottom: 'none', color: 'var(--text-primary)' }}>
                        {service.count}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, borderBottom: 'none', color: 'var(--text-secondary)' }}>
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
            bgcolor: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)'
          }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              sx={{
                '& .MuiPaginationItem-root': {
                  color: 'var(--text-primary)',
                },
                '& .MuiPaginationItem-page.Mui-selected': {
                  bgcolor: 'var(--primary)',
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
