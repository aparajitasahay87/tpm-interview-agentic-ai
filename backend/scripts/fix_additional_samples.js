require('dotenv').config();
const db = require('../config/database');
const STARParser = require('../agents/tools/STARParser');

async function fixSamples() {
  try {
    console.log('🔧 Fixing samples 53-62...\n');
    
    const starParser = new STARParser();
    
    // Get samples without STAR breakdown
    const result = await db.query(`
      SELECT id, answer_text, question_text
      FROM sample_answers
      WHERE id >= 53 AND id <= 62
      AND situation_text IS NULL
    `);
    
    console.log(`Found ${result.rows.length} samples to fix\n`);
    
    for (const row of result.rows) {
      console.log(`Processing ID ${row.id}...`);
      
      // Use STARParser to extract STAR components
      const star = await starParser.parse(row.answer_text);
      
      // Update the record
      await db.query(`
        UPDATE sample_answers
        SET 
          situation_text = $1,
          task_text = $2,
          action_text = $3,
          result_text = $4,
          situation_score = $5,
          task_score = $6,
          action_score = $7,
          result_score = $8
        WHERE id = $9
      `, [
        star.situation.text,
        star.task.text,
        star.action.text,
        star.result.text,
        star.situation.score,
        star.task.score,
        star.action.score,
        star.result.score,
        row.id
      ]);
      
      console.log(`✅ Fixed ID ${row.id}`);
    }
    
    console.log('\n✅ All samples fixed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixSamples();