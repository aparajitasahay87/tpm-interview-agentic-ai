require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');

/**
 * Clean Pinecone Namespace
 * Deletes all vectors to prepare for fresh embeddings
 */
async function cleanPinecone() {
  console.log('🧹 Cleaning Pinecone namespace...\n');
  
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    // To:
const indexName = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX || 'tpm-interview-examples';
    const namespace = process.env.PINECONE_NAMESPACE || 'sample-answers';
    
    console.log(`Index: ${indexName}`);
    console.log(`Namespace: ${namespace}\n`);
    
    const index = pinecone.index(indexName);
    
    // Get current stats
    const stats = await index.describeIndexStats();
    const currentCount = stats.namespaces?.[namespace]?.vectorCount || 0;
    
    console.log(`Current vectors in namespace: ${currentCount}`);
    
    if (currentCount === 0) {
      console.log('\n✅ Namespace already empty!');
      return;
    }
    
    // Delete all vectors in namespace
    console.log(`\n🗑️  Deleting all ${currentCount} vectors...`);
    
    await index.namespace(namespace).deleteAll();
    
    console.log('✅ Deletion command sent');
    
    // Wait a moment for deletion to propagate
    console.log('\n⏳ Waiting 5 seconds for deletion to propagate...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify deletion
    const newStats = await index.describeIndexStats();
    const newCount = newStats.namespaces?.[namespace]?.vectorCount || 0;
    
    console.log(`\n📊 Final vector count: ${newCount}`);
    
    if (newCount === 0) {
      console.log('\n✅ Pinecone namespace cleaned successfully!');
    } else {
      console.log('\n⚠️  Some vectors may still be propagating. Wait a minute and check again.');
    }
    
  } catch (error) {
    console.error('\n❌ Error cleaning Pinecone:', error.message);
    process.exit(1);
  }
}

// Execute
cleanPinecone().then(() => {
  console.log('\n🎉 Cleanup complete!\n');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});