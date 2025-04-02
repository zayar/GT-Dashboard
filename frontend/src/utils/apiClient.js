import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000'; // Make sure this matches your backend port

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

/**
 * Execute an API query with optional caching
 */
export function executeQuery(endpoint, options = {}) {
  const cacheKey = `${endpoint}-${JSON.stringify(options)}`;
  
  // Check cache first
  if (options.useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  return axiosInstance.get(endpoint, options)
    .then(response => {
      // Cache the response if caching is enabled
      if (options.useCache) {
        cache.set(cacheKey, response);
      }
      return response;
    })
    .catch(error => {
      console.error(`Error executing query for endpoint ${endpoint}:`, error);
      throw error;
    });
}

/**
 * Clear the cache for a specific endpoint or the entire cache
 */
export function clearCache(endpoint) {
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
} 