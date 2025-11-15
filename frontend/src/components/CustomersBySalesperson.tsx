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
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Alert
} from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';
import * as XLSX from 'xlsx';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import { formatCurrency } from '../utils/currency';

interface Customer {
  name: string;
  phoneNumber: string;
  memberId: string;
  totalSpend: number;
  lastInvoiceNumber: string;
  lastPurchaseDate: string;
}

type SortField = 'totalSpend' | 'lastPurchaseDate' | 'name';
type SortOrder = 'asc' | 'desc';

const CustomersBySalesperson: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  
  // State variables
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [salesPeopleLoading, setSalesPeopleLoading] = useState(true);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastPurchaseDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(25);

  // Fetch salespeople on component mount
  useEffect(() => {
    if (currentClinic) {
      fetchSalespeople();
    }
  }, [currentClinic]);

  // Apply search and sort whenever data changes
  useEffect(() => {
    applyFiltersAndSort();
  }, [customers, searchTerm, sortField, sortOrder]);

  const fetchSalespeople = useCallback(async () => {
    if (!currentClinic) {
      setError('Please select a clinic first.');
      setSalesPeopleLoading(false);
      return;
    }

    try {
      setSalesPeopleLoading(true);
      setError('');

      const query = `
        SELECT DISTINCT
          SellerName
        FROM 
          great_time.MainPaymentView
        WHERE 
          SellerName IS NOT NULL
          AND SellerName != ''
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
        ORDER BY 
          SellerName
      `;

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!response.data.success) {
        throw new Error('Failed to fetch salespeople: ' + (response.data.error || 'Unknown error'));
      }

      const salespeopleData = response.data.data || [];
      setSalespeople(salespeopleData.map((item: any) => item.SellerName));
    } catch (err: any) {
      console.error('Error fetching salespeople:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch salespeople');
    } finally {
      setSalesPeopleLoading(false);
    }
  }, [currentClinic]);

  const fetchCustomers = useCallback(async () => {
    if (!selectedSalesperson) {
      setValidationError('Please select a salesperson.');
      return;
    }

    if (!currentClinic) {
      setError('Please select a clinic first.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setValidationError('');

      // Escape single quotes in salesperson name
      const escapedSalesperson = selectedSalesperson.replace(/'/g, "''");

      const query = `
      WITH CustomersFromSalesperson AS (
        -- First, identify customers who have bought from this salesperson (at least once)
        SELECT DISTINCT
          CustomerName,
          CustomerPhoneNumber
        FROM 
          great_time.MainPaymentView
        WHERE 
          CustomerName IS NOT NULL 
          AND CustomerPhoneNumber IS NOT NULL
          AND SellerName = '${escapedSalesperson}'
          AND PaymentStatus = 'PAID'
          AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
      ),
      AllCustomerInvoices AS (
        -- Get all invoices for these customers (deduplicated to one row per invoice)
        SELECT 
          p.CustomerName,
          p.CustomerPhoneNumber,
          p.InvoiceNumber,
          p.OrderCreatedDate,
          MAX(p.MemberId) AS MemberId,
          MAX(CAST(p.NetTotal AS FLOAT64)) AS InvoiceNetTotal
        FROM 
          great_time.MainPaymentView p
        INNER JOIN
          CustomersFromSalesperson c
        ON
          p.CustomerName = c.CustomerName
          AND p.CustomerPhoneNumber = c.CustomerPhoneNumber
        WHERE 
          p.PaymentStatus = 'PAID'
          AND NOT STARTS_WITH(p.InvoiceNumber, 'CO-')
          AND p.PaymentMethod != 'PASS'
          AND LOWER(p.ClinicCode) = LOWER('${currentClinic.code}')
        GROUP BY
          p.CustomerName, p.CustomerPhoneNumber, p.InvoiceNumber, p.OrderCreatedDate
      ),
      CustomerPurchasesRanked AS (
        -- Add row number to find the most recent purchase
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          InvoiceNumber,
          OrderCreatedDate,
          MemberId,
          InvoiceNetTotal,
          ROW_NUMBER() OVER (PARTITION BY CustomerName, CustomerPhoneNumber ORDER BY OrderCreatedDate DESC) AS rn
        FROM AllCustomerInvoices
      ),
      CustomerSummary AS (
        -- Now sum all invoices for each customer
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          MAX(MemberId) AS MemberId,
          SUM(InvoiceNetTotal) AS TotalSpend,
          MAX(CASE WHEN rn = 1 THEN InvoiceNumber END) AS LastInvoiceNumber,
          MAX(CASE WHEN rn = 1 THEN FORMAT_TIMESTAMP('%d %b, %Y', OrderCreatedDate) END) AS LastPurchaseDate
        FROM
          CustomerPurchasesRanked
        GROUP BY
          CustomerName, CustomerPhoneNumber
      )
      SELECT 
        CustomerName AS name,
        CustomerPhoneNumber AS phoneNumber,
        COALESCE(MemberId, 'N/A') AS memberId,
        TotalSpend AS totalSpend,
        LastInvoiceNumber AS lastInvoiceNumber,
        LastPurchaseDate AS lastPurchaseDate
      FROM 
        CustomerSummary
      ORDER BY 
        LastPurchaseDate DESC
      `;

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!response.data.success) {
        throw new Error('Failed to fetch customers: ' + (response.data.error || 'Unknown error'));
      }

      const customerData = response.data.data || [];
      setCustomers(customerData);
      setPage(0); // Reset to first page
    } catch (err: any) {
      console.error('Error fetching customers:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  }, [selectedSalesperson, currentClinic]);

  const applyFiltersAndSort = () => {
    let filtered = [...customers];

    // Apply search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (customer) =>
          customer.name.toLowerCase().includes(lowerSearch) ||
          customer.phoneNumber.includes(lowerSearch) ||
          customer.memberId.toLowerCase().includes(lowerSearch)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'totalSpend':
          aValue = a.totalSpend || 0;
          bValue = b.totalSpend || 0;
          break;
        case 'lastPurchaseDate':
          // Convert date strings to Date objects for comparison
          aValue = a.lastPurchaseDate ? new Date(a.lastPurchaseDate).getTime() : 0;
          bValue = b.lastPurchaseDate ? new Date(b.lastPurchaseDate).getTime() : 0;
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredCustomers(filtered);
  };

  const handleSalespersonChange = (event: SelectChangeEvent<string>) => {
    setSelectedSalesperson(event.target.value);
    setCustomers([]);
    setFilteredCustomers([]);
    setValidationError('');
    setError('');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle sort order if clicking the same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to desc order
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleExport = () => {
    if (filteredCustomers.length === 0) {
      return;
    }

    // Prepare data for export
    const exportData = filteredCustomers.map((customer) => ({
      'Customer Name': customer.name,
      'Phone Number': customer.phoneNumber,
      'Member ID': customer.memberId,
      'Total Amount Spent': customer.totalSpend,
      'Last Purchase Date': customer.lastPurchaseDate,
      'Last Invoice Number': customer.lastInvoiceNumber
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Customer Name
      { wch: 15 }, // Phone Number
      { wch: 15 }, // Member ID
      { wch: 20 }, // Total Amount Spent
      { wch: 20 }, // Last Purchase Date
      { wch: 20 }  // Last Invoice Number
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');

    // Generate filename
    const sanitizedSalesperson = selectedSalesperson.replace(/[^a-z0-9]/gi, '_');
    const filename = `customers_by_${sanitizedSalesperson}_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  };

  const paginatedCustomers = filteredCustomers.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box sx={{ bgcolor: '#111923', minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={() => navigate(-1)}
            sx={{
              mr: 2,
              color: 'white',
              bgcolor: 'rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" sx={{ color: 'white', fontWeight: 'bold' }}>
            Customers by Salesperson
          </Typography>
        </Box>
        <IconButton
          onClick={selectedSalesperson ? fetchCustomers : fetchSalespeople}
          sx={{
            color: 'white',
            bgcolor: 'rgba(255,255,255,0.1)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
          }}
          title="Refresh"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Salesperson Selection */}
      <Paper sx={{ p: 3, bgcolor: '#1a2234', mb: 3, borderRadius: 2, border: '1px solid #2d3748' }}>
        <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 2, fontWeight: 600 }}>
          Select Salesperson
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 300 }}>
            <InputLabel sx={{ color: '#9ca3af' }}>Salesperson</InputLabel>
            <Select
              value={selectedSalesperson}
              onChange={handleSalespersonChange}
              label="Salesperson"
              disabled={salesPeopleLoading}
              sx={{
                bgcolor: '#111923',
                color: '#f3f4f6',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#2d3748'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#4a5568'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3b82f6'
                }
              }}
            >
              <MenuItem value="">
                <em>Select a salesperson</em>
              </MenuItem>
              {salespeople.map((salesperson) => (
                <MenuItem key={salesperson} value={salesperson}>
                  {salesperson}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={fetchCustomers}
            disabled={!selectedSalesperson || loading}
            sx={{
              bgcolor: '#3b82f6',
              '&:hover': { bgcolor: '#2563eb' },
              '&.Mui-disabled': {
                bgcolor: '#1f2937',
                color: '#4b5563'
              }
            }}
          >
            {loading ? <CircularProgress size={24} /> : 'Load Customers'}
          </Button>
        </Box>

        {/* Validation Error */}
        {validationError && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {validationError}
          </Alert>
        )}
      </Paper>

      {/* Error Display */}
      {error && !validationError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Customer Grid */}
      {selectedSalesperson && customers.length > 0 && (
        <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748' }}>
          {/* Search and Export Controls */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search by name, phone, or member ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#9ca3af' }} />
                  </InputAdornment>
                ),
                sx: {
                  bgcolor: '#111923',
                  color: '#f3f4f6',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#2d3748'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#4a5568'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#3b82f6'
                  }
                }
              }}
              sx={{ minWidth: 300 }}
              size="small"
            />
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExport}
              disabled={filteredCustomers.length === 0}
              sx={{
                borderColor: '#2d3748',
                color: '#d1d5db',
                '&:hover': {
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                },
                '&.Mui-disabled': {
                  borderColor: '#1f2937',
                  color: '#4b5563'
                }
              }}
            >
              Export to Excel
            </Button>
          </Box>

          {/* Results Summary */}
          <Typography variant="body2" sx={{ color: '#9ca3af', mb: 2 }}>
            Showing {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} for {selectedSalesperson}
          </Typography>

          {/* Table */}
          <TableContainer
            sx={{
              maxHeight: 'calc(100vh - 450px)',
              overflowY: 'auto',
              overflowX: 'auto',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px'
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#111923'
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#2d3748',
                borderRadius: '4px'
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: '#3b82f6'
              }
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748',
                      cursor: 'pointer',
                      '&:hover': { color: '#3b82f6' }
                    }}
                    onClick={() => handleSort('name')}
                  >
                    Customer Name {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Phone Number
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Member ID
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748',
                      textAlign: 'right',
                      cursor: 'pointer',
                      '&:hover': { color: '#3b82f6' }
                    }}
                    onClick={() => handleSort('totalSpend')}
                  >
                    Total Amount Spent {sortField === 'totalSpend' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748',
                      cursor: 'pointer',
                      '&:hover': { color: '#3b82f6' }
                    }}
                    onClick={() => handleSort('lastPurchaseDate')}
                  >
                    Last Purchase Date {sortField === 'lastPurchaseDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Last Invoice Number
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedCustomers.map((customer, index) => (
                  <TableRow
                    key={`${customer.phoneNumber}-${index}`}
                    sx={{
                      '&:hover': { bgcolor: '#1a2234' },
                      bgcolor: index % 2 === 0 ? '#111923' : '#121826'
                    }}
                  >
                    <TableCell
                      sx={{
                        color: '#f3f4f6',
                        borderBottom: '1px solid #2d3748',
                        cursor: 'pointer',
                        '&:hover': {
                          color: '#3b82f6',
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => navigate(`/customers/${encodeURIComponent(customer.phoneNumber)}`)}
                    >
                      {customer.name}
                    </TableCell>
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {customer.phoneNumber}
                    </TableCell>
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {customer.memberId}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#10b981',
                        borderBottom: '1px solid #2d3748',
                        textAlign: 'right',
                        fontWeight: 600
                      }}
                    >
                      {formatCurrency(customer.totalSpend, currentClinic)}
                    </TableCell>
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {customer.lastPurchaseDate}
                    </TableCell>
                    <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {customer.lastInvoiceNumber || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={Math.ceil(filteredCustomers.length / rowsPerPage)}
              page={page + 1}
              onChange={(_e, newPage) => setPage(newPage - 1)}
              sx={{
                '& .MuiPaginationItem-root': {
                  color: '#d1d5db',
                  borderColor: '#2d3748'
                },
                '& .MuiPaginationItem-root.Mui-selected': {
                  bgcolor: '#3b82f6',
                  '&:hover': {
                    bgcolor: '#2563eb'
                  }
                }
              }}
            />
          </Box>
        </Paper>
      )}

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress sx={{ color: '#3b82f6' }} />
        </Box>
      )}

      {/* No Data State */}
      {selectedSalesperson && !loading && customers.length === 0 && !error && (
        <Paper sx={{ p: 4, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748', textAlign: 'center' }}>
          <Typography sx={{ color: '#9ca3af' }}>
            No customers found for {selectedSalesperson}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default CustomersBySalesperson;

