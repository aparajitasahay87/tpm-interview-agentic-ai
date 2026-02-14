const OpenAI = require('openai');
const pool = require('../../config/database');
const { CircuitBreaker } = require('../../utils/CircuitBreaker');
const { getRateLimiter } = require('../../utils/RateLimiter');

/**
 * METADATA EXTRACTOR - ADAPTIVE VERSION
 * 
 * Philosophy: Extract what's ACTUALLY present, not force rigid fields
 * 
 * Key Improvements:
 * 1. Semantic understanding - captures context even without explicit labels
 * 2. Flexible schema - adapts to what's in the answer
 * 3. Contextual intelligence - understands implicit signals
 * 4. No forced fields - returns null/empty only when truly missing
 * 
 * Example:
 * User: "At a Fortune 500 company, I led 8 teams..."
 * Extract: organizational_scale: "Fortune 500", seniority_indicators: ["led 8 teams"]
 * NOT: company: null, role: null ❌
 * 
 * Caching: 3-layer (Memory + DB + API)
 * Resilience: Circuit breaker + Rate limiter
 */
class MetadataExtractor {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Layer 1: In-memory cache
    this.memoryCache = new Map();
    
    // Circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      monitoringPeriod: 60000
    });
    
    // Rate limiter
    this.rateLimiter = getRateLimiter();
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      memoryCacheHits: 0,
      dbCacheHits: 0,
      apiCalls: 0,
      errors: 0
    };
  }

  /**
   * Extract adaptive metadata with 3-layer caching
   */
  async extractMetadata(example) {
    this.metrics.totalRequests++;
    
    try {
      const cacheKey = this.generateCacheKey(example);
      
      // Layer 1: Memory cache
      const memoryResult = this.checkMemoryCache(cacheKey);
      if (memoryResult) {
        this.metrics.memoryCacheHits++;
        console.log('✅ Memory cache hit');
        return memoryResult;
      }
      
      // Layer 2: DB cache
      const dbResult = await this.checkDBCache(example);
      if (dbResult) {
        this.metrics.dbCacheHits++;
        console.log('✅ DB cache hit');
        this.memoryCache.set(cacheKey, dbResult);
        return dbResult;
      }
      
      // Layer 3: OpenAI API
      console.log('🔍 Cache miss - extracting adaptive metadata...');
      this.metrics.apiCalls++;
      
      const metadata = await this.callOpenAIAPI(example);
      
      // Save to both caches
      await this.saveToDBCache(example, metadata);
      this.memoryCache.set(cacheKey, metadata);
      
      console.log('✅ Adaptive metadata extracted and cached');
      return metadata;
      
    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Metadata extraction error:', error.message);
      return this.getFallback(example);
    }
  }

  /**
   * Generate cache key
   */
  generateCacheKey(example) {
    if (example.id) {
      return `metadata:adaptive:${example.id}`;
    }
    const textSnippet = (example.answer_text || '').slice(0, 50);
    return `metadata:adaptive:${textSnippet}`;
  }

  /**
   * Layer 1: Memory cache
   */
  checkMemoryCache(cacheKey) {
    return this.memoryCache.get(cacheKey) || null;
  }

  /**
   * Layer 2: DB cache
   */
  async checkDBCache(example) {
    if (!example.id) return null;
    
    try {
      const result = await pool.query(
        'SELECT metadata FROM metadata_cache WHERE sample_answer_id = $1',
        [example.id]
      );
      
      return result.rows.length > 0 ? result.rows[0].metadata : null;
    } catch (error) {
      console.error('⚠️  DB cache lookup failed:', error.message);
      return null;
    }
  }

  /**
   * Save to DB cache
   */
  async saveToDBCache(example, metadata) {
    if (!example.id) {
      console.log('⚠️  Skipping DB cache save (no sample_answer_id)');
      return;
    }
    
    try {
      await pool.query(
        `INSERT INTO metadata_cache (sample_answer_id, metadata, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (sample_answer_id) 
         DO UPDATE SET metadata = $2, updated_at = NOW()`,
        [example.id, JSON.stringify(metadata)]
      );
      
      console.log('💾 Saved to DB cache');
    } catch (error) {
      console.error('⚠️  DB cache save failed:', error.message);
    }
  }

  /**
   * Layer 3: Call OpenAI API with adaptive extraction
   */
  async callOpenAIAPI(example) {
    const prompt = this.buildAdaptivePrompt(example);
    
    // Double-wrapped: Rate Limiter → Circuit Breaker → OpenAI
    return await this.rateLimiter.execute(async () => {
      return await this.circuitBreaker.execute(async () => {
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { 
              role: 'system', 
              content: 'You are an expert at extracting contextual metadata from TPM interview answers. You understand implicit signals and adapt to what information is actually present. Return only valid JSON.' 
            },
            { 
              role: 'user', 
              content: prompt 
            }
          ],
          temperature: 0.2,
          max_tokens: 800,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);
        
      });
    }, 'metadata-extraction-adaptive');
  }

  /**
   * Build adaptive extraction prompt
   */
  buildAdaptivePrompt(example) {
    const promptData = {
      task: "adaptive_metadata_extraction",
      answer_text: example.answer_text,
      star_components: example.star || {},
      
      extraction_philosophy: {
        adaptive: "Extract what's ACTUALLY present, don't force missing fields",
        semantic: "Understand context even without explicit labels",
        intelligent: "Capture implicit signals (e.g., 'led 8 teams' → seniority indicator)",
        flexible: "Schema adapts to content, not rigid structure"
      },
      
      metadata_schema: {
        context: {
          description: "Organizational and environmental context signals",
          fields: {
            organizational_scale: "Examples: 'Meta', 'Fortune 500 tech company', 'startup', 'enterprise SaaS', 'mid-size company'",
            organizational_context: "Examples: 'payments infrastructure team', 'cloud platform division', 'mobile app team'",
            scope: "Examples: '50M users', 'global deployment', 'enterprise B2B clients', 'mission-critical system'",
            environment: "Examples: 'fast-paced startup', 'regulated industry', 'high-growth', 'legacy systems'",
            seniority_indicators: "Array of signals like: 'led 8 teams', 'reported to VP', 'managed $10M budget', 'company-wide initiative'"
          },
          extract_if: "ANY organizational or environmental context is mentioned"
        },
        
        complexity_signals: {
          description: "Indicators of project/problem complexity",
          fields: {
            team_scale: "Examples: '8 engineering teams', 'cross-functional 20+ people', 'distributed global team'",
            technical_scope: "Array: ['microservices migration', 'AWS infrastructure', 'distributed systems', 'real-time processing']",
            timeline: "Examples: '6 months', 'Q1 2024', '3-month sprint', 'multi-year initiative'",
            constraints: "Array: ['zero downtime', 'backwards compatible', 'budget constraints', 'regulatory compliance', 'legacy system integration']"
          },
          extract_if: "Project complexity or challenges are described"
        },
        
        execution_evidence: {
          description: "How the work was actually executed",
          fields: {
            stakeholder_collaboration: "Array: ['engineering leadership', 'product partners', 'executive sponsors', 'customer success', 'external vendors']",
            processes_used: "Array: ['agile sprints', 'RFC process', 'design reviews', 'postmortems', 'A/B testing']",
            tools_technologies: "Array: ['JIRA', 'AWS', 'Kubernetes', 'Terraform', 'Datadog', 'Slack']",
            decision_frameworks: "Array: ['cost-benefit analysis', 'A/B testing', 'risk matrix', 'data-driven decisions', 'trade-off analysis']"
          },
          extract_if: "Execution methods, tools, or processes are mentioned"
        },
        
        impact_signals: {
          description: "Evidence of measurable outcomes and impact",
          fields: {
            quantified_metrics: "Array: ['51% improvement', '$2M savings', '99.9% uptime', '10x faster', '3 month reduction']",
            comparative_metrics: "Array: ['340ms to 165ms', '2 hours to 15 minutes', '100K to 1M users']",
            business_impact: "Array: ['revenue increase', 'cost reduction', 'customer satisfaction up', 'market share growth']",
            scale_of_impact: "Examples: 'company-wide', 'platform-level', 'team-specific', 'industry-leading', 'customer-facing'"
          },
          extract_if: "Results, outcomes, or impact are described"
        }
      },
      
      critical_instructions: [
        "ONLY include fields that have actual data from the answer",
        "Use semantic understanding - 'Fortune 500 company' is organizational_scale even without explicit company name",
        "Capture implicit signals - 'led 8 teams' is a seniority_indicator",
        "Return empty object {} for categories with NO relevant data",
        "Return empty arrays [] for array fields with no data",
        "Be generous with extraction - if context hints at something, include it",
        "Don't invent data - only extract what's actually there or strongly implied"
      ],
      
      output_format: {
        context: "Object with relevant fields or {} if none",
        complexity_signals: "Object with relevant fields or {} if none",
        execution_evidence: "Object with relevant fields or {} if none",
        impact_signals: "Object with relevant fields or {} if none"
      }
    };

    return `Extract adaptive, contextual metadata from this TPM interview answer.

DATA:
${JSON.stringify(promptData, null, 2)}

Remember: Extract what's PRESENT, adapt to the content, understand implicit context.

Return JSON with only the metadata categories and fields that have actual data.`;
  }

  /**
   * Fallback response
   */
  getFallback(example) {
    console.log('🔄 Returning fallback metadata');
    
    return {
      context: {},
      complexity_signals: {},
      execution_evidence: {},
      impact_signals: {},
      _fallback: true,
      _reason: 'API unavailable or extraction failed'
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.totalRequests > 0
      ? (((this.metrics.memoryCacheHits + this.metrics.dbCacheHits) / this.metrics.totalRequests) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.metrics,
      memoryCacheSize: this.memoryCache.size,
      cacheHitRate: `${cacheHitRate}%`,
      apiCallRate: this.metrics.totalRequests > 0
        ? `${((this.metrics.apiCalls / this.metrics.totalRequests) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache() {
    this.memoryCache.clear();
    console.log('🗑️  Memory cache cleared');
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }
}

module.exports = MetadataExtractor;