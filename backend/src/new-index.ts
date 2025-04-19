import express from 'express';
import cors from 'cors';
import apiRoutes from './routes';
import { errorHandler } from './utils/error-handler';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// IMPORTANT: Ensure this path is correct and the file is in the .gitignore
try {
  const serviceAccount = require('../gtportal-2252c-firebase.json'); // Path relative to new-index.ts (in src)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK Initialized Successfully.");
} catch (error: any) {
  console.error("!!!!!!!!!! Firebase Admin SDK Initialization Failed !!!!!!!!!!");
  console.error("Error Details:", error.message);
  console.error("Make sure the service account key file exists at 'backend/gtportal-2252c-firebase.json' and the path in new-index.ts is correct.");
  // Optionally exit if Firebase Admin is critical
  // process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001; // Use 3001 as default or environment variable

// Middleware
app.use(cors()); // Enable CORS for all origins (adjust for production)
app.use(express.json()); // Parse JSON request bodies

// API Routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use(errorHandler);

// Start Server
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});

export default app; // Export for potential testing or imports 