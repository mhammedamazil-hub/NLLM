/**
 * Retrieval — BM25/lexical search over notebook chunks plus optional
 * simple scoring. Kept provider-agnostic and fully local (no embedding APIs
 * required for parity rows A/B/C).
 */
import type { Chunk, ID, RetrievalHit, Source } from '../domain/types.ts';

export interface RetrieveOptions {
  /** Max chunks to return. */
  limit?: number;
  /** Minimum score threshold (0–1 scale internally). */
  minScore?: number;
  /** Boost chunks from sources with these ids. */
  sourceBoosts?: ID[];
  /** Boost by recency (newer chunks rank higher). */
  recencyBoost?: boolean;
}

export interface RetrieveResult {
  hits: RetrievalHit[];
  queryTerms: string[];
}

/** Tokenize a query string into normalized terms. */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9\u00a0-\uffff]+/i)
    .filter((t) => t.length > 1)
    .slice(0, 16);
}

/** Score a chunk against query terms (0–1). Simple term-coverage score. */
export function scoreChunk(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const t of terms) {
    if (lower.includes(t)) hits += 1;
  }
  return hits / terms.length;
}

export interface RetrievalRepo {
  searchChunks(notebookId: ID, query: string, limit: number): Chunk[];
  getSource(id: ID): Source | null;
}

/**
 * Retrieve chunks for a notebook query, ranked by FTS5 BM25 with a
 * deterministic term-coverage tie-breaker.
 */
export function retrieve(
  repo: RetrievalRepo,
  notebookId: ID,
  query: string,
  opts: RetrieveOptions = {},
): RetrieveResult {
  const limit = opts.limit ?? 20;
  const minScore = opts.minScore ?? 0;
  const terms = tokenizeQuery(query);

  // Candidate pool from FTS search (BM25 ordering already applied).
  const candidates = repo.searchChunks(notebookId, query, limit * 4);

  const hits: RetrievalHit[] = [];
  for (const chunk of candidates) {
    let score = scoreChunk(chunk.text, terms);
    if (opts.sourceBoosts && opts.sourceBoosts.includes(chunk.sourceId)) {
      // Boosts intentionally exceed 1 so boosted sources win tie-breaks.
      score += 0.1;
    }
    // Chunks with zero term coverage carry no signal for this query.
    if (score <= 0 || score < minScore) continue;
    const source = repo.getSource(chunk.sourceId);
    if (!source) continue;
    hits.push({ chunk, score, source, method: 'fts5-bm25' });
  }

  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, limit), queryTerms: terms };
}
