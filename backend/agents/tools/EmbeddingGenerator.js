const OpenAI = require('openai');
const { CircuitBreaker } = require('../../utils/CircuitBreaker');

class EmbeddingGenerator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS) || 512; // ⭐ NEW: Default 512
    
    // ⭐ Circuit breaker for embedding API
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      monitoringPeriod: 60000
    });
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - 512-dimensional vector (configurable)
   */
  async generateEmbedding(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      // ⭐ Wrap in circuit breaker
      const embedding = await this.circuitBreaker.execute(async () => {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: text.trim(),
          encoding_format: 'float',
          dimensions: this.dimensions  // ⭐ NEW
        });

        const embedding = response.data[0].embedding;
        console.log(`✅ Generated embedding: ${embedding.length} dimensions`);
        
        return embedding;
      });
      
      return embedding;
      
    } catch (error) {
      console.error('❌ Embedding generation failed:', error.message);
      
      // ⭐ Handle circuit breaker open state
      if (error.isCircuitBreakerOpen) {
        console.log('🔄 Circuit open - returning zero vector for embeddings');
        // Return zero vector as graceful degradation
        return new Array(this.dimensions).fill(0);  // ⭐ UPDATED
      }
      
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Array of embeddings
   */
  async generateEmbeddings(texts) {
    try {
      if (!texts || texts.length === 0) {
        throw new Error('Texts array cannot be empty');
      }

      // Filter out empty texts
      const validTexts = texts.filter(t => t && t.trim().length > 0);
      
      if (validTexts.length === 0) {
        throw new Error('No valid texts provided');
      }

      console.log(`📊 Generating ${validTexts.length} embeddings...`);

      // ⭐ Wrap in circuit breaker
      const embeddings = await this.circuitBreaker.execute(async () => {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: validTexts,
          encoding_format: 'float',
          dimensions: this.dimensions  // ⭐ NEW
        });

        const embeddings = response.data.map(item => item.embedding);
        console.log(`✅ Generated ${embeddings.length} embeddings`);
        
        return embeddings;
      });
      
      return embeddings;
      
    } catch (error) {
      console.error('❌ Batch embedding generation failed:', error.message);
      
      // ⭐ Handle circuit breaker open state
      if (error.isCircuitBreakerOpen) {
        console.log('🔄 Circuit open - returning zero vectors for batch embeddings');
        return validTexts.map(() => new Array(this.dimensions).fill(0));  // ⭐ UPDATED
      }
      
      throw error;
    }
  }

  /**
   * Prepare text for embedding (combine question + answer for better context)
   * @param {object} sample - Sample answer object
   * @returns {string} - Combined text for embedding
   */
  prepareTextForEmbedding(sample) {
    const parts = [];
    
    if (sample.question_text) {
      parts.push(`Question: ${sample.question_text}`);
    }
    
    if (sample.question_type) {
      parts.push(`Category: ${sample.question_type}`);
    }
    
    if (sample.level) {
      parts.push(`Level: ${sample.level}`);
    }
    
    if (sample.answer_text) {
      parts.push(`Answer: ${sample.answer_text}`);
    }
    
    return parts.join('\n');
  }
}

module.exports = EmbeddingGenerator;
