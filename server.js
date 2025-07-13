import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { MongoClient } from 'mongodb';
import { Client } from 'pg';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// MongoDB configuration
const MONGODB_USER = process.env.MONGODB_USER;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;
let MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'ai_sql_assistant';

if (!MONGODB_URL && MONGODB_USER && MONGODB_PASSWORD) {
  // Build the URL from user and password
  MONGODB_URL = `mongodb+srv://${encodeURIComponent(MONGODB_USER)}:${encodeURIComponent(MONGODB_PASSWORD)}@cluster0.uw9b9d6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
}

// AI API configuration
const AI_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
const AI_API_KEY = process.env.OPENROUTER_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistralai/mistral-7b-instruct';

// MongoDB connection
let mongoClient = null;
let db = null;
let chatSessionsCollection = null;
let reportsCollection = null;

// PostgreSQL connection
let pgClient = null;
let dbConnection = null;
let dbCredentials = null;

// Global variables
let chatHistory = [];

// Initialize MongoDB
async function initMongoDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    mongoClient = new MongoClient(MONGODB_URL);
    await mongoClient.connect();
    db = mongoClient.db(MONGODB_DB_NAME);
    
    // Initialize collections
    chatSessionsCollection = db.collection('chat_sessions');
    reportsCollection = db.collection('reports');
    
    // Create indexes
    await chatSessionsCollection.createIndex({ session_id: 1 }, { unique: true });
    await chatSessionsCollection.createIndex({ created_at: -1 });
    await chatSessionsCollection.createIndex({ last_activity: -1 });
    await reportsCollection.createIndex({ created_at: -1 });
    await reportsCollection.createIndex({ id: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully!');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
}

// Helper functions
function generateSessionId() {
  return uuidv4();
}

function cleanSQLResponse(sqlResponse) {
  // Remove markdown code blocks
  let cleaned = sqlResponse.replace(/```sql\s*/g, '').replace(/```\s*$/g, '');
  cleaned = cleaned.replace(/```\s*/g, '').replace(/```\s*$/g, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // Ensure it ends with semicolon
  if (!cleaned.endsWith(';')) {
    cleaned += ';';
  }
  
  return cleaned;
}

function convertDecimalsToFloats(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'boolean') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertDecimalsToFloats(item));
  }
  
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Decimal') {
        result[key] = parseFloat(value.toString());
      } else {
        result[key] = convertDecimalsToFloats(value);
      }
    }
    return result;
  }
  
  return obj;
}

// Database functions
async function getAllTables() {
  if (!pgClient) {
    throw new Error('No database connection');
  }
  
  try {
    console.log('[DB] About to get all tables...');
    const result = await pgClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('[DB] All tables fetched successfully!');
    const tables = result.rows.map(row => row.table_name);
    console.log(`🔍 Found ${tables.length} tables: ${tables}`);
    return tables;
  } catch (error) {
    console.error('Error getting tables:', error);
    throw error;
  }
}

async function getTableColumns(tableName) {
  if (!pgClient) {
    throw new Error('No database connection');
  }
  
  try {
    console.log(`[DB] About to get columns for table: ${tableName}...`);
    const result = await pgClient.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    console.log(`[DB] Columns fetched for ${tableName} successfully!`);
    const columns = result.rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES'
    }));
    
    console.log(`🔍 Table ${tableName} has ${columns.length} columns: ${columns.map(col => col.name)}`);
    return columns;
  } catch (error) {
    console.error(`Error getting columns for table ${tableName}:`, error);
    throw error;
  }
}

async function executeSQLQuery(sqlQuery) {
  if (!pgClient) {
    throw new Error('No database connection');
  }
  
  try {
    console.log(`[DB] About to execute SQL query: ${sqlQuery.substring(0, 50)}...`);
    const result = await pgClient.query(sqlQuery);
    console.log(`[DB] Query executed successfully!`);
    
    // Convert results to plain objects and handle special types
    const rows = result.rows.map(row => {
      const plainRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value && typeof value === 'object' && value.toISOString) {
          plainRow[key] = value.toISOString();
        } else if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Decimal') {
          plainRow[key] = parseFloat(value.toString());
        } else {
          plainRow[key] = value;
        }
      }
      return plainRow;
    });
    
    return rows;
  } catch (error) {
    console.error('Error executing SQL query:', error);
    throw new Error(`SQL execution failed: ${error.message}`);
  }
}

// AI functions
async function askAIForRelevantTables(question, allTables, chatHistory = []) {
  if (!AI_API_KEY) {
    // Fallback: simple keyword matching
    console.log('⚠️  No AI API key, using keyword matching fallback');
    
    // Check if this looks like a follow-up question
    const followUpIndicators = ['more', 'details', 'show', 'filter', 'sort', 'order', 'limit', 'top', 'recent', 'latest', 'previous', 'last'];
    const questionLower = question.toLowerCase();
    
    // If it's likely a follow-up question, reuse tables from the last query
    if (followUpIndicators.some(indicator => questionLower.includes(indicator)) && chatHistory.length > 0) {
      const lastQuery = chatHistory[chatHistory.length - 1];
      console.log(`🔍 Detected follow-up question, reusing tables: ${lastQuery.tables_used}`);
      return lastQuery.tables_used;
    }
    
    // Otherwise, do keyword matching
    const relevantTables = [];
    for (const table of allTables) {
      if (questionLower.includes(table.toLowerCase()) || questionLower.split(' ').some(word => table.toLowerCase().includes(word))) {
        relevantTables.push(table);
      }
    }
    
    return relevantTables.slice(0, 2); // Limit to 2 most relevant tables
  }
  
  try {
    // Build enhanced context from recent chat history (last 2 interactions)
    let context = '';
    if (chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-2); // Last 2 interactions for better focus
      context = '\n\nRecent conversation context:\n';
      for (let i = 0; i < recentHistory.length; i++) {
        const entry = recentHistory[i];
        context += `Previous question ${i + 1}: ${entry.question}\n`;
        context += `Tables used: ${entry.tables_used.join(', ')}\n`;
        context += `SQL: ${entry.sql}\n`;
        context += `Results: ${entry.result_count} rows\n`;
        
        // Include sample data from results for better context
        if (entry.results && entry.results.length > 0) {
          const sampleData = entry.results[0]; // First row as example
          context += `Sample data: ${Object.entries(sampleData).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
        }
        context += '\n';
      }
    }
    
    const prompt = `
Given this question: "${question}"

Available tables: ${allTables.join(', ')}
${context}

Which tables are most relevant to answer this question? 
Return only the table names separated by commas, no explanation.
    `;
    
    const response = await axios.post(AI_API_URL, {
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: 'You are a database expert. Return only table names separated by commas.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://askbase.local',
        'X-Title': 'AskBase'
      }
    });
    
    const aiResponse = response.data.choices[0].message.content.trim();
    
    // Parse the response to get table names
    const relevantTables = aiResponse.split(',').map(table => table.trim()).filter(table => allTables.includes(table));
    
    console.log(`🔍 AI suggested tables: ${relevantTables}`);
    return relevantTables;
  } catch (error) {
    console.error('Error asking AI for relevant tables:', error);
    // Fallback to keyword matching
    return askAIForRelevantTables(question, allTables, chatHistory);
  }
}

