const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysqlRoutes = require('./mysql-routes');

const app = express();
const PORT = process.env.PORT || 5004;

// Configure CORS to allow requests from the frontend
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request bodies
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'MySQL Service is running'
  });
});

// Mount MySQL routes
app.use('/api/mysql', mysqlRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: true,
    message: err.message || 'An unexpected error occurred'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`MySQL Service running on port ${PORT}`);
});
