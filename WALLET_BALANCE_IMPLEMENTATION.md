# Wallet Balance Implementation

## Overview
Updated the Customer Details page to fetch wallet balance from the new `walletbalance` table instead of querying the `wallettransaction` table.

## Changes Made

### 1. Backend - New API Endpoint
**File:** `backend/src/routes/walletRoutes.ts`

Added a new GET endpoint `/api/wallet/balance` that:
- Accepts `phoneNumber` and `clinicCode` as query parameters
- Queries the `piti-pass.passdb_prod.walletbalance` table
- Uses parameterized queries for security
- Normalizes phone numbers (handles +959 prefix)
- Returns the latest balance for the customer

**Endpoint:**
```
GET /api/wallet/balance?phoneNumber={phone}&clinicCode={clinicCode}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "balance": "934696641.00",
    "accountName": "Customer Name",
    "phoneNumber": "+959771777529",
    "lastUpdated": "2025-10-21T10:30:00Z"
  }
}
```

### 2. Frontend - Updated Wallet Balance Fetch
**File:** `frontend/src/components/CustomerDetails.tsx`

Updated the `fetchWalletBalance` function to:
- Use the new `/api/wallet/balance` endpoint (GET request instead of POST)
- Pass phone number and clinic code as query parameters
- Remove complex SQL query generation from frontend
- Simplify error handling
- Add validation for `pass_id` configuration

**Key Changes:**
- ✅ Uses dedicated REST endpoint instead of generic query endpoint
- ✅ Cleaner separation of concerns
- ✅ Better performance (direct table query vs transaction log scan)
- ✅ More maintainable code

## Database Schema
The `walletbalance` table is expected to have the following columns:
- `balance` - The wallet balance amount
- `phoneNumber` - Customer's phone number
- `accountName` - Account holder name
- `ClinicCode` - Clinic identifier
- `createddate_myanmar` - Timestamp of the balance record

## Testing

### Backend Test
1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Test the endpoint:
   ```bash
   curl "http://localhost:3001/api/wallet/balance?phoneNumber=959771777529&clinicCode=GTTHEQUEEN_PASS"
   ```

### Frontend Test
1. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

2. Navigate to a customer details page and verify:
   - Wallet balance loads correctly
   - Shows proper loading state
   - Handles errors gracefully
   - Displays balance in MMK format

## Benefits

1. **Performance**: Direct table lookup is faster than scanning transaction history
2. **Accuracy**: Balance table is the source of truth for current balances
3. **Maintainability**: Simpler code, easier to debug
4. **Scalability**: Dedicated endpoint can be optimized independently
5. **Security**: Parameterized queries prevent SQL injection

## Migration Notes

- The old implementation queried `wallettransaction` table and got balance from the latest transaction
- New implementation directly queries the `walletbalance` table
- Both implementations normalize phone numbers the same way (+959 handling)
- Fallback to '0' balance if no data found (same behavior)

## Future Improvements

1. Add caching for wallet balances (Redis/memory cache)
2. Add balance history tracking
3. Implement balance change notifications
4. Add admin endpoint to refresh balances
5. Consider adding balance audit trail


