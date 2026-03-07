/**
 * SemanticSearch.js — Production Version
 *
 * Changes from previous version:
 * 1. METADATA_VERSION constant — all Pinecone queries filter by this version.
 *    Old unversioned vectors are automatically ignored. Bump when schema changes.
 * 2. findSimilarAnswers() — version filter added to both primary query and
 *    semantic fallback retry. Semantic fallback triggers if top score < 0.75.
 * 3. findCandidatesForReranking() — version filter + seniority ±1 pre-filter.
 *    New method for Option 4 hybrid retrieval — not called by existing code.
 * 4. No breaking changes — findSimilarAnswers() signature and return shape
 *    are identical to the original.
 *
 * Metadata version history:
 *   v1 (no version field) — original vectors: category_id, level, score only
 *   v2 (current)          — adds comp_scores, comp_category, comp_scored_at
 */

const { Pinecone } = require('@pinecone-database/pinecone');
const EmbeddingGenerator = require('./EmbeddingGenerator');
const EmbeddingCache = require('./EmbeddingCache');
const db = require('../../config/database');

// ─── Constants ────────────────────────────────────────────────────────────────

// Must match METADATA_VERSION in embedSamples.js.
// Bump both together when the Pinecone metadata schema changes.
// Old vectors without this version are automatically ignored by all queries.
const METADATA_VERSION = 2;

// Seniority ladder — must match values in sample_answers.level column exactly
const LEVEL_ORDER = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal'];

// ─── getAdjacentLevels ────────────────────────────────────────────────────────
// Returns the set of level strings within ±1 of the given level.
// e.g. getAdjacentLevels('Senior') → ['Mid', 'Senior', 'Staff']
// e.g. getAdjacentLevels('Principal') → ['Staff', 'Principal']
// Returns all levels if the given level is unknown (safe fallback).
function getAdjacentLevels(level) {
  const idx = LEVEL_ORDER.indexOf(level);
  if (idx === -1) {
    console.warn(`⚠️  Unknown level "${level}" — seniority filter disabled, returning all levels`);
    return [...LEVEL_ORDER];
  }
  const lo = Math.max(0, idx - 1);
  const hi = Math.min(LEVEL_ORDER.length - 1, idx + 1);
  return LEVEL_ORDER.slice(lo, hi + 1);
}

