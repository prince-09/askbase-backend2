import axios from 'axios';
import { AI_API_URL, AI_API_KEY, MISTRAL_MODEL } from '../config/database.js';
import { cleanSQLResponse } from '../utils/helpers.js';

// Ask AI to find relevant tables for a question
export async function askAIForRelevantTables(question, allTables, chatHistory = []) {
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

// Ask AI to generate SQL query
export async function askAIForSQL(question, relevantTables, chatHistory = []) {
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
        schemaDesc += `  - ${col.column_name || col.name}: ${col.data_type || col.type}\n`;
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

Table schemas:
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
5. For "top N" queries, use ORDER BY + LIMIT instead of window functions
6. Always use LIMIT 10 or less to avoid large result sets
7. If this is a follow-up question, build upon the previous query

Examples of GOOD queries:
- SELECT "users"."name", SUM("orders"."total_amount") FROM "users" JOIN "orders" ON "users"."id" = "orders"."user_id" GROUP BY "users"."id", "users"."name" ORDER BY SUM("orders"."total_amount") DESC LIMIT 3;
- SELECT "products"."name" FROM "products" JOIN "order_items" ON "products"."id" = "order_items"."product_id" WHERE "order_items"."order_id" IN (SELECT "id" FROM "orders" ORDER BY "total_amount" DESC LIMIT 3);

Return only the SQL query, no explanation.
    `;
    
    const response = await axios.post(AI_API_URL, {
      model: MISTRAL_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are a PostgreSQL SQL expert. ALWAYS qualify column names with table names (e.g., "users"."id", "orders"."total_amount"). NEVER use window functions in WHERE clauses. Keep queries simple and avoid complex nested subqueries. Use CURRENT_TIMESTAMP instead of NOW(). Return ONLY the raw SQL query with NO markdown formatting, NO code blocks, NO explanations.' 
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
    
    console.log(`🔍 Raw AI SQL: ${sqlQuery}`);
    console.log(`🔍 Cleaned SQL: ${cleanedSQL}`);
    console.log(`🔍 Schema passed to AI: ${schemaDesc}`);
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

// Generate a safe fallback SQL query
export function generateFallbackSQL(relevantTables, question) {
  if (!relevantTables || relevantTables.length === 0) {
    return 'SELECT 1;';
  }
  
  const tableName = relevantTables[0].name;
  const columns = relevantTables[0].columns;
  
  if (!columns || columns.length === 0) {
    return `SELECT * FROM "${tableName}" LIMIT 5;`;
  }
  
  // Get first few columns for a safe query
  const safeColumns = columns.slice(0, 3).map(col => `"${col.name || col.column_name}"`);
  
  return `SELECT ${safeColumns.join(', ')} FROM "${tableName}" LIMIT 5;`;
}

// Generate natural language answer from SQL results
// Main function to generate a complete response for embed requests
export async function generateResponse(question, connection) {
  try {
    // Import required services
    const { getAllTables, getTableColumns, executeSQLQuery } = await import('./databaseService.js');
    const { detectChartRequest, generateChartData } = await import('./chartService.js');
    const { Pool } = await import('pg');

    // Step 1: Create database connection
    const dbPool = new Pool({
      host: connection.host,
      port: connection.port || 5432,
      database: connection.database,
      user: connection.username,
      password: connection.password,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    });

    try {
      // Step 2: Get all tables
      const result = await dbPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      const allTables = result.rows.map(row => row.table_name);

      // Step 3: Find relevant tables
      const relevantTableNames = await askAIForRelevantTables(question, allTables, []);
      if (!relevantTableNames || relevantTableNames.length === 0) {
        throw new Error('No relevant tables found for your question.');
      }

      // Step 4: Get column information for relevant tables
      const relevantTables = [];
      for (const tableName of relevantTableNames) {
        const columnsResult = await dbPool.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [tableName]);
        
        const columns = columnsResult.rows.map(row => ({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES'
        }));
        relevantTables.push({ name: tableName, columns });
      }

      // Step 5: Generate SQL query
      const sqlQuery = await askAIForSQL(question, relevantTables, []);

      // Step 6: Execute SQL query
      const startTime = Date.now();
      const queryResult = await dbPool.query(sqlQuery);
      const results = queryResult.rows;
      const executionTime = Date.now() - startTime;

      // Step 7: Check for chart request and generate chart data
      const chartRequest = detectChartRequest(question);
      let chartData = null;
      if (chartRequest.requested && results.length > 0) {
        chartData = generateChartData(results, chartRequest.type);
      }

      // Step 8: Generate natural language answer
      const naturalAnswer = await generateNaturalLanguageAnswer(question, sqlQuery, results, relevantTableNames, []);

      return {
        success: true,
        question: question,
        sql: sqlQuery,
        results: results.slice(0, 10), // Limit results for embed
        tables_used: relevantTableNames,
        result_count: results.length,
        answer: naturalAnswer,
        execution_time_ms: executionTime,
        chart_data: chartData
      };

    } finally {
      // Clean up the database connection
      await dbPool.end();
    }
      } catch (error) {
      console.error('Error in generateResponse:', error);
      
      // If it's a SQL error, try a simple fallback query
      if (error.message && (
        error.message.includes('SQL') || 
        error.message.includes('syntax') || 
        error.message.includes('missing FROM-clause') ||
        error.message.includes('unterminated quoted string')
      )) {
        try {
          console.log('Attempting fallback query...');
          
          // Try a simple SELECT query from the first available table
          const fallbackResult = await dbPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            LIMIT 1
          `);
          
          if (fallbackResult.rows.length > 0) {
            const tableName = fallbackResult.rows[0].table_name;
            const simpleResult = await dbPool.query(`SELECT * FROM "${tableName}" LIMIT 5`);
            
            return {
              success: true,
              question: question,
              sql: `SELECT * FROM "${tableName}" LIMIT 5`,
              results: simpleResult.rows,
              tables_used: [tableName],
              result_count: simpleResult.rows.length,
              answer: `I encountered an error with the complex query, but here's a simple view of the ${tableName} table with 5 sample records.`,
              execution_time_ms: 0,
              chart_data: null
            };
          }
        } catch (fallbackError) {
          console.error('Fallback query also failed:', fallbackError);
        }
      }
      
      return {
        success: false,
        error: error.message,
        question: question
      };
    }
}

