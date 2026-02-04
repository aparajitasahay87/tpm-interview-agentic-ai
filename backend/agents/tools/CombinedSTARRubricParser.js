const OpenAI = require('openai');
const { CircuitBreaker } = require('../../utils/CircuitBreaker');

/**
 * Combined STAR + Rubric Parser
 * Does BOTH STAR analysis AND competency scoring in a single GPT-4 call
 * Reduces API calls from 2 to 1 (50% cost reduction)
 */
class CombinedSTARRubricParser {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      monitoringPeriod: 60000
    });
  }

  /**
   * Parse STAR components AND score competencies in one call
   * @param {string} answer - User's answer
   * @param {Array} rubrics - Category rubrics (optional)
   * @returns {Promise<Object>} STAR scores + competency scores
   */
  async parseAndScore(answer, rubrics = []) {
    try {
      console.log('🤖 Combined parsing: STAR + Competency scoring...');
      
      const prompt = this.buildCombinedPrompt(answer, rubrics);
      
      const result = await this.circuitBreaker.execute(async () => {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: 'You are an expert TPM interview evaluator. You analyze answers for STAR components and score them against competency rubrics. You always return valid JSON.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        console.log('📝 GPT-4 combined response received');
        
        const parsed = JSON.parse(content);
        
        // Validate structure
        if (!parsed.star || !parsed.star.situation) {
          throw new Error('Invalid STAR structure in response');
        }
        
        return parsed;
      });
      
      console.log('✅ Combined parsing complete');
      return result;
      
    } catch (error) {
      console.error('❌ Combined parsing error:', error.message);
      
      // Graceful degradation
      if (error.isCircuitBreakerOpen) {
        console.log('🔄 Circuit open - returning degraded response');
        return this.getFallbackResponse(rubrics);
      }
      
      throw error;
    }
  }

  /**
   * Build combined prompt for STAR + Rubrics
   * @param {string} answer - User's answer
   * @param {Array} rubrics - Rubrics to evaluate against
   * @returns {string} Combined prompt
   */
  buildCombinedPrompt(answer, rubrics) {
    const hasRubrics = rubrics && rubrics.length > 0;
    
    // Format rubrics section
    const rubricsSection = hasRubrics ? `
COMPETENCY RUBRICS TO EVALUATE:
${rubrics.map((r, idx) => `
${idx + 1}. ${r.competency_name}
   Level 1: ${r.level_1_description}
   Level 3: ${r.level_3_description}
   Level 5: ${r.level_5_description}
`).join('\n')}
` : '';

    const competencyInstructions = hasRubrics ? `
2. COMPETENCY SCORING:
   - For each competency rubric, assign a score 0-5
   - Score 0: Not mentioned at all
   - Score 1-2: Meets Level 1 criteria (basic mention)
   - Score 3-4: Meets Level 3 criteria (competent execution)
   - Score 5: Meets Level 5 criteria (expert with metrics)
   - Provide brief reasoning (1 sentence) for each score
` : '';

    const competencyFormat = hasRubrics ? `
  "competency_scores": {
    "${rubrics[0]?.competency_name || 'competency_name'}": 3,
    ...
  },
  "competency_reasoning": {
    "${rubrics[0]?.competency_name || 'competency_name'}": "Brief reason",
    ...
  }
` : `
  "competency_scores": null,
  "competency_reasoning": null
`;

    const prompt = `You are analyzing a Technical Program Manager interview answer.

CANDIDATE'S ANSWER:
${answer}

${rubricsSection}

ANALYSIS TASKS:

1. STAR ANALYSIS:
   Extract and score each STAR component (0-5):
   - Situation: Context, background, stakeholders
   - Task: Specific responsibility or challenge
   - Action: Individual actions taken (look for "I" vs "we")
   - Result: Measurable outcomes, impact, learnings

   Scoring:
   - 0: Missing entirely
   - 1-2: Mentioned but vague
   - 3: Present but lacking detail
   - 4: Good detail and clarity
   - 5: Excellent detail, quantified, specific

${competencyInstructions}

Return ONLY valid JSON in this exact format:
{
  "star": {
    "situation": {
      "score": 0-5,
      "text": "extracted text or 'Not found'",
      "feedback": "brief feedback"
    },
    "task": {
      "score": 0-5,
      "text": "extracted text or 'Not found'",
      "feedback": "brief feedback"
    },
    "action": {
      "score": 0-5,
      "text": "extracted text or 'Not found'",
      "feedback": "brief feedback"
    },
    "result": {
      "score": 0-5,
      "text": "extracted text or 'Not found'",
      "feedback": "brief feedback"
    }
  },
${competencyFormat}
}`;

    return prompt;
  }

  /**
   * Fallback response on error
   * @param {Array} rubrics - Rubrics
   * @returns {Object} Fallback structure
   */
  getFallbackResponse(rubrics) {
    const fallback = {
      star: {
        situation: { score: 0, text: '', feedback: 'Unable to analyze' },
        task: { score: 0, text: '', feedback: 'Unable to analyze' },
        action: { score: 0, text: '', feedback: 'Unable to analyze' },
        result: { score: 0, text: '', feedback: 'Unable to analyze' }
      },
      competency_scores: null,
      competency_reasoning: null
    };

    if (rubrics && rubrics.length > 0) {
      fallback.competency_scores = {};
      fallback.competency_reasoning = {};
      
      rubrics.forEach(r => {
        fallback.competency_scores[r.competency_name] = 0;
        fallback.competency_reasoning[r.competency_name] = 'Unable to score due to system error';
      });
    }

    return fallback;
  }
}

module.exports = CombinedSTARRubricParser;