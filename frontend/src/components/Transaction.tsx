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
  Stack,
  Chip,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import axios from 'axios';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker, DatePickerProps } from '@mui/x-date-pickers';
import {
  format,
  isValid,
  parse,
  parseISO,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  isSameDay,
  isSameMonth,
  isSameWeek
} from 'date-fns';
import { useClinic } from '../contexts/ClinicContext';

// Updated interface to match the BigQuery schema
interface Transaction {
  transactionNumber: string;
  type: string;
  status: string;
  balance: string;
  comment: string;
  cash: string;
  detailBalance: string;
  accountbalance: string;
  mainAccount: string;
  sender_id: string;
  senderName: string;
  senderPhone: string;
  recipient_id: string;
  recipientName: string;
  recipientPhone: string;
  createddate_myanmar: string;
  ClinicCode: string;
  ClinicName: string;
}

// Sample mock data to use when the backend is unavailable
const MOCK_TRANSACTIONS: Transaction[] = [
  {
    transactionNumber: '12574345549536022',
    type: 'Transfer',
    status: 'IN',
    balance: '90000.00',
    comment: 'Buy package - C~Max Face Serum 10',
    cash: '',
    detailBalance: '',
    accountbalance: '',
    mainAccount: '',
    sender_id: '123',
    senderName: 'Amy',
    senderPhone: '+9595900252537',
    recipient_id: '456',
    recipientName: 'Zun Ko Lwin',
    recipientPhone: '+959795025455',
    createddate_myanmar: '2025-04-01 14:48:13',
    ClinicCode: 'GTP',
    ClinicName: 'Great Time Plaza'
  },
  {
    transactionNumber: '12573495588204622',
    type: 'Transfer',
    status: 'OUT',
    balance: '2050000.00',
    comment: 'Ei Kyal',
    cash: '',
    detailBalance: '',
    accountbalance: '',
    mainAccount: '',
    sender_id: '789',
    senderName: 'Kay Thi Maw',
    senderPhone: '+9594200824444',
    recipient_id: '101',
    recipientName: 'Ei Kyal Sin Ko',
    recipientPhone: '+959266663900',
    createddate_myanmar: '2025-04-01 14:54:42',
    ClinicCode: 'GTP',
    ClinicName: 'Great Time Plaza'
  },
  {
    transactionNumber: '12573495598068122',
    type: 'Transfer',
    status: 'OUT',
    balance: '600000.00',
    comment: 'Buy package - Underarm Hair Removal x 10 times',
    cash: '',
    detailBalance: '',
    accountbalance: '',
    mainAccount: '',
    sender_id: '101',
    senderName: 'Ei Kyal Sin Ko',
    senderPhone: '+959266663900',
    recipient_id: '456',
    recipientName: 'Zun Ko Lwin',
    recipientPhone: '+959795025455',
    createddate_myanmar: '2025-04-01 14:56:20',
    ClinicCode: 'GTP',
    ClinicName: 'Great Time Plaza'
  }
];

