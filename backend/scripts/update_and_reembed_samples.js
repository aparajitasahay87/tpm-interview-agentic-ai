const { Pool } = require('pg');
const EmbeddingGenerator = require('../agents/tools/EmbeddingGenerator');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

async function updateAndReembedSamples() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false
  });
  
  try {
    console.log('🔄 Step 1: Updating old sample answers with category_id...\n');
    
    // Get category IDs
    const categoriesResult = await pool.query('SELECT id, name FROM categories ORDER BY id');
    const categoryMap = {};
    categoriesResult.rows.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });
    
    // Map question_type to category (best guess based on your data)
    const questionTypeToCategory = {
      'leadership': 'Behavioral',
      'conflict': 'Behavioral',
      'stakeholder_management': 'Partnership',
      'feature_prioritization': 'Program Sense',
      'migration': 'Program Sense',
      'system_design': 'System Design',
      'technical': 'Technical',
      'program_management': 'Program Sense',
      'risk_management': 'Program Sense',
      'cross_functional': 'Partnership'
    };
    
    // Update old sample answers that don't have category_id
    const oldAnswers = await pool.query(`
      SELECT id, question_type 
      FROM sample_answers 
      WHERE category_id IS NULL
    `);
    
    console.log(`📊 Found ${oldAnswers.rows.length} old sample answers to update\n`);
    
    for (const answer of oldAnswers.rows) {
      const categoryName = questionTypeToCategory[answer.question_type] || 'Behavioral';
      const categoryId = categoryMap[categoryName];
      
      await pool.query(`
        UPDATE sample_answers 
        SET category_id = $1 
        WHERE id = $2
      `, [categoryId, answer.id]);
      
      console.log(`✅ Updated sample ${answer.id}: ${answer.question_type} → ${categoryName}`);
    }
    
    console.log('\n✅ Step 1 Complete: All sample answers now have category_id\n');
    
    // =========================================
    // Step 2: Re-embed ALL sample answers to Pinecone
    // =========================================
    
    console.log('🔄 Step 2: Re-embedding all sample answers to Pinecone...\n');
    
    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    const indexName = process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples';
    const index = pinecone.index(indexName);
    
    // Get ALL sample answers
    const allAnswers = await pool.query(`
      SELECT 
        sa.id,
        sa.category_id,
        c.name as category_name,
        sa.question_type,
        sa.question_text,
        sa.answer_text,
        sa.level,
        sa.company,
        sa.overall_score,
        sa.situation_score,
        sa.task_score,
        sa.action_score,
        sa.result_score
      FROM sample_answers sa
      JOIN categories c ON c.id = sa.category_id
      ORDER BY sa.id
    `);
    
    console.log(`📊 Found ${allAnswers.rows.length} total sample answers to embed\n`);
    
    // Generate embeddings
    const embeddingGenerator = new EmbeddingGenerator();
    const vectors = [];
    
    for (const answer of allAnswers.rows) {
      console.log(`🔄 Embedding sample ${answer.id}: ${answer.category_name}...`);
      
      // Prepare text for embedding (question + answer)
      const textToEmbed = `Question: ${answer.question_text}\nAnswer: ${answer.answer_text}`;
      
      // Generate embedding
      const embedding = await embeddingGenerator.generateEmbedding(textToEmbed);
      
      // Prepare vector for Pinecone
      vectors.push({
        id: `sample_${answer.id}`,
        values: embedding,
        metadata: {
          sample_id: answer.id,
          category_id: answer.category_id,
          category_name: answer.category_name,
          question_type: answer.question_type,
          question_text: answer.question_text.substring(0, 200), // Pinecone metadata limit
          level: answer.level,
          company: answer.company || 'Unknown',
          overall_score: answer.overall_score,
          situation_score: answer.situation_score,
          task_score: answer.task_score,
          action_score: answer.action_score,
          result_score: answer.result_score
        }
      });
      
      console.log(`✅ Sample ${answer.id} embedded (${embedding.length} dimensions)`);
    }
    
    console.log(`\n📤 Uploading ${vectors.length} vectors to Pinecone...\n`);
    
    // Delete old vectors first (clean slate)
    console.log('🗑️  Deleting old vectors from Pinecone...');
    try {
      await index.namespace('').deleteAll();
      console.log('✅ Old vectors deleted\n');
    } catch (deleteError) {
      console.log('⚠️  No old vectors to delete or deletion skipped\n');
    }
    
    // Upload in batches of 10
    const batchSize = 10;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.namespace('').upsert(batch);
      console.log(`✅ Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
    }
    
    console.log('\n✅ Step 2 Complete: All vectors uploaded to Pinecone\n');
    
    // =========================================
    // Step 3: Verify
    // =========================================
    
    console.log('🔍 Step 3: Verifying...\n');
    
    const stats = await index.describeIndexStats();
    console.log(`📊 Pinecone Index Stats:`);
    console.log(`   Total vectors: ${stats.totalRecordCount}`);
    console.log(`   Dimension: ${stats.dimension}`);
    
    const verifyResult = await pool.query(`
      SELECT c.name as category, COUNT(*) as sample_count
      FROM sample_answers sa
      JOIN categories c ON c.id = sa.category_id
      GROUP BY c.name
      ORDER BY c.name
    `);
    
    console.log(`\n📊 PostgreSQL Sample Answers by Category:`);
    verifyResult.rows.forEach(row => {
      console.log(`   ${row.category}: ${row.sample_count} samples`);
    });
    
    console.log('\n✅ All steps complete! Sample answers updated and re-embedded.');
    
  } catch (error) {
    console.error('❌ Update and re-embed failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateAndReembedSamples();