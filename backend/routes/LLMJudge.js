/**
 * ============================================================
 * LLM JUDGE - Senior TPM Coaching Evaluator
 * ============================================================
 */
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

class LLMJudge {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async evaluate(userAnswer, idealExamples, analyzerOutput, version = 'unknown') {
    const prompt = this._buildCoachPrompt(userAnswer, idealExamples, analyzerOutput);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: "You are a Senior TPM Interview Coach. You value specific metrics, cross-functional leadership, and copy-paste ready rewrites. You are strict but constructive." 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      return this._calculateCoachingScore(result, version);
    } catch (error) {
      return { error: error.message, version };
    }
  }

  _buildCoachPrompt(userAnswer, idealExamples, analyzerOutput) {
    return `
    ### EVALUATION TASK
    Evaluate AI-generated TPM coaching feedback. 
    
    ### CONTEXT
    - CANDIDATE ANSWER: "${userAnswer}"
    - IDEAL EXAMPLES (RAG): ${JSON.stringify(idealExamples)}
    - AI FEEDBACK: ${JSON.stringify(analyzerOutput)}

    ### SCORING RUBRIC (1-5)
    1. SPECIFICITY: Does it reference the candidate's unique details?
    2. ACTIONABILITY: Is the rewrite "copy-paste ready" for an interview?
    3. GAP ANALYSIS: Does it explain WHY the candidate's answer is weaker than the ideal example?
    4. GROUNDING: Does it use metrics/frameworks from the Ideal Examples?
    5. HALLUCINATION (True/False): Does the AI invent specific project details or frameworks not found in the Answer or Examples? (Note: Suggesting a common framework like RICE is coaching, NOT hallucination, unless the AI claims the candidate already said it).

    Return JSON:
    {
      "specificity": 1-5,
      "actionability": 1-5,
      "gap_analysis": 1-5,
      "grounding": 1-5,
      "hallucination": boolean,
      "reasoning": "Brief explanation of scores",
      "hallucination_details": "List any invented facts"
    }`;
  }

  _calculateCoachingScore(result, version) {
    // COACHING WEIGHTS: Actionability (40%) and Grounding (30%) are key [cite: 41, 73]
    const weights = { specificity: 0.1, gap_analysis: 0.2, actionability: 0.4, grounding: 0.3 };
    
    let score = (result.specificity * weights.specificity) +
                (result.gap_analysis * weights.gap_analysis) +
                (result.actionability * weights.actionability) +
                (result.grounding * weights.grounding);

    // Hallucination Penalty: Caps score at 3.0 if it invents data [cite: 40]
    if (result.hallucination) score = Math.min(score, 3.0);

    return { ...result, overall: parseFloat(score.toFixed(2)), version, timestamp: new Date().toISOString() };
  }
}

module.exports = LLMJudge;