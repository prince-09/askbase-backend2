import { getSqlPool } from '../config/database.js';
import { convertDecimalsToFloats } from '../utils/helpers.js';

// Get all tables from the database
export async function getAllTables(pool = null) {
  const sql = pool || getSqlPool();
  if (!sql) throw new Error('No database connection');
  
  try {
    const result = await sql.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    return result.rows.map(row => row.table_name);
  } catch (error) {
    console.error('Error getting tables:', error);
    throw error;
  }
}

// Get columns for a specific table
export async function getTableColumns(tableName, pool = null) {
  const sql = pool || getSqlPool();
  if (!sql) throw new Error('No database connection');
  
  try {
    const result = await sql.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    return result.rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES'
    }));
  } catch (error) {
    console.error(`Error getting columns for table ${tableName}:`, error);
    throw error;
  }
}

// Get complete schema with tables and columns
export async function getSchema(pool = null) {
  const sql = pool || getSqlPool();
  if (!sql) throw new Error('No database connection');
  try {
    const result = await sql.query(`
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        CASE 
          WHEN pk.column_name IS NOT NULL THEN true 
          ELSE false 
        END as is_primary_key
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
      LEFT JOIN (
        SELECT 
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
      ) pk ON t.table_name = pk.table_name 
        AND c.column_name = pk.column_name
      WHERE t.table_schema = 'public' 
        AND t.table_type = 'BASE TABLE' ORDER BY t.table_name, c.ordinal_position
    `);
    
    // Group by table
    const schema = {};
    result.rows.forEach(row => {
      if (!schema[row.table_name]) {
        schema[row.table_name] = {
          table_name: row.table_name,
          columns: []
        };
      }
      
      if (row.column_name) { // Only add if column exists
        schema[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          default: row.column_default,
          is_primary_key: row.is_primary_key || false
        });
      }
    });
    
    return Object.values(schema);
  } catch (error) {
    console.error('Error getting schema:', error);
    throw error;
  }
}

// Execute SQL query and return results
export async function executeSQLQuery(sqlQuery, pool = null) {
  const sql = pool || getSqlPool();
  if (!sql) throw new Error('No database connection');
  
  try {
    const sqlStatements = sqlQuery.split(';').map(s => s.trim()).filter(Boolean);
    const result = await sql.query(sqlStatements[0]);
    
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
    
    return convertDecimalsToFloats(rows);
  } catch (error) {
    console.error('Error executing SQL query:', error);
    throw new Error(`SQL execution failed: ${error.message}`);
  }
}

// Test database connection
export async function testDatabaseConnection() {
  try {
    const sql = getSqlPool();
    const result = await sql.query('SELECT version();');
    return {
      success: true,
      version: result.rows[0].version
    };
  } catch (error) {
    console.error('Database connection test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get database connection by ID
export async function getDatabaseConnection(connectionId) {
  try {
    const { getMongoClient, MONGODB_DB_NAME } = await import('../config/database.js');
    const { ObjectId } = await import('mongodb');
    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');

    // Convert string ID to ObjectId
    const objectId = new ObjectId(connectionId);
    
    const connection = await connectionsCollection.findOne({ 
      _id: objectId 
    });
    
    if (!connection) {
      return null;
    }
    
    // Convert MongoDB document to expected format
    return {
      id: connection._id.toString(),
      connection_name: connection.connection_name,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: connection.password,
      database_type: connection.database_type,
      created_at: connection.created_at,
      last_used: connection.last_used
    };
  } catch (error) {
    console.error('Error getting database connection:', error);
    throw error;
  }
} 