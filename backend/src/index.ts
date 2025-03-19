import express from 'express';
import cors from 'cors';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

dotenv.config();

console.log('Starting server...');
console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

export const app = express();
app.use(cors());
app.use(express.json());

// Initialize cache with 5 minutes TTL
const cache = new NodeCache({ stdTTL: 300 });

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(compression());
app.use(limiter);

// Initialize BigQuery with credentials
const bigquery = new BigQuery({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: [
    'https://www.googleapis.com/auth/bigquery',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

// Test BigQuery connection
async function testBigQueryConnection() {
  try {
    console.log('Testing BigQuery connection...');
    const [datasets] = await bigquery.getDatasets();
    console.log('BigQuery connection successful. Available datasets:', datasets.map(dataset => dataset.id));
  } catch (error) {
    console.error('BigQuery connection error:', error);
    throw error;
  }
}

app.get('/api/schema', async (_req, res) => {
  try {
    console.log('Fetching schema for great_time.QueenDataView...');
    const [metadata] = await bigquery.dataset('great_time').table('QueenDataView').getMetadata();
    console.log('Schema fetched successfully');
    res.json({ success: true, data: metadata.schema });
  } catch (error: any) {
    console.error('Error fetching schema:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/query', async (req: express.Request<any, any, { query: string }>, res: express.Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    try {
      console.log('Executing query:', query);
      
      // Fix common syntax errors related to AT TIME ZONE before executing query
      const fixedQuery = fixTimezoneSyntax(query);
      
      const [job] = await bigquery.createQueryJob({ query: fixedQuery });
      const [rows] = await job.getQueryResults();
      
      console.log('Query executed successfully, rows:', rows.length);
      
      // Check if this is a query about customers using our helper
      const isCustomerQuery = isCustomerRelatedQuery(fixedQuery);
         
      if (isCustomerQuery && rows.length > 0) {
        console.log('Customer query detected, formatting response');
        
        try {
          // Format the data for rich display
          const formattedResponse = formatCustomerInteractionsData(rows);
          
          return res.json({
            success: true,
            data: rows,
            message: formattedResponse.content,
            richData: formattedResponse.data
          });
        } catch (formatError) {
          console.error('Error formatting customer data:', formatError);
          // Continue with regular response if formatting fails
          return res.json({ success: true, data: rows });
        }
      }
      
      // Default response for other types of queries
      return res.json({ success: true, data: rows });
    } catch (queryError: any) {
      console.error('Query execution error:', queryError.message);
      
      if (queryError.message && (
          queryError.message.toLowerCase().includes('invalid') || 
          queryError.message.toLowerCase().includes('syntax'))) {
        return res.status(400).json({ 
          success: false, 
          error: `Query syntax error: ${queryError.message}` 
        });
      }
      
      throw queryError;
    }
  } catch (error: any) {
    console.error('Server error in /api/query:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Server error: ${error.message || 'Unknown error'}` 
    });
  }
});

app.post('/api/queencommission', (async (req: express.Request, res: express.Response): Promise<void> => {
  const { month, practitioner } = req.body;
  try {
    const cacheKey = `queencommission_${month}_${practitioner}`;
    
    // Check cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      res.json({ success: true, data: cachedData });
      return;
    }

    // Optimized combined query
    const query = `
      WITH ServiceCounts AS (
        SELECT 
          COALESCE(TRIM(PractitionerName), 'Unknown') as practitioner_name,
          COALESCE(TRIM(ServiceName), 'Unknown') as service_name,
          COUNT(*) as total_service_count,
          FORMAT_TIMESTAMP('%Y-%m-%d %I:%M %p', MIN(CheckInTime)) as check_in_time
        FROM great_time.QueenDataView
        WHERE CheckInTime IS NOT NULL
          ${month ? `AND FORMAT_DATE('%Y-%m', DATE(CheckInTime)) = '${month}'` : ''}
          ${practitioner ? `AND TRIM(PractitionerName) = '${practitioner}'` : ''}
        GROUP BY 
          practitioner_name,
          service_name
      ),
      MonthsList AS (
        SELECT DISTINCT
          FORMAT_DATE('%Y-%m', DATE(CheckInTime)) as month
        FROM great_time.QueenDataView
        WHERE CheckInTime IS NOT NULL
        ORDER BY month DESC
      ),
      PractitionersList AS (
        SELECT DISTINCT
          COALESCE(TRIM(PractitionerName), 'Unknown') as practitioner
        FROM great_time.QueenDataView
        WHERE CheckInTime IS NOT NULL
        ORDER BY practitioner
      ),
      CalculatedCommissions AS (
        SELECT 
          sc.practitioner_name,
          sc.service_name,
          sc.total_service_count,
          sc.check_in_time,
          COALESCE(qc.Price, 0) as commission_price,
          CAST(sc.total_service_count * COALESCE(qc.Price, 0) AS INT64) as total_commission
        FROM ServiceCounts sc
        LEFT JOIN great_time.QueenCommission qc
          ON sc.practitioner_name = TRIM(qc.PractitionerName)
          AND sc.service_name = TRIM(qc.ServiceName)
      )
      SELECT
        (SELECT ARRAY_AGG(STRUCT(
          practitioner_name,
          service_name,
          total_service_count,
          commission_price,
          total_commission,
          check_in_time
        )) FROM CalculatedCommissions) as calculated,
        (SELECT ARRAY_AGG(month) FROM MonthsList) as months,
        (SELECT ARRAY_AGG(practitioner) FROM PractitionersList) as practitioners;
    `;

    const [job] = await bigquery.createQueryJob({ query });
    const [rows] = await job.getQueryResults();

    const result = {
      calculated: rows[0].calculated || [],
      months: rows[0].months || [],
      practitioners: rows[0].practitioners || []
    };

    // Cache the result
    cache.set(cacheKey, result);

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching queencommission data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch queencommission data' 
    });
  }
}) as express.RequestHandler);

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'test') {
  testBigQueryConnection()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

export const OPENAI_SQL_CONFIG = {
  model: 'gpt-4o-mini',
  // ... other configurations
};

// Helper function to format customer interaction data for rich display
const formatCustomerInteractionsData = (data: any[], mentionSource = false) => {
  try {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        content: "No customer data available",
        data: {
          customerInteractions: {
            names: [],
            values: []
          },
          tableData: {
            headers: ['Rank', 'Customer Name', 'Interactions'],
            rows: []
          }
        }
      };
    }
    
    // Extract customer names, interaction counts and phone numbers
    const formattedData = data.map(customer => {
      // Identify relevant fields in the data
      const nameFields = ['name', 'customer_name', 'customer', 'CustomerName'];
      const countFields = ['interactions', 'count', 'booking_count', 'bookings', 'CountBooking'];
      const phoneFields = ['phone', 'phoneNumber', 'PhoneNumber', 'contact', 'CustomerPhoneNumber'];
      
      // Find the first available name field
      const nameField = nameFields.find(field => customer[field] !== undefined);
      const fullName = nameField ? customer[nameField] : 'Unknown Customer';
      
      // Strip any ID/code if enclosed in parentheses
      const name = typeof fullName === 'string' && fullName.includes('(') 
        ? fullName.split('(')[0].trim() 
        : fullName;
      
      // Find the first available count field
      const countField = countFields.find(field => customer[field] !== undefined);
      const count = countField ? Number(customer[countField]) : 0;
      
      // Find the first available phone field
      const phoneField = phoneFields.find(field => customer[field] !== undefined);
      const phone = phoneField ? customer[phoneField] : '';
      
      return {
        name: fullName,
        displayName: name,
        interactions: count,
        phone: phone
      };
    });
    
    // Create sources arrays for chart and table
    const names = formattedData.map(c => c.displayName);
    const values = formattedData.map(c => c.interactions);
    
    // Format content message
    let contentMessage = mentionSource ? 
      `Top ${formattedData.length} customers based on interaction data from our system:` :
      `Here are the top ${formattedData.length} customers based on interaction counts:`;
    
    // Create table headers and rows
    const headers = ['Rank', 'Customer Name', 'Interactions'];
    // Add Phone header only if we have phone data
    const hasPhoneData = formattedData.some(c => c.phone);
    if (hasPhoneData) headers.push('Phone');
    
    const rows = formattedData.map((customer, index) => {
      const row = [
        index + 1,
        customer.name,
        customer.interactions
      ];
      if (hasPhoneData) row.push(customer.phone || 'N/A');
      return row;
    });
    
    // Return formatted data for rich display
    return {
      content: contentMessage,
      data: {
        customerInteractions: {
          names,
          values
        },
        tableData: {
          headers,
          rows
        }
      }
    };
  } catch (error) {
    console.error("Error formatting customer data:", error);
    // Return a minimal valid structure in case of error
    return {
      content: "Error formatting customer data. Here are the raw results:",
      data: {
        customerInteractions: {
          names: [],
          values: []
        },
        tableData: {
          headers: ['Data'],
          rows: [['Error formatting customer data']]
        }
      }
    };
  }
};

