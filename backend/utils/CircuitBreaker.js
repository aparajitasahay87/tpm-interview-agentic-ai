/**
 * Circuit Breaker Pattern
 * Prevents cascading failures when external services (OpenAI) fail
 * 
 * States:
 * - CLOSED: Normal operation
 * - OPEN: Too many failures, fast-fail
 * - HALF_OPEN: Testing if service recovered
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5; // Open after 5 failures
    this.recoveryTimeout = options.recoveryTimeout || 60000; // Try recovery after 60s
    this.monitoringPeriod = options.monitoringPeriod || 120000; // Reset counts after 2 min
    
    // State
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    
    // Metrics
    this.metrics = {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      circuitOpenCount: 0
    };
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Result or throws CircuitBreakerOpenError
   */
  async execute(fn) {
    this.metrics.totalCalls++;
    
    // Check if circuit is open
    if (this.state === 'OPEN') {
      // Check if enough time passed to try recovery
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceLastFailure >= this.recoveryTimeout) {
        console.log('🔄 Circuit breaker: Entering HALF_OPEN state (testing recovery)');
        this.state = 'HALF_OPEN';
      } else {
        console.log('⚡ Circuit breaker: OPEN - Fast failing');
        this.metrics.circuitOpenCount++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN. Service unavailable. Retry in ${Math.ceil((this.recoveryTimeout - timeSinceLastFailure) / 1000)}s`
        );
      }
    }
    
    try {
      // Execute the function
      const result = await fn();
      
      // Success!
      this.onSuccess();
      return result;
      
    } catch (error) {
      // Failure
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.metrics.successCount++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      console.log('✅ Circuit breaker: Recovery successful - Closing circuit');
      this.state = 'CLOSED';
      this.failureCount = 0;
    }
    
    // Reset failure count if monitoring period passed
    if (this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.monitoringPeriod) {
        this.failureCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  onFailure() {
    this.metrics.failureCount++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    console.log(`⚠️ Circuit breaker: Failure ${this.failureCount}/${this.failureThreshold}`);
    
    if (this.state === 'HALF_OPEN') {
      // Recovery test failed - reopen circuit
      console.log('❌ Circuit breaker: Recovery test failed - Opening circuit');
      this.state = 'OPEN';
    } else if (this.failureCount >= this.failureThreshold) {
      // Too many failures - open circuit
      console.log('🔴 Circuit breaker: Threshold reached - Opening circuit');
      this.state = 'OPEN';
    }
  }

  /**
   * Get current state
   * @returns {string} Current circuit state
   */
  getState() {
    return this.state;
  }

  /**
   * Get metrics
   * @returns {Object} Circuit breaker metrics
   */
  getMetrics() {
    const successRate = this.metrics.totalCalls > 0
      ? ((this.metrics.successCount / this.metrics.totalCalls) * 100).toFixed(2)
      : 0;
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      ...this.metrics,
      successRate: `${successRate}%`
    };
  }

  /**
   * Manually reset circuit
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    console.log('🔄 Circuit breaker: Manually reset');
  }
}

/**
 * Custom error for circuit breaker open state
 */
class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.isCircuitBreakerOpen = true;
  }
}

module.exports = { CircuitBreaker, CircuitBreakerOpenError };