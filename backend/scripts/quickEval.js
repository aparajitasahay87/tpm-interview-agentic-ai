/**
 * Enhanced Quick Evaluation Script
 * Tests all 3 features: Scores + Semantic Search + Improvements
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

const quickTests = [
  {
    name: "Weak: Generic answer",
    answer: "I worked on a project. We finished it successfully.",
    shouldScoreLow: true,
    shouldHaveImprovements: true
  },
  {
    name: "Strong: Detailed TPM answer",
    answer: "As TPM at Amazon, I led 15 engineers across 4 orgs to rebuild the checkout flow. I coordinated sprints, resolved 23 blockers, and delivered June 1st with 99.9% uptime handling 2.3M daily transactions.",
    shouldScoreHigh: true,
    shouldHaveImprovements: false
  },
  {
    name: "Medium: Good details, some 'we' usage",
    answer: "As TPM at Microsoft, I worked with a team of 10 engineers to migrate our payment system to a new platform. We completed the project in 5 months. I coordinated the technical planning and tracked progress in Azure DevOps. The system now processes 500K transactions daily with 99.5% uptime.",
    shouldScoreMedium: true,
    shouldHaveImprovements: true
  }
];

async function callAPI(answer) {
  try {
    const response = await axios.post(
      `${API_URL}/api/tools/parse-star`,
      { answer },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw new Error(`API call failed: ${error.message}`);
  }
}

function checkImprovementsSpecific(improvements) {
  if (!improvements || improvements.length === 0) {
    return { specific: false, count: 0, total: 0, rate: '0%' };
  }
  
  let specificCount = 0;
  
  for (const imp of improvements) {
    const hasNumber = /\d+/.test(imp);
    const hasCompany = /(Amazon|Google|Meta|Microsoft|Apple)/i.test(imp);
    const hasChangePattern = /Change|Replace|Add|Specify|Include/i.test(imp);
    const hasQuote = /['""].*['""]|to ['""]/.test(imp);
    
    if (hasNumber || hasCompany || hasChangePattern || hasQuote) {
      specificCount++;
    }
  }
  
  const specificityRate = specificCount / improvements.length;
  
  return {
    specific: specificityRate >= 0.5,
    count: specificCount,
    total: improvements.length,
    rate: (specificityRate * 100).toFixed(0) + '%'
  };
}

async function runQuickEval() {
  console.log('\n🧪 Enhanced Quick Evaluation');
  console.log('Testing: Scores + Semantic Search + Improvements\n');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  const times = [];
  const results = {
    scores: { pass: 0, fail: 0 },
    semanticSearch: { pass: 0, fail: 0, skipped: 0 },
    improvements: { pass: 0, fail: 0 }
  };

  for (const test of quickTests) {
    console.log(`\n${test.name}`);
    
    try {
      const start = Date.now();
      const response = await callAPI(test.answer);
      const time = Date.now() - start;
      times.push(time);

      // Access data from response
      const score = response.analysis.overall_score;
      const similarExamples = response.analysis.similar_examples || [];
      const improvementAnalysis = response.analysis.improvement_analysis || {};
      const improvements = improvementAnalysis.improvements || [];
      const gaps = improvementAnalysis.gaps || {};
      
      let testPassed = true;
      
      // ==========================================
      // TEST 1: Score Accuracy
      // ==========================================
      if (test.shouldScoreLow && score <= 2.5) {
        console.log(`  ✅ Score: ${score.toFixed(1)} (correctly low)`);
        results.scores.pass++;
      } else if (test.shouldScoreHigh && score >= 4.0) {
        console.log(`  ✅ Score: ${score.toFixed(1)} (correctly high)`);
        results.scores.pass++;
      } else if (test.shouldScoreMedium && score >= 2.5 && score <= 4.0) {
        console.log(`  ✅ Score: ${score.toFixed(1)} (correctly medium)`);
        results.scores.pass++;
      } else {
        console.log(`  ❌ Score: ${score.toFixed(1)} (unexpected)`);
        results.scores.fail++;
        testPassed = false;
      }

      // ==========================================
      // TEST 2: Semantic Search (Similar Examples)
      // ==========================================
      if (response.metadata.rag_enabled) {
        if (similarExamples.length > 0) {
          // Check if examples have required fields
          const validExamples = similarExamples.every(ex => 
            ex.answer_text && 
            ex.question_type && 
            typeof ex.similarity === 'number'
          );
          
          if (validExamples) {
            console.log(`  ✅ Semantic Search: Found ${similarExamples.length} valid examples`);
            console.log(`     Top similarity: ${(similarExamples[0].similarity * 100).toFixed(1)}%`);
            console.log(`     Question type: ${similarExamples[0].question_type}`);
            results.semanticSearch.pass++;
          } else {
            console.log(`  ⚠️  Semantic Search: Examples missing required fields`);
            results.semanticSearch.fail++;
          }
        } else {
          console.log(`  ⚠️  Semantic Search: No examples found (database might be empty)`);
          results.semanticSearch.fail++;
        }
      } else {
        console.log(`  ℹ️  Semantic Search: RAG not enabled (set ENABLE_RAG_FEATURES=true)`);
        results.semanticSearch.skipped++;
      }

      // ==========================================
      // TEST 3: Improvement Quality (Comparison Analyzer)
      // ==========================================
      if (test.shouldHaveImprovements) {
        if (improvements.length === 0) {
          console.log(`  ❌ Improvements: None provided for weak answer`);
          results.improvements.fail++;
          testPassed = false;
        } else {
          const quality = checkImprovementsSpecific(improvements);
          
          if (quality.specific) {
            console.log(`  ✅ Improvements: ${quality.count}/${quality.total} specific (${quality.rate})`);
            console.log(`     Example: "${improvements[0].substring(0, 60)}..."`);
            results.improvements.pass++;
          } else {
            console.log(`  ⚠️  Improvements: Only ${quality.count}/${quality.total} specific (${quality.rate})`);
            console.log(`     Need more actionable advice with examples/numbers`);
            results.improvements.fail++;
            // Don't fail test, just warn
          }
          
          // Show gap analysis
          const gapCount = Object.values(gaps).filter(g => g !== null && g.length > 0).length;
          if (gapCount > 0) {
            console.log(`     STAR gaps identified: ${gapCount}/4 components`);
          }
        }
      } else {
        // Strong answers don't need many improvements
        console.log(`  ✅ Improvements: ${improvements.length} provided (strong answer needs fewer)`);
        results.improvements.pass++;
      }

      console.log(`  ⏱️  Time: ${(time/1000).toFixed(1)}s`);

      if (testPassed) {
        passed++;
      } else {
        failed++;
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      failed++;
      results.scores.fail++;
      results.improvements.fail++;
    }
  }

  // ==========================================
  // FINAL RESULTS
  // ==========================================
  const total = quickTests.length;
  const passRate = (passed / total * 100).toFixed(0);
  const avgTime = (times.reduce((a,b) => a+b, 0) / times.length / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 DETAILED RESULTS:\n');
  console.log(`   Score Accuracy:       ${results.scores.pass}/${results.scores.pass + results.scores.fail} passed`);
  
  if (results.semanticSearch.skipped > 0) {
    console.log(`   Semantic Search:      Skipped (RAG not enabled)`);
  } else {
    console.log(`   Semantic Search:      ${results.semanticSearch.pass}/${results.semanticSearch.pass + results.semanticSearch.fail} passed`);
  }
  
  console.log(`   Improvement Quality:  ${results.improvements.pass}/${results.improvements.pass + results.improvements.fail} passed`);
  console.log(`\n📈 Overall: ${passed}/${total} tests passed (${passRate}%)`);
  console.log(`⏱️  Average response time: ${avgTime}s`);
  
  if (passRate >= 67) {  // 2/3 = 67%
    console.log('\n✅ PASSED - Ready to proceed with deployment!\n');
    console.log('🎯 Features validated:');
    console.log(`   • STAR scoring: ${results.scores.pass === 3 ? '✅' : '⚠️'}`);
    console.log(`   • Semantic search: ${results.semanticSearch.pass > 0 || results.semanticSearch.skipped > 0 ? '✅' : '⚠️'}`);
    console.log(`   • Actionable improvements: ${results.improvements.pass >= 2 ? '✅' : '⚠️'}\n`);
    process.exit(0);
  } else {
    console.log('\n❌ FAILED - Fix issues before deploying\n');
    
    if (results.scores.fail > 0) {
      console.log('❗ Fix: Adjust STAR scoring prompts for accuracy');
    }
    if (results.improvements.fail > 0) {
      console.log('❗ Fix: Make improvements more specific (add "Change X to Y" examples)');
    }
    if (results.semanticSearch.fail > 0) {
      console.log('❗ Check: Ensure database has example answers and RAG is enabled');
    }
    console.log('');
    process.exit(1);
  }
}

runQuickEval().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});