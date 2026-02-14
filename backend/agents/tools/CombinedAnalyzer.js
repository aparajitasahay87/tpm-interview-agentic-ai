const OpenAI = require('openai');
const SemanticSearch = require('./SemanticSearch');
const MetadataExtractor = require('./MetadataExtractor');

/**
 * COMBINED ANALYZER - Production Optimized
 * Single API call for STAR + Competencies + Feedback
 * Reduces 6 API calls → 2 API calls (embedding + analysis)
 */
class CombinedAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.semanticSearch = new SemanticSearch();
    this.metadataExtractor = new MetadataExtractor();
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

      // Step 1: Semantic search for ideal examples (uses embedding API)
      console.log('🔍 Finding similar examples...');
      const similarExamples = await this.semanticSearch.findSimilarAnswers(
        userAnswer,
        categoryId,
        2 // Top 2 examples
      );

      // Step 2: Extract metadata from examples (if found)
      let enrichedExamples = [];
      if (similarExamples.length > 0) {
        console.log('📊 Extracting metadata...');
        enrichedExamples = await Promise.all(
          similarExamples.map(async (ex) => ({
            ...ex,
            metadata: await this.metadataExtractor.extractMetadata(ex)
          }))
        );
      }

      // Step 3: Build combined prompt
      const prompt = this.buildCombinedPrompt(
        userAnswer,
        enrichedExamples,
        rubrics
      );

      // Step 4: Single GPT-4o call for everything
      console.log('🤖 Running combined analysis...');
      const analysis = await this.callCombinedAPI(prompt);

      console.log('✅ Combined analysis complete');
      return analysis;

    } catch (error) {
      console.error('❌ Combined analysis error:', error);
      throw error;
    }
  }

  buildCombinedPrompt(userAnswer, enrichedExamples, rubrics) {
    // Format ideal examples with annotations
    const examplesSection = enrichedExamples.length > 0
      ? this.formatExamples(enrichedExamples)
      : "No similar examples available.";

    // Format rubrics
    const rubricsSection = this.formatRubrics(rubrics);

    return `You are an expert TPM interview coach. Analyze this answer comprehensively.

${examplesSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CANDIDATE'S ANSWER:
${userAnswer}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EVALUATION RUBRICS:
${rubricsSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:

1. **STAR Analysis**: Break down the answer into Situation, Task, Action, Result. Score each 1-5.

2. **Competency Scoring**: Score each competency using the rubrics above (1-5).

3. **Specific Improvements**: Generate copy-paste ready improvements referencing the ideal examples.

CRITICAL RULES:
- Use exact numbers from examples when available
- Reference specific elements: "Example 1 mentions company name 'Meta'"
- Provide exact text to paste, not generic advice
- Only suggest improvements for components scoring < 4.5

Return JSON:
{
  "star": {
    "situation": {
      "score": 1-5,
      "text": "extracted situation text",
      "feedback": "specific gap or strength"
    },
    "task": { "score": 1-5, "text": "...", "feedback": "..." },
    "action": { "score": 1-5, "text": "...", "feedback": "..." },
    "result": { "score": 1-5, "text": "...", "feedback": "..." }
  },
  "competencies": {
    "Execution": 1-5,
    "Communication": 1-5,
    ...
  },
  "improvements": [
    {
      "priority": "critical|high|medium",
      "component": "situation|task|action|result",
      "location": "where to add (be specific)",
      "current_text": "what they currently have",
      "improved_text": "exact text to paste",
      "rationale": "why this matters (reference examples)",
      "example_reference": "Example 1, Result section"
    }
  ]
}`;
  }

  formatExamples(enrichedExamples) {
    return enrichedExamples.map((ex, idx) => {
      const meta = ex.metadata;
      return `
IDEAL EXAMPLE ${idx + 1} (Score: ${ex.score}/5):

Answer: ${ex.answer_text}

Key Elements (what makes this 5-star):
- Company: ${meta.situation?.company || 'not specified'}
- Role/Title: ${meta.situation?.role || 'not specified'}
- Timeline: ${meta.situation?.timeline || 'not specified'}
- Team Size: ${meta.situation?.team_size || 'not specified'}
- Named People: ${meta.action?.named_people?.join(', ') || 'not specified'}
- Tools Used: ${meta.action?.tools?.join(', ') || 'not specified'}
- Quantified Metrics: ${meta.result?.metrics?.join('; ') || 'not specified'}
- Before/After: ${meta.result?.before_after?.join('; ') || 'not specified'}
`;
    }).join('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  formatRubrics(rubrics) {
    return rubrics.map(r => `
${r.competency_name}:
- Level 1: ${r.level_1}
- Level 3: ${r.level_3}
- Level 5: ${r.level_5}
`).join('\n');
  }

  async callCombinedAPI(prompt) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert TPM interview coach. You provide comprehensive, specific feedback in structured JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }
}

module.exports = CombinedAnalyzer;