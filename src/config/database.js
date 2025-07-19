import { MongoClient } from 'mongodb';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB configuration
const MONGODB_USER = process.env.MONGODB_USER;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;
let MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'ai_sql_assistant';

// Construct MongoDB URL from username and password if not provided directly
if (!MONGODB_URL && MONGODB_USER && MONGODB_PASSWORD) {
  MONGODB_URL = `mongodb+srv://${encodeURIComponent(MONGODB_USER)}:${encodeURIComponent(MONGODB_PASSWORD)}@cluster0.uw9b9d6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
  console.log('[MongoDB] Constructed URL from username/password');
} else if (MONGODB_URL) {
  console.log('[MongoDB] Using provided MONGODB_URL');
} else {
  console.error('[MongoDB] Missing required environment variables: MONGODB_USER and MONGODB_PASSWORD or MONGODB_URL');
}

// PostgreSQL configuration
const POSTGRES_HOST = process.env.POSTGRES_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com';
const POSTGRES_PORT = process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 6543;
const POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || 'postgres';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres.zxfkihyydepmtnoejdyv';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || '0AuajXTTE6hRUqRY';
const POSTGRES_POOL_MODE = process.env.POSTGRES_POOL_MODE || 'transaction';

// AI API configuration
const AI_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
const AI_API_KEY = process.env.OPENROUTER_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistralai/mistral-7b-instruct';

// MongoDB connection management
let cachedMongoClient = null;

const getMongoClient = async () => {
  if (cachedMongoClient) return cachedMongoClient;
  
  if (!MONGODB_URL) {
    throw new Error('MongoDB URL is not configured. Please set MONGODB_USER and MONGODB_PASSWORD or MONGODB_URL in your environment variables.');
  }
  
  console.log('[MongoDB] Attempting to connect...');
  console.log('[MongoDB] URL:', MONGODB_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials in logs
  
  const client = new MongoClient(MONGODB_URL, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000, // Increased timeout
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  
  try {
    await client.connect();
    console.log('[MongoDB] Connected successfully!');
    cachedMongoClient = client;
    return cachedMongoClient;
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    console.error('[MongoDB] Error details:', {
      name: err.name,
      code: err.code,
      message: err.message
    });
    throw err;
  }
};

// Helper to build PostgreSQL connection string
function buildPgConnectionString({ host, port, database, user, password, pool_mode = 'transaction' }) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?pool_mode=${pool_mode}`;
}

// PostgreSQL connection management
let cachedSqlPool = null;

const getSqlPool = () => {
  if (cachedSqlPool) return cachedSqlPool;
  const connStr = buildPgConnectionString({
    host: POSTGRES_HOST,
    port: POSTGRES_PORT,
    database: POSTGRES_DATABASE,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    pool_mode: POSTGRES_POOL_MODE || 'transaction',
  });
  console.log('[PostgreSQL] Creating pool with connection string:', connStr);
  cachedSqlPool = new Pool({
    connectionString: connStr,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  cachedSqlPool.query('SELECT 1')
    .then(() => console.log('[PostgreSQL] Connected successfully!'))
    .catch(err => console.error('[PostgreSQL] Connection failed:', err));
  return cachedSqlPool;
};

export {
  MONGODB_DB_NAME,
  AI_API_URL,
  AI_API_KEY,
  MISTRAL_MODEL,
  getMongoClient,
  getSqlPool,
  buildPgConnectionString
}; 