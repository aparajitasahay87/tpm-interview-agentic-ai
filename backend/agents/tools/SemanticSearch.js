const { getPineconeClient } = require('../../config/pinecone');
const { getPool } = require('../../config/database');
const EmbeddingGenerator = require('./EmbeddingGenerator');

/**
 * SemanticSearch Tool
 * Finds semantically similar ideal answers from Pinecone vector database
 * 
 * Purpose: Given a user's answer, find the 3 most similar high-quality examples
 * to help them understand what excellent answers look like
 */
class SemanticSearch {
  constructor() {
    this.embeddingGenerator = new EmbeddingGenerator();
    this.minSimilarityThreshold = 0.5; // 70% minimum similarity
    this.topK = 3; // Return top 3 matches
  }

  /**
   * Find similar answers to the user's input
   * @param {string} userAnswer - The user's answer text
   * @param {string} questionType - Optional filter by question type (leadership, conflict, etc.)
   * @returns {Promise<Array>} Array of similar examples with metadata
   */
  async findSimilarAnswers(userAnswer, questionType = null) {
    try {
      console.log('🔍 Starting semantic search...');
      console.log('User answer length:', userAnswer.length);
      console.log('Question type filter:', questionType || 'none');

      // Step 1: Generate embedding for user's answer
      const userEmbedding = await this.embeddingGenerator.generateEmbedding(userAnswer);
      console.log('✅ Generated embedding vector');

      // Step 2: Query Pinecone for similar vectors
      const pineconeResults = await this.queryPinecone(
        userEmbedding, 
        questionType
      );
      console.log(`📊 Found ${pineconeResults.length} matches from Pinecone`);

      // Step 3: Filter by similarity threshold
      const filteredResults = pineconeResults.filter(
        match => match.score >= this.minSimilarityThreshold
      );
      console.log(`✅ ${filteredResults.length} matches above ${this.minSimilarityThreshold * 100}% similarity`);

      if (filteredResults.length === 0) {
        console.log('⚠️  No matches above similarity threshold');
        return [];
      }

      // Step 4: Fetch full details from PostgreSQL
      const enrichedResults = await this.enrichWithDatabaseDetails(filteredResults);
      console.log(`✅ Enriched ${enrichedResults.length} results with full details`);

      return enrichedResults;

    } catch (error) {
      console.error('❌ Error in semantic search:', error);
      throw new Error(`Semantic search failed: ${error.message}`);
    }
  }

  /**
   * Query Pinecone vector database
   * @param {Array<number>} embedding - Vector embedding
   * @param {string} questionType - Optional question type filter
   * @returns {Promise<Array>} Pinecone query results
   */
  async queryPinecone(embedding, questionType) {
    try {
      const pinecone = await getPineconeClient();
      const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples');

      // Build query options
      const queryOptions = {
        vector: embedding,
        topK: this.topK,
        includeMetadata: true
      };

      // Add filter if question type specified
      if (questionType) {
        queryOptions.filter = {
          question_type: { $eq: questionType }
        };
        console.log('🎯 Filtering by question type:', questionType);
      }

      // Execute query
      const queryResponse = await index.query(queryOptions);

      if (!queryResponse.matches || queryResponse.matches.length === 0) {
        console.log('⚠️  No matches found in Pinecone');
        return [];
      }

      return queryResponse.matches;

    } catch (error) {
      console.error('❌ Pinecone query error:', error);
      throw new Error(`Pinecone query failed: ${error.message}`);
    }
  }

  /**
   * Enrich Pinecone results with full details from PostgreSQL
   * @param {Array} pineconeResults - Results from Pinecone
   * @returns {Promise<Array>} Enriched results with full answer details
   */
  async enrichWithDatabaseDetails(pineconeResults) {
    try {
      const pool = getPool();

      // Extract pinecone_ids from results
      const pineconeIds = pineconeResults.map(match => match.id);
      
      if (pineconeIds.length === 0) {
        return [];
      }

      // Query database for full details
      const placeholders = pineconeIds.map((_, i) => `$${i + 1}`).join(', ');
      const query = `
        SELECT 
          id,
          pinecone_id,
          question_type,
          question_text,
          answer_text,
          situation_text,
          task_text,
          action_text,
          result_text,
          level,
          overall_score,
          situation_score,
          task_score,
          action_score,
          result_score,
          metadata
        FROM sample_answers
        WHERE pinecone_id IN (${placeholders})
        ORDER BY overall_score DESC
      `;

      const result = await pool.query(query, pineconeIds);
      const dbRecords = result.rows;

      // Merge Pinecone similarity scores with database details
      const enrichedResults = pineconeResults.map(match => {
        const dbRecord = dbRecords.find(record => record.pinecone_id === match.id);
        
        if (!dbRecord) {
          console.warn(`⚠️  No database record found for pinecone_id: ${match.id}`);
          return null;
        }

        return {
          // Similarity information
          similarity: Math.round(match.score * 100), // Convert 0-1 to percentage
          similarity_score: match.score, // Keep raw score
          
          // Database information
          id: dbRecord.id,
          question_type: dbRecord.question_type,
          question_text: dbRecord.question_text,
          answer_text: dbRecord.answer_text,
          level: dbRecord.level,
          score: parseFloat(dbRecord.overall_score),
          
          // Individual STAR scores
          scores: {
            situation: dbRecord.situation_score,
            task: dbRecord.task_score,
            action: dbRecord.action_score,
            result: dbRecord.result_score,
            overall: parseFloat(dbRecord.overall_score)
          },
          
          // STAR breakdown
          star: {
            situation: dbRecord.situation_text,
            task: dbRecord.task_text,
            action: dbRecord.action_text,
            result: dbRecord.result_text
          },
          
          // Additional metadata
          metadata: dbRecord.metadata || {}
        };
      }).filter(result => result !== null); // Remove any null entries

      return enrichedResults;

    } catch (error) {
      console.error('❌ Database enrichment error:', error);
      throw new Error(`Failed to enrich results: ${error.message}`);
    }
  }

  /**
   * Format results for API response
   * @param {Array} results - Enriched search results
   * @returns {Object} Formatted response object
   */
  formatResponse(results) {
    return {
      count: results.length,
      threshold: this.minSimilarityThreshold * 100,
      examples: results.map((result, index) => ({
        rank: index + 1,
        similarity: result.similarity,
        score: result.score,
        question_type: result.question_type,
        question_text: result.question_text,
        answer_text: result.answer_text,
        level: result.level,
        star_breakdown: result.star,
        metadata: result.metadata
      }))
    };
  }

  /**
   * Get statistics about search results
   * @param {Array} results - Search results
   * @returns {Object} Statistics object
   */
  getStatistics(results) {
    if (results.length === 0) {
      return {
        count: 0,
        avg_similarity: 0,
        avg_score: 0,
        question_types: []
      };
    }

    const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const questionTypes = [...new Set(results.map(r => r.question_type))];

    return {
      count: results.length,
      avg_similarity: Math.round(avgSimilarity),
      avg_score: parseFloat(avgScore.toFixed(2)),
      question_types: questionTypes
    };
  }
}

module.exports = SemanticSearch;