async function askAIForSQL(question, relevantTables, chatHistory = []) {
  if (!AI_API_KEY) {
    // Fallback: simple SELECT query
    console.log('⚠️  No AI API key, using simple SELECT fallback');
    if (relevantTables.length > 0) {
      const tableName = relevantTables[0].name;
      const columns = relevantTables[0].columns.map(col => col.name);
      return `SELECT ${columns.join(', ')} FROM "${tableName}" LIMIT 5;`;
    }
    return 'SELECT 1;';
  }
  
  try {
    // Build schema description
    let schemaDesc = '';
    for (const tableInfo of relevantTables) {
      const tableName = tableInfo.name;
      const columns = tableInfo.columns;
      schemaDesc += `\nTable: ${tableName}\n`;
      for (const col of columns) {
        schemaDesc += `  - ${col.name}: ${col.type}\n`;
      }
    }
    
    // Build context from recent chat history
    let context = '';
    if (chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-2);
      context = '\n\nRecent conversation context:\n';
      for (let i = 0; i < recentHistory.length; i++) {
        const entry = recentHistory[i];
        context += `Previous question ${i + 1}: ${entry.question}\n`;
        context += `Previous SQL: ${entry.sql}\n`;
        context += `Previous results: ${entry.result_count} rows\n`;
      }
    }
    
    const prompt = `
Given this question: "${question}"

And these table schemas:
${schemaDesc}
${context}

Generate a SQL query to answer the question.

CRITICAL SQL GUIDELINES:
1. Use PostgreSQL syntax:
   - Use double quotes (") for identifiers, NOT backticks (\`)
   - Use single quotes (') for string literals
   - Use CURRENT_TIMESTAMP instead of NOW()
2. ALWAYS qualify column names with table names to avoid ambiguity:
   - Use "users"."id" instead of just "id"
   - Use "orders"."total_amount" instead of just "total_amount"
3. NEVER use window functions (ROW_NUMBER(), RANK(), etc.) in WHERE clauses
4. Keep queries simple - avoid complex nested subqueries
5. Always use LIMIT 10 or less to avoid large result sets

Return only the SQL query, no explanation.
    `;
    
    const response = await axios.post(AI_API_URL, {
      model: MISTRAL_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are a PostgreSQL SQL expert. NEVER use window functions (ROW_NUMBER, RANK, etc.) in WHERE clauses - use subqueries instead. Return ONLY the raw SQL query with NO markdown formatting, NO code blocks, NO explanations.' 
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://askbase.local',
        'X-Title': 'AskBase'
      }
    });
    
    const sqlQuery = response.data.choices[0].message.content.trim();
    const cleanedSQL = cleanSQLResponse(sqlQuery);
    
    console.log(`🔍 AI generated SQL: ${cleanedSQL}`);
    return cleanedSQL;
  } catch (error) {
    console.error('Error asking AI for SQL:', error);
    // Fallback to simple SELECT
    if (relevantTables.length > 0) {
      const tableName = relevantTables[0].name;
      const columns = relevantTables[0].columns.map(col => col.name);
      return `SELECT ${columns.join(', ')} FROM "${tableName}" LIMIT 5;`;
    }
    return 'SELECT 1;';
  }
}

