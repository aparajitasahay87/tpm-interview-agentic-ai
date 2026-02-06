const express = require('express');
const router = express.Router();
const { getPineconeClient } = require('../config/pinecone');
const { getPool } = require('../config/database');

// ADD THIS HELPER FUNCTION HERE 👇
/**
 * Safely parse tags from various formats into an array
 * Handles: arrays, JSON strings, null, undefined
 * @param {*} tags - Input tags in any format
 * @returns {Array} - Always returns an array
 */


/**
 * =============================================================================
 * ADMIN ROUTES - Testing, Debugging, and Data Management
 * =============================================================================
 */

// =============================================================================
// MONITORING & HEALTH CHECK ENDPOINTS
// =============================================================================

/**
 * GET /admin/env-check
 * Check which environment variables are set
 */
router.get('/env-check', (req, res) => {
  res.json({
    success: true,
    environment_variables: {
      has_openai_key: !!process.env.OPENAI_API_KEY,
      openai_key_length: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
      has_pinecone_key: !!process.env.PINECONE_API_KEY,
      has_database_url: !!process.env.DATABASE_URL,
      has_setup_secret: !!process.env.SETUP_SECRET,
      has_admin_email: !!process.env.ADMIN_EMAIL,
      node_env: process.env.NODE_ENV || 'not set',
      rag_enabled: process.env.ENABLE_RAG_FEATURES
    }
  });
});

/**
 * GET /admin/health
 * System health check
 */
