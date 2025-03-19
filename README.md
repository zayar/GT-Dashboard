# Queen AI Chat

A modern web application for managing customer data, services, and therapist information with AI-powered insights.

## Features

- Real-time customer data management
- Service tracking and analytics
- Therapist performance monitoring
- AI-powered insights and recommendations
- Commission calculation and tracking
- Service reminder system

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Cloud Platform account with BigQuery enabled
- OpenAI API key

## Project Structure

```
.
├── backend/             # Express backend
│   ├── src/            # Source files
│   ├── dist/           # Compiled files
│   └── package.json    # Backend dependencies
├── frontend/           # React frontend
│   ├── src/           # Source files
│   ├── public/        # Static files
│   └── package.json   # Frontend dependencies
└── package.json       # Root dependencies
```

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/queenaichat.git
   cd queenaichat
   ```

2. Install dependencies:
   ```bash
   npm run install-all
   ```

3. Configure environment variables:

   Backend (.env):
   ```
   PORT=3000
   NODE_ENV=development
   GOOGLE_APPLICATION_CREDENTIALS=path/to/your/credentials.json
   ```

   Frontend (.env):
   ```
   VITE_API_URL=http://localhost:3000
   VITE_OPENAI_API_KEY=your_openai_api_key
   ```

4. Set up Google Cloud credentials:
   - Create a service account in Google Cloud Console
   - Download the credentials JSON file
   - Place it in the backend directory
   - Update GOOGLE_APPLICATION_CREDENTIALS in backend/.env

## Development

Start both backend and frontend in development mode:
```bash
npm run dev
```

Or start them separately:

Backend:
```bash
cd backend
npm run dev
```

Frontend:
```bash
cd frontend
npm run dev
```

## Production

Build both applications:
```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

Start in production mode:
```bash
npm start
```

## API Documentation

The backend provides the following main endpoints:

- `GET /api/schema` - Get BigQuery table schema
- `POST /api/query` - Execute BigQuery queries
- `POST /api/queencommission` - Calculate commission data

For detailed API documentation, refer to the backend source code.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.