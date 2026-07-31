import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Select,
  MenuItem,
  FormControl,
  SelectChangeEvent,
  Alert,
  AlertTitle,
  Avatar,
  Skeleton,
  useTheme
} from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  ChartOptions as ChartJsOptions,
  Filler,
  Legend as ChartLegend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip
} from 'chart.js';
import { addDays, format, subMonths } from 'date-fns';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency as formatCurrencyUtil } from '../utils/currency';
import { useNavigate } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, ChartLegend, Filler);

// Define period types
type PeriodType = 'monthly' | 'weekly' | 'annual';

interface AnimatedMetricProps {
  value: number;
  formatter: (value: number) => string;
}

interface MetricCardProps extends AnimatedMetricProps {
  label: string;
  context: string;
  change: number;
  icon: string;
  accent: string;
  accentSoft: string;
  delay: number;
}

const usePrefersReducedMotion = () => {
  const [reduceMotion, setReduceMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduceMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reduceMotion;
};

const AnimatedMetric: React.FC<AnimatedMetricProps> = ({ value, formatter }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      setDisplayValue(value);
      return;
    }

    const duration = 750;
    let animationFrame = 0;
    let startTime: number | null = null;

    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * easedProgress);
      if (progress < 1) animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [reduceMotion, value]);

  return <>{formatter(displayValue)}</>;
};

const ChangePill: React.FC<{ value: number; context: string }> = ({ value, context }) => {
  const isPositive = value >= 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
      <Box
        component="span"
        sx={{
          px: 0.9,
          py: 0.35,
          borderRadius: 999,
          color: isPositive ? 'var(--success)' : 'var(--error)',
          bgcolor: isPositive ? 'rgba(18, 166, 117, 0.10)' : 'rgba(229, 72, 77, 0.10)',
          fontSize: '0.75rem',
          lineHeight: 1.4,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {isPositive ? '↗' : '↘'} {Math.abs(value).toFixed(1)}%
      </Box>
      <Typography component="span" variant="caption" sx={{ color: 'var(--text-secondary)' }}>
        {context}
      </Typography>
    </Box>
  );
};

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  formatter,
  context,
  change,
  icon,
  accent,
  accentSoft,
  delay
}) => {
  return (
    <Box className="dashboard-metric-card" sx={{ height: '100%', animationDelay: `${delay}s` }}>
      <Paper
        sx={{
          p: 2.25,
          height: '100%',
          bgcolor: 'var(--surface)',
          borderRadius: 2.5,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 600, mb: 1.15 }}>
              {label}
            </Typography>
            <Typography
              sx={{
                color: 'var(--text-primary)',
                fontSize: { xs: '1.75rem', xl: '2rem' },
                lineHeight: 1.1,
                fontWeight: 750,
                letterSpacing: '-0.035em',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap'
              }}
            >
              <AnimatedMetric value={value} formatter={formatter} />
            </Typography>
          </Box>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: accentSoft,
              color: accent,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
          >
            <Box component="span" className={icon} sx={{ fontSize: '1rem' }} />
          </Box>
        </Box>
        <Box sx={{ mt: 1.6 }}>
          <ChangePill value={change} context={context} />
        </Box>
      </Paper>
    </Box>
  );
};

