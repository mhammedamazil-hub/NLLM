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

## Phase 4 — Enhancements ✅
- Notes panel: CRUD UI with pin/tags/source links
- Chat sessions: multi-session UI with citation chips
- IndexedDB persistence: load on startup, save on mutations
- PWA: manifest + service worker + icon
- Audio/video playback: TTS (Web Speech API) + scene player

## Tools ✅
- notebook-cli.mjs: CLI for notebook management (list, search, export,
  create, delete, seed, stats, bundle import/export)
- apk-inspect.mjs: APK bundle inspector (info, list, manifest, assets,
  lottie, extract, strings) for research

## Documentation ✅
- FEATURE_MATRIX.md: parity matrix — A (baseline/must) 10 rows,
  B (parity/should) 18 rows, C (enhancement/could) 8 rows,
  D (out of scope) 4 rows, all with statuses
- ADR-001: no Rust (WASM-only stack)
- ADR-002: sqlite-wasm with FTS5
- ADR-003: FTS5 BM25 ranking
- ADR-004: provider abstraction, no fallback, no fabricated costs
- research/apk-evidence.md: Gemini Notebook APK findings

## Verification
- `npx vitest run`: 43/43 passing
- `npm run build`: tsc + vite green (494 kB JS, 879 kB sqlite WASM, 444 kB pdfjs)
- All commits on branch `arena/479da758-nllm`