async function generateNaturalLanguageAnswer(question, sqlQuery, results, tablesUsed, chatHistory = []) {
  if (!AI_API_KEY) {
    // Fallback: simple answer
    console.log('⚠️  No AI API key, using simple answer fallback');
    return `Found ${results.length} results from the query.`;
  }
  
  try {
    // Build context from recent chat history
    let context = '';
    if (chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-2);
      context = '\n\nRecent conversation context:\n';
      for (let i = 0; i < recentHistory.length; i++) {
        const entry = recentHistory[i];
        context += `Previous question ${i + 1}: ${entry.question}\n`;
        context += `Previous answer: ${entry.answer}\n`;
      }
    }
    
    const prompt = `
Given this question: "${question}"

SQL query executed: ${sqlQuery}
Tables used: ${tablesUsed.join(', ')}
Number of results: ${results.length}
${context}

Generate a natural language answer based on the SQL results. Keep it concise and informative.
    `;
    
    const response = await axios.post(AI_API_URL, {
      model: MISTRAL_MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://askbase.local',
        'X-Title': 'AskBase'
      }
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating natural language answer:', error);
    return `Found ${results.length} results from the query.`;
  }
}

// MongoDB session functions
async function saveChatSession(sessionData) {
  try {
    const session = {
      session_id: sessionData.session_id,
      created_at: new Date(),
      last_activity: new Date(),
      database_connection: sessionData.database_connection,
      ai_model_used: sessionData.ai_model_used || MISTRAL_MODEL,
      status: 'active',
      messages: sessionData.messages || [],
      metadata: sessionData.metadata || {
        total_execution_time_ms: 0,
        tables_accessed: [],
        message_count: 0
      }
    };
    
    await chatSessionsCollection.insertOne(session);
    return true;
  } catch (error) {
    console.error('Error saving chat session:', error);
    return false;
  }
}

async function getChatSession(sessionId) {
  try {
    const session = await chatSessionsCollection.findOne({ session_id: sessionId });
    return session;
  } catch (error) {
    console.error('Error getting chat session:', error);
    return null;
  }
}

