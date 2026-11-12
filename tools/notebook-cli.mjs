#!/usr/bin/env node
/**
 * notebook-cli — command-line notebook manager for Notebook Studio.
 * Uses sqlite-wasm in Node to open, query, and manage local notebook databases.
 *
 * Usage:
 *   node tools/notebook-cli.mjs list                    # list notebooks
 *   node tools/notebook-cli.mjs info <notebookId>       # notebook details
 *   node tools/notebook-cli.mjs sources <notebookId>    # list sources
 *   node tools/notebook-cli.mjs search <notebookId> "<query>"  # FTS5 search
 *   node tools/notebook-cli.mjs export <notebookId>     # export as Markdown
 *   node tools/notebook-cli.mjs export-bundle <notebookId> <out.json>
 *   node tools/notebook-cli.mjs import-bundle <file.json>
 *   node tools/notebook-cli.mjs create <title> [desc]
 *   node tools/notebook-cli.mjs delete <notebookId>
 *   node tools/notebook-cli.mjs stats <notebookId>      # chunk/source counts
 *   node tools/notebook-cli.mjs seed                    # seed demo data
 *   node tools/notebook-cli.mjs help                    # show help
 *
 * Environment:
 *   DB_FILE  — path to a .db file (default: notebook-studio.db in repo root)
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'apps', 'web');
const require = createRequire(join(WEB_DIR, 'package.json'));
const sqliteModule = require('@sqlite.org/sqlite-wasm');
const sqliteInit = typeof sqliteModule === 'function' ? sqliteModule : sqliteModule.default ?? sqliteModule.sqliteInit;

// ---- Initialize sqlite-wasm ----
const sqlite = await sqliteInit();
const { oo1, capi } = sqlite;

const DB_FILE = process.env.DB_FILE || join(__dirname, '..', 'notebook-studio.db');

// ---- Schema (same as database.ts v1) ----
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]', archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, title TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
    sha256 TEXT, url TEXT, retrieval_date TEXT, status TEXT NOT NULL, error_message TEXT,
    preserve_original INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sources_notebook ON sources(notebook_id);
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    ord_index INTEGER NOT NULL, text TEXT NOT NULL, raw_text TEXT, page INTEGER, heading TEXT,
    timestamp INTEGER, url_fragment TEXT, extraction_method TEXT NOT NULL, extraction_warnings TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_notebook ON chunks(notebook_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, tokenize='porter unicode61');
  CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS chat_turns (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, session_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT NOT NULL DEFAULT '[]', usage_json TEXT, model TEXT, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_chat_turns_session ON chat_turns(session_id);
  CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, evidence_chunk_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_artifacts_notebook ON artifacts(notebook_id);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]', source_links TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS provider_profiles (id TEXT PRIMARY KEY, kind TEXT NOT NULL, base_url TEXT NOT NULL, api_key_encrypted TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS usage_records (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cost_reported REAL, created_at TEXT NOT NULL);
`;

// ---- Open or create DB ----
// Always use in-memory; load from file if it exists.
const MEM_DB = '/tmp/notebook-studio-mem.db';
let db;
if (existsSync(DB_FILE)) {
  const blob = new Uint8Array(readFileSync(DB_FILE));
  // Remove old MEMFS file if it exists
  try { db.close(); } catch {}
  capi.sqlite3_js_posix_create_file(MEM_DB, blob);
  db = new oo1.DB(MEM_DB);
} else {
  db = new oo1.DB(':memory:');
  db.exec(SCHEMA_SQL);
  db.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
}

// ---- Helpers ----
const now = () => new Date().toISOString();
const uid = () => randomUUID();

function parseTags(s) {
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) { /* iterate */ }
  } finally {
    stmt.finalize();
  }
}

function save() {
  if (db.filename === ':memory:') {
    // Persist in-memory DB to file
    const exported = capi.sqlite3_js_db_export(db);
    writeFileSync(DB_FILE, Buffer.from(exported));
  } else {
    // Already file-backed; export/re-import to ensure consistency
    const exported = capi.sqlite3_js_db_export(db);
    writeFileSync(DB_FILE, Buffer.from(exported));
  }
}

