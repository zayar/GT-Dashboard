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
  ToggleButtonGroup
} from '@mui/material';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import SearchIcon from '@mui/icons-material/Search';
import { useClinic } from '../contexts/ClinicContext';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

// Define period type for time selection
type PeriodType = 'monthly' | 'quarterly' | 'annual';

interface CustomerVisit {
  customerName: string;
  month: string;
  visitCount: number;
}

interface MonthlyActivity {
  month: string;
  totalVisits: number;
}

interface MonthlyCustomers {
  month: string;
  uniqueCustomers: number;
}

const CustomerBehaviorReport: React.FC = () => {
  const { currentClinic } = useClinic();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyActivity, setMonthlyActivity] = useState<MonthlyActivity[]>([]);
  const [monthlyCustomers, setMonthlyCustomers] = useState<MonthlyCustomers[]>([]);
  const [customerVisits, setCustomerVisits] = useState<CustomerVisit[]>([]);
  const [yearSelection, setYearSelection] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
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
    return `${fmt(topStartMonth)}_to_${fmt(topEndMonth)} }`;
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
      let timeFilterSQL;
      let groupFormat;
      
      // Configure time filter based on period selection
      if (period === 'monthly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "FORMAT_TIMESTAMP('%b %Y', CheckInTime)";
      } else if (period === 'quarterly') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) = ${yearSelection}`;
        groupFormat = "CONCAT('Q', EXTRACT(QUARTER FROM CheckInTime), ' ', EXTRACT(YEAR FROM CheckInTime))";
      } else if (period === 'annual') {
        timeFilterSQL = `EXTRACT(YEAR FROM CheckInTime) >= ${yearSelection - 2} AND EXTRACT(YEAR FROM CheckInTime) <= ${yearSelection}`;
        groupFormat = "EXTRACT(YEAR FROM CheckInTime)::text";
      }
      
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
          COUNT(*) AS visitCount
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND CustomerName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY CustomerName, ${groupFormat}
        ORDER BY CustomerName, ${groupFormat} DESC
      `;
      
      // SQL for monthly unique customer counts
      const monthlyCustomersSQL = `
        SELECT 
          ${groupFormat} AS month,
          COUNT(DISTINCT CustomerName) AS uniqueCustomers
        FROM great_time.MainDataView
        WHERE ${timeFilterSQL}
        AND CustomerName IS NOT NULL
        AND ClinicCode = '${currentClinic.code}'
        GROUP BY ${groupFormat}
        ORDER BY ${groupFormat} ASC
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
        let customerVisitsData = visitsResponse.data.data || [];
        
        // For year 2024 and monthly period, ensure all months are represented
        if (yearSelection === 2024 && period === 'monthly') {
          const allMonths = generateMonthsForYear(2024);
          const allCustomers = Array.from(new Set(customerVisitsData.map((visit:any) => visit.customerName)));
          
          // For each customer, make sure they have entries for all months
          // Even if they have no visits (will be displayed as "-")
          allCustomers.forEach(customerName => {
            allMonths.forEach(month => {
              // Check if this customer-month combo exists
              const exists = customerVisitsData.some(
                (visit:any) => visit.customerName === customerName && visit.month === month
              );
              
              // If not, add an entry with zero visits
              if (!exists) {
                customerVisitsData.push({
                  customerName,
                  month,
                  visitCount: 0
                });
              }
            });
          });
        }
        
        setCustomerVisits(customerVisitsData);
      } else {
        setError(visitsResponse.data.error || 'Failed to fetch customer visit data.');
        return;
      }
      
      if (customersResponse.data.success) {
        let monthlyCustomersData = customersResponse.data.data || [];
        
        // For year 2024, make sure all 12 months are included even if no data
        if (yearSelection === 2024 && period === 'monthly') {
          const allMonths = generateMonthsForYear(2024);
          const existingMonths = new Set(monthlyCustomersData.map((item:any) => item.month));
          
          // Add missing months with zero counts
          allMonths.forEach(month => {
            if (!existingMonths.has(month)) {
              monthlyCustomersData.push({
                month,
                uniqueCustomers: 0
              });
            }
          });
          
          // Sort months chronologically
          monthlyCustomersData = monthlyCustomersData.sort((a:any, b:any) => {
            const dateA = new Date(a.month);
            const dateB = new Date(b.month);
            return dateA.getTime() - dateB.getTime();
          });
        }
        
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
        -- Purchases and spend within selected range from payments
        Purchases AS (
          SELECT 
            CustomerName,
            CustomerPhoneNumber,
            COUNT(DISTINCT InvoiceNumber) AS purchases,
            CAST(SUM(CAST(NetTotal AS FLOAT64)) AS INT64) AS spend
          FROM great_time.MainPaymentView
          WHERE CustomerName IS NOT NULL
            AND CustomerPhoneNumber IS NOT NULL
            AND PaymentStatus = 'PAID'
            AND PaymentMethod != 'PASS'
            AND DATE(OrderCreatedDate) BETWEEN DATE('${startStr}') AND DATE('${endStr}')
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
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
  
  // Helper to format month display (YYYY-MM to Month YYYY)
  const formatMonthDisplay = (monthStr: string): string => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };
  
  // Generate time constraint based on period selection
  const getTimeConstraint = (): string => {
    const currentDate = new Date();
    const selectedYear = yearSelection;
    
    if (period === 'annual') {
      return `AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}`;
    } else if (period === 'quarterly') {
      // Default to current quarter if in selected year
      const currentQuarter = Math.floor(currentDate.getMonth() / 3) + 1;
      const startMonth = (currentQuarter - 1) * 3 + 1;
      const endMonth = currentQuarter * 3;
      
      return `
        AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
        AND EXTRACT(MONTH FROM CheckInTime) BETWEEN ${startMonth} AND ${endMonth}
      `;
    } else {
      // Monthly - default to showing all months in the selected year
      return `AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}`;
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
    colors: ['#60a5fa'],
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    grid: {
      borderColor: '#334155',
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
          colors: '#d1d5db',
          fontSize: '12px'
        }
      },
      axisBorder: {
        show: true,
        color: '#334155'
      },
      axisTicks: {
        show: true,
        color: '#334155'
      }
    },
    yaxis: {
      title: {
        text: 'Unique Customers',
        style: {
          color: '#d1d5db',
          fontSize: '13px',
          fontWeight: 500
        }
      },
      labels: {
        style: {
          colors: '#d1d5db',
          fontSize: '12px'
        }
      }
    },
    tooltip: {
      y: {
        formatter: function (val: number) {
          return val.toString() + ' customers';
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

  // Group customer data by customer name for the top customers chart
  const topCustomers = useMemo(() => {
    const customerTotals = customerVisits.reduce((acc: {[key: string]: number}, visit) => {
      if (!acc[visit.customerName]) {
        acc[visit.customerName] = 0;
      }
      acc[visit.customerName] += visit.visitCount;
      return acc;
    }, {});
    
    return Object.entries(customerTotals)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [customerVisits]);

  // Add this function after the formatMonthDisplay function to generate all months for a year
  // Function to generate all months for a given year
  const generateMonthsForYear = (year: number): string[] => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(year, i, 1);
      months.push(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
    }
    return months;
  };

  return (
    <Box sx={{ 
      p: 3, 
      bgcolor: '#0f172a', 
      minHeight: '100vh',
      color: '#e2e8f0'
    }}>
      <Typography variant="h5" component="h1" sx={{ mb: 4, fontWeight: 600, color: '#e2e8f0' }}>
        Customer Behavior Report
      </Typography>

      {/* Filters header */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 120, bgcolor: '#1e293b', borderRadius: 1 }}>
          <InputLabel id="period-select-label" sx={{ color: '#94a3b8' }}>Period</InputLabel>
          <Select
            labelId="period-select-label"
            id="period-select"
            value={period}
            label="Period"
            onChange={handlePeriodChange}
            sx={{ 
              color: 'white',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#334155'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: '#475569'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#3b82f6'
              },
              '& .MuiSvgIcon-root': {
                color: '#94a3b8'
              }
            }}
          >
            <MenuItem value="monthly">Monthly</MenuItem>
            <MenuItem value="quarterly">Quarterly</MenuItem>
            <MenuItem value="annual">Annual</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 120, bgcolor: '#1e293b', borderRadius: 1 }}>
          <InputLabel id="year-select-label" sx={{ color: '#94a3b8' }}>Year</InputLabel>
          <Select
            labelId="year-select-label"
            id="year-select"
            value={yearSelection.toString()}
            label="Year"
            onChange={handleYearChange}
            sx={{ 
              color: 'white',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#334155'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: '#475569'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#3b82f6'
              },
              '& .MuiSvgIcon-root': {
                color: '#94a3b8'
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
          onClick={fetchCustomerActivityData}
          sx={{ 
            bgcolor: '#1e40af', 
            color: 'white',
            '&:hover': {
              bgcolor: '#1e3a8a'
            }
          }}
        >
          Refresh Data
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <CircularProgress sx={{ color: '#3b82f6' }} />
        </Box>
      ) : error ? (
        <Paper sx={{ 
          p: 4, 
          bgcolor: '#111827', 
          color: '#e2e8f0',
          border: '1px solid #334155',
          textAlign: 'center'
        }}>
          <Typography color="error" variant="h6" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button 
            variant="contained" 
            onClick={fetchCustomerActivityData}
            sx={{ bgcolor: '#1e40af' }}
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
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              height: '100%'
            }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 500, color: '#e2e8f0' }}>
                Monthly Customer Count
              </Typography>
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
            <Paper sx={{ p: 3, bgcolor: '#111827', borderRadius: 2, border: '1px solid #334155' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 500, color: '#e2e8f0' }}>Top 10 Customers</Typography>
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
                    slotProps={{ textField: { size: 'small', sx: { bgcolor: '#1e293b', '& .MuiInputBase-input': { color: '#e2e8f0' } } } }}
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
                      slotProps={{ textField: { size: 'small', sx: { bgcolor: '#1e293b', '& .MuiInputBase-input': { color: '#e2e8f0' } } } }}
                    />
                  )}
                </LocalizationProvider>
                <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 500 }}>
                  Ranked by: Spend
                </Typography>
                <Button 
                  variant="outlined"
                  size="small"
                  startIcon={<FileDownloadIcon />}
                  onClick={handleExportTopCsv}
                  sx={{ borderColor: '#2d3748', color: '#e2e8f0' }}
                >
                  Export CSV
                </Button>
              </Box>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: '#e2e8f0', color: '#111923', fontWeight: 700 }}>Name</TableCell>
                      <TableCell sx={{ bgcolor: '#e2e8f0', color: '#111923', fontWeight: 700 }}>Phone</TableCell>
                      <TableCell sx={{ bgcolor: '#e2e8f0', color: '#111923', fontWeight: 700 }}>Member ID</TableCell>
                      <TableCell sx={{ bgcolor: '#e2e8f0', color: '#111923', fontWeight: 700 }}>Visits</TableCell>
                      <TableCell sx={{ bgcolor: '#e2e8f0', color: '#111923', fontWeight: 700 }}>Purchases</TableCell>
                      <TableCell sx={{ bgcolor: '#e2e8f0', color: '#111923', fontWeight: 700 }}>Spend</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ color: '#e2e8f0' }}>Loading...</TableCell>
                      </TableRow>
                    ) : topCustomersRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ color: '#e2e8f0' }}>No data for the selected period.</TableCell>
                      </TableRow>
                    ) : topCustomersRows.map((row, idx) => (
                      <TableRow
                        key={idx}
                        hover
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#1c2a41' } }}
                        onClick={() => navigate(`/customers/${encodeURIComponent(row.phone)}`)}
                      >
                        <TableCell sx={{ color: '#e2e8f0' }}>{row.name}</TableCell>
                        <TableCell sx={{ color: '#e2e8f0' }}>{row.phone}</TableCell>
                        <TableCell sx={{ color: '#e2e8f0' }}>{row.memberId}</TableCell>
                        <TableCell sx={{ color: '#e2e8f0' }}>{row.visits}</TableCell>
                        <TableCell sx={{ color: '#e2e8f0' }}>{row.purchases}</TableCell>
                        <TableCell sx={{ color: '#e2e8f0' }}>{row.spend.toLocaleString('en-US')} MMK</TableCell>
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
              bgcolor: '#111827', 
              borderRadius: 2,
              border: '1px solid #334155',
              overflow: 'hidden'
            }}>
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 500, color: '#e2e8f0' }}>
                  All Active Members
                </Typography>
                <Box sx={{ width: '300px' }}>
                  <TextField
                    placeholder="Search members..."
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                      sx: {
                        color: 'white',
                        bgcolor: '#1e293b',
                        borderRadius: 1,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#334155'
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#475569'
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#3b82f6'
                        }
                      }
                    }}
                  />
                </Box>
              </Box>
              
              <TableContainer sx={{ 
                overflowX: 'auto',
                maxHeight: '650px',
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
                }
              }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ 
                        bgcolor: '#e2e8f0', 
                        color: '#111923', 
                        fontWeight: 'bold',
                        padding: '12px 16px',
                        borderBottom: '1px solid #2d3748',
                        whiteSpace: 'nowrap',
                        minWidth: '200px'
                      }}>
                        MEMBER NAME
                      </TableCell>
                      
                      {/* Dynamic month columns - get unique months from data and sort them */}
                      {Array.from(new Set(customerVisits.map(visit => visit.month)))
                        .sort((a, b) => {
                          // For year 2024, sort chronologically (January to December)
                          // Otherwise sort in reverse chronological order (newest first)
                          const dateA = new Date(a);
                          const dateB = new Date(b);
                          return yearSelection === 2024 
                            ? dateA.getTime() - dateB.getTime() 
                            : dateB.getTime() - dateA.getTime();
                        })
                        // Show all 12 months for year 2024, otherwise show 3 most recent months
                        .slice(0, yearSelection === 2024 ? 12 : 3)
                        .map(month => (
                        <TableCell 
                          key={month} 
                          align="center"
                          sx={{ 
                            bgcolor: '#e2e8f0', 
                            color: '#111923', 
                            fontWeight: 'bold',
                            padding: '12px 16px',
                            borderBottom: '1px solid #2d3748',
                            width: '120px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {month}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* Get all active customers (those with at least one visit in the period) */}
                    {filteredCustomers
                      .map(customerName => {
                        const uniqueMonths = Array.from(new Set(customerVisits.map(visit => visit.month)))
                          .sort((a, b) => {
                            // For year 2024, sort chronologically (January to December)
                            // Otherwise sort in reverse chronological order (newest first)
                            const dateA = new Date(a);
                            const dateB = new Date(b);
                            return yearSelection === 2024 
                              ? dateA.getTime() - dateB.getTime() 
                              : dateB.getTime() - dateA.getTime();
                          })
                          // Show all 12 months for year 2024, otherwise show 3 most recent months
                          .slice(0, yearSelection === 2024 ? 12 : 3);
                        
                        // Check if customer has any visits to determine if they're active
                        const customerHasVisits = customerVisits.some(
                          visit => visit.customerName === customerName && visit.visitCount > 0
                        );
                        
                        // Only show active customers
                        if (!customerHasVisits) return null;
                        
                        return (
                          <TableRow 
                            key={customerName}
                            sx={{
                              '&:nth-of-type(odd)': { bgcolor: '#162032' },
                              '&:nth-of-type(even)': { bgcolor: '#111923' },
                              '&:hover': { bgcolor: '#1c2a41' },
                            }}
                          >
                            <TableCell sx={{ 
                              color: '#e2e8f0',
                              padding: '12px 16px',
                              borderBottom: '1px solid #2d3748',
                              fontWeight: 500,
                              whiteSpace: 'nowrap'
                            }}>
                              {customerName}
                            </TableCell>
                            
                            {/* Display visit counts for each month */}
                            {uniqueMonths.map(month => {
                              const monthVisit = customerVisits.find(
                                visit => visit.customerName === customerName && visit.month === month
                              );
                              
                              const visitCount = monthVisit ? monthVisit.visitCount : 0;
                              
                              return (
                                <TableCell 
                                  key={`${customerName}-${month}`} 
                                  align="center"
                                  sx={{ 
                                    bgcolor: visitCount > 0 ? '#1e40af' : 'transparent', 
                                    color: '#e2e8f0',
                                    fontWeight: visitCount > 0 ? 600 : 400,
                                    borderBottom: '1px solid #2d3748',
                                    padding: '12px 16px'
                                  }}
                                >
                                  {visitCount > 0 ? visitCount : '-'}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                    }).filter(Boolean)}
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