async function updateChatSession(sessionId, updateData) {
  try {
    const result = await chatSessionsCollection.updateOne(
      { session_id: sessionId },
      { 
        $set: { 
          ...updateData,
          last_activity: new Date()
        } 
      }
    );
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Error updating chat session:', error);
    return false;
  }
}

// Chart detection and generation
function detectChartRequest(question) {
  /**
   * Detect if the user is requesting a chart and determine the chart type.
   * Returns chart configuration or None if no chart is requested.
   */
  const questionLower = question.toLowerCase();
  
  // Chart type detection patterns
  const chartPatterns = {
    'bar': [
      /\b(bar|bar chart|bar graph|bars)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(bar)\b/,
      /\b(visualize|visualise)\s+.*\b(bar)\b/
    ],
    'line': [
      /\b(line|line chart|line graph|trend|trends)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(line)\b/,
      /\b(visualize|visualise)\s+.*\b(line)\b/,
      /\b(over time|time series|timeline)\b/
    ],
    'pie': [
      /\b(pie|pie chart|pie graph|percentage|proportion|distribution)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(pie)\b/,
      /\b(visualize|visualise)\s+.*\b(pie)\b/,
      /\b(breakdown|composition|split)\b/
    ],
    'scatter': [
      /\b(scatter|scatter plot|scatter chart|correlation)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(scatter)\b/,
      /\b(visualize|visualise)\s+.*\b(scatter)\b/,
      /\b(relationship between|correlation between)\b/
    ]
  };
  
  // Check for chart keywords
  for (const [chartType, patterns] of Object.entries(chartPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(questionLower)) {
        return {
          type: chartType,
          requested: true,
          confidence: 'high'
        };
      }
    }
  }
  
  // Check for general visualization requests
  const vizKeywords = ['chart', 'graph', 'plot', 'visualize', 'visualise', 'diagram'];
  for (const keyword of vizKeywords) {
    if (questionLower.includes(keyword)) {
      // Default to bar chart for general visualization requests
      return {
        type: 'bar',
        requested: true,
        confidence: 'medium'
      };
    }
  }
  
  return {
    type: null,
    requested: false,
    confidence: 'none'
  };
}

function generateChartData(results, chartType) {
  /**
   * Generate chart data from SQL results.
   * Returns null if chart cannot be generated.
   */
  if (!results || results.length === 0) {
    return null;
  }
  
  try {
    // Get column names from first result
    const columns = Object.keys(results[0]);
    
    if (columns.length < 2) {
      return null;
    }
    
    // For bar, line, and pie charts, we need at least 2 columns
    if (['bar', 'line', 'pie'].includes(chartType)) {
      if (columns.length < 2) {
        return null;
      }
      
      // Use first column as labels/categories, second as values
      const labelCol = columns[0];
      const valueCol = columns[1];
      
      // Check if value column contains numeric data
      const numericValues = [];
      const labels = [];
      
      for (const row of results) {
        try {
          const value = parseFloat(row[valueCol]);
          if (!isNaN(value)) {
            numericValues.push(value);
            labels.push(String(row[labelCol]));
          }
        } catch (error) {
          continue;
        }
      }
      
      if (numericValues.length === 0) {
        return null;
      }
      
      if (chartType === 'bar') {
        return {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: valueCol,
              data: numericValues,
              backgroundColor: 'rgba(59, 130, 246, 0.8)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: `${valueCol} by ${labelCol}`
              }
            }
          }
        };
      }
      
      else if (chartType === 'line') {
        return {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: valueCol,
              data: numericValues,
              borderColor: 'rgba(59, 130, 246, 1)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: `${valueCol} over ${labelCol}`
              }
            }
          }
        };
      }
      
      else if (chartType === 'pie') {
        return {
          type: 'pie',
          data: {
            labels: labels,
            datasets: [{
              data: numericValues,
              backgroundColor: [
                'rgba(59, 130, 246, 0.8)',
                'rgba(147, 51, 234, 0.8)',
                'rgba(236, 72, 153, 0.8)',
                'rgba(34, 197, 94, 0.8)',
                'rgba(251, 146, 60, 0.8)'
              ]
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: `Distribution of ${valueCol}`
              }
            }
          }
        };
      }
    }
    
    else if (chartType === 'scatter') {
      if (columns.length < 3) {
        return null;
      }
      
      // For scatter plot, we need at least 3 columns: x, y, and optionally label
      const xCol = columns[0];
      const yCol = columns[1];
      const labelCol = columns.length > 2 ? columns[2] : null;
      
      const points = [];
      for (const row of results) {
        try {
          const x = parseFloat(row[xCol]);
          const y = parseFloat(row[yCol]);
          if (!isNaN(x) && !isNaN(y)) {
            const point = { x: x, y: y };
            if (labelCol) {
              point.label = String(row[labelCol]);
            }
            points.push(point);
          }
        } catch (error) {
          continue;
        }
      }
      
      if (points.length === 0) {
        return null;
      }
      
      return {
        type: 'scatter',
        data: {
          datasets: [{
            label: `${yCol} vs ${xCol}`,
            data: points,
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: 'rgba(59, 130, 246, 1)',
            pointRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: `${yCol} vs ${xCol}`
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: xCol
              }
            },
            y: {
              title: {
                display: true,
                text: yCol
              }
            }
          }
        }
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error generating chart data:', error);
    return null;
  }
}

