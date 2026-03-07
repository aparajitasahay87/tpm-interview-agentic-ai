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
  async analyze(userAnswer, categoryId, rubrics, candidateLevel = null) {
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
        similarExamples = await this.rerankCandidates(candidates, userAnswer, rubrics);
        console.log(`✅ Reranker selected top 2: IDs ${similarExamples.map(e => e.id).join(', ')}`);
      }

      // FIX 2: Filter to high quality examples (score ≥ 4) only
      const highQualityExamples = similarExamples.filter(ex => ex.score >= 4);
      const examplesForAnalysis = highQualityExamples.length > 0
        ? highQualityExamples
        : similarExamples;

      console.log(`📊 Examples after quality filter: ${examplesForAnalysis.length} (${highQualityExamples.length} scored ≥4)`);

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

      // ── Step 4: Build combined prompt ─────────────────────────────────────
      const prompt = this.buildCombinedPrompt(userAnswer, enrichedExamples, rubrics);

      // ── Step 5: Main GPT-4o analysis call ────────────────────────────────
      console.log('🤖 Running combined analysis (GPT-4o)...');
      const analysis = await this.callCombinedAPI(prompt, rubrics);

      // ── Step 6: Agentic quality gate ──────────────────────────────────────
      console.log('🧠 Running agentic quality gate...');
      const gateDecision = await this.runQualityGate(analysis, userAnswer);
      console.log(`🚦 Gate: ${gateDecision.decision}${gateDecision.hint ? ' — ' + gateDecision.hint : ''}`);

      // ── Step 7: Critic loop ───────────────────────────────────────────────
      console.log('🔍 Running critic pass...');
      const criticedAnalysis = await this.runCriticPass(analysis, userAnswer, rubrics, gateDecision);

      // ── Step 8: Validate scores ───────────────────────────────────────────
      const validatedAnalysis = this.validateAnalysis(criticedAnalysis, rubrics);

      console.log('✅ Analysis complete (quality gate + critic verified)');
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
  async rerankCandidates(candidates, userAnswer, rubrics) {
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
   - Cloud migration question → needs migration examples (NOT disaster recovery)
   - Roadmap prioritization → needs prioritization/trade-off examples (NOT ops incidents)
   - Stakeholder conflict → needs influence/negotiation examples (NOT technical design)
   - Behavioral question (failure/risk/conflict/feedback) → needs behavioral examples ONLY
     (NOT program execution, NOT technical incidents, NOT project planning)
   - Partnership/trust question → needs partnership examples (NOT behavioral conflict)
   - Resourcing constraint → needs resource management examples (NOT project execution)
   - Bug/deployment question → needs technical incident examples (NOT program planning)
   Score 1.0 = exact same problem domain. Score 0.0 = completely different domain.
   PENALIZE examples that are semantically similar on surface but solve a different failure mode.

CATEGORY RULE: Each candidate has a comp_category field.
   - If question is Behavioral → candidates from Program Sense or Technical get domain_relevance_score <= 0.2
   - If question is Partnership → candidates from Behavioral or System Design get domain_relevance_score <= 0.2
   - If question is Technical → candidates from Program Sense or Behavioral get domain_relevance_score <= 0.2
   - If question is Program Sense → candidates from Behavioral or Technical get domain_relevance_score <= 0.2
   Only override this rule if the candidate's answer DIRECTLY addresses the same problem type.

2. COMPETENCY MATCH (competency_match_score):
   Do this example's demonstrated competencies align with what the question is testing?
   The question is being evaluated against these competencies: ${competencyNames.join(', ')}.
   Check the example's comp_scores — does it score highly on the relevant competencies?
   Score 1.0 = strong match across all relevant competencies.
   Score 0.0 = example demonstrates unrelated competencies.

You MUST score ALL ${candidates.length} candidates. The top 2 by final_score will be used.
final_score = domain_relevance_score × competency_match_score (computed by caller, not you).`,

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
// Debug — confirm comp_category is present on candidates

    // ── Reranker prompt ─────────────────────────────────────────────────
    const rerankPrompt = `Rank these ${candidates.length} TPM interview examples for the following candidate answer.

CANDIDATE'S ANSWER:
"${userAnswer}"

COMPETENCIES BEING TESTED: ${competencyNames.join(', ')}

CANDIDATES TO RANK:
${candidates.map(c => `
---
ID: ${c.id}
Category: ${c.comp_category || ''}
Question type: ${c.question_type || 'unknown'}
Question this example answers: ${c.question_text || 'unknown'}
Question this example answers: ${c.question_text || 'unknown'}
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
        return candidates.slice(0, 2);
      }

      let rankings;
      try {
        rankings = JSON.parse(toolCall.function.arguments).rankings;
      } catch (parseErr) {
        console.warn('⚠️  Reranker tool call parse failed — falling back to similarity ranking');
        return candidates.slice(0, 2);
      }

      if (!Array.isArray(rankings) || rankings.length === 0) {
        console.warn('⚠️  Reranker returned empty rankings — falling back to similarity ranking');
        return candidates.slice(0, 2);
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
          return { ...candidate, rerank_score: candidate.similarity * 0.3 };
        }

        const domainScore      = Math.min(1, Math.max(0, rank.domain_relevance_score    ?? 0));
        const competencyScore  = Math.min(1, Math.max(0, rank.competency_match_score    ?? 0));
        const finalScore       = candidate.similarity * domainScore * competencyScore;

        console.log(
          `  ID ${candidate.id} (${candidate.question_type}, ${candidate.level}): ` +
          `sim=${candidate.similarity.toFixed(2)} × ` +
          `domain=${domainScore.toFixed(2)} × ` +
          `comp=${competencyScore.toFixed(2)} = ` +
          `final=${finalScore.toFixed(3)}` +
          (rank.penalty_reason ? `  ⚠️  ${rank.penalty_reason}` : '')
        );

        return { ...candidate, rerank_score: finalScore };
      });

      // Sort descending by rerank_score, return top 2
      const top2 = scored
        .sort((a, b) => b.rerank_score - a.rerank_score)
        .slice(0, 2);

      console.log(`\n🏆 Top 2 selected: ${top2.map(e => `ID ${e.id} (score: ${e.rerank_score.toFixed(3)})`).join(', ')}\n`);
      return top2;

    } catch (error) {
      // Reranker failure is non-fatal — fall back to similarity ranking
      // The quality gate and critic loop still run on the main analysis
      console.warn(`⚠️  Reranker failed (${error.message}) — falling back to similarity ranking`);
      return candidates.slice(0, 2);
    }
  }

  // ─── buildCombinedPrompt ──────────────────────────────────────────────────
  // Unchanged from previous version — receives the same enrichedExamples shape
  buildCombinedPrompt(userAnswer, enrichedExamples, rubrics) {
    const promptData = {
      task: 'comprehensive_tpm_analysis',
      candidate_answer: userAnswer,
      ideal_examples: enrichedExamples.map((ex, idx) => ({
        id: idx + 1,
        score: ex.score,
        company: ex.company || null,
        level: ex.level || null,
        answer_text: ex.answer_text,
        star_breakdown: {
          situation: ex.star?.situation || null,
          task:      ex.star?.task      || null,
          action:    ex.star?.action    || null,
          result:    ex.star?.result    || null
        },
        metadata: {
          context:              ex.metadata?.context              || {},
          complexity_signals:   ex.metadata?.complexity_signals   || {},
          execution_evidence:   ex.metadata?.execution_evidence   || {},
          impact_signals:       ex.metadata?.impact_signals       || {}
        }
      })),
      rubrics: rubrics.map(r => ({
        competency: r.competency_name,
        level_1:    r.level_1_description || r.level_1,
        level_3:    r.level_3_description || r.level_3,
        level_5:    r.level_5_description || r.level_5
      })),
      instructions: {
        star_analysis:        'Break down the answer into Situation, Task, Action, Result. Score each component 1-5 based on clarity, specificity, and impact.',
        competency_scoring:   'For EACH competency: (1) find the closest matching level descriptor (level_1=1-2, level_3=3, level_5=4-5), (2) quote that descriptor verbatim, (3) cite the specific evidence from the candidate answer, (4) THEN assign the score. A score with no quoted descriptor is invalid.',
        improvements:         'Generate copy-paste ready improvements by referencing specific elements from ideal_examples. Be concrete and actionable.',
        critical_rules: [
          'Use exact numbers and details from ideal_examples when available',
          'Use star_breakdown fields (situation/task/action/result) from ideal_examples for direct component comparison',
          'Reference company and level from ideal_examples to show organizational scale',
          'Provide exact text to paste, not generic advice',
          'Only suggest improvements for components scoring < 4.5',
          'All scores must be integers between 0-5',
          'COMPETENCY RULE: You MUST quote the rubric level descriptor before assigning any competency score. No exceptions.',
          'ANTI-HALLUCINATION RULE: Never invent frameworks, metrics, or tools not in the candidate answer or ideal_examples metadata.'
        ]
      },
      output_format: {
        internal_reasoning: {
          description: 'COMPLETE THIS FIRST before providing scores.',
          evidence_inventory: {
            description: 'Extract ONLY what is explicitly in the candidate answer',
            tools_systems:          "list or 'none'",
            stakeholders:           "list or 'generic: my team'",
            metrics_numbers:        "list or 'none'",
            timeline:               "list or 'none'",
            company_team_context:   "list or 'none'",
            seniority_signals:      "list or 'none'"
          },
          gap_analysis: [
            'Compare inventory against ideal_examples star_breakdown and metadata',
            "Format: 'Missing: [element]. Ideal has: [specific detail]. Candidate inventory has: [what was found or none]'"
          ],
          score_reasoning: [
            "For EACH component: 'Scoring [component] as [X]/5 because inventory shows [present items] but missing [gaps]'"
          ],
          competency_reasoning: {
            description: 'REQUIRED — output ONE entry PER competency as a flat object keyed by competency name.',
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
        star: {
          situation: { score: 'integer 0-5', text: 'extracted text', feedback: 'gap reference' },
          task:      { score: 'integer 0-5', text: 'extracted text', feedback: 'gap reference' },
          action:    { score: 'integer 0-5', text: 'extracted text', feedback: 'gap reference' },
          result:    { score: 'integer 0-5', text: 'extracted text', feedback: 'gap reference' }
        },
        competencies: 'Object with competency names as keys and scores as values (integer 1-5). NEVER use 0.',
        improvements: [
          {
            priority:         'critical|high|medium',
            component:        'situation|task|action|result',
            gap_identified:   'Copy the EXACT gap from internal_reasoning.gap_analysis',
            current_text:     'Exact quote from candidate answer',
            rewritten_text:   'COMPLETE REWRITE using details from ideal_example star_breakdown and metadata',
            rationale:        "Why this gap matters — reference ideal_example's company/level and metadata",
            example_reference:'Example 1 or Example 2'
          }
        ]
      }
    };

    return `You are an expert TPM interview coach. Use chain-of-thought reasoning to analyze this answer comprehensively.

DATA:
${JSON.stringify(promptData, null, 2)}

CHAIN OF THOUGHT ANALYSIS PROCESS:

STEP 1 - EVIDENCE INVENTORY (Ground Truth — Do This First):
Extract ONLY what is explicitly stated in the candidate_answer. Do not infer or assume.
List exactly what is present:
- Tools/Systems: [e.g. "JIRA, AWS" or "none mentioned"]
- Stakeholders: [e.g. "VP of Engineering, 3 eng teams" or "generic: my team"]
- Metrics/Numbers: [e.g. "50% faster, $2M saved" or "none"]
- Timeline: [e.g. "6 months, Q1 2024" or "none"]
- Company/Team context: [e.g. "Meta, Payments team" or "none"]
- Seniority signals: [e.g. "led cross-functional team, reported to CTO" or "none"]

RULE: This inventory is your ground truth. You cannot reference anything in scoring or
feedback that is NOT in this inventory. No hallucinated evidence allowed.

STEP 2 - GAP ANALYSIS (Inventory vs Ideal):
Compare your Evidence Inventory against ideal_examples star_breakdown and metadata.
Format: "Missing: [element]. Ideal has: [specific detail from star_breakdown]. Candidate inventory has: [what was found or none]"

STEP 3 - SCORE + COMPETENCIES:
STAR Scoring — use gaps from Step 2:
- 5 = Inventory matches everything ideal examples have
- 4 = 1-2 minor items missing
- 3 = Important items missing (timeline, scale, or metrics)
- 2 = Multiple key items missing
- 1 = Inventory is nearly empty

Competency Scoring — for EACH competency:
1. Read ALL THREE level descriptors
2. Start from level_5 and work DOWN
3. QUOTE the matching descriptor verbatim
4. Cite the specific inventory item as evidence
5. Assign score (level_1→1-2, level_3→3, level_5→4-5)

STEP 4 - GAP-FILLING REWRITES:
For each gap scoring < 4.5, write a complete replacement using ideal_example details.

Now work through all 4 steps, then return your final analysis in the specified output_format as valid JSON.`;
  }

  // ─── callCombinedAPI ──────────────────────────────────────────────────────
  async callCombinedAPI(prompt, rubrics) {
    return await this.rateLimiter.execute(async () => {
      return await this.circuitBreaker.execute(async () => {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert TPM interview coach. You provide comprehensive, specific feedback in structured JSON format. Always return valid JSON with all required fields.'
            },
            { role: 'user', content: prompt }
          ],
          temperature:     0.3,
          max_tokens:      4500,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        console.log('📥 GPT-4o response received');
        return JSON.parse(content);
      });
    }, 'combined-analysis');
  }

  // ─── runQualityGate ───────────────────────────────────────────────────────
  async runQualityGate(analysis, userAnswer) {
    try {
      const inv            = analysis.internal_reasoning?.evidence_inventory || {};
      const hasMetrics     = inv.metrics_numbers && inv.metrics_numbers !== 'none';
      const hasStakeholders= inv.stakeholders && !inv.stakeholders.toLowerCase().includes('generic');
      const hasTimeline    = inv.timeline && inv.timeline !== 'none';
      const hasTools       = inv.tools_systems && inv.tools_systems !== 'none';
      const evidenceCount  = [hasMetrics, hasStakeholders, hasTimeline, hasTools].filter(Boolean).length;

      const starScores = analysis.star
        ? Object.entries(analysis.star).map(([k, v]) => `${k}: ${v?.score ?? '?'}/5`).join(', ')
        : 'unavailable';

      const gatePrompt = `You are a quality gate in a TPM interview coaching pipeline.

Pass 2 analysis just completed. Make ONE routing decision:
- PROCEED: evidence is sufficient to deliver useful coaching feedback
- NEEDS_CONTEXT: a critical element is missing — flag it for the critic

PASS 2 EVIDENCE SUMMARY:
STAR scores: ${starScores}
Evidence found:
- Metrics/numbers:  ${hasMetrics       ? inv.metrics_numbers : 'none'}
- Stakeholders:     ${hasStakeholders  ? inv.stakeholders    : 'generic only'}
- Timeline:         ${hasTimeline      ? inv.timeline        : 'none'}
- Tools/systems:    ${hasTools         ? inv.tools_systems   : 'none'}
Evidence count: ${evidenceCount}/4

DECISION RULES (apply in order):
1. If all STAR scores >= 3  → PROCEED
2. If evidenceCount >= 3    → PROCEED
3. If evidenceCount <= 2 AND any STAR score <= 2 → NEEDS_CONTEXT
4. Otherwise                → PROCEED

Return JSON only:
{
  "decision": "PROCEED" or "NEEDS_CONTEXT",
  "hint": "one sentence for the critic — null if PROCEED",
  "reason": "one sentence explaining your decision"
}`;

      const response = await this.rateLimiter.execute(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await this.openai.chat.completions.create({
            model:           'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a quality gate. Return only valid JSON.' },
              { role: 'user',   content: gatePrompt }
            ],
            temperature:     0.1,
            max_tokens:      150,
            response_format: { type: 'json_object' }
          });
        });
      }, 'quality-gate');

      const result = JSON.parse(response.choices[0].message.content);
      if (!['PROCEED', 'NEEDS_CONTEXT'].includes(result.decision)) {
        return { decision: 'PROCEED', hint: null, reason: 'invalid response — defaulting' };
      }
      return { decision: result.decision, hint: result.hint || null, reason: result.reason || '' };

    } catch (error) {
      console.warn('⚠️  Quality gate failed, defaulting to PROCEED:', error.message);
      return { decision: 'PROCEED', hint: null, reason: 'gate error — defaulting' };
    }
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

    return `You are auditing a TPM interview coach's scoring for accuracy.${gateHint}

CANDIDATE ANSWER:
"${userAnswer}"

DRAFT ANALYSIS TO REVIEW:
${JSON.stringify({
    star:               draftAnalysis.star,
    competencies:       draftAnalysis.competencies,
    internal_reasoning: draftAnalysis.internal_reasoning
  }, null, 2)}

RUBRICS:
${JSON.stringify(rubrics.map(r => ({
    competency: r.competency_name,
    level_1:    r.level_1_description || r.level_1,
    level_3:    r.level_3_description || r.level_3,
    level_5:    r.level_5_description || r.level_5
  })), null, 2)}

YOUR AUDIT TASK — check for these contradiction types:
TYPE 1 - SCORE TOO LOW: Evidence exists in inventory but score doesn't reflect it.
TYPE 2 - SCORE TOO HIGH: Score given but inventory has no supporting evidence.
TYPE 3 - HALLUCINATED EVIDENCE: Feedback references something NOT in evidence_inventory.
TYPE 4 - INVALID ZERO SCORES: Any competency scored 0 is invalid — minimum is 1.
TYPE 5 - HALLUCINATION IN IMPROVEMENTS: Rewrite contains details not in candidate answer or ideal examples.
TYPE 6 - IMPROVEMENTS NOT GROUNDED: Rewrite gives generic advice instead of using specific details from ideal examples.

RETURN JSON:
{
  "corrections_made": ["list of corrections — empty array if none"],
  "star_corrections": {
    "situation": { "corrected_score": null, "corrected_feedback": null },
    "task":      { "corrected_score": null, "corrected_feedback": null },
    "action":    { "corrected_score": null, "corrected_feedback": null },
    "result":    { "corrected_score": null, "corrected_feedback": null }
  },
  "competency_corrections": { "CompetencyName": 3 },
  "critic_notes": "overall assessment",
  "improvements_issues": ["TYPE 5/6 issues — empty array if none"]
}

CRITICAL: competency_corrections values must be plain integers ONLY — never objects.
Only correct where contradiction is clear and evidence-based.`;
  }

  // ─── mergeCriticCorrections ───────────────────────────────────────────────
  mergeCriticCorrections(draftAnalysis, criticResult, gateDecision = null) {
    const merged = JSON.parse(JSON.stringify(draftAnalysis));

    if (criticResult.star_corrections) {
      ['situation', 'task', 'action', 'result'].forEach(component => {
        const correction = criticResult.star_corrections[component];
        if (correction) {
          if (correction.corrected_score !== null && correction.corrected_score !== undefined) {
            const rawScore  = typeof correction.corrected_score === 'object'
              ? (correction.corrected_score?.score ?? correction.corrected_score?.corrected_score ?? null)
              : correction.corrected_score;
            const safeScore = parseInt(rawScore);
            if (!isNaN(safeScore) && safeScore >= 1 && safeScore <= 5) {
              console.log(`  📝 Correcting ${component} score: ${merged.star[component].score} → ${safeScore}`);
              merged.star[component].score = safeScore;
            }
          }
          if (correction.corrected_feedback !== null && correction.corrected_feedback !== undefined
            && typeof correction.corrected_feedback === 'string') {
            merged.star[component].feedback = correction.corrected_feedback;
          }
        }
      });
    }

    if (criticResult.competency_corrections) {
      Object.entries(criticResult.competency_corrections).forEach(([competency, rawCorrection]) => {
        if (rawCorrection === null || rawCorrection === undefined) return;
        if (merged.competencies[competency] === undefined) return;

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

    if (analysis.star) {
      ['situation', 'task', 'action', 'result'].forEach(component => {
        if (analysis.star[component]) {
          const score = analysis.star[component].score;
          if (typeof score !== 'number' || score < 0 || score > 5 || !Number.isInteger(score)) {
            console.warn(`⚠️  Invalid STAR score for ${component}: ${score} — clamping`);
            analysis.star[component].score = Math.max(0, Math.min(5, Math.round(score) || 0));
          }
          analysis.star[component].text     = analysis.star[component].text     || 'Not found';
          analysis.star[component].feedback = analysis.star[component].feedback || 'No feedback provided';
        }
      });
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

    console.log('✅ Validation complete');
    return analysis;
  }

  // ─── getFallbackResponse ──────────────────────────────────────────────────
  getFallbackResponse(error, rubrics) {
    console.log('🔄 Generating fallback response...');

    const isCircuitOpen  = error.isCircuitBreakerOpen || (error.message?.includes('Circuit breaker is OPEN'));
    const isRateLimited  = error.status === 429 || (error.message?.includes('Rate limit'));

    const star = ['situation', 'task', 'action', 'result'].reduce((acc, key) => {
      acc[key] = { score: 0, text: 'Analysis unavailable', feedback: 'Service temporarily unavailable. Please try again.' };
      return acc;
    }, {});

    const competencies = {};
    rubrics.forEach(r => { competencies[r.competency_name] = 0; });

    const errorMessage = isCircuitOpen
      ? 'Analysis service is temporarily down. Please try again in a few minutes.'
      : isRateLimited
        ? 'Too many requests. Please wait a moment and try again.'
        : 'Analysis service encountered an error. Please try again.';

    return {
      star,
      competencies,
      improvements: [{
        priority:         'critical',
        component:        'system',
        gap_identified:   'Service Error',
        current_text:     'Service Error',
        rewritten_text:   errorMessage,
        rationale:        'System is temporarily unable to process your request',
        example_reference:'N/A'
      }],
      _fallback:   true,
      _error:      error.message,
      _errorType:  isCircuitOpen ? 'circuit_breaker_open' : isRateLimited ? 'rate_limited' : 'unknown'
    };
  }

  getCircuitBreakerStatus() { return this.circuitBreaker.getMetrics(); }
  getRateLimiterStatus()    { return this.rateLimiter.getMetrics(); }
}

module.exports = CombinedAnalyzer;