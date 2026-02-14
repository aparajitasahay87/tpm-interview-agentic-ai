const express = require('express');
const cors = require('cors');
const helmet = require('helmet');


require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Import routes
const toolsRoutes = require('./routes/tools');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');
const categoriesRoutes = require('./routes/categories'); // ⭐ NEW

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    version: '3.0.0', // ⭐ Phase 5
    timestamp: new Date().toISOString(),
    features: {
      star_parser: true,
      embedding_generator: true,
      semantic_search: true,
      categories: true, // ⭐ NEW
      rag_enabled: process.env.ENABLE_RAG_FEATURES === 'true'
    }
  });
});

// API routes
app.use('/api/tools', toolsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/categories', categoriesRoutes); // ⭐ NEW
app.use('/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Import cache service
const { getCacheService } = require('./services/CacheService');

// Start server with cache initialization
async function startServer() {
  try {
    console.log('\n🚀 TPM Interview Agentic AI - Phase 5 (Optimized)');
    console.log('━'.repeat(60));
    
    // Initialize cache service
    console.log('\n📦 Initializing cache service...');
    const cacheService = getCacheService();
    await cacheService.initialize();
    
    // Start server
    app.listen(PORT, () => {
      console.log('\n✅ Server ready!');
      console.log(`📡 Running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🤖 RAG Features: ${process.env.ENABLE_RAG_FEATURES === 'true' ? 'ENABLED' : 'DISABLED'}`);
      console.log('\n📚 Available endpoints:');
      console.log('  GET  /health - Health check');
      console.log('  POST /api/tools/parse-star - STAR analysis');
      console.log('  POST /api/search/similar - Semantic search');
      console.log('  GET  /api/categories - List all categories');
      console.log('  GET  /api/categories/:id - Get category details');
      console.log('  GET  /api/categories/:id/rubrics - Get category rubrics');
      console.log('  GET  /admin/* - Admin endpoints');
      console.log('\n' + '━'.repeat(60) + '\n');
    });
    
  } catch (error) {
    console.error('\n❌ Failed to start server:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
