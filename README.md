# AskBase Node.js Backend

A Node.js backend for the AskBase AI SQL Assistant, providing RESTful APIs for database connections, AI-powered SQL query generation, and chat session management.

## Features

- **Database Connection Management**: Connect to PostgreSQL databases
- **AI-Powered SQL Generation**: Uses OpenRouter API with Mistral model to generate SQL queries
- **Chat Session Management**: Save and restore chat sessions with MongoDB
- **Report Management**: Create, read, update, and delete reports
- **Security**: Rate limiting, CORS, and helmet security middleware
- **Logging**: Comprehensive logging with debug mode support

## Prerequisites

- Node.js 18+ (with ES6 module support)
- PostgreSQL database
- MongoDB database (for sessions and reports)
- OpenRouter API key

## Installation

1. Navigate to the backend directory:
```bash
cd nodejs-backend
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp env.example .env
```

4. Configure your environment variables in `.env`:
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Debug Configuration
DEBUG=false

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_username
DB_PASSWORD=your_password

# MongoDB
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=ai_sql_assistant

# AI API Configuration (OpenRouter)
OPENROUTER_API_URL=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_API_KEY=your_openrouter_api_key
MISTRAL_MODEL=mistralai/mistral-7b-instruct

# Security
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will start on port 3001 (or the port specified in your .env file).

## API Endpoints

### Health Check
- `GET /health` - Health check endpoint

### Database Connection
- `POST /connect-db` - Connect to PostgreSQL database
- `GET /connect-db/status` - Get database connection status
- `DELETE /connect-db` - Disconnect from database

### Chat & AI
- `POST /ask` - Ask AI to generate and execute SQL query
- `GET /chat-history` - Get chat history
- `DELETE /chat-history` - Clear chat history

### Sessions
- `GET /sessions` - List all chat sessions
- `GET /sessions/:session_id` - Get a specific chat session
- `DELETE /sessions/:session_id` - Delete a chat session
- `POST /sessions/:session_id/restore` - Restore a chat session

### Reports
- `POST /reports` - Create a new report
- `GET /reports` - List all reports
- `GET /reports/:id` - Get a specific report
- `PUT /reports/:id` - Update a report
- `DELETE /reports/:id` - Delete a report

## Database Schema

### PostgreSQL
The backend connects to any PostgreSQL database and automatically discovers tables and columns.

### MongoDB Collections

#### chat_sessions
```javascript
{
  session_id: String,
  created_at: Date,
  last_activity: Date,
  database_connection: Object,
  ai_model_used: String,
  messages: Array,
  metadata: Object,
  status: String
}
```

#### reports
```javascript
{
  id: String,
  title: String,
  description: String,
  created_at: Date,
  updated_at: Date,
  items: Array,
  share_url: String,
  is_public: Boolean
}
```

## Error Handling

The application includes comprehensive error handling:
- Input validation
- Database connection errors
- AI API errors
- Rate limiting
- Global error middleware

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request rate limiting
- **Input Validation**: Request body validation
- **Compression**: Response compression

## Logging

The application supports different logging levels:
- **Debug Mode**: Set `DEBUG=true` in environment variables
- **Error Logging**: All errors are logged with timestamps
- **Info Logging**: Server startup and important events

## Development

### Project Structure
```
nodejs-backend/
├── routes/
│   ├── health.js
│   ├── database.js
│   ├── chat.js
│   ├── reports.js
│   └── sessions.js
├── server.js
├── package.json
├── env.example
└── README.md
```

### Adding New Routes

1. Create a new route file in the `routes/` directory
2. Export the router: `export default router;`
3. Import and use in `server.js`: `import routerName from './routes/routerName.js';`

### Environment Variables

All configuration is done through environment variables. See `env.example` for all available options.

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running
   - Verify connection credentials
   - Ensure database exists

2. **MongoDB Connection Failed**
   - Check MongoDB is running
   - Verify connection URL
   - Check network connectivity

3. **AI API Errors**
   - Verify OpenRouter API key
   - Check API quota/limits
   - Ensure model name is correct

4. **Rate Limiting**
   - Check rate limit configuration
   - Monitor request frequency
   - Adjust limits if needed

## License

ISC License 