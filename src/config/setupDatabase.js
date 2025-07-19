import { getSqlPool } from './database.js';

export async function setupDatabase() {
  const pool = getSqlPool();
  
  try {
    console.log('Setting up database tables...');
    
    // Create database_connections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS database_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        connection_name VARCHAR(255) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INTEGER DEFAULT 5432,
        database VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        password TEXT NOT NULL,
        database_type VARCHAR(50) DEFAULT 'postgresql',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create chat_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        connection_id UUID REFERENCES database_connections(id),
        title VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0
      )
    `);
    
    // Create chat_messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        message_id BIGINT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(50) DEFAULT 'question_answer',
        question TEXT,
        sql_query TEXT,
        tables_used TEXT[],
        result_count INTEGER DEFAULT 0,
        result_sample JSONB,
        natural_answer TEXT,
        execution_time_ms INTEGER,
        is_followup_question BOOLEAN DEFAULT FALSE,
        chart_data JSONB
      )
    `);
    
    // Create reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        items JSONB DEFAULT '[]',
        share_url VARCHAR(500),
        is_public BOOLEAN DEFAULT FALSE
      )
    `);
    
    console.log('Database tables created successfully!');
    
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
}

// Run setup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase()
    .then(() => {
      console.log('Database setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
} 