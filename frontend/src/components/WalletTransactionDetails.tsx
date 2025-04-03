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
  Breadcrumbs,
  Link as MuiLink,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ReplayIcon from '@mui/icons-material/Replay';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import axios from 'axios';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { useClinic } from '../contexts/ClinicContext';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

// Define Transaction interface with all required properties
interface Transaction {
  transactionNumber: string;
  createddate_myanmar: string;
  type: string;
  status: string;
  balance: string;
  comment: string | null;
  accountbalance: string;
  senderName: string | null;
  senderPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  [key: string]: string | null; // Index signature for dynamic access
}

// Mock data for when backend is unavailable
const MOCK_TRANSACTIONS: Transaction[] = [
  {
    ClinicName: 'Fancy House',
    transactionNumber: '21174358591610531',
    type: 'Transfer',
    status: 'IN',
    balance: '1000.00',
    comment: 'Buy points',
    accountbalance: '191548500.00',
    MainAccountName: 'Johnathan Lim',
    senderName: 'U Than Zaw',
    senderPhone: '+959501288',
    recipientName: 'Johnathan Lim',
    recipientPhone: '+95997760677',
    createddate_myanmar: '2025-04-02 15:55:16'
  },
  {
    ClinicName: 'Fancy House',
    transactionNumber: '21174358591610532',
    type: 'Transfer',
    status: 'OUT',
    balance: '5000.00',
    comment: 'Service payment',
    accountbalance: '190548500.00',
    MainAccountName: 'Johnathan Lim',
    senderName: 'Johnathan Lim',
    senderPhone: '+95997760677',
    recipientName: 'U Than Zaw',
    recipientPhone: '+959501288',
    createddate_myanmar: '2025-04-03 10:21:43'
  }
];

// Helper function to parse transaction date
const parseTransactionDate = (dateString: string): Date | null => {
  try {
    // Try Myanmar date format: DD/MM/YYYY
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // Fallback to ISO parsing
    return parseISO(dateString);
  } catch (error) {
    console.error('Error parsing date:', dateString, error);
    return null;
  }
};

// Helper function to compare values for sorting
const compareValues = (
  key: keyof Transaction, 
  a: Transaction, 
  b: Transaction, 
  direction: 'asc' | 'desc'
): number => {
  // Handle date sorting specially
  if (key === 'createddate_myanmar') {
    const dateA = parseTransactionDate(a[key] as string);
    const dateB = parseTransactionDate(b[key] as string);
    
    if (!dateA && !dateB) return 0;
    if (!dateA) return direction === 'asc' ? 1 : -1;
    if (!dateB) return direction === 'asc' ? -1 : 1;
    
    return direction === 'asc' 
      ? dateA.getTime() - dateB.getTime() 
      : dateB.getTime() - dateA.getTime();
  }
  
  // Handle numeric fields (balance, accountbalance)
  if (key === 'balance' || key === 'accountbalance') {
    const numA = parseFloat(a[key] as string || '0');
    const numB = parseFloat(b[key] as string || '0');
    return direction === 'asc' ? numA - numB : numB - numA;
  }
  
  // Default string comparison
  const valA = (a[key] || '').toString().toLowerCase();
  const valB = (b[key] || '').toString().toLowerCase();
  
  if (valA < valB) return direction === 'asc' ? -1 : 1;
  if (valA > valB) return direction === 'asc' ? 1 : -1;
  return 0;
};

