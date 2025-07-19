import { getMongoClient, MONGODB_DB_NAME } from '../config/database.js';
import { getSqlPool } from '../config/database.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

// Generate a new embed key
export async function generateEmbedKey(req, res) {
  try {
    const { clerk_id, connection_id } = req.body;
    
    if (!clerk_id || !connection_id) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'clerk_id and connection_id are required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const connectionsCollection = db.collection('database_connections');
    const embedKeysCollection = db.collection('embed_keys');

    // Verify the connection exists and belongs to the user
    const connection = await connectionsCollection.findOne({ 
      _id: new ObjectId(connection_id), 
      clerk_id, 
      is_active: true 
    });

    if (!connection) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found or not accessible' 
      });
    }

    // Generate a unique embed key
    const embedKey = crypto.randomBytes(32).toString('hex');
    
    // Save the embed key
    const embedKeyData = {
      embed_key: embedKey,
      clerk_id,
      connection_id,
      connection_name: connection.connection_name,
      created_at: new Date().toISOString(),
      is_active: true,
      usage_count: 0,
      last_used: null
    };

    const result = await embedKeysCollection.insertOne(embedKeyData);
    
    res.status(201).json({ 
      success: true, 
      message: 'Embed key generated successfully',
      embed_key: embedKey,
      embed_id: result.insertedId,
      connection_name: connection.connection_name
    });
  } catch (error) {
    console.error('[Embed-Controller] Error generating embed key:', error);
    res.status(500).json({ 
      error: 'Failed to generate embed key', 
      message: error.message 
    });
  }
}

// Validate embed key and return connection details
export async function validateEmbedKey(req, res) {
  try {
    const { embed_key } = req.body;
    
    if (!embed_key) {
      return res.status(400).json({ 
        error: 'Missing embed key', 
        message: 'embed_key is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const embedKeysCollection = db.collection('embed_keys');
    const connectionsCollection = db.collection('database_connections');

    // Find the embed key
    const embedKeyData = await embedKeysCollection.findOne({ 
      embed_key, 
      is_active: true 
    });

    if (!embedKeyData) {
      return res.status(404).json({ 
        error: 'Invalid embed key', 
        message: 'Embed key not found or inactive' 
      });
    }

    // Get the connection details
    const connection = await connectionsCollection.findOne({ 
      _id: new ObjectId(embedKeyData.connection_id), 
      is_active: true 
    });

    if (!connection) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found or inactive' 
      });
    }

    // Update usage stats
    await embedKeysCollection.updateOne(
      { _id: embedKeyData._id },
      { 
        $inc: { usage_count: 1 },
        $set: { last_used: new Date().toISOString() }
      }
    );

    res.json({ 
      success: true, 
      connection: {
        id: connection._id,
        connection_name: connection.connection_name,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        database_type: connection.database_type
      },
      embed_key: embed_key
    });
  } catch (error) {
    console.error('[Embed-Controller] Error validating embed key:', error);
    res.status(500).json({ 
      error: 'Failed to validate embed key', 
      message: error.message 
    });
  }
}

// Handle embed chat requests
export async function handleEmbedAskRequest(req, res) {
  try {
    const { question, embed_key } = req.body;
    
    if (!question || !embed_key) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'question and embed_key are required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const embedKeysCollection = db.collection('embed_keys');
    const connectionsCollection = db.collection('database_connections');

    // Validate embed key
    const embedKeyData = await embedKeysCollection.findOne({ 
      embed_key, 
      is_active: true 
    });

    if (!embedKeyData) {
      return res.status(404).json({ 
        error: 'Invalid embed key', 
        message: 'Embed key not found or inactive' 
      });
    }

    // Get connection details
    const connection = await connectionsCollection.findOne({ 
      _id: new ObjectId(embedKeyData.connection_id), 
      is_active: true 
    });

    if (!connection) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found or inactive' 
      });
    }

    // Import the AI service
    const { generateResponse } = await import('../services/aiService.js');
    
    // Generate response using the connection
    const response = await generateResponse(question, connection);
    
    res.json(response);
  } catch (error) {
    console.error('[Embed-Controller] Error handling embed ask request:', error);
    res.status(500).json({ 
      error: 'Failed to process request', 
      message: error.message 
    });
  }
}

// Get embed schema
export async function getEmbedSchema(req, res) {
  try {
    const { embed_key } = req.query;
    
    if (!embed_key) {
      return res.status(400).json({ 
        error: 'Missing embed key', 
        message: 'embed_key is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const embedKeysCollection = db.collection('embed_keys');
    const connectionsCollection = db.collection('database_connections');

    // Validate embed key
    const embedKeyData = await embedKeysCollection.findOne({ 
      embed_key, 
      is_active: true 
    });

    if (!embedKeyData) {
      return res.status(404).json({ 
        error: 'Invalid embed key', 
        message: 'Embed key not found or inactive' 
      });
    }

    // Get connection details
    const connection = await connectionsCollection.findOne({ 
      _id: new ObjectId(embedKeyData.connection_id), 
      is_active: true 
    });

    if (!connection) {
      return res.status(404).json({ 
        error: 'Connection not found', 
        message: 'Database connection not found or inactive' 
      });
    }

    // Import the database service
    const { getDatabaseSchema } = await import('../services/databaseService.js');
    
    // Get schema using the connection
    const schema = await getDatabaseSchema(connection);
    
    res.json({ 
      success: true, 
      schema 
    });
  } catch (error) {
    console.error('[Embed-Controller] Error getting embed schema:', error);
    res.status(500).json({ 
      error: 'Failed to get schema', 
      message: error.message 
    });
  }
}

// Get embed keys for a user
export async function getUserEmbedKeys(req, res) {
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
    const embedKeysCollection = db.collection('embed_keys');
    const connectionsCollection = db.collection('database_connections');

    const embedKeys = await embedKeysCollection.find({ 
      clerk_id, 
      is_active: true 
    }).toArray();

    // Get connection details for each embed key
    const embedKeysWithConnections = await Promise.all(
      embedKeys.map(async (embedKey) => {
        const connection = await connectionsCollection.findOne({ 
          _id: new ObjectId(embedKey.connection_id)
        });
        
        return {
          id: embedKey._id,
          embed_key: embedKey.embed_key,
          connection_name: embedKey.connection_name,
          created_at: embedKey.created_at,
          last_used: embedKey.last_used,
          usage_count: embedKey.usage_count,
          connection: connection ? {
            id: connection._id,
            connection_name: connection.connection_name,
            host: connection.host,
            database: connection.database,
            database_type: connection.database_type
          } : null
        };
      })
    );

    res.json({ 
      success: true, 
      embed_keys: embedKeysWithConnections
    });
  } catch (error) {
    console.error('[Embed-Controller] Error getting user embed keys:', error);
    res.status(500).json({ 
      error: 'Failed to get embed keys', 
      message: error.message 
    });
  }
}

// Delete embed key
export async function deleteEmbedKey(req, res) {
  try {
    const { embed_id } = req.params;
    
    if (!embed_id) {
      return res.status(400).json({ 
        error: 'Missing embed_id', 
        message: 'embed_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const embedKeysCollection = db.collection('embed_keys');

    const result = await embedKeysCollection.updateOne(
      { _id: new ObjectId(embed_id) },
      { $set: { is_active: false } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        error: 'Embed key not found', 
        message: 'Embed key not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Embed key deleted successfully' 
    });
  } catch (error) {
    console.error('[Embed-Controller] Error deleting embed key:', error);
    res.status(500).json({ 
      error: 'Failed to delete embed key', 
      message: error.message 
    });
  }
} 