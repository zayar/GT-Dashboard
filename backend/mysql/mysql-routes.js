const express = require('express');
const router = express.Router();
const mysqlService = require('./mysql-service');

// Test connection to MySQL database
router.post('/connect', async (req, res) => {
  try {
    const { host, user, password, database, port } = req.body;
    
    if (!host || !user || !password || !database) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required connection parameters'
      });
    }

    const result = await mysqlService.testConnection(host, user, password, database, port);
    
    return res.status(200).json({
      success: true,
      message: 'Successfully connected to MySQL database',
      data: result
    });
  } catch (error) {
    console.error('MySQL connection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to connect to MySQL database',
      error: error.message
    });
  }
});

// Execute custom query
router.post('/query', async (req, res) => {
  try {
    const { host, user, password, database, port, query } = req.body;
    
    if (!host || !user || !password || !database || !query) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    const result = await mysqlService.executeQuery(host, user, password, database, port, query);
    
    return res.status(200).json({
      success: true,
      message: 'Query executed successfully',
      data: result
    });
  } catch (error) {
    console.error('Query execution error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute query',
      error: error.message
    });
  }
});

// Get tables in database
router.post('/tables', async (req, res) => {
  try {
    const { host, user, password, database, port } = req.body;
    
    if (!host || !user || !password || !database) {
      return res.status(400).json({
        success: false,
        message: 'Missing required connection parameters'
      });
    }

    const tables = await mysqlService.getTables(host, user, password, database, port);
    
    return res.status(200).json({
      success: true,
      message: 'Successfully retrieved tables',
      data: tables
    });
  } catch (error) {
    console.error('Error getting tables:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve tables',
      error: error.message
    });
  }
});

module.exports = router;
