import { generateSessionId, validateSQL } from '../utils/helpers.js';
import { getAllTables, getTableColumns, executeSQLQuery } from '../services/databaseService.js';
import { askAIForRelevantTables, askAIForSQL, generateNaturalLanguageAnswer, generateFallbackSQL } from '../services/aiService.js';
import { getConversationContext, addMessageToSession, createSessionIfNotExists, resetSessionHistory } from '../services/sessionService.js';
import { detectChartRequest, generateChartData } from '../services/chartService.js';

// Main ask endpoint controller with multi-turn context
export async function handleAskRequest(req, res) {
  try {
    const { question, session_id, connection_id } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Missing question', message: 'Question is required' });
    }

    // Step 1: Get or create session
    let currentSessionId = session_id;
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
    }
    await createSessionIfNotExists(currentSessionId);

    // Step 2: Get last few messages for context
    const chatHistory = await getConversationContext(currentSessionId, 6); // last 6 exchanges

    // Step 3: Get all tables (with optional database connection)
    let allTables;
    let dbPool = null;
    try {
      if (connection_id) {
        // Get database connection details from the database
        const { getDatabaseConnection } = await import('../services/databaseService.js');
        const connection = await getDatabaseConnection(connection_id);
        
        if (!connection) {
          return res.status(400).json({ error: 'Invalid connection', message: 'Database connection not found' });
        }
        
        // Create a single database connection to reuse
        const { Pool } = await import('pg');
        dbPool = new Pool({
          host: connection.host,
          port: connection.port || 5432,
          database: connection.database,
          user: connection.username,
          password: connection.password,
          max: 1,
          idleTimeoutMillis: 5000,
          connectionTimeoutMillis: 5000,
        });
        
        // Get tables using the provided connection
        const result = await dbPool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name
        `);
        allTables = result.rows.map(row => row.table_name);
      } else {
        // Use default connection
        allTables = await getAllTables();
      }
    } catch (err) {
      if (dbPool) await dbPool.end();
      return res.status(500).json({ error: 'Failed to get tables', message: err.message });
    }

    // Step 4: Use AI to find relevant tables (with chat history context)
    let relevantTableNames;
    try {
      relevantTableNames = await askAIForRelevantTables(question, allTables, chatHistory);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to find relevant tables', message: err.message });
    }
    if (!relevantTableNames || relevantTableNames.length === 0) {
      return res.status(400).json({ error: 'No relevant tables found', message: 'No relevant tables found for your question.' });
    }

    // Step 5: Get column information for relevant tables
    const relevantTables = [];
    for (const tableName of relevantTableNames) {
      try {
        let columns;
        if (connection_id && dbPool) {
          // Use the existing database connection
          const result = await dbPool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
            ORDER BY ordinal_position
          `, [tableName]);
          columns = result.rows.map(row => ({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES'
          }));
        } else {
          // Use default connection
          columns = await getTableColumns(tableName);
        }
        relevantTables.push({ name: tableName, columns });
      } catch (err) {
        if (dbPool) await dbPool.end();
        return res.status(500).json({ error: 'Failed to get table columns', message: err.message });
      }
    }

    // Step 6: Use AI to generate SQL query (with chat history context)
    let sqlQuery;
    try {
      // Check if this is a follow-up visualization request
      const isVisualizationRequest = /(chart|graph|bar|pie|line|visualize|visualise)/i.test(question);
      const hasPreviousResults = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].sql_query;
      
      if (isVisualizationRequest && hasPreviousResults) {
        // For visualization requests, reuse the previous query with ORDER BY
        const previousQuery = chatHistory[chatHistory.length - 1].sql_query;
        // Add ORDER BY if not already present
        if (!previousQuery.toLowerCase().includes('order by')) {
          sqlQuery = previousQuery.replace(/;?\s*$/, ' ORDER BY 1;');
        } else {
          sqlQuery = previousQuery;
        }
        console.log(`🔍 Reusing previous query for visualization: ${sqlQuery}`);
      } else {
        sqlQuery = await askAIForSQL(question, relevantTables, chatHistory);
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to generate SQL', message: err.message });
    }

    // Step 7: Execute SQL query
    let results;
    const startTime = Date.now();
    console.log(`🔍 Executing SQL: ${sqlQuery}`);
    
    // Validate SQL before execution
    const validation = validateSQL(sqlQuery);
    if (!validation.valid) {
      console.log(`⚠️ Invalid SQL generated: ${sqlQuery}, using fallback`);
      // Use fallback SQL instead of failing
      sqlQuery = generateFallbackSQL(relevantTables, question);
      console.log(`🔍 Using fallback SQL: ${sqlQuery}`);
    }
    
    try {
      if (connection_id && dbPool) {
        // Use the existing database connection
        const result = await dbPool.query(sqlQuery);
        results = result.rows;
      } else {
        // Use default connection
        results = await executeSQLQuery(sqlQuery);
      }
    } catch (err) {
      if (dbPool) await dbPool.end();
      return res.status(500).json({ error: 'Failed to execute SQL query', message: err.message });
    } finally {
      // Clean up the database connection
      if (dbPool) {
        await dbPool.end();
      }
    }
    const executionTime = Date.now() - startTime;

    // Step 8: Check for chart request and generate chart data
    const chartRequest = detectChartRequest(question);
    let chartData = null;
    if (chartRequest.requested && results.length > 0) {
      chartData = generateChartData(results, chartRequest.type);
    }

    // Step 9: Generate natural language answer
    let naturalAnswer;
    try {
      naturalAnswer = await generateNaturalLanguageAnswer(question, sqlQuery, results, relevantTableNames, chatHistory);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to generate natural language answer', message: err.message });
    }

    // Step 10: Save single question-answer message to session (matching Python backend)
    const messageData = {
      message_id: Date.now(),
      timestamp: new Date(),
      type: 'question_answer',
      question: question,
      sql_query: sqlQuery,
      tables_used: relevantTableNames,
      result_count: results.length,
      result_sample: results.slice(0, 5),
      natural_answer: naturalAnswer,
      execution_time_ms: executionTime,
      is_followup_question: chatHistory.length > 0,
      chart_data: chartData
    };
    
    console.log(`🔍 Saving single message to session: ${currentSessionId}`);
    console.log(`🔍 Message data:`, messageData);
    
    const messageSaved = await addMessageToSession(currentSessionId, messageData);
    
    console.log(`🔍 Message saved: ${messageSaved}`);

    // Step 11: Prepare response
    const response = {
      answer: naturalAnswer,
      sql: sqlQuery,
      results: results.slice(0, 5),
      tables_used: relevantTableNames,
      session_id: currentSessionId,
      execution_time_ms: executionTime,
      chart_data: chartData
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Endpoint to reset a session's history
export async function resetSessionHistoryEndpoint(req, res) {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }
    const ok = await resetSessionHistory(session_id);
    if (ok) {
      res.json({ success: true, message: 'Session history reset.' });
    } else {
      res.status(500).json({ error: 'Failed to reset session history.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get chat history
export async function getChatHistory(req, res) {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id parameter' });
    }
    
    const chatHistory = await getConversationContext(session_id, 50); // Get last 50 messages
    res.json({
      history: chatHistory,
      session_id: session_id
    });
  } catch (error) {
    console.error('[Get-Chat-History] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Clear chat history
export async function clearChatHistory(req, res) {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }
    
    const success = await resetSessionHistory(session_id);
    if (success) {
      res.json({ message: 'Chat history cleared', session_id: session_id });
    } else {
      res.status(500).json({ error: 'Failed to clear chat history' });
    }
  } catch (error) {
    console.error('[Clear-Chat-History] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Connect to database
export async function connectDatabase(req, res) {
  try {
    const { getAllTables } = await import('../services/databaseService.js');
    await getAllTables();
    res.json({ status: 'success', message: 'Database connected successfully' });
  } catch (error) {
    console.error('[Connect-DB] Error:', error);
    res.status(500).json({ error: error.message, details: error.stack });
  }
} 