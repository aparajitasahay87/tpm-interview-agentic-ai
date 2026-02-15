const { Pinecone } = require('@pinecone-database/pinecone');
const EmbeddingGenerator = require('./EmbeddingGenerator');
const EmbeddingCache = require('./EmbeddingCache');
const db = require('../../config/database');

class SemanticSearch {
  constructor() {
    // Initialize Pinecone
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    this.indexName = process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples';
    this.index = this.pinecone.index(this.indexName);
    
    // Initialize embedding generator with cache
    this.embeddingGenerator = new EmbeddingGenerator();
    this.embeddingCache = EmbeddingCache.getInstance();
  }

  /**
   * Find similar sample answers using semantic search
   * @param {string} userAnswer - User's answer text
   * @param {number|null} categoryId - Category ID to filter by
   * @param {number} topK - Number of results to return
   * @returns {Promise<Array>} Similar answers with details
   */
  async findSimilarAnswers(userAnswer, categoryId = null, topK = 5) {
    try {
      console.log('🔍 Starting semantic search...');
      console.log(`Category filter: ${categoryId || 'none'}`);
      
      // Step 1: Generate embedding for user answer (with cache)
      const queryEmbedding = await this.getEmbeddingWithCache(userAnswer);
      
      // Step 2: Search Pinecone
      const queryOptions = {
        vector: queryEmbedding,
        topK: topK,
        includeMetadata: true
      };

      // Add category filter if provided
      if (categoryId) {
        queryOptions.filter = {
          category_id: parseInt(categoryId)
        };
        console.log(`🎯 Filtering by category_id: ${categoryId}`);
      }

      const results = await this.index.namespace('').query(queryOptions);
      
      console.log(`📊 Pinecone returned ${results.matches.length} matches`);
      
      if (results.matches.length === 0) {
        console.log('⚠️  No similar examples found');
        return [];

      }
      
      // Step 3: Get sample IDs from Pinecone results
      const sampleIds = results.matches.map(match => match.id);

      // ADD THIS:
      console.log(`🔍 Extracted sample IDs from Pinecone:`, sampleIds);
      
      // Step 4: Fetch full sample answers from PostgreSQL
      const sampleAnswers = await db.query(`
        SELECT 
          id,
          question_type,
          question_text,
          answer_text,
          situation_text,
          task_text,
          action_text,
          result_text,
          overall_score,
          situation_score,
          task_score,
          action_score,
          result_score,
          level,
          company
        FROM sample_answers
        WHERE id = ANY($1)
      `, [sampleIds]);

      // ADD THIS:
console.log(`📊 PostgreSQL returned ${sampleAnswers.rows.length} rows for IDs:`, sampleIds);
console.log(`📊 Row data:`, sampleAnswers.rows);
      
      // Step 5: Combine Pinecone similarity scores with PostgreSQL data
      const enrichedResults = results.matches.map(match => {
        //const sampleData = sampleAnswers.rows.find(row => row.id === match.metadata.sample_id);
        const sampleData = sampleAnswers.rows.find(row => row.id === parseInt(match.id));
        
        if (!sampleData) {
          console.warn(`⚠️  Sample ${match.id} not found in database`);
          return null;
        }
      
        return {
          id: sampleData.id,
          similarity: match.score,
          score: parseFloat(sampleData.overall_score),
          question_type: sampleData.question_type,
          question_text: sampleData.question_text,
          answer_text: sampleData.answer_text,
          star: {
            situation: sampleData.situation_text,
            task: sampleData.task_text,
            action: sampleData.action_text,
            result: sampleData.result_text
          },
          level: sampleData.level,
          company: sampleData.company
        };
      }).filter(result => result !== null);
      
      console.log(`✅ Retrieved ${enrichedResults.length} similar examples with full details`);
      
      return enrichedResults;
      
    } catch (error) {
      console.error('❌ Semantic search error:', error);
      throw new Error(`Semantic search failed: ${error.message}`);
    }
  }

  /**
   * Generate embedding with caching
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async getEmbeddingWithCache(text) {
    // Try to get from cache first
    const cached = this.embeddingCache.get(text);
    if (cached) {
      console.log('✅ Cache hit for embedding');
      return cached;
    }
    
    // Generate new embedding
    console.log('🔄 Cache miss - generating new embedding');
    const embedding = await this.embeddingGenerator.generateEmbedding(text);
    
    // Store in cache
    this.embeddingCache.set(text, embedding);
    
    return embedding;
  }

  /**
   * Health check for semantic search system
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      // Check Pinecone connection
      const stats = await this.index.describeIndexStats();
      
      // Check database connection
      const dbResult = await db.query('SELECT COUNT(*) FROM sample_answers');
      const sampleCount = parseInt(dbResult.rows[0].count);
      
      // Get cache metrics
      const cacheMetrics = this.embeddingCache.getMetrics();
      
      return {
        status: 'healthy',
        pinecone: {
          connected: true,
          vectorCount: stats.totalRecordCount,
          dimension: stats.dimension
        },
        database: {
          connected: true,
          sampleCount: sampleCount
        },
        cache: cacheMetrics
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = SemanticSearch;