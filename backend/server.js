const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 10000; // Updated to match Render

// Middleware
app.use(cors({
  origin: '*',  // Allow all origins for development and deployment
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as time, COUNT(*) as user_count FROM users');
    res.json({
      status: 'healthy',
      version: '2.0.0-dev', // Week 2 in development
      timestamp: result.rows[0].time,
      database: 'connected',
      users: result.rows[0].user_count
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Database setup endpoint - Week 1 (keep this)
app.get('/setup-db', async (req, res) => {
  try {
    const migrationPath = path.join(__dirname, 'db/migrations/001_initial_schema.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(migration);
    
    res.json({ 
      success: true, 
      message: 'Database tables created successfully!' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// WEEK 2: ADMIN/MIGRATION ENDPOINTS
// ============================================

// Run Week 2 migration (add RAG fields)
app.post('/admin/migrate', async (req, res) => {
  try {
    const migrationPath = path.join(__dirname, 'db/migrations/002_add_rag_fields.sql');
    
    // Check if file exists
    if (!fs.existsSync(migrationPath)) {
      return res.status(404).json({
        success: false,
        error: 'Migration file not found',
        expected_path: migrationPath,
        hint: 'Create the file first: backend/db/migrations/002_add_rag_fields.sql'
      });
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await db.query(sql);
    
    res.json({ 
      success: true, 
      message: 'Migration 002 (RAG fields) executed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Rollback Week 2 migration (remove RAG fields)
app.post('/admin/rollback', async (req, res) => {
  try {
    const rollbackPath = path.join(__dirname, 'db/migrations/002_add_rag_fields_rollback.sql');
    
    if (!fs.existsSync(rollbackPath)) {
      return res.status(404).json({
        success: false,
        error: 'Rollback file not found',
        expected_path: rollbackPath
      });
    }
    
    const sql = fs.readFileSync(rollbackPath, 'utf8');
    await db.query(sql);
    
    res.json({ 
      success: true, 
      message: 'Rollback executed successfully - reverted to Week 1 schema',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Verify database schema (check what columns exist)
app.get('/admin/verify-schema', async (req, res) => {
  try {
    const schemaQuery = await db.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'sample_answers'
      ORDER BY ordinal_position;
    `);
    
    const rowCount = await db.query('SELECT COUNT(*) FROM sample_answers');
    
    res.json({ 
      success: true,
      table: 'sample_answers',
      columns: schemaQuery.rows,
      total_rows: parseInt(rowCount.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Schema verification error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check migration status (which migrations have been run)
app.get('/admin/migration-status', async (req, res) => {
  try {
    // Check if Week 2 fields exist
    const week2Check = await db.query(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_name = 'sample_answers' 
        AND column_name IN ('pinecone_id', 'question_text', 'level', 'metadata');
    `);
    
    const week2Applied = week2Check.rows.length > 0;
    
    res.json({
      success: true,
      migrations: {
        '001_initial_schema': true, // Always true if DB exists
        '002_add_rag_fields': week2Applied
      },
      current_version: week2Applied ? '2.0.0-dev' : '1.0.0',
      week2_columns_found: week2Check.rows.map(r => r.column_name),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// END WEEK 2 ADMIN ENDPOINTS
// ============================================

// API routes
app.use('/api/tools', require('./routes/tools'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Database: ${process.env.DB_NAME || 'Not configured'}`);
  console.log(`📌 Version: 2.0.0-dev (Week 2 in progress)`);
  console.log(`🔧 Admin endpoints available at /admin/*`);
});

module.exports = app;