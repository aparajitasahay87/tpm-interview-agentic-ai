# TPM Interview Coach — Agentic AI Pipeline

> AI-powered TPM interview coaching with STAR analysis, competency scoring, RAG-grounded feedback, and a 4-step agentic quality pipeline.

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://postgresql.org)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-orange)](https://openai.com)
[![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-purple)](https://pinecone.io)
[![Firebase](https://img.shields.io/badge/Auth-Firebase-yellow)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Agentic Pipeline](#agentic-pipeline)
- [Prompting Techniques](#prompting-techniques)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Benchmark Harness](#benchmark-harness)
- [Database Schema](#database-schema)
- [Caching Strategy](#caching-strategy)
- [Production Deployment](#production-deployment)

---

## Overview

TPM Interview Coach is a full-stack AI application that analyzes interview answers using a multi-step agentic pipeline. It goes beyond generic feedback — using real high-scoring answers as grounding examples, competency rubrics calibrated to TPM levels, and a critic loop that validates output before it reaches the user.

**What it does:**
- Parses answers into STAR components (Situation, Task, Action, Result) and scores each 1–5
- Scores 6 TPM competencies against level-calibrated rubrics using chain-of-thought reasoning
- Retrieves the top 2 semantically similar ideal answers from Pinecone (2-shot grounding)
- Generates copy-paste ready rewrites grounded in real examples with adaptive metadata
- Runs a quality gate to decide whether evidence is sufficient before the critic reviews
- Validates and self-corrects scores through a critic pass before returning

**Benchmark results (3 runs, identical inputs):**

| Metric | 2-Pass | 3-Pass | 4-Step Agentic |
|---|---|---|---|
| LLM Calls | 1 | 2 | 3 |
| Latency (p50) | 16s | 23s | 26s |
| Cost/Analysis | $0.021 | $0.029 | $0.029 |
| Judge Score | 3.0/5 | 3.77/5 | 3.6/5 |
| Hallucination Rate | 3/3 ❌ | 0/3 ✅ | 1/3 ⚠️ |
| Grounding | 4.0/5 | 3.67/5 | 4.0/5 |

**Production choice: 4-Step Agentic** — best grounding (4.0/5), circuit breaker, quality gate, and critic loop built for production edge cases.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT (Lovable Free)                       │
│                    React + Tailwind + Vite                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS
                      ▼
              ┌───────────────┐
              │   Firebase    │  ← Authentications
              │     Auth      │
              └───────┬───────┘
                      │ JWT token
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS API SERVER                           │
│                   Node.js 22 / Render                           │
│                                                                 │
│  POST /api/analyze          GET  /api/questions                 │
│  POST /api/auth/*           GET  /api/health                    │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐
│   CombinedAnalyzer   │   │    CacheService       │
│      (Agentic)       │   │                       │
│                      │   │  • Metadata cache     │
│  Step 1: Semantic    │   │    (PostgreSQL)        │
│          Search      │   │  • Rubrics cache      │
│  Step 2: Combined    │   │    (in-memory 24h)    │
│          Analysis    │   │  • Embedding cache    │
│  Step 3: Quality     │   │    (LRU in-memory)    │
│          Gate        │   └──────────┬────────────┘
│  Step 4: Critic Pass │              │
└──────────┬───────────┘              │
           │                          │
     ┌─────┴──────┐            ┌──────┴──────┐
     ▼            ▼            ▼             ▼
┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ OpenAI  │ │Pinecone  │ │PostgreSQL│ │  Firebase    │
│  GPT-4o │ │ (.js SDK)│ │ (Render) │ │    Auth      │
│ GPT-4o  │ │          │ │          │ │              │
│  -mini  │ │  RAG     │ │questions │ │  users       │
└─────────┘ └──────────┘ │rubrics   │ │  sessions    │
                         │examples  │ └──────────────┘
                         └──────────┘
```

---

## Agentic Pipeline

The core of the system is a 4-step agentic pipeline inspired by Andrew Ng's framework for agentic AI design — reflection loops, planning before acting, and dynamic routing based on intermediate output quality.

```
User Answer
     │
     ▼
┌────────────────────────────────────────────────────┐
│  STEP 1: SEMANTIC SEARCH                           │
│  Pinecone.js retrieves top 2 ideal answers         │
│  by category + cosine similarity                   │
│  Quality filter: score >= 4.0 only                 │
│  Model: text-embedding-3-small                     │
└────────────────────┬───────────────────────────────┘
                     │ 2 raw ideal examples
                     ▼
┌────────────────────────────────────────────────────┐
│  STEP 2: METADATA ENRICHMENT                       │
│  MetadataExtractor_Adaptive structures each        │
│  example into 4 fields:                            │
│    context            (org scale, seniority)       │
│    complexity_signals (team size, timeline)        │
│    execution_evidence (tools, frameworks, process) │
│    impact_signals     (metrics, business impact)   │
│                                                    │
│  Model: gpt-4o-mini                                │
│  Cache: memory → PostgreSQL → API (3 layers)       │
│  Production: always cache hit — 100 examples       │
│  pre-extracted. Zero LLM cost at runtime.          │
└────────────────────┬───────────────────────────────┘
                     │ 2 enriched ideal examples (2-shot)
                     ▼
┌────────────────────────────────────────────────────┐
│  STEP 3: COMBINED ANALYSIS  ← Chain-of-Thought     │
│  Single GPT-4o call with forced reasoning steps:   │
│                                                    │
│  CoT Step 1 — Evidence Inventory                   │
│    Extract ONLY what candidate explicitly stated   │
│    tools, stakeholders, metrics, timeline,         │
│    company context, seniority signals              │
│                                                    │
│  CoT Step 2 — Gap Analysis                         │
│    Compare inventory vs ideal example metadata     │
│    context, complexity_signals, execution_         │
│    evidence, impact_signals                        │
│                                                    │
│  CoT Step 3 — Score with justification             │
│    STAR: quote gap → assign score                  │
│    Competency: quote rubric descriptor → score     │
│                                                    │
│  CoT Step 4 — 2-Shot Grounded Rewrites             │
│    Each rewrite cites Example 1 or Example 2       │
│    Uses star_breakdown, company, level, metadata   │
│                                                    │
│  Model: GPT-4o (max_tokens: 4500)                  │
│  Pattern: CircuitBreaker + RateLimiter             │
└────────────────────┬───────────────────────────────┘
                     │ draft_analysis
                     ▼
┌────────────────────────────────────────────────────┐
│  STEP 4: QUALITY GATE  ← Agentic Decision Point    │
│  GPT-4o-mini evaluates evidence inventory:         │
│                                                    │
│  PROCEED       → evidence sufficient, run critic   │
│  NEEDS_CONTEXT → specific weakness flagged,        │
│                  targeted hint passed to critic    │
│                                                    │
│  Non-blocking: failure defaults to PROCEED         │
│  Model: GPT-4o-mini (~$0.001, ~1-2s)               │
└────────────────────┬───────────────────────────────┘
                     │ gate_decision + optional hint
                     ▼
┌────────────────────────────────────────────────────┐
│  STEP 5: CRITIC PASS  ← Reflection Loop            │
│  GPT-4o-mini audits for 6 contradiction types:     │
│  TYPE 1: STAR score contradicts evidence           │
│  TYPE 2: Competency score contradicts rubric       │
│  TYPE 3: Generic phrases in feedback               │
│  TYPE 4: Score inconsistency across components     │
│  TYPE 5: Hallucinated frameworks in improvements   │
│  TYPE 6: Improvements not grounded in examples     │
│                                                    │
│  Gate hint injected when NEEDS_CONTEXT             │
│  validateAnalysis() safety net after corrections   │
│  Model: GPT-4o-mini                                │
└────────────────────┬───────────────────────────────┘
                     │ validated_analysis
                     ▼
                 API Response
```

**Resilience patterns:**
- `CircuitBreaker` — opens after 5 failures, 30s reset window, prevents cascade failures
- `RateLimiter` — token bucket, respects OpenAI tier limits
- `validateAnalysis()` — safety net catches zero scores or missing fields post-critic
- `getFallbackResponse()` — graceful degradation, never returns 500 to user

---

## Prompting Techniques

Three prompting techniques work together in Step 2 to produce high-quality, grounded, hallucination-free feedback.

### 1. Chain-of-Thought (CoT) Reasoning

The Step 2 prompt forces the model through 4 explicit reasoning steps **before** producing any scores or rewrites. This prevents the model from scoring first and rationalizing second — a common failure mode in LLM evaluation tasks.

```
"You are an expert TPM interview coach. Use chain-of-thought
reasoning to analyze this answer comprehensively.

STEP 1 - EVIDENCE INVENTORY (Do This First):
Extract ONLY what is explicitly stated in the candidate_answer.
Do not infer or assume...

STEP 2 - GAP ANALYSIS:
Compare your Evidence Inventory against ideal_examples...

STEP 3 - SCORE WITH JUSTIFICATION:
[every score must reference a specific gap]

STEP 4 - GENERATE IMPROVEMENTS:
[every rewrite must cite Example 1 or Example 2]"
```

**Where it lives:** `buildCombinedPrompt()` → `instructions` block in `CombinedAnalyzer_Agentic.js`

**Visible in API response:** `internal_reasoning` — the model's complete thought process. Every score traces to a quoted gap, every gap traces to the evidence inventory.

---

### 2. 2-Shot Grounding

The top 2 semantically similar ideal answers (score ≥ 4.0, retrieved from Pinecone) are injected into the prompt as structured reference examples. Each example is enriched by `MetadataExtractor_Adaptive` with 4 metadata dimensions:

```javascript
{
  id: 1,                        // Referenced as "Example 1" in rewrites
  score: 5.0,
  company: "Google",
  level: "Senior TPM",
  answer_text: "...",
  star_breakdown: {             // Pre-parsed — no extra LLM call
    situation: "...",
    task: "...",
    action: "...",
    result: "..."
  },
  metadata: {
    context: {},                // org scale, scope, seniority indicators
    complexity_signals: {},     // team scale, timeline, constraints
    execution_evidence: {},     // stakeholders, tools, frameworks used
    impact_signals: {}          // quantified metrics, business impact
  }
}
```

**Where it lives:** `SemanticSearch.findSimilarAnswers()` → `MetadataExtractor_Adaptive.extractMetadata()` → `buildCombinedPrompt()`

**Why it matters:** Without grounded examples the model invents metrics (hallucination rate 3/3 in 2-pass baseline). With 2-shot grounding, rewrites cite real details from real answers at the correct seniority level — hallucination drops to 0/3 in 3-pass, 1/3 in 4-step.

---

### 3. Rubric-Anchored Competency Scoring

Each of the 6 TPM competencies is scored by forcing the model to quote the matching rubric level descriptor verbatim before assigning a number. No descriptor quote = invalid score.

```
"For EACH competency:
  (1) find the closest matching level descriptor
      (level_1 = score 1-2, level_3 = score 3, level_5 = score 4-5)
  (2) quote that descriptor verbatim
  (3) cite the specific evidence from the candidate answer
  (4) THEN assign the score.

A score with no quoted descriptor is invalid."
```

**Where it lives:** `instructions.competency_scoring` in `buildCombinedPrompt()`

**Visible in API response:**
```json
"competency_reasoning": {
  "Communication": {
    "closest_level": "level_1",
    "descriptor_quoted": "Mentions communicating with team or stakeholders",
    "evidence_found": "coordinating with multiple teams",
    "score": 2
  }
}
```

---

## Project Structure

```
tpm-interview-agentic-ai/
├── frontend/                              # Lovable React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── hooks/
│   └── package.json
│
├── backend/
│   ├── agents/
│   │   └── tools/
│   │       ├── CombinedAnalyzer_Agentic.js      # ← Production (4-step)
│   │       ├── CombinedAnalyzer_Production.js    # 3-pass variant
│   │       ├── CombinedAnalyzer_ProductionOld.js # 2-pass baseline
│   │       ├── SemanticSearch.js                 # Pinecone.js wrapper
│   │       ├── MetadataExtractor_Adaptive.js     # Flexible metadata extraction
│   │       ├── CircuitBreaker.js                 # Resilience pattern
│   │       └── EmbeddingCache.js                 # LRU in-memory cache
│   │
│   ├── routes/
│   │   ├── analyze.js                            # POST /api/analyze
│   │   ├── questions.js                          # GET /api/questions
│   │   ├── auth.js                               # Firebase auth routes
│   │   ├── LLMJudge.js                           # Benchmark judge (GPT-4o)
│   │   ├── benchmark_harness.js                  # Benchmark runner
│   │   └── validate_fixes.js                     # 37-point validation suite
│   │
│   ├── services/
│   │   └── CacheService.js                       # Metadata + rubrics cache
│   │
│   ├── config/
│   │   └── database.js                           # PostgreSQL pool (Render)
│   │
│   ├── scripts/
│   │   └── seed/                                 # DB seed scripts
│   │
│   ├── .env                                      # Not committed — see template
│   ├── server.js                                 # Express entry point
│   └── package.json
│
├── benchmark_results/                            # JSON output from harness runs
├── README.md
└── .gitignore
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Tailwind + Vite (Lovable Free) | UI |
| Authentication | Firebase Auth | User sign-in + JWT |
| Backend | Node.js 22 + Express | API server |
| Auth | Firebase Authentication | Google/email sign-in |
| Hosting | Render | Backend + PostgreSQL |
| Primary LLM | OpenAI GPT-4o | Combined analysis Step 2 |
| Secondary LLM | OpenAI GPT-4o-mini | Quality gate Step 3 + Critic Step 4 |
| Embeddings | text-embedding-3-small | Pinecone vector indexing |
| Vector DB | Pinecone (pinecone npm SDK) | Semantic search for ideal examples |
| Database | PostgreSQL (Render) | Questions, rubrics, examples |
| Metadata | MetadataExtractor_Adaptive.js | Flexible extraction from ideal examples |

---

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 15+ (or Render PostgreSQL)
- OpenAI API key
- Pinecone API key + index created
- Firebase project with Authentication enabled

### Installation

```bash
# Clone the repo
git clone https://github.com/aparajitasahay87/tpm-interview-agentic-ai.git
cd tpm-interview-agentic-ai

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Database Setup

```bash
cd backend

# Run migrations
node scripts/seed/migrate.js

# Seed questions and rubrics
node scripts/seed/seed_questions.js
node scripts/seed/seed_rubrics.js

# Seed ideal examples (required for RAG + 2-shot grounding)
node scripts/seed/seed_examples.js
```

### Run Locally

```bash
# Backend
cd backend && npm run dev     # http://localhost:3001

# Frontend
cd frontend && npm run dev    # http://localhost:5173
```

---

## Environment Variables

Create `backend/.env`:

```env
# Database (Render PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# OpenAI
OPENAI_API_KEY=sk-...

# Pinecone
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=tpm-interview-coach
PINECONE_ENVIRONMENT=us-east-1-aws

# Firebase Auth (Admin SDK)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com

# App
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://tpm-star-guide.lovable.app/
```

---

## API Reference

### `POST /api/analyze`

Runs the full 4-step agentic pipeline against a candidate answer.

**Request:**
```json
{
  "questionId": 42,
  "userAnswer": "I led a migration project at my company..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "star": {
      "situation": { "score": 2, "text": "...", "feedback": "Missing: company context. Ideal has: Google, cloud platform division." },
      "task":      { "score": 2, "text": "...", "feedback": "..." },
      "action":    { "score": 2, "text": "...", "feedback": "..." },
      "result":    { "score": 2, "text": "...", "feedback": "..." }
    },
    "competencies": {
      "Communication": 2,
      "Execution": 2,
      "Prioritization": 1,
      "Program Kickoff": 1,
      "Risk Mitigation": 1,
      "Strategic Influence": 1
    },
    "improvements": [
      {
        "priority": "critical",
        "component": "situation",
        "gap_identified": "Missing: company context. Ideal has: Google, cloud platform division.",
        "current_text": "I was working at my company...",
        "rewritten_text": "At Google, I led a project involving 15 team members across 5 cross-functional teams...",
        "rationale": "Ideal Senior TPM at Google has context.organizational_scale — candidate has none",
        "example_reference": "Example 1"
      }
    ],
    "internal_reasoning": {
      "evidence_inventory": {
        "tools_systems": "none",
        "stakeholders": "generic: multiple teams",
        "metrics_numbers": "none",
        "timeline": "none",
        "company_team_context": "none",
        "seniority_signals": "led the effort, coordinated with multiple teams"
      },
      "gap_analysis": ["Missing: metrics. Ideal has: 25% cost reduction, 30% adoption increase."],
      "score_reasoning": ["Scoring Situation 2/5 because inventory shows no company context..."],
      "competency_reasoning": {
        "Communication": {
          "closest_level": "level_1",
          "descriptor_quoted": "Mentions communicating with team or stakeholders",
          "evidence_found": "coordinating with multiple teams",
          "score": 2
        }
      }
    },
    "_critic": {
      "corrections_made": [],
      "critic_notes": "Scores validated — no contradictions found",
      "corrections_count": 0,
      "gate_decision": "PROCEED",
      "gate_hint": null
    }
  }
}
```

---

## Benchmark Harness

A purpose-built evaluation framework that runs all 3 pipeline versions against identical inputs and scores output quality using an LLM judge (GPT-4o).

```bash
cd backend/routes

# Full benchmark — 3 runs per version (~$0.26 total)
node benchmark_harness.js --runs 3

# Single version only
node benchmark_harness.js --runs 3 --analyzer 4_step_agentic

# Quick smoke test (~$0.03)
node benchmark_harness.js --test-judge --analyzer 3_pass
```

**Judge scoring weights:**

| Dimension | Weight | Rationale |
|---|---|---|
| Actionability | 40% | Copy-paste ready rewrites are the core value |
| Grounding | 30% | Must cite real ideal example details |
| Gap Analysis | 20% | Must explain why answer is weaker |
| Specificity | 10% | Must reference candidate's unique details |

---

## Database Schema

```sql
questions        (id, text, category_id, difficulty, created_at)
categories       (id, name, description)
rubrics          (id, category_id, competency_name,
                  level_1_description, level_3_description, level_5_description)
sample_answers   (id, question_id, answer_text, overall_score, category_id)
benchmark_results (id, analyzer_version, run_number, latency_ms, cost_total,
                   judge_overall, hallucination, gate_decision, created_at)
```

---

## Caching Strategy

Three-layer cache — no Redis required. All caching runs in-process.

| Cache | Type | Storage | TTL | What it eliminates |
|---|---|---|---|---|
| Metadata Cache | Response cache | PostgreSQL | Persistent | MetadataExtractor_Adaptive runs once per ideal example — reused by all users forever |
| Rubrics Cache | Exact-match | In-memory | 24 hours | One DB fetch per category per server restart — not per request |
| Embedding Cache | LRU (100 slots) | In-memory Map | 24 hours | Repeat Pinecone embedding calls — high value in benchmark runs |

---


---

## Prompt Engineering: Chain of Thought + 2-Shot Grounding

Two prompt engineering techniques are central to output quality in Step 2 (Combined Analysis).

### Chain of Thought (CoT)

The analyzer prompt forces the model to complete `internal_reasoning` **before** it is allowed to produce any scores or rewrites. This is explicit in the prompt structure:

```
internal_reasoning: {
  description: "COMPLETE THIS FIRST before providing scores.
                This is your internal thought process — be explicit
                about what you see.",

  evidence_inventory: {
    description: "COMPLETE THIS FIRST — extract only what is
                  explicitly in the candidate answer",
    tools_systems:        "...",
    stakeholders:         "...",
    metrics_numbers:      "...",
    timeline:             "...",
    company_team_context: "...",
    seniority_signals:    "..."
  },

  gap_analysis: [
    "Missing: tools/systems. Ideal has: RICE framework.
     Candidate inventory has: none"
  ],

  score_reasoning: [
    "Scoring Situation as 2/5 because inventory shows X but
     missing Y and Z"
  ],

  competency_reasoning: {
    "Communication": {
      closest_level:      "level_1",
      descriptor_quoted:  "Mentions communicating with stakeholders",
      evidence_found:     "coordinating with multiple teams",
      score:              2
    }
  }
}
```

**Why it matters:** Without CoT, the model produces scores first and rationalizes after — leading to inconsistent, overconfident scores. By forcing evidence inventory → gap analysis → reasoning → score in sequence, contradictions are caught before they reach the output. The `max_tokens` is set to 4500 specifically to prevent CoT truncation mid-reasoning.

**Where it's used:** Step 3 (`buildCombinedPrompt`) and Step 5 (`buildCriticPrompt`)

---

### 2-Shot Prompting (RAG-Grounded)

The prompt injects **2 semantically similar ideal answers** retrieved from Pinecone as grounding examples. These are not generic examples — they are real high-scoring answers (score ≥ 4.0) from the same question category, enriched with structured metadata by `MetadataExtractor_Adaptive`:

```
ideal_examples: [
  {
    index: 0,
    answer_text: "At Google, I led a project...",
    overall_score: 5.0,
    star_breakdown: {
      situation: "Google, cloud platform division, 15 team members...",
      task:       "Strict budgetary constraints of $1M...",
      action:     "Pivoted strategy 3 times using RICE framework...",
      result:     "30% increase in system adoption..."
    },
    metadata: {
      context:              { seniority: "Staff TPM", org_scale: "Google" },
      complexity_signals:   { team_size: 15, timeline: "6 months" },
      execution_evidence:   { frameworks: ["RICE"], stakeholders: [...] },
      impact_signals:       { quantified_metrics: ["30% adoption", "$1M budget"] }
    }
  },
  {
    index: 1,
    // Second ideal example — same structure
  }
]
```

The model is then explicitly instructed:

> *"Reference company and level from ideal_examples to show organizational scale (e.g. 'Example 1 is a Senior TPM at Meta')"*
> *"Use star_breakdown fields from ideal_examples for direct component comparison"*
> *"ANTI-HALLUCINATION RULE: Never invent frameworks or metrics not in ideal_examples metadata"*

**Why it matters:** 2-shot grounding is what separates generic feedback ("add more metrics") from specific, copy-paste ready rewrites ("The migration was completed 3 weeks ahead of schedule, leading to a 30% increase in system adoption"). Without real examples, example grounding drops from 4.0/5 to 1.0/5 — confirmed by benchmark data.

**Where it's used:** Step 3 (`buildCombinedPrompt`) — both shots passed as `enrichedExamples` array, enriched by MetadataExtractor_Adaptive in Step 2

---

### How CoT + 2-Shot Work Together

```
Step 1: Pinecone retrieves 2 real answers (2-shot)
         ↓
Step 2: MetadataExtractor_Adaptive enriches with structured metadata
        (gpt-4o-mini — DB cache hit in production, zero cost at runtime)
         ↓
Step 3: buildCombinedPrompt injects both enriched shots into context
         ↓
Model forced to build evidence_inventory from candidate answer (CoT step 1)
         ↓
Model forced to run gap_analysis vs ideal_examples (CoT step 2)
         ↓
Model forced to write score_reasoning before assigning scores (CoT step 3)
         ↓
Scores and rewrites produced — grounded in both CoT reasoning AND real examples
         ↓
Step 4: Quality gate — PROCEED or NEEDS_CONTEXT
         ↓
Step 5: Critic verifies no contradictions between evidence and scores
        (gate hint injected if NEEDS_CONTEXT)
```

The two techniques are intentionally coupled — CoT without grounding produces well-reasoned but generic feedback; 2-shot without CoT produces specific details but inconsistent scores. Together they are what makes the output production-quality.

## Production Deployment

### Backend → Render

1. Connect GitHub `main` branch in Render dashboard
2. Set all environment variables from the template above
3. Health check: `GET /api/health`

### Frontend → Lovable → Netlify

1. Push to `main`
2. Lovable auto-deploys to Netlify
3. Set `VITE_API_URL` to your Render backend URL

### Branch Strategy

```
main        → production (Lovable maps here)
staging     → staging environment
feature/*   → branch from staging, PR back to staging
```

### Pre-deploy Checklist

```bash
# 1. Run 37-point validation suite
node backend/routes/validate_fixes.js

# 2. Smoke test the agentic pipeline
node backend/routes/benchmark_harness.js --test-judge --analyzer 4_step_agentic

# 3. Confirm in output JSON:
#    gate_decision: "PROCEED" (not null)
#    hallucination: false
#    corrections_count: integer (not null)

# 4. Push to staging → verify → promote to main
```

---

## Contributing

1. Branch from `staging`: `git checkout -b feature/your-feature staging`
2. Run validation suite before PR
3. PR into `staging` — never directly into `main`

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built by [Aparajita Sahay](https://www.linkedin.com/in/aparajita-sahay) · [Blog: From MVP to Agentic](https://medium.com/@aparajita.sahay87)*
