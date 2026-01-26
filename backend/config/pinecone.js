const { Pinecone } = require('@pinecone-database/pinecone');

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// Index configuration
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples';
const DIMENSION = 1536; // OpenAI text-embedding-3-small
const METRIC = 'cosine';

// Get Pinecone client (NEW - for Week 2 Day 3)
async function getPineconeClient() {
  return pinecone;
}

// Get or create index
async function getIndex() {
  try {
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some(idx => idx.name === INDEX_NAME);
    
    if (!indexExists) {
      console.log(`📊 Creating Pinecone index: ${INDEX_NAME}`);
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: DIMENSION,
        metric: METRIC,
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      console.log('⏳ Waiting for index to be ready...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log('✅ Index created');
    }
    
    return pinecone.index(INDEX_NAME);
  } catch (error) {
    console.error('❌ Error with Pinecone index:', error.message);
    throw error;
  }
}

// Test connection
async function testConnection() {
  try {
    const indexes = await pinecone.listIndexes();
    console.log('✅ Pinecone connected successfully');
    return {
      success: true,
      indexes: indexes.indexes || []
    };
  } catch (error) {
    console.error('❌ Pinecone connection failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  pinecone,
  getPineconeClient,  // NEW export
  getIndex,
  testConnection,
  INDEX_NAME,
  DIMENSION,
  METRIC
};