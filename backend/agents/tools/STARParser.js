const OpenAI = require('openai');
const { CircuitBreaker } = require('../../utils/CircuitBreaker'); 

class STARParser {
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

  async parse(answer) {
    const prompt = `You are a STAR method analyzer for Technical Program Manager interviews.

Analyze this interview answer and extract the STAR components:
- Situation: Context, background, stakeholders
- Task: Specific responsibility or challenge
- Action: Individual actions taken (look for "I" vs "we")
- Result: Measurable outcomes, impact, learnings

Answer to analyze:
"""
${answer}
"""

For each component, provide:
1. Score (0-5):
   - 0: Missing entirely
   - 1-2: Mentioned but vague
   - 3: Present but lacking detail
   - 4: Good detail and clarity
   - 5: Excellent detail, quantified, specific

2. Extracted text (quote from answer or "Not found")
3. Feedback (what's good, what's missing)

Return ONLY valid JSON in this exact format:
{
  "situation": {
    "score": 0-5,
    "text": "quoted text or 'Not found'",
    "feedback": "brief feedback"
  },
  "task": {
    "score": 0-5,
    "text": "quoted text or 'Not found'",
    "feedback": "brief feedback"
  },
  "action": {
    "score": 0-5,
    "text": "quoted text or 'Not found'",
    "feedback": "brief feedback"
  },
  "result": {
    "score": 0-5,
    "text": "quoted text or 'Not found'",
    "feedback": "brief feedback"
  }
}`;

    try {
  console.log('🤖 Calling GPT-4 to parse STAR components...');
  
  // ⭐ Wrap OpenAI call in circuit breaker
  const parsed = await this.circuitBreaker.execute(async () => {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are a precise STAR method analyzer. Return only valid JSON, no markdown formatting.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const content = response.choices[0].message.content;
    console.log('📝 GPT-4 response received');
    
    // Extract JSON from response (in case GPT adds markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from GPT response');
    }

    return JSON.parse(jsonMatch[0]);
  });
  
  return parsed;
  
} catch (error) {
  console.error('❌ Error in STAR parser:', error.message);
  
  // ⭐ Handle circuit breaker open state
  if (error.isCircuitBreakerOpen) {
    // Return graceful degradation - basic scores
    console.log('🔄 Circuit open - returning degraded response');
    return {
      situation: { score: 0, text: '' },
      task: { score: 0, text: '' },
      action: { score: 0, text: '' },
      result: { score: 0, text: '' }
    };
  }
  
  throw error;
}
}
}

module.exports = STARParser;