// Properly define the component as a React functional component
const WalletTransactionDetails: React.FC = () => {
  // Get the wallet owner name from URL params
  const { ownerName } = useParams<{ ownerName: string }>();
  const decodedOwnerName = ownerName ? decodeURIComponent(ownerName) : '';
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  
  // Date filtering
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Transaction;
    direction: 'asc' | 'desc';
  }>({
    key: 'createddate_myanmar',
    direction: 'desc', // Default: newest first
  });
  
  // Get current clinic from context
  const { currentClinic } = useClinic();
  
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  
  // Add status filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const fetchTransactions = useCallback(async () => {
    if (!decodedOwnerName) {
      setError('No wallet owner specified');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Build SQL query to fetch transactions for the specific wallet owner
      // Hardcoding 'Fancy House' for testing like in previous components
      const query = `
        SELECT 
          ClinicName,
          ClinicCode,
          transactionNumber,
          type,
          status,
          balance,
          comment,
          cash,
          detailBalance,
          accountbalance,
          mainAccountID,
          MainAccountName,
          sender_id,
          senderName,
          senderPhone,
          recipient_id,
          recipientName,
          recipientPhone,
          createddate_myanmar
        FROM 
          \`piti-pass.passdb_prod.wallettransaction\`
        WHERE 
          ClinicName = 'Fancy House'
          AND MainAccountName = '${decodedOwnerName}'
        ORDER BY 
          createddate_myanmar DESC
        LIMIT 200
      `;
      
      console.log('Executing wallet transactions query for:', decodedOwnerName);
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
          console.log(`Fetched ${response.data.data.length} transactions for wallet owner: ${decodedOwnerName}`);
          
          setTransactions(response.data.data);
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
      console.error('Error loading wallet transactions:', err);
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED' || 
          err.code === 'ETIMEDOUT' || (err.response && err.response.status >= 500)) {
        setError('Connection to server timed out. Using sample transaction data.');
      } else if (err.response && err.response.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response && err.response.status === 403) {
        setError('You do not have permission to access this data.');
      } else {
        // Include more error details to help debugging
        const errorDetails = err.response?.data?.error || err.message || 'Unknown error';
        setError(`Error loading wallet transactions: ${errorDetails}. Using sample data instead.`);
      }
      
      // Use mock data with the current wallet owner name
      const mocksWithName = MOCK_TRANSACTIONS.map(transaction => ({
        ...transaction,
        MainAccountName: decodedOwnerName
      }));
      setTransactions(mocksWithName);
      setIsMockData(true);
    } finally {
      setLoading(false);
    }
  }, [decodedOwnerName]); // Only re-run when the owner name changes
  
  useEffect(() => {
    fetchTransactions();
  }, [retryCount, fetchTransactions]);
  
  // Request sort function
  const requestSort = (key: keyof Transaction) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
  };
  
  // Export to CSV function
  const exportToCSV = () => {
    // CSV Headers
    const headers = [
      'Date',
      'Transaction Number',
      'Type',
      'Status',
      'Amount',
      'Comment',
      'Balance',
      'Sender Name',
      'Sender Phone',
      'Recipient Name',
      'Recipient Phone'
    ];
    
    // Format data for CSV - using filteredTransactions to respect all applied filters
    const data = filteredTransactions.map(transaction => [
      transaction.createddate_myanmar,
      transaction.transactionNumber,
      transaction.type,
      transaction.status,
      transaction.balance,
      transaction.comment || '',
      transaction.accountbalance,
      transaction.senderName || 'N/A',
      transaction.senderPhone || 'N/A',
      transaction.recipientName || 'N/A',
      transaction.recipientPhone || 'N/A'
    ]);
    
    // Include status filter in the filename if active
    const statusTag = statusFilter !== 'all' ? `_${statusFilter}` : '';
    
    // Combine headers and data
    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map(cell => {
        // Escape commas and quotes in cell content
        const cellContent = String(cell || '').replace(/"/g, '""');
        return cellContent.includes(',') ? `"${cellContent}"` : cellContent;
      }).join(','))
    ].join('\n');
    
    // Create and download file with status info in filename if filtered
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${decodedOwnerName}_transactions${statusTag}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Add handler for status filter change
  const handleStatusFilterChange = (event: SelectChangeEvent) => {
    setStatusFilter(event.target.value);
  };
  
  // Update the filter effect with proper dependency typing
  useEffect(() => {
    let filtered = [...transactions];
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(transaction => 
        Object.values(transaction).some(value => 
          value?.toString().toLowerCase().includes(term)
        )
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(transaction => 
        transaction.status === statusFilter
      );
    }
    
    // Apply date range filter
    if (startDate && endDate) {
      filtered = filtered.filter(transaction => {
        const transactionDate = parseTransactionDate(transaction.createddate_myanmar);
        if (!transactionDate) return false;
        
        // Create end of day for the end date to include the full day
        const endOfDayDate = new Date(endDate);
        endOfDayDate.setHours(23, 59, 59, 999);
        
        return isWithinInterval(transactionDate, { 
          start: startDate, 
          end: endOfDayDate 
        });
      });
    }
    
    // Apply sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => 
        compareValues(sortConfig.key as keyof Transaction, a, b, sortConfig.direction)
      );
    }
    
    setFilteredTransactions(filtered);
  }, [transactions, searchTerm, statusFilter, startDate, endDate, sortConfig]);
  
  const handleSearchClear = () => {
    setSearchTerm('');
  };
  
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
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
      {/* Breadcrumbs navigation */}
      <Breadcrumbs 
        separator={<NavigateNextIcon fontSize="small" />} 
        aria-label="breadcrumb"
        sx={{ mb: 2 }}
      >
        <MuiLink
          component={RouterLink}
          to="/wallet"
          underline="hover"
          color={isDarkMode ? "primary.light" : "primary"}
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          <AccountBalanceWalletIcon sx={{ mr: 0.5 }} fontSize="small" />
          Wallet Accounts
        </MuiLink>
        <Typography 
          color="text.primary"
          sx={{
            color: isDarkMode ? theme.palette.common.white : undefined,
            fontWeight: 'medium'
          }}
        >
          {decodedOwnerName}
        </Typography>
      </Breadcrumbs>
      
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
        {decodedOwnerName}'s Transactions
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
          {error || "Using sample transaction data. Real transaction data is currently unavailable due to database access issues."}
        </Alert>
      )}
      
      {/* Search Field, Status Filter, and Export */}
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
        <Box sx={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: 2, 
          alignItems: 'center'
        }}>
          <TextField
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
              width: { xs: '100%', sm: '250px' },
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
          
          {/* Status Filter */}
          <FormControl 
            size="small" 
            sx={{ 
              minWidth: 120,
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
              '& .MuiInputLabel-root': {
                color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined,
              },
              '& .MuiSvgIcon-root': {
                color: isDarkMode ? theme.palette.common.white : undefined,
              }
            }}
          >
            <InputLabel id="status-filter-label">Status</InputLabel>
            <Select
              labelId="status-filter-label"
              id="status-filter"
              value={statusFilter}
              label="Status"
              onChange={handleStatusFilterChange}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="IN">IN</MenuItem>
              <MenuItem value="OUT">OUT</MenuItem>
            </Select>
          </FormControl>
        </Box>
        
        {/* Export CSV Button */}
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
      </Box>
      
      <Box sx={{ mb: 1 }}>
        <Typography 
          variant="body2" 
          color={isDarkMode ? "rgba(255,255,255,0.7)" : "text.secondary"}
          sx={{ fontStyle: 'italic' }}
        >
          Showing {filteredTransactions.length} of {transactions.length} transactions for {decodedOwnerName}
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
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  DATE
                  {sortConfig.key === 'createddate_myanmar' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'asc' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              <TableCell>TRANSACTION NUMBER</TableCell>
              
              <TableCell 
                onClick={() => requestSort('type')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  TYPE
                  {sortConfig.key === 'type' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'asc' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              <TableCell 
                onClick={() => requestSort('status')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  STATUS
                  {sortConfig.key === 'status' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'asc' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              <TableCell 
                onClick={() => requestSort('balance')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                  textAlign: 'right'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  AMOUNT
                  {sortConfig.key === 'balance' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'asc' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              <TableCell>COMMENT</TableCell>
              
              <TableCell 
                onClick={() => requestSort('accountbalance')}
                sx={{ 
                  cursor: 'pointer', 
                  '&:hover': { 
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.primary.dark, 0.3) 
                      : alpha(theme.palette.primary.light, 0.3)
                  },
                  textAlign: 'right'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  BALANCE
                  {sortConfig.key === 'accountbalance' && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                      {sortConfig.direction === 'asc' 
                        ? <ArrowUpwardIcon fontSize="small" />
                        : <ArrowDownwardIcon fontSize="small" />
                      }
                    </Box>
                  )}
                </Box>
              </TableCell>
              
              <TableCell>SENDER NAME</TableCell>
              <TableCell>SENDER PHONE</TableCell>
              <TableCell>RECIPIENT NAME</TableCell>
              <TableCell>RECIPIENT PHONE</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction, index) => (
                <TableRow key={`${transaction.transactionNumber}-${index}`}>
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transaction.createddate_myanmar}
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
                    <Chip
                      label={transaction.type}
                      size="small"
                      color={transaction.type === 'CREDIT' ? 'success' : 
                             transaction.type === 'DEBIT' ? 'error' : 
                             transaction.type === 'Transfer' ? 'primary' : 
                             transaction.type === 'Deposit' ? 'info' : 
                             transaction.type === 'Share' ? 'secondary' : 
                             'default'}
                      variant={isDarkMode ? 'filled' : 'filled'}
                      sx={{ 
                        minWidth: '70px',
                        fontWeight: 'bold',
                        backgroundColor: isDarkMode ? (
                          transaction.type === 'CREDIT' ? alpha(theme.palette.success.main, 0.9) : 
                          transaction.type === 'DEBIT' ? alpha(theme.palette.error.main, 0.9) : 
                          transaction.type === 'Transfer' ? alpha(theme.palette.primary.main, 0.9) : 
                          transaction.type === 'Deposit' ? alpha(theme.palette.info.main, 0.9) : 
                          transaction.type === 'Share' ? alpha(theme.palette.secondary.main, 0.9) : 
                          alpha(theme.palette.grey[600], 0.9)
                        ) : undefined,
                        color: isDarkMode ? theme.palette.common.white : undefined,
                      }}
                    />
                  </TableCell>
                  
                  <TableCell>
                    <Chip
                      label={transaction.status}
                      size="small"
                      color={transaction.status === 'IN' ? 'success' : 
                             transaction.status === 'OUT' ? 'error' : 
                             'default'}
                      variant={isDarkMode ? 'filled' : 'filled'}
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
                  
                  <TableCell sx={{ 
                    color: isDarkMode 
                      ? (transaction.type === 'CREDIT' ? theme.palette.success.light : transaction.type === 'DEBIT' ? theme.palette.error.light : theme.palette.common.white) 
                      : (transaction.type === 'CREDIT' ? theme.palette.success.main : transaction.type === 'DEBIT' ? theme.palette.error.main : undefined),
                    fontWeight: 'bold',
                    textAlign: 'right'
                  }}>
                    {parseFloat(transaction.balance || '0').toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </TableCell>
                  
                  <TableCell sx={{ color: isDarkMode ? alpha(theme.palette.common.white, 0.7) : undefined }}>
                    {transaction.comment || ''}
                  </TableCell>
                  
                  <TableCell sx={{ 
                    color: isDarkMode ? theme.palette.common.white : undefined,
                    fontWeight: 'medium',
                    textAlign: 'right'
                  }}>
                    {parseFloat(transaction.accountbalance || '0').toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </TableCell>
                  
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transaction.senderName || 'N/A'}
                  </TableCell>
                  
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transaction.senderPhone || 'N/A'}
                  </TableCell>
                  
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transaction.recipientName || 'N/A'}
                  </TableCell>
                  
                  <TableCell sx={{ color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transaction.recipientPhone || 'N/A'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11} align="center">
                  <Box sx={{ py: 3, color: isDarkMode ? theme.palette.common.white : undefined }}>
                    {transactions.length > 0 ? 
                      `No matches for the current filters. Try a different search term.` : 
                      `No transaction data available for ${decodedOwnerName}`
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

export default WalletTransactionDetails; 