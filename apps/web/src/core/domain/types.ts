/**
 * Domain types — notebook, source, chunk, citation, chat, artifact, note, provider.
 * Pure data types; no platform dependencies (works in browser, Node, WASM).
 */

export type ID = string;
export type ISODate = string;

/** Confidence tag used throughout research + tests (MASTER.md §2.3). */
export type Confidence = 'Observed' | 'Strongly inferred' | 'Hypothesis' | 'Not established';

// ---------- Notebooks ----------

export interface Notebook {
  id: ID;
  title: string;
  description: string;
  tags: string[];
  archived: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Sources ----------

export type SourceKind = 'file' | 'url' | 'media';
export type SourceStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'error'
  | 'unsupported';

export interface SourceLocation {
  /** Human-readable location within the source, e.g. page 3, heading, timestamp. */
  label: string;
  page?: number;
  heading?: string;
  timestamp?: number;
  urlFragment?: string;
}

export interface Source {
  id: ID;
  notebookId: ID;
  kind: SourceKind;
  title: string;
  /** Original file name or page title. */
  originalName: string;
  mimeType: string;
  /** sha256 of the original file content (when available). */
  sha256?: string;
  /** For URL sources: the page URL + retrieval date. */
  url?: string;
  retrievalDate?: ISODate;
  status: SourceStatus;
  errorMessage?: string;
  /** Whether the original file is preserved on disk (user choice). */
  preserveOriginal: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Chunks (evidence units) ----------

export interface Chunk {
  id: ID;
  notebookId: ID;
  sourceId: ID;
  /** 0-based order within the source. */
  ordIndex: number;
  /** Normalized text used for search/prompts. */
  text: string;
  /** Raw extracted text (before normalization) where practical. */
  rawText?: string;
  /** Provenance: where in the source this chunk lives. */
  location: SourceLocation;
  extractionMethod: string;
  extractionWarnings: string[];
  createdAt: ISODate;
}

/** A citation points at a real chunk (and therefore a real source). */
export interface Citation {
  chunkId: ID;
  sourceId: ID;
  location: SourceLocation;
  /** Optional verbatim quote (must be a substring of the chunk text). */
  quote?: string;
}

// ---------- Chat ----------

export interface ChatTurn {
  id: ID;
  notebookId: ID;
  sessionId?: ID;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** Provider-reported token usage, if any. */
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: string;
  createdAt: ISODate;
}

export interface ChatSession {
  id: ID;
  notebookId: ID;
  title: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Artifacts (study studio) ----------

export type ArtifactKind =
  | 'mindmap'
  | 'slides'
  | 'flashcards'
  | 'quiz'
  | 'audio_overview'
  | 'video_overview'
  | 'guide'
  | 'briefing'
  | 'summary'
  | 'faq'
  | 'outline'
  | 'glossary'
  | 'timeline'
  | 'table'
  | 'report';

export type ArtifactStatus = 'draft' | 'generated' | 'edited' | 'error';

/**
 * Structured content model for an artifact (provider-generated outline/content,
 * validated locally). Renderers are separate and local (MASTER.md §3.3).
 */
export interface ArtifactModel {
  [key: string]: unknown;
}

export interface Artifact {
  id: ID;
  notebookId: ID;
  kind: ArtifactKind;
  title: string;
  model: ArtifactModel;
  status: ArtifactStatus;
  /** Evidence chunks used when generating this artifact. */
  evidenceChunkIds: ID[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Notes ----------

export interface Note {
  id: ID;
  notebookId: ID;
  title: string;
  content: string;
  pinned: boolean;
  tags: string[];
  /** Links back to source excerpts. */
  sourceLinks: Array<{ sourceId: ID; chunkId?: ID; label?: string }>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Providers ----------

export type ProviderKind = 'openai' | 'gemini' | 'anthropic';

export interface ProviderProfile {
  id: ID;
  kind: ProviderKind;
  /** Base URL for OpenAI-compatible endpoints; fixed for Gemini/Anthropic. */
  baseUrl: string;
  /** Encrypted at rest; never logged, never bundled. */
  apiKeyEncrypted: string;
  model: string;
  createdAt: ISODate;
}

export interface UsageRecord {
  id: ID;
  profileId: ID;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Provider-reported cost if available; otherwise null (never fabricated). */
  costReported: number | null;
  createdAt: ISODate;
}

// ---------- Generation / retrieval results ----------

export interface RetrievalHit {
  chunk: Chunk;
  score: number;
  source: Source;
  method: 'fts5-bm25' | 'exact' | 'embedding';
}

export interface GenerationRequest {
  prompt: string;
  /** Evidence chunks included in the prompt (grounding). */
  evidence: Array<{ chunkId: ID; text: string; location: SourceLocation }>;
  /** JSON schema constraint when the provider supports structured output. */
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface UsageSummary {
  profileId: ID;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}
