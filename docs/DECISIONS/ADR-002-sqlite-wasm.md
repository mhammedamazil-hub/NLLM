# ADR-002: SQLite via @sqlite.org/sqlite-wasm

**Status:** Accepted

## Context
Local-first storage requires a relational store with full-text search.
sql.js (the other WASM SQLite) does **not** include FTS5, which is
required for BM25 ranking (NotebookLM parity row A5).

## Decision
Use @sqlite.org/sqlite-wasm 3.54.1-build1. It provides:
- FTS5 (verified working)
- Single engine in browser and Node
- `oo1.DB` API with `selectObjects`/`selectArrays`/`selectValue`
- `sqlite3_js_db_export` for serialization
- `sqlite3_js_posix_create_file` for restoring blobs into the VFS

## Consequences
- DB files live in the WASM VFS (MEMFS in Node, OPFS/origin-fs in browser).
- Persistence is via export() → blob download or IndexedDB in a later phase.
- Restore from blob: write bytes with `sqlite3_js_posix_create_file`, then
  open the path. Opening a file path without writing first creates an empty
  DB (verified behavior).
