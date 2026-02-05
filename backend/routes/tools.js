const express = require('express');
const { checkRateLimit } = require('../middleware/simpleRateLimiter');
const ReflectionAgent = require('../agents/tools/ReflectionAgent');
const router = express.Router();
const SemanticSearch = require('../agents/tools/SemanticSearch');
const ComparisonAnalyzer = require('../agents/tools/ComparisonAnalyzer');
const CombinedSTARRubricParser = require('../agents/tools/CombinedSTARRubricParser');
const db = require('../config/database');

// POST /api/tools/parse-star
router.post('/parse-star', checkRateLimit, async (req, res) => {
  try {
    const { answer, question_type, userEmail, category_id } = req.body;

    // Validation
    if (!answer || answer.trim().length < 50) {
      return res.status(400).json({
        error: 'Answer too short. Please provide at least 50 characters.'
      });
    }

    console.log('📝 Starting optimized parallel agent analysis...');
    if (category_id) {
      console.log(`📁 Category ID: ${category_id}`);
    }
    const startTime = Date.now();

    // Check if RAG features are enabled
    const ragEnabled = process.env.ENABLE_RAG_FEATURES === 'true';

    // ⭐ OPTIMIZATION: Run Combined Parser (STAR + Rubrics) and Semantic Search in PARALLEL
    let combinedResult;
    let similarExamples = [];

    if (ragEnabled) {
      console.log('🤖 Running agents in parallel: Combined STAR+Rubric Parser + Semantic Search...');
      
      try {
        const semanticSearch = new SemanticSearch();
        const combinedParser = new CombinedSTARRubricParser();
        
        // Fetch rubrics if category provided
        let rubrics = [];
        if (category_id) {
          const rubricsResult = await db.query(`
            SELECT 
              competency_name,
              level_1_description,
              level_3_description,
              level_5_description
            FROM rubrics
            WHERE category_id = $1
            ORDER BY competency_name
          `, [category_id]);
          rubrics = rubricsResult.rows;
          console.log(`📊 Loaded ${rubrics.length} rubrics for category ${category_id}`);
        }
        
        [combinedResult, similarExamples] = await Promise.all([
          combinedParser.parseAndScore(answer, rubrics),  // Agent 1 (STAR + Rubrics combined!)
          semanticSearch.findSimilarAnswers(answer, category_id).catch(err => {
            console.error('⚠️ Semantic search failed:', err.message);
            return []; // Graceful degradation
          })
        ]);
        
        console.log(`✅ Parallel execution complete - Found ${similarExamples.length} similar examples`);
      } catch (parallelError) {
        console.error('⚠️ Parallel execution error, falling back to combined parser only:', parallelError.message);
        
        // Fallback: run combined parser only
        const combinedParser = new CombinedSTARRubricParser();
        
        let rubrics = [];
        if (category_id) {
          const rubricsResult = await db.query(`
            SELECT competency_name, level_1_description, level_3_description, level_5_description
            FROM rubrics WHERE category_id = $1
          `, [category_id]);
          rubrics = rubricsResult.rows;
        }
        
        combinedResult = await combinedParser.parseAndScore(answer, rubrics);
        similarExamples = [];
      }
    } else {
      console.log('ℹ️ RAG disabled - running combined parser only...');
      const combinedParser = new CombinedSTARRubricParser();
      
      let rubrics = [];
      if (category_id) {
        const rubricsResult = await db.query(`
          SELECT competency_name, level_1_description, level_3_description, level_5_description
          FROM rubrics WHERE category_id = $1
        `, [category_id]);
        rubrics = rubricsResult.rows;
      }
      
      combinedResult = await combinedParser.parseAndScore(answer, rubrics);
    }

    // Extract results from combined parser
    const starResult = combinedResult.star;
    const competencyScores = combinedResult.competency_scores;
    const competencyReasoning = combinedResult.competency_reasoning;

    // Transform to expected format
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
    if (competencyScores) {
      const competencyCount = Object.keys(competencyScores).length;
      console.log(`✅ Competency scoring complete - ${competencyCount} competencies scored`);
    }

    // Prepare user STAR data for Agent 3
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

    // Agent 3 (Comparison Analyzer) uses outputs from Agent 1 & Agent 2
    let improvementAnalysis = null;

    if (ragEnabled) {
      try {
        const comparisonAnalyzer = new ComparisonAnalyzer();

        if (similarExamples.length > 0) {
          // Scenario 1: Agent 2 found results → comparison analysis with context
          console.log('📊 Agent 3: Running comparison analysis with combined outputs...');
          
          improvementAnalysis = await comparisonAnalyzer.analyzeGaps(
            answer,
            userSTAR,        // ← Context from Agent 1 (STAR)
            similarExamples  // ← Context from Agent 2 (Semantic Search)
          );

          console.log('✅ Agent 3: Comparison analysis complete (with similar examples)');
        } else {
          // Scenario 2 & 3: No results or Agent 2 failed → STAR-only feedback
          console.log('⚠️ Agent 3: No similar examples - generating STAR-based feedback only...');
          
          improvementAnalysis = comparisonAnalyzer.generateGeneralFeedback(userSTAR);
          console.log('✅ Agent 3: General feedback complete (STAR-only context)');
        }

        // Admin-only reflection (optional Agent 4)
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
        // STAR scores and breakdown
        star_scores: scores,
        star_breakdown: star_breakdown,
        overall_score: parseFloat(overall_score.toFixed(2)),
        
        // ⭐ Competency scores (Phase 5)
        ...(competencyScores && {
          competency_scores: competencyScores,
          competency_reasoning: competencyReasoning
        }),
        
        // Similar examples (if RAG enabled)
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

        // Improvement analysis (if RAG enabled)
        ...(ragEnabled && improvementAnalysis && {
          improvement_analysis: improvementAnalysis
        })
      },
      metadata: {
        execution_time_ms: executionTime,
        rag_enabled: ragEnabled,
        category_provided: !!category_id,
        competency_scoring_enabled: !!competencyScores,
        similar_examples_found: similarExamples.length,
        reflection_used: userEmail === process.env.ADMIN_EMAIL,
        api_calls_saved: category_id ? 1 : 0 // Saved 1 call by combining STAR + Rubrics
      }
    };

    // Log tool execution to database
    try {
      await db.query(`
        INSERT INTO tool_executions (tool_name, input_data, output_data, execution_time_ms, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        'parse_star',
        { answer: answer.substring(0, 200) + '...', question_type, category_id },
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