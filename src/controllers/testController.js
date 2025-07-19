import { testDatabaseConnection } from '../services/databaseService.js';
import { testMongoConnection } from '../services/sessionService.js';

// Root endpoint
export function getRoot(req, res) {
  res.json({ message: 'AskBase API' });
}

// Health check endpoint
export function getHealth(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

// Test endpoint
export function getTest(req, res) {
  console.log('[TEST] /test endpoint hit');
  console.log('[TEST] Request headers:', req.headers);
  console.log('[TEST] Request method:', req.method);
  console.log('[TEST] Request URL:', req.url);
  res.json({ 
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });
}

// Test PostgreSQL connection
export async function testPostgres(req, res) {
  try {
    const result = await testDatabaseConnection();
    if (result.success) {
      res.json({ 
        message: 'PostgreSQL connection successful!',
        version: result.version
      });
    } else {
      res.status(500).json({ 
        error: 'PostgreSQL connection failed',
        message: result.error
      });
    }
  } catch (error) {
    console.error('PostgreSQL test error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}

// Test MongoDB connection
export async function testMongo(req, res) {
  try {
    const result = await testMongoConnection();
    if (result.success) {
      res.json({ 
        message: 'MongoDB connection successful!',
        database: result.database,
        collections: result.collections
      });
    } else {
      res.status(500).json({ 
        error: 'MongoDB connection failed',
        message: result.error
      });
    }
  } catch (error) {
    console.error('MongoDB test error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
} 