// Add a helper for logging DB connection attempts
function logDbConnectionAttempt({ host, port, database, user }) {
  console.log('[DB CONNECT ATTEMPT]', { host, port, database, user });
}

// Setup middleware immediately
app.use(helmet());
app.use(compression());

// CORS
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - disable in Lambda as it's handled by API Gateway
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use(limiter);
}

// Define all routes immediately
console.log('🔄 Setting up routes...');

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'AskBase API' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test route
app.get('/test', (req, res) => {
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
});

// Database connection route
app.post('/connect-db', async (req, res) => {
  try {
    const { host, port, database, username, password } = req.body;
    logDbConnectionAttempt({ host, port, database, user: username });
    
    // Add DNS resolution debugging
    console.log('[DNS] Attempting to resolve host:', host);
    try {
      const dns = require('dns');
      const { promisify } = require('util');
      const resolve4 = promisify(dns.resolve4);
      const addresses = await resolve4(host);
      console.log('[DNS] Resolved addresses:', addresses);
    } catch (dnsError) {
      console.error('[DNS] Resolution failed:', dnsError.message);
    }
    
    const client = new Client({
      host,
      port,
      database,
      user: username,
      password,
      // Add connection timeout and retry options
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
      statement_timeout: 10000,
      // Add keepAlive to maintain connection
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    
    try {
      console.log('[DB] About to connect...');
      await client.connect();
      console.log('[DB] Connected!');
    } catch (err) {
      console.error('[DB CONNECT ERROR]', err);
      return res.status(500).json({
        error: 'Database connection error',
        message: err.message,
        details: err.stack,
      });
    }
    // Test the connection
    let versionResult;
    try {
      console.log('[DB] About to query version...');
      versionResult = await client.query('SELECT version();');
      console.log('[DB] Version query successful!');
    } catch (err) {
      await client.end();
      console.error('[DB QUERY ERROR] version', err);
      return res.status(500).json({
        error: 'Failed to query database',
        message: err.message,
        details: err.stack,
      });
    }
    try {
      console.log('[DB] About to end connection...');
      await client.end();
      console.log('[DB] Connection ended!');
    } catch (err) {
      console.error('[DB END ERROR]', err);
    }
    res.json({
      status: 'success',
      message: 'Database connected successfully',
      version: versionResult.rows[0].version,
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      error: 'Database connection error',
      message: error.message,
      details: error.stack,
    });
  }
});

// Chat routes
app.post('/ask', async (req, res) => {
  let client;
  try {
    const { question, session_id, db } = req.body;

    if (!question) {
      return res.status(400).json({
        error: 'Missing question',
        message: 'Question is required'
      });
    }

    if (!db || !db.host || !db.port || !db.database || !db.username || !db.password) {
      return res.status(400).json({
        error: 'Missing database credentials',
        message: 'Database credentials are required'
      });
    }

    logDbConnectionAttempt({
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.username,
    });

    client = new Client({
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.username,
      password: db.password,
    });

    try {
      console.log('[DB] About to connect...');
      await client.connect();
      console.log('[DB] Connected!');
    } catch (err) {
      console.error('[DB CONNECT ERROR]', err);
      return res.status(500).json({
        error: 'Database connection error',
        message: err.message,
        details: err.stack,
      });
    }

    if (!client) {
      return res.status(400).json({
        error: 'No database connection',
        message: 'Please connect to a database first'
      });
    }

    console.log(`🔍 Processing question: ${question}`);

    // Step 1: Get or create session
    let currentSessionId = session_id;
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      console.log(`🔍 Created new session: ${currentSessionId}`);
    }

    // Step 2: Get all tables
    let allTables;
    try {
      allTables = await getAllTables();
    } catch (err) {
      console.error('[DB QUERY ERROR] getAllTables', err);
      return res.status(500).json({
        error: 'Failed to get tables',
        message: err.message,
        details: err.stack,
      });
    }

    // Step 3: Use AI to find relevant tables (with chat history context)
    let relevantTableNames;
    try {
      relevantTableNames = await askAIForRelevantTables(question, allTables, chatHistory);
    } catch (err) {
      console.error('[AI ERROR] askAIForRelevantTables', err);
      return res.status(500).json({
        error: 'Failed to find relevant tables',
        message: err.message,
        details: err.stack,
      });
    }

    if (!relevantTableNames || relevantTableNames.length === 0) {
      return res.status(400).json({
        error: 'No relevant tables found',
        message: 'No relevant tables found for your question.'
      });
    }

    console.log(`🔍 Relevant tables: ${relevantTableNames}`);

    // Step 4: Get column information for relevant tables
    const relevantTables = [];
    for (const tableName of relevantTableNames) {
      try {
        const columns = await getTableColumns(tableName);
        relevantTables.push({
          name: tableName,
          columns: columns
        });
      } catch (err) {
        console.error(`[DB QUERY ERROR] getTableColumns for ${tableName}`, err);
        return res.status(500).json({
          error: 'Failed to get table columns',
          message: err.message,
          details: err.stack,
        });
      }
    }

    // Step 5: Use AI to generate SQL query (with chat history context)
    let sqlQuery;
    try {
      sqlQuery = await askAIForSQL(question, relevantTables, chatHistory);
    } catch (err) {
      console.error('[AI ERROR] askAIForSQL', err);
      return res.status(500).json({
        error: 'Failed to generate SQL',
        message: err.message,
        details: err.stack,
      });
    }

    console.log(`🔍 Generated SQL: ${sqlQuery}`);

    // Step 6: Execute SQL query
    let results;
    const startTime = Date.now();
    try {
      results = await executeSQLQuery(sqlQuery);
      console.log(`🔍 Query executed successfully, got ${results.length} results`);
    } catch (err) {
      console.error('[DB QUERY ERROR] executeSQLQuery', err);
      return res.status(500).json({
        error: 'Failed to execute SQL query',
        message: err.message,
        details: err.stack,
      });
    }
    const executionTime = Date.now() - startTime;

    // Step 7: Check for chart request and generate chart data
    const chartRequest = detectChartRequest(question);
    let chartData = null;
    
    if (chartRequest.requested && results.length > 0) {
      chartData = generateChartData(results, chartRequest.type);
      if (chartData) {
        console.log(`🔍 Generated ${chartRequest.type} chart`);
      } else {
        console.log(`❌ Could not generate ${chartRequest.type} chart from results`);
      }
    }

    // Step 8: Generate natural language answer
    let naturalAnswer;
    try {
      naturalAnswer = await generateNaturalLanguageAnswer(question, sqlQuery, results, relevantTableNames, chatHistory);
      console.log(`🔍 Generated natural language answer`);
    } catch (err) {
      console.error('[AI ERROR] generateNaturalLanguageAnswer', err);
      return res.status(500).json({
        error: 'Failed to generate natural language answer',
        message: err.message,
        details: err.stack,
      });
    }

    // Step 9: Store in chat history (in-memory)
    const chatEntry = {
      id: chatHistory.length + 1,
      timestamp: new Date().toISOString(),
      question: question,
      sql: sqlQuery,
      results: results,
      tables_used: relevantTableNames,
      result_count: results.length,
      answer: naturalAnswer,
      chart_data: chartData
    };
    chatHistory.push(chatEntry);

    // Step 10: Save to MongoDB session
    const messageData = {
      message_id: chatHistory.length,
      timestamp: new Date(),
      type: 'user_question',
      question: question,
      sql_query: sqlQuery,
      tables_used: relevantTableNames,
      result_count: results.length,
      result_sample: results.slice(0, 5), // Store sample results
      natural_answer: naturalAnswer,
      execution_time_ms: executionTime,
      is_followup_question: chatHistory.length > 1,
      chart_data: chartData
    };

    try {
      await saveChatSession({
        session_id: currentSessionId,
        message: messageData
      });
      console.log(`💾 Saved message to session ${currentSessionId}`);
    } catch (err) {
      console.error('Error saving to MongoDB:', err);
      // Don't fail the request if MongoDB save fails
    }

    // Step 11: Prepare response
    const resultSample = results.slice(0, 5);

    const response = {
      answer: naturalAnswer,
      sql: sqlQuery,
      results: resultSample,
      tables_used: relevantTableNames,
      chat_id: chatEntry.id,
      session_id: currentSessionId,
      execution_time_ms: executionTime,
      chart_data: chartData
    };

    console.log(`✅ Request completed in ${executionTime}ms`);
    res.json(response);

  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: error.stack
    });
  } finally {
    if (client) {
      try {
        await client.end();
        console.log('[DB] Client connection ended in finally block');
      } catch (err) {
        console.error('[DB END ERROR] in finally block', err);
      }
    }
  }
});

