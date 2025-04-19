const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Test MySQL connection and get tables
router.post('/connect', async (req, res) => {
  const { connectionConfig } = req.body;
  
  if (!connectionConfig || !connectionConfig.host || !connectionConfig.user || !connectionConfig.database) {
    return res.status(400).json({
      success: false,
      error: 'Missing required connection parameters'
    });
  }
  
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: connectionConfig.host,
      user: connectionConfig.user,
      password: connectionConfig.password,
      database: connectionConfig.database,
      connectTimeout: 10000 // 10 second timeout
    });
    
    // Test connection by getting tables
    const [tables] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?
      ORDER BY table_name
    `, [connectionConfig.database]);
    
    // Extract table names
    const tableNames = tables.map(table => table.TABLE_NAME || table.table_name);
    
    return res.json({
      success: true,
      message: 'Successfully connected to MySQL database',
      tables: tableNames
    });
  } catch (error) {
    console.error('MySQL connection error:', error);
    return res.status(500).json({
      success: false,
      error: `MySQL connection error: ${error.message}`
    });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        console.error('Error closing MySQL connection:', err);
      }
    }
  }
});

// Execute query
router.post('/query', async (req, res) => {
  const { connectionConfig, query } = req.body;
  
  if (!connectionConfig || !connectionConfig.host || !connectionConfig.user || !connectionConfig.database) {
    return res.status(400).json({
      success: false,
      error: 'Missing required connection parameters'
    });
  }
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'No query provided'
    });
  }
  
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: connectionConfig.host,
      user: connectionConfig.user,
      password: connectionConfig.password,
      database: connectionConfig.database,
      connectTimeout: 10000 // 10 second timeout
    });
    
    // Execute query
    const [results] = await connection.query(query);
    
    return res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('MySQL query error:', error);
    return res.status(500).json({
      success: false,
      error: `MySQL query error: ${error.message}`
    });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        console.error('Error closing MySQL connection:', err);
      }
    }
  }
});

module.exports = router; 