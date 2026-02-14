const db = require('../config/database');

/**
 * In-Memory Cache Service
 * Caches static/semi-static data to reduce database queries
 */
class CacheService {
  constructor() {
    this.cache = {
      rubrics: null,
      categories: null,
      questions: null
    };
    
    this.cacheTimestamps = {
      rubrics: null,
      categories: null,
      questions: null
    };
    
    // Cache TTLs (time to live)
    this.ttl = {
      rubrics: 24 * 60 * 60 * 1000, // 24 hours
      categories: 24 * 60 * 60 * 1000, // 24 hours
      questions: 60 * 60 * 1000 // 1 hour
    };
    
    this.metrics = {
      hits: 0,
      misses: 0,
      refreshes: 0
    };
  }

  /**
   * Initialize cache on server startup
   */
  async initialize() {
    console.log('🔄 Initializing cache service...');
    
    await Promise.all([
      this.refreshRubrics(),
      this.refreshCategories(),
      this.refreshQuestions()
    ]);
    
    console.log('✅ Cache service initialized');
    console.log(`  - Rubrics: ${this.cache.rubrics?.length || 0} items`);
    console.log(`  - Categories: ${this.cache.categories?.length || 0} items`);
    console.log(`  - Questions: ${this.cache.questions?.length || 0} items`);
  }

  /**
   * Check if cache is stale
   */
  isStale(cacheKey) {
    if (!this.cacheTimestamps[cacheKey]) return true;
    
    const age = Date.now() - this.cacheTimestamps[cacheKey];
    return age > this.ttl[cacheKey];
  }

  /**
   * Get rubrics (with auto-refresh)
   */
  async getRubrics(categoryId = null) {
    // Check if cache needs refresh
    if (!this.cache.rubrics || this.isStale('rubrics')) {
      console.log('🔄 Cache miss - refreshing rubrics');
      await this.refreshRubrics();
      this.metrics.misses++;
      this.metrics.refreshes++;
    } else {
      this.metrics.hits++;
    }
    
    // Filter by category if specified
    if (categoryId) {
      return this.cache.rubrics.filter(r => r.category_id === categoryId);
    }
    
    return this.cache.rubrics;
  }

  /**
   * Get categories (with auto-refresh)
   */
  async getCategories() {
    if (!this.cache.categories || this.isStale('categories')) {
      console.log('🔄 Cache miss - refreshing categories');
      await this.refreshCategories();
      this.metrics.misses++;
      this.metrics.refreshes++;
    } else {
      this.metrics.hits++;
    }
    
    return this.cache.categories;
  }

  /**
   * Get category by ID
   */
  async getCategoryById(categoryId) {
    const categories = await this.getCategories();
    return categories.find(c => c.id === categoryId);
  }

  /**
   * Get questions (with auto-refresh)
   */
  async getQuestions(categoryId = null) {
    if (!this.cache.questions || this.isStale('questions')) {
      console.log('🔄 Cache miss - refreshing questions');
      await this.refreshQuestions();
      this.metrics.misses++;
      this.metrics.refreshes++;
    } else {
      this.metrics.hits++;
    }
    
    // Filter by category if specified
    if (categoryId) {
      return this.cache.questions.filter(q => q.category_id === categoryId);
    }
    
    return this.cache.questions;
  }

  /**
   * Refresh rubrics from database
   */
  async refreshRubrics() {
    try {
      const result = await db.query(`
        SELECT 
          id,
          category_id,
          competency_name,
          level_1_description as level_1,
          level_3_description as level_3,
          level_5_description as level_5,
          weight
        FROM rubrics
        ORDER BY category_id, competency_name
      `);
      
      this.cache.rubrics = result.rows;
      this.cacheTimestamps.rubrics = Date.now();
      
      console.log(`✅ Refreshed rubrics cache: ${result.rows.length} items`);
      
    } catch (error) {
      console.error('❌ Failed to refresh rubrics cache:', error);
      throw error;
    }
  }

  /**
   * Refresh categories from database
   */
  async refreshCategories() {
    try {
      const result = await db.query(`
        SELECT 
          id,
          name,
          description
        FROM categories
        ORDER BY id
      `);
      
      this.cache.categories = result.rows;
      this.cacheTimestamps.categories = Date.now();
      
      console.log(`✅ Refreshed categories cache: ${result.rows.length} items`);
      
    } catch (error) {
      console.error('❌ Failed to refresh categories cache:', error);
      throw error;
    }
  }

  /**
   * Refresh questions from database
   */
  async refreshQuestions() {
    try {
      const result = await db.query(`
        SELECT 
          id,
          category_id,
          question_text,
          question_type_id
        FROM questions
        ORDER BY category_id, id
      `);
      
      this.cache.questions = result.rows;
      this.cacheTimestamps.questions = Date.now();
      
      console.log(`✅ Refreshed questions cache: ${result.rows.length} items`);
      
    } catch (error) {
      console.error('❌ Failed to refresh questions cache:', error);
      throw error;
    }
  }

  /**
   * Manually invalidate cache
   */
  invalidate(cacheKey) {
    if (cacheKey) {
      this.cache[cacheKey] = null;
      this.cacheTimestamps[cacheKey] = null;
      console.log(`🗑️  Invalidated ${cacheKey} cache`);
    } else {
      // Invalidate all
      Object.keys(this.cache).forEach(key => {
        this.cache[key] = null;
        this.cacheTimestamps[key] = null;
      });
      console.log('🗑️  Invalidated all caches');
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 
      ? (this.metrics.hits / totalRequests * 100).toFixed(2)
      : 0;
    
    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      totalRequests
    };
  }

  /**
   * Get cache status
   */
  getStatus() {
    return {
      rubrics: {
        cached: !!this.cache.rubrics,
        count: this.cache.rubrics?.length || 0,
        age: this.cacheTimestamps.rubrics 
          ? Date.now() - this.cacheTimestamps.rubrics 
          : null,
        stale: this.isStale('rubrics')
      },
      categories: {
        cached: !!this.cache.categories,
        count: this.cache.categories?.length || 0,
        age: this.cacheTimestamps.categories 
          ? Date.now() - this.cacheTimestamps.categories 
          : null,
        stale: this.isStale('categories')
      },
      questions: {
        cached: !!this.cache.questions,
        count: this.cache.questions?.length || 0,
        age: this.cacheTimestamps.questions 
          ? Date.now() - this.cacheTimestamps.questions 
          : null,
        stale: this.isStale('questions')
      },
      metrics: this.getMetrics()
    };
  }
}

// Singleton instance
let cacheServiceInstance = null;

/**
 * Get or create cache service instance
 */
function getCacheService() {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

module.exports = { CacheService, getCacheService };