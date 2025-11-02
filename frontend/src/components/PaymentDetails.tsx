import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Select,
  MenuItem,
  SelectChangeEvent,
  Tooltip,
  CircularProgress,
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
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

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
  PaymentType: string | null;
  PaymentAmount: number | null;
  PaymentNote: string | null;
  InvoiceNetTotal: number;
  ItemQuantity: number | null;
  ItemPrice: number | null;
  ItemTotal: number | null;
  SubTotal: number | null;
  Total: number | null;
  NetTotal: number | null;
  OrderBalance: number | null;
  OrderCreditBalance: number | null;
  Discount: number | null;
  Tax: number | null;

}

const PaymentDetails: React.FC = () => {
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
  const isAllSelected = useMemo(() => {
    return paymentMethods.length > 0 && selectedPaymentMethods.length === paymentMethods.length;
  }, [selectedPaymentMethods, paymentMethods]);

  // Filter data based on selected payment methods, zero value setting, and search term
  const data = useMemo(() => {
    let filteredData = rawData;
    
    // Apply payment method filter
    if (selectedPaymentMethods.length > 0) {
      filteredData = filteredData.filter(record => selectedPaymentMethods.includes(record.PaymentMethod));
    }
    
    // Apply zero value filter
    if (!showZeroValues) {
      filteredData = filteredData.filter(record => 
        record.InvoiceNetTotal != null && record.InvoiceNetTotal !== 0
      );
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
    
        // Reorder columns for both detailed and summary views
    const result = filteredData.map((record, index) => {
      // Check if this is the first occurrence of this invoice number
      const isFirstInvoiceRow = index === 0 || filteredData[index - 1].InvoiceNumber !== record.InvoiceNumber;
      
      return {
        Date: record.Date,
        InvoiceNumber: record.InvoiceNumber,
        CustomerName: record.CustomerName,
        MemberId: record.MemberId,
        SalePerson: record.SalePerson,
        ServiceName: record.ServiceName, // Always show service name for each item
        ServicePackageName: record.ServicePackageName,
        WalletTopUp: record.WalletTopUp,
        ItemQuantity: record.ItemQuantity, // Always show item details for each item
        ItemPrice: record.ItemPrice,
        ItemTotal: record.ItemTotal,
        SubTotal: record.SubTotal,
        Total: isFirstInvoiceRow ? record.Total : null, // Show only on first row of invoice
        Discount: isFirstInvoiceRow ? record.Discount : null, // Show only on first row of invoice
        NetTotal: isFirstInvoiceRow ? record.NetTotal : null, // Show only on first row of invoice
        OrderBalance: isFirstInvoiceRow ? record.OrderBalance : null, // Show only on first row of invoice
        OrderCreditBalance: isFirstInvoiceRow ? record.OrderCreditBalance : null, // Show only on first row of invoice
        Tax: isFirstInvoiceRow ? record.Tax : null, // Show only on first row of invoice
        InvoiceNetTotal: isFirstInvoiceRow ? record.InvoiceNetTotal : null, // Show only on first row of invoice
        PaymentStatus: record.PaymentStatus, // Show payment details only when there's a payment for this item
        PaymentMethod: record.PaymentMethod,
        PaymentType: record.PaymentType,
        PaymentAmount: record.PaymentAmount,
        PaymentNote: record.PaymentNote
      };
    });
    

    
    return result;
  }, [data, viewMode]);

  useEffect(() => {
    if (currentClinic && ((filterType === 'day' && startDate && endDate) || (filterType === 'month' && selectedDate))) {
      fetchPaymentData();
    }
  }, [selectedDate, startDate, endDate, filterType, currentClinic]);

  const fetchPaymentData = async () => {
    if (!currentClinic) return;
    
    // Check if we have the required dates based on filter type
    if (filterType === 'day' && (!startDate || !endDate)) return;
    if (filterType === 'month' && !selectedDate) return;
    
    try {
      setLoading(true);
      const query = `
        WITH RawData AS (
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
            CAST(NetTotal AS FLOAT64) as InvoiceNetTotal,
            ItemQuantity,
            ItemPrice,
            ItemTotal,
            SubTotal,
            Total,
            NetTotal,
            OrderBalance,
            OrderCreditBalance,
            Discount,
            Tax,
            PaymentMethod,
            PaymentType,
            PaymentAmount,
            PaymentNote,
            OrderCreatedDate
          FROM great_time.MainPaymentView
          WHERE ${filterType === 'day' 
            ? `DATE(OrderCreatedDate) >= DATE('${startDate!.toISOString().split('T')[0]}') AND DATE(OrderCreatedDate) <= DATE('${endDate!.toISOString().split('T')[0]}')`
            : `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = FORMAT_DATE('%Y-%m', DATE('${selectedDate!.toISOString().split('T')[0]}'))`
          }
          AND PaymentMethod != 'PASS'
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
        ),
        -- Preserve per-item occurrences across repeated payments by assigning an instance number first
        -- Count payments per invoice to de-cartesian items x payments
        PaymentsPerInvoice AS (
          SELECT 
            InvoiceNumber,
            COUNT(DISTINCT CONCAT(COALESCE(PaymentMethod,''),'|',COALESCE(CAST(PaymentAmount AS STRING),''),'|',COALESCE(PaymentNote,''))) AS payments_count
          FROM RawData
          WHERE PaymentAmount IS NOT NULL AND PaymentAmount > 0
          GROUP BY InvoiceNumber
        ),
        -- Group items ignoring payments but keep how many raw rows we saw (items x payments)
        ItemGroups AS (
          SELECT 
            r.InvoiceNumber,
            r.ServiceName,
            r.ServicePackageName,
            r.ItemQuantity,
            r.ItemPrice,
            r.ItemTotal,
            r.SubTotal,
            MIN(r.OrderCreatedDate) AS item_sort_key,
            COUNT(*) AS raw_count
          FROM RawData r
          GROUP BY r.InvoiceNumber, r.ServiceName, r.ServicePackageName, r.ItemQuantity, r.ItemPrice, r.ItemTotal, r.SubTotal
        ),
        -- Expand each grouped item back to the real number of occurrences: raw_count / payments_count
        ExpandedItems AS (
          SELECT 
            g.InvoiceNumber,
            g.ServiceName,
            g.ServicePackageName,
            g.ItemQuantity,
            g.ItemPrice,
            g.ItemTotal,
            g.SubTotal,
            g.item_sort_key,
            instance_num
          FROM ItemGroups g
          LEFT JOIN PaymentsPerInvoice p USING (InvoiceNumber)
          , UNNEST(GENERATE_ARRAY(1, GREATEST(1, CAST(ROUND(SAFE_DIVIDE(g.raw_count, IFNULL(p.payments_count, 1))) AS INT64)))) AS instance_num
        ),
        -- Join expanded items back with invoice-level fields
        UniqueServices AS (
          SELECT 
            r.Date,
            r.InvoiceNumber,
            r.CustomerName,
            r.MemberId,
            r.SalePerson,
            e.ServiceName,
            e.ServicePackageName,
            r.WalletTopUp,
            r.InvoiceNetTotal,
            e.ItemQuantity,
            e.ItemPrice,
            e.ItemTotal,
            e.SubTotal,
            r.Total,
            r.NetTotal,
            r.OrderBalance,
            r.OrderCreditBalance,
            r.Discount,
            r.Tax,
            e.item_sort_key,
            e.instance_num
          FROM ExpandedItems e
          JOIN RawData r
            ON r.InvoiceNumber = e.InvoiceNumber
          GROUP BY 
            r.Date, r.InvoiceNumber, r.CustomerName, r.MemberId, r.SalePerson, r.WalletTopUp, r.InvoiceNetTotal,
            r.Total, r.NetTotal, r.OrderBalance, r.OrderCreditBalance, r.Discount, r.Tax,
            e.ServiceName, e.ServicePackageName, e.ItemQuantity, e.ItemPrice, e.ItemTotal, e.SubTotal, e.item_sort_key, e.instance_num
        ),
        -- Get unique payments per invoice (deduplicate exact combos first, then rank)
        DedupPayments AS (
          SELECT DISTINCT
            InvoiceNumber,
            PaymentMethod,
            PaymentType,
            PaymentAmount,
            PaymentNote,
            PaymentStatus
          FROM RawData
          WHERE PaymentAmount IS NOT NULL AND PaymentAmount > 0
        ),
        UniquePayments AS (
          SELECT 
            InvoiceNumber,
            PaymentMethod,
            PaymentType,
            PaymentAmount,
            PaymentNote,
            PaymentStatus,
            ROW_NUMBER() OVER (
              PARTITION BY InvoiceNumber 
              ORDER BY PaymentAmount DESC, PaymentMethod
            ) as payment_rank
          FROM DedupPayments
        ),
        -- Create numbered service names for duplicates
        ServiceWithNames AS (
          SELECT *,
            CASE 
              WHEN instance_num > 1 
              THEN CONCAT(ServiceName, ' #', CAST(instance_num AS STRING))
              ELSE ServiceName 
            END as DisplayServiceName,
            ROW_NUMBER() OVER (
              PARTITION BY InvoiceNumber 
              ORDER BY item_sort_key, ServiceName, ServicePackageName, instance_num
            ) as item_rank
          FROM UniqueServices
        ),
        -- Get invoice level data
        InvoiceData AS (
          SELECT DISTINCT
            InvoiceNumber,
            Date,
            CustomerName,
            MemberId,
            SalePerson,
            WalletTopUp,
            InvoiceNetTotal,
            Total,
            NetTotal,
            OrderBalance,
            OrderCreditBalance,
            Discount,
            Tax
          FROM RawData
        )
        SELECT 
          i.Date,
          i.InvoiceNumber,
          i.CustomerName,
          i.MemberId,
          i.SalePerson,
          s.DisplayServiceName as ServiceName,
          s.ServicePackageName,
          i.WalletTopUp,
          p.PaymentStatus,
          i.InvoiceNetTotal,
          s.ItemQuantity,
          s.ItemPrice,
          s.ItemTotal,
          s.SubTotal,
          i.Total,
          i.NetTotal,
          i.OrderBalance,
          i.OrderCreditBalance,
          i.Discount,
          i.Tax,
          p.PaymentMethod,
          p.PaymentType,
          p.PaymentAmount,
          p.PaymentNote
        FROM ServiceWithNames s
        JOIN InvoiceData i ON s.InvoiceNumber = i.InvoiceNumber
        LEFT JOIN UniquePayments p ON s.InvoiceNumber = p.InvoiceNumber AND s.item_rank = p.payment_rank
        ORDER BY i.Date DESC, i.InvoiceNumber, s.item_rank
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

  const handleZeroValueToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowZeroValues(event.target.checked);
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleDateChange = (newDate: Date | null) => {
    setSelectedDate(newDate);
  };

  const handleStartDateChange = (newDate: Date | null) => {
    setStartDate(newDate);
    // If end date is before start date, update end date to start date
    if (newDate && endDate && newDate > endDate) {
      setEndDate(newDate);
    }
  };

  const handleEndDateChange = (newDate: Date | null) => {
    setEndDate(newDate);
    // If start date is after end date, update start date to end date
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


  // Function to export data to Excel
  const exportToExcel = () => {
    if (dataToDisplay.length === 0) return;
    
    const workbook = XLSX.utils.book_new();
    
    // Use the processed dataToDisplay which already handles the logic for showing/hiding fields
    const processedRows: any[] = [];
    
    dataToDisplay.forEach((record) => {
      // Format the wallet value
      let walletValue = '';
      if (record.WalletTopUp) {
        if (String(record.WalletTopUp).includes('*Point') || (typeof record.WalletTopUp === 'number' && record.WalletTopUp > 0)) {
          walletValue = 'Topup';
        } else {
          walletValue = String(record.WalletTopUp);
        }
      }
      
      processedRows.push({
        'Date': record.Date,
        'Invoice Number': record.InvoiceNumber,
        'Customer Name': record.CustomerName,
        'Member ID': record.MemberId || '',
        'Sale Person': record.SalePerson || '',
        'Service Name': record.ServiceName || '',
        'Service Package': record.ServicePackageName || '',
        'Wallet': walletValue,
        'Item Quantity': record.ItemQuantity || '',
        'Item Price': record.ItemPrice || '',
        'Item Total': record.ItemTotal || '',
        'Sub Total': record.SubTotal || '',
        'Total': record.Total || '',
        'Discount': record.Discount || '',
        'Net Total': record.NetTotal || '',
        'Order Balance': record.OrderBalance || '',
        'Order Credit Balance': record.OrderCreditBalance || '',
        'Tax': record.Tax || '',
        'Invoice Total': record.InvoiceNetTotal || '',
        'Payment Status': record.PaymentStatus || '',
        'Payment Method': record.PaymentMethod || '',
        'Payment Type': record.PaymentType || '',
        'Payment Amount': record.PaymentAmount || '',
        'Payment Note': record.PaymentNote || ''
      });
    });
    
    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(processedRows);
    
    // Set column widths
    const colWidths = [
      { wch: 12 },  // Date
      { wch: 15 },  // Invoice Number
      { wch: 25 },  // Customer Name
      { wch: 15 },  // Member ID
      { wch: 20 },  // Sale Person
      { wch: 25 },  // Service Name
      { wch: 25 },  // Service Package
      { wch: 10 },  // Wallet
      { wch: 12 },  // Item Quantity
      { wch: 12 },  // Item Price
      { wch: 12 },  // Item Total
      { wch: 12 },  // Sub Total
      { wch: 12 },  // Total
      { wch: 10 },  // Discount
      { wch: 12 },  // Net Total
      { wch: 15 },  // Order Balance
      { wch: 18 },  // Order Credit Balance
      { wch: 10 },  // Tax
      { wch: 15 },  // Invoice Total
      { wch: 12 },  // Payment Status
      { wch: 15 },  // Payment Method
      { wch: 15 },  // Payment Type
      { wch: 15 },  // Payment Amount
      { wch: 20 }   // Payment Note
    ];
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment Details');
    
    // Generate filename based on filter type and date
    let dateStr = '';
    if (filterType === 'month') {
      dateStr = selectedDate ? format(selectedDate, 'yyyy-MM') : format(new Date(), 'yyyy-MM');
    } else {
      // For daily range
      const start = startDate ? format(startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const end = endDate ? format(endDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      dateStr = start === end ? start : `${start}_to_${end}`;
    }
    const fileName = `payment_details_${dateStr}.xlsx`;
    
    // Export file
    XLSX.writeFile(workbook, fileName);
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
              />
            }
            label="Show Zero Values"
          />
          
          {/* Excel Export Button */}
          <Tooltip title="Export to Excel">
            <Button
              variant="outlined"
            size="small"
              startIcon={<FileDownloadIcon />}
              onClick={exportToExcel}
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
              Excel
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

      {/* View mode toggle */}
      <ToggleButtonGroup
        value={viewMode}
        exclusive
        onChange={handleViewModeChange}
        sx={{
          mt: 2,
          mb: 2,
          justifyContent: 'center',
        }}
      >
        <ToggleButton value="detailed" aria-label="detailed view">
          <ViewListIcon />
        </ToggleButton>
        <ToggleButton value="summary" aria-label="summary view">
          <ViewModuleIcon />
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Data table */}
      <DataTable
        data={dataToDisplay}
        onCustomerClick={handleCustomerClick}
        onServiceClick={handleServiceClick}
        columnAliases={{
          Date: 'Date',
          InvoiceNumber: 'Invoice Number',
          CustomerName: 'Customer Name',
          MemberId: 'Member ID',
          SalePerson: 'Sale Person',
          ServiceName: 'Service Name',
          ServicePackageName: 'Service Package',
          WalletTopUp: 'Wallet',
          ItemQuantity: 'Item Quantity',
          ItemPrice: 'Item Price',
          ItemTotal: 'Item Total',
          SubTotal: 'Sub Total',
          Total: 'Total',
          NetTotal: 'Net Total',
          OrderBalance: 'Order Balance',
          OrderCreditBalance: 'Order Credit Balance',
          Tax: 'Tax',
          Discount: 'Discount',
          InvoiceNetTotal: 'Invoice Total',
          PaymentStatus: 'Payment Status',
                    PaymentMethod: 'Payment Method',
          PaymentType: 'Payment Type',
          PaymentAmount: 'Payment Amount',
          PaymentNote: 'Payment Note'
        }}
      />
    </Box>
  );
};

export default PaymentDetails; 