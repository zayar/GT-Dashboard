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
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  TextField,
  InputAdornment,
  Checkbox,
  FormGroup,
  Popover,
  Button,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import { useNavigate } from 'react-router-dom';
import DataTable from './DataTable';
import { useClinic } from '../contexts/ClinicContext';

interface PaymentRecord {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  MemberId: string;
  SalePerson: string;
  ServiceName: string | null;
  ServicePackageName: string | null;
  WalletTopUp: number | null;
  PaymentStatus: string;
  PaymentMethod: string;
  InvoiceNetTotal: number;
}

const PaymentDetails: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<PaymentRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [filterType, setFilterType] = useState<'day' | 'month'>('day');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [showZeroValues, setShowZeroValues] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilterAnchorEl, setPaymentFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [viewMode, setViewMode] = useState<'detailed' | 'summary'>('detailed');

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

  // Filter data based on selected payment methods, zero value setting, and search term
  const data = useMemo(() => {
    let filteredData = rawData;
    
    // Apply payment method filter
    if (selectedPaymentMethods.length > 0) {
      filteredData = filteredData.filter(record => selectedPaymentMethods.includes(record.PaymentMethod));
    }
    
    // Apply zero value filter
    if (!showZeroValues) {
      filteredData = filteredData.filter(record => record.InvoiceNetTotal !== 0);
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
        (record.ServicePackageName?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        // Handle search for wallet top-up
        (normalizedSearchTerm === 'topup' && 
          (record.WalletTopUp !== null && 
           (String(record.WalletTopUp).includes('*Point') || (typeof record.WalletTopUp === 'number' && record.WalletTopUp > 0))))
      );
    }
    
    return filteredData;
  }, [rawData, selectedPaymentMethods, showZeroValues, searchTerm]);

  // Prepare the view data based on the mode
  const dataToDisplay = useMemo(() => {
    let filteredData = data;
    
    // If in summary view, group by invoice number
    if (viewMode === 'summary') {
      const invoiceSummary: Record<string, PaymentRecord> = {};
      const servicesMap: Record<string, string[]> = {};
      
      // First pass: collect unique invoices and their services
      data.forEach(record => {
        const invoiceNum = record.InvoiceNumber;
        
        // Initialize invoice record if not exists
        if (!invoiceSummary[invoiceNum]) {
          invoiceSummary[invoiceNum] = { ...record };
          servicesMap[invoiceNum] = [];
        }
        
        // Add service to the services list
        if (record.ServiceName) {
          servicesMap[invoiceNum].push(record.ServiceName);
        }
        
        if (record.ServicePackageName) {
          servicesMap[invoiceNum].push(record.ServicePackageName);
        }
      });
      
      // Second pass: Create summary records with concatenated services
      return Object.keys(invoiceSummary).map(invoiceNum => {
        const record = invoiceSummary[invoiceNum];
        const services = servicesMap[invoiceNum];
        
        return {
          ...record,
          ServiceName: services.length > 0 ? services.join(', ') : null,
          ServicePackageName: null, // In summary view, we combine these
        };
      });
    }
    
    return filteredData;
  }, [data, viewMode]);

  useEffect(() => {
    if (selectedDate && currentClinic) {
      fetchPaymentData();
    }
  }, [selectedDate, filterType, currentClinic]);

  const fetchPaymentData = async () => {
    if (!selectedDate || !currentClinic) return;
    
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
          WalletTopUp,
          PaymentStatus,
          PaymentMethod,
          CAST(NetTotal AS FLOAT64) as InvoiceNetTotal
        FROM great_time.MainPaymentView
        WHERE ${filterType === 'day' 
          ? `DATE(OrderCreatedDate) = DATE('${selectedDate.toISOString().split('T')[0]}')`
          : `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = FORMAT_DATE('%Y-%m', DATE('${selectedDate.toISOString().split('T')[0]}'))`
        }

        AND PaymentMethod != 'PASS'  /* Filter out transactions with PASS payment method */
        AND ClinicCode = '${currentClinic.code}'  /* Filter by selected clinic */
        ORDER BY OrderCreatedDate DESC
      `;

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment data');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch payment data');
      }

      setRawData(result.data);
    } catch (err) {
      console.error('Payment Data Error:', err);
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
        // If 'all' is selected, toggle between all methods or none
        return prev.length === paymentMethods.length ? [] : [...paymentMethods];
      } else {
        // Toggle the selected method
        return prev.includes(method)
          ? prev.filter(m => m !== method)
          : [...prev, method];
      }
    });
  };

  const isAllSelected = useMemo(() => {
    return paymentMethods.length > 0 && selectedPaymentMethods.length === paymentMethods.length;
  }, [selectedPaymentMethods, paymentMethods]);

  const handleZeroValueToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowZeroValues(event.target.checked);
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleDateChange = (newDate: Date | null) => {
    setSelectedDate(newDate);
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
      'Wallet',
      'Payment Status', 
      'Payment Method', 
      'Invoice Total'
    ];
    
    // Create a map to group rows by invoice number
    const invoiceGroups: Record<string, Array<PaymentRecord>> = {};
    
    // Group data by invoice number
    data.forEach(row => {
      if (!invoiceGroups[row.InvoiceNumber]) {
        invoiceGroups[row.InvoiceNumber] = [];
      }
      invoiceGroups[row.InvoiceNumber].push(row);
    });
    
    // Prepare rows for CSV, ensuring only the first occurrence of each invoice shows the total
    const processedRows: string[] = [];
    
    Object.entries(invoiceGroups).forEach(([invoiceNumber, rows]) => {
      rows.forEach((record, index) => {
        // Format the wallet value
        let walletValue = '';
        if (record.WalletTopUp) {
          if (String(record.WalletTopUp).includes('*Point') || (typeof record.WalletTopUp === 'number' && record.WalletTopUp > 0)) {
            walletValue = 'Topup';
          } else {
            walletValue = String(record.WalletTopUp);
          }
        }
        
        // Only show invoice total for the first row of each invoice
        const isFirstRow = index === 0;
        const invoiceTotal = isFirstRow ? record.InvoiceNetTotal.toString() : '"-"';
        
        processedRows.push([
          record.Date,
          `"${record.InvoiceNumber}"`,
          `"${record.CustomerName}"`,
          `"${record.MemberId || ''}"`,
          `"${record.SalePerson}"`,
          `"${record.ServiceName || ''}"`,
          `"${record.ServicePackageName || ''}"`,
          `"${walletValue}"`,
          `"${record.PaymentStatus}"`,
          `"${record.PaymentMethod}"`,
          invoiceTotal
        ].join(','));
      });
    });
    
    // Create CSV with headers and processed rows
    const csvString = headers.join(',') + '\n' + processedRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `payment_details_${selectedDate?.toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: 'detailed' | 'summary') => {
    if (newMode !== null) {
      setViewMode(newMode);
    }
  };

  const handleCustomerClick = (customerName: string) => {
    navigate(`/customers/${encodeURIComponent(customerName)}`);
  };

  const handleServiceClick = (serviceName: string) => {
    if (serviceName) {
      navigate(`/services/${encodeURIComponent(serviceName)}`);
    }
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
        <Typography sx={{ color: '#d1d5db', mt: 2 }}>Loading sales data...</Typography>
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
          onClick={fetchPaymentData}
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

  return (
    <Box sx={{ 
      p: { xs: 1, sm: 2 }, 
      bgcolor: '#101924',
      minHeight: 'calc(100vh - 60px)', // Changed from fixed height to minHeight
      width: '100%',
      maxWidth: '100%',
      overflow: 'auto', // Changed from 'hidden' to 'auto' to allow scrolling when needed
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
        <Typography variant="h5" sx={{ color: '#f3f4f6' }}>Sales Details</Typography>
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
            <DatePicker
              value={selectedDate}
              onChange={handleDateChange}
              views={filterType === 'month' ? ['year', 'month'] : ['year', 'month', 'day']}
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
          </LocalizationProvider>
        </Box>
        
        {/* Right side controls */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: 1,
          flexWrap: 'nowrap'
        }}>
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
          
          <FormControlLabel
            control={
              <Switch 
                checked={showZeroValues}
                onChange={handleZeroValueToggle}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase': {
                    '&.Mui-checked': {
                      color: '#3b82f6',
                      '& + .MuiSwitch-track': {
                        backgroundColor: '#2563eb',
                      },
                    },
                  },
                  '& .MuiSwitch-track': {
                    backgroundColor: '#4a5568',
                  },
                }}
              />
            }
            label="Zero Values"
            sx={{ 
              m: 0,
              '& .MuiFormControlLabel-label': { 
                fontSize: '0.75rem',
                color: '#d1d5db' 
              }
            }}
          />

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="view mode"
            sx={{
              height: 40,
              '& .MuiToggleButton-root': {
                color: '#9ca3af',
                borderColor: '#2d3748',
                bgcolor: '#1a2234',
                padding: '4px 8px',
                '&.Mui-selected': {
                  color: '#3b82f6',
                  bgcolor: 'rgba(59, 130, 246, 0.1)',
                },
                '&:hover': {
                  bgcolor: 'rgba(26, 34, 52, 0.8)',
                },
              },
            }}
          >
            <ToggleButton value="detailed" aria-label="detailed view" title="Detailed View">
              <ViewListIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="summary" aria-label="summary view" title="Invoice Summary">
              <ViewModuleIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="Export to CSV">
            <IconButton
              onClick={exportToCSV}
              size="small"
              sx={{
                color: '#3b82f6',
                p: 1,
                height: 40,
                width: 40,
                '&:hover': {
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Search box */}
      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search by Invoice #, Customer Name, Member ID, Sale Person, Service Name..."
          variant="outlined"
          fullWidth
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#9ca3af', fontSize: '1.2rem' }} />
              </InputAdornment>
            ),
            sx: {
              height: 40,
              color: '#d1d5db',
              bgcolor: '#1a2234',
              borderRadius: '6px',
              '& fieldset': { borderColor: '#2d3748' },
              '&:hover fieldset': { borderColor: '#4a5568' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' }
            }
          }}
        />
      </Box>

      {/* Main table container */}
      <Paper 
        sx={{ 
          p: 0,
          bgcolor: '#121826',
          borderRadius: '8px',
          border: '1px solid #2d3748',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          width: '100%',
          maxWidth: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden' // Ensure content doesn't overflow the Paper
        }}
      >
        <DataTable 
          data={dataToDisplay}
          onCustomerClick={handleCustomerClick}
          onServiceClick={handleServiceClick}
          columnAliases={{ 
            InvoiceNetTotal: 'Invoice Total',
            MemberId: 'Member ID',
            SalePerson: 'Sale Person',
            ServiceName: 'Service Name',
            ServicePackageName: 'Service Package',
            WalletTopUp: 'Wallet',
            InvoiceNumber: 'Invoice Number'
          }}
        />
      </Paper>

      {/* Record count indicator */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Typography 
          variant="caption"
          sx={{ 
            color: '#9ca3af'
          }}
        >
          {dataToDisplay.length} {dataToDisplay.length === 1 ? 'record' : 'records'}
        </Typography>
      </Box>

      {/* Payment methods filter popover */}
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
              bgcolor: '#121826', // Updated to match theme
              color: '#d1d5db',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              border: '1px solid #2d3748',
              zIndex: 1400
            }
          }
        }}
      >
        <FormGroup>
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
        </FormGroup>
      </Popover>
    </Box>
  );
};

export default PaymentDetails; 