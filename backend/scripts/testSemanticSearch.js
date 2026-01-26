const SemanticSearch = require('../agents/tools/SemanticSearch');

/**
 * Test Script for Semantic Search
 * Tests the semantic search functionality with various scenarios
 */

// Test data: Different quality answers
const testCases = [
  {
    name: 'Strong Answer (Expected: High similarity to ideal examples)',
    answer: `As a TPM at Amazon, I led a cross-functional team of 15 engineers across 
    4 organizations to migrate our legacy payment system to a new microservices architecture. 
    My responsibility was to deliver the migration by June 1st while managing 47 critical 
    dependencies across teams. I established weekly sync meetings with all stakeholders, 
    created a comprehensive dependency tracking dashboard using JIRA, coordinated daily 
    standups with Tech Lead Mike and PM Sarah, and implemented a phased rollout strategy. 
    The migration completed on time, reducing payment processing latency by 40%, successfully 
    handling 2.3M daily transactions with 99.9% uptime, and saving the company $500K annually 
    in infrastructure costs.`,
    questionType: 'leadership'
  },
  {
    name: 'Weak Answer (Expected: Lower similarity)',
    answer: `I worked on a project where we had some issues with the team. I tried to 
    resolve them by talking to people. It was successful and we finished the project.`,
    questionType: 'leadership'
  },
  {
    name: 'Medium Answer (Expected: Medium similarity)',
    answer: `I led a team of 10 developers to build a new feature. We faced some challenges 
    with dependencies, but I organized meetings and created a tracking system. The project 
    launched successfully and improved our metrics.`,
    questionType: 'leadership'
  },
  {
    name: 'Conflict Resolution Answer',
    answer: `As a TPM at Google, I encountered a conflict between the frontend and backend 
    teams regarding API design. The frontend team wanted a flexible JSON structure while 
    backend preferred strict schemas for performance. I facilitated a design review session, 
    gathered data on API performance impacts, and proposed a hybrid approach using GraphQL. 
    Both teams agreed, we implemented the solution, and reduced API response time by 30% 
    while maintaining flexibility.`,
    questionType: 'conflict'
  }
];

async function runTests() {
  console.log('🧪 Starting Semantic Search Tests\n');
  console.log('='.repeat(80));
  
  const semanticSearch = new SemanticSearch();

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    console.log(`\n📝 Test ${i + 1}: ${testCase.name}`);
    console.log('-'.repeat(80));
    console.log(`Answer preview: ${testCase.answer.substring(0, 100)}...`);
    console.log(`Question type: ${testCase.questionType}`);
    
    try {
      // Run semantic search
      const results = await semanticSearch.findSimilarAnswers(
        testCase.answer, 
        testCase.questionType
      );

      if (results.length === 0) {
        console.log('⚠️  No results found above 70% similarity threshold');
        continue;
      }

      // Display results
      console.log(`\n✅ Found ${results.length} similar examples:\n`);
      
      results.forEach((result, idx) => {
        console.log(`  ${idx + 1}. Similarity: ${result.similarity}% | Score: ${result.star_score}/5`);
        console.log(`     Type: ${result.question_type} | Level: ${result.level}`);
        console.log(`     Question: ${result.question_text.substring(0, 60)}...`);
        console.log(`     Answer preview: ${result.answer_text.substring(0, 80)}...`);
        console.log('');
      });

      // Statistics
      const stats = semanticSearch.getStatistics(results);
      console.log('📊 Statistics:');
      console.log(`   Average similarity: ${stats.avg_similarity}%`);
      console.log(`   Average STAR score: ${stats.avg_score}/5`);
      console.log(`   Question types: ${stats.question_types.join(', ')}`);

    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
    }
    
    console.log('='.repeat(80));
    
    // Wait between tests to avoid rate limiting
    if (i < testCases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n✅ All tests completed\n');
}

// Test without question type filter
async function testWithoutFilter() {
  console.log('\n🧪 Testing Semantic Search WITHOUT question type filter\n');
  console.log('='.repeat(80));
  
  const semanticSearch = new SemanticSearch();
  const testAnswer = `I managed a complex project with multiple teams and tight deadlines.`;

  try {
    const results = await semanticSearch.findSimilarAnswers(testAnswer);
    
    console.log(`✅ Found ${results.length} results across all question types:`);
    results.forEach((result, idx) => {
      console.log(`  ${idx + 1}. ${result.question_type} - ${result.similarity}% similar`);
    });

    // Show diversity of question types
    const questionTypes = [...new Set(results.map(r => r.question_type))];
    console.log(`\n📊 Question types found: ${questionTypes.join(', ')}`);

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
  
  console.log('='.repeat(80));
}

// Performance test
async function testPerformance() {
  console.log('\n⚡ Performance Test\n');
  console.log('='.repeat(80));
  
  const semanticSearch = new SemanticSearch();
  const testAnswer = testCases[0].answer;

  const startTime = Date.now();
  
  try {
    const results = await semanticSearch.findSimilarAnswers(testAnswer, 'leadership');
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ Search completed in ${duration}ms`);
    console.log(`📊 Found ${results.length} results`);
    console.log(`🎯 Target: <2000ms | Actual: ${duration}ms | ${duration < 2000 ? 'PASS ✅' : 'FAIL ❌'}`);

  } catch (error) {
    console.error(`❌ Performance test failed: ${error.message}`);
  }
  
  console.log('='.repeat(80));
}

// Run all tests
async function main() {
  try {
    await runTests();
    await testWithoutFilter();
    await testPerformance();
    
    console.log('\n🎉 All tests completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { runTests, testWithoutFilter, testPerformance };