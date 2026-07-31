import React, { useState, useEffect, useMemo } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from '@mui/material';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import SearchIcon from '@mui/icons-material/Search';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency } from '../utils/currency';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

// Define period type for time selection
type PeriodType = 'monthly' | 'quarterly' | 'annual';
type ActivityWindow = 3 | 6 | 12;

interface CustomerVisit {
  customerName: string;
  month: string;
  periodKey: string;
  visitCount: number;
}

interface MonthlyCustomers {
  month: string;
  periodKey: string;
  uniqueCustomers: number;
}

const periodLabels: Record<PeriodType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual'
};

const generateMonthsForYear = (year: number): Array<Pick<MonthlyCustomers, 'month' | 'periodKey'>> => (
  Array.from({ length: 12 }, (_, monthIndex) => {
    const date = new Date(year, monthIndex, 1);
    return {
      month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      periodKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    };
  })
);

const getHeatmapCellStyle = (visitCount: number) => {
  if (visitCount === 0) {
    return { backgroundColor: 'transparent', color: 'var(--text-muted)' };
  }
  if (visitCount === 1) {
    return { backgroundColor: 'var(--heatmap-1)', color: 'var(--text-primary)' };
  }
  if (visitCount <= 3) {
    return { backgroundColor: 'var(--heatmap-2)', color: 'var(--text-primary)' };
  }
  if (visitCount <= 6) {
    return { backgroundColor: 'var(--heatmap-3)', color: 'var(--heatmap-text)' };
  }
  return { backgroundColor: 'var(--heatmap-4)', color: 'var(--heatmap-text)' };
};

