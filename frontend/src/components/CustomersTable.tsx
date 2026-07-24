import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Avatar,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Pagination,
  TableSortLabel
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SearchIcon from '@mui/icons-material/Search';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency } from '../utils/currency';
import { calculateAge } from '../utils/customerDemographics';
import DirectoryPageHeader from './DirectoryPageHeader';

export { calculateAge } from '../utils/customerDemographics';

interface Customer {
  id: string;
  memberId: string;
  name: string;
  phoneNumber: string;
  age: number | null;
  gender: string;
  address: string;
  createdDate: string;
  totalSpend: number;
  totalVisits: number;
  totalPackageCount: number;
  remainingCount: number;
  lastVisited: string;
  lastService: string;
  therapist: string;
}

function escapeSqlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function parseNumericValue(value: unknown) {
  const rawValue = value && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value;
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCustomerCreatedDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  const monthLabel = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][Number(month) - 1];

  return monthLabel ? `${day} ${monthLabel}, ${year}` : value;
}

// Custom hook for debouncing
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const CustomersTable: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState<keyof Customer>('totalSpend');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const debouncedSearchTerm = useDebounce(searchTerm, 500); // 500ms debounce delay

  useEffect(() => {
    if (currentClinic) {
      fetchCustomers();
    }
  }, [currentClinic, debouncedSearchTerm]);

  const fetchCustomers = useCallback(async () => {
    if (!currentClinic) return;

    try {
      setLoading(true);
      setError('');

      const clinicCode = escapeSqlString(currentClinic.code);
      const clinicId = escapeSqlString(currentClinic.id);
      const escapedSearchTerm = escapeSqlString(debouncedSearchTerm.toLowerCase());

      // Search condition
      const searchCondition = debouncedSearchTerm
        ? `AND (
            LOWER(i.CustomerName) LIKE '%${escapedSearchTerm}%'
            OR LOWER(i.CustomerPhoneNumber) LIKE '%${escapedSearchTerm}%'
            OR LOWER(COALESCE(p.MemberId, s.MemberId, '')) LIKE '%${escapedSearchTerm}%'
          )`
        : '';

      const query = `
      WITH CustomerPayments AS (
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          MemberId,
          InvoiceNumber,
          MAX(CAST(NetTotal AS FLOAT64)) AS InvoiceNetTotal
        FROM
          great_time.MainPaymentView
        WHERE
          CustomerName IS NOT NULL
          AND CustomerPhoneNumber IS NOT NULL
          AND PaymentMethod != 'PASS'
          AND InvoiceNumber IS NOT NULL
          AND CAST(NetTotal AS FLOAT64) > 0
          AND LOWER(ClinicCode) = LOWER('${clinicCode}')
        GROUP BY
          CustomerName,
          CustomerPhoneNumber,
          MemberId,
          InvoiceNumber
      ),
      CustomerSpend AS (
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          ANY_VALUE(MemberId) AS MemberId,
          SUM(InvoiceNetTotal) AS TotalSpend
        FROM
          CustomerPayments
        GROUP BY
          CustomerName, CustomerPhoneNumber
      ),
      MemberProfiles AS (
        SELECT
          RIGHT(REGEXP_REPLACE(COALESCE(cm.phonenumber, m.phonenumber, ''), r'[^0-9]', ''), 9) AS PhoneKey,
          COALESCE(NULLIF(cm.member_id, ''), NULLIF(m.member_id, '')) AS MemberId,
          NULLIF(
            JSON_VALUE(SAFE.PARSE_JSON(COALESCE(NULLIF(cm.metadata, ''), m.metadata)), '$.gender'),
            ''
          ) AS Gender,
          NULLIF(
            JSON_VALUE(SAFE.PARSE_JSON(COALESCE(NULLIF(cm.metadata, ''), m.metadata)), '$.address'),
            ''
          ) AS Address,
          FORMAT_TIMESTAMP(
            '%Y-%m-%d',
            TIMESTAMP(cm.created_at),
            'Asia/Yangon'
          ) AS CreatedDate
        FROM
          great_time.clinic_members cm
        LEFT JOIN
          great_time.members m
        ON
          m.phonenumber = cm.phonenumber
        WHERE
          cm.clinic_id = '${clinicId}'
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY RIGHT(REGEXP_REPLACE(COALESCE(cm.phonenumber, m.phonenumber, ''), r'[^0-9]', ''), 9)
          ORDER BY COALESCE(cm.updated_at, cm.created_at) DESC
        ) = 1
      ),
      PackageStates AS (
        SELECT
          q.CustomerName,
          q.CustomerPhoneNumber,
          TRIM(q.ServiceName) AS ServiceName,
          GREATEST(COALESCE(SAFE_CAST(q.PackageCount AS INT64), 0), 0) AS PackageCount,
          GREATEST(COALESCE(SAFE_CAST(q.RemainingPackageCount AS INT64), 0), 0) AS RemainingPackageCount
        FROM
          great_time.MainDataView q
        WHERE
          q.CustomerName IS NOT NULL
          AND q.CustomerPhoneNumber IS NOT NULL
          AND q.ServiceName IS NOT NULL
          AND (q.PackageCount IS NOT NULL OR q.RemainingPackageCount IS NOT NULL)
          AND LOWER(q.ClinicCode) = LOWER('${clinicCode}')
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY q.CustomerName, q.CustomerPhoneNumber, TRIM(q.ServiceName)
          ORDER BY q.CheckInTime DESC, q.CheckOutTime DESC
        ) = 1
      ),
      PackageSummary AS (
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          SUM(PackageCount) AS TotalPackageCount,
          SUM(RemainingPackageCount) AS RemainingCount
        FROM
          PackageStates
        GROUP BY
          CustomerName, CustomerPhoneNumber
      ),
      CustomerInfo AS (
        SELECT
          q.CustomerName,
          q.CustomerPhoneNumber,
          ARRAY_AGG(
            NULLIF(CAST(q.DateOfBirth AS STRING), '') IGNORE NULLS
            ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC
            LIMIT 1
          )[SAFE_OFFSET(0)] AS DateOfBirth,
          COUNT(DISTINCT q.BookingID) AS TotalVisits,
          FORMAT_TIMESTAMP('%d %b, %Y', MAX(COALESCE(q.CheckOutTime, q.CheckInTime))) AS LastVisited,
          ARRAY_AGG(
            NULLIF(q.ServiceName, '') IGNORE NULLS
            ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC
            LIMIT 1
          )[SAFE_OFFSET(0)] AS LastService,
          ARRAY_AGG(
            NULLIF(q.PractitionerName, '') IGNORE NULLS
            ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC
            LIMIT 1
          )[SAFE_OFFSET(0)] AS Therapist
        FROM
          great_time.MainDataView q
        WHERE
          q.CustomerName IS NOT NULL
          AND q.CustomerPhoneNumber IS NOT NULL
          AND q.CheckInTime IS NOT NULL
          AND LOWER(q.ClinicCode) = LOWER('${clinicCode}')
        GROUP BY
          q.CustomerName, q.CustomerPhoneNumber
      )
      SELECT
        COALESCE(p.MemberId, s.MemberId, 'N/A') AS memberId,
        i.CustomerName AS name,
        i.CustomerPhoneNumber AS phoneNumber,
        i.DateOfBirth AS dob,
        COALESCE(p.Gender, 'N/A') AS gender,
        COALESCE(p.Address, 'N/A') AS address,
        COALESCE(p.CreatedDate, 'N/A') AS createdDate,
        COALESCE(s.TotalSpend, 0) AS totalSpend,
        i.TotalVisits AS totalVisits,
        COALESCE(ps.TotalPackageCount, 0) AS totalPackageCount,
        COALESCE(ps.RemainingCount, 0) AS remainingCount,
        i.LastVisited AS lastVisited,
        i.LastService AS lastService,
        i.Therapist AS therapist
      FROM
        CustomerInfo i
      LEFT JOIN
        CustomerSpend s
      ON
        i.CustomerName = s.CustomerName AND i.CustomerPhoneNumber = s.CustomerPhoneNumber
      LEFT JOIN
        MemberProfiles p
      ON
        RIGHT(REGEXP_REPLACE(i.CustomerPhoneNumber, r'[^0-9]', ''), 9) = p.PhoneKey
      LEFT JOIN
        PackageSummary ps
      ON
        i.CustomerName = ps.CustomerName AND i.CustomerPhoneNumber = ps.CustomerPhoneNumber
      WHERE 1=1 ${searchCondition}
      ORDER BY
        s.TotalSpend DESC NULLS LAST
      LIMIT 100
      `;

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
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
        throw new Error(response.data.error || 'Failed to fetch customers');
      }

      const data = response.data.data;

      // Map the response data to Customer interface
      const formattedCustomers = data.map((customer: any, index: number) => ({
        id: index.toString(),
        name: customer.name || 'Unknown',
        phoneNumber: customer.phoneNumber || 'N/A',
        memberId: customer.memberId || 'N/A',
        age: calculateAge(customer.dob),
        gender: customer.gender || 'N/A',
        address: customer.address || 'N/A',
        createdDate: customer.createdDate || 'N/A',
        totalSpend: parseNumericValue(customer.totalSpend),
        totalVisits: parseNumericValue(customer.totalVisits),
        totalPackageCount: parseNumericValue(customer.totalPackageCount),
        remainingCount: parseNumericValue(customer.remainingCount),
        lastVisited: customer.lastVisited || 'N/A',
        lastService: customer.lastService || 'N/A',
        therapist: customer.therapist || 'N/A',
      }));

      setCustomers(formattedCustomers);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching customers:', err);
      let errorMessage = 'An error occurred while fetching customer data';

      if (err.response) {
        // Server responded with a status other than 200 range
        if (err.response.data && err.response.data.error) {
          errorMessage = `Server error: ${err.response.data.error}`;
        } else {
          errorMessage = `Server error (${err.response.status}): Please check the SQL query syntax`;
        }
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = 'No response from server. Please check your connection';
      } else {
        // Something else happened while setting up the request
        errorMessage = err.message || 'Unknown error occurred';
      }

      setError(errorMessage);
      setLoading(false);
    }
  }, [currentClinic, debouncedSearchTerm]);

  const handleViewCustomer = (customer: Customer) => {
    // Encode customer phone number for URL and navigate to details page
    const encodedPhone = encodeURIComponent(customer.phoneNumber);
    navigate(`/customers/${encodedPhone}`);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number(event.target.value));
    setPage(1);
  };

  // Function to handle sorting
  const handleRequestSort = (property: keyof Customer) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Sort comparator function
  const getComparator = <T extends Customer>(
    order: 'asc' | 'desc',
    orderBy: keyof T
  ): (a: T, b: T) => number => {
    return order === 'desc'
      ? (a, b) => descendingComparator(a, b, orderBy)
      : (a, b) => -descendingComparator(a, b, orderBy);
  };

  // Descending comparator function
  const descendingComparator = <T extends Customer>(
    a: T,
    b: T,
    orderBy: keyof T
  ): number => {
    // Special handling for display dates
    if (orderBy === 'lastVisited' || orderBy === 'createdDate') {
      // Convert date strings to Date objects for comparison
      const dateValueA = orderBy === 'createdDate' ? a.createdDate : a.lastVisited;
      const dateValueB = orderBy === 'createdDate' ? b.createdDate : b.lastVisited;
      const dateA = dateValueA !== 'N/A' ? new Date(dateValueA) : new Date(0);
      const dateB = dateValueB !== 'N/A' ? new Date(dateValueB) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    }

    if (b[orderBy] < a[orderBy]) {
      return -1;
    }
    if (b[orderBy] > a[orderBy]) {
      return 1;
    }
    return 0;
  };

  // Sort the customers directly
  const sortedCustomers = [...customers].sort(getComparator(order, orderBy));

  // Calculate pagination
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedCustomers = sortedCustomers.slice(startIndex, endIndex);

  const handleExportCustomers = () => {
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = sortedCustomers.map((customer) => [
      customer.memberId,
      customer.name,
      customer.phoneNumber,
      customer.age ?? 'N/A',
      customer.gender,
      customer.address,
      formatCustomerCreatedDate(customer.createdDate),
      customer.totalSpend,
      customer.totalVisits,
      customer.totalPackageCount,
      customer.remainingCount,
      customer.lastVisited,
      customer.lastService,
      customer.therapist,
    ]);
    const csv = [
      ['Member ID', 'Name', 'Phone number', 'Age', 'Gender', 'Address', 'Created date', 'Total spend', 'Total visit', 'Total package count', 'Remaining count', 'Last visit', 'Last service', 'Doctor / Therapist'],
      ...rows,
    ].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers-${currentClinic?.code || 'clinic'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        bgcolor: 'var(--background)',
        minHeight: '100vh',
        p: { xs: 2, md: 3 },
      }}
    >
      <DirectoryPageHeader
        title="Customers"
        subtitle="Review customer value, recent activity, and service relationships."
        count={customers.length}
        countLabel={debouncedSearchTerm ? 'matches' : 'loaded'}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchCustomers}
              disabled={loading}
              sx={{ color: 'var(--primary)', borderColor: 'var(--border)' }}
            >
              Refresh
            </Button>
          <Button
            variant="contained"
            startIcon={<CloudDownloadIcon />}
              onClick={handleExportCustomers}
              disabled={loading || customers.length === 0}
              sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-hover)' } }}
          >
              Export CSV
          </Button>
          </>
        }
      />

      <Paper sx={{ mb: 2.5, p: 1, bgcolor: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <TextField
          placeholder="Search by customer, phone number, or member ID..."
          variant="outlined"
          fullWidth
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon className="text-gray-400" />
              </InputAdornment>
            ),
            sx: {
              color: 'var(--text-primary)',
              '& input': {
                color: 'var(--text-primary)',
              }
            }
          }}
          sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 0 } }}
        />
      </Paper>

      <Paper
        className="rounded-lg overflow-hidden w-full"
        sx={{
          bgcolor: 'var(--surface-secondary)',
          boxShadow: 'none',
          border: '1px solid var(--surface)',
          width: '100%',
          display: 'block',
          overflow: 'hidden'
        }}
      >
        {loading ? (
          <Box className="flex justify-center items-center p-12" sx={{ bgcolor: 'var(--surface-secondary)' }}>
            <CircularProgress color="primary" />
          </Box>
        ) : error ? (
          <Box className="p-8 text-center" sx={{ bgcolor: 'var(--surface-secondary)' }}>
            <Typography color="error" className="mb-4" variant="h6">
              {error}
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={fetchCustomers}
              startIcon={<RefreshIcon />}
            >
              Retry
            </Button>
          </Box>
        ) : (
          <>
            <TableContainer
              sx={{
                bgcolor: 'var(--surface-secondary)',
                maxHeight: 'calc(100vh - 220px)',
                width: '100%',
                display: 'block'
              }}
            >
              <Table
                stickyHeader
                sx={{
                  bgcolor: 'var(--surface-secondary)',
                  width: '100%',
                  minWidth: 2350,
                  tableLayout: 'auto'
                }}
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: 'var(--surface-secondary)' }}>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 140,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      MEMBER ID
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 230,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'name'}
                        direction={orderBy === 'name' ? order : 'asc'}
                        onClick={() => handleRequestSort('name')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': {
                            color: 'var(--primary) !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: 'var(--primary) !important',
                          }
                        }}
                      >
                        NAME
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 165,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      PHONE NUMBER
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        width: 80,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      AGE
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 100,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      GENDER
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 280,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ADDRESS
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 155,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'createdDate'}
                        direction={orderBy === 'createdDate' ? order : 'asc'}
                        onClick={() => handleRequestSort('createdDate')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': {
                            color: 'var(--primary) !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: 'var(--primary) !important',
                          }
                        }}
                      >
                        CREATED DATE
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 180,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'totalSpend'}
                        direction={orderBy === 'totalSpend' ? order : 'asc'}
                        onClick={() => handleRequestSort('totalSpend')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': {
                            color: 'var(--primary) !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: 'var(--primary) !important',
                          }
                        }}
                      >
                        TOTAL SPEND
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 140,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'totalVisits'}
                        direction={orderBy === 'totalVisits' ? order : 'asc'}
                        onClick={() => handleRequestSort('totalVisits')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': {
                            color: 'var(--primary) !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: 'var(--primary) !important',
                          }
                        }}
                      >
                        TOTAL VISIT
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 190,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'totalPackageCount'}
                        direction={orderBy === 'totalPackageCount' ? order : 'asc'}
                        onClick={() => handleRequestSort('totalPackageCount')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': { color: 'var(--primary) !important' },
                          '& .MuiTableSortLabel-icon': { color: 'var(--primary) !important' }
                        }}
                      >
                        TOTAL PACKAGE COUNT
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 165,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'remainingCount'}
                        direction={orderBy === 'remainingCount' ? order : 'asc'}
                        onClick={() => handleRequestSort('remainingCount')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': { color: 'var(--primary) !important' },
                          '& .MuiTableSortLabel-icon': { color: 'var(--primary) !important' }
                        }}
                      >
                        REMAINING COUNT
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 145,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'lastVisited'}
                        direction={orderBy === 'lastVisited' ? order : 'asc'}
                        onClick={() => handleRequestSort('lastVisited')}
                        sx={{
                          color: 'var(--text-secondary) !important',
                          '&.Mui-active': {
                            color: 'var(--primary) !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: 'var(--primary) !important',
                          }
                        }}
                      >
                        LAST VISIT
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 260,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      LAST SERVICE
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                        minWidth: 190,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      DOCTOR / THERAPIST
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={{ bgcolor: 'var(--surface-secondary)' }}>
                  {paginatedCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} align="center" sx={{ py: 8, color: 'var(--text-secondary)', borderBottom: 0 }}>
                        {searchTerm ? 'No customers match your search.' : 'No customers are available for this clinic.'}
                      </TableCell>
                    </TableRow>
                  ) : paginatedCustomers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      hover
                      onClick={() => handleViewCustomer(customer)}
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        '&:hover': {
                          bgcolor: 'var(--surface)',
                        },
                        width: '100%',
                        cursor: 'pointer'
                      }}
                    >
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {customer.memberId}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <Box className="flex items-center" sx={{ bgcolor: 'var(--surface-secondary)' }}>
                          <Avatar
                            className="mr-3"
                            sx={{ width: 40, height: 40, bgcolor: 'var(--primary)' }}
                          >
                            {customer.name.charAt(0)}
                          </Avatar>
                          <Box sx={{ bgcolor: 'var(--surface-secondary)' }}>
                            <Typography sx={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {customer.name}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.phoneNumber}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.age ?? 'N/A'}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.gender}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          maxWidth: 280
                        }}
                      >
                        <Typography
                          component="span"
                          variant="body2"
                          noWrap
                          title={customer.address}
                          sx={{ display: 'block', color: 'inherit' }}
                        >
                          {customer.address}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatCustomerCreatedDate(customer.createdDate)}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {formatCurrency(customer.totalSpend, currentClinic)}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.totalVisits.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.totalPackageCount.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: customer.remainingCount > 0 ? 'var(--success)' : 'var(--text-secondary)',
                          fontWeight: customer.remainingCount > 0 ? 600 : 400
                        }}
                      >
                        {customer.remainingCount.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.lastVisited}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          maxWidth: 260
                        }}
                      >
                        <Typography
                          component="span"
                          variant="body2"
                          noWrap
                          title={customer.lastService}
                          sx={{ display: 'block', color: 'inherit' }}
                        >
                          {customer.lastService}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: 'var(--surface-secondary)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {customer.therapist}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 2,
                borderTop: '1px solid var(--border)',
                bgcolor: 'var(--surface-secondary)'
              }}
            >
              <Typography sx={{ color: 'var(--text-secondary)' }}>
                Showing {Math.min(customers.length, startIndex + 1)}-{Math.min(customers.length, endIndex)} of {customers.length} customers
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <TextField
                  select
                  size="small"
                  label="Rows per page"
                  value={rowsPerPage}
                  onChange={handleRowsPerPageChange}
                  inputProps={{ 'aria-label': 'Rows per page' }}
                  sx={{
                    minWidth: 145,
                    bgcolor: 'var(--surface)',
                    '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                  }}
                >
                  {[10, 50, 100].map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </TextField>
                <Pagination
                  count={Math.ceil(customers.length / rowsPerPage)}
                  page={page}
                  onChange={handleChangePage}
                  color="primary"
                  sx={{
                    '& .MuiPaginationItem-root': {
                      color: 'var(--text-secondary)',
                    },
                    '& .Mui-selected': {
                      backgroundColor: 'var(--primary) !important',
                      color: '#ffffff',
                    },
                    bgcolor: 'var(--surface-secondary)'
                  }}
                />
              </Box>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default CustomersTable;