// Dashboard component
const Dashboard: React.FC = () => {
  const { currentClinic } = useClinic();
  const navigate = useNavigate();
  const theme = useTheme();
  const reduceMotion = usePrefersReducedMotion();
  // State for period selection and UI
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // State for statistics
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [incomeChange, setIncomeChange] = useState<number>(0);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [customerChange, setCustomerChange] = useState<number>(0);
  const [appointmentRate, setAppointmentRate] = useState<number>(0);
  const [appointmentChange, setAppointmentChange] = useState<number>(0);
  const [serviceCount, setServiceCount] = useState<number>(0);
  const [serviceChange, setServiceChange] = useState<number>(0);

  // State for payment methods chart
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    method: string;
    count: number;
    percentage: number;
  }>>([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState<boolean>(true);

  // State for top services table
  const [topServices, setTopServices] = useState<Array<{
    serviceName: string;
    bookingCount: number;
    customerCount: number;
    bookingChange: number;
    customerChange: number;
  }>>([]);
  const [topServiceTrend, setTopServiceTrend] = useState<Array<{
    serviceName: string;
    periodKey: string;
    bookingCount: number;
  }>>([]);
  const [loadingTopServices, setLoadingTopServices] = useState<boolean>(true);

  // State for top therapists
  const [topTherapists, setTopTherapists] = useState<Array<{
    name: string;
    image: string;
    bookingCount: number;
    percentage: number;
  }>>([]);
  const [loadingTherapists, setLoadingTherapists] = useState<boolean>(true);

  // Flag to track if we're using fallback data
  const [usingFallbackData, setUsingFallbackData] = useState<boolean>(false);

  // Handle period change
  const handlePeriodChange = (event: SelectChangeEvent<string>) => {
    setPeriod(event.target.value as PeriodType);
  };

  // Format number with commas
  const formatNumber = (value: number): string => {
    return value.toLocaleString('en-US');
  };

  // Show no data state instead of fallback
  const showNoDataState = () => {
    setTotalIncome(0);
    setIncomeChange(0);
    setCustomerCount(0);
    setCustomerChange(0);
    setAppointmentRate(0);
    setAppointmentChange(0);
    setServiceCount(0);
    setServiceChange(0);
    setLoading(false);
    setError(null);
    setUsingFallbackData(true);
  };

  // Fetch data based on selected period and current clinic
  useEffect(() => {
    if (!currentClinic) {
      setError('No clinic selected. Please select a clinic first.');
      setLoading(false);
      return;
    }

    const fetchChartData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Define time constraints based on the selected period. Query the actual
        // dashboard dataset directly instead of issuing a redundant probe request.
        let timeConstraint = '';
        let prevTimeConstraint = '';

        if (period === 'monthly') {
          const currentMonth = format(new Date(), 'yyyy-MM');
          const previousMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
          timeConstraint = `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = '${currentMonth}'`;
          prevTimeConstraint = `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = '${previousMonth}'`;
        } else if (period === 'weekly') {
          timeConstraint = 'DATE(OrderCreatedDate) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()';
          prevTimeConstraint = 'DATE(OrderCreatedDate) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)';
        } else if (period === 'annual') {
          const currentYear = new Date().getFullYear();
          timeConstraint = `EXTRACT(YEAR FROM OrderCreatedDate) = ${currentYear}`;
          prevTimeConstraint = `EXTRACT(YEAR FROM OrderCreatedDate) = ${currentYear - 1}`;
        }

        const fullQuery = `
          WITH PaymentRows AS (
            SELECT
              OrderCreatedDate,
              OrderId,
              CAST(NetTotal AS FLOAT64) as InvoiceRevenue,
              COALESCE(
                NULLIF(TRIM(InvoiceNumber), ''),
                CONCAT('ORDER:', CAST(OrderId AS STRING))
              ) as InvoiceKey
            FROM \`great_time.MainPaymentView\`
            WHERE PaymentMethod != 'PASS'
              AND PaymentStatus = 'PAID'
              AND CAST(NetTotal AS FLOAT64) > 0
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
              AND ((${timeConstraint}) OR (${prevTimeConstraint}))
          ),

          -- Keep invoice-level revenue once. MainPaymentView can contain repeated
          -- item/payment rows and many clinics do not populate ServiceName.
          InvoiceData AS (
            SELECT
              InvoiceKey,
              MIN(OrderCreatedDate) as OrderCreatedDate,
              MAX(InvoiceRevenue) as Revenue
            FROM PaymentRows
            GROUP BY InvoiceKey
          ),

          -- Current period stats
          CurrentStats AS (
            SELECT
              IFNULL(SUM(Revenue), 0) as total_revenue
            FROM InvoiceData
            WHERE ${timeConstraint}
          ),

          -- Previous period stats for comparison
          PreviousStats AS (
            SELECT
              IFNULL(SUM(Revenue), 0) as prev_month_revenue
            FROM InvoiceData
            WHERE ${prevTimeConstraint}
          )

          SELECT
            cs.total_revenue,
            ps.prev_month_revenue
          FROM CurrentStats cs
          CROSS JOIN PreviousStats ps
        `;

        const fullResponse = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: fullQuery }),
        });

        if (!fullResponse.ok) {
          throw new Error(`Failed to fetch data (Status: ${fullResponse.status})`);
        }

        const fullResponseData = await fullResponse.json();

        if (!fullResponseData.success) {
          throw new Error(fullResponseData.error || 'The dashboard query failed.');
        }

        const data = fullResponseData.data || [];

        if (data.length === 0) {
          showNoDataState(); // Show no data state instead of showing error
          return;
        }

        const statsRow = data[0];
        const totalIncomeValue = Number(statsRow.total_revenue) || 0;
        const prevMonthIncome = Number(statsRow.prev_month_revenue) || 0;

        // Calculate percentage changes
        const calculatePercentageChange = (current: number, previous: number): number => {
          if (previous === 0) return current > 0 ? 100 : 0;
          return ((current - previous) / previous) * 100;
        };

        const incomeChangePercentage = calculatePercentageChange(totalIncomeValue, prevMonthIncome);

        setTotalIncome(totalIncomeValue);
        setIncomeChange(incomeChangePercentage);

        // Fetch statistics from QueenDataView for cards
        await fetchStatsData();

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
        setUsingFallbackData(false);
      } finally {
        setLoading(false);
        setLastUpdated(new Date());
      }
    };

    // Fetch statistics data from QueenDataView
    const fetchStatsData = async () => {
      try {
        // Define time periods for current and previous periods
        let currentPeriodFilter = '';
        let previousPeriodFilter = '';

        if (period === 'monthly') {
          const currentMonth = format(new Date(), 'yyyy-MM');
          const previousMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
          currentPeriodFilter = `FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${currentMonth}'`;
          previousPeriodFilter = `FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${previousMonth}'`;
        } else if (period === 'weekly') {
          currentPeriodFilter = 'DATE(CheckInTime) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()';
          previousPeriodFilter = 'DATE(CheckInTime) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)';
        } else if (period === 'annual') {
          const currentYear = new Date().getFullYear();
          currentPeriodFilter = `EXTRACT(YEAR FROM CheckInTime) = ${currentYear}`;
          previousPeriodFilter = `EXTRACT(YEAR FROM CheckInTime) = ${currentYear - 1}`;
        }

        const statsQuery = `
          WITH CurrentPeriodStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as current_customers,
              COUNT(DISTINCT BookingID) as current_appointments,
              COUNT(DISTINCT ServiceName) as current_services
            FROM \`great_time.MainDataView\`
            WHERE ${currentPeriodFilter}
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          ),
          PreviousPeriodStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as previous_customers,
              COUNT(DISTINCT BookingID) as previous_appointments,
              COUNT(DISTINCT ServiceName) as previous_services
            FROM \`great_time.MainDataView\`
            WHERE ${previousPeriodFilter}
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          )
          SELECT
            cp.current_customers,
            cp.current_appointments,
            cp.current_services,
            pp.previous_customers,
            pp.previous_appointments,
            pp.previous_services
          FROM CurrentPeriodStats cp, PreviousPeriodStats pp
        `;

        const statsResponse = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: statsQuery }),
        });

        if (!statsResponse.ok) {
          throw new Error(`Failed to fetch stats data (Status: ${statsResponse.status})`);
        }

        const statsResponseData = await statsResponse.json();

        if (!statsResponseData.success || !statsResponseData.data || statsResponseData.data.length === 0) {
          return; // Continue with chart data, just don't update the stats
        }

        const statsData = statsResponseData.data[0];

        // Calculate percentage changes
        const calculatePercentageChange = (current: number, previous: number): number => {
          if (previous === 0) return current > 0 ? 100 : 0;
          return ((current - previous) / previous) * 100;
        };

        const currentCustomers = Number(statsData.current_customers) || 0;
        const previousCustomers = Number(statsData.previous_customers) || 0;
        const customerChangePercentage = calculatePercentageChange(currentCustomers, previousCustomers);

        const currentAppointments = Number(statsData.current_appointments) || 0;
        const previousAppointments = Number(statsData.previous_appointments) || 0;

        // Calculate appointment rate (appointments per customer)
        const appointmentRateValue =
          currentCustomers > 0 ?
          (currentAppointments / currentCustomers) * 100 : 0;

        const prevAppointmentRate =
          previousCustomers > 0 ?
          (previousAppointments / previousCustomers) * 100 : 0;

        const appointmentChangePercentage = calculatePercentageChange(appointmentRateValue, prevAppointmentRate);

        const currentServices = Number(statsData.current_services) || 0;
        const previousServices = Number(statsData.previous_services) || 0;
        const serviceChangePercentage = calculatePercentageChange(currentServices, previousServices);

        // Update state with stats data
        setCustomerCount(currentCustomers);
        setCustomerChange(customerChangePercentage);
        setAppointmentRate(appointmentRateValue);
        setAppointmentChange(appointmentChangePercentage);
        setServiceCount(currentServices);
        setServiceChange(serviceChangePercentage);

        setUsingFallbackData(false); // Ensure we're not showing the fallback data notice

      } catch (err) {
        // Don't use fallback data here, just log the error
        // The chart data will still be displayed
      }
    };

    // Fetch top services data
    const fetchTopServices = async () => {
      setLoadingTopServices(true);
      try {
        // Define time constraints based on the selected period
        let timeConstraint = '';
        let prevTimeConstraint = '';

        if (period === 'monthly') {
          const currentMonth = format(new Date(), 'yyyy-MM');
          const previousMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
          timeConstraint = `FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${currentMonth}'`;
          prevTimeConstraint = `FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${previousMonth}'`;
        } else if (period === 'weekly') {
          timeConstraint = 'DATE(CheckInTime) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()';
          prevTimeConstraint = 'DATE(CheckInTime) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)';
        } else if (period === 'annual') {
          const currentYear = new Date().getFullYear();
          timeConstraint = `EXTRACT(YEAR FROM CheckInTime) = ${currentYear}`;
          prevTimeConstraint = `EXTRACT(YEAR FROM CheckInTime) = ${currentYear - 1}`;
        }

        const trendDateFormat = period === 'annual' ? '%Y-%m' : '%Y-%m-%d';

        const servicesQuery = `
          WITH CurrentBookings AS (
            SELECT
              TRIM(ServiceName) AS ServiceName,
              COUNT(DISTINCT BookingID) AS BookingCount,
              COUNT(DISTINCT CustomerName) AS CustomerCount
            FROM \`great_time.MainDataView\`
            WHERE ${timeConstraint}
              AND ServiceName IS NOT NULL
              AND TRIM(ServiceName) != ''
              AND LOWER(TRIM(ServiceName)) NOT IN ('booking deposit', 'booking deposits', 'deposit')
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            GROUP BY TRIM(ServiceName)
          ),

          TopCurrentServices AS (
            SELECT *
            FROM CurrentBookings
            ORDER BY BookingCount DESC
            LIMIT 5
          ),

          PreviousBookings AS (
            SELECT
              TRIM(ServiceName) AS ServiceName,
              COUNT(DISTINCT BookingID) AS BookingCount,
              COUNT(DISTINCT CustomerName) AS CustomerCount
            FROM \`great_time.MainDataView\`
            WHERE ${prevTimeConstraint}
              AND ServiceName IS NOT NULL
              AND TRIM(ServiceName) != ''
              AND LOWER(TRIM(ServiceName)) NOT IN ('booking deposit', 'booking deposits', 'deposit')
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            GROUP BY TRIM(ServiceName)
          ),

          TrendBookings AS (
            SELECT
              TRIM(ServiceName) AS ServiceName,
              FORMAT_DATE('${trendDateFormat}', DATE(CheckInTime)) AS PeriodKey,
              COUNT(DISTINCT BookingID) AS PeriodBookingCount
            FROM \`great_time.MainDataView\`
            WHERE ${timeConstraint}
              AND TRIM(ServiceName) IN (SELECT ServiceName FROM TopCurrentServices)
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            GROUP BY TRIM(ServiceName), PeriodKey
          )

          SELECT
            cb.ServiceName as serviceName,
            cb.BookingCount as bookingCount,
            cb.CustomerCount as customerCount,
            CASE
              WHEN pb.BookingCount IS NULL OR pb.BookingCount = 0 THEN 100
              ELSE ROUND(((cb.BookingCount - pb.BookingCount) / pb.BookingCount) * 100, 1)
            END as bookingChange,
            CASE
              WHEN pb.CustomerCount IS NULL OR pb.CustomerCount = 0 THEN 100
              ELSE ROUND(((cb.CustomerCount - pb.CustomerCount) / pb.CustomerCount) * 100, 1)
            END as customerChange,
            tb.PeriodKey as periodKey,
            tb.PeriodBookingCount as periodBookingCount
          FROM TopCurrentServices cb
          LEFT JOIN PreviousBookings pb ON cb.ServiceName = pb.ServiceName
          LEFT JOIN TrendBookings tb ON cb.ServiceName = tb.ServiceName
          ORDER BY cb.BookingCount DESC, tb.PeriodKey
        `;

        // Execute the query
        const servicesResponse = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: servicesQuery }),
        });

        if (!servicesResponse.ok) {
          throw new Error(`Failed to fetch top services data (Status: ${servicesResponse.status})`);
        }

        const servicesResponseData = await servicesResponse.json();

        if (!servicesResponseData.success || !servicesResponseData.data || servicesResponseData.data.length === 0) {
          setTopServices([]);
          setTopServiceTrend([]);
          return;
        }

        const serviceRows = servicesResponseData.data as Array<Record<string, unknown>>;
        const serviceMap = new Map<string, (typeof topServices)[number]>();

        serviceRows.forEach((service) => {
          const serviceName = String(service.serviceName || '');
          if (!serviceName || serviceMap.has(serviceName)) return;
          serviceMap.set(serviceName, {
            serviceName,
            bookingCount: Number(service.bookingCount) || 0,
            customerCount: Number(service.customerCount) || 0,
            bookingChange: Number(service.bookingChange) || 0,
            customerChange: Number(service.customerChange) || 0
          });
        });

        const formattedTopServices = Array.from(serviceMap.values())
          .sort((a, b) => b.bookingCount - a.bookingCount)
          .slice(0, 5);

        const formattedTrend = serviceRows
          .filter((service) => service.periodKey)
          .map((service) => ({
            serviceName: String(service.serviceName),
            periodKey: String(service.periodKey),
            bookingCount: Number(service.periodBookingCount) || 0
          }));

        setTopServices(formattedTopServices);
        setTopServiceTrend(formattedTrend);
      } catch (err) {
        setTopServices([]);
        setTopServiceTrend([]);
      } finally {
        setLoadingTopServices(false);
      }
    };

    // Fetch payment methods data
    const fetchPaymentMethods = async () => {
      setLoadingPaymentMethods(true);
      try {
        // Define time constraints based on the selected period
        let timeConstraint = '';

        if (period === 'monthly') {
          const currentMonth = format(new Date(), 'yyyy-MM');
          timeConstraint = `FORMAT_DATE('%Y-%m', DATE(OrderCreatedDate)) = '${currentMonth}'`;
        } else if (period === 'weekly') {
          timeConstraint = 'DATE(OrderCreatedDate) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()';
        } else if (period === 'annual') {
          const currentYear = new Date().getFullYear();
          timeConstraint = `EXTRACT(YEAR FROM OrderCreatedDate) = ${currentYear}`;
        }

        const paymentMethodsQuery = `
          WITH PaymentMethodCounts AS (
            SELECT
              CASE
                WHEN PaymentMethod = 'CASH' THEN 'Cash'
                WHEN PaymentMethod = 'BANK_TRANSFER' THEN 'Bank Transfer'
                WHEN PaymentMethod = 'CARD' THEN 'Card'
                WHEN PaymentMethod = 'MIXED' THEN 'Mixed'
                ELSE PaymentMethod
              END as Method,
              COUNT(DISTINCT InvoiceNumber) as Count
            FROM \`great_time.MainPaymentView\`
            WHERE ${timeConstraint}
              AND PaymentMethod IS NOT NULL
              AND PaymentMethod != 'PASS'
              AND PaymentStatus = 'PAID'
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            GROUP BY PaymentMethod
          ),

          TotalCount AS (
            SELECT SUM(Count) as Total FROM PaymentMethodCounts
          )

          SELECT
            pmc.Method as method,
            pmc.Count as count,
            ROUND((pmc.Count / tc.Total) * 100, 1) as percentage
          FROM PaymentMethodCounts pmc, TotalCount tc
          ORDER BY pmc.Count DESC
        `;

        // Execute the query
        const methodsResponse = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: paymentMethodsQuery }),
        });

        if (!methodsResponse.ok) {
          throw new Error(`Failed to fetch payment methods data (Status: ${methodsResponse.status})`);
        }

        const methodsResponseData = await methodsResponse.json();

        if (!methodsResponseData.success || !methodsResponseData.data || methodsResponseData.data.length === 0) {
          setPaymentMethods([]);
          return;
        }

        // Format the payment methods data
        const formattedPaymentMethods = methodsResponseData.data.map((method: any) => ({
          method: method.method,
          count: Number(method.count) || 0,
          percentage: Number(method.percentage) || 0
        }));

        setPaymentMethods(formattedPaymentMethods);
      } catch (err) {
        setPaymentMethods([]);
      } finally {
        setLoadingPaymentMethods(false);
      }
    };

    // Fetch top therapists data
    const fetchTopTherapists = async () => {
      setLoadingTherapists(true);
      try {
        // Define time constraints based on the selected period
        let timeConstraint = '';

        if (period === 'monthly') {
          const currentMonth = format(new Date(), 'yyyy-MM');
          timeConstraint = `FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${currentMonth}'`;
        } else if (period === 'weekly') {
          timeConstraint = 'DATE(CheckInTime) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()';
        } else if (period === 'annual') {
          const currentYear = new Date().getFullYear();
          timeConstraint = `EXTRACT(YEAR FROM CheckInTime) = ${currentYear}`;
        }

        const therapistsQuery = `
          WITH TherapistBookings AS (
            SELECT
              PractitionerName as name,
              PractitionerImage as image,
              COUNT(DISTINCT BookingID) as bookingCount
            FROM \`great_time.MainDataView\`
            WHERE ${timeConstraint}
              AND PractitionerName IS NOT NULL
              AND PractitionerName != ''
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            GROUP BY PractitionerName, PractitionerImage
            ORDER BY bookingCount DESC
            LIMIT 10
          ),

          TotalBookings AS (
            SELECT SUM(bookingCount) as total FROM TherapistBookings
          )

          SELECT
            tb.name,
            tb.image,
            tb.bookingCount,
            ROUND((tb.bookingCount / tbt.total) * 100, 1) as percentage
          FROM TherapistBookings tb, TotalBookings tbt
          ORDER BY tb.bookingCount DESC
        `;

        // Execute the query
        const therapistsResponse = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: therapistsQuery }),
        });

        if (!therapistsResponse.ok) {
          throw new Error(`Failed to fetch therapists data (Status: ${therapistsResponse.status})`);
        }

        const therapistsResponseData = await therapistsResponse.json();

        if (!therapistsResponseData.success || !therapistsResponseData.data || therapistsResponseData.data.length === 0) {
          setTopTherapists([]);
          return;
        }

        // Format the therapists data
        const formattedTherapists = therapistsResponseData.data.map((therapist: any) => ({
          name: therapist.name || 'Unknown',
          image: therapist.image || '',
          bookingCount: Number(therapist.bookingCount) || 0,
          percentage: Number(therapist.percentage) || 0
        }));

        setTopTherapists(formattedTherapists);
      } catch (err) {
        setTopTherapists([]);
      } finally {
        setLoadingTherapists(false);
      }
    };

    fetchChartData();
    fetchTopServices();
    fetchPaymentMethods();
    fetchTopTherapists();
  }, [period, currentClinic]);

  // Format currency using the utility function
  const formatCurrency = (value: number): string => {
    return formatCurrencyUtil(value, currentClinic);
  };

  const periodDetails = useMemo(() => {
    const now = new Date();

    if (period === 'weekly') {
      return {
        label: 'Last 7 days',
        comparison: 'vs previous 7 days'
      };
    }

    if (period === 'annual') {
      return {
        label: `${now.getFullYear()} year to date`,
        comparison: `vs ${now.getFullYear() - 1}`
      };
    }

    return {
      label: format(now, 'MMMM yyyy'),
      comparison: 'vs previous month'
    };
  }, [period]);

  // Payment Methods chart options
  const paymentMethodsChartOptions = useMemo((): ApexOptions => ({
    chart: {
      type: 'donut',
      fontFamily: 'Inter, SF Pro Display, sans-serif',
      background: 'transparent',
      animations: {
        enabled: !reduceMotion,
        speed: 650,
        animateGradually: {
          enabled: true,
          delay: 80
        },
        dynamicAnimation: {
          enabled: false
        }
      }
    },
    colors: theme.palette.mode === 'dark'
      ? ['#5CC3B2', '#F4B860', '#8FD5C9', '#C9A7EB', '#E79AAB']
      : ['#074142', '#D89018', '#2F8F82', '#7E57A5', '#C95D78'],
    stroke: {
      width: 3,
      colors: ['var(--surface)']
    },
    plotOptions: {
      pie: {
        donut: {
          size: '55%',
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: '16px',
              color: 'var(--text-primary)',
              offsetY: -10
            },
            value: {
              show: true,
              fontSize: '20px',
              color: 'var(--text-primary)',
              fontWeight: 600,
              formatter: (val) => `${val}%`
            },
            total: {
              show: true,
              label: 'Transactions',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              formatter: () => formatNumber(paymentMethods.reduce((sum, method) => sum + method.count, 0))
            }
          }
        }
      }
    },
    labels: paymentMethods.map(method => method.method),
    dataLabels: {
      enabled: false
    },
    legend: {
      show: false
    },
    tooltip: {
      theme: theme.palette.mode,
      y: {
        formatter: (val) => `${val}%`
      }
    }
  }), [paymentMethods, theme.palette.mode, reduceMotion]);

  // Payment Methods chart series
  const paymentMethodsChartSeries = useMemo(() =>
    paymentMethods.map(method => method.percentage),
  [paymentMethods]);

  // Add these handlers for navigation
  const handleServiceClick = (serviceName: string) => {
    navigate(`/services/${encodeURIComponent(serviceName)}`);
  };

  const handleTherapistClick = (therapistName: string) => {
    navigate(`/therapists/${encodeURIComponent(therapistName)}`);
  };

  const serviceTrendKeys = useMemo(() => {
    const now = new Date();

    if (period === 'weekly') {
      return Array.from({ length: 8 }, (_, index) => format(addDays(now, index - 7), 'yyyy-MM-dd'));
    }

    if (period === 'annual') {
      return Array.from({ length: now.getMonth() + 1 }, (_, index) => (
        `${now.getFullYear()}-${String(index + 1).padStart(2, '0')}`
      ));
    }

    return Array.from({ length: now.getDate() }, (_, index) => (
      format(new Date(now.getFullYear(), now.getMonth(), index + 1), 'yyyy-MM-dd')
    ));
  }, [period]);

  const serviceTrendSeries = useMemo(() => topServices.map((service) => {
    const points = new Map(
      topServiceTrend
        .filter((point) => point.serviceName === service.serviceName)
        .map((point) => [point.periodKey, point.bookingCount])
    );

    return {
      name: service.serviceName,
      data: serviceTrendKeys.map((key) => points.get(key) || 0)
    };
  }), [serviceTrendKeys, topServiceTrend, topServices]);

  const serviceTrendChartData = useMemo(() => {
    const palette = theme.palette.mode === 'dark'
      ? ['#5CC3B2', '#F4B860', '#8FD5C9', '#C9A7EB', '#E79AAB']
      : ['#074142', '#D89018', '#2F8F82', '#7E57A5', '#C95D78'];

    return {
      labels: serviceTrendKeys,
      datasets: serviceTrendSeries.map((series, index) => ({
        label: series.name,
        data: series.data,
        borderColor: palette[index],
        backgroundColor: palette[index],
        borderWidth: index === 0 ? 3.5 : 2.75,
        borderDash: index < 2 ? [] : index === 2 ? [7, 4] : index === 3 ? [3, 4] : [10, 4],
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBorderWidth: 2,
        pointBorderColor: theme.palette.background.paper,
        tension: 0.35,
        fill: false
      }))
    };
  }, [serviceTrendKeys, serviceTrendSeries, theme.palette.background.paper, theme.palette.mode]);

  const serviceTrendChartOptions = useMemo((): ChartJsOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : {
      duration: 950,
      easing: 'easeOutQuart'
    },
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'start',
        labels: {
          color: theme.palette.text.primary,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 18,
          font: { size: 12, weight: 600 }
        }
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: theme.palette.mode === 'dark' ? '#172B2C' : '#FFFFFF',
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.secondary,
        borderColor: theme.palette.divider,
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          title: (items) => {
            const key = String(items[0]?.label || '');
            const parts = key.split('-').map(Number);
            const date = new Date(parts[0], Math.max((parts[1] || 1) - 1, 0), parts[2] || 1);
            return format(date, period === 'annual' ? 'MMMM yyyy' : 'EEE, dd MMM yyyy');
          },
          label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toLocaleString('en-US')} bookings`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: theme.palette.divider },
        ticks: {
          color: theme.palette.text.secondary,
          autoSkip: true,
          maxTicksLimit: period === 'annual' ? 12 : 9,
          maxRotation: 0,
          callback: (_value, index) => {
            const key = serviceTrendKeys[index] || '';
            const parts = key.split('-').map(Number);
            const date = new Date(parts[0], Math.max((parts[1] || 1) - 1, 0), parts[2] || 1);
            return format(date, period === 'annual' ? 'MMM' : 'MMM dd');
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: theme.palette.divider },
        border: { display: false },
        title: {
          display: true,
          text: 'Distinct bookings',
          color: theme.palette.text.secondary,
          font: { size: 11, weight: 600 }
        },
        ticks: {
          color: theme.palette.text.secondary,
          precision: 0
        }
      }
    }
  }), [period, reduceMotion, serviceTrendKeys, theme.palette.divider, theme.palette.mode, theme.palette.text.primary, theme.palette.text.secondary]);

  const topTherapistMax = Math.max(...topTherapists.map(therapist => therapist.bookingCount), 1);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, backgroundColor: 'var(--background)', minHeight: 'calc(100vh - 64px)', overflow: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 3
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ color: 'var(--text-primary)', fontWeight: 750, letterSpacing: '-0.035em' }}>
            Performance overview
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.6 }}>
            {currentClinic?.name || 'Selected clinic'} · {periodDetails.label}
            {lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: { xs: '100%', sm: 'auto' } }}>
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.75, color: 'var(--success)' }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor', boxShadow: '0 0 0 4px rgba(18, 166, 117, 0.10)' }} />
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Live data</Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 150 }, flex: { xs: 1, sm: 'none' } }}>
            <Select
              value={period}
              onChange={handlePeriodChange}
              aria-label="Dashboard reporting period"
              sx={{
                color: 'var(--text-primary)',
                bgcolor: 'var(--surface)',
                borderRadius: 2,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
                '& .MuiSelect-icon': { color: 'var(--text-secondary)' }
              }}
            >
              <MenuItem value="weekly">Last 7 days</MenuItem>
              <MenuItem value="monthly">This month</MenuItem>
              <MenuItem value="annual">This year</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {usingFallbackData && (
        <Alert severity="info" sx={{ mb: 3, bgcolor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          <AlertTitle>No activity for this period</AlertTitle>
          No records were found for {periodDetails.label}. Try another period or confirm the selected clinic.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          {
            label: 'Total income',
            value: totalIncome,
            formatter: (value: number) => formatCurrency(value),
            change: incomeChange,
            icon: 'fas fa-coins',
            accent: 'var(--primary)',
            accentSoft: 'var(--primary-soft)'
          },
          {
            label: 'Unique customers',
            value: customerCount,
            formatter: (value: number) => formatNumber(Math.round(value)),
            change: customerChange,
            icon: 'fas fa-users',
            accent: 'var(--warning)',
            accentSoft: 'rgba(245, 158, 11, 0.10)'
          },
          {
            label: 'Appointments per customer',
            value: appointmentRate / 100,
            formatter: (value: number) => `${value.toFixed(2)}x`,
            change: appointmentChange,
            icon: 'fas fa-calendar-check',
            accent: 'var(--success)',
            accentSoft: 'rgba(18, 166, 117, 0.10)'
          },
          {
            label: 'Active services',
            value: serviceCount,
            formatter: (value: number) => formatNumber(Math.round(value)),
            change: serviceChange,
            icon: 'fas fa-spa',
            accent: 'var(--primary)',
            accentSoft: 'var(--primary-soft)'
          }
        ].map((metric, index) => (
          <Grid item xs={12} sm={6} lg={3} key={metric.label}>
            {loading ? (
              <Paper sx={{ p: 2.25, borderRadius: 2.5, bgcolor: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Skeleton width="42%" />
                <Skeleton width="70%" height={46} />
                <Skeleton width="55%" />
              </Paper>
            ) : (
              <MetricCard {...metric} context={periodDetails.comparison} delay={index * 0.07} />
            )}
          </Grid>
        ))}
      </Grid>

      <Paper
        sx={{
          p: { xs: 2, sm: 2.5 },
          bgcolor: 'var(--surface)',
          borderRadius: 2.5,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          mb: 2.5,
          overflow: 'hidden'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2.25 }}>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
              Top 5 services
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
              Distinct booking trend for the five leading services · {periodDetails.label}
            </Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, px: 1.1, py: 0.55, borderRadius: 1.5, bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>
            Hover for daily booking details
          </Box>
        </Box>
        {loadingTopServices ? (
          <Box sx={{ height: { xs: 310, md: 370 }, display: 'grid', alignContent: 'end', gap: 2, px: 2, pb: 3 }}>
            <Skeleton width="58%" />
            <Skeleton variant="rounded" height={250} />
          </Box>
        ) : topServices.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', py: 9, textAlign: 'center' }}>No service activity for this period</Typography>
        ) : (
          <Box
            role="img"
            aria-label={`Animated booking trend for the top five services in ${periodDetails.label}`}
            sx={{ height: { xs: 330, md: 390 }, minWidth: 0 }}
          >
            <Line options={serviceTrendChartOptions} data={serviceTrendChartData} />
          </Box>
        )}
      </Paper>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2.5, bgcolor: 'var(--surface)', borderRadius: 2.5, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', height: '100%' }}>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Payment mix</Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>Share of paid transactions · {periodDetails.label}</Typography>
            {loadingPaymentMethods ? (
              <Box sx={{ display: 'grid', placeItems: 'center', height: 300 }}><Skeleton variant="circular" width={190} height={190} /></Box>
            ) : paymentMethods.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)', py: 8, textAlign: 'center' }}>No payment activity</Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '210px 1fr', lg: '210px 1fr' }, alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                <Box sx={{ height: 210 }}>
                  <ReactApexChart options={paymentMethodsChartOptions} series={paymentMethodsChartSeries} type="donut" height="100%" />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                  {paymentMethods.slice(0, 5).map((method, index) => {
                    const colors = theme.palette.mode === 'dark'
                      ? ['#5CC3B2', '#F4B860', '#8FD5C9', '#C9A7EB', '#E79AAB']
                      : ['#074142', '#D89018', '#2F8F82', '#7E57A5', '#C95D78'];
                    return (
                      <Box key={method.method} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[index], flexShrink: 0 }} />
                        <Typography variant="caption" noWrap sx={{ color: 'var(--text-secondary)', flex: 1 }}>{method.method}</Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>{method.percentage.toFixed(1)}%</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2.5, bgcolor: 'var(--surface)', borderRadius: 2.5, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', height: '100%' }}>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Top therapists</Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>Bookings · {periodDetails.label}</Typography>
            <Box sx={{ mt: 2.2, display: 'grid', gap: 1.45 }}>
              {loadingTherapists ? Array.from({ length: 6 }).map((_, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1.2, alignItems: 'center' }}><Skeleton variant="circular" width={32} height={32} /><Box sx={{ flex: 1 }}><Skeleton width="65%" /><Skeleton variant="rounded" height={5} /></Box></Box>
              )) : topTherapists.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', py: 4, textAlign: 'center' }}>No therapist activity</Typography>
              ) : topTherapists.slice(0, 6).map((therapist, index) => (
                <Box key={therapist.name} onClick={() => handleTherapistClick(therapist.name)} sx={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: 1.1, alignItems: 'center', cursor: 'pointer' }}>
                  <Avatar src={therapist.image || undefined} sx={{ width: 32, height: 32, bgcolor: 'var(--primary)', fontSize: '0.75rem' }}>{!therapist.image && therapist.name.charAt(0)}</Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ color: 'var(--text-primary)', fontWeight: 600 }}>{therapist.name}</Typography>
                    <Box sx={{ mt: 0.55, height: 5, bgcolor: 'var(--surface-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                      <Box className="dashboard-ranking-bar" sx={{ width: `${(therapist.bookingCount / topTherapistMax) * 100}%`, height: '100%', borderRadius: 999, bgcolor: index === 0 ? 'var(--primary)' : 'var(--primary-muted)', animationDelay: `${index * 0.06}s` }} />
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(therapist.bookingCount)}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
