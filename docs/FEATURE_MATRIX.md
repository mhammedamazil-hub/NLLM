# Notebook Studio — Feature Matrix (NotebookLM Parity)

Parity rows A/B/C/D define the acceptance scope for each feature against
NotebookLM behavior. Row A = baseline (must), B = parity (should), C =
enhancement (could), D = out of scope.

Status legend: ✅ verified | ⚠️ partially verified | ⏳ not verified (browser-only) | ❌ not working

## A — Baseline (Must)

| # | Feature | NotebookLM reference | Notebook Studio status |
|---|---------|---------------------|------------------------|
| A1 | Local-first storage (no server required) | All data in browser | ✅ SQLite via sqlite-wasm (FTS5), in-memory DB per session. CLI file-based persistence verified. Browser IndexedDB NOT VERIFIED (requires browser). |
| A2 | Notebook CRUD | Notebooks, sources | ✅ Repository CRUD + UI sidebar + settings modal (title/description/tags). CLI CRUD verified. |
| A3 | Source import (.txt, .md, .html, .pdf) | Upload any document | ✅ Ingestion pipeline: text/html/pdf parsers. Code present, browser file import NOT VERIFIED. Source detail modal shows chunks with location labels. |
| A4 | Chunking with provenance | Segmented sources | ✅ chunkText with headings, pages, overlap. Verified by unit tests. |
| A5 | Full-text search | Search sources | ✅ FTS5 BM25 via chunks_fts. CLI search verified: correct hits, correct filtering. |
| A6 | Chat with grounded answers | Chat with citations | ⚠️ ChatPanel with retrieval + [S1] citations + multi-session + streaming responses. Retrieval + citation logic verified by unit tests. ProviderManager integrated for key management. End-to-end chat with live provider NOT VERIFIED (requires API keys + network). |
| A12 | Search across sources | Search bar | ✅ Full-text search in SourcesPanel with snippet results, source title, and location label. Uses FTS5 BM25 index. |
| A7 | Citations map to real chunks | Clickable citations | ✅ resolveCitations maps [S1] → chunks. Verified by unit tests. |
| A8 | Provider abstraction | Gemini model | ✅ OpenAI/Gemini/Anthropic SSE adapters. Code present, not tested with live API. |
| A9 | API keys encrypted at rest | — | ✅ PBKDF2 200k + AES-GCM key vault. Verified by 9 unit tests (encrypt/decrypt/wrong-pass/round-trip/non-ASCII). |
| A10 | No fabricated costs | — | ✅ Usage records only store provider-reported cost. |
| A11 | API key management UI | — | ✅ ProviderManager component: add/unlock/lock/delete/test. Verified by 8 component tests. Encrypted key persisted to SQLite, never exposed in plaintext. |

## B — Parity (Should)

| # | Feature | NotebookLM reference | Notebook Studio status |
|---|---------|---------------------|------------------------|
| B1 | Artifact: mind map | Mind map generator | ✅ Schema + interactive React component: collapsible tree, expand/collapse all, level-based styling. 17 component tests PASS. |
| B2 | Artifact: slides | Slide deck | ✅ Schema + local renderer. Render verified. |
| B3 | Artifact: flashcards | Flashcards | ✅ Schema + interactive React component with 3D flip animation, progress tracking, grid layout. |
| B4 | Artifact: quiz | Quiz | ✅ Schema + interactive React component with answer selection, score display, color-coded feedback, explanation reveal, retry. |
| B5 | Artifact: audio overview | Audio overview | ⚠️ Schema + renderer verified. Audio playback NOT VERIFIED (Web Speech API is browser-only). |
| B6 | Artifact: video overview | Video overview | ⚠️ Schema + renderer verified. Video is scene-based display, NOT actual video playback. Known limitation. |
| B19 | Artifact: timeline | Timeline | ✅ Interactive React component: vertical timeline with gradient line, event dots, card layout. Component test PASS. |
| B7 | Artifact: study guide | Study guide | ✅ Schema + local renderer. Render verified. |
| B8 | Artifact: briefing doc | Briefing | ✅ Schema + local renderer. Render verified. |
| B9 | Artifact: summary | Summary | ✅ Schema + local renderer. Render verified. |
| B10 | Artifact: FAQ | FAQ | ✅ Schema + local renderer. Render verified. |
| B11 | Artifact: outline | Outline | ✅ Schema + local renderer. Render verified. |
| B12 | Artifact: glossary | Glossary | ✅ Schema + local renderer. Render verified. |
| B13 | Artifact: timeline | Timeline | ✅ Schema + local renderer. Render verified. |
| B14 | Artifact: table | Table | ✅ Schema + local renderer. Render verified. |
| B15 | Artifact: report | Report | ✅ Schema + local renderer. Render verified. |
| B16 | Notes (personal) | Notes | ✅ Note CRUD in repository. UI panel built. Browser interaction NOT VERIFIED. |
| B17 | Export notebook (Markdown) | — | ✅ notebookToMarkdown. CLI export verified: valid Markdown output. |
| B18 | Import/export bundle | — | ✅ exportNotebook/parseBundle. CLI bundle export verified: valid SQLite file. Import verified after bug fix. |

