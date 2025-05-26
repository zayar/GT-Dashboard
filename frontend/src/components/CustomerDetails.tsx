import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import RecommendIcon from '@mui/icons-material/Recommend';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Box, Paper, Typography, Avatar, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, IconButton, Select, MenuItem, Pagination, Button, Chip } from '@mui/material';
import axios from 'axios';
import { SelectChangeEvent } from '@mui/material';
import { useClinic } from '../contexts/ClinicContext';

// Types for customer profile and data
interface CustomerProfile {
  name: string;
  email: string;
  phone: string;
  joinDate: string;
  membershipStatus: string;
  membershipTier: string;
  lifetimeValue: number;
  avatar?: string;
}

// Payment Summary interface
interface PaymentSummary {
  totalSpent: number;
  invoiceCount: number;
  paymentMethods: {
    method: string;
    count: number;
    total: number;
  }[];
}

interface CustomerData {
  // ... existing code ...
}

interface CustomerDetailsProps {}

const CustomerDetails: React.FC<CustomerDetailsProps> = () => {
  const navigate = useNavigate();
  const { phoneNumber } = useParams<{ phoneNumber: string }>();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = React.useState(true);
  const [customerData, setCustomerData] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const [aiSummary, setAiSummary] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [serviceFilter, setServiceFilter] = React.useState<'remaining' | 'completed'>('remaining');
  const [selectedService, setSelectedService] = React.useState<string | null>(null);
  const [recommendedServices, setRecommendedServices] = useState<any[]>([]);
  
  // Retry mechanism states
  const [retryCount, setRetryCount] = React.useState<number>(0);
  const [retryTimeout, setRetryTimeout] = React.useState<NodeJS.Timeout | null>(null);
  const [isInRetryMode, setIsInRetryMode] = React.useState<boolean>(false);
  const [retryMessage, setRetryMessage] = React.useState<string>('');
  
  // Add new state for payment history
  const [paymentHistory, setPaymentHistory] = React.useState<any[]>([]);
  const [paymentLoading, setPaymentLoading] = React.useState(true);
  const [paymentError, setPaymentError] = React.useState('');
  const [paymentPage, setPaymentPage] = React.useState(0);
  const [paymentRowsPerPage, setPaymentRowsPerPage] = React.useState(5);
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

  // Generate array of years for the dropdown (from 5 years ago to current year)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
  }, []);

  // Handle year selection change
  const handleYearChange = (event: SelectChangeEvent<number>) => {
    setSelectedYear(Number(event.target.value));
    // Reset page states
    setPage(0);
    setPaymentPage(0);
    
    // Reset data that depends on year filter
    setPaymentFetched(false);
    
    // Reset service usage data to empty - will be refetched with new year
    setServiceUsageData({
      services: [],
      months: [],
      data: {},
    });
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

  const handleServiceFilterChange = (event: SelectChangeEvent<'remaining' | 'completed'>) => {
    setServiceFilter(event.target.value as 'remaining' | 'completed');
  };

  const handleServiceNameClick = (serviceName: string) => {
    navigate(`/services/${encodeURIComponent(serviceName)}`);
  };

  // Add a function to handle invoice click
  const handleInvoiceClick = (invoiceNumber: string) => {
    navigate(`/payment-details?invoice=${encodeURIComponent(invoiceNumber)}`);
  };

  // Add this function to generate service recommendations
  const generateServiceRecommendations = useCallback(async (customerPhoneNumber: string) => {
    if (!customerPhoneNumber) return;

    try {
      const decodedPhoneNumber = decodeURIComponent(customerPhoneNumber);
      const escapedPhoneNumber = decodedPhoneNumber.replace(/'/g, "''");
      
      // Query to find service recommendations
      const recommendationsQuery = `
     WITH CustomerServices AS (
    SELECT DISTINCT ServiceName
    FROM great_time.MainDataView
    WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
),

      BoughtTogether AS (
        SELECT 
          a.ServiceName AS ServiceA,
          b.ServiceName AS ServiceB,
          COUNT(*) as frequency
        FROM great_time.MainDataView a
        JOIN great_time.MainDataView b 
          ON a.BookingID = b.BookingID 
          AND a.ServiceName <> b.ServiceName
        WHERE a.ServiceName IN (SELECT ServiceName FROM CustomerServices)
        GROUP BY ServiceA, ServiceB
        ORDER BY frequency DESC
      ),
      RecommendedServices AS (
        SELECT 
          ServiceB,
          MAX(frequency) as max_frequency,
          COUNT(*) as co_occurrence_count
        FROM BoughtTogether
        WHERE ServiceB NOT IN (SELECT ServiceName FROM CustomerServices)
        GROUP BY ServiceB
        ORDER BY max_frequency DESC, co_occurrence_count DESC
        LIMIT 5
      )
      SELECT 
        ServiceB as service_name,
        AVG(Price) as average_price,
        MAX(ServiceDescription) as description
      FROM RecommendedServices
      JOIN great_time.MainnDataView ON ServiceB = ServiceName
      GROUP BY service_name
      LIMIT 5
      `;
      
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`, 
        { query: recommendationsQuery },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
          },
          timeout: 10000
        }
      );
      
      if (response.data.success && response.data.data) {
        setRecommendedServices(response.data.data);
      }
    } catch (error) {
      console.error('Error generating service recommendations:', error);
    }
  }, []);

  const handleBack = React.useCallback(() => {
    navigate(-1);
  }, [navigate]);

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
    
    try {
      console.log('Fetching year-dependent data for year:', selectedYear);
      
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const sanitizeForSQL = (input: string): string => {
        return input.replace(/'/g, "''");
      };
      const escapedPhoneNumber = sanitizeForSQL(decodedPhoneNumber);
      
      // SQL query to get service usage data filtered by year
      const query = `
      WITH AllServiceUsage AS (
        SELECT
          ServiceName,
          CheckInTime
        FROM great_time.MainDataView
        WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
          AND CheckInTime IS NOT NULL
          AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
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
      
      const serviceUsageRawData = response.data.data || [];
      console.log('Service usage data fetched successfully:', serviceUsageRawData.length, 'records');
      
      // Process the data to create a heat map of service usage by month
      const processedData: { [key: string]: { [key: string]: number } } = {};
      const months: Set<string> = new Set();
      const services: Set<string> = new Set();
      
      serviceUsageRawData.forEach((item: any) => {
        const service = item.ServiceName || 'Unknown Service';
        const month = item.month || 'Unknown Month';
        const count = parseInt(item.usage_count) || 0;
        
        if (!processedData[service]) {
          processedData[service] = {};
        }
        
        processedData[service][month] = count;
        months.add(month);
        services.add(service);
      });
      
      // Sort months chronologically
      const sortedMonths = Array.from(months).sort();
      
      // Create complete dataset with zero values for missing entries
      const serviceNames = Array.from(services);
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
      console.error('Error fetching year-dependent data:', error);
    }
  }, [phoneNumber, currentClinic, selectedYear]);

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

  // Add dependency on selectedYear only for year-dependent data
  useEffect(() => {
    if (phoneNumber && currentClinic && !loading) {
      // Only fetch the data that should be affected by year changes
      fetchYearDependentData().catch(err => {
        console.error('Failed to fetch year-dependent data:', err);
      });
      
      // Reset payment history so it can be refetched with the new year
      setPaymentFetched(false);
    }
  }, [selectedYear, fetchYearDependentData, phoneNumber, currentClinic, loading]);
  
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

  // Add this useMemo for payment chart data
  const paymentChartData = useMemo(() => {
    // Default empty chart data structure
    const emptyChartData = {
      labels: [],
      datasets: [{
        label: 'Amount Spent',
        data: [],
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
        borderWidth: 1,
      }]
    };

    // Guard against undefined or empty payment history
    if (!paymentHistory || !Array.isArray(paymentHistory) || paymentHistory.length === 0) {
      return emptyChartData;
    }

    try {
      // Group payments by month
      const paymentsByMonth: Record<string, number> = {};
      
      paymentHistory.forEach(payment => {
        // Skip if payment is missing or Date property is undefined
        if (!payment || !payment.Date) return;
        
        try {
          // Extract YYYY-MM from the date
          const dateParts = payment.Date.toString().split('-');
          if (!dateParts || dateParts.length < 2) return;
          
          const monthKey = `${dateParts[0]}-${dateParts[1]}`;
          
          if (!paymentsByMonth[monthKey]) {
            paymentsByMonth[monthKey] = 0;
          }
          
          // Safely add the amount, defaulting to 0 if undefined/NaN
          const amount = payment.InvoiceNetTotal ? Number(payment.InvoiceNetTotal) : 0;
          paymentsByMonth[monthKey] += isNaN(amount) ? 0 : amount;
        } catch (err) {
          console.error('Error processing payment for chart:', err);
        }
      });

      // Handle case when all payments were skipped
      if (Object.keys(paymentsByMonth).length === 0) {
        return emptyChartData;
      }
      
      // Convert to sorted array (oldest to newest)
      const monthKeys = Object.keys(paymentsByMonth).sort();
      
      // Create pretty month labels (e.g., "Jan 2023")
      const monthLabels = monthKeys.map(key => {
        try {
          const [year, month] = key.split('-');
          
          // Validate numbers before creating Date
          const yearNum = parseInt(year);
          const monthNum = parseInt(month) - 1; // months are 0-indexed in JS Date
          
          if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
            return key; // Fallback to original key if invalid
          }
          
          const date = new Date(yearNum, monthNum, 1);
          return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } catch (err) {
          console.error('Error formatting date label:', err);
          return key; // Fallback to original key if error
        }
      });
      
      return {
        labels: monthLabels,
        datasets: [{
          label: 'Amount Spent',
          data: monthKeys.map(key => paymentsByMonth[key]),
          backgroundColor: '#3b82f6',
          borderColor: '#3b82f6',
          borderWidth: 1,
        }]
      };
    } catch (error) {
      console.error('Error generating payment chart data:', error);
      return emptyChartData;
    }
  }, [paymentHistory]);

  // Add this function to calculate heatmap color based on value
  const getHeatmapColor = (value: number, maxValue: number) => {
    if (value === 0) return 'transparent';
    // Calculate opacity based on value (0.2 to 0.9 range)
    const opacity = 0.2 + (value / (maxValue || 1)) * 0.7; // Prevent division by zero
    return `rgba(26, 115, 232, ${opacity})`; // Using the blue color theme (#1a73e8)
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
      if (serviceFilter === 'remaining') {
        return service.remainingPackageCount > 0;
      } else {
        return service.remainingPackageCount === 0;
      }
    });
  }, [customerData, serviceFilter]);

  // Filtered recent bookings based on the selected service
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
          // Get unique invoice numbers to count actual invoices
          const uniqueInvoices = [...new Set(filteredPaymentData.map((p: any) => p.invoiceNumber))];
          
          // Calculate total spent
          const totalSpent = filteredPaymentData.reduce((sum: number, payment: any) => 
            sum + (payment.amount || 0), 0);
          
          // Group by payment method
          const methodGroups: Record<string, { count: number; total: number }> = {};
          filteredPaymentData.forEach((payment: any) => {
            const method = payment.method || 'Unknown';
            if (!methodGroups[method]) {
              methodGroups[method] = { count: 0, total: 0 };
            }
            methodGroups[method].count += 1;
            methodGroups[method].total += (payment.amount || 0);
          });
          
          // Format payment methods summary
          const paymentMethods = Object.entries(methodGroups).map(([method, data]) => ({
            method,
            count: data.count,
            total: data.total,
          }));
          
          setPaymentSummary({
            totalSpent,
            invoiceCount: uniqueInvoices.length,
            paymentMethods,
          });
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
  DateOfBirth,
  CAST(SUM(CAST(Price AS FLOAT64)) AS INT64) AS total_purchase_amount,
  COUNT(DISTINCT ServiceName) AS total_services,
  FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_appointment,
  (SELECT COUNT(*) FROM AllAppointments) AS total_appointments
