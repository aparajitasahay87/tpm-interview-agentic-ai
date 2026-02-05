const express = require('express');
const router = express.Router();
const { getPool } = require('../config/database');

/**
 * GET /api/categories
 * Get all categories with question counts
 */
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.icon,
        c.competencies,
        c.created_at,
        COUNT(q.id) as question_count
      FROM categories c
      LEFT JOIN questions q ON q.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id
    `);
    
    res.json({
      success: true,
      categories: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

/**
 * GET /api/categories/:id
 * Get single category with details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.icon,
        c.competencies,
        c.created_at,
        COUNT(q.id) as question_count
      FROM categories c
      LEFT JOIN questions q ON q.category_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    res.json({
      success: true,
      category: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category'
    });
  }
});

/**
 * GET /api/categories/:id/rubrics
 * Get rubrics for a category
 */
router.get('/:id/rubrics', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT 
        id,
        competency_name,
        level_1_description,
        level_3_description,
        level_5_description,
        weight
      FROM rubrics
      WHERE category_id = $1
      ORDER BY competency_name
    `, [id]);
    
    res.json({
      success: true,
      rubrics: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching rubrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rubrics'
    });
  }
});

/**
 * GET /api/categories/:id/questions/random
 * Get a random question from a category
 */
router.get('/:id/questions/random', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    // Get random question from category
    const result = await pool.query(`
      SELECT 
        id,
        category_id,
        question_text,
        difficulty,
        tags,
        created_at
      FROM questions 
      WHERE category_id = $1 
      ORDER BY RANDOM() 
      LIMIT 1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No questions found for this category'
      });
    }
    
    res.json({
      success: true,
      question: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching random question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch random question'
    });
  }
});

/**
 * GET /api/categories/:id/questions
 * Get all questions for a category (for future browse feature)
 */
router.get('/:id/questions', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT 
        id,
        category_id,
        question_text,
        difficulty,
        tags,
        created_at
      FROM questions 
      WHERE category_id = $1 
      ORDER BY difficulty DESC, id
    `, [id]);
    
    res.json({
      success: true,
      count: result.rows.length,
      questions: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});

module.exports = router;