import { getMongoClient, MONGODB_DB_NAME } from '../config/database.js';
import { getSqlPool } from '../config/database.js';

// Save a new database connection for a user
export async function saveDatabaseConnection(req, res) {
  try {
    const { clerk_id, connection_name, host, port, database, username, password, database_type } = req.body;
    
    if (!clerk_id || !host || !database || !username || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'clerk_id, host, database, username, and password are required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');

    // Test the connection first
    try {
      const testConnection = {
        host,
        port: parseInt(port) || 5432,
        database,
        user: username,
        password,
        pool_mode: 'transaction'
      };

      // Test PostgreSQL connection
      const testPool = new (await import('pg')).Pool({
        host: testConnection.host,
        port: testConnection.port,
        database: testConnection.database,
        user: testConnection.user,
        password: testConnection.password,
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 5000,
      });

      await testPool.query('SELECT 1');
      await testPool.end();

      // Save the connection
      const connectionData = {
        clerk_id,
        connection_name: connection_name || `${host}/${database}`,
        host,
        port: parseInt(port) || 5432,
        database,
        username,
        password: password, // In production, this should be encrypted
        database_type: database_type || 'postgresql',
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        is_active: true
      };

      const result = await connectionsCollection.insertOne(connectionData);
      
      res.status(201).json({ 
        success: true, 
        message: 'Database connection saved successfully',
        connection_id: result.insertedId,
        connection: {
          id: result.insertedId,
          connection_name: connectionData.connection_name,
          host: connectionData.host,
          database: connectionData.database,
          database_type: connectionData.database_type
        }
      });
    } catch (error) {
      return res.status(400).json({ 
        error: 'Connection failed', 
        message: `Failed to connect to database: ${error.message}` 
      });
    }
  } catch (error) {
    console.error('[Database-Connections-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to save database connection', 
      message: error.message 
    });
  }
}

// Get all database connections for a user
export async function getUserDatabaseConnections(req, res) {
  try {
    const { clerk_id } = req.params;
    
    if (!clerk_id) {
      return res.status(400).json({ 
        error: 'Missing clerk_id', 
        message: 'clerk_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');

    const connections = await connectionsCollection.find({ 
      clerk_id, 
      is_active: true 
    }).project({
      password: 0 // Don't return passwords
    }).toArray();

    res.json({ 
      success: true, 
      connections: connections.map(conn => ({
        id: conn._id,
        connection_name: conn.connection_name,
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        database_type: conn.database_type,
        created_at: conn.created_at,
        last_used: conn.last_used
      }))
    });
  } catch (error) {
    console.error('[Database-Connections-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get database connections', 
      message: error.message 
    });
  }
}

// Test a database connection
export async function testDatabaseConnection(req, res) {
  try {
    const { host, port, database, username, password } = req.body;
    
    if (!host || !database || !username || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'host, database, username, and password are required' 
      });
    }

    try {
      const { Pool } = await import('pg');
      const testPool = new Pool({
        host,
        port: parseInt(port) || 5432,
        database,
        user: username,
        password,
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 5000,
      });

      const result = await testPool.query('SELECT 1 as test');
      await testPool.end();

      res.json({ 
        success: true, 
        message: 'Database connection successful',
        test_result: result.rows[0]
      });
    } catch (error) {
      return res.status(400).json({ 
        error: 'Connection failed', 
        message: `Failed to connect to database: ${error.message}` 
      });
    }
  } catch (error) {
    console.error('[Database-Connections-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to test database connection', 
      message: error.message 
    });
  }
}

// Update last used timestamp for a connection
export async function updateConnectionLastUsed(req, res) {
  try {
    const { connection_id } = req.params;
    
    if (!connection_id) {
      return res.status(400).json({ 
        error: 'Missing connection_id', 
        message: 'connection_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');

    const result = await connectionsCollection.updateOne(
      { _id: new (await import('mongodb')).ObjectId(connection_id) },
      { $set: { last_used: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Connection last used timestamp updated' 
    });
  } catch (error) {
    console.error('[Database-Connections-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to update connection', 
      message: error.message 
    });
  }
}

// Delete a database connection
export async function deleteDatabaseConnection(req, res) {
  try {
    const { connection_id } = req.params;
    
    if (!connection_id) {
      return res.status(400).json({ 
        error: 'Missing connection_id', 
        message: 'connection_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');

    const result = await connectionsCollection.deleteOne({
      _id: new (await import('mongodb')).ObjectId(connection_id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Database connection deleted successfully' 
    });
  } catch (error) {
    console.error('[Database-Connections-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to delete database connection', 
      message: error.message 
    });
  }
} 

// Get database password for a connection
export async function getDatabasePassword(req, res) {
  try {
    const { connection_id } = req.params;
    
    if (!connection_id) {
      return res.status(400).json({ 
        error: 'Missing connection_id', 
        message: 'connection_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');

    const connection = await connectionsCollection.findOne(
      { _id: new (await import('mongodb')).ObjectId(connection_id) },
      { projection: { password: 1 } }
    );

    if (!connection) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found' 
      });
    }

    res.json({ 
      success: true, 
      password: connection.password 
    });
  } catch (error) {
    console.error('[Database-Connections-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get database password', 
      message: error.message 
    });
  }
} 