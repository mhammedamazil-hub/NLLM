/**
 * SQLite storage via @sqlite.org/sqlite-wasm (WASM) — single engine in browser
 * and Node, with FTS5 full-text indexing (ADR-003).
 */
import sqliteInit from '@sqlite.org/sqlite-wasm';

// Loose typing for the SQL module (the package's type exports are usable
// but the runtime default export is a factory function).
type SqlModule = {
  oo1: {
    DB: new (options?: { filename?: string; flags?: string; vfs?: string } | string) => SqlDb;
    Stmt: SqlStmt;
  };
  capi: {
    sqlite3_js_db_export: (db: SqlDb) => Uint8Array;
    sqlite3_js_posix_create_file: (filename: string, data: Uint8Array | ArrayBuffer) => void;
  };
};

type SqlDb = {
  exec: (sql: string) => unknown;
  selectArrays: (sql: string, params?: unknown[]) => unknown[][];
  selectObjects: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  selectValue: (sql: string, params?: unknown[]) => unknown;
  prepare: (sql: string) => SqlStmt;
  changes: () => number;
  close: () => void;
};

type SqlStmt = {
  bind: (params: unknown[]) => unknown;
  step: () => boolean;
  finalize: () => number | undefined;
};

export const SCHEMA_VERSION = 1;

const MIGRATIONS: Array<{ version: number; up: (db: SqlDb) => void }> = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE notebooks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]',
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          sha256 TEXT,
          url TEXT,
          retrieval_date TEXT,
          status TEXT NOT NULL,
          error_message TEXT,
          preserve_original INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_sources_notebook ON sources(notebook_id);
        CREATE TABLE chunks (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          ord_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          raw_text TEXT,
          page INTEGER,
          heading TEXT,
          timestamp INTEGER,
          url_fragment TEXT,
          location_label TEXT NOT NULL DEFAULT '',
          extraction_method TEXT NOT NULL,
          extraction_warnings TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_chunks_notebook ON chunks(notebook_id);
        CREATE INDEX idx_chunks_source ON chunks(source_id);
        CREATE VIRTUAL TABLE chunks_fts USING fts5(chunk_id UNINDEXED, text);
        CREATE TABLE chat_sessions (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE chat_turns (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL,
          session_id TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          citations TEXT NOT NULL DEFAULT '[]',
          usage_json TEXT,
          model TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE artifacts (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          model_json TEXT NOT NULL,
          status TEXT NOT NULL,
          evidence_chunk_ids TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          tags TEXT NOT NULL DEFAULT '[]',
          source_links TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE provider_profiles (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_key_encrypted TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE usage_records (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          cost_reported REAL,
          created_at TEXT NOT NULL
        );
      `);
      db.exec("INSERT INTO meta(key, value) VALUES ('schema_version', '1')");
    },
  },
];

export class Database {
  private static instance: SqlModule | null = null;
  readonly db: SqlDb;
  private readonly sql: SqlModule;

  private constructor(sql: SqlModule, db: SqlDb) {
    this.sql = sql;
    this.db = db;
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  /** Load the sqlite-wasm module once (browser: bundled URL; Node: package path). */
  static async load(locateFile?: (file: string) => string): Promise<SqlModule> {
    if (Database.instance) return Database.instance;
    Database.instance = (await (sqliteInit as unknown as (opts?: { locateFile?: (file: string) => string }) => Promise<SqlModule>)({ locateFile })) as unknown as SqlModule;
    return Database.instance;
  }

  /** Open (or create) an in-memory database and run migrations. */
  static async open(locateFile?: (file: string) => string): Promise<Database> {
    const sql = await Database.load(locateFile);
    const db = new sql.oo1.DB();
    const wrapper = new Database(sql, db);
    wrapper.migrate();
    return wrapper;
  }

  /** Restore from a serialized DB blob (exported via export()). */
  static async openFromBlob(blob: Uint8Array, locateFile?: (file: string) => string): Promise<Database> {
    const sql = await Database.load(locateFile);
    // Write the blob into the WASM VFS (MEMFS in Node, OPFS/origin-fs in browser),
    // then open that path. The filename must not collide with an open DB.
    const tempFile = `/tmp/notebook-studio-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    sql.capi.sqlite3_js_posix_create_file(tempFile, blob);
    const db = new sql.oo1.DB(tempFile);
    return new Database(sql, db);
  }

  private migrate(): void {
    const tables = this.db.selectArrays(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
    );
    if (tables.length === 0) {
      for (const migration of MIGRATIONS) {
        migration.up(this.db);
      }
      return;
    }
    const rows = this.db.selectArrays('SELECT value FROM meta WHERE key = ?', ['schema_version']);
    const current = rows.length > 0 && rows[0].length > 0 ? Number(rows[0][0]) : 0;
    for (const migration of MIGRATIONS) {
      if (migration.version > current) {
        migration.up(this.db);
      }
    }
  }

  /** Serialize the whole database to a Uint8Array for persistence. */
  export(): Uint8Array {
    return this.sql.capi.sqlite3_js_db_export(this.db);
  }

  /** Run a query and return rows as objects keyed by column alias. */
  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.db.selectObjects(sql, params) as unknown as T[];
  }

  /** Execute a statement (INSERT/UPDATE/DELETE) and return changes count. */
  run(sql: string, params: unknown[] = []): number {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      stmt.step();
    } finally {
      stmt.finalize();
    }
    return this.db.changes();
  }

  close(): void {
    this.db.close();
  }
}
