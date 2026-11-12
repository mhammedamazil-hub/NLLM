# Notebook Studio — Feature Matrix (NotebookLM Parity)

Parity rows A/B/C/D define the acceptance scope for each feature against
NotebookLM behavior. Row A = baseline (must), B = parity (should), C =
enhancement (could), D = out of scope.

## A — Baseline (Must)

| # | Feature | NotebookLM reference | Notebook Studio status |
|---|---------|---------------------|------------------------|
| A1 | Local-first storage (no server required) | All data in browser | ✅ SQLite via sqlite-wasm (FTS5), in-memory DB per session |
| A2 | Notebook CRUD | Notebooks, sources | ✅ Repository CRUD + UI sidebar |
| A3 | Source import (.txt, .md, .html, .pdf) | Upload any document | ✅ Ingestion pipeline: text/html/pdf parsers |
| A4 | Chunking with provenance | Segmented sources | ✅ chunkText with headings, pages, overlap |
| A5 | Full-text search | Search sources | ✅ FTS5 BM25 via chunks_fts |
| A6 | Chat with grounded answers | Chat with citations | ✅ ChatPanel with retrieval + [S1] citations |
| A7 | Citations map to real chunks | Clickable citations | ✅ resolveCitations maps [S1] → chunks |
| A8 | Provider abstraction | Gemini model | ✅ OpenAI/Gemini/Anthropic SSE adapters |
| A9 | API keys encrypted at rest | — | ✅ PBKDF2 200k + AES-GCM key vault |
| A10 | No fabricated costs | — | ✅ Usage records only store provider-reported cost |

## B — Parity (Should)

| # | Feature | NotebookLM reference | Notebook Studio status |
|---|---------|---------------------|------------------------|
| B1 | Artifact: mind map | Mind map generator | ✅ Schema + local renderer |
| B2 | Artifact: slides | Slide deck | ✅ Schema + local renderer |
| B3 | Artifact: flashcards | Flashcards | ✅ Schema + local renderer |
| B4 | Artifact: quiz | Quiz | ✅ Schema + local renderer |
| B5 | Artifact: audio overview | Audio overview | ✅ Schema + local renderer (script) |
| B6 | Artifact: video overview | Video overview | ✅ Schema + local renderer (scenes) |
| B7 | Artifact: study guide | Study guide | ✅ Schema + local renderer |
| B8 | Artifact: briefing doc | Briefing | ✅ Schema + local renderer |
| B9 | Artifact: summary | Summary | ✅ Schema + local renderer |
| B10 | Artifact: FAQ | FAQ | ✅ Schema + local renderer |
| B11 | Artifact: outline | Outline | ✅ Schema + local renderer |
| B12 | Artifact: glossary | Glossary | ✅ Schema + local renderer |
| B13 | Artifact: timeline | Timeline | ✅ Schema + local renderer |
| B14 | Artifact: table | Table | ✅ Schema + local renderer |
| B15 | Artifact: report | Report | ✅ Schema + local renderer |
| B16 | Notes (personal) | Notes | ✅ Note CRUD in repository |
| B17 | Export notebook (Markdown) | — | ✅ notebookToMarkdown |
| B18 | Import/export bundle | — | ✅ exportNotebook/parseBundle |

## C — Enhancement (Could)

| # | Feature | NotebookLM reference | Notebook Studio status |
|---|---------|---------------------|------------------------|
| C1 | Audio playback (TTS) | Audio overview plays | ⏳ Speech synthesis hook reserved (generate_speech) |
| C2 | Video playback | Video overview plays | ⏳ Renderer produces scenes; playback TBD |
| C3 | Embeddings search | Semantic search | ⏳ BM25 only; embedding provider optional |
| C4 | Multi-notebook search | Global search | ⏳ Per-notebook search only |
| C5 | Browser PWA install | Installable | ⏳ Manifest/service worker TBD |
| C6 | OPFS persistent storage | Offline persistence | ⏳ In-memory DB; export/import works |
| C7 | Chat history per notebook | — | ✅ ChatSession/ChatTurn in repository |
| C8 | Source dedup by sha256 | — | ✅ isDuplicate check in pipeline |

## D — Out of scope

| # | Feature | Reason |
|---|---------|--------|
| D1 | Rust/native build | ADR-001: hosts blocked, wasm-only stack |
| D2 | Cloud sync | Local-first by design; no server |
| D3 | Multi-user collaboration | Single-user study tool |
| D4 | Provider fallback | ADR-004: no silent fallback, explicit profile only |