// Chat history routes
app.get('/chat-history', (req, res) => {
  res.json({
    history: chatHistory
  });
});

app.delete('/chat-history', (req, res) => {
  chatHistory = [];
  res.json({ message: 'Chat history cleared' });
});

// Reports routes
app.get('/reports', async (req, res) => {
  try {
    const reports = await reportsCollection.find({}).sort({ created_at: -1 }).toArray();
    const formattedReports = reports.map(report => ({
      ...report,
      _id: report._id.toString(),
      created_at: report.created_at.toISOString(),
      updated_at: report.updated_at.toISOString()
    }));
    res.json(formattedReports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message: error.message
    });
  }
});

app.post('/reports', async (req, res) => {
  try {
    const report = req.body;
    report.created_at = new Date();
    report.updated_at = new Date();
    
    const result = await reportsCollection.insertOne(report);
    report._id = result.insertedId.toString();
    report.created_at = report.created_at.toISOString();
    report.updated_at = report.updated_at.toISOString();
    
    res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      error: 'Failed to create report',
      message: error.message
    });
  }
});

app.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await reportsCollection.findOne({ id });
    
    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
        message: `Report with id ${id} not found`
      });
    }
    
    report._id = report._id.toString();
    report.created_at = report.created_at.toISOString();
    report.updated_at = report.updated_at.toISOString();
    
    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      error: 'Failed to fetch report',
      message: error.message
    });
  }
});

