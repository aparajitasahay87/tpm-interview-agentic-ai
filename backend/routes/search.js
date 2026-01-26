const express = require('express');
const router = express.Router();
const SemanticSearch = require('../agents/tools/SemanticSearch');

/**
 * Search Routes
 * Endpoints for semantic search functionality
 */

/**
 * POST /api/search/similar
 * Find similar ideal answers to user's input
 * 
 * Request body:
 * {
 *   "answer": "user's answer text",
 *   "question_type": "leadership" // optional
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "similar_examples": [...],
 *   "statistics": {...}
 * }
 */
router.post('/similar', async (req, res) => {
  try {
    const { answer, question_type } = req.body;

    // Validation
    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "answer" field in request body'
      });
    }

    if (answer.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Answer must be at least 10 characters long'
      });
    }

    // Optional question type validation
    const validQuestionTypes = ['leadership', 'conflict', 'failure', 'program_sense', 'technical'];
    if (question_type && !validQuestionTypes.includes(question_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid question_type. Must be one of: ${validQuestionTypes.join(', ')}`
      });
    }

    console.log('\n🔍 Semantic Search Request');
    console.log('Answer length:', answer.length);
    console.log('Question type:', question_type || 'none');

    // Perform semantic search
    const semanticSearch = new SemanticSearch();
    const results = await semanticSearch.findSimilarAnswers(answer, question_type);

    // Format response
    const formattedResponse = semanticSearch.formatResponse(results);
    const statistics = semanticSearch.getStatistics(results);

    console.log(`✅ Found ${results.length} similar examples`);
    console.log(`📊 Avg similarity: ${statistics.avg_similarity}%`);

    res.json({
      success: true,
      similar_examples: formattedResponse.examples,
      statistics: statistics,
      metadata: {
        threshold: formattedResponse.threshold,
        total_results: formattedResponse.count,
        filtered_by: question_type || null
      }
    });

  } catch (error) {
    console.error('❌ Search endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Semantic search failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/search/test
 * Test endpoint for semantic search with sample data
 */
router.post('/test', async (req, res) => {
  try {
    const sampleAnswer = `As a TPM at Amazon, I led a cross-functional team of 15 engineers 
    across 4 organizations to migrate our legacy payment system to a new microservices architecture. 
    The project had 47 dependencies and needed to be completed in 6 months. I established weekly 
    sync meetings, created a detailed dependency tracking dashboard, and coordinated with PM Sarah, 
    Tech Lead Mike, and Director Chen. We successfully launched on time, reducing payment processing 
    latency by 40%, handling 2.3M daily transactions with 99.9% uptime.`;

    console.log('\n🧪 Running semantic search test...');

    const semanticSearch = new SemanticSearch();
    const results = await semanticSearch.findSimilarAnswers(sampleAnswer, 'leadership');
    const formattedResponse = semanticSearch.formatResponse(results);
    const statistics = semanticSearch.getStatistics(results);

    console.log('✅ Test completed successfully');

    res.json({
      success: true,
      test_input: {
        answer: sampleAnswer.substring(0, 100) + '...',
        question_type: 'leadership'
      },
      similar_examples: formattedResponse.examples,
      statistics: statistics,
      metadata: {
        threshold: formattedResponse.threshold,
        total_results: formattedResponse.count
      }
    });

  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/search/health
 * Health check for search functionality
 */
router.get('/health', async (req, res) => {
  try {
    const { getPineconeClient } = require('../config/pinecone');
    const { getPool } = require('../config/database');

    // Check Pinecone
    const pinecone = await getPineconeClient();
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples');
    const stats = await index.describeIndexStats();

    // Check PostgreSQL
    const pool = getPool();
    const result = await pool.query('SELECT COUNT(*) FROM sample_answers WHERE pinecone_id IS NOT NULL');
    const embeddedCount = parseInt(result.rows[0].count);

    res.json({
      success: true,
      status: 'healthy',
      components: {
        pinecone: {
          status: 'connected',
          vectors: stats.totalRecordCount || 0,
          index: process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples'
        },
        postgres: {
          status: 'connected',
          embedded_samples: embeddedCount
        }
      },
      ready: stats.totalRecordCount > 0 && embeddedCount > 0
    });

  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;