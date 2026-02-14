require('dotenv').config();
const db = require('../config/database');
const OpenAI = require('openai');
const STARParser = require('../agents/tools/STARParser');
const RubricScorer = require('../agents/tools/RubricScorer');

/**
 * AUTOMATED CURATION TO 5-STAR
 * Cost-efficient: Max 3 iterations, uses gpt-4o-mini for improvements
 */
class AutoCurator {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.starParser = new STARParser();
    this.rubricScorer = new RubricScorer();
    this.maxIterations = 3;
  }

  async improveAnswer(answer, weakAreas) {
    console.log('🔧 Auto-improving answer...');
    
    // Build focused prompt with specific gaps
    const gaps = weakAreas.map(area => 
      `- ${area.component} (${area.score}/5): ${area.feedback}`
    ).join('\n');
    
    const prompt = `You are improving a TPM interview answer to 5-star quality.

CURRENT ANSWER:
${answer}

GAPS TO FIX (must reach 5/5):
${gaps}

INSTRUCTIONS:
- Keep the core story and achievements
- Add ONLY what's missing (don't rewrite everything)
- Add specific numbers, names, tools, timelines
- Make improvements bold so they're visible: **added text**

Return the IMPROVED answer (keep original text + add missing elements):`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cheaper for improvements
      messages: [
        { role: 'system', content: 'You improve interview answers by adding specific missing details. Be surgical - only add what\'s needed.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const improved = response.choices[0].message.content
      .replace(/\*\*/g, '') // Remove bold markers
      .trim();
    
    console.log('✅ Improvement generated');
    return improved;
  }

  async analyze(answer, rubrics) {
    const star = await this.starParser.parse(answer);
    const scores = await this.rubricScorer.scoreAnswer(answer, rubrics);
    
    const overallScore = (
      star.situation.score + 
      star.task.score + 
      star.action.score + 
      star.result.score
    ) / 4;
    
    return { star, scores, overallScore };
  }

  getWeakAreas(analysis) {
    const weak = [];
    
    // STAR gaps
    ['situation', 'task', 'action', 'result'].forEach(comp => {
      if (analysis.star[comp].score < 5) {
        weak.push({
          component: comp.charAt(0).toUpperCase() + comp.slice(1),
          score: analysis.star[comp].score,
          feedback: analysis.star[comp].feedback
        });
      }
    });
    
    // Competency gaps
    Object.entries(analysis.scores.competency_scores || {}).forEach(([comp, score]) => {
      if (score < 5) {
        weak.push({
          component: comp,
          score: score,
          feedback: analysis.scores.reasoning?.[comp] || 'Needs improvement'
        });
      }
    });
    
    return weak.sort((a, b) => a.score - b.score).slice(0, 5); // Top 5 gaps
  }

  async curateToFiveStar(question, answer, categoryId) {
    console.log('\n🎯 Auto-curating to 5-star quality...\n');
    
    // Get rubrics
    const rubrics = await db.query(
      'SELECT * FROM rubrics WHERE category_id = $1',
      [categoryId]
    );
    
    let currentAnswer = answer;
    let iteration = 1;
    
    while (iteration <= this.maxIterations) {
      console.log(`\n━━━ ITERATION ${iteration}/${this.maxIterations} ━━━`);
      
      // Analyze
      const analysis = await this.analyze(currentAnswer, rubrics.rows);
      
      console.log(`Overall Score: ${analysis.overallScore.toFixed(2)}/5`);
      console.log(`STAR: S:${analysis.star.situation.score} T:${analysis.star.task.score} A:${analysis.star.action.score} R:${analysis.star.result.score}`);
      
      const compScores = Object.values(analysis.scores.competency_scores || {});
      const avgComp = compScores.length > 0 
        ? (compScores.reduce((a, b) => a + b, 0) / compScores.length).toFixed(2)
        : 0;
      console.log(`Competencies: ${avgComp}/5 average`);
      
      // Check if 5-star
      const weakAreas = this.getWeakAreas(analysis);
      
      if (analysis.overallScore >= 4.8 && weakAreas.length === 0) {
        console.log('\n🎉 ACHIEVED 5-STAR QUALITY!');
        return {
          answer: currentAnswer,
          analysis: analysis,
          iterations: iteration,
          success: true
        };
      }
      
      // If last iteration, accept as-is
      if (iteration === this.maxIterations) {
        console.log(`\n⚠️  Max iterations reached. Final score: ${analysis.overallScore.toFixed(2)}/5`);
        return {
          answer: currentAnswer,
          analysis: analysis,
          iterations: iteration,
          success: false
        };
      }
      
      // Improve
      console.log(`\nGaps found: ${weakAreas.length}`);
      weakAreas.slice(0, 3).forEach(gap => {
        console.log(`  - ${gap.component}: ${gap.score}/5`);
      });
      
      currentAnswer = await this.improveAnswer(currentAnswer, weakAreas);
      iteration++;
    }
  }

  async save(question, result, categoryId, categoryName) {
    console.log('\n💾 Saving to database...');
    
    const analysis = result.analysis;
    
    const inserted = await db.query(`
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
        is_good_example,
        question_type,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `, [
      categoryId,
      question,
      result.answer,
      analysis.star.situation.text || '',
      analysis.star.task.text || '',
      analysis.star.action.text || '',
      analysis.star.result.text || '',
      analysis.star.situation.score,
      analysis.star.task.score,
      analysis.star.action.score,
      analysis.star.result.score,
      analysis.overallScore,
      JSON.stringify(analysis.scores.competency_scores),
      result.success, // Only mark as good if truly 5-star
      categoryName.toLowerCase().replace(' ', '_'),
      JSON.stringify({
        auto_curated: true,
        iterations: result.iterations,
        final_score: analysis.overallScore
      })
    ]);
    

    console.log(`✅ Saved as ID ${inserted.rows[0].id}`);
    return inserted.rows[0].id;
  }

  meetsQualityThreshold(analysis, minCompetencyScore = 3) {
    const issues = [];
    const failedCompetencies = [];
    
    Object.entries(analysis.scores.competency_scores || {}).forEach(([comp, score]) => {
      if (score < minCompetencyScore) {
        failedCompetencies.push(`${comp}: ${score}/5`);
        issues.push(`${comp} scored ${score}/5 (threshold: ${minCompetencyScore})`);
      }
    });
    
    return {
      passes: issues.length === 0,
      issues,
      failedCompetencies
    };
  }

  logRejection(question, category, result, qualityCheck) {
    const fs = require('fs');
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      category,
      question: question.slice(0, 100) + '...',
      finalScore: result.analysis.overallScore,
      iterations: result.iterations,
      failedCompetencies: qualityCheck.failedCompetencies,
      allScores: result.analysis.scores.competency_scores
    };
    
    fs.appendFileSync('rejected_samples.log', JSON.stringify(logEntry) + '\n');
    
    console.log('\n❌ REJECTED');
    console.log(`   Category: ${category}`);
    console.log(`   Failed competencies:`);
    qualityCheck.failedCompetencies.forEach(comp => console.log(`     - ${comp}`));
  }

}


