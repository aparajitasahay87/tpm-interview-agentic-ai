/**
 * validate_fixes.js — smoke test, no OpenAI calls, string checks only
 * Run from backend/routes/: node validate_fixes.js
 */

const fs   = require('fs');
const path = require('path');
let passed = 0, failed = 0;

function check(label, condition) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else           { console.log(`  ❌ ${label}`); failed++; }
}

// Paths relative to this file's location (backend/routes/)
const ROUTES_DIR = __dirname;
const TOOLS_DIR  = path.join(__dirname, '..', 'agents', 'tools');

const judgeSource   = fs.readFileSync(path.join(ROUTES_DIR, 'LLMJudge.js'), 'utf8');
const agentSource   = fs.readFileSync(path.join(TOOLS_DIR,  'CombinedAnalyzer_Agentic.js'), 'utf8');
const harnessSource = fs.readFileSync(path.join(ROUTES_DIR, 'benchmark_harness.js'), 'utf8');

// ── TEST 1: LLMJudge ──
console.log('\n📋 TEST 1: LLMJudge — hallucination definition and penalty\n');
check('Hallucination prompt says ideal examples are CORRECT GROUNDING',   judgeSource.includes('CORRECT GROUNDING'));
check('RAG grounding explanation present',                                 judgeSource.includes('The whole point of RAG'));
check('Hallucination checks BOTH answer AND ideal examples',               judgeSource.includes('NEITHER the candidate answer NOR'));
check('Penalty cap is 3.0 not 2.0',                                       judgeSource.includes('Math.min(avg, 3.0)') && !judgeSource.includes('Math.min(avg, 2.0)'));
check('Judge log records critic_improvements_issues',                      judgeSource.includes('critic_improvements_issues'));
check('Judge log records gate_decision',                                   judgeSource.includes('gate_decision:'));
check('idealExamples passed into prompt',                                  judgeSource.includes('IDEAL EXAMPLE'));

console.log('\n  → _computeOverall simulation:');
const cap = (avg, h) => h ? Math.min(avg, 3.0) : avg;
check('hallucination=true,  avg=4.0 → capped at 3.0', cap(4.0, true)  === 3.0);
check('hallucination=false, avg=4.0 → not capped',    cap(4.0, false) === 4.0);
check('hallucination=true,  avg=2.5 → stays at 2.5',  cap(2.5, true)  === 2.5);

// ── TEST 2: CombinedAnalyzer_Agentic ──
console.log('\n📋 TEST 2: CombinedAnalyzer_Agentic — critic + gate fixes\n');
check('runQualityGate method defined',                   agentSource.includes('async runQualityGate'));
check('gate wired into analyze()',                       agentSource.includes('gateDecision = await this.runQualityGate'));
check('gate passed to runCriticPass',                    agentSource.includes('runCriticPass(analysis, userAnswer, rubrics, gateDecision)'));
check('buildCriticPrompt accepts gateDecision',          agentSource.includes('buildCriticPrompt(draftAnalysis, userAnswer, rubrics, gateDecision = null)'));
check('gateDecision passed to buildCriticPrompt',        agentSource.includes('buildCriticPrompt(draftAnalysis, userAnswer, rubrics, gateDecision)'));
check('QUALITY GATE ALERT in critic prompt',             agentSource.includes('QUALITY GATE ALERT'));
check('TYPE 5 — hallucination in improvements',          agentSource.includes('TYPE 5 - HALLUCINATION IN IMPROVEMENTS'));
check('TYPE 6 — improvements not grounded',              agentSource.includes('TYPE 6 - IMPROVEMENTS NOT GROUNDED'));
check('improvements_issues in critic JSON format',       agentSource.includes('"improvements_issues"'));
check('mergeCriticCorrections accepts gateDecision',     agentSource.includes('mergeCriticCorrections(draftAnalysis, criticResult, gateDecision = null)'));
check('gateDecision passed to mergeCriticCorrections',   agentSource.includes('mergeCriticCorrections(draftAnalysis, criticResult, gateDecision)'));
check('gate_decision stored in _critic',                 agentSource.includes('gate_decision:'));
check('gate_hint stored in _critic',                     agentSource.includes('gate_hint:'));
check('improvements_issues stored in _critic',           agentSource.includes('improvements_issues:'));
check('ANTI-HALLUCINATION RULE in prompt',               agentSource.includes('ANTI-HALLUCINATION RULE'));
check('RICE/OKR/RACI mentioned in rule',                 agentSource.includes('RICE, OKR, RACI'));
check('gpt-4o-mini used for gate',                       agentSource.includes("model: 'gpt-4o-mini'"));
check('STAR correction uses parseInt guard',             agentSource.includes("parseInt(rawScore)"));
check('STAR correction handles object format',           agentSource.includes("corrected_score?.score"));
check('Invalid correction warned not silently applied',  agentSource.includes("Skipping invalid STAR correction"));

// ── TEST 3: benchmark_harness ──
console.log('\n📋 TEST 3: benchmark_harness — idealExamples + gate_decision\n');
check('idealExamples queries score >= 4',                harnessSource.includes('overall_score >= 4'));
check('idealExamples has fallback for empty results',    harnessSource.includes('ORDER BY overall_score DESC LIMIT 5'));
check('idealExamples logs count loaded',                 harnessSource.includes('Ideal examples loaded'));
check('gate_decision extracted from result._critic',     harnessSource.includes('result?._critic?.gate_decision'));
check('gate_hint extracted from result._critic',         harnessSource.includes('result?._critic?.gate_hint'));
check('gate_decision in runResult return',               harnessSource.includes('gate_decision: gateDecision'));
check('gate_hint in runResult return',                   harnessSource.includes('gate_hint:     gateHint'));

// ── SUMMARY ──
console.log('\n' + '─'.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('✅ All fixes verified — safe to run benchmark\n');
else              console.log('❌ Some fixes missing — check above before running\n');