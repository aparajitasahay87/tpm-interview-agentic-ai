-- =============================================
-- Phase 5: Category System Migration
-- =============================================

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  competencies JSONB,
  question_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Question Types Table
CREATE TABLE IF NOT EXISTS question_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  description TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Questions Table
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  question_type_id INTEGER REFERENCES question_types(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  difficulty VARCHAR(20) CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  tags TEXT[],
  ideal_answer_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Rubrics Table
CREATE TABLE IF NOT EXISTS rubrics (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  competency_name VARCHAR(100) NOT NULL,
  level_1_description TEXT,
  level_3_description TEXT,
  level_5_description TEXT,
  weight DECIMAL(3,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, competency_name)
);

-- 5. Update sample_answers table
ALTER TABLE sample_answers
  ADD COLUMN IF NOT EXISTS question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS competency_scores JSONB,
  ADD COLUMN IF NOT EXISTS company VARCHAR(100),
  ADD COLUMN IF NOT EXISTS year_answered INTEGER;

-- 6. User Attempts Table
CREATE TABLE IF NOT EXISTS user_attempts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  star_scores JSONB,
  competency_scores JSONB,
  improvements JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. User Progress Table
CREATE TABLE IF NOT EXISTS user_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  competency_name VARCHAR(100) NOT NULL,
  avg_score DECIMAL(3,2),
  attempts_count INTEGER DEFAULT 0,
  last_attempt_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category_id, competency_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type_id);
CREATE INDEX IF NOT EXISTS idx_sample_answers_question ON sample_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_sample_answers_category ON sample_answers(category_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_user ON user_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_attempts_question ON user_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_category ON user_progress(user_id, category_id);

-- Trigger to update question count
CREATE OR REPLACE FUNCTION update_category_question_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE categories
  SET question_count = (
    SELECT COUNT(*) FROM questions WHERE category_id = NEW.category_id
  )
  WHERE id = NEW.category_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_question_count
AFTER INSERT OR DELETE ON questions
FOR EACH ROW
EXECUTE FUNCTION update_category_question_count();