router.get('/health', async (req, res) => {
  try {
    const pool = getPool();
    const dbResult = await pool.query('SELECT NOW()');
    
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: dbResult.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /admin/cache-metrics
 * View embedding cache statistics
 */
router.get('/cache-metrics', async (req, res) => {
  try {
    const SemanticSearch = require('../agents/tools/SemanticSearch');
    const semanticSearch = new SemanticSearch();
    const health = await semanticSearch.healthCheck();
    
    res.json({
      success: true,
      health: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/test-pinecone
 * Test Pinecone connection
 */
router.get('/test-pinecone', async (req, res) => {
  try {
    const pinecone = await getPineconeClient();
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples');
    const stats = await index.describeIndexStats();
    
    res.json({
      success: true,
      message: 'Pinecone connection successful',
      stats: {
        totalVectors: stats.totalRecordCount || 0,
        dimension: stats.dimension || 1536,
        indexName: process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples'
      }
    });
  } catch (error) {
    console.error('Pinecone test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// DATA VIEWING ENDPOINTS
// =============================================================================

/**
 * GET /admin/categories
 * View all categories
 */
router.get('/categories', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(q.id) as question_count
      FROM categories c
      LEFT JOIN questions q ON q.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      categories: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/rubrics
 * View all rubrics
 */
router.get('/rubrics', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        r.*,
        c.name as category_name
      FROM rubrics r
      JOIN categories c ON c.id = r.category_id
      ORDER BY c.name, r.competency_name
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      rubrics: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/questions
 * View all questions
 */
router.get('/questions', async (req, res) => {
  try {
    const pool = getPool();
    const { category_id } = req.query;
    
    let query = `
      SELECT 
        q.*,
        c.name as category_name
      FROM questions q
      JOIN categories c ON c.id = q.category_id
    `;
    
    const params = [];
    if (category_id) {
      query += ' WHERE q.category_id = $1';
      params.push(category_id);
    }
    
    query += ' ORDER BY c.name, q.id';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      count: result.rows.length,
      questions: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/samples
 * View all sample answers
 */
router.get('/samples', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        sa.*,
        c.name as category_name,
        LEFT(sa.answer_text, 100) as answer_preview
      FROM sample_answers sa
      LEFT JOIN categories c ON c.id = sa.category_id
      ORDER BY c.name, sa.id
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      samples: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/schema/sample_answers
 * View sample_answers table schema
 */
router.get('/schema/sample_answers', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'sample_answers'
      ORDER BY ordinal_position
    `);
    
    res.json({
      success: true,
      table: 'sample_answers',
      columns: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// BULK IMPORT ENDPOINTS
// =============================================================================

/**
 * POST /admin/rubrics/bulk
 * Bulk import rubrics
 */
router.post('/rubrics/bulk', async (req, res) => {
  try {
    const { rubrics } = req.body;
    
    if (!rubrics || !Array.isArray(rubrics)) {
      return res.status(400).json({
        success: false,
        error: 'rubrics array required in request body'
      });
    }
    
    const pool = getPool();
    const inserted = [];
    const errors = [];
    
    for (const rubric of rubrics) {
      try {
        const result = await pool.query(`
          INSERT INTO rubrics (
            category_id, competency_name, 
            level_1_description, level_3_description, level_5_description, 
            weight
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [
          rubric.category_id,
          rubric.competency_name,
          rubric.level_1_description,
          rubric.level_3_description,
          rubric.level_5_description,
          rubric.weight || 1.0
        ]);
        
        inserted.push(result.rows[0]);
      } catch (error) {
        errors.push({
          rubric: rubric.competency_name,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      inserted_count: inserted.length,
      error_count: errors.length,
      inserted: inserted,
      errors: errors
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/questions/bulk
 * Bulk import questions
 */
router.post('/questions/bulk', async (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        error: 'questions array required in request body'
      });
    }
    
    const pool = getPool();
    const inserted = [];
    const errors = [];
    
    for (const question of questions) {
      try {

        let tags = question.tags || [];
if (typeof tags === 'string') {
  try {
    tags = JSON.parse(tags);
  } catch (e) {
    tags = [];
  }
} 
        const result = await pool.query(`
          INSERT INTO questions (
            category_id, question_text, difficulty, tags
          ) VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [
          question.category_id,
          question.question_text,
          question.difficulty || 'Medium',
         // JSON.stringify(question.tags || [])
         JSON.stringify(tags)
        ]);
        
        inserted.push(result.rows[0]);
      } catch (error) {
        errors.push({
          question: question.question_text?.substring(0, 50),
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      inserted_count: inserted.length,
      error_count: errors.length,
      inserted: inserted,
      errors: errors
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/sample-answers/bulk
 * Bulk import sample answers
 */
router.post('/sample-answers/bulk', async (req, res) => {
  try {
    const { samples } = req.body;
    
    if (!samples || !Array.isArray(samples)) {
      return res.status(400).json({
        success: false,
        error: 'samples array required in request body'
      });
    }
    
    const pool = getPool();
    const inserted = [];
    const errors = [];
    
    for (const sample of samples) {
      try {
        const result = await pool.query(`
          INSERT INTO sample_answers (
            category_id, question_type, question_text, answer_text,
            situation_text, task_text, action_text, result_text,
            overall_score, situation_score, task_score, action_score, result_score,
            level, company
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `, [
          sample.category_id,
          sample.question_type || '',
          sample.question_text || '',
          sample.answer_text || '',
          sample.situation_text || '',
          sample.task_text || '',
          sample.action_text || '',
          sample.result_text || '',
          sample.overall_score || 0,
          sample.situation_score || 0,
          sample.task_score || 0,
          sample.action_score || 0,
          sample.result_score || 0,
          sample.level || 'Mid',
          sample.company || ''
        ]);
        
        inserted.push(result.rows[0]);
      } catch (error) {
        errors.push({
          sample_id: sample.id,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      inserted_count: inserted.length,
      error_count: errors.length,
      inserted: inserted,
      errors: errors
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// DATA CLEARING ENDPOINTS
// =============================================================================

/**
 * DELETE /admin/rubrics/clear
 * Clear all rubrics (for re-seeding)
 */
router.delete('/rubrics/clear', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL_RUBRICS') {
      return res.status(400).json({
        success: false,
        error: 'Must send confirm: "DELETE_ALL_RUBRICS" to proceed'
      });
    }
    
    const pool = getPool();
    const result = await pool.query('TRUNCATE TABLE rubrics CASCADE');
    
    res.json({
      success: true,
      message: 'All rubrics cleared',
      deleted_count: result.rowCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/questions/clear
 * Clear all questions (for re-seeding)
 */
router.delete('/questions/clear', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL_QUESTIONS') {
      return res.status(400).json({
        success: false,
        error: 'Must send confirm: "DELETE_ALL_QUESTIONS" to proceed'
      });
    }
    
    const pool = getPool();
    const result = await pool.query('TRUNCATE TABLE questions CASCADE');
    
    res.json({
      success: true,
      message: 'All questions cleared',
      deleted_count: result.rowCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/sample-answers/clear
 * Clear all sample answers (for re-seeding)
 */
router.delete('/sample-answers/clear', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL_SAMPLES') {
      return res.status(400).json({
        success: false,
        error: 'Must send confirm: "DELETE_ALL_SAMPLES" to proceed'
      });
    }
    
    const pool = getPool();
    const result = await pool.query('TRUNCATE TABLE sample_answers CASCADE');
    
    res.json({
      success: true,
      message: 'All sample answers cleared',
      deleted_count: result.rowCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// INDIVIDUAL ITEM ENDPOINTS
// =============================================================================

/**
 * POST /admin/questions
 * Add a single question
 */
router.post('/questions', async (req, res) => {
  try {
    const { category_id, question_text, difficulty, tags } = req.body;
    
    if (!category_id || !question_text) {
      return res.status(400).json({
        success: false,
        error: 'category_id and question_text required'
      });
    }
    
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO questions (category_id, question_text, difficulty, tags)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [category_id, question_text, difficulty || 'Medium', JSON.stringify(tags || [])]);
    
    res.json({
      success: true,
      question: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /admin/questions/:id
 * Update a question
 */

router.put('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { question_text, difficulty, tags } = req.body;
    
    // Handle tags - parse if string, use as-is if array
    let processedTags = null;
    if (tags) {
      if (typeof tags === 'string') {
        try {
          processedTags = JSON.stringify(JSON.parse(tags));
        } catch (e) {
          processedTags = JSON.stringify([]);
        }
      } else if (Array.isArray(tags)) {
        processedTags = JSON.stringify(tags);
      }
    }
    
    const pool = getPool();
    const result = await pool.query(`
      UPDATE questions
      SET 
        question_text = COALESCE($1, question_text),
        difficulty = COALESCE($2, difficulty),
        tags = COALESCE($3, tags),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [question_text, difficulty, processedTags, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    res.json({
      success: true,
      question: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/questions/:id
 * Delete a question
 */
router.delete('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const pool = getPool();
    const result = await pool.query('DELETE FROM questions WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Question deleted',
      question: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/seed-questions
 * Run existing seed_questions.js script
 */
router.post('/seed-questions', async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (secret !== process.env.SETUP_SECRET) {
      return res.status(403).json({
        success: false,
        error: 'Invalid secret'
      });
    }
    
    const path = require('path');
    const seedQuestionsPath = path.join(__dirname, '../scripts/seed_questions.js');
    
    // Clear require cache to ensure fresh run
    delete require.cache[require.resolve(seedQuestionsPath)];
    
    // Import and run the seed script
    const seedQuestions = require(seedQuestionsPath);
    await seedQuestions();
    
    const pool = getPool();
    const count = await pool.query('SELECT COUNT(*) FROM questions');
    
    res.json({
      success: true,
      message: 'Questions seeded successfully',
      question_count: count.rows[0].count
    });
    
  } catch (error) {
    console.error('Seed questions error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// =============================================================================
// PRODUCTION SETUP ENDPOINT (SIMPLIFIED)
// =============================================================================

/**
 * POST /admin/setup-production
 * Simplified production setup - only creates tables and categories
 * Use bulk import endpoints to seed rubrics, questions, and sample answers
 */
router.post('/setup-production', async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (secret !== process.env.SETUP_SECRET) {
      return res.status(403).json({
        success: false,
        error: 'Invalid setup secret'
      });
    }
    
    const pool = getPool();
    const results = [];
    
    console.log('🔄 Starting simplified production setup...\n');
    
    // =============================================
    // STEP 1: Create Tables (if needed)
    // =============================================
    try {
      const tablesCheck = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'categories'
      `);
      
      if (tablesCheck.rows.length === 0) {
        const fs = require('fs');
        const path = require('path');
        
        const migrationSQL = fs.readFileSync(
          path.join(__dirname, '../db/migrations/005_create_categories_system.sql'),
          'utf8'
        );
        
        await pool.query(migrationSQL);
        results.push('✅ Step 1: Category tables created');
      } else {
        results.push('⚠️  Step 1: Tables already exist');
      }
    } catch (error) {
      results.push(`❌ Step 1 failed: ${error.message}`);
    }
    
    // =============================================
    // STEP 2: Drop Level Constraint
    // =============================================
    try {
      await pool.query('ALTER TABLE sample_answers DROP CONSTRAINT IF EXISTS check_level_values');
      results.push('✅ Step 2: Level constraint removed');
    } catch (error) {
      results.push(`⚠️  Step 2: ${error.message}`);
    }
    
    // =============================================
    // STEP 3: Seed Categories (Only if empty)
    // =============================================
    try {
      const categoriesCount = await pool.query('SELECT COUNT(*) FROM categories');
      
      if (parseInt(categoriesCount.rows[0].count) === 0) {
        const categories = [
          { name: 'Program Sense', description: 'Program kickoff, MVP scoping, risk mitigation, execution, prioritization, and strategic influence', icon: '📊', competencies: JSON.stringify(['Program Kickoff', 'Risk Mitigation', 'Execution', 'Prioritization', 'Strategic Influence', 'Communication']) },
          { name: 'System Design', description: 'Scalability, reliability, trade-offs, data modeling, and technical architecture decisions', icon: '🏗️', competencies: JSON.stringify(['Scalability', 'Trade-offs', 'Components', 'Data Flow', 'Reliability']) },
          { name: 'Behavioral', description: 'Leadership, failure recovery, conflict resolution, cross-functional collaboration, and adaptability', icon: '👥', competencies: JSON.stringify(['Leadership', 'Conflict Resolution', 'Influence', 'Ownership', 'Communication', 'Adaptability']) },
          { name: 'Technical', description: 'Problem-solving, code quality, complexity analysis, debugging, and technical decision making', icon: '💻', competencies: JSON.stringify(['Problem Solving', 'Code Quality', 'Complexity Analysis', 'Debugging']) },
          { name: 'Partnership', description: 'Cross-functional influence, negotiation, stakeholder management, and alignment building', icon: '🤝', competencies: JSON.stringify(['Influence', 'Negotiation', 'Communication', 'Cross-functional Alignment', 'Stakeholder Management']) }
        ];
        
        for (const cat of categories) {
          await pool.query(`
            INSERT INTO categories (name, description, icon, competencies)
            VALUES ($1, $2, $3, $4)
          `, [cat.name, cat.description, cat.icon, cat.competencies]);
        }
        
        results.push('✅ Step 3: 5 categories seeded');
      } else {
        results.push(`⚠️  Step 3: ${categoriesCount.rows[0].count} categories exist`);
      }
    } catch (error) {
      results.push(`❌ Step 3 failed: ${error.message}`);
    }
    
    // =============================================
    // FINAL: Database Status
    // =============================================
    const finalCounts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM categories) as categories,
        (SELECT COUNT(*) FROM rubrics) as rubrics,
        (SELECT COUNT(*) FROM questions) as questions,
        (SELECT COUNT(*) FROM sample_answers WHERE category_id IS NOT NULL) as samples
    `);
    
    results.push('\n📊 Final Database Status:');
    results.push(`   Categories: ${finalCounts.rows[0].categories}`);
    results.push(`   Rubrics: ${finalCounts.rows[0].rubrics}`);
    results.push(`   Questions: ${finalCounts.rows[0].questions}`);
    results.push(`   Sample Answers: ${finalCounts.rows[0].samples}`);
    results.push('\n✅ Production setup complete!');
    results.push('\n📝 Next steps:');
    results.push('   1. POST /admin/rubrics/bulk - Import rubrics');
    results.push('   2. POST /admin/questions/bulk - Import questions');
    results.push('   3. POST /admin/sample-answers/bulk - Import sample answers');
    
    res.json({
      success: true,
      message: 'Production database setup complete',
      results: results
    });
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /admin/pinecone-query-test
 * Test raw Pinecone query to debug semantic search
 */
router.get('/pinecone-query-test', async (req, res) => {
  try {
    const { Pinecone } = require('@pinecone-database/pinecone');
    const EmbeddingGenerator = require('../agents/tools/EmbeddingGenerator');
    
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples');
    
    // Generate simple embedding
    const embeddingGen = new EmbeddingGenerator();
    const testEmbedding = await embeddingGen.generateEmbedding("cloud migration project");
    
    // Query WITHOUT filter
    const resultsNoFilter = await index.namespace('').query({
      vector: testEmbedding,
      topK: 3,
      includeMetadata: true
    });
    
    // Query WITH filter  
    const resultsWithFilter = await index.namespace('').query({
      vector: testEmbedding,
      topK: 3,
      includeMetadata: true,
      filter: {
        category_id: 1
      }
    });
    
    res.json({
      success: true,
      without_filter: {
        count: resultsNoFilter.matches.length,
        matches: resultsNoFilter.matches.map(m => ({
          id: m.id,
          score: m.score,
          metadata: m.metadata
        }))
      },
      with_filter: {
        count: resultsWithFilter.matches.length,
        matches: resultsWithFilter.matches.map(m => ({
          id: m.id,
          score: m.score,
          metadata: m.metadata
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;