const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { getCacheService } = require('../services/CacheService');

/**
 * analyze.js — SOARR Edition (V1)
 *
 * WHAT CHANGED vs production analyze.js:
 *
 * 1. CombinedAnalyzer switched to CombinedAnalyzer_AgenticV1
 *    Import path updated. All behavior changes are encapsulated there.
 *
 * 2. candidateLevel + questionText passed through to analyzer
 *    Both are optional — defaults gracefully if not sent by client.
 *    candidateLevel: used by hybrid retrieval (seniority ±1 filter in SemanticSearch)
 *    questionText:   used by SOARR coaching summary for context-aware feedback
 *
 * 3. soarr block added to response
 *    situation, obstacle, action, result, reflection — each with score/text/feedback.
 *    Returned alongside star so frontend can adopt incrementally.
 *
 * 4. depth_signals added to response
 *    shows_judgment, shows_tradeoff, shows_reflection, authenticity_score, interviewer_probe.
 *
 * 5. coaching_summary added to response
 *    one_thing, score_potential, weakness_pattern, signal_density, daily_drill, interviewer_read.
 *
 * 6. similar_examples added to response (was pending in production)
 *    Returns top 2 retrieval results with id, question_text, comp_category, level,
 *    similarity, answer_preview — for debugging and future frontend use.
 *
 * BACKWARD COMPAT:
 *    star block is preserved unchanged — frontend reads it identically.
 *    competencies block is preserved unchanged.
 *    improvements block is preserved unchanged.
 *    _critic block is preserved unchanged.
 *    All new fields are additive — existing clients see no breaking changes.
 */
const CombinedAnalyzer = require('../agents/tools/CombinedAnalyzer_Agentic');

// Valid seniority levels — must match sample_answers.level column exactly.
// Validated on every request so the seniority ±1 filter in SemanticSearch
// never silently returns zero results from an unknown level string.
const VALID_LEVELS = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal'];

/**
 * POST /api/analyze
 *
 * Request body:
 *   questionId     {number}  required — question being answered
 *   userAnswer     {string}  required — candidate's answer text
 *   candidateLevel {string}  optional — 'Junior'|'Mid'|'Senior'|'Staff'|'Principal'
 *
 * Response data:
 *   star              — STAR scores (backward compat, maps from SOARR)
 *   soarr             — SOARR scores (new: includes reflection component)
 *   competencies      — competency scores by name
 *   improvements      — SOARR-structured rewrites in candidate's voice
 *   depth_signals     — shows_judgment, shows_tradeoff, shows_reflection, authenticity_score, interviewer_probe
 *   coaching_summary  — one_thing, score_potential, weakness_pattern, signal_density, daily_drill, interviewer_read
 *   similar_examples  — top 2 retrieval results (for transparency / debugging)
 *   internal_reasoning — chain-of-thought evidence inventory and gap analysis
 *   _critic           — critic loop metadata (corrections made, gate decision)
 */
