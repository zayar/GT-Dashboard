import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Button,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleIcon from '@mui/icons-material/People';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { useClinic } from '../contexts/ClinicContext';
import axios from 'axios';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { formatCurrency } from '../utils/currency';

interface DailyReportData {
  CustomerName: string;
  CustomerPhoneNumber: string;
  CustomerId: string;
  ServiceName: string;
  CheckInTime: string;
  PractitionerName: string;
  HelperName: string | null;
  IsNewCustomer: string;
  TotalPaymentAmount: number | null;
  PaymentMethods: string | null;
  PaymentNotes: string | null;
  SellerNames?: string | null;
}

const DailyReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<DailyReportData[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const fetchDailyData = useCallback(async () => {
    if (!currentClinic) {
      setError('No clinic selected');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const selectedDateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');

      const query = `
        WITH TodayVisits AS (
          SELECT
            CustomerName,
            CustomerPhoneNumber,
            CustomerId,
            ServiceName,
            CheckInTime,
            PractitionerName,
            HelperName
          FROM great_time.MainDataView
          WHERE DATE(CheckInTime) = '${selectedDateStr}'
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            AND CustomerName IS NOT NULL
            AND ServiceName IS NOT NULL
        ),
        FirstVisits AS (
          SELECT
            CustomerPhoneNumber,
            MIN(DATE(CheckInTime)) AS first_visit_date
          FROM great_time.MainDataView
          WHERE LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            AND CustomerName IS NOT NULL
          GROUP BY CustomerPhoneNumber
        ),
        PaymentData AS (
          -- First deduplicate invoices (since MainPaymentView has multiple rows per invoice for each line item)
          WITH DeduplicatedInvoices AS (
            SELECT
              CustomerPhoneNumber,
              InvoiceNumber,
              MAX(CAST(NetTotal AS FLOAT64)) AS InvoiceNetTotal,
              MAX(PaymentMethod) AS PaymentMethod,
              MAX(CASE WHEN PaymentNote IS NOT NULL AND PaymentNote != '' THEN PaymentNote END) AS PaymentNote,
              MAX(SellerName) AS SellerName
            FROM great_time.MainPaymentView
            WHERE DATE(OrderCreatedDate) = '${selectedDateStr}'
              AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
            GROUP BY CustomerPhoneNumber, InvoiceNumber
          )
          SELECT
            CustomerPhoneNumber,
            SUM(InvoiceNetTotal) AS TotalPaymentAmount,
            STRING_AGG(DISTINCT PaymentMethod, ', ') AS PaymentMethods,
            STRING_AGG(DISTINCT CASE WHEN PaymentNote IS NOT NULL AND PaymentNote != '' THEN PaymentNote END, ' | ') AS PaymentNotes,
            STRING_AGG(DISTINCT SellerName, ', ') AS SellerNames
          FROM DeduplicatedInvoices
          GROUP BY CustomerPhoneNumber
        )
        SELECT
          t.*,
          CASE 
            WHEN f.first_visit_date = '${selectedDateStr}' THEN 'Yes'
            ELSE 'No'
          END AS IsNewCustomer,
          p.TotalPaymentAmount,
          p.PaymentMethods,
          p.PaymentNotes,
          p.SellerNames
        FROM TodayVisits t
        LEFT JOIN FirstVisits f ON t.CustomerPhoneNumber = f.CustomerPhoneNumber
        LEFT JOIN PaymentData p ON t.CustomerPhoneNumber = p.CustomerPhoneNumber
        ORDER BY t.CustomerName, t.ServiceName
      `;

      console.log('Executing daily report query:', query);

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
        console.error('BigQuery Error:', response.data.error);
        throw new Error(response.data.error || 'Failed to fetch daily report data');
      }

      const data = response.data.data || [];
      console.log('Daily report data fetched:', data.length, 'records');
      setRawData(data);
    } catch (err: any) {
      console.error('Error fetching daily report:', err);
      console.error('Full error details:', err.response?.data);
      setError(err.response?.data?.error || err.message || 'Failed to fetch daily report data');
    } finally {
      setLoading(false);
    }
  }, [currentClinic, selectedDate]);

  useEffect(() => {
    if (currentClinic) {
      fetchDailyData();
    }
  }, [currentClinic, fetchDailyData]);

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  // Calculate summary statistics
  const summary = useMemo(() => {
    const uniqueCustomers = new Set(rawData.map(r => r.CustomerPhoneNumber));
    const uniqueServices = new Set(rawData.map(r => r.ServiceName));
    
    return {
      totalCustomers: uniqueCustomers.size,
      totalServices: uniqueServices.size,
      totalVisits: rawData.length
    };
  }, [rawData]);

  // Prepare heatmap data: Customer (rows) x Service (columns)
  const heatmapData = useMemo(() => {
    const customerServiceMap: { [customer: string]: { [service: string]: number } } = {};
    const allServices = new Set<string>();
    const customerPhoneMap: { [customer: string]: string } = {};
    const customerIdMap: { [customer: string]: string } = {};
    const customerPractitionerMap: { [customer: string]: Set<string> } = {};
    const customerHelperMap: { [customer: string]: Set<string> } = {};
    const customerNewStatusMap: { [customer: string]: string } = {};
    const customerPaymentAmountMap: { [customer: string]: number } = {};
    const customerPaymentMethodMap: { [customer: string]: string } = {};
    const customerPaymentNoteMap: { [customer: string]: string } = {};
    const customerSellerMap: { [customer: string]: string } = {};

    rawData.forEach(record => {
      const customer = record.CustomerName;
      const service = record.ServiceName;
      
      // Store phone number and customer ID for reference
      customerPhoneMap[customer] = record.CustomerPhoneNumber;
      customerIdMap[customer] = record.CustomerId;
      
      // Store new customer status
      customerNewStatusMap[customer] = record.IsNewCustomer;
      
      // Store payment information (same for all records of a customer)
      customerPaymentAmountMap[customer] = record.TotalPaymentAmount || 0;
      customerPaymentMethodMap[customer] = record.PaymentMethods || '-';
      customerPaymentNoteMap[customer] = record.PaymentNotes || '-';
      customerSellerMap[customer] = record.SellerNames || '-';

      // Store practitioners and helpers
      if (!customerPractitionerMap[customer]) {
        customerPractitionerMap[customer] = new Set();
      }
      if (!customerHelperMap[customer]) {
        customerHelperMap[customer] = new Set();
      }
      
      if (record.PractitionerName) {
        customerPractitionerMap[customer].add(record.PractitionerName);
      }
      if (record.HelperName) {
        customerHelperMap[customer].add(record.HelperName);
      }

      if (!customerServiceMap[customer]) {
        customerServiceMap[customer] = {};
      }

      if (!customerServiceMap[customer][service]) {
        customerServiceMap[customer][service] = 0;
      }

      customerServiceMap[customer][service]++;
      allServices.add(service);
    });

    const services = Array.from(allServices).sort();
    const customers = Object.keys(customerServiceMap).sort();

    // Convert Sets to comma-separated strings
    const practitionerMap: { [customer: string]: string } = {};
    const helperMap: { [customer: string]: string } = {};
    
    customers.forEach(customer => {
      practitionerMap[customer] = Array.from(customerPractitionerMap[customer] || []).join(', ') || '-';
      helperMap[customer] = Array.from(customerHelperMap[customer] || []).join(', ') || '-';
    });

    return {
      customers,
      services,
      data: customerServiceMap,
      phoneMap: customerPhoneMap,
      customerIdMap,
      practitionerMap,
      helperMap,
      newCustomerMap: customerNewStatusMap,
      paymentAmountMap: customerPaymentAmountMap,
      paymentMethodMap: customerPaymentMethodMap,
      paymentNoteMap: customerPaymentNoteMap,
      sellerMap: customerSellerMap
    };
  }, [rawData]);

  // Calculate heatmap color based on count
  const getHeatmapColor = (count: number, maxValue: number) => {
    if (count === 0 || !count) return 'transparent';
    const opacity = 0.2 + (count / (maxValue || 1)) * 0.7;
    return `rgba(59, 130, 246, ${opacity})`; // Blue theme
  };

  // Get maximum value for color scaling
  const maxValue = useMemo(() => {
    const allCounts = Object.values(heatmapData.data).flatMap(serviceMap =>
      Object.values(serviceMap)
    );
    return allCounts.length > 0 ? Math.max(...allCounts) : 1;
  }, [heatmapData]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleCustomerClick = (customerName: string, phoneNumber: string) => {
    navigate(`/customers/${encodeURIComponent(phoneNumber)}`);
  };

  const handleServiceClick = (serviceName: string) => {
    navigate(`/services/${encodeURIComponent(serviceName)}`);
  };

  const exportToExcel = () => {
    if (heatmapData.customers.length === 0) {
      return;
    }

    // Prepare data for Excel export
    const exportData = heatmapData.customers.map(customer => {
      const row: any = {
        'Customer Name': customer,
        'Customer ID': heatmapData.customerIdMap[customer],
        'Phone Number': heatmapData.phoneMap[customer],
        'New Customer': heatmapData.newCustomerMap[customer],
        'Practitioner(s)': heatmapData.practitionerMap[customer],
        'Helper(s)': heatmapData.helperMap[customer],
        'Seller(s)': (heatmapData as any).sellerMap[customer],
        'Payment Amount': heatmapData.paymentAmountMap[customer] || 0,
        'Payment Method(s)': heatmapData.paymentMethodMap[customer],
        'Payment Note(s)': heatmapData.paymentNoteMap[customer]
      };
      
      // Add service columns
      heatmapData.services.forEach(service => {
        row[service] = heatmapData.data[customer]?.[service] || 0;
      });
      
      return row;
    });

    // Export data without summary row
    const dataWithSummary = exportData;

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(dataWithSummary);

    // Set column widths
    const colWidths = [
      { wch: 30 }, // Customer Name
      { wch: 15 }, // Customer ID
      { wch: 15 }, // Phone Number
      { wch: 15 }, // New Customer
      { wch: 25 }, // Practitioner(s)
      { wch: 25 }, // Helper(s)
      { wch: 25 }, // Seller(s)
      { wch: 15 }, // Payment Amount
      { wch: 20 }, // Payment Method(s)
      { wch: 30 }, // Payment Note(s)
      ...heatmapData.services.map(() => ({ wch: 20 })) // Service columns
    ];
    ws['!cols'] = colWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report');

    // Generate filename with date
    const dateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');
    const filename = `daily_report_${currentClinic?.code}_${dateStr}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        bgcolor: '#111923'
      }}>
        <CircularProgress sx={{ color: '#3b82f6' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ bgcolor: '#111923', minHeight: '100vh', p: 3 }}>
        <Paper sx={{ p: 4, bgcolor: '#1a2234', textAlign: 'center', borderRadius: 2 }}>
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button
            variant="contained"
            onClick={fetchDailyData}
            startIcon={<RefreshIcon />}
            sx={{
              bgcolor: '#3b82f6',
              '&:hover': { bgcolor: '#2563eb' }
            }}
          >
            Retry
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ bgcolor: '#111923', minHeight: '100vh', p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              onClick={handleBack}
              sx={{
                mr: 2,
                color: 'white',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" component="h1" sx={{ color: 'white', fontWeight: 'bold' }}>
              Daily Report
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSelectedDate(new Date())}
              sx={{
                fontSize: '0.75rem',
                minWidth: 'auto',
                px: 2,
                py: 0.5,
                borderColor: '#2d3748',
                color: '#9ca3af',
                bgcolor: '#1a2234',
                '&:hover': {
                  borderColor: '#3b82f6',
                  color: '#3b82f6',
                  bgcolor: 'rgba(59, 130, 246, 0.08)'
                }
              }}
            >
              Today
            </Button>
            <DatePicker
              value={selectedDate}
              onChange={handleDateChange}
              slotProps={{
                textField: {
                  size: 'small',
                  sx: {
                    bgcolor: '#1a2234',
                    borderRadius: 1,
                    '& .MuiOutlinedInput-root': {
                      color: '#d1d5db',
                      '& fieldset': {
                        borderColor: '#2d3748',
                      },
                      '&:hover fieldset': {
                        borderColor: '#4a5568',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#3b82f6',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#9ca3af',
                    },
                    '& .MuiSvgIcon-root': {
                      color: '#d1d5db',
                    },
                  }
                }
              }}
            />
            <IconButton
              onClick={fetchDailyData}
              sx={{
                color: 'white',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Paper
            sx={{
              p: 3,
              bgcolor: '#1a2234',
              borderRadius: 2,
              border: '1px solid #2d3748',
              transition: 'transform 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(59, 130, 246, 0.1)',
                  mr: 2
                }}
              >
                <PeopleIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#9ca3af', mb: 0.5 }}>
                  Total Customers
                </Typography>
                <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                  {summary.totalCustomers}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper
            sx={{
              p: 3,
              bgcolor: '#1a2234',
              borderRadius: 2,
              border: '1px solid #2d3748',
              transition: 'transform 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(16, 185, 129, 0.1)',
                  mr: 2
                }}
              >
                <MedicalServicesIcon sx={{ fontSize: 32, color: '#10b981' }} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#9ca3af', mb: 0.5 }}>
                  Unique Services
                </Typography>
                <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                  {summary.totalServices}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper
            sx={{
              p: 3,
              bgcolor: '#1a2234',
              borderRadius: 2,
              border: '1px solid #2d3748',
              transition: 'transform 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(168, 85, 247, 0.2)'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(168, 85, 247, 0.1)',
                  mr: 2
                }}
              >
                <MedicalServicesIcon sx={{ fontSize: 32, color: '#a855f7' }} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#9ca3af', mb: 0.5 }}>
                  Total Visits
                </Typography>
                <Typography variant="h4" sx={{ color: '#f3f4f6', fontWeight: 'bold' }}>
                  {summary.totalVisits}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Customer-Service Heatmap */}
      <Paper sx={{ p: 3, bgcolor: '#1a2234', borderRadius: 2, border: '1px solid #2d3748' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 3 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={exportToExcel}
            disabled={heatmapData.customers.length === 0}
            sx={{
              borderColor: '#2d3748',
              color: '#d1d5db',
              bgcolor: '#1a2234',
              '&:hover': {
                borderColor: '#3b82f6',
                color: '#3b82f6',
                bgcolor: 'rgba(59, 130, 246, 0.08)'
              },
              '&.Mui-disabled': {
                borderColor: '#1f2937',
                color: '#4b5563'
              }
            }}
          >
            Export to Excel
          </Button>
        </Box>

        {heatmapData.customers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography sx={{ color: '#9ca3af' }}>
              No service usage data available for today
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              maxHeight: 'calc(100vh - 450px)',
              overflowY: 'auto',
              overflowX: 'auto',
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
            }}
          >
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
                      borderBottom: '1px solid #2d3748',
                      minWidth: 200
                    }}
                  >
                    Customer Name
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 200,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 120,
                      textAlign: 'center'
                    }}
                  >
                    Customer ID
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 320,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 100,
                      textAlign: 'center'
                    }}
                  >
                    New
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 420,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 150
                    }}
                  >
                    Practitioner(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 570,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 150
                    }}
                  >
                    Helper(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 720,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 150
                    }}
                  >
                    Seller(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 870,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 120,
                      textAlign: 'right'
                    }}
                  >
                    Payment
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 990,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 130
                    }}
                  >
                    Method(s)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: '#101924',
                      color: '#d1d5db',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 1120,
                      zIndex: 3,
                      borderRight: '1px solid #2d3748',
                      borderBottom: '1px solid #2d3748',
                      minWidth: 200
                    }}
                  >
                    Note(s)
                  </TableCell>
                  {heatmapData.services.map((service) => (
                    <TableCell
                      key={service}
                      sx={{
                        bgcolor: '#101924',
                        color: '#d1d5db',
                        fontWeight: 600,
                        borderBottom: '1px solid #2d3748',
                        minWidth: 120,
                        textAlign: 'center',
                        cursor: 'pointer',
                        '&:hover': {
                          color: '#3b82f6',
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => handleServiceClick(service)}
                    >
                      {service}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {heatmapData.customers.map((customer) => (
                  <TableRow
                    key={customer}
                    sx={{
                      '&:hover': { bgcolor: '#1a2234' }
                    }}
                  >
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
                        fontWeight: 500,
                        '&:hover': {
                          color: '#3b82f6',
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => handleCustomerClick(customer, heatmapData.phoneMap[customer])}
                    >
                      <Box>
                        <Typography sx={{ color: '#f3f4f6', fontSize: '0.9rem', fontWeight: 500 }}>
                          {customer}
                        </Typography>
                        <Typography sx={{ color: '#9ca3af', fontSize: '0.75rem', mt: 0.5 }}>
                          {heatmapData.phoneMap[customer]}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#d1d5db',
                        position: 'sticky',
                        left: 200,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 500
                      }}
                    >
                      {heatmapData.customerIdMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 320,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        textAlign: 'center'
                      }}
                    >
                      <Chip
                        label={heatmapData.newCustomerMap[customer]}
                        size="small"
                        sx={{
                          bgcolor: heatmapData.newCustomerMap[customer] === 'Yes' ? '#10b981' : '#6b7280',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.75rem'
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#d1d5db',
                        position: 'sticky',
                        left: 420,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.practitionerMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#d1d5db',
                        position: 'sticky',
                        left: 570,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.helperMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#d1d5db',
                        position: 'sticky',
                        left: 720,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {(heatmapData as any).sellerMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#10b981',
                        position: 'sticky',
                        left: 870,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textAlign: 'right'
                      }}
                    >
                      {formatCurrency(heatmapData.paymentAmountMap[customer], currentClinic, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#d1d5db',
                        position: 'sticky',
                        left: 990,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {heatmapData.paymentMethodMap[customer]}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: '#d1d5db',
                        position: 'sticky',
                        left: 1120,
                        bgcolor: '#1a2234',
                        borderRight: '1px solid #2d3748',
                        borderBottom: '1px solid #2d3748',
                        padding: '12px 16px',
                        fontSize: '0.85rem',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={heatmapData.paymentNoteMap[customer]}
                    >
                      {heatmapData.paymentNoteMap[customer]}
                    </TableCell>
                    {heatmapData.services.map((service) => {
                      const count = heatmapData.data[customer]?.[service] || 0;
                      return (
                        <TableCell
                          key={`${customer}-${service}`}
                          align="center"
                          sx={{
                            color: count > 0 ? '#f3f4f6' : '#6b7280',
                            bgcolor: getHeatmapColor(count, maxValue),
                            borderBottom: '1px solid #2d3748',
                            padding: '12px 16px',
                            fontWeight: count > 0 ? 600 : 400,
                            fontSize: count > 0 ? '0.95rem' : '0.85rem',
                            transition: 'all 0.2s ease',
                            cursor: count > 0 ? 'pointer' : 'default',
                            '&:hover': count > 0 ? {
                              bgcolor: `rgba(59, 130, 246, ${Math.min((count / maxValue) * 0.9 + 0.3, 1)})`,
                              transform: 'scale(1.05)',
                              boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)'
                            } : {}
                          }}
                        >
                          {count > 0 ? count : '-'}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      </Box>
    </LocalizationProvider>
  );
};

export default DailyReport;

