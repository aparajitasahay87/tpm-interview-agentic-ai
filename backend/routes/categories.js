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
        id,
        name,
        description,
        icon,
        competencies,
        question_count,
        created_at
      FROM categories
      ORDER BY id
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
        id,
        name,
        description,
        icon,
        competencies,
        question_count,
        created_at
      FROM categories
      WHERE id = $1
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

module.exports = router;