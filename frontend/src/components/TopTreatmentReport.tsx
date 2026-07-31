import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  InputAdornment,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { format, startOfMonth, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';
import { getServiceDetailsPath } from '../utils/serviceNavigation';
import { buildTopTreatmentPerformanceQuery } from '../utils/treatmentPerformance';

interface TreatmentPerformanceRow {
  serviceName: string;
  totalActivity: number;
  treatmentReturns: number;
  newPurchases: number;
  returnShare: number;
  uniqueCustomers: number;
}

const TopTreatmentReport: React.FC = () => {
  const { currentClinic } = useClinic();
  const navigate = useNavigate();
  const theme = useTheme();
  const requestIdRef = useRef(0);
  const [startDate, setStartDate] = useState<Date | null>(() => startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | null>(() => new Date());
  const [rows, setRows] = useState<TreatmentPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTreatmentPerformance = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!currentClinic) {
      setError('No clinic selected.');
      setLoading(false);
      return;
    }

    if (!startDate || !endDate || startDate > endDate) {
      setError('Choose a valid start and end date.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const startDateSql = format(startDate, 'yyyy-MM-dd');
    const endDateSql = format(endDate, 'yyyy-MM-dd');
    const query = buildTopTreatmentPerformanceQuery({
      clinicCode: currentClinic.code,
      clinicId: currentClinic.id,
      startDate: startDateSql,
      endDate: endDateSql,
    });

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const result = await response.json();

      if (requestId !== requestIdRef.current) return;
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Unable to load treatment data (${response.status}).`);
      }

      const formattedRows = (result.data || []).map((row: any) => ({
        serviceName: String(row.serviceName || 'Unnamed service'),
        totalActivity: Number(row.totalActivity) || 0,
        treatmentReturns: Number(row.treatmentReturns) || 0,
        newPurchases: Number(row.newPurchases) || 0,
        returnShare: Number(row.returnShare) || 0,
        uniqueCustomers: Number(row.uniqueCustomers) || 0
      }));

      setRows(formattedRows);
      setLastUpdated(new Date());
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      setRows([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load treatment data.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [currentClinic, endDate, startDate]);

  useEffect(() => {
    fetchTreatmentPerformance();
  }, [fetchTreatmentPerformance]);

  const summary = useMemo(() => {
    const treatmentReturns = rows.reduce((total, row) => total + row.treatmentReturns, 0);
    const newPurchases = rows.reduce((total, row) => total + row.newPurchases, 0);
    const totalActivity = treatmentReturns + newPurchases;

    return {
      totalActivity,
      treatmentReturns,
      newPurchases,
      returnShare: totalActivity > 0 ? (treatmentReturns / totalActivity) * 100 : 0
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return rows;
    return rows.filter(row => row.serviceName.toLowerCase().includes(normalizedSearch));
  }, [rows, searchTerm]);

  const chartRows = useMemo(() => rows.slice(0, 10), [rows]);
  const chartSeries = useMemo(() => [
    { name: 'Treatment Returns', data: chartRows.map(row => row.treatmentReturns) },
    { name: 'New Purchases', data: chartRows.map(row => row.newPurchases) }
  ], [chartRows]);

  const chartOptions = useMemo((): ApexOptions => ({
    chart: {
      type: 'bar',
      stacked: true,
      toolbar: { show: false },
      background: 'transparent',
      foreColor: 'var(--text-secondary)',
      fontFamily: 'Inter, SF Pro Display, sans-serif',
      events: {
        dataPointSelection: (_event, _chartContext, config) => {
          const selectedService = chartRows[config.dataPointIndex];
          if (selectedService) navigate(getServiceDetailsPath(selectedService.serviceName));
        },
      },
    },
    colors: theme.palette.mode === 'dark' ? ['#5CC3B2', '#F4B860'] : ['#074142', '#D89018'],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: '58%'
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: chartRows.map(row => row.serviceName),
      labels: {
        formatter: value => Math.round(Number(value)).toLocaleString('en-US'),
        style: { colors: 'var(--text-secondary)', fontSize: '11px' }
      },
      axisBorder: { color: 'var(--border)' },
      axisTicks: { show: false },
      title: {
        text: 'Service activities in selected period',
        style: { color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 500 }
      }
    },
    yaxis: {
      labels: {
        maxWidth: 230,
        style: { colors: 'var(--text-primary)', fontSize: '12px' }
      }
    },
    grid: {
      borderColor: 'var(--chart-grid)',
      strokeDashArray: 4,
      padding: { left: 8, right: 12 }
    },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      labels: { colors: 'var(--text-primary)' }
    },
    tooltip: {
      theme: theme.palette.mode,
      shared: true,
      intersect: false,
      y: {
        formatter: value => `${Math.round(value).toLocaleString('en-US')} activities`
      }
    },
    noData: { text: 'No treatment activity for this date range' }
  }), [chartRows, navigate, theme.palette.mode]);

  const setQuickRange = (days: number | 'month') => {
    const today = new Date();
    setEndDate(today);
    setStartDate(days === 'month' ? startOfMonth(today) : subDays(today, days - 1));
  };

  const numberFormat = (value: number) => value.toLocaleString('en-US');

  const exportServicePerformance = () => {
    if (!startDate || !endDate || filteredRows.length === 0) return;

    const startDateLabel = format(startDate, 'yyyy-MM-dd');
    const endDateLabel = format(endDate, 'yyyy-MM-dd');
    const exportedAt = format(new Date(), 'yyyy-MM-dd h:mm a');
    const clinicName = currentClinic?.name || currentClinic?.code || 'All clinics';
    const headerRow = 8;
    const exportRows = filteredRows.map((row, index) => [
      index + 1,
      row.serviceName,
      row.totalActivity,
      row.treatmentReturns,
      row.newPurchases,
      row.returnShare / 100,
      row.uniqueCustomers
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Service Performance Detail'],
      ['Clinic', clinicName],
      ['Date Range', `${startDateLabel} to ${endDateLabel}`],
      ['Generated', exportedAt],
      ['Search Filter', searchTerm.trim() || 'All services'],
      ['Definition', 'Treatment Returns are zero-value CO service orders. New Purchases are positive-value service or package orders.'],
      [],
      ['Rank', 'Service / Treatment', 'Total Service Activity', 'Treatment Returns', 'New Purchases', 'Return Share', 'Unique Customers'],
      ...exportRows
    ]);

    worksheet['!cols'] = [
      { wch: 9 },
      { wch: 42 },
      { wch: 23 },
      { wch: 20 },
      { wch: 18 },
      { wch: 15 },
      { wch: 19 }
    ];
    worksheet['!autofilter'] = { ref: `A${headerRow}:G${headerRow + exportRows.length}` };

    for (let rowIndex = headerRow + 1; rowIndex <= headerRow + exportRows.length; rowIndex += 1) {
      const returnShareCell = worksheet[`F${rowIndex}`];
      if (returnShareCell) returnShareCell.z = '0.0%';
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Service Performance');

    const safeClinicCode = (currentClinic?.code || 'clinic').replace(/[^a-z0-9_-]+/gi, '_');
    XLSX.writeFile(
      workbook,
      `service_performance_${safeClinicCode}_${startDateLabel}_to_${endDateLabel}.xlsx`
    );
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'var(--background)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ color: 'var(--text-primary)', fontWeight: 750, letterSpacing: '-0.035em' }}>
              Top Treatment Report
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.6 }}>
              Compare zero-charge treatment returns with new service purchases
              {lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              component={Link}
              to="/top-treatment-report/treatment-details"
              variant="contained"
              sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-hover)' } }}
            >
              Treatment Details Report
            </Button>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={fetchTreatmentPerformance}
              disabled={loading}
              sx={{ color: 'var(--primary)', borderColor: 'var(--border)', bgcolor: 'var(--surface)' }}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        <Paper sx={{ p: 2, mb: 2.5, bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
          <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={date => {
                setStartDate(date);
                if (date && endDate && date > endDate) setEndDate(date);
              }}
              maxDate={endDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 155 } } }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={date => {
                setEndDate(date);
                if (date && startDate && date < startDate) setStartDate(date);
              }}
              minDate={startDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 155 } } }}
            />
            <Button size="small" variant="outlined" onClick={() => setQuickRange(1)}>Today</Button>
            <Button size="small" variant="outlined" onClick={() => setQuickRange(7)}>7D</Button>
            <Button size="small" variant="outlined" onClick={() => setQuickRange(30)}>30D</Button>
            <Button size="small" variant="outlined" onClick={() => setQuickRange('month')}>This Month</Button>
            <Box sx={{ flex: 1 }} />
            <TextField
              size="small"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search treatments..."
              inputProps={{ 'aria-label': 'Search treatments' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'var(--text-secondary)' }} />
                  </InputAdornment>
                )
              }}
              sx={{ minWidth: { xs: '100%', sm: 230 } }}
            />
          </Box>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {[
            { label: 'Total Service Activity', value: numberFormat(summary.totalActivity), note: 'Returns + purchases', color: 'var(--primary)' },
            { label: 'Treatment Returns', value: numberFormat(summary.treatmentReturns), note: 'Zero-value CO service visits', color: 'var(--success)' },
            { label: 'New Purchases', value: numberFormat(summary.newPurchases), note: 'Positive-value service orders', color: 'var(--warning)' },
            { label: 'Return Share', value: `${summary.returnShare.toFixed(1)}%`, note: 'Returns ÷ total activity', color: 'var(--primary)' }
          ].map(card => (
            <Grid item xs={12} sm={6} lg={3} key={card.label}>
              <Paper sx={{ p: 2.25, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{card.label}</Typography>
                {loading ? (
                  <Skeleton width="60%" height={45} />
                ) : (
                  <Typography sx={{ mt: 0.8, color: card.color, fontWeight: 750, fontSize: '1.8rem', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
                    {card.value}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ display: 'block', color: 'var(--text-muted)', mt: 0.8 }}>{card.note}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ p: { xs: 1.5, md: 2.5 }, mb: 2.5, bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
          <Box sx={{ mb: 1 }}>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Top 10 treatment activity</Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>Services ranked by treatment returns plus new purchases</Typography>
          </Box>
          <Box sx={{ height: Math.max(360, chartRows.length * 46) }}>
            {loading ? (
              <Skeleton variant="rounded" height="100%" />
            ) : chartRows.length === 0 ? (
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <Typography sx={{ color: 'var(--text-secondary)' }}>No treatment activity for this date range.</Typography>
              </Box>
            ) : (
              <ReactApexChart options={chartOptions} series={chartSeries} type="bar" height="100%" />
            )}
          </Box>
        </Paper>

        <Paper sx={{ bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Service performance detail</Typography>
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>Booking deposit is excluded from treatment activity.</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={`${filteredRows.length} services`} size="small" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }} />
              <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={exportServicePerformance}
                disabled={loading || filteredRows.length === 0}
                sx={{
                  color: 'var(--primary)',
                  borderColor: 'var(--border)',
                  bgcolor: 'var(--surface)',
                  '&:hover': { borderColor: 'var(--primary)', bgcolor: 'var(--primary-subtle)' }
                }}
              >
                Export Excel
              </Button>
            </Box>
          </Box>
          <TableContainer sx={{ maxHeight: 580 }}>
            <Table stickyHeader size="small" aria-label="Top treatment performance">
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Service / Treatment</TableCell>
                  <TableCell align="right">Total Service Activity</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Zero-value CO orders that record a customer returning to use a previously purchased service.">
                      <Box component="span" sx={{ cursor: 'help' }}>Treatment Returns</Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Positive-value orders that include this service, directly or through a service package.">
                      <Box component="span" sx={{ cursor: 'help' }}>New Purchases</Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">Return Share</TableCell>
                  <TableCell align="right">Unique Customers</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={7}><Skeleton height={28} /></TableCell>
                  </TableRow>
                )) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 8, color: 'var(--text-secondary)' }}>
                      No services match the selected date range and search.
                    </TableCell>
                  </TableRow>
                ) : filteredRows.map((row, index) => (
                  <TableRow key={row.serviceName} hover>
                    <TableCell sx={{ color: 'var(--text-muted)', fontWeight: 700 }}>{index + 1}</TableCell>
                    <TableCell sx={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      <Typography
                        component={Link}
                        to={getServiceDetailsPath(row.serviceName)}
                        sx={{
                          color: 'var(--primary)',
                          fontWeight: 'inherit',
                          fontSize: 'inherit',
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' },
                          '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: 2, borderRadius: 0.5 },
                        }}
                      >
                        {row.serviceName}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{numberFormat(row.totalActivity)}</TableCell>
                    <TableCell align="right">
                      <Chip label={numberFormat(row.treatmentReturns)} size="small" sx={{ minWidth: 48, bgcolor: 'rgba(18, 166, 117, 0.12)', color: 'var(--success)', fontWeight: 700 }} />
                    </TableCell>
                    <TableCell align="right">
                      <Chip label={numberFormat(row.newPurchases)} size="small" sx={{ minWidth: 48, bgcolor: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)', fontWeight: 700 }} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.returnShare.toFixed(1)}%</TableCell>
                    <TableCell align="right">{numberFormat(row.uniqueCustomers)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'var(--text-muted)' }}>
          Metric definition: Treatment Returns are zero-value CO service orders. New Purchases are positive-value service or package orders. Counts are distinct orders per service within the selected date range.
        </Typography>
      </Box>
    </LocalizationProvider>
  );
};

export default TopTreatmentReport;
