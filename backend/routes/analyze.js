const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getCacheService } = require('../services/CacheService');
const ComparisonAnalyzer_TEST = require('../agents/tools/CombinedAnalyzer_Production.js');
const STARParser = require('../agents/tools/STARParser');
const RubricScorer = require('../agents/tools/RubricScorer');
const SemanticSearch = require('../agents/tools/SemanticSearch');

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

    // Step 2: Parse STAR
    console.log('⚙️  Step 1: Parsing STAR...');
    const starParser = new STARParser();
    const userSTAR = await starParser.parse(userAnswer);

    // Step 3: Score competencies
    console.log('⚙️  Step 2: Scoring competencies...');
    const rubrics = await cacheService.getRubrics(categoryId);
    const rubricScorer = new RubricScorer();
    const scores = await rubricScorer.scoreAnswer(userAnswer, rubrics);

    // Step 4: Semantic search for ideal examples
    console.log('⚙️  Step 3: Finding similar examples...');
    const semanticSearch = new SemanticSearch();
    const similarExamples = await semanticSearch.findSimilarAnswers(
      userAnswer,
      categoryId,
      2 // Top 2 examples
    );

    // Step 5: Generate improvements using 2-shot comparison
    console.log('⚙️  Step 4: Generating improvements...');
    const analyzer = new ComparisonAnalyzer_TEST();
    const analysis = await analyzer.analyzeGaps(userAnswer, userSTAR, similarExamples);

    // Step 6: Parse competency scores to numbers  ← NEW
    const competencyScores = {}; 
    for (const [key, value] of Object.entries(scores.competency_scores || {})) {  
      competencyScores[key] = parseFloat(value) || 0;  
    }  

    // Step 6: Return complete analysis
    console.log('✅ Analysis complete\n');

    return res.json({
      success: true,
      data: {
        star: {
          situation: {
            score: parseFloat(userSTAR.situation.score),
            text: userSTAR.situation.text,
            feedback: userSTAR.situation.feedback
          },
          task: {
            score: parseFloat(userSTAR.task.score),
            text: userSTAR.task.text,
            feedback: userSTAR.task.feedback
          },
          action: {
            score: parseFloat(userSTAR.action.score),
            text: userSTAR.action.text,
            feedback: userSTAR.action.feedback
          },
          result: {
            score: parseFloat(userSTAR.result.score),
            text: userSTAR.result.text,
            feedback: userSTAR.result.feedback
          }
        },
        competencies: competencyScores,
        improvements: analysis.improvements || [],
        gaps: analysis.gaps || {},
        similarExamples: similarExamples.length
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