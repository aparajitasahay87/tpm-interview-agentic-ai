const OpenAI = require('openai');
const SemanticSearch = require('./SemanticSearch');
const MetadataExtractor = require('./MetadataExtractor_Adaptive'); // Using adaptive version for flexible extraction
const { CircuitBreaker } = require('../../utils/CircuitBreaker');
const { getRateLimiter } = require('../../utils/RateLimiter');

/**
 * COMBINED ANALYZER - PRODUCTION VERSION
 * 
 * Optimizations:
 * - Single API call for STAR + Competencies + Feedback
 * - Circuit breaker for API resilience
 * - Rate limiter to prevent 429 errors
 * - Score validation to ensure data quality
 * - Fallback responses when services fail
 * 
 * Reduces: 6 API calls → 2 API calls (67% reduction)
 * 
 * v2 Improvements:
 * - FIX 1: max_tokens raised 3000 → 4500 (prevents chain-of-thought truncation)
 * - FIX 2: Score filter ≥ 4 on retrieved examples (only pass high quality to LLM)
 * - FIX 3: Pass star_breakdown + company + level from SemanticSearch to prompt (richer comparison context)
 */
class CombinedAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.semanticSearch = new SemanticSearch();
    this.metadataExtractor = new MetadataExtractor();
    
    // Circuit breaker - prevents cascading failures
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,      // Open circuit after 3 failures
      recoveryTimeout: 30000,   // Try recovery after 30s
      monitoringPeriod: 60000   // Reset failure count after 1 min
    });
    
    // Rate limiter - singleton instance shared across app
    this.rateLimiter = getRateLimiter();
  }

  /**
   * Analyze user answer in single combined call
   * @param {string} userAnswer - User's answer text
   * @param {number} categoryId - Question category
   * @param {Array} rubrics - Category rubrics for competency scoring
   * @returns {Promise<Object>} Complete analysis
   */
  async analyze(userAnswer, categoryId, rubrics) {
    try {
      console.log('🚀 Starting combined analysis...');
      console.log(`📊 Category: ${categoryId}, Rubrics: ${rubrics.length}`);

      // Step 1: Semantic search for ideal examples (uses embedding API)
      console.log('🔍 Finding similar examples...');
      const similarExamples = await this.semanticSearch.findSimilarAnswers(
        userAnswer,
        categoryId,
        2 // Top 2 examples
      );

      // FIX 2: Filter to high quality examples (score >= 4) only
      // Falls back to all results if none meet the threshold (prevents empty context)
      const highQualityExamples = similarExamples.filter(ex => ex.score >= 4);
      const examplesForAnalysis = highQualityExamples.length > 0 
        ? highQualityExamples 
        : similarExamples;

      console.log(`📊 Examples after quality filter: ${examplesForAnalysis.length} (${highQualityExamples.length} scored ≥4, ${similarExamples.length} total found)`);

      // Step 2: Extract metadata from examples (if found)
      let enrichedExamples = [];
      if (examplesForAnalysis.length > 0) {
        console.log(`📊 Extracting metadata from ${examplesForAnalysis.length} examples...`);
        enrichedExamples = await Promise.all(
          examplesForAnalysis.map(async (ex) => ({
            ...ex,
            metadata: await this.metadataExtractor.extractMetadata(ex)
          }))
        );
      } else {
        console.log('⚠️  No similar examples found');
      }

      // Step 3: Build combined prompt
      const prompt = this.buildCombinedPrompt(
        userAnswer,
        enrichedExamples,
        rubrics
      );

      // Step 4: Single GPT-4o call with circuit breaker + rate limiter
      console.log('🤖 Running combined analysis (with circuit breaker + rate limiter)...');
      const analysis = await this.callCombinedAPI(prompt, rubrics);

      // Step 5: Validate scores
      const validatedAnalysis = this.validateAnalysis(analysis, rubrics);

      console.log('✅ Combined analysis complete');
      return validatedAnalysis;

    } catch (error) {
      console.error('❌ Combined analysis error:', error.message);
      
      // Return graceful fallback instead of throwing
      return this.getFallbackResponse(error, rubrics);
    }
  }

  /**
   * Build comprehensive prompt with JSON structure (more efficient for GPT parsing)
   */
  buildCombinedPrompt(userAnswer, enrichedExamples, rubrics) {
    // Build structured JSON data
    const promptData = {
      task: "comprehensive_tpm_analysis",
      candidate_answer: userAnswer,
      // FIX 3: Now includes star_breakdown (pre-parsed STAR components), company, and level
      // These fields come directly from SemanticSearch DB fetch - no extra cost
      ideal_examples: enrichedExamples.map((ex, idx) => ({
        id: idx + 1,
        score: ex.score,
        company: ex.company || null,       // FIX 3: adds org context (e.g. "Meta", "Google")
        level: ex.level || null,           // FIX 3: adds seniority context (e.g. "Senior TPM")
        answer_text: ex.answer_text,       // Full answer text (fetched from DB by SemanticSearch)
        star_breakdown: {                  // FIX 3: pre-parsed STAR components for direct comparison
          situation: ex.star?.situation || null,
          task: ex.star?.task || null,
          action: ex.star?.action || null,
          result: ex.star?.result || null
        },
        metadata: {
          // Correctly mapped to MetadataExtractor_Adaptive output schema
          context: ex.metadata?.context || {},                         // org scale, scope, environment, seniority indicators
          complexity_signals: ex.metadata?.complexity_signals || {},   // team scale, timeline, technical scope, constraints
          execution_evidence: ex.metadata?.execution_evidence || {},   // stakeholders, processes, tools, decision frameworks
          impact_signals: ex.metadata?.impact_signals || {}            // quantified metrics, comparative metrics, business impact
        }
      })),
      rubrics: rubrics.map(r => ({
        competency: r.competency_name,
        level_1: r.level_1_description || r.level_1,
        level_3: r.level_3_description || r.level_3,
        level_5: r.level_5_description || r.level_5
      })),
      instructions: {
        star_analysis: "Break down the answer into Situation, Task, Action, Result. Score each component 1-5 based on clarity, specificity, and impact.",
        competency_scoring: "Score each competency using the provided rubrics (1-5). Quote the level descriptor (level_1, level_3, or level_5) that best matches the evidence before assigning a score.",
        improvements: "Generate copy-paste ready improvements by referencing specific elements from ideal_examples. Be concrete and actionable.",
        critical_rules: [
          "Use exact numbers and details from ideal_examples when available",
          "Use star_breakdown fields (situation/task/action/result) from ideal_examples for direct component comparison",
          "Reference company and level from ideal_examples to show organizational scale (e.g. 'Example 1 is a Senior TPM at Meta')",
          "Provide exact text to paste, not generic advice",
          "Only suggest improvements for components scoring < 4.5",
          "All scores must be integers between 0-5",
          "For competency scoring: quote the matching rubric level descriptor before assigning score"
        ]
      },
      output_format: {
        internal_reasoning: {
          description: "COMPLETE THIS FIRST before providing scores. This is your internal thought process - be explicit about what you see.",
          
          gap_analysis: [
            "List 3-5 specific data points present in ideal_examples but MISSING from candidate_answer",
            "Format: 'Missing: [element]. Ideal has: [specific detail]. Candidate has: [what they have or none]'",
            "Example: 'Missing: company context. Ideal has: Meta (Fortune 500). Candidate has: generic tech company'",
            "Example: 'Missing: quantified team size. Ideal has: 8 engineering teams. Candidate has: multiple teams'",
            "Example: 'Missing: specific timeline. Ideal has: Q1 2024 (3 months). Candidate has: no timeline'",
            "Use star_breakdown from ideal_examples to identify component-level gaps precisely"
          ],
          
          element_by_element_comparison: {
            description: "For EACH STAR component, compare ideal star_breakdown vs candidate - use the pre-parsed star_breakdown fields directly",
            situation: "Ideal star_breakdown.situation has: [list]. Candidate has: [list]. Missing: [specific gaps]",
            task: "Ideal star_breakdown.task has: [list]. Candidate has: [list]. Missing: [specific gaps]",
            action: "Ideal star_breakdown.action has: [list]. Candidate has: [list]. Missing: [specific gaps]",
            result: "Ideal star_breakdown.result has: [list]. Candidate has: [list]. Missing: [specific gaps]"
          },
          
          score_reasoning: [
            "For EACH component scoring < 5, explain: 'Scoring [component] as [X]/5 because [specific gap from above]'",
            "Example: 'Scoring Situation as 3/5 because missing company context and team size (gaps identified above)'",
            "Link each score directly to a gap you identified"
          ],

          competency_reasoning: [
            "For EACH competency, quote the rubric level descriptor that matches before assigning score",
            "Example: 'Stakeholder Management → level_3 says [quote descriptor]. Candidate shows [evidence]. Score: 3'",
            "This must come before the competencies object in your output"
          ]
        },
        
        star: {
          situation: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          },
          task: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          },
          action: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          },
          result: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          }
        },
        
        competencies: "Object with competency names as keys (string) and scores as values (integer 1-5). Each score must be backed by competency_reasoning above.",
        
        improvements: [
          {
            priority: "critical|high|medium",
            component: "situation|task|action|result",
            gap_identified: "Copy the EXACT gap from internal_reasoning.gap_analysis that this improvement addresses",
            current_text: "Exact quote from candidate's answer (the incomplete version)",
            rewritten_text: "COMPLETE REWRITE showing how to fill the gap using details from ideal_example star_breakdown and metadata. Don't say 'add X', write the full improved sentence.",
            rationale: "Explain WHY this gap matters referencing ideal_example's company/level and metadata (e.g., 'Ideal Senior TPM at Meta has impact_signals.quantified_metrics showing 51% improvement — candidate has no metrics')",
            example_reference: "Example 1 or Example 2"
          }
        ]
      }
    };

    return `You are an expert TPM interview coach. Use chain-of-thought reasoning to analyze this answer comprehensively.

DATA:
${JSON.stringify(promptData, null, 2)}

CHAIN OF THOUGHT ANALYSIS PROCESS:

STEP 1 - IDENTIFY GAPS FIRST (Most Important):
Before doing anything else, go through ideal_examples and list EVERY specific data point they have that the candidate is missing.
- Don't just say "lacks detail" - identify THE EXACT MISSING ELEMENTS
- Format: "Missing: [specific thing]. Ideal has [concrete example]. Candidate has [what they have or none]"
- Be surgical: "Missing: company name" not "Missing: context"
- Use star_breakdown fields from ideal_examples - these are pre-parsed STAR components, use them directly
- Look at metadata fields especially:
  - context.organizational_scale, context.scope, context.seniority_indicators
  - complexity_signals.team_scale, complexity_signals.timeline, complexity_signals.constraints
  - execution_evidence.stakeholder_collaboration, execution_evidence.tools_technologies
  - impact_signals.quantified_metrics, impact_signals.comparative_metrics

STEP 2 - ELEMENT-BY-ELEMENT COMPARISON:
For each STAR component, use the star_breakdown from ideal_examples to create a direct side-by-side comparison:
- What does ideal_example star_breakdown.[component] contain?
- What does the candidate have in that component?
- What is the delta (what's missing)?

This is NOT impressionistic - list concrete things like "team size: 8 teams" vs "team size: not mentioned"
Note the company and level of the ideal example to contextualize the scale (e.g. "Senior TPM at Meta managing 8 teams")

STEP 3 - SCORE BASED ON GAPS:
Now score each STAR component (0-5) using the gaps you just identified:
- 5 = No gaps, has everything ideal examples have
- 4 = Minor gaps (1-2 small elements missing)
- 3 = Moderate gaps (missing important context like timeline or scale)
- 2 = Major gaps (missing multiple key elements)
- 1 = Severe gaps (barely any concrete details)

IMPORTANT: Write explicit reasoning for EACH score linking it to the gaps you identified in Step 1.
Example: "Scoring Result as 3/5 because: Missing quantified metrics (gap #2) and missing before/after comparison (gap #4)"

STEP 4 - SCORE COMPETENCIES:
Use the same gap-based approach for competencies.
REQUIRED: Quote the rubric level descriptor (level_1, level_3, or level_5) that best matches before assigning each score.
Example: "Stakeholder Management: level_3 says '[quote descriptor]'. Candidate shows [evidence]. Score: 3"
Do NOT assign scores without quoting the matching descriptor first.

STEP 5 - GENERATE GAP-FILLING REWRITES:
For each gap scoring < 4.5:
1. State the gap explicitly (copy from Step 1)
2. Quote the candidate's current text
3. Rewrite it showing how to fill the gap using ideal_example's star_breakdown, company, level, and metadata fields (impact_signals.quantified_metrics, complexity_signals.constraints, execution_evidence.tools_technologies etc.)
4. Don't say "add metrics" - write "I reduced latency from 340ms to 165ms (51% improvement)"

CRITICAL RULES:
- Internal reasoning MUST come first in your JSON output
- Every score must reference a specific gap from your internal_reasoning
- Improvements are REWRITES not suggestions ("Here's the improved version:" not "Consider adding:")
- Use exact details from ideal_examples in rewrites: star_breakdown content, company names, level context, and metadata signals (impact_signals.quantified_metrics, complexity_signals.team_scale, execution_evidence.tools_technologies)

Now, work through these 5 steps systematically, then return your final analysis in the specified output_format as valid JSON.`;
  }

  /**
   * Call OpenAI API with circuit breaker + rate limiter protection
   */
  async callCombinedAPI(prompt, rubrics) {
    // Double-wrapped: Rate Limiter → Circuit Breaker → OpenAI
    return await this.rateLimiter.execute(async () => {
      return await this.circuitBreaker.execute(async () => {
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert TPM interview coach. You provide comprehensive, specific feedback in structured JSON format. Always return valid JSON with all required fields.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4500,  // FIX 1: Raised from 3000 → 4500 to prevent chain-of-thought truncation
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        console.log('📥 GPT-4o response received');
        
        return JSON.parse(content);
        
      });
    }, 'combined-analysis');
  }

  /**
   * Validate and sanitize analysis results
   * Ensures all scores are valid (0-5) and all required fields exist
   */
  validateAnalysis(analysis, rubrics) {
    console.log('🔍 Validating analysis results...');
    
    // Validate STAR scores
    if (analysis.star) {
      ['situation', 'task', 'action', 'result'].forEach(component => {
        if (analysis.star[component]) {
          const score = analysis.star[component].score;
          
          // Ensure score is valid integer 0-5
          if (typeof score !== 'number' || score < 0 || score > 5 || !Number.isInteger(score)) {
            console.warn(`⚠️  Invalid STAR score for ${component}: ${score}, clamping to valid range`);
            analysis.star[component].score = Math.max(0, Math.min(5, Math.round(score) || 0));
          }
          
          // Ensure required fields exist
          analysis.star[component].text = analysis.star[component].text || 'Not found';
          analysis.star[component].feedback = analysis.star[component].feedback || 'No feedback provided';
        }
      });
    }

    // Validate competency scores (reuse logic from RubricScorer)
    if (analysis.competencies) {
      const validatedCompetencies = {};
      
      rubrics.forEach(rubric => {
        const competencyName = rubric.competency_name;
        const score = analysis.competencies[competencyName];
        
        // Validate score is 0-5 integer
        if (typeof score === 'number' && score >= 0 && score <= 5 && Number.isInteger(score)) {
          validatedCompetencies[competencyName] = score;
        } else {
          console.warn(`⚠️  Invalid competency score for ${competencyName}: ${score}, defaulting to 0`);
          validatedCompetencies[competencyName] = 0;
        }
      });
      
      analysis.competencies = validatedCompetencies;
    }

    // Ensure improvements array exists
    if (!Array.isArray(analysis.improvements)) {
      console.warn('⚠️  Missing improvements array, initializing empty');
      analysis.improvements = [];
    }

    console.log('✅ Validation complete');
    return analysis;
  }

  /**
   * Fallback response when analysis fails
   * Returns degraded but valid response structure
   */
  getFallbackResponse(error, rubrics) {
    console.log('🔄 Generating fallback response...');
    
    // Check if circuit breaker is open
    const isCircuitOpen = error.isCircuitBreakerOpen || 
                         (error.message && error.message.includes('Circuit breaker is OPEN'));
    
    // Check if rate limited
    const isRateLimited = error.status === 429 || 
                         (error.message && error.message.includes('Rate limit'));

    // Create basic STAR structure with zeros
    const star = {
      situation: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      },
      task: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      },
      action: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      },
      result: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      }
    };

    // Create zero scores for all competencies
    const competencies = {};
    rubrics.forEach(rubric => {
      competencies[rubric.competency_name] = 0;
    });

    // Create error message for improvements
    const errorMessage = isCircuitOpen 
      ? 'Analysis service is temporarily down. Our team has been notified. Please try again in a few minutes.'
      : isRateLimited
      ? 'Too many requests. Please wait a moment and try again.'
      : 'Analysis service encountered an error. Please try again.';

    return {
      star,
      competencies,
      improvements: [
        {
          priority: 'critical',
          component: 'system',
          location: 'N/A',
          current_text: 'Service Error',
          improved_text: errorMessage,
          rationale: 'System is temporarily unable to process your request',
          example_reference: 'N/A'
        }
      ],
      _fallback: true,
      _error: error.message,
      _errorType: isCircuitOpen ? 'circuit_breaker_open' : isRateLimited ? 'rate_limited' : 'unknown'
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }

  /**
   * Get rate limiter status
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getMetrics();
  }
}

module.exports = CombinedAnalyzer;