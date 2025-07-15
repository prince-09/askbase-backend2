import express from 'express';
import awsServerlessExpress from 'aws-serverless-express';
import { MongoClient } from 'mongodb';
import pkg from 'pg';

const { Pool } = pkg;

const app = express();
app.use(express.json());

/** === Mongo Setup === **/
let cachedMongoClient = null;

const getMongoClient = async () => {
  if (cachedMongoClient) return cachedMongoClient;

  console.log('[MongoDB] Attempting to connect...');
  const client = new MongoClient('mongodb+srv://prince:prince_local_pass@cluster0.uw9b9d6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    console.log('[MongoDB] Connected successfully!');
    cachedMongoClient = client;
    return cachedMongoClient;
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err);
    throw err;
  }
};

/** === SQL Setup === **/
let cachedSqlPool = null;

const getSqlPool = () => {
  if (cachedSqlPool) return cachedSqlPool;

  console.log('[PostgreSQL] Creating pool with:');
  console.log('  host:', 'zxfkihyydepmtnoejdyv.supabase.co');
  console.log('  port:', 5432);
  console.log('  user:', 'postgres');
  console.log('  database:', 'postgres');

  cachedSqlPool = new Pool({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.zxfkihyydepmtnoejdyv',
    password: '0AuajXTTE6hRUqRY',
    pool_mode: 'transaction',
    database: 'postgres',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Test connection immediately
  cachedSqlPool.query('SELECT 1')
    .then(() => console.log('[PostgreSQL] Connected successfully!'))
    .catch(err => console.error('[PostgreSQL] Connection failed:', err));

  return cachedSqlPool;
};

/** === Sample Route === **/
app.get('/status', async (req, res) => {
  try {
    console.log('[Status] Checking MongoDB and PostgreSQL status...');
    const mongo = await getMongoClient();
    const db = mongo.db('test'); // Change to your DB
    const mongoData = await db.collection('example').find().limit(1).toArray();

    const sql = getSqlPool();
    const result = await sql.query('SELECT NOW()');

    res.json({
      mongo: mongoData,
      sql: result.rows[0],
    });
  } catch (err) {
    console.error('[Status] Error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

/** === Export Lambda Handler === **/
const server = awsServerlessExpress.createServer(app);

export { app };

export const handler = (event, context) =>
  awsServerlessExpress.proxy(server, event, context);
