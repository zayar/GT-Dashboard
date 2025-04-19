import React, { useState } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import StorageIcon from '@mui/icons-material/Storage';

// Base URL for MySQL service
const MYSQL_API_URL = 'http://localhost:5004/api/mysql';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mysql-tabpanel-${index}`}
      aria-labelledby={`mysql-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const MySQLConnector: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  });
  const [connected, setConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setConnectionConfig({
      ...connectionConfig,
      [name]: name === 'port' ? parseInt(value, 10) || '' : value,
    });
  };

  const handleSelectTable = (e: React.ChangeEvent<{ value: unknown }>) => {
    setSelectedTable(e.target.value as string);
    setSqlQuery(`SELECT * FROM ${e.target.value} LIMIT 100;`);
  };

  const testConnection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${MYSQL_API_URL}/connect`, connectionConfig);
      setConnected(true);
      setConnectionInfo(response.data.data);
      fetchTables();
    } catch (err: any) {
      setConnected(false);
      setError(err.response?.data?.message || err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const response = await axios.post(`${MYSQL_API_URL}/tables`, connectionConfig);
      setTables(response.data.data || []);
    } catch (err: any) {
      console.error('Error fetching tables:', err);
    }
  };

  const executeQuery = async () => {
    if (!sqlQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${MYSQL_API_URL}/query`, {
        ...connectionConfig,
        query: sqlQuery,
      });
      setQueryResults(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Query execution failed');
      setQueryResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper elevation={3} sx={{ p: 3, mt: 4, mb: 4 }}>
        <Box display="flex" alignItems="center" mb={2}>
          <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h5" component="h2">
            MySQL Connector
          </Typography>
        </Box>
        
        <Divider sx={{ mb: 3 }} />
        
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="mysql connector tabs"
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab label="Connection" />
          <Tab label="Query" disabled={!connected} />
        </Tabs>
        
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={8}>
                  <TextField
                    label="Host"
                    name="host"
                    value={connectionConfig.host}
                    onChange={handleInputChange}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Port"
                    name="port"
                    type="number"
                    value={connectionConfig.port}
                    onChange={handleInputChange}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Database"
                    name="database"
                    value={connectionConfig.database}
                    onChange={handleInputChange}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Username"
                    name="user"
                    value={connectionConfig.user}
                    onChange={handleInputChange}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Password"
                    name="password"
                    type="password"
                    value={connectionConfig.password}
                    onChange={handleInputChange}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={testConnection}
                    disabled={loading}
                    sx={{ mt: 1 }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Test Connection'}
                  </Button>
                </Grid>
              </Grid>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Paper 
                elevation={1} 
                sx={{ 
                  p: 2, 
                  height: '100%',
                  backgroundColor: 'background.default' 
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Connection Status
                </Typography>
                
                {connected ? (
                  <Box display="flex" alignItems="center" color="success.main">
                    <CheckCircleIcon sx={{ mr: 1 }} />
                    <Typography>Connected</Typography>
                  </Box>
                ) : (
                  <Box display="flex" alignItems="center" color="text.secondary">
                    <ErrorIcon sx={{ mr: 1, color: error ? 'error.main' : 'text.secondary' }} />
                    <Typography color={error ? 'error' : 'text.secondary'}>
                      {error || 'Not Connected'}
                    </Typography>
                  </Box>
                )}
                
                {connectionInfo && (
                  <Box mt={2}>
                    <Typography variant="body2">
                      <strong>Host:</strong> {connectionInfo.host}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Database:</strong> {connectionInfo.database}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Version:</strong> {connectionInfo.version}
                    </Typography>
                  </Box>
                )}
                
                {tables.length > 0 && (
                  <Box mt={2}>
                    <Typography variant="body2">
                      <strong>Tables:</strong> {tables.length}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>
        
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="table-select-label">Select Table</InputLabel>
                <Select
                  labelId="table-select-label"
                  value={selectedTable}
                  onChange={handleSelectTable as any}
                  label="Select Table"
                >
                  {tables.map((table) => (
                    <MenuItem key={table} value={table}>
                      {table}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <TextField
                label="SQL Query"
                multiline
                rows={4}
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                fullWidth
                variant="outlined"
                sx={{ mb: 2 }}
              />
              
              <Button
                variant="contained"
                color="primary"
                onClick={executeQuery}
                disabled={loading || !sqlQuery.trim()}
              >
                {loading ? <CircularProgress size={24} /> : 'Execute Query'}
              </Button>
            </Grid>
            
            {error && (
              <Grid item xs={12}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    backgroundColor: 'error.light',
                    color: 'error.contrastText',
                  }}
                >
                  <Typography>{error}</Typography>
                </Paper>
              </Grid>
            )}
            
            {queryResults.length > 0 && (
              <Grid item xs={12}>
                <Paper elevation={1} sx={{ p: 2, overflowX: 'auto' }}>
                  <Typography variant="h6" gutterBottom>
                    Results ({queryResults.length} rows)
                  </Typography>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {Object.keys(queryResults[0]).map((key) => (
                            <th
                              key={key}
                              style={{
                                padding: '8px',
                                borderBottom: '1px solid #ddd',
                                textAlign: 'left',
                              }}
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResults.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {Object.values(row).map((value: any, cellIndex) => (
                              <td
                                key={cellIndex}
                                style={{
                                  padding: '8px',
                                  borderBottom: '1px solid #ddd',
                                }}
                              >
                                {value === null
                                  ? 'NULL'
                                  : typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Paper>
              </Grid>
            )}
          </Grid>
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default MySQLConnector; 