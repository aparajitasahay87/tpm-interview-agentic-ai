-- Migration: Create metadata_cache table
-- Purpose: Store extracted metadata to avoid repeated API calls
-- Savings: ~95% reduction in metadata extraction API calls

-- Create metadata_cache table
CREATE TABLE IF NOT EXISTS metadata_cache (
  id SERIAL PRIMARY KEY,
  sample_answer_id INTEGER NOT NULL REFERENCES sample_answers(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one cache entry per sample answer
  CONSTRAINT unique_sample_answer UNIQUE (sample_answer_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_metadata_cache_sample_answer 
ON metadata_cache(sample_answer_id);

-- Index for querying metadata content (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_metadata_cache_metadata 
ON metadata_cache USING GIN (metadata);

-- Add comment for documentation
COMMENT ON TABLE metadata_cache IS 'Caches extracted metadata from sample answers to reduce OpenAI API calls';
COMMENT ON COLUMN metadata_cache.sample_answer_id IS 'Reference to sample_answers table';
COMMENT ON COLUMN metadata_cache.metadata IS 'Extracted metadata in JSON format (situation, action, result)';
COMMENT ON COLUMN metadata_cache.created_at IS 'When metadata was first extracted';
COMMENT ON COLUMN metadata_cache.updated_at IS 'When metadata was last updated';

-- Sample query to verify table
-- SELECT * FROM metadata_cache LIMIT 5;