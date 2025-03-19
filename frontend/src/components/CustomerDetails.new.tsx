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
  const { name: phoneNumber } = useParams<{ name: string }>();
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

  // Remove these sales by sales person state variables
  const [timePeriod, setTimePeriod] = React.useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [salesBySalesPerson, setSalesBySalesPerson] = React.useState<{
    salesPerson: string;
    transactionCount: number;
    totalAmount: number;
  }[]>([]);
  const [salesTransactionsPage, setSalesTransactionsPage] = React.useState(0);
  const [salesTransactionsRowsPerPage, setSalesTransactionsRowsPerPage] = React.useState(10);
  const [filteredTransactions, setFilteredTransactions] = React.useState<any[]>([]);

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

  const serviceUsageData = useMemo(() => {
    if (!customerData || !customerData.bookings) return { months: [], services: [], data: {} };
    
    try {
      // Extract all unique months from bookings and sort them chronologically in descending order
      const months = Array.from(new Set(customerData.bookings.map((booking: any) => {
        if (!booking || !booking.checkinTime) return null;
        const date = new Date(booking.checkinTime);
        return isNaN(date.getTime()) ? null : `${new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short' }).format(date)}`;
      }).filter(Boolean))) as string[];  // Cast to string array, filter out nulls

      // Sort months in descending order
      months.sort((a, b) => {
        try {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateB.getTime() - dateA.getTime();
        } catch (error) {
          return 0; // If dates are invalid, don't change order
        }
      });

      // Get unique services and sort them alphabetically
      const services = Array.from(new Set(customerData.bookings
        .filter((booking: any) => booking && booking.service)
        .map((booking: any) => booking.service)))
        .map(service => String(service))
        .sort((a, b) => a.localeCompare(b));

      // Create a data map for service usage
      const data: { [key: string]: { [key: string]: number } } = {};
      services.forEach((service: string) => {
        data[service] = {};
        months.forEach((month) => {
          data[service][month] = customerData.bookings.filter((booking: any) => {
            if (!booking || !booking.checkinTime || !booking.service) return false;
            try {
              const date = new Date(booking.checkinTime);
              if (isNaN(date.getTime())) return false;
              const bookingMonth = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short' }).format(date);
              return booking.service === service && bookingMonth === month;
            } catch (error) {
              return false;
            }
          }).length;
        });
      });

      return { months, services, data };
    } catch (error) {
      console.error('Error generating service usage data:', error);
      return { months: [], services: [], data: {} };
    }
  }, [customerData]);

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
    FROM great_time.QueenDataView
    WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
),

      BoughtTogether AS (
        SELECT 
          a.ServiceName AS ServiceA,
          b.ServiceName AS ServiceB,
          COUNT(*) as frequency
        FROM great_time.QueenDataView a
        JOIN great_time.QueenDataView b 
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
      JOIN great_time.QueenDataView ON ServiceB = ServiceName
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

  // Fetch customer data when params change
  useEffect(() => {
    // Reset payment fetched state when phone number changes
    setPaymentFetched(false);
    preventFetch.current = false;
    
    if (phoneNumber) {
      fetchCustomerData().catch(err => {
        setError(`Failed to fetch customer data: ${err.message}`);
        setLoading(false);
      });
    }
  }, [phoneNumber, selectedYear]); // Added selectedYear as dependency
  
  // Effect for fetching customer payment history
  useEffect(() => {
    if (phoneNumber && !paymentFetched && !preventFetch.current) {
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
  }, [phoneNumber, paymentFetched, customerData, selectedYear]); // Added customerData as dependency

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
    // Return early if we've already fetched payment data
    if (paymentFetched) {
      return;
    }
    
    try {
      setPaymentLoading(true);
      setPaymentError('');
      
      // Escape single quotes to prevent SQL injection
      const escapedPhoneNumber = customerPhoneNumber.replace(/'/g, "''");
      
      // Query to get customer's payment history
      const paymentQuery = `
      WITH PaymentSummary AS (
        SELECT 
          FORMAT_DATE('%Y-%m-%d', DATE(OrderCreatedDate)) AS Date,
          InvoiceNumber,
          CustomerName,
          CustomerPhoneNumber,
          ServiceName,
          ServicePackageName,
          PaymentMethod,
          PaymentStatus,
          CAST(NetTotal AS FLOAT64) AS InvoiceNetTotal,
          SellerName,
          ROW_NUMBER() OVER(PARTITION BY InvoiceNumber ORDER BY OrderCreatedDate) as RowNum
        FROM 
          great_time.QueenPaymentView
        WHERE 
          REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
          AND PaymentStatus = 'PAID'
          AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
          AND PaymentMethod != 'PASS'
      )
      SELECT
        Date,
        InvoiceNumber,
        CustomerName,
        ServiceName,
        ServicePackageName,
        PaymentMethod,
        PaymentStatus,
        InvoiceNetTotal,
        SellerName
      FROM 
        PaymentSummary
      ORDER BY 
        Date DESC, InvoiceNumber;
      `;
      
      try {
        console.log('Fetching payment history for customer:', escapedPhoneNumber);
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { 
            query: paymentQuery 
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
          payment.InvoiceNetTotal && payment.InvoiceNetTotal > 0
        );
        
        console.log(`Filtered out ${paymentData.length - filteredPaymentData.length} zero-value records`);
        setPaymentHistory(filteredPaymentData);
        
        // Calculate payment summary
        if (filteredPaymentData.length > 0) {
          // Get unique invoice numbers to count actual invoices
          const uniqueInvoices = [...new Set(filteredPaymentData.map((p: any) => p.InvoiceNumber))];
          
          // Calculate total spent
          const totalSpent = filteredPaymentData.reduce((sum: number, payment: any) => 
            sum + (payment.InvoiceNetTotal || 0), 0);
          
          // Group by payment method
          const methodGroups: Record<string, { count: number; total: number }> = {};
          filteredPaymentData.forEach((payment: any) => {
            const method = payment.PaymentMethod || 'Unknown';
            if (!methodGroups[method]) {
              methodGroups[method] = { count: 0, total: 0 };
            }
            methodGroups[method].count += 1;
            methodGroups[method].total += (payment.InvoiceNetTotal || 0);
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
    if (!phoneNumber) {
      setError('Customer phone number is required');
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
  FROM great_time.QueenDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND CheckInTime IS NOT NULL
)
SELECT
  CustomerName AS name,
  CustomerPhoneNumber AS phone,
  DateOfBirth,
  CAST(SUM(CAST(Price AS FLOAT64)) AS INT64) AS total_purchase_amount,
  COUNT(DISTINCT ServiceName) AS total_services,
  FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_appointment,
  (SELECT COUNT(*) FROM AllAppointments) AS total_appointments
FROM great_time.QueenDataView
WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
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
        const dataQuery = `
-- Monthly sales data
WITH MonthlySales AS (
  SELECT
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
    SUM(CAST(Price AS FLOAT64)) AS amount
  FROM great_time.QueenDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND Price IS NOT NULL
  GROUP BY month
  ORDER BY month DESC
  LIMIT 6
),

-- Purchased services
PurchasedServices AS (
  SELECT DISTINCT 
    ServiceName AS service,
    PackageCount AS packageCount,
    RemainingPackageCount AS remainingPackageCount,
    Price as PaymentAmount,
    FORMAT_TIMESTAMP('%d %b, %Y', MAX(CheckInTime)) AS last_used
  FROM great_time.QueenDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
  GROUP BY service, PackageCount, RemainingPackageCount, Price
),

-- Recent bookings
RecentBookings AS (
  SELECT 
    BookingID,
    ServiceName as service,
    PractitionerName as therapist,
    FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', CheckInTime) as date,
    Price as price,
    'CONFIRMED' as status,
    'APP' as source
  FROM great_time.QueenDataView
  WHERE REPLACE(CustomerPhoneNumber, '+959', '') = REPLACE('${escapedPhoneNumber}', '+959', '')
    AND CheckInTime IS NOT NULL
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

  // Remove handle time period change function
  const handleTimePeriodChange = (event: SelectChangeEvent<'daily' | 'weekly' | 'monthly'>) => {
    setTimePeriod(event.target.value as 'daily' | 'weekly' | 'monthly');
    setSalesTransactionsPage(0); // Reset page on filter change
  };
  
  // Remove process payment data for sales person function
  const processPaymentDataForSalesPerson = useCallback(() => {
    if (!paymentHistory.length) {
      setSalesBySalesPerson([]);
      return;
    }

    // Filter transactions based on time period
    const filtered = paymentHistory.filter(payment => {
      if (!payment.Date) return false;
      
      const transactionDate = new Date(payment.Date);
      const now = new Date();
      
      switch (timePeriod) {
        case 'daily':
          // Same day
          return transactionDate.toDateString() === now.toDateString();
        case 'weekly':
          // Within the last 7 days
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          return transactionDate >= weekAgo;
        case 'monthly':
          // Same month and year
          return (
            transactionDate.getMonth() === now.getMonth() &&
            transactionDate.getFullYear() === now.getFullYear()
          );
        default:
          return true;
      }
    });

    // Group by sales person
    const salesPersonMap = new Map<string, { count: number; total: number }>();

    filtered.forEach(payment => {
      const salesPerson = payment.SellerName || 'Unknown';
      const amount = Number(payment.InvoiceNetTotal) || 0;

      if (!salesPersonMap.has(salesPerson)) {
        salesPersonMap.set(salesPerson, { count: 0, total: 0 });
      }

      const current = salesPersonMap.get(salesPerson)!;
      salesPersonMap.set(salesPerson, {
        count: current.count + 1,
        total: current.total + amount
      });
    });

    // Convert to array for rendering
    const salesData = Array.from(salesPersonMap.entries()).map(([salesPerson, data]) => ({
      salesPerson,
      transactionCount: data.count,
      totalAmount: data.total
    }));

    // Sort by total amount (highest first)
    salesData.sort((a, b) => b.totalAmount - a.totalAmount);
    
    setSalesBySalesPerson(salesData);
    setFilteredTransactions(filtered);
  }, [paymentHistory, timePeriod]);

  // Remove useEffect for sales data
  useEffect(() => {
    processPaymentDataForSalesPerson();
  }, [paymentHistory, timePeriod, processPaymentDataForSalesPerson]);

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
    <Box sx={{ bgcolor: '#101924', minHeight: '100vh', position: 'relative' }}>
      {/* Header */}
      <Box 
        sx={{ 
        display: 'flex', 
        alignItems: 'center', 
          p: 2, 
          borderBottom: '1px solid #2d3748',
          bgcolor: '#121826',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}
      >
        <IconButton
          onClick={() => navigate('/customers')} 
          sx={{
            color: '#3b82f6',
            mr: 1
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ ml: 1, color: '#f3f4f6', fontWeight: 500 }}>
          Customer Details
        </Typography>
        
        {/* ... other UI components ... */}
      </Box>

      {/* Main content with proper scrolling */}
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        height: 'calc(100vh - 60px)', // Adjust for header
      }}>
        <Box sx={{ p: 3, maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          {/* ... other UI components ... */}

        {/* Payment History Section */}
          <Box sx={{ mt: 6 }}>
            {/* ... existing payment history code ... */}
            </Box>
            </Box>
      </Box>
    </Box>
  );
};

export default CustomerDetails;