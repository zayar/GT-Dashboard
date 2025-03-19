import React, { useEffect, useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Select,
  MenuItem,
  TableSortLabel,
  Pagination,
  IconButton,
  Tooltip,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { SelectChangeEvent } from '@mui/material/Select';
import { useNavigate } from 'react-router-dom';

interface QueenCommissionRate {
  PractitionerName: string;
  ServiceName: string;
  price: number | null;
  service_date: string;
}

interface CalculatedQueenCommission {
  check_in_time: string;
  practitioner_name: string;
  service_name: string;
  total_service_count: number;
  commission_price: number;
  total_commission: number;
}

interface QueenCommissionData {
  calculated: CalculatedQueenCommission[];
  months: string[];
  practitioners: string[];
}

type SortOrder = 'asc' | 'desc';

type SortableFields = 
  | 'check_in_time'
  | 'practitioner_name'
  | 'service_name'
  | 'total_service_count'
  | 'commission_price'
  | 'total_commission';

interface SortConfig {
  key: SortableFields | null;
  direction: 'asc' | 'desc';
}

export default function QueenCommissionPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QueenCommissionData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedPractitioner, setSelectedPractitioner] = useState<string>('');
  const [originalData, setOriginalData] = useState<CalculatedQueenCommission[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  useEffect(() => {
    fetchQueenCommissionData();
  }, [selectedMonth]);

  const fetchQueenCommissionData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/queencommission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          month: selectedMonth,
          practitioner: ''
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to fetch queen commission data: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch queen commission data');
      }
      setData(result.data);
      setOriginalData(result.data.calculated);
    } catch (err) {
      console.error('Commission Data Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: SortableFields) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedAndFilteredData = useMemo(() => {
    let result = [...(originalData || [])];

    // First apply practitioner filter
    if (selectedPractitioner) {
      result = result.filter(row => row.practitioner_name === selectedPractitioner);
    }

    // Then apply sorting if a sort key is set
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [originalData, selectedPractitioner, sortConfig]);

  const paginatedData = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return sortedAndFilteredData.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedAndFilteredData, page, rowsPerPage]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage - 1);
  };

  const handleChangeRowsPerPage = (event: SelectChangeEvent<number>) => {
    setRowsPerPage(parseInt(event.target.value.toString(), 10));
    setPage(0);
  };

  const formatPrice = (price: number | null): string => {
    if (price === null || price === undefined) return 'N/A';
    return `${price.toLocaleString()} MMK`;
  };

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

  const exportToCSV = (data: CalculatedQueenCommission[]) => {
    const headers = ['Check-in Time', 'Practitioner Name', 'Service Name', 'Total Service Count', 'Commission Price', 'Total Commission'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.check_in_time,
        `"${row.practitioner_name || ''}"`,
        `"${row.service_name || ''}"`,
        row.total_service_count,
        row.commission_price,
        row.total_commission
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `queen_commission_data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenQueenCommissionSettings = () => {
    window.open('https://docs.google.com/spreadsheets/d/1ByQgKAJZsWHNsv5xbsPDDspuap_ccoYuIokLotgz8uQ/edit?gid=0#gid=0', '_blank');
  };

  const handleBack = React.useCallback(() => {
    navigate(-1);
  }, [navigate]);

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
        bgcolor: '#1a1a1a'
      }}>
        <CircularProgress sx={{ color: '#1a73e8', margin: 'auto' }} />
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
        bgcolor: '#1a1a1a',
        p: 3 
      }}>
        <Typography color="error" variant="h6" align="center">{error}</Typography>
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

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ color: '#000000', mb: 0 }}>Queen Commission</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              sx={{
                minWidth: 200,
                color: '#000000',
                '& .MuiSelect-icon': { color: '#000000' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 0, 0, 0.23)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 0, 0, 0.87)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1a73e8' }
              }}
              size="small"
            >
              <MenuItem value="">All Time</MenuItem>
              {data?.months.map((month) => (
                <MenuItem key={month} value={month}>
                  {formatMonthDisplay(month)}
                </MenuItem>
              ))}
            </Select>
            <Select
              value={selectedPractitioner}
              onChange={(e) => setSelectedPractitioner(e.target.value)}
              sx={{
                minWidth: 200,
                color: '#000000',
                '& .MuiSelect-icon': { color: '#000000' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 0, 0, 0.23)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 0, 0, 0.87)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1a73e8' }
              }}
              size="small"
            >
              <MenuItem value="">All Practitioners</MenuItem>
              {data?.practitioners.map((practitioner) => (
                <MenuItem key={practitioner} value={practitioner}>
                  {practitioner}
                </MenuItem>
              ))}
            </Select>
            <Tooltip title="Export to CSV">
              <IconButton
                onClick={() => exportToCSV(sortedAndFilteredData)}
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
        <Tooltip title="Queen Commission Settings">
          <IconButton
            onClick={handleOpenQueenCommissionSettings}
            sx={{
              color: '#1a73e8',
              '&:hover': {
                bgcolor: 'rgba(26, 115, 232, 0.04)'
              }
            }}
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Paper 
        elevation={3}
        sx={{ 
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#ffffff',
          color: '#000000',
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <TableContainer sx={{ 
          width: '100%', 
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: '100%'
          }
        }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000', 
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => handleSort('check_in_time')}
                >
                  <TableSortLabel
                    active={sortConfig.key === 'check_in_time'}
                    direction={sortConfig.key === 'check_in_time' ? sortConfig.direction : 'asc'}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        color: '#000000 !important',
                      },
                      '&.Mui-active': {
                        color: '#000000 !important',
                      },
                      color: '#000000 !important',
                    }}
                  >
                    Check-in Time
                  </TableSortLabel>
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000', 
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => handleSort('practitioner_name')}
                >
                  <TableSortLabel
                    active={sortConfig.key === 'practitioner_name'}
                    direction={sortConfig.key === 'practitioner_name' ? sortConfig.direction : 'asc'}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        color: '#000000 !important',
                      },
                      '&.Mui-active': {
                        color: '#000000 !important',
                      },
                      color: '#000000 !important',
                    }}
                  >
                    Practitioner Name
                  </TableSortLabel>
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000', 
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => handleSort('service_name')}
                >
                  <TableSortLabel
                    active={sortConfig.key === 'service_name'}
                    direction={sortConfig.key === 'service_name' ? sortConfig.direction : 'asc'}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        color: '#000000 !important',
                      },
                      '&.Mui-active': {
                        color: '#000000 !important',
                      },
                      color: '#000000 !important',
                    }}
                  >
                    Service Name
                  </TableSortLabel>
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000', 
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => handleSort('total_service_count')}
                  align="right"
                >
                  <TableSortLabel
                    active={sortConfig.key === 'total_service_count'}
                    direction={sortConfig.key === 'total_service_count' ? sortConfig.direction : 'asc'}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        color: '#000000 !important',
                      },
                      '&.Mui-active': {
                        color: '#000000 !important',
                      },
                      color: '#000000 !important',
                    }}
                  >
                    Total Service Count
                  </TableSortLabel>
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000', 
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'nowrap'
                  }} 
                  align="right"
                >
                  Commission Price
                </TableCell>
                <TableCell 
                  sx={{ 
                    bgcolor: '#f5f5f5',
                    color: '#000000', 
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    whiteSpace: 'nowrap'
                  }} 
                  align="right"
                >
                  Total Commission
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((row, index) => (
                <TableRow 
                  key={index}
                  sx={{
                    '&:hover': { bgcolor: 'rgba(26, 115, 232, 0.04)' },
                    bgcolor: '#ffffff'
                  }}
                >
                  <TableCell sx={{ color: '#000000', borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }}>
                    {row.check_in_time}
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#1a73e8',
                      borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                      cursor: 'pointer',
                      '&:hover': {
                        color: '#1557b0',
                        textDecoration: 'underline'
                      }
                    }}
                    onClick={() => navigate(`/therapist/${encodeURIComponent(row.practitioner_name)}`)}
                  >
                    {row.practitioner_name || 'N/A'}
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      color: '#1a73e8',
                      borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                      cursor: 'pointer',
                      '&:hover': {
                        color: '#1557b0',
                        textDecoration: 'underline'
                      }
                    }}
                    onClick={() => navigate(`/service/${encodeURIComponent(row.service_name)}`)}
                  >
                    {row.service_name || 'N/A'}
                  </TableCell>
                  <TableCell sx={{ color: '#000000', borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }} align="right">
                    {row.total_service_count.toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ color: '#000000', borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }} align="right">
                    {formatPrice(row.commission_price)}
                  </TableCell>
                  <TableCell sx={{ color: '#000000', borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }} align="right">
                    {formatPrice(row.total_commission)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          alignItems: 'center', 
          mt: 2,
          gap: 2
        }}>
          <Typography sx={{ color: 'rgba(0, 0, 0, 0.7)' }}>
            {`${page * rowsPerPage + 1}-${Math.min((page + 1) * rowsPerPage, sortedAndFilteredData.length)} of ${sortedAndFilteredData.length}`}
          </Typography>
          <Pagination
            count={Math.ceil(sortedAndFilteredData.length / rowsPerPage)}
            page={page + 1}
            onChange={handleChangePage}
            sx={{
              '& .MuiPaginationItem-root': {
                color: '#000000',
                borderColor: 'rgba(0, 0, 0, 0.23)'
              },
              '& .MuiPaginationItem-root.Mui-selected': {
                bgcolor: '#1a73e8',
                color: '#ffffff',
                '&:hover': {
                  bgcolor: '#1557b0'
                }
              }
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
} 