FROM great_time.MainDataView
WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
GROUP BY CustomerName, CustomerPhoneNumber, DateOfBirth;`;

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
        // Notice we're not filtering by year for purchased services and recent bookings
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

-- Recent bookings - not filtered by year
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
  LIMIT 10
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
        setCustomerData({
          ...profile,
          monthlySales,
          purchasedServices,
          recentBookings,
          bookings: recentBookings // Add a duplicate field for backward compatibility
        });
        
        // Also fetch the year-dependent data
        fetchYearDependentData();
        
        setLoading(false);
        setRetryCount(0);
        setIsInRetryMode(false);
        
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#101924' }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
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
        bgcolor: '#101924',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: '8px', mb: 3, width: '100%' }}>
          <Typography variant="h5" sx={{ mb: 2, color: '#3b82f6' }}>
            Rate Limit Exceeded
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <CircularProgress size={40} sx={{ color: '#3b82f6' }} />
          </Box>
          <Typography variant="body1" sx={{ color: '#f3f4f6', mb: 3 }}>
            {retryMessage}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 4 }}>
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
                bgcolor: '#3b82f6', 
                '&:hover': { bgcolor: '#2563eb' } 
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
        bgcolor: '#101924',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Typography variant="h5" sx={{ mb: 2, color: '#f3f4f6' }}>
          Customer Information
        </Typography>
        <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: '8px', mb: 3, width: '100%' }}>
          <Typography variant="h6" sx={{ color: '#f3f4f6', mb: 2 }}>
            {phoneNumber && (
              <span>Customer with phone {decodeURIComponent(phoneNumber)}</span>
            )}
          </Typography>
          
          {customerData ? (
            <Box sx={{ textAlign: 'left', mb: 3 }}>
              <Typography variant="body1" sx={{ color: '#f3f4f6', mb: 1 }}>
                We found some basic information for this customer:
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 1, fontWeight: 'bold' }}>
                Name: {customerData.name}
              </Typography>
              {customerData.phone && customerData.phone !== 'Not available' && (
                <Typography variant="body2" sx={{ color: '#94a3b8', mb: 1 }}>
                  Phone: {customerData.phone}
                </Typography>
              )}
              {customerData.email && customerData.email !== 'Not available' && (
                <Typography variant="body2" sx={{ color: '#94a3b8', mb: 1 }}>
                  Email: {customerData.email}
                </Typography>
              )}
            </Box>
          ) : (
            <Typography variant="body1" sx={{ color: '#f3f4f6', mb: 3 }}>
              We couldn't find detailed information for this customer.
            </Typography>
          )}
          
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 4 }}>
            {error}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8', mb: 4 }}>
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
                bgcolor: '#3b82f6', 
                color: 'white',
                '&:hover': { bgcolor: '#2563eb' } 
              }}
            >
              Retry
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate(-1)}
              sx={{ 
                borderColor: '#3b82f6',
                color: '#3b82f6',
                '&:hover': { borderColor: '#2563eb', bgcolor: 'rgba(37, 99, 235, 0.08)' } 
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
      <Box sx={{ p: 3, bgcolor: '#101924', color: '#d1d5db', height: '100vh' }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#3b82f6',
            mr: 2,
            '&:hover': {
              bgcolor: 'rgba(59, 130, 246, 0.08)'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography color="#d1d5db">No customer data found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 2, sm: 3, md: 3 },
      bgcolor: '#101924',
      height: '100vh',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'hidden',
      color: '#e2e8f0',
      position: 'relative'
    }}>
      {/* Header with navigation and title */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        mb: 2
      }}>
        <IconButton
          onClick={handleBack}
          sx={{
            color: '#6b7280',
            '&:hover': {
              bgcolor: 'rgba(107, 114, 128, 0.08)',
              color: '#f3f4f6'
            }
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ ml: 1, color: '#f3f4f6', fontWeight: 500 }}>
          Customer Details
        </Typography>
        
        {/* Year Selector */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ mr: 1, color: '#94a3b8' }}>
            Year:
          </Typography>
          <Select
            value={selectedYear}
            onChange={handleYearChange}
            size="small"
            sx={{
              height: '32px',
              minWidth: '100px',
              bgcolor: '#1e293b',
              color: '#f1f5f9',
              '& .MuiSelect-icon': {
                color: '#94a3b8'
              },
              '&:hover': {
                bgcolor: '#1e293b'
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#2d3748'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: '#3b82f6'
              }
            }}
          >
            {yearOptions.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </Select>
      </Box>
      </Box>

      {/* Main content with proper scrolling */}
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        height: 'calc(100vh - 60px)', // Adjust for header
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#1a2234',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#2d3748',
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: '#3b82f6',
        }
      }}>
        {/* Customer header */}
        <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#1a2234', color: '#f3f4f6', mb: 3, borderRadius: '8px' }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item>
              <Avatar sx={{ width: 80, height: 80, bgcolor: '#3b82f6' }}>
              {customerData.name?.charAt(0)?.toUpperCase()}
            </Avatar>
          </Grid>
          <Grid item xs>
              <Typography variant="h4" sx={{ mb: 1, color: '#f3f4f6' }}>
              {customerData.name}
              {customerData.age !== null && customerData.age !== undefined && (
                <Typography 
                  component="span" 
                  sx={{ 
                    ml: 2, 
                      color: '#d1d5db', 
                    fontSize: '1.2rem',
                    verticalAlign: 'middle'
                  }}
                >
                  {customerData.age} years old
                </Typography>
              )}
            </Typography>
            <Grid container spacing={4}>
              <Grid item>
                  <Typography variant="body2" color="#9ca3af">Phone</Typography>
                  <Typography color="#f3f4f6">{customerData.phone}</Typography>
              </Grid>
              {customerData.next_birthday !== null && customerData.next_birthday !== undefined && (
                <Grid item>
                    <Typography variant="body2" color="#9ca3af">
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
                    <Typography color="#f3f4f6">
                    {customerData.next_birthday}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Grid>
        </Grid>
      </Paper>

        {/* Insights section */}
      {aiSummary && (
          <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#1a2234', color: '#f3f4f6', mb: 3, borderRadius: '8px' }}>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, color: '#f3f4f6' }}>
              <AutoAwesomeIcon sx={{ color: '#3b82f6' }} />
              Customer Insights
          </Typography>
            <Typography sx={{ color: '#d1d5db', lineHeight: 1.6 }}>{aiSummary}</Typography>
        </Paper>
      )}

        {/* Two column layout for services and bookings */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#1a2234', color: '#f3f4f6', height: '100%', borderRadius: '8px' }}>
              <Typography variant="h6" sx={{ mb: 2, color: '#f3f4f6' }}>Purchased Services</Typography>
            <Select
              value={serviceFilter}
              onChange={handleServiceFilterChange}
              sx={{
                  color: '#f3f4f6',
                mb: 2,
                  bgcolor: '#101924',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
              }}
              size="small"
            >
                <MenuItem value="remaining" sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>Remaining</MenuItem>
                <MenuItem value="completed" sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>Completed</MenuItem>
            </Select>
              <TableContainer sx={{ 
                maxHeight: '400px', 
                overflowY: 'auto',
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
                  backgroundColor: '#3b82f6',
                }
              }}>
                <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Service Name</TableCell>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Package Count</TableCell>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Remaining</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPurchasedServices.map((service: any, index: number) => (
                      <TableRow key={index} sx={{ '&:hover': { bgcolor: '#1a2234' } }}>
                      <TableCell 
                        sx={{ 
                            color: '#f3f4f6',
                          cursor: 'pointer',
                            borderBottom: '1px solid #2d3748',
                          '&:hover': {
                              color: '#3b82f6',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => handleServiceNameClick(service.service)}
                      >
                        {service.service}
                      </TableCell>
                        <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{service.packageCount}</TableCell>
                        <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{service.remainingPackageCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#1a2234', color: '#f3f4f6', height: '100%', borderRadius: '8px' }}>
              <Typography variant="h6" sx={{ mb: 2, color: '#f3f4f6' }}>Recent Bookings</Typography>
              <TableContainer sx={{ 
                maxHeight: '400px', 
                overflowY: 'auto',
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
                  backgroundColor: '#3b82f6',
                }
              }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Check-in Time</TableCell>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Service</TableCell>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Therapist</TableCell>
                      <TableCell sx={{ bgcolor: '#101924', color: '#d1d5db', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredBookings
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((booking: any, index: number) => {
                      console.log("Rendering booking at index", index, ":", booking);
                      return (
                        <TableRow key={index} sx={{ '&:hover': { bgcolor: '#1a2234' } }}>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{booking.date}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{booking.service}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{booking.therapist}</TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #2d3748' }}>
                        <Box
                          sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                                bgcolor: booking.status === 'CANCEL' ? '#ef4444' : '#10b981',
                            color: '#fff',
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
                    color: '#f3f4f6',
                    bgcolor: '#101924',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2d3748' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' }
                }}
                size="small"
              >
                  <MenuItem value={5} sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>5 per page</MenuItem>
                  <MenuItem value={10} sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>10 per page</MenuItem>
                  <MenuItem value={25} sx={{ bgcolor: '#1a2234', color: '#f3f4f6' }}>25 per page</MenuItem>
              </Select>
              <Pagination
                count={Math.ceil(filteredBookings.length / rowsPerPage)}
                page={page + 1}
                onChange={(event, newPage) => handleChangePage(event, newPage - 1)}
                sx={{
                  '& .MuiPaginationItem-root': {
                      color: '#d1d5db',
                  },
                  '& .MuiPaginationItem-root.Mui-selected': {
                      bgcolor: '#3b82f6',
                    color: '#ffffff',
                    '&:hover': {
                        bgcolor: '#2563eb'
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

        {/* Service usage heatmap */}
        <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#1a2234', color: '#f3f4f6', mb: 3, borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ mb: 2, color: '#f3f4f6' }}>Service Usage Over Time</Typography>
          <TableContainer sx={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
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
              backgroundColor: '#3b82f6',
            }
          }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748'
                    }}
                  >
                    Service
                  </TableCell>
                  {serviceUsageData.months.map((month: unknown) => (
                    <TableCell 
                      key={month as string} 
                      sx={{ 
                        bgcolor: '#101924', 
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748'
                      }}
                    >
                      {month as string}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {serviceUsageData.services.map((service: unknown) => {
                  const maxValue = getMaxValue(serviceUsageData.data);
                  return (
                    <TableRow key={service as string} sx={{ '&:hover': { bgcolor: '#1a2234' } }}>
                      <TableCell 
                        sx={{ 
                          color: '#f3f4f6',
                          position: 'sticky',
                          left: 0,
                          bgcolor: '#1a2234',
                          borderRight: '1px solid #2d3748',
                          borderBottom: '1px solid #2d3748',
                          cursor: 'pointer',
                          padding: '12px 16px',
                          height: '48px',
                          '&:hover': {
                            color: '#3b82f6',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => navigate(`/services/${encodeURIComponent(service as string)}`)}
                      >
                        {service as string}
                      </TableCell>
                      {serviceUsageData.months.map((month: unknown) => {
                        const count = serviceUsageData.data[service as string][month as string] || 0;
                        return (
                          <TableCell 
                            key={`${service as string}-${month as string}`} 
                            align="center"
                            sx={{ 
                              color: '#f3f4f6',
                              bgcolor: getHeatmapColor(count, maxValue),
                              borderBottom: '1px solid #2d3748',
                              padding: '12px 16px',
                              height: '48px',
                              transition: 'background-color 0.3s ease',
                              '&:hover': {
                                bgcolor: count > 0 ? `rgba(59, 130, 246, ${Math.min((count / maxValue) * 0.9 + 0.2, 1)})` : 'transparent'
                              }
                            }}
                          >
                            {count}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Recommended services section */}
      {recommendedServices.length > 0 && (
          <Paper sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#1a2234', color: '#f3f4f6', mb: 3, borderRadius: '8px' }}>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, color: '#f3f4f6' }}>
              <RecommendIcon sx={{ color: '#3b82f6' }} />
              Recommended Services
          </Typography>
            <TableContainer sx={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
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
                backgroundColor: '#3b82f6',
              }
            }}>
              <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                  }}>Service Name</TableCell>
                  <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                  }}>Popularity</TableCell>
                  <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                  }}>Total Customers</TableCell>
                  <TableCell sx={{ 
                      bgcolor: '#101924', 
                      color: '#d1d5db', 
                      fontWeight: 600,
                      borderBottom: '1px solid #2d3748'
                  }}>Average Price</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recommendedServices.map((service, index) => (
                    <TableRow key={index} sx={{ '&:hover': { bgcolor: '#1a2234' } }}>
                    <TableCell 
                      sx={{ 
                          color: '#3b82f6',
                        cursor: 'pointer',
                        fontWeight: 500,
                          borderBottom: '1px solid #2d3748',
                        '&:hover': {
                            color: '#60a5fa',
                          textDecoration: 'underline'
                        }
                      }}
                        onClick={() => navigate(`/services/${encodeURIComponent(service.service_name)}`)}
                    >
                      {service.service_name}
                    </TableCell>
                      <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {service.bought_together_count} times bought together
                    </TableCell>
                      <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {service.total_customers} customers
                    </TableCell>
                      <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>
                      {service.avg_price.toLocaleString()} MMK
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

        {/* Payment History Section */}
        <Box sx={{ mt: 6, mb: 4 }}>
          <Typography variant="h5" fontWeight="bold" mb={3} color="#e2e8f0">
            Payment History
          </Typography>
          
          {paymentLoading && (
            <Box display="flex" justifyContent="center" alignItems="center" p={3}>
              <CircularProgress size={30} sx={{ color: '#3b82f6' }} />
              <Typography ml={2} color="#d1d5db">Loading payment history...</Typography>
            </Box>
          )}
          
          {paymentError && (
            <Box 
              sx={{ 
                p: 2, 
                bgcolor: '#1a1e2b', 
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
                  color: '#3b82f6',
                  borderColor: '#3b82f6',
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
                bgcolor: '#1a2235', 
                borderRadius: 2,
                textAlign: 'center',
                mb: 2,
                border: '1px solid #2d3748'
              }}
            >
              <Typography variant="body1" color="#d1d5db">
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
                    <Paper elevation={0} sx={{ p: 2, bgcolor: '#1a2235', height: '100%', border: '1px solid #2d3748' }}>
                      <Typography variant="subtitle2" color="#94a3b8">
                        Total Spent
                      </Typography>
                      <Typography variant="h6" fontWeight="bold" color="#e2e8f0">
                        {paymentSummary.totalSpent.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })} MMK
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: '#1a2235', height: '100%', border: '1px solid #2d3748' }}>
                      <Typography variant="subtitle2" color="#94a3b8">
                        Invoices
                      </Typography>
                      <Typography variant="h6" fontWeight="bold" color="#e2e8f0">
                        {paymentSummary.invoiceCount}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: '#1a2235', height: '100%', border: '1px solid #2d3748' }}>
                      <Typography variant="subtitle2" color="#94a3b8">
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
                              bgcolor: '#2d3748',
                              color: '#d1d5db',
                              '& .MuiChip-label': {
                                color: '#d1d5db'
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
                  bgcolor: '#1a2235',
                  border: '1px solid #2d3748',
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
                }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }}>Date</TableCell>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }}>Invoice</TableCell>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }}>Service</TableCell>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }}>Package</TableCell>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }}>Payment Method</TableCell>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }}>Sales Person</TableCell>
                        <TableCell sx={{ 
                          bgcolor: '#101924', 
                          color: '#d1d5db', 
                          fontWeight: 600,
                          borderBottom: '1px solid #2d3748'
                        }} align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paymentHistory.map((payment, index) => (
                        <TableRow key={`${payment.invoiceNumber}-${index}`} sx={{
                          '&:hover': {
                            bgcolor: '#242f3d',
                          },
                          bgcolor: '#111923',
                          '&:nth-of-type(odd)': {
                            bgcolor: '#121826',
                          },
                          borderBottom: '1px solid #2d3748'
                        }}>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{payment.date}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{payment.invoiceNumber}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{payment.ServiceName}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{payment.ServicePackageName || '-'}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{payment.method}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }}>{payment.SellerName || '-'}</TableCell>
                          <TableCell sx={{ color: '#d1d5db', borderBottom: '1px solid #2d3748' }} align="right">
                            {Number(payment.amount).toLocaleString('en-US', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0
                            })} MMK
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
      </Box>
    </Box>
  );
};

export default CustomerDetails;