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
router.get('/api/database-connections/connection/:connection_id', databaseConnectionsController.getDatabaseConnectionById);
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
router.options('/embed/validate', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.status(200).end();
});
router.post('/embed/validate', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
}, embedController.validateEmbedKey);

// Embed Keys API routes
router.options('/api/embed-keys', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.status(200).end();
});
router.post('/api/embed-keys', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
}, embedController.generateEmbedKey);

router.options('/api/embed-keys/:clerk_id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.status(200).end();
});
router.get('/api/embed-keys/:clerk_id', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
}, embedController.getUserEmbedKeys);

router.options('/api/embed-keys/:embed_id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.status(200).end();
});
router.delete('/api/embed-keys/:embed_id', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
}, embedController.deleteEmbedKey);

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

// Serve embed widget HTML
router.get('/embed-widget', (req, res) => {
  const embedKey = req.query.key;
  if (!embedKey) {
    return res.status(400).send('Missing embed key');
  }
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const embedUrl = `${frontendUrl}/embed?key=${encodeURIComponent(embedKey)}`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Askbase Chat</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #__next {
            height: 100vh;
            width: 100vw;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
        }
    </style>
</head>
<body>
    <iframe src="${embedUrl}" title="Askbase Chat" allow="microphone"></iframe>
</body>
</html>`;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.send(html);
});

export default router; 