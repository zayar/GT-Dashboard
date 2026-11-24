import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Select,
  MenuItem,
  SelectChangeEvent,
  Tooltip,
  CircularProgress,
  TextField,
  InputAdornment,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Popover,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ButtonGroup,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useNavigate } from 'react-router-dom';
import DataTable from './DataTable';
import { useReportSection } from '../hooks/useReportSection';
import { useClinic } from '../contexts/ClinicContext';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchPaymentReportRecords,
  resolveReportDateRange,
  type PaymentReportRecord,
} from '../api/apicoreSalesReports';
import { format } from 'date-fns';
import { writeFile } from 'xlsx';
import { buildPaymentWorkbook } from '../utils/reportWorkbooks';
import { getCurrency, formatCurrency } from '../utils/currency';
import {
  filterPaymentsByMethod,
  normalizePaymentMethod,
  summarizePaymentMethods,
} from '../utils/paymentReport';

type PaymentRecord = PaymentReportRecord;

const EMPTY_ROWS: PaymentRecord[] = [];

const BankingDetails: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const { getAccessToken } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [filterType, setFilterType] = useState<'day' | 'month'>('day');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilterAnchorEl, setPaymentFilterAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [walletTopupFilter, setWalletTopupFilter] = useState<'all' | 'hide' | 'only'>('all');

  const clinicId = currentClinic?.id;
  const load = useCallback(async (signal: AbortSignal) => {
    if (!clinicId) throw new Error('Select a clinic.');
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Your session has expired. Please sign in again.');
    return fetchPaymentReportRecords({ clinicId, filterType, startDate, endDate, selectedDate, accessToken, signal });
  }, [clinicId, filterType, startDate, endDate, selectedDate, getAccessToken]);
  const hasDates = filterType === 'day' ? startDate && endDate : selectedDate;
  const report = useReportSection(clinicId && hasDates ? load : null, 0, null);
  const rawData = report.data ?? EMPTY_ROWS;
  const { loading, error } = report;

  // Get unique payment methods from the data
  const paymentMethods = useMemo(() => {
    return Array.from(new Set(rawData.map(record => normalizePaymentMethod(record.PaymentMethod)))).filter(Boolean);
  }, [rawData]);

  const handlePaymentFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setPaymentFilterAnchorEl(event.currentTarget);
  };

  const handlePaymentFilterClose = () => {
    setPaymentFilterAnchorEl(null);
  };

  const isPaymentFilterOpen = Boolean(paymentFilterAnchorEl);
  const isAllSelected = useMemo(() => {
    return selectedPaymentMethods.length === 0 || selectedPaymentMethods.length === paymentMethods.length;
  }, [selectedPaymentMethods, paymentMethods]);

  // Helper function to check if a record is a wallet topup
  const isWalletTopup = (record: PaymentRecord): boolean => {
    return (
      (typeof record.WalletTopUp === 'string' && record.WalletTopUp.includes('Topup')) ||
      record.InvoiceNumber.startsWith('TO')
    );
  };

  // Filters shared by both the summary and the detailed transaction table.
  const baseFilteredData = useMemo(() => {
    let filteredData = rawData;

    // Apply wallet topup filter
    if (walletTopupFilter === 'hide') {
      filteredData = filteredData.filter(record => !isWalletTopup(record));
    } else if (walletTopupFilter === 'only') {
      filteredData = filteredData.filter(record => isWalletTopup(record));
    }

    // Apply search filter across multiple fields
    if (searchTerm.trim() !== '') {
      const normalizedSearchTerm = searchTerm.toLowerCase().trim();
      filteredData = filteredData.filter(record =>
        (record.InvoiceNumber?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.CustomerName?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.MemberId?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.SalePerson?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.ServiceName?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.ProductName?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.OtherItems?.toLowerCase().includes(normalizedSearchTerm) || false) ||
        (record.ServicePackageName?.toLowerCase().includes(normalizedSearchTerm) || false)
      );
    }

    return filteredData;
  }, [rawData, walletTopupFilter, searchTerm]);

  // Payment method selection drills the detailed table without hiding the other summary rows.
  const data = useMemo(() => {
    return filterPaymentsByMethod(baseFilteredData, selectedPaymentMethods);
  }, [baseFilteredData, selectedPaymentMethods]);

  // Generate summary data from filtered data
  const summaryData = useMemo(() => {
    return summarizePaymentMethods(baseFilteredData);
  }, [baseFilteredData]);

  const handleFilterTypeChange = (event: SelectChangeEvent<'day' | 'month'>) => {
    setFilterType(event.target.value as 'day' | 'month');
  };

  const handlePaymentMethodChange = (method: string) => {
    setSelectedPaymentMethods(prev => {
      if (method === 'all') {
        return [];
      }

      const normalizedMethod = normalizePaymentMethod(method);
      const currentSelection = prev.length === 0 ? [...paymentMethods] : prev;
      const nextSelection = currentSelection.includes(normalizedMethod)
        ? currentSelection.filter(selected => selected !== normalizedMethod)
        : [...currentSelection, normalizedMethod];

      return nextSelection.length === paymentMethods.length ? [] : nextSelection;
    });
  };

  const handleSummaryMethodClick = (method: string) => {
    const normalizedMethod = normalizePaymentMethod(method);
    setSelectedPaymentMethods(current => (
      current.length === 1 && current[0] === normalizedMethod ? [] : [normalizedMethod]
    ));
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleDateChange = (newDate: Date | null) => {
    setSelectedDate(newDate);
  };

  const handleStartDateChange = (newDate: Date | null) => {
    setStartDate(newDate);
    if (newDate && endDate && newDate > endDate) {
      setEndDate(newDate);
    }
  };

  const handleEndDateChange = (newDate: Date | null) => {
    setEndDate(newDate);
    if (newDate && startDate && startDate > newDate) {
      setStartDate(newDate);
    }
  };

  // Quick date range selection functions
  const setToday = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
  };

  const setLast7Days = () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    setStartDate(sevenDaysAgo);
    setEndDate(today);
  };

  const setLast30Days = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 29);
    setStartDate(thirtyDaysAgo);
    setEndDate(today);
  };

  const setThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay);
    setEndDate(today);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const exportPayments = () => {
    if (!data.length) return;
    const range = resolveReportDateRange({ filterType, startDate, endDate, selectedDate });
    const from = format(range.startDate, 'yyyy-MM-dd');
    const to = format(range.endDate, 'yyyy-MM-dd');
    writeFile(buildPaymentWorkbook(data, getCurrency(currentClinic)), `payment_report_${from}_${to}.xlsx`);
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - 60px)',
        width: '100%',
        bgcolor: 'var(--surface)',
        gap: 2
      }}>
        <CircularProgress sx={{ color: 'var(--primary)' }} />
        <Typography sx={{ color: 'var(--text-secondary)', mt: 2 }}>Loading banking data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - 60px)',
        width: '100%',
        bgcolor: 'var(--surface)',
        padding: 3,
        gap: 2
      }}>
        <Typography variant="h6" sx={{ color: 'var(--error)' }}>{error}</Typography>
        <Button
          variant="contained"
          onClick={report.retry}
          sx={{
            mt: 2,
            bgcolor: 'var(--primary)',
            '&:hover': {
              bgcolor: 'var(--primary-hover)'
            }
          }}
        >
          Retry
        </Button>
      </Box>
    );
  }

  const grandTotal = summaryData.reduce((total, method) => total + method.TotalAmount, 0);
  const detailedTotal = data.reduce((total, record) => total + (Number(record.PaymentAmount) || 0), 0);
  const activePaymentFilter = selectedPaymentMethods.length === 1 ? selectedPaymentMethods[0] : null;

  return (
    <Box sx={{
      p: { xs: 1, sm: 2 },
      bgcolor: 'var(--surface)',
      minHeight: 'calc(100vh - 60px)',
      width: '100%',
      maxWidth: '100%',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header with back button and title */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        mb: 2
      }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: 'var(--primary)',
            mr: 2,
            p: 1,
            '&:hover': {
              bgcolor: 'rgba(59, 130, 246, 0.08)'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ color: 'var(--text-primary)' }}>Payment Report</Typography>
          <Typography variant="body2" sx={{ mt: 0.2, color: 'var(--text-secondary)' }}>Realtime payments received, grouped by payment method</Typography>
        </Box>
      </Box>

      {/* Filters and controls */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: { xs: 1, sm: 2 },
        mb: 2
      }}>
        {/* Date filters */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexGrow: 0
        }}>
          <Select
            value={filterType}
            onChange={handleFilterTypeChange}
            size="small"
            sx={{
              minWidth: 100,
              maxHeight: 40,
              color: 'var(--text-secondary)',
              bgcolor: 'var(--surface)',
              '& .MuiSelect-icon': { color: 'var(--text-secondary)' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-muted)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' }
            }}
          >
            <MenuItem value="day" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)' }}>Daily</MenuItem>
            <MenuItem value="month" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)' }}>Monthly</MenuItem>
          </Select>

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {filterType === 'day' ? (
              <>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  views={['year', 'month', 'day']}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        maxHeight: 40,
                        minWidth: 140,
                        bgcolor: 'var(--surface)',
                        '& .MuiOutlinedInput-root': {
                          color: 'var(--text-secondary)',
                          '& fieldset': {
                            borderColor: 'var(--border)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'var(--text-muted)',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'var(--primary)',
                          },
                        },
                        '& .MuiInputLabel-root': {
                          color: 'var(--text-secondary)',
                        },
                        '& .MuiSvgIcon-root': {
                          color: 'var(--text-secondary)',
                        },
                      },
                    }
                  }}
                />
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  views={['year', 'month', 'day']}
                  minDate={startDate || undefined}
                  slotProps={{
                    textField: {
                      size: 'small',
                      sx: {
                        maxHeight: 40,
                        minWidth: 140,
                        bgcolor: 'var(--surface)',
                        '& .MuiOutlinedInput-root': {
                          color: 'var(--text-secondary)',
                          '& fieldset': {
                            borderColor: 'var(--border)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'var(--text-muted)',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'var(--primary)',
                          },
                        },
                        '& .MuiInputLabel-root': {
                          color: 'var(--text-secondary)',
                        },
                        '& .MuiSvgIcon-root': {
                          color: 'var(--text-secondary)',
                        },
                      },
                    }
                  }}
                />

                {/* Quick date range selection buttons */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setToday}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      bgcolor: 'var(--surface)',
                      '&:hover': {
                        borderColor: 'var(--primary)',
                        color: 'var(--primary)',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setLast7Days}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      bgcolor: 'var(--surface)',
                      '&:hover': {
                        borderColor: 'var(--primary)',
                        color: 'var(--primary)',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    7D
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setLast30Days}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      bgcolor: 'var(--surface)',
                      '&:hover': {
                        borderColor: 'var(--primary)',
                        color: 'var(--primary)',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    30D
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={setThisMonth}
                    sx={{
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      bgcolor: 'var(--surface)',
                      '&:hover': {
                        borderColor: 'var(--primary)',
                        color: 'var(--primary)',
                        bgcolor: 'rgba(59, 130, 246, 0.08)'
                      }
                    }}
                  >
                    Month
                  </Button>
                </Box>
              </>
            ) : (
              <DatePicker
                value={selectedDate}
                onChange={handleDateChange}
                views={['year', 'month']}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: {
                      maxHeight: 40,
                      bgcolor: 'var(--surface)',
                      '& .MuiOutlinedInput-root': {
                        color: 'var(--text-secondary)',
                        '& fieldset': {
                          borderColor: 'var(--border)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'var(--text-muted)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: 'var(--primary)',
                        },
                      },
                      '& .MuiInputLabel-root': {
                        color: 'var(--text-secondary)',
                      },
                      '& .MuiSvgIcon-root': {
                        color: 'var(--text-secondary)',
                      },
                    },
                  }
                }}
              />
            )}
          </LocalizationProvider>
        </Box>

        {/* Right side controls */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'nowrap'
        }}>
          {/* Search field */}
          <TextField
            size="small"
            placeholder="Search..."
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'var(--text-secondary)' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              maxWidth: 200,
              bgcolor: 'var(--surface)',
              '& .MuiOutlinedInput-root': {
                color: 'var(--text-secondary)',
                '& fieldset': {
                  borderColor: 'var(--border)',
                },
                '&:hover fieldset': {
                  borderColor: 'var(--text-muted)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'var(--primary)',
                },
              },
              '& .MuiInputLabel-root': {
                color: 'var(--text-secondary)',
              }
            }}
          />

          {/* Wallet Topup Filter */}
          <ButtonGroup size="small" variant="outlined">
            <Button
              onClick={() => setWalletTopupFilter('all')}
              sx={{
                fontSize: '0.75rem',
                px: 1,
                borderColor: 'var(--border)',
                color: walletTopupFilter === 'all' ? '#3b82f6' : 'var(--text-secondary)',
                bgcolor: walletTopupFilter === 'all' ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface)',
                '&:hover': {
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              All
            </Button>
            <Button
              onClick={() => setWalletTopupFilter('hide')}
              sx={{
                fontSize: '0.75rem',
                px: 1,
                borderColor: 'var(--border)',
                color: walletTopupFilter === 'hide' ? '#3b82f6' : 'var(--text-secondary)',
                bgcolor: walletTopupFilter === 'hide' ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface)',
                '&:hover': {
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              Hide Topup
            </Button>
            <Button
              onClick={() => setWalletTopupFilter('only')}
              sx={{
                fontSize: '0.75rem',
                px: 1,
                borderColor: 'var(--border)',
                color: walletTopupFilter === 'only' ? '#3b82f6' : 'var(--text-secondary)',
                bgcolor: walletTopupFilter === 'only' ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface)',
                '&:hover': {
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              Only Topup
            </Button>
          </ButtonGroup>

          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterListIcon />}
            onClick={handlePaymentFilterClick}
            sx={{
              height: 40,
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
              bgcolor: 'var(--surface)',
              whiteSpace: 'nowrap',
              minWidth: 0,
              px: 1,
              '&:hover': {
                borderColor: 'var(--text-muted)',
                bgcolor: 'rgba(26, 34, 52, 0.7)'
              }
            }}
          >
            {selectedPaymentMethods.length === 0
              ? 'Payment: All'
              : selectedPaymentMethods.length === 1
                ? `Payment: ${selectedPaymentMethods[0]}`
                : `Payment (${selectedPaymentMethods.length})`}
          </Button>

          {/* Export Button */}
          <Tooltip title="Download payment summary and detailed transactions">
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={exportPayments}
              disabled={!data.length}
              sx={{
                height: 40,
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                bgcolor: 'var(--surface)',
                whiteSpace: 'nowrap',
                minWidth: 0,
                px: 1,
                '&:hover': {
                  borderColor: 'var(--text-muted)',
                  bgcolor: 'rgba(26, 34, 52, 0.7)'
                }
              }}
            >
              Export Excel
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* Payment filter popover */}
      <Popover
        open={isPaymentFilterOpen}
        anchorEl={paymentFilterAnchorEl}
        onClose={handlePaymentFilterClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: {
              p: 2,
              width: 250,
              maxHeight: 400,
              overflow: 'auto',
              bgcolor: 'var(--surface)',
              color: 'var(--text-secondary)',
              borderRadius: '8px',
              zIndex: 1400
            }
          }
        }}
      >
        <FormGroup>
          {paymentMethods.length > 0 ? (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={selectedPaymentMethods.length > 0 && !isAllSelected}
                    onChange={() => handlePaymentMethodChange('all')}
                    sx={{
                      color: 'var(--text-muted)',
                      '&.Mui-checked': { color: 'var(--primary)' },
                      '&.MuiCheckbox-indeterminate': { color: 'var(--primary)' }
                    }}
                  />
                }
                label="Select All"
                sx={{ color: 'var(--text-secondary)' }}
              />
              <Box sx={{ borderTop: '1px solid var(--border)', my: 1 }} />
              {paymentMethods.map((method) => (
                <FormControlLabel
                  key={method}
                  control={
                    <Checkbox
                      checked={selectedPaymentMethods.length === 0 || selectedPaymentMethods.includes(method)}
                      onChange={() => handlePaymentMethodChange(method)}
                      sx={{
                        color: 'var(--text-muted)',
                        '&.Mui-checked': { color: 'var(--primary)' }
                      }}
                    />
                  }
                  label={method}
                  sx={{ color: 'var(--text-secondary)' }}
                />
              ))}
            </>
          ) : (
            <Typography variant="body2" color="var(--text-secondary)">No payment methods available</Typography>
          )}
        </FormGroup>
      </Popover>

      {/* Payment methods summary table */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          bgcolor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>
              Payment Methods Summary
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: 'var(--text-secondary)' }}>
              Individual payment records · Click a method to filter the details below
            </Typography>
          </Box>
        </Box>

        {summaryData.length > 0 ? (
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--background)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    Payment Method
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--background)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'right'
                    }}
                  >
                    Transactions
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--background)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'right'
                    }}
                  >
                    Total Amount
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryData.map((method) => (
                  <TableRow
                    key={method.PaymentMethod}
                    hover
                    role="button"
                    tabIndex={0}
                    aria-label={`Filter detailed transactions by ${method.PaymentMethod}`}
                    aria-pressed={selectedPaymentMethods.length === 1 && selectedPaymentMethods[0] === method.PaymentMethod}
                    onClick={() => handleSummaryMethodClick(method.PaymentMethod)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSummaryMethodClick(method.PaymentMethod);
                      }
                    }}
                    sx={{
                      bgcolor: selectedPaymentMethods.length === 1 && selectedPaymentMethods[0] === method.PaymentMethod
                        ? 'color-mix(in srgb, var(--primary) 10%, var(--surface))'
                        : undefined,
                      outline: 'none',
                      '&:hover': {
                        bgcolor: 'rgba(59, 130, 246, 0.05)'
                      },
                      '&:focus-visible': {
                        outline: '3px solid color-mix(in srgb, var(--primary) 28%, transparent)',
                        outlineOffset: -3
                      },
                      cursor: 'pointer'
                    }}
                  >
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 650 }}>{method.PaymentMethod}</Typography>
                        {selectedPaymentMethods.length === 1 && selectedPaymentMethods[0] === method.PaymentMethod && (
                          <Chip size="small" label="Selected" sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'var(--primary)', color: '#fff' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                      {method.TransactionCount.toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                      {formatCurrency(method.TotalAmount, currentClinic)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ bgcolor: 'var(--background)' }}>
                  <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 600, borderBottom: 'none' }}>
                    Grand Total
                  </TableCell>
                  <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 600, borderBottom: 'none', textAlign: 'right' }}>
                    {summaryData.reduce((count, method) => count + method.TransactionCount, 0).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 600, borderBottom: 'none', textAlign: 'right' }}>
                    {formatCurrency(grandTotal, currentClinic)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', textAlign: 'center', py: 3 }}>
            No payment data available for the selected filters
          </Typography>
        )}
      </Paper>

      {/* Detailed transactions table */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>
              Detailed Transactions ({data.length})
            </Typography>
            {selectedPaymentMethods.length > 0 && (
              <Chip
                size="small"
                label={activePaymentFilter ? `Payment: ${activePaymentFilter}` : `${selectedPaymentMethods.length} payment methods`}
                onDelete={() => setSelectedPaymentMethods([])}
                sx={{ bgcolor: 'var(--primary-soft)', color: 'var(--primary)' }}
              />
            )}
          </Box>
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Detailed total</Typography>
            <Typography sx={{ mt: 0.2, fontWeight: 750, color: 'var(--text-primary)' }}>{formatCurrency(detailedTotal, currentClinic)}</Typography>
          </Box>
        </Box>
        <DataTable
          data={data}
          customerReturnLabel="Payment Report"
          onServiceClick={(serviceName: string) => navigate(`/services/${encodeURIComponent(serviceName)}`)}
          columnAliases={{
            Date: 'Payment Date',
            InvoiceNumber: 'Invoice Number',
            CustomerName: 'Customer Name',
            MemberId: 'Member ID',
            SalePerson: 'Sale Person',
            ServiceName: 'Service Name',
            ProductName: 'Product Name',
            ServicePackageName: 'Service Package',
            ...(data.some(row => row.OtherItems) ? { OtherItems: 'Other Items' } : {}),
            PaymentMethod: 'Payment Method',
            PaymentStatus: 'Payment Status',
            WalletTopUp: 'Wallet',
            PaymentAmount: 'Paid Amount',
          }}
        />
      </Paper>
    </Box>
  );
};

export default BankingDetails;
