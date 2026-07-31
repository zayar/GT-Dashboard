import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  SelectChangeEvent,
  Button,
  TextField,
  InputAdornment,
  Chip,
  TableSortLabel,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency, getCurrency } from '../utils/currency';
import {
  buildMonthlyBookingTotalsQuery,
  buildPractitionerServicePerformanceQuery,
  buildServicePerformanceQuery,
  PerformanceSortKey,
  SortDirection,
  sortPerformanceRows,
} from '../utils/serviceBehaviorPerformance';

// Define period type for time selection
type PeriodType = 'monthly' | 'quarterly' | 'annual';

interface ServiceData {
  serviceName: string;
  month: string;
  bookingCount: number;
  totalSales: number;
  periodOrder: number;
}

interface MonthlyServiceCount {
  month: string;
  totalBookings: number;
  periodOrder: number;
}

interface ServiceSummary {
  serviceName: string;
  bookings: number;
  totalSales: number;
  description?: string;
  change: number | null;
  share: number;
  comparisonLabel?: string;
}

interface PractitionerServiceData {
  practitionerName: string;
  serviceName: string;
  bookings: number;
  totalSales: number;
}

const getCurrentPeriodOrder = (period: PeriodType, date = new Date()) => {
  if (period === 'monthly') return date.getMonth() + 1;
  if (period === 'quarterly') return Math.floor(date.getMonth() / 3) + 1;
  return date.getFullYear();
};

const getPeriodNoun = (period: PeriodType) => {
  if (period === 'monthly') return 'month';
  if (period === 'quarterly') return 'quarter';
  return 'year';
};

const getPeriodLabel = (period: PeriodType, periodOrder: number, year: number) => {
  if (period === 'monthly') {
    return `${new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(year, periodOrder - 1, 1))} ${year}`;
  }
  if (period === 'quarterly') return `Q${periodOrder} ${year}`;
  return String(periodOrder);
};

