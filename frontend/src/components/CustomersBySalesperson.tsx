import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { fetchWarehouseRows } from '../api/warehouseReport';
import { useReportSection } from '../hooks/useReportSection';
import { branchDetailPath, readBranchRows, type BranchRow } from '../utils/reportBranches';
import { useNavigate } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';
import * as XLSX from 'xlsx';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import { formatCurrencyAmount } from '../utils/currency';
import {
  buildCustomersBySalespersonQuery,
  buildSalespeopleQuery,
  type SalespersonOption,
} from '../utils/customersBySalesperson';

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

const EMPTY_CUSTOMERS: BranchRow<Customer>[] = [];

const CustomersBySalesperson: React.FC = () => {
  const navigate = useNavigate();
  const { reportBranches } = useClinic();

  // State variables
  const [sellerId, setSellerId] = useState('');
  const [appliedSeller, setAppliedSeller] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastPurchaseDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(25);

  const loadSellers = useCallback((signal: AbortSignal) => readBranchRows(reportBranches, signal, (clinic, requestSignal) =>
    fetchWarehouseRows<SalespersonOption>(buildSalespeopleQuery({ clinicCode: clinic.code }), requestSignal,
      import.meta.env.VITE_OPENAI_API_KEY)), [reportBranches]);
  const sellers = useReportSection(reportBranches.length ? loadSellers : null);
  const salespeople = useMemo(() => {
    const people = new Map<string, { id: string; name: string; branches: string[] }>();
    for (const seller of sellers.data ?? []) {
      const person = people.get(seller.id);
      if (person) person.branches.push(seller.Branch);
      else people.set(seller.id, { id: seller.id, name: seller.name, branches: [seller.Branch] });
    }
    return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [sellers.data]);
  const selectedSalesperson = sellerId === '*' || salespeople.some(person => person.id === sellerId) ? sellerId : '';
  const loadCustomers = useCallback((signal: AbortSignal) => {
    const branches = appliedSeller === '*' ? reportBranches : reportBranches.filter(clinic =>
      sellers.data?.some(seller => seller.BranchId === clinic.id && seller.id === appliedSeller));
    return readBranchRows(branches, signal, (clinic, requestSignal) =>
      fetchWarehouseRows<Customer>(buildCustomersBySalespersonQuery({
        clinicCode: clinic.code, sellerId: appliedSeller === '*' ? null : appliedSeller,
      }), requestSignal, import.meta.env.VITE_OPENAI_API_KEY));
  }, [reportBranches, sellers.data, appliedSeller]);
  const report = useReportSection(appliedSeller && selectedSalesperson === appliedSeller && sellers.data ? loadCustomers : null);
  const fetchCustomers = () => {
    if (appliedSeller === selectedSalesperson) report.retry();
    else setAppliedSeller(selectedSalesperson);
  };
  const salesPeopleLoading = sellers.loading;
  const error = sellers.error ?? report.error;
  const loading = report.loading;
  const customers = report.data ?? EMPTY_CUSTOMERS;
  useEffect(() => { setPage(0); }, [reportBranches, selectedSalesperson, searchTerm]);
  const filteredCustomers = useMemo(() => {
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
          if (a.Currency !== b.Currency) return a.Currency.localeCompare(b.Currency);
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

    return filtered;
  }, [customers, searchTerm, sortField, sortOrder]);

  const handleSalespersonChange = (event: SelectChangeEvent<string>) => {
    setSellerId(event.target.value);
    setAppliedSeller('');
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
      Branch: customer.Branch, Currency: customer.Currency,
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
      { wch: 28 }, // Branch
      { wch: 12 }, // Currency
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
    const sanitizedSalesperson = selectedSalespersonName.replace(/[^a-z0-9]/gi, '_');
    const filename = `customers_by_${sanitizedSalesperson}_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  };

  const paginatedCustomers = filteredCustomers.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );
  const selectedSalespersonName = selectedSalesperson === '*' ? 'All salespeople' : salespeople.find(
    salesperson => salesperson.id === selectedSalesperson
  )?.name || '';

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
          onClick={selectedSalesperson && !sellers.error ? fetchCustomers : sellers.retry}
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
              <MenuItem value="*">All salespeople</MenuItem>
              {salespeople.map((salesperson) => (
                <MenuItem key={salesperson.id} value={salesperson.id}>
                  {salesperson.name}{reportBranches.length > 1 ? ` · ${salesperson.branches.join(', ')}` : ''}
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

      </Paper>

      {/* Error Display */}
      {error && (
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
            Showing {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} for {selectedSalespersonName}
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
                  <TableCell>Branch</TableCell>
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
                    key={`${customer.BranchId}-${customer.phoneNumber}-${index}`}
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
                      onClick={() => customer.phoneNumber && navigate(branchDetailPath(`/customers/${encodeURIComponent(customer.phoneNumber)}`, customer.BranchId))}
                    >
                      {customer.name}
                    </TableCell>
                    <TableCell>{customer.Branch}</TableCell>
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
                      {formatCurrencyAmount(customer.totalSpend, customer.Currency)}
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
      {report.data && customers.length === 0 && (
        <Paper sx={{ p: 4, bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border)', textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--text-secondary)' }}>
            No customers found for {selectedSalespersonName}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default CustomersBySalesperson;
