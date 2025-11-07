#!/bin/bash

# Test script for wallet balance endpoint
# Make sure the backend server is running before executing this script

echo "Testing Wallet Balance Endpoint"
echo "================================"
echo ""

# Test parameters
PHONE_NUMBER="959771777529"
CLINIC_CODE="GTTHEQUEEN_PASS"
API_URL="http://localhost:3001"

echo "Test 1: Fetching wallet balance"
echo "Phone: $PHONE_NUMBER"
echo "Clinic Code: $CLINIC_CODE"
echo ""

# Make the request
response=$(curl -s "${API_URL}/api/wallet/balance?phoneNumber=${PHONE_NUMBER}&clinicCode=${CLINIC_CODE}")

echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

# Test 2: Missing phone number
echo "Test 2: Missing phone number (should return error)"
response=$(curl -s "${API_URL}/api/wallet/balance?clinicCode=${CLINIC_CODE}")
echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

# Test 3: Missing clinic code
echo "Test 3: Missing clinic code (should return error)"
response=$(curl -s "${API_URL}/api/wallet/balance?phoneNumber=${PHONE_NUMBER}")
echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

echo "================================"
echo "Tests completed!"
echo ""
echo "To run these tests:"
echo "1. Start the backend: cd backend && npm run dev"
echo "2. Run this script: bash test-wallet-balance.sh"