const ServiceBehaviorReport: React.FC = () => {
  const { currentClinic } = useClinic();
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyServiceCounts, setMonthlyServiceCounts] = useState<MonthlyServiceCount[]>([]);
  const [serviceSummary, setServiceSummary] = useState<ServiceSummary[]>([]);
  const [practitionerServiceData, setPractitionerServiceData] = useState<PractitionerServiceData[]>([]);
  const [yearSelection, setYearSelection] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [serviceSortKey, setServiceSortKey] = useState<PerformanceSortKey>('bookings');
  const [serviceSortDirection, setServiceSortDirection] = useState<SortDirection>('desc');
  const [practitionerSortKey, setPractitionerSortKey] = useState<PerformanceSortKey>('bookings');
  const [practitionerSortDirection, setPractitionerSortDirection] = useState<SortDirection>('desc');
  const requestIdRef = useRef(0);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [
      currentYear - 2,
      currentYear - 1,
      currentYear
    ];
  }, []);

  useEffect(() => {
    fetchServiceData();
  }, [period, yearSelection, currentClinic?.code]);

  const fetchServiceData = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      if (!currentClinic) {
        setError('No clinic selected. Please select a clinic first.');
        setLoading(false);
        return;
      }

      const queryParams = {
        clinicCode: currentClinic.code,
        clinicId: currentClinic.id,
        period,
        selectedYear: yearSelection,
      };
      const serviceBookingsSQL = buildServicePerformanceQuery(queryParams);
      const monthlyTotalsSQL = buildMonthlyBookingTotalsQuery(queryParams);
      const practitionerServicesSQL = buildPractitionerServicePerformanceQuery(queryParams);

      // Execute queries in parallel
      const [serviceResponse, monthlyResponse, practitionerResponse] = await Promise.all([
        axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: serviceBookingsSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: monthlyTotalsSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: practitionerServicesSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        )
      ]);

      if (requestId !== requestIdRef.current) return;

      if (serviceResponse.data.success) {
        const transformedData = serviceResponse.data.data.map((item: any) => ({
          serviceName: item.serviceName,
          month: item.month,
          bookingCount: Number(item.bookingCount) || 0,
          totalSales: Number(item.totalSales) || 0,
          periodOrder: Number(item.periodOrder)
        })).sort((a: ServiceData, b: ServiceData) => a.periodOrder - b.periodOrder);

        // Calculate service summary data
        const summary = calculateServiceSummary(transformedData);
        setServiceSummary(summary);
      } else {
        setError(serviceResponse.data.error || 'Failed to fetch service data.');
        return;
      }

      if (monthlyResponse.data.success) {
        const transformedMonthlyData = monthlyResponse.data.data.map((item: any) => ({
          month: item.month,
          totalBookings: Number(item.totalBookings) || 0,
          periodOrder: Number(item.periodOrder)
        })).sort((a: MonthlyServiceCount, b: MonthlyServiceCount) => a.periodOrder - b.periodOrder);

        setMonthlyServiceCounts(transformedMonthlyData);
      } else {
        setError(monthlyResponse.data.error || 'Failed to fetch monthly service data.');
        return;
      }

      if (practitionerResponse.data.success) {
        setPractitionerServiceData((practitionerResponse.data.data || []).map((item: any) => ({
          practitionerName: item.practitionerName,
          serviceName: item.serviceName,
          bookings: Number(item.bookingCount) || 0,
          totalSales: Number(item.totalSales) || 0,
        })));
      } else {
        setError(practitionerResponse.data.error || 'Failed to fetch practitioner service data.');
        return;
      }
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching service data:', err);
      let errorMessage = 'An unexpected error occurred while fetching data.';

      if (err.response) {
        errorMessage = `Server error (${err.response.status}): ${err.response.data?.error || 'Unknown error'}`;
      } else if (err.request) {
        errorMessage = 'No response from server. Please check your connection.';
      } else {
        errorMessage = err.message || 'Unknown error occurred';
      }

      setError(errorMessage);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // Calculate service summary from raw data
  const calculateServiceSummary = (data: ServiceData[]): ServiceSummary[] => {
    // Group by service name
    const serviceMap: Record<string, {
      bookings: number;
      totalSales: number;
      byPeriod: Record<string, { bookings: number; periodOrder: number; label: string }>;
    }> = {};
    const grandTotal = data.reduce((sum, item) => sum + item.bookingCount, 0);
    const now = new Date();
    const firstAvailableOrder = period === 'annual' ? yearSelection - 2 : 1;
    const latestCompletedOrder = period === 'annual'
      ? Math.min(yearSelection, now.getFullYear() - 1)
      : yearSelection < now.getFullYear()
        ? (period === 'monthly' ? 12 : 4)
        : getCurrentPeriodOrder(period, now) - 1;
    const comparisonOrders = [latestCompletedOrder, latestCompletedOrder - 1]
      .filter(order => order >= firstAvailableOrder);
    const latestComparisonPeriod = comparisonOrders[0] === undefined ? undefined : {
      periodOrder: comparisonOrders[0],
      label: getPeriodLabel(period, comparisonOrders[0], yearSelection)
    };
    const previousComparisonPeriod = comparisonOrders[1] === undefined ? undefined : {
      periodOrder: comparisonOrders[1],
      label: getPeriodLabel(period, comparisonOrders[1], yearSelection)
    };

    data.forEach(item => {
      if (!serviceMap[item.serviceName]) {
        serviceMap[item.serviceName] = {
          bookings: 0,
          totalSales: 0,
          byPeriod: {}
        };
      }

      serviceMap[item.serviceName].bookings += item.bookingCount;
      serviceMap[item.serviceName].totalSales += item.totalSales;

      if (!serviceMap[item.serviceName].byPeriod[item.month]) {
        serviceMap[item.serviceName].byPeriod[item.month] = {
          bookings: 0,
          periodOrder: item.periodOrder,
          label: item.month
        };
      }

      serviceMap[item.serviceName].byPeriod[item.month].bookings += item.bookingCount;
    });

    // Convert to array and calculate change percentage
    const summaryArray = Object.entries(serviceMap).map(([serviceName, data]) => {
      // Compare the latest two completed periods so a partial current period does
      // not create a false decline for business owners.
      const servicePeriods = Object.values(data.byPeriod);
      const latestBookings = latestComparisonPeriod
        ? servicePeriods.find(item => item.periodOrder === latestComparisonPeriod.periodOrder)?.bookings || 0
        : 0;
      const previousBookings = previousComparisonPeriod
        ? servicePeriods.find(item => item.periodOrder === previousComparisonPeriod.periodOrder)?.bookings || 0
        : 0;
      const change = latestComparisonPeriod && previousComparisonPeriod && previousBookings > 0
        ? ((latestBookings - previousBookings) / previousBookings) * 100
        : null;

      return {
        serviceName,
        bookings: data.bookings,
        totalSales: data.totalSales,
        change,
        share: grandTotal > 0 ? (data.bookings / grandTotal) * 100 : 0,
        comparisonLabel: latestComparisonPeriod && previousComparisonPeriod
          ? `${latestComparisonPeriod.label} vs ${previousComparisonPeriod.label}${previousBookings === 0 ? ' · no prior bookings' : ''}`
          : undefined
      };
    });

    // Sort by total bookings descending
    return summaryArray.sort((a, b) => b.bookings - a.bookings);
  };

  const isPeriodComplete = (periodOrder: number) => {
    const now = new Date();
    if (period === 'annual') return periodOrder < now.getFullYear();
    if (yearSelection < now.getFullYear()) return true;
    if (yearSelection > now.getFullYear()) return false;
    return periodOrder < getCurrentPeriodOrder(period, now);
  };

  // Handle period change
  const handlePeriodChange = (event: SelectChangeEvent<string>) => {
    setPeriod(event.target.value as PeriodType);
  };

  // Handle year change
  const handleYearChange = (event: SelectChangeEvent<string>) => {
    setYearSelection(Number(event.target.value));
  };

  // Handle search term change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const filteredServices = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const matches = searchLower
      ? serviceSummary.filter(service => service.serviceName.toLowerCase().includes(searchLower))
      : serviceSummary;

    return sortPerformanceRows(matches, serviceSortKey, serviceSortDirection, row => row.serviceName);
  }, [serviceSummary, searchTerm, serviceSortKey, serviceSortDirection]);

  const filteredPractitionerServices = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const matches = searchLower
      ? practitionerServiceData.filter(item => item.serviceName.toLowerCase().includes(searchLower))
      : practitionerServiceData;

    return sortPerformanceRows(
      matches,
      practitionerSortKey,
      practitionerSortDirection,
      row => `${row.practitionerName}\u0000${row.serviceName}`,
    );
  }, [practitionerServiceData, searchTerm, practitionerSortKey, practitionerSortDirection]);

  const updateServiceSort = (sortKey: PerformanceSortKey) => {
    setServiceSortDirection(previous => serviceSortKey === sortKey ? (previous === 'desc' ? 'asc' : 'desc') : 'desc');
    setServiceSortKey(sortKey);
  };

  const updatePractitionerSort = (sortKey: PerformanceSortKey) => {
    setPractitionerSortDirection(previous => practitionerSortKey === sortKey ? (previous === 'desc' ? 'asc' : 'desc') : 'desc');
    setPractitionerSortKey(sortKey);
  };

  const setNumericCurrencyFormat = (worksheet: XLSX.WorkSheet, columnIndex: number, rowCount: number) => {
    const currency = getCurrency(currentClinic);
    for (let rowIndex = 2; rowIndex <= rowCount + 1; rowIndex += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex - 1, c: columnIndex })];
      if (cell) cell.z = `#,##0.00 \"${currency}\"`;
    }
  };

  const exportServicePerformance = () => {
    const rows = filteredServices.map((service, index) => ({
      Rank: index + 1,
      'Service Name': service.serviceName,
      Bookings: service.bookings,
      'Total Sales': service.totalSales,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 8 }, { wch: 42 }, { wch: 14 }, { wch: 22 }];
    worksheet['!autofilter'] = { ref: `A1:D${Math.max(1, rows.length + 1)}` };
    setNumericCurrencyFormat(worksheet, 3, rows.length);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Service Performance');
    XLSX.writeFile(workbook, `service_performance_${currentClinic?.code || 'clinic'}_${period}_${yearSelection}.xlsx`);
  };

  const exportPractitionerServicePerformance = () => {
    const rows = filteredPractitionerServices.map((item, index) => ({
      Rank: index + 1,
      'Doctor / Therapist': item.practitionerName,
      'Service Name': item.serviceName,
      Bookings: item.bookings,
      'Total Sales': item.totalSales,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 42 }, { wch: 14 }, { wch: 22 }];
    worksheet['!autofilter'] = { ref: `A1:E${Math.max(1, rows.length + 1)}` };
    setNumericCurrencyFormat(worksheet, 4, rows.length);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Practitioner Service Perf');
    XLSX.writeFile(workbook, `practitioner_service_performance_${currentClinic?.code || 'clinic'}_${period}_${yearSelection}.xlsx`);
  };

  const sortedPeriodCounts = useMemo(() => {
    const now = new Date();
    const latestOrder = period === 'monthly'
      ? (yearSelection === now.getFullYear() ? now.getMonth() + 1 : 12)
      : period === 'quarterly'
        ? (yearSelection === now.getFullYear() ? Math.floor(now.getMonth() / 3) + 1 : 4)
        : yearSelection;
    const firstOrder = period === 'annual' ? yearSelection - 2 : 1;
    const countsByOrder = new Map(monthlyServiceCounts.map(item => [item.periodOrder, item]));

    return Array.from({ length: latestOrder - firstOrder + 1 }, (_, index) => {
      const periodOrder = firstOrder + index;
      return countsByOrder.get(periodOrder) || {
        periodOrder,
        month: getPeriodLabel(period, periodOrder, yearSelection),
        totalBookings: 0
      };
    });
  }, [monthlyServiceCounts, period, yearSelection]);

  const totalBookings = useMemo(
    () => sortedPeriodCounts.reduce((sum, item) => sum + item.totalBookings, 0),
    [sortedPeriodCounts]
  );

  const completedPeriodComparison = useMemo(() => {
    const completed = sortedPeriodCounts.filter(item => isPeriodComplete(item.periodOrder));
    const latest = completed[completed.length - 1];
    const previous = completed[completed.length - 2];
    const change = latest && previous && previous.totalBookings > 0
      ? ((latest.totalBookings - previous.totalBookings) / previous.totalBookings) * 100
      : null;
    return {
      change,
      label: latest && previous ? `${latest.month} vs ${previous.month}` : 'Not enough completed periods'
    };
  }, [sortedPeriodCounts, period, yearSelection]);

  const topService = serviceSummary[0];
  const periodNoun = getPeriodNoun(period);
  const chartTitle = `${period.charAt(0).toUpperCase()}${period.slice(1)} Service Bookings`;
  const currentYear = new Date().getFullYear();
  const partialPeriod = sortedPeriodCounts.find(item => {
    if (period === 'annual') {
      return yearSelection === currentYear && item.periodOrder === currentYear;
    }
    return yearSelection === currentYear && item.periodOrder === getCurrentPeriodOrder(period);
  });

  const previousPeriodChanges = sortedPeriodCounts.map((item, index) => {
    const previous = sortedPeriodCounts[index - 1];
    if (!previous || previous.totalBookings === 0) return null;
    return ((item.totalBookings - previous.totalBookings) / previous.totalBookings) * 100;
  });

  // Monthly Service Chart Options
  const monthlyServiceChartOptions: ApexOptions = {
    chart: {
      height: 350,
      type: 'bar',
      fontFamily: 'Poppins, Arial, sans-serif',
      background: 'transparent',
      toolbar: {
        show: false
      },
      stacked: false,
      animations: {
        enabled: true,
        speed: 450,
        animateGradually: { enabled: true, delay: 45 },
        dynamicAnimation: { enabled: true, speed: 300 }
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '60%',
        distributed: true,
        dataLabels: { position: 'top' }
      }
    },
    colors: sortedPeriodCounts.map(item => item.month === partialPeriod?.month ? 'var(--warning)' : 'var(--primary)'),
    dataLabels: {
      enabled: sortedPeriodCounts.length <= 12,
      formatter: (value: number) => Math.round(value).toLocaleString(),
      offsetY: -18,
      style: {
        colors: ['var(--text-secondary)'],
        fontSize: '11px',
        fontWeight: 600
      },
      background: { enabled: false }
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    grid: {
      borderColor: 'var(--border-strong)',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    xaxis: {
      categories: sortedPeriodCounts.map(item => item.month),
      labels: {
        style: {
          colors: 'var(--text-secondary)',
          fontSize: '12px'
        }
      },
      axisBorder: {
        show: true,
        color: 'var(--border-strong)'
      },
      axisTicks: {
        show: true,
        color: 'var(--border-strong)'
      }
    },
    yaxis: {
      title: {
        text: 'Number of Bookings',
        style: {
          color: 'var(--text-secondary)',
          fontSize: '13px',
          fontWeight: 500
        }
      },
      labels: {
        style: {
          colors: 'var(--text-secondary)',
          fontSize: '12px'
        }
      }
    },
    tooltip: {
      custom: ({ series, seriesIndex, dataPointIndex }) => {
        const item = sortedPeriodCounts[dataPointIndex];
        const change = previousPeriodChanges[dataPointIndex];
        const isPartial = item?.month === partialPeriod?.month;
        const changeText = isPartial
          ? `Partial ${periodNoun}; comparison withheld`
          : change === null
          ? 'First available period'
          : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs previous ${periodNoun}`;
        const partialText = isPartial
          ? `<div style="color:var(--warning);font-size:11px;margin-top:6px">Current ${periodNoun} · partial data</div>`
          : '';
        return `<div style="padding:10px 12px;min-width:185px;background:var(--surface);color:var(--text-primary);border:1px solid var(--border);box-shadow:var(--shadow-md)">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">${item?.month || ''}</div>
          <div style="font-size:15px;font-weight:700">${Number(series[seriesIndex][dataPointIndex]).toLocaleString()} bookings</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${changeText}</div>
          ${partialText}
        </div>`;
      }
    },
    fill: {
      opacity: 0.9
    },
    legend: {
      show: false
    }
  };

  const monthlyServiceChartSeries = [
    {
      name: 'Service Bookings',
      data: sortedPeriodCounts.map(item => item.totalBookings)
    }
  ];

  return (
    <Box sx={{
      p: 3,
      bgcolor: 'var(--background)',
      minHeight: '100vh',
      color: 'var(--text-primary)'
    }}>
      <Typography variant="h5" component="h1" sx={{ mb: 4, fontWeight: 600, color: 'var(--text-primary)' }}>
        Service Behavior Report
      </Typography>

      {/* Filter controls */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 120, bgcolor: 'var(--surface-secondary)', borderRadius: 1 }}>
            <InputLabel id="period-select-label" sx={{ color: 'var(--text-secondary)' }}>Period</InputLabel>
            <Select
              labelId="period-select-label"
              id="period-select"
              value={period}
              label="Period"
              onChange={handlePeriodChange}
              sx={{
                color: 'var(--text-primary)',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--border-strong)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--border-strong)'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--primary)'
                },
                '& .MuiSvgIcon-root': {
                  color: 'var(--text-secondary)'
                }
              }}
            >
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="quarterly">Quarterly</MenuItem>
              <MenuItem value="annual">Annual</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 120, bgcolor: 'var(--surface-secondary)', borderRadius: 1 }}>
            <InputLabel id="year-select-label" sx={{ color: 'var(--text-secondary)' }}>Year</InputLabel>
            <Select
              labelId="year-select-label"
              id="year-select"
              value={yearSelection.toString()}
              label="Year"
              onChange={handleYearChange}
              sx={{
                color: 'var(--text-primary)',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--border-strong)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--border-strong)'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--primary)'
                },
                '& .MuiSvgIcon-root': {
                  color: 'var(--text-secondary)'
                }
              }}
            >
              {years.map(year => (
                <MenuItem key={year} value={year.toString()}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            onClick={fetchServiceData}
            sx={{
              bgcolor: 'var(--primary)',
              color: 'var(--text-on-primary)',
              '&:hover': {
                bgcolor: 'var(--primary-hover)'
              }
            }}
          >
            Refresh Data
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <CircularProgress sx={{ color: 'var(--primary)' }} />
        </Box>
      ) : error ? (
        <Paper sx={{
          p: 4,
          bgcolor: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
          textAlign: 'center'
        }}>
          <Typography color="error" variant="h6" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button
            variant="contained"
            onClick={fetchServiceData}
            sx={{ bgcolor: 'var(--primary)', color: 'var(--text-on-primary)' }}
          >
            Try Again
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* Owner-focused service KPIs */}
          <Grid item xs={12} sm={6} lg={3}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 2 }}>
              <Typography variant="body2" color="var(--text-secondary)">Total service bookings</Typography>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700, color: 'var(--text-primary)' }}>
                {totalBookings.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="var(--text-secondary)">
                {period === 'annual' ? `${yearSelection - 2}–${yearSelection}` : yearSelection}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 2 }}>
              <Typography variant="body2" color="var(--text-secondary)">Active services</Typography>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700, color: 'var(--text-primary)' }}>
                {serviceSummary.length.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="var(--text-secondary)">Services with at least one booking</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 2 }}>
              <Typography variant="body2" color="var(--text-secondary)">Leading service</Typography>
              <Typography variant="h6" noWrap title={topService?.serviceName} sx={{ mt: 1, fontWeight: 700, color: 'var(--text-primary)' }}>
                {topService ? (
                  <Box
                    component={Link}
                    to={`/services/${encodeURIComponent(topService.serviceName)}`}
                    sx={{ color: 'var(--primary)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                  >
                    {topService.serviceName}
                  </Box>
                ) : 'No data'}
              </Typography>
              <Typography variant="caption" color="var(--text-secondary)">
                {topService ? `${topService.bookings.toLocaleString()} bookings · ${topService.share.toFixed(1)}% share` : 'No bookings in this period'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 2 }}>
              <Typography variant="body2" color="var(--text-secondary)">Completed-period momentum</Typography>
              <Typography
                variant="h4"
                sx={{
                  mt: 1,
                  fontWeight: 700,
                  color: completedPeriodComparison.change === null
                    ? 'var(--text-primary)'
                    : completedPeriodComparison.change >= 0 ? 'var(--success)' : 'var(--error)'
                }}
              >
                {completedPeriodComparison.change === null
                  ? '—'
                  : `${completedPeriodComparison.change >= 0 ? '+' : ''}${completedPeriodComparison.change.toFixed(1)}%`}
              </Typography>
              <Typography variant="caption" color="var(--text-secondary)">{completedPeriodComparison.label}</Typography>
            </Paper>
          </Grid>

          {/* Monthly Service Metrics Chart */}
          <Grid item xs={12}>
            <Paper sx={{
              p: 3,
              bgcolor: 'var(--surface)',
              borderRadius: 2,
              border: '1px solid var(--border-strong)',
              height: '100%'
            }}>
              <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {chartTitle}
                  </Typography>
                  <Typography variant="body2" color="var(--text-secondary)" sx={{ mt: 0.5 }}>
                    Chronological booking volume · {period === 'annual' ? `${yearSelection - 2}–${yearSelection}` : yearSelection}
                  </Typography>
                </Box>
                {partialPeriod && (
                  <Chip
                    size="small"
                    label={`${partialPeriod.month} is ${periodNoun}-to-date`}
                    sx={{ bgcolor: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning)' }}
                  />
                )}
              </Box>
              <Box sx={{ height: 350 }}>
                <ReactApexChart
                  options={monthlyServiceChartOptions}
                  series={monthlyServiceChartSeries}
                  type="bar"
                  height={350}
                />
              </Box>
            </Paper>
          </Grid>

          {/* Service Rankings Table with search */}
          <Grid item xs={12}>
            <Paper sx={{
              p: 3,
              bgcolor: 'var(--surface)',
              borderRadius: 2,
              border: '1px solid var(--border-strong)',
              overflow: 'hidden'
            }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', lg: 'center' }, gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Service Performance Rankings
                  </Typography>
                  <Typography variant="body2" color="var(--text-secondary)" sx={{ mt: 0.5 }}>
                    Compare distinct bookings and final paid service sales after discounts
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={serviceSortKey}
                    onChange={(_, value: PerformanceSortKey | null) => {
                      if (value) {
                        setServiceSortKey(value);
                        setServiceSortDirection('desc');
                      }
                    }}
                    aria-label="Sort service performance"
                  >
                    <ToggleButton value="bookings">Sort by Bookings</ToggleButton>
                    <ToggleButton value="sales">Sort by Sales</ToggleButton>
                  </ToggleButtonGroup>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={exportServicePerformance}
                    disabled={filteredServices.length === 0}
                  >
                    Export to Excel
                  </Button>
                  <TextField
                    placeholder="Search services..."
                    variant="outlined"
                    size="small"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    sx={{ width: { xs: '100%', sm: 280 } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: 'var(--text-secondary)' }} />
                        </InputAdornment>
                      ),
                      sx: {
                        color: 'var(--text-primary)',
                        bgcolor: 'var(--surface-secondary)',
                        borderRadius: 1,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--border-strong)'
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--border-strong)'
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--primary)'
                        }
                      }
                    }}
                  />
                </Box>
              </Box>

              <TableContainer sx={{
                overflowX: 'auto',
                maxHeight: '500px',
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
                }
              }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        width: '50px'
                      }}>
                        RANK
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        minWidth: '250px'
                      }}>
                        SERVICE NAME
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        width: '150px',
                        textAlign: 'right'
                      }}>
                        <TableSortLabel
                          active={serviceSortKey === 'bookings'}
                          direction={serviceSortKey === 'bookings' ? serviceSortDirection : 'desc'}
                          onClick={() => updateServiceSort('bookings')}
                        >
                          BOOKINGS
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        minWidth: '190px',
                        textAlign: 'right'
                      }}>
                        <TableSortLabel
                          active={serviceSortKey === 'sales'}
                          direction={serviceSortKey === 'sales' ? serviceSortDirection : 'desc'}
                          onClick={() => updateServiceSort('sales')}
                        >
                          TOTAL SALES
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredServices.map((service, index) => (
                      <TableRow
                        key={service.serviceName}
                        sx={{
                          '&:nth-of-type(odd)': { bgcolor: 'var(--surface)' },
                          '&:nth-of-type(even)': { bgcolor: 'var(--surface-secondary)' },
                          '&:hover': { bgcolor: 'var(--primary-soft)' },
                        }}
                      >
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {index + 1}
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 500
                        }}>
                          <Typography
                            component={Link}
                            to={`/services/${encodeURIComponent(service.serviceName)}`}
                            aria-label={`View ${service.serviceName} service details`}
                            sx={{
                              color: 'var(--primary)',
                              fontWeight: 650,
                              textDecoration: 'none',
                              '&:hover': { textDecoration: 'underline' },
                              '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: 3, borderRadius: 0.5 }
                            }}
                          >
                            {service.serviceName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          textAlign: 'right'
                        }}>
                          {service.bookings.toLocaleString()}
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          textAlign: 'right',
                          whiteSpace: 'nowrap'
                        }}>
                          {formatCurrency(service.totalSales, currentClinic, { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredServices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'var(--text-secondary)' }}>
                          No services match the active filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Practitioner-Service Distribution */}
          <Grid item xs={12}>
            <Paper sx={{
              p: 3,
              bgcolor: 'var(--surface)',
              borderRadius: 2,
              border: '1px solid var(--border-strong)',
              overflow: 'hidden'
            }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Top Practitioner-Service Combinations
                  </Typography>
                  <Typography variant="body2" color="var(--text-secondary)" sx={{ mt: 0.5 }}>
                    Paid service sales are attributed through the related treatment record without duplicate order counting
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={practitionerSortKey}
                    onChange={(_, value: PerformanceSortKey | null) => {
                      if (value) {
                        setPractitionerSortKey(value);
                        setPractitionerSortDirection('desc');
                      }
                    }}
                    aria-label="Sort practitioner service performance"
                  >
                    <ToggleButton value="bookings">Sort by Bookings</ToggleButton>
                    <ToggleButton value="sales">Sort by Sales</ToggleButton>
                  </ToggleButtonGroup>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={exportPractitionerServicePerformance}
                    disabled={filteredPractitionerServices.length === 0}
                  >
                    Export to Excel
                  </Button>
                </Box>
              </Box>

              <TableContainer sx={{
                maxHeight: '400px',
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
                }
              }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        width: '70px'
                      }}>
                        RANK
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        minWidth: '200px'
                      }}>
                        DOCTOR / THERAPIST
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        minWidth: '250px'
                      }}>
                        SERVICE
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        width: '120px',
                        textAlign: 'right'
                      }}>
                        <TableSortLabel
                          active={practitionerSortKey === 'bookings'}
                          direction={practitionerSortKey === 'bookings' ? practitionerSortDirection : 'desc'}
                          onClick={() => updatePractitionerSort('bookings')}
                        >
                          BOOKINGS
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        minWidth: '190px',
                        textAlign: 'right'
                      }}>
                        <TableSortLabel
                          active={practitionerSortKey === 'sales'}
                          direction={practitionerSortKey === 'sales' ? practitionerSortDirection : 'desc'}
                          onClick={() => updatePractitionerSort('sales')}
                        >
                          TOTAL SALES
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPractitionerServices.map((item, index) => (
                      <TableRow
                        key={`${item.practitionerName}-${item.serviceName}`}
                        sx={{
                          '&:nth-of-type(odd)': { bgcolor: 'var(--surface)' },
                          '&:nth-of-type(even)': { bgcolor: 'var(--surface-secondary)' },
                          '&:hover': { bgcolor: 'var(--primary-soft)' },
                        }}
                      >
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          textAlign: 'center'
                        }}>
                          {index + 1}
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 500
                        }}>
                          {item.practitionerName}
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)'
                        }}>
                          <Typography
                            component={Link}
                            to={`/services/${encodeURIComponent(item.serviceName)}`}
                            aria-label={`View ${item.serviceName} service details`}
                            sx={{ color: 'var(--primary)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                          >
                            {item.serviceName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          textAlign: 'right'
                        }}>
                          {item.bookings.toLocaleString()}
                        </TableCell>
                        <TableCell sx={{
                          color: 'var(--text-primary)',
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          textAlign: 'right',
                          whiteSpace: 'nowrap'
                        }}>
                          {formatCurrency(item.totalSales, currentClinic, { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPractitionerServices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'var(--text-secondary)' }}>
                          No practitioner-service combinations match the active filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ServiceBehaviorReport;
