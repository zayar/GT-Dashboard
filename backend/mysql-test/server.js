const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Import mysql2/promise

const app = express();
const PORT = process.env.PORT || 5003;

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());

// MySQL connection pool (will be initialized on connect)
let pool = null;

// Database configuration
const dbConfig = {
  host: '34.69.63.226',
  user: 'gtadmin',
  password: 'gtapp456$%^',
  database: 'great_time',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Routes
app.get('/', (req, res) => {
  res.send('MySQL Test Server is running');
});

// MySQL connect route (more robust)
app.post('/api/mysql-test/connect', async (req, res) => {
  try {
    // Check if pool exists and is valid (try getting a connection)
    if (pool) {
      let connection;
      try {
        connection = await pool.getConnection();
        await connection.ping(); // Check if connection is alive
        connection.release();
        console.log('Existing connection pool is valid.');
        return res.json({
          success: true,
          message: `Already connected to database: ${dbConfig.database}`,
          data: { serverTime: new Date().toISOString() }
        });
      } catch (poolError) {
        console.warn('Existing pool seems invalid, creating a new one:', poolError.message);
        // Attempt to close the invalid pool gracefully, ignore errors
        try {
          await pool.end();
        } catch (endError) {
           console.warn('Error closing invalid pool:', endError.message);
        }
        pool = null; // Reset pool
      }
    }

    // If pool is null or was invalid, create a new one
    console.log('Creating new connection pool...');
    pool = mysql.createPool(dbConfig);

    // Test the new connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('Successfully created and connected to database:', dbConfig.database);

    res.json({
      success: true,
      message: `Successfully connected to database: ${dbConfig.database}`,
      data: { serverTime: new Date().toISOString() }
    });

  } catch (error) {
    console.error('Database connection error during connect:', error);
    pool = null; // Reset pool on creation/connection error
    res.status(500).json({
      success: false,
      message: `Failed to connect to database: ${dbConfig.database}`,
      error: error.message
    });
  }
});

// MySQL query route (executes real queries)
app.post('/api/mysql-test/query', async (req, res) => {
  const { query } = req.body;

  if (!pool) {
    return res.status(400).json({
      success: false,
      message: 'No database connection established. Please connect first via /api/mysql-test/connect.',
      error: 'No connection pool'
    });
  }

  try {
    console.log('Executing query:', query);
    const [results, fields] = await pool.query(query); // Execute the actual query
    console.log('Query results:', results);

    res.json({
      success: true,
      message: 'Query executed successfully',
      data: results // Return actual results
    });
  } catch (error) {
    console.error('Query execution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute query',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`MySQL Test Server running on port ${PORT}`);
});
