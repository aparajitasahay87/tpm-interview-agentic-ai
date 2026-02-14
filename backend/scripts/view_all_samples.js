require('dotenv').config();
const db = require('../config/database');

async function viewAllSamples() {
  try {
    const result = await db.query(`
      SELECT id, category_id, question_text, overall_score, level, company
      FROM sample_answers
      ORDER BY id
    `);
    
    console.log(`📊 All ${result.rows.length} samples:\n`);
    result.rows.forEach(row => {
      console.log(`ID: ${row.id} | Cat: ${row.category_id} | Score: ${row.overall_score}`);
      console.log(`  Level: ${row.level || 'N/A'} | Company: ${row.company || 'N/A'}`);
      console.log(`  Q: ${row.question_text?.slice(0, 80)}...`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

viewAllSamples();