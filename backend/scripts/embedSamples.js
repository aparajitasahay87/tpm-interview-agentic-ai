require('dotenv').config();
const db = require('../config/database');
const { getIndex } = require('../config/pinecone');
const EmbeddingGenerator = require('../agents/tools/EmbeddingGenerator');

async function embedAllSamples() {
  console.log('🚀 Starting batch embedding process...\n');
  
  try {
    // 1. Fetch all sample answers that need embedding
    console.log('📊 Fetching sample answers from database...');
    const result = await db.query(`
      SELECT 
        id,
        question_type,
        question_text,
        answer_text,
        level,
        situation_text,
        task_text,
        action_text,
        result_text,
        overall_score
      FROM sample_answers
      WHERE is_good_example = true
        AND pinecone_id IS NULL
      ORDER BY question_type, id
    `);
    
    const samples = result.rows;
    console.log(`✅ Found ${samples.length} samples to embed\n`);
    
    if (samples.length === 0) {
      console.log('ℹ️  No samples need embedding. All done!');
      return;
    }
    
    // 2. Initialize embedding generator and Pinecone
    console.log('🔧 Initializing embedding generator...');
    const generator = new EmbeddingGenerator();
    
    console.log('🔧 Connecting to Pinecone...');
    const index = await getIndex();
    console.log('✅ Pinecone connected\n');
    
    // 3. Process each sample
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      console.log(`\n[${i + 1}/${samples.length}] Processing: ${sample.question_type} (ID: ${sample.id})`);
      
      try {
        // Prepare text for embedding (question + answer context)
        const textToEmbed = generator.prepareTextForEmbedding(sample);
        console.log(`📝 Text length: ${textToEmbed.length} characters`);
        
        // Generate embedding
        console.log('🔄 Generating embedding...');
        const embedding = await generator.generateEmbedding(textToEmbed);
        
        // Prepare metadata for Pinecone
        const metadata = {
          question_id: sample.id.toString(),
          question_type: sample.question_type,
          question_text: sample.question_text?.substring(0, 200) || '',
          level: sample.level,
          overall_score: parseFloat(sample.overall_score) || 0,
          answer_preview: sample.answer_text?.substring(0, 200) || ''
        };
        
        // Upsert to Pinecone (ID must be string!)
        console.log('📤 Uploading to Pinecone...');
        await index.upsert([{
          id: sample.id.toString(),  // ✅ Convert to string
          values: embedding,
          metadata: metadata
        }]);
        
        // Update database with pinecone_id (store as string)
        console.log('💾 Updating database...');
        await db.query(`
          UPDATE sample_answers 
          SET pinecone_id = $1, 
              embedding_created_at = NOW()
          WHERE id = $2
        `, [sample.id.toString(), sample.id]);
        
        successCount++;
        console.log(`✅ Success! (${successCount}/${samples.length} complete)`);
        
        // Small delay to respect rate limits
        if (i < samples.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing sample ${sample.id}:`, error.message);
      }
    }
    
    // 4. Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 EMBEDDING SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Successfully embedded: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📦 Total processed: ${samples.length}`);
    console.log('='.repeat(50) + '\n');
    
    // 5. Verify in Pinecone
    console.log('🔍 Verifying Pinecone index stats...');
    const stats = await index.describeIndexStats();
    console.log(`📊 Total vectors in Pinecone: ${stats.totalRecordCount || 0}`);
    console.log(`📊 Index dimension: ${stats.dimension || 0}`);
    
    console.log('\n✅ Batch embedding process complete!');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  } finally {
    // Database connection pool will close automatically when process exits
    console.log('🔌 Database connection will close on exit');
  }
}

// Run the script
if (require.main === module) {
  embedAllSamples()
    .then(() => {
      console.log('\n👋 Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { embedAllSamples };