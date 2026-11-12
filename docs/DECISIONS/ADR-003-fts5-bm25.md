# ADR-003: FTS5 + BM25 ranking for chunk search

**Status:** Accepted

## Context
NotebookLM surfaces the most relevant passages from a notebook. A simple
LIKE search is insufficient; BM25 ranking over an inverted index gives
relevance ordering without embeddings.

## Decision
- `chunks_fts` FTS5 table: `chunk_id UNINDEXED, text`.
- Search: `SELECT ... FROM chunks_fts f JOIN chunks c ON c.id = f.chunk_id
  WHERE c.notebook_id = ? AND chunks_fts MATCH ? ORDER BY rank`.
- Multi-term queries use explicit `OR` between quoted tokens (FTS5 default
  is implicit AND, which over-restricts recall).
- Retrieval layer (`core/retrieval/engine.ts`) adds term-coverage scoring
  as a deterministic tie-breaker and optional source boosts.

## Consequences
- Fast, local, deterministic search — no provider needed for retrieval.
- Embeddings (semantic search) remain an optional future enhancement
  (Feature Matrix C3).
