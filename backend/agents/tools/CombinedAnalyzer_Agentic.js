const OpenAI = require('openai');
const SemanticSearch = require('./SemanticSearch');
const MetadataExtractor = require('./MetadataExtractor_Adaptive');
const { CircuitBreaker } = require('../../utils/CircuitBreaker');
const { getRateLimiter } = require('../../utils/RateLimiter');

/**
 * CombinedAnalyzer_Agentic.js — Option 4 Production Version
 *
 * Changes from previous version:
 * 1. analyze() — Stage 1 now calls semanticSearch.findCandidatesForReranking()
 *    (top 10, no category filter, seniority ±1 pre-filter)
 * 2. analyze() — Stage 2 calls rerankCandidates() which uses OpenAI tool calling
 *    to select the best 2 examples by domain + competency match
 * 3. rerankCandidates() — NEW method. Tool description is the prompt — explicit,
 *    steerable, and measurable. Returns top 2 with rerank scores logged.
 * 4. All other methods (quality gate, critic loop, validation, fallback) unchanged.
 *
 * Token cost vs previous:
 * - Stage 1 retrieval: free (Pinecone)
 * - Stage 2 reranker: ~600 tokens (gpt-4o-mini, tool call)
 * - Net: +~600 tokens per request in exchange for permanently correct grounding
 */
class CombinedAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.semanticSearch = new SemanticSearch();
    this.metadataExtractor = new MetadataExtractor();

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      monitoringPeriod: 60000
    });

    this.rateLimiter = getRateLimiter();
  }

  // ─── analyze ──────────────────────────────────────────────────────────────
  // @param {string} userAnswer     — candidate's answer text
  // @param {number} categoryId     — question category
  // @param {Array}  rubrics        — category rubrics for competency scoring
  // @param {string} candidateLevel — e.g. 'Senior', 'Staff', null
  //   candidateLevel is optional. If not passed (legacy callers), seniority
  //   filter is skipped and all levels are fetched. Callers should pass it
  //   once available in the request (see analyze.js update).
  async analyze(userAnswer, categoryId, rubrics, candidateLevel = null, questionText = '') {
    try {
      console.log('🚀 Starting combined analysis (Option 4)...');
      console.log(`📊 Category: ${categoryId} | Level: ${candidateLevel || 'unknown'} | Rubrics: ${rubrics.length}`);

      // ── Stage 1: Hybrid retrieval ─────────────────────────────────────────
      // Fetch top 10 candidates across ALL categories.
      // Seniority ±1 pre-filter applied in Pinecone if candidateLevel is known.
      // No category filter — the reranker decides domain relevance.
      console.log('🔍 Stage 1: Hybrid retrieval — fetching top 10 candidates...');
      const candidates = await this.semanticSearch.findCandidatesForReranking(
        userAnswer,
        candidateLevel,
        10
      );

      if (candidates.length === 0) {
        console.log('⚠️  No candidates returned — proceeding without ideal examples');
      }

      // ── Stage 2: LLM Reranker ─────────────────────────────────────────────
      // Tool calling selects the 2 best examples by:
      //   (a) domain relevance — same type of problem/failure mode
      //   (b) competency match — example's comp_scores align with what rubrics test
      //   (c) seniority fit    — already pre-filtered in Stage 1
      // Final score = similarity × domain_relevance × competency_match
      let similarExamples = [];
      if (candidates.length > 0) {
        console.log(`🎯 Stage 2: Reranking ${candidates.length} candidates...`);
        const rerankResult = await this.rerankCandidates(candidates, userAnswer, rubrics, questionText);

        // P4: Apply deterministic hard filters based on inferred query facets.
        // Runs AFTER reranker so it can override LLM hedging with regex-based certainty.
        const facets = this.inferQueryFacets(questionText, userAnswer);
        similarExamples = this.applyHardFilters(rerankResult, facets);

        console.log(`✅ After rerank + hard filters — top candidates: IDs ${similarExamples.slice(0, 3).map(e => e.id).join(', ')}`);
      }

      // P1: Filter on rerank_score (0-1 scale), not score (DB 0-5 scale)
      // P2: Drop #2 if it's weak — return 1 example rather than force a bad second
      // Threshold logic:
      //   - Any example with rerank_score < 0.1 is domain-mismatched or competency-irrelevant → drop
      //   - #2 is only kept if its rerank_score is ≥ 40% of #1's score (meaningful second example)
      //     e.g. if #1 = 0.60, #2 must be ≥ 0.24 to be included
      const RERANK_MIN_SCORE      = 0.18;  // absolute floor — below this = wrong domain or weak competency match
      const RERANK_RELATIVE_FLOOR = 0.38;  // #2 must be ≥ 38% of #1's score to be included

      const qualityFiltered = similarExamples.filter(ex => (ex.rerank_score ?? 0) >= RERANK_MIN_SCORE);

      let examplesForAnalysis = [];
      if (qualityFiltered.length >= 2) {
        const [first, second] = qualityFiltered;
        const relativeThreshold = (first.rerank_score ?? 0) * RERANK_RELATIVE_FLOOR;
        if ((second.rerank_score ?? 0) >= relativeThreshold) {
          examplesForAnalysis = [first, second];
          console.log(`📊 Using 2 examples — #1 score: ${first.rerank_score?.toFixed(3)}, #2 score: ${second.rerank_score?.toFixed(3)} (≥ ${relativeThreshold.toFixed(3)} threshold)`);
        } else {
          examplesForAnalysis = [first];
          console.log(`📊 Using 1 example — #2 score ${second.rerank_score?.toFixed(3)} below relative floor ${relativeThreshold.toFixed(3)} (40% of ${first.rerank_score?.toFixed(3)})`);
        }
      } else if (qualityFiltered.length === 1) {
        examplesForAnalysis = qualityFiltered;
        console.log(`📊 Using 1 example — only 1 passed rerank_score floor (${RERANK_MIN_SCORE})`);
      } else {
        examplesForAnalysis = [];
        console.log(`📊 No examples passed rerank_score floor (${RERANK_MIN_SCORE}) — proceeding without ideal context`);
      }

      // ── Step 3: Extract metadata from selected examples ───────────────────
      let enrichedExamples = [];
      if (examplesForAnalysis.length > 0) {
        console.log(`📊 Extracting metadata from ${examplesForAnalysis.length} examples...`);
        enrichedExamples = await Promise.all(
          examplesForAnalysis.map(async (ex) => ({
            ...ex,
            metadata: await this.metadataExtractor.extractMetadata(ex)
          }))
        );
      } else {
        console.log('⚠️  No examples for analysis — proceeding without ideal context');
      }

      // ── Step 4: Call 1 — SOARR scoring + competencies + improvements ────────
      console.log('🤖 Call 1: SOARR analysis (GPT-4o)...');
      const soarrPrompt = this.buildSoarrPrompt(userAnswer, enrichedExamples, rubrics);

      // Prompt integrity check — catches structural regressions before any API call.
      // If dynamic data is missing, fail fast rather than burn tokens on a broken prompt.
      this.assertPromptIntegrity(soarrPrompt, userAnswer, enrichedExamples);

      const soarrAnalysis = await this.callSoarrAPI(soarrPrompt);

      // ── Step 5: Quality gate (deterministic — no LLM call) ───────────────
      // Replaced LLM gate with code — same routing logic, zero token cost.
      // Original LLM gate used the same 4 signals we already have in code.
      const gateDecision = this.runQualityGateDeterministic(soarrAnalysis);
      console.log(`🚦 Gate: ${gateDecision.decision}${gateDecision.hint ? ' — ' + gateDecision.hint : ''}`);

      // ── Step 6: Critic pass (conditional) ────────────────────────────────
      // Critic runs only when there is evidence it will find something to fix.
      // Strong/medium answers with clean scores skip the critic entirely.
      // Saves ~1 GPT-4o-mini call for ~60% of requests.
      const shouldRunCritic = this.shouldRunCritic(soarrAnalysis, gateDecision);
      const _soarrScores = Object.values(soarrAnalysis.soarr||{}).map(c=>c?.score).filter(s=>typeof s==='number');
      const _avg = _soarrScores.length > 0 ? (_soarrScores.reduce((a,b)=>a+b,0) / _soarrScores.length).toFixed(1) : 'n/a';
      console.log(`🎯 Critic triggered: ${shouldRunCritic} (avg=${_avg}, scores=${_soarrScores.length}/5)`);
      console.log(`🔍 Critic: ${shouldRunCritic ? 'running' : 'skipped (clean output)'}`);
      const criticedAnalysis = shouldRunCritic
        ? await this.runCriticPass(soarrAnalysis, userAnswer, rubrics, gateDecision)
        : soarrAnalysis;

      // ── Step 7: Validate SOARR scores ─────────────────────────────────────
      // Attach source texts for the hallucination guard in validateAnalysis.
      // These are the only allowed sources for specific numbers in rewrites.
      criticedAnalysis._sourceTexts = {
        userAnswer,
        exampleTexts: examplesForAnalysis.map(e => e.answer_text || '')
      };
      const validatedAnalysis = this.validateAnalysis(criticedAnalysis, rubrics);
      // Clean up internal field — never send to client
      delete validatedAnalysis._sourceTexts;

      // ── Step 8: Call 2 — depth_signals + coaching_summary (gpt-4o-mini) ──
      console.log('🤖 Call 2: depth + coaching (GPT-4o-mini)...');
      let depthCoaching = { depth_signals: null, coaching_summary: null };
      try {
        const depthPrompt = this.buildDepthCoachingPrompt(userAnswer, validatedAnalysis);
        depthCoaching = await this.callDepthCoachingAPI(depthPrompt);
      } catch (depthError) {
        console.warn('⚠️  Call 2 (depth+coaching) failed — omitting from response:', depthError.message);
      }

      validatedAnalysis.depth_signals    = depthCoaching.depth_signals    || null;
      validatedAnalysis.coaching_summary = depthCoaching.coaching_summary || null;
      validatedAnalysis.similarExamples  = examplesForAnalysis;

      console.log('✅ Analysis complete (SOARR + depth + coaching)');
      return validatedAnalysis;

    } catch (error) {
      console.error('❌ Combined analysis error:', error.message);
      return this.getFallbackResponse(error, rubrics);
    }
  }

  // ─── rerankCandidates ─────────────────────────────────────────────────────
  // Option 4 — Stage 2 of hybrid retrieval.
  //
  // Uses OpenAI tool calling to select the 2 best candidates from the top 10.
  // The tool description IS the prompt — it encodes the exact criteria the LLM
  // uses to rank. Bad description = wrong selections. This is the core of why
  // Option 4 is both accurate and measurable.
  //
  // Selection criteria (all three must be satisfied):
  //   1. Domain relevance  — same type of problem (DR ≠ migration, etc.)
  //   2. Competency match  — example's comp_scores align with rubric competencies
  //   3. Seniority fit     — already pre-filtered ±1 in Stage 1
  //
  // Final rerank score = similarity × domain_relevance × competency_match
  // This is independently measurable (Precision@2, Reranker Accuracy).
  //
  // Fallback: if tool call fails, falls back to pure similarity ranking.
  async rerankCandidates(candidates, userAnswer, rubrics, questionText = '') {
    const competencyNames = rubrics.map(r => r.competency_name);

    // ── Tool definition ────────────────────────────────────────────────────
    // The description is the reranking prompt. Be explicit about:
    //   - What signal to use (domain + competency, not just surface similarity)
    //   - What to penalize (domain mismatch — the exact bug we're fixing)
    //   - What the scores mean (so output is calibrated and consistent)
    const rerankTool = {
      type: 'function',
      function: {
        name: 'rerank_examples',
        description: `You are selecting the 2 best ideal examples to coach a TPM interview candidate.
Score every candidate on two dimensions:

1. DOMAIN RELEVANCE (domain_relevance_score):
   Does this example address the SAME type of problem as the candidate's answer?
   - Disaster recovery question → needs DR/incident/failover examples (NOT cloud migration)
   - Roadmap prioritization → needs prioritization/trade-off examples (NOT ops incidents)
   - Stakeholder conflict → needs influence/negotiation examples (NOT technical design)
   Score 1.0 = exact same problem domain. Score 0.0 = completely different domain.
   PENALIZE examples that are semantically similar on surface but solve a different failure mode.

   QUESTION_TYPE DEFINITIONS — use these to distinguish near-identical types:

   TIMELINE DISTINCTION (critical — do not confuse these):
   - technical_incident_pre  = candidate discovered a bug or risk BEFORE release/deployment
                               (proactive discovery, go/no-go decision, pre-release assessment)
   - technical_incident_post = candidate broke something DURING or AFTER deployment
                               (reactive response, rollback, postmortem, pipeline break)
   HARD RULE: If the question describes discovering a problem before release → prefer technical_incident_pre.
              If the question describes a break that already happened → prefer technical_incident_post.
              NEVER mix pre and post in the same top-2 selection unless the question is explicitly ambiguous.

   SCOPE DISTINCTION (critical — do not confuse these):
   - technical         = a single technical problem: root cause analysis, one bug, one fix, one incident
                         (e.g. "a complex technical problem you solved", "debugging", "specific fix")
   - technical_program = program-level technical management: multiple gaps, roadmap, multiple owners, 
                         gap closure tracking across an entire program
                         (e.g. "a technical program you ran", "technical gaps across a program")
   HARD RULE: If the question asks about "a problem" or a single blocking incident → prefer technical.
              If the question asks about "a program" or "technical gaps" → prefer technical_program.
              Do NOT select technical_program for single-incident questions even if similarity is higher.

   RELATIONSHIP DISTINCTION:
   - behavioral_conflict_manager = disagreement with direct manager or skip-level (upward)
   - behavioral_conflict_peer    = disagreement with a peer colleague (lateral)
   HARD RULE: If the question explicitly says "your manager" → ONLY select manager examples.
              Do NOT substitute peer conflict examples even if similarity score is higher.

   DOMAIN SCORE CALIBRATION — use these anchors to calibrate your domain_relevance_score:

   domain = 1.0 (exact match):
     Question: disaster recovery planning
     Example:  regional failover architecture with RTO/RPO targets and DR drills
     → Same failure mode, same operational concern

   domain = 0.5 (related but different):
     Question: disaster recovery planning
     Example:  incident response playbook for production outages
     → Related operational concern, different scope and trigger

   domain = 0.2 (surface similarity, wrong domain):
     Question: disaster recovery planning
     Example:  cloud migration project planning
     → Both involve infrastructure, but completely different problems

   domain = 0.0 (wrong domain):
     Question: disaster recovery planning
     Example:  stakeholder communication strategy
     → No overlap in failure mode or operational concern

   Apply the same calibration logic to all other domain comparisons.
   When in doubt: if you would coach a candidate differently for the two questions, domain < 0.5.


   - partnership_no_time        = XFN partner says they have no capacity / too busy (constraint-based)
   - partnership_resistant      = XFN partner is actively opposed (not capacity, but will/priority)
   - partnership_crossfunctional = leading XFN team toward a common goal; alignment and execution
   - partnership_communication  = how to communicate status and progress across stakeholders
   - partnership_developers     = working with engineering teams specifically
   These are related but test different root-cause skills. Prefer exact sub-type if available.
   HARD RULE: 'no time' questions → partnership_no_time first.
              'how do you align' / 'common goal' questions → partnership_crossfunctional first.
              'how do you communicate progress' questions → partnership_communication first.
              'build trust with engineers' questions → partnership_developers or partnership first.

   BEHAVIORAL RESOURCEFULNESS vs PROJECT EXECUTION:
   - behavioral_resourcefulness = candidate creatively worked around a constraint (inventive solution)
   - project_execution          = candidate delivered a project (may or may not involve constraints)
   HARD RULE: If the question asks about "resourcing constraints" or "not enough people/time/budget"
              → prefer behavioral_resourcefulness even if project_execution has higher similarity.

2. COMPETENCY MATCH (competency_match_score):
   Do this example's demonstrated competencies align with what the question is testing?
   The question is being evaluated against these competencies: ${competencyNames.join(', ')}.
   Check the example's comp_scores — does it score highly on the relevant competencies?
   Score 1.0 = strong match across all relevant competencies.
   Score 0.0 = example demonstrates unrelated competencies.

You MUST score ALL ${candidates.length} candidates. The top candidates by final_score will be used.
final_score = ((0.6 × domain_relevance) + (0.4 × competency_match)) × (1 + 0.2 × similarity)  if domain > 0.1
            = 0  if domain_relevance ≤ 0.1 (hard gate — wrong domain examples are eliminated)
Domain and competency are the primary signals. Similarity is a tiebreaker only (±20% nudge).`,

        parameters: {
          type: 'object',
          required: ['rankings'],
          properties: {
            rankings: {
              type: 'array',
              description: `One entry per candidate. Must include all ${candidates.length} candidates.`,
              items: {
                type: 'object',
                required: ['candidate_id', 'domain_relevance_score', 'competency_match_score'],
                properties: {
                  candidate_id: {
                    type: 'number',
                    description: 'The id field of the candidate example (integer).'
                  },
                  domain_relevance_score: {
                    type: 'number',
                    description: `0.0–1.0. Does this example address the same type of problem?
1.0 = same domain (e.g. both are disaster recovery).
0.5 = related but different (e.g. incident response vs DR planning).
0.0 = wrong domain (e.g. cloud migration for a DR question).`
                  },
                  competency_match_score: {
                    type: 'number',
                    description: `0.0–1.0. Do this example's comp_scores align with the competencies
being tested (${competencyNames.join(', ')})?
Check the comp_scores object — high scores on relevant competencies = high match.`
                  },
                  penalty_reason: {
                    type: 'string',
                    description: 'If domain_relevance_score < 0.5, explain the domain mismatch in one sentence. Otherwise omit or null.'
                  }
                }
              }
            }
          }
        }
      }
    };

    // ── Reranker prompt ────────────────────────────────────────────────────
    const rerankPrompt = `Rank these ${candidates.length} TPM interview examples for the following candidate answer.

INTERVIEW QUESTION (use this to apply question_type hard rules above):
"${questionText || 'not provided'}"

CANDIDATE'S ANSWER:
"${userAnswer}"

COMPETENCIES BEING TESTED: ${competencyNames.join(', ')}

CANDIDATES TO RANK:
${candidates.map(c => `
---
ID: ${c.id}
Category: ${c.comp_category || ''}
Question type: ${c.question_type || 'unknown'}
Level: ${c.level} at ${c.company || 'unknown company'}
Semantic similarity to candidate answer: ${c.similarity.toFixed(3)}
Competency scores: ${JSON.stringify(c.comp_scores)}
Answer preview: ${(c.answer_text || '').substring(0, 300)}
`).join('\n')}

Use the rerank_examples tool to score all ${candidates.length} candidates.`;

    try {
      const response = await this.rateLimiter.execute(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a retrieval quality expert for TPM interview coaching. Use the rerank_examples tool to score all candidates. Return scores for every candidate provided.'
              },
              {
                role: 'user',
                content: rerankPrompt
              }
            ],
            tools: [rerankTool],
            tool_choice: { type: 'function', function: { name: 'rerank_examples' } },
            temperature: 0.1,   // Deterministic — reranking should be consistent
            max_tokens: 1200
          });
        });
      }, 'reranker');

      // ── Parse tool call result ───────────────────────────────────────────
      const toolCall = response.choices[0].message.tool_calls?.[0];

      if (!toolCall) {
        console.warn('⚠️  Reranker returned no tool call — falling back to similarity ranking');
        return candidates.sort((a, b) => b.similarity - a.similarity);
      }

      let rankings;
      try {
        rankings = JSON.parse(toolCall.function.arguments).rankings;
      } catch (parseErr) {
        console.warn('⚠️  Reranker tool call parse failed — falling back to similarity ranking');
        return candidates.sort((a, b) => b.similarity - a.similarity);
      }

      if (!Array.isArray(rankings) || rankings.length === 0) {
        console.warn('⚠️  Reranker returned empty rankings — falling back to similarity ranking');
        return candidates.sort((a, b) => b.similarity - a.similarity);
      }

      // ── Compute final rerank scores and log ─────────────────────────────
      // final_score = semantic_similarity × domain_relevance × competency_match
      // All three signals must agree — a semantically similar but wrong-domain
      // example gets killed by a low domain_relevance_score.
      console.log('\n📊 Reranker scores:');
      const scored = candidates.map(candidate => {
        const rank = rankings.find(r => r.candidate_id === candidate.id);

        if (!rank) {
          console.warn(`  ⚠️  No ranking returned for ID ${candidate.id} — using similarity only`);
          return { ...candidate, domain_relevance_score: 0.3, competency_match_score: 0.3, rerank_score: candidate.similarity * 0.3 };
        }

        const domainScore      = Math.min(1, Math.max(0, rank.domain_relevance_score    ?? 0));
        const competencyScore  = Math.min(1, Math.max(0, rank.competency_match_score    ?? 0));
        // Scoring formula: weighted base + similarity nudge
        //
        // baseScore = (0.6 × domain) + (0.4 × competency)
        //   domain and competency are primary — they determine the tier
        //
        // finalScore = baseScore × (1 + 0.2 × similarity)   if domain > 0.1
        //            = 0                                      if domain ≤ 0.1
        //
        // Why this is better than sim × domain × comp:
        //   Old formula: sim=0.65, domain=0.5, comp=1.0 → 0.325
        //                sim=0.55, domain=1.0, comp=1.0 → 0.550  ✅ correct wins
        //   BUT: sim=0.65, domain=0.3, comp=1.0 → 0.195 — low domain still survives
        //
        //   New formula: sim=0.65, domain=0.3, comp=1.0 → base=0.58, but domain≤0.1? No → 0.58×1.13=0.655
        //   Hard gate: domain ≤ 0.1 → score = 0, no matter how high sim or comp
        //   Similarity nudge is capped at ±20% — cannot flip a tier
        const baseScore  = (0.6 * domainScore) + (0.4 * competencyScore);
        const finalScore = domainScore > 0.1
          ? baseScore * (1 + 0.2 * candidate.similarity)
          : 0;

        console.log(
          `  ID ${candidate.id} (${candidate.question_type}, ${candidate.level}): ` +
          `sim=${candidate.similarity.toFixed(2)} × ` +
          `domain=${domainScore.toFixed(2)} × ` +
          `comp=${competencyScore.toFixed(2)} = ` +
          `final=${finalScore.toFixed(3)}` +
          (rank.penalty_reason ? `  ⚠️  ${rank.penalty_reason}` : '')
        );

        // P3: Store raw dimensions for downstream use (quality filter, logging, debugging)
        return {
          ...candidate,
          domain_relevance_score: domainScore,
          competency_match_score: competencyScore,
          rerank_score:           finalScore
        };
      });

      // Sort descending by rerank_score
      const sortedScored = scored.sort((a, b) => b.rerank_score - a.rerank_score);

      // Return ALL scored candidates — P1/P2 filtering happens in analyze()
      // (previously we sliced to top 2 here, which prevented the relative floor check)
      console.log(`\n🏆 Top ranked: ${sortedScored.slice(0, 3).map(e => `ID ${e.id} (score: ${e.rerank_score.toFixed(3)})`).join(', ')}\n`);
      return sortedScored;

    } catch (error) {
      // Reranker failure is non-fatal — fall back to similarity ranking
      // The quality gate and critic loop still run on the main analysis
      console.warn(`⚠️  Reranker failed (${error.message}) — falling back to similarity ranking`);
      return candidates.sort((a, b) => b.similarity - a.similarity);
    }
  }

  // ─── inferQueryFacets ────────────────────────────────────────────────────
  // Deterministic extraction of query facets — ONLY for signals that are
  // binary and reliably detectable by regex. These are cases where the
  // reranker consistently hedges (assigns 0.5) instead of committing.
  //
  // KEPT (binary, unambiguous, regex-reliable):
  //   timeline     — "2 days before release" is always pre; "broke the pipeline" is always post
  //   relationship — "your manager" is always upward; "colleague/peer" is always lateral
  //
  // NOT KEPT (ambiguous — LLM owns these via reranker tool description):
  //   scope        — "program" appears in both single-problem and program questions
  //   xfn_intent   — "don't have time" vs "pushing back" vs "align" overlap too much
  //   risk/failure — subtle framing differences the reranker handles better
  inferQueryFacets(questionText, userAnswer) {
    const q = (questionText || '').toLowerCase();

    const facets = {
      timeline:     null,   // 'pre' | 'post' | null
      relationship: null,   // 'manager' | 'peer' | null
    };

    // ── TIMELINE: pre-release vs post-deployment ──────────────────────────
    // Pre: bug found before release, go/no-go decision, days/hours before launch
    const prePatterns = [
      /\bbefore (the )?release\b/, /\bpre.?release\b/, /\bgo.no.go\b/,
      /\bdays? before\b/, /\bhours? before\b/, /\bweeks? before\b/,
      /\bbefore (it )?went live\b/, /\bbefore launch\b/, /\bbefore deployment\b/,
      /\bfound a bug\b/, /\bidentif\w+ a (new )?bug\b/, /\bdiscovered\b.*\bbug\b/,
      /\bpre.?deploy\b/
    ];
    // Post: broke something, pipeline break, incident after the fact, rollback
    const postPatterns = [
      /\bbreak something\b/, /\bbroke\b/, /\boutage\b/,
      /\brollback\b/, /\bpostmortem\b/, /\bpost.mortem\b/,
      /\bproduction (issue|break|failure)\b/,
      /\bduring (a )?deploy\b/, /\bafter (the )?release\b/, /\bafter deploy\b/,
      /\bpipeline (break|fail)\b/, /\bwent down\b/
    ];
    if (prePatterns.some(p => p.test(q)))      facets.timeline = 'pre';
    else if (postPatterns.some(p => p.test(q))) facets.timeline = 'post';

    // ── RELATIONSHIP: manager vs peer disagreement ────────────────────────
    // Manager: explicit upward relationship ("your manager", "skip-level")
    // Peer: explicit lateral relationship ("colleague", "peer", "co-worker")
    const managerPatterns = [
      /\byour manager\b/, /\bmy manager\b/, /\bmanager disagreed?\b/,
      /\bdisagreed? with (your|my) manager\b/, /\bskip.?level\b/,
      /\bvp\b.*\bdisagree\b/, /\bdirector\b.*\bdisagree\b/
    ];
    const peerPatterns = [
      /\bcolleague\b/, /\bpeer\b/, /\bco.?worker\b/,
      /\banother (engineer|pm|tpm|manager)\b/,
      /\bsame level\b/, /\bteam.?mate\b/
    ];
    if (managerPatterns.some(p => p.test(q)))      facets.relationship = 'manager';
    else if (peerPatterns.some(p => p.test(q)))    facets.relationship = 'peer';

    console.log(`🔍 Inferred facets: ${JSON.stringify(facets)}`);
    return facets;
  }

  // ─── applyHardFilters ─────────────────────────────────────────────────────
  // P4: Post-reranker override layer.
  //
  // Two modes depending on signal strength:
  //
  // EXCLUSIONARY (binary-certain signals):
  //   When the question unambiguously specifies relationship=manager or
  //   timeline=pre/post AND matching examples exist — incompatible types
  //   are excluded entirely, not just demoted. These signals are regex-certain
  //   ("your manager", "before release", "after deploy") so false positives
  //   are near-zero. Using incompatible examples actively misleads the model.
  //
  // BOOST-ONLY (weaker signals):
  //   All other facets — reorder so matches come first, but keep all candidates.
  //   Fallback if no matching examples exist for either mode.
  applyHardFilters(scoredCandidates, facets) {
    if (!facets) return scoredCandidates;

    const PREFERRED_TYPES = {
      timeline: {
        pre:  ['technical_incident_pre'],
        post: ['technical_incident_post']
      },
      relationship: {
        manager: ['behavioral_conflict_manager'],
        peer:    ['behavioral_conflict_peer']
      }
    };

    // Facets where exclusion is safe — signal is binary and regex-certain.
    // Only applied when matching examples exist (never leaves candidate with 0 options).
    const EXCLUSIONARY_FACETS = new Set(['timeline', 'relationship']);

    let candidates = [...scoredCandidates];
    let boostedCount = 0;

    for (const [facetKey, facetValue] of Object.entries(facets)) {
      if (!facetValue) continue;

      const preferred = PREFERRED_TYPES[facetKey]?.[facetValue];
      if (!preferred || preferred.length === 0) continue;

      const matches    = candidates.filter(c => preferred.includes(c.question_type));
      const nonMatches = candidates.filter(c => !preferred.includes(c.question_type));

      if (matches.length > 0) {
        if (EXCLUSIONARY_FACETS.has(facetKey)) {
          // Hard exclusion — incompatible types removed from consideration.
          // Safe because: (a) signal is regex-certain, (b) matches exist.
          candidates = matches.sort((a, b) => b.rerank_score - a.rerank_score);
          console.log(`🚫 Hard exclusion [${facetKey}=${facetValue}]: kept only ${matches.map(m => `ID ${m.id} (${m.question_type})`).join(', ')} — excluded ${nonMatches.length} incompatible`);
        } else {
          // Boost-only — matches float to top, non-matches preserved below
          const reordered = [
            ...matches.sort((a, b) => b.rerank_score - a.rerank_score),
            ...nonMatches.sort((a, b) => b.rerank_score - a.rerank_score)
          ];
          if (reordered[0].id !== candidates[0].id) {
            console.log(`🎯 Hard boost [${facetKey}=${facetValue}]: promoted ${matches.map(m => `ID ${m.id} (${m.question_type})`).join(', ')} to top`);
          }
          candidates = reordered;
        }
        boostedCount++;
      } else {
        console.log(`⚠️  Hard filter [${facetKey}=${facetValue}]: no candidates with preferred type(s) [${preferred.join(', ')}] — no change`);
      }
    }

    if (boostedCount === 0) {
      console.log(`ℹ️  Hard filters: no reordering needed`);
    }

    return candidates;
  }

  // ─── buildSoarrPrompt ────────────────────────────────────────────────────────
  // Call 1: SOARR scoring + competencies + improvements.
  // SOARR is the only framework — no STAR mapping, no legacy fields.
  // ideal_examples use soarr_breakdown (not star_breakdown).
  buildSoarrPrompt(userAnswer, enrichedExamples, rubrics) {
    const promptData = {
      task: 'soarr_tpm_analysis',
      candidate_answer: userAnswer,
      ideal_examples: enrichedExamples.map((ex, idx) => ({
        id:                     idx + 1,
        score:                  ex.rerank_score ?? ex.score ?? null,
        rerank_score:           ex.rerank_score ?? null,
        domain_relevance_score: ex.domain_relevance_score ?? null,
        competency_match_score: ex.competency_match_score ?? null,
        company:                ex.company || null,
        level:                  ex.level   || null,
        answer_text:            ex.answer_text,
        soarr_breakdown: {
          situation:  ex.star?.situation || ex.soarr?.situation || null,
          obstacle:   ex.soarr?.obstacle || ex.star?.task       || null,
          action:     ex.star?.action    || ex.soarr?.action    || null,
          result:     ex.star?.result    || ex.soarr?.result    || null,
          reflection: ex.soarr?.reflection                      || null
        },
        metadata: {
          context:            ex.metadata?.context            || {},
          complexity_signals: ex.metadata?.complexity_signals || {},
          execution_evidence: ex.metadata?.execution_evidence || {},
          impact_signals:     ex.metadata?.impact_signals     || {}
        }
      })),
      rubrics: rubrics.map(r => ({
        competency: r.competency_name,
        level_1:    r.level_1_description || r.level_1,
        level_3:    r.level_3_description || r.level_3,
        level_5:    r.level_5_description || r.level_5
      })),
      instructions: {
        framework:          'SOARR — Situation, Obstacle, Action, Result, Reflection. This is the ONLY scoring framework. Do not produce STAR.',
        competency_scoring: 'For EACH competency: (1) find the closest matching level descriptor, (2) quote that descriptor verbatim, (3) cite the specific evidence from the candidate answer, (4) THEN assign the score. A score with no quoted descriptor is invalid.',
        improvements:       'Generate copy-paste ready improvements referencing specific elements from ideal_examples. Use SOARR component labels only.',
        critical_rules: [
          'SOARR ONLY — do not output a star field under any circumstances',
          'Use exact details from ideal_examples soarr_breakdown when available',
          'Reference company and level from ideal_examples to show organisational scale',
          'All scores must be integers 1-5. Never 0.',
          'COMPETENCY RULE: You MUST quote the rubric level descriptor before assigning any competency score. No exceptions.',
          'ANTI-HALLUCINATION RULE: Never invent frameworks, metrics, or tools not in the candidate answer or ideal_examples.'
        ]
      },
      output_format: {
        internal_reasoning: {
          description: 'COMPLETE THIS FIRST. This is your ground truth — all scores and feedback must trace back here. Compute strength_tier here before generating improvements.',
          evidence_inventory: {
            description:          'Extract ONLY what is explicitly in the candidate answer',
            tools_systems:        "list or 'none'",
            stakeholders:         "list or 'generic: my team'",
            metrics_numbers:      "list or 'none'",
            timeline:             "list or 'none'",
            company_team_context: "list or 'none'",
            seniority_signals:    "list or 'none'",
            outcomes_results:     "list or 'none stated'"
          },
          gap_analysis: [
            'Compare inventory against ideal_examples soarr_breakdown and metadata',
            "Format: 'Missing: [element]. Ideal has: [specific detail]. Candidate has: [what was found or none]'"
          ],
          score_reasoning: [
            "For EACH SOARR component: 'Scoring [component] as [X]/5 because inventory shows [present items] but missing [gaps]'"
          ],
          competency_reasoning: {
            description: 'REQUIRED — one entry per competency as a flat object keyed by competency name.',
            example_structure: {
              'Adaptability': {
                closest_level:     'level_3',
                descriptor_quoted: 'exact quote from rubric level_3',
                evidence_found:    'exact phrase from inventory',
                score:             3
              }
            },
            rules: [
              'Output ALL competencies — never skip one',
              'Keys must match exact competency names from rubrics',
              'Score must be integer 1-5 — never 0',
              'descriptor_quoted must be verbatim from rubric',
              'evidence_found must be from evidence_inventory'
            ]
          }
        },
        soarr: {
          situation: {
            score:    'integer 1-5. How clearly did the candidate set the scene — project, context, stakes?',
            text:     'Exact words from candidate answer. Quote directly.',
            feedback: 'Template: "You said [exact candidate words]. Missing: [specific element]. Add: [concrete detail from examples or placeholder]." No generic advice.'
          },
          obstacle: {
            score:    'integer 1-5. 1=no obstacle stated, 3=obstacle named but vague, 5=specific obstacle with real stakes and consequences.',
            text:     'Exact words describing the obstacle, or "none stated" if absent.',
            feedback: 'Template: "You said [X]. Missing: [Y]. Add: [Z]." If obstacle is absent, tell them exactly what kind of obstacle would make this answer real.'
          },
          action: {
            score:    'integer 1-5. How specific and adaptive were the actions described?',
            text:     'Exact words from candidate answer. Quote directly.',
            feedback: 'Template: "You said [exact candidate words]. Missing: [specific element]. Add: [concrete detail]."'
          },
          result: {
            score:    'integer 1-5. 1=no result stated, 3=result mentioned but unquantified, 5=specific measurable outcome.',
            text:     'Exact words from candidate answer, or "none stated" if absent.',
            feedback: 'Template: "You said [X]. Missing: [Y]. Add: [Z]."'
          },
          reflection: {
            score:    'integer 1-5. 1=no reflection, 3=surface-level lesson, 5=specific behavioral change the candidate now applies.',
            text:     'Exact words showing reflection, or "none stated" if absent.',
            feedback: 'Template: "You said [X]. Missing: [Y]. Add: [Z]." Absence of reflection scores 1 — never omit this field.'
          }
        },
        strength_tier: 'strong|medium|weak — derived from average SOARR score. strong=avg≥4, medium=avg 2.5-3.9, weak=avg<2.5. Controls how many improvements are generated.',
        competencies: 'Object with competency names as keys, integer 1-5 values. NEVER 0.',
        improvements: [
          {
            priority:          'critical|high|medium',
            component:         'situation|obstacle|action|result|reflection',
            gap_identified:    'Copy the EXACT gap from internal_reasoning.gap_analysis. Specific, not generic.',
            current_text:      'Exact verbatim quote from candidate answer.',
            rewritten_text:    `EXPAND — do not replace. The candidate's own words are the backbone. Keep their phrasing, their project, their domain. Add only what is missing around what they said.

APPROACH:
1. Start with the candidate's actual words where possible — do not paraphrase them away
2. Insert the missing element INTO their sentence structure, not instead of it
3. Use [placeholders] for facts they must supply — never invent numbers, timelines, or outcomes

GROUNDING RULES:
ALLOWED: (a) candidate's exact words and phrasing, (b) their domain/project/company, (c) specific facts from ideal_examples soarr_breakdown, (d) [placeholders] for missing facts
FORBIDDEN: invented numbers, timelines, metrics, outcomes, or tool names not in the answer or examples

EXPAND example (candidate said "I will walk you through a scenario of managing AAD B2C integration to a healthcare industry"):
WRONG — replaces their voice: "I led the AAD B2C integration for a healthcare client — a [X-week] program spanning [N] teams."
RIGHT — expands their words: "I managed the AAD B2C integration for a healthcare client — specifically [describe the scope: what systems, how many teams, what was at stake for the client]. The healthcare context meant [compliance/security/patient data consideration]."

EXPAND example (candidate said "Run scrum ceremonies, share newsletter, weekly project updates"):
WRONG — replaces: "I coordinated across [N] teams to recover the timeline by [specific actions]."
RIGHT — expands: "I ran scrum ceremonies and shared weekly newsletters and project updates with stakeholders — [add: what specific decision or adaptation you made when something changed, e.g. 'When [obstacle arose], I [specific action] which resulted in [outcome].']"`,
            rationale:         '"Your answer says [X] but an interviewer needs to hear [Y] because [Z]." Never reference a detail not in the candidate answer or examples.',
            example_reference: 'Example 1 or Example 2, or "no example — candidate must supply"'
          }
        ]
      }
    };

    // Prompt cache optimisation: static instructions first, dynamic data last.
    // OpenAI caches the static prefix — ~50% token discount after first request.
    // CRITICAL: candidate_answer, ideal_examples, rubrics injected at END of prompt.
    const { candidate_answer, ideal_examples, rubrics: rubricList } = promptData;

    return `You are an expert TPM interview coach. Analyse this answer using the SOARR framework only.

CHAIN OF THOUGHT — work through these steps in order:

STEP 1 — EVIDENCE INVENTORY (do this first, it is your ground truth):
Extract ONLY what is explicitly stated in the candidate_answer. Do not infer.
- Tools/Systems: exact names or "none"
- Stakeholders: exact roles or "generic"
- Metrics/Numbers: exact figures or "none"
- Timeline: exact durations or "none stated"
- Company/Team context: exact phrases or "none"
- Seniority signals: exact phrases showing scope or "none"
- Outcomes/Results: exact outcomes or "none stated"

RULE: You cannot reference anything in scoring or feedback that is NOT in this inventory.

STEP 2 — GAP ANALYSIS (inventory vs ideal_examples):
Compare your inventory against ideal_examples soarr_breakdown and metadata.
Format: "Missing: [element]. Ideal has: [exact quote]. Candidate has: [inventory item or none]"

STEP 3 — SOARR SCORING:
Score each component 1-5 using the gaps from Step 2.
- 5 = inventory matches everything the ideal example has for this component
- 4 = 1-2 minor items missing
- 3 = important item missing (timeline, scale, or obstacle)
- 2 = multiple key items missing
- 1 = component essentially absent

SOARR scoring guidance:
- obstacle: 1 if no blocker is named. This is the most commonly missing component.
- result: 1 if no outcome stated, even vague.
- reflection scoring rubric — read this carefully:
  5 = multiple explicit lessons WITH behavioral changes they now apply (e.g. "Three key lessons: First... Second... Third... Now this is our standard")
  4 = one clear lesson AND a stated behavioral change (e.g. "State assumptions clearly, but always plan for when they break — design graceful failure handling")
  3 = lesson stated but no behavioral change, OR behavioral change implied but not explicit
  2 = vague takeaway with no specifics (e.g. "I learned a lot from this")
  1 = no lesson, no takeaway, no behavioral change mentioned at all

REFLECTION RECOGNITION — these are ALL valid reflection signals, not just "I learned X":
- Numbered lessons: "Three key lessons: First... Second... Third..."
- Takeaway statements: "The big takeaway?", "Key learning:", "Key lesson:"
- Principle statements: "State assumptions clearly, but always plan for when they break"
- Behavioral change: "Now this GUID caching pattern is our standard", "I now apply..."
- Retrospective insight: "I should've called compliance in week 1", "don't anchor on first hypothesis"
- Design philosophy derived from experience: "design like they're going to fail, because eventually they will"

If the candidate ended their answer with ANY of the above patterns — score reflection at minimum 3.

FEEDBACK RULE — every feedback string MUST:
1. Open with the candidate's exact words: "You said '[exact phrase]'..."
2. Name the ONE specific missing element
3. Give a concrete addition using examples or placeholders
BANNED: "be more specific", "add more detail", "provide metrics" — these are useless.

STEP 4 — COMPETENCY SCORING:
For EACH competency in rubrics:
1. Read all three level descriptors
2. Start at level_5 and work DOWN
3. QUOTE the matching descriptor verbatim in competency_reasoning
4. Cite the specific inventory item as evidence
5. Assign score (level_1=1-2, level_3=3, level_5=4-5)

STEP 4.5 — STRENGTH TIER:
Before generating improvements, compute the average SOARR score:
  avg = (situation + obstacle + action + result + reflection) / 5

Classify:
  strong : avg ≥ 4.0  → this is a good answer — generate MAX 2 improvements, priority medium only
  medium : avg 2.5–3.9 → some gaps — generate MAX 3 improvements, mix of high and medium priority
  weak   : avg < 2.5   → significant gaps — generate up to 5 improvements, full priority range

Set strength_tier in your output accordingly.

STRONG answer coaching rule:
If strength_tier = strong — do NOT generate critical priority improvements.
Focus on the 1-2 highest-value gaps only. The candidate needs polish, not rebuilding.
Lead with what they did well in the feedback strings before naming the gap.

STEP 5 — EXPANSIONS (not rewrites):
For each SOARR component scoring < 4, expand what the candidate said — do not replace it.

CORE PRINCIPLE: The candidate's words are the backbone. Your job is to show them what to ADD
to their own sentence, not what to say instead. An interviewer should hear the same person
talking — just with more depth.

GROUNDING RULES (same as always):
ALLOWED: candidate's exact words, their domain/project, specific facts from ideal_examples, [placeholders]
FORBIDDEN: invented numbers, timelines, metrics, outcomes, tool names not in answer or examples

HOW TO EXPAND vs REPLACE:

Candidate said: "I divide my work in 3 phases Research, plan and Execute. I will walk you
through a scenario of managing AAD B2C integration to a healthcare industry."

REPLACE (wrong — strips their voice, sounds like a template):
"I led the AAD B2C integration for a healthcare client — a [X-week] program spanning [N] teams."

EXPAND (correct — keeps their words, adds what's missing around them):
"I divide my work in 3 phases — Research, Plan, and Execute. For the AAD B2C integration at
a healthcare client, Research involved identifying the functional and nonfunctional requirements
and mapping the executors, sponsors, and users. [Add: how large was the program — how many
teams, how long, and what was specifically at stake for the healthcare client, e.g. HIPAA
compliance or patient data security.]"

Candidate said: "Run scrum ceremonies, share newsletter, weekly project updates to the
stakeholders to share the visibility of the program."

REPLACE (wrong):
"I coordinated across [N] teams to recover the timeline by [specific actions]."

EXPAND (correct):
"I ran scrum ceremonies and shared weekly newsletters and project status updates with
stakeholders to maintain visibility. [Add: one specific moment where you had to adapt —
e.g. 'When [specific issue arose], I [action you took] — for example, escalated to [role],
re-prioritised [scope item], or brought in [team] to unblock the dependency.']"

The test: could the candidate paste this into their answer and say it out loud in their own
voice? If it sounds like someone else's story, it's a replace. If it sounds like their story
with more depth, it's an expand.

Placeholders are honest. Invented numbers are coaching malpractice — candidates get caught.

Return your final analysis as valid JSON matching the output_format exactly. No star field.

---
CANDIDATE ANSWER:
${JSON.stringify(candidate_answer)}

IDEAL EXAMPLES:
${JSON.stringify(ideal_examples, null, 2)}

RUBRICS:
${JSON.stringify(rubricList, null, 2)}`;
  }

  // ─── buildDepthCoachingPrompt ─────────────────────────────────────────────
  // Call 2: depth_signals + coaching_summary.
  // Takes the completed SOARR analysis as input — synthesises, does not re-score.
  buildDepthCoachingPrompt(userAnswer, soarrAnalysis) {
    const soarr      = soarrAnalysis.soarr      || {};
    const inventory  = soarrAnalysis.internal_reasoning?.evidence_inventory || {};
    const soarrScores = Object.entries(soarr).map(([k, v]) => `${k}: ${v?.score ?? '?'}/5`).join(', ');

    return `You are a senior TPM interview coach synthesising a completed SOARR analysis into depth signals and a coaching summary.

CANDIDATE ANSWER:
"${userAnswer}"

COMPLETED SOARR SCORES: ${soarrScores}

EVIDENCE INVENTORY (ground truth — do not invent beyond this):
${JSON.stringify(inventory, null, 2)}

SOARR FEEDBACK ALREADY GIVEN:
${JSON.stringify(Object.fromEntries(
  Object.entries(soarr).map(([k, v]) => [k, v?.feedback || ''])
), null, 2)}

YOUR TASK: Based only on the above, produce depth_signals and coaching_summary.
Do not re-score. Do not invent new evidence. Synthesise what is already there.

OUTPUT FORMAT (valid JSON, exactly these fields):
{
  "depth_signals": {
    "shows_judgment":    true/false — did the candidate make a trade-off with stated rationale?,
    "shows_tradeoff":    true/false — did the candidate explicitly weigh competing options?,
    "shows_reflection":  true/false — did the candidate state a lesson or behavioural change?,
    "authenticity_score": integer 1-5 — 1=generic framework recitation, 5=vivid story only this person could tell,
    "interviewer_probe":  "the single most important follow-up question based on what is MISSING — one sentence, specific to this answer"
  },
  "coaching_summary": {
    "one_thing":        "the single most important fix before the next interview — one sentence, specific to this answer",
    "score_potential":  integer 1-5 — if they fixed the gaps, what score could this realistically reach?,
    "weakness_pattern": "the recurring gap across all SOARR components — one phrase",
    "signal_density":   "low|medium|high",
    "daily_drill":      "one specific exercise for TODAY — concrete, not 'practice your answers'",
    "interviewer_read": "what an interviewer would honestly conclude — direct, not encouraging"
  }
}`;
  }

  // ─── callSoarrAPI ─────────────────────────────────────────────────────────
  // Call 1: SOARR scoring + competencies + improvements
  async callSoarrAPI(prompt) {
    return await this.rateLimiter.execute(async () => {
      return await this.circuitBreaker.execute(async () => {
        const response = await this.openai.chat.completions.create({
          model:           'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an expert TPM interview coach. Return valid JSON with all required fields. Use the SOARR framework only — do not output a star field.' },
            { role: 'user',   content: prompt }
          ],
          temperature:     0.3,
          max_tokens:      5000,
          response_format: { type: 'json_object' }
        });
        const content = response.choices[0].message.content;
        console.log('📥 Call 1 (SOARR) response received');
        return JSON.parse(content);
      });
    }, 'soarr-analysis');
  }

  // ─── callDepthCoachingAPI ──────────────────────────────────────────────────
  // Call 2: depth_signals + coaching_summary (synthesises Call 1 output)
  async callDepthCoachingAPI(prompt) {
    return await this.rateLimiter.execute(async () => {
      return await this.circuitBreaker.execute(async () => {
        const response = await this.openai.chat.completions.create({
          model:           'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a senior TPM interview coach. Return valid JSON with depth_signals and coaching_summary only.' },
            { role: 'user',   content: prompt }
          ],
          temperature:     0.3,
          max_tokens:      1500,
          response_format: { type: 'json_object' }
        });
        const content = response.choices[0].message.content;
        console.log('📥 Call 2 (depth+coaching) response received');
        return JSON.parse(content);
      });
    }, 'depth-coaching');
  }


  // ─── assertPromptIntegrity ────────────────────────────────────────────────
  // Validates that the built prompt contains all required dynamic data before
  // sending to the API. Fails fast — catches structural regressions (missing
  // candidate answer, examples, rubrics) that quality evals will miss because
  // the model compensates by hallucinating context.
  // Cost: zero. Runs on every request.
  assertPromptIntegrity(prompt, userAnswer, examples) {
    const checks = {
      has_candidate_answer: prompt.includes(
        (userAnswer || '').substring(0, 40)
      ) || prompt.includes('CANDIDATE ANSWER'),
      has_ideal_examples_section: prompt.includes('IDEAL EXAMPLES'),
      has_rubrics_section:        prompt.includes('RUBRICS'),
      has_soarr_instructions:     prompt.includes('SOARR'),
      min_length:                 prompt.length > 3000,
      // Content checks — catch empty arrays passed as dynamic data
      has_examples_content:       examples.length === 0 || prompt.includes('answer_text'),
      has_rubric_content:         prompt.includes('competency') || prompt.includes('level_1')
    };

    const failures = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (failures.length > 0) {
      const msg = `Prompt integrity check failed: ${failures.join(', ')}`;
      console.error('🚨 ' + msg);
      // Throw to prevent API call with broken prompt — better to return
      // fallback than to spend tokens on hallucinated output
      throw new Error(msg);
    }

    console.log(`✅ Prompt integrity: all checks passed (${prompt.length} chars)`);
  }

  // ─── runQualityGateDeterministic ─────────────────────────────────────────
  // Replaces the LLM quality gate with pure code.
  // Same routing logic as the original — zero LLM call cost.
  runQualityGateDeterministic(analysis) {
    const inv = analysis.internal_reasoning?.evidence_inventory || {};

    const hasMetrics      = inv.metrics_numbers && inv.metrics_numbers !== 'none';
    const hasStakeholders = inv.stakeholders && !inv.stakeholders.toLowerCase().includes('generic');
    const hasTimeline     = inv.timeline && inv.timeline !== 'none';
    const hasTools        = inv.tools_systems && inv.tools_systems !== 'none';
    const evidenceCount   = [hasMetrics, hasStakeholders, hasTimeline, hasTools].filter(Boolean).length;

    const soarr    = analysis.soarr || {};
    const scores   = Object.values(soarr).map(c => c?.score).filter(s => typeof s === 'number');
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;

    if (scores.every(s => s >= 3))             return { decision: 'PROCEED',       hint: null,                                               reason: 'all scores >= 3' };
    if (evidenceCount >= 3)                    return { decision: 'PROCEED',       hint: null,                                               reason: 'evidence count >= 3' };
    if (evidenceCount <= 2 && minScore <= 2)   return { decision: 'NEEDS_CONTEXT', hint: 'Low evidence and weak scores — critic should focus here', reason: 'low evidence + weak scores' };
    return                                            { decision: 'PROCEED',       hint: null,                                               reason: 'default proceed' };
  }

  // ─── shouldRunCritic ──────────────────────────────────────────────────────
  // Returns true only when there is evidence the critic will find something.
  // Strong answers with clean scores skip the critic entirely.
  shouldRunCritic(analysis, gateDecision) {
    if (gateDecision?.decision === 'NEEDS_CONTEXT') return true;

    const soarr    = analysis.soarr || {};
    const scores   = Object.values(soarr).map(c => c?.score).filter(s => typeof s === 'number');
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    if (avgScore < 2.5) return true;

    // TYPE 7: score > 1 but text is empty
    const obstacleInconsistent   = soarr.obstacle?.score  > 1 && (!soarr.obstacle?.text  || soarr.obstacle.text  === 'none stated');
    const reflectionInconsistent = soarr.reflection?.score > 1 && (!soarr.reflection?.text || soarr.reflection.text === 'none stated');
    if (obstacleInconsistent || reflectionInconsistent) return true;

    // TYPE 4: any score is 0
    if (Object.values(soarr).some(c => c?.score === 0)) return true;

    // TYPE 2: all scores identical (model hedging)
    if (scores.length > 0 && scores.every(s => s === scores[0])) return true;

    // TYPE 8: any competency scored 1
    if (Object.values(analysis.competencies || {}).some(s => s === 1)) return true;

    return false;
  }

  // ─── runCriticPass ────────────────────────────────────────────────────────
  async runCriticPass(draftAnalysis, userAnswer, rubrics, gateDecision = null) {
    try {
      const criticPrompt = this.buildCriticPrompt(draftAnalysis, userAnswer, rubrics, gateDecision);

      const response = await this.rateLimiter.execute(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await this.openai.chat.completions.create({
            model:           'gpt-4o-mini',
            messages: [
              {
                role:    'system',
                content: 'You are a strict TPM interview scoring auditor. Find contradictions between evidence and scores, then correct them. Return only valid JSON.'
              },
              { role: 'user', content: criticPrompt }
            ],
            temperature:     0.1,
            max_tokens:      2000,
            response_format: { type: 'json_object' }
          });
        });
      }, 'critic-pass');

      const criticResult = JSON.parse(response.choices[0].message.content);
      console.log('📋 Critic pass complete');

      // Enforce diagnose-and-fix rule: if critic reported issues but made no corrections,
      // clear the notes — prevents misleading logs and wasted token output.
      if (
        criticResult.critic_notes &&
        criticResult.critic_notes.trim() &&
        criticResult.critic_notes.trim() !== '' &&
        (!criticResult.corrections_made || criticResult.corrections_made.length === 0)
      ) {
        console.warn('⚠️  Critic reported issues but made no corrections — clearing notes');
        criticResult.critic_notes = '';
      }

      if (criticResult.corrections_made && criticResult.corrections_made.length > 0) {
        console.log(`⚠️  Critic corrected ${criticResult.corrections_made.length} score(s):`);
        criticResult.corrections_made.forEach(c => console.log(`   ${c}`));
      } else {
        console.log('✅ Critic found no contradictions — scores validated');
      }

      return this.mergeCriticCorrections(draftAnalysis, criticResult, gateDecision);

    } catch (error) {
      console.warn('⚠️  Critic pass failed, returning draft analysis:', error.message);
      return draftAnalysis;
    }
  }

  // ─── buildCriticPrompt ────────────────────────────────────────────────────
  buildCriticPrompt(draftAnalysis, userAnswer, rubrics, gateDecision = null) {
    const gateHint = gateDecision?.decision === 'NEEDS_CONTEXT' && gateDecision?.hint
      ? `\nQUALITY GATE ALERT: The quality gate flagged this specific weakness:\n"${gateDecision.hint}"\nFocus your audit here first.\n`
      : '';

    return `You are auditing a TPM interview coach's SOARR scoring for accuracy.${gateHint}

CANDIDATE ANSWER:
"${userAnswer}"

DRAFT ANALYSIS TO REVIEW:
${JSON.stringify({
    soarr:              draftAnalysis.soarr,
    competencies:       draftAnalysis.competencies,
    improvements:       draftAnalysis.improvements,
    internal_reasoning: draftAnalysis.internal_reasoning
  }, null, 2)}

RUBRICS:
${JSON.stringify(rubrics.map(r => ({
    competency: r.competency_name,
    level_1:    r.level_1_description || r.level_1,
    level_3:    r.level_3_description || r.level_3,
    level_5:    r.level_5_description || r.level_5
  })), null, 2)}

YOUR AUDIT TASK — fix ONLY these three cases. Nothing else.

TYPE A — INVALID SCORE RANGE: Any SOARR score of 0 or >5. Correct to nearest valid value (1-5).

TYPE B — INCONSISTENT SOARR: Component text is "none stated" but score > 1. Correct score to 1.
  obstacle and reflection: if text = "none stated" → score MUST be 1. No exceptions.

TYPE C — COMPETENCY UNDER-SCORED: Competency score = 1 but evidence_inventory contains ANY relevant phrase.
  Score 1 means zero evidence. If the candidate mentioned ANY relevant action → minimum score 2.
  Check each competency scored 1:
  - Communication: any mention of updates, newsletters, stakeholder communication, status sharing?
  - Execution: any mention of ceremonies, roadmaps, phases, milestones?
  - Prioritization: any mention of ordering work, scoping, deciding what to do first?
  - Risk Mitigation: any mention of risks, dependencies, mitigation?
  - Strategic Influence: any mention of influencing stakeholders, buy-in, shaping direction?

DO NOT audit score accuracy, hallucinations, improvements quality, or anything else.
DO NOT correct scores upward unless TYPE C applies with exact candidate words.
If you cannot quote exact candidate words — do not make the correction.

RETURN JSON:
{
  "corrections_made": [
    "FORMAT: '[field] [old]→[new]: exact candidate words = \"[quote]\"'",
    "EXAMPLE: 'Communication 1→2: exact candidate words = \"share newsletter, weekly project updates\"'",
    "If no exact quote exists — do not include the entry."
  ],
  "soarr_corrections": {
    "situation":  { "corrected_score": null, "corrected_feedback": null },
    "obstacle":   { "corrected_score": null, "corrected_feedback": null },
    "action":     { "corrected_score": null, "corrected_feedback": null },
    "result":     { "corrected_score": null, "corrected_feedback": null },
    "reflection": { "corrected_score": null, "corrected_feedback": null }
  },
  "competency_corrections": { "CompetencyName": 3 },
  "critic_notes": "one sentence max — only if a correction was made. Empty string if no corrections.",
  "improvements_issues": []
}

CRITICAL RULES:
1. competency_corrections values must be plain integers ONLY — never objects.
2. ONLY make corrections for these three cases — nothing else:
   TYPE A: score is 0 or >5 (invalid range) — correct to nearest valid score
   TYPE B: soarr component text is "none stated" but score > 1 — correct score to 1
   TYPE C: competency score = 1 but evidence_inventory shows ANY evidence — correct to 2
3. If you write anything in critic_notes about a problem, you MUST make a correction for it.
   critic_notes + corrections_count=0 is a failure — diagnose AND fix or say nothing.
4. competency scoring rules:
   - Any evidence exists → minimum score 2
   - Evidence matches level_1 → score 2
   - Evidence matches level_3 → score 3
   - Evidence matches level_5 → score 4-5
5. obstacle and reflection: text="none stated" → score MUST be 1. No exceptions.`;
  }

  // ─── mergeCriticCorrections ───────────────────────────────────────────────
  mergeCriticCorrections(draftAnalysis, criticResult, gateDecision = null) {
    const merged = JSON.parse(JSON.stringify(draftAnalysis));

    if (criticResult.soarr_corrections && merged.soarr) {
      ['situation', 'obstacle', 'action', 'result', 'reflection'].forEach(component => {
        const correction = criticResult.soarr_corrections[component];
        if (correction && merged.soarr[component]) {
          if (correction.corrected_score !== null && correction.corrected_score !== undefined) {
            const rawScore  = typeof correction.corrected_score === 'object'
              ? (correction.corrected_score?.score ?? correction.corrected_score?.corrected_score ?? null)
              : correction.corrected_score;
            const safeScore = parseInt(rawScore);
            if (!isNaN(safeScore) && safeScore >= 1 && safeScore <= 5) {
              console.log(`  📝 Correcting soarr.${component} score: ${merged.soarr[component].score} → ${safeScore}`);
              merged.soarr[component].score = safeScore;
            }
          }
          if (correction.corrected_feedback !== null && correction.corrected_feedback !== undefined
            && typeof correction.corrected_feedback === 'string') {
            merged.soarr[component].feedback = correction.corrected_feedback;
          }
        }
      });
    }

    if (criticResult.competency_corrections) {
      Object.entries(criticResult.competency_corrections).forEach(([competency, rawCorrection]) => {
        if (rawCorrection === null || rawCorrection === undefined) return;
        if (!merged.competencies || merged.competencies[competency] === undefined) return;

        let finalScore = null;
        if (typeof rawCorrection === 'object') {
          finalScore = rawCorrection.corrected_score ?? rawCorrection.score ?? rawCorrection.value ?? null;
        } else {
          finalScore = rawCorrection;
        }

        const safeScore = parseInt(finalScore);
        if (!isNaN(safeScore) && safeScore >= 1 && safeScore <= 5) {
          console.log(`  📝 Correcting ${competency} score: ${merged.competencies[competency]} → ${safeScore}`);
          merged.competencies[competency] = safeScore;
        }
      });
    }

    merged._critic = {
      corrections_made:  criticResult.corrections_made  || [],
      critic_notes:      criticResult.critic_notes      || '',
      corrections_count: (criticResult.corrections_made || []).length
    };

    return merged;
  }

  // ─── validateAnalysis ─────────────────────────────────────────────────────
  validateAnalysis(analysis, rubrics) {
    console.log('🔍 Validating analysis results...');

    // ── SOARR validation ───────────────────────────────────────────────────
    const SOARR_COMPONENTS = ['situation', 'obstacle', 'action', 'result', 'reflection'];
    if (!analysis.soarr) {
      console.warn('⚠️  soarr block missing — initialising with defaults');
      analysis.soarr = {};
    }
    SOARR_COMPONENTS.forEach(component => {
      if (!analysis.soarr[component]) {
        console.warn(`⚠️  soarr.${component} missing — applying safe default`);
        analysis.soarr[component] = { score: 1, text: 'none stated', feedback: 'No feedback provided' };
      } else {
        const score = analysis.soarr[component].score;
        if (typeof score !== 'number' || score < 1 || score > 5 || !Number.isInteger(score)) {
          console.warn(`⚠️  Invalid SOARR score for ${component}: ${score} — clamping to 1`);
          analysis.soarr[component].score = Math.max(1, Math.min(5, Math.round(score) || 1));
        }
        analysis.soarr[component].text     = analysis.soarr[component].text     || 'none stated';
        analysis.soarr[component].feedback = analysis.soarr[component].feedback || 'No feedback provided';
      }
    });

    // Enforce TYPE 7: if reflection/obstacle score > 1 but text is empty, clamp score to 1
    if ((!analysis.soarr.reflection.text || analysis.soarr.reflection.text === 'none stated')
        && analysis.soarr.reflection.score > 1) {
      console.warn('⚠️  reflection score > 1 but no text — clamping to 1');
      analysis.soarr.reflection.score = 1;
    }
    if ((!analysis.soarr.obstacle.text || analysis.soarr.obstacle.text === 'none stated')
        && analysis.soarr.obstacle.score > 1) {
      console.warn('⚠️  obstacle score > 1 but no text — clamping to 1');
      analysis.soarr.obstacle.score = 1;
    }

    // Strip any star block the model may have returned — SOARR only
    if (analysis.star) {
      delete analysis.star;
      console.warn('⚠️  star block found in SOARR response — removed');
    }

    if (analysis.competencies) {
      const validatedCompetencies = {};
      const reasoningMap = {};

      const reasoning = analysis.internal_reasoning?.competency_reasoning;
      if (reasoning && typeof reasoning === 'object') {
        Object.entries(reasoning).forEach(([key, val]) => {
          if (val && typeof val === 'object' && val.score !== undefined) {
            reasoningMap[key] = parseInt(val.score);
          }
        });
      }

      rubrics.forEach(rubric => {
        const competencyName = rubric.competency_name;
        const score = analysis.competencies[competencyName];

        if (typeof score === 'number' && score > 0 && score <= 5 && Number.isInteger(score)) {
          validatedCompetencies[competencyName] = score;
        } else if (reasoningMap[competencyName] && reasoningMap[competencyName] > 0) {
          console.log(`  🔧 Recovering ${competencyName} from competency_reasoning: ${reasoningMap[competencyName]}`);
          validatedCompetencies[competencyName] = reasoningMap[competencyName];
        } else {
          console.warn(`⚠️  Invalid competency score for ${competencyName}: ${score} — defaulting to 1`);
          validatedCompetencies[competencyName] = 1;
        }
      });

      analysis.competencies = validatedCompetencies;
    }

    if (!Array.isArray(analysis.improvements)) {
      analysis.improvements = [];
    }

    // ── Rewrite hallucination guard ────────────────────────────────────────
    // Post-generation check: rejects invented numbers in rewritten_text.
    // Allowed sources: candidate answer, selected example texts, [placeholders].
    // When invented numbers are found the rewrite is REPLACED — not just flagged —
    // so the frontend never surfaces coaching malpractice to the candidate.
    if (analysis.improvements.length > 0 && analysis._sourceTexts) {
      const { userAnswer, exampleTexts } = analysis._sourceTexts;
      const allowedTexts = [userAnswer, ...exampleTexts].join(' ');

      // FIX: proper word-boundary regex — prevents partial-number matches
      const extractNumbers = (str) => {
        const matches = str.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
        return new Set(matches);
      };

      const allowedNumbers = extractNumbers(allowedTexts);
      // Bracket placeholders like [12 weeks] or [N engineers] are always allowed
      const PLACEHOLDER_RE = /\[[^\]]*\]/g;

      analysis.improvements = analysis.improvements.map(imp => {
        if (!imp.rewritten_text) return imp;

        const textWithoutPlaceholders = imp.rewritten_text.replace(PLACEHOLDER_RE, '');
        const rewriteNumbers = extractNumbers(textWithoutPlaceholders);
        const inventedNumbers = [...rewriteNumbers].filter(n => !allowedNumbers.has(n));

        if (inventedNumbers.length > 0) {
          console.warn(`⚠️  Hallucination guard: rewrite for [${imp.component}] contains invented number(s): ${inventedNumbers.join(', ')} — replacing rewrite`);
          // REPAIR: replace unsafe rewrite — never show invented specifics to candidate
          imp._hallucination_warning  = `Invented numbers detected: ${inventedNumbers.join(', ')}`;
          imp._hallucination_numbers  = inventedNumbers;
          imp.rewritten_text =
            `${imp.current_text} — add the specific [metric / timeline / team-size] ` +
            `that applies to your ${imp.component} here. ` +
            `Example structure: "[What you did] over [X weeks / N people] resulting in [outcome]."${
              imp.example_reference && imp.example_reference !== 'no example — candidate must supply'
                ? ` See ${imp.example_reference} for an example of the level of detail expected.`
                : ''
            }`;
        }

        return imp;
      });

      const flagged = analysis.improvements.filter(i => i._hallucination_warning).length;
      if (flagged > 0) {
        console.warn(`⚠️  Hallucination guard: ${flagged}/${analysis.improvements.length} rewrite(s) repaired`);
      } else {
        console.log('✅ Hallucination guard: all rewrites clean');
      }
    }

    // ── strength_tier + improvement count gate ──────────────────────────────
    {
      const soarr = analysis.soarr || {};
      const scores = ['situation','obstacle','action','result','reflection']
        .map(c => soarr[c]?.score)
        .filter(s => typeof s === 'number' && s >= 1 && s <= 5);

      const avg = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

      // Derive strength_tier from avg score
      const tier = avg >= 4.0 ? 'strong' : avg >= 2.5 ? 'medium' : 'weak';
      analysis.strength_tier = tier;

      // Enforce improvement count limits
      const limits = { strong: 2, medium: 3, weak: 5 };
      const maxImprovements = limits[analysis.strength_tier] ?? 5;

      if (Array.isArray(analysis.improvements) && analysis.improvements.length > maxImprovements) {
        // Sort by priority before trimming: critical > high > medium
        const priorityOrder = { critical: 0, high: 1, medium: 2 };
        analysis.improvements.sort((a, b) =>
          (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
        );
        const trimmed = analysis.improvements.length - maxImprovements;
        analysis.improvements = analysis.improvements.slice(0, maxImprovements);
        console.log(`✂️  strength_tier=${analysis.strength_tier} (avg=${avg.toFixed(1)}) — trimmed ${trimmed} improvement(s) to max ${maxImprovements}`);
      } else {
        console.log(`📊 strength_tier=${analysis.strength_tier} (avg=${avg.toFixed(1)}) — ${(analysis.improvements||[]).length} improvement(s)`);
      }

      // For strong answers: downgrade any remaining critical → high
      if (analysis.strength_tier === 'strong' && Array.isArray(analysis.improvements)) {
        analysis.improvements = analysis.improvements.map(imp => ({
          ...imp,
          priority: imp.priority === 'critical' ? 'high' : imp.priority
        }));
      }
    }

    // ── depth_signals validation ─────────────────────────────────────────────
    // Call 2 may return partial or malformed — enforce safe defaults.
    if (!analysis.depth_signals || typeof analysis.depth_signals !== 'object') {
      console.warn('⚠️  depth_signals missing or malformed — applying defaults');
      analysis.depth_signals = {
        shows_judgment:     false,
        shows_tradeoff:     false,
        shows_reflection:   false,
        authenticity_score: 1,
        interviewer_probe:  'What specific obstacle did you face, what decision did you make, and what was the measurable result?'
      };
    } else {
      analysis.depth_signals.shows_judgment    = analysis.depth_signals.shows_judgment    ?? false;
      analysis.depth_signals.shows_tradeoff    = analysis.depth_signals.shows_tradeoff    ?? false;
      analysis.depth_signals.shows_reflection  = analysis.depth_signals.shows_reflection  ?? false;
      analysis.depth_signals.authenticity_score = typeof analysis.depth_signals.authenticity_score === 'number'
        ? Math.max(1, Math.min(5, Math.round(analysis.depth_signals.authenticity_score)))
        : 1;
      analysis.depth_signals.interviewer_probe = analysis.depth_signals.interviewer_probe
        || 'What was the most critical decision you made, and what was the outcome?';
    }

    // ── coaching_summary validation ─────────────────────────────────────────
    if (!analysis.coaching_summary || typeof analysis.coaching_summary !== 'object') {
      console.warn('⚠️  coaching_summary missing or malformed — applying defaults');
      analysis.coaching_summary = {
        one_thing:        'Add concrete specifics — one obstacle, one decision, and one measurable result — to make this answer interview-ready.',
        score_potential:  3,
        weakness_pattern: 'framework without specifics',
        signal_density:   'low',
        daily_drill:      'Rewrite this answer out loud with one real obstacle you faced, one specific decision you made, and one number that shows the result.',
        interviewer_read: 'This answer sounds process-oriented but lacks enough concrete evidence to assess seniority or impact.'
      };
    } else {
      analysis.coaching_summary.one_thing        = analysis.coaching_summary.one_thing        || 'Add one concrete outcome to this answer.';
      analysis.coaching_summary.score_potential  = typeof analysis.coaching_summary.score_potential === 'number'
        ? Math.max(1, Math.min(5, Math.round(analysis.coaching_summary.score_potential)))
        : 3;
      analysis.coaching_summary.weakness_pattern = analysis.coaching_summary.weakness_pattern || 'framework without specifics';
      analysis.coaching_summary.signal_density   = ['low', 'medium', 'high'].includes(analysis.coaching_summary.signal_density)
        ? analysis.coaching_summary.signal_density : 'low';
      analysis.coaching_summary.daily_drill      = analysis.coaching_summary.daily_drill      || 'Rewrite this answer with one concrete obstacle and one measurable result.';
      analysis.coaching_summary.interviewer_read = analysis.coaching_summary.interviewer_read || 'Answer needs more specific evidence to assess impact.';
    }


    console.log('✅ Validation complete');
    return analysis;
  }

  // ─── getFallbackResponse ──────────────────────────────────────────────────
  getFallbackResponse(error, rubrics) {
    console.log('🔄 Generating fallback response...');

    const isCircuitOpen  = error.isCircuitBreakerOpen || (error.message?.includes('Circuit breaker is OPEN'));
    const isRateLimited  = error.status === 429 || (error.message?.includes('Rate limit'));

    const errorMessage = isCircuitOpen
      ? 'Analysis service is temporarily down. Please try again in a few minutes.'
      : isRateLimited
        ? 'Too many requests. Please wait a moment and try again.'
        : 'Analysis service encountered an error. Please try again.';

    const soarrFallback = ['situation', 'obstacle', 'action', 'result', 'reflection'].reduce((acc, key) => {
      acc[key] = { score: null, text: 'Analysis unavailable', feedback: errorMessage };
      return acc;
    }, {});

    // Competencies: null scores — never 0, schema requires 1-5 or null for fallback
    const competencies = Object.fromEntries(
      (rubrics || []).map(r => [r.competency_name, null])
    );

    return {
      analysis_status: 'fallback',
      soarr:           soarrFallback,
      competencies,
      improvements: [],
      depth_signals:    null,
      coaching_summary: null,
      _fallback:        true,
      _error:           error.message,
      _errorType:       isCircuitOpen ? 'circuit_breaker_open' : isRateLimited ? 'rate_limited' : 'unknown',
      _userMessage:     errorMessage
    };
  }

  getCircuitBreakerStatus() { return this.circuitBreaker.getMetrics(); }
  getRateLimiterStatus()    { return this.rateLimiter.getMetrics(); }
}

module.exports = CombinedAnalyzer;