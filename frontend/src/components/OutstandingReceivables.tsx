import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  CreditReceivedRecord,
  fetchOutstandingReceivablesReport,
  OutstandingAgingBucket,
  OutstandingPaymentStatus,
  OutstandingReportRecord,
} from '../api/apicoreSalesReports';
import { useAuth } from '../contexts/AuthContext';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency } from '../utils/currency';
import {
  buildAgingBreakdown,
  buildOutstandingBreakdown,
  filterOutstandingRecords,
  OUTSTANDING_AGING_BUCKETS,
  summarizeOutstandingRecords,
} from '../utils/outstandingReport';

const cardStyles = {
  p: 2.5,
  bgcolor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 2,
  minWidth: 0,
};

const headerCellStyles = {
  color: 'var(--text-secondary)',
  bgcolor: 'var(--surface-secondary)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const bodyCellStyles = {
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)',
};

const OutstandingReceivables: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const { getAccessToken } = useAuth();
  const [asOfDate, setAsOfDate] = useState<Date | null>(new Date());
  const [appliedAsOfDate, setAppliedAsOfDate] = useState<Date>(new Date());
  const [records, setRecords] = useState<OutstandingReportRecord[]>([]);
  const [creditReceivedRecords, setCreditReceivedRecords] = useState<CreditReceivedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [salesPerson, setSalesPerson] = useState('ALL');
  const [paymentStatus, setPaymentStatus] = useState<'ALL' | OutstandingPaymentStatus>('ALL');
  const [agingBucket, setAgingBucket] = useState<'ALL' | OutstandingAgingBucket>('ALL');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const fetchOutstanding = useCallback(async () => {
    if (!currentClinic) {
      setError('Please select a clinic first.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const result = await fetchOutstandingReceivablesReport({
        clinicId: currentClinic.id,
        asOfDate: appliedAsOfDate,
        accessToken,
      });
      setRecords(result.outstandingRecords);
      setCreditReceivedRecords(result.creditReceivedRecords);
    } catch (fetchError: any) {
      console.error('Error fetching outstanding receivables:', fetchError);
      setError(`Failed to load outstanding receivables: ${fetchError.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [appliedAsOfDate, currentClinic, getAccessToken]);

  useEffect(() => {
    fetchOutstanding();
  }, [fetchOutstanding]);

  const salesPeople = useMemo(() => Array.from(new Set(
    records.map((record) => record.SalePerson),
  )).sort(), [records]);

  const filteredRecords = useMemo(() => filterOutstandingRecords(records, {
    search,
    salesPerson,
    paymentStatus,
    agingBucket,
  }), [agingBucket, paymentStatus, records, salesPerson, search]);

  useEffect(() => {
    setPage(0);
  }, [search, salesPerson, paymentStatus, agingBucket]);

  const totals = useMemo(
    () => summarizeOutstandingRecords(filteredRecords),
    [filteredRecords],
  );
  const agingSummary = useMemo(
    () => buildAgingBreakdown(filteredRecords),
    [filteredRecords],
  );
  const salespersonSummary = useMemo(
    () => buildOutstandingBreakdown(filteredRecords, (record) => record.SalePerson),
    [filteredRecords],
  );
  const customerSummary = useMemo(
    () => buildOutstandingBreakdown(filteredRecords, (record) => record.CustomerName),
    [filteredRecords],
  );
  const largestAgingAmount = Math.max(
    ...agingSummary.map((entry) => entry.outstandingBalance),
    1,
  );
  const creditReceivedTotal = creditReceivedRecords.reduce(
    (total, record) => total + record.PaymentAmount,
    0,
  );

  const exportToExcel = () => {
    if (!filteredRecords.length && !creditReceivedRecords.length) return;

    const workbook = XLSX.utils.book_new();
    const invoiceRows = filteredRecords.map((record) => ({
      'Order Date': record.OrderDate,
      Invoice: record.InvoiceNumber,
      Customer: record.CustomerName,
      Phone: record.CustomerPhoneNumber,
      'Member ID': record.MemberId,
      Salesperson: record.SalePerson,
      Services: record.ServiceName,
      'Invoice Total': record.InvoiceTotal,
      'Amount Paid': record.AmountPaid,
      'Outstanding Balance': record.OutstandingBalance,
      Status: record.PaymentStatus,
      'Age (Days)': record.AgeDays,
      'Aging Bucket': record.AgingBucket,
      'Last Payment Date': record.LastPaymentDate,
      'Payment Methods': record.PaymentMethods,
    }));
    const creditReceivedRows = creditReceivedRecords.map((record) => ({
      'Received Date': record.ReceivedDate,
      'Invoice Date': record.InvoiceDate,
      Invoice: record.InvoiceNumber,
      Customer: record.CustomerName,
      Phone: record.CustomerPhoneNumber,
      'Member ID': record.MemberId,
      Salesperson: record.SalePerson,
      'Payment Method': record.PaymentMethod,
      'Credit Received': record.PaymentAmount,
      'Balance After Payment': record.BalanceAfterPayment,
      'Payment Note': record.PaymentNote,
    }));
    const addSheet = (name: string, rows: object[], widths: number[]) => {
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!cols'] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };

    addSheet('Outstanding Invoices', invoiceRows, [13, 16, 25, 16, 14, 20, 35, 18, 18, 22, 16, 12, 14, 18, 22]);
    addSheet('Credit Received', creditReceivedRows, [15, 15, 18, 25, 16, 14, 20, 18, 20, 23, 28]);
    addSheet('By Salesperson', salespersonSummary.map((entry) => ({
      Salesperson: entry.label,
      'Invoice Count': entry.invoiceCount,
      'Outstanding Balance': entry.outstandingBalance,
    })), [24, 16, 22]);
    addSheet('By Customer', customerSummary.map((entry) => ({
      Customer: entry.label,
      'Invoice Count': entry.invoiceCount,
      'Outstanding Balance': entry.outstandingBalance,
    })), [30, 16, 22]);
    addSheet('Aging', agingSummary.map((entry) => ({
      'Aging Bucket': `${entry.label} days`,
      'Invoice Count': entry.invoiceCount,
      'Outstanding Balance': entry.outstandingBalance,
    })), [18, 16, 22]);

    XLSX.writeFile(
      workbook,
      `outstanding_receivables_as_of_${format(appliedAsOfDate, 'yyyy-MM-dd')}.xlsx`,
    );
  };

  const clearFilters = () => {
    setSearch('');
    setSalesPerson('ALL');
    setPaymentStatus('ALL');
    setAgingBucket('ALL');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
        <CircularProgress sx={{ color: 'var(--primary)' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
        <Paper sx={{ ...cardStyles, p: 3 }}>
          <Typography variant="h5" sx={{ color: 'var(--text-primary)', mb: 1 }}>
            Error Loading Outstanding Receivables
          </Typography>
          <Typography sx={{ color: 'var(--text-secondary)', mb: 2 }}>{error}</Typography>
          {error !== 'Please select a clinic first.' && (
            <Button variant="contained" onClick={fetchOutstanding}>Retry</Button>
          )}
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto', minHeight: '100vh' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          Outstanding Receivables
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.75 }}>
          Invoice balances and later credit collections as of the selected date. Aging is based on the invoice date because contractual due dates are not available.
        </Typography>
      </Box>

      <Paper sx={{ ...cardStyles, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="As-of Date"
              value={asOfDate}
              maxDate={new Date()}
              onChange={setAsOfDate}
              slotProps={{ textField: { size: 'small', sx: { width: 180 } } }}
            />
          </LocalizationProvider>
          <Button
            variant="contained"
            disabled={!asOfDate}
            onClick={() => asOfDate && setAppliedAsOfDate(new Date(asOfDate))}
            sx={{ textTransform: 'none' }}
          >
            Apply
          </Button>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            Snapshot: <strong>{format(appliedAsOfDate, 'MMM d, yyyy')}</strong>
          </Typography>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 2, mb: 3 }}>
        {[
          ['Total Outstanding', totals.outstandingBalance, 'primary'],
          ['Partial-paid Balance', totals.partialPaidBalance, 'warning'],
          ['Unpaid Balance', totals.unpaidBalance, 'error'],
          ['Outstanding Invoices', totals.invoiceCount, 'text-primary'],
          ['30+ Days Outstanding', totals.agedOver30Balance, 'error'],
        ].map(([label, value, color]) => (
          <Paper key={String(label)} sx={cardStyles}>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1 }}>{label}</Typography>
            <Typography variant="h5" sx={{ color: `var(--${color})`, fontWeight: 700 }}>
              {label === 'Outstanding Invoices'
                ? Number(value).toLocaleString('en-US')
                : formatCurrency(Number(value), currentClinic)}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper sx={{ ...cardStyles, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>Credit Received</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.5 }}>
              Payments collected on {format(appliedAsOfDate, 'MMM d, yyyy')} against invoices from an earlier date.
            </Typography>
          </Box>
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="h5" sx={{ color: 'var(--success)', fontWeight: 700 }}>
              {formatCurrency(creditReceivedTotal, currentClinic)}
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              {creditReceivedRecords.length.toLocaleString('en-US')} payment{creditReceivedRecords.length === 1 ? '' : 's'}
            </Typography>
          </Box>
        </Box>

        <TableContainer sx={{ border: '1px solid var(--border)', maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow>
              <TableCell sx={headerCellStyles}>Received Date</TableCell>
              <TableCell sx={headerCellStyles}>Invoice Date</TableCell>
              <TableCell sx={headerCellStyles}>Invoice</TableCell>
              <TableCell sx={headerCellStyles}>Customer</TableCell>
              <TableCell sx={headerCellStyles}>Salesperson</TableCell>
              <TableCell sx={headerCellStyles}>Method</TableCell>
              <TableCell sx={headerCellStyles} align="right">Credit Received</TableCell>
              <TableCell sx={headerCellStyles} align="right">Balance After Payment</TableCell>
              <TableCell sx={headerCellStyles}>Invoice Status</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {creditReceivedRecords.map((record) => (
                <TableRow key={record.ReceiptId} hover>
                  <TableCell sx={bodyCellStyles}>{record.ReceivedDate}</TableCell>
                  <TableCell sx={bodyCellStyles}>{record.InvoiceDate}</TableCell>
                  <TableCell sx={{ ...bodyCellStyles, color: 'var(--text-primary)', fontWeight: 600 }}>{record.InvoiceNumber}</TableCell>
                  <TableCell
                    sx={{ ...bodyCellStyles, color: 'var(--primary)', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    onClick={() => navigate(`/customers/${encodeURIComponent(record.CustomerPhoneNumber || record.CustomerName)}`)}
                  >
                    {record.CustomerName || '-'}
                  </TableCell>
                  <TableCell sx={bodyCellStyles}>{record.SalePerson}</TableCell>
                  <TableCell sx={bodyCellStyles}>{record.PaymentMethod}</TableCell>
                  <TableCell sx={{ ...bodyCellStyles, color: 'var(--success)', fontWeight: 700 }} align="right">
                    {formatCurrency(record.PaymentAmount, currentClinic)}
                  </TableCell>
                  <TableCell sx={bodyCellStyles} align="right">
                    {formatCurrency(record.BalanceAfterPayment, currentClinic)}
                  </TableCell>
                  <TableCell sx={bodyCellStyles}>
                    <Chip
                      label={record.BalanceAfterPayment > 0 ? 'STILL OUTSTANDING' : 'PAID'}
                      color={record.BalanceAfterPayment > 0 ? 'warning' : 'success'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
              {!creditReceivedRecords.length && (
                <TableRow><TableCell colSpan={9} align="center" sx={{ ...bodyCellStyles, py: 4 }}>
                  No credit was received against earlier invoices on this date.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3, mb: 3 }}>
        <Paper sx={{ ...cardStyles, p: 3 }}>
          <Typography variant="h6" sx={{ color: 'var(--text-primary)', mb: 2 }}>Aging Summary</Typography>
          {agingSummary.map((entry) => (
            <Box key={entry.label} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  {entry.label} days · {entry.invoiceCount} invoices
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {formatCurrency(entry.outstandingBalance, currentClinic)}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(entry.outstandingBalance / largestAgingAmount) * 100}
                sx={{ height: 8, borderRadius: 4, bgcolor: 'var(--surface-secondary)' }}
              />
            </Box>
          ))}
        </Paper>

        <Paper sx={{ ...cardStyles, p: 3 }}>
          <Typography variant="h6" sx={{ color: 'var(--text-primary)', mb: 2 }}>Outstanding by Salesperson</Typography>
          <TableContainer sx={{ maxHeight: 260 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell sx={headerCellStyles}>Salesperson</TableCell>
                <TableCell sx={headerCellStyles} align="center">Invoices</TableCell>
                <TableCell sx={headerCellStyles} align="right">Outstanding</TableCell>
              </TableRow></TableHead>
              <TableBody>{salespersonSummary.map((entry) => (
                <TableRow
                  key={entry.label}
                  hover
                  onClick={() => setSalesPerson(entry.label)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={bodyCellStyles}>{entry.label}</TableCell>
                  <TableCell sx={bodyCellStyles} align="center">{entry.invoiceCount}</TableCell>
                  <TableCell sx={bodyCellStyles} align="right">{formatCurrency(entry.outstandingBalance, currentClinic)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      <Paper sx={{ ...cardStyles, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>Top Outstanding Customers</Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>Top 10 by balance</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell sx={headerCellStyles}>Customer</TableCell>
              <TableCell sx={headerCellStyles} align="center">Invoices</TableCell>
              <TableCell sx={headerCellStyles} align="right">Outstanding</TableCell>
            </TableRow></TableHead>
            <TableBody>{customerSummary.slice(0, 10).map((entry) => (
              <TableRow key={entry.label} hover>
                <TableCell sx={bodyCellStyles}>{entry.label}</TableCell>
                <TableCell sx={bodyCellStyles} align="center">{entry.invoiceCount}</TableCell>
                <TableCell sx={bodyCellStyles} align="right">{formatCurrency(entry.outstandingBalance, currentClinic)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ ...cardStyles, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>Outstanding Invoices</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.5 }}>
              {filteredRecords.length.toLocaleString('en-US')} invoices · {formatCurrency(totals.outstandingBalance, currentClinic)} outstanding
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={exportToExcel}
            disabled={!filteredRecords.length && !creditReceivedRecords.length}
            sx={{ textTransform: 'none' }}
          >
            Export to Excel
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 2fr) repeat(3, minmax(150px, 1fr)) auto' }, gap: 1.5, mb: 2 }}>
          <TextField
            label="Search invoice or customer"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FormControl size="small">
            <InputLabel>Salesperson</InputLabel>
            <Select value={salesPerson} label="Salesperson" onChange={(event) => setSalesPerson(event.target.value)}>
              <MenuItem value="ALL">All salespeople</MenuItem>
              {salesPeople.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Status</InputLabel>
            <Select
              value={paymentStatus}
              label="Status"
              onChange={(event) => setPaymentStatus(event.target.value as 'ALL' | OutstandingPaymentStatus)}
            >
              <MenuItem value="ALL">All statuses</MenuItem>
              <MenuItem value="PARTIAL_PAID">Partial paid</MenuItem>
              <MenuItem value="UNPAID">Unpaid</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Aging</InputLabel>
            <Select
              value={agingBucket}
              label="Aging"
              onChange={(event) => setAgingBucket(event.target.value as 'ALL' | OutstandingAgingBucket)}
            >
              <MenuItem value="ALL">All aging</MenuItem>
              {OUTSTANDING_AGING_BUCKETS.map((bucket) => (
                <MenuItem key={bucket} value={bucket}>{bucket} days</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={clearFilters} sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}>Clear</Button>
        </Box>

        <TableContainer sx={{ border: '1px solid var(--border)', maxHeight: 620 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow>
              <TableCell sx={headerCellStyles}>Order Date</TableCell>
              <TableCell sx={headerCellStyles}>Invoice</TableCell>
              <TableCell sx={headerCellStyles}>Customer</TableCell>
              <TableCell sx={headerCellStyles}>Salesperson</TableCell>
              <TableCell sx={headerCellStyles} align="right">Invoice Total</TableCell>
              <TableCell sx={headerCellStyles} align="right">Paid</TableCell>
              <TableCell sx={headerCellStyles} align="right">Outstanding</TableCell>
              <TableCell sx={headerCellStyles}>Status</TableCell>
              <TableCell sx={headerCellStyles} align="center">Age</TableCell>
              <TableCell sx={headerCellStyles}>Last Payment</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {filteredRecords
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((record) => (
                  <TableRow key={record.InvoiceNumber} hover>
                    <TableCell sx={bodyCellStyles}>{record.OrderDate}</TableCell>
                    <TableCell sx={{ ...bodyCellStyles, color: 'var(--text-primary)', fontWeight: 600 }}>{record.InvoiceNumber}</TableCell>
                    <TableCell
                      sx={{ ...bodyCellStyles, color: 'var(--primary)', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => navigate(`/customers/${encodeURIComponent(record.CustomerPhoneNumber || record.CustomerName)}`)}
                    >
                      {record.CustomerName || '-'}
                    </TableCell>
                    <TableCell sx={bodyCellStyles}>{record.SalePerson}</TableCell>
                    <TableCell sx={bodyCellStyles} align="right">{formatCurrency(record.InvoiceTotal, currentClinic)}</TableCell>
                    <TableCell sx={bodyCellStyles} align="right">{formatCurrency(record.AmountPaid, currentClinic)}</TableCell>
                    <TableCell sx={{ ...bodyCellStyles, color: 'var(--error)', fontWeight: 600 }} align="right">
                      {formatCurrency(record.OutstandingBalance, currentClinic)}
                    </TableCell>
                    <TableCell sx={bodyCellStyles}>
                      <Chip
                        label={record.PaymentStatus === 'PARTIAL_PAID' ? 'PARTIAL PAID' : 'UNPAID'}
                        color={record.PaymentStatus === 'PARTIAL_PAID' ? 'warning' : 'error'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={bodyCellStyles} align="center">
                      {record.AgeDays} days<br />
                      <Typography component="span" variant="caption" sx={{ color: 'var(--text-muted)' }}>{record.AgingBucket}</Typography>
                    </TableCell>
                    <TableCell sx={bodyCellStyles}>{record.LastPaymentDate || '-'}</TableCell>
                  </TableRow>
                ))}
              {!filteredRecords.length && (
                <TableRow><TableCell colSpan={10} align="center" sx={{ ...bodyCellStyles, py: 5 }}>
                  No outstanding invoices match the selected filters.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2, flexWrap: 'wrap' }}>
          <Select
            size="small"
            value={rowsPerPage}
            onChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
          >
            <MenuItem value={10}>10 per page</MenuItem>
            <MenuItem value={25}>25 per page</MenuItem>
            <MenuItem value={50}>50 per page</MenuItem>
          </Select>
          <Pagination
            count={Math.max(1, Math.ceil(filteredRecords.length / rowsPerPage))}
            page={page + 1}
            onChange={(_, nextPage) => setPage(nextPage - 1)}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default OutstandingReceivables;
