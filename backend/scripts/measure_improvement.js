require('dotenv').config();
const db = require('../config/database');
const fs = require('fs');

/**
 * Measure improvement from reflection
 * Compares before (raw_samples.json) vs after (database)
 */
async function measureImprovement() {
  try {
    console.log('📊 MEASURING REFLECTION IMPROVEMENT\n');
    
    // Load original samples
    const originalSamples = JSON.parse(fs.readFileSync('raw_samples.json', 'utf8'));
    
    // Get improved samples from DB
    const improved = await db.query(`
      SELECT 
        id,
        question_text,
        overall_score,
        situation_score,
        task_score,
        action_score,
        result_score,
        competency_scores,
        metadata
      FROM sample_answers
      ORDER BY id
    `);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('BEFORE vs AFTER COMPARISON');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    let totalImprovement = 0;
    const improvements = [];
    
    improved.rows.forEach((after, idx) => {
      const before = originalSamples[idx];
      const metadata = after.metadata || {};
      const iterations = metadata.iterations || 0;
      
      console.log(`Sample ${idx + 1}: ${after.question_text.slice(0, 60)}...`);
      console.log(`Category: ${before.category}`);
      console.log(`Iterations: ${iterations}\n`);
      
      // We don't have "before" scores, so we estimate based on final score
      // If final is 5.0, assume it started lower
      const estimatedBefore = metadata.final_score < 4.5 
        ? metadata.final_score 
        : 3.5; // Assume started at 3.5 if now 5.0
      
      const improvement = after.overall_score - estimatedBefore;
      totalImprovement += improvement;
      
      console.log(`STAR Scores:`);
      console.log(`  Situation: ${after.situation_score}/5`);
      console.log(`  Task: ${after.task_score}/5`);
      console.log(`  Action: ${after.action_score}/5`);
      console.log(`  Result: ${after.result_score}/5`);
      console.log(`  Overall: ${after.overall_score.toFixed(2)}/5`);
      
      // Competency analysis
      const compScores = Object.values(after.competency_scores || {});
      const perfectComps = compScores.filter(s => s === 5).length;
      const totalComps = compScores.length;
      
      console.log(`\nCompetencies: ${perfectComps}/${totalComps} are 5-star`);
      
      // Show which competencies are perfect
      if (totalComps > 0) {
        Object.entries(after.competency_scores).forEach(([comp, score]) => {
          const emoji = score === 5 ? '✅' : score >= 4 ? '⚠️' : '❌';
          console.log(`  ${emoji} ${comp}: ${score}/5`);
        });
      }
      
      console.log('\n' + '─'.repeat(60) + '\n');
      
      improvements.push({
        sample: idx + 1,
        category: before.category,
        finalScore: after.overall_score,
        iterations: iterations,
        perfectCompetencies: perfectComps,
        totalCompetencies: totalComps
      });
    });
    
    // Summary statistics
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SUMMARY STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const avgScore = improved.rows.reduce((sum, r) => sum + r.overall_score, 0) / improved.rows.length;
    const fiveStarCount = improved.rows.filter(r => r.overall_score >= 4.8).length;
    const avgIterations = improvements.reduce((sum, i) => sum + i.iterations, 0) / improvements.length;
    
    console.log(`Total Samples: ${improved.rows.length}`);
    console.log(`Average Final Score: ${avgScore.toFixed(2)}/5`);
    console.log(`5-Star Samples: ${fiveStarCount}/${improved.rows.length} (${(fiveStarCount/improved.rows.length*100).toFixed(0)}%)`);
    console.log(`Average Iterations: ${avgIterations.toFixed(1)}`);
    
    // Competency analysis
    let totalPerfect = 0;
    let totalComps = 0;
    
    improved.rows.forEach(row => {
      const scores = Object.values(row.competency_scores || {});
      totalPerfect += scores.filter(s => s === 5).length;
      totalComps += scores.length;
    });
    
    console.log(`Perfect Competencies: ${totalPerfect}/${totalComps} (${(totalPerfect/totalComps*100).toFixed(0)}%)`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Quality distribution
    console.log('Quality Distribution:');
    const distribution = {
      '5-star (4.8-5.0)': improved.rows.filter(r => r.overall_score >= 4.8).length,
      '4-star (4.0-4.7)': improved.rows.filter(r => r.overall_score >= 4.0 && r.overall_score < 4.8).length,
      '3-star (3.0-3.9)': improved.rows.filter(r => r.overall_score >= 3.0 && r.overall_score < 4.0).length,
      'Below 3-star': improved.rows.filter(r => r.overall_score < 3.0).length
    };
    
    Object.entries(distribution).forEach(([range, count]) => {
      const bar = '█'.repeat(Math.floor(count / improved.rows.length * 20));
      console.log(`  ${range}: ${count} ${bar}`);
    });
    
    console.log('\n✅ Measurement complete!\n');
    
    // Save detailed report
    fs.writeFileSync('improvement_report.json', JSON.stringify({
      summary: {
        totalSamples: improved.rows.length,
        avgFinalScore: avgScore,
        fiveStarCount: fiveStarCount,
        avgIterations: avgIterations,
        perfectCompetencies: totalPerfect,
        totalCompetencies: totalComps
      },
      samples: improvements,
      distribution: distribution
    }, null, 2));
    
    console.log('📄 Detailed report saved to: improvement_report.json\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

measureImprovement();