app.put('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    updateData.updated_at = new Date();
    
    const result = await reportsCollection.updateOne(
      { id },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: 'Report not found',
        message: `Report with id ${id} not found`
      });
    }
    
    res.json({ message: 'Report updated successfully' });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message: error.message
    });
  }
});

app.delete('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reportsCollection.deleteOne({ id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: 'Report not found',
        message: `Report with id ${id} not found`
      });
    }
    
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message: error.message
    });
  }
});

// Sessions routes
app.get('/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const sessions = await chatSessionsCollection
      .find({})
      .sort({ last_activity: -1 })
      .limit(limit)
      .toArray();

    const formattedSessions = sessions.map(session => {
      // Handle date conversion safely
      let created_at = session.created_at;
      let last_activity = session.last_activity;
      
      if (created_at instanceof Date) {
        created_at = created_at.toISOString();
      } else if (typeof created_at !== 'string') {
        created_at = new Date().toISOString();
      }
      
      if (last_activity instanceof Date) {
        last_activity = last_activity.toISOString();
      } else if (typeof last_activity !== 'string') {
        last_activity = new Date().toISOString();
      }
      
      return {
        session_id: session.session_id,
        created_at: created_at,
        last_activity: last_activity,
        database_connection: session.database_connection,
        ai_model_used: session.ai_model_used,
        message_count: session.message_count || 0,
        metadata: session.metadata || {
          total_execution_time_ms: 0,
          tables_accessed: []
        },
        status: session.status || 'active'
      };
    });

    res.json({
      sessions: formattedSessions
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error.message
    });
  }
});