const CustomerBehaviorReport: React.FC = () => {
  const { currentClinic } = useClinic();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyCustomers, setMonthlyCustomers] = useState<MonthlyCustomers[]>([]);
  const [customerVisits, setCustomerVisits] = useState<CustomerVisit[]>([]);
  const [yearSelection, setYearSelection] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>(6);
  // Top 10 filter controls
  const [topMode, setTopMode] = useState<'single' | 'range'>('single');
  const [topStartMonth, setTopStartMonth] = useState<Date>(() => {
    const now = new Date();
    // Default to LAST month
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return lastMonth;
  });
  const [topEndMonth, setTopEndMonth] = useState<Date>(() => {
    const now = new Date();
    // Default to LAST month
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return lastMonth;
  });
  const [topLoading, setTopLoading] = useState<boolean>(false);
  const [topCustomersRows, setTopCustomersRows] = useState<Array<{ name: string; phone: string; memberId: string; visits: number; purchases: number; spend: number }>>([]);
  const [rankBy, setRankBy] = useState<'visits' | 'purchases' | 'spend'>('spend');

  const formatMonthRange = (): string => {
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (topMode === 'single') return fmt(topStartMonth);
    return `${fmt(topStartMonth)}_to_${fmt(topEndMonth)}`;
  };

  const handleExportTopCsv = () => {
    const headers = ['Name','Phone','Member ID','Visits','Purchases','Spend','Rank By','Period'];
    const rows = topCustomersRows.map(r => [
      r.name,
      r.phone,
      r.memberId,
      r.visits,
      r.purchases,
      r.spend,
      rankBy,
      topMode === 'single'
        ? `${topStartMonth.getFullYear()}-${String(topStartMonth.getMonth()+1).padStart(2,'0')}`
        : `${topStartMonth.getFullYear()}-${String(topStartMonth.getMonth()+1).padStart(2,'0')} to ${topEndMonth.getFullYear()}-${String(topEndMonth.getMonth()+1).padStart(2,'0')}`
    ]);

    const csv = [headers, ...rows]
      .map(cols => cols.map(v => {
        const val = v === null || v === undefined ? '' : String(v);
        // escape quotes and wrap if contains comma or newline
        const escaped = val.replace(/"/g, '""');
        return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
      }).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top10_customers_${rankBy}_${formatMonthRange().replace(/\s+/g,'')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [
      currentYear - 2,
      currentYear - 1,
      currentYear
    ];
  }, []);

  useEffect(() => {
    fetchCustomerActivityData();
  }, [period, yearSelection]);

  useEffect(() => {
    fetchTopCustomers();
  }, [currentClinic, topMode, topStartMonth, topEndMonth, rankBy]);

  // Keep end month in sync when switching to single mode or when start > end
  useEffect(() => {
    if (topMode === 'single') {
      if (topEndMonth.getTime() !== topStartMonth.getTime()) {
        setTopEndMonth(topStartMonth);
      }
    } else if (topEndMonth < topStartMonth) {
      setTopEndMonth(topStartMonth);
    }
  }, [topMode, topStartMonth, topEndMonth]);

  const fetchCustomerActivityData = async () => {
    setLoading(true);
    setError(null);

    try {
      const timeGrouping = period === 'monthly'
        ? {
            timeFilterSQL: `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`,
            groupFormat: "FORMAT_TIMESTAMP('%b %Y', CheckInTime)",
            groupKeyFormat: "FORMAT_TIMESTAMP('%Y-%m', CheckInTime)"
          }
        : period === 'quarterly'
          ? {
              timeFilterSQL: `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`,
              groupFormat: "FORMAT('Q%d %04d', EXTRACT(QUARTER FROM CheckInTime), EXTRACT(YEAR FROM CheckInTime))",
              groupKeyFormat: "FORMAT('%04d-Q%d', EXTRACT(YEAR FROM CheckInTime), EXTRACT(QUARTER FROM CheckInTime))"
            }
          : {
              timeFilterSQL: `EXTRACT(YEAR FROM CheckInTime) >= ${yearSelection - 2} AND EXTRACT(YEAR FROM CheckInTime) <= ${yearSelection}`,
              groupFormat: 'CAST(EXTRACT(YEAR FROM CheckInTime) AS STRING)',
              groupKeyFormat: 'CAST(EXTRACT(YEAR FROM CheckInTime) AS STRING)'
            };

      const { timeFilterSQL, groupFormat, groupKeyFormat } = timeGrouping;

      if (!currentClinic) {
        setError('No clinic selected. Please select a clinic first.');
        setLoading(false);
        return;
      }

      // SQL for individual customer activity - NO limit, to get ALL active members
      const customerVisitsSQL = `
        SELECT
          CustomerName AS customerName,
          ${groupFormat} AS month,
          ${groupKeyFormat} AS periodKey,
          COUNT(*) AS visitCount
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND CustomerName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY CustomerName, ${groupFormat}, ${groupKeyFormat}
        ORDER BY CustomerName, periodKey DESC
      `;

      // SQL for monthly unique customer counts
      const monthlyCustomersSQL = `
        SELECT
          ${groupFormat} AS month,
          ${groupKeyFormat} AS periodKey,
          COUNT(DISTINCT CustomerName) AS uniqueCustomers
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND CustomerName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY ${groupFormat}, ${groupKeyFormat}
        ORDER BY periodKey ASC
      `;

      // Execute queries in parallel
      const [visitsResponse, customersResponse] = await Promise.all([
        axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: customerVisitsSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        ),
        axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: monthlyCustomersSQL },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
          }
        )
      ]);

      if (visitsResponse.data.success) {
        const customerVisitsData: CustomerVisit[] = (visitsResponse.data.data || [])
          .map((visit: CustomerVisit) => ({
            ...visit,
            visitCount: Number(visit.visitCount) || 0
          }))
          .sort((a: CustomerVisit, b: CustomerVisit) => b.periodKey.localeCompare(a.periodKey));

        setCustomerVisits(customerVisitsData);
      } else {
        setError(visitsResponse.data.error || 'Failed to fetch customer visit data.');
        return;
      }

      if (customersResponse.data.success) {
        const fetchedCustomerCounts: MonthlyCustomers[] = (customersResponse.data.data || [])
          .map((item: MonthlyCustomers) => ({
            ...item,
            uniqueCustomers: Number(item.uniqueCustomers) || 0
          }));

        const monthlyCustomersData = period === 'monthly'
          ? generateMonthsForYear(yearSelection).map(month => {
              const matchingCount = fetchedCustomerCounts.find(item => item.periodKey === month.periodKey);
              return {
                ...month,
                uniqueCustomers: matchingCount?.uniqueCustomers ?? 0
              };
            })
          : fetchedCustomerCounts.sort((a, b) => a.periodKey.localeCompare(b.periodKey));

        setMonthlyCustomers(monthlyCustomersData);
      } else {
        setError(customersResponse.data.error || 'Failed to fetch monthly customer data.');
        return;
      }
    } catch (err: any) {
      console.error('Error fetching customer data:', err);
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
      setLoading(false);
    }
  };

  // Fetch Top 10 customers within month or month range
  const fetchTopCustomers = async () => {
    if (!currentClinic) return;
    try {
      setTopLoading(true);
      // Determine date range (inclusive)
      const start = new Date(topStartMonth.getFullYear(), topStartMonth.getMonth(), 1);
      const endBase = topMode === 'single' ? topStartMonth : topEndMonth;
      const end = new Date(endBase.getFullYear(), endBase.getMonth() + 1, 0); // last day of month

      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

      const query = `
        -- Visits within selected range from appointment data
        WITH Visits AS (
          SELECT
            CustomerName,
            CustomerPhoneNumber,
            COUNT(*) AS visits
          FROM great_time.MainDataView
          WHERE CustomerName IS NOT NULL
            AND CustomerPhoneNumber IS NOT NULL
            AND DATE(CheckInTime) BETWEEN DATE('${startStr}') AND DATE('${endStr}')
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          GROUP BY CustomerName, CustomerPhoneNumber
        ),
        -- Member ID from payments if available
        Member AS (
          SELECT
            CustomerName,
            CustomerPhoneNumber,
            ANY_VALUE(MemberId) AS MemberId
          FROM great_time.MainPaymentView
          WHERE CustomerName IS NOT NULL
            AND CustomerPhoneNumber IS NOT NULL
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          GROUP BY CustomerName, CustomerPhoneNumber
        ),
        -- MainPaymentView contains one row per invoice line/service, with NetTotal
        -- repeated on every row. Collapse it to one row per invoice before summing.
        InvoicePurchases AS (
          SELECT
            CustomerName,
            CustomerPhoneNumber,
            InvoiceNumber,
            MAX(CAST(NetTotal AS FLOAT64)) AS invoiceSpend
          FROM great_time.MainPaymentView
          WHERE CustomerName IS NOT NULL
            AND CustomerPhoneNumber IS NOT NULL
            AND InvoiceNumber IS NOT NULL
            AND PaymentStatus = 'PAID'
            AND PaymentMethod != 'PASS'
            AND CAST(NetTotal AS FLOAT64) > 0
            AND DATE(OrderCreatedDate) BETWEEN DATE('${startStr}') AND DATE('${endStr}')
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          GROUP BY CustomerName, CustomerPhoneNumber, InvoiceNumber
        ),
        Purchases AS (
          SELECT
            CustomerName,
            CustomerPhoneNumber,
            COUNT(*) AS purchases,
            CAST(SUM(invoiceSpend) AS INT64) AS spend
          FROM InvoicePurchases
          GROUP BY CustomerName, CustomerPhoneNumber
        )
        SELECT
          v.CustomerName AS name,
          v.CustomerPhoneNumber AS phone,
          COALESCE(m.MemberId, 'N/A') AS memberId,
          v.visits,
          COALESCE(p.purchases, 0) AS purchases,
          COALESCE(p.spend, 0) AS spend
        FROM Visits v
        LEFT JOIN Member m
          ON v.CustomerName = m.CustomerName
         AND v.CustomerPhoneNumber = m.CustomerPhoneNumber
        LEFT JOIN Purchases p
          ON v.CustomerName = p.CustomerName
         AND v.CustomerPhoneNumber = p.CustomerPhoneNumber
        ORDER BY ${rankBy === 'visits' ? 'v.visits' : rankBy === 'purchases' ? 'p.purchases' : 'p.spend'} DESC
        LIMIT 10
      `;

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`, { query }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch top customers');
      }

      setTopCustomersRows(response.data.data || []);
    } catch (e) {
      console.error('Top Customers Error:', e);
      setTopCustomersRows([]);
    } finally {
      setTopLoading(false);
    }
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

  // Filter customer data based on search term
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return Array.from(new Set(customerVisits.map(visit => visit.customerName))).sort();
    }

    const searchLower = searchTerm.toLowerCase();
    return Array.from(new Set(customerVisits.map(visit => visit.customerName)))
      .filter(name => name.toLowerCase().includes(searchLower))
      .sort();
  }, [customerVisits, searchTerm]);

  const activityPeriods = useMemo(() => (
    [...monthlyCustomers]
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
      .slice(0, activityWindow)
  ), [monthlyCustomers, activityWindow]);

  const visitsByCustomerAndPeriod = useMemo(() => {
    const visitMap = new Map<string, number>();
    customerVisits.forEach(visit => {
      visitMap.set(`${visit.customerName}\u0000${visit.periodKey}`, visit.visitCount);
    });
    return visitMap;
  }, [customerVisits]);

  // Monthly Customers Chart Options
  const monthlyCustomersChartOptions: ApexOptions = {
    chart: {
      height: 350,
      type: 'bar',
      fontFamily: 'Poppins, Arial, sans-serif',
      background: 'transparent',
      toolbar: {
        show: false
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '60%',
      }
    },
    colors: ['var(--primary)'],
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    grid: {
      borderColor: 'var(--chart-grid)',
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
      categories: monthlyCustomers.map(item => item.month),
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
        text: 'Unique Customers',
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
      shared: false,
      intersect: true,
      marker: {
        show: false
      },
      y: {
        formatter: function (val: number) {
          return `${val.toLocaleString()} customers`;
        }
      }
    },
    fill: {
      opacity: 0.9
    },
    legend: {
      show: false
    }
  };

  const monthlyCustomersChartSeries = [
    {
      name: 'Unique Customers',
      data: monthlyCustomers.map(item => item.uniqueCustomers)
    }
  ];

  return (
    <Box sx={{
      p: 3,
      bgcolor: 'var(--background)',
      minHeight: '100vh',
      color: 'var(--text-primary)'
    }}>
      <Typography variant="h5" component="h1" sx={{ mb: 0.75, fontWeight: 600, color: 'var(--text-primary)' }}>
        Customer Behavior Report
      </Typography>
      <Typography variant="body2" sx={{ mb: 3, color: 'var(--text-secondary)' }}>
        Monitor customer reach, top spenders, and visit frequency for {currentClinic?.name || 'the selected clinic'}.
      </Typography>

      {/* Filters header */}
      <Paper sx={{ mb: 3, p: 2, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
            Trend and activity filters
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
            These controls update the customer count chart and active customer table. Top 10 uses its own filters below.
          </Typography>
        </Box>
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
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-strong)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-strong)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
                '& .MuiSvgIcon-root': { color: 'var(--text-secondary)' }
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
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-strong)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-strong)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
                '& .MuiSvgIcon-root': { color: 'var(--text-secondary)' }
              }}
            >
              {years.map(year => (
                <MenuItem key={year} value={year.toString()}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            onClick={fetchCustomerActivityData}
            sx={{
              bgcolor: 'var(--primary)',
              color: 'var(--text-on-primary)',
              '&:hover': { bgcolor: 'var(--primary-hover)' }
            }}
          >
            Refresh Data
          </Button>
        </Box>
      </Paper>

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
            onClick={fetchCustomerActivityData}
            sx={{ bgcolor: 'var(--primary)', color: 'var(--text-on-primary)' }}
          >
            Try Again
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* Monthly Customer Count Chart */}
          <Grid item xs={12}>
            <Paper sx={{
              p: 3,
              bgcolor: 'var(--surface)',
              borderRadius: 2,
              border: '1px solid var(--border-strong)',
              height: '100%'
            }}>
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {periodLabels[period]} Customer Count
                </Typography>
                <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                  Chronological trend for {period === 'annual' ? `${yearSelection - 2}–${yearSelection}` : yearSelection}
                </Typography>
              </Box>
              <Box sx={{ height: 350 }}>
                <ReactApexChart
                  options={monthlyCustomersChartOptions}
                  series={monthlyCustomersChartSeries}
                  type="bar"
                  height={350}
                />
              </Box>
            </Paper>
          </Grid>

          {/* Top 10 Customers with month or range filter - full width */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: 2, border: '1px solid var(--border-strong)' }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>Top 10 Customers</Typography>
                <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                  This section uses the independent date and ranking filters below.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <ToggleButtonGroup
                  exclusive
                  value={topMode}
                  onChange={(_e, v) => v && setTopMode(v)}
                  size="small"
                >
                  <ToggleButton value="single">Single Month</ToggleButton>
                  <ToggleButton value="range">Month Range</ToggleButton>
                </ToggleButtonGroup>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label={topMode === 'single' ? 'Month' : 'Start Month'}
                    views={['year','month']}
                    value={topStartMonth}
                    onChange={(d) => {
                      if (!d) return;
                      const normalized = new Date(d.getFullYear(), d.getMonth(), 1);
                      setTopStartMonth(normalized);
                    }}
                    slotProps={{ textField: { size: 'small', sx: { bgcolor: 'var(--surface-secondary)', '& .MuiInputBase-input': { color: 'var(--text-primary)' } } } }}
                  />
                  {topMode === 'range' && (
                    <DatePicker
                      label={'End Month'}
                      views={['year','month']}
                      value={topEndMonth}
                      onChange={(d) => {
                        if (!d) return;
                        const normalized = new Date(d.getFullYear(), d.getMonth(), 1);
                        setTopEndMonth(normalized);
                      }}
                      minDate={topStartMonth}
                      slotProps={{ textField: { size: 'small', sx: { bgcolor: 'var(--surface-secondary)', '& .MuiInputBase-input': { color: 'var(--text-primary)' } } } }}
                    />
                  )}
                </LocalizationProvider>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="rank-by-label">Rank by</InputLabel>
                  <Select
                    labelId="rank-by-label"
                    value={rankBy}
                    label="Rank by"
                    onChange={(event) => setRankBy(event.target.value as typeof rankBy)}
                  >
                    <MenuItem value="spend">Spend</MenuItem>
                    <MenuItem value="visits">Visits</MenuItem>
                    <MenuItem value="purchases">Purchases</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FileDownloadIcon />}
                  onClick={handleExportTopCsv}
                  sx={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  Export CSV
                </Button>
              </Box>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell align="center" sx={{ width: 64, bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Rank</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Name</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Phone</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Member ID</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Visits</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Purchases</TableCell>
                      <TableCell align="right" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>Spend</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ color: 'var(--text-secondary)', textAlign: 'center', py: 4 }}>Loading top customers…</TableCell>
                      </TableRow>
                    ) : topCustomersRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ color: 'var(--text-secondary)', textAlign: 'center', py: 4 }}>No customers found for the selected period.</TableCell>
                      </TableRow>
                    ) : topCustomersRows.map((row, idx) => (
                      <TableRow
                        key={idx}
                        hover
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'var(--primary-soft)' } }}
                        onClick={() => navigate(`/customers/${encodeURIComponent(row.phone)}`)}
                      >
                        <TableCell className="customer-rank-cell" align="center" sx={{ color: 'var(--primary)', fontWeight: 700 }}>{idx + 1}</TableCell>
                        <TableCell sx={{ color: 'var(--text-primary)' }}>{row.name}</TableCell>
                        <TableCell sx={{ color: 'var(--text-secondary)' }}>{row.phone}</TableCell>
                        <TableCell sx={{ color: 'var(--text-secondary)' }}>{row.memberId}</TableCell>
                        <TableCell align="right" sx={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.visits}</TableCell>
                        <TableCell align="right" sx={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.purchases}</TableCell>
                        <TableCell align="right" sx={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.spend, currentClinic)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Member Activity Table with search */}
          <Grid item xs={12}>
            <Paper sx={{
              p: 3,
              bgcolor: 'var(--surface)',
              borderRadius: 2,
              border: '1px solid var(--border-strong)',
              overflow: 'hidden'
            }}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Active Customer Visits
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                    Showing the first {activityPeriods.length} {period === 'monthly' ? 'months' : period === 'quarterly' ? 'quarters' : 'years'} in chronological order.
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <ToggleButtonGroup
                    exclusive
                    value={activityWindow}
                    onChange={(_event, value: ActivityWindow | null) => value && setActivityWindow(value)}
                    size="small"
                    aria-label="Number of recent periods shown"
                  >
                    <ToggleButton value={3}>3 periods</ToggleButton>
                    <ToggleButton value={6}>6 periods</ToggleButton>
                    <ToggleButton value={12}>12 periods</ToggleButton>
                  </ToggleButtonGroup>
                  <Box sx={{ width: { xs: '100%', sm: '280px' } }}>
                    <TextField
                      placeholder="Search customers…"
                      fullWidth
                      variant="outlined"
                      size="small"
                      value={searchTerm}
                      onChange={handleSearchChange}
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
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-strong)' },
                          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-strong)' },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' }
                        }
                      }}
                    />
                  </Box>
                </Box>
              </Box>

              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }} aria-label="Visit frequency legend">
                <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Visits
                </Typography>
                {[
                  { label: '0', count: 0 },
                  { label: '1', count: 1 },
                  { label: '2–3', count: 2 },
                  { label: '4–6', count: 4 },
                  { label: '7+', count: 7 }
                ].map(item => {
                  const heatmapStyle = getHeatmapCellStyle(item.count);
                  return (
                    <Box key={item.label} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
                      <Box sx={{ width: 18, height: 18, borderRadius: 0.75, border: '1px solid var(--border)', ...heatmapStyle }} />
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>{item.label}</Typography>
                    </Box>
                  );
                })}
              </Box>

              <TableContainer sx={{
                overflowX: 'auto',
                maxHeight: '650px',
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
                <Table size="small" stickyHeader sx={{ minWidth: 680 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        minWidth: '220px',
                        position: 'sticky',
                        left: 0,
                        zIndex: 4,
                        boxShadow: '2px 0 0 var(--border)'
                      }}>
                        CUSTOMER NAME
                      </TableCell>

                      {activityPeriods.map(activityPeriod => (
                        <TableCell
                          key={activityPeriod.periodKey}
                          align="center"
                          sx={{
                            bgcolor: 'var(--surface-secondary)',
                            color: 'var(--text-primary)',
                            fontWeight: 'bold',
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border)',
                            width: '120px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {activityPeriod.month}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={activityPeriods.length + 1} sx={{ py: 5, textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No active customers match this search.
                        </TableCell>
                      </TableRow>
                    ) : filteredCustomers.map(customerName => (
                          <TableRow
                            key={customerName}
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
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              bgcolor: 'var(--surface)',
                              position: 'sticky',
                              left: 0,
                              zIndex: 2,
                              boxShadow: '2px 0 0 var(--border)'
                            }}>
                              {customerName}
                            </TableCell>

                            {activityPeriods.map(activityPeriod => {
                              const visitCount = visitsByCustomerAndPeriod.get(`${customerName}\u0000${activityPeriod.periodKey}`) ?? 0;
                              const heatmapStyle = getHeatmapCellStyle(visitCount);

                              return (
                                <TableCell
                                  key={`${customerName}-${activityPeriod.periodKey}`}
                                  align="center"
                                  className={visitCount === 0 ? 'customer-visit-cell--empty' : visitCount >= 4 ? 'customer-visit-cell--strong' : undefined}
                                  sx={{
                                    ...heatmapStyle,
                                    fontWeight: visitCount > 0 ? 600 : 400,
                                    borderBottom: '1px solid var(--border)',
                                    padding: '12px 16px',
                                    fontVariantNumeric: 'tabular-nums'
                                  }}
                                >
                                  <Tooltip title={`${customerName} · ${activityPeriod.month}: ${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`} arrow>
                                    <Box component="span" sx={{ display: 'inline-block', minWidth: 20 }}>
                                      {visitCount > 0 ? visitCount : '–'}
                                    </Box>
                                  </Tooltip>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                    ))}
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

export default CustomerBehaviorReport;
