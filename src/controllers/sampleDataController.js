import { Pool } from 'pg';

// Set up sample data in the database
export async function setupSampleData(req, res) {
  try {
    const { host, port, database, username, password } = req.body;
    
    if (!host || !database || !username || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'host, database, username, and password are required' 
      });
    }

    const pool = new Pool({
      host,
      port: parseInt(port) || 5432,
      database,
      user: username,
      password,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    });

    try {
      // Create sample tables and data
      await pool.query(`
        -- Create customers table
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          city VARCHAR(50),
          country VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        -- Create products table
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          category VARCHAR(50),
          price DECIMAL(10,2) NOT NULL,
          stock_quantity INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        -- Create orders table
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id),
          order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          total_amount DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending'
        );
      `);

      // Drop and recreate if table exists with wrong schema
      await pool.query(`
        DROP TABLE IF EXISTS order_items CASCADE;
      `);

      await pool.query(`
        -- Create order_items table
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(id),
          product_id INTEGER REFERENCES products(id),
          quantity INTEGER NOT NULL,
          unit_price DECIMAL(10,2) NOT NULL
        );
      `);

      // Insert sample data
      await pool.query(`
        INSERT INTO customers (name, email, city, country) VALUES
        ('John Doe', 'john@example.com', 'New York', 'USA'),
        ('Jane Smith', 'jane@example.com', 'London', 'UK'),
        ('Bob Johnson', 'bob@example.com', 'Toronto', 'Canada'),
        ('Alice Brown', 'alice@example.com', 'Sydney', 'Australia'),
        ('Charlie Wilson', 'charlie@example.com', 'Berlin', 'Germany')
        ON CONFLICT (email) DO NOTHING;
      `);

      await pool.query(`
        INSERT INTO products (name, category, price, stock_quantity) VALUES
        ('Laptop Pro', 'Electronics', 1299.99, 50),
        ('Smartphone X', 'Electronics', 799.99, 100),
        ('Wireless Headphones', 'Electronics', 199.99, 75),
        ('Coffee Maker', 'Home & Kitchen', 89.99, 30),
        ('Running Shoes', 'Sports', 129.99, 60),
        ('Backpack', 'Fashion', 59.99, 40),
        ('Bluetooth Speaker', 'Electronics', 149.99, 25),
        ('Yoga Mat', 'Sports', 29.99, 80)
        ON CONFLICT DO NOTHING;
      `);

      await pool.query(`
        INSERT INTO orders (customer_id, total_amount, status) VALUES
        (1, 1299.99, 'completed'),
        (2, 899.98, 'completed'),
        (3, 259.98, 'pending'),
        (4, 179.98, 'completed'),
        (5, 389.97, 'shipped')
        ON CONFLICT DO NOTHING;
      `);

      await pool.query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
        (1, 1, 1, 1299.99),
        (2, 2, 1, 799.99),
        (2, 3, 1, 199.99),
        (3, 4, 2, 89.99),
        (4, 5, 1, 129.99),
        (4, 6, 1, 59.99),
        (5, 7, 1, 149.99),
        (5, 8, 2, 29.99),
        (5, 6, 1, 59.99)
        ON CONFLICT DO NOTHING;
      `);

      // Verify the schema was created correctly
      const schemaCheck = await pool.query(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name IN ('customers', 'products', 'orders', 'order_items')
        ORDER BY table_name, ordinal_position
      `);
      
      console.log('🔍 Sample data schema verification:', schemaCheck.rows);

      await pool.end();

      res.json({ 
        success: true, 
        message: 'Sample data set up successfully',
        tables_created: ['customers', 'products', 'orders', 'order_items'],
        schema_verified: schemaCheck.rows,
        sample_queries: [
          'Show me the total revenue by month',
          'Which customers spent the most?',
          'What are our top selling products?',
          'Create a bar chart of sales by category',
          'Show me customer orders with their details'
        ]
      });
    } catch (error) {
      await pool.end();
      throw error;
    }
  } catch (error) {
    console.error('[Sample-Data-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to set up sample data', 
      message: error.message 
    });
  }
}

// Check if sample data exists
export async function checkSampleData(req, res) {
  try {
    const { host, port, database, username, password } = req.body;
    
    if (!host || !database || !username || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'host, database, username, and password are required' 
      });
    }

    const pool = new Pool({
      host,
      port: parseInt(port) || 5432,
      database,
      user: username,
      password,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    });

    try {
      // Check if sample tables exist
      const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('customers', 'products', 'orders', 'order_items')
        ORDER BY table_name;
      `);

      const existingTables = tablesResult.rows.map(row => row.table_name);
      
      // Check if sample data exists
      let hasData = false;
      if (existingTables.includes('customers')) {
        const countResult = await pool.query('SELECT COUNT(*) as count FROM customers');
        hasData = parseInt(countResult.rows[0].count) > 0;
      }

      await pool.end();

      res.json({ 
        success: true, 
        existing_tables: existingTables,
        has_sample_data: hasData,
        needs_setup: existingTables.length < 4 || !hasData
      });
    } catch (error) {
      await pool.end();
      throw error;
    }
  } catch (error) {
    console.error('[Sample-Data-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to check sample data', 
      message: error.message 
    });
  }
} 