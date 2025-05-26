import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Select,
  MenuItem,
  SelectChangeEvent,
  Tooltip,
  CircularProgress,
  TextField,
  InputAdornment,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Popover,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ButtonGroup
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useNavigate } from 'react-router-dom';
import DataTable from './DataTable';
import { useClinic } from '../contexts/ClinicContext';
import { format } from 'date-fns';

interface PaymentRecord {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  MemberId: string;
  SalePerson: string;
  ServiceName: string;
  ServicePackageName: string;
  PaymentMethod: string;
  PaymentStatus: string;
  WalletTopUp: string | number;
  InvoiceNetTotal: number;
}

interface SummaryRecord {
  PaymentMethod: string;
  TotalAmount: number;
  TransactionCount: number;
}

const BankingDetails: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<PaymentRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [filterType, setFilterType] = useState<'day' | 'month'>('day');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilterAnchorEl, setPaymentFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [walletTopupFilter, setWalletTopupFilter] = useState<'all' | 'hide' | 'only'>('all');

  // Get unique payment methods from the data
  const paymentMethods = useMemo(() => {
    return Array.from(new Set(rawData.map(record => record.PaymentMethod))).filter(Boolean);
  }, [rawData]);

  const handlePaymentFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setPaymentFilterAnchorEl(event.currentTarget);
  };

  const handlePaymentFilterClose = () => {
    setPaymentFilterAnchorEl(null);
  };

  const isPaymentFilterOpen = Boolean(paymentFilterAnchorEl);
  const isAllSelected = useMemo(() => {
    return paymentMethods.length > 0 && selectedPaymentMethods.length === paymentMethods.length;
  }, [selectedPaymentMethods, paymentMethods]);

  // Helper function to check if a record is a wallet topup
  const isWalletTopup = (record: PaymentRecord): boolean => {
    return (
      (typeof record.WalletTopUp === 'string' && record.WalletTopUp.includes('Topup')) ||
      record.InvoiceNumber.startsWith('TO')
    );
  };

  // Filter data based on selected payment methods, wallet filter, and search term
  const data = useMemo(() => {
    let filteredData = rawData;
    
    // Apply payment method filter
    if (selectedPaymentMethods.length > 0) {
      filteredData = filteredData.filter(record => selectedPaymentMethods.includes(record.PaymentMethod));
    }
    
    // Apply wallet topup filter
    if (walletTopupFilter === 'hide') {
      filteredData = filteredData.filter(record => !isWalletTopup(record));
    } else if (walletTopupFilter === 'only') {
      filteredData = filteredData.filter(record => isWalletTopup(record));
    }
    
    // Apply search filter across multiple fields
    if (searchTerm.trim() !== '') {
      const normalizedSearchTerm = searchTerm.toLowerCase().trim();
      filteredData = filteredData.filter(record => 
        (record.InvoiceNumber?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.CustomerName?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.MemberId?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.SalePerson?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.ServiceName?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.ServicePackageName?.toLowerCase().includes(normalizedSearchTerm) || false)
      );
    }
    
    return filteredData;
  }, [rawData, selectedPaymentMethods, walletTopupFilter, searchTerm]);

  // Generate summary data from filtered data
  const summaryData = useMemo(() => {
    const summary: Record<string, SummaryRecord> = {};
    
    data.forEach(record => {
      if (!summary[record.PaymentMethod]) {
        summary[record.PaymentMethod] = {
          PaymentMethod: record.PaymentMethod,
          TotalAmount: 0,
          TransactionCount: 0
        };
      }
      summary[record.PaymentMethod].TotalAmount += record.InvoiceNetTotal;
      summary[record.PaymentMethod].TransactionCount += 1;
    });
    
    return Object.values(summary).sort((a, b) => b.TotalAmount - a.TotalAmount);
  }, [data]);

  useEffect(() => {
    if (currentClinic && ((filterType === 'day' && startDate && endDate) || (filterType === 'month' && selectedDate))) {
      fetchBankingData();
    }
  }, [selectedDate, startDate, endDate, filterType, currentClinic]);

  const fetchBankingData = async () => {
    if (!currentClinic) return;
    
    // Check if we have the required dates based on filter type
    if (filterType === 'day' && (!startDate || !endDate)) return;
    if (filterType === 'month' && !selectedDate) return;
    
    try {
      setLoading(true);
      const query = `
        SELECT 
          FORMAT_DATE('%Y-%m-%d', DATE(OrderCreatedDate)) as Date,
          InvoiceNumber,
          CustomerName,
          MemberId,
          SellerName as SalePerson,
          ServiceName,
          ServicePackageName,
          PaymentMethod,
          PaymentStatus,
          WalletTopUp,
          CAST(NetTotal AS FLOAT64) as InvoiceNetTotal
        FROM great_time.MainPaymentView
        WHERE ${filterType === 'day' 
          ? `DATE(OrderCreatedDate) >= DATE('${startDate!.toISOString().split('T')[0]}') AND DATE(OrderCreatedDate) <= DATE('${endDate!.toISOString().split('T')[0]}')`
          : `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = FORMAT_DATE('%Y-%m', DATE('${selectedDate!.toISOString().split('T')[0]}'))`
        }
        AND PaymentStatus = 'PAID'
        AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
        ORDER BY OrderCreatedDate DESC
      `;

      const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch banking data');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch banking data');
      }

      setRawData(result.data);
      
      // Initialize payment methods selection if empty
      if (selectedPaymentMethods.length === 0) {
        const methods = Array.from(new Set(result.data.map((record: PaymentRecord) => record.PaymentMethod))).filter(Boolean);
        setSelectedPaymentMethods(methods);
      }
    } catch (err) {
      console.error('Banking Data Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterTypeChange = (event: SelectChangeEvent<'day' | 'month'>) => {
    setFilterType(event.target.value as 'day' | 'month');
  };

  const handlePaymentMethodChange = (method: string) => {
    setSelectedPaymentMethods(prev => {
      if (method === 'all') {
        return prev.length === paymentMethods.length ? [] : [...paymentMethods];
      } else {
        return prev.includes(method)
          ? prev.filter(m => m !== method)
          : [...prev, method];
      }
    });
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleDateChange = (newDate: Date | null) => {
    setSelectedDate(newDate);
  };

  const handleStartDateChange = (newDate: Date | null) => {
    setStartDate(newDate);
    if (newDate && endDate && newDate > endDate) {
      setEndDate(newDate);
    }
  };

  const handleEndDateChange = (newDate: Date | null) => {
    setEndDate(newDate);
    if (newDate && startDate && startDate > newDate) {
      setStartDate(newDate);
    }
  };

  // Quick date range selection functions
  const setToday = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
  };

  const setLast7Days = () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    setStartDate(sevenDaysAgo);
    setEndDate(today);
  };

  const setLast30Days = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 29);
    setStartDate(thirtyDaysAgo);
    setEndDate(today);
  };

  const setThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay);
    setEndDate(today);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const exportToCSV = () => {
    if (data.length === 0) return;
    
    const headers = [
      'Date', 
      'Invoice Number', 
      'Customer Name', 
      'Member ID', 
      'Sale Person', 
      'Service Name', 
      'Service Package',
      'Payment Method',
      'Payment Status',
      'Wallet',
      'Invoice Total'
    ];
    
    const processedRows: string[] = [];
    
    data.forEach((record) => {
      const walletValue = record.WalletTopUp ? 
        (String(record.WalletTopUp).includes('*Point') || isWalletTopup(record) ? 'Topup' : record.WalletTopUp) : 
        '';
      
      processedRows.push([
        record.Date,
        `"${record.InvoiceNumber}"`,
        `"${record.CustomerName}"`,
        `"${record.MemberId || ''}"`,
        `"${record.SalePerson}"`,
        `"${record.ServiceName || ''}"`,
        `"${record.ServicePackageName || ''}"`,
        `"${record.PaymentMethod}"`,
        `"${record.PaymentStatus}"`,
        `"${walletValue}"`,
        record.InvoiceNetTotal.toString()
      ].join(','));
    });
    
    const csvString = headers.join(',') + '\n' + processedRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename based on filter type and date
    let dateStr = '';
    if (filterType === 'month') {
      dateStr = selectedDate ? format(selectedDate, 'yyyy-MM') : format(new Date(), 'yyyy-MM');
    } else {
      const start = startDate ? format(startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const end = endDate ? format(endDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      dateStr = start === end ? start : `${start}_to_${end}`;
    }
    
    link.setAttribute('download', `banking_details_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSummaryToCSV = () => {
    if (summaryData.length === 0) return;
    
    const headers = ['Payment Method', 'Transaction Count', 'Total Amount'];
    const csvRows = [
      headers.join(','),
      ...summaryData.map(row => [
        `"${row.PaymentMethod}"`,
        row.TransactionCount,
        row.TotalAmount
      ].join(',')),
      [
        '"Grand Total"',
        summaryData.reduce((count, method) => count + method.TransactionCount, 0),
        summaryData.reduce((total, method) => total + method.TotalAmount, 0)
      ].join(',')
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    let dateStr = '';
    if (filterType === 'month') {
      dateStr = selectedDate ? format(selectedDate, 'yyyy-MM') : format(new Date(), 'yyyy-MM');
    } else {
      const start = startDate ? format(startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const end = endDate ? format(endDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      dateStr = start === end ? start : `${start}_to_${end}`;
    }
    
    link.download = `banking_summary_${dateStr}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - 60px)',
        width: '100%',
        bgcolor: '#101924',
        gap: 2
      }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
        <Typography sx={{ color: '#d1d5db', mt: 2 }}>Loading banking data...</Typography>
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
        minHeight: 'calc(100vh - 60px)',
        width: '100%',
        bgcolor: '#101924',
        padding: 3,
        gap: 2
      }}>
        <Typography variant="h6" sx={{ color: '#ef4444' }}>{error}</Typography>
        <Button 
          variant="contained"
          onClick={fetchBankingData}
          sx={{ 
            mt: 2, 
            bgcolor: '#3b82f6',
            '&:hover': {
              bgcolor: '#2563eb'
            }
          }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  const grandTotal = summaryData.reduce((total, method) => total + method.TotalAmount, 0);

  return (
    <Box sx={{ 
      p: { xs: 1, sm: 2 }, 
      bgcolor: '#101924',
      minHeight: 'calc(100vh - 60px)',
      width: '100%',
      maxWidth: '100%',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header with back button and title */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        mb: 2
      }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#3b82f6',
            mr: 2,
            p: 1,
            '&:hover': {
              bgcolor: 'rgba(59, 130, 246, 0.08)'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ color: '#f3f4f6' }}>Banking Details</Typography>
      </Box>

      {/* Filters and controls */}
      <Box sx={{ 
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: { xs: 1, sm: 2 },
        mb: 2
      }}>
        {/* Date filters */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: 1,
          flexGrow: 0
        }}>
          <Select
            value={filterType}
            onChange={handleFilterTypeChange}
            size="small"
            sx={{
              minWidth: 100,
              maxHeight: 40,
              color: '#d1d5db',
              bgcolor: '#1a2234',
              '& .MuiSelect-icon': { color: '#d1d5db' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
            }}
          >
            <MenuItem value="day" sx={{ bgcolor: '#1a2234', color: '#d1d5db' }}>Daily</MenuItem>
            <MenuItem value="month" sx={{ bgcolor: '#1a2234', color: '#d1d5db' }}>Monthly</MenuItem>
          </Select>
          
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {filterType === 'day' ? (
              <>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  views={['year', 'month', 'day']}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        maxHeight: 40,
                        minWidth: 140,
                        bgcolor: '#1a2234',
                        '& .MuiOutlinedInput-root': {
                          color: '#d1d5db',
                          '& fieldset': {
                            borderColor: '#2d3748',
                          },
                          '&:hover fieldset': {
                            borderColor: '#4a5568',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#3b82f6',
                          },
                        },
                        '& .MuiInputLabel-root': {
                          color: '#9ca3af',
                        },
                        '& .MuiSvgIcon-root': {
                          color: '#d1d5db',
                        },
                      },
                    }
                  }}
                />
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  views={['year', 'month', 'day']}
                  minDate={startDate || undefined}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        maxHeight: 40,
                        minWidth: 140,
                        bgcolor: '#1a2234',
                        '& .MuiOutlinedInput-root': {
                          color: '#d1d5db',
                          '& fieldset': {
                            borderColor: '#2d3748',
                          },
                          '&:hover fieldset': {
                            borderColor: '#4a5568',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#3b82f6',
                          },
                        },
                        '& .MuiInputLabel-root': {
                          color: '#9ca3af',
                        },
                        '& .MuiSvgIcon-root': {
                          color: '#d1d5db',
                        },
                      },
                    }
                  }}
                />
                
                {/* Quick date range selection buttons */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setToday}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: '#2d3748',
                      color: '#9ca3af',
                      bgcolor: '#1a2234',
                      '&:hover': {
                        borderColor: '#3b82f6',
                        color: '#3b82f6',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setLast7Days}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: '#2d3748',
                      color: '#9ca3af',
                      bgcolor: '#1a2234',
                      '&:hover': {
                        borderColor: '#3b82f6',
                        color: '#3b82f6',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    7D
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setLast30Days}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: '#2d3748',
                      color: '#9ca3af',
                      bgcolor: '#1a2234',
                      '&:hover': {
                        borderColor: '#3b82f6',
                        color: '#3b82f6',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    30D
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setThisMonth}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: '#2d3748',
                      color: '#9ca3af',
                      bgcolor: '#1a2234',
                      '&:hover': {
                        borderColor: '#3b82f6',
                        color: '#3b82f6',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    Month
                  </Button>
                </Box>
              </>
            ) : (
              <DatePicker
                value={selectedDate}
                onChange={handleDateChange}
                views={['year', 'month']}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: {
                      maxHeight: 40,
                      bgcolor: '#1a2234',
                      '& .MuiOutlinedInput-root': {
                        color: '#d1d5db',
                        '& fieldset': {
                          borderColor: '#2d3748',
                        },
                        '&:hover fieldset': {
                          borderColor: '#4a5568',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#3b82f6',
                        },
                      },
                      '& .MuiInputLabel-root': {
                        color: '#9ca3af',
                      },
                      '& .MuiSvgIcon-root': {
                        color: '#d1d5db',
                      },
                    },
                  }
                }}
              />
            )}
          </LocalizationProvider>
        </Box>
        
        {/* Right side controls */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: 1,
          flexWrap: 'nowrap'
        }}>
          {/* Search field */}
          <TextField
            size="small"
            placeholder="Search..."
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#9ca3af' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              maxWidth: 200,
              bgcolor: '#1a2234',
              '& .MuiOutlinedInput-root': {
                color: '#d1d5db',
                '& fieldset': {
                  borderColor: '#2d3748',
                },
                '&:hover fieldset': {
                  borderColor: '#4a5568',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#3b82f6',
                },
              },
              '& .MuiInputLabel-root': {
                color: '#9ca3af',
              }
            }}
          />
          
          {/* Wallet Topup Filter */}
          <ButtonGroup size="small" variant="outlined">
            <Button 
              onClick={() => setWalletTopupFilter('all')}
              sx={{
                fontSize: '0.75rem',
                px: 1,
                borderColor: '#2d3748',
                color: walletTopupFilter === 'all' ? '#3b82f6' : '#9ca3af',
                bgcolor: walletTopupFilter === 'all' ? 'rgba(59, 130, 246, 0.1)' : '#1a2234',
                '&:hover': {
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              All
            </Button>
            <Button 
              onClick={() => setWalletTopupFilter('hide')}
              sx={{
                fontSize: '0.75rem',
                px: 1,
                borderColor: '#2d3748',
                color: walletTopupFilter === 'hide' ? '#3b82f6' : '#9ca3af',
                bgcolor: walletTopupFilter === 'hide' ? 'rgba(59, 130, 246, 0.1)' : '#1a2234',
                '&:hover': {
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              Hide Topup
            </Button>
            <Button 
              onClick={() => setWalletTopupFilter('only')}
              sx={{
                fontSize: '0.75rem',
                px: 1,
                borderColor: '#2d3748',
                color: walletTopupFilter === 'only' ? '#3b82f6' : '#9ca3af',
                bgcolor: walletTopupFilter === 'only' ? 'rgba(59, 130, 246, 0.1)' : '#1a2234',
                '&:hover': {
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              Only Topup
            </Button>
          </ButtonGroup>
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterListIcon />}
            onClick={handlePaymentFilterClick}
            sx={{
              height: 40,
              borderColor: '#2d3748',
              color: '#d1d5db',
              bgcolor: '#1a2234',
              whiteSpace: 'nowrap',
              minWidth: 0,
              px: 1,
              '&:hover': {
                borderColor: '#4a5568',
                bgcolor: 'rgba(26, 34, 52, 0.7)'
              }
            }}
          >
            Payment {selectedPaymentMethods.length > 0 && `(${selectedPaymentMethods.length})`}
          </Button>
          
          {/* Export Button */}
          <Tooltip title="Export to CSV">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={exportToCSV}
              sx={{
                height: 40,
                borderColor: '#2d3748',
                color: '#d1d5db',
                bgcolor: '#1a2234',
                whiteSpace: 'nowrap',
                minWidth: 0,
                px: 1,
                '&:hover': {
                  borderColor: '#4a5568',
                  bgcolor: 'rgba(26, 34, 52, 0.7)'
                }
              }}
            >
              CSV
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* Payment filter popover */}
      <Popover
        open={isPaymentFilterOpen}
        anchorEl={paymentFilterAnchorEl}
        onClose={handlePaymentFilterClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: {
              p: 2,
              width: 250,
              maxHeight: 400,
              overflow: 'auto',
              bgcolor: '#1a2234',
              color: '#d1d5db',
              borderRadius: '8px',
              zIndex: 1400
            }
          }
        }}
      >
        <FormGroup>
          {paymentMethods.length > 0 ? (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={selectedPaymentMethods.length > 0 && !isAllSelected}
                    onChange={() => handlePaymentMethodChange('all')}
                    sx={{
                      color: '#4a5568',
                      '&.Mui-checked': { color: '#3b82f6' },
                      '&.MuiCheckbox-indeterminate': { color: '#3b82f6' }
                    }}
                  />
                }
                label="Select All"
                sx={{ color: '#d1d5db' }}
              />
              <Box sx={{ borderTop: '1px solid #2d3748', my: 1 }} />
              {paymentMethods.map((method) => (
                <FormControlLabel
                  key={method}
                  control={
                    <Checkbox
                      checked={selectedPaymentMethods.includes(method)}
                      onChange={() => handlePaymentMethodChange(method)}
                      sx={{
                        color: '#4a5568',
                        '&.Mui-checked': { color: '#3b82f6' }
                      }}
                    />
                  }
                  label={method}
                  sx={{ color: '#d1d5db' }}
                />
              ))}
            </>
          ) : (
            <Typography variant="body2" color="#9ca3af">No payment methods available</Typography>
          )}
        </FormGroup>
      </Popover>

      {/* Payment methods summary table */}
      <Paper 
        elevation={0}
        sx={{ 
          p: { xs: 2, sm: 3 }, 
          mb: 3,
          bgcolor: '#1a2234',
          borderRadius: '8px',
          border: '1px solid #2d3748',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ color: '#f3f4f6' }}>
            Payment Methods Summary
          </Typography>
          {summaryData.length > 0 && (
            <Tooltip title="Export Summary to CSV">
              <IconButton 
                onClick={exportSummaryToCSV}
                sx={{
                  color: '#3b82f6',
                  '&:hover': {
                    bgcolor: 'rgba(59, 130, 246, 0.08)'
                  }
                }}
              >
                <FileDownloadIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {summaryData.length > 0 ? (
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#121826', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Payment Method
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#121826', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748',
                      textAlign: 'right'
                    }}
                  >
                    Transactions
                  </TableCell>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#121826', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748',
                      textAlign: 'right'
                    }}
                  >
                    Total Amount
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryData.map((method) => (
                  <TableRow 
                    key={method.PaymentMethod}
                    sx={{ 
                      '&:hover': { 
                        bgcolor: 'rgba(59, 130, 246, 0.05)' 
                      },
                      cursor: 'pointer'
                    }}
                  >
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {method.PaymentMethod}
                    </TableCell>
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748', textAlign: 'right' }}>
                      {method.TransactionCount.toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748', textAlign: 'right' }}>
                      RM {method.TotalAmount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ bgcolor: '#121826' }}>
                  <TableCell sx={{ color: '#f3f4f6', fontWeight: 600, borderBottom: 'none' }}>
                    Grand Total
                  </TableCell>
                  <TableCell sx={{ color: '#f3f4f6', fontWeight: 600, borderBottom: 'none', textAlign: 'right' }}>
                    {summaryData.reduce((count, method) => count + method.TransactionCount, 0).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ color: '#f3f4f6', fontWeight: 600, borderBottom: 'none', textAlign: 'right' }}>
                    RM {grandTotal.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" sx={{ color: '#9ca3af', textAlign: 'center', py: 3 }}>
            No payment data available for the selected filters
          </Typography>
        )}
      </Paper>

      {/* Detailed transactions table */}
      <Paper 
        elevation={0}
        sx={{ 
          bgcolor: '#1a2234',
          borderRadius: '8px',
          border: '1px solid #2d3748',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #2d3748' }}>
          <Typography variant="h6" sx={{ color: '#f3f4f6' }}>
            Detailed Transactions ({data.length})
          </Typography>
        </Box>
        <DataTable
          data={data}
          onCustomerClick={(customerName: string) => navigate(`/customers/${encodeURIComponent(customerName)}`)}
          onServiceClick={(serviceName: string) => navigate(`/services/${encodeURIComponent(serviceName)}`)}
        />
      </Paper>
    </Box>
  );
};

export default BankingDetails; 