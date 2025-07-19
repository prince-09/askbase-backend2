import express from 'express';
import * as askController from '../controllers/askController.js';
import * as sessionsController from '../controllers/sessionsController.js';
import * as reportsController from '../controllers/reportsController.js';
import * as testController from '../controllers/testController.js';
import * as schemaController from '../controllers/schemaController.js';
import * as usersController from '../controllers/usersController.js';
import * as clerkWebhookController from '../controllers/clerkWebhookController.js';
import * as databaseConnectionsController from '../controllers/databaseConnectionsController.js';
import * as sampleDataController from '../controllers/sampleDataController.js';
import * as embedController from '../controllers/embedController.js';
import path from 'path';

const router = express.Router();

// Serve static files with proper CORS headers
router.use('/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  next();
}, express.static(path.join(process.cwd(), 'public')));

// Root and health check routes
router.get('/', testController.getRoot);
router.get('/health', testController.getHealth);
router.get('/test', testController.getTest);

// Database connection test routes
router.get('/test-postgres', testController.testPostgres);
router.get('/test-mongo', testController.testMongo);

// Database connection
router.post('/connect-db', askController.connectDatabase);

// Schema routes
router.get('/schema', schemaController.getDatabaseSchema);

// Ask routes
router.post('/ask', askController.handleAskRequest);
router.get('/chat-history', askController.getChatHistory);
router.delete('/chat-history', askController.clearChatHistory);
router.post('/reset-session-history', askController.resetSessionHistoryEndpoint);

// Sessions routes
router.get('/sessions', sessionsController.getSessions);
router.get('/sessions/:session_id', sessionsController.getSession);
router.delete('/sessions/:session_id', sessionsController.deleteSessionById);
router.post('/sessions/:session_id/restore', sessionsController.restoreSession);

// Reports routes
router.get('/reports', reportsController.getReports);
router.post('/reports', reportsController.createNewReport);
router.get('/reports/:id', reportsController.getReport);
router.put('/reports/:id', reportsController.updateReportById);
router.delete('/reports/:id', reportsController.deleteReportById);

// Users routes
router.post('/api/users', usersController.createOrUpdateUser);
router.get('/api/users/:clerk_id', usersController.getUserByClerkId);
router.put('/api/users/:clerk_id/settings', usersController.updateUserSettings);
router.delete('/api/users/:clerk_id', usersController.deleteUser);

// Database Connections routes
router.post('/api/database-connections', databaseConnectionsController.saveDatabaseConnection);
router.get('/api/database-connections/:clerk_id', databaseConnectionsController.getUserDatabaseConnections);
router.get('/api/database-connections/:connection_id/password', databaseConnectionsController.getDatabasePassword);
router.post('/api/database-connections/test', databaseConnectionsController.testDatabaseConnection);
router.put('/api/database-connections/:connection_id/last-used', databaseConnectionsController.updateConnectionLastUsed);
router.delete('/api/database-connections/:connection_id', databaseConnectionsController.deleteDatabaseConnection);

// Sample Data routes
router.post('/api/sample-data/setup', sampleDataController.setupSampleData);
router.post('/api/sample-data/check', sampleDataController.checkSampleData);

// Clerk webhook route
router.post('/api/webhook/clerk', clerkWebhookController.handleClerkWebhook);

// Embed routes
router.post('/embed/validate', embedController.validateEmbedKey);
router.post('/embed/ask', embedController.handleEmbedAskRequest);
router.get('/embed/schema', embedController.getEmbedSchema);
router.post('/api/embed-keys', embedController.generateEmbedKey);
router.get('/api/embed-keys/:clerk_id', embedController.getUserEmbedKeys);
router.delete('/api/embed-keys/:embed_id', embedController.deleteEmbedKey);

// Serve embed script with proper CORS headers
router.get('/embed.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile('public/embed.js', { root: process.cwd() });
});

export default router; 