import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Popover,
  Tooltip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  SelectChangeEvent,
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { 
  ArrowBack as ArrowBackIcon,
  FilterList as FilterListIcon,
  FileDownload as FileDownloadIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import DataTable from './DataTable';
import { format } from 'date-fns';
import { useClinic } from '../contexts/ClinicContext';

// Interface for Payment Records
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

// Interface for Summary Records
interface SummaryRecord {
  PaymentMethod: string;
  TotalAmount: number;
  TransactionCount: number;
}

const BankingDetails: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { currentClinic } = useClinic();
  
  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<PaymentRecord[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterType, setFilterType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().setDate(new Date().getDate() - 7))
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentFilterAnchorEl, setPaymentFilterAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  
  const isPaymentFilterOpen = Boolean(paymentFilterAnchorEl);
  const isAllSelected = selectedPaymentMethods.length === paymentMethods.length && paymentMethods.length > 0;

  // Fetch data function
  const fetchData = useCallback(async () => {
    if (!currentClinic) return;
    
    setLoading(true);
    setError(null);

    try {
      // Create date conditions based on selected time period
      let dateCondition: string;
      
      if (filterType === 'daily') {
        // Today
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        dateCondition = `DATE(OrderCreatedDate) = DATE('${formattedDate}')`;
      } else if (filterType === 'weekly') {
        // Last 7 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const formattedStartDate = format(startDate, 'yyyy-MM-dd');
        const formattedEndDate = format(endDate, 'yyyy-MM-dd');
        dateCondition = `DATE(OrderCreatedDate) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'monthly') {
        // Last 30 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const formattedStartDate = format(startDate, 'yyyy-MM-dd');
        const formattedEndDate = format(endDate, 'yyyy-MM-dd');
        dateCondition = `DATE(OrderCreatedDate) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
      } else if (filterType === 'custom') {
        // Custom date range
        if (startDate && endDate) {
          const formattedStartDate = format(startDate, 'yyyy-MM-dd');
          // Set end date to end of day
          const customEndDate = new Date(endDate);
          const formattedEndDate = format(customEndDate, 'yyyy-MM-dd');
          dateCondition = `DATE(OrderCreatedDate) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        } else {
          // Fallback to last 7 days if custom dates are not set
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          const formattedStartDate = format(startDate, 'yyyy-MM-dd');
          const formattedEndDate = format(endDate, 'yyyy-MM-dd');
          dateCondition = `DATE(OrderCreatedDate) BETWEEN DATE('${formattedStartDate}') AND DATE('${formattedEndDate}')`;
        }
      } else {
        // Default fallback
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        dateCondition = `DATE(OrderCreatedDate) = DATE('${formattedDate}')`;
      }

      // Build SQL query to fetch payment records with PAID status
      const sqlQuery = `
        SELECT 
          FORMAT_DATE('%Y-%m-%d', DATE(OrderCreatedDate)) AS Date,
          InvoiceNumber,
          CustomerName,
          MemberId,
          SellerName AS SalePerson,
          ServiceName,
          ServicePackageName,
          PaymentMethod,
          PaymentStatus,
          WalletTopUp,
          CAST(NetTotal AS FLOAT64) AS InvoiceNetTotal
        FROM 
          great_time.MainPaymentView
        WHERE 
          ${dateCondition}
          AND PaymentStatus = 'PAID'
          AND ClinicCode = '${currentClinic.code}'
        ORDER BY 
          OrderCreatedDate DESC, InvoiceNumber
      `;

      // Simulate API call with fetch
      const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sqlQuery }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const responseData = await response.json();
      setRawData(responseData.data as PaymentRecord[] || []);

      // Extract unique payment methods from data
      const methodsSet = new Set((responseData.data as PaymentRecord[]).map(item => item.PaymentMethod));
      const methodsArray = Array.from(methodsSet).sort() as string[];
      setPaymentMethods(methodsArray);
      
      // Default to all payment methods selected
      if (selectedPaymentMethods.length === 0) {
        setSelectedPaymentMethods(methodsArray);
      }

      // Generate summary data
      generateSummaryData(responseData.data as PaymentRecord[] || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filterType, startDate, endDate, currentClinic]);

  // Generate summary data from raw data
  const generateSummaryData = (data: PaymentRecord[]) => {
    // Check if data is empty or undefined
    if (!data || data.length === 0) {
      setSummaryData([]);
      return;
    }
    
    // Filter out zero-value transactions
    const filteredData = data.filter(record => record.InvoiceNetTotal !== 0);
    
    const summary: Record<string, SummaryRecord> = {};
    
    // Create a map to track processed invoices per payment method
    const processedInvoices: Record<string, Set<string>> = {};
    
    // First pass: Group by payment method and invoice number to sum only unique invoices
    filteredData.forEach(record => {
      const { PaymentMethod, InvoiceNumber, InvoiceNetTotal } = record;
      
      // Initialize payment method in summaries if not exists
      if (!summary[PaymentMethod]) {
        summary[PaymentMethod] = {
          PaymentMethod,
          TotalAmount: 0,
          TransactionCount: 0
        };
        processedInvoices[PaymentMethod] = new Set();
      }
      
      // Only add the amount once per invoice number
      if (!processedInvoices[PaymentMethod].has(InvoiceNumber)) {
        processedInvoices[PaymentMethod].add(InvoiceNumber);
        summary[PaymentMethod].TotalAmount += InvoiceNetTotal;
        // Count each unique invoice once for transaction count
        summary[PaymentMethod].TransactionCount += 1;
      }
    });
    
    const summaryArray = Object.values(summary).sort((a, b) => b.TotalAmount - a.TotalAmount);
    setSummaryData(summaryArray);
  };

  // Calculate filtered data
  const filteredData = useMemo(() => {
    let filtered = selectedPaymentMethod 
      ? rawData.filter(record => record.PaymentMethod === selectedPaymentMethod)
      : rawData.filter(record => selectedPaymentMethods.includes(record.PaymentMethod));
    
    // Filter out zero-value transactions
    filtered = filtered.filter(record => record.InvoiceNetTotal !== 0);

    return filtered;
  }, [rawData, selectedPaymentMethods, selectedPaymentMethod]);

  // Calculate filtered summary data based on selected payment methods
  const filteredSummaryData = useMemo(() => {
    if (selectedPaymentMethod) {
      return summaryData.filter(item => item.PaymentMethod === selectedPaymentMethod);
    } else if (selectedPaymentMethods.length === 0) {
      return [];
    } else if (selectedPaymentMethods.length === paymentMethods.length) {
      return summaryData;
    } else {
      return summaryData.filter(item => selectedPaymentMethods.includes(item.PaymentMethod));
    }
  }, [summaryData, selectedPaymentMethods, selectedPaymentMethod, paymentMethods.length]);

  // Navigation handlers
  const handleBack = () => {
    navigate(-1);
  };

  // Date and filter handlers
  const handleDateChange = (newDate: Date | null) => {
    if (newDate) {
      setSelectedDate(newDate);
    }
  };

  const handleFilterTypeChange = (event: SelectChangeEvent<'daily' | 'weekly' | 'monthly' | 'custom'>) => {
    const newFilterType = event.target.value as 'daily' | 'weekly' | 'monthly' | 'custom';
    setFilterType(newFilterType);
    
    // Reset data to ensure fetch happens with new filter
    setRawData([]);
    
    // Handle the case when switching to/from custom date range
    if (newFilterType === 'custom') {
      // Set default range to last 7 days when switching to custom
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start);
      setEndDate(end);
    }
  };
  
  // Change handler for date range inputs
  const handleDateRangeChange = (isStart: boolean, newDate: Date | null) => {
    if (newDate) {
      if (isStart) {
        setStartDate(newDate);
      } else {
        setEndDate(newDate);
      }
    }
  };

  // Payment method filter handlers
  const handlePaymentFilterClick = (event: React.MouseEvent<HTMLElement>) => {
    setPaymentFilterAnchorEl(event.currentTarget);
  };

  const handlePaymentFilterClose = () => {
    setPaymentFilterAnchorEl(null);
  };

  const handlePaymentMethodChange = (method: string) => {
    if (method === 'all') {
      setSelectedPaymentMethods(isAllSelected ? [] : [...paymentMethods]);
    } else {
      setSelectedPaymentMethods(prev => {
        if (prev.includes(method)) {
          return prev.filter(item => item !== method);
        } else {
          return [...prev, method];
        }
      });
    }
  };

  // Payment method selection from summary table
  const handlePaymentMethodSelect = (method: string) => {
    setSelectedPaymentMethod(method === selectedPaymentMethod ? null : method);
  };

  // Export to CSV function
  const exportToCSV = () => {
    // If no data, return
    if (!filteredData || filteredData.length === 0) {
      alert('No data available to export.');
      return;
    }

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

    // Pre-process invoice numbers to track which ones we've seen
    const processedInvoices = new Set<string>();
    
    // Create a map to group rows by invoice number
    const invoiceGroups: Record<string, Array<PaymentRecord>> = {};
    
    // Group data by invoice number
    filteredData.forEach(row => {
      if (!invoiceGroups[row.InvoiceNumber]) {
        invoiceGroups[row.InvoiceNumber] = [];
      }
      invoiceGroups[row.InvoiceNumber].push(row);
    });
    
    // Prepare rows for CSV, ensuring only the first occurrence of each invoice number shows the total
    const processedRows: string[] = [];
    
    Object.entries(invoiceGroups).forEach(([invoiceNumber, rows]) => {
      rows.forEach((row, index) => {
        const walletValue = row.WalletTopUp ? 
          (String(row.WalletTopUp).includes('*Point') ? 'Topup' : row.WalletTopUp) : 
          '';
        
        // Only show the invoice total on the first row of each invoice group
        const isFirstRow = index === 0;
        const invoiceTotal = isFirstRow ? row.InvoiceNetTotal.toString() : '"-"';
        
        processedRows.push([
          row.Date,
          `"${row.InvoiceNumber}"`,
          `"${row.CustomerName}"`,
          `"${row.MemberId || ''}"`,
          `"${row.SalePerson}"`,
          `"${row.ServiceName || ''}"`,
          `"${row.ServicePackageName || ''}"`,
          `"${row.PaymentMethod}"`,
          `"${row.PaymentStatus}"`,
          `"${walletValue}"`,
          invoiceTotal
        ].join(','));
      });
    });
    
    // Map data to CSV format
    const csvRows = [
      headers.join(','),
      ...processedRows
    ];

    // Create CSV blob and download
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `banking_transactions_${format(selectedDate, 'yyyy-MM-dd')}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export summary data to CSV
  const exportSummaryToCSV = () => {
    // If no data, return
    if (!filteredSummaryData || filteredSummaryData.length === 0) {
      alert('No summary data available to export.');
      return;
    }

    const headers = [
      'Payment Method',
      'Transaction Count',
      'Total Amount'
    ];

    // Map data to CSV format
    const csvRows = [
      headers.join(','),
      ...filteredSummaryData.map(row => {
        return [
          `"${row.PaymentMethod}"`,
          row.TransactionCount,
          row.TotalAmount
        ].join(',');
      }),
      // Add grand total row
      [
        '"Grand Total"',
        filteredSummaryData.reduce((count, method) => count + method.TransactionCount, 0),
        filteredSummaryData.reduce((total, method) => total + method.TotalAmount, 0)
      ].join(',')
    ];

    // Create CSV blob and download
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `banking_summary_${format(selectedDate, 'yyyy-MM-dd')}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fetch data on component mount and when dependencies change
  useEffect(() => {
    if (currentClinic) {
      fetchData();
    }
  }, [fetchData, currentClinic]);

  // Update document title based on time period
  useEffect(() => {
    let titlePrefix = 'Payment Report';
    switch (filterType) {
      case 'daily':
        titlePrefix = 'Daily Payment Report';
        break;
      case 'weekly':
        titlePrefix = 'Weekly Payment Report';
        break;
      case 'monthly':
        titlePrefix = 'Monthly Payment Report';
        break;
      case 'custom':
        titlePrefix = 'Custom Payment Report';
        break;
    }
    document.title = titlePrefix;
    return () => {
      document.title = 'Dashboard'; // Reset title when component unmounts
    };
  }, [filterType]);

  // Display loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Display error state
  if (error) {
    return (
      <Box sx={{ p: 3, bgcolor: '#101924' }}>
        <Typography color="#ef4444">Error: {error}</Typography>
        <Button 
          variant="contained" 
          onClick={fetchData}
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

  // Calculate grand total
  const grandTotal = summaryData.reduce((total, method) => total + method.TotalAmount, 0);

  return (
    <Box sx={{ 
      p: 3, 
      bgcolor: '#101924', 
      minHeight: '100vh',
      color: '#d1d5db'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#3b82f6',
            mr: 2,
            '&:hover': {
              bgcolor: 'rgba(59, 130, 246, 0.08)'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ color: '#f3f4f6' }}>Banking Details</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Select
            value={filterType}
            onChange={handleFilterTypeChange}
            size="small"
            sx={{
              minWidth: 120,
              color: '#d1d5db',
              bgcolor: '#1a2234',
              '& .MuiSelect-icon': { color: '#d1d5db' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
            }}
          >
            <MenuItem value="daily" sx={{ bgcolor: '#1a2234', color: '#d1d5db' }}>Daily</MenuItem>
            <MenuItem value="weekly" sx={{ bgcolor: '#1a2234', color: '#d1d5db' }}>Weekly</MenuItem>
            <MenuItem value="monthly" sx={{ bgcolor: '#1a2234', color: '#d1d5db' }}>Monthly</MenuItem>
            <MenuItem value="custom" sx={{ bgcolor: '#1a2234', color: '#d1d5db' }}>Custom</MenuItem>
          </Select>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {filterType !== 'custom' ? (
              <DatePicker
                value={selectedDate}
                onChange={handleDateChange}
                views={filterType === 'monthly' ? ['year', 'month'] : ['year', 'month', 'day']}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: {
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
                  },
                }}
              />
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(newValue) => handleDateRangeChange(true, newValue)}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
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
                    },
                  }}
                />
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={(newValue) => handleDateRangeChange(false, newValue)}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
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
                    },
                  }}
                />
              </Box>
            )}
          </LocalizationProvider>
          
          {paymentMethods.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<FilterListIcon />}
              onClick={handlePaymentFilterClick}
              sx={{
                borderColor: '#2d3748',
                color: '#d1d5db',
                bgcolor: '#1a2234',
                '&:hover': {
                  borderColor: '#4a5568',
                  bgcolor: 'rgba(26, 34, 52, 0.7)'
                }
              }}
            >
              Payment Methods {selectedPaymentMethods.length > 0 && `(${selectedPaymentMethods.length})`}
            </Button>
          )}
          
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
        </Box>
      </Box>

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
          {filteredSummaryData.length > 0 && (
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
        
        {filteredSummaryData.length > 0 ? (
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
                    align="right"
                    sx={{ 
                      bgcolor: '#121826', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Transaction Count
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ 
                      bgcolor: '#121826', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Total Amount
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSummaryData.map((row) => (
                  <TableRow 
                    key={row.PaymentMethod}
                    hover
                    onClick={() => handlePaymentMethodSelect(row.PaymentMethod)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: selectedPaymentMethod === row.PaymentMethod ? 'rgba(59, 130, 246, 0.1)' : 'inherit',
                      '&:hover': { bgcolor: '#121826' },
                    }}
                  >
                    <TableCell sx={{ 
                      color: '#f3f4f6', 
                      fontWeight: selectedPaymentMethod === row.PaymentMethod ? 'bold' : 'normal',
                      borderBottom: '1px solid #2d3748'
                    }}>
                      {row.PaymentMethod}
                    </TableCell>
                    <TableCell align="right" sx={{ 
                      color: '#d1d5db', 
                      fontWeight: selectedPaymentMethod === row.PaymentMethod ? 'bold' : 'normal',
                      borderBottom: '1px solid #2d3748'
                    }}>
                      {row.TransactionCount}
                    </TableCell>
                    <TableCell align="right" sx={{ 
                      color: '#d1d5db', 
                      fontWeight: selectedPaymentMethod === row.PaymentMethod ? 'bold' : 'normal',
                      borderBottom: '1px solid #2d3748'
                    }}>
                      {row.TotalAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      })}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Grand total row */}
                <TableRow sx={{ bgcolor: '#121826' }}>
                  <TableCell sx={{ color: '#f3f4f6', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    Grand Total
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#d1d5db', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    {filteredSummaryData.reduce((count, method) => count + method.TransactionCount, 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#d1d5db', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                    {filteredSummaryData.reduce((total, method) => total + method.TotalAmount, 0).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0
                    })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="#9ca3af">
              {selectedPaymentMethods.length === 0 ? 
                'No payment methods selected. Please select at least one payment method from the filter.' : 
                'No payment data available for the selected date and payment methods.'}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Main data table */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          mb: 3, 
          bgcolor: '#1a2234',
          borderRadius: '8px',
          border: '1px solid #2d3748',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" sx={{ color: '#f3f4f6' }}>
            {selectedPaymentMethod ? `${selectedPaymentMethod} Transactions` : 'All Transactions'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {filteredData.length > 0 && (
              <Tooltip title="Export Transactions to CSV">
                <IconButton 
                  onClick={exportToCSV}
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
            {selectedPaymentMethod && (
              <Button 
                variant="outlined" 
                size="small" 
                onClick={() => setSelectedPaymentMethod(null)}
                sx={{
                  borderColor: '#2d3748',
                  color: '#d1d5db',
                  bgcolor: '#121826',
                  '&:hover': {
                    borderColor: '#4a5568',
                    bgcolor: 'rgba(26, 34, 52, 0.7)'
                  }
                }}
              >
                Show All
              </Button>
            )}
          </Box>
        </Box>
        
        {filteredData.length > 0 ? (
          <DataTable 
            data={filteredData}
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
        ) : (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="#9ca3af">
              No transaction data available for the selected criteria.
            </Typography>
            <Button 
              variant="contained" 
              onClick={fetchData}
              sx={{ 
                mt: 2,
                bgcolor: '#3b82f6',
                '&:hover': {
                  bgcolor: '#2563eb'
                }
              }}
            >
              Refresh Data
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default BankingDetails; 