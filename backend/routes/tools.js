const express = require('express');
const router = express.Router();
const STARParser = require('../agents/tools/STARParser');
const db = require('../config/database');

const starParser = new STARParser();

// POST /api/tools/parse-star
router.post('/parse-star', async (req, res) => {
  try {
    const { answer } = req.body;

    // Validation
    if (!answer || answer.trim().length < 50) {
      return res.status(400).json({
        error: 'Answer too short. Please provide at least 50 characters.'
      });
    }

    console.log('📝 Parsing answer...');
    const startTime = Date.now();

    // Parse with STAR tool
    const result = await starParser.parse(answer);

    const executionTime = Date.now() - startTime;
    console.log(`✅ Parsed in ${executionTime}ms`);

    // Log tool execution to database
    await db.query(`
      INSERT INTO tool_executions (tool_name, input_data, output_data, execution_time_ms, status)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'parse_star',
      { answer: answer.substring(0, 200) + '...' },
      result,
      executionTime,
      'success'
    ]);

    res.json(result);

  } catch (error) {
    console.error('❌ STAR parser error:', error);

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
      error: 'Failed to parse answer',
      message: error.message
    });
  }
});

module.exports = router;