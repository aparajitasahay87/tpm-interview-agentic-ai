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
// POST /api/tools/parse-star
router.post('/parse-star', checkRateLimit, async (req, res) => {
  try {
    const { answer, question_type, userEmail } = req.body;

    // Validation
    if (!answer || answer.trim().length < 50) {
      return res.status(400).json({
        error: 'Answer too short. Please provide at least 50 characters.'
      });
    }

    console.log('📝 Starting parallel agent analysis...');
    const startTime = Date.now();

    // Check if RAG features are enabled
    const ragEnabled = process.env.ENABLE_RAG_FEATURES === 'true';

    // ⭐ OPTIMIZATION 1: Run Agent 1 (STAR Parser) and Agent 2 (Semantic Search) in PARALLEL
    let starResult;
    let similarExamples = [];

    if (ragEnabled) {
      console.log('🤖 Running agents in parallel: STAR Parser + Semantic Search...');
      
      try {
        const semanticSearch = new SemanticSearch();
        
        [starResult, similarExamples] = await Promise.all([
          starParser.parse(answer),  // Agent 1
          semanticSearch.findSimilarAnswers(answer, question_type).catch(err => {
            console.error('⚠️ Semantic search failed:', err.message);
            return []; // Graceful degradation - return empty array on error
          })
        ]);
        
        console.log(`✅ Parallel execution complete - Found ${similarExamples.length} similar examples`);
      } catch (parallelError) {
        console.error('⚠️ Parallel execution error, falling back to STAR only:', parallelError.message);
        // Fallback: run STAR only if parallel execution fails
        starResult = await starParser.parse(answer);
        similarExamples = [];
      }
    } else {
      console.log('ℹ️ RAG disabled - running STAR Parser only...');
      starResult = await starParser.parse(answer);
    }

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

    // Prepare user STAR data for Agent 3 (from Agent 1 output)
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

    // Step 3: Agent 3 (Comparison Analyzer) uses outputs from Agent 1 & Agent 2
    let improvementAnalysis = null;

    if (ragEnabled) {
      try {
        const comparisonAnalyzer = new ComparisonAnalyzer();

        if (similarExamples.length > 0) {
          // Scenario 1: Agent 2 found results → comparison analysis with context
          console.log('📊 Agent 3: Running comparison analysis with Agent 1 + Agent 2 outputs...');
          
          improvementAnalysis = await comparisonAnalyzer.analyzeGaps(
            answer,
            userSTAR,        // ← Context from Agent 1 (STAR Parser)
            similarExamples  // ← Context from Agent 2 (Semantic Search)
          );

          console.log('✅ Agent 3: Comparison analysis complete (with similar examples)');
        } else {
          // Scenario 2 & 3: No results or Agent 2 failed → STAR-only feedback
          console.log('⚠️ Agent 3: No similar examples - generating STAR-based feedback only...');
          
          improvementAnalysis = comparisonAnalyzer.generateGeneralFeedback(userSTAR);
          console.log('✅ Agent 3: General feedback complete (STAR-only context)');
        }

        // ⭐ Admin-only reflection (optional Agent 4)
  
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

        if (!ADMIN_EMAIL) {
          console.warn('⚠️ ADMIN_EMAIL not set in environment variables');
        }
        
        if (userEmail === ADMIN_EMAIL && improvementAnalysis?.improvements) {
          console.log('🔄 Agent 4: Admin detected - running reflection...');
          const refinedImprovements = await ReflectionAgent.reflect(
            improvementAnalysis.improvements,
            { answer, userSTAR }
          );
          improvementAnalysis.improvements = refinedImprovements;
          console.log('✅ Agent 4: Reflection complete');
        }

      } catch (ragError) {
        console.error('⚠️ RAG features error (graceful degradation):', ragError.message);
        // Continue without RAG features - return just STAR analysis
      }
    } else {
      console.log('ℹ️ RAG features disabled - skipping Agent 3');
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
        reflection_used: userEmail === process.env.ADMIN_EMAIL 
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
      console.error('⚠️ Failed to log to database:', dbError.message);
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