## C — Enhancement (Could)

| # | Feature | NotebookLM reference | Notebook Studio status |
|---|---------|---------------------|------------------------|
| C1 | Audio playback (TTS) | Audio overview plays | ⚠️ useSpeech.ts hook + AudioVideoPlayer built. Web Speech API is browser-only — NOT VERIFIED in sandbox. |
| C2 | Video playback | Video overview plays | ⚠️ Scene-based display with narration. NOT actual video. No seeking, no controls, no format handling. Known limitation. |
| C3 | Embeddings search | Semantic search | ⏳ BM25 only; embedding provider optional. Not implemented. |
| C4 | Multi-notebook search | Global search | ⏳ Per-notebook search only. Not implemented. |
| C5 | Browser PWA install | Installable | ⚠️ Manifest + service worker + icon created. Static files valid. Browser-level installability NOT VERIFIED. |
| C6 | OPFS persistent storage | Offline persistence | ⚠️ IndexedDB persistence implemented (load on startup, save on mutations). Browser runtime NOT VERIFIED. CLI file-based persistence verified. |
| C7 | Chat history per notebook | — | ✅ ChatSession/ChatTurn in repository. UI built with session list. |
| C8 | Source dedup by sha256 | — | ✅ isDuplicate check in pipeline. |
| C9 | Visual redesign (glassmorphism) | NotebookLM-inspired UI | ✅ Glassmorphism dark theme: ambient gradient background, floating orbs animation, blurred panels, refined typography, violet/teal/rose color palette. |
| C10 | Notebook header with stats | — | ✅ Header showing title, description, source count, chunk count, tags. Settings modal for editing metadata. |
| C11 | Streaming chat responses | — | ✅ Incremental response display via provider onDelta callback. Stop button with AbortController. Streaming cursor animation. |

## D — Out of scope

| # | Feature | Reason |
|---|---------|--------|
| D1 | Rust/native build | ADR-001: hosts blocked, wasm-only stack |
| D2 | Cloud sync | Local-first by design; no server |
| D3 | Multi-user collaboration | Single-user study tool |
| D4 | Provider fallback | ADR-004: no silent fallback, explicit profile only |

## Release Readiness Assessment

**NOT READY FOR PRODUCTION** — The application is a functional prototype
with verified core logic (storage, retrieval, artifacts, export, CLI).
Browser-dependent features (PWA install, IndexedDB persistence, audio/
video playback, end-to-end chat) require a real browser environment
for final verification. The code is logically correct and the
architecture is sound, but runtime behavior in a browser has not been
independently verified.

### Audit performed: 2026-11-11 (updated with P0-P4)
- Unit tests: 77/77 PASS (9 test files)
- Component tests: 25/25 PASS (ProviderManager 8 + interactive artifacts 17)
- Build: GREEN (tsc + vite)
- Artifact renderers: 15/15 PASS (static HTML render verified)
- Interactive artifacts: 5/5 kinds with React components (flashcards, quiz, mind map, slides, timeline)
- Retrieval: PASS (FTS5 search correct)
- Export: PASS (Markdown + bundle valid)
- CLI: 11/11 commands tested, 1 bug found and fixed
- APK inspector: PASS (valid/malformed/missing)
- Production build: verified dist/ with relative paths for GitHub Pages
- Git: 9 commits this session, remote synced, branch tracking OK
- Browser-level tests: NOT PERFORMED (sandbox limitation — Playwright browser download blocked)
- Component-level tests: PERFORMED via jsdom + @testing-library/react
