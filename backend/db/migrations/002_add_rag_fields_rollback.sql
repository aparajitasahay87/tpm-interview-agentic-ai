-- Week 2 Migration Rollback: Remove RAG fields
-- Use this only if you need to rollback to Week 1 state

-- Remove check constraint
ALTER TABLE sample_answers 
  DROP CONSTRAINT IF EXISTS check_level_values;

-- Remove indexes
DROP INDEX IF EXISTS idx_sample_answers_pinecone_id;
DROP INDEX IF EXISTS idx_sample_answers_question_type;
DROP INDEX IF EXISTS idx_sample_answers_good_examples;
DROP INDEX IF EXISTS idx_sample_answers_level;

-- Remove columns
ALTER TABLE sample_answers 
  DROP COLUMN IF EXISTS pinecone_id,
  DROP COLUMN IF EXISTS embedding_created_at,
  DROP COLUMN IF EXISTS question_text,
  DROP COLUMN IF EXISTS situation_text,
  DROP COLUMN IF EXISTS task_text,
  DROP COLUMN IF EXISTS action_text,
  DROP COLUMN IF EXISTS result_text,
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS metadata;