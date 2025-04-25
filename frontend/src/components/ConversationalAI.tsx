import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import { Box, Button, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import axios from 'axios';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Link, useNavigate } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';

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

const ConversationalAI = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = sessionStorage.getItem('chatMessages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [schema, setSchema] = useState<any>(null);
  const navigate = useNavigate();
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [error, setError] = useState('');

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
      const searchQuery = new URLSearchParams({
        datasetId: import.meta.env.VITE_DATASET_ID,
        tableId: import.meta.env.VITE_TABLE_ID,
      })
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/schema?${searchQuery}`);
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

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const currentInputMessage = inputMessage.trim();

    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: currentInputMessage
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      // Import OpenAI configs
      const { OPENAI_SQL_CONFIG, OPENAI_INSIGHTS_CONFIG } = await import('../config/openai');

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

      // Check query types
      const isCustomerQuery = currentInputMessage.toLowerCase().includes('customer') &&
        (currentInputMessage.toLowerCase().includes('top') ||
          currentInputMessage.toLowerCase().includes('most') ||
          currentInputMessage.toLowerCase().includes('frequent') ||
          currentInputMessage.toLowerCase().includes('loyal'));

      const isServiceQuery = currentInputMessage.toLowerCase().includes('service') &&
        (currentInputMessage.toLowerCase().includes('top') ||
          currentInputMessage.toLowerCase().includes('most') ||
          currentInputMessage.toLowerCase().includes('popular') ||
          currentInputMessage.toLowerCase().includes('frequent'));

      const isTherapistQuery = (currentInputMessage.toLowerCase().includes('therapist') ||
        currentInputMessage.toLowerCase().includes('practitioner') ||
        currentInputMessage.toLowerCase().includes('employee') ||
        currentInputMessage.toLowerCase().includes('staff')) &&
        (currentInputMessage.toLowerCase().includes('top') ||
          currentInputMessage.toLowerCase().includes('most') ||
          currentInputMessage.toLowerCase().includes('busy') ||
          currentInputMessage.toLowerCase().includes('active'));

      let queryResults = [];
      let sqlQuery = '';
      let queryResponse: any = null;

      // Get SQL from OpenAI
      const translationResponse = await axios.post(OPENAI_SQL_CONFIG.apiEndpoint, {
        model: OPENAI_SQL_CONFIG.model,
        messages: [
          ...OPENAI_SQL_CONFIG.formatMessages(schemaContext, currentInputMessage, currentClinic.code)
        ]
      }, axiosConfig);

      if (!translationResponse.data.choices?.[0]?.message?.content) {
        throw new Error('No response received from OpenAI API. Please try again.');
      }

      const response = translationResponse.data.choices[0].message.content;
      
      // Debug: Log the full OpenAI response to help diagnose issues
      console.log('Full OpenAI response:', response);
      
      const sqlMatch = response.match(/\[SQL Query\]([\s\S]*?)\[End SQL\]/i);

      if (!sqlMatch) {
        console.error('Failed to extract SQL query. Full response:', response);
        throw new Error('Invalid response format: Missing SQL query. Please try rephrasing your question.');
      }

      sqlQuery = sqlMatch[1].trim()
        .replace(/FROM\s+QueenDataView/gi, 'FROM great_time.MainDataView')
        .replace(/FROM\s+LemonDataView/gi, 'FROM great_time.MainDataView')
        .replace(/FROM\s+great_time\.QueenDataView/gi, 'FROM great_time.MainDataView');

      // Debug: Log the SQL query to console
      console.log('Generated SQL Query:', sqlQuery);

      // Execute the query
      try {
        queryResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`, { query: sqlQuery }, axiosConfig);
        if (!queryResponse.data.success) {
          // Debug: Log SQL query error details to help debugging
          console.error('SQL Query Error:', queryResponse.data.error, 'SQL Query:', sqlQuery);
          
          // Try to extract the most relevant part of the error message
          let errorMessage = queryResponse.data.error || 'Failed to execute SQL query';
          
          // Check for common BigQuery error patterns
          if (errorMessage.includes('Syntax error') || errorMessage.includes('Unrecognized name')) {
            // For syntax errors, provide a more helpful message
            errorMessage = `SQL syntax error: ${errorMessage}`;
          } else if (errorMessage.includes('No such field') || errorMessage.includes('not found')) {
            // For column-not-found errors, suggest schema issue
            errorMessage = `Column not found: ${errorMessage}. Please check the schema.`;
          } else if (errorMessage.includes('resources exceeded')) {
            // For resource limits
            errorMessage = 'Query too complex: BigQuery resource limits exceeded.';
          }
          
          throw new Error(errorMessage);
        }
        queryResults = queryResponse.data.data;
      } catch (error: any) {
        // Handle network errors or other exceptions
        console.error('API Error:', error.message || 'Unknown error');
        console.error('Failed SQL Query:', sqlQuery);
        
        // Provide more detailed error message to the user
        let userErrorMessage = 'Failed to execute query. ';
        
        if (error.response?.status === 400) {
          userErrorMessage += 'The query contains errors.';
        } else if (error.response?.status === 500) {
          userErrorMessage += 'Server error occurred.';
        } else if (error.code === 'ECONNABORTED') {
          userErrorMessage += 'Query timed out.';
        } else if (error.code === 'ERR_NETWORK') {
          userErrorMessage += 'Network error. Please check your connection.';
        } else {
          userErrorMessage += error.message || 'Unknown error';
        }
        
        // Add user-friendly error message
        const assistantMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: `Error: ${userErrorMessage} Please try again or rephrase your question.`
        };
        setMessages(prev => [...prev, assistantMessage]);
        return;
      }

      // Get insights from OpenAI
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

      // Default response with insights
      const assistantMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: responseContent,
        data: {
          sql: sqlQuery,
          results: queryResults,
          showTable: true
        }
      };

      setMessages(prev => [...prev, assistantMessage]);
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

  // Add useEffect to scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
                    className={`w-full md:max-w-[75%] p-4 rounded-2xl ${message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                      }`}
                  >
                    {message.content}
                    {message.data?.showTable && message.data.results && message.data.results.length > 0 && (
                      <TableContainer component={Paper} sx={{ bgcolor: 'transparent', maxWidth: '100%', mb: 2, overflowX: 'auto', mt: 2 }}>
                        <Table size="small" sx={{ minWidth: '650px' }}>
                          <TableHead>
                            <TableRow>
                              {Object.keys(message.data.results[0]).map((key) => {
                                console.log(`Column header: ${key}`);
                                return (
                                <TableCell
                                  key={key}
                                  sx={{
                                    fontWeight: 'bold',
                                    color: '#fff',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                                  }}
                                >
                                  {key}
                                </TableCell>
                              )})}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {message.data.results.map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                {Object.values(row).map((cell: any, cellIndex) => {
                                  const cellKey = Object.keys(row)[cellIndex];
                                  console.log(`Cell key: ${cellKey}, Cell value:`, cell);
                                  
                                  // Customer name cell
                                  const isCustomerName = cellKey.toLowerCase().includes('name') && 
                                    cellKey.toLowerCase().includes('customer');
                                  
                                  // Service name cell
                                  const isServiceName = cellKey.toLowerCase().includes('name') && 
                                    cellKey.toLowerCase().includes('service');
                                    
                                  // Therapist name cell - expanded detection
                                  const isTherapistName = 
                                    // Key-based detection (expanded)
                                    cellKey.toLowerCase() === 'practitionername' ||
                                    cellKey.toLowerCase() === 'therapist' ||
                                    cellKey.toLowerCase() === 'practitioner' ||
                                    cellKey.toLowerCase() === 'therapist_name' ||
                                    cellKey.toLowerCase() === 'practitioner_name' ||
                                    (cellKey.toLowerCase().includes('name') && 
                                      (cellKey.toLowerCase().includes('therapist') || 
                                       cellKey.toLowerCase().includes('staff') || 
                                       cellKey.toLowerCase().includes('practitioner') || 
                                       cellKey.toLowerCase().includes('provider')));
                                  
                                  if (isTherapistName) {
                                    console.log(`✅ Therapist cell detected: ${cellKey} = ${cell}`);
                                  }
                                  
                                  // Check if we have phone data for customer
                                  const phoneIndex = Object.keys(row).findIndex(key => 
                                    key.toLowerCase().includes('phone'));
                                  
                                  // Create clickable cell for customer names
                                  if (isCustomerName && phoneIndex >= 0) {
                                    const phoneNumber = Object.values(row)[phoneIndex];
                                    return (
                                      <TableCell
                                        key={cellIndex}
                                        sx={{
                                          color: '#2196f3',
                                          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                                          cursor: 'pointer',
                                          '&:hover': {
                                            textDecoration: 'underline'
                                          }
                                        }}
                                        onClick={() => {
                                          if (phoneNumber) {
                                            navigate(`/customers/${encodeURIComponent(phoneNumber.toString())}`);
                                          }
                                        }}
                                      >
                                        {typeof cell === 'object' && cell !== null
                                          ? (cell.value?.toString() || 'N/A')
                                          : (cell?.toString() || 'N/A')}
                                      </TableCell>
                                    );
                                  }
                                  
                                  // Create clickable cell for service names
                                  if (isServiceName) {
                                    return (
                                      <TableCell
                                        key={cellIndex}
                                        sx={{
                                          color: '#4caf50',
                                          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                                          cursor: 'pointer',
                                          '&:hover': {
                                            textDecoration: 'underline'
                                          }
                                        }}
                                        onClick={() => {
                                          const serviceName = typeof cell === 'object' && cell !== null
                                            ? cell.value?.toString()
                                            : cell?.toString();
                                          if (serviceName) {
                                            navigate(`/services/${encodeURIComponent(serviceName)}`);
                                          }
                                        }}
                                      >
                                        {typeof cell === 'object' && cell !== null
                                          ? (cell.value?.toString() || 'N/A')
                                          : (cell?.toString() || 'N/A')}
                                      </TableCell>
                                    );
                                  }
                                  
                                  // Create clickable cell for therapist names
                                  if (isTherapistName) {
                                    console.log(`Therapist cell detected: Key=${cellKey}, Value=${cell}`);
                                    return (
                                      <TableCell
                                        key={cellIndex}
                                        sx={{
                                          color: '#ff9800',
                                          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                                          cursor: 'pointer',
                                          '&:hover': {
                                            textDecoration: 'underline'
                                          }
                                        }}
                                        onClick={() => {
                                          const therapistName = typeof cell === 'object' && cell !== null
                                            ? cell.value?.toString()
                                            : cell?.toString();
                                          console.log(`Navigating to therapist: ${therapistName}`);
                                          if (therapistName) {
                                            navigate(`/therapists/${encodeURIComponent(therapistName)}`);
                                          }
                                        }}
                                      >
                                        {typeof cell === 'object' && cell !== null
                                          ? (cell.value?.toString() || 'N/A')
                                          : (cell?.toString() || 'N/A')}
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
                    )}
                    
                    {/* Chart rendering */}
                    {message.data?.chartData && message.data.chartType === 'bar' && (
                      <div className="mt-4 bg-gray-900 p-3 rounded-lg">
                        <Bar
                          data={message.data.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: true,
                            scales: {
                              y: {
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                              },
                              x: {
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                              }
                            },
                            plugins: {
                              legend: {
                                position: 'top',
                                labels: { color: 'rgba(255, 255, 255, 0.8)' }
                              },
                              tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: 'white',
                                bodyColor: 'white'
                              }
                            }
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Customer Interactions Chart */}
                    {message.data?.customerInteractions && message.data.customerInteractions.names.length > 0 && (
                      <div className="mt-4 bg-gray-900 p-3 rounded-lg">
                        <Bar
                          data={{
                            labels: message.data.customerInteractions.names,
                            datasets: [
                              {
                                label: 'Revenue',
                                data: message.data.customerInteractions.values,
                                backgroundColor: 'rgba(54, 162, 235, 0.8)',
                                borderColor: 'rgba(54, 162, 235, 1)',
                                borderWidth: 1
                              }
                            ]
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: true,
                            scales: {
                              y: {
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                              },
                              x: {
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                              }
                            },
                            plugins: {
                              legend: {
                                position: 'top',
                                labels: { color: 'rgba(255, 255, 255, 0.8)' }
                              },
                              tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: 'white',
                                bodyColor: 'white'
                              }
                            }
                          }}
                        />
                      </div>
                    )}
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
                if (e.key === 'Enter' && !loading) {
                  handleSendMessage();
                }
              }}
              placeholder={loading ? "Thinking..." : "Ask data..."}
              className="w-full p-3 pl-5 pr-12 rounded-full bg-[#2a2a2a] border border-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-500"
              disabled={loading}
            />
            {loading ? (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center text-gray-400">
                <span className="animate-pulse mr-1">Thinking...</span>
                <CircularProgress size={16} className="text-gray-400" />
              </div>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={loading || !inputMessage.trim()}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500 disabled:text-gray-600 hover:text-blue-400 transition-colors"
              >
                <SendIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationalAI; 