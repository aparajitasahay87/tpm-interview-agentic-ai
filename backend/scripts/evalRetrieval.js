/**
 * evalRetrieval.js — Retrieval Accuracy Eval
 *
 * Measures the accuracy of the hybrid retrieval pipeline (Option 4).
 * Based on Andrew Ng's systematic eval approach:
 *   1. Golden test set — manually labeled correct example IDs per question
 *   2. Run pipeline against it — Stage 1 (top 10) + Stage 2 (reranker top 2)
 *   3. Measure Recall@10, Precision@2, Reranker Accuracy per question
 *   4. Iterate — run after every change to measure improvement
 *
 * Usage:
 *   node scripts/evalRetrieval.js
 *
 * Metrics:
 *   Recall@10         — did the right example make it into the top 10 candidates?
 *                       Failure = retrieval problem (embeddings or filter)
 *   Precision@2       — of the final 2 returned, how many were correct?
 *                       Failure = reranker problem (tool description or comp scores)
 *   Reranker Accuracy — did the best correct example end up at position 1?
 *                       Failure = reranker ranking problem
 *
 * Target benchmarks:
 *   Recall@10         : 95%+
 *   Precision@2       : 85%+
 *   Reranker Accuracy : 90%+
 *
 * Golden set built from real sample_answers IDs.
 * correct_example_ids = sample IDs that directly answer the question.
 * wrong_example_ids   = sample IDs that are semantically close but wrong domain
 *                       (the exact failure mode we are fixing with Option 4).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const SemanticSearch   = require('../agents/tools/SemanticSearch');
const CombinedAnalyzer = require('../agents/tools/CombinedAnalyzer_Agentic');
//const { getCacheService } = require('../backend/rvices/CacheService');
const db               = require('../config/database');

// ─── Golden Test Set ──────────────────────────────────────────────────────────
// 20 questions — 4 per category — covering all 5 categories.
// Each correct_example_ids contains the sample_answers.id values that
// directly answer that question. wrong_example_ids are known false positives.
const GOLDEN_SET = [

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1 — Program Sense (category_id: 1)
  // ══════════════════════════════════════════════════════════════════════════

   {
    // THE BUG QUESTION — triggered Option 4
    // DR question must NOT return cloud migration answers
   
    question_id:         319,
    category_id:         1,
    candidate_level:     'Senior',
    question_text:       'Google needs to perform a disaster recovery exercise to test operation readiness in the event of major failures.',
    candidate_answer:    'I would start by defining RTO and RPO targets with engineering and business stakeholders. Then establish automated failover across regions, set up monitoring and alerting thresholds, run quarterly DR drills with the on-call team, maintain a living runbook, and track MTTR after each drill to improve response time incrementally.',
    correct_example_ids: [55, 56],   // both DR answers (Senior Meta + Staff Google)
    wrong_example_ids:   [11, 51, 52], // cloud migration answers — wrong domain
    notes:               'Core bug: was returning cloud migration instead of DR examples'
  },

  {
    // Cloud migration — inverse of Q319. Confirms domain separation works both ways.
    question_id:         317,
    category_id:         1,
    candidate_level:     'Staff',
    question_text:       'How would you lead a project to migrate from one cloud provider to another?',
    candidate_answer:    'I would start with a full dependency audit of current infrastructure, build a phased migration plan with parallel environments, define rollback criteria at each phase, establish a war room for cutover weekend, and track migration progress with daily stakeholder updates until stable.',
    correct_example_ids: [11, 51, 52,65,66], // all three cloud migration answers
    wrong_example_ids:   [55, 56],     // DR answers — wrong domain
    notes:               'Inverse domain test — migration should NOT return DR examples'
  }
  ,

  {
    // 25% complete project — level filter test (Senior should see Senior + Staff ±1)
    question_id:         318,
    category_id:         1,
    candidate_level:     'Senior',
    question_text:       "Let's say you join a project which is only 25% complete and has used 85% of resources, what would be your next steps?",
    candidate_answer:    'First I would do a rapid assessment of remaining scope vs resources, identify the critical path, have honest conversations with stakeholders about the gap, propose either descoping or requesting additional resources with a clear trade-off analysis, and establish a recovery plan with weekly milestone gates.',
    correct_example_ids: [12, 53, 54], // all three 25%-resource answers
    wrong_example_ids:   [],
    notes:               'Level filter test — Senior candidate should see all three (12=Senior, 53=Senior, 54=Staff ±1)'
  },

  {
    // Disaster recovery — Staff level — confirms same domain at different seniority
    question_id:         319,
    category_id:         1,
    candidate_level:     'Staff',
    question_text:       'Google needs to perform a disaster recovery exercise to test operation readiness in the event of major failures.',
    candidate_answer:    'As Staff TPM I would own the end-to-end DR strategy — define RTO/RPO with SRE and business, build a multi-region failover architecture, run game day exercises quarterly, establish a DR scorecard tracked at the VP level, and drive continuous improvement based on drill postmortems.',
    correct_example_ids: [55, 56],     // DR answers — Staff should see Senior ±1 too
    wrong_example_ids:   [11, 51, 52], // cloud migration — wrong domain
    notes:               'Same DR domain but Staff level — confirms level ±1 filter includes Senior'
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2 — System Design (category_id: 2)
  // ══════════════════════════════════════════════════════════════════════════

  {
    question_id:         null, // add real question ID from questions table
    category_id:         2,
    candidate_level:     'Senior',
    question_text:       'Design a photo sharing system for a travel application.',
    candidate_answer:    'I would design a CDN-backed photo storage system with S3 for originals and CloudFront for delivery. Use image compression on upload, lazy loading on the client, and geo-distributed caching for APAC users. Define SLA of sub-2-second load time and monitor with Datadog dashboards.',
    correct_example_ids: [13, 75, 76], // all photo sharing answers
    wrong_example_ids:   [85, 86],     // URL shortener — wrong system design domain
    notes:               'Photo sharing system — should not return URL shortener or hash table answers'
  },

  {
    question_id:         null,
    category_id:         2,
    candidate_level:     'Staff',
    question_text:       'Explain how you would implement a distributed hash table.',
    candidate_answer:    'I would use consistent hashing with virtual nodes to distribute keys, implement a gossip protocol for node discovery, use replication factor 3 for fault tolerance, and design for eventual consistency with vector clocks for conflict resolution.',
    correct_example_ids: [87, 88],     // distributed hash table answers
    wrong_example_ids:   [75, 76],     // photo sharing — wrong domain
    notes:               'Distributed systems domain — should not return photo sharing answers'
  },

  {
    question_id:         null,
    category_id:         2,
    candidate_level:     'Senior',
    question_text:       'Working with developers to discuss feature tradeoffs - How would you lead this meeting and technical discussion?',
    candidate_answer:    'I would prepare a trade-off matrix in advance covering latency, cost, complexity, and maintainability for each option. Facilitate the meeting by ensuring all engineers have equal voice, document decisions and rationale in real-time, and follow up with a decision record that includes the options considered.',
    correct_example_ids: [89, 90],     // feature tradeoffs meeting answers
    wrong_example_ids:   [],
    notes:               'Technical discussion facilitation — process-focused not architecture-focused'
  },

  {
    question_id:         null,
    category_id:         2,
    candidate_level:     'Staff',
    question_text:       'How would you design an API gateway for a high-traffic e-commerce platform?',
    candidate_answer:    'I would design a rate-limited API gateway with circuit breakers, JWT authentication, request routing by service version, and async processing for non-critical paths. Use Redis for token caching, implement retry with exponential backoff, and target 99.99% uptime with blue-green deployments.',
    correct_example_ids: [14],         // API gateway answer
    wrong_example_ids:   [85, 86],     // URL shortener — different system type
    notes:               'API gateway — high traffic systems domain'
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3 — Behavioral (category_id: 3)
  // ══════════════════════════════════════════════════════════════════════════

  {
    question_id:         null,
    category_id:         3,
    candidate_level:     'Senior',
    question_text:       'Tell me about a time you took a big risk and it failed. What did you learn?',
    candidate_answer:    'I approved an expedited release of a critical security patch without completing the full regression test suite to meet a client deadline. The patch introduced a memory leak that degraded performance for 20% of users over the following week. I learned to never skip regression for production releases regardless of deadline pressure.',
    correct_example_ids: [15, 21, 22], // all big risk failed answers
    wrong_example_ids:   [45, 46],     // failed and learned — similar but different framing
    notes:               'Risk + failure — different from general failure questions'
  },

  {
    question_id:         null,
    category_id:         3,
    candidate_level:     'Staff',
    question_text:       'Tell me about a time you strongly disagreed with your manager on something you deemed very important to the business.',
    candidate_answer:    'My manager wanted to cut the security review phase to hit a launch date. I disagreed strongly because we were handling financial data. I prepared a risk analysis showing potential regulatory exposure, presented it to my manager and their director, and ultimately we agreed on a 2-week compressed security review that satisfied both the deadline and compliance.',
    correct_example_ids: [29, 30],     // disagreed with manager answers
    wrong_example_ids:   [33, 34],     // lost the argument — different outcome framing
    notes:               'Manager disagreement — different from peer disagreement or losing argument'
  },

  {
    question_id:         null,
    category_id:         3,
    candidate_level:     'Senior',
    question_text:       'Describe a situation where you experienced resourcing constraints. How did you handle it?',
    candidate_answer:    'Our team of 8 was asked to deliver a 6-month project in 3 months after two engineers left. I immediately mapped the critical path, deprioritized 40% of scope with stakeholder buy-in, negotiated a 2-engineer loan from a sister team for 6 weeks, and delivered the core functionality on time.',
    correct_example_ids: [41, 42],     // resourcing constraints answers
    wrong_example_ids:   [37, 38],     // not enough resources creative — similar but different angle
    notes:               'Resourcing constraints — structured response vs creative workaround'
  },

  {
    question_id:         null,
    category_id:         3,
    candidate_level:     'Staff',
    question_text:       'Describe a time when you disagreed with a colleague and your initial stance was not clearly correct.',
    candidate_answer:    'I disagreed with a peer engineer about using a microservices vs monolith architecture. I was strongly pro-microservices based on scalability. After a structured technical review I realized the team size and deployment complexity made monolith the better choice for the next 18 months. I publicly acknowledged the better argument and updated my recommendation.',
    correct_example_ids: [49, 50],     // disagreed with colleague answers
    wrong_example_ids:   [29, 30],     // disagreed with manager — different relationship
    notes:               'Peer disagreement where candidate was wrong — requires intellectual humility signal'
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4 — Technical (category_id: 4)
  // ══════════════════════════════════════════════════════════════════════════

  {
    question_id:         null,
    category_id:         4,
    candidate_level:     'Senior',
    question_text:       'You identify a new bug 2 days before the release of your new product feature. What do you do?',
    candidate_answer:    'I would immediately assess severity and blast radius. If it affects core functionality or data integrity I would recommend delaying release. I would convene a war room with eng lead and PM, define a fix timeline, and communicate status to stakeholders every 4 hours. If fixable in 24h with test coverage we proceed. Otherwise we delay with a clear customer communication plan.',
    correct_example_ids: [91, 92],     // bug 2 days before release answers
    wrong_example_ids:   [93, 94],     // broke deployment pipeline — different trigger
    notes:               'Pre-release bug — proactive discovery vs reactive pipeline break'
  },

  {
    question_id:         null,
    category_id:         4,
    candidate_level:     'Staff',
    question_text:       'During a recent product update you break something in the deployment pipeline. What do you do?',
    candidate_answer:    'First I would trigger rollback immediately to restore service. Then I would do a blameless postmortem to identify root cause, add a regression test to prevent recurrence, update the deployment runbook, and communicate the incident timeline and resolution to stakeholders within the hour.',
    correct_example_ids: [93, 94],     // broke deployment pipeline answers
    wrong_example_ids:   [91, 92],     // bug before release — different scenario
    notes:               'Reactive pipeline break — rollback first vs pre-release assessment'
  },

  {
    question_id:         null,
    category_id:         4,
    candidate_level:     'Senior',
    question_text:       'Describe a complex technical problem you solved that was blocking a program.',
    candidate_answer:    'Our primary database was hitting 95% CPU during peak traffic causing 2-second latency spikes. I led a war room with 3 DBAs and 2 senior engineers, identified the root cause as missing composite indexes on a high-frequency query, implemented the fix in 4 hours, and reduced latency to 200ms. We then added query performance monitoring to prevent recurrence.',
    correct_example_ids: [17],         // complex technical problem answer
    wrong_example_ids:   [18],         // technical trade-off — different problem type
    notes:               'Technical problem solving — debugging and fixing vs trade-off analysis'
  },

  {
    question_id:         null,
    category_id:         4,
    candidate_level:     'Staff',
    question_text:       'Describe a technical program you ran. What technical gaps did you identify and how did you manage them?',
    candidate_answer:    'I led a microservices decomposition program for a monolithic payments system. I identified 4 technical gaps: no distributed tracing, no circuit breakers, no service mesh, and no canary deployment capability. I built a gap closure roadmap, assigned owners, tracked weekly, and resolved all 4 gaps within the program timeline.',
    correct_example_ids: [97, 98],     // technical program architecture answers
    wrong_example_ids:   [17, 18],     // single technical problem — different scope
    notes:               'Program-level technical management vs single incident resolution'
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5 — Partnership (category_id: 5)
  // ══════════════════════════════════════════════════════════════════════════

  {
    question_id:         null,
    category_id:         5,
    candidate_level:     'Senior',
    question_text:       'What do you do when you need the support of a cross-functional team but they say they don\'t have time to help?',
    candidate_answer:    'I would first understand their constraints — are they truly at capacity or is it a priority misalignment? I would then reframe the ask around their goals, show them the ROI of helping, offer to reduce their effort by doing prep work myself, and if needed escalate to shared leadership to resolve the priority conflict.',
    correct_example_ids: [101, 102],   // cross-functional no time answers
    wrong_example_ids:   [105, 106],   // resistant peers — different resistance type
    notes:               'Capacity objection vs active resistance — different root cause'
  },

  {
    question_id:         null,
    category_id:         5,
    candidate_level:     'Staff',
    question_text:       'In a cross-functional project, how do you communicate progress to all stakeholders?',
    candidate_answer:    'I establish a tiered communication cadence at project kickoff: weekly written status for all stakeholders, biweekly sync for active contributors, monthly executive review for sponsors. I use a RAG status dashboard, proactively flag risks before they become issues, and tailor the detail level to the audience.',
    correct_example_ids: [109, 110],   // communicate progress stakeholders answers
    wrong_example_ids:   [107, 108],   // cross-functional alignment — different focus
    notes:               'Communication strategy vs alignment strategy — different competency'
  },

  {
    question_id:         null,
    category_id:         5,
    candidate_level:     'Senior',
    question_text:       'Tell me about a time you led a cross-functional team toward a common goal. How did you align everyone?',
    candidate_answer:    'I led a 30-person cross-functional team spanning payments, product, engineering, legal, and compliance to launch a new payment method in 5 countries. I aligned everyone around a single OKR, ran weekly all-hands to surface blockers, created a shared RACI, and resolved 3 escalations at VP level before they became blockers.',
    correct_example_ids: [107, 108],   // cross-functional common goal answers
    wrong_example_ids:   [109, 110],   // communicate progress — different focus
    notes:               'Alignment and leadership vs communication strategy'
  },

  {
    question_id:         null,
    category_id:         5,
    candidate_level:     'Senior',
    question_text:       'How do you build trust with engineering teams when you lack authority over them?',
    candidate_answer:    'I build trust by showing up prepared, following through on every commitment, never asking engineers to do work I haven\'t thought through, removing blockers proactively, and publicly crediting their work. I also invest time in 1:1s to understand their technical concerns before bringing them into meetings.',
    correct_example_ids: [19],         // build trust engineering teams answer
    wrong_example_ids:   [103, 104],   // working with developers — broader relationship vs trust specifically
    notes:               'Trust building without authority — influence model specific'
  }
];

// ─── runEval ──────────────────────────────────────────────────────────────────
async function runEval() {
  console.log('\n' + '='.repeat(60));
  console.log('  RETRIEVAL EVAL — Option 4 Hybrid Pipeline');
  console.log('='.repeat(60));
  console.log(`  Total questions in golden set : ${GOLDEN_SET.length}`);
  console.log(`  Started at                    : ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  const search       = new SemanticSearch();
  const analyzer     = new CombinedAnalyzer();
  //const cacheService = getCacheService();

  let recall10Total     = 0;
  let precision2Total   = 0;
  let rerankerAccTotal  = 0;
  const failures        = [];
  const results         = [];

  for (const test of GOLDEN_SET) {
    const label = test.question_id
      ? `Q${test.question_id}`
      : `"${test.question_text.substring(0, 50)}..."`;

    console.log(`─── ${label} (Cat ${test.category_id}, ${test.candidate_level}) ───`);
    if (test.notes) console.log(`    Note: ${test.notes}`);

    try {
      // ── Stage 1: Hybrid retrieval — top 10 candidates ──────────────────
      const candidates   = await search.findCandidatesForReranking(
        test.candidate_answer,
        test.candidate_level,
        10
      );
      const candidateIds = candidates.map(c => c.id);

      // ── Recall@10 ───────────────────────────────────────────────────────
      const correctInTop10 = test.correct_example_ids
        .filter(id => candidateIds.includes(id)).length;
      const recall10 = test.correct_example_ids.length > 0
        ? correctInTop10 / test.correct_example_ids.length
        : 0;

      // ── Stage 2: Reranker — top 2 ──────────────────────────────────────
      //const rubrics  = await cacheService.getRubrics(test.category_id);
      const rubricResult = await db.query(
  `SELECT competency_name, level_1_description, level_3_description, level_5_description
   FROM rubrics WHERE category_id = $1`,
  [test.category_id]
);
const rubrics = rubricResult.rows;
      const top2     = candidates.length >= 2
        ? await analyzer.rerankCandidates(candidates, test.candidate_answer, rubrics)
        : candidates;
      const top2Ids  = top2.map(c => c.id);

      // ── Precision@2 ─────────────────────────────────────────────────────
      const correctInTop2 = test.correct_example_ids
        .filter(id => top2Ids.includes(id)).length;
      const precision2 = correctInTop2 / Math.min(2, top2Ids.length);

      // ── Reranker Accuracy ───────────────────────────────────────────────
      const bestIsFirst    = test.correct_example_ids.includes(top2Ids[0]) ? 1 : 0;

      // ── Wrong example penalty ───────────────────────────────────────────
      const wrongInTop2    = test.wrong_example_ids
        .filter(id => top2Ids.includes(id));
      const hasPenalty     = wrongInTop2.length > 0;

      // Accumulate totals
      recall10Total    += recall10;
      precision2Total  += precision2;
      rerankerAccTotal += bestIsFirst;

      const passed = recall10 >= 1.0 && precision2 >= 0.5 && !hasPenalty;

      console.log(`    Recall@10         : ${(recall10   * 100).toFixed(0)}%`);
      console.log(`    Top 10 IDs        : [${candidateIds.join(', ')}]`);
      console.log(`    Precision@2       : ${(precision2 * 100).toFixed(0)}%`);
      console.log(`    Top 2 IDs         : [${top2Ids.join(', ')}]`);
      console.log(`    Reranker Accuracy : ${bestIsFirst === 1 ? '✅ best at #1' : '❌ best not at #1'}`);
      console.log(`    Wrong in top 2    : ${hasPenalty ? `❌ wrong domain IDs: [${wrongInTop2}]` : '✅ none'}`);
      console.log(`    Result            : ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

      results.push({
        label, passed, recall10, precision2,
        reranker_acc: bestIsFirst,
        top10_ids: candidateIds,
        top2_ids:  top2Ids,
        wrong_in_top2: wrongInTop2
      });

      if (!passed) {
        failures.push({
          label,
          notes:          test.notes,
          expected:       test.correct_example_ids,
          wrong_expected: test.wrong_example_ids,
          got_top10:      candidateIds,
          got_top2:       top2Ids,
          recall10,
          precision2
        });
      }

    } catch (error) {
      console.error(`    ❌ Eval error: ${error.message}\n`);
      failures.push({ label, error: error.message });
    }
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  const n = GOLDEN_SET.length;
  console.log('='.repeat(60));
  console.log('  EVAL RESULTS');
  console.log('='.repeat(60));
  console.log(`  Recall@10         : ${(recall10Total    / n * 100).toFixed(1)}%  (target: 95%+)`);
  console.log(`  Precision@2       : ${(precision2Total  / n * 100).toFixed(1)}%  (target: 85%+)`);
  console.log(`  Reranker Accuracy : ${(rerankerAccTotal / n * 100).toFixed(1)}%  (target: 90%+)`);
  console.log(`  Questions tested  : ${n}`);
  console.log(`  Passed            : ${results.filter(r => r.passed).length}`);
  console.log(`  Failed            : ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => {
      if (f.error) {
        console.log(`    ${f.label}: ERROR — ${f.error}`);
      } else {
        console.log(`    ${f.label}:`);
        console.log(`      Expected  : [${f.expected}]`);
        console.log(`      Got top10 : [${f.got_top10}]`);
        console.log(`      Got top2  : [${f.got_top2}]`);
        if (f.wrong_in_top2?.length > 0) {
          console.log(`      ❌ Wrong domain in top2: [${f.wrong_in_top2}]`);
        }
        console.log(`      Note: ${f.notes}`);
      }
    });
  }

  console.log('='.repeat(60));
  console.log(`  Completed at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  return {
    recall10:          recall10Total    / n,
    precision2:        precision2Total  / n,
    reranker_accuracy: rerankerAccTotal / n,
    passed:            results.filter(r => r.passed).length,
    failed:            failures.length,
    total:             n,
    failures
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────────
if (require.main === module) {
  runEval()
    .then(results => {
      // Exit code 1 if below minimum thresholds — enables CI/CD gating
      const belowThreshold =
        results.recall10          < 0.70 ||
        results.precision2        < 0.50 ||
        results.reranker_accuracy < 0.60;
      process.exit(belowThreshold ? 1 : 0);
    })
    .catch(error => {
      console.error('💥 Eval script failed:', error);
      process.exit(1);
    });
}

module.exports = { runEval, GOLDEN_SET };