require('dotenv').config();
const ComparisonAnalyzer = require('../agents/tools/ComparisonAnalyzer');

/**
 * Test ComparisonAnalyzer
 */

async function testComparisonAnalyzer() {
  console.log('🧪 Testing ComparisonAnalyzer...\n');
  console.log('='.repeat(80));

  const analyzer = new ComparisonAnalyzer();

  // Test data: weak answer
  const userAnswer = "I worked on a project with multiple teams. There were some challenges but we finished it successfully.";
  
  const userSTAR = {
    scores: {
      situation: 2,
      task: 1,
      action: 2,
      result: 1,
      overall: 1.5
    },
    breakdown: {
      situation: "worked on a project with multiple teams",
      task: "not clearly stated",
      action: "there were some challenges",
      result: "finished it successfully"
    }
  };

  const similarExamples = [
    {
      similarity: 75,
      score: 5.0,
      question_text: "Tell me about a time you led a cross-functional team",
      answer_text: "As TPM at Amazon, I led a 15-person team across 4 organizations to build a new checkout flow for Prime Day 2024. The project had a hard deadline of June 1st and required coordinating 12 different services. I established weekly cross-team syncs, created a shared Gantt chart tracking 47 dependencies, and implemented a risk register updated daily. When the Mobile team fell 2 weeks behind due to iOS framework issues, I negotiated with leadership to shift 2 engineers from another team and ran daily standups to unblock issues. We launched 3 days early with 99.9% uptime during Prime Day, processing 2.3M transactions with 15% faster checkout time and zero P0 incidents.",
      star: {
        situation: "As TPM at Amazon, I led a 15-person team across 4 organizations (Payments, Fraud, Mobile, Data Science) to build a new checkout flow for Prime Day 2024. The project had a hard deadline of June 1st and required coordinating 12 different services.",
        task: "My task was to deliver the new checkout flow on time while coordinating 4 different teams with competing priorities, managing 47 cross-service dependencies, and ensuring zero impact to existing Prime Day traffic.",
        action: "I established weekly cross-team syncs with all 4 organizations, created a shared Gantt chart tracking all 47 dependencies in JIRA, and implemented a risk register that I updated daily. When the Mobile team fell 2 weeks behind due to iOS framework issues, I negotiated with leadership to temporarily shift 2 engineers from another project and ran daily 15-minute standups focused purely on unblocking critical path items.",
        result: "We launched 3 days ahead of schedule with 99.9% uptime during Prime Day. The new checkout flow processed 2.3 million transactions, achieved 15% faster completion time compared to the old flow, and had zero P0 incidents. Leadership recognized the project as a model for cross-org collaboration."
      }
    }
  ];

  try {
    console.log('\n📝 User Answer:');
    console.log(userAnswer);
    
    console.log('\n📊 User STAR Scores:');
    console.log(`  Situation: ${userSTAR.scores.situation}/5`);
    console.log(`  Task: ${userSTAR.scores.task}/5`);
    console.log(`  Action: ${userSTAR.scores.action}/5`);
    console.log(`  Result: ${userSTAR.scores.result}/5`);
    console.log(`  Overall: ${userSTAR.scores.overall}/5`);

    console.log('\n🔍 Analyzing...\n');

    const analysis = await analyzer.analyzeGaps(userAnswer, userSTAR, similarExamples);

    console.log('\n✅ Analysis Complete!\n');
    console.log('='.repeat(80));
    
    console.log('\n📋 GAPS IDENTIFIED:\n');
    console.log('Situation:', analysis.gaps.situation || '✅ No gaps');
    console.log('Task:', analysis.gaps.task || '✅ No gaps');
    console.log('Action:', analysis.gaps.action || '✅ No gaps');
    console.log('Result:', analysis.gaps.result || '✅ No gaps');

    console.log('\n💡 IMPROVEMENTS:\n');
    analysis.improvements.forEach((improvement, idx) => {
      console.log(`${idx + 1}. ${improvement}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test passed!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run test
testComparisonAnalyzer();