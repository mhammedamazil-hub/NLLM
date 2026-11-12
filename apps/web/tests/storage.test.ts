import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Database } from '../src/core/storage/database.ts';
import { Repository } from '../src/core/storage/repository.ts';

let db: Database;
let repo: Repository;

beforeAll(async () => {
  db = await Database.open();
  repo = new Repository(db);
});

afterAll(() => {
  db.close();
});

describe('Database', () => {
  it('opens with migrations applied', () => {
    const rows = db.query('SELECT name FROM sqlite_master WHERE type = ?', ['table']);
    const names = rows.map((r) => r.name as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'meta', 'notebooks', 'sources', 'chunks', 'chunks_fts',
        'chat_sessions', 'chat_turns', 'artifacts', 'notes',
        'provider_profiles', 'usage_records',
      ]),
    );
  });

  it('reports schema version in meta', () => {
    const rows = db.query('SELECT value FROM meta WHERE key = ?', ['schema_version']);
    expect(rows[0]?.value).toBe('1');
  });
});

describe('Notebook repository', () => {
  it('creates, lists, updates, and deletes notebooks', () => {
    const nb = repo.createNotebook({ title: 'Biology 101', tags: ['study'] });
    expect(repo.getNotebook(nb.id)?.title).toBe('Biology 101');
    expect(repo.listNotebooks()).toContainEqual(expect.objectContaining({ id: nb.id }));

    repo.updateNotebook(nb.id, { title: 'Biology 201', archived: false });
    expect(repo.getNotebook(nb.id)?.title).toBe('Biology 201');

    repo.deleteNotebook(nb.id);
    expect(repo.getNotebook(nb.id)).toBeNull();
  });

  it('cascades deletion of notebook to sources and chunks', () => {
    const nb = repo.createNotebook({ title: 'Temp' });
    const src = repo.createSource({
      notebookId: nb.id, kind: 'file', title: 'doc', originalName: 'doc.txt',
      mimeType: 'text/plain',
    });
    repo.insertChunk({
      notebookId: nb.id, sourceId: src.id, ordIndex: 0,
      text: 'hello world', location: { label: 'doc.txt' }, extractionMethod: 'local:txt',
    });
    repo.deleteNotebook(nb.id);
    expect(repo.listSources('__missing__')).toHaveLength(0);
    expect(repo.searchChunks(nb.id, 'hello')).toHaveLength(0);
  });
});

describe('Source + chunk repository', () => {
  it('stores sources with status transitions', () => {
    const nb = repo.createNotebook({ title: 'S' });
    const src = repo.createSource({
      notebookId: nb.id, kind: 'file', title: 'paper', originalName: 'paper.pdf',
      mimeType: 'application/pdf',
    });
    expect(src.status).toBe('pending');
    repo.setSourceStatus(src.id, 'ready');
    expect(repo.getSource(src.id)?.status).toBe('ready');
  });

  it('inserts chunks and indexes them in FTS5', () => {
    const nb = repo.createNotebook({ title: 'FTS' });
    const src = repo.createSource({
      notebookId: nb.id, kind: 'file', title: 'docs', originalName: 'docs.txt',
      mimeType: 'text/plain',
    });
    repo.insertChunk({
      notebookId: nb.id, sourceId: src.id, ordIndex: 0,
      text: 'Photosynthesis converts light energy into chemical energy.',
      location: { label: 'docs.txt · page 1' }, extractionMethod: 'local:txt',
    });
    repo.insertChunk({
      notebookId: nb.id, sourceId: src.id, ordIndex: 1,
      text: 'The mitochondria is the powerhouse of the cell.',
      location: { label: 'docs.txt · page 2' }, extractionMethod: 'local:txt',
    });
    const hits = repo.searchChunks(nb.id, 'mitochondria powerhouse');
    expect(hits.length).toBe(1);
    expect(hits[0].text).toContain('powerhouse');
    // BM25 ordering: more relevant term first.
    const hits2 = repo.searchChunks(nb.id, 'photosynthesis mitochondria');
    expect(hits2.length).toBe(2);
  });

  it('returns chunk location metadata for citations', () => {
    const nb = repo.createNotebook({ title: 'Cite' });
    const src = repo.createSource({
      notebookId: nb.id, kind: 'file', title: 't', originalName: 't.txt',
      mimeType: 'text/plain',
    });
    repo.insertChunk({
      notebookId: nb.id, sourceId: src.id, ordIndex: 0,
      text: 'chunk text', location: { label: 't.txt', page: 3, heading: 'Results' },
      extractionMethod: 'local:txt',
    });
    const chunks = repo.listChunksBySource(src.id);
    expect(chunks[0].location.page).toBe(3);
    expect(chunks[0].location.heading).toBe('Results');
    const fetched = repo.getChunk(chunks[0].id);
    expect(fetched?.location.heading).toBe('Results');
  });
});

