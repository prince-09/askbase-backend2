import { getMongoClient, MONGODB_DB_NAME, MISTRAL_MODEL } from '../config/database.js';
import { safeDateToISO } from '../utils/helpers.js';

// Save chat session to MongoDB
export async function saveChatSession(sessionData) {
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
    
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    await db.collection('chat_sessions').insertOne(session);
    return true;
  } catch (error) {
    console.error('Error saving chat session:', error);
    return false;
  }
}

// Get chat session by ID
export async function getChatSession(sessionId) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const session = await db.collection('chat_sessions').findOne({ session_id: sessionId });
    return session;
  } catch (error) {
    console.error('Error getting chat session:', error);
    return null;
  }
}

// Get conversation context for a session (last N messages)
export async function getConversationContext(sessionId, limit = 5) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const session = await db.collection('chat_sessions').findOne({ session_id: sessionId });
    if (!session || !session.messages) {
      return [];
    }
    return session.messages.slice(-limit);
  } catch (error) {
    console.error('Error getting conversation context:', error);
    return [];
  }
}

// Add message to session conversation history
export async function addMessageToSession(sessionId, messageData) {
  try {
    console.log(`🔍 Adding message to session: ${sessionId}`);
    console.log(`🔍 Message data:`, messageData);
    
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const message = {
      message_id: Date.now(),
      timestamp: new Date(),
      type: messageData.type || 'user_question',
      question: messageData.question,
      sql_query: messageData.sql_query,
      tables_used: messageData.tables_used,
      result_count: messageData.result_count,
      result_sample: messageData.result_sample,
      natural_answer: messageData.natural_answer,
      execution_time_ms: messageData.execution_time_ms,
      is_followup_question: messageData.is_followup_question,
      chart_data: messageData.chart_data
    };
    
    console.log(`🔍 Prepared message:`, message);
    
    const result = await db.collection('chat_sessions').updateOne(
      { session_id: sessionId },
      {
        $push: { messages: message },
        $set: { 
          last_activity: new Date(),
          message_count: { $inc: 1 }
        }
      }
    );
    
    console.log(`🔍 Update result:`, result);
    console.log(`🔍 Modified count: ${result.modifiedCount}`);
    
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Error adding message to session:', error);
    return false;
  }
}

// Create new session if it doesn't exist
export async function createSessionIfNotExists(sessionId, databaseConnection = null) {
  try {
    console.log(`🔍 Creating session if not exists: ${sessionId}`);
    
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const existingSession = await db.collection('chat_sessions').findOne({ session_id: sessionId });
    
    console.log(`🔍 Existing session found:`, existingSession ? 'Yes' : 'No');
    
    if (!existingSession) {
      const newSession = {
        session_id: sessionId,
        created_at: new Date(),
        last_activity: new Date(),
        database_connection: databaseConnection,
        ai_model_used: MISTRAL_MODEL,
        status: 'active',
        messages: [],
        message_count: 0,
        metadata: {
          total_execution_time_ms: 0,
          tables_accessed: [],
          message_count: 0
        }
      };
      
      console.log(`🔍 Creating new session:`, newSession);
      
      const result = await db.collection('chat_sessions').insertOne(newSession);
      console.log(`🔍 Insert result:`, result);
      console.log(`✅ Created new session: ${sessionId}`);
      return true;
    }
    
    console.log(`🔍 Session already exists: ${sessionId}`);
    return true;
  } catch (error) {
    console.error('Error creating session:', error);
    return false;
  }
}

// Reset session conversation history
export async function resetSessionHistory(sessionId) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const result = await db.collection('chat_sessions').updateOne(
      { session_id: sessionId },
      {
        $set: {
          messages: [],
          last_activity: new Date(),
          message_count: 0,
          metadata: {
            total_execution_time_ms: 0,
            tables_accessed: []
          }
        }
      }
    );
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Error resetting session history:', error);
    return false;
  }
}

// Update chat session
export async function updateChatSession(sessionId, updateData) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const result = await db.collection('chat_sessions').updateOne(
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

// Get all sessions with pagination
export async function getAllSessions(limit = 50) {
  try {
    console.log(`🔍 Getting all sessions with limit: ${limit}`);
    
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const sessions = await db.collection('chat_sessions')
      .find({})
      .sort({ last_activity: -1 })
      .limit(limit)
      .toArray();

    console.log(`🔍 Found ${sessions.length} sessions`);
    
    const formattedSessions = sessions.map(session => {
      const messageCount = session.messages ? session.messages.length : 0;
      console.log(`🔍 Session ${session.session_id}: ${messageCount} messages`);
      
      return {
        session_id: session.session_id,
        created_at: safeDateToISO(session.created_at),
        last_activity: safeDateToISO(session.last_activity),
        database_connection: session.database_connection,
        ai_model_used: session.ai_model_used,
        message_count: messageCount,
        metadata: session.metadata || {
          total_execution_time_ms: 0,
          tables_accessed: []
        },
        status: session.status || 'active'
      };
    });

    console.log(`🔍 Formatted sessions:`, formattedSessions);
    return formattedSessions;
  } catch (error) {
    console.error('Error listing sessions:', error);
    throw error;
  }
}

// Delete session
export async function deleteSession(sessionId) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const result = await db.collection('chat_sessions').deleteOne({ session_id: sessionId });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
}

// Test MongoDB connection
export async function testMongoConnection() {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    await db.command({ ping: 1 });
    return {
      success: true,
      database: MONGODB_DB_NAME,
      collections: await db.listCollections().toArray()
    };
  } catch (error) {
    console.error('MongoDB test error:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 