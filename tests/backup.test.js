import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSource, retrieve } from '../web/core.js';
import { restoreNotebookBackup } from '../web/backup.js';

test('notebook backup restores source identities and validates citation references', () => {
  const source = makeSource({ id: 'source-123', name: 'notes.md', text: 'The sample shows evidence on line one.' });
  const hit = retrieve([source], 'sample evidence')[0];
  const backup = { schemaVersion: 1, notebook: { name: 'Original' }, sources: [source], messages: [{ role: 'assistant', text: 'A grounded response.', createdAt: new Date().toISOString(), evidence: [{ sourceId: source.id, lineStart: hit.chunk.lineStart, lineEnd: hit.chunk.lineEnd, text: hit.chunk.text }, { sourceId: 'not-a-source', lineStart: 1, lineEnd: 1, text: 'invented' }] }] };
  const restored = restoreNotebookBackup(backup, 'new-notebook', () => 'new-message');
  assert.equal(restored.notebook.id, 'new-notebook');
  assert.equal(restored.sources[0].id, source.id);
  assert.equal(restored.sources[0].notebookId, 'new-notebook');
  assert.equal(restored.messages[0].notebookId, 'new-notebook');
  assert.equal(restored.messages[0].evidence.length, 1);
  assert.equal(restored.messages[0].evidence[0].sourceId, source.id);
});

test('backup import rejects invalid, oversized, and duplicate source records', () => {
  assert.throws(() => restoreNotebookBackup({}, 'n'), /not a supported/);
  const base = { schemaVersion: 1, notebook: { name: 'N' }, sources: [], messages: [] };
  assert.throws(() => restoreNotebookBackup({ ...base, sources: Array(51).fill({}) }, 'n'), /50-source/);
  assert.throws(() => restoreNotebookBackup({ ...base, sources: [{ id: 'same', name: 'a.txt', content: 'ok' }, { id: 'same', name: 'b.txt', content: 'ok' }] }, 'n'), /duplicate source/);
  assert.throws(() => restoreNotebookBackup({ ...base, sources: [{ id: 'big', name: 'a.txt', content: 'x'.repeat(1_000_001) }] }, 'n'), /1,000,000/);
});
