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
  Button,
  Avatar
} from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import axios from 'axios';
import { format, startOfMonth, addDays, subMonths } from 'date-fns';
import { motion } from 'framer-motion';

// Define period types
type PeriodType = 'monthly' | 'weekly' | 'annual';

// Define service data
interface ServiceData {
  name: string;
  data: number[];
}

// Dashboard component
const Dashboard: React.FC = () => {
  // State for period selection and UI
  const [period, setPeriod] = useState<PeriodType>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for statistics
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [incomeChange, setIncomeChange] = useState<number>(0);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [customerChange, setCustomerChange] = useState<number>(0);
  const [appointmentRate, setAppointmentRate] = useState<number>(0);
  const [appointmentChange, setAppointmentChange] = useState<number>(0);
  const [serviceCount, setServiceCount] = useState<number>(0);
  const [serviceChange, setServiceChange] = useState<number>(0);
  
  // State for chart data
  const [dateLabels, setDateLabels] = useState<string[]>([]);
  const [servicesData, setServicesData] = useState<ServiceData[]>([]);
  
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
  
  // Define fallback data for when no real data is available
  const FALLBACK_DATA = {
    servicesData: [
      {
        name: 'Massage',
        data: [18500, 22000, 19000, 25000, 28000, 24000, 32000, 35000, 30000, 38000, 42000, 40000]
      },
      {
        name: 'Facial',
        data: [12000, 15000, 14000, 17000, 18000, 16000, 19000, 21000, 18000, 23000, 26000, 24000]
      },
      {
        name: 'Body Treatment',
        data: [8000, 10000, 9500, 11000, 12000, 11500, 14000, 15000, 13000, 16000, 18000, 17000]
      }
    ],
    dateLabels: [
      'Jan 01', 'Jan 04', 'Jan 07', 'Jan 10', 'Jan 13', 'Jan 16', 
      'Jan 19', 'Jan 22', 'Jan 25', 'Jan 28', 'Jan 31', 'Feb 03'
    ],
    stats: {
      totalIncome: 765000,
      incomeChange: 12.5,
      customerCount: 450,
      customerChange: 8.3,
      appointmentRate: 73.4,
      appointmentChange: 4.2,
      serviceCount: 320,
      serviceChange: 6.7
    }
  };
  
  // Use fallback data if no real data is available
  const useFallbackData = () => {
    console.log('Using fallback data');
    setDateLabels(FALLBACK_DATA.dateLabels);
    setServicesData(FALLBACK_DATA.servicesData);
    setTotalIncome(FALLBACK_DATA.stats.totalIncome);
    setIncomeChange(FALLBACK_DATA.stats.incomeChange);
    setCustomerCount(FALLBACK_DATA.stats.customerCount);
    setCustomerChange(FALLBACK_DATA.stats.customerChange);
    setAppointmentRate(FALLBACK_DATA.stats.appointmentRate);
    setAppointmentChange(FALLBACK_DATA.stats.appointmentChange);
    setServiceCount(FALLBACK_DATA.stats.serviceCount);
    setServiceChange(FALLBACK_DATA.stats.serviceChange);
    setLoading(false);
    setError(null);
    setUsingFallbackData(true);
  };

  // Fetch data based on selected period
  useEffect(() => {
    const fetchChartData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Simplified query to just check if we have any data
        const query = `
          -- Simple query to check if we have any data
          SELECT 
            ServiceName,
            CustomerName,
            FORMAT_DATETIME('%Y-%m-%d', OrderCreatedDate) AS Date,
            CAST(NetTotal AS FLOAT64) AS InvoiceNetTotal,
            PaymentMethod
          FROM \`great_time.QueenPaymentView\`
          WHERE PaymentMethod != 'PASS'
            AND PaymentStatus = 'PAID'
            AND CAST(NetTotal AS FLOAT64) != 0
            AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
          LIMIT 10
        `;

        // API endpoint to execute the query
        console.log('Executing query:', query);
        const response = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch data (Status: ${response.status})`);
        }

        const responseData = await response.json();
        
        // Check if we have data in the table
        if (!responseData.success || !responseData.data || responseData.data.length === 0) {
          console.warn('No data in the QueenPaymentView table');
          useFallbackData(); // Use fallback data
          return;
        }
        
        console.log('Found data in QueenPaymentView - First 3 records:', responseData.data.slice(0, 3));
        
        // Now that we know we have data, run the full query
        // Define time constraints based on the selected period
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
          WITH PaymentData AS (
            SELECT 
              OrderCreatedDate,
              ServiceName,
              CustomerName,
              InvoiceNumber,
              CAST(NetTotal AS FLOAT64) as Revenue
            FROM \`great_time.QueenPaymentView\`
            WHERE ServiceName IS NOT NULL
              AND PaymentMethod != 'PASS'
              AND PaymentStatus = 'PAID'
              AND CAST(NetTotal AS FLOAT64) > 0
              AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
          ),
          
          -- Find top 3 services by revenue
          TopServices AS (
            SELECT 
              ServiceName,
              SUM(Revenue) as TotalRevenue,
              COUNT(*) as ServiceCount
            FROM PaymentData
            GROUP BY ServiceName
            ORDER BY TotalRevenue DESC
            LIMIT 3
          ),
          
          -- Get daily revenue for the current period
          CurrentMonthData AS (
            SELECT 
              ServiceName,
              FORMAT_DATE('%Y-%m-%d', DATE(OrderCreatedDate)) as Day,
              SUM(Revenue) as DailyRevenue
            FROM PaymentData
            WHERE ${timeConstraint}
              AND ServiceName IN (SELECT ServiceName FROM TopServices)
            GROUP BY ServiceName, Day
            ORDER BY Day
          ),
          
          -- Current period stats
          CurrentStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as total_customers,
              COUNT(DISTINCT InvoiceNumber) as total_invoices,
              COUNT(DISTINCT ServiceName) as total_services,
              SUM(Revenue) as total_revenue
            FROM PaymentData
            WHERE ${timeConstraint}
          ),
          
          -- Previous period stats for comparison
          PreviousStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as prev_month_customers,
              COUNT(DISTINCT InvoiceNumber) as prev_month_invoices,
              COUNT(DISTINCT ServiceName) as prev_month_services,
              SUM(Revenue) as prev_month_revenue
            FROM PaymentData
            WHERE ${prevTimeConstraint}
          )
          
          -- Final result combining all data
          SELECT 
            ts.ServiceName,
            ts.TotalRevenue,
            ts.ServiceCount,
            cd.Day,
            cd.DailyRevenue,
            cs.total_customers,
            cs.total_invoices,
            cs.total_services,
            cs.total_revenue,
            ps.prev_month_customers,
            ps.prev_month_invoices,
            ps.prev_month_services,
            ps.prev_month_revenue
          FROM TopServices ts
          LEFT JOIN CurrentMonthData cd ON ts.ServiceName = cd.ServiceName
          CROSS JOIN CurrentStats cs
          CROSS JOIN PreviousStats ps
          ORDER BY ts.TotalRevenue DESC, cd.Day
        `;
        
        console.log('Executing full query:', fullQuery);
        
        const fullResponse = await fetch('/api/query', {
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
        
        console.log('Full API Response Structure:', {
          status: fullResponse.status,
          hasData: Boolean(fullResponseData.data),
          hasSuccess: Boolean(fullResponseData.success),
          dataLength: fullResponseData.data?.length, 
          firstRecord: fullResponseData.data?.[0]
        });
        
        if (!fullResponseData.success) {
          console.warn('API error or invalid response');
          useFallbackData();
          return;
        }
        
        const data = fullResponseData.data || [];
        
        if (data.length === 0) {
          console.warn('No data returned from full query');
          useFallbackData(); // Use fallback data instead of showing error
          return;
        }
        
        // Process the data for charts and statistics
        console.log('Raw data sample from API (first 3 records):', data.slice(0, 3));
        
        // Extract unique dates for x-axis
        // Safely parse and format dates without risking invalid Date objects
        const uniqueDates = [...new Set(data
          .filter((item: any) => item.Day)
          .map((item: any) => {
            try {
              // Check if Day is already a formatted date string like "2023-04-15"
              if (typeof item.Day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.Day)) {
                const parts = item.Day.split('-');
                // Create a date in a safe way
                const date = new Date(
                  parseInt(parts[0], 10), 
                  parseInt(parts[1], 10) - 1, // Month is 0-indexed
                  parseInt(parts[2], 10)
                );
                return format(date, 'MMM dd');
              }
              // Handle if it's a timestamp or other format
              return format(new Date(item.Day), 'MMM dd');
            } catch (e) {
              console.warn(`Failed to parse date: ${item.Day}`, e);
              // Use the raw date string as fallback
              return String(item.Day).substring(0, 10);
            }
          })
        )].sort();
        
        console.log('Unique dates found:', uniqueDates);
        
        // Process data for each service
        const serviceNames = [...new Set(data.map((item: any) => item.ServiceName))];
        console.log('Service names found:', serviceNames);
        
        if (serviceNames.length === 0) {
          console.warn('No service names found in the data');
          useFallbackData();
          return;
        }

        const serviceDataSeries = serviceNames.map(serviceName => {
          const serviceData = data.filter((item: any) => item.ServiceName === serviceName);
          console.log(`Processing service ${serviceName} with ${serviceData.length} data points`);
          
          // Create data points for each day
          const dataPoints = uniqueDates.map(formattedDate => {
            const dayData = serviceData.find((item: any) => {
              if (!item.Day) return false;
              
              try {
                // Try to match the date using the same formatting strategy
                if (typeof item.Day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.Day)) {
                  const parts = item.Day.split('-');
                  const date = new Date(
                    parseInt(parts[0], 10), 
                    parseInt(parts[1], 10) - 1, 
                    parseInt(parts[2], 10)
                  );
                  return format(date, 'MMM dd') === formattedDate;
                }
                return format(new Date(item.Day), 'MMM dd') === formattedDate;
              } catch (e) {
                return String(item.Day).substring(0, 10) === formattedDate;
              }
            });
            
            return dayData ? Number(dayData.DailyRevenue || 0) : 0;
          });
          
          return {
            name: serviceName as string,
            data: dataPoints
          };
        }) as ServiceData[];
        
        // Log the final processed data to verify it's correct
        console.log('Final service data series:', JSON.stringify(serviceDataSeries));
        
        // Calculate statistics from the data
        // Use the first row for statistics since they are the same for all rows with CROSS JOIN
        const statsRow = data[0];
        
        const totalIncomeValue = Number(statsRow.total_revenue) || 0;
        const prevMonthIncome = Number(statsRow.prev_month_revenue) || 0;
        
        // Calculate percentage changes
        const calculatePercentageChange = (current: number, previous: number): number => {
          if (previous === 0) return current > 0 ? 100 : 0;
          return ((current - previous) / previous) * 100;
        };
        
        const incomeChangePercentage = calculatePercentageChange(totalIncomeValue, prevMonthIncome);
        
        // Update state with the processed data for chart
        setDateLabels(uniqueDates as string[]);
        setServicesData(serviceDataSeries);
        setTotalIncome(totalIncomeValue);
        setIncomeChange(incomeChangePercentage);
        
        // Fetch statistics from QueenDataView for cards
        await fetchStatsData();
        
      } catch (err) {
        console.error('Error fetching chart data:', err);
        useFallbackData(); // Use fallback data on error
      } finally {
        setLoading(false);
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
            FROM \`great_time.QueenDataView\`
            WHERE ${currentPeriodFilter}
          ),
          PreviousPeriodStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as previous_customers,
              COUNT(DISTINCT BookingID) as previous_appointments,
              COUNT(DISTINCT ServiceName) as previous_services
            FROM \`great_time.QueenDataView\`
            WHERE ${previousPeriodFilter}
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
        
        console.log('Executing stats query:', statsQuery);
        
        const statsResponse = await fetch('/api/query', {
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
          console.warn('No stats data returned from QueenDataView');
          return; // Continue with chart data, just don't update the stats
        }
        
        const statsData = statsResponseData.data[0];
        console.log('Stats data:', statsData);
        
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
        console.error('Error fetching stats data:', err);
        // Don't use fallback data here, just log the error
        // The chart data will still be displayed
      }
    };
    
    // Fetch top services data
    const fetchTopServices = async () => {
      setLoadingTopServices(true);
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
        
        const topServicesQuery = `
          WITH CurrentPeriodServices AS (
            SELECT
              ServiceName,
              COUNT(DISTINCT BookingID) AS current_booking_count,
              COUNT(DISTINCT CustomerName) AS current_customer_count
            FROM \`great_time.QueenDataView\`
            WHERE ${currentPeriodFilter}
              AND ServiceName IS NOT NULL
            GROUP BY ServiceName
          ),
          PreviousPeriodServices AS (
            SELECT
              ServiceName,
              COUNT(DISTINCT BookingID) AS previous_booking_count,
              COUNT(DISTINCT CustomerName) AS previous_customer_count
            FROM \`great_time.QueenDataView\`
            WHERE ${previousPeriodFilter}
              AND ServiceName IS NOT NULL
            GROUP BY ServiceName
          )
          SELECT
            c.ServiceName,
            c.current_booking_count,
            c.current_customer_count,
            p.previous_booking_count,
            p.previous_customer_count
          FROM CurrentPeriodServices c
          LEFT JOIN PreviousPeriodServices p ON c.ServiceName = p.ServiceName
          ORDER BY c.current_booking_count DESC
          LIMIT 10
        `;
        
        console.log('Executing top services query:', topServicesQuery);
        
        const topServicesResponse = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: topServicesQuery }),
        });
        
        if (!topServicesResponse.ok) {
          throw new Error(`Failed to fetch top services data (Status: ${topServicesResponse.status})`);
        }
        
        const topServicesResponseData = await topServicesResponse.json();
        
        if (!topServicesResponseData.success || !topServicesResponseData.data || topServicesResponseData.data.length === 0) {
          console.warn('No top services data returned from QueenDataView');
          setTopServices([]);
          return;
        }
        
        // Calculate percentage changes and format data
        const calculatePercentageChange = (current: number, previous: number): number => {
          if (previous === 0 || previous === null || previous === undefined) return 0;
          return ((current - previous) / previous) * 100;
        };
        
        const formattedTopServices = topServicesResponseData.data.map((service: any) => ({
          serviceName: service.ServiceName,
          bookingCount: Number(service.current_booking_count) || 0,
          customerCount: Number(service.current_customer_count) || 0,
          bookingChange: calculatePercentageChange(
            Number(service.current_booking_count) || 0, 
            Number(service.previous_booking_count) || 0
          ),
          customerChange: calculatePercentageChange(
            Number(service.current_customer_count) || 0, 
            Number(service.previous_customer_count) || 0
          )
        }));
        
        setTopServices(formattedTopServices);
      } catch (err) {
        console.error('Error fetching top services data:', err);
        setTopServices([]);
      } finally {
        setLoadingTopServices(false);
      }
    };
    
    // Fetch payment methods data
    const fetchPaymentMethods = async () => {
      setLoadingPaymentMethods(true);
      try {
        // Define time period filter based on the selected period
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
              PaymentMethod,
              COUNT(*) as count
            FROM \`great_time.QueenPaymentView\`
            WHERE ${timeConstraint}
              AND PaymentStatus = 'PAID'
              AND PaymentMethod IS NOT NULL
              AND PaymentMethod != ''
              AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
            GROUP BY PaymentMethod
          ),
          TotalCount AS (
            SELECT SUM(count) as total_count FROM PaymentMethodCounts
          )
          SELECT
            pmc.PaymentMethod,
            pmc.count,
            ROUND((pmc.count / tc.total_count) * 100, 1) as percentage
          FROM PaymentMethodCounts pmc, TotalCount tc
          ORDER BY pmc.count DESC
        `;
        
        console.log('Executing payment methods query:', paymentMethodsQuery);
        
        const paymentMethodsResponse = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: paymentMethodsQuery }),
        });
        
        if (!paymentMethodsResponse.ok) {
          throw new Error(`Failed to fetch payment methods data (Status: ${paymentMethodsResponse.status})`);
        }
        
        const paymentMethodsResponseData = await paymentMethodsResponse.json();
        
        if (!paymentMethodsResponseData.success || !paymentMethodsResponseData.data || paymentMethodsResponseData.data.length === 0) {
          console.warn('No payment methods data returned from QueenPaymentView');
          setPaymentMethods([]);
          return;
        }
        
        // Format the payment methods data
        const formattedPaymentMethods = paymentMethodsResponseData.data.map((method: any) => ({
          method: method.PaymentMethod,
          count: Number(method.count) || 0,
          percentage: Number(method.percentage) || 0
        }));
        
        setPaymentMethods(formattedPaymentMethods);
      } catch (err) {
        console.error('Error fetching payment methods data:', err);
        setPaymentMethods([]);
      } finally {
        setLoadingPaymentMethods(false);
      }
    };
    
    // Fetch top therapists data
    const fetchTopTherapists = async () => {
      setLoadingTherapists(true);
      try {
        // Define time periods for current period
        let currentPeriodFilter = '';
        
        if (period === 'monthly') {
          const currentMonth = format(new Date(), 'yyyy-MM');
          currentPeriodFilter = `FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${currentMonth}'`;
        } else if (period === 'weekly') {
          currentPeriodFilter = 'DATE(CheckInTime) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()';
        } else if (period === 'annual') {
          const currentYear = new Date().getFullYear();
          currentPeriodFilter = `EXTRACT(YEAR FROM CheckInTime) = ${currentYear}`;
        }
        
        const therapistsQuery = `
          WITH TherapistData AS (
            SELECT 
              PractitionerName as name,
              PractitionerImage as image,
              COUNT(*) as bookingCount
            FROM 
              \`great_time.QueenDataView\`
            WHERE 
              ${currentPeriodFilter}
              AND PractitionerName IS NOT NULL
              AND PractitionerName != 'N/A'
              AND TRIM(PractitionerName) != ''
            GROUP BY 
              PractitionerName, PractitionerImage
          ),
          TotalBookings AS (
            SELECT SUM(bookingCount) as total FROM TherapistData
          )
          SELECT 
            td.name,
            td.image,
            td.bookingCount,
            ROUND((td.bookingCount / tb.total) * 100, 1) as percentage
          FROM 
            TherapistData td, TotalBookings tb
          ORDER BY 
            td.bookingCount DESC
          LIMIT 10
        `;
        
        console.log('Executing therapists query:', therapistsQuery);
        
        const therapistsResponse = await fetch('/api/query', {
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
          console.warn('No therapists data returned from QueenDataView');
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
        console.error('Error fetching therapists data:', err);
        setTopTherapists([]);
      } finally {
        setLoadingTherapists(false);
      }
    };
    
    fetchChartData();
    fetchTopServices();
    fetchPaymentMethods();
    fetchTopTherapists();
  }, [period]);
  
  // Format currency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + " MMK";
  };
  
  // Chart series data
  const chartSeries = useMemo(() => servicesData, [servicesData]);
  
  // Chart options for ApexCharts
  const chartOptions = useMemo((): ApexOptions => ({
    chart: {
      type: 'line',
      height: 350,
      fontFamily: 'SF Pro Display, sans-serif',
      background: 'transparent',
      toolbar: {
        show: false
      },
      animations: {
        enabled: true,
        speed: 800,
        animateGradually: {
          enabled: true,
          delay: 150
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      }
    },
    colors: ['#3B82F6', '#F59E0B', '#10B981'],
    stroke: {
      curve: 'smooth',
      width: 3
    },
    grid: {
      borderColor: 'rgba(71, 85, 105, 0.1)',
      strokeDashArray: 3,
      position: 'back',
      xaxis: {
        lines: {
          show: true
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      },
      padding: {
        top: 10,
        right: 0,
        bottom: 0,
        left: 10
      }
    },
    dataLabels: {
      enabled: false
    },
    xaxis: {
      categories: dateLabels,
      labels: {
        style: {
          colors: '#94a3b8',
          fontFamily: 'SF Pro Display, sans-serif'
        }
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#94a3b8',
          fontFamily: 'SF Pro Display, sans-serif'
        },
        formatter: (value) => `${value}`
      }
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: {
        colors: '#f3f4f6'
      },
      itemMargin: {
        horizontal: 15
      }
    },
    tooltip: {
      theme: 'dark',
      x: {
        show: true
      },
      y: {
        formatter: (value) => formatCurrency(value)
      }
    },
    markers: {
      size: 4,
      strokeWidth: 0,
      hover: {
        size: 6
      }
    }
  }), [dateLabels]);
  
  // Payment Methods chart options
  const paymentMethodsChartOptions = useMemo((): ApexOptions => ({
    chart: {
      type: 'donut',
      fontFamily: 'SF Pro Display, sans-serif',
      background: 'transparent',
      animations: {
        enabled: true,
        speed: 500,
        animateGradually: {
          enabled: true,
          delay: 150
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      }
    },
    colors: ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899'],
    stroke: {
      width: 0
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
              color: '#f3f4f6',
              offsetY: -10
            },
            value: {
              show: true,
              fontSize: '20px',
              color: '#f3f4f6',
              fontWeight: 600,
              formatter: (val) => `${val}%`
            },
            total: {
              show: true,
              label: 'Total',
              fontSize: '16px',
              color: '#94a3b8',
              formatter: () => 'Payments'
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
      theme: 'dark',
      y: {
        formatter: (val) => `${val}%`
      }
    }
  }), [paymentMethods]);
  
  // Payment Methods chart series
  const paymentMethodsChartSeries = useMemo(() => 
    paymentMethods.map(method => method.percentage), 
  [paymentMethods]);
  
  return (
    <Box sx={{ p: 3, backgroundColor: '#1a2035', minHeight: 'calc(100vh - 64px)', overflow: 'auto' }}>
      <Typography variant="h4" gutterBottom color="white">
        Dashboard
      </Typography>
      
      {/* Fallback Data Notice */}
      {usingFallbackData && (
        <Alert severity="warning" sx={{ mb: 3, backgroundColor: '#2d364f', color: 'white' }}>
          <AlertTitle>Using Demo Data</AlertTitle>
          Currently displaying demo data. No actual data was found in your database.
        </Alert>
      )}
      
      <Box
        sx={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 2 
        }}
      >
        <Typography variant="h4" component="h1" sx={{ color: 'white', fontWeight: 600 }}>
          Analytic overview
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ mr: 2, color: '#94a3b8' }}>Show by:</Typography>
          <FormControl sx={{ minWidth: 120 }}>
            <Select
              value={period}
              onChange={handlePeriodChange}
              displayEmpty
              sx={{
                color: '#fff',
                bgcolor: '#1a2235',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#2d3748'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3b82f6'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3b82f6'
                },
                '& .MuiSelect-icon': {
                  color: '#94a3b8'
                }
              }}
            >
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="annual">Annual</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>
      
      {/* Main chart card */}
      <Paper
        sx={{
          p: { xs: 2, sm: 3 },
          bgcolor: '#1a2235',
          borderRadius: 2,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          mb: 4
        }}
      >
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, color: '#94a3b8' }}>
            Total income
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
            <Typography variant="h3" sx={{ color: '#f3f4f6', fontWeight: 700 }}>
              {formatCurrency(totalIncome)}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                ml: 2,
                color: incomeChange >= 0 ? '#10b981' : '#ef4444',
                fontWeight: 500
              }}
            >
              {incomeChange >= 0 ? '+' : ''}{incomeChange.toFixed(1)}%
            </Typography>
          </Box>
        </Box>
        
        <Box sx={{ height: { xs: 300, sm: 350, md: 400 } }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography sx={{ color: '#94a3b8' }}>Loading Data</Typography>
            </Box>
          ) : error ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography sx={{ color: '#ef4444' }}>{error}</Typography>
            </Box>
          ) : servicesData.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography sx={{ color: '#94a3b8' }}>No data available for the selected period</Typography>
            </Box>
          ) : (
            <ReactApexChart 
              options={chartOptions}
              series={chartSeries}
              type="line"
              height="100%"
            />
          )}
        </Box>
      </Paper>
      
      {/* Stats cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Customers Card */}
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: 3,
              bgcolor: '#1a2235',
              borderRadius: 2,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#f3f4f6' }}>
                Customers
              </Typography>
              <Box 
                sx={{ 
                  width: 48, 
                  height: 48, 
                  borderRadius: '50%', 
                  bgcolor: 'rgba(251, 191, 36, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Box 
                  component="span" 
                  className="fas fa-users"
                  sx={{ 
                    color: '#F59E0B', 
                    fontSize: '1.25rem' 
                  }}
                ></Box>
              </Box>
            </Box>
            
            <Typography variant="h3" sx={{ mb: 1, color: '#f3f4f6', fontWeight: 700 }}>
              {formatNumber(customerCount)}
            </Typography>
            
            <Typography
              variant="body2"
              sx={{
                color: customerChange >= 0 ? '#10b981' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {customerChange >= 0 ? '+' : ''}{customerChange.toFixed(1)}% vs last month
            </Typography>
          </Paper>
        </Grid>
        
        {/* Appointment Card */}
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: 3,
              bgcolor: '#1a2235',
              borderRadius: 2,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#f3f4f6' }}>
                Appointment
              </Typography>
              <Box 
                sx={{ 
                  width: 48, 
                  height: 48, 
                  borderRadius: '50%', 
                  bgcolor: 'rgba(5, 150, 105, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Box 
                  component="span" 
                  className="fas fa-calendar-check"
                  sx={{ 
                    color: '#10B981', 
                    fontSize: '1.25rem' 
                  }}
                ></Box>
              </Box>
            </Box>
            
            <Typography variant="h3" sx={{ mb: 1, color: '#f3f4f6', fontWeight: 700 }}>
              {appointmentRate.toFixed(1)}%
            </Typography>
            
            <Typography
              variant="body2"
              sx={{
                color: appointmentChange >= 0 ? '#10b981' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {appointmentChange >= 0 ? '+' : ''}{appointmentChange.toFixed(1)}% vs last month
            </Typography>
          </Paper>
        </Grid>
        
        {/* Services Card */}
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: 3,
              bgcolor: '#1a2235',
              borderRadius: 2,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#f3f4f6' }}>
                Services
              </Typography>
              <Box 
                sx={{ 
                  width: 48, 
                  height: 48, 
                  borderRadius: '50%', 
                  bgcolor: 'rgba(79, 70, 229, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Box 
                  component="span" 
                  className="fas fa-spa"
                  sx={{ 
                    color: '#818CF8', 
                    fontSize: '1.25rem' 
                  }}
                ></Box>
              </Box>
            </Box>
            
            <Typography variant="h3" sx={{ mb: 1, color: '#f3f4f6', fontWeight: 700 }}>
              {formatNumber(serviceCount)}
            </Typography>
            
            <Typography
              variant="body2"
              sx={{
                color: serviceChange >= 0 ? '#10b981' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {serviceChange >= 0 ? '+' : ''}{serviceChange.toFixed(1)}% vs last month
            </Typography>
          </Paper>
        </Grid>
      </Grid>
      
      {/* Analytics Widgets - 3-column layout */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Top Services */}
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              bgcolor: '#1a2235',
              borderRadius: 2,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mb: 3 
              }}
            >
              <Typography variant="h5" sx={{ color: 'white', fontWeight: 600 }}>
                Top services
              </Typography>
            </Box>
            
            {loadingTopServices ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <Typography sx={{ color: '#94a3b8' }}>Loading services data...</Typography>
              </Box>
            ) : topServices.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <Typography sx={{ color: '#94a3b8' }}>No service data available for the selected period</Typography>
              </Box>
            ) : (
              <Box sx={{ overflow: 'auto', maxHeight: 400 }}>
                <Box sx={{ 
                  minWidth: 'auto', 
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
                  {/* Table Header */}
                  <Box sx={{ 
                    display: 'grid', 
                    gridTemplateColumns: '2fr 1fr',
                    borderBottom: '1px solid #2d3748',
                    py: 2,
                    px: 3,
                    bgcolor: '#111923',
                  }}>
                    <Typography sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>
                      SERVICE
                    </Typography>
                    <Typography sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem', textAlign: 'right' }}>
                      BOOKINGS
                    </Typography>
                  </Box>
                  
                  {/* Table Rows */}
                  {topServices.slice(0, 8).map((service, index) => (
                    <Box 
                      key={service.serviceName}
                      sx={{ 
                        display: 'grid', 
                        gridTemplateColumns: '2fr 1fr',
                        borderBottom: '1px solid #2d3748',
                        py: 2,
                        px: 3,
                        bgcolor: index % 2 === 0 ? '#121826' : '#111923',
                        '&:hover': { bgcolor: '#242f3d' },
                      }}
                    >
                      <Typography sx={{ color: 'white', fontWeight: 500, fontSize: '0.9rem' }}>
                        {service.serviceName}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <Typography sx={{ color: 'white', fontWeight: 500, fontSize: '0.9rem' }}>
                          {formatNumber(service.bookingCount)}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
          
        {/* Payment Methods Chart */}
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              bgcolor: '#1a2235',
              borderRadius: 2,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mb: 3 
              }}
            >
              <Typography variant="h5" sx={{ color: 'white', fontWeight: 600 }}>
                Payment methods
              </Typography>
            </Box>
            
            {loadingPaymentMethods ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <Typography sx={{ color: '#94a3b8' }}>Loading payment methods data...</Typography>
              </Box>
            ) : paymentMethods.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <Typography sx={{ color: '#94a3b8' }}>No payment methods data available for the selected period</Typography>
              </Box>
            ) : (
              <Box sx={{ height: 350, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <ReactApexChart 
                  options={{
                    ...paymentMethodsChartOptions,
                    legend: { show: false } // Remove legend
                  }}
                  series={paymentMethodsChartSeries}
                  type="donut"
                  height="100%"
                />
              </Box>
            )}
          </Paper>
        </Grid>
          
        {/* Top Therapists */}
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              bgcolor: '#1a2235',
              borderRadius: 2,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mb: 3 
              }}
            >
              <Typography variant="h5" sx={{ color: 'white', fontWeight: 600 }}>
                Top therapists
              </Typography>
            </Box>
            
            {loadingTherapists ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <Typography sx={{ color: '#94a3b8' }}>Loading therapists data...</Typography>
              </Box>
            ) : topTherapists.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <Typography sx={{ color: '#94a3b8' }}>No therapists data available for the selected period</Typography>
              </Box>
            ) : (
              <Box sx={{ overflow: 'auto', maxHeight: 400 }}>
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: '40px 2fr 1fr',
                  borderBottom: '1px solid #2d3748',
                  py: 2,
                  px: 3,
                  bgcolor: '#111923',
                }}>
                  <Typography sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>
                    
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>
                    THERAPIST
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem', textAlign: 'right' }}>
                    TOTAL
                  </Typography>
                </Box>
                
                {topTherapists.slice(0, 8).map((therapist, index) => (
                  <Box 
                    key={index}
                    sx={{ 
                      display: 'grid', 
                      gridTemplateColumns: '40px 2fr 1fr',
                      borderBottom: '1px solid #2d3748',
                      py: 2,
                      px: 3,
                      bgcolor: index % 2 === 0 ? '#121826' : '#111923',
                      '&:hover': { bgcolor: '#242f3d' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Avatar
                        src={therapist.image || undefined}
                        sx={{ 
                          width: 28, 
                          height: 28, 
                          bgcolor: '#3B82F6',
                          fontSize: '0.8rem'
                        }}
                      >
                        {!therapist.image && therapist.name.charAt(0)}
                      </Avatar>
                    </Box>
                    <Typography sx={{ color: 'white', fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                      {therapist.name}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <Typography sx={{ color: 'white', fontWeight: 500, fontSize: '0.9rem' }}>
                        {formatNumber(therapist.bookingCount)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard; 