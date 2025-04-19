#!/bin/bash

# Navigate to the MySQL service directory
cd "$(dirname "$0")"

# Check if node_modules exists, if not, install dependencies
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start the MySQL service
echo "Starting MySQL Service..."
node server.js 