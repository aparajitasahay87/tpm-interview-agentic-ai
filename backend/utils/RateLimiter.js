const Bottleneck = require('bottleneck');

/**
 * Rate Limiter for OpenAI API calls
 * Ensures we stay within tier limits and handle bursts gracefully
 */
class RateLimiter {
  constructor() {
    // Tier 2 limits: 500 RPM, 200K TPM
    // Set to 450 RPM for safety margin
    this.limiter = new Bottleneck({
      minTime: 133, // 450 requests per minute = ~133ms between requests
      maxConcurrent: 10, // Allow up to 10 concurrent requests
      reservoir: 450, // Start with 450 tokens
      reservoirRefreshAmount: 450, // Refresh to 450
      reservoirRefreshInterval: 60 * 1000 // Every minute
    });

    // Track metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitErrors: 0,
      averageWaitTime: 0
    };

    // Event listeners for monitoring
    this.setupMonitoring();
  }

  setupMonitoring() {
    this.limiter.on('failed', async (error, jobInfo) => {
      this.metrics.failedRequests++;
      
      if (error.status === 429) {
        this.metrics.rateLimitErrors++;
        console.warn('⚠️  Rate limit hit, retrying...');
        
        // Retry after delay
        return 10000; // Wait 10 seconds before retry
      }
    });

    this.limiter.on('done', (info) => {
      this.metrics.successfulRequests++;
      this.metrics.averageWaitTime = 
        (this.metrics.averageWaitTime * (this.metrics.totalRequests - 1) + info.waitTime) / 
        this.metrics.totalRequests;
    });
  }

  /**
   * Wrap OpenAI API call with rate limiting
   * @param {Function} apiCall - The OpenAI API call function
   * @param {string} callType - Type of call (for logging)
   * @returns {Promise} Rate-limited API response
   */
  async execute(apiCall, callType = 'openai') {
    this.metrics.totalRequests++;
    
    const startTime = Date.now();
    
    try {
      const result = await this.limiter.schedule(async () => {
        console.log(`🔄 Executing ${callType} call...`);
        return await apiCall();
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${callType} completed in ${duration}ms`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ ${callType} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentQueueSize: this.limiter.counts().QUEUED,
      currentRunning: this.limiter.counts().RUNNING
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitErrors: 0,
      averageWaitTime: 0
    };
  }
}

// Singleton instance
let rateLimiterInstance = null;

/**
 * Get or create rate limiter instance
 */
function getRateLimiter() {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

module.exports = { RateLimiter, getRateLimiter };