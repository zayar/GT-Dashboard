import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  InputAdornment,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';

interface ServiceByMonth {
  service_name: string;
  month: string;
  count: number;
}

interface CustomerVisit {
  customer_name: string;
  customer_phone?: string;
  month: string;
  visit_count: number;
}

interface ServiceRecord {
  checkin_time: string;
  checkin_timestamp: number;
  service_date: string;
  month: string;
  service: string;
  customer_name: string;
  customer_phone?: string;
}

interface TherapistProfile {
  name: string;
  image?: string;
  total_services: number;
  total_active_days: number;
  unique_customers: number;
  first_service_date: string;
  last_service_date: string;
  servicesByMonth: ServiceByMonth[];
}

interface ServiceSummary {
  name: string;
  total: number;
  months: Record<string, number>;
}

interface CustomerSummary {
  key: string;
  name: string;
  phone?: string;
  total: number;
  months: Record<string, number>;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  context: string;
}

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
const numberFormatter = new Intl.NumberFormat('en-US');

const surfaceBorder = '1px solid var(--border)';
const softPrimary = 'color-mix(in srgb, var(--primary) 11%, var(--surface))';
const softerPrimary = 'color-mix(in srgb, var(--primary) 6%, var(--surface))';

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, context }) => (
  <Paper
    variant="outlined"
    sx={{
      height: '100%',
      p: 2,
      borderColor: 'var(--border)',
      borderRadius: 2.5,
      bgcolor: 'var(--surface)',
      boxShadow: 'none',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
      <Box>
        <Typography
          variant="caption"
          sx={{ color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.02em' }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            mt: 0.35,
            color: 'var(--text-primary)',
            fontSize: { xs: '1.45rem', md: '1.7rem' },
            lineHeight: 1.2,
            fontWeight: 750,
          }}
        >
          {value}
        </Typography>
      </Box>
      <Box
        sx={{
          width: 38,
          height: 38,
          flexShrink: 0,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--primary)',
          bgcolor: softPrimary,
        }}
      >
        {icon}
      </Box>
    </Box>
    <Typography variant="body2" sx={{ mt: 1.2, color: 'var(--text-secondary)' }}>
      {context}
    </Typography>
  </Paper>
);

const getHeatmapColor = (value: number, maxValue: number): string => {
  if (value <= 0 || maxValue <= 0) return 'transparent';
  const strength = Math.round(12 + (value / maxValue) * 58);
  return `color-mix(in srgb, var(--primary) ${strength}%, var(--surface))`;
};

const getMonthLabel = (month: string, long = false): string => {
  const [yearValue, monthValue] = month.split('-').map(Number);
  if (!yearValue || !monthValue) return month;
  return new Intl.DateTimeFormat('en-US', {
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' } : {}),
  }).format(new Date(yearValue, monthValue - 1, 1));
};

const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const TherapistDetails: React.FC = (): JSX.Element => {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState(false);
  const [therapistData, setTherapistData] = useState<TherapistProfile | null>(null);
  const [customerVisits, setCustomerVisits] = useState<CustomerVisit[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [years, setYears] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [recordsPage, setRecordsPage] = useState(0);
  const recordsPerPage = 15;

  const handleBack = useCallback(() => navigate(-1), [navigate]);

  useEffect(() => {
    const fetchTherapistData = async () => {
      if (!name) {
        setError('Employee name is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const decodedTherapistName = decodeURIComponent(name);
        const safeTherapistName = decodedTherapistName.replace(/'/g, "''");

        const profileQuery = `
WITH TherapistStats AS (
  SELECT
    PractitionerName,
    ARRAY_AGG(
      NULLIF(PractitionerImage, '')
      IGNORE NULLS
      ORDER BY CheckInTime DESC
      LIMIT 1
    )[SAFE_OFFSET(0)] AS PractitionerImage,
    COUNT(*) AS total_services,
    COUNT(DISTINCT DATE(CheckInTime, 'Asia/Yangon')) AS total_active_days,
    COUNT(DISTINCT COALESCE(NULLIF(CustomerPhoneNumber, ''), NULLIF(CustomerName, ''))) AS unique_customers,
    MIN(CheckInTime) AS first_service_date,
    MAX(CheckInTime) AS last_service_date
  FROM great_time.MainDataView
  WHERE PractitionerName = '${safeTherapistName}'
  GROUP BY PractitionerName
)
SELECT
  PractitionerName AS name,
  PractitionerImage AS image,
  total_services,
  total_active_days,
  unique_customers,
  FORMAT_TIMESTAMP('%d %b, %Y', first_service_date, 'Asia/Yangon') AS first_service_date,
  FORMAT_TIMESTAMP('%d %b, %Y', last_service_date, 'Asia/Yangon') AS last_service_date
FROM TherapistStats;`;

        const dataQuery = `
WITH ServicesByMonth AS (
  SELECT
    ServiceName AS service_name,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime, 'Asia/Yangon')) AS month,
    COUNT(*) AS count
  FROM great_time.MainDataView
  WHERE PractitionerName = '${safeTherapistName}'
  GROUP BY ServiceName, month
),
CustomersByMonth AS (
  SELECT
    CustomerName AS customer_name,
    CustomerPhoneNumber AS customer_phone,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime, 'Asia/Yangon')) AS month,
    COUNT(*) AS visit_count
  FROM great_time.MainDataView
  WHERE PractitionerName = '${safeTherapistName}'
  GROUP BY CustomerName, customer_phone, month
),
ServiceRecords AS (
  SELECT
    FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', CheckInTime, 'Asia/Yangon') AS checkin_time,
    UNIX_SECONDS(CheckInTime) AS checkin_timestamp,
    FORMAT_DATE('%Y-%m-%d', DATE(CheckInTime, 'Asia/Yangon')) AS service_date,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime, 'Asia/Yangon')) AS month,
    ServiceName AS service,
    CustomerName AS customer_name,
    CustomerPhoneNumber AS customer_phone
  FROM great_time.MainDataView
  WHERE PractitionerName = '${safeTherapistName}'
  ORDER BY CheckInTime DESC
)
SELECT
  ARRAY(SELECT AS STRUCT * FROM ServicesByMonth ORDER BY month DESC, count DESC) AS servicesByMonth,
  ARRAY(SELECT AS STRUCT * FROM CustomersByMonth ORDER BY month DESC, visit_count DESC) AS customersByMonth,
  ARRAY(SELECT AS STRUCT * FROM ServiceRecords) AS serviceRecords;`;

        const requestConfig = {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          timeout: 15000,
        };

        const [profileResponse, dataResponse] = await Promise.all([
          axios.post(`${import.meta.env.VITE_API_URL}/query`, { query: profileQuery }, requestConfig),
          axios.post(`${import.meta.env.VITE_API_URL}/query`, { query: dataQuery }, requestConfig),
        ]);

        if (!profileResponse.data.success || !profileResponse.data.data?.[0]) {
          throw new Error('Employee profile not found');
        }
        if (!dataResponse.data.success || !dataResponse.data.data?.[0]) {
          throw new Error(dataResponse.data.error || 'Failed to fetch employee activity');
        }

        const profile = profileResponse.data.data[0];
        const result = dataResponse.data.data[0];
        const fetchedServices = (result.servicesByMonth || []) as ServiceByMonth[];
        const fetchedCustomers = (result.customersByMonth || []) as CustomerVisit[];
        const fetchedRecords = (result.serviceRecords || []) as ServiceRecord[];

        setTherapistData({
          ...profile,
          total_services: Number(profile.total_services || 0),
          total_active_days: Number(profile.total_active_days || 0),
          unique_customers: Number(profile.unique_customers || 0),
          servicesByMonth: fetchedServices,
        });
        setCustomerVisits(fetchedCustomers);
        setServiceRecords(fetchedRecords);

        const availableYears = Array.from(
          new Set([
            ...fetchedServices.map((item) => item.month.split('-')[0]),
            ...fetchedCustomers.map((item) => item.month.split('-')[0]),
          ]),
        ).sort((a, b) => b.localeCompare(a));
        setYears(availableYears);
        setSelectedYear((current) =>
          availableYears.includes(current) ? current : availableYears[0] || current,
        );

        const availableMonths = Array.from(new Set(fetchedRecords.map((record) => record.month))).sort(
          (a, b) => b.localeCompare(a),
        );
        setSelectedMonth((current) =>
          availableMonths.includes(current) ? current : availableMonths[0] || '',
        );
      } catch (requestError: any) {
        console.error('Error fetching employee data:', requestError);
        setError(
          requestError.response?.data?.error ||
            requestError.message ||
            'Failed to fetch employee data',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTherapistData();
  }, [name]);

  useEffect(() => {
    setRecordsPage(0);
  }, [selectedMonth, activitySearch]);

  const selectedYearServices = useMemo(
    () =>
      (therapistData?.servicesByMonth || []).filter((item) =>
        item.month.startsWith(selectedYear),
      ),
    [selectedYear, therapistData],
  );

  const monthlyTotals = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const month = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
        const total = selectedYearServices
          .filter((item) => item.month === month)
          .reduce((sum, item) => sum + Number(item.count || 0), 0);
        return {
          month,
          label: monthFormatter.format(new Date(Number(selectedYear), index, 1)),
          total,
        };
      }),
    [selectedYear, selectedYearServices],
  );

  const monthsWithActivity = useMemo(
    () => monthlyTotals.filter((item) => item.total > 0).map((item) => item.month),
    [monthlyTotals],
  );

  const serviceRows = useMemo<ServiceSummary[]>(() => {
    const rows = new Map<string, ServiceSummary>();
    selectedYearServices.forEach((item) => {
      const existing = rows.get(item.service_name) || {
        name: item.service_name,
        total: 0,
        months: {},
      };
      existing.total += Number(item.count || 0);
      existing.months[item.month] = Number(item.count || 0);
      rows.set(item.service_name, existing);
    });
    return Array.from(rows.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [selectedYearServices]);

  const customerRows = useMemo<CustomerSummary[]>(() => {
    const rows = new Map<string, CustomerSummary>();
    customerVisits
      .filter((visit) => visit.month.startsWith(selectedYear))
      .forEach((visit) => {
        const key = visit.customer_phone || `${visit.customer_name}::no-phone`;
        const existing = rows.get(key) || {
          key,
          name: visit.customer_name,
          phone: visit.customer_phone,
          total: 0,
          months: {},
        };
        existing.total += Number(visit.visit_count || 0);
        existing.months[visit.month] =
          (existing.months[visit.month] || 0) + Number(visit.visit_count || 0);
        rows.set(key, existing);
      });
    return Array.from(rows.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [customerVisits, selectedYear]);

  const selectedYearRecords = useMemo(
    () => serviceRecords.filter((record) => record.month.startsWith(selectedYear)),
    [selectedYear, serviceRecords],
  );

  const yearServiceTotal = useMemo(
    () => monthlyTotals.reduce((sum, item) => sum + item.total, 0),
    [monthlyTotals],
  );
  const yearActiveDays = useMemo(
    () => new Set(selectedYearRecords.map((record) => record.service_date)).size,
    [selectedYearRecords],
  );
  const repeatCustomers = useMemo(
    () => customerRows.filter((customer) => customer.total > 1).length,
    [customerRows],
  );
  const repeatRate = customerRows.length
    ? Math.round((repeatCustomers / customerRows.length) * 100)
    : 0;
  const averagePerActiveDay = yearActiveDays ? yearServiceTotal / yearActiveDays : 0;
  const activeMonthCount = monthlyTotals.filter((item) => item.total > 0).length;
  const averagePerActiveMonth = activeMonthCount ? yearServiceTotal / activeMonthCount : 0;
  const topService = serviceRows[0];
  const topServiceShare =
    topService && yearServiceTotal ? Math.round((topService.total / yearServiceTotal) * 100) : 0;

  const latestMonthIndex = monthlyTotals.reduce(
    (latest, item, index) => (item.total > 0 ? index : latest),
    -1,
  );
  const latestMonth = latestMonthIndex >= 0 ? monthlyTotals[latestMonthIndex] : undefined;
  const previousMonth = latestMonthIndex > 0 ? monthlyTotals[latestMonthIndex - 1] : undefined;
  const monthChange =
    latestMonth && previousMonth?.total
      ? Math.round(((latestMonth.total - previousMonth.total) / previousMonth.total) * 100)
      : null;

  const filteredServiceRows = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    return query ? serviceRows.filter((row) => row.name.toLowerCase().includes(query)) : serviceRows;
  }, [serviceRows, serviceSearch]);

  const filteredCustomerRows = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customerRows;
    return customerRows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) || row.phone?.toLowerCase().includes(query),
    );
  }, [customerRows, customerSearch]);

  const availableRecordMonths = useMemo(
    () => Array.from(new Set(serviceRecords.map((record) => record.month))).sort((a, b) => b.localeCompare(a)),
    [serviceRecords],
  );

  const filteredServiceRecords = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();
    return serviceRecords.filter(
      (record) =>
        (!selectedMonth || record.month === selectedMonth) &&
        (!query ||
          record.service.toLowerCase().includes(query) ||
          record.customer_name.toLowerCase().includes(query) ||
          record.customer_phone?.toLowerCase().includes(query)),
    );
  }, [activitySearch, selectedMonth, serviceRecords]);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '70vh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'var(--background)',
        }}
      >
        <CircularProgress sx={{ color: 'var(--primary)' }} />
      </Box>
    );
  }

  if (error || !therapistData) {
    return (
      <Box
        sx={{
          minHeight: '70vh',
          p: 3,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'var(--background)',
        }}
      >
        <Box sx={{ maxWidth: 520, textAlign: 'center' }}>
          <Typography sx={{ color: error ? 'error.main' : 'var(--text-primary)', fontWeight: 700 }}>
            {error || 'No employee data found'}
          </Typography>
          <Button onClick={handleBack} startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
            Back to employees
          </Button>
        </Box>
      </Box>
    );
  }

  const maxMonthlyTotal = Math.max(1, ...monthlyTotals.map((item) => item.total));
  const maxServiceTotal = Math.max(1, ...serviceRows.map((item) => item.total));
  const maxServiceCell = Math.max(
    1,
    ...serviceRows.flatMap((row) => Object.values(row.months)),
  );
  const maxCustomerCell = Math.max(
    1,
    ...customerRows.flatMap((row) => Object.values(row.months)),
  );
  const latestRecords = selectedYearRecords.slice(0, 6);

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        bgcolor: 'var(--background)',
        color: 'var(--text-primary)',
        p: { xs: 2, sm: 3, md: 4 },
      }}
    >
      <Box
        sx={{
          mb: 2.5,
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
        }}
      >
        <Box>
          <Typography
            component="h1"
            sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, fontWeight: 750, lineHeight: 1.2 }}
          >
            Employee performance
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'var(--text-secondary)' }}>
            Activity, customer reach, and service mix for business review
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.25, width: { xs: '100%', md: 'auto' } }}>
          <Select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            size="small"
            aria-label="Analysis year"
            sx={{
              minWidth: 108,
              bgcolor: 'var(--surface)',
              color: 'var(--text-primary)',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
            }}
          >
            {years.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </Select>
          <Button
            onClick={handleBack}
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            sx={{
              whiteSpace: 'nowrap',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              bgcolor: 'var(--surface)',
              '&:hover': { borderColor: 'var(--primary)', bgcolor: softerPrimary },
            }}
          >
            Back to employees
          </Button>
        </Box>
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 2.5 },
          borderColor: 'var(--border)',
          borderRadius: 3,
          bgcolor: 'var(--surface)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Grid container spacing={2.5} alignItems="center">
          <Grid item xs={12} sm="auto">
            <Avatar
              src={!imageError ? therapistData.image : undefined}
              alt={therapistData.name}
              imgProps={{ onError: () => setImageError(true) }}
              sx={{
                width: { xs: 88, md: 104 },
                height: { xs: 88, md: 104 },
                mx: { xs: 'auto', sm: 0 },
                bgcolor: 'var(--primary)',
                color: 'var(--surface)',
                fontSize: '1.8rem',
                fontWeight: 700,
                border: '4px solid',
                borderColor: softPrimary,
              }}
            >
              {(imageError || !therapistData.image) && getInitials(therapistData.name)}
            </Avatar>
          </Grid>
          <Grid item xs={12} sm>
            <Box
              sx={{
                display: 'flex',
                alignItems: { xs: 'center', sm: 'flex-start' },
                flexDirection: 'column',
              }}
            >
              <Typography
                sx={{
                  fontSize: { xs: '1.5rem', md: '1.85rem' },
                  fontWeight: 750,
                  textAlign: { xs: 'center', sm: 'left' },
                }}
              >
                {therapistData.name}
              </Typography>
              <Chip
                size="small"
                icon={<AccessTimeRoundedIcon />}
                label={`Latest activity ${therapistData.last_service_date}`}
                sx={{
                  mt: 1,
                  color: 'var(--primary)',
                  bgcolor: softPrimary,
                  '& .MuiChip-icon': { color: 'var(--primary)' },
                }}
              />
            </Box>
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: { xs: 'center', sm: 'flex-start' },
                columnGap: 3,
                rowGap: 1,
              }}
            >
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {numberFormatter.format(therapistData.total_services)}
                </strong>{' '}
                lifetime services
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {numberFormatter.format(therapistData.total_active_days)}
                </strong>{' '}
                distinct working days
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {numberFormatter.format(therapistData.unique_customers)}
                </strong>{' '}
                lifetime customers
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                First activity {therapistData.first_service_date}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2} sx={{ mt: 0 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            icon={<MedicalServicesRoundedIcon fontSize="small" />}
            label={`SERVICES IN ${selectedYear}`}
            value={numberFormatter.format(yearServiceTotal)}
            context={`${serviceRows.length} different service types`}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            icon={<GroupsRoundedIcon fontSize="small" />}
            label={`CUSTOMERS IN ${selectedYear}`}
            value={numberFormatter.format(customerRows.length)}
            context={`${repeatCustomers} returned more than once`}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            icon={<CalendarMonthRoundedIcon fontSize="small" />}
            label="ACTIVE DAYS"
            value={numberFormatter.format(yearActiveDays)}
            context={`${activeMonthCount} months with recorded activity`}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            icon={<TrendingUpRoundedIcon fontSize="small" />}
            label="SERVICES PER ACTIVE DAY"
            value={averagePerActiveDay.toFixed(1)}
            context={`${averagePerActiveMonth.toFixed(1)} services per active month`}
          />
        </Grid>
      </Grid>

      <Paper
        variant="outlined"
        sx={{
          mt: 2.5,
          borderColor: 'var(--border)',
          borderRadius: 3,
          bgcolor: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={selectedTab}
          onChange={(_event, value) => setSelectedTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Employee detail sections"
          sx={{
            minHeight: 54,
            px: { xs: 1, md: 2 },
            borderBottom: surfaceBorder,
            '& .MuiTab-root': {
              minHeight: 54,
              color: 'var(--text-secondary)',
              fontWeight: 700,
              textTransform: 'none',
            },
            '& .Mui-selected': { color: 'var(--primary) !important' },
            '& .MuiTabs-indicator': { bgcolor: 'var(--primary)', height: 3 },
          }}
        >
          <Tab label="Overview" />
          <Tab label={`Services (${serviceRows.length})`} />
          <Tab label={`Customers (${customerRows.length})`} />
          <Tab label={`Activity (${selectedYearRecords.length})`} />
        </Tabs>

        {selectedTab === 0 && (
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ mb: 2.5 }}>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 750 }}>
                Business owner summary
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.4, color: 'var(--text-secondary)' }}>
                The most useful signals from the selected year
              </Typography>
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} md={8}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2.25, height: '100%', borderRadius: 2.5, borderColor: 'var(--border)' }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 750 }}>Monthly service activity</Typography>
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                        Service records completed in {selectedYear}
                      </Typography>
                    </Box>
                    {latestMonth && (
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: 750 }}>{latestMonth.total}</Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                          {latestMonth.label}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Box
                    sx={{
                      mt: 3,
                      height: 210,
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: { xs: 0.5, sm: 1 },
                      borderBottom: surfaceBorder,
                    }}
                  >
                    {monthlyTotals.map((item) => (
                      <Box
                        key={item.month}
                        title={`${getMonthLabel(item.month, true)}: ${item.total} services`}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                        }}
                      >
                        {item.total > 0 && (
                          <Typography
                            variant="caption"
                            sx={{ mb: 0.5, color: 'var(--text-secondary)', fontWeight: 700 }}
                          >
                            {item.total}
                          </Typography>
                        )}
                        <Box
                          sx={{
                            width: '72%',
                            minWidth: 8,
                            maxWidth: 36,
                            height: item.total ? `${Math.max(8, (item.total / maxMonthlyTotal) * 80)}%` : 3,
                            borderRadius: '7px 7px 0 0',
                            bgcolor: item.total ? 'var(--primary)' : 'var(--border)',
                            opacity: item.total ? 0.86 : 0.6,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ mt: 0.8, mb: 0.75, color: 'var(--text-secondary)' }}
                        >
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} md={4}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2.25, height: '100%', borderRadius: 2.5, borderColor: 'var(--border)' }}
                >
                  <Typography sx={{ fontWeight: 750 }}>Key observations</Typography>
                  <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1.25 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: 1.7,
                          bgcolor: softPrimary,
                          color: 'var(--primary)',
                        }}
                      >
                        <StarRoundedIcon fontSize="small" />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 750 }}>
                          {topService?.name || 'No service activity'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                          {topService
                            ? `Top service: ${topService.total} records (${topServiceShare}% of the year)`
                            : `No services recorded in ${selectedYear}`}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1.25 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: 1.7,
                          bgcolor: softPrimary,
                          color: 'var(--primary)',
                        }}
                      >
                        <GroupsRoundedIcon fontSize="small" />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 750 }}>
                          {repeatRate}% repeat clients
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                          {repeatCustomers} of {customerRows.length} customers visited more than once
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1.25 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: 1.7,
                          bgcolor: softPrimary,
                          color: 'var(--primary)',
                        }}
                      >
                        {monthChange !== null && monthChange < 0 ? (
                          <TrendingDownRoundedIcon fontSize="small" />
                        ) : (
                          <TrendingUpRoundedIcon fontSize="small" />
                        )}
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 750 }}>
                          {monthChange === null
                            ? 'Monthly comparison unavailable'
                            : `${monthChange >= 0 ? '+' : ''}${monthChange}% month over month`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                          {latestMonth && previousMonth
                            ? `${latestMonth.label} compared with ${previousMonth.label}`
                            : 'More recorded months are needed for comparison'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2.25, height: '100%', borderRadius: 2.5, borderColor: 'var(--border)' }}
                >
                  <Typography sx={{ fontWeight: 750 }}>Top services</Typography>
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                    Highest-volume services in {selectedYear}
                  </Typography>
                  <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
                    {serviceRows.slice(0, 6).map((service) => (
                      <Box
                        key={service.name}
                        onClick={() => navigate(`/services/${encodeURIComponent(service.name)}`)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <Box
                          sx={{
                            mb: 0.55,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ fontWeight: 650, color: 'var(--text-primary)' }}
                          >
                            {service.name}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 750 }}>
                            {service.total}
                          </Typography>
                        </Box>
                        <Box sx={{ height: 7, borderRadius: 999, bgcolor: 'var(--surface-secondary)' }}>
                          <Box
                            sx={{
                              width: `${Math.max(4, (service.total / maxServiceTotal) * 100)}%`,
                              height: '100%',
                              borderRadius: 999,
                              bgcolor: 'var(--primary)',
                            }}
                          />
                        </Box>
                      </Box>
                    ))}
                    {serviceRows.length === 0 && (
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                        No service activity in {selectedYear}.
                      </Typography>
                    )}
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper
                  variant="outlined"
                  sx={{ height: '100%', borderRadius: 2.5, borderColor: 'var(--border)', overflow: 'hidden' }}
                >
                  <Box sx={{ p: 2.25, pb: 1.5 }}>
                    <Typography sx={{ fontWeight: 750 }}>Recent activity</Typography>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                      Latest service records in {selectedYear} · Yangon time
                    </Typography>
                  </Box>
                  {latestRecords.map((record, index) => (
                    <Box
                      key={`${record.checkin_timestamp}-${record.service}-${index}`}
                      sx={{
                        px: 2.25,
                        py: 1.15,
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 2,
                        borderTop: surfaceBorder,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
                          {record.service}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{ color: 'var(--text-secondary)' }}>
                          {record.customer_name}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {record.checkin_time}
                      </Typography>
                    </Box>
                  ))}
                  {latestRecords.length === 0 && (
                    <Typography variant="body2" sx={{ px: 2.25, pb: 2.25, color: 'var(--text-secondary)' }}>
                      No activity recorded in {selectedYear}.
                    </Typography>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}

        {selectedTab === 1 && (
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Box
              sx={{
                mb: 2,
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 750 }}>Service mix by month</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Exact monthly volume; darker cells indicate higher activity
                </Typography>
              </Box>
              <TextField
                value={serviceSearch}
                onChange={(event) => setServiceSearch(event.target.value)}
                placeholder="Find a service"
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: { xs: '100%', sm: 260 } }}
              />
            </Box>
            <TableContainer sx={{ maxHeight: 590, border: surfaceBorder, borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        minWidth: 250,
                        position: 'sticky',
                        left: 0,
                        zIndex: 4,
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 750,
                        borderRight: surfaceBorder,
                      }}
                    >
                      Service
                    </TableCell>
                    {monthsWithActivity.map((month) => (
                      <TableCell
                        key={month}
                        align="center"
                        sx={{
                          minWidth: 92,
                          bgcolor: 'var(--surface-secondary)',
                          color: 'var(--text-secondary)',
                          fontWeight: 750,
                        }}
                      >
                        {getMonthLabel(month)}
                      </TableCell>
                    ))}
                    <TableCell
                      align="right"
                      sx={{
                        minWidth: 86,
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 750,
                      }}
                    >
                      Total
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredServiceRows.map((service) => (
                    <TableRow key={service.name} hover>
                      <TableCell
                        onClick={() => navigate(`/services/${encodeURIComponent(service.name)}`)}
                        sx={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-primary)',
                          fontWeight: 650,
                          cursor: 'pointer',
                          borderRight: surfaceBorder,
                          '&:hover': { color: 'var(--primary)' },
                        }}
                      >
                        {service.name}
                      </TableCell>
                      {monthsWithActivity.map((month) => {
                        const value = service.months[month] || 0;
                        return (
                          <TableCell
                            key={`${service.name}-${month}`}
                            align="center"
                            sx={{
                              color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
                              bgcolor: getHeatmapColor(value, maxServiceCell),
                              fontWeight: value ? 700 : 400,
                            }}
                          >
                            {value || '—'}
                          </TableCell>
                        );
                      })}
                      <TableCell align="right" sx={{ fontWeight: 750 }}>
                        {service.total}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredServiceRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={monthsWithActivity.length + 2} align="center" sx={{ py: 5 }}>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                          No matching service activity in {selectedYear}.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {selectedTab === 2 && (
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Box
              sx={{
                mb: 2,
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 750 }}>Customers served</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Customers ranked by visit volume in {selectedYear}
                </Typography>
              </Box>
              <TextField
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Find customer or phone"
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: { xs: '100%', sm: 280 } }}
              />
            </Box>
            <TableContainer sx={{ maxHeight: 590, border: surfaceBorder, borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        minWidth: 250,
                        position: 'sticky',
                        left: 0,
                        zIndex: 4,
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 750,
                        borderRight: surfaceBorder,
                      }}
                    >
                      Customer
                    </TableCell>
                    {monthsWithActivity.map((month) => (
                      <TableCell
                        key={month}
                        align="center"
                        sx={{
                          minWidth: 92,
                          bgcolor: 'var(--surface-secondary)',
                          color: 'var(--text-secondary)',
                          fontWeight: 750,
                        }}
                      >
                        {getMonthLabel(month)}
                      </TableCell>
                    ))}
                    <TableCell
                      align="right"
                      sx={{
                        minWidth: 86,
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 750,
                      }}
                    >
                      Visits
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCustomerRows.map((customer) => (
                    <TableRow key={customer.key} hover>
                      <TableCell
                        onClick={() =>
                          navigate(`/customers/${encodeURIComponent(customer.phone || customer.name)}`)
                        }
                        sx={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          bgcolor: 'var(--surface)',
                          cursor: 'pointer',
                          borderRight: surfaceBorder,
                          '&:hover': { color: 'var(--primary)' },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {customer.name}
                        </Typography>
                        {customer.phone && (
                          <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                            {customer.phone}
                          </Typography>
                        )}
                      </TableCell>
                      {monthsWithActivity.map((month) => {
                        const value = customer.months[month] || 0;
                        return (
                          <TableCell
                            key={`${customer.key}-${month}`}
                            align="center"
                            sx={{
                              color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
                              bgcolor: getHeatmapColor(value, maxCustomerCell),
                              fontWeight: value ? 700 : 400,
                            }}
                          >
                            {value || '—'}
                          </TableCell>
                        );
                      })}
                      <TableCell align="right" sx={{ fontWeight: 750 }}>
                        {customer.total}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCustomerRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={monthsWithActivity.length + 2} align="center" sx={{ py: 5 }}>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                          No matching customers in {selectedYear}.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {selectedTab === 3 && (
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Box
              sx={{
                mb: 2,
                display: 'flex',
                alignItems: { xs: 'stretch', md: 'center' },
                justifyContent: 'space-between',
                flexDirection: { xs: 'column', md: 'row' },
                gap: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 750 }}>Service activity</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Operational detail shown in Yangon time
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                <Select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  size="small"
                  sx={{ minWidth: 170 }}
                >
                  {availableRecordMonths.map((month) => (
                    <MenuItem key={month} value={month}>
                      {getMonthLabel(month, true)}
                    </MenuItem>
                  ))}
                </Select>
                <TextField
                  value={activitySearch}
                  onChange={(event) => setActivitySearch(event.target.value)}
                  placeholder="Find service or customer"
                  size="small"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ width: { xs: '100%', sm: 260 } }}
                />
              </Box>
            </Box>

            <TableContainer sx={{ border: surfaceBorder, borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'var(--surface-secondary)', fontWeight: 750, minWidth: 190 }}>
                      Check-in (Yangon)
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'var(--surface-secondary)', fontWeight: 750, minWidth: 220 }}>
                      Service
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'var(--surface-secondary)', fontWeight: 750, minWidth: 220 }}>
                      Customer
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredServiceRecords
                    .slice(recordsPage * recordsPerPage, (recordsPage + 1) * recordsPerPage)
                    .map((record, index) => (
                      <TableRow key={`${record.checkin_timestamp}-${record.service}-${index}`} hover>
                        <TableCell sx={{ color: 'var(--text-secondary)' }}>
                          {record.checkin_time}
                        </TableCell>
                        <TableCell
                          onClick={() => navigate(`/services/${encodeURIComponent(record.service)}`)}
                          sx={{
                            color: 'var(--text-primary)',
                            fontWeight: 650,
                            cursor: 'pointer',
                            '&:hover': { color: 'var(--primary)' },
                          }}
                        >
                          {record.service}
                        </TableCell>
                        <TableCell
                          onClick={() =>
                            navigate(
                              `/customers/${encodeURIComponent(
                                record.customer_phone || record.customer_name,
                              )}`,
                            )
                          }
                          sx={{ cursor: 'pointer', '&:hover': { color: 'var(--primary)' } }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 650 }}>
                            {record.customer_name}
                          </Typography>
                          {record.customer_phone && (
                            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                              {record.customer_phone}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {filteredServiceRecords.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 5 }}>
                        <PersonRoundedIcon sx={{ color: 'var(--text-secondary)', mb: 1 }} />
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                          No matching service activity for this month.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {filteredServiceRecords.length > 0 && (
              <Box
                sx={{
                  mt: 2,
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  justifyContent: 'space-between',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5,
                }}
              >
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Showing {recordsPage * recordsPerPage + 1}–
                  {Math.min((recordsPage + 1) * recordsPerPage, filteredServiceRecords.length)} of{' '}
                  {filteredServiceRecords.length}
                </Typography>
                <Pagination
                  count={Math.ceil(filteredServiceRecords.length / recordsPerPage)}
                  page={recordsPage + 1}
                  onChange={(_event, pageValue) => setRecordsPage(pageValue - 1)}
                  sx={{
                    '& .MuiPaginationItem-root.Mui-selected': {
                      bgcolor: 'var(--primary)',
                      color: 'var(--surface)',
                    },
                  }}
                />
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default TherapistDetails;