// ============================================
// CLI Usage
// ============================================

async function main() {
  const curator = new AutoCurator();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
 if (command === 'batch') {
    const fs = require('fs');
    const filepath = args[1];
    const minCompetencyScore = parseInt(args[2]) || 3; // Default: reject if any competency < 3
    
    if (!filepath) {
      console.error('Usage: node auto_curate_to_5star.js batch <filepath.json> [min_competency_score]');
      console.error('Example: node auto_curate_to_5star.js batch samples.json 3');
      process.exit(1);
    }
    
    const samples = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    console.log(`📚 Processing ${samples.length} samples...`);
    console.log(`🎯 Quality threshold: All competencies >= ${minCompetencyScore}/5\n`);
    
    // Clear previous rejection log
    if (fs.existsSync('rejected_samples.log')) {
      fs.unlinkSync('rejected_samples.log');
    }
    
    let acceptedCount = 0;
    let rejectedCount = 0;
    const rejectionsByCategory = {};
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`SAMPLE ${i + 1}/${samples.length}: ${sample.category}`);
      console.log('='.repeat(60));
      
      const result = await curator.curateToFiveStar(
        sample.question,
        sample.answer,
        sample.category_id
      );
      
      // Check quality threshold
      const qualityCheck = curator.meetsQualityThreshold(result.analysis, minCompetencyScore);
      
      if (qualityCheck.passes) {
        // ACCEPTED
        await curator.save(sample.question, result, sample.category_id, sample.category);
        acceptedCount++;
        console.log('\n✅ ACCEPTED - Saved to database');
      } else {
        // REJECTED
        curator.logRejection(sample.question, sample.category, result, qualityCheck);
        rejectedCount++;
        
        if (!rejectionsByCategory[sample.category]) {
          rejectionsByCategory[sample.category] = 0;
        }
        rejectionsByCategory[sample.category]++;
      }
    }
    
    // Summary
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('📊 BATCH PROCESSING SUMMARY');
    console.log('='.repeat(70));
    console.log(`\nTotal: ${samples.length}`);
    console.log(`✅ Accepted: ${acceptedCount} (${(acceptedCount/samples.length*100).toFixed(0)}%)`);
    console.log(`❌ Rejected: ${rejectedCount} (${(rejectedCount/samples.length*100).toFixed(0)}%)`);
    
    if (rejectedCount > 0) {
      console.log(`\nRejections by Category:`);
      Object.entries(rejectionsByCategory).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
      console.log(`\n📄 Details in: rejected_samples.log`);
    }
    console.log('='.repeat(70) + '\n');
    
  } else if (command === 'single') {
    // Process single sample
    const categoryId = parseInt(args[1]);
    const question = args[2];
    const answer = args[3];
    
    if (!categoryId || !question || !answer) {
      console.error('Usage: node auto_curate_to_5star.js single <category_id> "<question>" "<answer>"');
      process.exit(1);
    }
    
    const catResult = await db.query('SELECT name FROM categories WHERE id = $1', [categoryId]);
    const categoryName = catResult.rows[0]?.name || 'Unknown';
    
    const result = await curator.curateToFiveStar(question, answer, categoryId);
    await curator.save(question, result, categoryId, categoryName);
    
  } else {
    console.log(`
📚 AUTOMATED 5-STAR CURATION

Usage:
  1. Batch process from JSON file:
     node scripts/auto_curate_to_5star.js batch samples.json

  2. Single sample:
     node scripts/auto_curate_to_5star.js single 1 "Question" "Answer"

JSON Format for batch:
[
  {
    "category_id": 1,
    "category": "Program Sense",
    "question": "Tell me about...",
    "answer": "I worked on..."
  }
]

Cost: ~$0.02 per sample (3 iterations × gpt-4o-mini)
    `);
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});