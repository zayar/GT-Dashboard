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
    if (selectedDate) {
      fetchPaymentData();
    }
  }, [selectedDate, filterType]);

  const fetchPaymentData = async () => {
    if (!selectedDate) return;
    
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
        FROM great_time.QueenPaymentView
        WHERE ${filterType === 'day' 
          ? `DATE(OrderCreatedDate) = DATE('${selectedDate.toISOString().split('T')[0]}')`
          : `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = FORMAT_DATE('%Y-%m', DATE('${selectedDate.toISOString().split('T')[0]}'))`
        }
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

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100%',
        bgcolor: '#ffffff'
      }}>
        <CircularProgress sx={{ color: '#1a73e8' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        width: '100%',
        bgcolor: '#ffffff',
        color: 'error.main'
      }}>
        <Typography variant="h6">{error}</Typography>
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
        <Typography variant="h5" sx={{ color: '#000000' }}>Payment Details</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Select
            value={filterType}
            onChange={handleFilterTypeChange}
            size="small"
            sx={{
              minWidth: 120,
              color: '#000000',
              '& .MuiSelect-icon': { color: '#000000' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 0, 0, 0.23)' },
            }}
          >
            <MenuItem value="day">Daily</MenuItem>
            <MenuItem value="month">Monthly</MenuItem>
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
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: 'rgba(0, 0, 0, 0.23)',
                      },
                    },
                  },
                },
              }}
            />
          </LocalizationProvider>
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterListIcon />}
            onClick={handlePaymentFilterClick}
            sx={{
              borderColor: 'rgba(0, 0, 0, 0.23)',
              color: '#000000',
              '&:hover': {
                borderColor: 'rgba(0, 0, 0, 0.87)',
                bgcolor: 'rgba(0, 0, 0, 0.04)'
              }
            }}
          >
            Payment Methods {selectedPaymentMethods.length > 0 && `(${selectedPaymentMethods.length})`}
          </Button>
          
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
                  overflow: 'auto'
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
                  />
                }
                label="Select All"
              />
              <Box sx={{ borderTop: '1px solid rgba(0, 0, 0, 0.12)', my: 1 }} />
              {paymentMethods.map((method) => (
                <FormControlLabel
                  key={method}
                  control={
                    <Checkbox
                      checked={selectedPaymentMethods.includes(method)}
                      onChange={() => handlePaymentMethodChange(method)}
                    />
                  }
                  label={method}
                />
              ))}
            </FormGroup>
          </Popover>
          
          <FormControlLabel
            control={
              <Switch 
                checked={showZeroValues}
                onChange={handleZeroValueToggle}
                color="primary"
              />
            }
            label="Show Zero Values"
            sx={{ 
              '& .MuiFormControlLabel-label': { 
                fontSize: '0.875rem',
                color: '#000000' 
              }
            }}
          />
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="view mode"
            sx={{ ml: 1 }}
          >
            <ToggleButton value="detailed" aria-label="detailed view" title="Detailed View">
              <ViewListIcon />
            </ToggleButton>
            <ToggleButton value="summary" aria-label="summary view" title="Invoice Summary">
              <ViewModuleIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Export to CSV">
            <IconButton
              onClick={exportToCSV}
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

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search by Invoice #, Customer Name, Member ID, Sale Person, Service Name, Package, or Wallet..."
          value={searchTerm}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'rgba(0, 0, 0, 0.54)' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: 'rgba(0, 0, 0, 0.23)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(0, 0, 0, 0.87)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#1a73e8',
              },
            },
          }}
        />
      </Box>

      <Paper 
        elevation={3}
        sx={{ 
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#ffffff',
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {viewMode === 'summary' && (
          <Box sx={{ mb: 2, px: 1 }}>
            <Typography variant="body2" color="textSecondary">
              <strong>Invoice Summary View:</strong> Each invoice is shown as a single row with all services combined.
            </Typography>
          </Box>
        )}
        
        <DataTable 
          data={dataToDisplay}
          onCustomerClick={(customerName) => navigate(`/customer/${encodeURIComponent(customerName)}`)}
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
    </Box>
  );
};

export default PaymentDetails; 