const Transaction: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // Date filter states
  const [startDate, setStartDate] = useState<Date | null>(new Date());
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
      // Create date conditions for SQL query
      let dateCondition = '';
      if (startDate && endDate) {
        const formattedStartDate = format(startDate, 'yyyy-MM-dd');
        const formattedEndDate = format(endDate, 'yyyy-MM-dd');
        dateCondition = `AND DATE(createddate_myanmar) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'`;
      }

      // Build SQL query to fetch wallet transactions by clinic name
      // Hardcoding 'Fancy House' for testing
      const query = `
        SELECT 
          transactionNumber,
          type,
          status,
          balance,
          comment,
          cash,
          detailBalance,
          accountbalance,
          mainAccountName,
          sender_id,
          senderName,
          senderPhone,
          recipient_id,
          recipientName,
          recipientPhone,
          createddate_myanmar,
          ClinicCode,
          ClinicName
        FROM 
          \`piti-pass.passdb_prod.wallettransaction\`
        WHERE 
          ClinicName = 'Fancy House'
          ${dateCondition}
        ORDER BY 
          createddate_myanmar DESC
        LIMIT 100
      `;

      console.log('Executing wallet transaction query with hardcoded clinic:', query);
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
          console.log(`Fetched ${response.data.data.length} transactions for clinic: Fancy House`);
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
      console.error('Error loading transactions:', err);
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
        setError(`Error loading transactions: ${errorDetails}. Using sample data instead.`);
      }

      // Update mock data to use Fancy House as clinic name
      const mocksWithFancyHouse = MOCK_TRANSACTIONS.map(t => ({
        ...t,
        ClinicName: 'Fancy House',
        ClinicCode: 'FANCY'
      }));

      setTransactions(mocksWithFancyHouse);
      setIsMockData(true);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]); // Remove currentClinic from dependencies to prevent rerenders

  useEffect(() => {
    fetchTransactions();
  }, [retryCount, fetchTransactions]);

  // Parse transaction date safely
  const parseTransactionDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    try {
      // Try multiple date formats
      let date: Date | null = null;

      // First try as ISO string
      date = parseISO(dateString);

      // If not valid, try various formats
      if (!isValid(date)) {
        // Try yyyy-MM-dd HH:mm:ss format
        date = parse(dateString, 'yyyy-MM-dd HH:mm:ss', new Date());
      }

      if (!isValid(date)) {
        // Try dd/MM/yyyy format
        date = parse(dateString, 'dd/MM/yyyy', new Date());
      }

      if (!isValid(date)) {
        // Try MM/dd/yyyy format
        date = parse(dateString, 'MM/dd/yyyy', new Date());
      }

      // For debugging
      if (!isValid(date)) {
        console.warn(`Failed to parse date: ${dateString}`);
      } else {
        // Debug parsed date
        console.debug(`Parsed date: ${dateString} -> ${format(date, 'yyyy-MM-dd')}`);
      }

      return isValid(date) ? date : null;
    } catch (e) {
      console.error(`Error parsing date: ${dateString}`, e);
      return null;
    }
  };

  // Add comparison function for date sorting
  const compareValues = (key: keyof Transaction, a: Transaction, b: Transaction, direction: 'ascending' | 'descending') => {
    if (key === 'createddate_myanmar') {
      const dateA = parseTransactionDate(a[key] as string) || new Date(0);
      const dateB = parseTransactionDate(b[key] as string) || new Date(0);

      return direction === 'ascending'
        ? dateA.getTime() - dateB.getTime()
        : dateB.getTime() - dateA.getTime();
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

    // Format data for CSV
    const data = filteredTransactions.map(t => [
      t.createddate_myanmar,
      t.transactionNumber,
      t.type,
      t.status,
      t.balance,
      t.comment,
      t.accountbalance,
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

    // Always filter by 'Fancy House' clinic name (hardcoded for testing)
    filtered = filtered.filter(transaction =>
      transaction.ClinicName === 'Fancy House'
    );

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
          {(searchTerm || (startDate && endDate)) && (
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
              {(startDate && endDate) && (
                <Chip
                  label={`Range: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`}
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
          Showing {filteredTransactions.length} of {transactions.length} transactions
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
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                Date
                {sortConfig.key === 'createddate_myanmar' && (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5 }}>
                    {sortConfig.direction === 'ascending'
                      ? <ArrowUpwardIcon fontSize="small" />
                      : <ArrowDownwardIcon fontSize="small" />
                    }
                  </Box>
                )}
              </TableCell>
              <TableCell>Transaction Number</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Comment</TableCell>
              <TableCell>Balance</TableCell>
              <TableCell>Sender Name</TableCell>
              <TableCell>Sender Phone</TableCell>
              <TableCell>Recipient Name</TableCell>
              <TableCell>Recipient Phone</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction, index) => (
                <TableRow key={`${transaction.transactionNumber}-${index}`}>
                  {/* Date column - now first */}
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
                        '&:hover': {
                          backgroundColor: isDarkMode ? (
                            transaction.type === 'CREDIT' ? alpha(theme.palette.success.main, 1) :
                              transaction.type === 'DEBIT' ? alpha(theme.palette.error.main, 1) :
                                transaction.type === 'Transfer' ? alpha(theme.palette.primary.main, 1) :
                                  transaction.type === 'Deposit' ? alpha(theme.palette.info.main, 1) :
                                    transaction.type === 'Share' ? alpha(theme.palette.secondary.main, 1) :
                                      alpha(theme.palette.grey[600], 1)
                          ) : undefined
                        }
                      }}
                    />
                  </TableCell>

                  {/* Status column with colors based on IN/OUT */}
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