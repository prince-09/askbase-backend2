import { getAllSessions, getChatSession, deleteSession, updateChatSession } from '../services/sessionService.js';
import { safeDateToISO } from '../utils/helpers.js';

// Get all sessions
export async function getSessions(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const sessions = await getAllSessions(limit);
    
    res.json({
      sessions: sessions
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error.message
    });
  }
}

// Get specific session
export async function getSession(req, res) {
  try {
    const { session_id } = req.params;
    const session = await getChatSession(session_id);
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with id ${session_id} not found`
      });
    }

    const formattedSession = {
      ...session,
      _id: session._id.toString(),
      created_at: safeDateToISO(session.created_at),
      last_activity: safeDateToISO(session.last_activity)
    };

    res.json(formattedSession);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error.message
    });
  }
}

// Delete session
export async function deleteSessionById(req, res) {
  try {
    const { session_id } = req.params;
    const deleted = await deleteSession(session_id);

    if (!deleted) {
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
}

// Restore session (load into memory)
export async function restoreSession(req, res) {
  try {
    const { session_id } = req.params;
    const session = await getChatSession(session_id);
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with id ${session_id} not found`
      });
    }

    // Convert session messages back to chat history format
    const chatHistory = [];
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
    await updateChatSession(session_id, {
      last_activity: new Date(),
      status: 'active'
    });

    const formattedSession = {
      ...session,
      _id: session._id.toString(),
      created_at: safeDateToISO(session.created_at),
      last_activity: safeDateToISO(session.last_activity)
    };

    res.json({
      message: `Session restored with ${chatHistory.length} messages`,
      session_id: session_id,
      message_count: chatHistory.length,
      chat_history: chatHistory, // Return the actual chat history
      session: formattedSession
    });
  } catch (error) {
    console.error('Error restoring session:', error);
    res.status(500).json({
      error: 'Failed to restore session',
      message: error.message
    });
  }
} 