app.get('/sessions/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    
    const session = await chatSessionsCollection.findOne({ session_id });
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with id ${session_id} not found`
      });
    }

    session._id = session._id.toString();
    
    // Handle date conversion safely
    if (session.created_at instanceof Date) {
      session.created_at = session.created_at.toISOString();
    } else if (typeof session.created_at !== 'string') {
      session.created_at = new Date().toISOString();
    }
    
    if (session.last_activity instanceof Date) {
      session.last_activity = session.last_activity.toISOString();
    } else if (typeof session.last_activity !== 'string') {
      session.last_activity = new Date().toISOString();
    }

    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error.message
    });
  }
});

app.delete('/sessions/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    
    const result = await chatSessionsCollection.deleteOne({ session_id });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with id ${session_id} not found`
      });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      message: error.message
    });
  }
});

app.post('/sessions/:session_id/restore', async (req, res) => {
  try {
    const { session_id } = req.params;
    
    const session = await chatSessionsCollection.findOne({ session_id });
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with id ${session_id} not found`
      });
    }

    // Convert session messages back to chat history format
    chatHistory = [];
    for (const message of session.messages) {
      // Convert datetime to ISO string for frontend
      let timestamp = message.timestamp;
      if (timestamp instanceof Date) {
        timestamp = timestamp.toISOString();
      }
      
      const chatEntry = {
        id: message.message_id,
        timestamp: timestamp,
        question: message.question,
        sql: message.sql_query,
        results: message.result_sample, // Note: we only stored sample results
        tables_used: message.tables_used,
        result_count: message.result_count,
        answer: message.natural_answer,
        chart_data: message.chart_data // Add chart_data if present
      };
      chatHistory.push(chatEntry);
    }

    // Update last activity
    await chatSessionsCollection.updateOne(
      { session_id },
      { 
        $set: { 
          last_activity: new Date(),
          status: 'active'
        } 
      }
    );

    session._id = session._id.toString();
    
    // Handle date conversion safely
    if (session.created_at instanceof Date) {
      session.created_at = session.created_at.toISOString();
    } else if (typeof session.created_at !== 'string') {
      session.created_at = new Date().toISOString();
    }
    
    if (session.last_activity instanceof Date) {
      session.last_activity = session.last_activity.toISOString();
    } else if (typeof session.last_activity !== 'string') {
      session.last_activity = new Date().toISOString();
    }

    res.json({
      message: `Session restored with ${chatHistory.length} messages`,
      session_id: session_id,
      message_count: chatHistory.length,
      chat_history: chatHistory // Return the actual chat history
    });
  } catch (error) {
    console.error('Error restoring session:', error);
    res.status(500).json({
      error: 'Failed to restore session',
      message: error.message
    });
  }
});

// Test MongoDB connection endpoint
app.get('/test-mongo', async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ 
      message: 'MongoDB connection successful!',
      database: MONGODB_DB_NAME,
      collections: await db.listCollections().toArray()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ All routes setup completed');

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

async function initServer() {
  // 1. Initialize MongoDB
  const mongoConnected = await initMongoDB();
  if (!mongoConnected) {
    console.error('Failed to connect to MongoDB');
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      // In Lambda, don't exit process, just log error
      console.error('MongoDB connection failed in Lambda environment');
    } else {
      process.exit(1);
    }
  }

  console.log('✅ MongoDB initialized');

  // 4. Start server only if not in Lambda
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// Start the server
initServer().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (pgClient) {
    pgClient.end();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  if (pgClient) {
    pgClient.end();
  }
  process.exit(0);
});

// Export for testing
export { app, db, mongoClient, pgClient }; 