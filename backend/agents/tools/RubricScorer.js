const OpenAI = require('openai');
const { CircuitBreaker } = require('../../utils/CircuitBreaker');

/**
 * Rubric Scorer Agent
 * Evaluates user answers against category-specific competency rubrics
 * Returns scores (1-5) for each competency
 */
class RubricScorer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = 'gpt-4o';
    
    // Circuit breaker for GPT-4 calls
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      monitoringPeriod: 60000
    });
  }

  /**
   * Score answer against rubrics
   * @param {string} userAnswer - User's answer text
   * @param {Array} rubrics - Category rubrics from database
   * @returns {Promise<Object>} Competency scores and reasoning
   */
  async scoreAnswer(userAnswer, rubrics) {
    try {
      console.log('📊 Starting rubric scoring...');
      console.log(`Evaluating against ${rubrics.length} competencies`);

      if (!rubrics || rubrics.length === 0) {
        console.log('⚠️  No rubrics provided');
        return {
          competency_scores: {},
          reasoning: {}
        };
      }

      // Build the GPT-4 prompt
      const prompt = this.buildScoringPrompt(userAnswer, rubrics);

      // Call GPT-4 with circuit breaker
      const scores = await this.callGPT4(prompt, rubrics);

      console.log('✅ Rubric scoring complete');
      return scores;

    } catch (error) {
      console.error('❌ Rubric scoring error:', error);
      
      // Circuit breaker open - return empty scores
      if (error.isCircuitBreakerOpen) {
        console.log('🔄 Circuit open - skipping rubric scoring');
        return {
          competency_scores: {},
          reasoning: {}
        };
      }
      
      throw new Error(`Rubric scoring failed: ${error.message}`);
    }
  }

  /**
   * Build GPT-4 prompt for scoring
   * @param {string} userAnswer - User's answer
   * @param {Array} rubrics - Rubrics to evaluate against
   * @returns {string} Formatted prompt
   */
  buildScoringPrompt(userAnswer, rubrics) {
    // Format rubrics for prompt
    const rubricsText = rubrics.map((rubric, idx) => {
      return `
COMPETENCY ${idx + 1}: ${rubric.competency_name}

Level 1 (Beginner): ${rubric.level_1_description}
Level 3 (Intermediate): ${rubric.level_3_description}
Level 5 (Expert): ${rubric.level_5_description}
`;
    }).join('\n---\n');

    const prompt = `You are an expert interview evaluator for Technical Program Manager roles. Your job is to score a candidate's answer against specific competency rubrics.

CANDIDATE'S ANSWER:
${userAnswer}

COMPETENCY RUBRICS:
${rubricsText}

INSTRUCTIONS:
1. For EACH competency, assign a score from 1 to 5 based on how well the answer demonstrates that competency
2. Use the rubric levels as guidelines:
   - Score 1-2: Answer meets Level 1 criteria (basic mention)
   - Score 3-4: Answer meets Level 3 criteria (competent execution)
   - Score 5: Answer meets Level 5 criteria (expert with metrics and impact)
3. If a competency is NOT mentioned in the answer at all, score it 0
4. Provide brief reasoning (1 sentence) for each score

SCORING RULES:
- Be objective and evidence-based
- Look for specific examples, not just keywords
- Higher scores require quantified metrics, scale, and impact
- If the answer doesn't demonstrate a competency, score it 0 or 1

Return ONLY valid JSON in this exact format:
{
  "competency_scores": {
    "${rubrics[0].competency_name}": 3,
    "${rubrics[1]?.competency_name || 'competency_name'}": 4,
    ...
  },
  "reasoning": {
    "${rubrics[0].competency_name}": "Brief reason for score",
    "${rubrics[1]?.competency_name || 'competency_name'}": "Brief reason for score",
    ...
  }
}`;

    return prompt;
  }

  /**
   * Call GPT-4 to get scores
   * @param {string} prompt - Scoring prompt
   * @param {Array} rubrics - Original rubrics for validation
   * @returns {Promise<Object>} Scores and reasoning
   */
  async callGPT4(prompt, rubrics) {
    try {
      console.log('🤖 Calling GPT-4 for rubric scoring...');

      // Wrap in circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert TPM interview evaluator. You score answers objectively against rubrics. You always return valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for consistency
          max_tokens: 1500,
          response_format: { type: 'json_object' }
        });

        const responseText = completion.choices[0].message.content;
        console.log('✅ GPT-4 rubric scoring response received');

        // Parse JSON
        const parsed = JSON.parse(responseText);

        // Validate structure
        if (!parsed.competency_scores || !parsed.reasoning) {
          throw new Error('Invalid response format from GPT-4');
        }

        return parsed;
      });

      // Validate scores are in valid range (0-5)
      const validated = this.validateScores(result, rubrics);
      
      return validated;

    } catch (error) {
      console.error('❌ GPT-4 rubric scoring error:', error);
      
      // Circuit breaker open
      if (error.isCircuitBreakerOpen) {
        throw error;
      }
      
      // Fallback: return zeros
      console.log('⚠️  Using fallback scores (all zeros)');
      return this.getFallbackScores(rubrics);
    }
  }

  /**
   * Validate and sanitize scores
   * @param {Object} result - Raw GPT-4 result
   * @param {Array} rubrics - Original rubrics
   * @returns {Object} Validated scores
   */
  validateScores(result, rubrics) {
    const validatedScores = {};
    const validatedReasoning = {};

    rubrics.forEach(rubric => {
      const competencyName = rubric.competency_name;
      const score = result.competency_scores[competencyName];
      const reasoning = result.reasoning[competencyName];

      // Validate score is 0-5
      if (typeof score === 'number' && score >= 0 && score <= 5) {
        validatedScores[competencyName] = score;
      } else {
        console.warn(`⚠️  Invalid score for ${competencyName}: ${score}, defaulting to 0`);
        validatedScores[competencyName] = 0;
      }

      // Validate reasoning exists
      validatedReasoning[competencyName] = reasoning || 'No reasoning provided';
    });

    return {
      competency_scores: validatedScores,
      reasoning: validatedReasoning
    };
  }

  /**
   * Get fallback scores (all zeros) on error
   * @param {Array} rubrics - Rubrics
   * @returns {Object} Fallback scores
   */
  getFallbackScores(rubrics) {
    const scores = {};
    const reasoning = {};

    rubrics.forEach(rubric => {
      scores[rubric.competency_name] = 0;
      reasoning[rubric.competency_name] = 'Unable to score due to system error';
    });

    return {
      competency_scores: scores,
      reasoning: reasoning
    };
  }
}

module.exports = RubricScorer;