import React, { useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import { Box, Paper, Typography, Avatar, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, IconButton, Select, MenuItem, Pagination, Button, Chip, FormControl, InputLabel, Tooltip } from '@mui/material';
import axios from 'axios';
import { SelectChangeEvent } from '@mui/material';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency } from '../utils/currency';
import { calculateAge, formatDateOfBirth } from '../utils/customerDemographics';
import { calculateCustomerPaymentSummary, markFirstInvoiceRows } from '../utils/paymentSummary';
import Customer360Panel from './customer360/Customer360Panel';

// Add interface for Wallet Transaction
interface WalletTransaction {
  transactionNumber: string;
  createddate_myanmar: string;
  type: string;
  status: 'IN' | 'OUT';
  balance: string;
  comment: string | null;
  MainAccountName?: string;
  senderName?: string;
  senderPhone?: string;
  recipientName?: string;
  recipientPhone?: string;
  customerRole?: 'SENDER' | 'RECIPIENT';
}

interface CustomerDetailsProps {}

interface CustomerNavigationState {
  returnTo?: string;
  returnLabel?: string;
}

type ServiceUsageView = 'lifetime' | 'year';

interface LifetimeServiceUsageData {
  services: string[];
  years: number[];
  data: { [service: string]: { [year: string]: number } };
  totals: { [service: string]: number };
  lastUsed: { [service: string]: string };
}