class SemanticSearch {
  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });

    this.indexName = process.env.PINECONE_INDEX_NAME || 'tpm-interview-examples';
    this.index     = this.pinecone.index(this.indexName);

    this.embeddingGenerator = new EmbeddingGenerator();
    this.embeddingCache     = EmbeddingCache.getInstance();

    // Threshold below which category filter is considered misleading
    // and a pure semantic fallback is triggered
    this.SEMANTIC_FALLBACK_THRESHOLD = 0.75;
  }

  // ─── findSimilarAnswers ──────────────────────────────────────────────────────
  // Existing method — preserved for backward compatibility.
  //
  // Enhancements vs original:
  // 1. metadata_version filter — only returns v2+ vectors, ignores old unversioned ones
  // 2. Semantic fallback — if top score < 0.75, drops category filter and retries
  //
  // Signature and return shape are identical to the original.
  async findSimilarAnswers(userAnswer, categoryId = null, topK = 5) {
    try {
      console.log('🔍 Starting semantic search...');
      console.log(`   Category filter      : ${categoryId || 'none'}`);
      console.log(`   Metadata version     : v${METADATA_VERSION}`);

      const queryEmbedding = await this.getEmbeddingWithCache(userAnswer);

      // Always filter by metadata_version — ignores old unversioned vectors
      const baseFilter = {
        metadata_version: { $eq: METADATA_VERSION }
      };

      const queryOptions = {
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter: categoryId
          ? { ...baseFilter, category_id: parseInt(categoryId) }
          : baseFilter
      };

      if (categoryId) {
        console.log(`🎯 Filtering by category_id: ${categoryId}`);
      }

      let results = await this.index.namespace('').query(queryOptions);
      console.log(`📊 Pinecone returned ${results.matches.length} matches`);

      // ── Semantic fallback ──────────────────────────────────────────────────
      // If the best match scores below threshold, the category filter is
      // misleading (wrong domain being returned — e.g. DR question getting
      // cloud migration examples). Drop category filter and retry.
      // metadata_version filter is always kept.
      if (categoryId && results.matches.length > 0) {
        const topScore = results.matches[0].score ?? 0;
        if (topScore < this.SEMANTIC_FALLBACK_THRESHOLD) {
          console.log(`⚠️  Top score ${topScore.toFixed(3)} < ${this.SEMANTIC_FALLBACK_THRESHOLD} — category filter misleading`);
          console.log('🔄 Dropping category filter — retrying pure semantic search...');

          const fallbackResults = await this.index.namespace('').query({
            vector: queryEmbedding,
            topK,
            includeMetadata: true,
            filter: baseFilter  // version filter kept, category filter dropped
          });

          results = fallbackResults;
          console.log(`✅ Fallback returned ${results.matches.length} matches (top score: ${(results.matches[0]?.score ?? 0).toFixed(3)})`);
        }
      }

      if (results.matches.length === 0) {
        console.log('⚠️  No similar examples found');
        return [];
      }

      const sampleIds = results.matches.map(match => parseInt(match.id));

      const sampleAnswers = await db.query(`
        SELECT
          id, question_type, question_text, answer_text,
          situation_text, task_text, action_text, result_text,
          overall_score, level, company
        FROM sample_answers
        WHERE id = ANY($1)
      `, [sampleIds]);

      const enrichedResults = results.matches.map(match => {
        const sampleData = sampleAnswers.rows.find(row => row.id === parseInt(match.id));
        if (!sampleData) {
          console.warn(`⚠️  Sample ${match.id} not found in database`);
          return null;
        }
        return {
          id:            sampleData.id,
          similarity:    match.score,
          score:         parseFloat(sampleData.overall_score),
          question_type: sampleData.question_type,
          question_text: sampleData.question_text,
          answer_text:   sampleData.answer_text,
          star: {
            situation: sampleData.situation_text,
            task:      sampleData.task_text,
            action:    sampleData.action_text,
            result:    sampleData.result_text
          },
          level:   sampleData.level,
          company: sampleData.company
        };
      }).filter(Boolean);

      // Re-rank by combined score (similarity × quality)
      const rerankedResults = enrichedResults
        .map(r => ({ ...r, combined_score: r.similarity * (r.score / 5) }))
        .sort((a, b) => b.combined_score - a.combined_score);

      console.log(`Retrieved ${rerankedResults.length} examples, re-ranked by similarity × quality:`);
      rerankedResults.forEach(r =>
        console.log(`  ID ${r.id}: similarity=${r.similarity.toFixed(3)}, quality=${r.score}/5, combined=${r.combined_score.toFixed(3)}`)
      );

      return rerankedResults;

    } catch (error) {
      console.error('❌ Semantic search error:', error);
      throw new Error(`Semantic search failed: ${error.message}`);
    }
  }

  // ─── findCandidatesForReranking ──────────────────────────────────────────────
  // Option 4 — Stage 1 of hybrid retrieval.
  //
  // Retrieves top 10 candidates across ALL categories using pure semantic
  // similarity. No category filter — domain match is determined by the
  // LLM reranker in Stage 2 (CombinedAnalyzer_Agentic.rerankCandidates).
  //
  // Filters applied server-side in Pinecone:
  //   - metadata_version = METADATA_VERSION (always) — ignores old vectors
  //   - level $in adjacentLevels (if candidateLevel known) — seniority ±1
  //
  // Each returned candidate carries:
  //   - Full DB data (answer_text, STAR breakdown, level, company)
  //   - comp_scores parsed from Pinecone metadata (for reranker)
  //   - comp_category (which category the example belongs to)
  //
  // @param {string} userAnswer        — the candidate's answer text
  // @param {string|null} candidateLevel — e.g. 'Senior', 'Staff', null
  // @param {number} topK              — candidates to retrieve (default 10)
  // @returns {Promise<Array>}          — enriched candidate objects
  async findCandidatesForReranking(userAnswer, candidateLevel = null, topK = 10) {
    try {
      console.log('🔍 Hybrid retrieval — Stage 1: fetching candidates...');
      console.log(`   Candidate level  : ${candidateLevel || 'unknown (all levels)'}`);
      console.log(`   Metadata version : v${METADATA_VERSION}`);
      console.log(`   topK             : ${topK}`);

      const queryEmbedding = await this.getEmbeddingWithCache(userAnswer);

      // Always filter by metadata_version.
      // Optionally add seniority ±1 filter if candidateLevel is known.
      const filter = candidateLevel
        ? {
            metadata_version: { $eq: METADATA_VERSION },
            level:            { $in: getAdjacentLevels(candidateLevel) }
          }
        : {
            metadata_version: { $eq: METADATA_VERSION }
          };

      if (candidateLevel) {
        console.log(`   Seniority filter (±1): ${getAdjacentLevels(candidateLevel).join(', ')}`);
      }

      const results = await this.index.namespace('').query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter
      });

      console.log(`📊 Pinecone returned ${results.matches.length} candidates`);

      if (results.matches.length === 0) {
        console.log('⚠️  No candidates found — check index, metadata_version, or level filter');
        return [];
      }

      // Fetch full DB records for all candidates in one query
      const sampleIds = results.matches.map(m => parseInt(m.id));

      const sampleAnswers = await db.query(`
        SELECT
          id, question_type, question_text, answer_text,
          situation_text, task_text, action_text, result_text,
          overall_score, level, company
        FROM sample_answers
        WHERE id = ANY($1)
      `, [sampleIds]);

      // Build enriched candidate objects
      // comp_scores is parsed from Pinecone metadata JSON string
      const candidates = results.matches.map(match => {
        const sampleData = sampleAnswers.rows.find(row => row.id === parseInt(match.id));
        if (!sampleData) {
          console.warn(`⚠️  Sample ${match.id} not found in database — skipping`);
          return null;
        }

        // Parse competency scores — safe fallback to {} if missing or malformed
        let compScores = {};
        try {
          compScores = JSON.parse(match.metadata.comp_scores || '{}');
        } catch (e) {
          console.warn(`⚠️  Could not parse comp_scores for ID ${match.id}: ${e.message}`);
        }

        return {
          id:            sampleData.id,
          similarity:    match.score,
          score:         parseFloat(sampleData.overall_score),
          question_type: sampleData.question_type,
          question_text: sampleData.question_text,
          answer_text:   sampleData.answer_text,
          star: {
            situation: sampleData.situation_text,
            task:      sampleData.task_text,
            action:    sampleData.action_text,
            result:    sampleData.result_text
          },
          level:         sampleData.level,
          company:       sampleData.company,
          // Reranker payload
          comp_scores:   compScores,                            // { "Risk Mitigation": 0.85, ... }
          comp_category: match.metadata.comp_category || null  // e.g. "Program Sense"
        };
      }).filter(Boolean);

      console.log(`✅ Stage 1 complete: ${candidates.length} enriched candidates ready for reranker`);
      candidates.forEach(c =>
        console.log(`   ID ${c.id} (${c.question_type}, ${c.level}): similarity=${c.similarity.toFixed(3)}`)
      );

      return candidates;

    } catch (error) {
      console.error('❌ findCandidatesForReranking error:', error);
      throw new Error(`Hybrid retrieval failed: ${error.message}`);
    }
  }

  // ─── getEmbeddingWithCache ───────────────────────────────────────────────────
  async getEmbeddingWithCache(text) {
    const cached = this.embeddingCache.get(text);
    if (cached) {
      console.log('✅ Cache hit for embedding');
      return cached;
    }
    console.log('🔄 Cache miss — generating new embedding');
    const embedding = await this.embeddingGenerator.generateEmbedding(text);
    this.embeddingCache.set(text, embedding);
    return embedding;
  }

  // ─── healthCheck ─────────────────────────────────────────────────────────────
  async healthCheck() {
    try {
      const stats       = await this.index.describeIndexStats();
      const dbResult    = await db.query('SELECT COUNT(*) FROM sample_answers');
      const sampleCount = parseInt(dbResult.rows[0].count);
      const cacheMetrics= this.embeddingCache.getMetrics();

      return {
        status: 'healthy',
        metadata_version: METADATA_VERSION,
        pinecone: {
          connected:   true,
          vectorCount: stats.totalRecordCount,
          dimension:   stats.dimension
        },
        database: {
          connected:   true,
          sampleCount
        },
        cache: cacheMetrics
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

module.exports = SemanticSearch;