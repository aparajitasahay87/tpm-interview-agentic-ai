require('dotenv').config();
const db = require('../config/database');
const fs = require('fs');

async function exportSamples() {
  const result = await db.query(`
    SELECT 
      category_id,
      c.name as category,
      question_text as question,
      answer_text as answer
    FROM sample_answers s
    JOIN categories c ON s.category_id = c.id
    ORDER BY s.id
  `);
  
  const samples = result.rows;
  
  fs.writeFileSync(
    'raw_samples.json',
    JSON.stringify(samples, null, 2)
  );
  
  console.log(`✅ Exported ${samples.length} samples to raw_samples.json`);
  process.exit(0);
}

exportSamples();