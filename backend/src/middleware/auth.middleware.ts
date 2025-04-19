import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
      };
    }
  }
}

export const verifyFirebaseToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth Middleware: No Bearer token provided.');
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided.' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  if (!idToken) {
      console.log('Auth Middleware: Bearer token format invalid.');
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token format.' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // console.log('Auth Middleware: Token Decoded:', decodedToken.email); // Optional: Log email on success
    req.user = { uid: decodedToken.uid, email: decodedToken.email }; // Attach user info
    next(); // Token is valid, proceed
  } catch (error: any) {
    console.error('Auth Middleware: Error verifying Firebase token:', error.message);
    // Log specific error codes
    if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, error: 'Unauthorized: Token expired.' });
    }
    if (error.code === 'auth/argument-error') {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token format.' });
    }
    // Add more specific error handling if needed
    
    return res.status(403).json({ success: false, error: 'Unauthorized: Invalid token.' });
  }
}; 