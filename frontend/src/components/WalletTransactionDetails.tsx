import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import FilterAltOffRoundedIcon from '@mui/icons-material/FilterAltOffRounded';
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import axios from 'axios';
import { format } from 'date-fns';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';
import {
  buildWalletAccountTransactionsQuery,
  formatMmk,
  formatMyanmarWalletDateTime,
  formatSignedMmk,
  getMyanmarWalletDateKey,
  MYANMAR_TIME_ZONE_LABEL,
  parseWalletNumber,
  summarizeWalletTransactions,
} from '../utils/walletTransactionReport';

interface Transaction {
  transactionNumber: string;
  type: string;
  status: string;
  amount: string | number | null;
  comment: string | null;
  walletBalanceAfter: string | number | null;
  mainAccountID: string | null;
  walletAccount: string;
  senderName: string | null;
  senderPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  createddate_myanmar: string;
  ClinicCode: string;
  ClinicName: string;
}

type SortKey = 'createddate_myanmar' | 'transactionNumber' | 'type' | 'status' | 'amount' | 'walletBalanceAfter';
type SortDirection = 'asc' | 'desc';

const csvCell = (value: unknown): string => {
  const text = String(value ?? '').replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
};

const personCell = (name: string | null, phone: string | null) => (
  <Box sx={{ minWidth: 125 }}>
    <Typography sx={{ fontSize: '0.78rem', fontWeight: 650, color: 'text.primary' }}>{name || 'Not recorded'}</Typography>
    <Typography sx={{ mt: 0.15, fontSize: '0.67rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>{phone || '—'}</Typography>
  </Box>
);

const WalletTransactionDetails: React.FC = () => {
  const { ownerName } = useParams<{ ownerName: string }>();
  const decodedOwnerName = ownerName ? decodeURIComponent(ownerName) : '';
  const { currentClinic } = useClinic();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'createddate_myanmar',
    direction: 'desc',
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!decodedOwnerName) throw new Error('No wallet account was selected.');
      if (!currentClinic?.pass_id) throw new Error('The selected clinic is not connected to a wallet account.');

      const query = buildWalletAccountTransactionsQuery({
        clinicCode: currentClinic.pass_id,
        ownerName: decodedOwnerName,
      });
      const searchQuery = new URLSearchParams({ projectId: 'piti-pass', location: 'us-central1' });
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query2?${searchQuery}`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          timeout: 30000,
        },
      );

      if (!response.data?.success || !Array.isArray(response.data.data)) {
        throw new Error('The wallet service returned an unexpected response.');
      }
      setTransactions(response.data.data);
    } catch (requestError: any) {
      console.error('Error loading wallet account transactions:', requestError);
      const status = requestError.response?.status;
      const detail = requestError.response?.data?.error || requestError.message || 'Unknown error';
      if (status === 401) setError('Authentication failed. Please log in again.');
      else if (status === 403) setError('You do not have permission to access this wallet account.');
      else if (requestError.code === 'ECONNABORTED' || status >= 500) setError('The wallet service could not be reached. No financial data is being shown.');
      else setError(`Unable to load this wallet account: ${detail}`);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [currentClinic?.pass_id, decodedOwnerName]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const filteredTransactions = useMemo(() => {
    const startKey = startDate ? format(startDate, 'yyyy-MM-dd') : null;
    const endKey = endDate ? format(endDate, 'yyyy-MM-dd') : null;
    const term = searchTerm.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        if (statusFilter !== 'all' && transaction.status !== statusFilter) return false;
        const dateKey = getMyanmarWalletDateKey(transaction.createddate_myanmar);
        if (startKey && (!dateKey || dateKey < startKey)) return false;
        if (endKey && (!dateKey || dateKey > endKey)) return false;
        if (!term) return true;
        return [
          transaction.transactionNumber,
          transaction.type,
          transaction.status,
          transaction.comment,
          transaction.senderName,
          transaction.senderPhone,
          transaction.recipientName,
          transaction.recipientPhone,
        ].some((value) => String(value ?? '').toLowerCase().includes(term));
      })
      .sort((left, right) => {
        const { key, direction } = sortConfig;
        let comparison = 0;
        if (key === 'amount' || key === 'walletBalanceAfter') {
          comparison = (parseWalletNumber(left[key]) ?? Number.NEGATIVE_INFINITY)
            - (parseWalletNumber(right[key]) ?? Number.NEGATIVE_INFINITY);
        } else {
          comparison = String(left[key] ?? '').localeCompare(String(right[key] ?? ''), undefined, { numeric: true });
        }
        return direction === 'asc' ? comparison : -comparison;
      });
  }, [endDate, searchTerm, sortConfig, startDate, statusFilter, transactions]);

  const summary = useMemo(() => summarizeWalletTransactions(filteredTransactions), [filteredTransactions]);
  const currentBalance = parseWalletNumber(transactions[0]?.walletBalanceAfter);
  const hasFilters = Boolean(searchTerm || statusFilter !== 'all' || startDate || endDate);

  const requestSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setStartDate(null);
    setEndDate(null);
  };

  const exportToCSV = () => {
    const headers = [
      `Date (${MYANMAR_TIME_ZONE_LABEL})`,
      'Transaction Number',
      'Type',
      'Direction',
      'Amount (MMK)',
      'Balance After (MMK)',
      'Comment',
      'Sender Name',
      'Sender Phone',
      'Recipient Name',
      'Recipient Phone',
    ];
    const rows = filteredTransactions.map((transaction) => [
      transaction.createddate_myanmar,
      transaction.transactionNumber,
      transaction.type,
      transaction.status,
      transaction.amount,
      transaction.walletBalanceAfter,
      transaction.comment,
      transaction.senderName,
      transaction.senderPhone,
      transaction.recipientName,
      transaction.recipientPhone,
    ]);
    const blob = new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${decodedOwnerName.replace(/[^a-z0-9_-]+/gi, '_')}_wallet_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const sortLabel = (key: SortKey, label: string) => (
    <TableSortLabel
      active={sortConfig.key === key}
      direction={sortConfig.key === key ? sortConfig.direction : 'asc'}
      onClick={() => requestSort(key)}
    >
      {label}
    </TableSortLabel>
  );

  if (loading && transactions.length === 0) {
    return <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  const summaryCards = [
    {
      label: 'Current balance',
      value: formatMmk(currentBalance),
      help: 'Latest recorded balance for this wallet',
      icon: <AccountBalanceWalletRoundedIcon />,
      color: theme.palette.primary.main,
    },
    {
      label: hasFilters ? 'Matching transactions' : 'Transactions',
      value: summary.uniqueTransactions.toLocaleString(),
      help: `${summary.ledgerEntryCount.toLocaleString()} account ledger ${summary.ledgerEntryCount === 1 ? 'entry' : 'entries'}`,
      icon: <ReceiptLongRoundedIcon />,
      color: theme.palette.info.main,
    },
    {
      label: 'Money in',
      value: formatMmk(summary.incomingAmount),
      help: 'Credits in the current view',
      icon: <ArrowDownwardRoundedIcon />,
      color: theme.palette.success.main,
    },
    {
      label: 'Money out',
      value: formatMmk(summary.outgoingAmount),
      help: 'Debits in the current view',
      icon: <ArrowUpwardRoundedIcon />,
      color: theme.palette.error.main,
    },
  ];

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2.5 },
        border: `1px solid ${alpha(theme.palette.divider, isDarkMode ? 0.18 : 0.9)}`,
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        boxShadow: theme.shadows[1],
      }}
    >
      <Breadcrumbs separator={<NavigateNextRoundedIcon fontSize="small" />} aria-label="Wallet navigation" sx={{ mb: 1.25, '& .MuiBreadcrumbs-li': { fontSize: '0.78rem' } }}>
        <Button component={RouterLink} to="/wallet" size="small" sx={{ minWidth: 0, px: 0, textTransform: 'none' }}>Wallet Accounts</Button>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{decodedOwnerName}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
              <AccountBalanceWalletRoundedIcon />
            </Box>
            <Box>
              <Typography component="h1" sx={{ fontSize: { xs: '1.15rem', sm: '1.35rem' }, fontWeight: 780, color: 'text.primary' }}>Wallet transactions: {decodedOwnerName}</Typography>
              <Typography sx={{ mt: 0.2, fontSize: '0.76rem', color: 'text.secondary' }}>Account ledger · Times shown in {MYANMAR_TIME_ZONE_LABEL}</Typography>
            </Box>
            {currentClinic?.name && <Chip size="small" label={currentClinic.name} sx={{ ml: { sm: 1 }, bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.dark' }} />}
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" startIcon={loading ? <CircularProgress size={15} /> : <RefreshRoundedIcon />} onClick={() => void fetchTransactions()} disabled={loading} sx={{ textTransform: 'none' }}>Refresh</Button>
          <Button variant="contained" size="small" startIcon={<FileDownloadRoundedIcon />} onClick={exportToCSV} disabled={filteredTransactions.length === 0} sx={{ textTransform: 'none', boxShadow: 'none' }}>Export CSV</Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" size="small" onClick={() => void fetchTransactions()}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <Box sx={{ mt: 2.25, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
        {summaryCards.map((card) => (
          <Box key={card.label} sx={{ p: 1.5, border: `1px solid ${alpha(theme.palette.divider, 0.9)}`, borderRadius: 2, bgcolor: alpha(card.color, isDarkMode ? 0.08 : 0.035), minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 720, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.035em' }}>{card.label}</Typography>
              <Box sx={{ color: card.color, display: 'flex', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{card.icon}</Box>
            </Box>
            <Typography sx={{ mt: 0.7, fontSize: { xs: '1.05rem', sm: '1.15rem' }, fontWeight: 780, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.value}</Typography>
            <Typography sx={{ mt: 0.35, fontSize: '0.68rem', color: 'text.secondary' }}>{card.help}</Typography>
          </Box>
        ))}
      </Box>

      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Box sx={{ mt: 2, p: 1.5, border: `1px solid ${alpha(theme.palette.divider, 0.9)}`, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, isDarkMode ? 0.045 : 0.018) }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <TextField
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              size="small"
              placeholder="Search ID, person, phone or comment"
              aria-label="Search wallet transactions"
              sx={{ width: { xs: '100%', sm: 300 } }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment>,
                endAdornment: searchTerm ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearchTerm('')} aria-label="Clear search"><ClearRoundedIcon fontSize="small" /></IconButton></InputAdornment> : null,
              }}
            />
            <FormControl size="small" sx={{ minWidth: 132 }}>
              <InputLabel id="wallet-direction-label">Direction</InputLabel>
              <Select labelId="wallet-direction-label" value={statusFilter} label="Direction" onChange={(event: SelectChangeEvent) => setStatusFilter(event.target.value)}>
                <MenuItem value="all">All directions</MenuItem>
                <MenuItem value="IN">Money in</MenuItem>
                <MenuItem value="OUT">Money out</MenuItem>
              </Select>
            </FormControl>
            <DatePicker label="From date" value={startDate} onChange={setStartDate} maxDate={endDate || undefined} slotProps={{ textField: { size: 'small', sx: { width: { xs: '100%', sm: 155 } } } }} />
            <DatePicker label="To date" value={endDate} onChange={setEndDate} minDate={startDate || undefined} slotProps={{ textField: { size: 'small', sx: { width: { xs: '100%', sm: 155 } } } }} />
            {hasFilters && <Button size="small" startIcon={<FilterAltOffRoundedIcon />} onClick={resetFilters} sx={{ textTransform: 'none' }}>Clear filters</Button>}
          </Box>
        </Box>
      </LocalizationProvider>

      <Box sx={{ mt: 1.5, mb: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>Showing {filteredTransactions.length.toLocaleString()} of {transactions.length.toLocaleString()} account entries</Typography>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>Amount is signed for this wallet · Balance is the balance after that entry</Typography>
      </Box>

      <TableContainer sx={{ maxHeight: '68vh', border: `1px solid ${alpha(theme.palette.divider, 0.95)}`, borderRadius: 1.75 }}>
        <Table stickyHeader size="small" aria-label={`Wallet transactions for ${decodedOwnerName}`} sx={{ minWidth: 1280, '& .MuiTableCell-root': { borderColor: alpha(theme.palette.divider, 0.82), px: 1.5, py: 1.05 }, '& .MuiTableCell-head': { bgcolor: isDarkMode ? theme.palette.background.paper : '#F2F5F9', fontSize: '0.67rem', fontWeight: 750, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }, '& .MuiTableRow-root:hover': { bgcolor: alpha(theme.palette.primary.main, 0.035) } }}>
          <TableHead>
            <TableRow>
              <TableCell>{sortLabel('createddate_myanmar', `Date · ${MYANMAR_TIME_ZONE_LABEL}`)}</TableCell>
              <TableCell>{sortLabel('transactionNumber', 'Transaction')}</TableCell>
              <TableCell>{sortLabel('type', 'Type')}</TableCell>
              <TableCell>{sortLabel('status', 'Direction')}</TableCell>
              <TableCell align="right">{sortLabel('amount', 'Amount')}</TableCell>
              <TableCell align="right">{sortLabel('walletBalanceAfter', 'Balance after')}</TableCell>
              <TableCell>Sender</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell>Comment</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length > 0 ? filteredTransactions.map((transaction, index) => {
              const isIncoming = transaction.status === 'IN';
              return (
                <TableRow key={`${transaction.transactionNumber}:${transaction.status}:${index}`}>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 650, whiteSpace: 'nowrap' }}>{formatMyanmarWalletDateTime(transaction.createddate_myanmar)}</Typography>
                    <Typography sx={{ mt: 0.1, fontSize: '0.63rem', color: 'text.secondary' }}>{MYANMAR_TIME_ZONE_LABEL}</Typography>
                  </TableCell>
                  <TableCell><Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.72rem', color: 'text.primary' }}>{transaction.transactionNumber}</Typography></TableCell>
                  <TableCell><Chip label={transaction.type || 'Unknown'} size="small" variant="outlined" sx={{ height: 23, fontSize: '0.66rem', borderColor: 'divider' }} /></TableCell>
                  <TableCell><Chip label={isIncoming ? 'IN' : transaction.status === 'OUT' ? 'OUT' : transaction.status || '—'} size="small" sx={{ minWidth: 48, height: 23, fontSize: '0.65rem', fontWeight: 750, bgcolor: isIncoming ? alpha(theme.palette.success.main, 0.12) : transaction.status === 'OUT' ? alpha(theme.palette.error.main, 0.12) : alpha(theme.palette.text.secondary, 0.1), color: isIncoming ? 'success.dark' : transaction.status === 'OUT' ? 'error.main' : 'text.secondary' }} /></TableCell>
                  <TableCell align="right"><Typography sx={{ fontSize: '0.8rem', fontWeight: 760, whiteSpace: 'nowrap', color: isIncoming ? 'success.dark' : transaction.status === 'OUT' ? 'error.main' : 'text.primary' }}>{formatSignedMmk(transaction.amount, transaction.status)}</Typography></TableCell>
                  <TableCell align="right"><Typography sx={{ fontSize: '0.78rem', fontWeight: 650, whiteSpace: 'nowrap' }}>{formatMmk(transaction.walletBalanceAfter)}</Typography></TableCell>
                  <TableCell>{personCell(transaction.senderName, transaction.senderPhone)}</TableCell>
                  <TableCell>{personCell(transaction.recipientName, transaction.recipientPhone)}</TableCell>
                  <TableCell><Typography sx={{ minWidth: 190, maxWidth: 360, fontSize: '0.74rem', lineHeight: 1.45, color: transaction.comment ? 'text.primary' : 'text.secondary', overflowWrap: 'anywhere' }}>{transaction.comment || 'No comment'}</Typography></TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Box sx={{ py: 6 }}>
                    <ReceiptLongRoundedIcon sx={{ fontSize: 34, color: 'text.disabled' }} />
                    <Typography sx={{ mt: 1, fontWeight: 700 }}>{transactions.length ? 'No transactions match these filters' : `No transactions found for ${decodedOwnerName}`}</Typography>
                    <Typography sx={{ mt: 0.4, fontSize: '0.76rem', color: 'text.secondary' }}>{transactions.length ? 'Clear or adjust the filters to see more activity.' : 'This account has no wallet ledger entries for the selected clinic.'}</Typography>
                    {transactions.length > 0 && <Button size="small" onClick={resetFilters} sx={{ mt: 1.25, textTransform: 'none' }}>Clear filters</Button>}
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default WalletTransactionDetails;
