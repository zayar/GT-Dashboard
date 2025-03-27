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
import { useClinic } from '../contexts/ClinicContext';

// Define period types
type PeriodType = 'monthly' | 'weekly' | 'annual';

// Define service data
interface ServiceData {
  name: string;
  data: number[];
}

// Dashboard component
const Dashboard: React.FC = () => {
  const { currentClinic } = useClinic();
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

  // Format currency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + " MMK";
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
        
        // Query to get appointment data for chart
        const query = `
          WITH PopularServices AS (
            SELECT 
              ServiceName,
              COUNT(DISTINCT BookingID) as BookingCount
            FROM \`great_time.MainDataView\`
            WHERE ServiceName IS NOT NULL
              AND ClinicCode = '${currentClinic.code}'
            GROUP BY ServiceName
            ORDER BY BookingCount DESC
            LIMIT 3
          ),
          
          DailyAppointments AS (
            SELECT 
              ServiceName,
              FORMAT_DATE('%Y-%m-%d', DATE(CheckInTime)) as Day,
              COUNT(DISTINCT BookingID) as DailyCount
            FROM \`great_time.MainDataView\`
            WHERE ${timeConstraint}
              AND ServiceName IN (SELECT ServiceName FROM PopularServices)
              AND ClinicCode = '${currentClinic.code}'
            GROUP BY ServiceName, Day
            ORDER BY Day
            LIMIT 100
          )
          
          SELECT 
            ps.ServiceName,
            ps.BookingCount,
            da.Day,
            IFNULL(da.DailyCount, 0) as DailyCount
          FROM PopularServices ps
          LEFT JOIN DailyAppointments da ON ps.ServiceName = da.ServiceName
          ORDER BY ps.BookingCount DESC, da.Day
          LIMIT 100
        `;
        
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
        
        if (!responseData.success || !responseData.data || responseData.data.length === 0) {
          useFallbackData(); // Use fallback data
          return;
        }
        
        const data = responseData.data || [];
        
        // Process the data for the chart
        const uniqueDates = [...new Set(data
          .filter((item: any) => item.Day)
          .map((item: any) => {
            try {
              if (typeof item.Day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.Day)) {
                const parts = item.Day.split('-');
                const date = new Date(
                  parseInt(parts[0], 10), 
                  parseInt(parts[1], 10) - 1,
                  parseInt(parts[2], 10)
                );
                return format(date, 'MMM dd');
              }
              return format(new Date(item.Day), 'MMM dd');
            } catch (e) {
              return String(item.Day).substring(0, 10);
            }
          })
        )].sort();
        
        const serviceNames = [...new Set(data.map((item: any) => item.ServiceName))];
        
        if (serviceNames.length === 0) {
          useFallbackData();
          return;
        }

        const serviceDataSeries = serviceNames.map(serviceName => {
          const serviceData = data.filter((item: any) => item.ServiceName === serviceName);
          
          const dataPoints = uniqueDates.map(formattedDate => {
            const dayData = serviceData.find((item: any) => {
              if (!item.Day) return false;
              
              try {
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
            
            return dayData ? Number(dayData.DailyCount || 0) : 0;
          });
          
          return {
            name: serviceName as string,
            data: dataPoints
          };
        }) as ServiceData[];
        
        // Update chart data
        setDateLabels(uniqueDates as string[]);
        setServicesData(serviceDataSeries);
        
        // Fetch statistics separately
        await fetchStats(timeConstraint, prevTimeConstraint);
        
      } catch (err) {
        useFallbackData(); // Use fallback data on error
      } finally {
        setLoading(false);
      }
    };

    // Helper function to calculate percentage change
    const calculatePercentageChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    
    // Fetch appointment and revenue statistics
    const fetchStats = async (timeConstraint: string, prevTimeConstraint: string) => {
      try {
        // Get appointment statistics from MainDataView
        const statsQuery = `
          WITH CurrentStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as total_customers,
              COUNT(DISTINCT BookingID) as total_appointments,
              COUNT(DISTINCT ServiceName) as total_services
            FROM \`great_time.MainDataView\`
            WHERE ${timeConstraint}
              AND ClinicCode = '${currentClinic.code}'
            LIMIT 5000
          ),
          
          PreviousStats AS (
            SELECT
              COUNT(DISTINCT CustomerName) as prev_customers,
              COUNT(DISTINCT BookingID) as prev_appointments,
              COUNT(DISTINCT ServiceName) as prev_services
            FROM \`great_time.MainDataView\`
            WHERE ${prevTimeConstraint}
              AND ClinicCode = '${currentClinic.code}'
            LIMIT 5000
          )
          
          SELECT 
            IFNULL(cs.total_customers, 0) as total_customers,
            IFNULL(cs.total_appointments, 0) as total_appointments,
            IFNULL(cs.total_services, 0) as total_services,
            IFNULL(ps.prev_customers, 0) as prev_customers,
            IFNULL(ps.prev_appointments, 0) as prev_appointments,
            IFNULL(ps.prev_services, 0) as prev_services
          FROM CurrentStats cs
          CROSS JOIN PreviousStats ps
        `;
        
        const statsResponse = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: statsQuery }),
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          
          if (statsData.success && statsData.data && statsData.data.length > 0) {
            const statsRow = statsData.data[0];
            
            // Process appointment and customer statistics
            const currentCustomers = Number(statsRow.total_customers) || 0;
            const previousCustomers = Number(statsRow.prev_customers) || 0;
            const customerChangePercentage = calculatePercentageChange(currentCustomers, previousCustomers);
            
            const currentAppointments = Number(statsRow.total_appointments) || 0;
            const previousAppointments = Number(statsRow.prev_appointments) || 0;
            
            // Calculate appointment rate (appointments per customer)
            const appointmentRateValue = 
              currentCustomers > 0 ? 
              (currentAppointments / currentCustomers) * 100 : 0;
            
            const prevAppointmentRate = 
              previousCustomers > 0 ? 
              (previousAppointments / previousCustomers) * 100 : 0;
            
            const appointmentChangePercentage = calculatePercentageChange(appointmentRateValue, prevAppointmentRate);
            
            const currentServices = Number(statsRow.total_services) || 0;
            const previousServices = Number(statsRow.prev_services) || 0;
            const serviceChangePercentage = calculatePercentageChange(currentServices, previousServices);
            
            // Update state with stats data
            setCustomerCount(currentCustomers);
            setCustomerChange(customerChangePercentage);
            setAppointmentRate(appointmentRateValue);
            setAppointmentChange(appointmentChangePercentage);
            setServiceCount(currentServices);
            setServiceChange(serviceChangePercentage);
          }
        }
        
        // Get revenue data from MainPaymentView
        const revenueQuery = `
          WITH PaymentData AS (
            SELECT 
              OrderCreatedDate,
              CustomerName,
              InvoiceNumber,
              CAST(NetTotal AS FLOAT64) as Revenue
            FROM \`great_time.MainPaymentView\`
            WHERE ServiceName IS NOT NULL
              AND PaymentMethod != 'PASS'
              AND PaymentStatus = 'PAID'
              AND CAST(NetTotal AS FLOAT64) > 0
              AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
              AND ClinicCode = '${currentClinic.code}'
              LIMIT 10000
          ),
          
          CurrentStats AS (
            SELECT
              SUM(Revenue) as total_revenue
            FROM PaymentData
            WHERE ${timeConstraint}
            LIMIT 5000
          ),
          
          PreviousStats AS (
            SELECT
              SUM(Revenue) as prev_revenue
            FROM PaymentData
            WHERE ${prevTimeConstraint}
            LIMIT 5000
          )
          
          SELECT
            IFNULL(cs.total_revenue, 0) as total_revenue,
            IFNULL(ps.prev_revenue, 0) as prev_revenue
          FROM CurrentStats cs
          CROSS JOIN PreviousStats ps
        `;
        
        const revenueResponse = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: revenueQuery }),
        });
        
        if (revenueResponse.ok) {
          const revenueData = await revenueResponse.json();
          
          if (revenueData.success && revenueData.data && revenueData.data.length > 0) {
            const revenueRow = revenueData.data[0];
            
            const totalIncomeValue = Number(revenueRow.total_revenue) || 0;
            const prevMonthIncome = Number(revenueRow.prev_revenue) || 0;
            
            const incomeChangePercentage = calculatePercentageChange(totalIncomeValue, prevMonthIncome);
            
            // Update state with revenue data
            setTotalIncome(totalIncomeValue);
            setIncomeChange(incomeChangePercentage);
          }
        }
        
      } catch (err) {
        // Skip errors without affecting the chart display
      }
    };
    
    fetchChartData();
  }, [period, currentClinic]);
  
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
        formatter: (value) => `${value} appointments`
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
                Top 10 services
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
                Top 10 therapists
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