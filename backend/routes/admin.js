const express = require('express');
const router = express.Router();
const { getPineconeClient } = require('../config/pinecone');
const { getPool } = require('../config/database');

/**
 * Admin Routes
 * Testing and debugging endpoints
 */

/**
 * GET /admin/cache-metrics
 * View embedding cache statistics
 */
router.get('/cache-metrics', async (req, res) => {
  try {
    const SemanticSearch = require('../agents/tools/SemanticSearch');
    const semanticSearch = new SemanticSearch();
    const metrics = semanticSearch.getCacheMetrics();
    
    res.json({
      success: true,
      cache_metrics: metrics
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

/**
 * GET /admin/samples
 * View all sample answers
 */
router.get('/samples', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        id,
        question_type,
        question_text,
        LEFT(answer_text, 100) as answer_preview,
        overall_score,
        level,
        pinecone_id,
        embedding_created_at
      FROM sample_answers
      ORDER BY question_type, id
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      samples: result.rows
    });
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/health
 * System health check
 */
router.get('/health', async (req, res) => {
  try {
    // Test database
    const pool = getPool();
    await pool.query('SELECT 1');
    
    // Test Pinecone
    const pinecone = await getPineconeClient();
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples');
    await index.describeIndexStats();
    
    res.json({
      success: true,
      status: 'healthy',
      components: {
        database: 'connected',
        pinecone: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /admin/circuit-breaker-status
 * View circuit breaker status for all OpenAI integrations
 */
router.get('/circuit-breaker-status', async (req, res) => {
  try {
    const STARParser = require('../agents/tools/STARParser');
    const EmbeddingGenerator = require('../agents/tools/EmbeddingGenerator');
    const ComparisonAnalyzer = require('../agents/tools/ComparisonAnalyzer');
    
    const starParser = new STARParser();
    const embeddingGen = new EmbeddingGenerator();
    const comparisonAnalyzer = new ComparisonAnalyzer();
    
    res.json({
      success: true,
      circuit_breakers: {
        star_parser: starParser.circuitBreaker.getMetrics(),
        embedding_generator: embeddingGen.circuitBreaker.getMetrics(),
        comparison_analyzer: comparisonAnalyzer.circuitBreaker.getMetrics()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/tables
 * List all tables in database
 */
router.get('/tables', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    res.json({
      success: true,
      tables: result.rows.map(r => r.table_name)
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
        r.id,
        r.category_id,
        c.name as category_name,
        r.competency_name,
        LEFT(r.level_1_description, 100) as level_1_preview,
        LEFT(r.level_3_description, 100) as level_3_preview,
        LEFT(r.level_5_description, 100) as level_5_preview,
        r.weight
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
 * POST /admin/questions
 * Add a new question
 */
router.post('/questions', async (req, res) => {
  try {
    const { category_id, question_text, difficulty, tags, question_type_id } = req.body;
    
    // Validation
    if (!category_id || !question_text || !difficulty) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: category_id, question_text, difficulty'
      });
    }
    
    // Validate difficulty
    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        success: false,
        error: 'Difficulty must be Easy, Medium, or Hard'
      });
    }
    
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO questions (category_id, question_type_id, question_text, difficulty, tags)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [category_id, question_type_id || null, question_text, difficulty, tags || []]);
    
    console.log(`✅ Admin added question: ${question_text.substring(0, 50)}...`);
    
    res.json({
      success: true,
      question: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error adding question:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/questions
 * List all questions
 */
router.get('/questions', async (req, res) => {
  try {
    const { category_id, difficulty } = req.query;
    const pool = getPool();
    
    let query = `
      SELECT 
        q.id,
        q.category_id,
        c.name as category_name,
        q.question_text,
        q.difficulty,
        q.tags,
        q.ideal_answer_count,
        q.created_at
      FROM questions q
      JOIN categories c ON c.id = q.category_id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by category
    if (category_id) {
      params.push(category_id);
      query += ` AND q.category_id = $${params.length}`;
    }
    
    // Filter by difficulty
    if (difficulty) {
      params.push(difficulty);
      query += ` AND q.difficulty = $${params.length}`;
    }
    
    query += ` ORDER BY c.name, q.difficulty, q.id`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      count: result.rows.length,
      questions: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/questions/:id
 * Get single question
 */
router.get('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT 
        q.id,
        q.category_id,
        c.name as category_name,
        q.question_text,
        q.difficulty,
        q.tags,
        q.ideal_answer_count,
        q.created_at
      FROM questions q
      JOIN categories c ON c.id = q.category_id
      WHERE q.id = $1
    `, [id]);
    
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
    console.error('❌ Error fetching question:', error);
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
    const { category_id, question_text, difficulty, tags, question_type_id } = req.body;
    
    // Validate difficulty if provided
    if (difficulty) {
      const validDifficulties = ['Easy', 'Medium', 'Hard'];
      if (!validDifficulties.includes(difficulty)) {
        return res.status(400).json({
          success: false,
          error: 'Difficulty must be Easy, Medium, or Hard'
        });
      }
    }
    
    const pool = getPool();
    
    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramCount = 1;
    
    if (category_id !== undefined) {
      params.push(category_id);
      updates.push(`category_id = $${paramCount++}`);
    }
    if (question_type_id !== undefined) {
      params.push(question_type_id);
      updates.push(`question_type_id = $${paramCount++}`);
    }
    if (question_text !== undefined) {
      params.push(question_text);
      updates.push(`question_text = $${paramCount++}`);
    }
    if (difficulty !== undefined) {
      params.push(difficulty);
      updates.push(`difficulty = $${paramCount++}`);
    }
    if (tags !== undefined) {
      params.push(tags);
      updates.push(`tags = $${paramCount++}`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    params.push(id);
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    
    const query = `
      UPDATE questions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    console.log(`✅ Admin updated question ID ${id}`);
    
    res.json({
      success: true,
      question: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating question:', error);
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
    
    const result = await pool.query(`
      DELETE FROM questions
      WHERE id = $1
      RETURNING id, question_text
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    console.log(`✅ Admin deleted question ID ${id}: ${result.rows[0].question_text.substring(0, 50)}...`);
    
    res.json({
      success: true,
      message: 'Question deleted',
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error deleting question:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/questions/bulk
 * Bulk import questions from array
 */
router.post('/questions/bulk', async (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'questions must be a non-empty array'
      });
    }
    
    const pool = getPool();
    const inserted = [];
    const errors = [];
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      try {
        const result = await pool.query(`
          INSERT INTO questions (category_id, question_type_id, question_text, difficulty, tags)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [q.category_id, q.question_type_id || null, q.question_text, q.difficulty, q.tags || []]);
        
        inserted.push(result.rows[0]);
      } catch (error) {
        errors.push({ index: i, question: q.question_text?.substring(0, 50), error: error.message });
      }
    }
    
    console.log(`✅ Admin bulk imported ${inserted.length} questions (${errors.length} errors)`);
    
    res.json({
      success: true,
      inserted_count: inserted.length,
      error_count: errors.length,
      inserted: inserted,
      errors: errors
    });
  } catch (error) {
    console.error('❌ Error in bulk import:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/schema/sample_answers', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'sample_answers'
      ORDER BY ordinal_position
    `);
    
    res.json({ success: true, columns: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/pinecone-test', async (req, res) => {
  try {
    const { Pinecone } = require('@pinecone-database/pinecone');
    const EmbeddingGenerator = require('../agents/tools/EmbeddingGenerator');
    
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX_NAME || 'tpm-interview-answers';
    const index = pinecone.index(indexName);
    
    // Get index stats
    const stats = await index.describeIndexStats();
    
    // Try a simple search without filters
    const embeddingGen = new EmbeddingGenerator();
    const testEmbedding = await embeddingGen.generateEmbedding("cloud migration AWS");
    
    const searchResults = await index.namespace('').query({
      vector: testEmbedding,
      topK: 3,
      includeMetadata: true
    });
    
    res.json({
      success: true,
      stats: stats,
      searchResults: searchResults.matches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/setup-production
 * One-time setup for production database
 * WARNING: This should be protected and removed after use!
 */
router.post('/setup-production', async (req, res) => {
  try {
    const { secret } = req.body;
    
    // Simple protection - use a secret key
    if (secret !== process.env.SETUP_SECRET) {
      return res.status(403).json({
        success: false,
        error: 'Invalid setup secret'
      });
    }
    
    const pool = getPool();
    const results = [];
    
    // Step 1: Check if migrations already run
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'categories'
    `);
    
    if (tablesCheck.rows.length > 0) {
      results.push('⚠️  Categories table already exists - skipping category migration');
    } else {
      // Run category migration
      const fs = require('fs');
      const path = require('path');
      
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, '../db/migrations/005_create_categories_system.sql'),
        'utf8'
      );
      
      await pool.query(migrationSQL);
      results.push('✅ Category tables created');
    }
    
    // Step 2: Check and seed categories
    const categoriesCount = await pool.query('SELECT COUNT(*) FROM categories');
    
    if (parseInt(categoriesCount.rows[0].count) === 0) {
      // Seed categories
      const categories = [
        { name: 'Program Sense', description: 'Program kickoff, MVP scoping, risk mitigation, execution, prioritization, and strategic influence', icon: '📊', competencies: ['Program Kickoff', 'Risk Mitigation', 'Execution', 'Prioritization', 'Strategic Influence', 'Communication'] },
        { name: 'System Design', description: 'Scalability, reliability, trade-offs, data modeling, and technical architecture decisions', icon: '🏗️', competencies: ['Scalability', 'Trade-offs', 'Components', 'Data Flow', 'Reliability'] },
        { name: 'Behavioral', description: 'Leadership, failure recovery, conflict resolution, cross-functional collaboration, and adaptability', icon: '👥', competencies: ['Leadership', 'Conflict Resolution', 'Influence', 'Ownership', 'Communication', 'Adaptability'] },
        { name: 'Technical', description: 'Problem-solving, code quality, complexity analysis, debugging, and technical decision making', icon: '💻', competencies: ['Problem Solving', 'Code Quality', 'Complexity Analysis', 'Debugging'] },
        { name: 'Partnership', description: 'Cross-functional influence, negotiation, stakeholder management, and alignment building', icon: '🤝', competencies: ['Influence', 'Negotiation', 'Communication', 'Cross-functional Alignment', 'Stakeholder Management'] }
      ];
      
      for (const cat of categories) {
        await pool.query(`
          INSERT INTO categories (name, description, icon, competencies)
          VALUES ($1, $2, $3, $4)
        `, [cat.name, cat.description, cat.icon, JSON.stringify(cat.competencies)]);
      }
      
      results.push('✅ 5 categories seeded');
    } else {
      results.push(`⚠️  Categories already exist (${categoriesCount.rows[0].count}) - skipping`);
    }
    
    // Step 3: Get final counts
    const finalCounts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM categories) as categories,
        (SELECT COUNT(*) FROM rubrics) as rubrics,
        (SELECT COUNT(*) FROM questions) as questions,
        (SELECT COUNT(*) FROM sample_answers) as samples
    `);
    
    results.push(`\n📊 Database Status:`);
    results.push(`   Categories: ${finalCounts.rows[0].categories}`);
    results.push(`   Rubrics: ${finalCounts.rows[0].rubrics}`);
    results.push(`   Questions: ${finalCounts.rows[0].questions}`);
    results.push(`   Sample Answers: ${finalCounts.rows[0].samples}`);
    
    res.json({
      success: true,
      message: 'Production setup complete',
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

module.exports = router;