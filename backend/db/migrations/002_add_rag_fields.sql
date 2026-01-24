-- Week 2 Migration: Add RAG fields to sample_answers table
-- Purpose: Enable semantic search and comparison analysis

-- Add new columns for RAG functionality
ALTER TABLE sample_answers 
  ADD COLUMN IF NOT EXISTS pinecone_id VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS embedding_created_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS question_text TEXT,
  ADD COLUMN IF NOT EXISTS situation_text TEXT,
  ADD COLUMN IF NOT EXISTS task_text TEXT,
  ADD COLUMN IF NOT EXISTS action_text TEXT,
  ADD COLUMN IF NOT EXISTS result_text TEXT,
  ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sample_answers_pinecone_id 
  ON sample_answers(pinecone_id) 
  WHERE pinecone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sample_answers_question_type 
  ON sample_answers(question_type) 
  WHERE question_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sample_answers_good_examples 
  ON sample_answers(is_good_example) 
  WHERE is_good_example = true;

CREATE INDEX IF NOT EXISTS idx_sample_answers_level 
  ON sample_answers(level) 
  WHERE level IS NOT NULL;

-- Update existing rows with default level if NULL
UPDATE sample_answers 
SET level = 'mid' 
WHERE level IS NULL;

-- Add check constraint for level values
ALTER TABLE sample_answers 
  ADD CONSTRAINT check_level_values 
  CHECK (level IN ('junior', 'mid', 'senior'));
