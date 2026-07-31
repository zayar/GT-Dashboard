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
    <Box sx={{ bgcolor: 'var(--surface-secondary)', minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={() => navigate(-1)}
            sx={{
              mr: 2,
              color: 'var(--text-primary)',
              bgcolor: 'rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" sx={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
            Customers by Salesperson
          </Typography>
        </Box>
        <IconButton
          onClick={selectedSalesperson ? fetchCustomers : fetchSalespeople}
          sx={{
            color: 'var(--text-primary)',
            bgcolor: 'rgba(255,255,255,0.1)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
          }}
          title="Refresh"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Salesperson Selection */}
      <Paper sx={{ p: 3, bgcolor: 'var(--surface)', mb: 3, borderRadius: 2, border: '1px solid var(--border)' }}>
        <Typography variant="h6" sx={{ color: 'var(--text-primary)', mb: 2, fontWeight: 600 }}>
          Select Salesperson
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 300 }}>
            <InputLabel sx={{ color: 'var(--text-secondary)' }}>Salesperson</InputLabel>
            <Select
              value={selectedSalesperson}
              onChange={handleSalespersonChange}
              label="Salesperson"
              disabled={salesPeopleLoading}
              sx={{
                bgcolor: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--border)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--text-muted)'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--primary)'
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
              bgcolor: 'var(--primary)',
              '&:hover': { bgcolor: 'var(--primary-hover)' },
              '&.Mui-disabled': {
                bgcolor: 'var(--surface-secondary)',
                color: 'var(--border-strong)'
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
        <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border)' }}>
          {/* Search and Export Controls */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search by name, phone, or member ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'var(--text-secondary)' }} />
                  </InputAdornment>
                ),
                sx: {
                  bgcolor: 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--border)'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--text-muted)'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--primary)'
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
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                '&:hover': {
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                },
                '&.Mui-disabled': {
                  borderColor: 'var(--surface-secondary)',
                  color: 'var(--border-strong)'
                }
              }}
            >
              Export to Excel
            </Button>
          </Box>

          {/* Results Summary */}
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
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
                backgroundColor: 'var(--surface-secondary)'
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'var(--border)',
                borderRadius: '4px'
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: 'var(--primary)'
              }
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      '&:hover': { color: 'var(--primary)' }
                    }}
                    onClick={() => handleSort('name')}
                  >
                    Customer Name {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    Phone Number
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    Member ID
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'right',
                      cursor: 'pointer',
                      '&:hover': { color: 'var(--primary)' }
                    }}
                    onClick={() => handleSort('totalSpend')}
                  >
                    Total Amount Spent {sortField === 'totalSpend' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      '&:hover': { color: 'var(--primary)' }
                    }}
                    onClick={() => handleSort('lastPurchaseDate')}
                  >
                    Last Purchase Date {sortField === 'lastPurchaseDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
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
                      '&:hover': { bgcolor: 'var(--surface)' },
                      bgcolor: index % 2 === 0 ? 'var(--surface-secondary)' : 'var(--background)'
                    }}
                  >
                    <TableCell
                      sx={{
                        color: 'var(--text-primary)',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        '&:hover': {
                          color: 'var(--primary)',
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => navigate(`/customers/${encodeURIComponent(customer.phoneNumber)}`)}
                    >
                      {customer.name}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {customer.phoneNumber}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {customer.memberId}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: 'var(--success)',
                        borderBottom: '1px solid var(--border)',
                        textAlign: 'right',
                        fontWeight: 600
                      }}
                    >
                      {formatCurrency(customer.totalSpend, currentClinic)}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {customer.lastPurchaseDate}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
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
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border)'
                },
                '& .MuiPaginationItem-root.Mui-selected': {
                  bgcolor: 'var(--primary)',
                  '&:hover': {
                    bgcolor: 'var(--primary-hover)'
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
          <CircularProgress sx={{ color: 'var(--primary)' }} />
        </Box>
      )}

      {/* No Data State */}
      {selectedSalesperson && !loading && customers.length === 0 && !error && (
        <Paper sx={{ p: 4, bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border)', textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--text-secondary)' }}>
            No customers found for {selectedSalesperson}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default CustomersBySalesperson;

