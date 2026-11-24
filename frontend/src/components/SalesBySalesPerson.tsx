import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Select,
  MenuItem,
  SelectChangeEvent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  FormControl,
  InputLabel,
  OutlinedInput,
  Button,
  Chip
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { useReportSection } from '../hooks/useReportSection';
import { branchDetailPath, branchKey, formatReportTotal, labelBranchRows, readBranchReports } from '../utils/reportBranches';
import { formatCurrencyAmount, getCurrency } from '../utils/currency';
import {
  buildSalesBySalesPersonTransactions,
  filterReportableSalesTransactions,
  SalesPersonSummary,
  summarizeSalesBySalesPerson,
} from '../utils/salesBySalesPerson';
import {
  fetchOutstandingReportRecords,
  fetchSalesDetailRecords,
} from '../api/apicoreSalesReports';


const SalesBySalesPerson: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic, reportBranches } = useClinic();
  const { getAccessToken } = useAuth();
  const [timePeriod, setTimePeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [transactionsRowsPerPage, setTransactionsRowsPerPage] = useState(10);
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  const load = useCallback(async (signal: AbortSignal) => {
    // Create date ranges based on selected time period
    let queryStartDate = new Date();
    let queryEndDate = new Date();

    switch (timePeriod) {
      case 'daily':
        // Today
        queryStartDate.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        // Last 7 days
        queryStartDate.setDate(queryStartDate.getDate() - 7);
        break;
      case 'monthly':
        // Last 30 days
        queryStartDate.setDate(queryStartDate.getDate() - 30);
        break;
      case 'custom':
        // Use custom date range
        if (startDate && endDate) {
          queryStartDate = new Date(startDate);
          queryEndDate = new Date(endDate);
          queryEndDate.setHours(23, 59, 59, 999); // End of the day
        }
        break;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    return readBranchReports(reportBranches, signal, async (clinic, requestSignal) => {
      const [sales, outstanding] = await Promise.all([
        fetchSalesDetailRecords({ clinicId: clinic.id, filterType: 'day', startDate: queryStartDate,
          endDate: queryEndDate, selectedDate: null, accessToken, signal: requestSignal }),
        fetchOutstandingReportRecords({ clinicId: clinic.id, asOfDate: queryEndDate, accessToken, signal: requestSignal }),
      ]);
      const invoices = filterReportableSalesTransactions(buildSalesBySalesPersonTransactions(sales, outstanding));
      return { invoices: labelBranchRows(clinic, invoices), sellers: labelBranchRows(clinic, summarizeSalesBySalesPerson(invoices)) };
    });
  }, [timePeriod, startDate, endDate, reportBranches, getAccessToken]);

  const { data, loading, error, retry: fetchSalesData } = useReportSection(reportBranches.length ? load : null, 0, null);
  const transactions = useMemo(() => (data ?? []).flatMap(branch => branch.invoices)
    .sort((a, b) => b.Date.localeCompare(a.Date)), [data]);
  const salesBySalesPerson = useMemo(() => (data ?? []).flatMap(branch => branch.sellers), [data]);
  const filteredTransactions = useMemo(() => selectedSeller
    ? transactions.filter(row => branchKey(row.BranchId, row.SellerName || 'Unknown') === selectedSeller)
    : transactions, [selectedSeller, transactions]);
  useEffect(() => { setSelectedSeller(''); setTransactionsPage(0); }, [load]);

  // Handle time period change
  const handleTimePeriodChange = (event: SelectChangeEvent<'daily' | 'weekly' | 'monthly' | 'custom'>) => {
    setTimePeriod(event.target.value as 'daily' | 'weekly' | 'monthly' | 'custom');
    setTransactionsPage(0); // Reset page on filter change
  };

  const totalTransactions = transactions.length;
  const total = (field: Exclude<keyof SalesPersonSummary, 'salesPerson'>) =>
    formatReportTotal(salesBySalesPerson, row => row[field], getCurrency(currentClinic));

  // Function to export Sales Summary to Excel
  const exportSalesToExcel = () => {
    if (salesBySalesPerson.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // Create data rows including the total row
    const rows = [
      ...salesBySalesPerson.map(person => ({
        'Sales Person': person.salesPerson,
        Branch: person.Branch, Currency: person.Currency,
        'Invoice Count': person.transactionCount,
        'Paid Sales': person.paidSales,
        'Partial Collected': person.partialPaidSales,
        'Partial Outstanding': person.partialOutstandingSales,
        'Unpaid Sales': person.unpaidSales,
        'Gross Sales': person.totalAmount
      })),
      ...Array.from(new Set(salesBySalesPerson.map(person => person.Currency))).map(currency => {
        const sellers = salesBySalesPerson.filter(person => person.Currency === currency);
        const sum = (field: Exclude<keyof SalesPersonSummary, 'salesPerson'>) =>
          sellers.reduce((value, person) => value + person[field], 0);
        return {
          'Sales Person': 'Total', Branch: '', Currency: currency, 'Invoice Count': sum('transactionCount'),
          'Paid Sales': sum('paidSales'), 'Partial Collected': sum('partialPaidSales'),
          'Partial Outstanding': sum('partialOutstandingSales'), 'Unpaid Sales': sum('unpaidSales'), 'Gross Sales': sum('totalAmount'),
        };
      }),
    ];

    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    const colWidths = [
      { wch: 25 }, // Sales Person
      { wch: 25 }, // Branch
      { wch: 12 }, // Currency
      { wch: 15 }, // Invoice Count
      { wch: 20 }, // Paid Sales
      { wch: 20 }, // Partial Collected
      { wch: 20 }, // Partial Outstanding
      { wch: 20 }, // Unpaid Sales
      { wch: 20 }, // Gross Sales
    ];
    worksheet['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Summary');

    // Generate filename with current date
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const fileName = `sales_summary_${dateStr}.xlsx`;

    // Export file
    XLSX.writeFile(workbook, fileName);
  };

  // Function to export Transactions to Excel
  const exportTransactionsToExcel = () => {
    if (filteredTransactions.length === 0) return;

    const workbook = XLSX.utils.book_new();

    // Format data for Excel
    const rows = filteredTransactions.map(transaction => ({
      'Date': transaction.Date,
      'Sales Person': transaction.SellerName || '-',
      Branch: transaction.Branch, Currency: transaction.Currency,
      'Invoice': transaction.InvoiceNumber,
      'Customer Name': transaction.CustomerName,
      'Service': transaction.ServiceName,
      'Package': transaction.ServicePackageName || '-',
      'Payment Method': transaction.PaymentMethod,
      'Status': transaction.PaymentStatus,
      'Gross Sale': Number(transaction.SalesAmount),
      'Cash Received': Number(transaction.AmountPaid),
      'Outstanding': Number(transaction.OutstandingAmount)
    }));

    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    const colWidths = [
      { wch: 12 }, // Date
      { wch: 20 }, // Sales Person
      { wch: 25 }, // Branch
      { wch: 12 }, // Currency
      { wch: 15 }, // Invoice
      { wch: 25 }, // Customer Name
      { wch: 25 }, // Service
      { wch: 20 }, // Package
      { wch: 15 }, // Payment Method
      { wch: 10 }, // Status
      { wch: 15 }, // Gross Sale
      { wch: 15 }, // Cash Received
      { wch: 15 }, // Outstanding
    ];
    worksheet['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detailed Transactions');

    // Generate filename with current date
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const fileName = `transactions_${dateStr}.xlsx`;

    // Export file
    XLSX.writeFile(workbook, fileName);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'var(--surface)' }}>
        <CircularProgress sx={{ color: 'var(--primary)' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: '1200px', margin: '0 auto', bgcolor: 'var(--surface)', minHeight: '100vh' }}>
        <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: '8px', mb: 3 }}>
          <Typography variant="h5" sx={{ color: 'var(--text-primary)', mb: 2 }}>
            Error Loading Sales Data
          </Typography>
          <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>
            {error}
          </Typography>
          {error !== 'Please select a clinic first.' && (
          <Box sx={{ mt: 3 }}>
            <button
              onClick={() => fetchSalesData()}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md shadow-md"
            >
              Retry
            </button>
          </Box>
          )}
        </Paper>
      </Box>
    );
  }

  const getDateRangeLabel = () => {
    const formatDateDisplay = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    switch (timePeriod) {
      case 'daily':
        return 'Today';
      case 'weekly':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return `${formatDateDisplay(weekAgo)} - ${formatDateDisplay(new Date())}`;
      case 'monthly':
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        return `${formatDateDisplay(monthAgo)} - ${formatDateDisplay(new Date())}`;
      case 'custom':
        if (startDate && endDate) {
          return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
        }
        return 'Custom Range';
      default:
        return '';
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: '1200px', margin: '0 auto', bgcolor: 'var(--surface)', minHeight: '100vh' }}>
      {/* Page header */}
      <Typography variant="h4" sx={{ mb: 3, color: 'var(--text-primary)', fontWeight: 'bold' }}>
        Sales by Sales Person
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: '8px', mb: 4 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          <Box sx={{ minWidth: 200 }}>
            <FormControl fullWidth variant="outlined" size="small">
              <InputLabel id="time-period-label" sx={{ color: 'var(--text-secondary)' }}>Time Period</InputLabel>
              <Select
                labelId="time-period-label"
                value={timePeriod}
                onChange={handleTimePeriodChange}
                input={<OutlinedInput label="Time Period" />}
                sx={{
                  bgcolor: 'var(--surface)',
                  color: 'var(--text-primary)',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' }
                }}
              >
                <MenuItem value="daily" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>Today</MenuItem>
                <MenuItem value="weekly" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>Last 7 Days</MenuItem>
                <MenuItem value="monthly" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>Last 30 Days</MenuItem>
                <MenuItem value="custom" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>Custom Range</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {timePeriod === 'custom' && (
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(newValue) => setStartDate(newValue)}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        bgcolor: 'var(--surface)',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                        '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                        '& .MuiInputBase-input': { color: 'var(--text-primary)' },
                        width: '160px'
                      }
                    }
                  }}
                />
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        bgcolor: 'var(--surface)',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                        '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                        '& .MuiInputBase-input': { color: 'var(--text-primary)' },
                        width: '160px'
                      }
                    }
                  }}
                />
                <button
                  onClick={() => fetchSalesData()}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded-md shadow-md"
                >
                  Apply
                </button>
              </Box>
            </LocalizationProvider>
          )}
        </Box>

        {/* Date range display */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            Showing data for: <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{getDateRangeLabel()}</span>
          </Typography>

          <Box>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', display: 'inline' }}>
              Gross Sales: <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{total('totalAmount')}</span>
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', display: 'inline', ml: 3 }}>
              Invoices: <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{totalTransactions}</span>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {!loading && !error && (!transactions.length || !salesBySalesPerson.length) && (
        <Box
          sx={{
            p: 3,
            bgcolor: 'var(--surface)',
            borderRadius: 2,
            textAlign: 'center',
            mb: 2,
            border: '1px solid var(--border)'
          }}
        >
          <Typography variant="body1" color="var(--text-secondary)">
            No sales data available for the selected time period.
          </Typography>
        </Box>
      )}

      {!loading && !error && transactions.length > 0 && salesBySalesPerson.length > 0 && (
        <>
          {/* Sales Summary by Sales Person */}
          <Paper elevation={0} sx={{ p: 3, bgcolor: 'var(--surface)', mb: 3, borderRadius: '8px', border: '1px solid var(--border)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" color="var(--text-primary)">Sales Summary</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.5 }}>
                  Gross invoice sales by order date, reconciled as of the report end date. Partial Collected plus Partial Outstanding equals the full value of partial-paid invoices.
                </Typography>
              </Box>
              <Button
                onClick={exportSalesToExcel}
                variant="contained"
                size="small"
                sx={{
                  bgcolor: 'var(--primary)',
                  '&:hover': { bgcolor: 'var(--primary-hover)' },
                  textTransform: 'none',
                  px: 2
                }}
              >
                Export to Excel
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }}>Sales Person</TableCell>
                    <TableCell>Branch</TableCell>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }} align="center">Invoice Count</TableCell>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }} align="right">Paid Sales</TableCell>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }} align="right">Partial Collected</TableCell>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }} align="right">Partial Outstanding</TableCell>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }} align="right">Unpaid</TableCell>
                    <TableCell sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }} align="right">Gross Sales</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {salesBySalesPerson.map(salesPerson => (
                    <TableRow key={branchKey(salesPerson.BranchId, salesPerson.salesPerson)} sx={{
                      '&:hover': {
                        bgcolor: 'var(--surface-secondary)',
                      },
                      bgcolor: 'var(--surface-secondary)',
                      '&:nth-of-type(odd)': {
                        bgcolor: 'var(--background)',
                      },
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer'
                    }} onClick={() => {
                      setSelectedSeller(branchKey(salesPerson.BranchId, salesPerson.salesPerson));
                      setTransactionsPage(0);
                    }}>
                      <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                        {salesPerson.salesPerson}
                      </TableCell>
                      <TableCell>{salesPerson.Branch}</TableCell>
                      <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }} align="center">
                        {salesPerson.transactionCount}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }} align="right">
                        {formatCurrencyAmount(salesPerson.paidSales, salesPerson.Currency)}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--warning)', borderBottom: '1px solid var(--border)' }} align="right">
                        {formatCurrencyAmount(salesPerson.partialPaidSales, salesPerson.Currency)}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--warning)', borderBottom: '1px solid var(--border)' }} align="right">
                        {formatCurrencyAmount(salesPerson.partialOutstandingSales, salesPerson.Currency)}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--error)', borderBottom: '1px solid var(--border)' }} align="right">
                        {formatCurrencyAmount(salesPerson.unpaidSales, salesPerson.Currency)}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontWeight: 600 }} align="right">
                        {formatCurrencyAmount(salesPerson.totalAmount, salesPerson.Currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total row */}
                  <TableRow sx={{ bgcolor: 'var(--surface)', fontWeight: 'bold' }}>
                    <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>
                      Total
                    </TableCell>
                    <TableCell />
                    <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }} align="center">
                      {totalTransactions}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }} align="right">
                      {total('paidSales')}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--warning)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }} align="right">
                      {total('partialPaidSales')}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--warning)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }} align="right">
                      {total('partialOutstandingSales')}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--error)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }} align="right">
                      {total('unpaidSales')}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }} align="right">
                      {total('totalAmount')}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Detailed Transactions Table */}
          <Paper elevation={0} sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" color="var(--text-primary)">Detailed Transactions</Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
              {filteredTransactions.length !== transactions.length && (
                <button
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded"
                  onClick={() => {
                    setSelectedSeller('');
                    setTransactionsPage(0);
                  }}
                >
                  Show All
                </button>
              )}
                <Button
                  onClick={exportTransactionsToExcel}
                  variant="contained"
                  size="small"
                  sx={{
                    bgcolor: 'var(--primary)',
                    '&:hover': { bgcolor: 'var(--primary-hover)' },
                    textTransform: 'none',
                    px: 2
                  }}
                >
                  Export to Excel
                </Button>
              </Box>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <TableContainer sx={{
                bgcolor: 'var(--surface)',
                border: '1px solid var(--border)',
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
                },
              }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Date</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Sales Person</TableCell>
                    <TableCell>Branch</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Invoice</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Customer Name</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Service</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Package</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Payment Method</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }}>Status</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }} align="right">Gross Sale</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }} align="right">Cash Received</TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)'
                      }} align="right">Outstanding</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTransactions
                      .slice(
                        transactionsPage * transactionsRowsPerPage,
                        transactionsPage * transactionsRowsPerPage + transactionsRowsPerPage
                      )
                      .map((transaction, index) => (
                        <TableRow key={`${transaction.BranchId}-${transaction.InvoiceNumber}-${index}`} sx={{
                          '&:hover': {
                            bgcolor: 'var(--surface-secondary)',
                          },
                          bgcolor: 'var(--surface-secondary)',
                          '&:nth-of-type(odd)': {
                            bgcolor: 'var(--background)',
                          },
                          borderBottom: '1px solid var(--border)'
                        }}>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{transaction.Date}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{transaction.SellerName || '-'}</TableCell>
                          <TableCell>{transaction.Branch}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{transaction.InvoiceNumber}</TableCell>
                          <TableCell
                            sx={{
                              color: 'var(--primary)',
                              borderBottom: '1px solid var(--border)',
                              cursor: 'pointer',
                              '&:hover': {
                                textDecoration: 'underline'
                              }
                            }}
                            onClick={() => transaction.CustomerPhoneNumber && navigate(branchDetailPath(`/customers/${encodeURIComponent(transaction.CustomerPhoneNumber)}`, transaction.BranchId))}
                          >
                            {transaction.CustomerName}
                          </TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{transaction.ServiceName}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{transaction.ServicePackageName || '-'}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{transaction.PaymentMethod}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                            <Chip
                              label={transaction.PaymentStatus || 'UNKNOWN'}
                              size="small"
                              color={transaction.PaymentStatus === 'PAID'
                                ? 'success'
                                : transaction.PaymentStatus === 'PARTIAL_PAID'
                                  ? 'warning'
                                  : transaction.PaymentStatus === 'UNPAID'
                                    ? 'error'
                                    : 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }} align="right">
                            {formatCurrencyAmount(Number(transaction.SalesAmount), transaction.Currency)}
                          </TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }} align="right">
                            {formatCurrencyAmount(Number(transaction.AmountPaid), transaction.Currency)}
                          </TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }} align="right">
                            {formatCurrencyAmount(Number(transaction.OutstandingAmount), transaction.Currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Pagination */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
                <Select
                  value={transactionsRowsPerPage}
                  onChange={(e) => {
                    setTransactionsRowsPerPage(Number(e.target.value));
                    setTransactionsPage(0);
                  }}
                  sx={{
                    color: 'var(--text-primary)',
                    bgcolor: 'var(--surface)',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-muted)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' }
                  }}
                  size="small"
                >
                  <MenuItem value={5} sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>5 per page</MenuItem>
                  <MenuItem value={10} sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>10 per page</MenuItem>
                  <MenuItem value={25} sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>25 per page</MenuItem>
                </Select>
                <Pagination
                  count={Math.ceil(filteredTransactions.length / transactionsRowsPerPage)}
                  page={transactionsPage + 1}
                  onChange={(_, newPage) => setTransactionsPage(newPage - 1)}
                  sx={{
                    '& .MuiPaginationItem-root': {
                      color: 'var(--text-secondary)',
                    },
                    '& .MuiPaginationItem-root.Mui-selected': {
                      bgcolor: 'var(--primary)',
                      color: 'var(--text-primary)',
                      '&:hover': {
                        bgcolor: 'var(--primary-hover)'
                      }
                    }
                  }}
                />
              </Box>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default SalesBySalesPerson;
