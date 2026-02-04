const OpenAI = require('openai');
const { CircuitBreaker } = require('../../utils/CircuitBreaker'); // ⭐ NEW

/**
 * ComparisonAnalyzer Tool
 * Uses GPT-4 to compare user's answer against ideal examples
 * Identifies specific gaps and generates actionable improvements
 */
class ComparisonAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = 'gpt-4o'; // GPT-4 Omni model
    
    // ⭐ NEW: Circuit breaker for GPT-4 analysis calls
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      monitoringPeriod: 60000
    });
  }

  /**
   * Analyze gaps between user answer and ideal examples
   * @param {string} userAnswer - User's original answer text
   * @param {Object} userSTAR - User's STAR scores and breakdown
   * @param {Array} similarExamples - Top similar ideal examples from semantic search
   * @returns {Promise<Object>} Gap analysis and improvements
   */
  async analyzeGaps(userAnswer, userSTAR, similarExamples) {
    try {
      console.log('🔍 Starting comparison analysis...');
      console.log(`Comparing against ${similarExamples.length} ideal examples`);

      // If no similar examples, provide general feedback
      if (!similarExamples || similarExamples.length === 0) {
        console.log('⚠️  No similar examples available for comparison');
        return this.generateGeneralFeedback(userSTAR);
      }

      // Build the GPT-4 prompt
      const prompt = this.buildComparisonPrompt(userAnswer, userSTAR, similarExamples);

      // Call GPT-4 with circuit breaker protection
      const analysis = await this.callGPT4(prompt);

      console.log('✅ Comparison analysis complete');
      return analysis;

    } catch (error) {
      console.error('❌ Comparison analysis error:', error);
      
      // ⭐ Handle circuit breaker open state
      if (error.isCircuitBreakerOpen) {
        console.log('🔄 Circuit open - returning general feedback');
        return this.generateGeneralFeedback(userSTAR);
      }
      
      throw new Error(`Comparison analysis failed: ${error.message}`);
    }
  }

  /**
   * Build the GPT-4 prompt for comparison
   * @param {string} userAnswer - User's answer
   * @param {Object} userSTAR - User's STAR breakdown and scores
   * @param {Array} similarExamples - Ideal examples
   * @returns {string} Formatted prompt
   */
  buildComparisonPrompt(userAnswer, userSTAR, similarExamples) {
    // Format ideal examples
    const examplesText = similarExamples.map((example, idx) => {
      return `
IDEAL EXAMPLE ${idx + 1} (Similarity: ${example.similarity}%, Score: ${example.score}/5):
Question: ${example.question_text}
Answer: ${example.answer_text}

STAR Breakdown:
- Situation: ${example.star.situation}
- Task: ${example.star.task}
- Action: ${example.star.action}
- Result: ${example.star.result}
`;
    }).join('\n---\n');

    const prompt = `You are an expert TPM interview coach. Your job is to compare a candidate's answer against ideal high-scoring examples and provide SPECIFIC, ACTIONABLE feedback.

CANDIDATE'S ANSWER:
${userAnswer}

CANDIDATE'S STAR SCORES:
- Situation: ${userSTAR.scores.situation}/5
- Task: ${userSTAR.scores.task}/5
- Action: ${userSTAR.scores.action}/5
- Result: ${userSTAR.scores.result}/5
- Overall: ${userSTAR.scores.overall}/5

CANDIDATE'S STAR BREAKDOWN:
- Situation: ${userSTAR.breakdown.situation}
- Task: ${userSTAR.breakdown.task}
- Action: ${userSTAR.breakdown.action}
- Result: ${userSTAR.breakdown.result}

${examplesText}

INSTRUCTIONS:
1. Compare the candidate's answer to the ideal examples above
2. Identify SPECIFIC gaps in each STAR component
3. Generate ACTIONABLE improvements (copy-paste ready, not generic advice)

CRITICAL RULES:
- Be SPECIFIC: Instead of "add more details", say "Missing: company name, team size, timeline"
- Be ACTIONABLE: Instead of "include metrics", say "Add metrics: 'Reduced latency by 40%, processed 2.3M transactions'"
- Use examples from ideal answers to show what's missing
- If a component is strong, say null for gaps
- Focus on what would raise the score from current level to 5/5

Return ONLY valid JSON in this exact format:
{
  "gaps": {
    "situation": "string or null",
    "task": "string or null", 
    "action": "string or null",
    "result": "string or null"
  },
  "improvements": [
    "Specific improvement 1",
    "Specific improvement 2",
    "Specific improvement 3"
  ]
}`;

    return prompt;
  }

  /**
   * Call GPT-4 API to get comparison analysis
   * @param {string} prompt - The comparison prompt
   * @returns {Promise<Object>} Parsed analysis
   */
  async callGPT4(prompt) {
    try {
      console.log('🤖 Calling GPT-4 for analysis...');

      // ⭐ Wrap in circuit breaker
      const analysis = await this.circuitBreaker.execute(async () => {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert TPM interview coach. You provide specific, actionable feedback. You always return valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1500,
          response_format: { type: 'json_object' } // Force JSON response
        });

        const responseText = completion.choices[0].message.content;
        console.log('✅ GPT-4 response received');

        // Parse JSON response
        const analysis = JSON.parse(responseText);

        // Validate structure
        if (!analysis.gaps || !analysis.improvements) {
          throw new Error('Invalid response format from GPT-4');
        }

        return analysis;
      });
      
      return analysis;

    } catch (error) {
      console.error('❌ GPT-4 API error:', error);
      
      // ⭐ Handle circuit breaker open
      if (error.isCircuitBreakerOpen) {
        throw error; // Let parent handler deal with it
      }
      
      // If JSON parsing fails, try to extract JSON from response
      if (error.message.includes('JSON')) {
        console.log('⚠️  Attempting to recover from JSON parse error...');
        return this.fallbackParsing(error);
      }
      
      throw error;
    }
  }

  /**
   * Generate general feedback when no similar examples available
   * @param {Object} userSTAR - User's STAR scores
   * @returns {Object} General feedback
   */
  generateGeneralFeedback(userSTAR) {
    const gaps = {};
    const improvements = [];

    // Check each component score
    if (userSTAR.scores.situation < 4) {
      gaps.situation = 'Missing: company name, your role/title, team composition, project timeline, and business context';
      improvements.push('Add company and role: "As TPM at [Company], I..."');
      improvements.push('Include team details: "led [X]-person team across [Y] organizations"');
      improvements.push('Add timeline: "with a deadline of [date]"');
    } else {
      gaps.situation = null;
    }

    if (userSTAR.scores.task < 4) {
      gaps.task = 'Missing: specific responsibility, measurable goal, constraints, or challenges faced';
      improvements.push('State your responsibility: "My task was to..."');
      improvements.push('Add specific goal: "deliver [X] by [date] while managing [Y] dependencies"');
    } else {
      gaps.task = null;
    }

    if (userSTAR.scores.action < 4) {
      gaps.action = 'Missing: specific actions using "I" (not "we"), tools/methods used, stakeholder names, or step-by-step process';
      improvements.push('Use "I" statements: "I established...", "I coordinated...", "I implemented..."');
      improvements.push('Name stakeholders: "worked with PM [Name], Tech Lead [Name]"');
      improvements.push('Mention tools: "created dashboard in JIRA", "tracked via Gantt chart"');
    } else {
      gaps.action = null;
    }

    if (userSTAR.scores.result < 4) {
      gaps.result = 'Missing: quantified metrics, business impact, specific numbers, or concrete outcomes';
      improvements.push('Add metrics: "Reduced latency by X%", "Processed Y transactions"');
      improvements.push('Include uptime/reliability: "achieved 99.9% uptime"');
      improvements.push('Show business impact: "saved $X annually", "increased efficiency by Y%"');
    } else {
      gaps.result = null;
    }

    return {
      gaps,
      improvements: improvements.length > 0 ? improvements : ['Your answer is strong! Consider adding more specific examples to make it even better.']
    };
  }

  /**
   * Fallback JSON parsing for malformed responses
   * @param {Error} error - The parsing error
   * @returns {Object} Fallback response
   */
  fallbackParsing(error) {
    console.log('⚠️  Using fallback response due to parsing error');
    return {
      gaps: {
        situation: 'Unable to analyze - please try again',
        task: null,
        action: null,
        result: null
      },
      improvements: [
        'The analysis encountered an error. Please try submitting your answer again.',
        'If the error persists, contact support.'
      ]
    };
  }

  /**
   * Validate and sanitize analysis output
   * @param {Object} analysis - Raw analysis from GPT-4
   * @returns {Object} Validated analysis
   */
  validateAnalysis(analysis) {
    // Ensure gaps object exists with all components
    const gaps = {
      situation: analysis.gaps?.situation || null,
      task: analysis.gaps?.task || null,
      action: analysis.gaps?.action || null,
      result: analysis.gaps?.result || null
    };

    // Ensure improvements is an array
    const improvements = Array.isArray(analysis.improvements) 
      ? analysis.improvements 
      : ['Unable to generate improvements at this time'];

    return {
      gaps,
      improvements
    };
  }
}

module.exports = ComparisonAnalyzer;