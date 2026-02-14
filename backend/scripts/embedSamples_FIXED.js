require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
const db = require('../config/database');

/**
 * CORRECTED embedSamples.js
 * 
 * CRITICAL FIXES:
 * 1. ✅ Includes category_id in Pinecone metadata
 * 2. ✅ Uses correct field name: id (not sample_id)
 * 3. ✅ Selects category_id from database
 * 4. ✅ Stores all necessary metadata for filtering
 */

async function embedSamples() {
  console.log('🌱 Starting batch embedding process...\n');
  
  try {
    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    const indexName = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX || 'tpm-interview-examples';
    const namespace = process.env.PINECONE_NAMESPACE || '';
    
    console.log(`📊 Configuration:`);
    console.log(`   Index: ${indexName}`);
    console.log(`   Namespace: ${namespace || '(default)'}\n`);
    
    const index = pinecone.index(indexName);
    
    // ✅ FIX #1: Select category_id from database!
    const result = await db.query(`
      SELECT 
        id, 
        category_id,  -- ✅ CRITICAL: Must select this!
        question_text, 
        answer_text,
        overall_score,
        is_good_example
      FROM sample_answers
      WHERE is_good_example = true
      ORDER BY id
    `);
    
    const samples = result.rows;
    
    if (samples.length === 0) {
      console.warn('⚠️  No ideal examples found (is_good_example = true)');
      console.warn('   Run seed script first!');
      process.exit(0);
    }
    
    console.log(`📚 Found ${samples.length} ideal examples to embed\n`);
    
    // Embed each sample
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      
      console.log(`🔄 Embedding sample ${i + 1}/${samples.length}...`);
      console.log(`   ID: ${sample.id}`);
      console.log(`   Category: ${sample.category_id}`);
      console.log(`   Question: ${sample.question_text?.substring(0, 60)}...`);
      
      // Create embedding text
      const textToEmbed = `${sample.question_text}\n\n${sample.answer_text}`;
      
      // Get embedding from OpenAI
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: textToEmbed
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      
      // ✅ FIX #2: Store metadata with category_id and correct field names!
      const metadata = {
        id: sample.id,  // ✅ Use 'id' not 'sample_id'
        category_id: sample.category_id,  // ✅ CRITICAL: Must have this for filtering!
        question_text: sample.question_text?.substring(0, 500) || '',
        answer_preview: sample.answer_text?.substring(0, 200) || '',
        overall_score: sample.overall_score || 0,
        is_good_example: sample.is_good_example || false
      };
      
      // Upsert to Pinecone
      await index.namespace(namespace).upsert([{
        id: sample.id.toString(),
        values: embedding,
        metadata: metadata  // ✅ All fields included!
      }]);
      
      console.log(`   ✅ Embedded and stored in Pinecone\n`);
    }
    
    console.log('=' .repeat(70));
    console.log('✅ Batch embedding process complete!');
    console.log('='.repeat(70));
    console.log(`\n📊 Summary:`);
    console.log(`   Total embedded: ${samples.length}`);
    console.log(`   Index: ${indexName}`);
    console.log(`   Namespace: ${namespace || '(default)'}`);
    console.log(`   ✅ All metadata includes category_id for filtering\n`);
    
  } catch (error) {
    console.error('\n❌ Error during embedding:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    console.log('🔌 Database connection will close on exit');
    console.log('👋 Exiting...\n');
    process.exit(0);
  }
}

// Environment check
console.log('🔑 Checking environment...\n');

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in .env');
  process.exit(1);
}

if (!process.env.PINECONE_API_KEY) {
  console.error('❌ PINECONE_API_KEY not found in .env');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  console.error('   Set it with: $env:DATABASE_URL = "postgresql://..."');
  process.exit(1);
}

console.log('✅ Environment configured\n');

// Run
embedSamples();