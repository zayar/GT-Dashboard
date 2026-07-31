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
  Button,
  Chip,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ReplayIcon from '@mui/icons-material/Replay';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import axios from 'axios';
import { format } from 'date-fns';
import { useClinic } from '../contexts/ClinicContext';
import { useNavigate } from 'react-router-dom';
import { buildWalletAccountsQuery, summarizeWalletAccounts } from '../utils/walletAccountReport';
import {
  formatMmk,
  formatMyanmarWalletDateTime,
  MYANMAR_TIME_ZONE_LABEL,
} from '../utils/walletTransactionReport';

interface WalletAccount {
  name: string;
  phoneNumber: string;
  balance: string | number | null;
  transactionCount: number;
  lastActivity: string;
  needsReview: boolean;
}

const Wallet: React.FC = () => {
  const [walletAccounts, setWalletAccounts] = useState<WalletAccount[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<WalletAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: keyof WalletAccount;
    direction: 'ascending' | 'descending';
  }>({
    key: 'balance',
    direction: 'descending', // Default: highest balance first
  });
  
  // Get current clinic from context
  const { currentClinic } = useClinic();
  
  // Add navigation
  const navigate = useNavigate();
  
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  
  const fetchWalletAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    if (!currentClinic?.pass_id) {
      setError('The selected clinic is not connected to a wallet account.');
      setWalletAccounts([]);
      setLoading(false);
      return;
    }

    try {
      const query = buildWalletAccountsQuery(currentClinic.pass_id);
      
      console.log('Wallet accounts query for clinic:', currentClinic.name, query);
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
            timeout: 30000 // 30 seconds timeout
          }
        );
        
        if (response.data && response.data.success && response.data.data) {
          console.log(`Fetched ${response.data.data.length} wallet accounts for clinic: ${currentClinic.name}`);
          
          // Format the data to ensure numeric values are handled correctly
          const formattedAccounts = response.data.data.map((account: any) => ({
            ...account,
            name: account.name?.trim() || 'Unknown account',
            phoneNumber: account.phoneNumber || '',
            balance: account.balance ?? null,
            transactionCount: parseInt(account.transactionCount, 10) || 0,
            lastActivity: account.lastActivity || '',
            needsReview: Boolean(account.needsReview),
          }));
          
          setWalletAccounts(formattedAccounts);
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
      console.error('Error loading wallet accounts:', err);
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED' || 
          err.code === 'ETIMEDOUT' || (err.response && err.response.status >= 500)) {
        setError('Connection to the wallet service timed out. No account balances are being shown.');
      } else if (err.response && err.response.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response && err.response.status === 403) {
        setError('You do not have permission to access this data.');
      } else {
        const errorDetails = err.response?.data?.error || err.message || 'Unknown error';
        setError(`Error loading wallet accounts: ${errorDetails}`);
      }

      setWalletAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [currentClinic]);
  
  useEffect(() => {
    fetchWalletAccounts();
  }, [retryCount, fetchWalletAccounts]);
  
  // Compare function for sorting
  const compareValues = (key: keyof WalletAccount, a: WalletAccount, b: WalletAccount, direction: 'ascending' | 'descending') => {
    let valueA, valueB;
    
    // Handle numeric vs string comparisons
    if (key === 'balance') {
      valueA = Number(a[key] ?? 0);
      valueB = Number(b[key] ?? 0);
    } else if (key === 'transactionCount') {
      valueA = a[key] || 0;
      valueB = b[key] || 0;
    } else {
      valueA = (a[key] || '').toString().toLowerCase();
      valueB = (b[key] || '').toString().toLowerCase();
    }
    
    // Compare based on type
    let result;
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      result = valueA - valueB;
    } else {
      result = String(valueA).localeCompare(String(valueB));
    }
    
    return direction === 'ascending' ? result : -result;
  };
  
  // Request sort function
  const requestSort = (key: keyof WalletAccount) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    
    setSortConfig({ key, direction });
  };
  
  // Export to CSV function
  const exportToCSV = () => {
    // CSV Headers
    const headers = [
      'Account Name',
      'Phone Number',
      'Current Balance (MMK)',
      'Transaction Count',
      `Last Activity (${MYANMAR_TIME_ZONE_LABEL})`,
      'Status',
    ];
    
    // Format data for CSV
    const data = filteredAccounts.map(account => [
      account.name,
      account.phoneNumber,
      account.balance,
      account.transactionCount.toString(),
      account.lastActivity,
      account.needsReview ? 'Needs review' : Number(account.balance ?? 0) > 0 ? 'Funded' : 'Zero balance',
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
    link.setAttribute('download', `wallet_accounts_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Filter wallet accounts based on search
  useEffect(() => {
    let filtered = [...walletAccounts];
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(account => 
        account.name.toLowerCase().includes(term) ||
        account.phoneNumber.toLowerCase().includes(term)
      );
    }
    
    // Apply sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => 
        compareValues(sortConfig.key, a, b, sortConfig.direction)
      );
    }
    
    setFilteredAccounts(filtered);
  }, [walletAccounts, searchTerm, sortConfig]);
  
  const handleSearchClear = () => {
    setSearchTerm('');
  };
  
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };
  
  // Handle click on wallet owner name
  const handleNameClick = (name: string) => {
    // Navigate to wallet transaction details page with the owner name
    navigate(`/wallet-transactions/${encodeURIComponent(name)}`);
  };

  const accountSummary = useMemo(
    () => summarizeWalletAccounts(filteredAccounts),
    [filteredAccounts],
  );

  const latestActivity = useMemo(
    () => walletAccounts.reduce(
      (latest, account) => account.lastActivity > latest ? account.lastActivity : latest,
      '',
    ),
    [walletAccounts],
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
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        <AccountBalanceWalletIcon fontSize="large" />
        Wallet Accounts
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
        Current wallet balances from each account’s latest ledger entry.
        {latestActivity && ` Latest activity: ${formatMyanmarWalletDateTime(latestActivity)} MMT.`}
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
      
      {/* Search Field */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2
        }}
      >
        <TextField
          variant="outlined"
          placeholder="Search by name or phone..."
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
            width: { xs: '100%', sm: '300px' },
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
        
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button variant="outlined" size="small" startIcon={<ReplayIcon />} onClick={fetchWalletAccounts}>
            Refresh
          </Button>
          <Button variant="contained" size="small" onClick={() => navigate('/transactions')}>
            View All Transactions
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={exportToCSV}
            disabled={filteredAccounts.length === 0}
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
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
          gap: 1.5,
          mb: 2,
        }}
      >
        {[
          { label: 'Total wallet balance', value: formatMmk(accountSummary.totalBalance), color: theme.palette.primary.main },
          { label: 'Wallet accounts', value: accountSummary.totalAccounts.toLocaleString() },
          { label: 'Funded accounts', value: accountSummary.fundedAccounts.toLocaleString(), color: theme.palette.success.main },
          { label: 'Zero-balance accounts', value: accountSummary.zeroBalanceAccounts.toLocaleString(), color: theme.palette.text.secondary },
          { label: 'Needs review', value: accountSummary.needsReviewAccounts.toLocaleString(), color: theme.palette.warning.main },
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

      {accountSummary.invalidBalanceAccounts > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {accountSummary.invalidBalanceAccounts} accounts have an invalid balance and are excluded from the total.
        </Alert>
      )}
      
      <Box sx={{ mb: 1 }}>
        <Typography 
          variant="body2" 
          color={isDarkMode ? "rgba(255,255,255,0.7)" : "text.secondary"}
          sx={{ fontStyle: 'italic' }}
        >
          Showing {filteredAccounts.length} of {walletAccounts.length} wallet accounts
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
          size="medium" 
          stickyHeader 
          sx={{ 
            '& .MuiTableCell-root': {
              borderColor: isDarkMode ? alpha(theme.palette.divider, 0.2) : theme.palette.divider,
              padding: '16px',
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
              {/* Name column with sort indicator */}
              <TableCell 
                onClick={() => requestSort('name')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                  width: '24%'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  NAME
                  {sortConfig.key === 'name' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'ascending' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              {/* Phone Number column with sort indicator */}
              <TableCell 
                onClick={() => requestSort('phoneNumber')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                  width: '18%'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  PHONE NUMBER
                  {sortConfig.key === 'phoneNumber' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'ascending' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              {/* Balance column with sort indicator */}
              <TableCell 
                onClick={() => requestSort('balance')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                  width: '20%',
                  textAlign: 'right'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  CURRENT BALANCE (MMK)
                  {sortConfig.key === 'balance' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'ascending' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>

              <TableCell
                onClick={() => requestSort('lastActivity')}
                sx={{ cursor: 'pointer', width: '18%' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  LAST ACTIVITY (MMT)
                  {sortConfig.key === 'lastActivity' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'ascending'
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />}
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              {/* Transaction Count column with sort indicator */}
              <TableCell 
                onClick={() => requestSort('transactionCount')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                  width: '12%',
                  textAlign: 'center'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  TRANSACTIONS
                  {sortConfig.key === 'transactionCount' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'ascending' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              <TableCell align="right" sx={{ width: '8%' }}>ACTION</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map((account, index) => (
                <TableRow key={`${account.name}-${account.phoneNumber}-${index}`}>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    fontWeight: 'medium',
                    width: '24%'
                  }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontWeight: 600 }}>{account.name}</Typography>
                      <Chip
                        label={account.needsReview
                          ? 'Needs review'
                          : Number(account.balance ?? 0) > 0 ? 'Funded' : 'Zero balance'}
                        size="small"
                        color={account.needsReview
                          ? 'warning'
                          : Number(account.balance ?? 0) > 0 ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    width: '18%',
                    fontFamily: 'monospace',
                  }}>
                    {account.phoneNumber || 'No phone'}
                  </TableCell>
                  <TableCell sx={{ 
                    color: Number(account.balance ?? 0) > 0
                      ? theme.palette.success.main
                      : theme.palette.text.secondary,
                    width: '20%',
                    textAlign: 'right'
                  }}>
                    <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatMmk(account.balance)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '18%', whiteSpace: 'nowrap' }}>
                    <Typography variant="body2">
                      {formatMyanmarWalletDateTime(account.lastActivity)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">MMT</Typography>
                  </TableCell>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    width: '12%',
                    textAlign: 'center'
                  }}>
                    <Chip
                      label={account.transactionCount}
                      color="primary"
                      variant={isDarkMode ? 'filled' : 'outlined'}
                      size="small"
                      sx={{
                        fontWeight: 'medium',
                        backgroundColor: isDarkMode ? alpha(theme.palette.primary.main, 0.9) : undefined,
                        color: isDarkMode ? theme.palette.common.white : undefined,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ width: '8%' }}>
                    <Button
                      size="small"
                      variant="text"
                      disabled={account.needsReview}
                      title={account.needsReview ? 'This wallet needs an account name before history can be opened.' : undefined}
                      onClick={() => handleNameClick(account.name)}
                    >
                      View history
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Box sx={{ py: 3, color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {walletAccounts.length > 0 ? 
                      `No matches found. Try a different search term.` : 
                      `No wallet account data available`
                    }
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

export default Wallet;