const CustomerDetails: React.FC<CustomerDetailsProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { phoneNumber } = useParams<{ phoneNumber: string }>();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = React.useState(true);
  const [customerData, setCustomerData] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(25);
  const [serviceFilter, setServiceFilter] = React.useState<'all' | 'remaining' | 'completed'>('all');
  const [selectedService, setSelectedService] = React.useState<string | null>(null);

  // Retry mechanism states
  const [retryCount, setRetryCount] = React.useState<number>(0);
  const [retryTimeout, setRetryTimeout] = React.useState<NodeJS.Timeout | null>(null);
  const [isInRetryMode, setIsInRetryMode] = React.useState<boolean>(false);
  const [retryMessage, setRetryMessage] = React.useState<string>('');

  // Add new state for payment history
  const [paymentHistory, setPaymentHistory] = React.useState<any[]>([]);
  const [paymentLoading, setPaymentLoading] = React.useState(true);
  const [paymentError, setPaymentError] = React.useState('');
  const [paymentFetched, setPaymentFetched] = React.useState(false);

  // Add state for Sales by Sales Person report
  const [selectedYear, setSelectedYear] = React.useState<number>(() => {
    return new Date().getFullYear();
  });
  // Add a ref to prevent fetch during cleanup
  const preventFetch = React.useRef(false);
  const [paymentSummary, setPaymentSummary] = React.useState<{
    totalSpent: number;
    invoiceCount: number;
    paymentMethods: { method: string; count: number; total: number }[];
  }>({
    totalSpent: 0,
    invoiceCount: 0,
    paymentMethods: [],
  });

  // Add state for service usage data (separated from customer data)
  const [serviceUsageData, setServiceUsageData] = React.useState<{
    services: string[];
    months: string[];
    data: { [key: string]: { [key: string]: number } };
  }>({
    services: [],
    months: [],
    data: {},
  });
  const [serviceUsageLoading, setServiceUsageLoading] = React.useState(true);
  const [serviceUsageError, setServiceUsageError] = React.useState('');
  const [serviceUsageRefreshKey, setServiceUsageRefreshKey] = React.useState(0);
  const serviceUsageRequestIdRef = React.useRef(0);
  const [serviceUsageView, setServiceUsageView] = React.useState<ServiceUsageView>('lifetime');
  const [lifetimeServiceUsage, setLifetimeServiceUsage] = React.useState<LifetimeServiceUsageData>({
    services: [],
    years: [],
    data: {},
    totals: {},
    lastUsed: {},
  });
  const [lifetimeUsageLoading, setLifetimeUsageLoading] = React.useState(true);
  const [lifetimeUsageError, setLifetimeUsageError] = React.useState('');

  // Add state for wallet transactions
  const [walletTransactions, setWalletTransactions] = React.useState<WalletTransaction[]>([]);
  const [walletLoading, setWalletLoading] = React.useState(true);
  const [walletError, setWalletError] = React.useState('');
  const [walletPage, setWalletPage] = React.useState(0);
  const walletRowsPerPage = 5;


  // Include recent years and every year where this customer has recorded activity.
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const recentYears = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
    return Array.from(new Set([...recentYears, ...lifetimeServiceUsage.years])).sort((a, b) => a - b);
  }, [lifetimeServiceUsage.years]);

  const applyAnalysisYear = useCallback((year: number, forceServiceRefresh = false) => {
    const yearChanged = year !== selectedYear;
    if (yearChanged) {
      setSelectedYear(year);
      setPage(0);
      setPaymentFetched(false);
      setServiceUsageData({ services: [], months: [], data: {} });
    } else if (forceServiceRefresh) {
      setServiceUsageData({ services: [], months: [], data: {} });
      setServiceUsageRefreshKey(current => current + 1);
    }
  }, [selectedYear]);

  // Handle year selection change
  const handleYearChange = (event: SelectChangeEvent<number>) => {
    applyAnalysisYear(Number(event.target.value), true);
    setServiceUsageView('year');
  };

  const handleUsageYearClick = (year: number) => {
    applyAnalysisYear(year, true);
    setServiceUsageView('year');
  };

  const sortedBookings = useMemo(() => {
    console.log("sortedBookings useMemo called with customerData:", customerData);
    if (!customerData?.recentBookings) {
      console.log("No recentBookings in customerData");
      return [];
    }
    console.log("recentBookings before sorting:", customerData.recentBookings);
    return [...customerData.recentBookings].sort((a, b) => {
      // Convert the formatted date strings back to Date objects for comparison
      const extractDate = (dateStr: string) => {
        try {
          // Parse date strings like "26 Feb, 2025 11:28 AM"
          return new Date(dateStr);
        } catch (e) {
          console.error("Error parsing date:", dateStr, e);
          return new Date(0); // Default to epoch if parsing fails
        }
      };

      const dateA = extractDate(a.date);
      const dateB = extractDate(b.date);
      return dateB.getTime() - dateA.getTime(); // Sort in descending order (newest first)
    });
  }, [customerData]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: SelectChangeEvent<number>) => {
    setRowsPerPage(parseInt(event.target.value.toString(), 10));
    setPage(0);
  };

  const handleServiceFilterChange = (event: SelectChangeEvent<'all' | 'remaining' | 'completed'>) => {
    setServiceFilter(event.target.value as 'all' | 'remaining' | 'completed');
  };

  const handleServiceNameClick = (serviceName: string) => {
    // If the same service is clicked again, clear the filter
    if (selectedService === serviceName) {
      setSelectedService(null);
    } else {
      // Set the selected service to filter bookings
      setSelectedService(serviceName);
    }
    // Reset to first page when filtering
    setPage(0);
  };

  const navigationState = location.state as CustomerNavigationState | null;
  const returnTo = navigationState?.returnTo?.startsWith('/') ? navigationState.returnTo : null;
  const returnLabel = navigationState?.returnLabel || 'Customers';

  const handleBack = React.useCallback(() => {
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }
    navigate(-1);
  }, [navigate, returnTo]);

  // Cancel any pending retry on unmount
  React.useEffect(() => {
    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [retryTimeout]);

  // Function to fetch year-dependent data (service usage and payment history)
  const fetchYearDependentData = useCallback(async () => {
    if (!phoneNumber || !currentClinic) {
      console.log('Cannot fetch year-dependent data: missing phone number or clinic');
      return;
    }

    const requestId = ++serviceUsageRequestIdRef.current;
    try {
      console.log('Fetching year-dependent data for year:', selectedYear);
      setServiceUsageLoading(true);
      setServiceUsageError('');

      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const sanitizeForSQL = (input: string): string => {
        return input.replace(/'/g, "''");
      };
      const escapedPhoneNumber = sanitizeForSQL(decodedPhoneNumber);
      const escapedClinicCode = sanitizeForSQL(currentClinic.code);

      // SQL query to get service usage data filtered by year
      const query = `
      WITH AllServiceUsage AS (
        SELECT
          ServiceName,
          CheckInTime
        FROM great_time.MainDataView
        WHERE RIGHT(REGEXP_REPLACE(CustomerPhoneNumber, r'[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE('${escapedPhoneNumber}', r'[^0-9]', ''), 9)
          AND ServiceName IS NOT NULL
          AND CheckInTime IS NOT NULL
          AND LOWER(ClinicCode) = LOWER('${escapedClinicCode}')
          AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear} -- Filter by selected year
      )
      SELECT
        ServiceName,
        FORMAT_TIMESTAMP('%Y-%m', CheckInTime) AS month,
        COUNT(*) AS usage_count
      FROM AllServiceUsage
      GROUP BY ServiceName, month
      ORDER BY month DESC, ServiceName
      `;

      console.log('Executing service usage query:', query);

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
        {
          query: query
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch service usage data');
      }

      if (requestId !== serviceUsageRequestIdRef.current) return;

      const serviceUsageRawData = response.data.data || [];
      console.log('Service usage data fetched successfully:', serviceUsageRawData.length, 'records');

      // Process the data to create a heat map of service usage by month
      const processedData: { [key: string]: { [key: string]: number } } = {};
      const services: Set<string> = new Set();

      serviceUsageRawData.forEach((item: any) => {
        const service = item.ServiceName || 'Unknown Service';
        const month = item.month || 'Unknown Month';
        const count = parseInt(item.usage_count) || 0;

        if (!processedData[service]) {
          processedData[service] = {};
        }

        processedData[service][month] = count;
        services.add(service);
      });

      // Always show the complete calendar year so inactivity is visible.
      const sortedMonths = Array.from(
        { length: 12 },
        (_, monthIndex) => `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`
      );

      // Create complete dataset with zero values for missing entries
      const serviceNames = Array.from(services).sort((a, b) => {
        const totalA = Object.values(processedData[a] || {}).reduce((sum, value) => sum + value, 0);
        const totalB = Object.values(processedData[b] || {}).reduce((sum, value) => sum + value, 0);
        return totalB - totalA || a.localeCompare(b);
      });
      serviceNames.forEach(service => {
        sortedMonths.forEach(month => {
          if (!processedData[service][month]) {
            processedData[service][month] = 0;
          }
        });
      });

      // Update service usage data in state
      setServiceUsageData({
        services: serviceNames,
        months: sortedMonths,
        data: processedData,
      });

    } catch (error) {
      if (requestId !== serviceUsageRequestIdRef.current) return;
      console.error('Error fetching year-dependent data:', error);
      setServiceUsageError('Unable to load service usage for this year.');
    } finally {
      if (requestId === serviceUsageRequestIdRef.current) {
        setServiceUsageLoading(false);
      }
    }
  }, [phoneNumber, currentClinic, selectedYear]);

  const fetchLifetimeServiceUsage = useCallback(async () => {
    if (!phoneNumber || !currentClinic) return;

    setLifetimeUsageLoading(true);
    setLifetimeUsageError('');
    try {
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const sanitizeForSQL = (input: string): string => input.replace(/'/g, "''");
      const escapedPhoneNumber = sanitizeForSQL(decodedPhoneNumber);
      const escapedClinicCode = sanitizeForSQL(currentClinic.code);
      const query = `
        SELECT
          TRIM(ServiceName) AS ServiceName,
          EXTRACT(YEAR FROM CheckInTime) AS usage_year,
          COUNT(*) AS usage_count,
          FORMAT_TIMESTAMP('%Y-%m-%d', MAX(CheckInTime), 'Asia/Yangon') AS last_used
        FROM great_time.MainDataView
        WHERE RIGHT(REGEXP_REPLACE(CustomerPhoneNumber, r'[^0-9]', ''), 9) = RIGHT(REGEXP_REPLACE('${escapedPhoneNumber}', r'[^0-9]', ''), 9)
          AND ServiceName IS NOT NULL
          AND TRIM(ServiceName) != ''
          AND CheckInTime IS NOT NULL
          AND LOWER(ClinicCode) = LOWER('${escapedClinicCode}')
        GROUP BY 1, 2
        ORDER BY usage_year, ServiceName
      `;

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 15000
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch lifetime service usage');
      }

      const usageByService: { [service: string]: { [year: string]: number } } = {};
      const totals: { [service: string]: number } = {};
      const lastUsed: { [service: string]: string } = {};
      const years = new Set<number>();

      (response.data.data || []).forEach((item: any) => {
        const service = String(item.ServiceName || 'Unknown Service');
        const year = Number(item.usage_year);
        const count = Number(item.usage_count) || 0;
        const lastUsedDate = String(item.last_used || '');
        if (!Number.isFinite(year)) return;

        years.add(year);
        usageByService[service] ||= {};
        usageByService[service][String(year)] = count;
        totals[service] = (totals[service] || 0) + count;
        if (lastUsedDate && (!lastUsed[service] || lastUsedDate > lastUsed[service])) {
          lastUsed[service] = lastUsedDate;
        }
      });

      const services = Object.keys(usageByService).sort(
        (a, b) => (totals[b] || 0) - (totals[a] || 0) || a.localeCompare(b)
      );
      setLifetimeServiceUsage({
        services,
        years: Array.from(years).sort((a, b) => a - b),
        data: usageByService,
        totals,
        lastUsed,
      });
    } catch (fetchError) {
      console.error('Error fetching lifetime service usage:', fetchError);
      setLifetimeServiceUsage({ services: [], years: [], data: {}, totals: {}, lastUsed: {} });
      setLifetimeUsageError('Unable to load lifetime service usage.');
    } finally {
      setLifetimeUsageLoading(false);
    }
  }, [currentClinic, phoneNumber]);

  // Fetch customer data when params change - this data doesn't depend on the year
  useEffect(() => {
    // Reset payment fetched state when phone number changes
    setPaymentFetched(false);
    preventFetch.current = false;

    if (phoneNumber && currentClinic) {
      fetchCustomerData().catch(err => {
        setError(`Failed to fetch customer data: ${err.message}`);
        setLoading(false);
      });
    }
  }, [phoneNumber, currentClinic]); // Removed selectedYear dependency

  useEffect(() => {
    fetchLifetimeServiceUsage().catch(fetchError => {
      console.error('Failed to fetch lifetime service usage:', fetchError);
    });
  }, [fetchLifetimeServiceUsage]);

  // Add dependency on selectedYear only for year-dependent data
  useEffect(() => {
    if (phoneNumber && currentClinic && !loading) {
      // Only fetch the data that should be affected by year changes
      fetchYearDependentData().catch(err => {
        console.error('Failed to fetch year-dependent data:', err);
      });
    }
  }, [selectedYear, serviceUsageRefreshKey, fetchYearDependentData, phoneNumber, currentClinic, loading]);

  // Effect for fetching payment history - this should still respect the year filter
  useEffect(() => {
    if (phoneNumber && !paymentFetched && !preventFetch.current && currentClinic) {
      try {
        // If we already have customer data, use the phone number from there for better reliability
        const phoneToUse = customerData && customerData.phone ? customerData.phone : phoneNumber;

        console.log('Initiating payment history fetch with phone:', phoneToUse);

        // Ensure we're using a properly decoded phone number
        let decodedPhone;
        try {
          decodedPhone = decodeURIComponent(phoneToUse);
        } catch (e) {
          console.error('Error decoding phone for payment history:', e);
          decodedPhone = phoneToUse;
        }

        fetchCustomerPaymentHistory(decodedPhone).catch(err => {
          console.error('Payment history fetch failed:', err);
          setPaymentFetched(true);
          setPaymentLoading(false);
          setPaymentError('Unable to load payment history');

          // Initialize empty payment history as fallback
          setPaymentHistory([]);
          setPaymentSummary({
            totalSpent: 0,
            invoiceCount: 0,
            paymentMethods: []
          });
        });
      } catch (error) {
        console.error('Error preparing payment history fetch:', error);
        setPaymentFetched(true);
        setPaymentLoading(false);

        // Initialize empty payment history as fallback
        setPaymentHistory([]);
        setPaymentSummary({
          totalSpent: 0,
          invoiceCount: 0,
          paymentMethods: []
        });
      }
    }
  }, [phoneNumber, paymentFetched, customerData, selectedYear, currentClinic]); // Keep selectedYear dependency for payment history

  const paymentHistoryRows = useMemo(() => {
    return markFirstInvoiceRows(paymentHistory);
  }, [paymentHistory]);

  // Add this function to calculate heatmap color based on value
  const getHeatmapColor = (value: number, maxValue: number) => {
    if (value === 0) return 'var(--surface-secondary)';
    const opacity = 0.12 + (value / (maxValue || 1)) * 0.76;
    return `rgba(7, 65, 66, ${opacity})`;
  };

  const formatHeatmapMonth = (month: string) => {
    const monthNumber = Number(month.split('-')[1]);
    if (!monthNumber || monthNumber < 1 || monthNumber > 12) return month;
    return new Date(selectedYear, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  };

  // Add this function to get the maximum value for proper color scaling
  const getMaxValue = (data: { [key: string]: { [key: string]: number } }): number => {
    if (!data || Object.keys(data).length === 0) return 1; // Default to 1 if no data

    try {
      const allValues = Object.values(data).flatMap(monthData =>
        Object.values(monthData).filter(value => typeof value === 'number' && !isNaN(value))
      );

      return allValues.length > 0 ? Math.max(...allValues) : 1;
    } catch (error) {
      console.error('Error calculating max value:', error);
      return 1; // Default to 1 on error
    }
  };

  // Filtered purchased services based on the selected filter
  const filteredPurchasedServices = useMemo(() => {
    if (!customerData) return [];
    return customerData.purchasedServices.filter((service: any) => {
      if (serviceFilter === 'all') {
        return true; // Show all services
      } else if (serviceFilter === 'remaining') {
        return service.remainingPackageCount > 0;
      } else {
        return service.remainingPackageCount === 0;
      }
    });
  }, [customerData, serviceFilter]);

  // Filtered all bookings based on the selected service
  const filteredBookings = useMemo(() => {
    console.log("filteredBookings useMemo called with sortedBookings:", sortedBookings);
    if (!customerData) {
      console.log("No customerData in filteredBookings");
      return [];
    }

    // Add debug logging to see what customer data contains
    console.log("Customer data in filteredBookings:", {
      hasBookings: !!customerData.bookings,
      bookingsLength: customerData.bookings?.length,
      hasRecentBookings: !!customerData.recentBookings,
      recentBookingsLength: customerData.recentBookings?.length
    });

    if (!selectedService) {
      console.log("No selectedService, returning all sortedBookings:", sortedBookings);
      return sortedBookings;
    }
    const filtered = sortedBookings.filter((booking: any) => booking.service === selectedService);
    console.log("Filtered bookings by service:", filtered);
    return filtered;
  }, [customerData, sortedBookings, selectedService]);

  const serviceUsageMetrics = useMemo(() => {
    const serviceTotals = serviceUsageData.services.map((service) => ({
      service,
      total: serviceUsageData.months.reduce(
        (sum, month) => sum + (serviceUsageData.data[service]?.[month] || 0),
        0
      ),
    }));
    const monthlyTotals = serviceUsageData.months.map((month) =>
      serviceUsageData.services.reduce(
        (sum, service) => sum + (serviceUsageData.data[service]?.[month] || 0),
        0
      )
    );

    return {
      totalUses: serviceTotals.reduce((sum, item) => sum + item.total, 0),
      activeMonths: monthlyTotals.filter((total) => total > 0).length,
      topService: serviceTotals.find((item) => item.total > 0) || null,
      serviceTotals: Object.fromEntries(serviceTotals.map((item) => [item.service, item.total])),
    };
  }, [serviceUsageData]);

  const lifetimeUsageMetrics = useMemo(() => {
    const totalUses = Object.values(lifetimeServiceUsage.totals).reduce((sum, count) => sum + count, 0);
    const topService = lifetimeServiceUsage.services[0] || null;
    return {
      totalUses,
      activeYears: lifetimeServiceUsage.years.length,
      topService,
    };
  }, [lifetimeServiceUsage]);

  const formatLastUsedDate = (value: string) => {
    if (!value) return 'Unknown';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const activitySummary = useMemo(() => {
    const rawLastVisit = customerData?.last_appointment;
    const parsedLastVisit = rawLastVisit ? Date.parse(rawLastVisit) : NaN;
    if (!Number.isFinite(parsedLastVisit)) {
      return { label: 'Unknown', detail: 'No valid visit date', tone: 'var(--text-secondary)' };
    }

    const daysSince = Math.max(0, Math.floor((Date.now() - parsedLastVisit) / 86_400_000));
    if (daysSince <= 30) return { label: 'Active', detail: `${daysSince} days since visit`, tone: 'var(--success)' };
    if (daysSince <= 90) return { label: 'Needs attention', detail: `${daysSince} days since visit`, tone: 'var(--warning)' };
    return { label: 'Lapsed', detail: `${daysSince} days since visit`, tone: 'var(--error)' };
  }, [customerData?.last_appointment]);

  const averageInvoiceValue = paymentSummary.invoiceCount > 0
    ? paymentSummary.totalSpent / paymentSummary.invoiceCount
    : 0;

  // Add a function to fetch customer payment history
  const fetchCustomerPaymentHistory = async (customerPhoneNumber: string) => {
    if (!customerPhoneNumber || !currentClinic) {
      setPaymentError('Customer phone number is required and clinic must be selected');
      setPaymentLoading(false);
      return;
    }

    try {
      setPaymentLoading(true);

      const decodedPhoneNumber = decodeURIComponent(customerPhoneNumber);
      const sanitizeForSQL = (input: string): string => {
        return input.replace(/'/g, "''");
      };
      const escapedPhoneNumber = sanitizeForSQL(decodedPhoneNumber);

      // Payment History query with year filtering
      const query = `
-- Get payment data
WITH CustomerPayments AS (
  SELECT
    OrderCreatedDate,
    InvoiceNumber,
    PaymentMethod,
    NetTotal,
    PaymentStatus,
    ServiceName,
    ServicePackageName,
    SellerName
  FROM great_time.MainPaymentView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
    AND EXTRACT(YEAR FROM OrderCreatedDate) = ${selectedYear} -- Filter by selected year
)

-- Select payment history and summary separately
SELECT
  InvoiceNumber AS invoiceNumber,
  FORMAT_TIMESTAMP('%Y-%m-%d', OrderCreatedDate) AS date,
  PaymentMethod AS method,
  ServiceName,
  ServicePackageName,
  SellerName,
  CAST(NetTotal AS INT64) AS amount,
  PaymentStatus AS status
FROM CustomerPayments
ORDER BY OrderCreatedDate DESC;

-- Run a separate query for summary data
-- SELECT
--   COUNT(DISTINCT InvoiceNumber) AS invoiceCount,
--   SUM(NetTotal) AS totalSpent
-- FROM CustomerPayments
-- WHERE PaymentStatus = 'PAID';

-- SELECT
--   PaymentMethod AS method,
--   COUNT(*) AS count,
--   SUM(NetTotal) AS total
-- FROM CustomerPayments
-- WHERE PaymentStatus = 'PAID'
-- GROUP BY PaymentMethod;
      `;

      try {
        console.log('Fetching payment history for customer:', escapedPhoneNumber, 'for year:', selectedYear);
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          {
            query: query
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
            },
            timeout: 15000 // Increase timeout to 15 seconds
          }
        );

        if (!response.data.success) {
          throw new Error('Failed to fetch payment history: ' + (response.data.error || 'Unknown error'));
        }

        const paymentData = response.data.data || [];
        console.log('Payment history fetched successfully, records:', paymentData.length);

        // Filter out records with 0 MMK value
        const filteredPaymentData = paymentData.filter((payment: any) =>
          payment.amount && payment.amount > 0
        );

        console.log(`Filtered out ${paymentData.length - filteredPaymentData.length} zero-value records`);
        setPaymentHistory(filteredPaymentData);

        // Calculate payment summary manually since we simplified the query
        if (filteredPaymentData.length > 0) {
          setPaymentSummary(calculateCustomerPaymentSummary(filteredPaymentData));
        } else {
          console.log('No payment history found for customer');
          setPaymentSummary({
            totalSpent: 0,
            invoiceCount: 0,
            paymentMethods: [],
          });
        }

        setPaymentFetched(true); // Mark payment data as fetched
        setPaymentLoading(false);
      } catch (axiosError: any) {
        // Handle rate limiting (429)
        if (axiosError.response && axiosError.response.status === 429) {
          // We won't retry payment history automatically
          // Just show a friendly error message
          setPaymentError('Rate limit exceeded. The payment history could not be loaded. Please try again later.');
          console.log('Rate limit hit fetching payment history. Not retrying automatically.');
          setPaymentLoading(false);
          setPaymentFetched(true); // Mark as fetched to prevent retries
        } else {
          // Log the error details to help with debugging
          console.error('Payment history API error:',
            axiosError.response ? `Status: ${axiosError.response.status}` : 'No response',
            axiosError.response ? axiosError.response.data : 'No data'
          );

          // Set a user-friendly error message
          let errorMessage = 'Failed to load payment history';
          if (axiosError.response && axiosError.response.data && axiosError.response.data.error) {
            errorMessage = `Error: ${axiosError.response.data.error}`;
          } else if (axiosError.message) {
            errorMessage = `Error: ${axiosError.message}`;
          }

          setPaymentError(errorMessage);
          setPaymentLoading(false);
          setPaymentFetched(true); // Mark as fetched to prevent retries
        }
      }
    } catch (error: any) {
      console.error('Error fetching payment history:', error);
      setPaymentError(error instanceof Error ? error.message : 'An unknown error occurred');
      setPaymentLoading(false);
      setPaymentFetched(true); // Mark as fetched to prevent retries
    }
  };

  const fetchWalletTransactions = useCallback(async (customerName: string) => {
    console.log('Starting fetchWalletTransactions for:', customerName);

    if (!currentClinic || !phoneNumber) {
      setWalletError('No clinic selected or phone number missing.');
      setWalletLoading(false);
      return;
    }

    setWalletLoading(true);
    setWalletError('');

    try {
      // Get phone number from URL params and normalize it like in payment queries
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const sanitizeForSQL = (input: string): string => {
        return input.replace(/'/g, "''");
      };
      const escapedPhoneNumber = sanitizeForSQL(decodedPhoneNumber);

      // Query wallet transactions from customer's perspective only (deduplicated)
      const query = `
        WITH CustomerTransactions AS (
          SELECT
            transactionNumber,
            type,
            status,
            balance,
            comment,
            createddate_myanmar,
            MainAccountName,
            senderName,
            senderPhone,
            recipientName,
            recipientPhone,
            CASE
              WHEN REPLACE(COALESCE(senderPhone, ''), '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '') THEN 'SENDER'
              ELSE 'RECIPIENT'
            END as customerRole,
            ROW_NUMBER() OVER (
              PARTITION BY transactionNumber
              ORDER BY
                CASE
                  WHEN REPLACE(COALESCE(senderPhone, ''), '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '') THEN 1
                  ELSE 2
                END
            ) as rn
          FROM
            \`piti-pass.passdb_prod.wallettransaction\`
          WHERE
            ClinicCode = '${currentClinic.pass_id}'
            AND (
              REPLACE(COALESCE(senderPhone, ''), '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
              OR REPLACE(COALESCE(recipientPhone, ''), '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
            )
        )
        SELECT
          transactionNumber,
          type,
          status,
          balance,
          comment,
          createddate_myanmar,
          MainAccountName,
          senderName,
          senderPhone,
          recipientName,
          recipientPhone,
          customerRole
        FROM CustomerTransactions
        WHERE rn = 1
        ORDER BY
          createddate_myanmar DESC
        LIMIT 50
      `;

      console.log('Executing wallet transaction query for phone:', escapedPhoneNumber);
      console.log('Full query:', query);

      const searchQuery = new URLSearchParams({
        projectId: "piti-pass",
        location: "us-central1",
      });

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/query2?${searchQuery}`,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.success && response.data.data) {
        console.log(`Fetched ${response.data.data.length} wallet transactions for customer phone: ${escapedPhoneNumber}`);
        setWalletTransactions(response.data.data);
      } else {
        console.warn('Invalid data format from backend:', response.data);
        throw new Error('Backend returned invalid data format');
      }
    } catch (err: any) {
      console.error('Error fetching wallet transactions:', err);
      setWalletError(err.response?.data?.error || err.message || 'An error occurred while fetching wallet transactions.');
    } finally {
      setWalletLoading(false);
    }
  }, [currentClinic, phoneNumber]);

  // Basic fetchCustomerData function that can be called from useEffect
    const fetchCustomerData = async () => {
    if (!phoneNumber || !currentClinic) {
      setError('Customer phone number is required and clinic must be selected');
        setLoading(false);
        return;
      }

      try {
      // Only reset loading state if not in retry mode
      if (!isInRetryMode) {
        setLoading(true);
        setError('');
      }

      const decodedPhoneNumber = decodeURIComponent(phoneNumber);

      // Escape single quotes to prevent SQL injection and handle special characters
      const sanitizeForSQL = (input: string): string => {
        return input.replace(/'/g, "''");
      };

      const escapedPhoneNumber = sanitizeForSQL(decodedPhoneNumber);
      console.log('Fetching data for phone number:', decodedPhoneNumber);

      // First, fetch customer profile with phone number filter - simplified query
        const profileQuery = `
WITH AllAppointments AS (
  SELECT DISTINCT
    BookingID,
    CheckInTime
  FROM great_time.MainDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND CheckInTime IS NOT NULL
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
)
SELECT
  CustomerName AS name,
  CustomerPhoneNumber AS phone,
  ARRAY_AGG(
    NULLIF(CAST(DateOfBirth AS STRING), '') IGNORE NULLS
    ORDER BY CheckInTime DESC
    LIMIT 1
  )[SAFE_OFFSET(0)] AS dateOfBirth,
  CAST(SUM(CAST(Price AS FLOAT64)) AS INT64) AS total_purchase_amount,
  COUNT(DISTINCT ServiceName) AS total_services,
  FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_appointment,
  (SELECT COUNT(*) FROM AllAppointments) AS total_appointments
FROM great_time.MainDataView
WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
GROUP BY CustomerName, CustomerPhoneNumber;`;

      console.log('Executing profile query:', profileQuery);

      try {
        const profileResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          {
            query: profileQuery
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
            },
            timeout: 15000
          }
        );

        if (!profileResponse.data.success) {
          throw new Error(profileResponse.data.error || 'Failed to fetch customer profile');
        }

        if (!profileResponse.data.data || profileResponse.data.data.length === 0) {
          // Try searching by name if possible
          setError('Customer profile not found. The phone number may be incorrect.');
          setLoading(false);
          return;
        }

        const profile = profileResponse.data.data[0];
        console.log('Profile data fetched successfully:', profile);

        // Then fetch other data with phone number filter - simplified query
        // Notice we're not filtering by year for purchased services and all bookings
        const dataQuery = `
-- Monthly sales data (not filtered by year since it's just for display purposes)
WITH MonthlySales AS (
  SELECT
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
    SUM(CAST(Price AS FLOAT64)) AS amount
  FROM great_time.MainDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND Price IS NOT NULL
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY month
  ORDER BY month DESC
  LIMIT 6
),

-- Purchased services - not filtered by year
PurchasedServices AS (
  SELECT DISTINCT
    ServiceName AS service,
    PackageCount AS packageCount,
    RemainingPackageCount AS remainingPackageCount,
    Price as PaymentAmount,
    FORMAT_TIMESTAMP('%d %b, %Y', MAX(CheckInTime)) AS last_used
FROM great_time.MainDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY service, PackageCount, RemainingPackageCount, Price
),

-- All bookings - not filtered by year
RecentBookings AS (
  SELECT
    BookingID,
    ServiceName as service,
    PractitionerName as therapist,
    FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', CheckInTime) as date,
    Price as price,
    'CONFIRMED' as status,
    'APP' as source
  FROM great_time.MainDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND CheckInTime IS NOT NULL
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  ORDER BY CheckInTime DESC
)

-- Final result with all data
SELECT
  IFNULL(
    (SELECT TO_JSON_STRING(ARRAY_AGG(
      STRUCT(month, amount)
    )) FROM MonthlySales),
    '[]'
  ) as monthlySales,

  IFNULL(
    (SELECT TO_JSON_STRING(ARRAY_AGG(
      STRUCT(service, packageCount, remainingPackageCount, PaymentAmount as paymentAmount, last_used as lastUsed)
    )) FROM PurchasedServices),
    '[]'
  ) as purchasedServices,

  IFNULL(
    (SELECT TO_JSON_STRING(ARRAY_AGG(
      STRUCT(BookingID as bookingId, service, therapist, date, price, status, source)
    )) FROM RecentBookings),
    '[]'
  ) as recentBookings
`;

        console.log('Executing data query:', dataQuery);

        const dataResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          {
            query: dataQuery
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
            },
            timeout: 15000
          }
        );

        if (!dataResponse.data.success) {
          throw new Error(dataResponse.data.error || 'Failed to fetch customer data');
        }

        console.log('Data query response:', dataResponse.data);

        const responseData = dataResponse.data.data[0];
        console.log('Customer detailed data fetched successfully');

        // Parse JSON strings from BigQuery results
        let monthlySales = [];
        let purchasedServices = [];
        let recentBookings = [];

        try {
          monthlySales = responseData.monthlySales ? JSON.parse(responseData.monthlySales) : [];
        } catch (e) {
          console.error('Error parsing monthlySales:', e);
        }

        try {
          purchasedServices = responseData.purchasedServices ? JSON.parse(responseData.purchasedServices) : [];
        } catch (e) {
          console.error('Error parsing purchasedServices:', e);
        }

        try {
          recentBookings = responseData.recentBookings ? JSON.parse(responseData.recentBookings) : [];
          console.log("Parsed recentBookings data:", recentBookings);

          // Transform bookingId property to match expected structure in UI
          recentBookings = recentBookings.map((booking: any) => ({
            ...booking,
            // Add any property transformations needed to match expected format in UI
            // For example, ensure consistent casing:
            bookingId: booking.bookingId,
            checkinTime: booking.date, // Copy date to checkinTime for backward compatibility
          }));
          console.log("Transformed recentBookings:", recentBookings);
        } catch (e) {
          console.error('Error parsing recentBookings:', e);
          recentBookings = []; // Ensure it's an empty array on error
        }

        // Set customer profile with parsed JSON data
        const formattedDateOfBirth = formatDateOfBirth(profile.dateOfBirth);
        setCustomerData({
          ...profile,
          dateOfBirth: formattedDateOfBirth,
          age: calculateAge(profile.dateOfBirth),
          monthlySales,
          purchasedServices,
          recentBookings,
          bookings: recentBookings // Add a duplicate field for backward compatibility
        });

        setLoading(false);
        setRetryCount(0);
        setIsInRetryMode(false);

        // New call to fetch wallet transactions
        if (profile.name) {
          fetchWalletTransactions(profile.name);
        }

      } catch (axiosError: any) {
        console.error('Error fetching customer data:', axiosError);

        // Check if this is a rate limit error (status 429)
        if (axiosError.response && axiosError.response.status === 429) {
          // Implement retry logic with exponential backoff
          const nextRetry = Math.min(2 ** retryCount * 2000, 30000); // Max 30 second delay
          const nextRetryCount = retryCount + 1;

          setRetryCount(nextRetryCount);
          setIsInRetryMode(true);
          setRetryMessage(`Rate limit exceeded. Retrying in ${nextRetry/1000} seconds (attempt ${nextRetryCount})...`);

          // Set a timeout to retry the request
          const timeout = setTimeout(() => {
            fetchCustomerData();
          }, nextRetry);

          setRetryTimeout(timeout);
      } else {
          // For non-rate limit errors, just show error message
          setError(`Failed to fetch customer data: ${axiosError.message || 'Unknown error'}`);
          setLoading(false);
        }

        throw axiosError;
      }

    } catch (error: any) {
      console.error('Error in customer data fetch:', error);
      if (!isInRetryMode) {
        setError(`Failed to load customer data: ${error.message || 'Unknown error'}`);
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'var(--surface)' }}>
        <CircularProgress sx={{ color: 'var(--primary)' }} />
      </Box>
    );
  }

  // Show retry message if in retry mode
  if (isInRetryMode) {
    return (
      <Box sx={{
        p: 4,
        maxWidth: '800px',
        margin: '0 auto',
        textAlign: 'center',
        bgcolor: 'var(--surface)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: '8px', mb: 3, width: '100%' }}>
          <Typography variant="h5" sx={{ mb: 2, color: 'var(--primary)' }}>
            Rate Limit Exceeded
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <CircularProgress size={40} sx={{ color: 'var(--primary)' }} />
          </Box>
          <Typography variant="body1" sx={{ color: 'var(--text-primary)', mb: 3 }}>
            {retryMessage}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 4 }}>
            The server is limiting requests. We're automatically retrying for you.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                if (retryTimeout) {
                  clearTimeout(retryTimeout);
                  setRetryTimeout(null);
                }
                setRetryCount(0);
                setIsInRetryMode(false);
                setError('Retry cancelled. Please try again manually.');
                setLoading(false);
              }}
              sx={{
                bgcolor: 'var(--primary)',
                '&:hover': { bgcolor: 'var(--primary-hover)' }
              }}
            >
              Cancel Retry
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{
        p: 4,
        maxWidth: '800px',
        margin: '0 auto',
        textAlign: 'center',
        bgcolor: 'var(--surface)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Typography variant="h5" sx={{ mb: 2, color: 'var(--text-primary)' }}>
          Customer Information
        </Typography>
        <Paper sx={{ p: 3, bgcolor: 'var(--surface)', borderRadius: '8px', mb: 3, width: '100%' }}>
          <Typography variant="h6" sx={{ color: 'var(--text-primary)', mb: 2 }}>
            {phoneNumber && (
              <span>Customer with phone {decodeURIComponent(phoneNumber)}</span>
            )}
          </Typography>

          {customerData ? (
            <Box sx={{ textAlign: 'left', mb: 3 }}>
              <Typography variant="body1" sx={{ color: 'var(--text-primary)', mb: 1 }}>
                We found some basic information for this customer:
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1, fontWeight: 'bold' }}>
                Name: {customerData.name}
              </Typography>
              {customerData.phone && customerData.phone !== 'Not available' && (
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
                  Phone: {customerData.phone}
                </Typography>
              )}
              {customerData.email && customerData.email !== 'Not available' && (
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
                  Email: {customerData.email}
                </Typography>
              )}
            </Box>
          ) : (
            <Typography variant="body1" sx={{ color: 'var(--text-primary)', mb: 3 }}>
              We couldn't find detailed information for this customer.
            </Typography>
          )}

          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 4 }}>
            {error}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 4 }}>
            This could be due to special characters in the phone number (+ symbol) or a temporary connection issue with the database.
            You can try the options below:
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                setError('');
                setLoading(true);
                setPaymentFetched(false);
                fetchCustomerData();
              }}
              sx={{
                bgcolor: 'var(--primary)',
                color: 'var(--text-primary)',
                '&:hover': { bgcolor: 'var(--primary-hover)' }
              }}
            >
              Retry
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate(-1)}
              sx={{
                borderColor: 'var(--primary)',
                color: 'var(--primary)',
                '&:hover': { borderColor: 'var(--primary-hover)', bgcolor: 'rgba(37, 99, 235, 0.08)' }
              }}
            >
              Back to Customers
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (!customerData) {
    return (
      <Box sx={{ p: 3, bgcolor: 'var(--surface)', color: 'var(--text-secondary)', height: '100vh' }}>
        <Button
          onClick={handleBack}
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          sx={{
            color: 'var(--primary)',
            mr: 2,
            borderColor: 'var(--border)',
            '&:hover': {
              bgcolor: 'var(--surface-secondary)',
              borderColor: 'var(--primary)'
            }
          }}
        >
          Back to {returnLabel}
        </Button>
        <Typography color="var(--text-secondary)">No customer data found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      p: { xs: 2, sm: 3, md: 3 },
      bgcolor: 'var(--background)',
      height: '100vh',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'hidden',
      color: 'var(--text-primary)',
      position: 'relative'
    }}>
      {/* Header with navigation and title */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
        mb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            onClick={handleBack}
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            aria-label={`Back to ${returnLabel}`}
            sx={{
              color: 'var(--text-secondary)',
              borderColor: 'var(--border)',
              bgcolor: 'var(--surface)',
              '&:hover': {
                bgcolor: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--primary)'
              }
            }}
          >
            Back to {returnLabel}
          </Button>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
              Customer Details
            </Typography>
            <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Analysis year updates monthly service detail and payment history
            </Typography>
          </Box>
        </Box>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ color: 'var(--text-secondary)' }}>Analysis year</InputLabel>
          <Select
            value={selectedYear}
            label="Analysis year"
            onChange={handleYearChange}
            sx={{
              bgcolor: 'var(--surface)',
              color: 'var(--text-primary)',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
              '& .MuiSelect-icon': { color: 'var(--text-secondary)' },
            }}
          >
            {yearOptions.map((year) => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Main content with proper scrolling */}
      <Box sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'var(--surface)',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'var(--border)',
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: '#3b82f6',
        }
      }}>
        {/* Customer header */}
        <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'var(--surface)', color: 'var(--text-primary)', mb: 2, borderRadius: 2.5, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item>
              <Avatar sx={{ width: 80, height: 80, bgcolor: 'var(--primary)' }}>
              {customerData.name?.charAt(0)?.toUpperCase()}
            </Avatar>
          </Grid>
          <Grid item xs>
              <Typography variant="h4" sx={{ mb: 1, color: 'var(--text-primary)' }}>
                {customerData.name}
            </Typography>
            <Grid container spacing={4}>
              <Grid item>
                  <Typography variant="body2" color="var(--text-secondary)">Phone</Typography>
                  <Typography color="var(--text-primary)">{customerData.phone}</Typography>
              </Grid>
              <Grid item>
                <Typography variant="body2" color="var(--text-secondary)">Date of Birth</Typography>
                <Typography color="var(--text-primary)">{customerData.dateOfBirth || 'Not available'}</Typography>
              </Grid>
              <Grid item>
                <Typography variant="body2" color="var(--text-secondary)">Age</Typography>
                <Typography color="var(--text-primary)">
                  {customerData.age !== null && customerData.age !== undefined
                    ? `${customerData.age} years`
                    : 'Not available'}
                </Typography>
              </Grid>
              {customerData.next_birthday !== null && customerData.next_birthday !== undefined && (
                <Grid item>
                    <Typography variant="body2" color="var(--text-secondary)">
                    Next Birthday
                    <CardGiftcardIcon
                      sx={{
                        ml: 1,
                        verticalAlign: 'middle',
                          color: '#f87171',
                        fontSize: '1.2rem'
                      }}
                    />
                  </Typography>
                    <Typography color="var(--text-primary)">
                    {customerData.next_birthday}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Grid>
        </Grid>
      </Paper>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 1.5,
            mb: 3,
          }}
        >
          {[
            {
              label: `Spend in ${selectedYear}`,
              value: paymentLoading ? 'Loading…' : paymentError ? 'Unavailable' : formatCurrency(paymentSummary.totalSpent, currentClinic),
              helper: `${paymentSummary.invoiceCount.toLocaleString()} paid invoice${paymentSummary.invoiceCount === 1 ? '' : 's'}`,
              accent: 'var(--primary)',
            },
            {
              label: 'Average invoice',
              value: paymentLoading ? 'Loading…' : paymentError ? 'Unavailable' : formatCurrency(averageInvoiceValue, currentClinic),
              helper: `Paid invoices in ${selectedYear}`,
              accent: 'var(--primary)',
            },
            {
              label: `Service uses in ${selectedYear}`,
              value: serviceUsageLoading ? 'Loading…' : serviceUsageMetrics.totalUses.toLocaleString(),
              helper: `${serviceUsageMetrics.activeMonths} active month${serviceUsageMetrics.activeMonths === 1 ? '' : 's'}`,
              accent: 'var(--success)',
            },
            {
              label: 'Lifetime visits',
              value: Number(customerData.total_appointments || 0).toLocaleString(),
              helper: 'Distinct bookings on record',
              accent: 'var(--primary)',
            },
            {
              label: 'Unique services',
              value: Number(customerData.total_services || 0).toLocaleString(),
              helper: 'Lifetime service variety',
              accent: 'var(--warning)',
            },
            {
              label: 'Engagement',
              value: activitySummary.label,
              helper: activitySummary.detail,
              accent: activitySummary.tone,
            },
          ].map((metric) => (
            <Paper
              key={metric.label}
              elevation={0}
              sx={{
                p: 2,
                bgcolor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderTop: `3px solid ${metric.accent}`,
                borderRadius: 2,
                minWidth: 0,
              }}
            >
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 650 }}>
                {metric.label}
              </Typography>
              <Typography sx={{ mt: 0.55, color: 'var(--text-primary)', fontSize: '1.25rem', lineHeight: 1.25, fontWeight: 750, overflowWrap: 'anywhere' }}>
                {metric.value}
              </Typography>
              <Typography sx={{ mt: 0.55, color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                {metric.helper}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Two column layout for services and bookings */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'var(--surface)', color: 'var(--text-primary)', height: '100%', borderRadius: '8px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>Purchased Services</Typography>
              {selectedService && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setSelectedService(null);
                    setPage(0);
                  }}
                  sx={{
                    color: 'var(--primary)',
                    borderColor: 'var(--primary)',
                    '&:hover': {
                      borderColor: 'var(--primary-hover)',
                      bgcolor: 'rgba(59, 130, 246, 0.08)'
                    }
                  }}
                >
                  Show All
                </Button>
              )}
            </Box>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel sx={{ color: 'var(--text-secondary)' }}>Filter</InputLabel>
              <Select
                value={serviceFilter}
                onChange={handleServiceFilterChange}
                sx={{
                  color: 'var(--text-primary)',
                  bgcolor: 'var(--surface)',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-muted)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' }
                }}
              >
                <MenuItem value="all" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>All</MenuItem>
                <MenuItem value="remaining" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>Remaining</MenuItem>
                <MenuItem value="completed" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>Completed</MenuItem>
              </Select>
            </FormControl>
            <TableContainer sx={{
              maxHeight: '400px',
              overflowY: 'auto',
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
                backgroundColor: 'var(--primary)',
              }
            }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Service Name</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Package Count</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Remaining</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPurchasedServices.map((service: any, index: number) => (
                      <TableRow key={index} sx={{ '&:hover': { bgcolor: 'var(--surface)' } }}>
                      <TableCell
                        sx={{
                            color: selectedService === service.service ? '#3b82f6' : 'var(--text-primary)',
                          cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                          '&:hover': {
                              color: 'var(--primary)',
                            textDecoration: 'underline'
                          },
                          fontWeight: selectedService === service.service ? 600 : 400,
                          bgcolor: selectedService === service.service ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                        }}
                        onClick={() => handleServiceNameClick(service.service)}
                      >
                        {service.service}
                      </TableCell>
                        <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{service.packageCount}</TableCell>
                        <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{service.remainingPackageCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'var(--surface)', color: 'var(--text-primary)', height: '100%', borderRadius: '8px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>
                  All Bookings
                  {selectedService && (
                    <Typography component="span" sx={{ color: 'var(--primary)', fontSize: '0.9em', ml: 1 }}>
                      (Filtered by: {selectedService})
                    </Typography>
                  )}
                </Typography>
                {selectedService && (
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                    {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}
                  </Typography>
                )}
              </Box>
              <TableContainer sx={{
                maxHeight: '400px',
                overflowY: 'auto',
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
                  backgroundColor: 'var(--primary)',
                }
              }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Check-in Time</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Service</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Therapist</TableCell>
                      <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredBookings
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((booking: any, index: number) => {
                      console.log("Rendering booking at index", index, ":", booking);
                      return (
                        <TableRow key={index} sx={{ '&:hover': { bgcolor: 'var(--surface)' } }}>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{booking.date}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{booking.service}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{booking.therapist}</TableCell>
                          <TableCell sx={{ borderBottom: '1px solid var(--border)' }}>
                        <Box
                          sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                                bgcolor: booking.status === 'CANCEL' ? '#ef4444' : '#10b981',
                            color: 'var(--text-primary)',
                            fontSize: '0.75rem'
                          }}
                        >
                          {booking.status}
                        </Box>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
              <Select
                value={rowsPerPage}
                onChange={handleChangeRowsPerPage}
                sx={{
                    color: 'var(--text-primary)',
                    bgcolor: 'var(--surface)',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-muted)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' }
                }}
                size="small"
              >
                  <MenuItem value={5} sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>5 per page</MenuItem>
                  <MenuItem value={10} sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>10 per page</MenuItem>
                  <MenuItem value={25} sx={{ bgcolor: 'var(--surface)', color: 'var(--text-primary)' }}>25 per page</MenuItem>
              </Select>
              <Pagination
                count={Math.ceil(filteredBookings.length / rowsPerPage)}
                page={page + 1}
                onChange={(event, newPage) => handleChangePage(event, newPage - 1)}
                sx={{
                  '& .MuiPaginationItem-root': {
                      color: 'var(--text-secondary)',
                  },
                  '& .MuiPaginationItem-root.Mui-selected': {
                      bgcolor: 'var(--primary)',
                    color: 'var(--text-primary)',
                    '&:hover': {
                        bgcolor: 'var(--primary-hover)'
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

        {/* Service usage heatmap */}
        <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'var(--surface)', color: 'var(--text-primary)', mb: 3, borderRadius: 2.5, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, flexDirection: { xs: 'column', md: 'row' }, mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Service Usage Pattern</Typography>
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.8rem', mt: 0.4 }}>
                {serviceUsageView === 'lifetime'
                  ? 'Lifetime service frequency by year. Select a year cell to open its January–December detail.'
                  : `Monthly service frequency from January through December ${selectedYear}. Select a service name to open its details.`}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'var(--surface)' }}>
                <Button
                  size="small"
                  variant={serviceUsageView === 'lifetime' ? 'contained' : 'text'}
                  onClick={() => setServiceUsageView('lifetime')}
                  sx={{ borderRadius: 0, boxShadow: 'none', bgcolor: serviceUsageView === 'lifetime' ? 'var(--primary)' : 'transparent', color: serviceUsageView === 'lifetime' ? 'var(--text-on-primary)' : 'var(--text-secondary)', '&:hover': { bgcolor: serviceUsageView === 'lifetime' ? 'var(--primary-hover)' : 'var(--surface-secondary)' } }}
                >
                  Lifetime overview
                </Button>
                <Button
                  size="small"
                  variant={serviceUsageView === 'year' ? 'contained' : 'text'}
                  onClick={() => setServiceUsageView('year')}
                  sx={{ borderRadius: 0, boxShadow: 'none', bgcolor: serviceUsageView === 'year' ? 'var(--primary)' : 'transparent', color: serviceUsageView === 'year' ? 'var(--text-on-primary)' : 'var(--text-secondary)', '&:hover': { bgcolor: serviceUsageView === 'year' ? 'var(--primary-hover)' : 'var(--surface-secondary)' } }}
                >
                  Monthly detail · {selectedYear}
                </Button>
              </Box>
              <Chip
                size="small"
                label={`${serviceUsageView === 'lifetime' ? lifetimeUsageMetrics.totalUses : serviceUsageMetrics.totalUses} service uses`}
                sx={{ bgcolor: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 650 }}
              />
              <Chip
                size="small"
                label={serviceUsageView === 'lifetime' ? `${lifetimeUsageMetrics.activeYears} active years` : `${serviceUsageMetrics.activeMonths}/12 active months`}
                sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
              />
              {serviceUsageView === 'lifetime' && lifetimeUsageMetrics.topService && (
                <Chip size="small" label={`Top: ${lifetimeUsageMetrics.topService}`} sx={{ bgcolor: 'var(--success-soft)', color: 'var(--success)', maxWidth: 260 }} />
              )}
              {serviceUsageView === 'year' && serviceUsageMetrics.topService && (
                <Tooltip title={`${serviceUsageMetrics.topService.total} uses in ${selectedYear}`}>
                  <Chip size="small" label={`Top: ${serviceUsageMetrics.topService.service}`} sx={{ bgcolor: 'var(--success-soft)', color: 'var(--success)', maxWidth: 260 }} />
                </Tooltip>
              )}
            </Box>
          </Box>
          {lifetimeUsageError && serviceUsageView === 'lifetime' && (
            <Box sx={{ p: 2, mb: 1.5, bgcolor: 'var(--error-soft)', border: '1px solid var(--error)', borderRadius: 1.5 }}>
              <Typography sx={{ color: 'var(--error)', fontSize: '0.85rem' }}>{lifetimeUsageError}</Typography>
            </Box>
          )}
          {serviceUsageView === 'lifetime' && (
            <TableContainer sx={{
              maxHeight: '420px',
              overflow: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 1.5,
              '&::-webkit-scrollbar': { width: '8px', height: '8px' },
              '&::-webkit-scrollbar-track': { backgroundColor: 'var(--surface-secondary)' },
              '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--border)', borderRadius: '4px' },
              '&::-webkit-scrollbar-thumb:hover': { backgroundColor: 'var(--primary)' }
            }}>
              <Table size="small" stickyHeader sx={{ minWidth: Math.max(760, 430 + lifetimeServiceUsage.years.length * 88) }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, position: 'sticky', left: 0, zIndex: 3, minWidth: 250, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                      Service
                    </TableCell>
                    {lifetimeServiceUsage.years.map(year => (
                      <TableCell key={year} align="center" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, minWidth: 88, borderBottom: '1px solid var(--border)' }}>
                        {year}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, minWidth: 105, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                      Lifetime Total
                    </TableCell>
                    <TableCell sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, minWidth: 130, borderBottom: '1px solid var(--border)' }}>
                      Last Used
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lifetimeUsageLoading ? (
                    <TableRow>
                      <TableCell colSpan={Math.max(3, lifetimeServiceUsage.years.length + 3)} align="center" sx={{ py: 6, color: 'var(--text-secondary)' }}>
                        <CircularProgress size={24} sx={{ color: 'var(--primary)', mr: 1.5 }} />
                        Loading lifetime service usage…
                      </TableCell>
                    </TableRow>
                  ) : lifetimeServiceUsage.services.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={Math.max(3, lifetimeServiceUsage.years.length + 3)} align="center" sx={{ py: 6, color: 'var(--text-secondary)' }}>
                        No service activity recorded for this customer.
                      </TableCell>
                    </TableRow>
                  ) : lifetimeServiceUsage.services.map(service => {
                    const maxValue = getMaxValue(lifetimeServiceUsage.data);
                    return (
                      <TableRow key={service} sx={{ '&:hover': { bgcolor: 'var(--surface-secondary)' } }}>
                        <TableCell
                          sx={{ color: 'var(--text-primary)', position: 'sticky', left: 0, bgcolor: 'var(--surface)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', cursor: 'pointer', px: 2, py: 1.5, fontWeight: 650, '&:hover': { color: 'var(--primary)', textDecoration: 'underline' } }}
                          onClick={() => navigate(`/services/${encodeURIComponent(service)}`)}
                        >
                          {service}
                        </TableCell>
                        {lifetimeServiceUsage.years.map(year => {
                          const count = lifetimeServiceUsage.data[service]?.[String(year)] || 0;
                          return (
                            <Tooltip key={`${service}-${year}`} title={count > 0 ? `${service} · ${year}: ${count} use${count === 1 ? '' : 's'}. Open monthly detail.` : `${service} · ${year}: no usage`} arrow>
                              <TableCell
                                align="center"
                                role={count > 0 ? 'button' : undefined}
                                tabIndex={count > 0 ? 0 : undefined}
                                onClick={count > 0 ? () => handleUsageYearClick(year) : undefined}
                                onKeyDown={count > 0 ? event => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleUsageYearClick(year);
                                  }
                                } : undefined}
                                sx={{
                                  color: count / maxValue > 0.55 ? '#ffffff' : 'var(--text-primary)',
                                  bgcolor: getHeatmapColor(count, maxValue),
                                  borderBottom: '1px solid var(--border)',
                                  p: 1.25,
                                  fontWeight: count > 0 ? 750 : 400,
                                  cursor: count > 0 ? 'pointer' : 'default',
                                  transition: 'transform 140ms ease, box-shadow 140ms ease',
                                  '&:hover': count > 0 ? { position: 'relative', zIndex: 2, transform: 'scale(1.04)', boxShadow: 'inset 0 0 0 2px var(--primary)' } : undefined,
                                  '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: '-2px' }
                                }}
                              >
                                {count || '–'}
                              </TableCell>
                            </Tooltip>
                          );
                        })}
                        <TableCell align="center" sx={{ color: 'var(--text-primary)', bgcolor: 'var(--surface-secondary)', fontWeight: 750, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                          {lifetimeServiceUsage.totals[service] || 0}
                        </TableCell>
                        <TableCell sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                          {formatLastUsedDate(lifetimeServiceUsage.lastUsed[service])}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Box sx={{ display: serviceUsageView === 'year' ? 'flex' : 'none', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 650, mr: 0.5 }}>Uses</Typography>
            {[
              { label: '0', color: 'var(--surface-secondary)' },
              { label: '1', color: 'rgba(7, 65, 66, 0.2)' },
              { label: '2–3', color: 'rgba(7, 65, 66, 0.4)' },
              { label: '4–6', color: 'rgba(7, 65, 66, 0.65)' },
              { label: '7+', color: 'rgba(7, 65, 66, 0.88)' },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: 0.75, bgcolor: item.color, border: '1px solid var(--border)' }} />
                <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
          {serviceUsageView === 'year' && serviceUsageError && (
            <Box sx={{ p: 2, mb: 1.5, bgcolor: 'var(--error-soft)', border: '1px solid var(--error)', borderRadius: 1.5 }}>
              <Typography sx={{ color: 'var(--error)', fontSize: '0.85rem' }}>{serviceUsageError}</Typography>
            </Box>
          )}
          <TableContainer sx={{
            display: serviceUsageView === 'year' ? 'block' : 'none',
            maxHeight: '400px',
            overflow: 'auto',
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
              backgroundColor: 'var(--primary)',
            }
          }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1220 }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      minWidth: 230,
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    Service
                  </TableCell>
                  {serviceUsageData.months.map((month: string) => (
                    <TableCell
                      key={month}
                      align="center"
                      sx={{
                        bgcolor: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        minWidth: 74,
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      {formatHeatmapMonth(month)}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 700, minWidth: 80, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                    Total
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {serviceUsageLoading ? (
                  <TableRow>
                    <TableCell colSpan={14} align="center" sx={{ py: 6, color: 'var(--text-secondary)' }}>
                      <CircularProgress size={24} sx={{ color: 'var(--primary)', mr: 1.5 }} />
                      Loading service usage…
                    </TableCell>
                  </TableRow>
                ) : serviceUsageData.services.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} align="center" sx={{ py: 6, color: 'var(--text-secondary)' }}>
                      No service activity recorded in {selectedYear}.
                    </TableCell>
                  </TableRow>
                ) : serviceUsageData.services.map((service: string) => {
                  const maxValue = getMaxValue(serviceUsageData.data);
                  return (
                    <TableRow key={service} sx={{ '&:hover': { bgcolor: 'var(--surface-secondary)' } }}>
                      <TableCell
                        sx={{
                          color: 'var(--text-primary)',
                          position: 'sticky',
                          left: 0,
                          bgcolor: 'var(--surface)',
                          borderRight: '1px solid var(--border)',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          padding: '12px 16px',
                          height: '48px',
                          '&:hover': {
                            color: 'var(--primary)',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => navigate(`/services/${encodeURIComponent(service)}`)}
                      >
                        {service}
                      </TableCell>
                      {serviceUsageData.months.map((month: string) => {
                        const count = serviceUsageData.data[service]?.[month] || 0;
                        return (
                          <Tooltip key={`${service}-${month}`} title={`${service} · ${formatHeatmapMonth(month)} ${selectedYear}: ${count} use${count === 1 ? '' : 's'}`} arrow>
                            <TableCell
                              align="center"
                              sx={{
                                color: count / maxValue > 0.55 ? '#ffffff' : 'var(--text-primary)',
                                bgcolor: getHeatmapColor(count, maxValue),
                                borderBottom: '1px solid var(--border)',
                                p: 1.25,
                                height: '44px',
                                fontWeight: count > 0 ? 700 : 400,
                                transition: 'transform 140ms ease, box-shadow 140ms ease',
                                '&:hover': {
                                  position: 'relative',
                                  zIndex: 2,
                                  transform: 'scale(1.04)',
                                  boxShadow: 'inset 0 0 0 2px var(--primary)'
                                }
                              }}
                            >
                              {count || '–'}
                            </TableCell>
                          </Tooltip>
                        );
                      })}
                      <TableCell align="center" sx={{ color: 'var(--text-primary)', bgcolor: 'var(--surface-secondary)', fontWeight: 750, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                        {serviceUsageMetrics.serviceTotals[service] || 0}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Payment History Section */}
        <Box sx={{ mt: 6, mb: 4 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight="bold" color="var(--text-primary)">
              Payment History · {selectedYear}
            </Typography>
            <Typography sx={{ mt: 0.5, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Paid invoice value and payment mix for the selected analysis year.
            </Typography>
          </Box>

          {paymentLoading && (
            <Box display="flex" justifyContent="center" alignItems="center" p={3}>
              <CircularProgress size={30} sx={{ color: 'var(--primary)' }} />
              <Typography ml={2} color="var(--text-secondary)">Loading payment history...</Typography>
            </Box>
          )}

          {paymentError && (
            <Box
              sx={{
                p: 2,
                bgcolor: 'var(--surface-secondary)',
                borderRadius: 2,
                border: '1px solid #7f1d1d',
                mb: 2
              }}
            >
              <Typography color="#ef4444">
                {paymentError}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                sx={{
                  mt: 1,
                  color: 'var(--primary)',
                  borderColor: 'var(--primary)',
                  '&:hover': {
                    borderColor: '#60a5fa',
                    bgcolor: 'rgba(59, 130, 246, 0.1)'
                  }
                }}
                onClick={() => {
                  setPaymentFetched(false);
                  setPaymentError('');
                }}
              >
                Retry Loading Payment History
              </Button>
            </Box>
          )}

          {!paymentLoading && !paymentError && paymentHistory.length === 0 && (
            <Box
              sx={{
                p: 3,
                bgcolor: 'var(--surface)',
                borderRadius: 2,
                textAlign: 'center',
                mb: 2,
                border: '1px solid var(--border)'
              }}
            >
              <Typography variant="body1" color="var(--text-secondary)">
                No payment history available for this customer.
              </Typography>
            </Box>
          )}

          {!paymentLoading && !paymentError && paymentHistory.length > 0 && (
            <>
              {/* Payment Summary */}
              {paymentSummary && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={4}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'var(--surface)', height: '100%', border: '1px solid var(--border)' }}>
                      <Typography variant="subtitle2" color="var(--text-secondary)">
                        Total Spent
                      </Typography>
                      <Typography variant="h6" fontWeight="bold" color="var(--text-primary)">
                        {formatCurrency(paymentSummary.totalSpent, currentClinic)}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'var(--surface)', height: '100%', border: '1px solid var(--border)' }}>
                      <Typography variant="subtitle2" color="var(--text-secondary)">
                        Invoices
                      </Typography>
                      <Typography variant="h6" fontWeight="bold" color="var(--text-primary)">
                        {paymentSummary.invoiceCount}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'var(--surface)', height: '100%', border: '1px solid var(--border)' }}>
                      <Typography variant="subtitle2" color="var(--text-secondary)">
                        Payment Methods
                      </Typography>
                      <Box>
                        {paymentSummary.paymentMethods.map((pm) => (
                          <Chip
                            key={pm.method}
                            label={`${pm.method} (${pm.count})`}
                            size="small"
                            sx={{
                              mr: 0.5,
                              mb: 0.5,
                              bgcolor: 'var(--border)',
                              color: 'var(--text-secondary)',
                              '& .MuiChip-label': {
                                color: 'var(--text-secondary)'
              }
            }}
          />
                        ))}
        </Box>
      </Paper>
                  </Grid>
                </Grid>
              )}

              {/* Payment Table */}
              <Box sx={{ overflowX: 'auto' }}>
                <TableContainer component={Paper} elevation={0} sx={{
                  bgcolor: 'var(--surface)',
                  border: '1px solid var(--border)',
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
                }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }}>Date</TableCell>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }}>Invoice</TableCell>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }}>Service</TableCell>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }}>Package</TableCell>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }}>Payment Method</TableCell>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }}>Sales Person</TableCell>
                        <TableCell sx={{
                          bgcolor: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--border)'
                        }} align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paymentHistoryRows.map((payment, index) => (
                        <TableRow key={`${payment.invoiceNumber}-${index}`} sx={{
                          '&:hover': {
                            bgcolor: 'var(--surface-secondary)',
                          },
                          bgcolor: 'var(--surface-secondary)',
                          '&:nth-of-type(odd)': {
                            bgcolor: 'var(--background)',
                          },
                          borderBottom: '1px solid var(--border)'
                        }}>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{payment.date}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{payment.invoiceNumber}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{payment.ServiceName}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{payment.ServicePackageName || '-'}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{payment.method}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{payment.SellerName || '-'}</TableCell>
                          <TableCell sx={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }} align="right">
                            {payment.displayAmount !== null ? (
                              formatCurrency(Number(payment.displayAmount), currentClinic)
                            ) : (
                              <span style={{ color: 'var(--text-secondary)' }}>-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </>
          )}
        </Box>

        <Customer360Panel
          phoneNumber={customerData.phone || decodeURIComponent(phoneNumber || '')}
          clinicCode={currentClinic?.code || ''}
          customerName={customerData.name}
        />

        {/* Wallet Transaction History Table */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Wallet Transaction History
              </Typography>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Transaction ID</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Comment</TableCell>
                    <TableCell>Account Name</TableCell>
                    <TableCell>Other Party Name</TableCell>
                    <TableCell>Other Party Phone</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {walletLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  ) : walletError ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <Typography color="error">{walletError}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : walletTransactions.length > 0 ? (
                    walletTransactions
                      .slice(walletPage * walletRowsPerPage, walletPage * walletRowsPerPage + walletRowsPerPage)
                      .map((tx) => (
                        <TableRow key={tx.transactionNumber}>
                          <TableCell>{tx.createddate_myanmar}</TableCell>
                          <TableCell>{tx.transactionNumber}</TableCell>
                          <TableCell>{tx.type}</TableCell>
                          <TableCell>
                            <Chip
                              label={tx.status}
                              color={tx.status === 'IN' ? 'success' : 'error'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="right">{parseFloat(tx.balance).toLocaleString('en-US', { style: 'currency', currency: 'MMK' })}</TableCell>
                          <TableCell>{tx.comment || 'N/A'}</TableCell>
                          <TableCell>{tx.MainAccountName || 'N/A'}</TableCell>
                          <TableCell>
                            {tx.customerRole === 'SENDER' ? (tx.recipientName || 'N/A') : (tx.senderName || 'N/A')}
                          </TableCell>
                          <TableCell>
                            {tx.customerRole === 'SENDER' ? (tx.recipientPhone || 'N/A') : (tx.senderPhone || 'N/A')}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        No wallet transactions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Pagination
              count={Math.ceil(walletTransactions.length / walletRowsPerPage)}
              page={walletPage + 1}
              onChange={(_e, newPage) => setWalletPage(newPage - 1)}
              sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}
            />
          </Paper>
        </Grid>
      </Box>
    </Box>
  );
};

export default CustomerDetails;
