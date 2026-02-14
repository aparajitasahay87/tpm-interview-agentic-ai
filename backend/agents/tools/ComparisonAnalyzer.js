const OpenAI = require('openai');
const MetadataExtractor = require('./MetadataExtractor');

/**
 * TEST VERSION - 2-Shot Comparison Analyzer
 */
class ComparisonAnalyzer_TEST {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.metadataExtractor = new MetadataExtractor();
  }

  async analyzeGaps(userAnswer, userSTAR, similarExamples) {
    try {
      console.log('🔍 TEST: Starting 2-shot analysis...');

      if (!similarExamples || similarExamples.length === 0) {
        return this.getGeneralFeedback(userSTAR);
      }

      // Take top 2 examples
      const topExamples = similarExamples.slice(0, 2);
      
      // Extract metadata
      console.log('📊 Extracting metadata from examples...');
      const enrichedExamples = await Promise.all(
        topExamples.map(async (ex) => ({
          ...ex,
          metadata: await this.metadataExtractor.extractMetadata(ex)
        }))
      );

      const prompt = this.buildPrompt(userAnswer, userSTAR, enrichedExamples);
      const analysis = await this.callGPT4(prompt);

      console.log('✅ TEST: Analysis complete');
      return analysis;

    } catch (error) {
      console.error('❌ TEST: Error:', error.message);
      return this.getGeneralFeedback(userSTAR);
    }
  }

 buildPrompt(userAnswer, userSTAR, enrichedExamples) {
  const examples = enrichedExamples.map((ex, idx) => {
    const meta = ex.metadata;
    return `
### Example ${idx + 1} (Score: ${ex.score}/5)

**Answer:** ${ex.answer_text}

**Key Elements Found:**
- Company: ${meta.situation?.company || 'not mentioned'}
- Role: ${meta.situation?.role || 'not mentioned'}
- Tools: ${meta.action?.tools?.join(', ') || 'not mentioned'}
- Metrics: ${meta.result?.metrics?.join('; ') || 'not mentioned'}
- Before/After: ${meta.result?.before_after?.join('; ') || 'not mentioned'}
`;
  }).join('\n---\n');

  return `You are a TPM interview coach. Provide specific, copy-paste ready feedback.

### Ideal Examples to Learn From:
${examples}

### Candidate's Answer:
${userAnswer}

### Candidate's Scores:
- Situation: ${userSTAR.situation.score}/5
- Task: ${userSTAR.task.score}/5
- Action: ${userSTAR.action.score}/5
- Result: ${userSTAR.result.score}/5

### Instructions:
Only analyze components scoring < 4.5.
Reference the ideal examples above.
Provide exact text to copy-paste.

Return JSON:
{
  "gaps": {
    "situation": "specific gap or null",
    "result": "specific gap or null"
  },
  "improvements": [
    {
      "priority": "critical",
      "location": "where to add",
      "current_text": "what they have",
      "improved_text": "exact text to paste",
      "rationale": "why this matters",
      "example_reference": "Example 1, Result section"
    }
  ]
}`;
}

  async callGPT4(prompt) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You provide concrete, specific feedback. Return JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  getGeneralFeedback(userSTAR) {
  const improvements = [];
  
  if (userSTAR.result.score < 4.5) {
    improvements.push({
      priority: "critical",
      location: "Results section",
      current_text: "Generic outcome",
      improved_text: "[Metric] improved from [X] to [Y] ([Z]%), saving $[amount]",
      rationale: "Quantified results prove impact",
      example_reference: "Standard pattern"
    });
  }

  return {
    gaps: {
      situation: userSTAR.situation.score < 4.5 ? "Missing context" : null,
      result: userSTAR.result.score < 4.5 ? "Missing metrics" : null
    },
    improvements
  };
}
}

module.exports = ComparisonAnalyzer_TEST;