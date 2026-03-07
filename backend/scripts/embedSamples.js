/**
 * embedSamples.js — Production Version
 *
 * Run modes:
 *   node scripts/embedSamples.js          → safe mode (skip wipe, embed new only)
 *   node scripts/embedSamples.js --force  → wipe + full re-index (blocked in production)
 *
 * Design principles:
 *   - Safe by default        : no destructive operation without --force flag
 *   - Self-documenting       : --force makes danger visible in the command itself
 *   - Environment aware      : --force blocked in NODE_ENV=production
 *   - Idempotent             : running twice in safe mode never causes damage
 *   - Single source of truth : competencies fetched from rubrics table — no hardcoding
 *   - Auditable              : logs environment, index name, mode, and timestamp
 *   - Versioned metadata     : metadata_version field distinguishes old vs new vectors
 *   - Self-healing data      : classifyQuestionType() derives question_type from
 *                              question_text when DB value is null — no manual entry needed
 *
 * Metadata schema version history:
 *   v1 (no version field) — original: category_id, level, overall_score only
 *   v2 (current)          — adds comp_scores, comp_category, comp_scored_at
 *   v3 (next)             — bump if schema changes again
 *
 * Metadata schema (dual strategy):
 *   Flat keys   → metadata_version, category_id, level, overall_score,
 *                 question_type (Pinecone server-side filter)
 *   JSON string → comp_scores (LLM reranker payload — schema-flexible)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const OpenAI = require('openai');
const db = require('../config/database');
const { getIndex } = require('../config/pinecone');
const EmbeddingGenerator = require('../agents/tools/EmbeddingGenerator');

// ─── Constants ────────────────────────────────────────────────────────────────
const LEVEL_ORDER = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal'];

// Bump this when the metadata schema changes.
// SemanticSearch filters by this version — old vectors are automatically
// ignored by the new pipeline until re-embedded.
const METADATA_VERSION = 2;

// ─── Parse CLI flags ──────────────────────────────────────────────────────────
const FORCE_REINDEX = process.argv.includes('--force');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── classifyQuestionType ─────────────────────────────────────────────────────
// Derives a precise question_type from question_text using GPT-4o-mini.
// Called at embed time — result stored in Pinecone metadata permanently.
//
// Design:
//   - If question_type already exists in DB → use it, no API call
//   - If question_text is missing → return 'general' safely
//   - Otherwise → classify via GPT-4o-mini with a fixed taxonomy
//
// Why this matters:
//   90% of sample_answers have null question_type in DB.
//   Without it, the reranker can't distinguish "datacenter_migration" from
//   "cloud_migration" or "behavioral_conflict_manager" from "behavioral_risk".
//   This function fixes that data quality problem at the source — one call
//   per sample at embed time, never again.
//
// Taxonomy is designed to be exhaustive for TPM interviews and extensible —
// adding a new type means updating the system prompt and re-running --force.
async function classifyQuestionType(sample, openai) {
  // Use existing DB value if it's clean — no API call needed
  if (sample.question_type && sample.question_type.trim() !== '') {
    return sample.question_type.trim();
  }

  // Safe fallback if no question text to classify from
  if (!sample.question_text || sample.question_text.trim() === '') {
    console.warn(`  ⚠️  No question_text for ID ${sample.id} — defaulting to 'general'`);
    return 'general';
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You classify TPM interview questions into exactly one type from the taxonomy below.
Return ONLY a JSON object: { "question_type": "type" }

TAXONOMY:
Program Sense:
  - cloud_migration          : migrating between cloud providers
  - datacenter_migration     : physical datacenter moves with uptime requirements
  - disaster_recovery        : DR exercises, RTO/RPO, failover planning
  - project_kickoff          : starting a project from scratch, entry/exit criteria
  - project_execution        : running a program, tackling a given project
  - resource_constraints     : limited resources, budget cuts, staffing gaps
  - roadmap_planning         : multi-year roadmaps, long-term strategy
  - stakeholder_communication: status reports, KPIs, newsletters, updates
  - risk_management          : identifying and mitigating risks throughout a program
  - feature_deployment       : deploying features with constraints

System Design:
  - system_design_general    : broad system architecture questions
  - api_design               : API gateway, REST, GraphQL design
  - data_migration_design    : designing data migration tools or pipelines
  - distributed_systems      : hash tables, distributed architecture
  - photo_video_system       : photo/video sharing, media systems
  - access_control_system    : building access, permissions, security systems
  - url_shortener            : URL shortening services
  - feature_tradeoff         : leading technical tradeoff discussions

Behavioral:
  - behavioral_failure       : general failure or mistake stories
  - behavioral_risk          : took a big risk that failed
  - behavioral_conflict_manager : disagreed with manager
  - behavioral_conflict_peer : disagreed with colleague or peer
  - behavioral_feedback      : giving or receiving tough feedback
  - behavioral_obstacles     : unanticipated obstacles to overcome
  - behavioral_resourcefulness: creative solutions with insufficient resources
  - behavioral_credits       : credit attribution, recognition issues
  - behavioral_simple_solution: solved complex problem simply

Technical:
  - technical_debugging      : complex technical problem blocking a program
  - technical_tradeoff       : technical trade-off decisions
  - technical_incident_pre   : bug or issue discovered before release
  - technical_incident_post  : broke something in production or pipeline
  - technical_program        : ran a technical program with architecture
  - technical_operational    : operationalizing at scale (streetview cars, etc)

Partnership:
  - partnership_trust        : building trust with engineers without authority
  - partnership_negotiation  : negotiating complex agreements
  - partnership_conflict     : navigating conflicts between departments (sales vs legal)
  - partnership_crossfunctional: leading cross-functional teams to common goal
  - partnership_resistant    : getting cooperation from resistant peers
  - partnership_no_time      : cross-functional teams saying they have no time
  - partnership_communication: communicating progress to all stakeholders
  - partnership_developers   : building effective partnerships with developers

Pick the MOST SPECIFIC type. Never return null or unknown.`
      },
      {
        role: 'user',
        content: `Classify this TPM interview question into exactly one type:
"${sample.question_text}"`
      }
    ],
    temperature:     0,      // Deterministic — classification should be consistent
    max_tokens:      30,
    response_format: { type: 'json_object' }
  });

  try {
    const result = JSON.parse(response.choices[0].message.content);
    const classified = result.question_type || 'general';
    return classified;
  } catch (e) {
    console.warn(`  ⚠️  Classification parse failed for ID ${sample.id}: ${e.message} — defaulting to 'general'`);
    return 'general';
  }
}

// ─── fetchCompetenciesByCategory ─────────────────────────────────────────────
// Single source of truth: reads competency definitions from the rubrics table.
// Adding a new competency to the DB is automatically picked up on next run —
// no code changes required.
async function fetchCompetenciesByCategory() {
  const result = await db.query(`
    SELECT
      r.competency_name,
      r.level_1_description,
      r.level_3_description,
      r.level_5_description,
      c.name  AS category_name,
      c.id    AS category_id
    FROM rubrics r
    JOIN categories c ON c.id = r.category_id
    ORDER BY c.id, r.competency_name
  `);

  // Group by category_id → { 1: { category_name, rubrics: [...] }, ... }
  const byCategory = {};
  for (const row of result.rows) {
    if (!byCategory[row.category_id]) {
      byCategory[row.category_id] = {
        category_name: row.category_name,
        rubrics: []
      };
    }
    byCategory[row.category_id].rubrics.push({
      competency_name: row.competency_name,
      level_1:         row.level_1_description,
      level_3:         row.level_3_description,
      level_5:         row.level_5_description
    });
  }

  return byCategory;
}

// ─── generateCompetencyScores ─────────────────────────────────────────────────
// Scores a single sample answer against its category rubrics via GPT-4o-mini.
// Returns a flat object: { "Risk Mitigation": 0.85, "Execution": 0.72, ... }
// Scores are clamped to [0.0, 1.0] and rounded to 2 decimal places.
async function generateCompetencyScores(sample, rubrics, openai) {
  const prompt = {
    task: 'score_tpm_example_competencies',
    instructions: [
      'You are scoring a TPM interview example answer against its category competency rubrics.',
      'For each competency, return a float score from 0.0 to 1.0.',
      '0.0  = competency not demonstrated at all.',
      '0.33 = meets Level 1 (basic mention).',
      '0.66 = meets Level 3 (competent execution with specifics).',
      '1.0  = meets Level 5 (expert level with metrics, scale, and impact).',
      'Base scores strictly on what is written in answer_text — no inference.',
      'Return ONLY a flat JSON object: { "competency_name": score_float }',
      'Every competency in the rubrics array must appear in your output.'
    ],
    answer_text:   sample.answer_text,
    question_type: sample.question_type,
    level:         sample.level,
    rubrics:       rubrics.map(r => ({
      competency_name: r.competency_name,
      level_1:         r.level_1,
      level_3:         r.level_3,
      level_5:         r.level_5
    }))
  };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role:    'system',
        content: 'You score TPM interview examples for competency strength. Return only valid JSON — a flat object of competency names to float scores.'
      },
      {
        role:    'user',
        content: JSON.stringify(prompt)
      }
    ],
    temperature:     0.1,
    max_tokens:      400,
    response_format: { type: 'json_object' }
  });

  const raw = JSON.parse(response.choices[0].message.content);

  // Validate and clamp all scores to [0.0, 1.0]
  const validated = {};
  for (const rubric of rubrics) {
    const name = rubric.competency_name;
    const val  = raw[name];

    if (typeof val === 'number' && val >= 0 && val <= 1) {
      validated[name] = Math.round(val * 100) / 100;
    } else {
      console.warn(`  ⚠️  Invalid score for "${name}": ${val} — defaulting to 0.0`);
      validated[name] = 0.0;
    }
  }

  return validated;
}

// ─── embedAllSamples ──────────────────────────────────────────────────────────
async function embedAllSamples() {
  console.log('\n' + '='.repeat(60));
  console.log('  embedSamples.js — Production Run');
  console.log('='.repeat(60));
  console.log(`  Environment      : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Index            : ${process.env.PINECONE_INDEX_NAME}`);
  console.log(`  Metadata version : v${METADATA_VERSION}`);
  console.log(`  Mode             : ${FORCE_REINDEX ? '⚠️  FORCE RE-INDEX' : 'safe (skip wipe)'}`);
  console.log(`  Started at       : ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  // ── Production guard ───────────────────────────────────────────────────────
  if (FORCE_REINDEX && IS_PRODUCTION) {
    console.error('🚨 --force flag is not allowed in NODE_ENV=production.');
    console.error('   To re-index production, run the migration pipeline manually.');
    process.exit(1);
  }

  try {
    // ── Step 1: Load competencies from DB (single source of truth) ───────────
    console.log('📋 Step 1: Loading competencies from rubrics table...');
    const competenciesByCategory = await fetchCompetenciesByCategory();
    const categoryCount = Object.keys(competenciesByCategory).length;

    console.log(`✅ Loaded competencies for ${categoryCount} categories:`);
    for (const [catId, cat] of Object.entries(competenciesByCategory)) {
      console.log(`   Category ${catId} (${cat.category_name}): ${cat.rubrics.map(r => r.competency_name).join(', ')}`);
    }
    console.log();

    // ── Step 2: Fetch samples from DB ─────────────────────────────────────────
    // Safe mode  → only samples not yet embedded (pinecone_id IS NULL)
    // Force mode → all good examples regardless of pinecone_id
    console.log('📊 Step 2: Fetching sample answers from database...');
    const whereClause = FORCE_REINDEX
      ? 'WHERE is_good_example = true'
      : 'WHERE is_good_example = true AND pinecone_id IS NULL';

    console.log(`   Query mode: ${FORCE_REINDEX ? 'all good examples' : 'unembedded only (pinecone_id IS NULL)'}`);

    const result = await db.query(`
      SELECT
        id, category_id, question_type, question_text, answer_text,
        level, situation_text, task_text, action_text, result_text,
        overall_score
      FROM sample_answers
      ${whereClause}
      ORDER BY category_id, id
    `);
    const samples = result.rows;
    console.log(`✅ Found ${samples.length} samples to embed\n`);

    if (samples.length === 0) {
      console.log('ℹ️  No samples need embedding. All done.');
      return;
    }

    // ── Step 3: Initialize clients ────────────────────────────────────────────
    console.log('🔧 Step 3: Initializing clients...');
    const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const generator = new EmbeddingGenerator();
    const index     = await getIndex();
    console.log('✅ OpenAI + Pinecone clients ready\n');

    // ── Step 4: Wipe (--force only) ───────────────────────────────────────────
    if (FORCE_REINDEX) {
      console.log('⚠️  Step 4: --force detected — wiping existing vectors...');
      console.log(`   Index            : ${process.env.PINECONE_INDEX_NAME}`);
      console.log(`   Metadata version : v${METADATA_VERSION}`);
      console.log('   Proceeding in 3 seconds — Ctrl+C to abort...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const existingIds = samples.map(s => s.id.toString());
        await index.namespace('').deleteMany(existingIds);
        console.log(`✅ Wiped ${existingIds.length} existing vectors\n`);
      } catch (err) {
        // Safe to ignore on a fresh index — vectors simply don't exist yet
        console.log(`⚠️  Wipe warning (safe on fresh index): ${err.message}\n`);
      }
    } else {
      console.log('ℹ️  Step 4: Safe mode — skipping wipe');
      console.log('   (run with --force to wipe and re-index clean)\n');
    }

    // ── Step 5: Process each sample ───────────────────────────────────────────
    console.log('🚀 Step 5: Embedding samples...\n');
    let successCount       = 0;
    let errorCount         = 0;
    let classifiedCount    = 0;  // how many question_types were derived vs already existed
    const errors           = [];

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      console.log(`[${i + 1}/${samples.length}] ID: ${sample.id} | Level: ${sample.level}`);

      try {
        // Warn on unknown level — embedding still proceeds
        if (!LEVEL_ORDER.includes(sample.level)) {
          console.warn(`  ⚠️  Unknown level "${sample.level}" — seniority filter may not apply`);
        }

        // Get rubrics for this sample's category
        const categoryData = competenciesByCategory[sample.category_id];
        if (!categoryData) {
          throw new Error(`No rubrics found for category_id ${sample.category_id}`);
        }

        // ── Classify question type ─────────────────────────────────────────
        // Derives question_type from question_text if DB value is null.
        // This is the data quality fix — runs once per sample at embed time.
        const wasNull = !sample.question_type || sample.question_type.trim() === '';
        const questionType = await classifyQuestionType(sample, openai);
        if (wasNull) {
          classifiedCount++;
          console.log(`  🏷️  Classified question_type: "${questionType}" (derived from question_text)`);
        } else {
          console.log(`  🏷️  Question type: "${questionType}" (from DB)`);
        }

        // Generate text embedding
        console.log('  🔄 Generating embedding...');
        const textToEmbed = generator.prepareTextForEmbedding(sample);
        const embedding   = await generator.generateEmbedding(textToEmbed);

        // Generate competency scores
        console.log(`  🧠 Scoring ${categoryData.rubrics.length} competencies via GPT-4o-mini...`);
        const compScores = await generateCompetencyScores(sample, categoryData.rubrics, openai);
        console.log(`  ✅ Scores: ${JSON.stringify(compScores)}`);

        // Build Pinecone metadata
        // ── Flat keys  → used in Pinecone filter:{} at query time (fast, server-side)
        // ── JSON string → read by LLM reranker (flexible, no migration when schema changes)
        const metadata = {
          // Version — SemanticSearch filters by this to ignore old unversioned vectors
          metadata_version: METADATA_VERSION,
          // Flat filter keys
          category_id:      sample.category_id,
          level:            sample.level,
          overall_score:    parseFloat(sample.overall_score) || 0,
          // question_type: always populated — derived via GPT-4o-mini if null in DB
          // Enables reranker to distinguish domains (cloud_migration vs datacenter_migration etc)
          question_type:    questionType,
          question_text:    (sample.question_text || '').substring(0, 300),
          answer_preview:   (sample.answer_text   || '').substring(0, 500),
          // JSON payload — all competency scores for this sample
          // Schema-flexible: adding a competency = bump METADATA_VERSION + re-run
          comp_scores:      JSON.stringify(compScores),
          comp_category:    categoryData.category_name,
          comp_scored_at:   new Date().toISOString()
        };

        // Upsert to Pinecone
        console.log('  📤 Upserting to Pinecone...');
        await index.namespace('').upsert([{
          id:     sample.id.toString(),
          values: embedding,
          metadata
        }]);

        // Update DB record — mark as embedded and store derived question_type
        // if it was previously null (keeps DB and Pinecone in sync)
        if (wasNull && questionType !== 'general') {
          await db.query(`
            UPDATE sample_answers
            SET pinecone_id          = $1,
                embedding_created_at = NOW(),
                question_type        = $3
            WHERE id = $2
          `, [sample.id.toString(), sample.id, questionType]);
        } else {
          await db.query(`
            UPDATE sample_answers
            SET pinecone_id          = $1,
                embedding_created_at = NOW()
            WHERE id = $2
          `, [sample.id.toString(), sample.id]);
        }

        successCount++;
        console.log(`  ✅ Done (${successCount} complete)\n`);

        // Respect API rate limits — two GPT-4o-mini calls + embeddings per sample
        if (i < samples.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }

      } catch (error) {
        errorCount++;
        errors.push({ id: sample.id, error: error.message });
        console.error(`  ❌ Failed: ${error.message}\n`);
      }
    }

    // ── Step 6: Summary ───────────────────────────────────────────────────────
    console.log('='.repeat(60));
    console.log('  EMBEDDING SUMMARY');
    console.log('='.repeat(60));
    console.log(`  ✅ Successfully embedded       : ${successCount}`);
    console.log(`  ❌ Errors                      : ${errorCount}`);
    console.log(`  📦 Total processed             : ${samples.length}`);
    console.log(`  🏷️  Question types derived      : ${classifiedCount} (were null in DB)`);
    console.log(`  Metadata version               : v${METADATA_VERSION}`);
    console.log(`  Completed at                   : ${new Date().toISOString()}`);

    if (errors.length > 0) {
      console.log('\n  Failed samples:');
      errors.forEach(e => console.log(`    ID ${e.id}: ${e.error}`));
    }

    // ── Step 7: Verify Pinecone index stats ───────────────────────────────────
    console.log('\n🔍 Step 7: Verifying Pinecone index...');
    const stats = await index.describeIndexStats();
    console.log(`  Total vectors    : ${stats.totalRecordCount || 0}`);
    console.log(`  Dimension        : ${stats.dimension || 0}`);
    console.log('='.repeat(60));
    console.log('\n✅ embedSamples complete.\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  } finally {
    console.log('🔌 Database connection will close on exit');
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────
if (require.main === module) {
  embedAllSamples()
    .then(() => {
      console.log('👋 Exiting...');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { embedAllSamples };