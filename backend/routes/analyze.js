const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getCacheService } = require('../services/CacheService');
const CombinedAnalyzer = require('../agents/tools/CombinedAnalyzer_Production');
const STARParser = require('../agents/tools/STARParser');
const RubricScorer = require('../agents/tools/RubricScorer');

/**
 * POST /api/analyze
 * Analyze user's interview answer
 */
router.post('/', async (req, res) => {
  try {
    const { questionId, userAnswer } = req.body;

    // Validation
    if (!questionId || !userAnswer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: questionId, userAnswer'
      });
    }

    console.log(`\n📝 Analyzing answer for question ${questionId}`);

    // Step 1: Get question details from cache
    const cacheService = getCacheService();
    const questions = await cacheService.getQuestions();
    const question = questions.find(q => q.id === parseInt(questionId));

    if (!question) {
      return res.status(404).json({
        success: false,
        error: `Question ${questionId} not found`
      });
    }

    const categoryId = question.category_id;
    console.log(`📂 Category ID: ${categoryId}`);

    // Step 2: Get rubrics for this category
    console.log('⚙️  Step 1: Loading rubrics...');
    const rubrics = await cacheService.getRubrics(categoryId);

    // Step 3: Run combined analysis (does STAR + Competencies + Semantic Search + Improvements)
    console.log('⚙️  Step 2: Running combined analysis...');
    const analyzer = new CombinedAnalyzer();
    const analysis = await analyzer.analyze(userAnswer, categoryId, rubrics);

    // Step 4: Parse scores to ensure they're numbers
    const star = {
      situation: {
        score: parseFloat(analysis.star.situation.score) || 0,
        text: analysis.star.situation.text,
        feedback: analysis.star.situation.feedback
      },
      task: {
        score: parseFloat(analysis.star.task.score) || 0,
        text: analysis.star.task.text,
        feedback: analysis.star.task.feedback
      },
      action: {
        score: parseFloat(analysis.star.action.score) || 0,
        text: analysis.star.action.text,
        feedback: analysis.star.action.feedback
      },
      result: {
        score: parseFloat(analysis.star.result.score) || 0,
        text: analysis.star.result.text,
        feedback: analysis.star.result.feedback
      }
    };

    // Parse competency scores to numbers
    const competencies = {};
    for (const [key, value] of Object.entries(analysis.competencies || {})) {
      competencies[key] = parseFloat(value) || 0;
    }

    // Step 5: Return complete analysis
    console.log('✅ Analysis complete\n');

    return res.json({
      success: true,
      data: {
        star,
        competencies,
        improvements: analysis.improvements || [],
        gaps: analysis.gaps || {},
        internal_reasoning: analysis.internal_reasoning || null,
        _critic: analysis._critic || null  // critic loop metadata — corrections made, notes
      }
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Analysis failed',
      message: error.message
    });
  }
});

module.exports = router;