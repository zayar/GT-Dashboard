# MySQL Connector Service

This service provides a simple API for connecting to MySQL databases and executing queries. It is designed to be used with the GT Dashboard application.

## Features

- Test connection to MySQL databases
- Execute custom SQL queries
- Get a list of tables in a database
- View query results in a formatted table
- Filter and search through results

## Setup

1. Install dependencies:
   ```
   cd backend/mysql
   npm install
   ```

2. Start the service:
   ```
   npm start
   ```
   
   Or use the provided script:
   ```
   ./start-mysql-service.sh
   ```

## API Endpoints

### Test Connection
- **Endpoint**: `POST /api/mysql/connect`
- **Body**:
  ```json
  {
    "host": "localhost",
    "user": "username",
    "password": "password",
    "database": "db_name",
    "port": 3306
  }
  ```

### Execute Query
- **Endpoint**: `POST /api/mysql/query`
- **Body**:
  ```json
  {
    "host": "localhost",
    "user": "username",
    "password": "password",
    "database": "db_name",
    "port": 3306,
    "query": "SELECT * FROM users LIMIT 10;"
  }
  ```

### Get Tables
- **Endpoint**: `POST /api/mysql/tables`
- **Body**:
  ```json
  {
    "host": "localhost",
    "user": "username",
    "password": "password",
    "database": "db_name",
    "port": 3306
  }
  ```

## Frontend Component

To use the MySQL Connector in the GT Dashboard app:

1. Navigate to the MySQL Connector page from the sidebar.
2. Enter your MySQL connection details.
3. Click "Test Connection" to verify the connection.
4. Once connected, you can switch to the Query tab to execute SQL queries.
5. Select a table from the dropdown to automatically generate a SELECT query.

## Security Considerations

- This service is intended for development and testing purposes.
- Connection credentials are transmitted in request bodies and should only be used on secure networks.
- Consider adding authentication to the service in production environments.
- Limit the scope of SQL queries to prevent unauthorized access or data manipulation. 