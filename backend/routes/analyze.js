const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getCacheService } = require('../services/CacheService');
const CombinedAnalyzer = require('../agents/tools/CombinedAnalyzer_Agentic');

/**
 * analyze.js — Option 4 Production Version
 *
 * Change from previous version:
 * - Accepts optional `candidateLevel` in request body (e.g. "Senior", "Staff")
 * - Passes candidateLevel to analyzer.analyze() for seniority ±1 pre-filter
 * - Backwards compatible — if candidateLevel is not sent, all levels are fetched
 *
 * Request body:
 * {
 *   questionId:     number   (required)
 *   userAnswer:     string   (required)
 *   candidateLevel: string   (optional) — "Junior" | "Mid" | "Senior" | "Staff" | "Principal"
 * }
 */

// Valid seniority levels — must match sample_answers.level column exactly
const VALID_LEVELS = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal'];

router.post('/', async (req, res) => {
  try {
    const { questionId, userAnswer, candidateLevel } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!questionId || !userAnswer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: questionId, userAnswer'
      });
    }

    // Validate candidateLevel if provided — reject unknown values so the
    // seniority filter doesn't silently return zero results
    let resolvedLevel = null;
    if (candidateLevel) {
      if (!VALID_LEVELS.includes(candidateLevel)) {
        return res.status(400).json({
          success: false,
          error: `Invalid candidateLevel "${candidateLevel}". Must be one of: ${VALID_LEVELS.join(', ')}`
        });
      }
      resolvedLevel = candidateLevel;
    }

    console.log(`\n📝 Analyzing answer for question ${questionId} | Level: ${resolvedLevel || 'not specified'}`);

    // ── Step 1: Get question details from cache ─────────────────────────────
    const cacheService = getCacheService();
    const questions    = await cacheService.getQuestions();
    const question     = questions.find(q => q.id === parseInt(questionId));

    if (!question) {
      return res.status(404).json({
        success: false,
        error: `Question ${questionId} not found`
      });
    }

    const categoryId = question.category_id;
    console.log(`📂 Category ID: ${categoryId}`);

    // ── Step 2: Get rubrics for this category ───────────────────────────────
    console.log('⚙️  Step 1: Loading rubrics...');
    const rubrics = await cacheService.getRubrics(categoryId);

    // ── Step 3: Run combined analysis ───────────────────────────────────────
    // candidateLevel passed for seniority ±1 pre-filter in Stage 1 retrieval.
    // If null, SemanticSearch.findCandidatesForReranking() fetches all levels.
    console.log('⚙️  Step 2: Running combined analysis (Option 4)...');
    const analyzer = new CombinedAnalyzer();
    const analysis  = await analyzer.analyze(userAnswer, categoryId, rubrics, resolvedLevel);

    // ── Step 4: Parse scores ────────────────────────────────────────────────
    const star = {
      situation: {
        score:    parseFloat(analysis.star.situation.score) || 0,
        text:     analysis.star.situation.text,
        feedback: analysis.star.situation.feedback
      },
      task: {
        score:    parseFloat(analysis.star.task.score) || 0,
        text:     analysis.star.task.text,
        feedback: analysis.star.task.feedback
      },
      action: {
        score:    parseFloat(analysis.star.action.score) || 0,
        text:     analysis.star.action.text,
        feedback: analysis.star.action.feedback
      },
      result: {
        score:    parseFloat(analysis.star.result.score) || 0,
        text:     analysis.star.result.text,
        feedback: analysis.star.result.feedback
      }
    };

    const competencies = {};
    for (const [key, value] of Object.entries(analysis.competencies || {})) {
      competencies[key] = parseFloat(value) || 0;
    }

    // ── Step 5: Return response ─────────────────────────────────────────────
    console.log('✅ Analysis complete\n');

    return res.json({
      success: true,
      data: {
        star,
        competencies,
        improvements:      analysis.improvements      || [],
        gaps:              analysis.gaps              || {},
        internal_reasoning:analysis.internal_reasoning|| null,
        _critic:           analysis._critic           || null
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