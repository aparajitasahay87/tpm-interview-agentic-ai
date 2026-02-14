require('dotenv').config();
const db = require('../config/database');
const STARParser = require('../agents/tools/STARParser');
const RubricScorer = require('../agents/tools/RubricScorer');
const OpenAI = require('openai');

/**
 * SCALABLE Auto-Fix System
 * Accepts ANY format (blog, newsletter, raw text) and standardizes it
 */
class SampleNormalizer {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.starParser = new STARParser();
    this.rubricScorer = new RubricScorer();
  }

  /**
   * Step 1: Normalize raw input to standard format
   * Handles: blogs, newsletters, PDFs, any text format
   */
  async normalizeInput(rawInput) {
    console.log('🔄 Normalizing input format...');
    
    const prompt = `You are a data normalizer. Extract interview Q&A from any format.

INPUT (could be blog post, newsletter, raw text, etc.):
${rawInput}

Extract:
1. question_text: The interview question
2. answer_text: The full answer (preserve all details)
3. category_hint: Guess category (Partnership/Technical/Program Sense/System Design/Behavioral)
4. metadata: Any extra info (company, level, year)

Return ONLY JSON:
{
  "question_text": "string",
  "answer_text": "string (full answer)",
  "category_hint": "string",
  "metadata": {
    "company": "string or null",
    "level": "string or null",
    "year_answered": number or null
  }
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You normalize interview Q&A data. Return only JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const normalized = JSON.parse(response.choices[0].message.content);
    console.log('✅ Normalized:', normalized.question_text?.slice(0, 60) + '...');
    
    return normalized;
  }

  /**
   * Step 2: Map category hint to actual category_id
   */
  async mapCategory(categoryHint) {
    const result = await db.query(`
      SELECT id, name 
      FROM categories 
      WHERE LOWER(name) LIKE LOWER($1)
      LIMIT 1
    `, [`%${categoryHint}%`]);
    
    if (result.rows.length === 0) {
      console.warn(`⚠️  No category match for "${categoryHint}", defaulting to ID 1`);
      return 1; // Default fallback
    }
    
    return result.rows[0].id;
  }

  /**
   * Step 3: Extract STAR breakdown using AI
   */
  async extractSTAR(answerText) {
    console.log('📊 Extracting STAR components...');
    const star = await this.starParser.parse(answerText);
    return star;
  }

  /**
   * Step 4: Score competencies using rubrics
   */
  async scoreCompetencies(answerText, categoryId) {
    console.log('🎯 Scoring competencies...');
    
    const rubrics = await db.query(
      'SELECT * FROM rubrics WHERE category_id = $1',
      [categoryId]
    );
    
    if (rubrics.rows.length === 0) {
      console.warn('⚠️  No rubrics found, skipping competency scoring');
      return {};
    }
    
    const scores = await this.rubricScorer.scoreAnswer(answerText, rubrics.rows);
    return scores.competency_scores;
  }

  /**
   * Step 5: Insert into database in standard format
   */
  async insertStandardized(data) {
    console.log('💾 Inserting standardized record...');
    
    const result = await db.query(`
      INSERT INTO sample_answers (
        category_id,
        question_text,
        answer_text,
        situation_text,
        task_text,
        action_text,
        result_text,
        situation_score,
        task_score,
        action_score,
        result_score,
        overall_score,
        competency_scores,
        company,
        level,
        year_answered,
        is_good_example
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `, [
      data.category_id,
      data.question_text,
      data.answer_text,
      data.situation_text,
      data.task_text,
      data.action_text,
      data.result_text,
      data.situation_score,
      data.task_score,
      data.action_score,
      data.result_score,
      data.overall_score,
      JSON.stringify(data.competency_scores),
      data.company,
      data.level,
      data.year_answered,
      data.overall_score >= 4 // Auto-mark as good example if score >= 4
    ]);
    
    console.log(`✅ Inserted as ID ${result.rows[0].id}`);
    return result.rows[0].id;
  }

  /**
   * MAIN: Process any raw input end-to-end
   */
  async processRawInput(rawInput) {
    console.log('\n🚀 Processing raw input...\n');
    
    // Step 1: Normalize format
    const normalized = await this.normalizeInput(rawInput);
    
    // Step 2: Map category
    const categoryId = await this.mapCategory(normalized.category_hint);
    
    // Step 3: Extract STAR
    const star = await this.extractSTAR(normalized.answer_text);
    
    // Step 4: Score competencies
    const competencyScores = await this.scoreCompetencies(normalized.answer_text, categoryId);
    
    // Step 5: Calculate overall score (average of STAR)
    const overallScore = (
      star.situation.score + 
      star.task.score + 
      star.action.score + 
      star.result.score
    ) / 4;
    
    // Step 6: Prepare standardized data
    const standardized = {
      category_id: categoryId,
      question_text: normalized.question_text,
      answer_text: normalized.answer_text,
      situation_text: star.situation.text || '',
      task_text: star.task.text || '',
      action_text: star.action.text || '',
      result_text: star.result.text || '',
      situation_score: star.situation.score || 0,
      task_score: star.task.score || 0,
      action_score: star.action.score || 0,
      result_score: star.result.score || 0,
      overall_score: overallScore,
      competency_scores: competencyScores,
      company: normalized.metadata?.company || null,
      level: normalized.metadata?.level || null,
      year_answered: normalized.metadata?.year_answered || null
    };
    
    // Step 7: Insert
    const id = await this.insertStandardized(standardized);
    
    console.log('\n✅ Successfully processed and standardized!');
    return id;
  }

  /**
   * Fix existing incomplete records
   */
  async fixIncompleteRecords() {
    console.log('🔧 Fixing incomplete existing records...\n');
    
    const incomplete = await db.query(`
      SELECT id, answer_text, category_id, question_text
      FROM sample_answers
      WHERE situation_text IS NULL 
         OR competency_scores IS NULL
         OR competency_scores::text = '{}'
      ORDER BY id
    `);
    
    console.log(`Found ${incomplete.rows.length} incomplete records\n`);
    
    for (const row of incomplete.rows) {
      console.log(`\n📝 Fixing ID ${row.id}...`);
      
      const star = await this.extractSTAR(row.answer_text);
      const competencyScores = await this.scoreCompetencies(row.answer_text, row.category_id);
      
      const overallScore = (
        star.situation.score + star.task.score + 
        star.action.score + star.result.score
      ) / 4;
      
      await db.query(`
        UPDATE sample_answers
        SET 
          situation_text = $1,
          task_text = $2,
          action_text = $3,
          result_text = $4,
          situation_score = $5,
          task_score = $6,
          action_score = $7,
          result_score = $8,
          overall_score = $9,
          competency_scores = $10,
          is_good_example = $11
        WHERE id = $12
      `, [
        star.situation.text || '',
        star.task.text || '',
        star.action.text || '',
        star.result.text || '',
        star.situation.score,
        star.task.score,
        star.action.score,
        star.result.score,
        overallScore,
        JSON.stringify(competencyScores),
        overallScore >= 4,
        row.id
      ]);
      
      console.log(`✅ Fixed ID ${row.id} (score: ${overallScore.toFixed(2)})`);
    }
    
    console.log('\n🎉 All records fixed!');
  }
}

// ============================================
// CLI Usage
// ============================================

async function main() {
  const normalizer = new SampleNormalizer();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'fix-existing') {
    // Fix incomplete records in DB
    await normalizer.fixIncompleteRecords();
    
  } else if (command === 'add-from-file') {
    // Add new sample from file
    const fs = require('fs');
    const filepath = args[1];
    
    if (!filepath) {
      console.error('❌ Usage: node auto_fix_samples_SCALABLE.js add-from-file <filepath>');
      process.exit(1);
    }
    
    const rawInput = fs.readFileSync(filepath, 'utf8');
    await normalizer.processRawInput(rawInput);
    
  } else if (command === 'add-from-text') {
    // Add new sample from command line text
    const rawInput = args.slice(1).join(' ');
    
    if (!rawInput) {
      console.error('❌ Usage: node auto_fix_samples_SCALABLE.js add-from-text "raw text..."');
      process.exit(1);
    }
    
    await normalizer.processRawInput(rawInput);
    
  } else {
    console.log(`
📚 SCALABLE SAMPLE NORMALIZER

Usage:
  1. Fix existing incomplete records:
     node scripts/auto_fix_samples_SCALABLE.js fix-existing

  2. Add sample from file (blog, newsletter, PDF text):
     node scripts/auto_fix_samples_SCALABLE.js add-from-file path/to/sample.txt

  3. Add sample from command line:
     node scripts/auto_fix_samples_SCALABLE.js add-from-text "Q: ... A: ..."

Examples:
  node scripts/auto_fix_samples_SCALABLE.js fix-existing
  node scripts/auto_fix_samples_SCALABLE.js add-from-file samples/blog_post.txt
    `);
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});