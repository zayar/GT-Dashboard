import axios from 'axios';
import { auth } from '../config/firebase';

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
const executeQuery = async (endpoint: string, options: any = {}) => {
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
  } catch (error: any) {
    console.error(`Error executing query for endpoint ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Clear the cache for a specific endpoint or the entire cache
 */
const clearCache = (endpoint?: string) => {
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

// Add request interceptor for adding auth tokens
axiosInstance.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } catch (error) {
        console.error('Error getting ID token:', error);
        // Optionally handle token refresh errors, e.g., force logout
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Export the configured axios instance as the default
export default axiosInstance;

// Also keep named exports for functions that may be used elsewhere
export { executeQuery, clearCache }; 