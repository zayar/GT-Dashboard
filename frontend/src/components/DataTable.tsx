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
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency } from '../utils/currency';

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
  WalletTopUp: '80px',
  ItemQuantity: '50px',
  ItemPrice: '90px',
  ItemTotal: '100px',
  SubTotal: '100px',
  Total: '100px',
  NetTotal: '100px',
  Discount: '90px',
  OrderBalance: '110px',
  OrderCreditBalance: '130px',
  Tax: '80px',
  InvoiceNetTotal: '110px',
  PaymentStatus: '100px',
  PaymentMethod: '110px',
  PaymentType: '100px',
  PaymentAmount: '110px',
  Note: '300px',
  PaymentNote: '240px'
};

const DataTable: React.FC<DataTableProps> = ({
  data,
  onCustomerClick,
  onServiceClick,
  onTherapistClick,
  columnAliases = {}
}): JSX.Element => {
  const { currentClinic } = useClinic();
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

  const handleCellClick = (columnId: string, value: unknown) => {
    // Don't trigger clicks on empty or undefined values
    if (value === null || value === undefined || String(value).trim() === '') {
      return;
    }

    const displayValue = String(value);

    // Map various possible column IDs to standard types
    const lowerColumnId = columnId.toLowerCase();

    // Customer name columns
    if ((lowerColumnId.includes('customer') || columnId === 'name' || lowerColumnId.includes('customer_name')) && onCustomerClick) {
      console.log(`Navigating to customer: ${value}`);
      onCustomerClick(displayValue);
    }
    // Service name columns
    else if ((lowerColumnId.includes('service') || columnId === 'service' || lowerColumnId.includes('service_name')) && onServiceClick) {
      console.log(`Navigating to service: ${value}`);
      onServiceClick(displayValue);
    }
    // Therapist/Practitioner name columns
    else if ((lowerColumnId.includes('practitioner') || lowerColumnId.includes('therapist') || columnId === 'therapist' ||
              lowerColumnId.includes('therapist_name') || lowerColumnId.includes('practitioner_name')) && onTherapistClick) {
      console.log(`Navigating to therapist: ${value}`);
      onTherapistClick(displayValue);
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
        return <span style={{ color: 'var(--text-muted)' }}>—</span>;
      }

      if (typeof value === 'number') {
        return formatCurrency(value, currentClinic);
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
            backgroundColor: 'var(--surface-secondary)',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--border)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: 'var(--text-muted)',
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
            <Typography sx={{ color: 'var(--text-secondary)' }}>
              No data available for the selected filters
            </Typography>
          </Box>
        ) : (
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: '2400px', // Set minimum width to ensure proper column spacing for all columns
              width: '100%',
              tableLayout: 'fixed' // Makes columns respect their width settings
            }}
          >
            <TableHead>
              <TableRow sx={{ bgcolor: 'var(--surface)' }}>
                {headCells.map((headCell: HeadCell) => (
                  <TableCell
                    key={headCell.id}
                    align={headCell.numeric ? 'right' : 'left'}
                    sortDirection={orderBy === headCell.id ? order : false}
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      width: COLUMN_WIDTHS[headCell.id] || '120px', // Fallback to 120px for undefined columns
                      minWidth: COLUMN_WIDTHS[headCell.id] || '120px',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                      padding: '8px 12px',
                      '&:hover': {
                        bgcolor: 'var(--background)'
                      }
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === headCell.id}
                      direction={orderBy === headCell.id ? order : 'asc'}
                      onClick={() => handleRequestSort(headCell.id)}
                      sx={{
                        color: 'var(--text-secondary) !important',
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
                        bgcolor: 'var(--surface-secondary)',
                      },
                      bgcolor: 'var(--surface-secondary)',
                      '&:nth-of-type(odd)': {
                        bgcolor: 'var(--background)',
                      },
                    }}
                  >
                    {Object.keys(row).filter(key => !key.startsWith('_')).map((key, i) => (
                      <TableCell
                        key={i}
                        onClick={() => handleCellClick(key, row[key])}
                        align={typeof row[key] === 'number' ? 'right' : 'left'}
                        sx={{
                          color: key === 'CustomerName' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          borderBottom: '1px solid var(--border)',
                          padding: '6px 12px',
                          fontSize: '0.85rem',
                          width: COLUMN_WIDTHS[key] || '120px',
                          minWidth: COLUMN_WIDTHS[key] || '120px',
                          maxWidth: key === 'Note' || key === 'PaymentNote'
                            ? '420px'
                            : COLUMN_WIDTHS[key] || '120px',
                          overflow: key === 'Note' || key === 'PaymentNote' ? 'visible' : 'hidden',
                          textOverflow: key === 'Note' || key === 'PaymentNote' ? 'clip' : 'ellipsis',
                          whiteSpace: key === 'Note' || key === 'PaymentNote' ? 'pre-wrap' : 'nowrap',
                          overflowWrap: key === 'Note' || key === 'PaymentNote' ? 'anywhere' : 'normal',
                          wordBreak: key === 'Note' || key === 'PaymentNote' ? 'break-word' : 'normal',
                          verticalAlign: key === 'Note' || key === 'PaymentNote' ? 'top' : 'middle',
                          lineHeight: key === 'Note' || key === 'PaymentNote' ? 1.45 : 'inherit',
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
                                  color: 'var(--primary)',
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
            color: 'var(--text-secondary)',
            bgcolor: 'var(--background)',
            borderTop: '1px solid var(--border)',
            '.MuiToolbar-root': {
              minHeight: '56px',
            },
            '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
              color: 'var(--text-secondary)',
            },
            '.MuiSelect-select': {
              color: 'var(--text-secondary)',
            },
            '.MuiTablePagination-actions': {
              color: 'var(--text-secondary)',
            },
            '.MuiButtonBase-root.Mui-disabled': {
              color: 'var(--text-muted)',
            },
            '.MuiSelect-icon': {
              color: 'var(--text-secondary)',
            },
          }}
        />
      )}
    </Box>
  );
};

export default DataTable;
