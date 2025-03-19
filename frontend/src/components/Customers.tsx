import React from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Pagination
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

interface CustomersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleAddCustomer: () => void;
  handleViewDetails: (id: number) => void;
  handleEditCustomer: (customer: any) => void;
  handleDeleteCustomer: (id: number) => void;
  filteredCustomers: any[];
  page: number;
  setPage: (page: number) => void;
  rowsPerPage: number;
}

const Customers: React.FC<CustomersProps> = ({
  searchTerm,
  setSearchTerm,
  handleAddCustomer,
  handleViewDetails,
  handleEditCustomer,
  handleDeleteCustomer,
  filteredCustomers,
  page,
  setPage,
  rowsPerPage
}) => {
  return (
    <Box sx={{ 
      p: { xs: 2, sm: 3, md: 4 },
      bgcolor: '#ffffff',  // Changed from #1a1a1a
      minHeight: '100vh',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <Paper 
        elevation={3}
        sx={{ 
          width: '100%',
          p: { xs: 2, sm: 3 }, 
          bgcolor: '#ffffff',  // Changed from #2d2d2d
          color: '#000000',  // Changed from #fff
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'  // Lighter shadow
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3,
          flexWrap: 'wrap',
          gap: 2
        }}>
          <Typography variant="h5" sx={{ color: '#000000' }}>Customers</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              placeholder="Search customers..."
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{
                minWidth: '200px',
                '& .MuiOutlinedInput-root': {
                  color: '#000000',
                  '& fieldset': {
                    borderColor: 'rgba(0, 0, 0, 0.23)'
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(0, 0, 0, 0.87)'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#1a73e8'
                  }
                },
                '& .MuiInputLabel-root': {
                  color: 'rgba(0, 0, 0, 0.6)'
                }
              }}
            />
            <Button
              variant="contained"
              onClick={handleAddCustomer}
              sx={{
                bgcolor: '#1a73e8',
                '&:hover': {
                  bgcolor: '#1557b0'
                }
              }}
            >
              Add Customer
            </Button>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  bgcolor: '#f5f5f5',  // Light gray background
                  color: '#000000',    // Black text
                  fontWeight: 600 
                }}>Name</TableCell>
                <TableCell sx={{ 
                  bgcolor: '#f5f5f5', 
                  color: '#000000', 
                  fontWeight: 600 
                }}>Phone</TableCell>
                <TableCell sx={{ 
                  bgcolor: '#f5f5f5', 
                  color: '#000000', 
                  fontWeight: 600 
                }}>Email</TableCell>
                <TableCell sx={{ 
                  bgcolor: '#f5f5f5', 
                  color: '#000000', 
                  fontWeight: 600 
                }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow 
                  key={customer.id}
                  sx={{
                    '&:hover': {
                      bgcolor: 'rgba(0, 0, 0, 0.04)'  // Light hover effect
                    }
                  }}
                >
                  <TableCell sx={{ color: '#000000' }}>{customer.name}</TableCell>
                  <TableCell sx={{ color: '#000000' }}>{customer.phone}</TableCell>
                  <TableCell sx={{ color: '#000000' }}>{customer.email}</TableCell>
                  <TableCell>
                    <IconButton 
                      onClick={() => handleViewDetails(customer.id)}
                      sx={{ 
                        color: '#1a73e8',
                        '&:hover': {
                          bgcolor: 'rgba(26, 115, 232, 0.04)'
                        }
                      }}
                    >
                      <VisibilityIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleEditCustomer(customer)}
                      sx={{ 
                        color: '#1a73e8',
                        '&:hover': {
                          bgcolor: 'rgba(26, 115, 232, 0.04)'
                        }
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDeleteCustomer(customer.id)}
                      sx={{ 
                        color: '#d32f2f',
                        '&:hover': {
                          bgcolor: 'rgba(211, 47, 47, 0.04)'
                        }
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ 
          mt: 2, 
          display: 'flex', 
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 2
        }}>
          <Typography sx={{ color: 'rgba(0, 0, 0, 0.7)' }}>
            {`${page * rowsPerPage + 1}-${Math.min((page + 1) * rowsPerPage, filteredCustomers.length)} of ${filteredCustomers.length}`}
          </Typography>
          <Pagination
            count={Math.ceil(filteredCustomers.length / rowsPerPage)}
            page={page + 1}
            onChange={(e, newPage) => setPage(newPage - 1)}
            sx={{
              '& .MuiPaginationItem-root': {
                color: '#000000',
                borderColor: 'rgba(0, 0, 0, 0.23)'
              },
              '& .MuiPaginationItem-root.Mui-selected': {
                bgcolor: '#1a73e8',
                color: '#ffffff',
                '&:hover': {
                  bgcolor: '#1557b0'
                }
              }
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default Customers; 