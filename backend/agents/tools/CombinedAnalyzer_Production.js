const OpenAI = require('openai');
const SemanticSearch = require('./SemanticSearch');
const MetadataExtractor = require('./MetadataExtractor_Adaptive'); // Using adaptive version for flexible extraction
const { CircuitBreaker } = require('../../utils/CircuitBreaker');
const { getRateLimiter } = require('../../utils/RateLimiter');

/**
 * COMBINED ANALYZER - PRODUCTION VERSION
 * 
 * Optimizations:
 * - Single API call for STAR + Competencies + Feedback
 * - Circuit breaker for API resilience
 * - Rate limiter to prevent 429 errors
 * - Score validation to ensure data quality
 * - Fallback responses when services fail
 * 
 * Reduces: 6 API calls → 2 API calls (67% reduction)
 * 
 * v2 Improvements:
 * - FIX 1: max_tokens raised 3000 → 4500 (prevents chain-of-thought truncation)
 * - FIX 2: Score filter ≥ 4 on retrieved examples (only pass high quality to LLM)
 * - FIX 3: Pass star_breakdown + company + level from SemanticSearch to prompt (richer comparison context)
 */
class CombinedAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.semanticSearch = new SemanticSearch();
    this.metadataExtractor = new MetadataExtractor();
    
    // Circuit breaker - prevents cascading failures
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,      // Open circuit after 3 failures
      recoveryTimeout: 30000,   // Try recovery after 30s
      monitoringPeriod: 60000   // Reset failure count after 1 min
    });
    
    // Rate limiter - singleton instance shared across app
    this.rateLimiter = getRateLimiter();
  }

  /**
   * Analyze user answer in single combined call
   * @param {string} userAnswer - User's answer text
   * @param {number} categoryId - Question category
   * @param {Array} rubrics - Category rubrics for competency scoring
   * @returns {Promise<Object>} Complete analysis
   */
  async analyze(userAnswer, categoryId, rubrics) {
    try {
      console.log('🚀 Starting combined analysis...');
      console.log(`📊 Category: ${categoryId}, Rubrics: ${rubrics.length}`);

      // Step 1: Semantic search for ideal examples (uses embedding API)
      console.log('🔍 Finding similar examples...');
      const similarExamples = await this.semanticSearch.findSimilarAnswers(
        userAnswer,
        categoryId,
        2 // Top 2 examples
      );

      // FIX 2: Filter to high quality examples (score >= 4) only
      // Falls back to all results if none meet the threshold (prevents empty context)
      const highQualityExamples = similarExamples.filter(ex => ex.score >= 4);
      const examplesForAnalysis = highQualityExamples.length > 0 
        ? highQualityExamples 
        : similarExamples;

      console.log(`📊 Examples after quality filter: ${examplesForAnalysis.length} (${highQualityExamples.length} scored ≥4, ${similarExamples.length} total found)`);

      // Step 2: Extract metadata from examples (if found)
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
        console.log('⚠️  No similar examples found');
      }

      // Step 3: Build combined prompt
      const prompt = this.buildCombinedPrompt(
        userAnswer,
        enrichedExamples,
        rubrics
      );

      // Step 4: Single GPT-4o call with circuit breaker + rate limiter
      console.log('🤖 Running combined analysis (with circuit breaker + rate limiter)...');
      const analysis = await this.callCombinedAPI(prompt, rubrics);

      // Step 5: Validate scores
      const validatedAnalysis = this.validateAnalysis(analysis, rubrics);

      // Step 6: CRITIC LOOP - second pass to catch score contradictions
      console.log('🔍 Running critic pass to verify scores...');
      const criticedAnalysis = await this.runCriticPass(validatedAnalysis, userAnswer, rubrics);

      console.log('✅ Combined analysis complete (with critic verification)');
      return criticedAnalysis;

    } catch (error) {
      console.error('❌ Combined analysis error:', error.message);
      
      // Return graceful fallback instead of throwing
      return this.getFallbackResponse(error, rubrics);
    }
  }

  /**
   * Build comprehensive prompt with JSON structure (more efficient for GPT parsing)
   */
  buildCombinedPrompt(userAnswer, enrichedExamples, rubrics) {
    // Build structured JSON data
    const promptData = {
      task: "comprehensive_tpm_analysis",
      candidate_answer: userAnswer,
      // FIX 3: Now includes star_breakdown (pre-parsed STAR components), company, and level
      // These fields come directly from SemanticSearch DB fetch - no extra cost
      ideal_examples: enrichedExamples.map((ex, idx) => ({
        id: idx + 1,
        score: ex.score,
        company: ex.company || null,       // FIX 3: adds org context (e.g. "Meta", "Google")
        level: ex.level || null,           // FIX 3: adds seniority context (e.g. "Senior TPM")
        answer_text: ex.answer_text,       // Full answer text (fetched from DB by SemanticSearch)
        star_breakdown: {                  // FIX 3: pre-parsed STAR components for direct comparison
          situation: ex.star?.situation || null,
          task: ex.star?.task || null,
          action: ex.star?.action || null,
          result: ex.star?.result || null
        },
        metadata: {
          // Correctly mapped to MetadataExtractor_Adaptive output schema
          context: ex.metadata?.context || {},                         // org scale, scope, environment, seniority indicators
          complexity_signals: ex.metadata?.complexity_signals || {},   // team scale, timeline, technical scope, constraints
          execution_evidence: ex.metadata?.execution_evidence || {},   // stakeholders, processes, tools, decision frameworks
          impact_signals: ex.metadata?.impact_signals || {}            // quantified metrics, comparative metrics, business impact
        }
      })),
      rubrics: rubrics.map(r => ({
        competency: r.competency_name,
        level_1: r.level_1_description || r.level_1,
        level_3: r.level_3_description || r.level_3,
        level_5: r.level_5_description || r.level_5
      })),
      instructions: {
        star_analysis: "Break down the answer into Situation, Task, Action, Result. Score each component 1-5 based on clarity, specificity, and impact.",
        competency_scoring: "For EACH competency: (1) find the closest matching level descriptor (level_1=1-2, level_3=3, level_5=4-5), (2) quote that descriptor verbatim, (3) cite the specific evidence from the candidate answer, (4) THEN assign the score. A score with no quoted descriptor is invalid.",
        improvements: "Generate copy-paste ready improvements by referencing specific elements from ideal_examples. Be concrete and actionable.",
        critical_rules: [
          "Use exact numbers and details from ideal_examples when available",
          "Use star_breakdown fields (situation/task/action/result) from ideal_examples for direct component comparison",
          "Reference company and level from ideal_examples to show organizational scale (e.g. 'Example 1 is a Senior TPM at Meta')",
          "Provide exact text to paste, not generic advice",
          "Only suggest improvements for components scoring < 4.5",
          "All scores must be integers between 0-5",
          "COMPETENCY RULE: You MUST quote the rubric level descriptor before assigning any competency score. No exceptions. Format: descriptor_quoted → evidence_found → score"
        ]
      },
      output_format: {
        internal_reasoning: {
          description: "COMPLETE THIS FIRST before providing scores. This is your internal thought process - be explicit about what you see.",
          
          evidence_inventory: {
            description: "COMPLETE THIS FIRST — extract only what is explicitly in the candidate answer",
            tools_systems: "list or 'none'",
            stakeholders: "list or 'generic: my team'",
            metrics_numbers: "list or 'none'",
            timeline: "list or 'none'",
            company_team_context: "list or 'none'",
            seniority_signals: "list or 'none'"
          },

          gap_analysis: [
            "Compare inventory against ideal_examples star_breakdown and metadata",
            "Format: 'Missing: [element]. Ideal has: [specific detail]. Candidate inventory has: [what was found or none]'",
            "Example: 'Missing: company context. Ideal has: Meta (Fortune 500). Candidate inventory has: none'",
            "Example: 'Missing: quantified metrics. Ideal has: 51% improvement. Candidate inventory has: none'",
            "Only reference what is in the evidence_inventory — no assumptions"
          ],

          score_reasoning: [
            "For EACH component: 'Scoring [component] as [X]/5 because inventory shows [present items] but missing [gaps]'",
            "Example: 'Scoring Result as 2/5 because inventory has no metrics, no timeline, no business impact'",
            "Link every score to inventory findings"
          ],

          competency_reasoning: {
            description: "REQUIRED for every competency before the competencies object. Must follow this exact structure for each:",
            format: {
              competency_name: "exact name from rubric",
              closest_level: "level_1 | level_3 | level_5",
              descriptor_quoted: "verbatim quote of the matching level descriptor from rubrics",
              evidence_found: "specific phrase or sentence from candidate answer that matches",
              score: "integer 1-5 derived from closest_level (level_1→1-2, level_3→3, level_5→4-5)"
            },
            rule: "If you cannot quote a descriptor, you cannot assign a score. No descriptor = no score."
          }
        },
        
        star: {
          situation: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          },
          task: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          },
          action: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          },
          result: { 
            score: "integer 0-5 (based on internal_reasoning above)", 
            text: "extracted text from candidate answer", 
            feedback: "Reference specific gap from internal_reasoning.gap_analysis"
          }
        },
        
        competencies: "Object with competency names as keys (string) and scores as values (integer 1-5). Each score must be backed by competency_reasoning above.",
        
        improvements: [
          {
            priority: "critical|high|medium",
            component: "situation|task|action|result",
            gap_identified: "Copy the EXACT gap from internal_reasoning.gap_analysis that this improvement addresses",
            current_text: "Exact quote from candidate's answer (the incomplete version)",
            rewritten_text: "COMPLETE REWRITE showing how to fill the gap using details from ideal_example star_breakdown and metadata. Don't say 'add X', write the full improved sentence.",
            rationale: "Explain WHY this gap matters referencing ideal_example's company/level and metadata (e.g., 'Ideal Senior TPM at Meta has impact_signals.quantified_metrics showing 51% improvement — candidate has no metrics')",
            example_reference: "Example 1 or Example 2"
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
For each STAR component identify the delta:
- What does ideal_example star_breakdown.[component] contain?
- What is in the candidate's inventory for this component?
- What is missing? (reference inventory — not the raw answer)

Format: "Missing: [element]. Ideal has: [specific detail from star_breakdown]. Candidate inventory has: [what was found or none]"
Use metadata fields: context.organizational_scale, complexity_signals.team_scale, 
execution_evidence.tools_technologies, impact_signals.quantified_metrics

STEP 3 - SCORE + COMPETENCIES:
STAR Scoring — use gaps from Step 2:
- 5 = Inventory matches everything ideal examples have
- 4 = 1-2 minor items missing from inventory
- 3 = Important items missing (timeline, scale, or metrics)
- 2 = Multiple key items missing from inventory
- 1 = Inventory is nearly empty

Write score reasoning: "Scoring [component] as [X]/5 because inventory shows [what's present] 
but is missing [specific gaps from Step 2]"

Competency Scoring — for EACH competency:
1. Read ALL THREE level descriptors (level_1, level_3, level_5)
2. Start from level_5 and work DOWN — ask "does the inventory support this level?"
3. Do NOT default to level_1 — check level_3 and level_5 first
4. QUOTE the matching descriptor verbatim
5. Cite the specific inventory item as evidence
6. Assign score (level_1→1-2, level_3→3, level_5→4-5)

INVENTORY SIGNALS THAT INDICATE LEVEL_3 MINIMUM:
- Specific tools named (JIRA, AWS, Terraform etc.) → minimum score 2-3
- Named stakeholder groups (engineering teams, product managers) → minimum score 2-3
- Specific timeline mentioned (8 months, Q1 2024) → minimum score 2-3
- Coordination across multiple teams → minimum score 2-3

INVENTORY SIGNALS THAT INDICATE LEVEL_5:
- C-suite or VP-level stakeholders
- Quantified business impact (ROI, cost savings, % improvement)
- Cross-organizational coalition building (3+ orgs)
- Framework or process adopted company-wide

FORMAT: "[Competency]: closest_level=level_3, descriptor='[exact quote]', evidence='[from inventory]', score=3"
A score with no quoted descriptor is invalid.
Do NOT assign level_1 if inventory contains specific tools, teams, or timelines.

STEP 4 - GAP-FILLING REWRITES:
For each gap scoring < 4.5:
1. State the gap (from Step 2)
2. Quote candidate's current text
3. Write complete rewrite using ideal_example star_breakdown, company, level, 
   and metadata (impact_signals.quantified_metrics, execution_evidence.tools_technologies)
4. Never say "add metrics" — write "I reduced latency from 340ms to 165ms (51% improvement)"

CRITICAL RULES:
- Evidence Inventory is ground truth — never reference evidence not in the inventory
- Every score must reference inventory findings and gaps
- Rewrites are complete replacements not suggestions
- Use exact details from ideal_examples: star_breakdown, company, level, metadata signals

Now work through all 4 steps, then return your final analysis in the specified output_format as valid JSON.`;
  }

  /**
   * Call OpenAI API with circuit breaker + rate limiter protection
   */
  async callCombinedAPI(prompt, rubrics) {
    // Double-wrapped: Rate Limiter → Circuit Breaker → OpenAI
    return await this.rateLimiter.execute(async () => {
      return await this.circuitBreaker.execute(async () => {
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert TPM interview coach. You provide comprehensive, specific feedback in structured JSON format. Always return valid JSON with all required fields.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4500,  // FIX 1: Raised from 3000 → 4500 to prevent chain-of-thought truncation
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        console.log('📥 GPT-4o response received');
        
        return JSON.parse(content);
        
      });
    }, 'combined-analysis');
  }

  /**
   * CRITIC LOOP - Pass 2
   * Reviews the draft analysis for score contradictions
   * Uses gpt-4o-mini (cheaper) since it's reviewing structured JSON not generating from scratch
   */
  async runCriticPass(draftAnalysis, userAnswer, rubrics) {
    try {
      const criticPrompt = this.buildCriticPrompt(draftAnalysis, userAnswer, rubrics);

      const response = await this.rateLimiter.execute(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',   // Cheaper model sufficient for review task
            messages: [
              {
                role: 'system',
                content: 'You are a strict TPM interview scoring auditor. Your job is to find contradictions between evidence and scores, then correct them. Return only valid JSON.'
              },
              {
                role: 'user',
                content: criticPrompt
              }
            ],
            temperature: 0.1,       // Very low — critic should be deterministic
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          });
        });
      }, 'critic-pass');

      const criticResult = JSON.parse(response.choices[0].message.content);
      console.log('📋 Critic pass complete');

      // Log any corrections made
      if (criticResult.corrections_made && criticResult.corrections_made.length > 0) {
        console.log(`⚠️  Critic corrected ${criticResult.corrections_made.length} score(s):`);
        criticResult.corrections_made.forEach(c => console.log(`   ${c}`));
      } else {
        console.log('✅ Critic found no contradictions — scores validated');
      }

      // Merge critic corrections back into the draft analysis
      return this.mergeCriticCorrections(draftAnalysis, criticResult);

    } catch (error) {
      // If critic fails, return original analysis — never block on critic errors
      console.warn('⚠️  Critic pass failed, returning draft analysis:', error.message);
      return draftAnalysis;
    }
  }

  /**
   * Build the critic prompt
   * Provides draft analysis and asks critic to find contradictions
   */
  buildCriticPrompt(draftAnalysis, userAnswer, rubrics) {
    return `You are auditing a TPM interview coach's scoring for accuracy.

CANDIDATE ANSWER:
"${userAnswer}"

DRAFT ANALYSIS TO REVIEW:
${JSON.stringify({
  star: draftAnalysis.star,
  competencies: draftAnalysis.competencies,
  internal_reasoning: draftAnalysis.internal_reasoning
}, null, 2)}

RUBRICS:
${JSON.stringify(rubrics.map(r => ({
  competency: r.competency_name,
  level_1: r.level_1_description || r.level_1,
  level_3: r.level_3_description || r.level_3,
  level_5: r.level_5_description || r.level_5
})), null, 2)}

YOUR AUDIT TASK:
Use the evidence_inventory in internal_reasoning as your ground truth.
For each STAR component and competency, check for these contradiction types:

TYPE 1 - SCORE TOO LOW:
Evidence exists in inventory but score does not reflect it.
Example: "Inventory shows '50% faster' but Result scored 2/5. This metric matches level_3, score should be 3/5."

TYPE 2 - SCORE TOO HIGH:
Score given but inventory does not contain supporting evidence.
Example: "Action scored 4/5 but inventory shows no tools, no specific stakeholders — only generic 'worked with team'. Should be 2/5."

TYPE 3 - HALLUCINATED EVIDENCE:
Feedback or reasoning references something NOT in the evidence_inventory.
Example: "Feedback says 'candidate mentioned AWS' but inventory shows tools: none. Remove this reference."

RETURN JSON — follow this format exactly:
{
  "corrections_made": ["list of corrections as strings, empty array if none"],
  "star_corrections": {
    "situation": { "corrected_score": null, "corrected_feedback": null },
    "task": { "corrected_score": null, "corrected_feedback": null },
    "action": { "corrected_score": null, "corrected_feedback": null },
    "result": { "corrected_score": null, "corrected_feedback": null }
  },
  "competency_corrections": {
    "CompetencyName": 3
  },
  "critic_notes": "overall assessment of draft quality"
}

CRITICAL FORMAT RULES:
- competency_corrections values must be plain integers ONLY — never objects
- Example correct:   "Adaptability": 2
- Example WRONG:     "Adaptability": { "corrected_score": 2 }
- star_corrections use null for fields that need no correction
- Only populate fields where you found a genuine contradiction
- Be conservative — only correct when contradiction is clear and evidence-based`;
  }

  /**
   * Merge critic corrections into draft analysis
   * Only overwrites fields where critic found genuine contradictions
   */
  mergeCriticCorrections(draftAnalysis, criticResult) {
    const merged = JSON.parse(JSON.stringify(draftAnalysis)); // deep clone

    // Apply STAR corrections
    if (criticResult.star_corrections) {
      ['situation', 'task', 'action', 'result'].forEach(component => {
        const correction = criticResult.star_corrections[component];
        if (correction) {
          if (correction.corrected_score !== null && correction.corrected_score !== undefined) {
            console.log(`  📝 Correcting ${component} score: ${merged.star[component].score} → ${correction.corrected_score}`);
            merged.star[component].score = correction.corrected_score;
          }
          if (correction.corrected_feedback !== null && correction.corrected_feedback !== undefined) {
            merged.star[component].feedback = correction.corrected_feedback;
          }
        }
      });
    }

    // Apply competency corrections
    // Handle both integer format (correct) and object format (defensive fallback)
    if (criticResult.competency_corrections) {
      Object.entries(criticResult.competency_corrections).forEach(([competency, correctedScore]) => {
        if (correctedScore === null || correctedScore === undefined) return;
        if (merged.competencies[competency] === undefined) return;

        // Defensive: extract integer whether critic returned 3 or { corrected_score: 3 }
        const finalScore = typeof correctedScore === 'object'
          ? (correctedScore.corrected_score ?? null)
          : correctedScore;

        if (finalScore !== null && Number.isInteger(finalScore) && finalScore >= 0 && finalScore <= 5) {
          console.log(`  📝 Correcting ${competency} score: ${merged.competencies[competency]} → ${finalScore}`);
          merged.competencies[competency] = finalScore;
        } else {
          console.warn(`  ⚠️  Skipping invalid critic correction for ${competency}: ${JSON.stringify(correctedScore)}`);
        }
      });
    }

    // Add critic metadata to response for transparency
    // This field is preserved through validateAnalysis and returned to the API
    merged._critic = {
      corrections_made: criticResult.corrections_made || [],
      critic_notes: criticResult.critic_notes || '',
      corrections_count: (criticResult.corrections_made || []).length,
      ran: true
    };

    console.log(`  📊 Critic summary: ${merged._critic.corrections_count} corrections, notes: "${merged._critic.critic_notes?.substring(0, 80)}"`);

    return merged;
  }

  /**
   * CRITIC LOOP - Pass 2
   * Reviews the draft analysis for score contradictions
   * Uses gpt-4o-mini (cheaper) since it's reviewing structured JSON not generating from scratch
   */
  async runCriticPass(draftAnalysis, userAnswer, rubrics) {
    try {
      const criticPrompt = this.buildCriticPrompt(draftAnalysis, userAnswer, rubrics);

      const response = await this.rateLimiter.execute(async () => {
        return await this.circuitBreaker.execute(async () => {
          return await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',   // Cheaper model sufficient for review task
            messages: [
              {
                role: 'system',
                content: 'You are a strict TPM interview scoring auditor. Your job is to find contradictions between evidence and scores, then correct them. Return only valid JSON.'
              },
              {
                role: 'user',
                content: criticPrompt
              }
            ],
            temperature: 0.1,       // Very low — critic should be deterministic
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          });
        });
      }, 'critic-pass');

      const criticResult = JSON.parse(response.choices[0].message.content);
      console.log('📋 Critic pass complete');

      // Log any corrections made
      if (criticResult.corrections_made && criticResult.corrections_made.length > 0) {
        console.log(`⚠️  Critic corrected ${criticResult.corrections_made.length} score(s):`);
        criticResult.corrections_made.forEach(c => console.log(`   ${c}`));
      } else {
        console.log('✅ Critic found no contradictions — scores validated');
      }

      // Merge critic corrections back into the draft analysis
      return this.mergeCriticCorrections(draftAnalysis, criticResult);

    } catch (error) {
      // If critic fails, return original analysis — never block on critic errors
      console.warn('⚠️  Critic pass failed, returning draft analysis:', error.message);
      return draftAnalysis;
    }
  }

  /**
   * Build the critic prompt
   * Provides draft analysis and asks critic to find contradictions
   */
  buildCriticPrompt(draftAnalysis, userAnswer, rubrics) {
    return `You are auditing a TPM interview coach's scoring for accuracy.

CANDIDATE ANSWER:
"${userAnswer}"

DRAFT ANALYSIS TO REVIEW:
${JSON.stringify({
  star: draftAnalysis.star,
  competencies: draftAnalysis.competencies,
  internal_reasoning: draftAnalysis.internal_reasoning
}, null, 2)}

RUBRICS:
${JSON.stringify(rubrics.map(r => ({
  competency: r.competency_name,
  level_1: r.level_1_description || r.level_1,
  level_3: r.level_3_description || r.level_3,
  level_5: r.level_5_description || r.level_5
})), null, 2)}

YOUR AUDIT TASK:
For each STAR component and each competency, check for these contradiction types:

TYPE 1 - SCORE TOO LOW:
"The candidate mentioned [specific evidence] but was scored [X]/5. This evidence matches level_[Y] descriptor which justifies [X+1]/5."
Example: "Candidate said '50% faster' but Result scored 2/5. This quantified metric matches level_3 descriptor, score should be 3/5."

TYPE 2 - SCORE TOO HIGH:
"The coach scored [X]/5 but the reasoning only shows evidence for level_[Y] which is [X-1]/5."
Example: "Action scored 4/5 but reasoning only cites generic stakeholder coordination, no specific tools or frameworks — should be 3/5."

TYPE 3 - HALLUCINATED EVIDENCE:
"The reasoning references [detail] but this is NOT in the candidate answer."
Example: "Feedback says 'candidate mentioned AWS' but the answer never mentions AWS."

RETURN JSON:
{
  "corrections_made": ["list of corrections as strings, empty array if none"],
  "star_corrections": {
    "situation": { "corrected_score": null, "corrected_feedback": null },
    "task": { "corrected_score": null, "corrected_feedback": null },
    "action": { "corrected_score": null, "corrected_feedback": null },
    "result": { "corrected_score": null, "corrected_feedback": null }
  },
  "competency_corrections": {},
  "critic_notes": "overall assessment of draft quality"
}

Use null for fields that need NO correction. Only populate fields where you found a genuine contradiction.
Be conservative — only correct when contradiction is clear and evidence-based.`;
  }

  /**
   * Merge critic corrections into draft analysis
   * Only overwrites fields where critic found genuine contradictions
   */
  mergeCriticCorrections(draftAnalysis, criticResult) {
    const merged = JSON.parse(JSON.stringify(draftAnalysis)); // deep clone

    // Apply STAR corrections
    if (criticResult.star_corrections) {
      ['situation', 'task', 'action', 'result'].forEach(component => {
        const correction = criticResult.star_corrections[component];
        if (correction) {
          if (correction.corrected_score !== null && correction.corrected_score !== undefined) {
            console.log(`  📝 Correcting ${component} score: ${merged.star[component].score} → ${correction.corrected_score}`);
            merged.star[component].score = correction.corrected_score;
          }
          if (correction.corrected_feedback !== null && correction.corrected_feedback !== undefined) {
            merged.star[component].feedback = correction.corrected_feedback;
          }
        }
      });
    }

    // Apply competency corrections
    if (criticResult.competency_corrections) {
      Object.entries(criticResult.competency_corrections).forEach(([competency, correctedScore]) => {
        if (correctedScore !== null && correctedScore !== undefined && merged.competencies[competency] !== undefined) {
          console.log(`  📝 Correcting ${competency} score: ${merged.competencies[competency]} → ${correctedScore}`);
          merged.competencies[competency] = correctedScore;
        }
      });
    }

    // Add critic metadata to response for transparency
    merged._critic = {
      corrections_made: criticResult.corrections_made || [],
      critic_notes: criticResult.critic_notes || '',
      corrections_count: (criticResult.corrections_made || []).length
    };

    return merged;
  }

  /**
   * Validate and sanitize analysis results
   * Ensures all scores are valid (0-5) and all required fields exist
   */
  validateAnalysis(analysis, rubrics) {
    console.log('🔍 Validating analysis results...');
    
    // Validate STAR scores
    if (analysis.star) {
      ['situation', 'task', 'action', 'result'].forEach(component => {
        if (analysis.star[component]) {
          const score = analysis.star[component].score;
          
          // Ensure score is valid integer 0-5
          if (typeof score !== 'number' || score < 0 || score > 5 || !Number.isInteger(score)) {
            console.warn(`⚠️  Invalid STAR score for ${component}: ${score}, clamping to valid range`);
            analysis.star[component].score = Math.max(0, Math.min(5, Math.round(score) || 0));
          }
          
          // Ensure required fields exist
          analysis.star[component].text = analysis.star[component].text || 'Not found';
          analysis.star[component].feedback = analysis.star[component].feedback || 'No feedback provided';
        }
      });
    }

    // Validate competency scores
    // Fallback: if competencies object has 0, check competency_reasoning for correct score
    if (analysis.competencies) {
      const validatedCompetencies = {};
      const reasoningMap = {};

      // Build a map from competency_reasoning if available
      // Handles both array format and object format from LLM
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
          // Valid non-zero score — use it
          validatedCompetencies[competencyName] = score;
        } else if (reasoningMap[competencyName] && reasoningMap[competencyName] > 0) {
          // Score was 0 but reasoning has a valid score — use reasoning score
          console.log(`  🔧 Recovering ${competencyName} score from competency_reasoning: ${reasoningMap[competencyName]}`);
          validatedCompetencies[competencyName] = reasoningMap[competencyName];
        } else {
          console.warn(`⚠️  Invalid competency score for ${competencyName}: ${score}, defaulting to 1`);
          validatedCompetencies[competencyName] = 1; // default to 1 not 0 — 0 breaks frontend
        }
      });

      analysis.competencies = validatedCompetencies;
    }

    // Ensure improvements array exists
    if (!Array.isArray(analysis.improvements)) {
      console.warn('⚠️  Missing improvements array, initializing empty');
      analysis.improvements = [];
    }

    // Preserve _critic metadata through validation — never strip it
    // It is added by mergeCriticCorrections and must reach the API response

    console.log('✅ Validation complete');
    return analysis;
  }

  /**
   * Fallback response when analysis fails
   * Returns degraded but valid response structure
   */
  getFallbackResponse(error, rubrics) {
    console.log('🔄 Generating fallback response...');
    
    // Check if circuit breaker is open
    const isCircuitOpen = error.isCircuitBreakerOpen || 
                         (error.message && error.message.includes('Circuit breaker is OPEN'));
    
    // Check if rate limited
    const isRateLimited = error.status === 429 || 
                         (error.message && error.message.includes('Rate limit'));

    // Create basic STAR structure with zeros
    const star = {
      situation: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      },
      task: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      },
      action: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      },
      result: {
        score: 0,
        text: 'Analysis unavailable',
        feedback: 'Service temporarily unavailable. Please try again.'
      }
    };

    // Create zero scores for all competencies
    const competencies = {};
    rubrics.forEach(rubric => {
      competencies[rubric.competency_name] = 0;
    });

    // Create error message for improvements
    const errorMessage = isCircuitOpen 
      ? 'Analysis service is temporarily down. Our team has been notified. Please try again in a few minutes.'
      : isRateLimited
      ? 'Too many requests. Please wait a moment and try again.'
      : 'Analysis service encountered an error. Please try again.';

    return {
      star,
      competencies,
      improvements: [
        {
          priority: 'critical',
          component: 'system',
          location: 'N/A',
          current_text: 'Service Error',
          improved_text: errorMessage,
          rationale: 'System is temporarily unable to process your request',
          example_reference: 'N/A'
        }
      ],
      _fallback: true,
      _error: error.message,
      _errorType: isCircuitOpen ? 'circuit_breaker_open' : isRateLimited ? 'rate_limited' : 'unknown'
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }

  /**
   * Get rate limiter status
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getMetrics();
  }
}

module.exports = CombinedAnalyzer;