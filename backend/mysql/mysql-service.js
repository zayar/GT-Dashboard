const mysql = require('mysql2/promise');

/**
 * Test connection to a MySQL database
 * @param {string} host - Database host
 * @param {string} user - Database username
 * @param {string} password - Database password
 * @param {string} database - Database name
 * @param {number} port - Database port (optional)
 * @returns {Promise<Object>} - Connection result
 */
async function testConnection(host, user, password, database, port = 3306) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port: port || 3306,
      connectTimeout: 10000, // 10 seconds
    });
    
    // Get database info
    const [serverInfo] = await connection.query('SELECT VERSION() as version');
    
    return {
      connected: true,
      version: serverInfo[0]?.version || 'Unknown',
      host,
      database
    };
  } catch (error) {
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Execute a custom SQL query
 * @param {string} host - Database host
 * @param {string} user - Database username
 * @param {string} password - Database password
 * @param {string} database - Database name
 * @param {number} port - Database port (optional)
 * @param {string} query - SQL query to execute
 * @returns {Promise<Array>} - Query results
 */
async function executeQuery(host, user, password, database, port = 3306, query) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port: port || 3306,
    });
    
    const [results] = await connection.query(query);
    return results;
  } catch (error) {
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Get list of tables in the database
 * @param {string} host - Database host
 * @param {string} user - Database username
 * @param {string} password - Database password
 * @param {string} database - Database name
 * @param {number} port - Database port (optional)
 * @returns {Promise<Array>} - List of tables
 */
async function getTables(host, user, password, database, port = 3306) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port: port || 3306,
    });
    
    const [tables] = await connection.query('SHOW TABLES');
    
    // Format the response to get table names in a clean array
    return tables.map(table => {
      // The property name is dynamic based on the query, so get the first property's value
      return Object.values(table)[0];
    });
  } catch (error) {
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = {
  testConnection,
  executeQuery,
  getTables
};
