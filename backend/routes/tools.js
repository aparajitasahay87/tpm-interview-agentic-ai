const express = require('express');
const { checkRateLimit } = require('../middleware/simpleRateLimiter');
const ReflectionAgent = require('../agents/tools/ReflectionAgent'); // ⭐ NEW
const router = express.Router();
const STARParser = require('../agents/tools/STARParser');
const SemanticSearch = require('../agents/tools/SemanticSearch');
const ComparisonAnalyzer = require('../agents/tools/ComparisonAnalyzer');
const db = require('../config/database');

const starParser = new STARParser();

// POST /api/tools/parse-star
router.post('/parse-star', checkRateLimit, async (req, res) => {
  try {
    const { answer, question_type, userEmail } = req.body; // ⭐ Added userEmail

    // Validation
    if (!answer || answer.trim().length < 50) {
      return res.status(400).json({
        error: 'Answer too short. Please provide at least 50 characters.'
      });
    }

    console.log('📝 Parsing answer...');
    const startTime = Date.now();

    // Step 1: Parse with STAR tool (Week 1 - always runs)
    const starResult = await starParser.parse(answer);

    // Transform STARParser output to expected format
    const scores = {
      situation: starResult.situation?.score || 0,
      task: starResult.task?.score || 0,
      action: starResult.action?.score || 0,
      result: starResult.result?.score || 0
    };
    const overall_score = (scores.situation + scores.task + scores.action + scores.result) / 4;
    
    const star_breakdown = {
      situation: starResult.situation?.text || '',
      task: starResult.task?.text || '',
      action: starResult.action?.text || '',
      result: starResult.result?.text || ''
    };

    console.log(`✅ STAR parsed - Overall score: ${overall_score.toFixed(1)}/5`);

    // Check if RAG features are enabled
    const ragEnabled = process.env.ENABLE_RAG_FEATURES === 'true';
    
    let similarExamples = [];
    let improvementAnalysis = null;

    if (ragEnabled) {
      console.log('🤖 RAG features enabled - running semantic search and comparison...');

      try {
        // Step 2: Semantic Search (Week 2 Day 3)
        const semanticSearch = new SemanticSearch();
        similarExamples = await semanticSearch.findSimilarAnswers(answer, question_type);
        
        console.log(`✅ Found ${similarExamples.length} similar examples`);

        // Step 3: Comparison Analysis (Week 2 Day 4)
        if (similarExamples.length > 0) {
          const comparisonAnalyzer = new ComparisonAnalyzer();
          
          // Prepare user STAR data for comparison
          const userSTAR = {
            scores: {
              situation: scores.situation,
              task: scores.task,
              action: scores.action,
              result: scores.result,
              overall: overall_score
            },
            breakdown: star_breakdown
          };

          improvementAnalysis = await comparisonAnalyzer.analyzeGaps(
            answer,
            userSTAR,
            similarExamples
          );

          // ⭐ NEW: Admin-only reflection
          const ADMIN_EMAIL = 'aparajita.sahay87@gmail.com';
          
          if (userEmail === ADMIN_EMAIL && improvementAnalysis?.improvements) {
            console.log('🔄 Admin detected - running reflection on improvements...');
            const refinedImprovements = await ReflectionAgent.reflect(
              improvementAnalysis.improvements,
              { answer, userSTAR }
            );
            improvementAnalysis.improvements = refinedImprovements;
            console.log('✅ Reflection complete for admin');
          }

          console.log('✅ Comparison analysis complete');
        } else {
          console.log('⚠️  No similar examples found - generating general feedback');
          
          // Generate general feedback when no similar examples
          const comparisonAnalyzer = new ComparisonAnalyzer();
          const userSTAR = {
            scores: {
              situation: scores.situation,
              task: scores.task,
              action: scores.action,
              result: scores.result,
              overall: overall_score
            },
            breakdown: star_breakdown
          };
          improvementAnalysis = comparisonAnalyzer.generateGeneralFeedback(userSTAR);
          
          // ⭐ NEW: Admin-only reflection (even for general feedback)
          const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
          
          if (userEmail === ADMIN_EMAIL && improvementAnalysis?.improvements) {
            console.log('🔄 Admin detected - running reflection on general feedback...');
            const refinedImprovements = await ReflectionAgent.reflect(
              improvementAnalysis.improvements,
              { answer, userSTAR }
            );
            improvementAnalysis.improvements = refinedImprovements;
            console.log('✅ Reflection complete for admin');
          }
        }

      } catch (ragError) {
        console.error('⚠️  RAG features error (graceful degradation):', ragError.message);
        // Continue without RAG features - return just STAR analysis
      }
    } else {
      console.log('ℹ️  RAG features disabled - returning STAR analysis only');
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Complete analysis in ${executionTime}ms`);

    // Build response
    const response = {
      success: true,
      analysis: {
        // Week 1: STAR scores and breakdown
        star_scores: scores,
        star_breakdown: star_breakdown,
        overall_score: parseFloat(overall_score.toFixed(2)),
        
        // Week 2 Day 3: Similar examples (if RAG enabled)
        ...(ragEnabled && similarExamples.length > 0 && {
          similar_examples: similarExamples.map(ex => ({
            similarity: ex.similarity,
            score: ex.score,
            question_type: ex.question_type,
            question_text: ex.question_text,
            answer_text: ex.answer_text,
            star_breakdown: ex.star
          }))
        }),

        // Week 2 Day 4: Improvement analysis (if RAG enabled)
        ...(ragEnabled && improvementAnalysis && {
          improvement_analysis: improvementAnalysis
        })
      },
      metadata: {
        execution_time_ms: executionTime,
        rag_enabled: ragEnabled,
        similar_examples_found: similarExamples.length,
        reflection_used: userEmail === 'aparajita.sahay87@gmail.com' // ⭐ NEW
      }
    };

    // Log tool execution to database
    try {
      await db.query(`
        INSERT INTO tool_executions (tool_name, input_data, output_data, execution_time_ms, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        'parse_star',
        { answer: answer.substring(0, 200) + '...', question_type },
        response,
        executionTime,
        'success'
      ]);
    } catch (dbError) {
      console.error('⚠️  Failed to log to database:', dbError.message);
      // Don't fail the request if logging fails
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Parse-star error:', error);

    // Log error to database
    try {
      await db.query(`
        INSERT INTO tool_executions (tool_name, input_data, output_data, execution_time_ms, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        'parse_star',
        { answer: req.body.answer?.substring(0, 200) },
        null,
        0,
        'error',
        error.message
      ]);
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to parse answer',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;