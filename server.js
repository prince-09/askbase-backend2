import express from 'express';
import awsServerlessExpress from 'aws-serverless-express';
import dotenv from 'dotenv';

// Import middleware
import { corsMiddleware, securityMiddleware, compressionMiddleware, createRateLimiter } from './src/middleware/security.js';

// Import routes
import routes from './src/routes/index.js';

// Import database configuration
import { getMongoClient, getSqlPool } from './src/config/database.js';
import { setupDatabase } from './src/config/setupDatabase.js';

dotenv.config();

const app = express();

// Setup middleware
app.use(securityMiddleware);
app.use(compressionMiddleware);
app.use(corsMiddleware);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(createRateLimiter());

// Setup routes
console.log('🔄 Setting up routes...');
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

console.log('✅ All routes setup completed');

// Lambda handler export using aws-serverless-express
const server = awsServerlessExpress.createServer(app);
export const handler = (event, context) => awsServerlessExpress.proxy(server, event, context);
export { app };

// Only start the server locally if not running in Lambda
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  (async () => {
    try {
      // 1. Initialize MongoDB
      console.log('🔄 Initializing MongoDB...');
      const mongoConnected = await getMongoClient();
      if (!mongoConnected) {
        console.error('❌ Failed to connect to MongoDB');
        process.exit(1);
      }
      console.log('✅ MongoDB initialized');
      
      // 2. Initialize PostgreSQL
      console.log('🔄 Initializing PostgreSQL...');
      const postgresConnected = getSqlPool();
      if (!postgresConnected) {
        console.log('⚠️  PostgreSQL not connected - will use dynamic connections');
      } else {
        console.log('✅ PostgreSQL initialized');
      }
      
      // 3. Setup database tables
      console.log('🔄 Setting up database tables...');
      await setupDatabase();
      console.log('✅ Database tables setup completed');
      
      // 4. Start server
      const PORT = process.env.PORT || 8000;
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`🔍 Test endpoint: http://localhost:${PORT}/test`);
      });
    } catch (error) {
      console.error('❌ Failed to initialize server:', error);
      process.exit(1);
    }
  })();
} 