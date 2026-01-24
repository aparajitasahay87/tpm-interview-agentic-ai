const OpenAI = require('openai');

class EmbeddingGenerator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - 1536-dimensional vector
   */
  async generateEmbedding(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text.trim(),
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      
      console.log(`✅ Generated embedding: ${embedding.length} dimensions`);
      
      return embedding;
    } catch (error) {
      console.error('❌ Embedding generation failed:', error.message);
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

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: validTexts,
        encoding_format: 'float'
      });

      const embeddings = response.data.map(item => item.embedding);
      
      console.log(`✅ Generated ${embeddings.length} embeddings`);
      
      return embeddings;
    } catch (error) {
      console.error('❌ Batch embedding generation failed:', error.message);
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