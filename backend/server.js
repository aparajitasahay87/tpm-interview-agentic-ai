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
const searchRoutes = require('./routes/search'); // NEW: Week 2 Day 3

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    version: '2.0.0', // Week 2
    timestamp: new Date().toISOString(),
    features: {
      star_parser: true,
      embedding_generator: true,
      semantic_search: true, // NEW
      rag_enabled: process.env.ENABLE_RAG_FEATURES === 'true'
    }
  });
});

// API routes
app.use('/api/tools', toolsRoutes);
app.use('/api/search', searchRoutes); // NEW: Week 2 Day 3

// Admin routes (for testing/debugging)
const adminRoutes = require('./routes/admin');
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

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 TPM Interview Agentic AI - Week 2');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 RAG Features: ${process.env.ENABLE_RAG_FEATURES === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log('\n📚 Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /api/tools/parse-star - STAR analysis (Week 1)');
  console.log('  POST /api/search/similar - Semantic search (Week 2 NEW)');
  console.log('  POST /api/search/test - Test semantic search (Week 2 NEW)');
  console.log('  GET  /api/search/health - Search health check (Week 2 NEW)');
  console.log('  GET  /admin/* - Admin endpoints\n');
});

module.exports = app;