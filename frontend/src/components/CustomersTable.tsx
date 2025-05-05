import React, { useState, useEffect } from 'react';
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
  IconButton,
  CircularProgress,
  InputAdornment,
  Pagination,
  TableSortLabel
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import EditIcon from '@mui/icons-material/Edit';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useClinic } from '../contexts/ClinicContext';

interface Customer {
  id: string;
  name: string;
  phoneNumber: string;
  memberId: string;
  totalSpend: number;
  dob: string;
  lastVisited: string;
  lastService: string;
  therapist: string;
  location: string;
}

const CustomersTable: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState<keyof Customer>('totalSpend');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();
  const { currentClinic } = useClinic();

  useEffect(() => {
    if (currentClinic) {
      fetchCustomers();
    }
  }, [currentClinic]);

  const fetchCustomers = async () => {
    if (!currentClinic) return;
    
    try {
      setLoading(true);
      
      const query = `
      WITH CustomerPayments AS (
        SELECT 
          CustomerName,
          CustomerPhoneNumber,
          MemberId,
          PaymentMethod,
          PaymentStatus,
          CAST(NetTotal AS FLOAT64) AS InvoiceNetTotal
        FROM 
          great_time.MainPaymentView
        WHERE 
          CustomerName IS NOT NULL 
          AND CustomerPhoneNumber IS NOT NULL
          AND PaymentStatus = 'PAID'
          AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
          AND PaymentMethod != 'PASS'
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
      ),
      CustomerSpend AS (
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          MemberId,
          SUM(InvoiceNetTotal) AS TotalSpend
        FROM
          CustomerPayments
        GROUP BY
          CustomerName, CustomerPhoneNumber, MemberId
      ),
      CustomerInfo AS (
        SELECT 
          q.CustomerName,
          q.CustomerPhoneNumber,
          q.DateOfBirth,
          FORMAT_TIMESTAMP('%d %b, %Y', MAX(q.CheckOutTime)) AS LastVisited,
          ARRAY_AGG(q.ServiceName ORDER BY q.CheckOutTime DESC LIMIT 1)[OFFSET(0)] AS LastService,
          ARRAY_AGG(q.PractitionerName ORDER BY q.CheckOutTime DESC LIMIT 1)[OFFSET(0)] AS Therapist,
          'Myanmar' AS Location
        FROM 
          great_time.MainDataView q
        WHERE 
          q.CustomerName IS NOT NULL 
          AND q.CustomerPhoneNumber IS NOT NULL
          AND LOWER(q.ClinicCode) = LOWER('${currentClinic.code}')
        GROUP BY 
          q.CustomerName, q.CustomerPhoneNumber, q.DateOfBirth
      )
      SELECT 
        i.CustomerName AS name,
        i.CustomerPhoneNumber AS phoneNumber,
        COALESCE(s.MemberId, 'N/A') AS memberId,
        COALESCE(s.TotalSpend, 0) AS totalSpend,
        i.DateOfBirth AS dob,
        i.LastVisited AS lastVisited,
        i.LastService AS lastService,
        i.Therapist AS therapist,
        i.Location AS location
      FROM 
        CustomerInfo i
      LEFT JOIN
        CustomerSpend s
      ON
        i.CustomerName = s.CustomerName AND i.CustomerPhoneNumber = s.CustomerPhoneNumber
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
        totalSpend: customer.totalSpend || 0,
        dob: customer.dob || 'N/A',
        lastVisited: customer.lastVisited || 'N/A',
        lastService: customer.lastService || 'N/A',
        therapist: customer.therapist || 'N/A',
        location: customer.location || 'Myanmar'
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
  };

  const handleViewCustomer = (customer: Customer) => {
    // Encode customer phone number for URL and navigate to details page
    const encodedPhone = encodeURIComponent(customer.phoneNumber);
    navigate(`/customers/${encodedPhone}`);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
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
    // Special handling for lastVisited date
    if (orderBy === 'lastVisited') {
      // Convert date strings to Date objects for comparison
      const dateA = a.lastVisited !== 'N/A' ? new Date(a.lastVisited) : new Date(0);
      const dateB = b.lastVisited !== 'N/A' ? new Date(b.lastVisited) : new Date(0);
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

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phoneNumber.includes(searchTerm) ||
    customer.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort the filtered customers
  const sortedCustomers = React.useMemo(
    () => [...filteredCustomers].sort(getComparator(order, orderBy)),
    [filteredCustomers, order, orderBy]
  );

  // Calculate pagination
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedCustomers = sortedCustomers.slice(startIndex, endIndex);

  const renderStatusBadge = (status: string) => {
    const bgColor = status === 'Active' ? 'bg-green-100' : 'bg-gray-100';
    const textColor = status === 'Active' ? 'text-green-800' : 'text-gray-800';
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
        {status}
      </span>
    );
  };

  return (
    <Box 
      className="p-6" 
      sx={{ 
        bgcolor: '#111923',
        minHeight: '100vh'
      }}
    >
      <Box className="flex justify-between items-center mb-6">
        <Typography variant="h4" component="h1" className="text-white font-bold">
          Customers
        </Typography>
        <Box className="flex gap-3">
          <Button
            variant="contained"
            startIcon={<CloudDownloadIcon />}
            className="bg-[#2563eb] hover:bg-blue-700"
          >
            Download
          </Button>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            className="bg-[#2563eb] hover:bg-blue-700"
          >
            Add new
          </Button>
        </Box>
      </Box>
      
      <Box className="mb-6 flex gap-4">
        <TextField
          placeholder="Quick search..."
          variant="outlined"
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon className="text-gray-400" />
              </InputAdornment>
            ),
            className: "rounded-lg bg-[#1a2234] text-white",
            sx: {
              color: 'white',
              '& input': {
                color: 'white',
              }
            }
          }}
          className="flex-1"
        />
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          className="text-white border-gray-700 hover:bg-[#1a2234]"
        >
          Filter
        </Button>
      </Box>

      <Paper 
        className="rounded-lg overflow-hidden w-full" 
        sx={{ 
          bgcolor: '#111923', 
          boxShadow: 'none',
          border: '1px solid #1a2234',
          width: '100%',
          display: 'table',
          tableLayout: 'fixed'
        }}
      >
        {loading ? (
          <Box className="flex justify-center items-center p-12" sx={{ bgcolor: '#111923' }}>
            <CircularProgress color="primary" />
          </Box>
        ) : error ? (
          <Box className="p-8 text-center" sx={{ bgcolor: '#111923' }}>
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
                bgcolor: '#111923',
                maxHeight: 'calc(100vh - 220px)',
                width: '100%',
                display: 'block'
              }}
            >
              <Table 
                stickyHeader 
                sx={{ 
                  bgcolor: '#111923', 
                  width: '100%', 
                  minWidth: '100%',
                  tableLayout: 'fixed'
                }}
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: '#111923' }}>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'name'}
                        direction={orderBy === 'name' ? order : 'asc'}
                        onClick={() => handleRequestSort('name')}
                        sx={{
                          color: '#d1d5db !important',
                          '&.Mui-active': {
                            color: '#3b82f6 !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: '#3b82f6 !important',
                          }
                        }}
                      >
                        NAME
                      </TableSortLabel>
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      PHONE NUMBER
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      MEMBER ID
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'totalSpend'}
                        direction={orderBy === 'totalSpend' ? order : 'asc'}
                        onClick={() => handleRequestSort('totalSpend')}
                        sx={{
                          color: '#d1d5db !important',
                          '&.Mui-active': {
                            color: '#3b82f6 !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: '#3b82f6 !important',
                          }
                        }}
                      >
                        TOTAL SPEND
                      </TableSortLabel>
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      <TableSortLabel
                        active={orderBy === 'lastVisited'}
                        direction={orderBy === 'lastVisited' ? order : 'asc'}
                        onClick={() => handleRequestSort('lastVisited')}
                        sx={{
                          color: '#d1d5db !important',
                          '&.Mui-active': {
                            color: '#3b82f6 !important',
                          },
                          '& .MuiTableSortLabel-icon': {
                            color: '#3b82f6 !important',
                          }
                        }}
                      >
                        LAST VISITED
                      </TableSortLabel>
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      LAST SERVICE
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        bgcolor: '#111923', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      THERAPIST
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={{ bgcolor: '#111923' }}>
                  {paginatedCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id}
                      hover
                      onClick={() => handleViewCustomer(customer)}
                      sx={{ 
                        bgcolor: '#111923',
                        '&:hover': {
                          bgcolor: '#1a2234',
                        },
                        width: '100%',
                        cursor: 'pointer'
                      }}
                    >
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#f3f4f6'
                        }}
                      >
                        <Box className="flex items-center" sx={{ bgcolor: '#111923' }}>
                          <Avatar 
                            className="mr-3"
                            sx={{ width: 40, height: 40, bgcolor: '#3b82f6' }}
                          >
                            {customer.name.charAt(0)}
                          </Avatar>
                          <Box sx={{ bgcolor: '#111923' }}>
                            <Typography sx={{ fontWeight: 500, color: '#f3f4f6' }}>
                              {customer.name}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#d1d5db'
                        }}
                      >
                        {customer.phoneNumber}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#d1d5db'
                        }}
                      >
                        {customer.memberId}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#d1d5db'
                        }}
                      >
                        {customer.totalSpend.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })} MMK
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#d1d5db'
                        }}
                      >
                        {customer.lastVisited}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#d1d5db'
                        }}
                      >
                        {customer.lastService}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          bgcolor: '#111923', 
                          borderBottom: '1px solid #2d3748',
                          color: '#d1d5db'
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
                borderTop: '1px solid #2d3748',
                bgcolor: '#111923'
              }}
            >
              <Typography sx={{ color: '#d1d5db' }}>
                Showing {Math.min(filteredCustomers.length, startIndex + 1)}-{Math.min(filteredCustomers.length, endIndex)} of {filteredCustomers.length} customers
              </Typography>
              <Pagination 
                count={Math.ceil(filteredCustomers.length / rowsPerPage)} 
                page={page} 
                onChange={handleChangePage}
                color="primary"
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: '#d1d5db',
                  },
                  '& .Mui-selected': {
                    backgroundColor: '#2563eb !important',
                    color: 'white',
                  },
                  bgcolor: '#111923'
                }}
              />
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default CustomersTable; 