export async function generateNaturalLanguageAnswer(question, sqlQuery, results, tablesUsed, chatHistory = []) {
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
    
    // Format the SQL results data for the AI
    let resultsData = '';
    if (results && results.length > 0) {
      resultsData = '\n\nSQL Results Data:\n';
      // Show first 10 results to give AI enough context
      const resultsToShow = results.slice(0, 10);
      resultsData += JSON.stringify(resultsToShow, null, 2);
      if (results.length > 10) {
        resultsData += `\n\n(Showing first 10 of ${results.length} total results)`;
      }
      
      // Add debugging to see what data is being passed
      console.log(`🔍 Results data being sent to AI:`, resultsToShow);
    } else {
      resultsData = '\n\nSQL Results Data: No data found';
      console.log(`🔍 No results data to send to AI`);
    }
    
    const prompt = `
Given this question: "${question}"

SQL query executed: ${sqlQuery}
Tables used: ${tablesUsed.join(', ')}
Number of results: ${results.length}
${resultsData}
${context}

Generate a natural language answer based on the actual SQL results data provided above. 

CRITICAL REQUIREMENTS:
1. Use ONLY the actual data values from the results provided above
2. Do NOT make assumptions about what the data represents
3. Do NOT use placeholder variables like X, Y, Z
4. Do NOT create fictional data or examples
5. If the results are empty, say "No data found"
6. If the results contain specific values, use those exact values
7. Keep the answer concise and factual
8. Do not interpret what the data "might" represent - just describe what it actually shows
9. Format the response with proper structure:
   - Use bullet points (*) for lists
   - Use bold (**text**) for emphasis
   - Use line breaks for readability
   - Format dates in a readable way
   - Use proper paragraphs

Return only the natural language answer based on the real data provided.
    `;
    
    const response = await axios.post(AI_API_URL, {
      model: MISTRAL_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are a data analyst. Use ONLY the actual data values provided in the SQL results. Do NOT make assumptions or create fictional data. If no data is provided, say "No data found". Be factual and precise with the real data values. Format your responses with proper structure using bullet points (*), bold text (**text**), and line breaks for readability.' 
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://askbase.local',
        'X-Title': 'AskBase'
      }
    });
    
    const aiResponse = response.data.choices[0].message.content;
    
    // Validate that the AI response is based on actual data
    if (results && results.length > 0) {
      // Check if the AI response contains actual data values
      const hasActualData = results.some(result => {
        return Object.values(result).some(value => 
          aiResponse.includes(String(value))
        );
      });
      
      if (!hasActualData) {
        console.log(`⚠️ AI response doesn't contain actual data values, using fallback`);
        const fallbackData = results.slice(0, 3).map(r => 
          Object.entries(r).map(([k,v]) => `${k}: ${v}`).join(', ')
        ).join('; ');
        return `The query returned ${results.length} results. ${fallbackData}`;
      }
    }
    
    return aiResponse;
  } catch (error) {
    console.error('Error generating natural language answer:', error);
    return `Found ${results.length} results from the query.`;
  }
} 