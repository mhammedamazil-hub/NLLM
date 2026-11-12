# Notebook Studio — Progress Tracker

## Phase 0 — Foundation ✅
- Project structure, domain types, build config
- sqlite-wasm swap (FTS5 verified)
- Provider abstraction contracts

## Phase 1 — Core Infrastructure ✅
- Storage: database.ts (sqlite-wasm, FTS5, migrations, export/import)
- Storage: repository.ts (full CRUD for all entities)
- Ingestion: text.ts (normalize, chunk, sha256)
- Ingestion: files.ts (text/html/pdf parsers)
- Ingestion: pipeline.ts (importSource, dedup, errors)
- Providers: types, sse, openai, gemini, anthropic, grounding, keyvault, registry
- Tests: 28 passing (storage, text, providers)

## Phase 2 — Notebook Foundation ✅
- Retrieval: engine.ts (BM25 + term-coverage scoring, source boosts)
- Artifacts: schemas.ts (15 kinds, JSON schemas, validation)
- Artifacts: renderers.ts (local HTML renderers for all kinds)
- Artifacts: generate.ts (provider-driven generation + local validation)
- Export: exporter.ts (bundle round-trip + Markdown export)
- Tests: 43 passing (retrieval, artifacts, export added)

## Phase 3 — UI Shell ✅
- useStore.ts: DB lifecycle hook
- NotebookList: create/select/delete
- SourcesPanel: file import with status badges
- ChatPanel: grounded Q&A with citations + provider config
- ArtifactPanel: generate + view artifacts
- App shell: tabbed workspace
- styles.css: full dark theme
- Build: 40 modules, sqlite-wasm + pdfjs bundled

## Phase 4 — Remaining 🔲
- Persistence (OPFS / IndexedDB) for browser
- PWA manifest + service worker
- Notes UI panel
- Chat session management UI
- Audio/video playback (TTS hook, scene rendering)
- Research docs from APK evidence (partially done)

## Verification
- `npx vitest run`: 43/43 passing
- `npm run build`: tsc + vite green (219 kB JS base, bundle grows with sqlite-wasm ~880 kB WASM)
- All commits on branch `arena/479da758-nllm`
