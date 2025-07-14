import serverless from 'serverless-http';
import { app } from './server-test.js';

// Export the serverless handler
export const handler = serverless(app); 