import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Box,
  Chip,
  Typography
} from '@mui/material';

interface DataTableProps {
  data: any[];
  onCustomerClick?: (customerName: string) => void;
  onServiceClick?: (serviceName: string) => void;
  onTherapistClick?: (therapistName: string) => void;
  columnAliases?: { [key: string]: string };
}

type Order = 'asc' | 'desc';

interface HeadCell {
  id: string;
  label: string;
  numeric: boolean;
}

// Define column widths for specific columns - making them more compact
const COLUMN_WIDTHS: { [key: string]: string } = {
  CustomerName: '140px',
  name: '140px',
  Date: '90px',
  ServiceName: '130px',
  service: '130px',
  InvoiceNumber: '110px',
  MemberId: '90px',
  SalePerson: '110px',
  ServicePackageName: '130px',
  WalletTopUp: '70px',
  PaymentStatus: '90px',
  PaymentMethod: '90px',
  InvoiceNetTotal: '90px'
};

const DataTable: React.FC<DataTableProps> = ({ 
  data, 
  onCustomerClick, 
  onServiceClick, 
  onTherapistClick,
  columnAliases = {}
}): JSX.Element => {
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // Dynamically generate headCells based on the first data item
  const headCells: HeadCell[] = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).map(key => ({
      id: key,
      label: columnAliases[key] || key.replace(/([A-Z])/g, ' $1').trim(), // Use alias if available
      numeric: typeof data[0][key] === 'number'
    }));
  }, [data, columnAliases]);

  // Track seen invoice numbers to handle duplicate invoice totals
  const processedInvoices = useMemo(() => {
    const invoiceGroups: Record<string, number> = {};
    return data.map(row => {
      if (row.InvoiceNumber) {
        invoiceGroups[row.InvoiceNumber] = (invoiceGroups[row.InvoiceNumber] || 0) + 1;
        return {
          ...row,
          _invoicePosition: invoiceGroups[row.InvoiceNumber],
          _isFirstInvoiceRow: invoiceGroups[row.InvoiceNumber] === 1
        };
      }
      return { ...row, _invoicePosition: 1, _isFirstInvoiceRow: true };
    });
  }, [data]);

  const handleRequestSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  function getComparator(order: Order, orderBy: string) {
    return order === 'desc'
      ? (a: any, b: any) => descendingComparator(a, b, orderBy)
      : (a: any, b: any) => -descendingComparator(a, b, orderBy);
  }

  function descendingComparator(a: any, b: any, orderBy: string) {
    if (b[orderBy] < a[orderBy]) return -1;
    if (b[orderBy] > a[orderBy]) return 1;
    return 0;
  }

  const getDaysLeftColor = (daysLeft: number) => {
    if (daysLeft <= 7) return '#ef5350';  // Red
    if (daysLeft <= 14) return '#ffa726'; // Orange
    return '#66bb6a';                     // Green
  };

  // Sort and paginate data
  const sortedData = useMemo(() => {
    if (!orderBy) return processedInvoices;
    return [...processedInvoices].sort(getComparator(order, orderBy));
  }, [processedInvoices, order, orderBy]);

  const paginatedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleCellClick = (columnId: string, value: string) => {
    // Don't trigger clicks on empty or undefined values
    if (!value || value.trim() === '') {
      return;
    }
    
    // Map various possible column IDs to standard types
    const lowerColumnId = columnId.toLowerCase();
    
    // Customer name columns
    if ((lowerColumnId.includes('customer') || columnId === 'name' || lowerColumnId.includes('customer_name')) && onCustomerClick) {
      console.log(`Navigating to customer: ${value}`);
      onCustomerClick(value);
    } 
    // Service name columns
    else if ((lowerColumnId.includes('service') || columnId === 'service' || lowerColumnId.includes('service_name')) && onServiceClick) {
      console.log(`Navigating to service: ${value}`);
      onServiceClick(value);
    } 
    // Therapist/Practitioner name columns
    else if ((lowerColumnId.includes('practitioner') || lowerColumnId.includes('therapist') || columnId === 'therapist' || 
              lowerColumnId.includes('therapist_name') || lowerColumnId.includes('practitioner_name')) && onTherapistClick) {
      console.log(`Navigating to therapist: ${value}`);
      onTherapistClick(value);
    }
  };

  const formatValue = (value: any, columnId: string, rowData: any): string | React.ReactNode => {
    // Return empty string for null/undefined values to avoid rendering issues
    if (value === null || value === undefined) {
      return '';
    }
    
    // For InvoiceNetTotal, only show value on the first occurrence of an invoice
    if (columnId === 'InvoiceNetTotal') {
      // Only show the total for the first row of each invoice
      if (!rowData._isFirstInvoiceRow) {
        return <span style={{ color: '#999' }}>—</span>;
      }
      
      if (typeof value === 'number') {
        return `${value.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        })} MMK`;
      }
    }
    
    // Special handling for WalletTopUp column
    if (columnId === 'WalletTopUp') {
      if (value === null || value === undefined || value === '') {
        return '';
      }
      
      // Check if the value contains "*Point(s)" and display as "Topup"
      if (String(value).includes('*Point') || typeof value === 'number' && value > 0) {
        return <span style={{ color: '#2e7d32', fontWeight: 500 }}>Topup</span>;
      }
      
      return String(value);
    }
    
    if (typeof value === 'number') {
      return value.toString();
    }
    return String(value || '');
  };

  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <TableContainer 
        sx={{
          height: 'calc(100vh - 250px)',
          overflowX: 'auto',
          width: '100%',
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
        }}
      >
        {data.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: 'calc(100vh - 300px)',
              width: '100%'
            }}
          >
            <Typography sx={{ color: '#d1d5db' }}>
              No data available for the selected filters
            </Typography>
          </Box>
        ) : (
          <Table 
            stickyHeader 
            size="small"
            sx={{ 
              minWidth: '1200px', // Set minimum width to ensure proper column spacing
              width: '100%',
              tableLayout: 'fixed' // Makes columns respect their width settings
            }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: '#101924' }}>
                {headCells.map((headCell: HeadCell) => (
                  <TableCell
                    key={headCell.id}
                    align={headCell.numeric ? 'right' : 'left'}
                    sortDirection={orderBy === headCell.id ? order : false}
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      width: COLUMN_WIDTHS[headCell.id] || 'auto',
                      borderBottom: '1px solid #2d3748',
                      whiteSpace: 'nowrap',
                      padding: '8px 12px',
                      '&:hover': {
                        bgcolor: '#121826'
                      }
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === headCell.id}
                      direction={orderBy === headCell.id ? order : 'asc'}
                      onClick={() => handleRequestSort(headCell.id)}
                      sx={{
                        color: '#d1d5db !important',
                        '&.MuiTableSortLabel-active': {
                          color: '#3b82f6 !important',
                        },
                        '& .MuiTableSortLabel-icon': {
                          color: '#3b82f6 !important',
                        }
                      }}
                    >
                      {headCell.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row, index) => {
                return (
                  <TableRow
                    hover
                    key={index}
                    sx={{
                      '&:hover': {
                        bgcolor: '#242f3d',
                      },
                      bgcolor: '#111923',
                      '&:nth-of-type(odd)': {
                        bgcolor: '#121826',
                      },
                    }}
                  >
                    {Object.keys(row).filter(key => !key.startsWith('_')).map((key, i) => (
                      <TableCell
                        key={i}
                        onClick={() => handleCellClick(key, row[key])}
                        align={typeof row[key] === 'number' ? 'right' : 'left'}
                        sx={{
                          color: key === 'CustomerName' ? '#f3f4f6' : '#d1d5db',
                          borderBottom: '1px solid #2d3748',
                          padding: '6px 12px',
                          fontSize: '0.85rem',
                          cursor: (key === 'CustomerName' && onCustomerClick) ||
                                  (key === 'ServiceName' && onServiceClick) ||
                                  (key === 'TherapistName' && onTherapistClick)
                                  ? 'pointer' : 'default',
                          fontWeight: key === 'CustomerName' ? 500 : 400,
                          ...(
                            (key === 'CustomerName' && onCustomerClick) ||
                            (key === 'ServiceName' && onServiceClick) ||
                            (key === 'TherapistName' && onTherapistClick)
                            ? {
                                '&:hover': {
                                  color: '#3b82f6',
                                  textDecoration: 'underline',
                                },
                              }
                            : {}
                          ),
                        }}
                      >
                        {formatValue(row[key], key, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
      {data.length > 0 && (
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={data.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{
            color: '#d1d5db',
            bgcolor: '#121826',
            borderTop: '1px solid #2d3748',
            '.MuiToolbar-root': {
              minHeight: '56px',
            },
            '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
              color: '#d1d5db',
            },
            '.MuiSelect-select': {
              color: '#d1d5db',
            },
            '.MuiTablePagination-actions': {
              color: '#d1d5db',
            },
            '.MuiButtonBase-root.Mui-disabled': {
              color: '#4a5568',
            },
            '.MuiSelect-icon': {
              color: '#d1d5db',
            },
          }}
        />
      )}
    </Box>
  );
};

export default DataTable;