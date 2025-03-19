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
import RefreshIcon from '@mui/icons-material/Refresh';

interface Therapist {
  id: string;
  name: string;
  image: string;
  bookingCount: number;
}

const TherapistList: React.FC = () => {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState<keyof Therapist>('bookingCount');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTherapists();
  }, []);

  const fetchTherapists = async () => {
    try {
      setLoading(true);
      
      const query = `
      SELECT 
        PractitionerName as name,
        PractitionerImage as image,
        COUNT(*) as bookingCount
      FROM 
        great_time.QueenDataView
      WHERE 
        PractitionerName IS NOT NULL
        AND PractitionerName != 'N/A'
        AND TRIM(PractitionerName) != ''
      GROUP BY 
        PractitionerName, PractitionerImage
      ORDER BY 
        bookingCount DESC
      LIMIT 100
      `;

      const response = await axios.post('/api/query', 
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
        throw new Error(response.data.error || 'Failed to fetch employees');
      }

      const data = response.data.data;
      
      // Map the response data to Therapist interface
      const formattedTherapists = data.map((therapist: any, index: number) => ({
        id: index.toString(),
        name: therapist.name || 'Unknown',
        image: therapist.image || '',
        bookingCount: therapist.bookingCount || 0
      }));

      setTherapists(formattedTherapists);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching employees:', err);
      let errorMessage = 'An error occurred while fetching employee data';
      
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

  const handleViewTherapist = (therapist: Therapist) => {
    // Encode therapist name for URL and navigate to details page
    const encodedName = encodeURIComponent(therapist.name);
    navigate(`/therapists/${encodedName}`);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  // Function to handle sorting
  const handleRequestSort = (property: keyof Therapist) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Sort comparator function
  const getComparator = <T extends Therapist>(
    order: 'asc' | 'desc',
    orderBy: keyof T
  ): (a: T, b: T) => number => {
    return order === 'desc'
      ? (a, b) => descendingComparator(a, b, orderBy)
      : (a, b) => -descendingComparator(a, b, orderBy);
  };

  // Descending comparator function
  const descendingComparator = <T extends Therapist>(
    a: T,
    b: T,
    orderBy: keyof T
  ): number => {
    if (b[orderBy] < a[orderBy]) {
      return -1;
    }
    if (b[orderBy] > a[orderBy]) {
      return 1;
    }
    return 0;
  };

  const filteredTherapists = therapists.filter(therapist =>
    therapist.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort the filtered therapists
  const sortedTherapists = React.useMemo(
    () => [...filteredTherapists].sort(getComparator(order, orderBy)),
    [filteredTherapists, order, orderBy]
  );

  // Calculate pagination
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedTherapists = sortedTherapists.slice(startIndex, endIndex);

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
          Employee List
        </Typography>
        <Box className="flex gap-3">
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            className="bg-[#2563eb] hover:bg-blue-700"
            onClick={fetchTherapists}
          >
            Refresh
          </Button>
        </Box>
      </Box>
      
      <Box className="mb-6 flex gap-4">
        <TextField
          placeholder="Search employees..."
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
              onClick={fetchTherapists}
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
                        EMPLOYEE NAME
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
                        active={orderBy === 'bookingCount'}
                        direction={orderBy === 'bookingCount' ? order : 'asc'}
                        onClick={() => handleRequestSort('bookingCount')}
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
                        BOOKING COUNT
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={{ bgcolor: '#111923' }}>
                  {paginatedTherapists.map((therapist) => (
                    <TableRow 
                      key={therapist.id}
                      hover
                      onClick={() => handleViewTherapist(therapist)}
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
                            src={therapist.image || undefined}
                            className="mr-3"
                            sx={{ width: 40, height: 40, bgcolor: '#3b82f6' }}
                          >
                            {!therapist.image && therapist.name.charAt(0)}
                          </Avatar>
                          <Box sx={{ bgcolor: '#111923' }}>
                            <Typography sx={{ fontWeight: 500, color: '#f3f4f6' }}>
                              {therapist.name}
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
                        {therapist.bookingCount.toLocaleString()}
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
                Showing {Math.min(filteredTherapists.length, startIndex + 1)}-{Math.min(filteredTherapists.length, endIndex)} of {filteredTherapists.length} employees
              </Typography>
              <Pagination 
                count={Math.ceil(filteredTherapists.length / rowsPerPage)} 
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

export default TherapistList; 