router.post('/', async (req, res) => {
  try {
    const { questionId, userAnswer, candidateLevel } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!questionId || !userAnswer) {
      return res.status(400).json({
        success: false,
        error:   'Missing required fields: questionId, userAnswer'
      });
    }

    if (typeof userAnswer !== 'string' || userAnswer.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error:   'userAnswer must be a non-empty string'
      });
    }

    // Validate candidateLevel if provided — reject unknown values explicitly
    // so the seniority ±1 filter never silently returns zero retrieval results.
    // resolvedLevel is the clean value passed to all downstream stages.
    let resolvedLevel = null;
    if (candidateLevel) {
      if (!VALID_LEVELS.includes(candidateLevel)) {
        return res.status(400).json({
          success: false,
          error:   `Invalid candidateLevel "${candidateLevel}". Must be one of: ${VALID_LEVELS.join(', ')}`
        });
      }
      resolvedLevel = candidateLevel;
    }

    console.log(`\n📝 Analyzing answer for question ${questionId} | level: ${resolvedLevel || 'not specified'}`);

    // ── Step 1: Load question from cache ───────────────────────────────────
    const cacheService = getCacheService();
    const questions    = await cacheService.getQuestions();
    const question     = questions.find(q => q.id === parseInt(questionId));

    if (!question) {
      return res.status(404).json({
        success: false,
        error:   `Question ${questionId} not found`
      });
    }

    const categoryId   = question.category_id;
    const questionText = question.question_text || question.question || '';
    console.log(`📂 Category ID: ${categoryId} | Question: "${questionText.substring(0, 80)}..."`);

    // ── Step 2: Load rubrics ───────────────────────────────────────────────
    console.log('⚙️  Step 1: Loading rubrics...');
    const rubrics = await cacheService.getRubrics(categoryId);

    // ── Step 3: Run SOARR analysis ─────────────────────────────────────────
    // candidateLevel + questionText passed through for V1 improvements.
    // Falls back gracefully if either is null/empty.
    console.log('⚙️  Step 2: Running SOARR analysis (V1)...');
    const analyzer = new CombinedAnalyzer();
    const analysis  = await analyzer.analyze(
      userAnswer.trim(),
      categoryId,
      rubrics,
      resolvedLevel,
      questionText
    );

    // ── Step 4: Parse scores ──────────────────────────────────────────────────
    // null preserved for fallback — never coerce to 0.
    const parseScore = (val) => val === null || val === undefined ? null : parseFloat(val) || 0;

    // ── Step 5: Build SOARR response block ────────────────────────────────────
    // SOARR is the only scoring framework. validateAnalysis() guarantees all
    // 5 components are present with safe defaults — no partial block possible.
    const rawSoarr = analysis.soarr || {};
    const soarr = {
      situation: {
        score:    parseScore(rawSoarr.situation?.score),
        text:     rawSoarr.situation?.text     || '',
        feedback: rawSoarr.situation?.feedback || ''
      },
      obstacle: {
        score:    parseScore(rawSoarr.obstacle?.score),
        text:     rawSoarr.obstacle?.text     || '',
        feedback: rawSoarr.obstacle?.feedback || ''
      },
      action: {
        score:    parseScore(rawSoarr.action?.score),
        text:     rawSoarr.action?.text     || '',
        feedback: rawSoarr.action?.feedback || ''
      },
      result: {
        score:    parseScore(rawSoarr.result?.score),
        text:     rawSoarr.result?.text     || '',
        feedback: rawSoarr.result?.feedback || ''
      },
      reflection: {
        score:    parseScore(rawSoarr.reflection?.score),
        text:     rawSoarr.reflection?.text     || '',
        feedback: rawSoarr.reflection?.feedback || ''
      }
    };

    // ── Step 6: Parse competency scores ───────────────────────────────────
    // FIX 3: null preserved — not coerced to 0 — when analysis_status = 'fallback'
    const competencies = {};
    for (const [key, value] of Object.entries(analysis.competencies || {})) {
      competencies[key] = parseScore(value);
    }

    // ── Step 7: Build similar_examples for response ────────────────────────
    // Safely maps whatever the analyzer returned — won't throw if missing
    const similarExamples = (analysis.similarExamples || []).map(e => ({
      id:             e.id,
      question_text:  e.question_text  || '',
      question_type:  e.question_type  || '',
      comp_category:  e.comp_category  || '',
      level:          e.level          || '',
      similarity:     e.similarity     || 0,
      answer_preview: (e.answer_text   || '').substring(0, 200)
    }));

    // ── Step 8: Return complete SOARR analysis ─────────────────────────────
    console.log('✅ SOARR analysis complete\n');

    return res.json({
      success: true,
      data: {
        // ── Status field (always present — 'success' | 'partial' | 'fallback') ─
        analysis_status: analysis.analysis_status || 'success',

        // ── SOARR response ───────────────────────────────────────────────
        soarr,
        competencies,
        strength_tier:    analysis.strength_tier    || null,
        improvements: analysis.improvements || [],
        depth_signals:    analysis.depth_signals    || null,
        coaching_summary: analysis.coaching_summary || null,
        similar_examples: similarExamples,
        _critic:          analysis._critic          || null,

        // FIX 5: internal_reasoning is chain-of-thought — generated and used
        // internally by the critic and validateAnalysis, but never sent to the
        // client in production. Enable DEBUG_MODE=true in .env to expose it
        // during local development and eval runs.
        ...(process.env.DEBUG_MODE === 'true' && {
          internal_reasoning: analysis.internal_reasoning || null
        }),

        // Fallback metadata — only present when analysis_status = 'fallback'
        ...(analysis._fallback && {
          _fallback:    true,
          _errorType:   analysis._errorType   || null,
          _userMessage: analysis._userMessage || 'An error occurred. Please try again.'
        })
      }
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);

    return res.status(500).json({
      success: false,
      error:   'Analysis failed',
      message: error.message
    });
  }
});

module.exports = router;