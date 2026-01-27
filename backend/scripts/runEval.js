/**
 * Enhanced Evaluation Framework with Quality Checks
 * Tests: Score Accuracy + Semantic Search Relevance + Improvement Quality
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_DATA_PATH = path.join(__dirname, '../test-data/eval-cases.json');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

class EnhancedEvaluator {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      tests: [],
      features: {
        scoring: { pass: 0, fail: 0 },
        semanticSearch: { pass: 0, fail: 0, skipped: 0 },
        improvements: { pass: 0, fail: 0 }
      }
    };
    this.responseTimes = [];
  }

  async run() {
    console.log(`${colors.bold}${colors.cyan}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   ENHANCED QUALITY EVALUATION FRAMEWORK');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`${colors.reset}\n`);

    try {
      const testCases = await this.loadTestCases();
      console.log(`📊 Loaded ${testCases.length} test cases\n`);

      for (const testCase of testCases) {
        await this.evaluateTestCase(testCase);
      }

      this.generateReport();
      
      const passRate = this.results.passed / this.results.total;
      process.exit(passRate >= 0.80 ? 0 : 1);

    } catch (error) {
      console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }

  async loadTestCases() {
    try {
      const data = await fs.readFile(TEST_DATA_PATH, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load test cases: ${error.message}`);
    }
  }

  async evaluateTestCase(testCase) {
    console.log(`${colors.bold}Test ${testCase.id}: ${testCase.name}${colors.reset}`);
    console.log(`Type: ${testCase.type} | Question Type: ${testCase.question_type}`);
    
    const result = {
      id: testCase.id,
      name: testCase.name,
      type: testCase.type,
      checks: {},
      passed: false,
      error: null
    };

    try {
      const startTime = Date.now();
      const response = await this.callAPI(testCase.answer);
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);

      // Check 1: Score Accuracy
      result.checks.score = this.checkScoreAccuracy(response, testCase);

      // Check 2: Semantic Search Quality
      result.checks.semanticSearch = this.checkSemanticSearchQuality(response, testCase);

      // Check 3: Improvement Quality
      result.checks.improvements = this.checkImprovementQuality(response, testCase);

      // Check 4: Gap Analysis
      result.checks.gapAnalysis = this.checkGapAnalysis(response, testCase);

      // Check 5: Response Time
      result.checks.responseTime = this.checkResponseTime(responseTime);

      // Determine if test passed (all critical checks must pass)
      const criticalChecks = ['score', 'improvements'];
      result.passed = criticalChecks.every(check => result.checks[check]?.passed);

      // Update feature counters
      if (result.checks.score.passed) this.results.features.scoring.pass++;
      else this.results.features.scoring.fail++;

      if (result.checks.semanticSearch.skipped) {
        this.results.features.semanticSearch.skipped++;
      } else if (result.checks.semanticSearch.passed) {
        this.results.features.semanticSearch.pass++;
      } else {
        this.results.features.semanticSearch.fail++;
      }

      if (result.checks.improvements.passed) this.results.features.improvements.pass++;
      else this.results.features.improvements.fail++;

      this.results.total++;
      if (result.passed) {
        this.results.passed++;
      } else {
        this.results.failed++;
      }

    } catch (error) {
      result.error = error.message;
      result.passed = false;
      this.results.total++;
      this.results.failed++;
      this.results.features.scoring.fail++;
      this.results.features.improvements.fail++;
    }

    this.results.tests.push(result);
    this.printTestResult(result);
    console.log('');
  }

  async callAPI(answer) {
    try {
      const response = await axios.post(
        `${API_URL}/api/tools/parse-star`,
        { answer },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Response time exceeded 30 seconds');
      }
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  checkScoreAccuracy(response, testCase) {
    const score = response.analysis.overall_score;
    const [min, max] = testCase.expected_score_range;
    const passed = score >= min && score <= max;

    return {
      passed,
      expected: `${min}-${max}`,
      actual: score.toFixed(1),
      message: passed 
        ? `Score ${score.toFixed(1)} within range ${min}-${max}`
        : `Score ${score.toFixed(1)} outside expected range ${min}-${max}`
    };
  }

  checkSemanticSearchQuality(response, testCase) {
    const similarExamples = response.analysis.similar_examples || [];
    
    if (!response.metadata.rag_enabled) {
      return {
        passed: true,
        skipped: true,
        message: 'RAG not enabled (set ENABLE_RAG_FEATURES=true)'
      };
    }

    if (similarExamples.length === 0) {
      return {
        passed: false,
        skipped: false,
        message: 'No similar examples found (database might be empty)',
        recommendation: 'Add example answers to database'
      };
    }

    // Check if examples have required fields
    const validStructure = similarExamples.every(ex => 
      ex.answer_text && 
      ex.question_type && 
      typeof ex.similarity === 'number' &&
      typeof ex.score === 'number'
    );

    if (!validStructure) {
      return {
        passed: false,
        skipped: false,
        message: 'Examples missing required fields',
        recommendation: 'Check SemanticSearch.js return format'
      };
    }

    // Quality check: Are similarities reasonable? (above 0.5 for at least one)
    const topSimilarity = Math.max(...similarExamples.map(ex => ex.similarity));
    const hasRelevant = topSimilarity >= 0.5;

    // Check if question types are related (basic check)
    const questionTypes = similarExamples.map(ex => ex.question_type);
    const hasMatchingType = questionTypes.includes(testCase.question_type);

    const passed = validStructure && hasRelevant;

    return {
      passed,
      skipped: false,
      count: similarExamples.length,
      topSimilarity: (topSimilarity * 100).toFixed(1) + '%',
      hasMatchingType,
      questionTypes: [...new Set(questionTypes)].join(', '),
      message: passed
        ? `Found ${similarExamples.length} relevant examples (top: ${(topSimilarity * 100).toFixed(1)}%)`
        : `Examples found but low relevance (top: ${(topSimilarity * 100).toFixed(1)}%)`,
      recommendation: !hasRelevant ? 'Add more diverse examples to database' : null
    };
  }

  checkImprovementQuality(response, testCase) {
    const improvementAnalysis = response.analysis.improvement_analysis || {};
    const improvements = improvementAnalysis.improvements || [];

    if (!testCase.should_have_improvements) {
      // Strong answers don't need many improvements
      return {
        passed: true,
        count: improvements.length,
        message: `Strong answer: ${improvements.length} improvements provided (expected few/none)`
      };
    }

    if (improvements.length === 0) {
      return {
        passed: false,
        count: 0,
        message: 'No improvements provided for weak answer',
        recommendation: 'Check ComparisonAnalyzer prompt'
      };
    }

    // Quality checks
    const qualityChecks = {
      hasSpecifics: 0,
      hasExamples: 0,
      hasActionable: 0,
      mentionsExpectedTopics: 0
    };

    for (const imp of improvements) {
      // Check 1: Contains numbers or company names
      if (/\d+/.test(imp) || /(Amazon|Google|Meta|Microsoft|Apple|TPM)/i.test(imp)) {
        qualityChecks.hasSpecifics++;
      }

      // Check 2: Contains examples or quotes
      if (/['""].*['""]|for example|such as/i.test(imp)) {
        qualityChecks.hasExamples++;
      }

      // Check 3: Has actionable language
      if (/Change|Replace|Add|Specify|Include|Remove|Instead of/i.test(imp)) {
        qualityChecks.hasActionable++;
      }

      // Check 4: Mentions expected improvement topics
      if (testCase.improvement_should_mention) {
        const mentionsTopics = testCase.improvement_should_mention.some(topic =>
          new RegExp(topic, 'i').test(imp)
        );
        if (mentionsTopics) {
          qualityChecks.mentionsExpectedTopics++;
        }
      }
    }

    // Calculate quality score
    const specificityRate = qualityChecks.hasSpecifics / improvements.length;
    const actionableRate = qualityChecks.hasActionable / improvements.length;
    const topicCoverage = testCase.improvement_should_mention 
      ? qualityChecks.mentionsExpectedTopics / testCase.improvement_should_mention.length
      : 1;

    // Pass criteria: At least 50% specific AND 50% actionable
    const passed = specificityRate >= 0.5 && actionableRate >= 0.5;

    return {
      passed,
      count: improvements.length,
      specificityRate: (specificityRate * 100).toFixed(0) + '%',
      actionableRate: (actionableRate * 100).toFixed(0) + '%',
      topicCoverage: (topicCoverage * 100).toFixed(0) + '%',
      examples: improvements.slice(0, 2).map(imp => imp.substring(0, 80) + '...'),
      message: passed
        ? `${improvements.length} improvements: ${(specificityRate * 100).toFixed(0)}% specific, ${(actionableRate * 100).toFixed(0)}% actionable`
        : `Improvements too generic: only ${(specificityRate * 100).toFixed(0)}% specific, ${(actionableRate * 100).toFixed(0)}% actionable`,
      recommendation: !passed ? 'Enhance ComparisonAnalyzer prompt with more specific examples' : null
    };
  }

  checkGapAnalysis(response, testCase) {
    const improvementAnalysis = response.analysis.improvement_analysis || {};
    const gaps = improvementAnalysis.gaps || {};

    const identifiedGaps = Object.entries(gaps)
      .filter(([key, value]) => value !== null && value.length > 0)
      .map(([key]) => key);

    const expectedGaps = testCase.expected_gap_components || [];
    
    if (expectedGaps.length === 0) {
      // Strong answer shouldn't have gaps
      return {
        passed: true,
        identified: identifiedGaps,
        message: `Gap analysis: ${identifiedGaps.length} gaps found (expected none for strong answer)`
      };
    }

    // Check if at least some expected gaps were identified
    const foundExpectedGaps = expectedGaps.filter(gap => identifiedGaps.includes(gap));
    const gapDetectionRate = foundExpectedGaps.length / expectedGaps.length;

    return {
      passed: gapDetectionRate >= 0.5, // At least 50% of expected gaps found
      identified: identifiedGaps,
      expected: expectedGaps,
      found: foundExpectedGaps,
      rate: (gapDetectionRate * 100).toFixed(0) + '%',
      message: `Identified ${identifiedGaps.length} gaps: ${identifiedGaps.join(', ') || 'none'}`,
      recommendation: gapDetectionRate < 0.5 ? 'Improve gap detection logic' : null
    };
  }

  checkResponseTime(responseTime) {
    const seconds = (responseTime / 1000).toFixed(1);
    const passed = responseTime <= 30000;

    return {
      passed,
      time: seconds + 's',
      message: passed
        ? `Response time ${seconds}s (under 30s limit)`
        : `Response time ${seconds}s exceeded 30s limit`
    };
  }

  printTestResult(result) {
    const statusIcon = result.passed ? '✅' : '❌';
    const statusColor = result.passed ? colors.green : colors.red;

    console.log(`  ${statusColor}${statusIcon} ${result.passed ? 'PASSED' : 'FAILED'}${colors.reset}`);

    if (result.error) {
      console.log(`  ${colors.red}Error: ${result.error}${colors.reset}`);
      return;
    }

    // Print check results
    for (const [checkName, check] of Object.entries(result.checks)) {
      if (check.skipped) {
        console.log(`  ${colors.yellow}⊘ ${checkName}: ${check.message}${colors.reset}`);
        continue;
      }

      const checkIcon = check.passed ? '✓' : '✗';
      const checkColor = check.passed ? colors.green : colors.yellow;
      console.log(`  ${checkColor}  ${checkIcon} ${checkName}: ${check.message}${colors.reset}`);

      // Show additional details for improvements
      if (checkName === 'improvements' && check.examples && check.examples.length > 0) {
        console.log(`${colors.blue}      Example: "${check.examples[0]}"${colors.reset}`);
      }

      // Show recommendations
      if (check.recommendation) {
        console.log(`${colors.yellow}      → ${check.recommendation}${colors.reset}`);
      }
    }
  }

  generateReport() {
    const passRate = (this.results.passed / this.results.total * 100).toFixed(1);
    const avgResponseTime = (this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length / 1000).toFixed(1);
    const overallPassed = passRate >= 80;

    console.log(`${colors.bold}${colors.cyan}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   EVALUATION RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`${colors.reset}\n`);

    console.log(`📊 Tests Run: ${this.results.total}`);
    console.log(`${colors.green}✅ Passed: ${this.results.passed}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${this.results.failed}${colors.reset}`);
    console.log(`📈 Pass Rate: ${passRate}% (need 80%)`);
    console.log(`⏱️  Avg Response Time: ${avgResponseTime}s\n`);

    // Feature-level results
    console.log(`${colors.bold}FEATURE QUALITY SCORES:${colors.reset}`);
    
    const scoringTotal = this.results.features.scoring.pass + this.results.features.scoring.fail;
    const scoringRate = (this.results.features.scoring.pass / scoringTotal * 100).toFixed(0);
    console.log(`  Score Accuracy:       ${this.results.features.scoring.pass}/${scoringTotal} (${scoringRate}%)`);
    
    const searchTotal = this.results.features.semanticSearch.pass + this.results.features.semanticSearch.fail;
    if (this.results.features.semanticSearch.skipped > 0) {
      console.log(`  Semantic Search:      Skipped (RAG not enabled)`);
    } else if (searchTotal > 0) {
      const searchRate = (this.results.features.semanticSearch.pass / searchTotal * 100).toFixed(0);
      console.log(`  Semantic Search:      ${this.results.features.semanticSearch.pass}/${searchTotal} (${searchRate}%)`);
    }
    
    const impTotal = this.results.features.improvements.pass + this.results.features.improvements.fail;
    const impRate = (this.results.features.improvements.pass / impTotal * 100).toFixed(0);
    console.log(`  Improvement Quality:  ${this.results.features.improvements.pass}/${impTotal} (${impRate}%)\n`);

    // Overall verdict
    console.log(`${colors.bold}${colors.cyan}`);
    console.log('═══════════════════════════════════════════════════════════════');
    if (overallPassed) {
      console.log(`${colors.green}   ✅ VERDICT: READY FOR PRODUCTION${colors.reset}`);
    } else {
      console.log(`${colors.red}   ❌ VERDICT: NOT READY - FIX ISSUES BEFORE DEPLOYING${colors.reset}`);
    }
    console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Recommendations
    if (!overallPassed) {
      console.log(`${colors.yellow}📋 PRIORITY FIXES:${colors.reset}\n`);
      
      const failedTests = this.results.tests.filter(t => !t.passed);
      const issues = {
        scoring: [],
        improvements: [],
        semanticSearch: []
      };

      for (const test of failedTests) {
        if (test.checks.score && !test.checks.score.passed) {
          issues.scoring.push(`Test ${test.id}: ${test.checks.score.message}`);
        }
        if (test.checks.improvements && !test.checks.improvements.passed) {
          issues.improvements.push(`Test ${test.id}: ${test.checks.improvements.message}`);
        }
        if (test.checks.semanticSearch && !test.checks.semanticSearch.passed && !test.checks.semanticSearch.skipped) {
          issues.semanticSearch.push(`Test ${test.id}: ${test.checks.semanticSearch.message}`);
        }
      }

      if (issues.scoring.length > 0) {
        console.log(`${colors.red}1. SCORE ACCURACY (${issues.scoring.length} issues)${colors.reset}`);
        issues.scoring.forEach(issue => console.log(`   • ${issue}`));
        console.log(`   ${colors.cyan}→ Fix: Adjust StarAgent.js scoring prompts${colors.reset}\n`);
      }

      if (issues.improvements.length > 0) {
        console.log(`${colors.red}2. IMPROVEMENT QUALITY (${issues.improvements.length} issues)${colors.reset}`);
        issues.improvements.forEach(issue => console.log(`   • ${issue}`));
        console.log(`   ${colors.cyan}→ Fix: Enhance ComparisonAnalyzer.js prompt with specific examples${colors.reset}\n`);
      }

      if (issues.semanticSearch.length > 0) {
        console.log(`${colors.red}3. SEMANTIC SEARCH (${issues.semanticSearch.length} issues)${colors.reset}`);
        issues.semanticSearch.forEach(issue => console.log(`   • ${issue}`));
        console.log(`   ${colors.cyan}→ Fix: Add more example answers to database${colors.reset}\n`);
      }
    }
  }
}

// Run evaluation
if (require.main === module) {
  const evaluator = new EnhancedEvaluator();
  evaluator.run().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = EnhancedEvaluator;