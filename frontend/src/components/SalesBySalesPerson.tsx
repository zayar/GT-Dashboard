import React, { useState, useEffect, useCallback } from 'react';
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
  OutlinedInput
} from '@mui/material';
import axios from 'axios';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { useNavigate } from 'react-router-dom';

interface SalesPersonData {
  salesPerson: string;
  transactionCount: number;
  totalAmount: number;
}

interface Transaction {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  CustomerPhoneNumber: string;
  ServiceName: string;
  ServicePackageName: string | null;
  PaymentMethod: string;
  PaymentStatus: string;
  InvoiceNetTotal: number;
  SellerName: string | null;
}

const SalesBySalesPerson: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timePeriod, setTimePeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [salesBySalesPerson, setSalesBySalesPerson] = useState<SalesPersonData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [transactionsRowsPerPage, setTransactionsRowsPerPage] = useState(10);
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  // Function to fetch sales data
  const fetchSalesData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

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

      // Format dates for SQL query
      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
      };

      const formattedStartDate = formatDate(queryStartDate);
      const formattedEndDate = formatDate(queryEndDate);

      // SQL query to get all transactions for the date range
      const query = `
      SELECT 
        FORMAT_DATE('%Y-%m-%d', DATE(OrderCreatedDate)) AS Date,
        InvoiceNumber,
        CustomerName,
        CustomerPhoneNumber,
        ServiceName,
        ServicePackageName,
        PaymentMethod,
        PaymentStatus,
        CAST(NetTotal AS FLOAT64) AS InvoiceNetTotal,
        SellerName
      FROM 
        great_time.QueenPaymentView
      WHERE 
        DATE(OrderCreatedDate) BETWEEN '${formattedStartDate}' AND '${formattedEndDate}'
        AND PaymentStatus = 'PAID'
        AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
        AND PaymentMethod != 'PASS'
      ORDER BY 
        Date DESC, InvoiceNumber;
      `;

      console.log('Executing query:', query);

      const response = await axios.post('/api/query',
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000 // 15 seconds timeout
        }
      );

      if (!response.data.success) {
        throw new Error('Failed to fetch sales data: ' + (response.data.error || 'Unknown error'));
      }

      const salesData = response.data.data || [];
      console.log('Sales data fetched successfully, records:', salesData.length);

      // Filter out records with 0 MMK value
      const filteredSalesData = salesData.filter((sale: Transaction) => 
        sale.InvoiceNetTotal && sale.InvoiceNetTotal > 0
      );

      setTransactions(filteredSalesData);
      setFilteredTransactions(filteredSalesData);
      
      // Process data for sales by sales person summary
      processDataForSalesPerson(filteredSalesData);

      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching sales data:', error);
      setError(`Failed to load sales data: ${error.message || 'Unknown error'}`);
      setLoading(false);
    }
  }, [timePeriod, startDate, endDate]);

  // Function to process sales data by sales person
  const processDataForSalesPerson = (data: Transaction[]) => {
    if (!data.length) {
      setSalesBySalesPerson([]);
      return;
    }

    // Group by sales person
    const salesPersonMap = new Map<string, { count: number; total: number }>();

    data.forEach(transaction => {
      const salesPerson = transaction.SellerName || 'Unknown';
      const amount = Number(transaction.InvoiceNetTotal) || 0;

      if (!salesPersonMap.has(salesPerson)) {
        salesPersonMap.set(salesPerson, { count: 0, total: 0 });
      }

      const current = salesPersonMap.get(salesPerson)!;
      salesPersonMap.set(salesPerson, {
        count: current.count + 1,
        total: current.total + amount
      });
    });

    // Convert to array for rendering
    const salesData = Array.from(salesPersonMap.entries()).map(([salesPerson, data]) => ({
      salesPerson,
      transactionCount: data.count,
      totalAmount: data.total
    }));

    // Sort by total amount (highest first)
    salesData.sort((a, b) => b.totalAmount - a.totalAmount);
    
    setSalesBySalesPerson(salesData);
  };

  // Handle time period change
  const handleTimePeriodChange = (event: SelectChangeEvent<'daily' | 'weekly' | 'monthly' | 'custom'>) => {
    setTimePeriod(event.target.value as 'daily' | 'weekly' | 'monthly' | 'custom');
    setTransactionsPage(0); // Reset page on filter change
  };

  // Initial data fetch
  useEffect(() => {
    fetchSalesData();
  }, [fetchSalesData]);

  // Calculate totals
  const totalTransactions = salesBySalesPerson.reduce((sum, person) => sum + person.transactionCount, 0);
  const totalAmount = salesBySalesPerson.reduce((sum, person) => sum + person.totalAmount, 0);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#101924' }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: '1200px', margin: '0 auto', bgcolor: '#101924', minHeight: '100vh' }}>
        <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: '8px', mb: 3 }}>
          <Typography variant="h5" sx={{ color: '#e2e8f0', mb: 2 }}>
            Error Loading Sales Data
          </Typography>
          <Typography variant="body1" sx={{ color: '#94a3b8' }}>
            {error}
          </Typography>
          <Box sx={{ mt: 3 }}>
            <button
              onClick={() => fetchSalesData()}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md shadow-md"
            >
              Retry
            </button>
          </Box>
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
    <Box sx={{ p: 3, maxWidth: '1200px', margin: '0 auto', bgcolor: '#101924', minHeight: '100vh' }}>
      {/* Page header */}
      <Typography variant="h4" sx={{ mb: 3, color: '#e2e8f0', fontWeight: 'bold' }}>
        Sales by Sales Person
      </Typography>
      
      {/* Filters */}
      <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: '8px', mb: 4 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          <Box sx={{ minWidth: 200 }}>
            <FormControl fullWidth variant="outlined" size="small">
              <InputLabel id="time-period-label" sx={{ color: '#94a3b8' }}>Time Period</InputLabel>
              <Select
                labelId="time-period-label"
                value={timePeriod}
                onChange={handleTimePeriodChange}
                input={<OutlinedInput label="Time Period" />}
                sx={{
                  bgcolor: '#101924',
                  color: '#f1f5f9',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' }
                }}
              >
                <MenuItem value="daily" sx={{ bgcolor: '#101924', color: '#f1f5f9' }}>Today</MenuItem>
                <MenuItem value="weekly" sx={{ bgcolor: '#101924', color: '#f1f5f9' }}>Last 7 Days</MenuItem>
                <MenuItem value="monthly" sx={{ bgcolor: '#101924', color: '#f1f5f9' }}>Last 30 Days</MenuItem>
                <MenuItem value="custom" sx={{ bgcolor: '#101924', color: '#f1f5f9' }}>Custom Range</MenuItem>
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
                        bgcolor: '#101924',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                        '& .MuiInputLabel-root': { color: '#94a3b8' },
                        '& .MuiInputBase-input': { color: '#f1f5f9' },
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
                        bgcolor: '#101924',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                        '& .MuiInputLabel-root': { color: '#94a3b8' },
                        '& .MuiInputBase-input': { color: '#f1f5f9' },
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
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Showing data for: <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{getDateRangeLabel()}</span>
          </Typography>
          
          <Box>
            <Typography variant="body2" sx={{ color: '#94a3b8', display: 'inline' }}>
              Total Sales: <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0 })} MMK</span>
            </Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8', display: 'inline', ml: 3 }}>
              Transactions: <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{totalTransactions}</span>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {!loading && !error && (!transactions.length || !salesBySalesPerson.length) && (
        <Box 
          sx={{ 
            p: 3, 
            bgcolor: '#1a2235', 
            borderRadius: 2,
            textAlign: 'center',
            mb: 2,
            border: '1px solid #2d3748'
          }}
        >
          <Typography variant="body1" color="#d1d5db">
            No sales data available for the selected time period.
          </Typography>
        </Box>
      )}
      
      {!loading && !error && transactions.length > 0 && salesBySalesPerson.length > 0 && (
        <>
          {/* Sales Summary by Sales Person */}
          <Paper elevation={0} sx={{ p: 3, bgcolor: '#1a2235', mb: 3, borderRadius: '8px', border: '1px solid #2d3748' }}>
            <Typography variant="h6" mb={2} color="#f3f4f6">Sales Summary</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}>Sales Person</TableCell>
                    <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }} align="center">Transaction Count</TableCell>
                    <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }} align="right">Total Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {salesBySalesPerson.map((salesPerson, index) => (
                    <TableRow key={index} sx={{
                      '&:hover': {
                        bgcolor: '#242f3d',
                      },
                      bgcolor: '#111923',
                      '&:nth-of-type(odd)': {
                        bgcolor: '#121826',
                      },
                      borderBottom: '1px solid #2d3748',
                      cursor: 'pointer'
                    }} onClick={() => {
                      // Filter transactions to just this sales person
                      const filtered = transactions.filter(t => 
                        (t.SellerName || 'Unknown') === salesPerson.salesPerson
                      );
                      setFilteredTransactions(filtered);
                      setTransactionsPage(0);
                    }}>
                      <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                        {salesPerson.salesPerson}
                      </TableCell>
                      <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }} align="center">
                        {salesPerson.transactionCount}
                      </TableCell>
                      <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }} align="right">
                        {salesPerson.totalAmount.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })} MMK
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total row */}
                  <TableRow sx={{ bgcolor: '#1a2235', fontWeight: 'bold' }}>
                    <TableCell sx={{ color: '#f3f4f6', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }}>
                      Total
                    </TableCell>
                    <TableCell sx={{ color: '#f3f4f6', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }} align="center">
                      {totalTransactions}
                    </TableCell>
                    <TableCell sx={{ color: '#f3f4f6', fontWeight: 'bold', borderBottom: '1px solid #2d3748' }} align="right">
                      {totalAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      })} MMK
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Detailed Transactions Table */}
          <Paper elevation={0} sx={{ p: 3, bgcolor: '#1a2235', borderRadius: '8px', border: '1px solid #2d3748' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" color="#f3f4f6">Detailed Transactions</Typography>
              {filteredTransactions.length !== transactions.length && (
                <button
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded"
                  onClick={() => {
                    setFilteredTransactions(transactions);
                    setTransactionsPage(0);
                  }}
                >
                  Show All
                </button>
              )}
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <TableContainer sx={{ 
                bgcolor: '#1a2235',
                border: '1px solid #2d3748',
                '&::-webkit-scrollbar': {
                  width: '8px',
                  height: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: '#111923',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: '#2d3748',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  backgroundColor: '#4a5568',
                },
              }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Date</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Sales Person</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Invoice</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Customer Name</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Service</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Package</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Payment Method</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}>Status</TableCell>
                      <TableCell sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db', 
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }} align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTransactions
                      .slice(
                        transactionsPage * transactionsRowsPerPage, 
                        transactionsPage * transactionsRowsPerPage + transactionsRowsPerPage
                      )
                      .map((transaction, index) => (
                        <TableRow key={`${transaction.InvoiceNumber}-${index}`} sx={{
                          '&:hover': {
                            bgcolor: '#242f3d',
                          },
                          bgcolor: '#111923',
                          '&:nth-of-type(odd)': {
                            bgcolor: '#121826',
                          },
                          borderBottom: '1px solid #2d3748'
                        }}>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.Date}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.SellerName || '-'}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.InvoiceNumber}</TableCell>
                          <TableCell 
                            sx={{ 
                              color: '#3b82f6', 
                              borderBottom: '1px solid #2d3748',
                              cursor: 'pointer',
                              '&:hover': {
                                textDecoration: 'underline'
                              } 
                            }}
                            onClick={() => navigate(`/customers/${encodeURIComponent(transaction.CustomerPhoneNumber || transaction.CustomerName)}`)}
                          >
                            {transaction.CustomerName}
                          </TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.ServiceName}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.ServicePackageName || '-'}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.PaymentMethod}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{transaction.PaymentStatus}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }} align="right">
                            {Number(transaction.InvoiceNetTotal).toLocaleString('en-US', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0
                            })} MMK
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
                    color: '#f3f4f6',
                    bgcolor: '#101924',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
                  }}
                  size="small"
                >
                  <MenuItem value={5} sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>5 per page</MenuItem>
                  <MenuItem value={10} sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>10 per page</MenuItem>
                  <MenuItem value={25} sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>25 per page</MenuItem>
                </Select>
                <Pagination
                  count={Math.ceil(filteredTransactions.length / transactionsRowsPerPage)}
                  page={transactionsPage + 1}
                  onChange={(event, newPage) => setTransactionsPage(newPage - 1)}
                  sx={{
                    '& .MuiPaginationItem-root': {
                      color: '#d1d5db',
                    },
                    '& .MuiPaginationItem-root.Mui-selected': {
                      bgcolor: '#3b82f6',
                      color: '#ffffff',
                      '&:hover': {
                        bgcolor: '#2563eb'
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