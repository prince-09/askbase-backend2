import { getSchema } from '../services/databaseService.js';

// Get database schema
export async function getDatabaseSchema(req, res) {
  try {
    const { connection_id } = req.query;
    
    let schema;
    if (connection_id) {
      // Get database connection details from the database
      const { getDatabaseConnection } = await import('../services/databaseService.js');
      const connection = await getDatabaseConnection(connection_id);
      
      if (!connection) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid connection', 
          message: 'Database connection not found' 
        });
      }
      
      // Use provided database connection
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: connection.host,
        port: parseInt(connection.port) || 5432,
        database: connection.database,
        user: connection.username,
        password: connection.password,
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 5000,
      });

      try {
        // Get all tables
        const tablesResult = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name
        `);

        const tables = tablesResult.rows.map(row => row.table_name);
        const schemaData = {};

        // Get columns for each table
        for (const tableName of tables) {
          const columnsResult = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
            ORDER BY ordinal_position
          `, [tableName]);
          
          schemaData[tableName] = columnsResult.rows;
        }

        await pool.end();
        schema = schemaData;
      } catch (error) {
        await pool.end();
        throw error;
      }
    } else {
      // Use default connection
      schema = await getSchema();
    }
    
    res.json({
      success: true,
      schema: schema,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schema',
      message: error.message
    });
  }
} 