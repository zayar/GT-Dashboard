import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Chip,
  TextField,
  InputAdornment,
  TablePagination,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useClinic } from '../contexts/ClinicContext';
import axios from 'axios';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import { formatCurrency } from '../utils/currency';
import {
  buildCustomerServiceActivityQuery,
  CustomerServiceActivityPeriod,
  getCustomerServiceActivityRange,
} from '../utils/customerServiceActivity';

interface DailyReportData {
  CustomerName: string;
  CustomerPhoneNumber: string;
  CustomerId: string;
  ServiceName: string;
  CheckInTime: string;
  PractitionerName: string;
  HelperName: string | null;
  IsNewCustomer: string;
  TotalPaymentAmount: number | null;
  PaymentMethods: string | null;
  PaymentNotes: string | null;
  SellerNames?: string | null;
}

interface DailyReportProps {
  rangeEnabled?: boolean;
}

const DailyReport: React.FC<DailyReportProps> = ({ rangeEnabled = false }) => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<DailyReportData[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [period, setPeriod] = useState<CustomerServiceActivityPeriod>('week');
  const [periodDate, setPeriodDate] = useState<Date | null>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [customEndDate, setCustomEndDate] = useState<Date | null>(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const latestRequestIdRef = useRef(0);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim().toLowerCase());

  const reportRange = useMemo(() => getCustomerServiceActivityRange(
    rangeEnabled
      ? {
          period,
          anchorDate: periodDate,
          customStartDate,
          customEndDate,
        }
      : {
          period: 'day',
          anchorDate: selectedDate,
        }
  ), [customEndDate, customStartDate, period, periodDate, rangeEnabled, selectedDate]);

  const fetchDailyData = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    const isLatestRequest = () => latestRequestIdRef.current === requestId;
    if (!currentClinic) {
      setError('No clinic selected');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const query = buildCustomerServiceActivityQuery({
        clinicCode: currentClinic.code,
        startDate: reportRange.startDateKey,
        endDate: reportRange.endDateKey,
      });

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: rangeEnabled ? 30000 : 15000
        }
      );

      if (!isLatestRequest()) return;

      if (!response.data.success) {
        console.error('BigQuery Error:', response.data.error);
        throw new Error(response.data.error || 'Failed to fetch customer service activity');
      }

      const data = response.data.data || [];
      setRawData(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (!isLatestRequest()) return;
      console.error('Error fetching daily report:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch customer service activity');
    } finally {
      if (isLatestRequest()) setLoading(false);
    }
  }, [currentClinic, rangeEnabled, reportRange.endDateKey, reportRange.startDateKey]);

  useEffect(() => {
    if (currentClinic) {
      fetchDailyData();
    }
  }, [currentClinic, fetchDailyData]);

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  // Calculate summary statistics
  const summary = useMemo(() => {
    const uniqueCustomers = new Map<string, DailyReportData>();
    const uniqueServices = new Set(rawData.map(r => r.ServiceName));
    const serviceCounts = new Map<string, number>();
    const practitionerCounts = new Map<string, number>();

    rawData.forEach((record, index) => {
      const customerKey = record.CustomerPhoneNumber?.trim() || record.CustomerId?.trim() || `${record.CustomerName}-${index}`;
      if (!uniqueCustomers.has(customerKey)) uniqueCustomers.set(customerKey, record);
      serviceCounts.set(record.ServiceName, (serviceCounts.get(record.ServiceName) || 0) + 1);
      if (record.PractitionerName) {
        practitionerCounts.set(record.PractitionerName, (practitionerCounts.get(record.PractitionerName) || 0) + 1);
      }
    });

    const customerRecords = Array.from(uniqueCustomers.values());
    const collectedRevenue = customerRecords.reduce((sum, record) => sum + (Number(record.TotalPaymentAmount) || 0), 0);
    const payingCustomers = customerRecords.filter(record => (Number(record.TotalPaymentAmount) || 0) > 0);
    const topEntry = (counts: Map<string, number>) =>
      Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    const topService = topEntry(serviceCounts);
    const topPractitioner = topEntry(practitionerCounts);

    return {
      totalCustomers: uniqueCustomers.size,
      totalServices: uniqueServices.size,
      servicesDelivered: rawData.length,
      newCustomers: customerRecords.filter(record => record.IsNewCustomer === 'Yes').length,
      collectedRevenue,
      averageSpend: payingCustomers.length ? collectedRevenue / payingCustomers.length : 0,
      sellerAssignedCustomers: customerRecords.filter(record => record.SellerNames?.trim()).length,
      topService: topService ? { name: topService[0], count: topService[1] } : null,
      topPractitioner: topPractitioner ? { name: topPractitioner[0], count: topPractitioner[1] } : null
    };
  }, [rawData]);

  // Prepare heatmap data: Customer (rows) x Service (columns)
  const heatmapData = useMemo(() => {
    const customerServiceMap: { [customer: string]: { [service: string]: number } } = {};
    const allServices = new Set<string>();
    const customerPhoneMap: { [customer: string]: string } = {};
    const customerIdMap: { [customer: string]: string } = {};
    const customerPractitionerMap: { [customer: string]: Set<string> } = {};
    const customerHelperMap: { [customer: string]: Set<string> } = {};
    const customerNewStatusMap: { [customer: string]: string } = {};
    const customerPaymentAmountMap: { [customer: string]: number } = {};
    const customerPaymentMethodMap: { [customer: string]: string } = {};
    const customerPaymentNoteMap: { [customer: string]: string } = {};
    const customerSellerMap: { [customer: string]: string } = {};
    const customerNameMap: { [customer: string]: string } = {};

    rawData.forEach((record, index) => {
      const customer = record.CustomerPhoneNumber?.trim() || record.CustomerId?.trim() || `${record.CustomerName}-${index}`;
      const service = record.ServiceName;
      customerNameMap[customer] = record.CustomerName;

      // Store phone number and customer ID for reference
      customerPhoneMap[customer] = record.CustomerPhoneNumber;
      customerIdMap[customer] = record.CustomerId;

      // Store new customer status
      customerNewStatusMap[customer] = record.IsNewCustomer;

      // Store payment information (same for all records of a customer)
      customerPaymentAmountMap[customer] = record.TotalPaymentAmount || 0;
      customerPaymentMethodMap[customer] = record.PaymentMethods || '-';
      customerPaymentNoteMap[customer] = record.PaymentNotes || '-';
      customerSellerMap[customer] = record.SellerNames || '-';

      // Store practitioners and helpers
      if (!customerPractitionerMap[customer]) {
        customerPractitionerMap[customer] = new Set();
      }
      if (!customerHelperMap[customer]) {
        customerHelperMap[customer] = new Set();
      }

      if (record.PractitionerName) {
        customerPractitionerMap[customer].add(record.PractitionerName);
      }
      if (record.HelperName) {
        customerHelperMap[customer].add(record.HelperName);
      }

      if (!customerServiceMap[customer]) {
        customerServiceMap[customer] = {};
      }

      if (!customerServiceMap[customer][service]) {
        customerServiceMap[customer][service] = 0;
      }

      customerServiceMap[customer][service]++;
      allServices.add(service);
    });

    const services = Array.from(allServices).sort();
    const customers = Object.keys(customerServiceMap).sort((a, b) =>
      customerNameMap[a].localeCompare(customerNameMap[b])
    );

    // Convert Sets to comma-separated strings
    const practitionerMap: { [customer: string]: string } = {};
    const helperMap: { [customer: string]: string } = {};

    customers.forEach(customer => {
      practitionerMap[customer] = Array.from(customerPractitionerMap[customer] || []).join(', ') || '-';
      helperMap[customer] = Array.from(customerHelperMap[customer] || []).join(', ') || '-';
    });

    return {
      customers,
      services,
      data: customerServiceMap,
      customerNameMap,
      phoneMap: customerPhoneMap,
      customerIdMap,
      practitionerMap,
      helperMap,
      newCustomerMap: customerNewStatusMap,
      paymentAmountMap: customerPaymentAmountMap,
      paymentMethodMap: customerPaymentMethodMap,
      paymentNoteMap: customerPaymentNoteMap,
      sellerMap: customerSellerMap
    };
  }, [rawData]);

  // Calculate heatmap color based on count
  const getHeatmapColor = (count: number, maxValue: number) => {
    if (count === 0 || !count) return 'transparent';
    const opacity = 0.2 + (count / (maxValue || 1)) * 0.7;
    return `color-mix(in srgb, var(--primary) ${Math.round(opacity * 100)}%, transparent)`;
  };

  // Get maximum value for color scaling
  const maxValue = useMemo(() => {
    const allCounts = Object.values(heatmapData.data).flatMap(serviceMap =>
      Object.values(serviceMap)
    );
    return allCounts.length > 0 ? Math.max(...allCounts) : 1;
  }, [heatmapData]);

  const filteredCustomers = useMemo(() => {
    if (!deferredSearchTerm) return heatmapData.customers;
    return heatmapData.customers.filter(customer => {
      const searchable = [
        heatmapData.customerNameMap[customer],
        heatmapData.phoneMap[customer],
        heatmapData.customerIdMap[customer],
        heatmapData.practitionerMap[customer],
        heatmapData.helperMap[customer],
        heatmapData.sellerMap[customer],
        heatmapData.paymentMethodMap[customer]
      ].join(' ').toLowerCase();
      return searchable.includes(deferredSearchTerm);
    });
  }, [deferredSearchTerm, heatmapData]);

  useEffect(() => {
    setPage(0);
  }, [deferredSearchTerm, reportRange.endDateKey, reportRange.startDateKey, rowsPerPage]);

  const lastPage = Math.max(0, Math.ceil(filteredCustomers.length / rowsPerPage) - 1);
  const effectivePage = Math.min(page, lastPage);
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice(effectivePage * rowsPerPage, effectivePage * rowsPerPage + rowsPerPage),
    [effectivePage, filteredCustomers, rowsPerPage]
  );

  const handleBack = () => {
    navigate(-1);
  };

  const handleCustomerClick = (phoneNumber: string) => {
    navigate(`/customers/${encodeURIComponent(phoneNumber)}`);
  };

  const handleServiceClick = (serviceName: string) => {
    navigate(`/services/${encodeURIComponent(serviceName)}`);
  };

  const exportToExcel = () => {
    if (filteredCustomers.length === 0) {
      return;
    }

    // Prepare data for Excel export
    const exportData = filteredCustomers.map(customer => {
      const row: any = {
        'Customer Name': heatmapData.customerNameMap[customer],
        'Customer ID': heatmapData.customerIdMap[customer],
        'Phone Number': heatmapData.phoneMap[customer],
        'New Customer': heatmapData.newCustomerMap[customer],
        'Practitioner(s)': heatmapData.practitionerMap[customer],
        'Helper(s)': heatmapData.helperMap[customer],
        'Seller(s)': heatmapData.sellerMap[customer],
        'Payment Amount': heatmapData.paymentAmountMap[customer] || 0,
        'Payment Method(s)': heatmapData.paymentMethodMap[customer],
        'Payment Note(s)': heatmapData.paymentNoteMap[customer]
      };

      // Add service columns
      heatmapData.services.forEach(service => {
        row[service] = heatmapData.data[customer]?.[service] || 0;
      });

      return row;
    });

    // Export data without summary row
    const dataWithSummary = exportData;

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(dataWithSummary);

    // Set column widths
    const colWidths = [
      { wch: 30 }, // Customer Name
      { wch: 15 }, // Customer ID
      { wch: 15 }, // Phone Number
      { wch: 15 }, // New Customer
      { wch: 25 }, // Practitioner(s)
      { wch: 25 }, // Helper(s)
      { wch: 25 }, // Seller(s)
      { wch: 15 }, // Payment Amount
      { wch: 20 }, // Payment Method(s)
      { wch: 30 }, // Payment Note(s)
      ...heatmapData.services.map(() => ({ wch: 20 })) // Service columns
    ];
    ws['!cols'] = colWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, rangeEnabled ? 'Customer Service Activity' : 'Daily Report');

    const filename = rangeEnabled
      ? `customer_service_activity_${currentClinic?.code}_${reportRange.startDateKey}_to_${reportRange.endDateKey}.xlsx`
      : `daily_report_${currentClinic?.code}_${reportRange.startDateKey}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        bgcolor: 'var(--surface-secondary)'
      }}>
        <CircularProgress sx={{ color: 'var(--primary)' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ bgcolor: 'var(--surface-secondary)', minHeight: '100vh', p: 3 }}>
        <Paper sx={{ p: 4, bgcolor: 'var(--surface)', textAlign: 'center', borderRadius: 2 }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button
            variant="contained"
            onClick={fetchDailyData}
            startIcon={<RefreshIcon />}
            sx={{
              bgcolor: 'var(--primary)',
              '&:hover': { bgcolor: 'var(--primary-hover)' }
            }}
          >
            Retry
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ bgcolor: 'var(--surface-secondary)', minHeight: '100vh', p: { xs: 1.5, md: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              onClick={handleBack}
              sx={{
                mr: 2,
                color: 'var(--text-primary)',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Box>
              <Typography variant="h5" component="h1" sx={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                {rangeEnabled ? 'Customer Service Activity Report' : 'Daily Performance'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.5 }}>
                {reportRange.label}{lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {rangeEnabled ? (
              <>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={period}
                  onChange={(_, nextPeriod: CustomerServiceActivityPeriod | null) => {
                    if (nextPeriod) setPeriod(nextPeriod);
                  }}
                  aria-label="Report period"
                  sx={{
                    bgcolor: 'var(--surface)',
                    '& .MuiToggleButton-root': {
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      textTransform: 'none',
                      px: 1.75,
                      '&.Mui-selected': {
                        bgcolor: 'var(--primary)',
                        color: 'var(--text-on-primary)',
                        '&:hover': { bgcolor: 'var(--primary-hover)' },
                      },
                    },
                  }}
                >
                  <ToggleButton value="week">Week</ToggleButton>
                  <ToggleButton value="month">Month</ToggleButton>
                  <ToggleButton value="custom">Custom Range</ToggleButton>
                </ToggleButtonGroup>
                {period !== 'custom' ? (
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setPeriodDate(new Date())}
                      sx={{
                        borderColor: 'var(--border)',
                        color: 'var(--text-secondary)',
                        bgcolor: 'var(--surface)',
                        textTransform: 'none',
                        '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-soft)' },
                      }}
                    >
                      {period === 'month' ? 'This Month' : 'This Week'}
                    </Button>
                    <DatePicker
                      label={period === 'month' ? 'Month' : 'Week containing'}
                      value={periodDate}
                      onChange={(date) => {
                        if (date) setPeriodDate(date);
                      }}
                      views={period === 'month' ? ['year', 'month'] : ['year', 'month', 'day']}
                      openTo={period === 'month' ? 'month' : 'day'}
                      slotProps={{ textField: { size: 'small', sx: { width: period === 'month' ? 165 : 190, bgcolor: 'var(--surface)' } } }}
                    />
                  </>
                ) : (
                  <>
                    <DatePicker
                      label="Start date"
                      value={customStartDate}
                      maxDate={customEndDate || undefined}
                      onChange={(date) => {
                        if (date) setCustomStartDate(date);
                      }}
                      slotProps={{ textField: { size: 'small', sx: { width: 155, bgcolor: 'var(--surface)' } } }}
                    />
                    <DatePicker
                      label="End date"
                      value={customEndDate}
                      minDate={customStartDate || undefined}
                      onChange={(date) => {
                        if (date) setCustomEndDate(date);
                      }}
                      slotProps={{ textField: { size: 'small', sx: { width: 155, bgcolor: 'var(--surface)' } } }}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setSelectedDate(new Date())}
                  sx={{
                    fontSize: '0.75rem',
                    minWidth: 'auto',
                    px: 2,
                    py: 0.5,
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                    bgcolor: 'var(--surface)',
                    '&:hover': {
                      borderColor: 'var(--primary)',
                      color: 'var(--primary)',
                      bgcolor: 'var(--primary-soft)'
                    }
                  }}
                >
                  Today
                </Button>
                <DatePicker
                  value={selectedDate}
                  onChange={handleDateChange}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        bgcolor: 'var(--surface)',
                        borderRadius: 1,
                        '& .MuiOutlinedInput-root': {
                          color: 'var(--text-secondary)',
                          '& fieldset': { borderColor: 'var(--border)' },
                          '&:hover fieldset': { borderColor: 'var(--text-muted)' },
                          '&.Mui-focused fieldset': { borderColor: 'var(--primary)' },
                        },
                        '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                        '& .MuiSvgIcon-root': { color: 'var(--text-secondary)' },
                      }
                    }
                  }}
                />
              </>
            )}
            <IconButton
              onClick={fetchDailyData}
              sx={{
                color: 'var(--text-primary)',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

      {/* Owner-focused summary */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          {
            label: 'Collected from visitors',
            value: formatCurrency(summary.collectedRevenue, currentClinic),
            detail: `${summary.totalCustomers} customers`
          },
          {
            label: 'Customers served',
            value: summary.totalCustomers.toLocaleString(),
            detail: `${summary.newCustomers} new customers`
          },
          {
            label: 'Services delivered',
            value: summary.servicesDelivered.toLocaleString(),
            detail: `${summary.totalServices} unique services`
          },
          {
            label: 'Average spend',
            value: formatCurrency(summary.averageSpend, currentClinic),
            detail: 'Per paying customer'
          }
        ].map(card => (
          <Grid item xs={12} sm={6} lg={3} key={card.label}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{card.label}</Typography>
              <Typography variant="h5" sx={{ color: 'var(--text-primary)', fontWeight: 700, mt: 1 }}>{card.value}</Typography>
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>{card.detail}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        {summary.topService && <Chip label={`Top service: ${summary.topService.name} (${summary.topService.count})`} variant="outlined" />}
        {summary.topPractitioner && <Chip label={`Top practitioner: ${summary.topPractitioner.name} (${summary.topPractitioner.count})`} variant="outlined" />}
        {!!summary.totalCustomers && (
          <Chip label={`Seller assigned: ${summary.sellerAssignedCustomers}/${summary.totalCustomers}`} variant="outlined" sx={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }} />
        )}
      </Box>

      {/* Customer-Service Heatmap */}
      <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, gap: 2, mb: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 600 }}>Customer service activity</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.5 }}>
              Customer-level payments, staff assignments, and service usage
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search customer, phone, staff or seller"
              sx={{ minWidth: { xs: '100%', sm: 300 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
                )
              }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={exportToExcel}
              disabled={filteredCustomers.length === 0}
              sx={{
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                bgcolor: 'var(--surface)',
                '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-soft)' },
                '&.Mui-disabled': { borderColor: 'var(--surface-secondary)', color: 'var(--border-strong)' }
              }}
            >
              Export to Excel
            </Button>
          </Box>
        </Box>

        {filteredCustomers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography sx={{ color: 'var(--text-secondary)' }}>
              {searchTerm
                ? 'No customers match your search.'
                : `No service usage data is available for ${rangeEnabled ? 'this period' : 'this date'}.`}
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              maxHeight: '58vh',
              overflowY: 'auto',
              overflowX: 'auto',
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
                backgroundColor: 'var(--primary)',
              }
            }}
          >
            <Table
              size="small"
              stickyHeader
              aria-label={rangeEnabled ? 'Customer service activity report' : 'Daily customer service activity'}
              sx={{
                '& th:not(:first-of-type), & td:not(:first-of-type)': {
                  position: 'static !important',
                  left: 'auto !important'
                }
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 200
                    }}
                  >
                    Customer Name
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 200,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 120,
                      textAlign: 'center'
                    }}
                  >
                    Customer ID
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 320,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 100,
                      textAlign: 'center'
                    }}
                  >
                    New
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 420,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 150
                    }}
                  >
                    Practitioner(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 570,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 150
                    }}
                  >
                    Helper(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 720,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 150
                    }}
                  >
                    Seller(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 870,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 120,
                      textAlign: 'right'
                    }}
                  >
                    Payment
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 990,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 130
                    }}
                  >
                    Method(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 1120,
                      zIndex: 3,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      minWidth: 200
                    }}
                  >
                    Note(s)
                  </TableCell>
                  {heatmapData.services.map((service) => (
                    <TableCell
                      key={service}
                      sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 120,
                        textAlign: 'center',
                        cursor: 'pointer',
                        '&:hover': {
                          color: 'var(--primary)',
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => handleServiceClick(service)}
                    >
                      {service}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedCustomers.map((customer) => (
                  <TableRow
                    key={customer}
                    sx={{
                      '&:hover': { bgcolor: 'var(--surface)' }
                    }}
                  >
                    <TableCell
                      sx={{
                        color: 'var(--text-primary)',
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        padding: '12px 16px',
                        fontWeight: 500,
                        '&:hover': {
                          color: 'var(--primary)',
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => handleCustomerClick(heatmapData.phoneMap[customer])}
                    >
                      <Box>
                        <Typography sx={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>
                          {heatmapData.customerNameMap[customer]}
                        </Typography>
                        <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem', mt: 0.5 }}>
                          {heatmapData.phoneMap[customer]}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--text-secondary)',
                        position: 'sticky',
                        left: 200,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 500
                      }}
                    >
                      {heatmapData.customerIdMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 320,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        textAlign: 'center'
                      }}
                    >
                      <Chip
                        label={heatmapData.newCustomerMap[customer]}
                        size="small"
                        sx={{
                          bgcolor: heatmapData.newCustomerMap[customer] === 'Yes' ? 'var(--success-soft)' : 'var(--surface-secondary)',
                          color: heatmapData.newCustomerMap[customer] === 'Yes' ? 'var(--success)' : 'var(--text-secondary)',
                          border: `1px solid ${heatmapData.newCustomerMap[customer] === 'Yes' ? 'var(--success)' : 'var(--border)'}`,
                          fontWeight: 600,
                          fontSize: '0.75rem'
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--text-secondary)',
                        position: 'sticky',
                        left: 420,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.practitionerMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--text-secondary)',
                        position: 'sticky',
                        left: 570,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.helperMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--text-secondary)',
                        position: 'sticky',
                        left: 720,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.sellerMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--success)',
                        position: 'sticky',
                        left: 870,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textAlign: 'right'
                      }}
                    >
                      {formatCurrency(heatmapData.paymentAmountMap[customer], currentClinic, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--text-secondary)',
                        position: 'sticky',
                        left: 990,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.paymentMethodMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--text-secondary)',
                        position: 'sticky',
                        left: 1120,
                        bgcolor: 'var(--surface)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        padding: '12px 16px',
                        fontSize: '0.85rem',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={heatmapData.paymentNoteMap[customer]}
                    >
                      {heatmapData.paymentNoteMap[customer]}
                    </TableCell>
                    {heatmapData.services.map((service) => {
                      const count = heatmapData.data[customer]?.[service] || 0;
                      return (
                        <TableCell
                          key={`${customer}-${service}`}
                          align="center"
                          sx={{
                            color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                            bgcolor: getHeatmapColor(count, maxValue),
                            borderBottom: '1px solid var(--border)',
                            padding: '12px 16px',
                            fontWeight: count > 0 ? 600 : 400,
                            fontSize: count > 0 ? '0.95rem' : '0.85rem',
                            transition: 'all 0.2s ease',
                            cursor: count > 0 ? 'pointer' : 'default',
                            '&:hover': count > 0 ? {
                              bgcolor: `color-mix(in srgb, var(--primary) ${Math.min(Math.round(((count / maxValue) * 0.9 + 0.3) * 100), 100)}%, transparent)`,
                              transform: 'scale(1.05)',
                              boxShadow: '0 0 0 2px var(--primary-soft)'
                            } : {}
                          }}
                        >
                          {count > 0 ? count : '-'}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!!filteredCustomers.length && (
          <TablePagination
            component="div"
            count={filteredCustomers.length}
            page={effectivePage}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => setRowsPerPage(Number(event.target.value))}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Customers"
          />
        )}
      </Paper>
      </Box>
    </LocalizationProvider>
  );
};

export default DailyReport;
