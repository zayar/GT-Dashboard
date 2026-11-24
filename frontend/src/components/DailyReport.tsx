import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  CircularProgress,
  Skeleton,
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
  Alert,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useClinic } from '../contexts/ClinicContext';
import { useBranchActivity } from '../hooks/useBiAccounting';
import { useReportSection } from '../hooks/useReportSection';
import { fetchWarehouseRows } from '../api/warehouseReport';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import { branchKey, branchDetailPath, readBranchRows, formatReportTotal, type BranchRow, type ReportBranch } from '../utils/reportBranches';
import { formatCurrencyAmount, getCurrency } from '../utils/currency';
import {
  buildCustomerServiceActivityQuery,
  CustomerServiceActivityPeriod,
  getCustomerServiceActivityRange,
} from '../utils/customerServiceActivity';
import { CANONICAL_SALES_METRICS } from '../utils/canonicalSalesMetrics';

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

const NO_ACTIVITY_ROWS: BranchRow<DailyReportData>[] = [];

interface DailyReportProps {
  rangeEnabled?: boolean;
}

const DailyReport: React.FC<DailyReportProps> = ({ rangeEnabled = false }) => {
  const navigate = useNavigate();
  const { currentClinic, reportBranches, loadingClinics } = useClinic();
  const [refresh, setRefresh] = useState(0);
  const fetchDailyData = () => setRefresh(value => value + 1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [period, setPeriod] = useState<CustomerServiceActivityPeriod>('week');
  const [periodDate, setPeriodDate] = useState<Date | null>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [customEndDate, setCustomEndDate] = useState<Date | null>(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
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

  const { startDateKey, endDateKey } = reportRange;
  const loadActivity = useCallback((signal: AbortSignal) => readBranchRows(reportBranches, signal, (clinic, requestSignal) =>
    fetchWarehouseRows<DailyReportData>(buildCustomerServiceActivityQuery({
      clinicCode: clinic.code, startDate: startDateKey, endDate: endDateKey,
    }), requestSignal)), [reportBranches, startDateKey, endDateKey]);
  const activity = useReportSection(reportBranches.length ? loadActivity : null, refresh);
  const accounting = useBranchActivity(reportBranches, reportRange.startDate, reportRange.endDate, refresh);
  const rawData = activity.data ?? NO_ACTIVITY_ROWS;
  const lastUpdated = activity.updatedAt ?? accounting.updatedAt;

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
      const customerKey = branchKey(record.BranchId, record.CustomerPhoneNumber?.trim() || record.CustomerId?.trim() || `${record.CustomerName}-${index}`);
      if (!uniqueCustomers.has(customerKey)) uniqueCustomers.set(customerKey, record);
      serviceCounts.set(record.ServiceName, (serviceCounts.get(record.ServiceName) || 0) + 1);
      if (record.PractitionerName) {
        const label = reportBranches.length > 1 ? `${record.PractitionerName} · ${record.Branch}` : record.PractitionerName;
        practitionerCounts.set(label, (practitionerCounts.get(label) || 0) + 1);
      }
    });

    const customerRecords = Array.from(uniqueCustomers.values());
    const topEntry = (counts: Map<string, number>) =>
      Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    const topService = topEntry(serviceCounts);
    const topPractitioner = topEntry(practitionerCounts);

    return {
      totalCustomers: uniqueCustomers.size,
      totalServices: uniqueServices.size,
      servicesDelivered: rawData.length,
      newCustomers: customerRecords.filter(record => record.IsNewCustomer === 'Yes').length,
      sellerAssignedCustomers: customerRecords.filter(record => record.SellerNames?.trim()).length,
      topService: topService ? { name: topService[0], count: topService[1] } : null,
      topPractitioner: topPractitioner ? { name: topPractitioner[0], count: topPractitioner[1] } : null
    };
  }, [rawData, reportBranches]);

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
    const branches: Record<string, ReportBranch> = {};
    const customerNameMap: { [customer: string]: string } = {};

    rawData.forEach((record, index) => {
      const customer = branchKey(record.BranchId, record.CustomerPhoneNumber?.trim() || record.CustomerId?.trim() || `${record.CustomerName}-${index}`);
      const service = record.ServiceName;
      branches[customer] = record;
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
      customerNameMap, branches,
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
        heatmapData.customerNameMap[customer], heatmapData.branches[customer].Branch,
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
  }, [deferredSearchTerm, reportBranches, reportRange.endDateKey, reportRange.startDateKey, rowsPerPage]);

  const lastPage = Math.max(0, Math.ceil(filteredCustomers.length / rowsPerPage) - 1);
  const effectivePage = Math.min(page, lastPage);
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice(effectivePage * rowsPerPage, effectivePage * rowsPerPage + rowsPerPage),
    [effectivePage, filteredCustomers, rowsPerPage]
  );

  const handleBack = () => {
    navigate(-1);
  };

  const handleCustomerClick = (phoneNumber: string, branchId: string) => {
    if (phoneNumber) navigate(branchDetailPath(`/customers/${encodeURIComponent(phoneNumber)}`, branchId));
  };

  const handleServiceClick = (serviceName: string, branchId: string) => {
    navigate(branchDetailPath(`/services/${encodeURIComponent(serviceName)}`, branchId));
  };

  const exportToExcel = () => {
    if (filteredCustomers.length === 0) {
      return;
    }

    // Prepare data for Excel export
    const exportData = filteredCustomers.map(customer => {
      const row: any = {
        'Customer Name': heatmapData.customerNameMap[customer],
        Branch: heatmapData.branches[customer].Branch,
        Currency: heatmapData.branches[customer].Currency,
        'Customer ID': heatmapData.customerIdMap[customer],
        'Phone Number': heatmapData.phoneMap[customer],
        'New Customer': heatmapData.newCustomerMap[customer],
        'Practitioner(s)': heatmapData.practitionerMap[customer],
        'Helper(s)': heatmapData.helperMap[customer],
        'Seller(s)': heatmapData.sellerMap[customer],
        'Visitor-linked Invoice Value': heatmapData.paymentAmountMap[customer] || 0,
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
      { wch: 26 }, // Branch
      { wch: 12 }, // Currency
      { wch: 15 }, // Customer ID
      { wch: 15 }, // Phone Number
      { wch: 15 }, // New Customer
      { wch: 25 }, // Practitioner(s)
      { wch: 25 }, // Helper(s)
      { wch: 25 }, // Seller(s)
      { wch: 22 }, // Visitor-linked Invoice Value
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
              aria-label="Refresh report"
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

      {!currentClinic && !loadingClinics && <Alert severity="info">Select a clinic to see its report.</Alert>}
      {[
        { label: 'Accounting metrics', ...accounting },
        { label: 'Customer service activity', ...activity },
      ].filter(section => section.error).map(section => (
        <Alert key={section.label} severity="warning" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={section.retry}>Retry</Button>}>
          {section.label} unavailable. {section.error}
        </Alert>
      ))}

      {/* Canonical accounting and operational summary */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          {
            label: CANONICAL_SALES_METRICS.grossSales.label,
            description: CANONICAL_SALES_METRICS.grossSales.description,
            pending: accounting.loading,
            value: accounting.data && formatReportTotal(accounting.data, row => row.grossSales, getCurrency(currentClinic)),
            detail: accounting.data && `${accounting.data.reduce((sum, row) => sum + row.invoiceCount, 0).toLocaleString()} invoices · ${CANONICAL_SALES_METRICS.grossSales.dateBasis}`
          },
          {
            label: CANONICAL_SALES_METRICS.paymentsReceived.label,
            description: CANONICAL_SALES_METRICS.paymentsReceived.description,
            pending: accounting.loading,
            value: accounting.data && formatReportTotal(accounting.data, row => row.paymentsReceived, getCurrency(currentClinic)),
            detail: accounting.data && `${accounting.data.reduce((sum, row) => sum + row.paymentCount, 0).toLocaleString()} payments · ${CANONICAL_SALES_METRICS.paymentsReceived.dateBasis}`
          },
          {
            label: reportBranches.length > 1 ? 'Customers served across branches' : 'Customers served',
            pending: activity.loading,
            value: activity.data && summary.totalCustomers.toLocaleString(),
            detail: activity.data && (reportBranches.length > 1 ? 'Counted once per customer at each branch' : `${summary.newCustomers} new customers`)
          },
          {
            label: 'Services delivered',
            pending: activity.loading,
            value: activity.data && summary.servicesDelivered.toLocaleString(),
            detail: activity.data && `${summary.totalServices} unique services`
          },
          {
            label: reportBranches.length > 1 ? 'New to the branch' : 'New customers',
            pending: activity.loading,
            value: activity.data && summary.newCustomers.toLocaleString(),
            detail: activity.data && `${summary.sellerAssignedCustomers} customers assigned to sellers`
          }
        ].map(card => (
          <Grid item xs={12} sm={6} lg={'description' in card ? 6 : 4} key={card.label}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <Typography title={'description' in card ? card.description : undefined} variant="body2" sx={{ color: 'var(--text-secondary)' }}>{card.label}</Typography>
              <Typography variant="h5" sx={{ color: 'var(--text-primary)', fontWeight: 700, mt: 1 }}>
                {loadingClinics || card.pending ? <Skeleton width="55%" /> : card.value ?? 'Unavailable'}
              </Typography>
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
              Visitor-linked invoice value, staff assignments, and service usage. Use Payments Received above for accounting collections.
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

        {loadingClinics || activity.loading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress aria-label="Loading customer service activity" /></Box>
        ) : !activity.data ? null : filteredCustomers.length === 0 ? (
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
                  <TableCell>Branch</TableCell>
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
                    Visitor-linked Invoice Value
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
                        cursor: reportBranches.length === 1 ? 'pointer' : 'default'
                      }}
                      onClick={reportBranches.length === 1 ? () => handleServiceClick(service, reportBranches[0].id) : undefined}
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
                      onClick={() => handleCustomerClick(heatmapData.phoneMap[customer], heatmapData.branches[customer].BranchId)}
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
                    <TableCell>{heatmapData.branches[customer].Branch}</TableCell>
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
                      {formatCurrencyAmount(heatmapData.paymentAmountMap[customer], heatmapData.branches[customer].Currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                          {count > 0
                            ? <Button size="small" onClick={() => handleServiceClick(service, heatmapData.branches[customer].BranchId)}
                                aria-label={`${service} at ${heatmapData.branches[customer].Branch}`}>{count}</Button>
                            : '-'}
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