// ---- CLI dispatch ----
const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case 'list': {
    const rows = db.selectObjects('SELECT id, title, description, tags, archived, created_at, updated_at FROM notebooks ORDER BY updated_at DESC');
    if (!rows.length) { console.log('No notebooks found.'); break; }
    console.log('Notebooks:');
    for (const r of rows) {
      const tags = parseTags(r.tags).join(', ');
      console.log(`  ${r.id}  ${r.title}${tags ? `  [${tags}]` : ''}${r.archived ? '  (archived)' : ''}`);
    }
    break;
  }
  case 'info': {
    const id = args[1];
    const row = db.selectValue('SELECT title FROM notebooks WHERE id = ?', [id]);
    if (!row) { console.error(`Notebook not found: ${id}`); process.exit(1); }
    const srcCount = db.selectValue('SELECT COUNT(*) FROM sources WHERE notebook_id = ?', [id]) || 0;
    const chunkCount = db.selectValue('SELECT COUNT(*) FROM chunks WHERE notebook_id = ?', [id]) || 0;
    const artCount = db.selectValue('SELECT COUNT(*) FROM artifacts WHERE notebook_id = ?', [id]) || 0;
    const noteCount = db.selectValue('SELECT COUNT(*) FROM notes WHERE notebook_id = ?', [id]) || 0;
    const sessionCount = db.selectValue('SELECT COUNT(*) FROM chat_sessions WHERE notebook_id = ?', [id]) || 0;
    console.log(JSON.stringify({ id, title: row, sources: srcCount, chunks: chunkCount, artifacts: artCount, notes: noteCount, chatSessions: sessionCount }, null, 2));
    break;
  }
  case 'sources': {
    const id = args[1];
    const rows = db.selectObjects('SELECT id, kind, title, original_name, status, mime_type FROM sources WHERE notebook_id = ? ORDER BY created_at', [id]);
    if (!rows.length) { console.log('No sources.'); break; }
    console.log('Sources:');
    for (const r of rows) {
      console.log(`  ${r.id}  [${r.status}]  ${r.title}  (${r.original_name})  [${r.mime_type}]`);
    }
    break;
  }
  case 'search': {
    const nbId = args[1];
    const query = args.slice(2).join(' ');
    if (!query) { console.error('Usage: search <notebookId> "<query>"'); process.exit(1); }
    // FTS5: join terms with OR (implicit AND in FTS5)
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean).map(t => `${t}*`);
    const ftsQuery = terms.join(' OR ');
    const rows = db.selectObjects(
      'SELECT c.id, c.text, c.source_id, c.page, c.heading, s.title AS source_title, s.original_name ' +
      'FROM chunks c ' +
      'JOIN sources s ON s.id = c.source_id ' +
      'WHERE c.notebook_id = ? ' +
      'AND c.rowid IN (SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank) ' +
      'LIMIT 20',
      [nbId, ftsQuery]
    );
    if (!rows.length) { console.log('No results.'); break; }
    console.log(`Results for "${query}" (${rows.length} hits):`);
    for (const r of rows) {
      const loc = r.page ? `p${r.page}` : (r.heading || '');
      console.log(`  ${r.source_title} [${r.original_name}] ${loc}`);
      console.log(`    ${r.text.slice(0, 120)}${r.text.length > 120 ? '...' : ''}`);
      console.log();
    }
    break;
  }
  case 'stats': {
    const id = args[1];
    const row = db.selectObjects(
      'SELECT ' +
      '(SELECT COUNT(*) FROM sources WHERE notebook_id=?) as sources, ' +
      '(SELECT COUNT(*) FROM chunks WHERE notebook_id=?) as chunks, ' +
      '(SELECT COUNT(*) FROM artifacts WHERE notebook_id=?) as artifacts, ' +
      '(SELECT COUNT(*) FROM notes WHERE notebook_id=?) as notes, ' +
      '(SELECT COUNT(*) FROM chat_turns WHERE notebook_id=?) as turns',
      [id, id, id, id, id]
    );
    console.log(JSON.stringify(row[0], null, 2));
    break;
  }
  case 'export': {
    const id = args[1];
    const nb = db.selectObjects('SELECT title, description FROM notebooks WHERE id=?', [id]);
    if (!nb.length) { console.error(`Notebook not found: ${id}`); process.exit(1); }
    const srcs = db.selectObjects('SELECT id, title, original_name, kind, mime_type FROM sources WHERE notebook_id=?', [id]);
    const chunks = db.selectObjects(
      'SELECT c.text, c.heading, c.page, s.title, s.original_name ' +
      'FROM chunks c JOIN sources s ON s.id=c.source_id ' +
      'WHERE c.notebook_id=? ORDER BY s.created_at, c.ord_index',
      [id]
    );
    let md = `# ${nb[0].title}\n\n${nb[0].description ? nb[0].description + '\n\n' : ''}`;
    md += `---\n\n## Sources\n\n`;
    for (const s of srcs) md += `- **${s.title}** (${s.original_name})\n`;
    md += `\n## Chunks\n\n`;
    let currentSource = '';
    for (const c of chunks) {
      if (c.title !== currentSource) { currentSource = c.title; md += `\n### ${c.title}\n\n`; }
      if (c.page) md += `> Page ${c.page}\n`;
      if (c.heading) md += `> ${c.heading}\n`;
      md += `${c.text}\n\n`;
    }
    console.log(md);
    break;
  }
  case 'create': {
    const title = args[1] || 'Untitled';
    const desc = args[2] || '';
    const id = uid();
    run('INSERT INTO notebooks (id, title, description, tags, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, title, desc, '[]', 0, now(), now()]);
    save();
    console.log(`Created notebook: ${id}  ${title}`);
    break;
  }
  case 'delete': {
    const id = args[1];
    const row = db.selectValue('SELECT title FROM notebooks WHERE id=?', [id]);
    if (!row) { console.error(`Not found: ${id}`); process.exit(1); }
    run('DELETE FROM notebooks WHERE id=?', [id]);
    save();
    console.log(`Deleted: ${row}`);
    break;
  }
  case 'export-bundle': {
    const id = args[1];
    const outFile = args[2];
    if (!outFile) { console.error('Usage: export-bundle <notebookId> <out.json>'); process.exit(1); }
    const exported = capi.sqlite3_js_db_export(db);
    writeFileSync(outFile, Buffer.from(exported));
    console.log(`Exported database to ${outFile} (${exported.length} bytes)`);
    break;
  }
  case 'import-bundle': {
    const inFile = args[1];
    if (!inFile || !existsSync(inFile)) { console.error('Usage: import-bundle <file.json>'); process.exit(1); }
    // Load the bundle into MEMFS via posix_create_file, then open from MEMFS
    const blob = new Uint8Array(readFileSync(inFile));
    db.close();
    const memPath = '/tmp/notebook-import-' + Date.now() + '.db';
    capi.sqlite3_js_posix_create_file(memPath, blob);
    db = new oo1.DB(memPath);
    const count = db.selectValue('SELECT COUNT(*) FROM notebooks') || 0;
    console.log(`Imported ${count} notebooks from ${inFile}`);
    break;
  }
  case 'seed': {
    const id = uid();
    run('INSERT INTO notebooks (id, title, description, tags, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, 'Photosynthesis Notes', 'Study notebook for biology', '["biology","science"]', 0, now(), now()]);
    const srcId = uid();
    run('INSERT INTO sources (id, notebook_id, kind, title, original_name, mime_type, status, preserve_original, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [srcId, id, 'file', 'Photosynthesis Basics', 'photosynthesis.txt', 'text/plain', 'ready', 0, now(), now()]);
    const chunkTexts = [
      'Photosynthesis is the process by which plants convert light energy into chemical energy.',
      'Chlorophyll absorbs light primarily in the blue and red wavelengths.',
      'The Calvin cycle uses ATP and NADPH to fix carbon dioxide into sugars.',
      'Plants release oxygen as a byproduct of the light-dependent reactions.',
    ];
    chunkTexts.forEach((text, i) => {
      const chunkId = uid();
      run('INSERT INTO chunks (id, notebook_id, source_id, ord_index, text, extraction_method, extraction_warnings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [chunkId, id, srcId, i, text, 'local:txt', '[]', now()]);
      // FTS: insert rowid + text directly (standalone FTS5 table)
      const rowid = db.selectValue('SELECT rowid FROM chunks WHERE id=?', [chunkId]);
      run('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)', [rowid, text]);
    });
    save();
    console.log(`Seeded demo notebook: ${id}`);
    console.log('Try: node tools/notebook-cli.mjs search ' + id + ' "photosynthesis light"');
    break;
  }
  case 'help':
  default: {
    console.log(`notebook-cli — Notebook Studio CLI

Usage:
  node tools/notebook-cli.mjs <command> [args]

Commands:
  list                           List all notebooks
  info <notebookId>              Show notebook details + counts
  sources <notebookId>           List sources in a notebook
  search <notebookId> "query"    FTS5 full-text search
  stats <notebookId>             Show chunk/source/artifact counts
  export <notebookId>            Export notebook as Markdown
  create <title> [description]   Create a new notebook
  delete <notebookId>            Delete a notebook
  seed                           Seed a demo notebook with sample content
  export-bundle <nbId> <file>    Export full DB bundle
  import-bundle <file>           Import DB bundle
  help                           Show this message

Environment:
  DB_FILE=path.db   Open a specific database file (default: notebook-studio.db)
`);
    break;
  }
}

db.close();
