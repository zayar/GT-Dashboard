import React, { useEffect, useState, useCallback } from 'react';
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
  Link,
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

interface WalletAccount {
  name: string; // MainAccountName
  phoneNumber: string; // Most frequent phone number for the account
  balance: string; // accountbalance
  transactionCount: number; // Count of transactions
}

// Mock data for when backend is unavailable
const MOCK_WALLET_ACCOUNTS: WalletAccount[] = [
  {
    name: 'John Smith',
    phoneNumber: '+95912345678',
    balance: '120000.00',
    transactionCount: 15
  },
  {
    name: 'Jane Doe',
    phoneNumber: '+95987654321',
    balance: '85000.00',
    transactionCount: 8
  },
  {
    name: 'Michael Johnson',
    phoneNumber: '+95978901234',
    balance: '230000.00',
    transactionCount: 23
  }
];

const Wallet: React.FC = () => {
  const [walletAccounts, setWalletAccounts] = useState<WalletAccount[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<WalletAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);
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
    
    if (!currentClinic) {
      setError('No clinic selected. Please select a clinic first.');
      setLoading(false);
      return;
    }

    // Enhanced debug logging for clinic data
    console.log('=== WALLET COMPONENT: CLINIC DATA DEBUG ===');
    console.log('Current Clinic Full Data:', currentClinic);
    console.log('Type of currentClinic:', typeof currentClinic);
    console.log('Properties available:', Object.keys(currentClinic));
    console.log('pass_id value:', currentClinic.pass_id);
    console.log('pass_id type:', typeof currentClinic.pass_id);
    console.log('clinic code:', currentClinic.code);
    console.log('=== END CLINIC DEBUG ===');

    try {
      // Build SQL query to fetch wallet accounts with aggregations
      const query = `
        WITH AccountTransactions AS (
          SELECT 
            MainAccountName,
            senderPhone,
            accountbalance,
            transactionNumber,
            COUNT(*) OVER (PARTITION BY MainAccountName, senderPhone) as phone_count
          FROM 
            \`piti-pass.passdb_prod.wallettransaction\`
          WHERE 
            ClinicCode = '${currentClinic.pass_id}'
            AND MainAccountName IS NOT NULL
            AND MainAccountName != ''
        ),
        -- Get the most frequently used phone for each account
        AccountPhones AS (
          SELECT 
            MainAccountName,
            senderPhone,
            accountbalance,
            ROW_NUMBER() OVER (PARTITION BY MainAccountName ORDER BY phone_count DESC) as phone_rank
          FROM AccountTransactions
          GROUP BY MainAccountName, senderPhone, accountbalance, phone_count
        ),
        -- Get the transaction count for each account
        AccountStats AS (
          SELECT 
            MainAccountName,
            COUNT(DISTINCT transactionNumber) as transaction_count
          FROM AccountTransactions
          GROUP BY MainAccountName
        )
        -- Combine the data
        SELECT 
          p.MainAccountName as name,
          p.senderPhone as phoneNumber,
          p.accountbalance as balance,
          s.transaction_count as transactionCount
        FROM 
          AccountPhones p
        JOIN 
          AccountStats s ON p.MainAccountName = s.MainAccountName
        WHERE 
          p.phone_rank = 1
        ORDER BY 
          CAST(p.accountbalance AS NUMERIC) DESC
        LIMIT 100
      `;
      
      console.log('=== WALLET QUERY DEBUG ===');
      console.log('Wallet query for clinic:', currentClinic.name);
      console.log('Using ClinicCode:', currentClinic.code);
      console.log('Full SQL Query:', query);
      console.log('=== END WALLET QUERY DEBUG ===');
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
            balance: account.balance || '0',
            transactionCount: parseInt(account.transactionCount, 10) || 0
          }));
          
          setWalletAccounts(formattedAccounts);
          setIsMockData(false);
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
        setError('Connection to server timed out. Using sample wallet data.');
      } else if (err.response && err.response.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response && err.response.status === 403) {
        setError('You do not have permission to access this data.');
      } else {
        // Include more error details to help debugging
        const errorDetails = err.response?.data?.error || err.message || 'Unknown error';
        setError(`Error loading wallet accounts: ${errorDetails}. Using sample data instead.`);
      }
      
      // Use mock data with Fancy House as clinic
      const mocksWithFancyHouse = MOCK_WALLET_ACCOUNTS;
      setWalletAccounts(mocksWithFancyHouse);
      setIsMockData(true);
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
      valueA = parseFloat(a[key] || '0');
      valueB = parseFloat(b[key] || '0');
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
    const headers = ['Name', 'Phone Number', 'Balance', 'Transaction Count'];
    
    // Format data for CSV
    const data = filteredAccounts.map(account => [
      account.name,
      account.phoneNumber,
      account.balance,
      account.transactionCount.toString()
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
          <>
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
            {currentClinic.pass_id && (
              <Typography component="span" sx={{ 
                ml: 1, 
                fontSize: '0.9rem', 
                bgcolor: alpha(theme.palette.secondary.main, 0.15),
                color: isDarkMode ? theme.palette.secondary.light : theme.palette.secondary.dark,
                px: 2,
                py: 0.5,
                borderRadius: 2,
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                Pass ID: {currentClinic.pass_id}
              </Typography>
            )}
          </>
        )}
      </Typography>
      
      {(isMockData || error) && (
        <Alert 
          severity={error ? "warning" : "info"} 
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
          {error || "Using sample wallet data. Real wallet data is currently unavailable due to database access issues."}
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
        
        {/* Export CSV Button */}
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
      </Box>
      
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
                  width: '30%'
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
                  width: '20%'
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
                  width: '25%',
                  textAlign: 'right'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  BALANCE
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
                  width: '25%',
                  textAlign: 'center'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  TRANSACTION COUNT
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
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map((account, index) => (
                <TableRow key={`${account.name}-${account.phoneNumber}-${index}`}>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    fontWeight: 'medium',
                    width: '30%'
                  }}>
                    <Link
                      component="button"
                      variant="body1"
                      onClick={() => handleNameClick(account.name)}
                      sx={{
                        textDecoration: 'none',
                        color: isDarkMode ? theme.palette.common.white : theme.palette.primary.main,
                        fontWeight: 'medium',
                        '&:hover': {
                          textDecoration: 'underline',
                          color: isDarkMode ? alpha(theme.palette.common.white, 0.8) : theme.palette.primary.dark,
                        }
                      }}
                    >
                      {account.name}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    width: '20%'
                  }}>
                    {account.phoneNumber || 'N/A'}
                  </TableCell>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    width: '25%',
                    textAlign: 'right'
                  }}>
                    <Chip
                      label={parseFloat(account.balance || '0').toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                      color={parseFloat(account.balance) > 0 ? 'success' : parseFloat(account.balance) < 0 ? 'error' : 'default'}
                      variant={isDarkMode ? 'filled' : 'filled'}
                      size="medium"
                      sx={{
                        fontWeight: 'bold',
                        fontSize: '0.875rem',
                        backgroundColor: isDarkMode ? (
                          parseFloat(account.balance) > 0 ? alpha(theme.palette.success.main, 0.9) : 
                          parseFloat(account.balance) < 0 ? alpha(theme.palette.error.main, 0.9) : 
                          alpha(theme.palette.grey[600], 0.9)
                        ) : undefined,
                        color: isDarkMode ? theme.palette.common.white : undefined,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    width: '25%',
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
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} align="center">
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