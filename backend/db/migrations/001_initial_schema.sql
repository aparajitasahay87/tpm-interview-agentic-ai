CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rounds (
  id SERIAL PRIMARY KEY,
  interview_id INTEGER REFERENCES interviews(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  conversation_context JSONB DEFAULT '[]',
  asked_at TIMESTAMP DEFAULT NOW(),
  answered_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  round_id INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
  situation_score INTEGER CHECK (situation_score BETWEEN 0 AND 5),
  task_score INTEGER CHECK (task_score BETWEEN 0 AND 5),
  action_score INTEGER CHECK (action_score BETWEEN 0 AND 5),
  result_score INTEGER CHECK (result_score BETWEEN 0 AND 5),
  overall_score DECIMAL(3,2),
  strengths TEXT[],
  weaknesses TEXT[],
  improvement_tips TEXT[],
  evaluated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  interview_id INTEGER REFERENCES interviews(id) ON DELETE CASCADE,
  round_id INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
  step_type VARCHAR(50),
  step_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_executions (
  id SERIAL PRIMARY KEY,
  round_id INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  input_data JSONB,
  output_data JSONB,
  execution_time_ms INTEGER,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sample_answers (
  id SERIAL PRIMARY KEY,
  question_type VARCHAR(50),
  answer_text TEXT NOT NULL,
  situation_score INTEGER,
  task_score INTEGER,
  action_score INTEGER,
  result_score INTEGER,
  overall_score DECIMAL(3,2),
  feedback TEXT,
  is_good_example BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_rounds_interview_id ON rounds(interview_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_round_id ON evaluations(round_id);

INSERT INTO users (email, name) 
SELECT 'test@example.com', 'Test User'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'test@example.com');
