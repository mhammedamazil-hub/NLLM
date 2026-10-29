import { makeSource } from './core.js';

export function restoreNotebookBackup(backup, notebookId, nextMessageId = () => crypto.randomUUID()) {
  if (!backup || backup.schemaVersion !== 1 || !backup.notebook || typeof backup.notebook.name !== 'string' || !Array.isArray(backup.sources) || !Array.isArray(backup.messages)) {
    throw new Error('This is not a supported SourceForge notebook backup (schema version 1).');
  }
  if (backup.sources.length > 50 || backup.messages.length > 500) throw new Error('Backup exceeds the 50-source or 500-message import limit.');
  const notebook = { id: notebookId, name: `${backup.notebook.name.slice(0, 90)} (imported)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let totalChars = 0;
  const sourceById = new Map();
  const sources = backup.sources.map(record => {
    if (typeof record.id !== 'string' || !record.id || sourceById.has(record.id) || typeof record.name !== 'string' || typeof record.content !== 'string') throw new Error('Backup contains an invalid or duplicate source identity.');
    totalChars += record.content.length;
    if (totalChars > 1_000_000) throw new Error('Backup source text exceeds the 1,000,000 character import budget.');
    const source = makeSource({ id: record.id, name: record.name, text: record.content, type: record.type || 'file', origin: record.origin || 'restored backup', url: record.url || '', importedAt: record.importedAt || new Date().toISOString(), pageBreaks: record.pageBreaks, metadata: record.metadata });
    source.notebookId = notebookId;
    if (record.revision) source.revision = String(record.revision).slice(0, 160);
    sourceById.set(source.id, source);
    return source;
  });
  const messages = backup.messages.map(record => {
    if (!['user', 'assistant'].includes(record.role) || typeof record.text !== 'string' || record.text.length > 20_000) throw new Error('Backup contains an invalid conversation message.');
    const evidence = (Array.isArray(record.evidence) ? record.evidence : []).flatMap(ref => {
      const source = sourceById.get(ref.sourceId);
      const index = source?.chunks.findIndex(c => c.lineStart === ref.lineStart && c.lineEnd === ref.lineEnd && c.text === ref.text) ?? -1;
      if (!source || index < 0) return [];
      const chunk = source.chunks[index];
      return [{ ref: `S${source.id.slice(0, 6)}-${index + 1}`, sourceId: source.id, sourceName: source.name, lineStart: chunk.lineStart, lineEnd: chunk.lineEnd, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, text: chunk.text }];
    });
    return { id: nextMessageId(), notebookId, role: record.role, text: record.text, createdAt: Number.isFinite(Date.parse(record.createdAt)) ? record.createdAt : new Date().toISOString(), insufficient: record.role === 'assistant' && !!record.insufficient, evidence, remote: record.role === 'assistant' && !!record.remote };
  });
  return { notebook, sources, messages };
}
