/**
 * ============================================================
 * ANALYZER BENCHMARK HARNESS
 * ============================================================
 * Purpose: Run all 4 analyzer versions against the SAME input
 *          and measure Latency, Cost, Accuracy, Hallucination
 *
 * What stays the SAME across all runs:
 *   - userAnswer (fetched from Render DB - real answer)
 *   - categoryId
 *   - rubrics (fetched from Render DB - real rubrics)
 *   - SemanticSearch → Pinecone cloud
 *   - MetadataExtractor (same real dependency)
 *
 * What CHANGES per run:
 *   - The analyzer file (CombinedAnalyzer variant)
 *
 * Usage:
 *   node benchmark_harness.js
 *   node benchmark_harness.js --analyzer production   (run one only)
 *   node benchmark_harness.js --runs 5                (repeat N times)
 *   node benchmark_harness.js --category 2            (test specific category)
 * ============================================================
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ─── CONFIG ──────────────────────────────────────────────────
const args = process.argv.slice(2); // slice off node.exe and script path
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const RUNS_PER_ANALYZER = parseInt(getArg('--runs')) || 3;
const SINGLE_ANALYZER   = getArg('--analyzer') || null;

// GPT-4o pricing (update if OpenAI changes pricing)
// Per-model pricing — gate and critic use gpt-4o-mini (15x cheaper)
const PRICING = {
  input_per_1m:  2.50,   // GPT-4o  $ per 1M input tokens
  output_per_1m: 10.00   // GPT-4o  $ per 1M output tokens
};

// Per-model pricing map for accurate cost breakdown
const MODEL_PRICING = {
  'gpt-4o':            { input: 2.50,  output: 10.00 },
  'gpt-4o-2024-08-06': { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 }
};

function calculateCostForModel(model, usage) {
  if (!usage) return { input: 0, output: 0, total: 0, tokens: { input: 0, output: 0 } };
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o']; // default to 4o if unknown
  const inputCost  = (usage.prompt_tokens     / 1_000_000) * pricing.input;
  const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output;
  return {
    input:   parseFloat(inputCost.toFixed(6)),
    output:  parseFloat(outputCost.toFixed(6)),
    total:   parseFloat((inputCost + outputCost).toFixed(6)),
    tokens: {
      input:  usage.prompt_tokens,
      output: usage.completion_tokens
    }
  };
}

// ─── DB CONNECTION (Render PostgreSQL) ───────────────────────
// Reads DATABASE_URL from your .env — same connection your app uses
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Required for Render hosted DB
});

// ─── FETCH REAL TEST DATA FROM RENDER DB ─────────────────────
async function fetchTestInput(categoryId) {
  console.log(`\n📦 Fetching test data from Render DB (category ${categoryId})...`);

  // Fetch rubrics for this category
  // Uses same alias pattern your app uses (level_1_description AS level_1)
  const rubricsResult = await db.query(`
    SELECT
      id,
      category_id,
      competency_name,
      level_1_description AS level_1,
      level_3_description AS level_3,
      level_5_description AS level_5
    FROM rubrics
    WHERE category_id = $1
    ORDER BY id
  `, [categoryId]);

  if (rubricsResult.rows.length === 0) {
    throw new Error(`No rubrics found for category_id ${categoryId}. Check your DB.`);
  }

  // Fetch a real sample answer for this category to use as test input
  // Uses a real low-scoring answer so there is room for improvement feedback
  // Check what category_ids actually exist in sample_answers
  const categoryCheck = await db.query(`
    SELECT DISTINCT category_id, COUNT(*) as cnt
    FROM sample_answers
    GROUP BY category_id
    ORDER BY category_id
  `);
  console.log(`   📋 Available category_ids in sample_answers: ${categoryCheck.rows.map(r => `${r.category_id}(${r.cnt})`).join(', ')}`);

  // Use requested categoryId if it exists, otherwise fall back to first available
  const availableIds = categoryCheck.rows.map(r => parseInt(r.category_id));
  const resolvedCategoryId = availableIds.includes(categoryId) ? categoryId : availableIds[0];
  if (resolvedCategoryId !== categoryId) {
    console.log(`   ⚠️  category_id ${categoryId} not found in sample_answers — using ${resolvedCategoryId} instead`);
  }

  const sampleResult = await db.query(`
    SELECT
      s.id,
      s.answer_text,
      s.category_id,
      s.overall_score,
      s.level,
      s.company,
      q.question_text
    FROM sample_answers s
    JOIN questions q ON q.id = s.question_id
    WHERE s.category_id = $1
    ORDER BY s.overall_score ASC
    LIMIT 1
  `, [resolvedCategoryId]);

  // If no sample answer exists, use a realistic fallback
  const userAnswer = sampleResult.rows[0]?.answer_text || `
    I was working on a major infrastructure migration project at my company.
    We needed to migrate our monolithic backend to microservices. I led the effort
    by coordinating with multiple teams and setting up a project plan.
    We used agile methodology and had weekly syncs. The migration was completed
    and the system is now running on microservices. The team was happy with the outcome
    and we delivered on time.
  `;

  console.log(`   ✅ Rubrics loaded: ${rubricsResult.rows.length}`);
  console.log(`   ✅ Test answer: ${sampleResult.rows[0] ? `real DB answer (score: ${sampleResult.rows[0].overall_score}, level: ${sampleResult.rows[0].level}, company: ${sampleResult.rows[0].company})` : 'fallback answer'} (${userAnswer.length} chars)`);
  if (sampleResult.rows[0]?.question_text) {
    console.log(`   ✅ Question: "${sampleResult.rows[0].question_text.substring(0, 80)}..."`);
  }

  // Fetch high-scoring answers from sample_answers as ideal examples for the judge
  // These are the top-scoring answers in DB — same pool Pinecone retrieves from
  // Judge needs them to verify whether feedback is grounded in real examples
  const idealResult = await db.query(`
    SELECT
      s.id,
      s.answer_text,
      s.category_id,
      s.overall_score AS score,
      s.level,
      s.company
    FROM sample_answers s
    WHERE s.category_id = $1
    AND s.overall_score >= 4
    ORDER BY s.overall_score DESC
    LIMIT 5
  `, [resolvedCategoryId]);

  // Fallback: if no high-scoring answers, take top 5 regardless of score
  const idealExamples = idealResult.rows.length > 0
    ? idealResult.rows
    : (await db.query(`
        SELECT id, answer_text, category_id, overall_score AS score, level, company
        FROM sample_answers
        WHERE category_id = $1
        ORDER BY overall_score DESC LIMIT 5
      `, [resolvedCategoryId])).rows;

  console.log(`   ✅ Ideal examples loaded: ${idealExamples.length} (score >= 4, for judge grounding check)`);

  return {
    userAnswer,
    categoryId: resolvedCategoryId,
    rubrics:    rubricsResult.rows,
    idealExamples                     // real ideal examples passed to judge
  };
}

// ─── ANALYZER REGISTRY ───────────────────────────────────────
// Map each version to its file path and a label
// Update paths to match your actual project structure
// ⚠️  UPDATE THESE PATHS to match where your files actually live
// harness is in: backend/routes/benchmark_harness.js
// analyzers are in: backend/agents/tools/
const ANALYZERS = {
  '2_pass': {
    label:  '2-Pass (no critic, basic metadata)',
    path:   '../agents/tools/CombinedAnalyzer_ProductionOld',
    passes: 2
  },
  '3_pass': {
    label:  '3-Pass Production (critic + rich metadata)',
    path:   '../agents/tools/CombinedAnalyzer_Production',
    passes: 3
  },
  '4_step_agentic': {
    label:  '4-Step Agentic (quality gate + critic + model routing)',
    path:   '../agents/tools/CombinedAnalyzer_Agentic',
    passes: 4
  }
};

// ─── COST CALCULATOR ─────────────────────────────────────────
function calculateCost(usage) {
  if (!usage) return { input: 0, output: 0, total: 0, tokens: { input: 0, output: 0 } };
  const inputCost  = (usage.prompt_tokens     / 1_000_000) * PRICING.input_per_1m;
  const outputCost = (usage.completion_tokens / 1_000_000) * PRICING.output_per_1m;
  return {
    input:   parseFloat(inputCost.toFixed(6)),
    output:  parseFloat(outputCost.toFixed(6)),
    total:   parseFloat((inputCost + outputCost).toFixed(6)),
    tokens: {
      input:  usage.prompt_tokens,
      output: usage.completion_tokens
    }
  };
}

// ─── ACCURACY EVALUATOR ──────────────────────────────────────
// Rule-based checks. Each check = 1 point. Max = 7.
// No LLM call needed — deterministic and free.
function evalAccuracy(result) {
  if (!result) return { score: 0, total: 7, checks: {}, pct: 0 };

  const resultStr = JSON.stringify(result);

  const checks = {
    // STAR structure is present and scored
    star_scores_valid: (
      result.star &&
      ['situation','task','action','result'].every(k =>
        result.star[k]?.score >= 1 && result.star[k]?.score <= 5
      )
    ),

    // At least 2 improvements generated
    has_improvements: Array.isArray(result.improvements) && result.improvements.length >= 2,

    // Improvements have actual rewritten text (not just a label)
    improvements_have_rewrites: (
      Array.isArray(result.improvements) &&
      result.improvements.some(i => (i.rewritten_text || i.improved_text || '').length > 40)
    ),

    // No generic filler phrases (sign of lazy output)
    no_generic_phrases: ![
      'add more details',
      'be more specific',
      'include metrics',
      'consider adding'
    ].some(phrase => resultStr.toLowerCase().includes(phrase)),

    // References ideal examples explicitly
    references_examples: resultStr.includes('Example') || resultStr.includes('ideal_example'),

    // Improvements contain actual numbers or metrics
    has_metrics_in_output: /\d+%|\$\d+|\d+x|\d+ team|\d+ engineers/.test(resultStr),

    // Competencies are scored
    competencies_scored: (
      result.competencies &&
      Object.keys(result.competencies).length >= 2 &&
      Object.values(result.competencies).every(v => typeof v === 'number')
    )
  };

  const score = Object.values(checks).filter(Boolean).length;
  return {
    score,
    total: 7,
    pct:   Math.round((score / 7) * 100),
    checks
  };
}

// ─── HALLUCINATION DETECTOR ──────────────────────────────────
// Checks if critic pass caught and corrected anything.
// If critic pass doesn't exist in this version, returns null.
function evalHallucination(result) {
  // Production version logs critic corrections on result
  if (result?._critic) {
    return {
      corrections_made: result._critic.corrections_made?.length || 0,
      flagged:          result._critic.corrections_made?.length > 0
    };
  }
  return { corrections_made: null, flagged: null, note: 'No critic pass in this version' };
}

// ─── PATCH: Intercept OpenAI calls to capture token usage ────
// We monkey-patch the analyzer's openai instance AFTER construction
// so we can capture usage without modifying the source files.
function patchAnalyzerForMetrics(analyzer) {
  const usageLog = [];
  const originalCreate = analyzer.openai.chat.completions.create.bind(analyzer.openai.chat.completions);

  analyzer.openai.chat.completions.create = async (params) => {
    const response = await originalCreate(params);
    if (response.usage) {
      const modelName = response.model || params.model || 'gpt-4o';
      usageLog.push({
        model:  modelName,
        usage:  response.usage,
        cost:   calculateCostForModel(modelName, response.usage)  // accurate per-model cost
      });
    }
    return response;
  };

  return usageLog;  // caller holds reference, gets populated after calls
}

// ─── RUN ONE ANALYZER ────────────────────────────────────────
async function runAnalyzer(key, config, runNumber, TEST_INPUT) {
  console.log(`\n  Run ${runNumber}/${RUNS_PER_ANALYZER}...`);

  let AnalyzerClass;
  try {
    AnalyzerClass = require(config.path);
  } catch (e) {
    return { error: `Cannot load module at ${config.path}: ${e.message}` };
  }

  const analyzer = new AnalyzerClass();
  const usageLog = patchAnalyzerForMetrics(analyzer);

  const start = Date.now();
  let result, error;

  try {
    result = await analyzer.analyze(
      TEST_INPUT.userAnswer,
      TEST_INPUT.categoryId,
      TEST_INPUT.rubrics
    );
  } catch (e) {
    error = e.message;
  }

  const latencyMs = Date.now() - start;

  // Aggregate token usage across all LLM calls made by this analyzer
  const totalCost = usageLog.reduce((acc, u) => ({
    input:  acc.input  + u.cost.input,
    output: acc.output + u.cost.output,
    total:  acc.total  + u.cost.total,
    tokens: {
      input:  acc.tokens.input  + u.cost.tokens.input,
      output: acc.tokens.output + u.cost.tokens.output
    }
  }), { input: 0, output: 0, total: 0, tokens: { input: 0, output: 0 } });

  const accuracy      = evalAccuracy(result);
  const hallucination = evalHallucination(result);

  // ── LLM Judge — quality evaluation ──
  let judgeResult = null;
  if (result && !error) {
    try {
      const LLMJudge = require('./LLMJudge');
      const judge = new LLMJudge();
      judgeResult = await judge.evaluate(
        TEST_INPUT.userAnswer,
        TEST_INPUT.idealExamples || [],  // passed from fetchTestInput
        result,
        key
      );
    } catch (e) {
      console.error(`   ⚠️  Judge error: ${e.message}`);
    }
  }

  // Extract gate decision from result._critic (populated by 4-step agentic only)
  const gateDecision = result?._critic?.gate_decision || null;
  const gateHint     = result?._critic?.gate_hint     || null;

  return {
    run:          runNumber,
    latency_ms:   latencyMs,
    latency_s:    (latencyMs / 1000).toFixed(2),
    cost:         totalCost,
    llm_calls:    usageLog.length,
    gate_decision: gateDecision,
    gate_hint:     gateHint,
    accuracy,
    hallucination,
    judge:        judgeResult,
    error:        error || null
  };
}

// ─── AGGREGATE RUNS ──────────────────────────────────────────
function aggregate(runs) {
  const valid = runs.filter(r => !r.error);
  if (valid.length === 0) return { error: 'All runs failed' };

  const latencies  = valid.map(r => r.latency_ms).sort((a,b) => a-b);
  const costs      = valid.map(r => r.cost.total);
  const accuracies = valid.map(r => r.accuracy.pct);

  const avg = arr => arr.reduce((a,b) => a+b, 0) / arr.length;
  const p   = (arr, pct) => arr[Math.floor(arr.length * pct / 100)] ?? arr[arr.length-1];

  const judgeScores = valid
    .map(r => r.judge?.overall)
    .filter(s => s !== null && s !== undefined);

  const judgeAvg = judgeScores.length > 0
    ? parseFloat((judgeScores.reduce((a,b) => a+b, 0) / judgeScores.length).toFixed(2))
    : null;

  const hallucinations = valid
    .map(r => r.judge?.hallucination)
    .filter(h => h !== null && h !== undefined);

  const hallucinationRate = hallucinations.length > 0
    ? `${hallucinations.filter(Boolean).length}/${hallucinations.length} runs`
    : 'N/A';

  const dimAvg = (dim) => {
    const scores = valid.map(r => r.judge?.[dim]).filter(s => s != null);
    return scores.length > 0 ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(2)) : null;
  };

  return {
    runs_completed: valid.length,
    latency: {
      avg_ms: Math.round(avg(latencies)),
      p50_ms: p(latencies, 50),
      p90_ms: p(latencies, 90),
      avg_s:  (avg(latencies) / 1000).toFixed(2)
    },
    cost: {
      avg_per_analysis:       parseFloat(avg(costs).toFixed(6)),
      total_for_runs:         parseFloat(costs.reduce((a,b)=>a+b,0).toFixed(6)),
      projected_100_analyses: parseFloat((avg(costs) * 100).toFixed(4))
    },
    accuracy: {
      avg_pct:   Math.round(avg(accuracies)),
      avg_score: `${Math.round(avg(valid.map(r => r.accuracy.score)))}/7`
    },
    judge: {
      avg_overall:        judgeAvg,
      hallucination_rate: hallucinationRate,
      dimensions: {
        specificity:       dimAvg('specificity'),
        actionability:     dimAvg('actionability'),
        gap_analysis:      dimAvg('gap_analysis'),
        grounding:         dimAvg('grounding')
      }
    },
    llm_calls_per_run: valid[0]?.llm_calls ?? 'unknown',
    gate_summary: (() => {
      // Only meaningful for 4-step agentic runs
      const gateCalls = valid.filter(r => r.gate_decision);
      if (gateCalls.length === 0) return null;
      const proceed      = gateCalls.filter(r => r.gate_decision === 'PROCEED').length;
      const needsContext = gateCalls.filter(r => r.gate_decision === 'NEEDS_CONTEXT').length;
      return `${proceed}P/${needsContext}NC`;  // e.g. "2P/1NC" = 2 PROCEED, 1 NEEDS_CONTEXT
    })(),
    hallucination:     valid[0]?.hallucination ?? null
  };
}

// ─── PRINT SUMMARY TABLE ─────────────────────────────────────
function printSummary(results) {
  console.log('\n');
  console.log('═'.repeat(100));
  console.log('  BENCHMARK RESULTS SUMMARY');
  console.log('═'.repeat(100));
  console.log(
    '  Version'.padEnd(28) +
    'LLM Calls'.padEnd(12) +
    'Avg Latency'.padEnd(14) +
    'Cost/Analysis'.padEnd(16) +
    'Structural'.padEnd(12) +
    'Judge Score'.padEnd(14) +
    'Hallucination'
  );
  console.log('─'.repeat(100));

  for (const [key, data] of Object.entries(results)) {
    if (data.error || !data.aggregate || data.aggregate.error) {
      console.log(`  ${key.padEnd(26)} ALL RUNS FAILED — check module path`);
      continue;
    }
    const agg = data.aggregate;
    console.log(
      `  ${key.padEnd(26)}` +
      `${agg.llm_calls_per_run}`.padEnd(12) +
      `${agg.latency.avg_s}s`.padEnd(14) +
      `$${agg.cost.avg_per_analysis}`.padEnd(16) +
      `${agg.accuracy.avg_pct}%`.padEnd(12) +
      `${agg.judge?.avg_overall ?? 'N/A'}/5`.padEnd(14) +
      `${agg.gate_summary ?? 'N/A'}`.padEnd(16) +
      `${agg.judge?.hallucination_rate ?? 'N/A'}`
    );
  }

  console.log('═'.repeat(100));

  // Judge dimension breakdown
  console.log('\n  📊 Judge Quality Dimensions (avg across runs):');
  console.log(
    '  Version'.padEnd(28) +
    'Specificity'.padEnd(14) +
    'Actionability'.padEnd(16) +
    'Accuracy'.padEnd(12) +
    'Grounding'
  );
  console.log('─'.repeat(80));
  for (const [key, data] of Object.entries(results)) {
    if (!data.error && data.aggregate && !data.aggregate.error && data.aggregate.judge) {
      const d = data.aggregate.judge.dimensions;
      console.log(
        `  ${key.padEnd(26)}` +
        `${d.specificity ?? 'N/A'}/5`.padEnd(14) +
        `${d.actionability ?? 'N/A'}/5`.padEnd(16) +
        `${d.accuracy ?? 'N/A'}/5`.padEnd(12) +
        `${d.grounding ?? 'N/A'}/5`
      );
    }
  }

  console.log('\n  💰 Projected cost at 100 analyses/day:');
  for (const [key, data] of Object.entries(results)) {
    if (!data.error && data.aggregate && !data.aggregate.error) {
      console.log(`     ${key.padEnd(26)} $${data.aggregate.cost.projected_100_analyses}/day`);
    }
  }
  console.log('\n');
}

// ─── ENSURE BENCHMARK TABLE EXISTS ──────────────────────────
// Creates benchmark_results table if it doesn't exist yet
// Safe to run every time — uses IF NOT EXISTS
async function ensureBenchmarkTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS benchmark_results (
      id                    SERIAL PRIMARY KEY,
      run_at                TIMESTAMP DEFAULT NOW(),
      analyzer_version      VARCHAR(20),
      run_number            INT,
      latency_ms            INT,
      latency_s             NUMERIC(8,2),
      cost_usd              NUMERIC(10,6),
      cost_input_usd        NUMERIC(10,6),
      cost_output_usd       NUMERIC(10,6),
      tokens_input          INT,
      tokens_output         INT,
      llm_calls             INT,
      structural_acc_pct    INT,
      structural_acc_score  VARCHAR(10),
      judge_overall         NUMERIC(4,2),
      judge_specificity     NUMERIC(4,2),
      judge_actionability   NUMERIC(4,2),
      judge_accuracy        NUMERIC(4,2),
      judge_grounding       NUMERIC(4,2),
      judge_hallucination   BOOLEAN,
      critic_corrections    INT,
      cache_hit_rate        NUMERIC(5,2),
      test_category         INT,
      harness_version       VARCHAR(20) DEFAULT 'v2'
    )
  `);
  console.log('   ✅ benchmark_results table ready');
}

// ─── SAVE SINGLE RUN TO DB ───────────────────────────────────
// Called after every individual run — not just the aggregate
// This gives Tableau row-level data to slice by run, version, time
async function saveRunResult(key, runNumber, runResult, categoryId) {
  if (runResult.error) return; // don't save failed runs

  try {
    await db.query(`
      INSERT INTO benchmark_results (
        analyzer_version, run_number,
        latency_ms, latency_s,
        cost_usd, cost_input_usd, cost_output_usd,
        tokens_input, tokens_output,
        llm_calls,
        structural_acc_pct, structural_acc_score,
        judge_overall, judge_specificity, judge_actionability,
        judge_accuracy, judge_grounding, judge_hallucination,
        critic_corrections,
        test_category
      ) VALUES (
        $1, $2,
        $3, $4,
        $5, $6, $7,
        $8, $9,
        $10,
        $11, $12,
        $13, $14, $15,
        $16, $17, $18,
        $19,
        $20
      )
    `, [
      key,                                          // analyzer_version
      runNumber,                                    // run_number
      runResult.latency_ms,                         // latency_ms
      parseFloat(runResult.latency_s),              // latency_s
      runResult.cost.total,                         // cost_usd
      runResult.cost.input,                         // cost_input_usd
      runResult.cost.output,                        // cost_output_usd
      runResult.cost.tokens?.input ?? 0,            // tokens_input
      runResult.cost.tokens?.output ?? 0,           // tokens_output
      runResult.llm_calls,                          // llm_calls
      runResult.accuracy.pct,                       // structural_acc_pct
      runResult.accuracy.score,                     // structural_acc_score
      runResult.judge?.overall ?? null,             // judge_overall
      runResult.judge?.specificity ?? null,         // judge_specificity
      runResult.judge?.actionability ?? null,       // judge_actionability
      runResult.judge?.accuracy ?? null,            // judge_accuracy
      runResult.judge?.grounding ?? null,   // judge_grounding
      runResult.judge?.hallucination ?? null,       // judge_hallucination
      runResult.hallucination?.corrections_made?.length ?? 0, // critic_corrections
      categoryId                                    // test_category
    ]);

    console.log(`   💾 Run ${runNumber} saved to benchmark_results`);
  } catch (e) {
    // Non-fatal — log warning but don't stop the benchmark
    console.warn(`   ⚠️  Could not save run ${runNumber} to DB: ${e.message}`);
  }
}

// ─── SAVE AGGREGATE SUMMARY TO JSON + CSV ───────────────────
// After all runs complete, also write a CSV for direct Tableau import
// This gives you two paths: DB connection OR CSV file drag-and-drop
function saveCSV(allResults) {
  const headers = [
    'run_at', 'analyzer_version', 'run_number',
    'latency_ms', 'latency_s', 'cost_usd',
    'tokens_input', 'tokens_output', 'llm_calls',
    'structural_acc_pct',
    'judge_overall', 'judge_specificity', 'judge_actionability',
    'judge_accuracy', 'judge_grounding', 'judge_hallucination',
    'critic_corrections',
    'gate_decision', 'gate_hint'
  ];

  const rows = [headers.join(',')];
  const now = new Date().toISOString();

  for (const [key, data] of Object.entries(allResults)) {
    for (const run of data.runs) {
      if (run.error) continue;
      rows.push([
        now,
        key,
        run.run,
        run.latency_ms,
        run.latency_s,
        run.cost.total,
        run.cost.tokens?.input ?? 0,
        run.cost.tokens?.output ?? 0,
        run.llm_calls,
        run.accuracy.pct,
        run.judge?.overall ?? '',
        run.judge?.specificity ?? '',
        run.judge?.actionability ?? '',
        run.judge?.accuracy ?? '',
        run.judge?.grounding ?? '',
        run.judge?.hallucination ?? '',
        run.hallucination?.corrections_made?.length ?? 0,
        run.gate_decision || '',
        (run.gate_hint || '').replace(/,/g, ';')  // escape commas in hint text
      ].join(','));
    }
  }

  const csvFile = `benchmark_results_${Date.now()}.csv`;
  fs.writeFileSync(csvFile, rows.join('\n'));
  console.log(`📊 CSV for Tableau saved: ${csvFile}`);
  console.log('   → Open Tableau → Connect → Text File → select this CSV');
  return csvFile;
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('🚀 TPM Analyzer Benchmark Harness');
  console.log('   DB:      Render PostgreSQL (DATABASE_URL from .env)');
  console.log('   Vectors: Pinecone cloud (PINECONE_API_KEY from .env)');
  console.log(`   Runs per analyzer: ${RUNS_PER_ANALYZER}`);

  // ── Validate .env has required keys ──
  const required = ['DATABASE_URL', 'OPENAI_API_KEY', 'PINECONE_INDEX_NAME'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\n❌ Missing required .env keys: ${missing.join(', ')}`);
    console.error('   Make sure your .env is at project root and has all keys.');
    process.exit(1);
  }

  // ── Ensure benchmark_results table exists ──
  console.log('\n📋 Ensuring benchmark_results table...');
  try {
    await ensureBenchmarkTable();
  } catch (e) {
    console.warn(`   ⚠️  Could not create table: ${e.message} — results won't be saved to DB`);
  }

  // ── Determine which category to test ──
  const categoryId = parseInt(getArg('--category')) || 1;

  // ── Fetch real test data from Render DB ONCE ──
  // Same rubrics + same answer passed to every analyzer
  let TEST_INPUT;
  try {
    TEST_INPUT = await fetchTestInput(categoryId);
  } catch (e) {
    console.error(`\n❌ Failed to fetch test data from DB: ${e.message}`);
    console.error('   Is your DATABASE_URL correct and Render DB accessible?');
    await db.end();
    process.exit(1);
  }

  // ── Validate analyzers ──
  if (SINGLE_ANALYZER && !ANALYZERS[SINGLE_ANALYZER]) {
    console.error(`\n❌ Unknown analyzer: ${SINGLE_ANALYZER}`);
    console.log(`   Valid options: ${Object.keys(ANALYZERS).join(', ')}`);
    await db.end();
    process.exit(1);
  }

  const analyzersToRun = SINGLE_ANALYZER
    ? { [SINGLE_ANALYZER]: ANALYZERS[SINGLE_ANALYZER] }
    : ANALYZERS;

  const allResults = {};

  for (const [key, config] of Object.entries(analyzersToRun)) {
    console.log(`\n🔬 Testing: ${config.label}`);
    console.log('─'.repeat(60));

    const runs = [];
    for (let i = 1; i <= RUNS_PER_ANALYZER; i++) {
      const runResult = await runAnalyzer(key, config, i, TEST_INPUT);
      runs.push(runResult);

      if (!runResult.error) {
        console.log(
          `     ✅ Run ${i}: ${runResult.latency_s}s | ` +
          `$${runResult.cost.total.toFixed(6)} | ` +
          `Structural: ${runResult.accuracy.pct}% | ` +
          `Judge: ${runResult.judge?.overall ?? 'N/A'}/5 | ` +
          `LLM calls: ${runResult.llm_calls}` +
          (runResult.gate_decision ? ` | Gate: ${runResult.gate_decision}` : '')
        );
        // Save individual run to DB for Tableau
        await saveRunResult(key, i, runResult, categoryId);
      } else {
        console.log(`     ❌ Run ${i}: FAILED — ${runResult.error}`);
      }

      // Delay between runs — avoids rate limits on OpenAI
      if (i < RUNS_PER_ANALYZER) await new Promise(r => setTimeout(r, 2000));
    }

    allResults[key] = {
      config,
      runs,
      aggregate: aggregate(runs)
    };
  }

  // ── Close DB connection ──
  await db.end();

  // ── Print summary table ──
  printSummary(allResults);

  // ── Save full results to JSON ──
  const outputFile = `benchmark_results_${Date.now()}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
  console.log(`💾 Full results saved to: ${outputFile}`);
  console.log('   Use this data to fill in your blog comparison table.\n');

  // ── Save CSV for Tableau drag-and-drop import ──
  saveCSV(allResults);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await db.end();
  process.exit(1);
});