/**
 * Typed repositories over the SQLite store. Domain code never writes raw SQL
 * except through these repositories.
 */
import { Database } from './database.ts';
import type {
  Artifact, ArtifactKind, ArtifactModel, ArtifactStatus,
  Citation, ChatSession, ChatTurn, Chunk, ID, Note, Notebook,
  ProviderProfile, ProviderKind, Source, SourceKind, SourceLocation,
  SourceStatus, UsageRecord,
} from '../domain/types.ts';

export interface NewNotebook {
  title: string;
  description?: string;
  tags?: string[];
}

export interface NewSource {
  notebookId: ID;
  kind: SourceKind;
  title: string;
  originalName: string;
  mimeType: string;
  sha256?: string;
  url?: string;
  retrievalDate?: string;
  preserveOriginal?: boolean;
}

export interface NewChunk {
  notebookId: ID;
  sourceId: ID;
  ordIndex: number;
  text: string;
  rawText?: string;
  location: SourceLocation;
  extractionMethod: string;
  extractionWarnings?: string[];
}

export interface NewChatTurn {
  notebookId: ID;
  sessionId?: ID;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: string;
}

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return value ? (JSON.parse(String(value)) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Row shapes returned by SQL queries (aliases differ from domain types). */
interface ChunkRow {
  id: string; notebookId: string; sourceId: string; ordIndex: number; text: string;
  rawText: string | null; page: number | null; heading: string | null; timestamp: number | null;
  urlFragment: string | null; locationLabel: string; extractionMethod: string;
  extractionWarnings: string; createdAt: string;
}

interface ChatTurnRow {
  id: string; notebookId: string; sessionId: string | null; role: 'user' | 'assistant';
  content: string; citations: string; usageJson: string | null; model: string | null; createdAt: string;
}

interface ArtifactRow {
  id: string; notebookId: string; kind: ArtifactKind; title: string; modelJson: string;
  status: ArtifactStatus; evidenceChunkIds: string; createdAt: string; updatedAt: string;
}

export class Repository {
  constructor(private readonly db: Database) {}

  // ---------- Notebooks ----------

  createNotebook(input: NewNotebook): Notebook {
    const ts = now();
    const nb: Notebook = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description ?? '',
      tags: input.tags ?? [],
      archived: false,
      createdAt: ts,
      updatedAt: ts,
    };
    this.db.run(
      `INSERT INTO notebooks(id, title, description, tags, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [nb.id, nb.title, nb.description, JSON.stringify(nb.tags), nb.createdAt, nb.updatedAt],
    );
    return nb;
  }

  getNotebook(id: ID): Notebook | null {
    const rows = this.db.query<Notebook>(
      'SELECT id, title, description, tags, archived, created_at AS createdAt, updated_at AS updatedAt FROM notebooks WHERE id = ?',
      [id],
    );
    return rows.length === 0 ? null : {
      id: rows[0].id, title: rows[0].title, description: rows[0].description,
      tags: parseJson(rows[0].tags, []), archived: !!rows[0].archived,
      createdAt: rows[0].createdAt, updatedAt: rows[0].updatedAt,
    };
  }

  listNotebooks(opts: { includeArchived?: boolean } = {}): Notebook[] {
    const sql = opts.includeArchived
      ? 'SELECT id, title, description, tags, archived, created_at, updated_at FROM notebooks ORDER BY updated_at DESC'
      : 'SELECT id, title, description, tags, archived, created_at, updated_at FROM notebooks WHERE archived = 0 ORDER BY updated_at DESC';
    return this.db.query<Notebook>(sql).map((r) => ({
      id: r.id, title: r.title, description: r.description,
      tags: parseJson(r.tags, []), archived: !!r.archived,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    }));
  }

  updateNotebook(id: ID, patch: Partial<Pick<Notebook, 'title' | 'description' | 'tags' | 'archived'>>): boolean {
    const existing = this.getNotebook(id);
    if (!existing) return false;
    const next = { ...existing, ...patch, updatedAt: now() };
    this.db.run(
      'UPDATE notebooks SET title = ?, description = ?, tags = ?, archived = ?, updated_at = ? WHERE id = ?',
      [next.title, next.description, JSON.stringify(next.tags), next.archived ? 1 : 0, next.updatedAt, id],
    );
    return true;
  }

  deleteNotebook(id: ID): void {
    // ON DELETE CASCADE handles sources/chunks/artifacts/notes.
    this.db.run('DELETE FROM notebooks WHERE id = ?', [id]);
    this.db.run('DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE notebook_id = ?)', [id]);
  }

  // ---------- Sources ----------

  createSource(input: NewSource): Source {
    const ts = now();
    const src: Source = {
      id: crypto.randomUUID(),
      notebookId: input.notebookId,
      kind: input.kind,
      title: input.title,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sha256: input.sha256,
      url: input.url,
      retrievalDate: input.retrievalDate,
      status: 'pending',
      preserveOriginal: input.preserveOriginal ?? false,
      createdAt: ts,
      updatedAt: ts,
    };
    this.db.run(
      `INSERT INTO sources(id, notebook_id, kind, title, original_name, mime_type, sha256, url, retrieval_date, status, preserve_original, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [src.id, src.notebookId, src.kind, src.title, src.originalName, src.mimeType,
        src.sha256, src.url, src.retrievalDate, src.preserveOriginal ? 1 : 0, src.createdAt, src.updatedAt],
    );
    return src;
  }

  getSource(id: ID): Source | null {
    const rows = this.db.query<Source>(
      'SELECT id, notebook_id AS notebookId, kind, title, original_name AS originalName, mime_type AS mimeType, sha256, url, retrieval_date AS retrievalDate, status, preserve_original AS preserveOriginal, created_at AS createdAt, updated_at AS updatedAt FROM sources WHERE id = ?',
      [id],
    );
    return rows.length === 0 ? null : this.rowToSource(rows[0]);
  }

  listSources(notebookId: ID): Source[] {
    return this.db
      .query<Source>(
        'SELECT id, notebook_id AS notebookId, kind, title, original_name AS originalName, mime_type AS mimeType, sha256, url, retrieval_date AS retrievalDate, status, preserve_original AS preserveOriginal, created_at AS createdAt, updated_at AS updatedAt FROM sources WHERE notebook_id = ? ORDER BY created_at',
        [notebookId],
      )
      .map((r) => this.rowToSource(r));
  }

  setSourceStatus(id: ID, status: SourceStatus, errorMessage?: string): void {
    this.db.run('UPDATE sources SET status = ?, error_message = ?, updated_at = ? WHERE id = ?',
      [status, errorMessage, now(), id]);
  }

  private rowToSource(r: Source): Source {
    return {
      id: r.id, notebookId: r.notebookId, kind: r.kind as SourceKind, title: r.title,
      originalName: r.originalName, mimeType: r.mimeType, sha256: r.sha256 ?? undefined,
      url: r.url ?? undefined, retrievalDate: r.retrievalDate ?? undefined,
      status: r.status as SourceStatus, preserveOriginal: !!r.preserveOriginal,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }

  // ---------- Chunks ----------

  insertChunk(input: NewChunk): Chunk {
    const ts = now();
    const chunk: Chunk = {
      id: crypto.randomUUID(),
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      ordIndex: input.ordIndex,
      text: input.text,
      rawText: input.rawText,
      location: input.location,
      extractionMethod: input.extractionMethod,
      extractionWarnings: input.extractionWarnings ?? [],
      createdAt: ts,
    };
    this.db.run(
      `INSERT INTO chunks(id, notebook_id, source_id, ord_index, text, raw_text, page, heading, timestamp, url_fragment, location_label, extraction_method, extraction_warnings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chunk.id, chunk.notebookId, chunk.sourceId, chunk.ordIndex, chunk.text, chunk.rawText ?? null,
        chunk.location.page ?? null, chunk.location.heading ?? null, chunk.location.timestamp ?? null,
        chunk.location.urlFragment ?? null, chunk.location.label, chunk.extractionMethod,
        JSON.stringify(chunk.extractionWarnings), chunk.createdAt],
    );
    this.db.run('INSERT INTO chunks_fts(chunk_id, text) VALUES (?, ?)', [chunk.id, chunk.text]);
    return chunk;
  }

  listChunksBySource(sourceId: ID): Chunk[] {
    return this.db
      .query<ChunkRow>(
        `SELECT id, notebook_id AS notebookId, source_id AS sourceId, ord_index AS ordIndex, text, raw_text AS rawText,
           page, heading, timestamp, url_fragment AS urlFragment, location_label AS locationLabel,
           extraction_method AS extractionMethod, extraction_warnings AS extractionWarnings, created_at AS createdAt
         FROM chunks WHERE source_id = ? ORDER BY ord_index`,
        [sourceId],
      )
      .map((r) => this.rowToChunk(r));
  }

  private rowToChunk(r: ChunkRow): Chunk {
    return {
      id: r.id, notebookId: r.notebookId, sourceId: r.sourceId, ordIndex: r.ordIndex,
      text: r.text, rawText: r.rawText ?? undefined,
      location: {
        label: r.locationLabel, page: r.page ?? undefined, heading: r.heading ?? undefined,
        timestamp: r.timestamp ?? undefined, urlFragment: r.urlFragment ?? undefined,
      },
      extractionMethod: r.extractionMethod,
      extractionWarnings: parseJson(r.extractionWarnings, []),
      createdAt: r.createdAt,
    };
  }

  getChunk(id: ID): Chunk | null {
    const rows = this.db.query<ChunkRow>(
      `SELECT id, notebook_id AS notebookId, source_id AS sourceId, ord_index AS ordIndex, text, raw_text AS rawText,
         page, heading, timestamp, url_fragment AS urlFragment, location_label AS locationLabel,
         extraction_method AS extractionMethod, extraction_warnings AS extractionWarnings, created_at AS createdAt
       FROM chunks WHERE id = ?`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.rowToChunk(rows[0]);
  }

  /** FTS5 BM25 search over notebook chunks. */
  searchChunks(notebookId: ID, query: string, limit = 20): Chunk[] {
    const terms = query.trim().split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
    if (!terms) return [];
    const rows = this.db.query<ChunkRow>(
      `SELECT c.id, c.notebook_id AS notebookId, c.source_id AS sourceId, c.ord_index AS ordIndex, c.text,
         c.raw_text AS rawText, c.page, c.heading, c.timestamp, c.url_fragment AS urlFragment,
         c.location_label AS locationLabel, c.extraction_method AS extractionMethod,
         c.extraction_warnings AS extractionWarnings, c.created_at AS createdAt
       FROM chunks_fts f JOIN chunks c ON c.id = f.chunk_id
       WHERE c.notebook_id = ? AND chunks_fts MATCH ?
       ORDER BY rank LIMIT ?`,
      [notebookId, terms, limit],
    );
    return rows.map((r) => this.rowToChunk(r));
  }

  // ---------- Chat ----------

  createChatSession(notebookId: ID, title = 'New chat'): ChatSession {
    const ts = now();
    const session: ChatSession = { id: crypto.randomUUID(), notebookId, title, createdAt: ts, updatedAt: ts };
    this.db.run(
      'INSERT INTO chat_sessions(id, notebook_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [session.id, session.notebookId, session.title, session.createdAt, session.updatedAt],
    );
    return session;
  }

  listChatSessions(notebookId: ID): ChatSession[] {
    return this.db
      .query<ChatSession>(
        'SELECT id, notebook_id AS notebookId, title, created_at AS createdAt, updated_at AS updatedAt FROM chat_sessions WHERE notebook_id = ? ORDER BY updated_at DESC',
        [notebookId],
      );
  }

  addChatTurn(input: NewChatTurn): ChatTurn {
    const ts = now();
    const turn: ChatTurn = {
      id: crypto.randomUUID(), notebookId: input.notebookId, sessionId: input.sessionId,
      role: input.role, content: input.content, citations: input.citations ?? [],
      usage: input.usage, model: input.model, createdAt: ts,
    };
    this.db.run(
      `INSERT INTO chat_turns(id, notebook_id, session_id, role, content, citations, usage_json, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [turn.id, turn.notebookId, turn.sessionId ?? null, turn.role, turn.content,
        JSON.stringify(turn.citations), JSON.stringify(turn.usage ?? null), turn.model ?? null, turn.createdAt],
    );
    if (turn.sessionId) {
      this.db.run('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [ts, turn.sessionId]);
    }
    return turn;
  }

  listChatTurns(notebookId: ID, sessionId?: ID): ChatTurn[] {
    const sql = sessionId
      ? 'SELECT id, notebook_id AS notebookId, session_id AS sessionId, role, content, citations, usage_json AS usageJson, model, created_at AS createdAt FROM chat_turns WHERE notebook_id = ? AND session_id = ? ORDER BY created_at'
      : 'SELECT id, notebook_id AS notebookId, session_id AS sessionId, role, content, citations, usage_json AS usageJson, model, created_at AS createdAt FROM chat_turns WHERE notebook_id = ? ORDER BY created_at';
    const params = sessionId ? [notebookId, sessionId] : [notebookId];
    return this.db
      .query<ChatTurnRow>(sql, params)
      .map((r) => ({
        id: r.id, notebookId: r.notebookId, sessionId: r.sessionId ?? undefined, role: r.role,
        content: r.content, citations: parseJson(r.citations, []),
        usage: r.usageJson ? (parseJson(r.usageJson, { inputTokens: 0, outputTokens: 0 }) ?? undefined) : undefined,
        model: r.model ?? undefined, createdAt: r.createdAt,
      }));
  }

  // ---------- Artifacts ----------

  createArtifact(input: {
    notebookId: ID; kind: ArtifactKind; title: string; model: ArtifactModel;
    evidenceChunkIds?: ID[];
  }): Artifact {
    const ts = now();
    const artifact: Artifact = {
      id: crypto.randomUUID(), notebookId: input.notebookId, kind: input.kind,
      title: input.title, model: input.model, status: 'generated',
      evidenceChunkIds: input.evidenceChunkIds ?? [], createdAt: ts, updatedAt: ts,
    };
    this.db.run(
      `INSERT INTO artifacts(id, notebook_id, kind, title, model_json, status, evidence_chunk_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [artifact.id, artifact.notebookId, artifact.kind, artifact.title,
        JSON.stringify(artifact.model), artifact.status,
        JSON.stringify(artifact.evidenceChunkIds), artifact.createdAt, artifact.updatedAt],
    );
    return artifact;
  }

  updateArtifact(id: ID, patch: Partial<Pick<Artifact, 'title' | 'model' | 'status'>>): boolean {
    const rows = this.db.query<{ modelJson: string; evidenceChunkIds: string }>(
      'SELECT model_json AS modelJson, evidence_chunk_ids AS evidenceChunkIds FROM artifacts WHERE id = ?',
      [id],
    );
    if (rows.length === 0) return false;
    const model = parseJson(rows[0].modelJson, {} as ArtifactModel);
    this.db.run('UPDATE artifacts SET title = ?, model_json = ?, status = ?, updated_at = ? WHERE id = ?',
      [patch.title ?? '', JSON.stringify(patch.model ?? model), patch.status ?? 'edited', now(), id]);
    return true;
  }

  getArtifact(id: ID): Artifact | null {
    const rows = this.db.query<ArtifactRow>(
      `SELECT id, notebook_id AS notebookId, kind, title, model_json AS modelJson, status,
          evidence_chunk_ids AS evidenceChunkIds, created_at AS createdAt, updated_at AS updatedAt
       FROM artifacts WHERE id = ?`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.rowToArtifact(rows[0]);
  }

  private rowToArtifact(r: ArtifactRow): Artifact {
    return {
      id: r.id, notebookId: r.notebookId, kind: r.kind, title: r.title,
      model: parseJson(r.modelJson, {} as ArtifactModel), status: r.status,
      evidenceChunkIds: parseJson(r.evidenceChunkIds, []), createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }

  listArtifacts(notebookId: ID, kind?: ArtifactKind): Artifact[] {
    const sql = kind
      ? `SELECT id, notebook_id AS notebookId, kind, title, model_json AS modelJson, status, evidence_chunk_ids AS evidenceChunkIds, created_at AS createdAt, updated_at AS updatedAt FROM artifacts WHERE notebook_id = ? AND kind = ? ORDER BY updated_at DESC`
      : `SELECT id, notebook_id AS notebookId, kind, title, model_json AS modelJson, status, evidence_chunk_ids AS evidenceChunkIds, created_at AS createdAt, updated_at AS updatedAt FROM artifacts WHERE notebook_id = ? ORDER BY updated_at DESC`;
    const params = kind ? [notebookId, kind] : [notebookId];
    return this.db.query<ArtifactRow>(sql, params).map((r) => this.rowToArtifact(r));
  }

  // ---------- Notes ----------

  createNote(input: { notebookId: ID; title: string; content: string; tags?: string[]; pinned?: boolean; sourceLinks?: Array<{ sourceId: ID; chunkId?: ID; label?: string }> }): Note {
    const ts = now();
    const note: Note = {
      id: crypto.randomUUID(), notebookId: input.notebookId, title: input.title, content: input.content,
      pinned: input.pinned ?? false, tags: input.tags ?? [], sourceLinks: input.sourceLinks ?? [],
      createdAt: ts, updatedAt: ts,
    };
    this.db.run(
      `INSERT INTO notes(id, notebook_id, title, content, pinned, tags, source_links, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [note.id, note.notebookId, note.title, note.content, note.pinned ? 1 : 0,
        JSON.stringify(note.tags), JSON.stringify(note.sourceLinks), note.createdAt, note.updatedAt],
    );
    return note;
  }

  listNotes(notebookId: ID): Note[] {
    return this.db
      .query<Note>(
        `SELECT id, notebook_id AS notebookId, title, content, pinned, tags, source_links AS sourceLinks, created_at AS createdAt, updated_at AS updatedAt
         FROM notes WHERE notebook_id = ? ORDER BY pinned DESC, updated_at DESC`,
        [notebookId],
      )
      .map((r) => ({
        id: r.id, notebookId: r.notebookId, title: r.title, content: r.content, pinned: !!r.pinned,
        tags: parseJson(r.tags, []), sourceLinks: parseJson(r.sourceLinks, []),
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      }));
  }

  // ---------- Providers ----------

  saveProviderProfile(input: { kind: ProviderKind; baseUrl: string; apiKeyEncrypted: string; model: string }): ProviderProfile {
    const profile: ProviderProfile = { id: crypto.randomUUID(), ...input, createdAt: now() };
    this.db.run(
      'INSERT INTO provider_profiles(id, kind, base_url, api_key_encrypted, model, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [profile.id, profile.kind, profile.baseUrl, profile.apiKeyEncrypted, profile.model, profile.createdAt],
    );
    return profile;
  }

  listProviderProfiles(): Array<Omit<ProviderProfile, 'apiKeyEncrypted'>> {
    return this.db
      .query<ProviderProfile>(
        'SELECT id, kind, base_url AS baseUrl, api_key_encrypted AS apiKeyEncrypted, model, created_at AS createdAt FROM provider_profiles ORDER BY created_at',
      )
      .map((r) => ({ id: r.id, kind: r.kind as ProviderKind, baseUrl: r.baseUrl, model: r.model, createdAt: r.createdAt }));
  }

  getProviderProfile(id: ID): ProviderProfile | null {
    const rows = this.db.query<ProviderProfile>(
      'SELECT id, kind, base_url AS baseUrl, api_key_encrypted AS apiKeyEncrypted, model, created_at AS createdAt FROM provider_profiles WHERE id = ?',
      [id],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, kind: r.kind as ProviderKind, baseUrl: r.baseUrl, apiKeyEncrypted: r.apiKeyEncrypted, model: r.model, createdAt: r.createdAt };
  }

  /** Delete a profile + its usage records. Returns false when missing. */
  deleteProviderProfile(id: ID): boolean {
    const rows = this.db.query('SELECT id FROM provider_profiles WHERE id = ?', [id]);
    if (rows.length === 0) return false;
    this.db.run('DELETE FROM usage_records WHERE profile_id = ?', [id]);
    this.db.run('DELETE FROM provider_profiles WHERE id = ?', [id]);
    return true;
  }

  recordUsage(input: { profileId: ID; model: string; inputTokens: number; outputTokens: number; costReported: number | null }): UsageRecord {
    const record: UsageRecord = {
      id: crypto.randomUUID(), profileId: input.profileId, model: input.model,
      inputTokens: input.inputTokens, outputTokens: input.outputTokens,
      costReported: input.costReported, createdAt: now(),
    };
    this.db.run(
      'INSERT INTO usage_records(id, profile_id, model, input_tokens, output_tokens, cost_reported, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [record.id, record.profileId, record.model, record.inputTokens, record.outputTokens,
        record.costReported, record.createdAt],
    );
    return record;
  }

  usageSummary(profileId: ID): { requests: number; inputTokens: number; outputTokens: number } {
    const rows = this.db.query<{ requests: number; inputTokens: number; outputTokens: number }>(
      'SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens FROM usage_records WHERE profile_id = ?',
      [profileId],
    );
    if (rows.length === 0) return { requests: 0, inputTokens: 0, outputTokens: 0 };
    return { requests: Number(rows[0].requests), inputTokens: Number(rows[0].inputTokens), outputTokens: Number(rows[0].outputTokens) };
  }
}