describe('Chat repository', () => {
  it('stores sessions and turns', () => {
    const nb = repo.createNotebook({ title: 'Chat' });
    const session = repo.createChatSession(nb.id, 'Q1');
    repo.addChatTurn({
      notebookId: nb.id, sessionId: session.id, role: 'user',
      content: 'What is photosynthesis?',
    });
    repo.addChatTurn({
      notebookId: nb.id, sessionId: session.id, role: 'assistant',
      content: 'Photosynthesis [S1] converts light [S1] energy.',
      citations: [{ chunkId: 'c1', sourceId: 's1', location: { label: 'x' } }],
      usage: { inputTokens: 10, outputTokens: 20 },
      model: 'gpt-4o-mini',
    });
    const turns = repo.listChatTurns(nb.id, session.id);
    expect(turns).toHaveLength(2);
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].citations).toHaveLength(1);
    expect(turns[1].usage?.inputTokens).toBe(10);
  });
});

describe('Artifact repository', () => {
  it('stores artifact models and evidence links', () => {
    const nb = repo.createNotebook({ title: 'Art' });
    const artifact = repo.createArtifact({
      notebookId: nb.id, kind: 'mindmap', title: 'Mind map',
      model: { nodes: [{ id: 'a', label: 'Root' }] },
      evidenceChunkIds: ['c1', 'c2'],
    });
    const loaded = repo.getArtifact(artifact.id);
    expect(loaded?.kind).toBe('mindmap');
    expect(loaded?.model.nodes).toHaveLength(1);
    expect(loaded?.evidenceChunkIds).toEqual(['c1', 'c2']);
    repo.updateArtifact(artifact.id, { title: 'Edited map' });
    expect(repo.getArtifact(artifact.id)?.title).toBe('Edited map');
  });
});

describe('Provider + usage repository', () => {
  it('stores encrypted-key profiles and usage records', () => {
    const profile = repo.saveProviderProfile({
      kind: 'openai', baseUrl: 'https://api.example.com/v1',
      apiKeyEncrypted: 'blob', model: 'gpt-4o-mini',
    });
    expect(repo.listProviderProfiles()).toContainEqual(
      expect.objectContaining({ id: profile.id, kind: 'openai', model: 'gpt-4o-mini' }),
    );
    repo.recordUsage({ profileId: profile.id, model: 'gpt-4o-mini', inputTokens: 5, outputTokens: 7, costReported: null });
    expect(repo.usageSummary(profile.id)).toEqual({ requests: 1, inputTokens: 5, outputTokens: 7 });
    expect(repo.deleteProviderProfile(profile.id)).toBe(true);
    expect(repo.deleteProviderProfile(profile.id)).toBe(false);
  });
});

describe('Persistence round-trip', () => {
  it('exports and reopens the DB without data loss', async () => {
    const nb1 = repo.createNotebook({ title: 'Round trip' });
    const blob = db.export();
    const db2 = await Database.openFromBlob(blob);
    const repo2 = new Repository(db2);
    expect(repo2.getNotebook(nb1.id)?.title).toBe('Round trip');
    db2.close();
  });
});