// Helper function to fix common syntax issues with AT TIME ZONE
const fixTimezoneSyntax = (query: string): string => {
  try {
    // Fix the pattern TIMESTAMP(field AT TIME ZONE 'timezone') which causes syntax errors
    // Replace with correct syntax: TIMESTAMP(field) AT TIME ZONE 'timezone'
    return query.replace(/TIMESTAMP\s*\(\s*([^)]+)\s+AT\s+TIME\s+ZONE\s+(['"][^'"]+['"])\s*\)/gi, 
      (_, field, timezone) => `TIMESTAMP(${field}) AT TIME ZONE ${timezone}`);
  } catch (error) {
    console.error("Error fixing timezone syntax:", error);
    // Return the original query if we encounter any errors
    return query;
  }
};

// Helper function to detect if a query is about customer data
const isCustomerRelatedQuery = (query: string): boolean => {
  try {
    const lowercaseQuery = query.toLowerCase();
    
    // Check for key phrases that indicate customer data
    const customerKeywords = ['customer', 'client', 'patient'];
    const hasCustomerKeyword = customerKeywords.some(keyword => lowercaseQuery.includes(keyword));
    
    // If we have customer keywords and some ranking/listing term, likely a customer query
    if (hasCustomerKeyword) {
      const rankingTerms = ['top', 'list', 'rank', 'most', 'frequent', 'loyal', 'engagement'];
      return rankingTerms.some(term => lowercaseQuery.includes(term));
    }
    
    return false;
  } catch (error) {
    console.error("Error detecting customer query:", error);
    return false;
  }
};