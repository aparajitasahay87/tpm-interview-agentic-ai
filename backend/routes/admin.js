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

module.exports = router;