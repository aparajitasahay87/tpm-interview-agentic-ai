const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ============================================
// WEEK 1: DATABASE SETUP
// ============================================

// Database setup endpoint - Week 1 schema
app.get('/setup-db', async (req, res) => {
  try {
    const migrationPath = path.join(__dirname, 'db/migrations/001_initial_schema.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(migration);
    
    res.json({ 
      success: true, 
      message: 'Week 1 database tables created successfully!' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// WEEK 2: MIGRATION ENDPOINTS
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
        hint: 'Create the file: backend/db/migrations/002_add_rag_fields.sql'
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
      message: 'Rollback executed - reverted to Week 1 schema',
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
// WEEK 2: SEED DATA ENDPOINT
// ============================================

// Load seed data (10 ideal TPM answers)
app.post('/admin/seed', async (req, res) => {
  try {
    const seedPath = path.join(__dirname, 'db/seeds/001_ideal_tpm_answers.sql');
    
    // Check if file exists
    if (!fs.existsSync(seedPath)) {
      return res.status(404).json({
        success: false,
        error: 'Seed file not found',
        expected_path: seedPath,
        hint: 'Create the file: backend/db/seeds/001_ideal_tpm_answers.sql'
      });
    }
    
    const sql = fs.readFileSync(seedPath, 'utf8');
    await db.query(sql);
    
    const count = await db.query('SELECT COUNT(*) FROM sample_answers');
    
    res.json({ 
      success: true, 
      message: 'Seed data (10 ideal TPM answers) loaded successfully',
      total_rows: parseInt(count.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      hint: 'Check if migration 002 has been run first'
    });
  }
});

// Get sample answers (for verification)
app.get('/admin/samples', async (req, res) => {
  try {
    const samples = await db.query(`
      SELECT 
        id,
        question_type,
        LEFT(question_text, 100) as question_preview,
        LEFT(answer_text, 150) as answer_preview,
        level,
        overall_score,
        is_good_example
      FROM sample_answers
      ORDER BY question_type, id
      LIMIT 20;
    `);
    
    const count = await db.query('SELECT COUNT(*) FROM sample_answers');
    
    res.json({
      success: true,
      total_samples: parseInt(count.rows[0].count),
      samples: samples.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear all sample answers (for testing)
app.delete('/admin/clear-samples', async (req, res) => {
  try {
    await db.query('DELETE FROM sample_answers');
    
    res.json({
      success: true,
      message: 'All sample answers cleared',
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
// WEEK 2: PINECONE ENDPOINTS
// ============================================

// Test Pinecone connection
app.get('/admin/test-pinecone', async (req, res) => {
  try {
    const { testConnection } = require('./config/pinecone');
    const result = await testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Pinecone connected successfully',
        index_name: process.env.PINECONE_INDEX_NAME,
        api_key_present: !!process.env.PINECONE_API_KEY,
        existing_indexes: result.indexes.map(idx => ({
          name: idx.name,
          dimension: idx.dimension
        }))
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test embedding generation
app.post('/admin/test-embedding', async (req, res) => {
  try {
    const EmbeddingGenerator = require('./agents/tools/EmbeddingGenerator');
    const generator = new EmbeddingGenerator();
    
    const testText = req.body.text || 'This is a test embedding for TPM interview preparation';
    
    const embedding = await generator.generateEmbedding(testText);
    
    res.json({
      success: true,
      text: testText,
      embedding_length: embedding.length,
      embedding_preview: embedding.slice(0, 5), // First 5 values
      model: generator.model
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// API ROUTES
// ============================================


// ============================================
// API ROUTES
// ============================================

// Week 1 API routes
app.use('/api/tools', require('./routes/tools'));

// ============================================
// ERROR HANDLING
// ============================================

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
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    available_routes: {
      health: 'GET /health',
      week1_setup: 'GET /setup-db',
      week2_migrate: 'POST /admin/migrate',
      week2_rollback: 'POST /admin/rollback',
      week2_seed: 'POST /admin/seed',
      verify: 'GET /admin/verify-schema',
      status: 'GET /admin/migration-status',
      samples: 'GET /admin/samples',
      api: 'POST /api/tools/parse-star'
    }
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Database: ${process.env.DB_NAME || 'Not configured'}`);
  console.log(`📌 Version: 2.0.0-dev (Week 2 in progress)`);
  console.log(`\n🔧 Admin Endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /admin/migration-status - Check migrations`);
  console.log(`   POST /admin/migrate - Run Week 2 migration`);
  console.log(`   POST /admin/rollback - Rollback Week 2`);
  console.log(`   POST /admin/seed - Load 10 ideal TPM answers`);
  console.log(`   GET  /admin/verify-schema - View table schema`);
  console.log(`   GET  /admin/samples - View sample answers`);
  console.log(`   DELETE /admin/clear-samples - Clear all samples`);
});

module.exports = app;