import { describe, expect, it } from 'vitest';
import { retrieve, scoreChunk, tokenizeQuery } from '../src/core/retrieval/engine.ts';
import type { Chunk, Source } from '../src/core/domain/types.ts';

function makeRepo(chunks: Chunk[], sources: Source[]) {
  return {
    searchChunks: (_nb: string, _q: string, _limit: number) => chunks,
    getSource: (id: string) => sources.find((s) => s.id === id) ?? null,
  };
}

function makeChunk(id: string, sourceId: string, text: string, ordIndex = 0): Chunk {
  return {
    id, notebookId: 'nb1', sourceId, ordIndex, text,
    location: { label: `${sourceId} · p${ordIndex + 1}` },
    extractionMethod: 'local:txt', extractionWarnings: [], createdAt: '2026-01-01',
  };
}

describe('retrieval', () => {
  it('tokenizes queries into normalized terms', () => {
    expect(tokenizeQuery('Photosynthesis -- Light! Energy')).toEqual(['photosynthesis', 'light', 'energy']);
  });

  it('scores chunks by term coverage', () => {
    const score = scoreChunk('Photosynthesis uses light energy', ['photosynthesis', 'light', 'oxygen']);
    expect(score).toBeCloseTo(2 / 3, 2);
  });

  it('retrieves and ranks chunks with provenance', () => {
    const sources: Source[] = [
      { id: 's1', notebookId: 'nb1', kind: 'file', title: 'Bio', originalName: 'bio.txt', mimeType: 'text/plain', status: 'ready', preserveOriginal: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    ];
    const chunks = [
      makeChunk('c1', 's1', 'Photosynthesis converts light into chemical energy.', 0),
      makeChunk('c2', 's1', 'The mitochondria is the powerhouse of the cell.', 1),
      makeChunk('c3', 's1', 'Plants release oxygen during photosynthesis.', 2),
    ];
    const repo = makeRepo(chunks, sources);
    const result = retrieve(repo, 'nb1', 'photosynthesis light energy');
    expect(result.hits.length).toBe(2);
    expect(result.hits[0].chunk.id).toBe('c1');
    expect(result.hits[0].source.id).toBe('s1');
    expect(result.hits[0].method).toBe('fts5-bm25');
  });

  it('applies source boosts', () => {
    const sources: Source[] = [
      { id: 's1', notebookId: 'nb1', kind: 'file', title: 'A', originalName: 'a.txt', mimeType: 'text/plain', status: 'ready', preserveOriginal: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 's2', notebookId: 'nb1', kind: 'file', title: 'B', originalName: 'b.txt', mimeType: 'text/plain', status: 'ready', preserveOriginal: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    ];
    const chunks = [
      makeChunk('c1', 's1', 'Photosynthesis converts light.', 0),
      makeChunk('c2', 's2', 'Photosynthesis converts light.', 0),
    ];
    const repo = makeRepo(chunks, sources);
    const result = retrieve(repo, 'nb1', 'photosynthesis light', { sourceBoosts: ['s2'] });
    expect(result.hits[0].chunk.id).toBe('c2');
  });
});
