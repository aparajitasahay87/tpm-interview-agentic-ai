const crypto = require('crypto');

/**
 * Production-Ready Embedding Cache
 * Addresses: memory leaks, metrics, expiration, collision resistance
 */
class EmbeddingCache {
  constructor(options = {}) {
    // LRU cache with size limit (Fix #2)
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default (Fix #3)
    
    // Cache storage: Map maintains insertion order for LRU
    this.cache = new Map();
    
    // Metrics (Fix #7)
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      errors: 0
    };
  }

  /**
   * Generate hash with SHA-256 (Fix #5 - collision resistance)
   * @param {string} text - Text to hash
   * @returns {string} SHA-256 hash
   */
  hashText(text) {
    try {
      // Improved normalization (Fix #4)
      const normalized = text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')           // Collapse spaces
        .replace(/[^\w\s]/g, '')        // Remove punctuation
        .replace(/\d+/g, (num) => {     // Normalize numbers: "5" → "five"
          const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 
                          'six', 'seven', 'eight', 'nine', 'ten'];
          return numbers[parseInt(num)] || num;
        });
      
      // Use SHA-256 instead of MD5 (Fix #5)
      return crypto.createHash('sha256').update(normalized).digest('hex');
    } catch (error) {
      console.error('❌ Hash generation error:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Get embedding from cache
   * @param {string} text - Text to look up
   * @returns {Object|null} Cached entry or null
   */
  get(text) {
    try {
      const hash = this.hashText(text);
      const entry = this.cache.get(hash);
      
      // Check if entry exists and is not expired (Fix #3)
      if (entry) {
        const isExpired = Date.now() - entry.timestamp > this.ttl;
        
        if (isExpired) {
          console.log('⏰ Cache entry expired, removing...');
          this.cache.delete(hash);
          this.metrics.evictions++;
          this.metrics.misses++;
          return null;
        }
        
        // Cache hit - move to end for LRU (Fix #2)
        this.cache.delete(hash);
        this.cache.set(hash, entry);
        this.metrics.hits++;
        
        console.log(`✅ Cache hit (${this.getHitRate()}% hit rate)`);
        return entry.embedding;
      }
      
      // Cache miss
      this.metrics.misses++;
      return null;
      
    } catch (error) {
      console.error('❌ Cache get error:', error);
      this.metrics.errors++;
      return null; // Graceful degradation (Fix #10)
    }
  }

  /**
   * Set embedding in cache with LRU eviction
   * @param {string} text - Text key
   * @param {Array} embedding - Embedding vector
   */
  set(text, embedding) {
    try {
      const hash = this.hashText(text);
      
      // LRU eviction: remove oldest entry if at capacity (Fix #2)
      if (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
        this.metrics.evictions++;
        console.log(`🗑️  Evicted oldest cache entry (size: ${this.cache.size}/${this.maxSize})`);
      }
      
      // Store with timestamp for TTL (Fix #3)
      this.cache.set(hash, {
        embedding,
        timestamp: Date.now(),
        textLength: text.length
      });
      
      console.log(`📦 Cached embedding (size: ${this.cache.size}/${this.maxSize})`);
      
    } catch (error) {
      console.error('❌ Cache set error:', error);
      this.metrics.errors++;
      // Don't throw - graceful degradation (Fix #10)
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }

  /**
   * Invalidate specific entry (for updates)
   * @param {string} text - Text to invalidate
   */
  invalidate(text) {
    try {
      const hash = this.hashText(text);
      const deleted = this.cache.delete(hash);
      if (deleted) {
        console.log('🔄 Cache entry invalidated');
      }
    } catch (error) {
      console.error('❌ Cache invalidate error:', error);
      this.metrics.errors++;
    }
  }

  /**
   * Get cache metrics (Fix #7)
   * @returns {Object} Cache statistics
   */
  getMetrics() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 
      ? ((this.metrics.hits / totalRequests) * 100).toFixed(2)
      : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      evictions: this.metrics.evictions,
      errors: this.metrics.errors,
      hitRate: `${hitRate}%`,
      totalRequests
    };
  }

  /**
   * Get hit rate percentage
   * @returns {string} Hit rate
   */
  getHitRate() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    return totalRequests > 0 
      ? ((this.metrics.hits / totalRequests) * 100).toFixed(1)
      : '0.0';
  }

  /**
   * Get cache size in MB (approximate)
   * @returns {string} Size in MB
   */
  getSizeInMB() {
    // Each embedding is ~1536 floats × 8 bytes = ~12KB
    const sizeInBytes = this.cache.size * 12288;
    return (sizeInBytes / (1024 * 1024)).toFixed(2);
  }
}

module.exports = EmbeddingCache;