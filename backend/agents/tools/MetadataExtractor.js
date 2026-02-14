const OpenAI = require('openai');

/**
 * TEST VERSION - Metadata Extractor
 * Extracts structured data from ideal examples
 */
class MetadataExtractor {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.cache = new Map();
  }

  async extractMetadata(example) {
    const cacheKey = `metadata:${example.id || example.question_text?.slice(0, 50)}`;
    
    if (this.cache.has(cacheKey)) {
      console.log('✅ Cache hit');
      return this.cache.get(cacheKey);
    }

    try {
      console.log('🔍 Extracting metadata...');
      
      const prompt = `Extract metadata from this TPM answer:

ANSWER: ${example.answer_text}

SITUATION: ${example.star.situation}
TASK: ${example.star.task}
ACTION: ${example.star.action}
RESULT: ${example.star.result}

Return JSON with:
{
  "situation": {
    "company": "company name or null",
    "role": "job title or null",
    "timeline": "Q1 2024 or null",
    "team_size": "8-person team or null"
  },
  "action": {
    "named_people": ["names array"],
    "tools": ["JIRA", "etc"]
  },
  "result": {
    "metrics": ["51% improvement", "etc"],
    "before_after": ["from 340ms to 165ms"]
  }
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Extract metadata. Return only JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const metadata = JSON.parse(response.choices[0].message.content);
      this.cache.set(cacheKey, metadata);
      
      console.log('✅ Metadata extracted');
      return metadata;

    } catch (error) {
      console.error('❌ Extraction failed:', error.message);
      return this.getFallback(example);
    }
  }

  getFallback(example) {
    return {
      situation: { company: null, role: null, timeline: null, team_size: null },
      action: { named_people: [], tools: [] },
      result: { metrics: [], before_after: [] },
      _fallback: true
    };
  }
}

module.exports = MetadataExtractor;