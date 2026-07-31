import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Box,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  useTheme,
  alpha,
  Stack,
  Chip,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import axios from 'axios';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, startOfMonth } from 'date-fns';
import { useClinic } from '../contexts/ClinicContext';
import {
  buildWalletTransactionsQuery,
  formatMmk,
  formatMyanmarWalletDateTime,
  formatSignedMmk,
  getMyanmarWalletDateKey,
  MYANMAR_TIME_ZONE_LABEL,
  summarizeWalletTransactions,
} from '../utils/walletTransactionReport';

// Updated interface to match the BigQuery schema
interface Transaction {
  transactionNumber: string;
  type: string;
  status: string;
  amount: string | number | null;
  comment: string;
  walletBalanceAfter: string | number | null;
  mainAccountID: string;
  walletAccount: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  createddate_myanmar: string;
  ClinicCode: string;
  ClinicName: string;
}

const Transaction: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  
  // Date filter states
  const [startDate, setStartDate] = useState<Date | null>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  
  // Get current clinic from context
  const { currentClinic } = useClinic();
  
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Add sort state
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Transaction | null;
    direction: 'ascending' | 'descending';
  }>({
    key: 'createddate_myanmar',
    direction: 'descending', // Default: newest first
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!currentClinic?.pass_id) {
        throw new Error('The selected clinic is not connected to a wallet account.');
      }

      const query = buildWalletTransactionsQuery({
        clinicCode: currentClinic.pass_id,
        startDate,
        endDate,
      });
      
      console.log('Executing wallet transaction query:', query);
      const searchQuery = new URLSearchParams({
        projectId: "piti-pass",
        location: "us-central1",
      })
      try {
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/query2?${searchQuery}`, 
          { query },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
            },
            timeout: 30000 // Increase timeout to 30 seconds
          }
        );
        
        if (response.data && response.data.success && response.data.data) {
          console.log(`Fetched ${response.data.data.length} wallet ledger entries for clinic: ${currentClinic.name}`);
          setTransactions(response.data.data);
        } else {
          console.warn('Invalid data format from backend:', response.data);
          throw new Error('Backend returned invalid data format');
        }
      } catch (axiosError: any) {
        console.error('Query execution error:', axiosError.response?.data || axiosError);
        
        // Log more detailed error information if available
        if (axiosError.response?.data?.error) {
          console.error('SQL Error details:', axiosError.response.data.error);
        }
        
        throw axiosError;
      }
    } catch (err: any) {
      console.error('Error loading transactions:', err);
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED' || 
          err.code === 'ETIMEDOUT' || (err.response && err.response.status >= 500)) {
        setError('Connection to the wallet service timed out. No transaction data is being shown.');
      } else if (err.response && err.response.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response && err.response.status === 403) {
        setError('You do not have permission to access this data.');
      } else {
        const errorDetails = err.response?.data?.error || err.message || 'Unknown error';
        setError(`Error loading transactions: ${errorDetails}`);
      }

      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, currentClinic]);

  useEffect(() => {
    fetchTransactions();
  }, [retryCount, fetchTransactions]);

  // Add comparison function for date sorting
  const compareValues = (key: keyof Transaction, a: Transaction, b: Transaction, direction: 'ascending' | 'descending') => {
    if (key === 'createddate_myanmar') {
      return direction === 'ascending'
        ? a.createddate_myanmar.localeCompare(b.createddate_myanmar)
        : b.createddate_myanmar.localeCompare(a.createddate_myanmar);
    }
    
    // Default string comparison for other fields
    if (!a[key] && !b[key]) return 0;
    if (!a[key]) return direction === 'ascending' ? -1 : 1;
    if (!b[key]) return direction === 'ascending' ? 1 : -1;
    
    const aValue = a[key].toString().toLowerCase();
    const bValue = b[key].toString().toLowerCase();
    
    if (aValue < bValue) return direction === 'ascending' ? -1 : 1;
    if (aValue > bValue) return direction === 'ascending' ? 1 : -1;
    return 0;
  };
  
  // Add request sort function
  const requestSort = (key: keyof Transaction) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    
    setSortConfig({ key, direction });
  };
  
  // Add CSV export function
  const exportToCSV = () => {
    // CSV Headers
    const headers = [
      `Date (${MYANMAR_TIME_ZONE_LABEL})`,
      'Transaction Number',
      'Type',
      'Direction',
      'Amount (MMK)',
      'Wallet Account',
      'Wallet Balance After (MMK)',
      'Comment',
      'Sender Name',
      'Sender Phone',
      'Recipient Name',
      'Recipient Phone'
    ];
    
    // Format data for CSV
    const data = filteredTransactions.map(t => [
      t.createddate_myanmar,
      t.transactionNumber,
      t.type,
      t.status,
      t.amount,
      t.walletAccount || 'N/A',
      t.walletBalanceAfter,
      t.comment,
      t.senderName || 'N/A',
      t.senderPhone || 'N/A',
      t.recipientName || 'N/A',
      t.recipientPhone || 'N/A'
    ]);
    
    // Combine headers and data
    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map(cell => {
        // Escape commas and quotes in cell content
        const cellContent = String(cell || '').replace(/"/g, '""');
        return cellContent.includes(',') ? `"${cellContent}"` : cellContent;
      }).join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    // Apply filters and sorting
    let filtered = [...transactions];
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(transaction => 
        Object.values(transaction).some(value => 
          value?.toString().toLowerCase().includes(term)
        )
      );
    }
    
    // Filter by date range
    if (startDate || endDate) {
      const startDateKey = startDate ? format(startDate, 'yyyy-MM-dd') : null;
      const endDateKey = endDate ? format(endDate, 'yyyy-MM-dd') : null;
      filtered = filtered.filter(transaction => {
        const transactionDateKey = getMyanmarWalletDateKey(transaction.createddate_myanmar);
        if (!transactionDateKey) return false;
        if (startDateKey && transactionDateKey < startDateKey) return false;
        if (endDateKey && transactionDateKey > endDateKey) return false;
        return true;
      });
    }
    
    // Apply sorting if a sort key is specified
    if (sortConfig.key) {
      filtered.sort((a, b) => 
        compareValues(sortConfig.key as keyof Transaction, a, b, sortConfig.direction)
      );
    }
    
    setFilteredTransactions(filtered);
  }, [searchTerm, startDate, endDate, transactions, sortConfig]);

  const handleDateClear = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const handleSearchClear = () => {
    setSearchTerm('');
  };
  
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  const walletSummary = useMemo(
    () => summarizeWalletTransactions(filteredTransactions),
    [filteredTransactions],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper 
      sx={{ 
        p: 2, 
        display: 'flex', 
        flexDirection: 'column',
        bgcolor: isDarkMode ? alpha(theme.palette.background.paper, 0.7) : theme.palette.background.paper,
        borderRadius: 2,
        boxShadow: isDarkMode ? `0 4px 20px 0px ${alpha(theme.palette.common.black, 0.5)}` : theme.shadows[2],
        border: isDarkMode ? `1px solid ${alpha(theme.palette.divider, 0.1)}` : 'none',
      }}
    >
      <Typography 
        component="h2" 
        variant="h6" 
        color={isDarkMode ? "primary.light" : "primary"} 
        gutterBottom
        sx={{ 
          mb: 3,
          textShadow: isDarkMode ? '0 2px 4px rgba(0,0,0,0.3)' : 'none',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Wallet Transactions
        {currentClinic && (
          <Typography component="span" sx={{ 
            ml: 2, 
            fontSize: '0.9rem', 
            bgcolor: alpha(theme.palette.primary.main, 0.15),
            color: isDarkMode ? theme.palette.primary.light : theme.palette.primary.dark,
            px: 2,
            py: 0.5,
            borderRadius: 2,
            display: 'inline-flex',
            alignItems: 'center'
          }}>
            Clinic: {currentClinic.name}
          </Typography>
        )}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        Ledger-level wallet movements. Dates are shown in {MYANMAR_TIME_ZONE_LABEL}.
      </Typography>
      
      {error && (
        <Alert 
          severity="error"
          sx={{ 
            mb: 2,
            bgcolor: isDarkMode ? (
              error 
                ? alpha(theme.palette.warning.dark, 0.2) 
                : alpha(theme.palette.info.dark, 0.2)
            ) : undefined,
            color: isDarkMode ? theme.palette.common.white : undefined,
            '& .MuiAlert-icon': {
              color: isDarkMode ? (
                error 
                  ? theme.palette.warning.light 
                  : theme.palette.info.light
              ) : undefined
            }
          }}
          action={
            error ? (
              <Button 
                color="inherit" 
                size="small" 
                onClick={handleRetry}
                startIcon={<ReplayIcon />}
                sx={{
                  color: isDarkMode ? theme.palette.common.white : undefined,
                  '&:hover': {
                    bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.1) : undefined
                  }
                }}
              >
                Retry
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}
      
      {/* Filters Row */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="center">
        {/* Search Field */}
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color={isDarkMode ? "primary" : undefined} />
              </InputAdornment>
            ),
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleSearchClear}
                  edge="end"
                  color={isDarkMode ? "primary" : undefined}
                >
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          size="small"
          sx={{
            maxWidth: { md: '400px' }, // Limit width on medium screens and up
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: isDarkMode ? alpha(theme.palette.primary.main, 0.3) : undefined,
              },
              '&:hover fieldset': {
                borderColor: isDarkMode ? alpha(theme.palette.primary.main, 0.5) : undefined,
              },
              '&.Mui-focused fieldset': {
                borderColor: isDarkMode ? theme.palette.primary.main : undefined,
              },
            },
            '& .MuiInputBase-input': {
              color: isDarkMode ? theme.palette.common.white : undefined,
            },
          }}
        />
        
        {/* Spacer */}
        <Box sx={{ flexGrow: { md: 1 } }} />

        {/* Date Pickers */}
        <Box 
          sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' }, 
            gap: 2,
            width: { xs: '100%', sm: 'auto' },
            alignItems: { xs: 'flex-start', sm: 'center' }
          }}
        >
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <DatePicker
                label="Start Date"
                value={startDate}
                onChange={(newDate) => setStartDate(newDate)}
                slotProps={{
                  textField: {
                    size: 'small',
                    fullWidth: true,
                    sx: {
                      width: { xs: '100%', sm: '160px' },
                      '& .MuiInputBase-input': { 
                        color: isDarkMode ? theme.palette.common.white : undefined,
                        cursor: 'pointer'
                      },
                      '& .MuiInputLabel-root': { 
                        color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined 
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { 
                          borderColor: isDarkMode ? alpha(theme.palette.primary.main, 0.3) : undefined 
                        },
                        '&:hover fieldset': {
                          borderColor: isDarkMode ? alpha(theme.palette.primary.main, 0.5) : undefined
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: isDarkMode ? theme.palette.primary.main : undefined
                        }
                      }
                    }
                  },
                  popper: {
                    sx: {
                      zIndex: 9999,
                      '& .MuiPaper-root': {
                        bgcolor: isDarkMode ? theme.palette.background.paper : undefined,
                        color: isDarkMode ? theme.palette.common.white : undefined,
                        '& .MuiPickersDay-root': {
                          color: isDarkMode ? theme.palette.common.white : undefined,
                          '&.Mui-selected': {
                            backgroundColor: theme.palette.primary.main,
                            color: theme.palette.common.white,
                          },
                          '&:hover': {
                            backgroundColor: isDarkMode ? alpha(theme.palette.primary.main, 0.2) : undefined,
                          }
                        },
                        '& .MuiDayCalendar-weekDayLabel': {
                          color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined,
                        },
                        '& .MuiPickersCalendarHeader-label': {
                          color: isDarkMode ? theme.palette.common.white : undefined,
                        },
                        '& .MuiIconButton-root': {
                          color: isDarkMode ? theme.palette.common.white : undefined,
                        }
                      }
                    }
                  }
                }}
              />
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(newDate) => setEndDate(newDate)}
                minDate={startDate || undefined}
                slotProps={{
                  textField: {
                    size: 'small',
                    fullWidth: true,
                    sx: {
                      width: { xs: '100%', sm: '160px' },
                      '& .MuiInputBase-input': { 
                        color: isDarkMode ? theme.palette.common.white : undefined,
                        cursor: 'pointer'
                      },
                      '& .MuiInputLabel-root': { 
                        color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined 
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { 
                          borderColor: isDarkMode ? alpha(theme.palette.primary.main, 0.3) : undefined 
                        },
                        '&:hover fieldset': {
                          borderColor: isDarkMode ? alpha(theme.palette.primary.main, 0.5) : undefined
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: isDarkMode ? theme.palette.primary.main : undefined
                        }
                      }
                    }
                  },
                  popper: {
                    sx: {
                      zIndex: 9999,
                      '& .MuiPaper-root': {
                        bgcolor: isDarkMode ? theme.palette.background.paper : undefined,
                        color: isDarkMode ? theme.palette.common.white : undefined,
                        '& .MuiPickersDay-root': {
                          color: isDarkMode ? theme.palette.common.white : undefined,
                          '&.Mui-selected': {
                            backgroundColor: theme.palette.primary.main,
                            color: theme.palette.common.white,
                          },
                          '&:hover': {
                            backgroundColor: isDarkMode ? alpha(theme.palette.primary.main, 0.2) : undefined,
                          }
                        },
                        '& .MuiDayCalendar-weekDayLabel': {
                          color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined,
                        },
                        '& .MuiPickersCalendarHeader-label': {
                          color: isDarkMode ? theme.palette.common.white : undefined,
                        },
                        '& .MuiIconButton-root': {
                          color: isDarkMode ? theme.palette.common.white : undefined,
                        }
                      }
                    }
                  }
                }}
              />
            </Stack>
          </LocalizationProvider>
        </Box>
      </Stack>
      
      {/* Active Filters Display */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          {(searchTerm || startDate || endDate) && (
            <Box 
              display="flex" 
              gap={1} 
              flexWrap="wrap"
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: isDarkMode ? alpha(theme.palette.primary.dark, 0.1) : alpha(theme.palette.primary.light, 0.05),
              }}
            >
              <Typography 
                variant="body2" 
                display="flex" 
                alignItems="center" 
                color={isDarkMode ? theme.palette.common.white : undefined}
                sx={{ fontWeight: 'medium' }}
              >
                <FilterListIcon fontSize="small" sx={{ mr: 0.5, color: isDarkMode ? theme.palette.primary.light : undefined }} />
                Active filters:
              </Typography>
              {searchTerm && (
                <Chip 
                  label={`Search: ${searchTerm}`} 
                  size="small" 
                  onDelete={handleSearchClear}
                  sx={{
                    bgcolor: isDarkMode ? alpha(theme.palette.primary.dark, 0.3) : undefined,
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    '& .MuiChip-deleteIcon': {
                      color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined,
                      '&:hover': {
                        color: isDarkMode ? theme.palette.common.white : undefined,
                      }
                    }
                  }}
                />
              )}
              {(startDate || endDate) && (
                <Chip 
                  label={`Range: ${startDate ? format(startDate, 'yyyy-MM-dd') : 'Any'} to ${endDate ? format(endDate, 'yyyy-MM-dd') : 'Any'}`}
                  size="small" 
                  onDelete={handleDateClear}
                  sx={{
                    bgcolor: isDarkMode ? alpha(theme.palette.primary.dark, 0.3) : undefined,
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    '& .MuiChip-deleteIcon': {
                      color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined,
                      '&:hover': {
                        color: isDarkMode ? theme.palette.common.white : undefined,
                      }
                    }
                  }}
                />
              )}
            </Box>
          )}
        </Box>
        
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ReplayIcon />}
            onClick={fetchTransactions}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={exportToCSV}
            disabled={filteredTransactions.length === 0}
            sx={{
              color: isDarkMode ? theme.palette.primary.light : theme.palette.primary.main,
              borderColor: isDarkMode ? alpha(theme.palette.primary.light, 0.5) : undefined,
              '&:hover': {
                backgroundColor: isDarkMode ? alpha(theme.palette.primary.main, 0.1) : undefined,
                borderColor: isDarkMode ? theme.palette.primary.light : undefined
              }
            }}
          >
            Export CSV
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 2,
        }}
      >
        {[
          { label: 'Transactions', value: walletSummary.uniqueTransactions.toLocaleString() },
          { label: 'Ledger entries', value: walletSummary.ledgerEntryCount.toLocaleString() },
          { label: 'Incoming', value: formatMmk(walletSummary.incomingAmount), color: theme.palette.success.main },
          { label: 'Outgoing', value: formatMmk(walletSummary.outgoingAmount), color: theme.palette.error.main },
        ].map(card => (
          <Paper
            key={card.label}
            variant="outlined"
            sx={{ p: 1.5, bgcolor: 'transparent', borderColor: alpha(theme.palette.divider, 0.6) }}
          >
            <Typography variant="caption" color="text.secondary">{card.label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: card.color || 'text.primary' }}>
              {card.value}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        A transfer appears as two ledger entries: OUT for the sender wallet and IN for the recipient wallet.
        “Balance after” belongs to the wallet account shown on that row, so paired balances are expected to differ.
      </Alert>

      {walletSummary.invalidAmountCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {walletSummary.invalidAmountCount} ledger entries have an invalid amount and are excluded from the totals.
        </Alert>
      )}
      
      <Box sx={{ mb: 1 }}>
        <Typography 
          variant="body2" 
          color={isDarkMode ? "rgba(255,255,255,0.7)" : "text.secondary"}
          sx={{ fontStyle: 'italic' }}
        >
          Showing {filteredTransactions.length} of {transactions.length} ledger entries
        </Typography>
      </Box>
      
      <TableContainer 
        sx={{ 
          maxHeight: '70vh',
          borderRadius: 1,
          border: isDarkMode ? `1px solid ${alpha(theme.palette.divider, 0.1)}` : 'none',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: isDarkMode ? alpha(theme.palette.primary.dark, 0.6) : alpha(theme.palette.primary.main, 0.2),
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: isDarkMode ? alpha(theme.palette.primary.main, 0.7) : alpha(theme.palette.primary.main, 0.3),
            }
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: isDarkMode ? alpha(theme.palette.common.black, 0.2) : alpha(theme.palette.grey[200], 0.5),
            borderRadius: '4px',
          },
        }}
      >
        <Table 
          size="small" 
          stickyHeader 
          sx={{ 
            '& .MuiTableCell-root': {
              borderColor: isDarkMode ? alpha(theme.palette.divider, 0.2) : theme.palette.divider,
              padding: '12px 16px',
              color: isDarkMode ? theme.palette.common.white : undefined,
            },
            '& .MuiTableCell-head': {
              backgroundColor: isDarkMode ? alpha(theme.palette.common.black, 0.4) : alpha(theme.palette.primary.light, 0.1),
              color: isDarkMode ? theme.palette.common.white : theme.palette.primary.dark,
              fontWeight: 'bold',
              textTransform: 'uppercase',
              fontSize: '0.75rem',
            },
            '& .MuiTableRow-root:hover': {
              backgroundColor: isDarkMode ? alpha(theme.palette.primary.dark, 0.15) : alpha(theme.palette.primary.light, 0.05),
            },
            '& .MuiTableBody-root .MuiTableRow-root:nth-of-type(odd)': {
              backgroundColor: isDarkMode ? alpha(theme.palette.common.black, 0.1) : alpha(theme.palette.grey[100], 0.3),
            },
          }}
        >
          <TableHead>
            <TableRow>
              {/* Date column with sort indicator */}
              <TableCell 
                onClick={() => requestSort('createddate_myanmar')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                }}
              >
                Date (MMT)
                {sortConfig.key === 'createddate_myanmar' && (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                    {sortConfig.direction === 'ascending' 
                      ? <ArrowUpwardIcon fontSize="small" />
                      : <ArrowDownwardIcon fontSize="small" />
                    }
                  </Box>
                )}
              </TableCell>
              <TableCell>Transaction #</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Direction</TableCell>
              <TableCell align="right">Amount (MMK)</TableCell>
              <TableCell>Wallet Account</TableCell>
              <TableCell align="right">Balance After (MMK)</TableCell>
              <TableCell>Comment</TableCell>
              <TableCell>Sender</TableCell>
              <TableCell>Recipient</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction, index) => {
                const startsTransaction = index === 0 ||
                  filteredTransactions[index - 1].transactionNumber !== transaction.transactionNumber;

                return (
                <TableRow
                  key={`${transaction.transactionNumber}-${transaction.status}-${transaction.mainAccountID || index}`}
                  sx={{
                    '& > td': startsTransaction
                      ? { borderTop: `2px solid ${alpha(theme.palette.primary.main, 0.25)}` }
                      : undefined,
                  }}
                >
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined, whiteSpace: 'nowrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatMyanmarWalletDateTime(transaction.createddate_myanmar)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">MMT</Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Box sx={{ 
                      fontFamily: 'monospace', 
                      fontSize: '0.8rem',
                      color: isDarkMode ? alpha(theme.palette.common.white, 0.9) : theme.palette.primary.dark,
                      fontWeight: 'medium',
                      backgroundColor: isDarkMode ? alpha(theme.palette.primary.dark, 0.2) : 'transparent',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      display: 'inline-block'
                    }}>
                      {transaction.transactionNumber}
                    </Box>
                  </TableCell>
                  
                  <TableCell>
                    <Chip label={transaction.type} size="small" color={transaction.type === 'Share' ? 'secondary' : 'primary'} />
                  </TableCell>
                  
                  {/* Status column with colors based on IN/OUT */}
                  <TableCell>
                    <Chip
                      label={transaction.status}
                      size="small"
                      color={transaction.status === 'IN' ? 'success' : 
                             transaction.status === 'OUT' ? 'error' : 
                             'default'}
                      variant="filled"
                      sx={{ 
                        minWidth: '50px',
                        fontWeight: 'bold',
                        backgroundColor: isDarkMode ? (
                          transaction.status === 'IN' ? alpha(theme.palette.success.main, 0.9) : 
                          transaction.status === 'OUT' ? alpha(theme.palette.error.main, 0.9) : 
                          alpha(theme.palette.grey[600], 0.9)
                        ) : undefined,
                        color: isDarkMode ? theme.palette.common.white : undefined,
                      }}
                    />
                  </TableCell>
                  
                  <TableCell align="right" sx={{
                    color: transaction.status === 'IN' ? theme.palette.success.main : theme.palette.error.main,
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatSignedMmk(transaction.amount, transaction.status)}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {transaction.walletAccount || 'Unknown wallet'}
                  </TableCell>
                  <TableCell align="right" sx={{
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    fontWeight: 'medium',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatMmk(transaction.walletBalanceAfter)}
                  </TableCell>
                  <TableCell sx={{ color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined, minWidth: 220 }}>
                    {transaction.comment || '—'}
                  </TableCell>
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    <Typography variant="body2">{transaction.senderName || 'Unknown'}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {transaction.senderPhone || 'No phone'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    <Typography variant="body2">{transaction.recipientName || 'Unknown'}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {transaction.recipientPhone || 'No phone'}
                    </Typography>
                  </TableCell>
                </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Box sx={{ py: 3, color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transactions.length > 0 ? 
                      `No matches for the current filters. Try changing the date filter.` : 
                      `No transaction data available`
                    }
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Debug Info - Only in development */}
      {process.env.NODE_ENV === 'development' && (
        <Box 
          sx={{ 
            mt: 2, 
            p: 2, 
            bgcolor: alpha(theme.palette.warning.main, 0.1),
            borderRadius: 1,
            display: 'none', // Set to 'block' to see debug info
          }}
        >
          <Typography variant="subtitle2">Debug Info:</Typography>
          <Typography variant="body2">
            Total Transactions: {transactions.length} | Filtered: {filteredTransactions.length}
          </Typography>
          <Typography variant="body2">
            Filter Type: Custom | 
            Selected Date: {startDate ? format(startDate, 'yyyy-MM-dd') : 'None'} |
            Custom Range: {startDate && endDate ? `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}` : 'None'}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default Transaction;
