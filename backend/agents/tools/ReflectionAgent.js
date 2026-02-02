const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class ReflectionAgent {
  /**
   * Reflects on generated improvements and refines them
   * @param {Array<string>} improvements - Initial improvements from ComparisonAnalyzer
   * @param {Object} context - Additional context (answer, scores, etc.)
   * @returns {Promise<Array<string>>} - Refined improvements
   */
  async reflect(improvements, context = {}) {
    try {
      console.log('🔄 ReflectionAgent: Starting reflection on improvements...');
      
      const prompt = this.buildReflectionPrompt(improvements, context);
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a reflection agent that critiques and refines interview feedback to make it more specific, actionable, and valuable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3 // Lower temperature for consistent refinement
      });

      const refinedImprovements = this.parseReflectionResponse(response.choices[0].message.content);
      
      console.log(`✅ ReflectionAgent: Refined ${improvements.length} improvements`);
      
      return refinedImprovements;
      
    } catch (error) {
      console.error('❌ ReflectionAgent error:', error);
      // Fallback: return original improvements if reflection fails
      return improvements;
    }
  }

  buildReflectionPrompt(improvements, context) {
    return `You are reviewing interview feedback improvements. Your goal is to make them MORE SPECIFIC, ACTIONABLE, and CONCRETE.

CURRENT IMPROVEMENTS:
${improvements.map((imp, i) => `${i + 1}. ${imp}`).join('\n')}

QUALITY CRITERIA - Each improvement should have:
1. SPECIFIC: Include numbers, company names, role titles, or concrete examples
   ❌ Bad: "Add more details"
   ✅ Good: "Add company and role: 'As TPM at Amazon, I...'"

2. ACTIONABLE: Use clear action verbs (Add, Change, Specify, Include)
   ❌ Bad: "Your task could be better"
   ✅ Good: "Change 'led the project' to 'led 15 engineers across 3 teams'"

3. CONCRETE: Give examples, not vague advice
   ❌ Bad: "Include metrics"
   ✅ Good: "Add metrics like 'reduced costs by $2M' or 'improved speed by 40%'"

REFLECTION TASK:
Review each improvement above. For any that are too generic or vague:
- Make them specific with examples
- Add concrete numbers or names where possible
- Use action-oriented language

Return ONLY the list of refined improvements, one per line, numbered.
Keep good improvements as-is. Enhance weak ones.`;
  }

  parseReflectionResponse(content) {
    // Extract numbered list from response
    const lines = content.split('\n').filter(line => line.trim());
    
    const improvements = lines
      .filter(line => /^\d+\./.test(line.trim())) // Match numbered lines
      .map(line => line.replace(/^\d+\.\s*/, '').trim()); // Remove numbering
    
    return improvements.length > 0 ? improvements : [content.trim()];
  }
}

module.exports = new ReflectionAgent();