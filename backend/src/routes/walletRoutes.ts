import express from 'express';
import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Get the absolute path to the service account key file
const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                   path.resolve(process.cwd(), 'service-account-key.json');

console.log('Using service account key file at:', keyFilePath);
// Check if the key file exists
if (fs.existsSync(keyFilePath)) {
  console.log('Service account key file exists');
} else {
  console.error('Service account key file not found at:', keyFilePath);
}

// Configure BigQuery with explicit settings for piti-pass
const pitiPassBigQuery = new BigQuery({
  projectId: 'piti-pass',
  location: 'us-central1',
  keyFilename: keyFilePath,
  scopes: [
    'https://www.googleapis.com/auth/bigquery',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/drive'
  ]
});

// Update the mock data to match the schema
const mockWalletTransactions = [
  {
    transactionNumber: 'TX-001',
    type: 'CREDIT',
    status: 'COMPLETED',
    balance: '100.00',
    comment: 'Sample credit transaction',
    sender_id: 'user-001',
    senderName: 'John Doe',
    senderPhone: '+123456789',
    recipient_id: 'user-002',
    recipientName: 'Jane Smith',
    recipientPhone: '+987654321',
    createddate_myanmar: new Date().toISOString(),
    ClinicCode: 'CLINIC-001',
    cash: '100.00',
    detailBalance: '200.00',
    accountbalance: '300.00',
    mainAccount: 'MAIN-001'
  },
  {
    transactionNumber: 'TX-002',
    type: 'DEBIT',
    status: 'COMPLETED',
    balance: '50.00',
    comment: 'Sample debit transaction',
    sender_id: 'user-002',
    senderName: 'Jane Smith',
    senderPhone: '+987654321',
    recipient_id: 'user-001',
    recipientName: 'John Doe',
    recipientPhone: '+123456789',
    createddate_myanmar: new Date().toISOString(),
    ClinicCode: 'CLINIC-002',
    cash: '50.00',
    detailBalance: '150.00',
    accountbalance: '250.00',
    mainAccount: 'MAIN-002'
  }
];

// Test function to verify BigQuery access
async function testPitiPassAccess() {
  try {
    console.log('Testing access to piti-pass project...');
    
    // List all datasets in the piti-pass project
    const [datasets] = await pitiPassBigQuery.getDatasets();
    console.log(`Found ${datasets.length} datasets in piti-pass project:`, 
      datasets.map(d => d.id).join(', '));
    
    // Check if passdb_prod dataset exists
    const passdbDataset = datasets.find(d => d.id === 'passdb_prod');
    if (!passdbDataset) {
      console.error('passdb_prod dataset not found in piti-pass project');
      return false;
    }
    
    // List tables in the passdb_prod dataset
    const [tables] = await pitiPassBigQuery.dataset('passdb_prod').getTables();
    console.log(`Found ${tables.length} tables in passdb_prod dataset:`, 
      tables.map(t => t.id).join(', '));
    
    // Check if wallettransaction table exists
    const walletTable = tables.find(t => t.id === 'wallettransaction');
    if (!walletTable) {
      console.error('wallettransaction table not found in passdb_prod dataset');
      return false;
    }
    
    // Try to run a count query on the wallettransaction table
    console.log('Running count query on wallettransaction table...');
    const countQuery = `
      SELECT COUNT(*) as count
      FROM \`piti-pass.passdb_prod.wallettransaction\`
    `;
    
    const [rows] = await pitiPassBigQuery.query({
      query: countQuery,
      location: 'us-central1',
    });
    
    console.log('Successfully queried wallettransaction table. Row count:', rows[0].count);
    return true;
  } catch (error: any) {
    console.error('Error testing piti-pass access:', error.message);
    if (error.errors && error.errors.length > 0) {
      console.error('  Details:', error.errors[0].message);
    }
    return false;
  }
}

// Run the test when the router is loaded
testPitiPassAccess();

router.get('/transactions', async (req, res) => {
  try {
    console.log('Processing /transactions request...');
    
    // Check if we can access the piti-pass project
    const hasAccess = await testPitiPassAccess();
    if (!hasAccess) {
      console.log('Using mock data because piti-pass access check failed');
      return res.json({
        success: true,
        data: mockWalletTransactions,
        mockData: true,
        error: 'Using mock data due to database access issues'
      });
    }
    
    const query = `
      SELECT 
        transactionNumber,
        type,
        status,
        balance,
        comment,
        cash,
        detailBalance,
        accountbalance,
        mainAccount,
        sender_id,
        senderName,
        senderPhone,
        recipient_id,
        recipientName,
        recipientPhone,
        createddate_myanmar,
        ClinicCode
      FROM \`piti-pass.passdb_prod.wallettransaction\`
      LIMIT 100
    `;

    console.log('Executing wallet transaction query...');
    try {
      const [rows] = await pitiPassBigQuery.query({
        query: query,
        location: 'us-central1', // Explicitly set the location for this query
      });
      
      console.log(`Query successful. Retrieved ${rows.length} transactions.`);
      res.json({ success: true, data: rows });
    } catch (queryError: any) {
      console.error('Error executing wallet transactions query:', queryError.message);
      if (queryError.errors && queryError.errors.length > 0) {
        console.error('  Details:', queryError.errors[0].message);
      }
      
      // Return mock data with error info
      res.json({ 
        success: true, 
        data: mockWalletTransactions,
        mockData: true,
        error: 'Using mock data due to database query issues',
        details: queryError.message
      });
    }
  } catch (error: any) {
    console.error('Unexpected error in wallet transactions route:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch wallet transactions',
      message: error.message || 'Unknown error'
    });
  }
});

export default router; 