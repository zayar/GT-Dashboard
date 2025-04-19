import { Router } from 'express';
import clinicRoutes from './clinic.routes';
import transactionRoutes from './transaction.routes';
import { verifyFirebaseToken } from '../middleware/auth.middleware';
import admin from 'firebase-admin';

const router = Router();
const db = admin.firestore();

// Define main API routes
router.get('/', (req, res) => {
  res.send('GT Dashboard Backend API is running!');
});

// Route to get clinics allowed for the logged-in user
router.get('/user-clinics', verifyFirebaseToken, async (req, res) => {
    const userId = req.user?.uid;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: User ID not found after auth check.' });
    }

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            console.warn(`Firestore: User document not found for UID: ${userId}`);
            return res.status(404).json({ success: false, error: 'User profile not found in Firestore.' });
        }
        
        const userData = userDoc.data();
        const allowedCodes = userData?.allowedClinicCodes || [];
        console.log(`User ${userId} allowed codes:`, allowedCodes);

        if (allowedCodes.length === 0) {
            console.log(`User ${userId} has no clinics assigned.`);
            return res.json({ success: true, data: [] });
        }

        const clinicsRef = db.collection('clinics');
        const snapshot = await clinicsRef.where('code', 'in', allowedCodes).where('active', '==', 1).get();
        
        if (snapshot.empty) {
             console.log(`No active clinics found matching allowed codes: ${allowedCodes.join(', ')}`);
             return res.json({ success: true, data: [] });
        }
        
        const clinics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Returning ${clinics.length} clinics for user ${userId}`);
        res.json({ success: true, data: clinics });

    } catch (error) {
        console.error('Error fetching user clinics from Firestore:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user clinics.' });
    }
});

// Mount specific routes
router.use('/clinics', clinicRoutes);
router.use('/transactions', transactionRoutes);

// TODO: Add other routes here (e.g., query)

export default router; 