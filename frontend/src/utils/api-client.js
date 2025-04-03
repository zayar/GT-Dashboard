const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// Cache for storing API responses
const cache = new Map();

// Execute an API query with optional caching
const executeQuery = async (endpoint, options = {}) => {
  const cacheKey = `${endpoint}-${JSON.stringify(options)}`;
  
  // Check cache first
  if (options.useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await axiosInstance.get(endpoint, options);
    
    // Cache the response if caching is enabled
    if (options.useCache) {
      cache.set(cacheKey, response);
    }
    
    return response;
  } catch (error) {
    console.error(`Error executing query for endpoint ${endpoint}:`, error);
    throw error;
  }
};

// Clear the cache for a specific endpoint or the entire cache
const clearCache = (endpoint) => {
  if (endpoint) {
    // Clear specific endpoint cache
    for (const key of cache.keys()) {
      if (key.startsWith(endpoint)) {
        cache.delete(key);
      }
    }
  } else {
    // Clear entire cache
    cache.clear();
  }
};

module.exports = {
  executeQuery,
  clearCache
}; 