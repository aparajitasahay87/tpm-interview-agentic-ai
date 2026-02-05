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
 * Complete production database setup with all rubrics embedded
 */
router.post('/admin/setup-production', async (req, res) => {
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
    
    console.log('🔄 Starting complete production setup...\n');
    
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
    // STEP 3: Seed Categories
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
    
    // Get category map
    const categoriesResult = await pool.query('SELECT id, name FROM categories');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });
    
    // =============================================
    // STEP 4: Seed ALL 26 Rubrics
    // =============================================
    try {
      const rubricsCount = await pool.query('SELECT COUNT(*) FROM rubrics');
      
      if (parseInt(rubricsCount.rows[0].count) < 26) {
        // Truncate to avoid duplicates
        await pool.query('TRUNCATE TABLE rubrics CASCADE');
        
        const allRubrics = [
          // PROGRAM SENSE (6)
          { cat: 'Program Sense', comp: 'Program Kickoff', l1: 'Mentions MVP, scoping, or product requirements', l3: 'Provides solid product sense for scoping an MVP and ensures clarity on success metrics for moving beyond MVP', l5: 'Exceptional MVP scoping with quantified success metrics (e.g., 30% adoption target), clear go/no-go criteria, phased rollout plan with defined milestones, and cross-functional stakeholder alignment on definition of done' },
          { cat: 'Program Sense', comp: 'Risk Mitigation', l1: 'Mentions risks or potential issues', l3: 'Demonstrates frequent communication of risks and is not afraid to ask for help', l5: 'Proactively identifies 10+ risks early, maintains risk register with mitigation plans, communicates weekly updates to stakeholders with proposed solutions, and reduced project delays by 40% through early escalation' },
          { cat: 'Program Sense', comp: 'Execution', l1: 'Describes executing a project or completing tasks', l3: 'Shows flexible execution style and willingness to adapt to the needs of a specific program or team. Ensures cross-functional alignment at every milestone', l5: 'Demonstrates adaptive execution across 5+ cross-functional teams, pivoted strategy 3 times based on changing requirements, maintained 95% milestone delivery rate, and established reusable execution framework adopted by 3 other teams' },
          { cat: 'Program Sense', comp: 'Prioritization', l1: 'Mentions prioritizing tasks or features', l3: 'Shows flexible execution style with clear prioritization framework and willingness to adapt to program needs', l5: 'Developed data-driven prioritization framework (RICE/value vs effort), deprioritized 40% of scope to hit critical deadline, aligned 5 VP-level stakeholders on priority stack rank, and delivered 80% of impact with 50% of original scope' },
          { cat: 'Program Sense', comp: 'Strategic Influence', l1: 'Mentions influencing stakeholders or providing input', l3: 'Displays examples where clear proposals were provided and buy-in was obtained to help shape the team\'s strategy', l5: 'Created strategic proposal that shifted team roadmap, obtained buy-in from 8 senior stakeholders through data-driven presentation, influenced $2M budget allocation, and proposal became company-wide standard adopted by 5 other orgs' },
          { cat: 'Program Sense', comp: 'Communication', l1: 'Mentions communicating with team or stakeholders', l3: 'When there is a missed deadline, shares why it happened as well as next steps to move forward including getting support from other teams to debug', l5: 'Proactively communicated critical 2-week delay with root cause analysis, presented 3 mitigation options with trade-offs, coordinated 4 teams to recover timeline, and established weekly stakeholder updates that became team standard' },
          
          // BEHAVIORAL (6)
          { cat: 'Behavioral', comp: 'Leadership', l1: 'Mentions leading a team or taking ownership', l3: 'Demonstrates leadership examples with clear structure, context, and impact on team performance', l5: 'Led cross-functional team of 15+ through ambiguous project, increased team velocity by 40%, mentored 3 junior team members to promotion, and established leadership practices adopted across organization' },
          { cat: 'Behavioral', comp: 'Conflict Resolution', l1: 'Mentions disagreement or conflict', l3: 'Displays detailed examples of how conflict was approached, resolved, or prevented with both sides considered', l5: 'Resolved VP-level conflict between 2 organizations through 1:1 mediation, identified shared goals, facilitated compromise that unblocked $5M project, and established conflict resolution framework preventing future escalations' },
          { cat: 'Behavioral', comp: 'Influence', l1: 'Mentions convincing others or getting agreement', l3: 'Shows empathy and strong EQ in building trust and influencing others without direct authority', l5: 'Influenced 6 senior stakeholders to change strategic direction through data-driven proposal, built coalition across 4 organizations, achieved unanimous buy-in without formal authority, and new strategy delivered 200% ROI' },
          { cat: 'Behavioral', comp: 'Ownership', l1: 'Mentions taking responsibility or being accountable', l3: 'Demonstrates taking full ownership of outcomes, including failures, with clear examples of accountability', l5: 'Took ownership of critical $2M project failure, conducted blameless postmortem with 20+ stakeholders, implemented 8 process improvements, and recovery plan delivered successful relaunch in 6 weeks' },
          { cat: 'Behavioral', comp: 'Communication', l1: 'Mentions communicating or providing updates', l3: 'Provides clear structure and context with examples, including quick summary and transparency', l5: 'Established executive communication framework with weekly updates to C-suite, presented 10+ strategic reviews with data-driven insights, and communication template adopted as company standard across 50+ teams' },
          { cat: 'Behavioral', comp: 'Adaptability', l1: 'Mentions adapting to change or being flexible', l3: 'Shows examples of adapting to changing requirements, pivoting strategy, and remaining effective under uncertainty', l5: 'Pivoted project strategy 4 times in 6 months due to market changes, maintained team morale through ambiguity, delivered on-time despite 50% scope change, and adaptability approach became team playbook' },
          // SYSTEM DESIGN (5)
          { cat: 'System Design', comp: 'Scalability', l1: 'Mentions scaling or handling growth', l3: 'Discusses scalability considerations, bottlenecks, and how the system handles increased load', l5: 'Designed system scaling from 1K to 10M users, implemented horizontal scaling with auto-scaling groups, reduced latency by 60% at 100x load, and architecture pattern adopted for 5 other services' },
          { cat: 'System Design', comp: 'Trade-offs', l1: 'Mentions different approaches or options', l3: 'Clearly articulates technical trade-offs between different design choices with pros and cons', l5: 'Evaluated 4 architectural approaches with detailed trade-off matrix (latency vs cost vs complexity), presented to engineering leadership, recommended approach saved $500K annually, and decision framework reused across org' },
          { cat: 'System Design', comp: 'Components', l1: 'Mentions system components or architecture', l3: 'Describes key system components, their interactions, and how they work together', l5: 'Designed 8-component microservices architecture with clear API contracts, implemented circuit breakers and graceful degradation, achieved 99.99% uptime, and component design became org-wide standard' },
          { cat: 'System Design', comp: 'Data Flow', l1: 'Mentions data or how information moves', l3: 'Explains data flow through the system, including storage, processing, and retrieval', l5: 'Architected data pipeline processing 5TB daily, implemented real-time and batch processing, reduced data latency from 24h to 5min, and pipeline architecture reused for 10+ other data products' },
          { cat: 'System Design', comp: 'Reliability', l1: 'Mentions uptime, errors, or system health', l3: 'Discusses reliability considerations including fault tolerance, monitoring, and error handling', l5: 'Implemented comprehensive reliability framework with circuit breakers, retry logic, monitoring dashboards, improved SLA from 99.5% to 99.95%, and reduced MTTR from 2h to 15min' },
          
          // TECHNICAL (4)
          { cat: 'Technical', comp: 'Problem Solving', l1: 'Mentions solving a technical problem', l3: 'Describes systematic approach to debugging and problem-solving with clear methodology', l5: 'Debugged critical production issue affecting 10K users, used systematic root cause analysis, implemented permanent fix in 4 hours, and created runbook preventing 12 similar incidents' },
          { cat: 'Technical', comp: 'Code Quality', l1: 'Mentions writing code or implementing features', l3: 'Discusses code quality practices including testing, documentation, and maintainability', l5: 'Established code quality standards with 90% test coverage requirement, implemented automated linting and review process, reduced bug rate by 70%, and standards adopted across 8 engineering teams' },
          { cat: 'Technical', comp: 'Complexity Analysis', l1: 'Mentions algorithm efficiency or performance', l3: 'Analyzes time and space complexity of solutions with Big-O notation and optimization opportunities', l5: 'Optimized algorithm from O(n²) to O(n log n), reduced processing time from 10min to 30sec for 1M records, and optimization pattern documented and reused in 15 other services' },
          { cat: 'Technical', comp: 'Debugging', l1: 'Mentions fixing bugs or issues', l3: 'Describes systematic debugging approach with tools, techniques, and root cause identification', l5: 'Debugged race condition affecting 0.1% of users, used distributed tracing and log correlation, identified root cause in 2 hours, implemented fix deployed to 50M users, and debugging methodology became team standard' },
          
          // PARTNERSHIP (5)
          { cat: 'Partnership', comp: 'Influence', l1: 'Mentions working with partners or other teams', l3: 'Displays empathy and strong EQ in building trust and winning influence with partner teams', l5: 'Built trusted relationships with 5 partner organizations, influenced roadmap alignment saving 6 months of duplicate work, achieved 100% partner satisfaction scores, and collaboration model adopted company-wide' },
          { cat: 'Partnership', comp: 'Negotiation', l1: 'Mentions negotiating or reaching agreements', l3: 'Shows win-win approach to negotiation with examples of compromise and mutual benefit', l5: 'Negotiated partnership terms with 3 external vendors, achieved 30% cost reduction while improving SLAs, established master agreement saving $2M annually, and negotiation framework reused for 10+ other partnerships' },
          { cat: 'Partnership', comp: 'Communication', l1: 'Mentions communicating with partners', l3: 'Demonstrates clear, frequent, and transparent communication with partner teams and stakeholders', l5: 'Established bi-weekly partner sync across 6 organizations, created shared dashboard for visibility, reduced escalations by 80%, and communication framework adopted as standard for all cross-org partnerships' },
          { cat: 'Partnership', comp: 'Cross-functional Alignment', l1: 'Mentions working with multiple teams', l3: 'Shows ability to align cross-functional teams on shared goals with clear examples', l5: 'Aligned 8 cross-functional teams (eng, product, design, legal, marketing, sales) on unified roadmap, resolved 15+ conflicting priorities, achieved 95% milestone delivery, and alignment process became org playbook' },
          { cat: 'Partnership', comp: 'Stakeholder Management', l1: 'Mentions managing stakeholders', l3: 'Demonstrates proactive stakeholder management with regular updates and clear communication', l5: 'Managed 12 executive stakeholders across 4 organizations, conducted monthly business reviews with metrics dashboards, achieved 100% satisfaction scores, and stakeholder framework adopted for all strategic initiatives' }
        ];
        
        // Insert all rubrics
        for (const r of allRubrics) {
          const catId = categoryMap[r.cat];
          if (catId) {
            await pool.query(`
              INSERT INTO rubrics (category_id, competency_name, level_1_description, level_3_description, level_5_description, weight)
              VALUES ($1, $2, $3, $4, $5, 1.0)
            `, [catId, r.comp, r.l1, r.l3, r.l5]);
          }
        }
        
        results.push('✅ Step 4: 26 rubrics seeded');
      } else {
        results.push(`⚠️  Step 4: ${rubricsCount.rows[0].count} rubrics exist`);
      }
    } catch (error) {
      results.push(`❌ Step 4 failed: ${error.message}`);
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
    results.push('⚠️  Note: Questions and sample answers can be added via admin API');
    
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

module.exports = router;