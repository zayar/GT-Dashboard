import React, { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import { Box, Container, TextField, Button, Typography, Paper, CircularProgress, IconButton, Avatar, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonIcon from '@mui/icons-material/Person';
import { SUGGESTION_PROMPTS } from './config/suggestions';
import axios from 'axios';
import RefreshIcon from '@mui/icons-material/Refresh';
import { BrowserRouter as Router, Routes, Route, useNavigate, Link, Navigate } from 'react-router-dom';
import CustomerDetails from './components/CustomerDetails';
import ServiceDetails from './components/ServiceDetails';
import ServicesTable from './components/ServicesTable';
import TherapistDetails from './components/TherapistDetails';
import TherapistList from './components/TherapistList';
import HelperList from './components/HelperList';
import HelperDetails from './components/HelperDetails';
import CommissionPage from './components/CommissionPage';
import DailyTreatmentReport from './components/DailyTreatmentReport';
import PaymentDetails from './components/PaymentDetails';
import BankingDetails from './components/BankingDetails';
import Appointments from './components/Appointments';
import CheckInOut from './components/CheckInOut';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar';
import CustomersTable from './components/CustomersTable';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import CustomerBehaviorReport from './components/CustomerBehaviorReport';
import ServiceBehaviorReport from './components/ServiceBehaviorReport';
import ClinicSelector from './components/ClinicSelector';
import { ClinicProvider, useClinic, Clinic } from './contexts/ClinicContext';
import SalesBySalesPerson from './components/SalesBySalesPerson';
import Login from './components/Login';
import Commission from './components/Commission';
import { format } from 'date-fns';
import Transaction from './components/Transaction';
import Wallet from './components/Wallet';
import WalletTransactionDetails from './components/WalletTransactionDetails';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface QueryResult {
  [key: string]: any;
}

interface HeatmapData {
  days: string[];
  hours: string[];
  values: {
    [key: string]: {
      [key: string]: number;
    };
  };
}

interface MessageData {
  sql: string;
  results: any[];
  chartData?: any;
  chartType?: string;
  showTable?: boolean;
  isHeatmap?: boolean;
  heatmapData?: HeatmapData;
  isReminderSuggestion?: boolean;
  isPaymentSuggestion?: boolean;
  isBankingSuggestion?: boolean;
  tableData?: {
    headers: string[];
    rows: any[][];
    type?: 'customer' | 'service' | 'therapist' | 'appointment';
  };
  entities?: {
    type: string;
    name: string;
    startIndex: number;
    endIndex: number;
  }[];
  customerInteractions?: {
    names: string[];
    values: number[];
  };
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  data?: MessageData;
}

const LazyDataTable = lazy(() => import('./components/DataTable'));

const MainChat = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = sessionStorage.getItem('chatMessages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [schema, setSchema] = useState<any>(null);
  const navigate = useNavigate();
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [_error, setError] = useState('');
  const [chartData, setChartData] = useState<any>(null);

  const { currentClinic } = useClinic();
  
  // Store the previous clinic to detect changes
  const previousClinicRef = useRef<string | null>(null);
  
  // Clear chat history when clinic changes
  useEffect(() => {
    // Skip on first render when previousClinicRef is null
    if (previousClinicRef.current !== null && currentClinic?.code !== previousClinicRef.current) {
      // Clinic has changed, clear the chat history
      setMessages([]);
      sessionStorage.removeItem('chatMessages');
    }
    
    // Update the ref with current clinic code
    previousClinicRef.current = currentClinic?.code || null;
  }, [currentClinic?.code]);

  const fetchSchema = async () => {
    try {
      setSchemaLoading(true);
      const response = await axios.get('http://localhost:3000/api/schema');
      if (response.data.success) {
        setSchema(response.data.data);
      } else {
        throw new Error('Failed to fetch schema data');
      }
    } catch (error) {
      console.error('Failed to fetch schema:', error);
      setError('Failed to fetch database schema. Please ensure the backend service is running and properly configured.');
      setSchema(null);
    } finally {
      setSchemaLoading(false);
    }
  };

  useEffect(() => {
    fetchSchema();
  }, []);

  // Add reminder keywords detection
  const checkForReminderKeywords = (message: string) => {
    const reminderKeywords = ['reminder', 'followup', 'follow-up', 'follow up', 'remind'];
    const normalizedMessage = message.toLowerCase();
    return reminderKeywords.some(keyword => normalizedMessage.includes(keyword));
  };

  // Add payment keywords detection
  const checkForPaymentKeywords = (message: string) => {
    const paymentKeywords = [
      'payment record', 'payment records', 
      'payment report', 'payment details',
      'payment', 'invoice', 'invoices',
      'payment history', 'financial record',
      'bill', 'bills', 'billing',
      'wallet'
    ];
    // Only match 'bank' or 'transaction' if the message doesn't contain banking keywords
    const secondaryKeywords = ['bank', 'transaction', 'transactions'];
    
    const normalizedMessage = message.toLowerCase();
    
    // First check if it contains any banking keywords to avoid conflict
    const hasBankingKeyword = checkForBankingKeywords(normalizedMessage);
    if (hasBankingKeyword) return false;
    
    // Then check for primary payment keywords
    const hasPrimaryKeyword = paymentKeywords.some(keyword => normalizedMessage.includes(keyword));
    
    // Only check secondary keywords if no banking keyword is found
    const hasSecondaryKeyword = secondaryKeywords.some(keyword => normalizedMessage.includes(keyword));
    
    return hasPrimaryKeyword || hasSecondaryKeyword;
  };

  // Add banking keywords detection
  const checkForBankingKeywords = (message: string) => {
    const bankingKeywords = [
      'banking', 'banking details', 'banking summary',
      'bank details', 'bank records', 'bank summary',
      'payment breakdown', 'payment summary',
      'payment methods', 'payment method summary',
      'transaction summary', 'financial summary',
      'banking transaction', 'banking transactions'
    ];
    const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : message;
    return bankingKeywords.some(keyword => normalizedMessage.includes(keyword));
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const currentInputMessage = inputMessage.trim();
    
    // Check if user is asking about reminders
    if (checkForReminderKeywords(currentInputMessage)) {
      // ... existing code for reminders ...
    }
    
    // Check if user is asking about payments
    if (checkForPaymentKeywords(currentInputMessage)) {
      // ... existing code for payments ...
    }
    
    // Check if user is asking about banking info
    if (checkForBankingKeywords(currentInputMessage)) {
      // ... existing code for banking ...
    }
    
    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: currentInputMessage
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');

    try {
      // Import OpenAI configs
      const { OPENAI_SQL_CONFIG, OPENAI_INSIGHTS_CONFIG } = await import('./config/openai');
      
      // Check if currentClinic exists
      if (!currentClinic || !currentClinic.code) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: 'Please select a clinic first before asking questions. This ensures your data is properly filtered.'
        };
        setMessages(prev => [...prev, assistantMessage]);
        return;
      }
      
      // Define axios config for API requests
      const axiosConfig = {
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      };

      // Get schema for context
      const schemaContext = schema && schema.fields 
        ? schema.fields.map((field: { name: string; type: string }) => `${field.name} (${field.type})`).join('\n')
        : '';
        
      // Check if this is a customer query that should display results as a table
      const isCustomerQuery = currentInputMessage.toLowerCase().includes('customer') && 
                            (currentInputMessage.toLowerCase().includes('top') || 
                             currentInputMessage.toLowerCase().includes('most') ||
                             currentInputMessage.toLowerCase().includes('frequent') ||
                             currentInputMessage.toLowerCase().includes('loyal'));
                             
      // Check if this is a service query that should display results as a table
      const isServiceQuery = currentInputMessage.toLowerCase().includes('service') && 
                           (currentInputMessage.toLowerCase().includes('top') || 
                            currentInputMessage.toLowerCase().includes('most') ||
                            currentInputMessage.toLowerCase().includes('popular') ||
                            currentInputMessage.toLowerCase().includes('frequent'));
      
      // Check if this is a therapist/practitioner/employee query that should display results as a table
      const isTherapistQuery = (currentInputMessage.toLowerCase().includes('therapist') || 
                              currentInputMessage.toLowerCase().includes('practitioner') || 
                              currentInputMessage.toLowerCase().includes('employee') ||
                              currentInputMessage.toLowerCase().includes('staff') ||
                              currentInputMessage.toLowerCase().includes('theripish') || // Handle common typo
                              currentInputMessage.toLowerCase().includes('therapis') ||  // Handle partial word
                              currentInputMessage.toLowerCase().includes('thera')) &&    // Handle abbreviated form
                             (currentInputMessage.toLowerCase().includes('top') || 
                              currentInputMessage.toLowerCase().includes('most') ||
                              currentInputMessage.toLowerCase().includes('busy') ||
                              currentInputMessage.toLowerCase().includes('active') ||
                              currentInputMessage.toLowerCase().includes('productive') ||
                              currentInputMessage.toLowerCase().includes('popular') ||
                              currentInputMessage.toLowerCase().includes('service') ||
                              currentInputMessage.toLowerCase().includes('treatment') ||
                              currentInputMessage.toLowerCase().includes('list') ||
                              currentInputMessage.toLowerCase().includes('show') ||
                              currentInputMessage.toLowerCase().includes('who') ||
                              currentInputMessage.toLowerCase().includes('this month') ||
                              currentInputMessage.toLowerCase().includes('month'));
      
      // Check if this is an appointment query that should display results as a table
      const isAppointmentQuery = currentInputMessage.toLowerCase().includes('appointment') &&
                              (currentInputMessage.toLowerCase().includes('today') ||
                               currentInputMessage.toLowerCase().includes('this week') ||
                               currentInputMessage.toLowerCase().includes('week') ||
                               currentInputMessage.toLowerCase().includes('this month') ||
                               currentInputMessage.toLowerCase().includes('month') ||
                               currentInputMessage.toLowerCase().includes('tomorrow') ||
                               currentInputMessage.toLowerCase().includes('schedule') ||
                               currentInputMessage.toLowerCase().includes('upcoming') ||
                               currentInputMessage.toLowerCase().includes('list'));
      
      let queryResults = [];
      
      // Check if user is asking about busiest time
      const isBusiestTimeQuery = currentInputMessage.toLowerCase().includes("busiest") || 
                              currentInputMessage.toLowerCase().includes("busy times") || 
                              currentInputMessage.toLowerCase().includes("when are you busy") ||
                              currentInputMessage.toLowerCase().includes("peak hours");
      
      let sqlQuery = '';
  
      if (isBusiestTimeQuery) {
        // Use a specific SQL query for busiest time slots with Myanmar time
        sqlQuery = `
WITH HourlyBookings AS (
  SELECT
    CAST(FORMAT_DATE('%A', DATE(CheckInTime)) AS STRING) as day_of_week,
    CAST(EXTRACT(HOUR FROM CheckInTime) AS STRING) as hour_of_day,
    COUNT(*) as booking_count
  FROM great_time.MainDataView
  WHERE 
    CheckInTime IS NOT NULL
    AND EXTRACT(HOUR FROM CheckInTime) BETWEEN 9 AND 19
    AND ClinicCode = '${currentClinic.code}'
  GROUP BY day_of_week, hour_of_day
)
SELECT
  day_of_week,
  hour_of_day,
  booking_count
FROM HourlyBookings
ORDER BY 
  CASE day_of_week
    WHEN 'Monday' THEN 1
    WHEN 'Tuesday' THEN 2
    WHEN 'Wednesday' THEN 3
    WHEN 'Thursday' THEN 4
    WHEN 'Friday' THEN 5
    WHEN 'Saturday' THEN 6
    WHEN 'Sunday' THEN 7
  END,
  CAST(hour_of_day AS INT64);`;
      } else {
        // Handle other queries as before
        const translationResponse = await axios.post(OPENAI_SQL_CONFIG.apiEndpoint, {
          model: OPENAI_SQL_CONFIG.model,
          messages: [
            ...OPENAI_SQL_CONFIG.formatMessages(schemaContext, currentInputMessage, currentClinic.code),
            {
              role: "system",
              content: `When generating SQL queries:
              1. For timestamp fields and comparisons:
                 - Always use TIMESTAMP() for timestamp literals
                 - Always cast string dates to TIMESTAMP type before comparison
                 - Example: TIMESTAMP(field) >= TIMESTAMP('2024-01-01')
              
              2. For date/time formatting:
                 - Use FORMAT_TIMESTAMP() for timestamp fields
                 - Use FORMAT_DATE() for date fields
                 - Examples:
                   - FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', field)
                   - FORMAT_DATE('%Y-%m-%d', DATE(field))
              
              3. For date/time extraction and arithmetic:
                 - Use EXTRACT() for getting specific parts
                 - Use TIMESTAMP_ADD() or TIMESTAMP_SUB() for calculations
                 - Examples:
                   - EXTRACT(HOUR FROM field)
                   - TIMESTAMP_ADD(field, INTERVAL 1 DAY)
              
              4. For timezone handling:
                 - Be careful with parentheses when using timezone operations
                 - Correct syntax: TIMESTAMP(field) AT TIME ZONE 'timezone'
                 - Another correct syntax: (field AT TIME ZONE 'timezone')
                 - Avoid: TIMESTAMP(field AT TIME ZONE 'timezone') - this is incorrect syntax
              
              5. For date/time aggregations:
                 - Group by formatted timestamps for consistency
                 - Example: GROUP BY FORMAT_TIMESTAMP('%Y-%m-%d', field)
              
              6. NEVER compare TIMESTAMP with DATETIME directly
                 - Always convert to same type first
                 - Use CAST(field AS TIMESTAMP) if needed
                 
              7. For customer-related queries:
                 - Always include CustomerName/customer_name, count/interactions, and PhoneNumber/phone in the SELECT clause
                 - Order by count/interactions DESC
                 - Use LIMIT to restrict to top N results
                 
              8. For service-related queries:
                 - Always include ServiceName/service_name, count/instances in the SELECT clause
                 - Order by count/instances DESC
                 - Use LIMIT to restrict to top N results
                 
              9. For therapist/practitioner/employee-related queries:
                 - Always include PractitionerName/practitioner_name/therapist_name, count/services/treatments in the SELECT clause
                 - Order by count/services/treatments DESC
                 - Use LIMIT to restrict to top N results
               
              10. ALWAYS include this filter in your WHERE clause: AND ClinicCode = '${currentClinic.code}'
                  - This is mandatory for security and data isolation
                  - Never omit this filter from any query`
            }
          ]
        }, axiosConfig);
  
        if (!translationResponse.data.choices?.[0]?.message?.content) {
          throw new Error('No response received from OpenAI API. Please try again.');
        }
  
        const response = translationResponse.data.choices[0].message.content;
        const sqlMatch = response.match(/\[SQL Query\]([\s\S]*?)\[End SQL\]/i);
  
        if (!sqlMatch) {
          throw new Error('Invalid response format: Missing SQL query. Please try rephrasing your question.');
        }
  
        sqlQuery = sqlMatch[1].trim()
          .replace(/FROM\s+QueenDataView/gi, 'FROM great_time.MainDataView')
          .replace(/FROM\s+LemonDataView/gi, 'FROM great_time.MainDataView')
          .replace(/FROM\s+great_time\.QueenDataView/gi, 'FROM great_time.MainDataView');
        
        // Ensure the clinic code filter is present in all queries
        if (!sqlQuery.includes(`ClinicCode = '${currentClinic.code}'`) && !sqlQuery.includes(`clinic_code = '${currentClinic.code}'`) && !sqlQuery.includes(`clinicCode = '${currentClinic.code}'`)) {
          // First, try to determine the correct column name to use
          let clinicColumnName = 'ClinicCode';
          
          // Check if the query is using the MainDataView
          if (sqlQuery.includes('great_time.MainDataView')) {
            // For MainDataView, check if the query schema includes alternate column names
            if (schema && schema.fields) {
              // Look for possible clinic code column variants in the schema
              const possibleColumns = ['ClinicCode', 'clinic_code', 'clinicCode', 'clinic_id', 'clinicId'];
              for (const col of possibleColumns) {
                if (schema.fields.some((field: any) => field.name === col)) {
                  clinicColumnName = col;
                  break;
                }
              }
            }
          }
          
          // Now use the determined column name for filtering
          if (sqlQuery.includes('WHERE')) {
            sqlQuery = sqlQuery.replace(/WHERE/i, `WHERE ${clinicColumnName} = '${currentClinic.code}' AND`);
          } else {
            // If there's no WHERE clause, add one
            sqlQuery = sqlQuery + ` WHERE ${clinicColumnName} = '${currentClinic.code}'`;
          }
        }
      }
  
        const queryResponse = await axios.post('http://localhost:3000/api/query', { query: sqlQuery }, axiosConfig);
        if (!queryResponse.data.success) {
          throw new Error(queryResponse.data.error || 'Failed to execute SQL query');
        }
        queryResults = queryResponse.data.data;
  
      // Check if this is a response with rich data (e.g. customer interactions data)
      if (queryResponse.data.richData) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: queryResponse.data.message || 'Here are the results:',
          data: {
            sql: sqlQuery,
            results: queryResults,
            ...queryResponse.data.richData
          }
        };
        setMessages(prev => [...prev, assistantMessage]);
        return;
      }
  
      // Prepare heatmap data for busiest time slots query
      if (isBusiestTimeQuery) {
        const heatmapData = prepareHeatmapData(queryResults);
        const assistantMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: 'Here\'s a heatmap showing the busiest time slots by day. Darker shades indicate higher booking counts.',
          data: {
            sql: sqlQuery,
            results: queryResults,
            isHeatmap: true,
            heatmapData: heatmapData,
            showTable: false
          }
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Handle other queries with special case for customer and service queries
        const showGraph = currentInputMessage.toLowerCase().includes('chart') || 
                        currentInputMessage.toLowerCase().includes('graph') || 
                        currentInputMessage.toLowerCase().includes('show me with chart') || 
                        currentInputMessage.includes('visualize') ||
                        isCustomerQuery || // Always show chart for customer queries
                        isServiceQuery ||  // Always show chart for service queries
                        isTherapistQuery;  // Always show chart for therapist queries
  
      const chartData = showGraph ? {
        ...prepareChartData(queryResults),
        datasets: prepareChartData(queryResults).datasets.map(dataset => ({
          ...dataset,
          backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e', '#6366f1', '#14b8a6', '#d946ef', '#84cc16'],
          borderColor: '#3b82f6'
        }))
      } : null;
  
        const insightsResponse = await axios.post(OPENAI_INSIGHTS_CONFIG.apiEndpoint, {
        model: OPENAI_INSIGHTS_CONFIG.model,
          messages: OPENAI_INSIGHTS_CONFIG.formatMessages(JSON.stringify(queryResults), currentInputMessage)
      }, axiosConfig);
  
      if (!insightsResponse.data.choices?.[0]?.message?.content) {
        throw new Error('No insights received from OpenAI API. Please try again.');
      }
  
      const insightsContent = insightsResponse.data.choices[0].message.content;
      const businessInsightsMatch = insightsContent.match(/\[Response\]([\s\S]*?)\[End Response\]/i);
      
      if (!businessInsightsMatch) {
        throw new Error('Invalid insights format. Please try again.');
      }
  
      const responseContent = businessInsightsMatch[1].trim();
  
        // For customer or service queries, attempt to structure the data for table display
        let tableData = undefined;
        
        // Try to format customer data as table regardless of backend rich data
        if (isCustomerQuery && queryResults.length > 0) {
          try {
            // Find name field from various possible column names
            const nameField = Object.keys(queryResults[0]).find(key => 
              ['customer_name', 'name', 'customer', 'CustomerName'].includes(key));
              
            // Find count field from various possible column names
            const countField = Object.keys(queryResults[0]).find(key => 
              ['count', 'interactions', 'booking_count', 'frequency', 'CountBooking'].includes(key) || 
              typeof queryResults[0][key] === 'number');
              
            // Find phone field if available
            const phoneField = Object.keys(queryResults[0]).find(key => 
              ['phone', 'phoneNumber', 'PhoneNumber', 'phone_number', 'CustomerPhoneNumber'].includes(key));
            
            if (nameField && countField) {
              // Set up headers based on available fields
              const headers = ['Rank', 'Customer Name', 'Interactions'];
              if (phoneField) headers.push('Phone Number');
              
              // Create rows with available data
              const rows = queryResults.map((item: any, index: number) => {
                const row = [
                  index + 1, 
                  item[nameField],
                  item[countField]
                ];
                if (phoneField) row.push(item[phoneField] || 'N/A');
                return row;
              });
              
              // Set the table data for the response
              tableData = { headers, rows };
              
              // Set up customer interactions data for charts
              const customerInteractions = {
                names: queryResults.map((item: any) => item[nameField]),
                values: queryResults.map((item: any) => item[countField])
              };
              
              // Create the assistant message with structured data
              const assistantMessage: Message = {
                id: Date.now().toString(),
                type: 'assistant',
                content: responseContent,
                data: {
                  sql: sqlQuery,
                  results: queryResults,
                  chartData: chartData,
                  chartType: 'bar',
                  showTable: true,
                  tableData: {
                    ...tableData,
                    type: 'customer'
                  },
                  customerInteractions: customerInteractions
                }
              };
              
              setMessages(prev => [...prev, assistantMessage]);
              return;
            }
          } catch (error) {
            console.error('Error formatting customer data:', error);
            // Fall back to normal response handling
          }
        }
        
        // Try to format service data as table
        if (isServiceQuery && queryResults.length > 0) {
          try {
            // Find name field from various possible column names
            const nameField = Object.keys(queryResults[0]).find(key => 
              ['service_name', 'name', 'service', 'ServiceName'].includes(key));
              
            // Find count field from various possible column names
            const countField = Object.keys(queryResults[0]).find(key => 
              ['count', 'instances', 'booking_count', 'frequency'].includes(key) || 
              typeof queryResults[0][key] === 'number');
            
            if (nameField && countField) {
              // Create headers and rows for service data
              const headers = ['Rank', 'Service Name', 'Instances'];
              const rows = queryResults.map((item: any, index: number) => [
                index + 1, 
                item[nameField],
                item[countField]
              ]);
              
              // Set the table data for the response
              tableData = { headers, rows };
              
              // Create the assistant message with structured data
              const assistantMessage: Message = {
                id: Date.now().toString(),
                type: 'assistant',
                content: responseContent,
                data: {
                  sql: sqlQuery,
                  results: queryResults,
                  chartData: chartData,
                  chartType: 'bar',
                  showTable: true,
                  tableData: {
                    ...tableData,
                    type: 'service'
                  }
                }
              };
              
              setMessages(prev => [...prev, assistantMessage]);
              return;
            }
          } catch (error) {
            console.error('Error formatting service data:', error);
            // Fall back to normal response handling
          }
        }

        // Try to format therapist data as table
        if (isTherapistQuery && queryResults.length > 0) {
          try {
            // Find name field from various possible column names
            const nameField = Object.keys(queryResults[0]).find(key => 
              ['practitioner_name', 'therapist_name', 'name', 'practitioner', 'therapist', 'PractitionerName'].includes(key));
              
            // Find count field from various possible column names
            const countField = Object.keys(queryResults[0]).find(key => 
              ['count', 'services', 'appointments', 'treatments', 'sessions', 'service_count'].includes(key) || 
              typeof queryResults[0][key] === 'number');
            
            if (nameField && countField) {
              // Create headers and rows for therapist data
              const headers = ['Rank', 'Therapist Name', 'Services Performed'];
              const rows = queryResults.map((item: any, index: number) => [
                index + 1, 
                item[nameField],
                item[countField]
              ]);
              
              // Set the table data for the response
              tableData = { headers, rows };
              
              // Set up chart data for visualizing therapist performance
              const therapistPerformance = {
                names: queryResults.map((item: any) => item[nameField]),
                values: queryResults.map((item: any) => item[countField])
              };
              
              // Create the assistant message with structured data
              const assistantMessage: Message = {
                id: Date.now().toString(),
                type: 'assistant',
                content: responseContent,
                data: {
                  sql: sqlQuery,
                  results: queryResults,
                  chartData: chartData,
                  chartType: 'bar',
                  showTable: true,
                  tableData: {
                    ...tableData,
                    type: 'therapist'
                  },
                  customerInteractions: therapistPerformance // Reuse the existing structure
                }
              };
              
              setMessages(prev => [...prev, assistantMessage]);
              return;
            }
          } catch (error) {
            console.error('Error formatting therapist data:', error);
            // Fall back to normal response handling
          }
        }

        // Try to format appointment data as table
        if (isAppointmentQuery && queryResults.length > 0) {
          try {
            // Find relevant fields from various possible column names
            const customerField = Object.keys(queryResults[0]).find(key => 
              ['customer_name', 'CustomerName', 'name', 'customer'].includes(key));
            
            const serviceField = Object.keys(queryResults[0]).find(key => 
              ['service_name', 'ServiceName', 'service', 'treatment'].includes(key));
            
            // Remove time field handling since it's causing display issues
            // const timeField = Object.keys(queryResults[0]).find(key => 
            //   ['check_in_time', 'CheckInTime', 'appointment_time', 'time', 'date', 'schedule_time'].includes(key));
            
            const therapistField = Object.keys(queryResults[0]).find(key => 
              ['practitioner_name', 'PractitionerName', 'therapist_name', 'therapist', 'staff'].includes(key));
            
            if (customerField && serviceField) {
              // Create headers based on available fields - exclude Time
              const headers = ['#', 'Customer Name', 'Service'];
              // Don't include the time field that causes issues
              // if (timeField) headers.push('Time');
              if (therapistField) headers.push('Therapist');
              
              // Create rows with available data
              const rows = queryResults.map((item: any, index: number) => {
                const row = [
                  index + 1, 
                  item[customerField],
                  item[serviceField]
                ];
                
                // Skip time field that causes issues
                // if (timeField) {
                //   try {
                //     const date = new Date(item[timeField]);
                //     row.push(format(date, 'MMM dd, yyyy h:mm a'));
                //   } catch (e) {
                //     row.push(item[timeField]?.toString() || 'N/A');
                //   }
                // }
                
                // Add therapist if available
                if (therapistField) row.push(item[therapistField]?.toString() || 'N/A');
                
                return row;
              });
              
              // Set the table data for the response
              const tableData = { headers, rows };
              
              // Create the assistant message with structured data
              const assistantMessage: Message = {
                id: Date.now().toString(),
                type: 'assistant',
                content: responseContent,
                data: {
                  sql: sqlQuery,
                  results: queryResults,
                  showTable: true,
                  tableData: {
                    ...tableData,
                    type: 'appointment'
                  }
                }
              };
              
              setMessages(prev => [...prev, assistantMessage]);
              return;
            }
          } catch (error) {
            console.error('Error formatting appointment data:', error);
            // Fall back to normal response handling
          }
        }

        // Default response handling for other queries
      const assistantMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: responseContent,
        data: {
          sql: sqlQuery,
          results: queryResults,
          chartData: showGraph ? chartData : undefined,
          chartType: showGraph ? 'bar' : undefined,
          showTable: true
        }
      };
  
      setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (err: any) {
      console.error('Error:', err);
      let errorMessage = '';
      
      if (err.response?.status === 404) {
        errorMessage = 'OpenAI API endpoint not found. Please check your API configuration.';
      } else if (err.response?.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI API key configuration.';
      } else if (err.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = 'Could not connect to the API. Please check your internet connection.';
      } else {
        errorMessage = err.response?.data?.error
          || err.response?.data?.message
          || err.message
          || 'Unknown error occurred';
      }
      
      setError(errorMessage);
  
      const errorAssistantMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: `Error: ${errorMessage}`
      };
  
      setMessages(prev => [...prev, errorAssistantMessage]);
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = useMemo(() => (data: any[]) => {
    if (!data || !Array.isArray(data) || data.length === 0) return { labels: [], datasets: [{ data: [] }] };

    let chartData = [];
    {
      const numericKey = Object.keys(data[0]).find(key => typeof data[0][key] === 'number');
      const labelKey = Object.keys(data[0]).find(key => typeof data[0][key] === 'string');

      if (!numericKey || !labelKey) return { labels: [], datasets: [{ data: [] }] };

      chartData = data.map(item => ({
        name: item[labelKey]?.toString() || 'Unknown',
        value: Number(item[numericKey]) || 0
      }));
    }

    return {
      labels: chartData.map(item => item.name),
      datasets: [{
        data: chartData.map(item => item.value)
      }]
    };
  }, []);

  // Update the prepareHeatmapData function to only show business hours
  const prepareHeatmapData = (data: any[]) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hours = Array.from({ length: 11 }, (_, i) => (i + 9).toString()); // 9:00 to 19:00
    
    // Initialize the heatmap data structure
    const heatmapData = {
      days,
      hours,
      values: {} as { [key: string]: { [key: string]: number } }
    };

    // Initialize all slots with 0
    days.forEach(day => {
      heatmapData.values[day] = {};
      hours.forEach(hour => {
        heatmapData.values[day][hour] = 0;
      });
    });

    // Fill in the actual values
    data.forEach((item: any) => {
      if (item.day_of_week && item.hour_of_day !== undefined) {
        const hour = parseInt(item.hour_of_day);
        if (hour >= 9 && hour <= 19) {
          heatmapData.values[item.day_of_week][item.hour_of_day] = item.booking_count;
        }
      }
    });

    return heatmapData;
  };

  useEffect(() => {
    sessionStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  const handleRefresh = () => {
    const welcomeMessage = {
      id: 'welcome',
      type: 'assistant' as const,
      content: 'Hi there! 👋 I\'m here to help answer your questions and uncover insights. What would you like to know?'
    };
    setMessages([welcomeMessage]);
    setInputMessage('');
    setLoading(false);
    setError('');
    fetchSchema();
  };

  // Function to parse structured text into table data
  const parseStructuredTextToTable = (content: string): { 
    headers: string[], 
    rows: any[][], 
    type?: 'customer' | 'service' | 'therapist' 
  } | null => {
    // Determine if this is about customers or services
    const isCustomerData = content.toLowerCase().includes('customer') && 
                          (content.toLowerCase().includes('interaction') || content.toLowerCase().includes('engagement'));
    const isServiceData = content.toLowerCase().includes('service') && 
                         (content.toLowerCase().includes('instances') || content.toLowerCase().includes('performed'));
    // Improve therapist data detection
    const isTherapistData = (content.toLowerCase().includes('therapist') || 
                            content.toLowerCase().includes('practitioner') || 
                            content.toLowerCase().includes('employee')) && 
                            (content.toLowerCase().includes('services') || 
                             content.toLowerCase().includes('treatments') || 
                             content.toLowerCase().includes('appointments') ||
                             content.toLowerCase().includes('performed'));
    
    // If neither customer nor service data, try a generic approach
    if (!isCustomerData && !isServiceData && !isTherapistData) {
      // Check if it's a numbered list with values
      const lines = content.split('\n');
      const itemPattern = /(\d+)\.\s+\*\*([^:]+)\*\*:?\s+(\d+)\s+(\w+)/;
      const items: any[][] = [];
      let headers: string[] = ['#', 'Item', 'Count', 'Unit'];
      
      lines.forEach(line => {
        const match = line.match(itemPattern);
        if (match) {
          // Try to determine type based on content
          const itemText = line.toLowerCase();
          let type: 'customer' | 'service' | 'therapist' | undefined = undefined;
          
          if (itemText.includes('customer') || itemText.includes('client')) {
            type = 'customer';
          } else if (itemText.includes('service') || itemText.includes('treatment')) {
            type = 'service';
          } else if (itemText.includes('therapist') || itemText.includes('practitioner') || itemText.includes('employee')) {
            type = 'therapist';
          }
          
          items.push([
            parseInt(match[1]), // Item number
            match[2].trim(),    // Item name
            parseInt(match[3]), // Value
            match[4].trim(),    // Unit (instances, etc.)
            type                // Add type for later processing
          ]);
        }
      });
      
      if (items.length > 0) {
        // Try to determine overall type if items have consistent types
        const types = items.map(item => item[4]).filter(Boolean);
        let overallType = undefined;
        
        if (types.length > 0) {
          // Use the most common type
          const typeCounts: Record<string, number> = {};
          types.forEach(type => {
            typeCounts[type as string] = (typeCounts[type as string] || 0) + 1;
          });
          
          overallType = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])[0][0] as 'customer' | 'service' | 'therapist';
        }
        
        return {
          headers: headers.slice(0, 3), // Remove Unit column
          rows: items.map(item => item.slice(0, 3)), // Remove Unit and type
          type: overallType
        };
      }
    }
    
    // Define headers based on data type
    let headers: string[];
    
    if (isCustomerData) {
      headers = ['#', 'Customer', 'Interactions'];
    } else if (isServiceData) {
      headers = ['#', 'Service', 'Instances'];
    } else {
      // Must be therapist data
      headers = ['#', 'Therapist', 'Services'];
    }
    
    // Parse the text to extract data rows
    const rows: any[][] = [];
    
    if (isCustomerData) {
      // Example: "1. **Soe Moe Thu (C)** - 15 interactions 2. **Khaing Khaing Win** - 10 interactions"
      const customerDataRegex = /(\d+)\.\s+\*\*(.+?)\*\*\s*-\s*(\d+)\s*interactions/g;
      let match;
      
      while ((match = customerDataRegex.exec(content)) !== null) {
        rows.push([
          parseInt(match[1]), // Rank
          match[2].trim(),    // Customer name
          parseInt(match[3])  // Interactions count
        ]);
      }
      
      // If we didn't match anything, try alternative format
      if (rows.length === 0) {
        const altRegex = /(\d+)\.\s+(.+?)\s*-\s*(\d+)\s*interactions/g;
        while ((match = altRegex.exec(content)) !== null) {
          rows.push([
            parseInt(match[1]), // Rank
            match[2].trim(),    // Customer name
            parseInt(match[3])  // Interactions count
          ]);
        }
      }
      
      return rows.length > 0 ? { headers, rows, type: 'customer' } : null;
    }
    
    if (isServiceData) {
      // Example: "1. **Whitening Laser**: 323 instances 2. **Hair Removal Underarm**: 220 instances"
      const serviceDataRegex = /(\d+)\.\s+\*\*(.+?)\*\*:?\s+(\d+)\s+instances/g;
      let match;
      
      while ((match = serviceDataRegex.exec(content)) !== null) {
        rows.push([
          parseInt(match[1]), // Rank
          match[2].trim(),    // Service name
          parseInt(match[3])  // Instances count
        ]);
      }
      
      // If we didn't match anything, try alternative format
      if (rows.length === 0) {
        const altRegex = /(\d+)\.\s+(.+?):\s+(\d+)\s+instances/g;
        while ((match = altRegex.exec(content)) !== null) {
          rows.push([
            parseInt(match[1]), // Rank
            match[2].trim(),    // Service name
            parseInt(match[3])  // Instances count
          ]);
        }
      }
      
      return rows.length > 0 ? { headers, rows, type: 'service' } : null;
    }
    
    if (isTherapistData) {
      // Try to match therapist data patterns
      // Example: "1. **John Smith** - 45 services" or "1. **Jane Doe**: 32 treatments"
      const therapistDataRegex = /(\d+)\.\s+\*\*(.+?)\*\*[:\s-]+(\d+)\s+(services|treatments|appointments)/ig;
      let match;
      
      while ((match = therapistDataRegex.exec(content)) !== null) {
        rows.push([
          parseInt(match[1]), // Rank
          match[2].trim(),    // Therapist name
          parseInt(match[3])  // Services/treatments count
        ]);
      }
      
      // If we didn't match anything, try alternative format
      if (rows.length === 0) {
        const altRegex = /(\d+)\.\s+(.+?)[:\s-]+(\d+)\s+(services|treatments|appointments)/ig;
        while ((match = altRegex.exec(content)) !== null) {
          rows.push([
            parseInt(match[1]), // Rank
            match[2].trim(),    // Therapist name
            parseInt(match[3])  // Services/treatments count
          ]);
        }
      }
      
      // If we still didn't match anything, try a more generic approach
      if (rows.length === 0) {
        const genericRegex = /(\d+)\.\s+(?:\*\*)?([^*:]+?)(?:\*\*)?[:\s-]+(\d+)/ig;
        while ((match = genericRegex.exec(content)) !== null) {
          rows.push([
            parseInt(match[1]), // Rank
            match[2].trim(),    // Therapist name
            parseInt(match[3])  // Count
          ]);
        }
      }
      
      return rows.length > 0 ? { headers, rows, type: 'therapist' } : null;
    }
    
    return null;
  };

  const renderMessageContent = (content: string, data?: MessageData) => {
    // Check if the message contains customer interactions data for visualization
    if (data?.customerInteractions) {
      const { names, values } = data.customerInteractions;
      
      // Create chart data
      const chartData = {
        labels: names,
        datasets: [
          {
            label: 'Interactions',
            data: values,
            backgroundColor: 'rgba(26, 115, 232, 0.8)',
            borderColor: 'rgba(26, 115, 232, 1)',
            borderWidth: 1,
          },
        ],
      };
      
      // Create table data if not already provided
      const customerTableData = data.tableData || {
        headers: ['Rank', 'Customer Name', 'Interactions'],
        rows: names.map((name: string, i: number) => [i + 1, name, values[i]])
      };
      
      return (
        <Box sx={{ width: '100%', mb: 2, maxWidth: '100%' }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {content}
          </Typography>
          
          {/* Table View */}
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', maxWidth: '100%', mb: 3, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: '650px' }}>
              <TableHead>
                <TableRow>
                  {customerTableData.headers.map((header: string, index: number) => (
                    <TableCell 
                      key={index} 
                      sx={{ 
                        fontWeight: 'bold', 
                        color: '#fff', 
                        borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {customerTableData.rows.map((row: any[], rowIndex: number) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell: any, cellIndex: number) => {
                      // Check if this cell might contain a name that should be clickable
                      const isCustomerName = cellIndex === 1 || customerTableData.headers[cellIndex]?.toLowerCase().includes('customer');
                      const isServiceName = customerTableData.headers[cellIndex]?.toLowerCase().includes('service');
                      const isTherapistName = customerTableData.headers[cellIndex]?.toLowerCase().includes('therapist');
                      
                      if (isCustomerName || isServiceName || isTherapistName) {
                        let path = '';
                        // Modified to use phone number for customer navigation
                        if (isCustomerName) {
                          // Check if we have phone data in this row
                          const phoneIndex = customerTableData.headers.findIndex(header => 
                            header.toLowerCase().includes('phone'));
                          
                          // If we have a phone column, use it for navigation
                          if (phoneIndex >= 0 && customerTableData.rows[rowIndex][phoneIndex]) {
                            path = `/customers/${encodeURIComponent(customerTableData.rows[rowIndex][phoneIndex])}`;
                          } else {
                            // Fallback to using name 
                            path = `/customers/${encodeURIComponent(cell)}`;
                          }
                        }
                        if (isServiceName) path = `/services/${encodeURIComponent(cell)}`;
                        if (isTherapistName) path = `/therapists/${encodeURIComponent(cell)}`;
                        
                        return (
                          <TableCell 
                            key={cellIndex}
                            sx={{ 
                              color: '#fff', 
                              borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                            }}
                          >
                            <Link
                              to={path}
                              style={{
                                color: '#3b82f6',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'inline-block',
                                position: 'relative'
                              }}
                              title="Click to view details"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                            >
                              {cell}
                            </Link>
                          </TableCell>
                        );
                      }
                      
                      return (
                        <TableCell 
                          key={cellIndex}
                          sx={{ 
                            color: '#fff', 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                          }}
                        >
                          {cell}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* Chart View */}
          <Box sx={{ height: '300px', width: '100%', maxWidth: '100%', mb: 2 }}>
            <Bar
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                    labels: {
                      color: '#ffffff'
                    }
                  },
                  title: { display: false }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { color: '#ffffff' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                  },
                  x: {
                    ticks: { color: '#ffffff' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                  }
                }
              }}
            />
          </Box>
        </Box>
      );
    }
  
    // Check if the message includes table data 
    if (data?.tableData) {
      const tableData = data.tableData;
      return (
        <Box sx={{ width: '100%', mb: 2, maxWidth: '100%' }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {content}
          </Typography>
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', maxWidth: '100%', mb: 2, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: '650px' }}>
              <TableHead>
                <TableRow>
                  {tableData.headers.map((header: string, index: number) => (
                    <TableCell 
                      key={index} 
                      sx={{ 
                        fontWeight: 'bold', 
                        color: '#fff', 
                        borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableData.rows.map((row: any[], rowIndex: number) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell: any, cellIndex: number) => {
                      // Check if this cell might contain a name that should be clickable
                      const isCustomerName = cellIndex === 1 || tableData.headers[cellIndex]?.toLowerCase().includes('customer');
                      const isServiceName = tableData.headers[cellIndex]?.toLowerCase().includes('service');
                      const isTherapistName = tableData.headers[cellIndex]?.toLowerCase().includes('therapist');
                      
                      // Additional checks for therapist names in generic tables
                      const headerText = tableData.headers[cellIndex]?.toLowerCase() || '';
                      const isGenericNameColumn = headerText === 'item' || headerText === 'name' || cellIndex === 1;
                      
                      // Check message content for therapist keywords
                      const messageContent = content.toLowerCase();
                      const isTherapistRelated = messageContent.includes('therapist') || 
                                              messageContent.includes('practitioner') || 
                                              messageContent.includes('employee') ||
                                              messageContent.includes('theripish');
                      
                      // Determine if this should be linked as a therapist
                      const shouldLinkAsTherapist = isTherapistName || 
                                                 (isGenericNameColumn && isTherapistRelated && typeof cell === 'string');
                      
                      if (isCustomerName || isServiceName || shouldLinkAsTherapist) {
                        let path = '';
                        if (isCustomerName) {
                          // Check if we have phone data in this row
                          const phoneIndex = tableData.headers.findIndex(header => 
                            header.toLowerCase().includes('phone'));
                          
                          // If we have a phone column, use it for navigation
                          if (phoneIndex >= 0 && row[phoneIndex]) {
                            path = `/customers/${encodeURIComponent(row[phoneIndex])}`;
                          } else {
                            // Fallback to using name 
                            path = `/customers/${encodeURIComponent(cell)}`;
                          }
                        }
                        if (isServiceName) path = `/services/${encodeURIComponent(cell)}`;
                        if (isTherapistName || shouldLinkAsTherapist) path = `/therapists/${encodeURIComponent(cell)}`;
                        
                        return (
                          <TableCell 
                            key={cellIndex}
                            sx={{ 
                              color: '#fff', 
                              borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                            }}
                          >
                            <Link
                              to={path}
                              style={{
                                color: '#3b82f6',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'inline-block',
                                position: 'relative'
                              }}
                              title="Click to view details"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                            >
                              {cell}
                            </Link>
                          </TableCell>
                        );
                      }
                      
                      return (
                        <TableCell 
                          key={cellIndex}
                          sx={{ 
                            color: '#fff', 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                          }}
                        >
                          {typeof cell === 'object' && cell !== null 
                            ? (cell.value?.toString() || 'N/A') 
                            : (cell?.toString() || 'N/A')}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      );
    }

    // NEW: Check if the text content appears to be structured data and convert to table
    // Detect if the content contains numbered lists or data points that might represent a table
    if (content.includes('1.') && 
        (content.includes('instances') || 
         content.includes('interactions') || 
         content.toLowerCase().includes('top') || 
         content.includes(':')) && 
        !data?.isHeatmap) {
      
      try {
        // First, attempt to extract table data from the text
        let parsedTableData = parseStructuredTextToTable(content);
        
        if (parsedTableData && parsedTableData.rows.length > 0) {
          return (
            <Box sx={{ width: '100%', mb: 2, maxWidth: '100%' }}>
              {/* Render the text content first */}
              <Typography variant="body1" sx={{ mb: 3 }}>
                {content}
              </Typography>
              
              {/* Then render the parsed table view */}
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold', color: '#3b82f6' }}>
                Table View
              </Typography>
              <TableContainer component={Paper} sx={{ bgcolor: 'transparent', maxWidth: '100%', mb: 3, overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: '650px' }}>
                  <TableHead>
                    <TableRow>
                      {parsedTableData.headers.map((header: string, index: number) => (
                      <TableCell 
                        key={index} 
                        sx={{ 
                          fontWeight: 'bold', 
                          color: '#fff', 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                        }}
                      >
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedTableData.rows.map((row: any[], rowIndex: number) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell: any, cellIndex: number) => {
                        // For the first column (item name), make it clickable if it's a service or customer
                        if (cellIndex === 1 && typeof cell === 'string') {
                          const isCustomerName = parsedTableData.type === 'customer';
                          const isServiceName = parsedTableData.type === 'service';
                          const isTherapistName = parsedTableData.type === 'therapist';
                          
                          // If type is not explicitly set, try to determine from headers or content
                          const headerText = parsedTableData.headers[cellIndex]?.toLowerCase() || '';
                          const isTherapistHeader = headerText.includes('therapist') || 
                                                  headerText.includes('practitioner') || 
                                                  headerText.includes('employee') ||
                                                  headerText === 'item'; // Generic "Item" might be a therapist name
                          
                          // Check if this looks like a therapist query from the content
                          const messageContent = content.toLowerCase();
                          const containsTherapistKeywords = messageContent.includes('therapist') || 
                                                           messageContent.includes('practitioner') || 
                                                           messageContent.includes('employee') ||
                                                           messageContent.includes('theripish'); // Handle typo
                          
                          // Use either explicit type or implicit detection
                          const shouldLinkAsTherapist = isTherapistName || 
                                                       (isTherapistHeader && containsTherapistKeywords);
                          
                          if (isCustomerName || isServiceName || shouldLinkAsTherapist) {
                            let path = '';
                            if (isCustomerName) {
                              // Check if we have phone data in this row
                              const phoneIndex = parsedTableData.headers.findIndex(header => 
                                header.toLowerCase().includes('phone'));
                                
                              // If we have a phone column, use it for navigation
                              if (phoneIndex >= 0 && row[phoneIndex]) {
                                path = `/customers/${encodeURIComponent(row[phoneIndex])}`;
                              } else {
                                // Fallback to using name 
                                path = `/customers/${encodeURIComponent(cell)}`;
                              }
                            }
                            if (isServiceName) path = `/services/${encodeURIComponent(cell)}`;
                            if (isTherapistName || shouldLinkAsTherapist) path = `/therapists/${encodeURIComponent(cell)}`;
                            
                            return (
                              <TableCell 
                                key={cellIndex}
                                sx={{ 
                                  color: '#fff', 
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                                }}
                              >
                                <Link
                                  to={path}
                                  style={{
                                    color: '#3b82f6',
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    display: 'inline-block',
                                    position: 'relative'
                                  }}
                                  title="Click to view details"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.textDecoration = 'underline';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.textDecoration = 'none';
                                  }}
                                >
                                  {cell}
                                </Link>
                              </TableCell>
                            );
                          }
                        }
                        
                        return (
                          <TableCell 
                            key={cellIndex}
                            sx={{ 
                              color: '#fff', 
                              borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                            }}
                          >
                            {typeof cell === 'object' && cell !== null 
                              ? (cell.value?.toString() || 'N/A') 
                              : (cell?.toString() || 'N/A')}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            </Box>
          );
        }
      } catch (error) {
        console.error('Error parsing structured text:', error);
        // Fall back to regular text display
      }
    }

    // Check if the message has entity names that should be clickable
    if (data?.entities) {
      const parts = [];
      let lastIndex = 0;
      
      // Sort entities by their position to ensure proper rendering
      const sortedEntities = [...data.entities].sort((a, b) => a.startIndex - b.startIndex);
      
      for (const entity of sortedEntities) {
        // Add text before the entity
        if (entity.startIndex > lastIndex) {
          parts.push(content.slice(lastIndex, entity.startIndex));
        }
        
        // Add the clickable entity
        let path = '';
        if (entity.type === 'customer') {
          // For customer entities, we can't easily know the phone number here
          // Since these are directly extracted from text, we'll stick with the direct navigation
          path = `/customers/${encodeURIComponent(entity.name)}`;
        }
        if (entity.type === 'service') path = `/services/${encodeURIComponent(entity.name)}`;
        if (entity.type === 'therapist') path = `/therapists/${encodeURIComponent(entity.name)}`;
        
        parts.push(
          <Link
            key={entity.startIndex}
            to={path}
            style={{
              color: '#1a73e8',
              textDecoration: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
            }}
          >
            {entity.name}
          </Link>
        );
        
        lastIndex = entity.endIndex;
      }
      
      // Add any remaining text
      if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
      }
      
      return parts.length > 0 ? parts : content;
    }

    // Check if the message is about daily report
    if (content.toLowerCase().includes('daily report') || content.toLowerCase().includes('daily treatment')) {
      return (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            You can view the Daily Treatment Report here:
          </Typography>
          <Link 
            to="/daily-treatment"
            style={{ textDecoration: 'none' }}
          >
            <Button
              variant="contained"
              sx={{
                bgcolor: '#1a73e8',
                '&:hover': {
                  bgcolor: '#1557b0'
                }
              }}
            >
              Go to Daily Treatment Report
            </Button>
          </Link>
        </Box>
      );
    }

    if (data?.isReminderSuggestion) {
      return (
        <Box>
          <Typography sx={{ color: '#fff', mb: 1 }}>{content}</Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/reminders')}
            sx={{
              bgcolor: '#1a73e8',
              color: '#fff',
              '&:hover': {
                bgcolor: '#1557b0'
              }
            }}
          >
            Go to Reminders Page
          </Button>
        </Box>
      );
    }

    if (data?.isPaymentSuggestion) {
      return (
        <Box>
          <Typography sx={{ color: '#000000', mb: 1 }}>{content}</Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/payment-details')}
            sx={{
              bgcolor: '#1a73e8',
              color: '#fff',
              '&:hover': {
                bgcolor: '#1557b0'
              }
            }}
          >
            Go to Payment Details
          </Button>
        </Box>
      );
    }

    if (data?.isBankingSuggestion) {
      return (
        <Box>
          <Typography sx={{ color: '#000000', mb: 1 }}>{content}</Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/banking-details')}
            sx={{
              bgcolor: '#1a73e8',
              color: '#fff',
              '&:hover': {
                bgcolor: '#1557b0'
              }
            }}
          >
            Go to Banking Details
          </Button>
        </Box>
      );
    }
    // Regular expression to match markdown links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }

      // Add the link component
      parts.push(
        <Link
          key={match.index}
          to={match[2]}
          style={{
            color: '#1a73e8',
            textDecoration: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          {match[1]}
        </Link>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  // Define suggestion cards for the homepage
  const suggestionCards = [
    {
      title: 'Help me sound like an expert for an upcoming trip',
      icon: '🌐',
      color: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500'
    },
    {
      title: 'Outline an logical sales pitch for a new product',
      icon: '📊',
      color: 'bg-amber-500/10',
      iconColor: 'text-amber-500'
    },
    {
      title: 'Help me get organized with a list of 10 tips',
      icon: '📝',
      color: 'bg-blue-500/10',
      iconColor: 'text-blue-500'
    },
    {
      title: 'Write code for a specific task, including edge cases',
      icon: '💻',
      color: 'bg-purple-500/10',
      iconColor: 'text-purple-500'
    }
  ];

  // Show welcome screen if no messages
  const showWelcomeScreen = messages.length === 0;

  const renderChart = () => {
    if (!chartData) return null;
                              
                              return (
      <div className="h-64 bg-gray-800 p-4 rounded-lg">
        <Bar
        data={chartData}
                              options={{
                                responsive: true,
            maintainAspectRatio: false,
                                plugins: {
                                  legend: { display: false },
                                  title: { display: false }
                                },
                                scales: {
                                  y: {
                                    beginAtZero: true,
                ticks: { color: '#ffffff' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                                  },
                                  x: {
                ticks: { color: '#ffffff' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                                  }
                                }
                              }}
                            />
      </div>
    );
  };

  // Add useEffect to scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="h-full w-full flex flex-col bg-[#121826] relative">
      {/* Main scrollable area with bottom padding for the fixed input box */}
      <div className="flex-1 overflow-auto" style={{ paddingBottom: '70px' }}>
        {messages.length === 0 ? (
          // Empty state with greeting and suggestions
          <div className="h-full w-full flex flex-col items-center justify-center p-6">
            {/* Centered greeting */}
            <div className="text-center mb-8 mt-4 w-full max-w-5xl mx-auto">
              <h1 className="text-4xl font-bold mb-2">
                <span className="text-blue-400">Hello,</span>
                <span className="text-purple-400"> there</span>
              </h1>
              <p className="text-gray-300 text-xl">How can I help you today?</p>
            </div>
            
            {/* Suggestion cards */}
            <div className="w-full max-w-5xl mx-auto space-y-3 px-4">
              <button 
                onClick={() => {
                  setInputMessage("Top 10 customers this month");
                  handleSendMessage();
                }}
                className="w-full bg-[#222222] p-4 rounded-lg text-left hover:bg-[#2a2a2a] transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-white font-medium">Top 10 customers this month</span>
                  <span className="text-gray-400 text-sm mt-1">Show top 10 customers by revenue this month</span>
                </div>
              </button>
              
              <button 
                onClick={() => {
                  setInputMessage("Top 10 services this month");
                  handleSendMessage();
                }}
                className="w-full bg-[#222222] p-4 rounded-lg text-left hover:bg-[#2a2a2a] transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-white font-medium">Top 10 services this month</span>
                  <span className="text-gray-400 text-sm mt-1">Analyze our top services for this month...</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          // Messages view
          <div className="w-full max-w-5xl mx-auto px-4 py-4">
            {/* Mobile header */}
            <div className="sticky top-0 z-10 bg-[#121826] mb-4 py-2 md:hidden w-full border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium text-white">Chat</h2>
                <button
                  onClick={handleRefresh}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg flex items-center text-sm transition-colors"
                >
                  <RefreshIcon fontSize="small" className="mr-1" />
                  New Chat
                </button>
              </div>
            </div>

            {/* Desktop New Chat button */}
            <div className="hidden md:flex justify-end mb-4">
              <button
                onClick={handleRefresh}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
              >
                <RefreshIcon className="mr-2" />
                New Chat
              </button>
            </div>

            {/* Messages */}
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4 w-full`}
                >
                  {message.type === 'assistant' && (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-white text-sm">AI</span>
                    </div>
                  )}
                  <div
                    className={`w-full md:max-w-[75%] p-4 rounded-2xl ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    {renderMessageContent(message.content, message.data)}
                  </div>
                  {message.type === 'user' && (
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center ml-3 flex-shrink-0">
                      <span className="text-white text-sm">You</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
        )}
      </div>

      {/* Input box - fixed at bottom of screen */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-700 bg-[#1a202c] z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="relative">
            <input
              type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
              placeholder="Ask data..."
              className="w-full p-3 pl-5 pr-12 rounded-full bg-[#2a2a2a] border border-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
              disabled={loading}
            />
            <button
            onClick={handleSendMessage}
              disabled={loading || !inputMessage.trim()}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500 disabled:text-gray-600 hover:text-blue-400 transition-colors"
            >
              {loading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <SendIcon />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-[#1a202c] p-4 rounded-lg shadow-lg flex items-center">
            <CircularProgress size={24} className="text-blue-500 mr-3" />
            <span className="text-gray-200">Processing your request...</span>
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('isAuthenticated') === 'true';
  });

  const handleLogin = (authStatus: boolean) => {
    setIsAuthenticated(authStatus);
    sessionStorage.setItem('isAuthenticated', String(authStatus));
  };

  return (
    <ClinicProvider>
      <Router>
        <Toaster position="top-right" toastOptions={{
          style: {
            background: '#151f38',
            color: '#f3f4f6',
            border: '1px solid rgba(148, 163, 184, 0.12)'
          },
        }} />
        {!isAuthenticated ? (
          <Login onLogin={handleLogin} />
        ) : (
          <div className="flex h-screen bg-[#101729] text-[#f3f4f6]">
            <AppContent />
          </div>
        )}
      </Router>
    </ClinicProvider>
  );
};

const AppContent = () => {
  const navigate = useNavigate();
  const { 
    currentClinic, 
    setCurrentClinic, 
    isUsingFallbackData, 
    setIsUsingFallbackData,
    availableClinics,
    setAvailableClinics
  } = useClinic();
  
  const handleClinicChange = (clinic: any) => {
    // If clinic is different, update it
    if (clinic.code !== currentClinic?.code) {
      setCurrentClinic(clinic);
      
      // Store the new clinic selection in localStorage
      localStorage.setItem('selectedClinicId', clinic.id);
      
      // Clear chat history in sessionStorage when changing clinics
      sessionStorage.removeItem('chatMessages');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    window.location.reload();
  };
  
  return (
    <>
      <Sidebar onLogout={handleLogout} />
      <div className="flex-1 h-full overflow-auto">
        <div className="bg-[#101729] border-b border-[rgba(148,163,184,0.12)] px-4 py-2">
          <ClinicSelector 
            onClinicChange={handleClinicChange} 
          />
        </div>
        
        {/* Main content area */}
        <div className="flex-1 overflow-auto bg-[#101729]">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/conversational-ai" element={<div className="h-full"><MainChat /></div>} />
            <Route path="/customers" element={<CustomersTable />} />
            <Route path="/customers/:name" element={<CustomerDetails />} />
            <Route path="/services" element={<ServicesTable />} />
            <Route path="/services/:name" element={<ServiceDetails />} />
            <Route path="/therapists" element={<TherapistList />} />
            <Route path="/therapists/:name" element={<TherapistDetails />} />
            <Route path="/helpers" element={<HelperList />} />
            <Route path="/helpers/:name" element={<HelperDetails />} />
            <Route path="/commission" element={<Commission />} />
            <Route path="/daily-treatment" element={<DailyTreatmentReport />} />
            <Route path="/payment-details" element={<PaymentDetails />} />
            <Route path="/banking-details" element={<BankingDetails />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/customer-behavior-report" element={<CustomerBehaviorReport />} />
            <Route path="/service-behavior-report" element={<ServiceBehaviorReport />} />
            <Route path="/sales-by-sales-person" element={<SalesBySalesPerson />} />
            <Route path="/check-in-out" element={<CheckInOut />} />
            <Route path="/transactions" element={<Transaction />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallet-transactions/:ownerName" element={<WalletTransactionDetails />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </>
  );
};

export default App;
